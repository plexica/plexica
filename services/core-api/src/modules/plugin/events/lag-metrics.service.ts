// events/lag-metrics.service.ts
// Prometheus metrics for consumer lag per plugin installation.

import { logger } from '../../../lib/logger.js';

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
  lagEntries.set(installId, { pluginSlug, tenantSlug, installId, lag, lastUpdated: new Date() });
}

export function getLagMetrics(): LagEntry[] {
  return Array.from(lagEntries.values());
}

export function clearLagMetrics(installId: string): void {
  lagEntries.delete(installId);
}

async function pollLag(
  installId: string,
  pluginSlug: string,
  tenantSlug: string,
  topics: string[]
): Promise<void> {
  try {
    const { withKafkaAdmin, getConsumerGroupLag } = await import('../../../lib/kafka-admin.js');
    const groupId = `plugin-${installId}-${tenantSlug}`;
    const lag = await withKafkaAdmin((admin) => getConsumerGroupLag(admin, groupId, topics), {
      connectTimeoutMs: 5000,
    });
    updateLag(installId, pluginSlug, tenantSlug, lag);
  } catch {
    logger.warn({ code: 'KAFKA_LAG_POLL_FAILED', installId }, 'Lag polling failed');
  }
}

export function startLagMonitoring(
  installId: string,
  pluginSlug: string,
  tenantSlug: string,
  topics: string[] = [],
  intervalMs = 30_000
): void {
  if (monitoringTimers.has(installId)) return;
  logger.info({ installId, intervalMs }, 'Lag monitoring started');
  void pollLag(installId, pluginSlug, tenantSlug, topics);
  const timer = setInterval(
    () => void pollLag(installId, pluginSlug, tenantSlug, topics),
    intervalMs
  );
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
