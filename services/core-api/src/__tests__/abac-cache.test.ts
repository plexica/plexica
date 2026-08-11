// Integration coverage for ABAC cache, unknown actions, and tenant-level denial.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evaluate, setAbacMembership } from '../modules/abac/engine.js';
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

function context(workspaceId: string, action: string, userId = USER_ID): AbacContext {
  return {
    userId,
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
      // isTenantAdmin is deliberately NOT part of the payload: it describes the
      // requesting principal, never the membership row, and evaluate() short-
      // circuits tenant admins long before getMembership() runs.
      expect(JSON.parse(cached ?? 'null')).toEqual({ role: 'viewer' });
    } finally {
      await tenantDb.$disconnect();
    }
  });

  it.skipIf(!allOk)('a write-through tombstone survives a late NX populate', async () => {
    // Regression guard for the revocation race: the reader below has already
    // read role='admin' from the DB when the writer publishes {role: null}.
    // Its populate must NOT resurrect the revoked role.
    const workspace = await seedWorkspace(ctx, 'Tombstone-WS', USER_ID);
    await seedWorkspaceMember(ctx, workspace.id, USER_ID, 'admin');
    const abacContext = context(workspace.id, 'workspace:read');
    const key = membershipCacheKey(abacContext);
    await redis.del(key);

    await setAbacMembership(ctx.slug, USER_ID, workspace.id, { role: null }, redis);

    const tenantDb = buildTenantClientForCtx(ctx);
    try {
      const decision = await evaluate(abacContext, tenantDb, redis);
      expect(decision.allowed).toBe(false);
      expect(JSON.parse((await redis.get(key)) ?? 'null')).toEqual({ role: null });
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

// removeUser() ABAC revocation coverage lives in abac-cache-removal.test.ts —
// kept in its own file to stay under the 200-line limit and because it
// exercises a distinct production entry point (user-management/service-remove.js).
