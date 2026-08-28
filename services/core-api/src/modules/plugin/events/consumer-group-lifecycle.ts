// events/consumer-group-lifecycle.ts
// Per-group consumer lifecycle primitives for consumer-manager: bounded
// connect, subscribe/run with the assignment gate, and abort-safe disconnect
// when the group is cancelled or shutdown starts mid-creation.

import { createConsumer } from '../../../lib/kafka.js';
import { waitForConsumerAssignment } from '../../../lib/kafka-consumer.js';
import { ConsumerGroupCancelledError } from '../../../lib/kafka-errors.js';
import { disconnectConsumerWithBudget } from '../../../lib/kafka-shutdown.js';
import { logger } from '../../../lib/logger.js';

import { createPluginEachMessage } from './consumer-plugin-handler.js';

import type { KafkaConsumer } from '../../../lib/kafka-client.js';
import type { SourceCoordinates } from '../../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../../events/event-envelope.js';

type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;

export interface BuildGroupConsumerOptions {
  groupId: string;
  installId: string;
  tenantId: string;
  pluginId: string;
  topics: string[];
  handler: EventHandler;
  shouldAbort: () => boolean;
}

/**
 * Creates and connects a plugin consumer, subscribes the resolved topics and
 * runs the plugin handler behind the assignment gate. Cancellation (a delete
 * or shutdown observed after connect or after the assignment gate) throws
 * ConsumerGroupCancelledError and disconnects the consumer before rethrowing.
 */
export async function buildGroupConsumer(
  options: BuildGroupConsumerOptions
): Promise<KafkaConsumer> {
  const consumer = createConsumer(options.groupId);
  try {
    await consumer.connect();
    if (options.shouldAbort()) throw new ConsumerGroupCancelledError();
    await consumer.subscribe({ topics: options.topics });
    await consumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: createPluginEachMessage({
        consumer,
        installId: options.installId,
        tenantId: options.tenantId,
        pluginId: options.pluginId,
        groupId: options.groupId,
        handler: options.handler,
      }),
    });
    await waitForConsumerAssignment(consumer, 15000);
    if (options.shouldAbort()) throw new ConsumerGroupCancelledError();
  } catch (error) {
    try {
      await disconnectConsumerWithBudget(consumer);
    } catch {
      logger.debug(
        { code: 'KAFKA_CONSUMER_DISCONNECT_FAILED', groupId: options.groupId },
        'Consumer disconnect failed'
      );
    }
    throw error;
  }
  return consumer;
}
