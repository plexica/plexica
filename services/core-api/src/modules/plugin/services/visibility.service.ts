// services/visibility.service.ts
// Plugin visibility: tenant default + per-workspace override (ADR-018).
// Uses Redis-backed cache with TTL for multi-instance consistency.

import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';

import type { Prisma } from '../../../../generated/tenant-client/index.js';

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

const MAX_SCAN_KEYS = 1000;

async function invalidateCache(installId?: string): Promise<void> {
  try {
    const pattern = installId ? `${CACHE_PREFIX}${installId}:*` : `${CACHE_PREFIX}*`;
    let cursor = '0';
    let totalKeys = 0;
    const pipeline = redis.pipeline();

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      totalKeys += keys.length;
      if (keys.length > 0) pipeline.del(...keys);
      if (totalKeys >= MAX_SCAN_KEYS) {
        logger.warn({ installId, totalKeys, maxLimit: MAX_SCAN_KEYS }, 'Visibility cache scan hit MAX_KEYS limit — remaining keys will expire via TTL');
        break;
      }
    } while (cursor !== '0');

    if (totalKeys > 0) await pipeline.exec();
  } catch {
    // Non-blocking — stale cache will expire via TTL
  }
}

/**
 * Returns whether a plugin is visible in a workspace.
 * Resolution: Redis cache → workspace override → tenant default → enabled.
 */
// `tx` is a TenantPrismaClient transaction client (tenant schema) — the plugin
// visibility models (pluginWorkspaceVisibility, pluginInstallation) live in the
// tenant schema, so we use the tenant client's Prisma.TransactionClient type.
export async function isPluginVisible(
  tx: Prisma.TransactionClient,
  installId: string,
  workspaceId: string
): Promise<boolean> {
  // Check Redis cache first (shared across instances, TTL-bound)
  const cached = await getCached(installId, workspaceId);
  if (cached !== null) return cached;

  // Resolve the installation once — needed for both status check and tenant
  // default. A deactivated/uninstalled plugin is never visible regardless of
  // override rows (AC-03: overrides are preserved across deactivate/reactivate,
  // so we must NOT mutate isEnabled on lifecycle transitions).
  const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
  if (!installation || (installation.status !== 'active' && installation.status !== 'degraded')) {
    await setCache(installId, workspaceId, false);
    return false;
  }

  // Check workspace override (preserved across deactivate/reactivate)
  const override = await tx.pluginWorkspaceVisibility.findUnique({
    where: { installId_workspaceId: { installId, workspaceId } },
  });

  if (override?.isOverride) {
    await setCache(installId, workspaceId, override.isEnabled);
    return override.isEnabled;
  }

  // Fall back to tenant default
  const visible = installation.tenantDefaultVisibility === 'enabled';
  await setCache(installId, workspaceId, visible);
  return visible;
}

export { invalidateCache as clearVisibilityCache };

/**
 * Sets workspace-level visibility with override tracking.
 * Invalidates cache so subsequent reads get fresh data.
 */
export async function setWorkspaceVisibility(
  tx: Prisma.TransactionClient,
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
