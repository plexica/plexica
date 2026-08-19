// routes/kafka-status.routes.ts
// Super admin Kafka consumer lag status endpoint (Spec 004/005 — ops visibility).
//
// Delegates to kafka-status.service.ts which returns the canonical
// KafkaStatusResponse shape from @plexica/api-types (ADR-029).
// Prior to ADR-029 this route had its own inline implementation that diverged
// from both the service and the schema — the frontend read undefined fields.

import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { withCoreDb } from '../../../lib/tenant-database.js';
import { getKafkaStatus } from '../../admin/services/kafka-status.service.js';

import type { FastifyInstance } from 'fastify';

export async function kafkaStatusRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/admin/system/kafka',
    { preHandler: [requireSuperAdmin] },
    async () => withCoreDb((prisma) => getKafkaStatus(prisma)),
  );
}
