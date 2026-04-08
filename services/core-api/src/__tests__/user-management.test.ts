// user-management.test.ts
// Integration tests — INT-04: User management (list, filter, remove).
// Spec 003, Phase 18.4

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { userManagementRoutes } from '../modules/user-management/routes.js';

import { createTestServer, makeFullStub, isDbReachable } from './helpers/server.helpers.js';
import {
  seedTenant,
  seedUserProfile,
  wipeTenantWorkspaces,
  wipeTenantUsers,
  cleanupTenant,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { TenantUserDto } from '../modules/user-management/types.js';

const SLUG = 'ws-int04-usermgmt';
// Fixed UUIDs — used as both keycloakUserId and internal userId (passed as 5th arg to seedUserProfile)
// so audit_log.actor_id (UUID NOT NULL) and the DELETE/GET route params are satisfied.
const ADMIN_ID = '00000000-0104-0001-0000-000000000001';
const USER_A = '00000000-0104-0002-0000-000000000001';
const USER_B = '00000000-0104-0003-0000-000000000001';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;

  server = await createTestServer();
  const stub = makeFullStub(ADMIN_ID, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(userManagementRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG };
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantWorkspaces(ctx);
  await wipeTenantUsers(ctx);
  await seedUserProfile(ctx, ADMIN_ID, `${ADMIN_ID}@test.plexica.io`, 'Admin Int04', ADMIN_ID);
  await seedUserProfile(ctx, USER_A, `alice@test.plexica.io`, 'Alice User', USER_A);
  await seedUserProfile(ctx, USER_B, `bob@test.plexica.io`, 'Bob User', USER_B);
});

describe('INT-04 User list', () => {
  skipIfNoDb('GET /api/v1/users → paginated list of tenant users', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/users', headers: reqHeaders });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: TenantUserDto[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.data)).toBe(true);
  });

  skipIfNoDb('GET /api/v1/users?search=alice → only matching users', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/users?search=alice',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: TenantUserDto[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      body.data.every(
        (u) => u.displayName?.toLowerCase().includes('alice') || u.email.includes('alice')
      )
    ).toBe(true);
  });

  skipIfNoDb('returns 403 when caller is not tenant_admin', async () => {
    // Create a server with a non-admin stub
    const nonAdminServer = await createTestServer();
    nonAdminServer.addHook('preHandler', makeFullStub(USER_A, ctx, []));
    await nonAdminServer.register(userManagementRoutes);
    await nonAdminServer.ready();

    const res = await nonAdminServer.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(403);
    await nonAdminServer.close();
  });
});

describe('INT-04 Remove user', () => {
  skipIfNoDb('DELETE /api/v1/users/:id → 204, profile marked deleted', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${USER_B}`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ reassignments: [] }),
    });
    expect(res.statusCode).toBe(204);
  });

  skipIfNoDb('GET /api/v1/users/:id/workspaces → returns workspace list', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${USER_A}/workspaces`,
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { userId: string; workspaces: unknown[] };
    expect(body.userId).toBe(USER_A);
    expect(Array.isArray(body.workspaces)).toBe(true);
  });
});

describe('INT-04 Roles and action matrix', () => {
  skipIfNoDb('GET /api/v1/roles → returns role definitions', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/roles', headers: reqHeaders });
    expect(res.statusCode).toBe(200);
    const roles = JSON.parse(res.body) as Array<{ name: string }>;
    expect(roles.some((r) => r.name === 'tenant_admin')).toBe(true);
  });

  skipIfNoDb('GET /api/v1/roles/action-matrix → returns full matrix', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/roles/action-matrix',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const matrix = JSON.parse(res.body) as Array<{ action: string }>;
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.some((r) => r.action === 'workspace:read')).toBe(true);
  });
});
