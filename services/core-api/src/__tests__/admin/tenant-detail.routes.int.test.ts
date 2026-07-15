// tenant-detail.routes.int.test.ts
// Integration tests for GET /api/v1/admin/tenants/:id (Spec 005, S5-302).
// Requires real PostgreSQL with a seeded tenant schema (user_profile, workspace).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { tenantDetailRoutes } from '../../modules/admin/routes/tenant-detail.routes.js';

import { createTestServer, makeFullStub, isDbReachable } from '../helpers/server.helpers.js';
import {
  seedTenant,
  cleanupTenant,
  seedUserProfile,
  seedWorkspace,
  wipeTenantWorkspaces,
  wipeTenantUsers,
} from '../helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const ADMIN_PREFIX = '/api/v1/admin';
const TENANT_SLUG = 'test-adm-td';

let server: FastifyInstance;
let ctx: TenantContext;
let tenantId: string;
let creatorUserId: string;

beforeAll(async () => {
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error(
      'Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.'
    );
  }

  const seeded = await seedTenant(TENANT_SLUG);
  ctx = seeded.tenantContext;
  tenantId = seeded.tenantId;

  // Seed 2 user profiles + 2 workspaces in the tenant schema so the
  // cross-schema aggregates return non-zero counts.
  creatorUserId = await seedUserProfile(
    ctx,
    '00000000-0000-0000-0000-0admtd000001',
    'creator@test-adm-td.plexica.io',
    'Creator'
  );
  await seedUserProfile(
    ctx,
    '00000000-0000-0000-0000-0admtd000002',
    'second@test-adm-td.plexica.io',
    'Second'
  );
  await seedWorkspace(ctx, 'Detail Workspace One', creatorUserId);
  await seedWorkspace(ctx, 'Detail Workspace Two', creatorUserId);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(
    async (scope) => {
      scope.addHook('preHandler', requireSuperAdmin);
      await scope.register(tenantDetailRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
  await server.ready();
});

afterAll(async () => {
  if (server !== undefined) await server.close();
  if (ctx !== undefined) {
    await wipeTenantWorkspaces(ctx).catch(() => undefined);
    await wipeTenantUsers(ctx).catch(() => undefined);
  }
  await cleanupTenant(TENANT_SLUG);
});

describe('GET /api/v1/admin/tenants/:id — tenant detail aggregate', () => {
  it('returns tenant detail with cross-schema counts', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/tenants/${tenantId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      tenant: { id: string; slug: string; name: string; status: string };
      userCount: number;
      workspaceCount: number;
      pluginInstallations: unknown[];
      recentAudit: unknown[];
    }>();
    expect(body.tenant.id).toBe(tenantId);
    expect(body.tenant.slug).toBe(TENANT_SLUG);
    expect(body.userCount).toBe(2);
    expect(body.workspaceCount).toBe(2);
    expect(Array.isArray(body.pluginInstallations)).toBe(true);
    expect(Array.isArray(body.recentAudit)).toBe(true);
  });

  it('returns 404 for an unknown tenant id', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/tenants/11111111-1111-1111-1111-111111111111',
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-uuid id with 422', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/tenants/not-a-uuid',
    });
    expect(res.statusCode).toBe(422);
  });
});
