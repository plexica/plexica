/**
 * ModuleFederationRegistryService
 * T004-13: Store and retrieve Module Federation remoteEntry URLs for plugins.
 *
 * The frontend shell calls `GET /api/v1/plugins/remotes` (no auth) on startup
 * to discover which plugin remote modules to load dynamically (ADR-011).
 *
 * Constitution Art. 3.3: All database access via Prisma ORM.
 * Constitution Art. 6.3: Pino JSON logging.
 */

import { db } from '../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';
import { logger } from '../lib/logger.js';
import type { Logger } from 'pino';

export interface RemoteEntry {
  pluginId: string;
  remoteEntryUrl: string;
  routePrefix: string | null;
}

export class ModuleFederationRegistryService {
  private logger: Logger;

  constructor(customLogger?: Logger) {
    this.logger = customLogger ?? logger;
  }

  /**
   * Store (or update) the remoteEntry URL and optional route prefix for a plugin.
   * Called by PluginLifecycleService.installPlugin() when the manifest declares
   * a `frontend.remoteEntry` URL.
   */
  async registerRemoteEntry(
    pluginId: string,
    remoteEntryUrl: string,
    routePrefix?: string | null
  ): Promise<void> {
    this.logger.info(
      { pluginId, remoteEntryUrl, routePrefix },
      'T004-13: Registering Module Federation remote entry'
    );

    await db.plugin.update({
      where: { id: pluginId },
      data: {
        remoteEntryUrl,
        frontendRoutePrefix: routePrefix ?? null,
      },
    });
  }

  /**
   * Return all plugins whose lifecycleStatus is ACTIVE and that have a
   * non-null remoteEntryUrl. Used by the public `GET /api/v1/plugins/remotes`
   * endpoint so the frontend shell can discover remote modules on startup.
   */
  async getActiveRemoteEntries(): Promise<RemoteEntry[]> {
    const plugins = await db.plugin.findMany({
      where: {
        lifecycleStatus: PluginLifecycleStatus.ACTIVE,
        remoteEntryUrl: { not: null },
      },
      select: {
        id: true,
        remoteEntryUrl: true,
        frontendRoutePrefix: true,
      },
    });

    // remoteEntryUrl is guaranteed non-null by the WHERE filter, but TypeScript
    // still sees it as `string | null` from the generated types — filter defensively.
    return plugins
      .filter((p): p is typeof p & { remoteEntryUrl: string } => p.remoteEntryUrl !== null)
      .map((p) => ({
        pluginId: p.id,
        remoteEntryUrl: p.remoteEntryUrl,
        routePrefix: p.frontendRoutePrefix,
      }));
  }
}

export const moduleFederationRegistryService = new ModuleFederationRegistryService();
