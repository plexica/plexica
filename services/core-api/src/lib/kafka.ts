// lib/kafka.ts
// Kafka transport wrapper. Domain shaping belongs to the event layer.
// The producer lifecycle state machine lives in kafka-producer.ts and the
// shared kafkajs client in kafka-client.ts (Rule 4: 200 lines per file).

import { wireEventEnvelopeSchema } from '../events/event-envelope.js';

import { kafkaClient } from './kafka-client.js';
import { getProducer, KafkaProducerClosedError } from './kafka-producer.js';
import { logger } from './logger.js';

import type { KafkaAdmin, KafkaConsumer } from './kafka-client.js';
import type { WireEventEnvelope } from '../events/event-envelope.js';

export {
  disconnectKafka,
  initKafka,
  isKafkaProducerClosed,
  KafkaProducerClosedError,
  resetKafkaProducerForTests,
} from './kafka-producer.js';

/**
 * Publishes one envelope. Always throws on failure — including when the
 * producer is already closed by a shutdown in progress — so the outbox keeps
 * the event pending instead of acknowledging an event that never left.
 */
export async function sendKafkaEnvelope(
  topic: string,
  input: WireEventEnvelope,
  options: { headers?: Record<string, string>; partition?: number } = {}
): Promise<void> {
  const envelope = wireEventEnvelopeSchema.parse(input);
  try {
    const p = await getProducer();
    await p.send({
      topic,
      messages: [
        {
          key: envelope.tenantId,
          value: JSON.stringify(envelope),
          headers: {
            'event-id': envelope.eventId,
            'tenant-id': envelope.tenantId,
            'schema-version': String(envelope.schemaVersion),
            'content-encoding': 'plexica-a256gcm-v1',
            ...options.headers,
          },
          ...(options.partition === undefined ? {} : { partition: options.partition }),
        },
      ],
    });
  } catch (err) {
    if (err instanceof KafkaProducerClosedError) {
      logger.warn(
        { topic, code: 'KAFKA_PRODUCER_CLOSED' },
        'Kafka envelope not sent — producer closed by shutdown'
      );
    } else {
      logger.error({ topic, code: 'KAFKA_SEND_FAILED' }, 'Failed to send Kafka envelope');
    }
    throw err;
  }
}

/**
 * Topic naming helpers.
 */
export const Topics = {
  workspace: (action: string) => `plexica.workspace.${action}`,
  user: (action: string) => `plexica.user.${action}`,
  tenant: (action: string) => `plexica.tenant.${action}`,
  plugin: (action: string) => `plexica.plugin.${action}`,
  pluginCustom: (slug: string, entity: string, action: string) =>
    `plugin.${slug}.${entity}.${action}`,
  dlq: 'plexica.plugin.dlq',
} as const;

/**
 * Creates (but does not connect) a Kafka consumer for the given consumer group.
 * The caller owns the lifecycle: connect(), subscribe() to its topics and run()
 * the message handler. A `consumer.crash` listener is pre-wired for logging.
 *
 * @param groupId - Kafka consumer group id (one per plugin installation).
 */
export function createConsumer(groupId: string): KafkaConsumer {
  const consumer = kafkaClient.consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    retry: { retries: 3 },
  });

  consumer.on('consumer.crash', (err) => {
    logger.error({ err, groupId }, 'Kafka consumer crashed');
  });

  return consumer;
}

/**
 * Returns a fresh Kafka admin client (caller must connect/disconnect).
 */
export function getKafkaAdmin(): KafkaAdmin {
  return kafkaClient.admin();
}
