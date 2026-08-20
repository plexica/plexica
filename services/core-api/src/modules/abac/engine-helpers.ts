// engine-helpers.ts
// Internal helpers for the ABAC engine: membership cache and plugin overrides.
// Implements: FR-013, FR-014, FR-015, ADR-003

import { config } from '../../lib/config.js';

import type { Redis } from 'ioredis';
import type { TenantDbClient } from '../../lib/tenant-database.js';
import type { AbacContext, WorkspaceRole } from './types.js';

/**
 * Shape stored in Redis for workspace membership.
 *
 * `isTenantAdmin` USED to be part of the payload. It was provably always
 * `false`: it is a property of the *requesting principal*, not of the
 * membership row, and evaluate() short-circuits tenant admins before
 * getMembership() is ever reached (engine.ts §1). It is no longer serialized
 * and no longer read.
 *
 * It survives here as an optional, ignored field purely for source
 * compatibility with call sites that still pass `isTenantAdmin: false` in an
 * object literal (TypeScript excess-property checks would reject them
 * otherwise). Do not read it, do not rely on it — new code must omit it.
 *
 * @deprecated `isTenantAdmin` — ignored, never persisted, never read.
 */
export interface CachedMembership {
  role: WorkspaceRole | null; // null = not a member
  isTenantAdmin?: boolean;
}

/**
 * Single source of truth for the workspace-membership Redis cache key.
 *
 * Every path that touches the cache — getMembership() and setAbacMembership() —
 * MUST derive its key here. This only guarantees that the key FORMAT cannot
 * drift between readers and writers; it says nothing about staleness. Staleness
 * bounds are documented on getMembership().
 */
export function membershipCacheKey(
  ctx: Pick<AbacContext, 'tenantSlug' | 'userId' | 'workspaceId'>
): string {
  return `abac:${ctx.tenantSlug}:${ctx.userId}:${ctx.workspaceId}`;
}

/**
 * Returns workspace membership for the user, using Redis as a cache.
 * Cache key: abac:<tenantSlug>:<userId>:<workspaceId>
 * TTL controlled by ABAC_CACHE_TTL_SECONDS env var.
 *
 * CONCURRENCY — what `SET … EX … NX` does and does NOT guarantee.
 *
 * This is a read-then-write path, so a membership mutation can interleave
 * between the DB read and the cache write:
 *
 *   reader:  GET → MISS
 *   reader:  findUnique → role=admin
 *   writer:                DELETE membership row
 *   writer:                write-through SETEX role=null
 *   reader:  populate cache with the now-REVOKED role=admin   ← the bug
 *
 * NX makes the reader's late populate a no-op whenever a value already exists
 * for the key. Every membership mutation is write-through (unconditional
 * SETEX of the post-mutation value) and NOTHING in the codebase deletes a
 * membership key any more — invalidateAbacCache() was removed precisely
 * because a DEL between a writer's SETEX and a reader's SET NX would let the
 * reader resurrect the revoked role. See engine.ts § setAbacMembership.
 *
 * With that invariant the reader/writer race above is closed: for the reader's
 * SET NX to succeed after the writer's SETEX, the key would have to disappear
 * in the sub-millisecond gap between the two commands, and the only remaining
 * removal mechanism is TTL expiry of a key the writer just wrote with a fresh
 * ABAC_CACHE_TTL_SECONDS.
 *
 * RESIDUAL (documented, not fixed — see engine.ts § setAbacMembership):
 * writer-vs-writer ordering is NOT fenced. Two concurrent mutations on the same
 * (user, workspace) can publish out of DB order:
 *
 *   w1 (addMember):    INSERT row role=admin
 *   w2 (removeMember): DELETE row
 *   w2:                SETEX role=null
 *   w1:                SETEX role=admin        ← stale, wins for a full TTL
 *
 * This requires two administrators mutating the same membership within the same
 * few milliseconds. Closing it needs a real fencing token (versioned payload +
 * Lua CAS), which is deliberately not implemented — see the ADR note in
 * engine.ts.
 *
 * @param tenantDb - Tenant-schema Prisma client (plain or transaction client)
 */
export async function getMembership(
  ctx: AbacContext,
  tenantDb: TenantDbClient,
  redis: Redis
): Promise<CachedMembership> {
  const key = membershipCacheKey(ctx);
  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as CachedMembership;
  }

  const member = await tenantDb.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: ctx.userId } },
    select: { role: true },
  });

  const membership: CachedMembership = {
    role: (member?.role as WorkspaceRole | null) ?? null,
  };

  // NX: never overwrite a value published by a concurrent membership mutation.
  await redis.set(key, JSON.stringify(membership), 'EX', config.ABAC_CACHE_TTL_SECONDS, 'NX');
  return membership;
}

/**
 * Returns the plugin-overridden required role for a plugin action, or null
 * if no override is configured for this workspace/action combination.
 */
export async function getPluginActionOverride(
  ctx: AbacContext,
  tenantDb: TenantDbClient
): Promise<WorkspaceRole | null> {
  if (ctx.pluginActionKey === undefined) return null;

  const override = await tenantDb.workspaceRoleAction.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      actionKey: ctx.pluginActionKey,
      isOverridden: true,
    },
    select: { requiredRole: true },
  });

  return (override?.requiredRole as WorkspaceRole | null) ?? null;
}

/**
 * Returns the defaultRole for a plugin action from the tenant's
 * action_registry, or null if the action is not registered. Used by the engine
 * when a plugin action key (e.g. `crm:access`, `crm:contact:read`) is not in
 * the static POLICY_MAP — plugin actions are dynamic, seeded at install time.
 */
export async function getPluginActionDefaultRole(
  ctx: AbacContext,
  tenantDb: TenantDbClient
): Promise<WorkspaceRole | null> {
  if (ctx.pluginActionKey === undefined) return null;
  const action = await tenantDb.actionRegistry.findFirst({
    where: { actionKey: ctx.pluginActionKey },
    select: { defaultRole: true },
  });
  return (action?.defaultRole as WorkspaceRole | null) ?? null;
}
