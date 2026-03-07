/**
 * PluginTargetsService — Prometheus file-SD target management
 *
 * Spec 012, Task T012-09 (ADR-027, ADR-030).
 *
 * Maintains a JSON file at `infrastructure/observability/prometheus/targets/plugins.json`
 * that Prometheus reads via `file_sd_configs` to discover active plugin scrape targets.
 *
 * The Plugin model has no `containerHost` or `metricsPort` columns (confirmed by
 * schema.prisma). Container hostnames follow the convention `plugin-<pluginId>` with
 * a fixed metrics port of 8080 — the same pattern used by the health-check proxy in
 * plugin-v1.ts (`resolveContainerBaseUrl`).
 *
 * Called from:
 *   - PluginLifecycleService.activatePlugin()  → adds target
 *   - PluginLifecycleService.deactivatePlugin() → removes target
 */

import { promises as fs } from 'fs';
import * as pathLib from 'path';
import { db } from '../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';
import { logger } from '../lib/logger.js';

// Port that plugin containers expose for Prometheus scraping (ADR-030 / ADR-019 convention).
const PLUGIN_METRICS_PORT = 8080;

// Absolute path to the file-SD JSON written for Prometheus.
const TARGETS_FILE_PATH = pathLib.resolve(
  process.cwd(),
  'infrastructure/observability/prometheus/targets/plugins.json'
);

interface FileSDTarget {
  targets: string[];
  labels: Record<string, string>;
}

export class PluginTargetsService {
  private static instance: PluginTargetsService;

  static getInstance(): PluginTargetsService {
    if (!PluginTargetsService.instance) {
      PluginTargetsService.instance = new PluginTargetsService();
    }
    return PluginTargetsService.instance;
  }

  /**
   * Rebuild the file-SD JSON from the current set of ACTIVE plugins in the DB.
   * Writes atomically to avoid a partial read by Prometheus during the refresh window.
   */
  async rebuildTargetsFile(): Promise<void> {
    const activePlugins = await db.plugin.findMany({
      where: { lifecycleStatus: PluginLifecycleStatus.ACTIVE },
      select: { id: true, name: true },
    });

    const targets: FileSDTarget[] = activePlugins.map((plugin) => ({
      targets: [`plugin-${plugin.id}:${PLUGIN_METRICS_PORT}`],
      labels: {
        plugin_id: plugin.id,
        plugin_name: plugin.name,
        job: 'plugins',
      },
    }));

    const json = JSON.stringify(targets, null, 2);

    // Ensure the targets directory exists (it may not in CI / fresh clone).
    await fs.mkdir(pathLib.dirname(TARGETS_FILE_PATH), { recursive: true });

    // Atomic write: write to a temp file then rename so Prometheus never sees a partial file.
    const tmp = `${TARGETS_FILE_PATH}.tmp`;
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, TARGETS_FILE_PATH);

    logger.debug(
      { targetCount: targets.length, path: TARGETS_FILE_PATH },
      'Prometheus plugin targets file updated'
    );
  }

  /**
   * Add a single plugin target then rewrite the file.
   * Called from activatePlugin() immediately before returning.
   */
  async addTarget(pluginId: string): Promise<void> {
    // Rebuild from DB — always authoritative, avoids in-memory drift.
    await this.rebuildTargetsFile();
    logger.debug({ pluginId }, 'Added Prometheus scrape target for plugin');
  }

  /**
   * Remove a single plugin target then rewrite the file.
   * Called from deactivatePlugin() immediately before returning.
   */
  async removeTarget(pluginId: string): Promise<void> {
    await this.rebuildTargetsFile();
    logger.debug({ pluginId }, 'Removed Prometheus scrape target for plugin');
  }
}

/** Singleton — import directly rather than calling getInstance(). */
export const pluginTargetsService = PluginTargetsService.getInstance();
