// schemas/kafka-schemas.ts
// Kafka status response schema — re-exported from @plexica/api-types (ADR-029).
//
// The canonical schema lives in packages/api-types/src/admin/kafka.ts.
// This file re-exports it so existing backend imports continue to work.

export {
  KafkaStatusResponseSchema,
  KafkaConsumerSchema,
  type KafkaStatusResponse,
  type KafkaConsumer,
} from '@plexica/api-types';
