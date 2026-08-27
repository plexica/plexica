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
  SUPER_ADMIN_ACTOR,
  createAdminTestServer,
  requireInfra,
} from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { ProvisioningResult } from '../../modules/tenant/tenant-provisioning.js';

const SLUG = `intreact-${Date.now().toString(36)}`;
const SCHEMA = toSchemaName(SLUG);

let server: FastifyInstance;
let seeded: ProvisioningResult;
let suspendedVersion: number;

beforeAll(async () => {
  await requireInfra('tenant reactivate integration tests');
  seeded = await provisionTenant({
    slug: SLUG,
    name: 'Reactivate Test Org',
    adminEmail: `admin@${SLUG}.example`,
  });
  const suspended = await suspendTenant(prisma, seeded.tenantId, 1, SUPER_ADMIN_ACTOR);
  suspendedVersion = suspended.version;

  server = await createAdminTestServer([tenantReactivateRoutes]);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`).catch(() => {});
  await deleteRealm(`plexica-${SLUG}`).catch(() => {});
  await deleteBucket(`tenant-${SLUG}`).catch(() => {});
  await prisma.tenantDeletionStep
    .deleteMany({ where: { tenantId: seeded.tenantId } })
    .catch(() => {});
  await prisma.tenantLifecycleReconciliation
    .deleteMany({ where: { tenantId: seeded.tenantId } })
    .catch(() => {});
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: SLUG } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: SLUG } }).catch(() => {});
  await prisma.$disconnect();
  await server.close();
});

describe('POST /api/v1/admin/tenants/:id/reactivate', () => {
  it('happy path: reactivates suspended tenant → 200, status=active, version bumped', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: suspendedVersion },
    });
    // 202 is valid when side-effects (Keycloak/Redis/runtime) are deferred.
    // The DB version is already bumped; reconciliation retries async (see
    // tenant-lifecycle-reconciliation.int.test.ts for exhaustive 202 coverage).
    expect([200, 202]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(seeded.tenantId);
    expect(['active', 'suspended']).toContain(body.status);
    // If 200, status must be active; if 202, the visible status stays suspended until reconciliation.
    if (res.statusCode === 200) {
      expect(body.status).toBe('active');
      expect(body.version).toBe(suspendedVersion + 1);
      const tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
      expect(tenant?.status).toBe('active');
      expect(tenant?.version).toBe(suspendedVersion + 1);
    } else {
      expect(body.status).toBe('suspended');
      expect(body.version).toBe(suspendedVersion + 1);
      expect(body.reconciliation).toBe('pending');
      expect(body.operationId).toEqual(expect.any(String));
      const tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
      expect(tenant?.status).toBe('suspended');
      expect(tenant?.version).toBe(suspendedVersion + 1);
      const op = await prisma.tenantLifecycleReconciliation.findUnique({
        where: { id: body.operationId },
      });
      expect(op).not.toBeNull();
      expect(op?.desiredStatus).toBe('active');
      expect(op?.targetVersion).toBe(suspendedVersion + 1);
    }

    const audit = await prisma.platformAuditLog.findFirst({
      where: { action: 'tenant.reactivate', resourceId: seeded.tenantId },
    });
    expect(audit).not.toBeNull();
  });

  it('edge: version mismatch → 409', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: 999 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: reactivating an already-active tenant → 409', async () => {
    // Isolate fixture: ensure deterministic active state for this edge case.
    // If prior happy-path was 202 (still suspended), force active so the guard is testable.
    let tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
    if (tenant?.status !== 'active') {
      await prisma.tenant.update({
        where: { id: seeded.tenantId },
        data: { status: 'active' },
      });
      tenant = await prisma.tenant.findUnique({ where: { id: seeded.tenantId } });
    }
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/tenants/${seeded.tenantId}/reactivate`,
      payload: { version: tenant!.version },
    });
    expect(res.statusCode).toBe(409);
  });

  it('edge: tenant not found → 404', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/tenants/00000000-0000-0000-0000-000000000001/reactivate',
      payload: { version: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});
