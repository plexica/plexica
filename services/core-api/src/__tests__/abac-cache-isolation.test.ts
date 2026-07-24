// Integration coverage for workspace-role and Redis tenant isolation.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evaluate } from '../modules/abac/engine.js';

import { createTestServer, isDbReachable, isRedisReachable } from './helpers/server.helpers.js';
import {
  buildTenantClientForCtx,
  cleanupTenant,
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
  wipeTenantWorkspaces,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { AbacContext } from '../modules/abac/types.js';

const SLUG_A = 'test-cache-isolation-a';
const SLUG_B = 'test-cache-isolation-b';
const USER_ID = '00000000-1501-0003-0000-000000000001';
const allOk = (await isDbReachable()) && (await isRedisReachable());
let server: FastifyInstance;
let ctxA: TenantContext;
let ctxB: TenantContext;
let redis: Redis;

beforeAll(async () => {
  if (!allOk) return;
  [ctxA, ctxB] = (await Promise.all([seedTenant(SLUG_A), seedTenant(SLUG_B)])).map(
    (result) => result.tenantContext
  ) as [TenantContext, TenantContext];
  await Promise.all([
    seedUserProfile(ctxA, USER_ID, `${USER_ID}@test.plexica.io`, null, USER_ID),
    seedUserProfile(ctxB, USER_ID, `${USER_ID}@test.plexica.io`, null, USER_ID),
  ]);
  server = await createTestServer();
  await server.ready();
  redis = (await import('../lib/redis.js')).redis;
});

afterAll(async () => {
  if (!allOk) return;
  await server.close();
  await Promise.all([cleanupTenant(SLUG_A), cleanupTenant(SLUG_B)]);
});

beforeEach(async () => {
  if (allOk) await Promise.all([wipeTenantWorkspaces(ctxA), wipeTenantWorkspaces(ctxB)]);
});

function context(tenant: TenantContext, workspaceId: string): AbacContext {
  return {
    userId: USER_ID,
    workspaceId,
    tenantSlug: tenant.slug,
    action: 'workspace:delete',
    isTenantAdmin: false,
  };
}

describe('ABAC role and cache isolation', () => {
  it.skipIf(!allOk)('does not elevate a viewer from another workspace', async () => {
    const viewerWorkspace = await seedWorkspace(ctxA, 'WS-ViewerA', USER_ID);
    const adminWorkspace = await seedWorkspace(ctxA, 'WS-AdminB', USER_ID);
    await seedWorkspaceMember(ctxA, viewerWorkspace.id, USER_ID, 'viewer');
    await seedWorkspaceMember(ctxA, adminWorkspace.id, USER_ID, 'admin');
    const tenantDb = buildTenantClientForCtx(ctxA);
    try {
      expect((await evaluate(context(ctxA, viewerWorkspace.id), tenantDb, redis)).allowed).toBe(
        false
      );
      expect((await evaluate(context(ctxA, adminWorkspace.id), tenantDb, redis)).allowed).toBe(
        true
      );
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('does not reuse Redis membership across tenants', async () => {
    const workspaceA = await seedWorkspace(ctxA, 'WS-Cache-A', USER_ID);
    const workspaceB = await seedWorkspace(ctxB, 'WS-Cache-B', USER_ID);
    await seedWorkspaceMember(ctxA, workspaceA.id, USER_ID, 'admin');
    const tenantDbA = buildTenantClientForCtx(ctxA);
    const tenantDbB = buildTenantClientForCtx(ctxB);
    try {
      const readA = { ...context(ctxA, workspaceA.id), action: 'workspace:read' };
      const readB = { ...context(ctxB, workspaceB.id), action: 'workspace:read' };
      await evaluate(readA, tenantDbA, redis);
      expect((await evaluate(readB, tenantDbB, redis)).allowed).toBe(false);
    } finally {
      await tenantDbA.$disconnect();
      await tenantDbB.$disconnect();
    }
  });
});
