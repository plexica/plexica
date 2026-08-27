import { createConsumer } from '../../../lib/kafka.js';
import {
  commitOffsetGuarded,
  getConsumerGeneration,
  isConsumerClosing,
  markConsumerClosing,
  waitForConsumerAssignment,
} from '../../../lib/kafka-consumer.js';
import { logger } from '../../../lib/logger.js';

import { buildGroupId } from './consumer-group-registry.js';
import { resolvePatterns } from './consumer-topic-patterns.js';
import { processInstallationMessage } from './installation-message-processor.js';

import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
import type { SourceCoordinates } from '../../../events/dlq-contract.js';
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

export async function createConsumerGroup(
  installId: string,
  tenantId: string,
  tenantSlug: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
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
    await consumer.subscribe({ topics });
    await consumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: async ({ topic, partition, message }) => {
        const generation = getConsumerGeneration(consumer);
        const offset = message.offset;
        const nextOffset = (BigInt(offset) + 1n).toString();
        try {
          await processInstallationMessage({
            installId,
            tenantId,
            pluginId,
            source: { topic, partition, offset },
            value: message.value?.toString() ?? '',
            handler,
          });
        } catch (error) {
          logger.warn(
            { code: 'KAFKA_CONSUMER_HANDLER_FAILED', groupId, topic, partition, offset },
            'Plugin event handler failed — will retry'
          );
          throw error;
        }
        try {
          await commitOffsetGuarded(consumer, topic, partition, nextOffset);
        } catch (error) {
          if (String((error as Error).message).includes('KAFKA_COMMIT_STALE_GENERATION')) {
            if (getConsumerGeneration(consumer) !== generation) throw error;
          }
          throw error;
        }
      },
    });
    await waitForConsumerAssignment(consumer, 15000);
  } catch (error) {
    try {
      await consumer.disconnect();
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
    await entry.consumer.disconnect();
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
  await Promise.allSettled([...pendingConsumers.values()]);
  const entries = [...consumers.entries()];
  consumers.clear();
  const { stopLagMonitoring } = await import('./lag-metrics.service.js');
  await Promise.all(
    entries.map(async ([groupId, entry]) => {
      markConsumerClosing(entry.consumer);
      stopLagMonitoring(entry.installId);
      try {
        await entry.consumer.disconnect();
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
