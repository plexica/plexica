// services/kafka-status.service.ts
// Aggregates Kafka consumer lag and DLQ size per plugin (Spec 005, S5-900).
//
// Reuses the in-memory lag-metrics service (Spec 004) — no new Kafka client.
// DLQ counts come from core.dead_letter_queue grouped by plugin_id (ADR-016).
// Returns the shape the frontend KafkaPage expects: { brokers, consumerLags, dlqDepth }.

import { config } from '../../../lib/config.js';
import { getLagMetrics } from '../../plugin/events/lag-metrics.service.js';

import type { PrismaClient } from '@prisma/client';

interface DlqGroupRow {
  pluginId: string | null;
  count: number;
}

interface KafkaConsumerLag {
  pluginSlug: string;
  consumerGroup: string;
  lag: number;
}

interface KafkaStatusResponse {
  brokers: string[];
  consumerLags: KafkaConsumerLag[];
  dlqDepth: number;
}

export async function getKafkaStatus(
  prisma: PrismaClient
): Promise<KafkaStatusResponse> {
  const lagMetrics = getLagMetrics();

  const consumerLags: KafkaConsumerLag[] = lagMetrics.map((entry) => {
    // Derive the consumer group name from plugin + tenant info.
    // Active consumer groups follow the pattern: plexica.plugin.<pluginSlug>-<tenantSlug>
    const consumerGroup = entry.tenantSlug != null
      ? `plexica.plugin.${entry.pluginSlug}-${entry.tenantSlug}`
      : `plexica.plugin.${entry.pluginSlug}`;

    return {
      pluginSlug: entry.pluginSlug,
      consumerGroup,
      lag: entry.lag,
    };
  });

  const dlqGroups: DlqGroupRow[] = await prisma.deadLetterQueue.groupBy({
    by: ['pluginId'],
    where: { status: 'pending' },
    _count: { _all: true },
  }).then((rows) => rows.map((r) => ({ pluginId: r.pluginId, count: r._count._all })));

  // Sum all pending DLQ rows directly — including null pluginId entries.
  // resolveDlqSizes (called below) may drop rows with missing plugins, so
  // dlqDepth must use the raw group sums for an accurate total count.
  const dlqDepth = dlqGroups.reduce((sum, g) => sum + g.count, 0);

  return {
    brokers: config.KAFKA_BROKERS.split(',').map((s) => s.trim()),
    consumerLags,
    dlqDepth,
  };
}

// resolveDlqSizes was previously used to map plugin IDs to slugs for
// per-plugin DLQ breakdown. dlqDepth now sums raw group counts directly
// so that null-pluginId DLQ entries are included in the total. If per-plugin
// breakdown is needed later, re-add resolveDlqSizes with the raw sum.
