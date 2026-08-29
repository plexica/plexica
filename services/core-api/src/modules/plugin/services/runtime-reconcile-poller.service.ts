// services/runtime-reconcile-poller.service.ts
// Periodic reconciliation of plugin runtimes (consumer groups + credentials).
//
// reconcilePluginRuntimes() runs once at bootstrap (bootstrap.ts), restoring
// Kafka subscriptions that live in memory. But a consumer group that fails
// AFTER bootstrap — e.g. PLUGIN_CONSUMER_START at install time when Redpanda
// is still provisioning the plugin topic — leaves the installation stuck in
// 'degraded' with no retry: the health poller only probes container status and
// never recreates the consumer. This poller re-runs the reconcile on a longer
// interval so degraded installations self-heal without a core restart.
//
// Owned by bootstrap.startBackgroundServices() / stopBackgroundServices() via
// modules/plugin/index.ts, mirroring startPeriodicHealthPolling.

import { logger } from '../../../lib/logger.js';
import { reconcilePluginRuntimes } from './runtime-recovery.service.js';

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingCycle: Promise<void> | null = null;

async function runReconcileCycle(): Promise<void> {
  try {
    const { restored, failed } = await reconcilePluginRuntimes();
    if (restored > 0 || failed > 0) {
      logger.info({ restored, failed }, 'Periodic plugin runtime reconciliation');
    }
  } catch (err) {
    // reconcilePluginRuntimes never throws (per-item try/catch), but guard
    // anyway so a future regression cannot kill the interval silently.
    logger.error({ err }, 'Periodic plugin runtime reconciliation failed');
  }
}

/**
 * Starts the reconciler. Interval is intentionally longer than the health
 * poller: reconciliation iterates every active tenant and may restart
 * containers when credentials rotated, so a 5-minute cadence is the safe
 * default. The interval is unref'd (mirrors the health poller).
 */
export function startPeriodicRuntimeReconcile(intervalMs = 300_000): void {
  if (pollingInterval !== null) return;

  pollingInterval = setInterval(() => {
    // Skip the tick if the previous cycle is still running.
    if (pollingCycle) return;
    pollingCycle = runReconcileCycle().finally(() => {
      pollingCycle = null;
    });
  }, intervalMs);
  pollingInterval.unref();

  logger.info({ intervalMs }, 'Periodic plugin runtime reconciliation started');
}

/**
 * Stops the reconciler and awaits the in-flight cycle, so no DB or Kafka call
 * is still pending when shutdown moves on to closing those connections.
 */
export async function stopPeriodicRuntimeReconcile(): Promise<void> {
  if (pollingInterval === null && pollingCycle === null) return;

  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  await pollingCycle?.catch(() => undefined);
  pollingCycle = null;
  logger.info('Periodic plugin runtime reconciliation stopped');
}