// events/dlq-consumer.ts
// Reads from Kafka DLQ topic and populates the core.dead_letter_queue DB table.
// Required per Spec 004 §13 Implementation Scope and DR-17 (Two-tier DLQ).
// Tier 2 bridge: Kafka DLQ topic → DB table for management UI.

import { createConsumer } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

const DLQ_TOPIC = 'plexica.plugin.dlq';
const CONSUMER_GROUP_ID = 'plexica-dlq-consumer';

let consumer: ReturnType<typeof createConsumer> | null = null;
let isRunning = false;

async function persistDlqEntry(data: {
  eventType: string;
  payload: unknown;
  pluginId: string;
  errorMessage: string;
  retryCount: number;
}): Promise<void> {
  const { prisma } = await import('../../../lib/database.js');
  await prisma.deadLetterQueue.create({
    data: {
      eventType: data.eventType,
      payload: data.payload,
      pluginId: data.pluginId,
      errorMessage: data.errorMessage,
      retryCount: data.retryCount,
      status: 'pending',
      failedAt: new Date(),
    },
  });
}

export async function startDlqConsumer(): Promise<void> {
  if (isRunning) return;

  consumer = createConsumer(CONSUMER_GROUP_ID, [DLQ_TOPIC], async (topic, payload) => {
    try {
      const typed = payload as Record<string, unknown>;
      await persistDlqEntry({
        eventType: (typed.eventType as string) ?? topic,
        payload: typed.payload ?? payload,
        pluginId: (typed.pluginId as string) ?? 'unknown',
        errorMessage: (typed.errorMessage as string) ?? 'Unknown error',
        retryCount: (typed.retryCount as number) ?? 0,
      });
      logger.debug({ topic, eventType: typed.eventType }, 'DLQ entry persisted to DB');
    } catch (err) {
      logger.error({ err, topic }, 'Failed to persist DLQ entry to DB');
    }
  });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() ?? '{}');
          await persistDlqEntry({
            eventType: (payload.eventType as string) ?? topic,
            payload: payload.payload ?? payload,
            pluginId: (payload.pluginId as string) ?? 'unknown',
            errorMessage: (payload.errorMessage as string) ?? 'Unknown error',
            retryCount: (payload.retryCount as number) ?? 0,
          });
          logger.info({ eventType: payload.eventType, pluginId: payload.pluginId }, 'DLQ event persisted to DB');
        } catch (err) {
          logger.error({ err, topic }, 'Failed to process DLQ message');
        }
      },
    });
    isRunning = true;
    logger.info('DLQ consumer started — reading from plexica.plugin.dlq');
  } catch (err) {
    logger.error({ err }, 'Failed to start DLQ consumer');
    throw err;
  }
}

export async function stopDlqConsumer(): Promise<void> {
  if (!consumer || !isRunning) return;
  try {
    await consumer.disconnect();
  } catch (err) {
    logger.error({ err }, 'Failed to disconnect DLQ consumer');
  }
  consumer = null;
  isRunning = false;
  logger.info('DLQ consumer stopped');
}
