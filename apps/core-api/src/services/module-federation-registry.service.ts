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
   *
   * SECURITY: Validates that the URL uses HTTPS and does not target private/
   * link-local addresses (SSRF prevention, Constitution Art. 5.3).
   */
  async registerRemoteEntry(
    pluginId: string,
    remoteEntryUrl: string,
    routePrefix?: string | null
  ): Promise<void> {
    // Runtime SSRF guard: enforce HTTPS and block RFC 1918 / link-local addresses.
    // Schema-level validation (plugin-manifest.schema.ts) catches this at manifest
    // parse time, but this layer defends against callers that bypass the schema.
    let parsed: URL;
    try {
      parsed = new URL(remoteEntryUrl);
    } catch {
      throw new Error(`remoteEntry URL is invalid: ${remoteEntryUrl}`);
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(`remoteEntry URL must use HTTPS, got: ${parsed.protocol}`);
    }

    // Block RFC 1918, loopback, and link-local addresses (SSRF prevention).
    const RFC_1918_OR_LOCAL =
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|\[::1\]$|localhost$)/i;
    if (RFC_1918_OR_LOCAL.test(parsed.hostname)) {
      throw new Error(
        `remoteEntry URL must not target a private or link-local address: ${parsed.hostname}`
      );
    }

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
