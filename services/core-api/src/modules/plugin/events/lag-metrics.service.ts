// events/lag-metrics.service.ts
// Prometheus metrics for consumer lag per plugin installation.

import { logger } from '../../../lib/logger.js';

// Consumer lag tracked in-memory (updated via Kafka consumer events).
// In production, this should use Prometheus client, but for Phase 4
// we expose the data via a simple API endpoint.

interface LagEntry {
  pluginSlug: string;
  tenantSlug: string;
  installId: string;
  lag: number;
  lastUpdated: Date;
}

const lagEntries = new Map<string, LagEntry>();
const monitoringTimers = new Map<string, ReturnType<typeof setInterval>>();

export function updateLag(
  installId: string,
  pluginSlug: string,
  tenantSlug: string,
  lag: number
): void {
  lagEntries.set(installId, {
    pluginSlug,
    tenantSlug,
    installId,
    lag,
    lastUpdated: new Date(),
  });
}

export function getLagMetrics(): LagEntry[] {
  return Array.from(lagEntries.values());
}

export function clearLagMetrics(installId: string): void {
  lagEntries.delete(installId);
}

/**
 * Starts periodic lag reporting for a consumer group.
 * Polls Kafka admin.fetchOffsets() every 30s to compute consumer lag
 * and updates the plexica_plugin_consumer_lag gauge via updateLag().
 */
export function startLagMonitoring(
  installId: string,
  pluginSlug: string,
  tenantSlug: string,
  topics: string[] = [],
  intervalMs = 30_000
): void {
  if (monitoringTimers.has(installId)) return;
  logger.info({ installId, intervalMs }, 'Lag monitoring started');

  const timer = setInterval(async () => {
    try {
      const { getKafkaAdmin } = await import('../../../lib/kafka.js');
      const admin = getKafkaAdmin();
      await admin.connect();
      try {
        const groupId = `plugin-${installId}-${tenantSlug}`;
        const offsets = await admin.fetchOffsets({ groupId, topics });
        let totalLag = 0;
        for (const t of offsets) {
          for (const p of t.partitions ?? []) {
            totalLag += typeof p.offset === 'string' ? Number(p.offset) || 0 : 0;
          }
        }
        updateLag(installId, pluginSlug, tenantSlug, totalLag);
      } finally {
        await admin.disconnect();
      }
    } catch (err) {
      logger.warn({ err, installId }, 'Lag polling failed');
    }
  }, intervalMs);

  monitoringTimers.set(installId, timer);
}

export function stopLagMonitoring(installId: string): void {
  const timer = monitoringTimers.get(installId);
  if (timer) {
    clearInterval(timer);
    monitoringTimers.delete(installId);
  }
  clearLagMetrics(installId);
  logger.info({ installId }, 'Lag monitoring stopped');
}
