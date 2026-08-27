import { createConsumer } from '../../../lib/kafka.js';
import {
  awaitOwnedHandlers,
  isConsumerClosing,
  markConsumerClosing,
  waitForConsumerAssignment,
} from '../../../lib/kafka-consumer.js';
import { disconnectConsumerWithBudget, settleWithBudget } from '../../../lib/kafka-shutdown.js';
import { logger } from '../../../lib/logger.js';

import { buildGroupId } from './consumer-group-registry.js';
import { createPluginEachMessage } from './consumer-plugin-handler.js';
import { resolvePatterns } from './consumer-topic-patterns.js';

import type { SourceCoordinates } from '../../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
export { processInstallationMessage } from './installation-message-processor.js';
export {
  CONSUMER_GROUP_PREFIX,
  extractInstallIds,
  parseConsumerGroupName,
} from './consumer-group-registry.js';

interface ConsumerEntry {
  consumer: ReturnType<typeof createConsumer>;
  topics: string[];
  isRunning: boolean;
  installId: string;
  tenantSlug: string;
  pluginId: string;
}
type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;
const consumers = new Map<string, ConsumerEntry>();
const pendingConsumers = new Map<string, Promise<void>>();
let shuttingDown = false;

class ConsumerGroupShutdownError extends Error {
  readonly code = 'CONSUMER_GROUP_SHUTDOWN';

  constructor() {
    super('Consumer group creation aborted — shutdown in progress');
    this.name = 'ConsumerGroupShutdownError';
  }
}

export async function createConsumerGroup(
  installId: string,
  tenantId: string,
  tenantSlug: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
  if (shuttingDown) throw new ConsumerGroupShutdownError();
  const groupId = buildGroupId(installId, tenantSlug);
  const pending = pendingConsumers.get(groupId);
  if (pending) return pending;
  if (consumers.has(groupId)) return;
  const creating = createConsumerGroupInner(
    groupId,
    installId,
    tenantId,
    tenantSlug,
    eventPatterns,
    handler,
    pluginId
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
  tenantSlug: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
  const consumer = createConsumer(groupId);
  const topics = resolvePatterns(eventPatterns);
  try {
    await consumer.connect();
    if (shuttingDown) throw new ConsumerGroupShutdownError();
    await consumer.subscribe({ topics });
    await consumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: createPluginEachMessage({
        consumer,
        installId,
        tenantId,
        pluginId,
        groupId,
        handler,
      }),
    });
    await waitForConsumerAssignment(consumer, 15000);
    if (shuttingDown) throw new ConsumerGroupShutdownError();
  } catch (error) {
    try {
      await disconnectConsumerWithBudget(consumer);
    } catch {
      logger.debug(
        { code: 'KAFKA_CONSUMER_DISCONNECT_FAILED', groupId },
        'Consumer disconnect failed'
      );
    }
    throw error;
  }
  consumers.set(groupId, { consumer, topics, isRunning: true, installId, tenantSlug, pluginId });
  const { startLagMonitoring } = await import('./lag-metrics.service.js');
  if (shuttingDown) return;
  startLagMonitoring(installId, pluginId, tenantSlug, topics);
  logger.info({ groupId, topics }, 'Consumer group started');
}

export async function pauseConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(buildGroupId(installId, tenantSlug));
  if (!entry?.isRunning) return;
  if (entry.consumer.assignment().length === 0) return;
  try {
    entry.consumer.pause(entry.topics.map((topic) => ({ topic })));
    entry.isRunning = false;
  } catch {
    logger.warn(
      { code: 'KAFKA_PAUSE_FAILED', groupId: buildGroupId(installId, tenantSlug) },
      'Pause failed'
    );
  }
}

export async function resumeConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(buildGroupId(installId, tenantSlug));
  if (!entry) return;
  if (entry.consumer.assignment().length === 0) return;
  try {
    entry.consumer.resume(entry.topics.map((topic) => ({ topic })));
    entry.isRunning = true;
  } catch {
    logger.warn({ code: 'KAFKA_RESUME_FAILED' }, 'Resume failed');
  }
}

export async function deleteConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = buildGroupId(installId, tenantSlug);
  const entry = consumers.get(groupId);
  if (!entry) return;
  markConsumerClosing(entry.consumer);
  const { stopLagMonitoring } = await import('./lag-metrics.service.js');
  stopLagMonitoring(installId);
  try {
    await awaitOwnedHandlers(entry.consumer);
    await disconnectConsumerWithBudget(entry.consumer);
  } catch {
    logger.warn({ code: 'KAFKA_DISCONNECT_FAILED', groupId }, 'Disconnect failed');
  }
  consumers.delete(groupId);
}

export function getActiveConsumerGroups(): string[] {
  return [...consumers.entries()]
    .filter(
      ([, e]) => e.isRunning && !isConsumerClosing(e.consumer) && e.consumer.assignment().length > 0
    )
    .map(([g]) => g);
}

export async function disconnectAllConsumerGroups(): Promise<void> {
  shuttingDown = true;
  const pending = [...pendingConsumers.values()];
  if (pending.length > 0) {
    const settled = await settleWithBudget(Promise.allSettled(pending), 30000);
    if (!settled) logger.warn({ code: 'KAFKA_CONSUMER_GROUPS_PENDING_TIMEOUT' }, 'Pending consumer group creations did not settle within the shutdown budget');
  }
  const entries = [...consumers.entries()];
  consumers.clear();
  const { stopLagMonitoring } = await import('./lag-metrics.service.js');
  await Promise.all(
    entries.map(async ([groupId, entry]) => {
      markConsumerClosing(entry.consumer);
      stopLagMonitoring(entry.installId);
      try {
        await awaitOwnedHandlers(entry.consumer);
        await disconnectConsumerWithBudget(entry.consumer);
      } catch {
        logger.error(
          { code: 'KAFKA_DISCONNECT_FAILED', groupId },
          'Failed to disconnect plugin consumer group'
        );
      }
    })
  );
  if (entries.length > 0)
    logger.info({ count: entries.length }, 'Plugin consumer groups disconnected');
}
