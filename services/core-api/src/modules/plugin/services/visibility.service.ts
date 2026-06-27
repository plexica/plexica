// services/visibility.service.ts
// Plugin visibility: tenant default + per-workspace override (ADR-018).

import { logger } from '../../../lib/logger.js';

interface VisibilityRecord {
  installId: string;
  workspaceId: string;
  isEnabled: boolean;
  isOverride: boolean;
}

const visibilityCache = new Map<string, boolean>();

function cacheKey(installId: string, workspaceId: string): string {
  return `${installId}:${workspaceId}`;
}

/**
 * Returns whether a plugin is visible in a workspace.
 * Resolution: workspace override → tenant default → enabled.
 */
export async function isPluginVisible(
  tx: { pluginInstallation: { findUnique: Function }; pluginWorkspaceVisibility: { findUnique: Function } },
  installId: string,
  workspaceId: string
): Promise<boolean> {
  const cached = visibilityCache.get(cacheKey(installId, workspaceId));
  if (cached !== undefined) return cached;

  // Check workspace override
  const override = await tx.pluginWorkspaceVisibility.findUnique({
    where: { installId_workspaceId: { installId, workspaceId } },
  });

  if (override?.isOverride) {
    visibilityCache.set(cacheKey(installId, workspaceId), override.isEnabled);
    return override.isEnabled;
  }

  // Fall back to tenant default
  const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
  const visible = installation?.tenantDefaultVisibility === 'enabled';
  visibilityCache.set(cacheKey(installId, workspaceId), visible);
  return visible;
}

export function clearVisibilityCache(installId?: string): void {
  if (installId) {
    for (const key of visibilityCache.keys()) {
      if (key.startsWith(installId)) visibilityCache.delete(key);
    }
  } else {
    visibilityCache.clear();
  }
}

/**
 * Sets workspace-level visibility with override tracking.
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

  visibilityCache.set(cacheKey(installId, workspaceId), isEnabled);
  logger.info({ installId, workspaceId, isEnabled }, 'Workspace visibility updated');
}
