// events/consumer-plugin-handler.ts
// Plugin eachMessage factory — shared commit/process semantics for plugin groups.

import { processAndCommit } from '../../../lib/kafka-consumer.js';
import { logger } from '../../../lib/logger.js';

import { processInstallationMessage } from './installation-message-processor.js';

import type { SourceCoordinates } from '../../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../../events/event-envelope.js';
import type { KafkaConsumer } from '../../../lib/kafka-client.js';

type EventHandler = (event: DomainEventEnvelope, source: SourceCoordinates) => Promise<void>;

export function createPluginEachMessage(input: {
  consumer: KafkaConsumer;
  installId: string;
  tenantId: string;
  pluginId: string;
  groupId: string;
  handler: EventHandler;
}): (payload: {
  topic: string;
  partition: number;
  message: { offset: string; value: Buffer | null };
}) => Promise<void> {
  const { consumer, installId, tenantId, pluginId, groupId, handler } = input;
  return ({ topic, partition, message }) => {
    const offset = message.offset;
    const value = message.value?.toString() ?? '';
    return processAndCommit(consumer, topic, partition, offset, async () => {
      try {
        await processInstallationMessage({
          installId,
          tenantId,
          pluginId,
          source: { topic, partition, offset },
          value,
          handler,
        });
      } catch (error) {
        logger.warn(
          { code: 'KAFKA_CONSUMER_HANDLER_FAILED', groupId, topic, partition, offset },
          'Plugin event handler failed — will retry'
        );
        throw error;
      }
    });
  };
}
