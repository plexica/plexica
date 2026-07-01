// events/dlq-consumer.ts
// Reads from Kafka DLQ topic and populates the core.dead_letter_queue DB table.
// Required per Spec 004 §13 Implementation Scope and DR-17 (Two-tier DLQ).
// Tier 2 bridge: Kafka DLQ topic → DB table for management UI.
// Deduplication: checks (eventType, correlationId, failedAt) before inserting.

import { createConsumer } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

import { persistDlqEntryDedup } from './dlq.service.js';

const DLQ_TOPIC = 'plexica.plugin.dlq';
const CONSUMER_GROUP_ID = 'plexica-dlq-consumer';

let consumer: ReturnType<typeof createConsumer> | null = null;
let isRunning = false;

interface DlqMessage {
  eventType: string;
  payload: unknown;
  pluginId: string;
  errorMessage: string;
  retryCount: number;
  correlationId?: string | undefined;
  failedAt?: string | undefined;
}

async function handleDlqMessage(data: DlqMessage, topic: string): Promise<void> {
  const { prisma } = await import('../../../lib/database.js');
  const failedAt = data.failedAt ? new Date(data.failedAt) : new Date();
  await persistDlqEntryDedup(prisma, {
    eventType: data.eventType ?? topic,
    payload: data.payload,
    pluginId: data.pluginId ?? 'unknown',
    errorMessage: data.errorMessage ?? 'Unknown error',
    retryCount: data.retryCount ?? 0,
    failedAt,
  });
}

export async function startDlqConsumer(): Promise<void> {
  if (isRunning) return;

  consumer = createConsumer(CONSUMER_GROUP_ID);
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() ?? '{}');
          await handleDlqMessage(payload as DlqMessage, topic);
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
