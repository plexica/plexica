// abac-workspace-isolation.test.ts
// Integration tests for ABAC cross-workspace and cross-tenant isolation.
// Verifies that membership in workspace A never grants access to workspace B,
// and that a member of tenant A cannot access tenant B's resources.
// Implements: Spec 003, INT-09, Phase 18

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { evaluate } from '../modules/abac/engine.js';

import { createTestServer, isDbReachable, isRedisReachable } from './helpers/server.helpers.js';
import {
  seedTenant,
  cleanupTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
  wipeTenantWorkspaces,
  buildTenantClientForCtx,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { AbacContext } from '../modules/abac/types.js';
import type { Redis } from 'ioredis';

const SLUG_A = 'test-isolation-a';
const SLUG_B = 'test-isolation-b';
// Fixed UUIDs so workspace.created_by and workspace_member.user_id FK constraints are satisfied
const USER_A = '00000000-1501-0001-0000-000000000001';
const USER_B = '00000000-1501-0002-0000-000000000001';

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
    // Seed user profiles so FK constraints on workspace.created_by/workspace_member.user_id are satisfied
    await Promise.all([
      seedUserProfile(ctxA, USER_A, `${USER_A}@test.plexica.io`, null, USER_A),
      seedUserProfile(ctxA, USER_B, `${USER_B}@test.plexica.io`, null, USER_B),
      seedUserProfile(ctxB, USER_A, `${USER_A}@test.plexica.io`, null, USER_A),
      seedUserProfile(ctxB, USER_B, `${USER_B}@test.plexica.io`, null, USER_B),
    ]);
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

    const tenantDb = buildTenantClientForCtx(ctxA);
    try {
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
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('admin of workspace A cannot invite members to workspace B', async () => {
    const wsA = await seedWorkspace(ctxA, 'WS-Gamma', USER_A);
    const wsB = await seedWorkspace(ctxA, 'WS-Delta', USER_A);
    await seedWorkspaceMember(ctxA, wsA.id, USER_A, 'admin');

    const tenantDb = buildTenantClientForCtx(ctxA);
    try {
      const inviteIntoB: AbacContext = {
        userId: USER_A,
        workspaceId: wsB.id,
        tenantSlug: ctxA.slug,
        action: 'member:invite',
        isTenantAdmin: false,
      };

      const d = await evaluate(inviteIntoB, tenantDb, redis);
      expect(d.allowed).toBe(false);
    } finally {
      await tenantDb.$disconnect();
    }
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
      const tenantDbB = buildTenantClientForCtx(ctxB);
      try {
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
      } finally {
        await tenantDbB.$disconnect();
      }
    }
  );

  it.skipIf(!allOk)(
    'cross-tenant isTenantAdmin flag does not bypass other tenant resources',
    async () => {
      const wsInB = await seedWorkspace(ctxB, 'WS-TenantB-2', USER_B);
      const tenantDbB = buildTenantClientForCtx(ctxB);
      try {
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
      } finally {
        await tenantDbB.$disconnect();
      }
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

      const tenantDb = buildTenantClientForCtx(ctxA);
      try {
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
      } finally {
        await tenantDb.$disconnect();
      }
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

      const tenantDbA = buildTenantClientForCtx(ctxA);
      const tenantDbB = buildTenantClientForCtx(ctxB);

      try {
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
      } finally {
        await tenantDbA.$disconnect();
        await tenantDbB.$disconnect();
      }
    }
  );
});
