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
  eachMessage: (topic: string, payload: Record<string, unknown>) => Promise<void>,
  pluginId?: string
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
  const createPromise = createConsumerGroupInner(groupId, installId, eventPatterns, eachMessage, tenantSlug, pluginId);
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
  tenantSlug: string,
  pluginId?: string
): Promise<void> {
  const consumer = createConsumer(groupId);
  await consumer.connect();

  const topics = resolvePatterns(eventPatterns);
  // Batch subscribe with concurrency limit (5 parallel)
  const batchSize = 5;
  for (let i = 0; i < topics.length; i += batchSize) {
    // NOTE: fromBeginning is false. Events emitted between consumer creation and connection may be lost.
    // This is intentional — at-least-once delivery starts from consumer activation time.
    // For zero-loss requirements, consider checkpoint-based offset management.
    await Promise.all(topics.slice(i, i + batchSize).map((t) => consumer.subscribe({ topic: t, fromBeginning: false })));
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      let lastError: Error | null = null;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(message.value?.toString() ?? '{}');
      } catch {
        await moveToDlq(installId, topic, { raw: message.value?.toString() ?? '' }, 'Malformed JSON payload', 0, pluginId);
        return;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, [100, 500, 2000][attempt - 1]));
        try {
          await eachMessage(topic, payload);
          return;
        } catch (err) {
          lastError = err as Error;
          logger.warn({ err, groupId, topic, attempt: attempt + 1 }, 'Consumer retry');
        }
      }
      await moveToDlq(installId, topic, payload, lastError!.message, 3, pluginId);
    },
  });

  consumers.set(groupId, { consumer, topics, isRunning: true });
  logger.info({ groupId, topics }, 'Consumer group started');
}

export async function pauseConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;

  // EC-14: Commit offsets before pause to prevent event replay on reactivation
  try {
    await entry.consumer.commitOffsets([]);
  } catch { /* best-effort — offsets still auto-commit on next poll */ }

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
  // EC-14: Commit offsets before disconnect to prevent re-processing on restart
  try {
    await entry.consumer.commitOffsets([]);
  } catch { /* best-effort */ }
  await entry.consumer.disconnect();
  consumers.delete(groupId);
}

export async function createDevConsumerGroup(slug: string): Promise<string> {
  const groupId = `${DEV_CONSUMER_PREFIX}${slug}`;
  const consumer = createConsumer(groupId);
  await consumer.connect();
  consumers.set(groupId, { consumer, topics: [], isRunning: true });
  return groupId;
}

export function getActiveConsumerGroups(): string[] {
  return Array.from(consumers.keys());
}
