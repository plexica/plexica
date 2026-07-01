// lib/kafka.ts
// Kafka producer/consumer wrapper for plugin events.
// Provides fire-and-forget emit and consumer lifecycle management.

import { Kafka, logLevel } from 'kafkajs';

import { config } from './config.js';
import { logger } from './logger.js';

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

/**
 * Emit an event to Kafka. Throws on failure so callers can decide whether to
 * fall back (e.g. DLQ direct DB write). Most call sites use `.catch()` to
 * make it fire-and-forget; the throw gives them that option.
 */
export async function emitEvent(
  topic: string,
  payload: Record<string, unknown>,
  correlationId?: string
): Promise<void> {
  try {
    const p = await getProducer();
    await p.send({
      topic,
      messages: [
        {
          key: String(payload.id ?? payload.slug ?? ''),
          value: JSON.stringify({
            ...payload,
            _metadata: {
              timestamp: new Date().toISOString(),
              correlationId: correlationId ?? crypto.randomUUID(),
              producer: 'plexica-core',
            },
          }),
        },
      ],
    });
  } catch (err) {
    logger.error({ err, topic }, 'Failed to emit event to Kafka');
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
