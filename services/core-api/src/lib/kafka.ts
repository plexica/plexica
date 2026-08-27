// lib/kafka.ts
// Kafka transport wrapper. Domain shaping belongs to the event layer.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { wireEventEnvelopeSchema } from '../events/event-envelope.js';

import { kafkaClient } from './kafka-client.js';
import { createKafkaConsumer } from './kafka-consumer.js';
import { KafkaSendError } from './kafka-errors.js';
import { getProducer, KafkaProducerClosedError, registerSend } from './kafka-producer.js';
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
  const sendTask = (async () => {
    const p = await getProducer();
    const reports = await p.send({
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
    if (!reports || reports.length === 0) throw new KafkaSendError();
    for (const r of reports) {
      if (r.errorCode !== KafkaJS.ErrorCodes.ERR_NO_ERROR) throw new KafkaSendError();
    }
  })();

  // Register synchronously before awaiting connect so shutdown cannot miss it.
  try {
    registerSend(sendTask);
  } catch (err) {
    if (err instanceof KafkaProducerClosedError) {
      logger.warn(
        { topic, code: 'KAFKA_PRODUCER_CLOSED' },
        'Kafka envelope not sent — producer closed by shutdown'
      );
    }
    throw err;
  }

  try {
    await sendTask;
  } catch (err) {
    if (err instanceof KafkaProducerClosedError) {
      logger.warn(
        { topic, code: 'KAFKA_PRODUCER_CLOSED' },
        'Kafka envelope not sent — producer closed by shutdown'
      );
      throw err;
    }
    logger.warn({ topic, code: 'KAFKA_SEND_FAILED' }, 'Failed to send Kafka envelope');
    if (err instanceof KafkaSendError) throw err;
    throw new KafkaSendError(err);
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
 * Uses the managed consumer factory with rebalance tracking and assignment gate.
 */
export function createConsumer(groupId: string): KafkaConsumer {
  return createKafkaConsumer(groupId);
}

/**
 * Returns a fresh Kafka admin client (caller must connect/disconnect).
 */
export function getKafkaAdmin(): KafkaAdmin {
  return kafkaClient.admin();
}
