// admin/kafka.ts
// Kafka status + DLQ response schemas — the single source of truth for the
// /api/v1/admin/system/kafka and /api/v1/admin/system/dlq endpoints
// (ADR-029, 2026-08-18).
//
// Prior to this ADR, there were FOUR divergent definitions of the Kafka
// response. The frontend read { brokers, consumerLags, dlqDepth } but the
// endpoint returned { consumers, totalLag, activeConsumerGroups } — the
// Kafka page rendered undefined for every field. This schema unifies all.

import { z } from 'zod';

export const KafkaConsumerSchema = z.object({
  pluginSlug: z.string().min(1),
  tenantSlug: z.string().nullable(),
  lag: z.number().int().min(0),
  topic: z.string().min(1),
});

export const KafkaStatusResponseSchema = z.object({
  brokers: z.array(z.string()),
  consumers: z.array(KafkaConsumerSchema),
  totalLag: z.number().int().min(0),
  dlqDepth: z.number().int().min(0),
  activeConsumerGroups: z.number().int().min(0),
});

export type KafkaConsumer = z.infer<typeof KafkaConsumerSchema>;
export type KafkaStatusResponse = z.infer<typeof KafkaStatusResponseSchema>;

// ── DLQ entry (list, retry, dismiss) ────────────────────────────────────────

export const DlqEntrySchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  pluginId: z.string().uuid().nullable(),
  errorMessage: z.string().nullable(),
  retryCount: z.number().int().min(0),
  failedAt: z.string(),
  status: z.enum(['pending', 'retried', 'dismissed']),
  originalTopic: z.string().optional(),
  originalOffset: z.string().optional(),
});
export type DlqEntry = z.infer<typeof DlqEntrySchema>;

export const DlqListResponseSchema = z.object({
  data: z.array(DlqEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});
export type DlqListResponse = z.infer<typeof DlqListResponseSchema>;
