// tenant-suspend.routes.int.test.ts
// Integration tests for POST /api/v1/admin/tenants/:id/suspend (S5-501).
// Seeds a real tenant via provisionTenant, then exercises the suspend route
// with optimistic-lock version checks. Real PostgreSQL + Keycloak + MinIO.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { deleteBucket } from '../../lib/minio-client.js';
import { deleteRealm } from '../../lib/keycloak-admin.js';
import { toSchemaName } from '../../lib/tenant-schema-helpers.js';
import { provisionTenant } from '../../modules/tenant/tenant-provisioning.js';
import { tenantSuspendRoutes } from '../../modules/admin/routes/tenant-suspend.routes.js';
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

const SLUG = `intsusp-${Date.now().toString(36)}`;
const SCHEMA = toSchemaName(SLUG);

let server: FastifyInstance;
let seeded: ProvisioningResult;

beforeAll(async () => {
  const dbOk = await isDbReachable();
  const kcOk = await isKeycloakReachable();
  const minioOk = await isMinioReachable();
  if (!dbOk || !kcOk || !minioOk) {
    throw new Error(
      'PostgreSQL + Keycloak + MinIO must all be reachable for tenant suspend integration tests.'
    );
  }
  seeded = await provisionTenant({
    slug: SLUG, name: 'Suspend Test Org', adminEmail: `admin@${SLUG}.example`,
  });

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, masterCtx, ['super_admin']));
  await server.register(tenantSuspendRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`).catch(() => {});
  await deleteRealm(`plexica-${SLUG}`).catch(() => {});
  await deleteBucket(`tenant-${SLUG}`).catch(() => {});
  await prisma.tenantDeletionStep.deleteMany({ where: { tenantId: seeded.tenantId } }).catch(() => {});
  await prisma.tenantLifecycleReconciliation.deleteMany({ where: { tenantId: seeded.tenantId } }).catch(() => {});
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: SLUG } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: SLUG } }).catch(() => {});
  await prisma.$disconnect();
  await server.close();
});

describe('POST /api/v1/admin/tenants/:id/suspend', () => {
  it('happy path: suspends active tenant → 200, status=suspended, version bumped', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/suspend`,
      payload: { version: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(seeded.tenantId);
    expect(body.status).toBe('suspended');
    expect(body.version).toBe(2);

    const tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
    expect(tenant?.status).toBe('suspended');
    expect(tenant?.version).toBe(2);

    const audit = await prisma.platformAuditLog.findFirst({
      where: { action: 'tenant.suspend', resourceId: seeded.tenantId },
    });
    expect(audit).not.toBeNull();
  });

  it('edge: version mismatch → 409', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/suspend`,
      payload: { version: 999 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: suspending an already-suspended tenant → 409', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/suspend`,
      payload: { version: 2 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: tenant not found → 404', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants/00000000-0000-0000-0000-000000000001/suspend',
      payload: { version: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('edge: invalid version body → 422', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/suspend`,
      payload: { version: 0 },
    });
    expect(res.statusCode).toBe(422);
  });
});
