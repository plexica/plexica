// lib/kafka.ts
// Kafka transport wrapper. Domain shaping belongs to the event layer.

import { Kafka, logLevel } from 'kafkajs';

import { wireEventEnvelopeSchema } from '../events/event-envelope.js';

import { config } from './config.js';
import { logger } from './logger.js';

import type { WireEventEnvelope } from '../events/event-envelope.js';

const kafka = new Kafka({
  clientId: 'plexica-core',
  brokers: config.KAFKA_BROKERS.split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 3,
  },
});

let producer: ReturnType<typeof kafka.producer> | null = null;
let connectingProducer: Promise<ReturnType<typeof kafka.producer>> | null = null;

// Eager connection: start connecting immediately (non-blocking — resolves in background)
void (async function connectProducer(): Promise<void> {
  try {
    const p = kafka.producer({ allowAutoTopicCreation: true });
    producer = p;
    connectingProducer = Promise.resolve(p);
    await p.connect();
    logger.info('Kafka producer connected');
  } catch (err) {
    logger.error({ err }, 'Kafka producer initial connection failed — will retry on first emit');
    producer = null;
    connectingProducer = null;
  }
})();

async function getProducer(): Promise<ReturnType<typeof kafka.producer>> {
  if (producer) return producer;

  // Guard against concurrent initialization (race condition fix)
  if (connectingProducer) return connectingProducer;

  const p = kafka.producer({ allowAutoTopicCreation: true });
  connectingProducer = (async () => {
    try {
      await p.connect();
      producer = p;
      logger.info('Kafka producer connected (lazy)');
      return p;
    } catch (err) {
      connectingProducer = null;
      throw err;
    }
  })();

  return connectingProducer;
}

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
    logger.error({ topic, code: 'KAFKA_SEND_FAILED' }, 'Failed to send Kafka envelope');
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
 * Create a consumer group for a plugin installation.
 * `topics` and `eachMessage` are unused here — the caller subscribes and
 * runs the consumer itself after connect() — but kept for API stability.
 */
export function createConsumer(
  groupId: string
): ReturnType<typeof kafka.consumer> {
  const consumer = kafka.consumer({
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
export function getKafkaAdmin(): ReturnType<typeof kafka.admin> {
  return kafka.admin();
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}
