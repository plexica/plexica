// Integration coverage for the removeUser() ABAC revocation fix: without it,
// deleting workspace_member rows leaves the cached role authoritative for up
// to ABAC_CACHE_TTL_SECONDS (default 300s), and none of the other gates close
// in time — the JWT stays signature-valid until `exp` (no introspection) and
// the Keycloak disable / session termination are best-effort.
//
// This suite fails if anyone removes the revocation call
// (revokeAbacMemberships()) from removeUser() in service-remove.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evaluate } from '../modules/abac/engine.js';
import { membershipCacheKey } from '../modules/abac/engine-helpers.js';
import { removeUser } from '../modules/user-management/service-remove.js';

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

const TENANT_SLUG = 'test-abac-cache-removal';
const OWNER_USER_ID = '00000000-abac-0003-0000-000000000001';
// Principal removed from the tenant by the test below.
const REMOVED_USER_ID = '00000000-abac-0003-0000-0000000000ff';
const allOk = (await isDbReachable()) && (await isRedisReachable());
let server: FastifyInstance;
let ctx: TenantContext;
let redis: Redis;

beforeAll(async () => {
  if (!allOk) return;
  ctx = (await seedTenant(TENANT_SLUG)).tenantContext;
  await seedUserProfile(ctx, OWNER_USER_ID, `${OWNER_USER_ID}@test.plexica.io`, null, OWNER_USER_ID);
  await seedUserProfile(
    ctx,
    REMOVED_USER_ID,
    `${REMOVED_USER_ID}@test.plexica.io`,
    null,
    REMOVED_USER_ID
  );
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
    userId: REMOVED_USER_ID,
    workspaceId,
    tenantSlug: ctx.slug,
    action,
    isTenantAdmin: false,
  };
}

describe('removeUser ABAC revocation', () => {
  it.skipIf(!allOk)(
    'tombstones every warmed workspace and denies subsequent access on all of them',
    async () => {
      const wsA = await seedWorkspace(ctx, 'Revoke-WS-A', OWNER_USER_ID);
      const wsB = await seedWorkspace(ctx, 'Revoke-WS-B', OWNER_USER_ID);
      await seedWorkspaceMember(ctx, wsA.id, REMOVED_USER_ID, 'admin');
      await seedWorkspaceMember(ctx, wsB.id, REMOVED_USER_ID, 'member');

      const keyFor = (workspaceId: string): string =>
        membershipCacheKey({ tenantSlug: ctx.slug, userId: REMOVED_USER_ID, workspaceId });
      const read = async (workspaceId: string): Promise<unknown> =>
        JSON.parse((await redis.get(keyFor(workspaceId))) ?? 'null');

      // Warm the cache exactly as a real ABAC-gated request would — for BOTH
      // workspaces, so the revocation must clear both, not just the first.
      const tenantDb = buildTenantClientForCtx(ctx);
      try {
        for (const id of [wsA.id, wsB.id]) {
          await redis.del(keyFor(id));
          await evaluate(context(id, 'workspace:read'), tenantDb, redis);
        }
      } finally {
        await tenantDb.$disconnect();
      }

      expect(await read(wsA.id)).toEqual({ role: 'admin' });
      expect(await read(wsB.id)).toEqual({ role: 'member' });

      // Keycloak calls inside removeUser are best-effort — this fixture realm
      // does not exist, the failures are logged and must not fail the removal.
      await removeUser(REMOVED_USER_ID, OWNER_USER_ID, { reassignments: [] }, ctx);

      // Every warmed key must now be a tombstone, not merely stale or deleted:
      // a deleted key would be repopulated from the DB by the next reader, and
      // a reader that read the DB *before* the removal could republish the
      // role. Checking BOTH keys guards against a revocation that only
      // handles the first membership returned by removeAllMemberships().
      expect(await read(wsA.id)).toEqual({ role: null });
      expect(await read(wsB.id)).toEqual({ role: null });

      // And the cached tombstone must actually deny access — for EVERY
      // workspace the user was removed from, not just the first one.
      const verifyDb = buildTenantClientForCtx(ctx);
      try {
        for (const id of [wsA.id, wsB.id]) {
          const decision = await evaluate(context(id, 'workspace:read'), verifyDb, redis);
          expect(decision.allowed).toBe(false);
        }
      } finally {
        await verifyDb.$disconnect();
      }
    }
  );
});
