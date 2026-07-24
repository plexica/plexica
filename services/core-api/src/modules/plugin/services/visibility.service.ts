// services/visibility.service.ts
// Plugin visibility: tenant default + per-workspace override (ADR-018).
// Uses Redis-backed cache with TTL for multi-instance consistency.

import { logger } from '../../../lib/logger.js';
import { redis } from '../../../lib/redis.js';

// @ts-ignore — generated at build time via 'pnpm db:generate'; not present in git checkout
import type { Prisma } from '../../../../prisma/generated/tenant-client/index.js';

const CACHE_PREFIX = 'plugin:vis:';
const CACHE_TTL_SECONDS = 60; // 60s TTL — balances freshness with performance

function cacheKey(installId: string, workspaceId: string): string {
  return `${CACHE_PREFIX}${installId}:${workspaceId}`;
}

async function getCached(installId: string, workspaceId: string): Promise<boolean | null> {
  try {
    const raw = await redis.get(cacheKey(installId, workspaceId));
    if (raw === null) return null;
    // Positive decisions are never cached: failed invalidation must not retain
    // access after a workspace or installation is disabled.
    return raw === '0' ? false : null;
  } catch {
    return null; // Redis unavailable — fall through to DB
  }
}

async function setCache(installId: string, workspaceId: string, visible: boolean): Promise<void> {
  try {
    if (visible) await redis.del(cacheKey(installId, workspaceId));
    else await redis.setex(cacheKey(installId, workspaceId), CACHE_TTL_SECONDS, '0');
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
  if (!installation || installation.status !== 'active') {
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

export interface PluginVisibilityEntry {
  workspaceId: string;
  workspaceName: string;
  isEnabled: boolean;
  isOverride: boolean;
  updatedAt: Date | null;
}

export async function getVisibilityEntries(
  tx: Prisma.TransactionClient,
  installId: string
): Promise<PluginVisibilityEntry[]> {
  const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
  if (!installation) return [];
  const [workspaces, overrides] = await Promise.all([
    tx.workspace.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    tx.pluginWorkspaceVisibility.findMany({ where: { installId, isOverride: true } }),
  ]);
  const overrideByWorkspace = new Map(overrides.map((item) => [item.workspaceId, item]));
  const defaultEnabled = installation.tenantDefaultVisibility === 'enabled';
  return workspaces.map((workspace) => {
    const override = overrideByWorkspace.get(workspace.id);
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      isEnabled: override?.isEnabled ?? defaultEnabled,
      isOverride: override !== undefined,
      updatedAt: override?.updatedAt ?? null,
    };
  });
}

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
