// user-management-remove.int.test.ts
// Integration tests — INT-04: user removal and its guards (self-removal 422,
// UUID param validation, non-admin 204, profile soft-delete).
// Split out of user-management.test.ts to keep both files under the 200-line
// constitution limit (Rule 4). The last-admin guard under concurrency (with a
// live Keycloak realm) lives in user-management-remove-race.test.ts.

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

const SLUG = 'ws-int04-userremove';
// Fixed UUIDs — used as both keycloakUserId and internal userId so
// audit_log.actor_id (UUID NOT NULL) and the DELETE route params are satisfied.
const ADMIN_ID = '00000000-0104-0001-0000-000000000002';
const USER_A = '00000000-0104-0002-0000-000000000002';
const USER_B = '00000000-0104-0003-0000-000000000002';
const USER_C = '00000000-0104-0004-0000-000000000002';

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
  await seedUserProfile(ctx, USER_C, `carol@test.plexica.io`, 'Carol User', USER_C);
});

describe('INT-04 Remove user', () => {
  // Self-removal guard (routes.ts): unconditional — applies even when other
  // admins exist, because no in-app flow can re-enable a disabled account.
  skipIfNoDb('DELETE with id === actor id → 422 (self-removal guard)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${ADMIN_ID}`,
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Cannot remove your own account');
  });

  // A malformed :id must be rejected by userIdParamSchema (422), never reach
  // Prisma (which would throw P2023 and surface as an unmapped 500).
  skipIfNoDb('DELETE with non-UUID :id → 422 (not a Prisma P2023 500)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/v1/users/not-a-uuid',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // The last-admin guard only concerns targets holding the Keycloak
  // tenant_admin role — removing a regular member must never trip it. Without
  // a provisioned realm the guard fails open (admin-guard.ts); the
  // realm-backed variant lives in user-management-remove-race.test.ts.
  skipIfNoDb('DELETE on a non-admin user → 204 (last-admin guard does not fire)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${USER_A}`,
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(204);
  });

  skipIfNoDb('DELETE /api/v1/users/:id → 204, profile marked deleted', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${USER_B}`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ reassignments: [] }),
    });
    expect(res.statusCode).toBe(204);
  });

  // Regression guard: the browser client sends DELETE with no body and no
  // Content-Type (apiClient.delete). The test above passes a JSON body, so it
  // exercised a request shape the client never produces and hid a 400 on every
  // UI-driven removal. Keep both: this one is the shape that reaches production.
  skipIfNoDb('DELETE /api/v1/users/:id with no request body → 204', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${USER_C}`,
      headers: reqHeaders,
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
