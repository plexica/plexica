// engine-helpers.ts
// Internal helpers for the ABAC engine: membership cache and plugin overrides.
// Implements: FR-013, FR-014, FR-015, ADR-003

import { config } from '../../lib/config.js';

import type { Redis } from 'ioredis';
import type { AbacContext, WorkspaceRole } from './types.js';

// Shape stored in Redis for workspace membership
export interface CachedMembership {
  role: WorkspaceRole | null; // null = not a member
  isTenantAdmin: boolean;
}

export function membershipCacheKey(ctx: AbacContext): string {
  return `abac:${ctx.tenantSlug}:${ctx.userId}:${ctx.workspaceId}`;
}

/**
 * Returns workspace membership for the user, using Redis as a cache.
 * Cache key: abac:<tenantSlug>:<userId>:<workspaceId>
 * TTL controlled by ABAC_CACHE_TTL_SECONDS env var.
 *
 * @param tenantDb - Tenant-schema Prisma transaction client (type-erased until generated client exists)
 */
export async function getMembership(
  ctx: AbacContext,
  tenantDb: unknown, // tenant-schema PrismaClient, type-erased pending prisma generate
  redis: Redis
): Promise<CachedMembership> {
  const key = membershipCacheKey(ctx);
  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as CachedMembership;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: ctx.userId } },
    select: { role: true },
  });

  const membership: CachedMembership = {
    role: (member?.role as WorkspaceRole | null) ?? null,
    isTenantAdmin: ctx.isTenantAdmin ?? false,
  };

  await redis.setex(key, config.ABAC_CACHE_TTL_SECONDS, JSON.stringify(membership));
  return membership;
}

/**
 * Returns the plugin-overridden required role for a plugin action, or null
 * if no override is configured for this workspace/action combination.
 */
export async function getPluginActionOverride(
  ctx: AbacContext,
  tenantDb: unknown // tenant-schema PrismaClient, type-erased
): Promise<WorkspaceRole | null> {
  if (ctx.pluginActionKey === undefined) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;
  const override = await db.workspaceRoleAction.findFirst({
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
  tenantDb: unknown
): Promise<WorkspaceRole | null> {
  if (ctx.pluginActionKey === undefined) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tenant-schema PrismaClient, type-erased pending prisma generate
  const db = tenantDb as any;
  const action = await db.actionRegistry.findFirst({
    where: { actionKey: ctx.pluginActionKey },
    select: { defaultRole: true },
  });
  return (action?.defaultRole as WorkspaceRole | null) ?? null;
}
