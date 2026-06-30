// routes/kafka-status.routes.ts
// Super admin Kafka consumer lag status endpoint (Spec 004 — ops visibility).

import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { getLagMetrics } from '../events/lag-metrics.service.js';
import { getActiveConsumerGroups, CONSUMER_GROUP_PREFIX } from '../events/consumer-manager.service.js';

import type { FastifyInstance } from 'fastify';

export async function kafkaStatusRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/admin/system/kafka',
    { preHandler: [requireSuperAdmin] },
    async () => {
      const lagMetrics = getLagMetrics();

      const consumers = lagMetrics.map((entry) => ({
        pluginSlug: entry.pluginSlug,
        tenantSlug: entry.tenantSlug,
        lag: entry.lag,
        topic: `plexica.plugin.${entry.pluginSlug}`,
      }));

      const activeGroups = getActiveConsumerGroups().filter((g) => g.startsWith(CONSUMER_GROUP_PREFIX));

      return {
        consumers,
        totalLag: consumers.reduce((sum, c) => sum + c.lag, 0),
        activeConsumerGroups: activeGroups.length,
      };
    }
  );
}
