// tenant-reactivate.routes.int.test.ts
// Integration tests for POST /api/v1/admin/tenants/:id/reactivate (S5-601).
// Seeds a real tenant, suspends it directly via the service, then exercises
// the reactivate route. Real PostgreSQL + Keycloak + MinIO.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { deleteBucket } from '../../lib/minio-client.js';
import { deleteRealm } from '../../lib/keycloak-admin.js';
import { toSchemaName } from '../../lib/tenant-schema-helpers.js';
import { provisionTenant } from '../../modules/tenant/tenant-provisioning.js';
import { suspendTenant } from '../../modules/admin/services/tenant-suspend.service.js';
import { tenantReactivateRoutes } from '../../modules/admin/routes/tenant-reactivate.routes.js';
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

const SLUG = `intreact-${Date.now().toString(36)}`;
const SCHEMA = toSchemaName(SLUG);

let server: FastifyInstance;
let seeded: ProvisioningResult;
let suspendedVersion: number;

beforeAll(async () => {
  const dbOk = await isDbReachable();
  const kcOk = await isKeycloakReachable();
  const minioOk = await isMinioReachable();
  if (!dbOk || !kcOk || !minioOk) {
    throw new Error(
      'PostgreSQL + Keycloak + MinIO must all be reachable for tenant reactivate integration tests.'
    );
  }
  seeded = await provisionTenant({
    slug: SLUG, name: 'Reactivate Test Org', adminEmail: `admin@${SLUG}.example`,
  });
  const suspended = await suspendTenant(prisma, seeded.tenantId, 1, SUPER_ADMIN_ACTOR);
  suspendedVersion = suspended.version;

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, masterCtx, ['super_admin']));
  await server.register(tenantReactivateRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`).catch(() => {});
  await deleteRealm(`plexica-${SLUG}`).catch(() => {});
  await deleteBucket(`tenant-${SLUG}`).catch(() => {});
  await prisma.tenantDeletionStep.deleteMany({ where: { tenantId: seeded.tenantId } }).catch(() => {});
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: SLUG } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: SLUG } }).catch(() => {});
  await prisma.$disconnect();
  await server.close();
});

describe('POST /api/v1/admin/tenants/:id/reactivate', () => {
  it('happy path: reactivates suspended tenant → 200, status=active, version bumped', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: suspendedVersion },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(seeded.tenantId);
    expect(body.status).toBe('active');
    expect(body.version).toBe(suspendedVersion + 1);

    const tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
    expect(tenant?.status).toBe('active');

    const audit = await prisma.platformAuditLog.findFirst({
      where: { action: 'tenant.reactivate', resourceId: seeded.tenantId },
    });
    expect(audit).not.toBeNull();
  });

  it('edge: version mismatch → 409', async () => {
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: 999 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: reactivating an already-active tenant → 409', async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
    const res = await server.inject({
      method: 'POST', url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: tenant!.version },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: tenant not found → 404', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants/00000000-0000-0000-0000-000000000001/reactivate',
      payload: { version: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});
