import { createConsumer } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

import { processInstallationMessage } from './installation-message-processor.js';

import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
import type { SourceCoordinates } from '../../../events/dlq-contract.js';

export { processInstallationMessage } from './installation-message-processor.js';

interface ConsumerEntry {
  consumer: ReturnType<typeof createConsumer>;
  topics: string[];
  isRunning: boolean;
}
type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;

const consumers = new Map<string, ConsumerEntry>();
const pendingConsumers = new Map<string, Promise<void>>();
export const CONSUMER_GROUP_PREFIX = 'plugin-';

// Consumer group names are `plugin-{installId}-{tenantSlug}` where installId
// is a dashed UUID (36 chars, gen_random_uuid()). The tenant slug may itself
// contain dashes, so the split point is positional: never `.split('-')`.
const INSTALL_UUID_LENGTH = 36;
const INSTALL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConsumerGroupName {
  installId: string;
  tenantSlug: string;
}

/**
 * Single source of truth for the consumer group name format
 * (`plugin-{installId}-{tenantSlug}`). Returns null for names this service
 * would never create (wrong prefix, truncated/non-UUID id, empty slug).
 */
export function parseConsumerGroupName(groupId: string): ConsumerGroupName | null {
  if (!groupId.startsWith(CONSUMER_GROUP_PREFIX)) return null;
  const rest = groupId.slice(CONSUMER_GROUP_PREFIX.length);
  const installId = rest.slice(0, INSTALL_UUID_LENGTH);
  const tenantSlug = rest.slice(INSTALL_UUID_LENGTH + 1);
  if (!INSTALL_UUID_RE.test(installId) || tenantSlug.length === 0) return null;
  return { installId, tenantSlug };
}

/** Extracts full installation UUIDs from active consumer group names. */
export function extractInstallIds(groups: string[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    const parsed = parseConsumerGroupName(group);
    if (parsed !== null) ids.push(parsed.installId);
  }
  return ids;
}

const CORE_TOPICS = [
  'plexica.workspace.created', 'plexica.workspace.updated', 'plexica.workspace.deleted',
  'plexica.user.invited', 'plexica.user.joined', 'plexica.user.removed',
  'plexica.tenant.created', 'plexica.tenant.suspended', 'plexica.tenant.deleted',
  'plexica.plugin.installed', 'plexica.plugin.activated', 'plexica.plugin.deactivated',
  'plexica.plugin.uninstalled',
];

const PATTERN_MAP: Record<string, string[]> = {
  'plexica.workspace.*': CORE_TOPICS.slice(0, 3),
  'plexica.user.*': CORE_TOPICS.slice(3, 6),
  'plexica.tenant.*': CORE_TOPICS.slice(6, 9),
  'plexica.plugin.*': CORE_TOPICS.slice(9),
  'plexica.*': CORE_TOPICS,
};

function resolvePatterns(patterns: string[]): string[] {
  const resolved = new Set<string>();
  for (const pattern of patterns) {
    const mapped = PATTERN_MAP[pattern];
    if (mapped) mapped.forEach((topic) => resolved.add(topic));
    else if (CORE_TOPICS.includes(pattern) || pattern.startsWith('plugin.')) resolved.add(pattern);
  }
  return [...resolved];
}

export async function createConsumerGroup(
  installId: string,
  tenantId: string,
  tenantSlug: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const pending = pendingConsumers.get(groupId);
  if (pending) return pending;
  if (consumers.has(groupId)) return;
  const creating = createConsumerGroupInner(
    groupId, installId, tenantId, eventPatterns, handler, pluginId
  );
  pendingConsumers.set(groupId, creating);
  try {
    await creating;
  } finally {
    pendingConsumers.delete(groupId);
  }
}

async function createConsumerGroupInner(
  groupId: string,
  installId: string,
  tenantId: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
  const consumer = createConsumer(groupId);
  await consumer.connect();
  const topics = resolvePatterns(eventPatterns);
  await Promise.all(topics.map((topic) => consumer.subscribe({ topic, fromBeginning: false })));
  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      await processInstallationMessage({
        installId,
        tenantId,
        pluginId,
        source: { topic, partition, offset: message.offset },
        value: message.value?.toString() ?? '',
        handler,
      });
      await consumer.commitOffsets([{
        topic, partition, offset: (BigInt(message.offset) + 1n).toString(),
      }]);
    },
  });
  consumers.set(groupId, { consumer, topics, isRunning: true });
  logger.info({ groupId, topics }, 'Consumer group started');
}

export async function pauseConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(`${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`);
  if (!entry || !entry.isRunning) return;
  await entry.consumer.pause(entry.topics.map((topic) => ({ topic })));
  entry.isRunning = false;
}

export async function resumeConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(`${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`);
  if (!entry) return;
  entry.consumer.resume(entry.topics.map((topic) => ({ topic })));
  entry.isRunning = true;
}

export async function deleteConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
  const entry = consumers.get(groupId);
  if (!entry) return;
  await entry.consumer.disconnect();
  consumers.delete(groupId);
}

export function getActiveConsumerGroups(): string[] {
  return [...consumers.keys()];
}

/**
 * Disconnects every plugin consumer group. Called from the shutdown path
 * (bootstrap.stopBackgroundServices) BEFORE the Kafka producer, the database
 * and Redis go down: a still-running consumer would otherwise keep processing
 * messages — and publish to the DLQ — against connections that are gone.
 *
 * In-flight creations are settled first so a group started by a concurrent
 * reconcilePluginRuntimes() cannot escape the teardown. Per-group failures are
 * logged and never abort the sweep.
 */
export async function disconnectAllConsumerGroups(): Promise<void> {
  await Promise.allSettled([...pendingConsumers.values()]);

  const entries = [...consumers.entries()];
  consumers.clear();

  await Promise.all(
    entries.map(async ([groupId, entry]) => {
      try {
        await entry.consumer.disconnect();
      } catch (err) {
        logger.error({ err, groupId }, 'Failed to disconnect plugin consumer group');
      }
    })
  );

  if (entries.length > 0) {
    logger.info({ count: entries.length }, 'Plugin consumer groups disconnected');
  }
}
