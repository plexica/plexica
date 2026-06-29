// events/dlq.service.ts
// Dead Letter Queue management — Kafka topic + DB table (per ADR-016).
// Writes to Kafka DLQ topic (Tier 1, streaming) and directly to DB (Tier 2, fallback).
// The dlq-consumer reads from the Kafka topic as the primary DB population path.

import { emitEvent, Topics } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

/**
 * Moves a failed event to the Dead Letter Queue.
 * Tier 1: Kafka DLQ topic (streaming, durable — consumed by dlq-consumer).
 * Tier 2: Direct DB write (fallback — ensures management UI is populated even if dlq-consumer lags).
 */
export async function moveToDlq(
  installId: string,
  eventType: string,
  payload: Record<string, unknown>,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  // Tier 1: Kafka DLQ topic (streaming, durable)
  try {
    await emitEvent(Topics.dlq, {
      eventType,
      payload,
      pluginId: installId,
      errorMessage,
      retryCount,
      originalTimestamp: (payload as Record<string, unknown>)['_metadata'],
    });
  } catch (err) {
    logger.error({ err, installId, eventType }, 'Failed to move event to DLQ topic');
  }

  // Tier 2: Direct DB write (fallback — dlq-consumer also reads from Kafka as primary path)
  try {
    const { prisma } = await import('../../../lib/database.js');
    await prisma.deadLetterQueue.create({
      data: {
        eventType,
        payload: payload as Record<string, unknown>,
        pluginId: installId,
        errorMessage,
        retryCount,
        status: 'pending',
        failedAt: new Date(),
      },
    });
    logger.info({ installId, eventType }, 'DLQ entry persisted directly to DB');
  } catch (err) {
    logger.error({ err, installId, eventType }, 'Failed to persist DLQ entry directly to DB');
  }
}

/**
 * Retries a DLQ entry by re-emitting the event to the original topic.
 * Called from the super admin DLQ management UI.
 */
export async function retryDlqEntry(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Determine original topic from event type
  const segment = eventType.split('.').slice(1).join('.');
  const originalTopic = `plexica.${segment}`;

  await emitEvent(originalTopic, payload);
  logger.info({ eventType, originalTopic }, 'DLQ entry retried');
}
