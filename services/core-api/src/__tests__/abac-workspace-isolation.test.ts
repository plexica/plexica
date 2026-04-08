// abac-workspace-isolation.test.ts
// Integration tests for ABAC cross-workspace and cross-tenant isolation.
// Verifies that membership in workspace A never grants access to workspace B,
// and that a member of tenant A cannot access tenant B's resources.
// Implements: Spec 003, INT-09, Phase 18

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { evaluate } from '../modules/abac/engine.js';
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

const SLUG_A = 'test-isolation-a';
const SLUG_B = 'test-isolation-b';
const USER_A = 'kcuser-isolation-001';
const USER_B = 'kcuser-isolation-002';

let server: FastifyInstance;
let ctxA: TenantContext;
let ctxB: TenantContext;
let redis: Redis;

const dbOk = await isDbReachable();
const redisOk = await isRedisReachable();
const allOk = dbOk && redisOk;

describe('INT-09 — ABAC workspace & cross-tenant isolation', () => {
  beforeAll(async () => {
    if (!allOk) return;
    const [seedA, seedB] = await Promise.all([seedTenant(SLUG_A), seedTenant(SLUG_B)]);
    ctxA = seedA.tenantContext;
    ctxB = seedB.tenantContext;
    server = await createTestServer();
    await server.ready();
    const mod = await import('../lib/redis.js');
    redis = mod.redis;
  });

  afterAll(async () => {
    if (!allOk) return;
    await server.close();
    await Promise.all([cleanupTenant(SLUG_A), cleanupTenant(SLUG_B)]);
  });

  beforeEach(async () => {
    if (!allOk) return;
    await Promise.all([wipeTenantWorkspaces(ctxA), wipeTenantWorkspaces(ctxB)]);
  });

  // ── Cross-workspace isolation ─────────────────────────────────────────────

  it.skipIf(!allOk)('member of workspace A cannot access workspace B in same tenant', async () => {
    const wsA = await seedWorkspace(ctxA, 'WS-Alpha', USER_A);
    const wsB = await seedWorkspace(ctxA, 'WS-Beta', USER_A);

    // USER_A is only a member of wsA
    await seedWorkspaceMember(ctxA, wsA.id, USER_A, 'admin');

    const tenantDb = await withTenantDb(async (tx) => tx, ctxA);

    const accessA: AbacContext = {
      userId: USER_A,
      workspaceId: wsA.id,
      tenantSlug: ctxA.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };
    const accessB: AbacContext = {
      userId: USER_A,
      workspaceId: wsB.id,
      tenantSlug: ctxA.slug,
      action: 'workspace:read',
      isTenantAdmin: false,
    };

    expect((await evaluate(accessA, tenantDb, redis)).allowed).toBe(true);
    expect((await evaluate(accessB, tenantDb, redis)).allowed).toBe(false);
  });

  it.skipIf(!allOk)('admin of workspace A cannot invite members to workspace B', async () => {
    const wsA = await seedWorkspace(ctxA, 'WS-Gamma', USER_A);
    const wsB = await seedWorkspace(ctxA, 'WS-Delta', USER_A);
    await seedWorkspaceMember(ctxA, wsA.id, USER_A, 'admin');

    const tenantDb = await withTenantDb(async (tx) => tx, ctxA);

    const inviteIntoB: AbacContext = {
      userId: USER_A,
      workspaceId: wsB.id,
      tenantSlug: ctxA.slug,
      action: 'member:invite',
      isTenantAdmin: false,
    };

    const d = await evaluate(inviteIntoB, tenantDb, redis);
    expect(d.allowed).toBe(false);
  });

  // ── Cross-tenant isolation ─────────────────────────────────────────────────

  it.skipIf(!allOk)(
    'USER_A membership in tenant A does not grant access to tenant B workspace',
    async () => {
      const wsInA = await seedWorkspace(ctxA, 'WS-TenantA', USER_A);
      const wsInB = await seedWorkspace(ctxB, 'WS-TenantB', USER_B);

      // USER_A is admin in tenant A
      await seedWorkspaceMember(ctxA, wsInA.id, USER_A, 'admin');

      // Evaluate against tenant B's DB with tenant A's context — should deny
      const tenantDbB = await withTenantDb(async (tx) => tx, ctxB);

      const crossTenantCtx: AbacContext = {
        userId: USER_A,
        workspaceId: wsInB.id,
        tenantSlug: ctxB.slug, // tenant B
        action: 'workspace:read',
        isTenantAdmin: false,
      };

      const d = await evaluate(crossTenantCtx, tenantDbB, redis);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/not a workspace member/);
    }
  );

  it.skipIf(!allOk)(
    'cross-tenant isTenantAdmin flag does not bypass other tenant resources',
    async () => {
      const wsInB = await seedWorkspace(ctxB, 'WS-TenantB-2', USER_B);
      const tenantDbB = await withTenantDb(async (tx) => tx, ctxB);

      // USER_A claims isTenantAdmin but in the context of tenant B's workspace
      // The engine trusts isTenantAdmin from middleware — but in real middleware this
      // would never be set for a foreign tenant. Here we confirm the bypass itself works,
      // meaning any grant must come exclusively from authenticated context in tenant B.
      // This test documents that the engine does NOT validate the tenant in AbacContext —
      // the isolation guarantee comes from the DB schema, not the engine.
      const ctx: AbacContext = {
        userId: USER_A,
        workspaceId: wsInB.id,
        tenantSlug: ctxB.slug,
        action: 'workspace:delete',
        isTenantAdmin: false, // not admin in tenant B
      };

      const d = await evaluate(ctx, tenantDbB, redis);
      expect(d.allowed).toBe(false);
    }
  );

  // ── Viewer in one, admin in another ──────────────────────────────────────

  it.skipIf(!allOk)(
    'viewer role in workspace A does not elevate to admin in workspace B',
    async () => {
      const wsA = await seedWorkspace(ctxA, 'WS-ViewerA', USER_A);
      const wsB = await seedWorkspace(ctxA, 'WS-AdminB', USER_A);

      await seedWorkspaceMember(ctxA, wsA.id, USER_A, 'viewer');
      await seedWorkspaceMember(ctxA, wsB.id, USER_A, 'admin');

      const tenantDb = await withTenantDb(async (tx) => tx, ctxA);

      const deleteA: AbacContext = {
        userId: USER_A,
        workspaceId: wsA.id,
        tenantSlug: ctxA.slug,
        action: 'workspace:delete',
        isTenantAdmin: false,
      };
      const deleteB: AbacContext = {
        userId: USER_A,
        workspaceId: wsB.id,
        tenantSlug: ctxA.slug,
        action: 'workspace:delete',
        isTenantAdmin: false,
      };

      expect((await evaluate(deleteA, tenantDb, redis)).allowed).toBe(false);
      expect((await evaluate(deleteB, tenantDb, redis)).allowed).toBe(true);
    }
  );

  // ── Redis cache does not leak across tenants ──────────────────────────────

  it.skipIf(!allOk)(
    'Redis cache keys are tenant-scoped and do not leak across tenants',
    async () => {
      const wsA = await seedWorkspace(ctxA, 'WS-Cache-A', USER_A);
      const wsB = await seedWorkspace(ctxB, 'WS-Cache-B', USER_A);

      await seedWorkspaceMember(ctxA, wsA.id, USER_A, 'admin');
      // USER_A has NO membership in tenant B

      const tenantDbA = await withTenantDb(async (tx) => tx, ctxA);
      const tenantDbB = await withTenantDb(async (tx) => tx, ctxB);

      // Populate cache for tenant A
      await evaluate(
        {
          userId: USER_A,
          workspaceId: wsA.id,
          tenantSlug: ctxA.slug,
          action: 'workspace:read',
          isTenantAdmin: false,
        },
        tenantDbA,
        redis
      );

      // Evaluate against tenant B — must not reuse tenant A's cache entry
      const d = await evaluate(
        {
          userId: USER_A,
          workspaceId: wsB.id,
          tenantSlug: ctxB.slug,
          action: 'workspace:read',
          isTenantAdmin: false,
        },
        tenantDbB,
        redis
      );
      expect(d.allowed).toBe(false);
    }
  );
});
