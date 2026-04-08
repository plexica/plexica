// workspace-members.test.ts
// Integration tests — INT-02: Workspace member management.
// Spec 003, Phase 18.2
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { workspaceRoutes } from '../modules/workspace/routes.js';
import { workspaceMemberRoutes } from '../modules/workspace-member/routes.js';
import { membershipCacheKey } from '../modules/abac/engine-helpers.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isRedisReachable,
} from './helpers/server.helpers.js';
import {
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
  wipeTenantWorkspaces,
  cleanupTenant,
} from './helpers/db.helpers.js';
import { mustCreateWorkspace } from './helpers/workspace.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { WorkspaceMemberDto } from '../modules/workspace/types.js';

const SLUG = 'ws-int02-members';
const ADMIN_ID = 'admin-int02';
const MEMBER_ID = 'member-int02';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));
const skipIfNoStack = it.skipIf(!(await isDbReachable()) || !(await isRedisReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;
let workspaceId: string;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  await seedUserProfile(ctx, ADMIN_ID, `${ADMIN_ID}@test.plexica.io`, 'Admin User');
  await seedUserProfile(ctx, MEMBER_ID, `${MEMBER_ID}@test.plexica.io`, 'Member User');

  server = await createTestServer();
  const stub = makeFullStub(ADMIN_ID, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(workspaceRoutes);
  await server.register(workspaceMemberRoutes);
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
  // Create a fresh workspace each test so tests don't share state
  const ws = await seedWorkspace(ctx, 'Members WS', ADMIN_ID);
  workspaceId = ws.id;
  await seedWorkspaceMember(ctx, workspaceId, ADMIN_ID, 'admin');
});

describe('INT-02 Add member', () => {
  skipIfNoDb('POST /api/v1/workspaces/:id/members → 201 and member appears in list', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'member' }),
    });
    expect(res.statusCode).toBe(201);
    const member = JSON.parse(res.body) as WorkspaceMemberDto;
    expect(member.userId).toBe(MEMBER_ID);
    expect(member.role).toBe('member');

    const listRes = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: reqHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.body) as { data: WorkspaceMemberDto[] };
    expect(list.data.some((m) => m.userId === MEMBER_ID)).toBe(true);
  });

  skipIfNoDb('rejects duplicate member (409 MEMBER_ALREADY_EXISTS)', async () => {
    // Add once
    await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'member' }),
    });
    // Add again
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'member' }),
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBER_ALREADY_EXISTS');
  });
});

describe('INT-02 Role change', () => {
  skipIfNoDb('PATCH /api/v1/workspaces/:id/members/:userId → role updated', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'member' }),
    });

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/members/${MEMBER_ID}`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(res.statusCode).toBe(200);
    const updated = JSON.parse(res.body) as WorkspaceMemberDto;
    expect(updated.role).toBe('viewer');
  });
});

describe('INT-02 Remove member', () => {
  skipIfNoDb('DELETE /api/v1/workspaces/:id/members/:userId → 204, member gone', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'member' }),
    });

    const delRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceId}/members/${MEMBER_ID}`,
      headers: reqHeaders,
    });
    expect(delRes.statusCode).toBe(204);

    const listRes = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: reqHeaders,
    });
    const list = JSON.parse(listRes.body) as { data: WorkspaceMemberDto[] };
    expect(list.data.every((m) => m.userId !== MEMBER_ID)).toBe(true);
  });
});

describe('INT-02 ABAC cache invalidation', () => {
  skipIfNoStack('after role change Redis cache key is deleted and new role enforced', async () => {
    const { redis } = await import('../lib/redis.js');
    const ws2 = await mustCreateWorkspace(server, reqHeaders, 'CacheBustWS');
    await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${ws2.id}/members`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ userId: MEMBER_ID, role: 'admin' }),
    });
    // Seed Redis cache with current role
    const cacheKey = membershipCacheKey({
      userId: MEMBER_ID,
      workspaceId: ws2.id,
      tenantSlug: SLUG,
      action: 'workspace:read',
      isTenantAdmin: false,
    });
    await redis.set(cacheKey, JSON.stringify({ role: 'admin', isTenantAdmin: false }), 'EX', 300);
    expect(await redis.get(cacheKey)).not.toBeNull();
    // Downgrade role — must bust the Redis key
    await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${ws2.id}/members/${MEMBER_ID}`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ role: 'viewer' }),
    });
    expect(await redis.get(cacheKey)).toBeNull();
    // DB reflects new role
    const listRes = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${ws2.id}/members`,
      headers: reqHeaders,
    });
    const list = JSON.parse(listRes.body) as { data: Array<{ userId: string; role: string }> };
    expect(list.data.find((m) => m.userId === MEMBER_ID)?.role).toBe('viewer');
  });
});
