// Integration coverage for ABAC cache, unknown actions, and tenant-level denial.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evaluate, invalidateAbacCache } from '../modules/abac/engine.js';
import { membershipCacheKey } from '../modules/abac/engine-helpers.js';

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

const TENANT_SLUG = 'test-abac-cache';
const USER_ID = '00000000-abac-0002-0000-000000000001';
const allOk = (await isDbReachable()) && (await isRedisReachable());
let server: FastifyInstance;
let ctx: TenantContext;
let redis: Redis;

beforeAll(async () => {
  if (!allOk) return;
  ctx = (await seedTenant(TENANT_SLUG)).tenantContext;
  await seedUserProfile(ctx, USER_ID, `${USER_ID}@test.plexica.io`, null, USER_ID);
  server = await createTestServer();
  await server.ready();
  redis = (await import('../lib/redis.js')).redis;
});

afterAll(async () => {
  if (!allOk) return;
  await server.close();
  await cleanupTenant(TENANT_SLUG);
});

beforeEach(async () => {
  if (allOk) await wipeTenantWorkspaces(ctx);
});

function context(workspaceId: string, action: string): AbacContext {
  return {
    userId: USER_ID,
    workspaceId,
    tenantSlug: ctx.slug,
    action,
    isTenantAdmin: false,
  };
}

describe('ABAC integration cache and default denial', () => {
  it.skipIf(!allOk)('denies unknown actions by default', async () => {
    const workspace = await seedWorkspace(ctx, 'Unknown-Action-WS', USER_ID);
    await seedWorkspaceMember(ctx, workspace.id, USER_ID, 'admin');
    const tenantDb = buildTenantClientForCtx(ctx);
    try {
      const decision = await evaluate(context(workspace.id, 'completely:unknown'), tenantDb, redis);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/unknown/);
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('caches membership after the first evaluation', async () => {
    const workspace = await seedWorkspace(ctx, 'Cache-Test-WS', USER_ID);
    await seedWorkspaceMember(ctx, workspace.id, USER_ID, 'viewer');
    const tenantDb = buildTenantClientForCtx(ctx);
    const abacContext = context(workspace.id, 'workspace:read');
    try {
      await evaluate(abacContext, tenantDb, redis);
      const cached = await redis.get(membershipCacheKey(abacContext));
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached ?? '').role).toBe('viewer');
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('invalidates a cached membership', async () => {
    const workspace = await seedWorkspace(ctx, 'Invalidate-WS', USER_ID);
    await seedWorkspaceMember(ctx, workspace.id, USER_ID, 'admin');
    const tenantDb = buildTenantClientForCtx(ctx);
    const abacContext = context(workspace.id, 'workspace:read');
    try {
      await evaluate(abacContext, tenantDb, redis);
      const key = membershipCacheKey(abacContext);
      expect(await redis.get(key)).not.toBeNull();
      await invalidateAbacCache(ctx.slug, USER_ID, workspace.id, redis);
      expect(await redis.get(key)).toBeNull();
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('denies tenant-level actions for non-admin members', async () => {
    const workspace = await seedWorkspace(ctx, 'Tenant-Level-WS', USER_ID);
    await seedWorkspaceMember(ctx, workspace.id, USER_ID, 'admin');
    const tenantDb = buildTenantClientForCtx(ctx);
    try {
      const decision = await evaluate(context(workspace.id, 'audit:read'), tenantDb, redis);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/tenant-level/);
    } finally {
      await tenantDb.$disconnect();
    }
  });
});
