// engine.ts
// ABAC evaluation engine — tree-walk with Redis caching.
// Implements: FR-013, FR-014, FR-015, FR-018, NFR-01 (< 50ms P95), ADR-003


import { logger } from '../../lib/logger.js';

import { POLICY_MAP, TENANT_LEVEL_ACTIONS } from './policies.js';
import {
  ROLE_HIERARCHY,
  type AbacContext,
  type AbacDecision,
  type WorkspaceRole,
} from './types.js';
import { getMembership, getPluginActionOverride } from './engine-helpers.js';

import type { Redis } from 'ioredis';

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
  tenantDb: unknown, // tenant-schema PrismaClient, type-erased pending prisma generate
  redis: Redis
): Promise<AbacDecision> {
  // 1. Tenant admin implicit bypass
  if (ctx.isTenantAdmin === true) {
    return {
      allowed: true,
      reason: 'tenant admin bypass',
      decision: 'allow',
      matchedRule: ctx.action,
    };
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
    logger.warn({ action: ctx.action }, 'Unknown ABAC action — denying by default');
    return { allowed: false, reason: 'unknown action', decision: 'deny' };
  }

  // 4. Check for plugin action role override
  const pluginOverride = await getPluginActionOverride(ctx, tenantDb);
  if (pluginOverride !== null) {
    requiredRole = pluginOverride;
  }

  // 5. Get workspace membership (with Redis cache)
  const membership = await getMembership(ctx, tenantDb, redis);
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
 * Invalidate the ABAC cache for a specific user/workspace combination.
 * Call this when a member is added, removed, or their role changes.
 */
export async function invalidateAbacCache(
  tenantSlug: string,
  userId: string,
  workspaceId: string,
  redis: Redis
): Promise<void> {
  const key = `abac:${tenantSlug}:${userId}:${workspaceId}`;
  await redis.del(key);
  logger.debug({ tenantSlug, userId, workspaceId }, 'ABAC cache invalidated');
}
