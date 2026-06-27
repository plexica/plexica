// events/consumer-manager.service.ts
// Manages Kafka consumer group lifecycle for plugin installations.

import { createConsumer } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

interface ConsumerEntry {
  consumer: ReturnType<typeof createConsumer>;
  topics: string[];
  isRunning: boolean;
}

const consumers = new Map<string, ConsumerEntry>();

export const CONSUMER_GROUP_PREFIX = 'plugin-';
export const DEV_CONSUMER_PREFIX = 'plugin-dev-';

/**
 * Converts glob-style event patterns to Kafka topic names.
 * e.g. "plexica.workspace.*" → subscribes to "plexica.workspace" events
 */
function patternsToTopics(patterns: string[]): string[] {
  const topics = new Set<string>();
  for (const p of patterns) {
    // Extract prefix from pattern (e.g., "plexica.workspace.*" → "plexica.workspace")
    const prefix = p.replace(/\.\*$/, '');
    if (prefix.startsWith('plexica.')) {
      topics.add(`plexica.${prefix.split('.').slice(1).join('.')}`);
    }
    if (prefix.startsWith('plugin.')) {
      topics.add(p);
    }
  }
  return Array.from(topics);
}

export async function createConsumerGroup(
  installId: string,
  tenantSlug: string,
  eventPatterns: string[],
  eachMessage: (topic: string, payload: Record<string, unknown>) => Promise<void>
): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;

  if (consumers.has(groupId)) {
    logger.warn({ groupId }, 'Consumer group already exists');
    return;
  }

  const consumer = createConsumer(groupId, eventPatterns, eachMessage);
  await consumer.connect();

  const topics = patternsToTopics(eventPatterns);
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value?.toString() ?? '{}');
        await eachMessage(topic, payload);
      } catch (err) {
        logger.error({ err, groupId, topic }, 'Consumer message processing failed');
      }
    },
  });

  consumers.set(groupId, { consumer, topics, isRunning: true });
  logger.info({ groupId, topics }, 'Consumer group created');
}

export async function pauseConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;

  await entry.consumer.pause(entry.topics.map((t) => ({ topic: t })));
  entry.isRunning = false;
  logger.info({ groupId }, 'Consumer group paused');
}

export async function resumeConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;

  await entry.consumer.resume(entry.topics.map((t) => ({ topic: t })));
  entry.isRunning = true;
  logger.info({ groupId }, 'Consumer group resumed');
}

export async function deleteConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;

  await entry.consumer.disconnect();
  consumers.delete(groupId);
  logger.info({ groupId }, 'Consumer group deleted');
}

export async function createDevConsumerGroup(slug: string): Promise<string> {
  const groupId = `${DEV_CONSUMER_PREFIX}${slug}`;
  const consumer = createConsumer(groupId, [], async () => {});
  await consumer.connect();
  consumers.set(groupId, { consumer, topics: [], isRunning: true });
  return groupId;
}

export function getActiveConsumerGroups(): string[] {
  return Array.from(consumers.keys());
}
