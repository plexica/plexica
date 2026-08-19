// services/kafka-status.service.ts
// Aggregates Kafka consumer lag and DLQ size per plugin (Spec 005, S5-900).
//
// Returns the canonical KafkaStatusResponse shape defined in @plexica/api-types
// (ADR-029). The route handler calls this service — no inline implementation
// in the route, no divergent shapes.

import { config } from '../../../lib/config.js';
import { getLagMetrics } from '../../plugin/events/lag-metrics.service.js';
import { getActiveConsumerGroups, CONSUMER_GROUP_PREFIX } from '../../plugin/events/consumer-manager.service.js';

import type { PrismaClient } from '@prisma/client';
import type { KafkaStatusResponse, KafkaConsumer } from '@plexica/api-types';

export async function getKafkaStatus(
  prisma: PrismaClient
): Promise<KafkaStatusResponse> {
  const lagMetrics = getLagMetrics();

  const consumers: KafkaConsumer[] = lagMetrics.map((entry) => ({
    pluginSlug: entry.pluginSlug,
    tenantSlug: entry.tenantSlug,
    lag: entry.lag,
    topic: `plexica.plugin.${entry.pluginSlug}`,
  }));

  const totalLag = consumers.reduce((sum, c) => sum + c.lag, 0);

  const dlqDepth = await prisma.deadLetterQueue.count({
    where: { status: 'pending' },
  });

  const activeGroups = getActiveConsumerGroups().filter((g) =>
    g.startsWith(CONSUMER_GROUP_PREFIX),
  );

  return {
    brokers: config.KAFKA_BROKERS.split(',').map((s) => s.trim()),
    consumers,
    totalLag,
    dlqDepth,
    activeConsumerGroups: activeGroups.length,
  };
}
