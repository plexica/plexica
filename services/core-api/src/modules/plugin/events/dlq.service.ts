// events/dlq.service.ts
// Dead Letter Queue management — Kafka topic + DB table (per ADR-016).

import { emitEvent, Topics } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

/**
 * Moves a failed event to the Dead Letter Queue.
 * Writes to Kafka DLQ topic (streaming) + DB table (for management UI).
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

  // Tier 2: DB table (for management UI) — populated by dlq-consumer
  logger.warn({ installId, eventType, errorMessage, retryCount }, 'Event moved to DLQ');
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
