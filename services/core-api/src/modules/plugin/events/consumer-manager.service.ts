import {
  awaitOwnedHandlers,
  isConsumerClosing,
  markConsumerClosing,
} from '../../../lib/kafka-consumer.js';
import {
  ConsumerGroupCancelledError,
  ConsumerGroupShutdownError,
} from '../../../lib/kafka-errors.js';
import { disconnectConsumerWithBudget, settleWithBudget } from '../../../lib/kafka-shutdown.js';
import { logger } from '../../../lib/logger.js';

import { buildGroupConsumer } from './consumer-group-lifecycle.js';
import { buildGroupId } from './consumer-group-registry.js';
import {
  cancellingGroups,
  consumers,
  isShuttingDown,
  pendingConsumers,
  setShuttingDown,
} from './consumer-group-state.js';
import { resolvePatterns } from './consumer-topic-patterns.js';

import type { SourceCoordinates } from '../../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
import type { ConsumerEntry } from './consumer-group-state.js';
export { processInstallationMessage } from './installation-message-processor.js';
export {
  CONSUMER_GROUP_PREFIX,
  extractInstallIds,
  parseConsumerGroupName,
} from './consumer-group-registry.js';

type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;

export async function createConsumerGroup(
  installId: string,
  tenantId: string,
  tenantSlug: string,
  eventPatterns: string[],
  handler: EventHandler,
  pluginId: string
): Promise<void> {
  if (isShuttingDown()) throw new ConsumerGroupShutdownError();
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
  const topics = resolvePatterns(eventPatterns);
  const shouldAbort = () => cancellingGroups.has(groupId) || isShuttingDown();
  const consumer = await buildGroupConsumer({
    groupId,
    installId,
    tenantId,
    pluginId,
    topics,
    handler,
    shouldAbort,
  });
  // A delete/shutdown observed between the last gate and registration: the
  // consumer must never become an orphan, so disconnect before rethrowing.
  if (shouldAbort()) {
    try {
      await disconnectConsumerWithBudget(consumer);
    } catch {
      logger.debug(
        { code: 'KAFKA_CONSUMER_DISCONNECT_FAILED', groupId },
        'Consumer disconnect failed'
      );
    }
    throw new ConsumerGroupCancelledError();
  }
  consumers.set(groupId, { consumer, topics, isRunning: true, installId, tenantSlug, pluginId });
  const { startLagMonitoring } = await import('./lag-metrics.service.js');
  if (isShuttingDown()) return;
  startLagMonitoring(installId, pluginId, tenantSlug, topics);
  logger.info({ groupId, topics }, 'Consumer group started');
}

export { pauseConsumerGroup, resumeConsumerGroup } from './consumer-group-control.js';

async function teardownConsumerGroup(groupId: string, entry: ConsumerEntry): Promise<void> {
  markConsumerClosing(entry.consumer);
  const { stopLagMonitoring } = await import('./lag-metrics.service.js');
  stopLagMonitoring(entry.installId);
  try {
    await awaitOwnedHandlers(entry.consumer);
    await disconnectConsumerWithBudget(entry.consumer);
  } catch {
    logger.warn({ code: 'KAFKA_DISCONNECT_FAILED', groupId }, 'Disconnect failed');
  }
  consumers.delete(groupId);
}

export async function deleteConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const groupId = buildGroupId(installId, tenantSlug);
  const entry = consumers.get(groupId);
  if (entry) {
    await teardownConsumerGroup(groupId, entry);
    return;
  }
  const pending = pendingConsumers.get(groupId);
  if (!pending) return;
  // Creation is in flight but not yet registered: flag it so the in-flight
  // gates abort, then wait for the expected cancellation rejection.
  cancellingGroups.add(groupId);
  try {
    await settleWithBudget(pending, 30000);
  } catch {
    // expected: the pending creation rejected with ConsumerGroupCancelledError
  } finally {
    cancellingGroups.delete(groupId);
  }
  // The creation may have registered just before observing the cancel.
  const registered = consumers.get(groupId);
  if (registered) await teardownConsumerGroup(groupId, registered);
}

export function getActiveConsumerGroups(): string[] {
  return [...consumers.entries()]
    .filter(
      ([, e]) => e.isRunning && !isConsumerClosing(e.consumer) && e.consumer.assignment().length > 0
    )
    .map(([g]) => g);
}

export async function disconnectAllConsumerGroups(): Promise<void> {
  setShuttingDown();
  const pending = [...pendingConsumers.values()];
  if (pending.length > 0) {
    const settled = await settleWithBudget(Promise.allSettled(pending), 30000);
    if (!settled)
      logger.warn(
        { code: 'KAFKA_CONSUMER_GROUPS_PENDING_TIMEOUT' },
        'Pending consumer group creations did not settle within the shutdown budget'
      );
  }
  const entries = [...consumers.entries()];
  consumers.clear();
  cancellingGroups.clear();
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
