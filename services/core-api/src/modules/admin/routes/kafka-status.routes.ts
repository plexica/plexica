// routes/kafka-status.routes.ts
// GET /api/v1/admin/system/kafka — aggregated Kafka consumer lag + DLQ size
// per plugin, with threshold warnings (S5-901 / Feature 005-09).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/system/kafka). requireSuperAdmin is applied
// BOTH at the admin scope and here per route (defense in depth, matches
// tenant-list.routes.ts pattern).

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { getKafkaStatus } from '../services/kafka-status.service.js';

import type { FastifyInstance } from 'fastify';

export async function kafkaStatusRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── GET /api/v1/admin/system/kafka ─────────────────────────────────────────
  fastify.get(
    '/system/kafka',
    { preHandler: [requireSuperAdmin] },
    async () => withCoreDb((prisma) => getKafkaStatus(prisma))
  );
}
