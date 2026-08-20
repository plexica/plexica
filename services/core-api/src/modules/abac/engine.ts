// engine.ts
// ABAC evaluation engine — tree-walk with Redis caching.
// Implements: FR-013, FR-014, FR-015, FR-018, NFR-01 (< 50ms P95), ADR-003


import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

import { POLICY_MAP, TENANT_LEVEL_ACTIONS } from './policies.js';
import {
  ROLE_HIERARCHY,
  type AbacContext,
  type AbacDecision,
  type WorkspaceRole,
} from './types.js';
import {
  getMembership,
  getPluginActionOverride,
  getPluginActionDefaultRole,
  membershipCacheKey,
  type CachedMembership,
} from './engine-helpers.js';

import type { Redis } from 'ioredis';
import type { TenantDbClient } from '../../lib/tenant-database.js';

/**
 * The decision produced for a tenant admin. Exported so the ABAC middleware can
 * short-circuit BEFORE acquiring a tenant Prisma client without duplicating the
 * decision shape (see middleware/abac.ts). evaluate() returns exactly this.
 */
export function tenantAdminBypassDecision(action: string): AbacDecision {
  return {
    allowed: true,
    reason: 'tenant admin bypass',
    decision: 'allow',
    matchedRule: action,
  };
}

/**
 * Evaluate whether the requesting user is permitted to perform `ctx.action`
 * on the workspace identified by `ctx.workspaceId`.
 *
 * Decision order:
 *   1. Tenant admin implicit bypass — allowed for everything.
 *   2. Tenant-level actions without isTenantAdmin — deny.
 *   3. Static policy lookup (POLICY_MAP) — unknown action → deny.
 *   4. Plugin action role override (workspace_role_action table).
 *   5. Redis-cached workspace membership lookup.
 *   6. Role hierarchy comparison.
 */
export async function evaluate(
  ctx: AbacContext,
  tenantDb: TenantDbClient,
  redis: Redis
): Promise<AbacDecision> {
  // 1. Tenant admin implicit bypass
  if (ctx.isTenantAdmin === true) {
    return tenantAdminBypassDecision(ctx.action);
  }

  // 2. Tenant-level actions require tenant admin
  if (TENANT_LEVEL_ACTIONS.has(ctx.action)) {
    return {
      allowed: false,
      reason: 'tenant-level action requires tenant admin',
      decision: 'deny',
    };
  }

  // 3. Look up required role from static policy
  let requiredRole: WorkspaceRole | undefined = POLICY_MAP.get(ctx.action);
  if (requiredRole === undefined) {
    // Plugin actions (e.g. `crm:access`, `crm:contact:read`) are dynamic — they
    // are not in the static POLICY_MAP. When pluginActionKey is set, look up the
    // defaultRole from the tenant's action_registry. If the action isn't
    // registered either, default to `viewer` (baseline workspace-member access
    // to an installed plugin — per-action restrictions are enforced by the
    // plugin backend via X-Plexica-User-Role and by 3-part action overrides).
    if (ctx.pluginActionKey !== undefined) {
      const registered = await getPluginActionDefaultRole(ctx, tenantDb);
      requiredRole = registered ?? 'viewer';
    } else {
      logger.warn({ action: ctx.action }, 'Unknown ABAC action — denying by default');
      return { allowed: false, reason: 'unknown action', decision: 'deny' };
    }
  }

  // 4. Check for plugin action role override
  const pluginOverride = await getPluginActionOverride(ctx, tenantDb);
  if (pluginOverride !== null) {
    requiredRole = pluginOverride;
  }

  // 5. Use an authoritative role when the caller already verified membership
  // in its current DB operation; otherwise use the shared membership cache.
  const membership = ctx.verifiedWorkspaceRole === undefined
    ? await getMembership(ctx, tenantDb, redis)
    : { role: ctx.verifiedWorkspaceRole };
  if (membership.role === null) {
    return { allowed: false, reason: 'not a workspace member', decision: 'deny' };
  }

  // 6. Compare role hierarchy
  const userLevel = ROLE_HIERARCHY[membership.role];
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  const allowed = userLevel >= requiredLevel;

  return {
    allowed,
    decision: allowed ? 'allow' : 'deny',
    reason: `role=${membership.role}, required=${requiredRole}`,
    matchedRule: ctx.action,
  };
}

/**
 * Write-through update of the ABAC membership cache — the ONLY supported way to
 * mutate a membership cache entry.
 *
 * Publishes the post-mutation membership (role `null` = no longer a member)
 * with a fresh ABAC_CACHE_TTL_SECONDS. Combined with the `SET … NX` populate in
 * getMembership(), this closes the reader-vs-writer revocation race: a reader
 * holding a pre-mutation role read from the DB can no longer overwrite the
 * published value.
 *
 * WHY THERE IS NO invalidateAbacCache() ANY MORE
 * ----------------------------------------------
 * A DEL-based invalidation existed for workspace archive/restore/reparent. It
 * was removed for two reasons:
 *
 *   1. It was semantically unnecessary — this cache stores *membership*, and
 *      those operations do not touch `workspace_member` rows at all. Workspace
 *      status is enforced by the service layer (WorkspaceArchivedError), not by
 *      the ABAC membership cache.
 *   2. It actively reopened the revocation window it was supposed to help with:
 *
 *        reader  GET → MISS
 *        reader  findUnique → role='admin'
 *        writer  removeMember: DELETE row; SETEX {role:null}
 *        other   archiveWorkspace → DEL key            ← drops the tombstone
 *        reader  SET NX → key absent → SUCCEEDS, republishes 'admin' for a TTL
 *
 * With DEL gone, the only way a key disappears is TTL expiry, so the sequence
 * above is no longer reachable.
 *
 * KNOWN RESIDUAL — writer-vs-writer ordering is NOT fenced
 * --------------------------------------------------------
 * `SET NX` is not a fencing token: it means "nobody wrote since I looked", not
 * "my value is newer". Two concurrent mutations on the same (user, workspace)
 * can therefore still publish out of DB order:
 *
 *   w1 (addMember):    INSERT row role='admin'
 *   w2 (removeMember): DELETE row
 *   w2:                SETEX {role:null}
 *   w1:                SETEX {role:'admin'}   ← stale, survives up to one TTL
 *
 * A real fix needs a monotonic fencing token (versioned payload + a Lua CAS
 * that rejects an older version). That is deliberately NOT implemented: it adds
 * a second Redis key per membership, a Lua script and an extra round-trip on
 * the hot read path, to close a window that requires two administrators
 * mutating the same membership row within milliseconds of each other — while
 * the fail-closed backstops (Keycloak session termination, and the soft-delete
 * check in middleware/user-profile-resolver.ts) already bound the blast radius
 * independently of Redis. Revisit with an ADR if that trade-off changes.
 *
 * `isTenantAdmin` on the input is accepted but ignored and never persisted —
 * see CachedMembership in engine-helpers.ts.
 */
export async function setAbacMembership(
  tenantSlug: string,
  userId: string,
  workspaceId: string,
  membership: CachedMembership,
  redis: Redis
): Promise<void> {
  const key = membershipCacheKey({ tenantSlug, userId, workspaceId });
  const payload: CachedMembership = { role: membership.role };
  await redis.setex(key, config.ABAC_CACHE_TTL_SECONDS, JSON.stringify(payload));
  logger.debug({ tenantSlug, workspaceId, role: payload.role }, 'ABAC cache written through');
}
