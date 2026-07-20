// tenant-delete.routes.int.test.ts
// Integration tests for DELETE /api/v1/admin/tenants/:id + deletion saga status
// + manual retry (S5-702 / ADR-022 Decision 1). Seeds real tenants and lets the
// forward-only saga actually drop the schema, delete the realm and bucket.
// Real PostgreSQL + Keycloak + MinIO — the deletion IS the cleanup.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../lib/database.js';
import { bucketExists, deleteBucket } from '../../lib/minio-client.js';
import { realmExists, deleteRealm } from '../../lib/keycloak-admin.js';
import { toSchemaName } from '../../lib/tenant-schema-helpers.js';
import { provisionTenant } from '../../modules/tenant/tenant-provisioning.js';
import { tenantDeleteRoutes } from '../../modules/admin/routes/tenant-delete.routes.js';
import { deletionStatusRoutes } from '../../modules/admin/routes/deletion-status.routes.js';
import * as schemaDropModule from '../../modules/admin/services/deletion-step-schema-drop.js';
import {
  createTestServer,
  isDbReachable,
  isKeycloakReachable,
  isMinioReachable,
  makeFullStub,
} from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { ProvisioningResult } from '../../modules/tenant/tenant-provisioning.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const masterCtx: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: SUPER_ADMIN_ACTOR,
};

const HAPPY_SLUG = `intdel-${Date.now().toString(36)}`;
const RETRY_SLUG = `intdelr-${Date.now().toString(36)}`;

let server: FastifyInstance;
let happy: ProvisioningResult;
let retryTenant: ProvisioningResult;

async function poll<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  timeoutMs = 30_000,
  intervalMs = 300,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (done(v)) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('poll timeout');
}

beforeAll(async () => {
  const dbOk = await isDbReachable();
  const kcOk = await isKeycloakReachable();
  const minioOk = await isMinioReachable();
  if (!dbOk || !kcOk || !minioOk) {
    throw new Error(
      'PostgreSQL + Keycloak + MinIO must all be reachable for tenant deletion integration tests.'
    );
  }
  [happy, retryTenant] = await Promise.all([
    provisionTenant({ slug: HAPPY_SLUG, name: 'Del Happy', adminEmail: `admin@${HAPPY_SLUG}.example` }),
    provisionTenant({ slug: RETRY_SLUG, name: 'Del Retry', adminEmail: `admin@${RETRY_SLUG}.example` }),
  ]);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, masterCtx, ['super_admin']));
  await server.register(tenantDeleteRoutes, { prefix: '/api/v1/admin' });
  await server.register(deletionStatusRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  for (const slug of [HAPPY_SLUG, RETRY_SLUG]) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${toSchemaName(slug)}" CASCADE`).catch(() => {});
    await deleteRealm(`plexica-${slug}`).catch(() => {});
    await deleteBucket(`tenant-${slug}`).catch(() => {});
  }
  for (const id of [happy.tenantId, retryTenant.tenantId]) {
    await prisma.tenantDeletionStep.deleteMany({ where: { tenantId: id } }).catch(() => {});
  }
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: { in: [HAPPY_SLUG, RETRY_SLUG] } } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: { in: [HAPPY_SLUG, RETRY_SLUG] } } }).catch(() => {});
  await prisma.$disconnect();
  await server.close();
});

describe('DELETE /api/v1/admin/tenants/:id — deletion saga', () => {
  it('edge: incorrect confirmSlug → 422 CONFIRMATION_REQUIRED', async () => {
    const res = await server.inject({
      method: 'DELETE', url: `/api/v1/admin/tenants/${retryTenant.tenantId}`,
      payload: { confirmSlug: 'wrong-slug', version: 1 },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('edge: version mismatch → 409', async () => {
    const res = await server.inject({
      method: 'DELETE', url: `/api/v1/admin/tenants/${retryTenant.tenantId}`,
      payload: { confirmSlug: RETRY_SLUG, version: 999 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('happy path: correct confirmSlug → 202, 3 saga steps created + completed', async () => {
    const res = await server.inject({
      method: 'DELETE', url: `/api/v1/admin/tenants/${happy.tenantId}`,
      payload: { confirmSlug: HAPPY_SLUG, version: 1 },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.steps).toHaveLength(3);
    expect(body.steps.map((s: { step: string }) => s.step).sort())
      .toEqual(['bucket_delete', 'realm_delete', 'schema_drop']);

    // GET deletion-status returns the 3 step rows with state fields.
    const statusRes = await server.inject({
      method: 'GET', url: `/api/v1/admin/tenants/${happy.tenantId}/deletion-status`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(JSON.parse(statusRes.payload).steps).toHaveLength(3);

    // Wait for the background executor to finish and mark the tenant deleted.
    await poll(
      () => prisma.tenant.findUnique({ where: { id: happy.tenantId }, select: { status: true } }),
      (t) => t?.status === 'deleted',
    );

    // Verify full GDPR erasure: schema gone, realm gone, bucket gone.
    const schemaGone = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists`,
      toSchemaName(HAPPY_SLUG),
    );
    expect(schemaGone[0]?.exists).toBe(false);
    expect(await realmExists(`plexica-${HAPPY_SLUG}`)).toBe(false);
    expect(await bucketExists(`tenant-${HAPPY_SLUG}`)).toBe(false);
  });

  it('edge: POST retry on a failed step → step reset + saga completes', async () => {
    // Inject a controlled failure into schema_drop for the initial saga run.
    const spy = vi.spyOn(schemaDropModule, 'executeSchemaDrop').mockRejectedValue(
      new Error('injected failure for retry test'),
    );

    const res = await server.inject({
      method: 'DELETE', url: `/api/v1/admin/tenants/${retryTenant.tenantId}`,
      payload: { confirmSlug: RETRY_SLUG, version: 1 },
    });
    expect(res.statusCode).toBe(202);

    // Wait until schema_drop has exhausted retries and is marked 'failed'.
    const failedStep = await poll(
      async () => {
        const r = await server.inject({
          method: 'GET', url: `/api/v1/admin/tenants/${retryTenant.tenantId}/deletion-status`,
        });
        return JSON.parse(r.payload).steps as { id: string; step: string; status: string }[];
      },
      (steps) => steps.some((s) => s.step === 'schema_drop' && s.status === 'failed'),
    );

    // Restore the real handler so the retry actually drops the schema.
    spy.mockRestore();

    const schemaDropStep = failedStep.find((s) => s.step === 'schema_drop')!;

    // Only a failed step can be retried — non-failed would be rejected with 422.
    const retryRes = await server.inject({
      method: 'POST', url: `/api/v1/admin/deletions/${schemaDropStep.id}/retry`,
    });
    expect(retryRes.statusCode).toBe(200);
    expect(JSON.parse(retryRes.payload).status).toBe('pending');

    // The retry relaunches the saga: schema_drop → realm_delete → bucket_delete.
    await poll(
      () => prisma.tenant.findUnique({ where: { id: retryTenant.tenantId }, select: { status: true } }),
      (t) => t?.status === 'deleted',
    );
    expect(await realmExists(`plexica-${RETRY_SLUG}`)).toBe(false);
    expect(await bucketExists(`tenant-${RETRY_SLUG}`)).toBe(false);
  });
});
