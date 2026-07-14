// services/kafka-status.service.ts
// Aggregates Kafka consumer lag and DLQ size per plugin (Spec 005, S5-900).
//
// Reuses the in-memory lag-metrics service (Spec 004) — no new Kafka client.
// DLQ counts come from core.dead_letter_queue grouped by plugin_id (ADR-016).
// Warnings surface threshold breaches so the admin UI can flag them visually.

import type { PrismaClient } from '@prisma/client';
import { getLagMetrics } from '../../plugin/events/lag-metrics.service.js';
import type {
  ConsumerLag,
  DlqSize,
  KafkaStatusResponse,
} from '../schemas/kafka-schemas.js';

const LAG_WARNING_THRESHOLD = 1000;
const DLQ_WARNING_THRESHOLD = 100;

interface DlqGroupRow {
  pluginId: string | null;
  count: number;
}

export async function getKafkaStatus(
  prisma: PrismaClient
): Promise<KafkaStatusResponse> {
  const lagMetrics = getLagMetrics();

  const consumers: ConsumerLag[] = lagMetrics.map((entry) => ({
    pluginSlug: entry.pluginSlug,
    tenantSlug: entry.tenantSlug,
    lag: entry.lag,
    topic: `plexica.plugin.${entry.pluginSlug}`,
  }));

  const totalLag = consumers.reduce((sum, c) => sum + c.lag, 0);

  const dlqGroups: DlqGroupRow[] = await prisma.deadLetterQueue.groupBy({
    by: ['pluginId'],
    where: { status: 'pending' },
    _count: { _all: true },
  }).then((rows) => rows.map((r) => ({ pluginId: r.pluginId, count: r._count._all })));

  const dlqSizes = await resolveDlqSizes(prisma, dlqGroups);

  const warnings = buildWarnings(consumers, dlqSizes, totalLag);

  return { consumers, totalLag, dlqSizes, warnings };
}

async function resolveDlqSizes(
  prisma: PrismaClient,
  groups: DlqGroupRow[]
): Promise<DlqSize[]> {
  const withPluginId = groups.filter((g): g is { pluginId: string; count: number } =>
    g.pluginId !== null
  );
  if (withPluginId.length === 0) return [];

  const pluginIds = withPluginId.map((g) => g.pluginId);
  const plugins = await prisma.plugin.findMany({
    where: { id: { in: pluginIds } },
    select: { id: true, slug: true },
  });

  const slugById = new Map(plugins.map((p) => [p.id, p.slug]));

  return withPluginId
    .map((g) => {
      const slug = slugById.get(g.pluginId);
      if (!slug) return null;
      return { pluginSlug: slug, count: g.count } satisfies DlqSize;
    })
    .filter((row): row is DlqSize => row !== null);
}

function buildWarnings(
  consumers: ConsumerLag[],
  dlqSizes: DlqSize[],
  totalLag: number
): string[] {
  const warnings: string[] = [];

  for (const c of consumers) {
    if (c.lag > LAG_WARNING_THRESHOLD) {
      warnings.push(
        `Consumer lag for plugin "${c.pluginSlug}" (tenant ${c.tenantSlug ?? '-'}) exceeds ${LAG_WARNING_THRESHOLD} messages: ${c.lag}`
      );
    }
  }
  if (totalLag > LAG_WARNING_THRESHOLD) {
    warnings.push(`Total consumer lag exceeds ${LAG_WARNING_THRESHOLD} messages: ${totalLag}`);
  }
  for (const d of dlqSizes) {
    if (d.count > DLQ_WARNING_THRESHOLD) {
      warnings.push(
        `DLQ for plugin "${d.pluginSlug}" exceeds ${DLQ_WARNING_THRESHOLD} pending messages: ${d.count}`
      );
    }
  }
  return warnings;
}
