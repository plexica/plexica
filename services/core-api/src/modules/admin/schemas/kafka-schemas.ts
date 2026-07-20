// schemas/kafka-schemas.ts
// Zod validation schemas for the Kafka status endpoint (Spec 005, S5-900).
//
// Surfaces consumer lag (from lag-metrics.service) and DLQ size per plugin
// (from core.dead_letter_queue, ADR-016). Warnings flag threshold breaches.

import { z } from 'zod';

export const ConsumerLagSchema = z.object({
  pluginSlug: z.string().min(1),
  tenantSlug: z.string().nullable(),
  lag: z.number().int().min(0),
  topic: z.string().min(1),
});

export const DlqSizeSchema = z.object({
  pluginSlug: z.string().min(1),
  count: z.number().int().min(0),
});

export const KafkaStatusResponseSchema = z.object({
  consumers: z.array(ConsumerLagSchema),
  totalLag: z.number().int().min(0),
  dlqSizes: z.array(DlqSizeSchema),
  warnings: z.array(z.string()),
});

export type ConsumerLag = z.infer<typeof ConsumerLagSchema>;
export type DlqSize = z.infer<typeof DlqSizeSchema>;
export type KafkaStatusResponse = z.infer<typeof KafkaStatusResponseSchema>;
