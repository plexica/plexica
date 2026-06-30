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
 * TODO: Implement Kafka consumer lag polling using admin.describeConsumerGroups().
 * The Prometheus gauge plexica_plugin_consumer_lag already exists — once implemented,
 * call updateLag() with the results from each group to keep the gauge current.
 */
export function startLagMonitoring(installId: string, intervalMs = 30_000): void {
  logger.info({ installId, intervalMs }, 'Lag monitoring started');
  // TODO: Implement Kafka consumer lag polling with admin.describeConsumerGroups()
}

export function stopLagMonitoring(installId: string): void {
  clearLagMetrics(installId);
  logger.info({ installId }, 'Lag monitoring stopped');
}
