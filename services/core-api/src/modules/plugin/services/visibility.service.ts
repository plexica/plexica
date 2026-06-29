// services/visibility.service.ts
// Plugin visibility: tenant default + per-workspace override (ADR-018).
// Uses Redis-backed cache with TTL for multi-instance consistency.

import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';

interface VisibilityRecord {
  installId: string;
  workspaceId: string;
  isEnabled: boolean;
  isOverride: boolean;
}

const CACHE_PREFIX = 'plugin:vis:';
const CACHE_TTL_SECONDS = 60; // 60s TTL — balances freshness with performance

function cacheKey(installId: string, workspaceId: string): string {
  return `${CACHE_PREFIX}${installId}:${workspaceId}`;
}

async function getCached(installId: string, workspaceId: string): Promise<boolean | null> {
  try {
    const raw = await redis.get(cacheKey(installId, workspaceId));
    if (raw === null) return null;
    return raw === '1';
  } catch {
    return null; // Redis unavailable — fall through to DB
  }
}

async function setCache(installId: string, workspaceId: string, visible: boolean): Promise<void> {
  try {
    await redis.setex(cacheKey(installId, workspaceId), CACHE_TTL_SECONDS, visible ? '1' : '0');
  } catch {
    // Non-blocking cache miss — queries hit DB
  }
}

async function invalidateCache(installId?: string): Promise<void> {
  try {
    if (installId) {
      // Scan and delete keys matching the installId prefix
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}${installId}:*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    } else {
      // Clear all visibility cache keys
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    }
  } catch {
    // Non-blocking — stale cache will expire via TTL
  }
}

/**
 * Returns whether a plugin is visible in a workspace.
 * Resolution: Redis cache → workspace override → tenant default → enabled.
 */
export async function isPluginVisible(
  tx: { pluginInstallation: { findUnique: Function }; pluginWorkspaceVisibility: { findUnique: Function } },
  installId: string,
  workspaceId: string
): Promise<boolean> {
  // Check Redis cache first (shared across instances, TTL-bound)
  const cached = await getCached(installId, workspaceId);
  if (cached !== null) return cached;

  // Check workspace override
  const override = await tx.pluginWorkspaceVisibility.findUnique({
    where: { installId_workspaceId: { installId, workspaceId } },
  });

  if (override?.isOverride) {
    await setCache(installId, workspaceId, override.isEnabled);
    return override.isEnabled;
  }

  // Fall back to tenant default
  const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
  const visible = installation?.tenantDefaultVisibility === 'enabled';
  await setCache(installId, workspaceId, visible);
  return visible;
}

export { invalidateCache as clearVisibilityCache };

/**
 * Sets workspace-level visibility with override tracking.
 * Invalidates cache so subsequent reads get fresh data.
 */
export async function setWorkspaceVisibility(
  tx: { pluginWorkspaceVisibility: { upsert: Function } },
  installId: string,
  workspaceId: string,
  isEnabled: boolean,
  updatedBy: string
): Promise<void> {
  await tx.pluginWorkspaceVisibility.upsert({
    where: { installId_workspaceId: { installId, workspaceId } },
    create: { installId, workspaceId, isEnabled, isOverride: true, updatedBy },
    update: { isEnabled, isOverride: true, updatedBy },
  });

  // Update cache and invalidate for consistency
  await setCache(installId, workspaceId, isEnabled);
  logger.info({ installId, workspaceId, isEnabled }, 'Workspace visibility updated');
}
