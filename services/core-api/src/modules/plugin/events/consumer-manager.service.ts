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

// Known core event topics that plugins can subscribe to
const CORE_TOPICS = [
  'plexica.workspace.created', 'plexica.workspace.updated', 'plexica.workspace.deleted',
  'plexica.user.invited', 'plexica.user.joined', 'plexica.user.removed',
  'plexica.tenant.created', 'plexica.tenant.suspended', 'plexica.tenant.deleted',
  'plexica.plugin.installed', 'plexica.plugin.activated', 'plexica.plugin.deactivated', 'plexica.plugin.uninstalled',
];

// Wildcard patterns that expand to concrete topics
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
    if (PATTERN_MAP[p]) {
      for (const t of PATTERN_MAP[p]) resolved.add(t);
    } else if (p.startsWith('plugin.')) {
      resolved.add(p); // Custom plugin topics — subscribe literally
    }
  }
  return Array.from(resolved);
}

export async function createConsumerGroup(
  installId: string, tenantSlug: string, eventPatterns: string[],
  eachMessage: (topic: string, payload: Record<string, unknown>) => Promise<void>
): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  if (consumers.has(groupId)) return;

  const consumer = createConsumer(groupId, eventPatterns, eachMessage);
  await consumer.connect();

  const topics = resolvePatterns(eventPatterns);
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
}

export async function resumeConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;
  await entry.consumer.resume(entry.topics.map((t) => ({ topic: t })));
  entry.isRunning = true;
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
