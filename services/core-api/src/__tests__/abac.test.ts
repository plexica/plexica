// abac.test.ts
// Integration tests for the ABAC evaluation engine.
// Exercises evaluate(), getMembership() cache, invalidateAbacCache().
// Implements: Spec 003, INT-08, Phase 18

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { evaluate, invalidateAbacCache } from '../modules/abac/engine.js';
import { membershipCacheKey } from '../modules/abac/engine-helpers.js';
import { withTenantDb } from '../lib/tenant-database.js';

import { createTestServer, isDbReachable, isRedisReachable } from './helpers/server.helpers.js';
import {
  seedTenant,
  cleanupTenant,
  seedWorkspace,
  seedWorkspaceMember,
  wipeTenantWorkspaces,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { AbacContext } from '../modules/abac/types.js';
import type { Redis } from 'ioredis';

const TENANT_SLUG = 'test-abac';
const USER_ID = 'kcuser-abac-001';

let server: FastifyInstance;
let ctx: TenantContext;
let redis: Redis;

const dbOk = await isDbReachable();
const redisOk = await isRedisReachable();
const allOk = dbOk && redisOk;

describe('INT-08 — ABAC engine', () => {
  beforeAll(async () => {
    if (!allOk) return;
    const seeded = await seedTenant(TENANT_SLUG);
    ctx = seeded.tenantContext;
    server = await createTestServer();
    await server.ready();
    const mod = await import('../lib/redis.js');
    redis = mod.redis;
  });

  afterAll(async () => {
    if (!allOk) return;
    await server.close();
    await cleanupTenant(TENANT_SLUG);
  });

  beforeEach(async () => {
    if (!allOk) return;
    await wipeTenantWorkspaces(ctx);
  });

  // ── Tenant admin bypass ───────────────────────────────────────────────────

  it.skipIf(!allOk)('tenant admin bypasses all workspace membership checks', async () => {
    const ws = await seedWorkspace(ctx, 'Admin-Bypass-WS', USER_ID);
    // No membership seeded — but isTenantAdmin=true should still allow
    const abacCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:delete',
      isTenantAdmin: true,
    };
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);
    const decision = await evaluate(abacCtx, tenantDb, redis);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toMatch(/tenant admin/);
  });

  // ── Non-member denial ─────────────────────────────────────────────────────

  it.skipIf(!allOk)('denies access when user is not a workspace member', async () => {
    const ws = await seedWorkspace(ctx, 'Non-Member-WS', USER_ID);
    const abacCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);
    const decision = await evaluate(abacCtx, tenantDb, redis);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/not a workspace member/);
  });

  // ── Role hierarchy ────────────────────────────────────────────────────────

  it.skipIf(!allOk)('viewer can read but cannot update workspace', async () => {
    const ws = await seedWorkspace(ctx, 'Role-Test-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'viewer');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    const readCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };
    const updateCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:update',
      isTenantAdmin: false,
    };

    const canRead = await evaluate(readCtx, tenantDb, redis);
    const canUpdate = await evaluate(updateCtx, tenantDb, redis);

    expect(canRead.allowed).toBe(true);
    expect(canUpdate.allowed).toBe(false);
  });

  it.skipIf(!allOk)('member can read but cannot delete workspace', async () => {
    const ws = await seedWorkspace(ctx, 'Member-Role-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'member');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    const readCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };
    const deleteCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:delete',
      isTenantAdmin: false,
    };

    expect((await evaluate(readCtx, tenantDb, redis)).allowed).toBe(true);
    expect((await evaluate(deleteCtx, tenantDb, redis)).allowed).toBe(false);
  });

  it.skipIf(!allOk)('admin can perform all workspace actions', async () => {
    const ws = await seedWorkspace(ctx, 'Admin-Role-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'admin');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    for (const action of [
      'workspace:read',
      'workspace:update',
      'workspace:delete',
      'member:invite',
    ]) {
      const abacCtx: AbacContext = {
        userId: USER_ID,
        workspaceId: ws.id,
        tenantSlug: ctx.slug,
        action,
        isTenantAdmin: false,
      };
      const d = await evaluate(abacCtx, tenantDb, redis);
      expect(d.allowed, `action=${action}`).toBe(true);
    }
  });

  // ── Unknown action ────────────────────────────────────────────────────────

  it.skipIf(!allOk)('denies unknown actions by default', async () => {
    const ws = await seedWorkspace(ctx, 'Unknown-Action-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'admin');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    const abacCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'completely:unknown',
      isTenantAdmin: false,
    };
    const d = await evaluate(abacCtx, tenantDb, redis);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/unknown/);
  });

  // ── Redis cache ───────────────────────────────────────────────────────────

  it.skipIf(!allOk)('caches membership result in Redis after first evaluation', async () => {
    const ws = await seedWorkspace(ctx, 'Cache-Test-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'viewer');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    const abacCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };

    // First call — cache miss, populates Redis
    await evaluate(abacCtx, tenantDb, redis);
    const key = membershipCacheKey(abacCtx);
    const cached = await redis.get(key);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached ?? '');
    expect(parsed.role).toBe('viewer');
  });

  // ── Cache invalidation ────────────────────────────────────────────────────

  it.skipIf(!allOk)('invalidateAbacCache removes the Redis entry', async () => {
    const ws = await seedWorkspace(ctx, 'Invalidate-WS', USER_ID);
    await seedWorkspaceMember(ctx, ws.id, USER_ID, 'admin');
    const tenantDb = await withTenantDb(async (tx) => tx, ctx);

    const abacCtx: AbacContext = {
      userId: USER_ID,
      workspaceId: ws.id,
      tenantSlug: ctx.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };
    await evaluate(abacCtx, tenantDb, redis);

    const key = membershipCacheKey(abacCtx);
    expect(await redis.get(key)).not.toBeNull();

    await invalidateAbacCache(ctx.slug, USER_ID, ws.id, redis);
    expect(await redis.get(key)).toBeNull();
  });

  // ── Tenant-level actions ──────────────────────────────────────────────────

  it.skipIf(!allOk)(
    'denies tenant-level actions for non-admin even with workspace membership',
    async () => {
      const ws = await seedWorkspace(ctx, 'Tenant-Level-WS', USER_ID);
      await seedWorkspaceMember(ctx, ws.id, USER_ID, 'admin');
      const tenantDb = await withTenantDb(async (tx) => tx, ctx);

      const abacCtx: AbacContext = {
        userId: USER_ID,
        workspaceId: ws.id,
        tenantSlug: ctx.slug,
        action: 'audit:read',
        isTenantAdmin: false,
      };
      const d = await evaluate(abacCtx, tenantDb, redis);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/tenant-level/);
    }
  );
});
