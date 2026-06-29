// events/consumer-manager.service.ts
// Manages Kafka consumer group lifecycle for plugin installations.

import { createConsumer } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';
import { moveToDlq } from './dlq.service.js';

interface ConsumerEntry {
  consumer: ReturnType<typeof createConsumer>;
  topics: string[];
  isRunning: boolean;
}

const consumers = new Map<string, ConsumerEntry>();
// Pending consumers guard: deduplicates concurrent createConsumerGroup calls
const pendingConsumers = new Map<string, Promise<void>>();

export const CONSUMER_GROUP_PREFIX = 'plugin-';
export const DEV_CONSUMER_PREFIX = 'plugin-dev-';

const CORE_TOPICS = [
  'plexica.workspace.created', 'plexica.workspace.updated', 'plexica.workspace.deleted',
  'plexica.user.invited', 'plexica.user.joined', 'plexica.user.removed',
  'plexica.tenant.created', 'plexica.tenant.suspended', 'plexica.tenant.deleted',
  'plexica.plugin.installed', 'plexica.plugin.activated', 'plexica.plugin.deactivated', 'plexica.plugin.uninstalled',
];

const PATTERN_MAP: Record<string, string[]> = {
  'plexica.workspace.*': ['plexica.workspace.created', 'plexica.workspace.updated', 'plexica.workspace.deleted'],
  'plexica.user.*': ['plexica.user.invited', 'plexica.user.joined', 'plexica.user.removed'],
  'plexica.tenant.*': ['plexica.tenant.created', 'plexica.tenant.suspended', 'plexica.tenant.deleted'],
  'plexica.plugin.*': ['plexica.plugin.installed', 'plexica.plugin.activated', 'plexica.plugin.deactivated', 'plexica.plugin.uninstalled'],
  'plexica.*': CORE_TOPICS,
};

function resolvePatterns(patterns: string[]): string[] {
  const resolved = new Set<string>();
  for (const p of patterns) {
    if (PATTERN_MAP[p]) { for (const t of PATTERN_MAP[p]) resolved.add(t); }
    else if (p.startsWith('plugin.')) { resolved.add(p); }
  }
  return Array.from(resolved);
}

export async function createConsumerGroup(
  installId: string, tenantSlug: string, eventPatterns: string[],
  eachMessage: (topic: string, payload: Record<string, unknown>) => Promise<void>
): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;

  // Atomic deduplication: if a consumer is being created, wait for it
  const existing = pendingConsumers.get(groupId);
  if (existing) {
    logger.debug({ groupId }, 'Consumer group creation already in progress — waiting');
    return existing;
  }

  // Check if already exists
  if (consumers.has(groupId)) return;

  // Create the promise and claim the slot before any async work
  const createPromise = createConsumerGroupInner(groupId, installId, eventPatterns, eachMessage, tenantSlug);
  pendingConsumers.set(groupId, createPromise);

  try {
    await createPromise;
  } finally {
    pendingConsumers.delete(groupId);
  }
}

async function createConsumerGroupInner(
  groupId: string, installId: string, eventPatterns: string[],
  eachMessage: (topic: string, payload: Record<string, unknown>) => Promise<void>,
  tenantSlug: string
): Promise<void> {
  const consumer = createConsumer(groupId, eventPatterns, eachMessage);
  await consumer.connect();

  const topics = resolvePatterns(eventPatterns);
  // Batch subscribe with concurrency limit (5 parallel)
  const batchSize = 5;
  for (let i = 0; i < topics.length; i += batchSize) {
    await Promise.all(topics.slice(i, i + batchSize).map((t) => consumer.subscribe({ topic: t, fromBeginning: false })));
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value?.toString() ?? '{}');
        logger.debug({ groupId, topic }, 'Consumer processing event');
        await eachMessage(topic, payload);
      } catch (err) {
        // Move failed event to DLQ per EC-21
        logger.error({ err, groupId, topic }, 'Consumer message processing failed — moving to DLQ');
        try {
          const payload = JSON.parse(message.value?.toString() ?? '{}');
          await moveToDlq(installId, topic, payload, (err as Error).message, 3);
        } catch (dlqErr) {
          logger.error({ err: dlqErr, groupId, topic }, 'Failed to move consumer message to DLQ');
        }
      }
    },
  });

  consumers.set(groupId, { consumer, topics, isRunning: true });
  logger.info({ groupId, topics }, 'Consumer group started');
}

// EC-14: Commit offsets before pause to prevent event replay on reactivation
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
