// routes/kafka-status.routes.ts
// GET /api/v1/admin/system/kafka — aggregated Kafka consumer lag + DLQ size
// per plugin (S5-901 / Feature 005-09).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/system/kafka). requireSuperAdmin is applied
// BOTH at the admin scope and here per route (defense in depth, matches
// tenant-list.routes.ts pattern).
//
// Runtime response validation: Zod parse enforces the API contract at the
// boundary so malformed aggregation data never reaches the admin UI undetected.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { getKafkaStatus } from '../services/kafka-status.service.js';

import type { FastifyInstance } from 'fastify';

const KafkaStatusApiSchema = z.object({
  brokers: z.array(z.string()),
  consumerLags: z.array(
    z.object({
      pluginSlug: z.string().min(1),
      consumerGroup: z.string().min(1),
      lag: z.number().int().min(0),
    })
  ),
  dlqDepth: z.number().int().min(0),
});

export async function kafkaStatusRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── GET /api/v1/admin/system/kafka ─────────────────────────────────────────
  fastify.get(
    '/system/kafka',
    { preHandler: [requireSuperAdmin] },
    async () => {
      const result = await withCoreDb((prisma) => getKafkaStatus(prisma));
      return KafkaStatusApiSchema.parse(result);
    }
  );
}
