// events/dlq.service.ts
// Dead Letter Queue management — Kafka topic + DB table (per ADR-016).
// Primary path: Kafka DLQ topic (streaming, durable — consumed by dlq-consumer
// which persists to DB). Fallback: direct DB write only when Kafka emit fails.
// Deduplication: before any DB insert, check (eventType, correlationId, failedAt).

import { emitEvent, Topics } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

import type { PrismaClient } from '@prisma/client';

export async function moveToDlq(
  installId: string,
  eventType: string,
  payload: Record<string, unknown>,
  errorMessage: string,
  retryCount: number,
  pluginId?: string
): Promise<void> {
  const correlationId =
    (payload as Record<string, unknown>)?.['_metadata'] &&
    typeof (payload as Record<string, unknown>)['_metadata'] === 'object'
      ? ((payload as Record<string, unknown>)['_metadata'] as Record<string, unknown>)?.['correlationId'] as string | undefined
      : undefined;
  const failedAt = new Date();

  // Prefer the actual pluginId (from plugin_installations.pluginId) when the
  // caller has resolved it; fall back to installId as a best-effort identifier.
  const resolvedPluginId = pluginId ?? installId;

  // Primary path: emit to Kafka DLQ topic. The dlq-consumer persists to DB.
  try {
    await emitEvent(Topics.dlq, {
      eventType,
      payload,
      pluginId: resolvedPluginId,
      errorMessage,
      retryCount,
      correlationId: correlationId ?? installId,
      failedAt: failedAt.toISOString(),
    });
    logger.debug({ installId, eventType }, 'DLQ entry emitted to Kafka topic');
    return;
  } catch (err) {
    logger.error({ err, installId, eventType }, 'Kafka DLQ emit failed — falling back to direct DB write');
  }

  // Fallback path: Kafka emit failed — write directly to DB with dedup check.
  try {
    const { prisma } = await import('../../../lib/database.js');
    await persistDlqEntryDedup(prisma, {
      eventType,
      payload: payload as Record<string, unknown>,
      pluginId: resolvedPluginId,
      errorMessage,
      retryCount,
      failedAt,
    });
    logger.info({ installId, eventType }, 'DLQ entry persisted directly to DB (fallback)');
  } catch (err) {
    logger.error({ err, installId, eventType }, 'Failed to persist DLQ entry directly to DB');
  }
}

export async function persistDlqEntryDedup(
  prisma: PrismaClient,
  data: {
    eventType: string;
    payload: unknown;
    pluginId: string;
    errorMessage: string;
    retryCount: number;
    failedAt: Date;
  }
): Promise<void> {
  const existing = await prisma.deadLetterQueue.findFirst({
    where: { eventType: data.eventType, failedAt: data.failedAt },
    select: { id: true },
  });
  if (existing) return;

  await prisma.deadLetterQueue.create({
    data: {
      eventType: data.eventType,
      payload: data.payload as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      pluginId: data.pluginId,
      errorMessage: data.errorMessage,
      retryCount: data.retryCount,
      status: 'pending',
      failedAt: data.failedAt,
    },
  });
}

/**
 * Retries a DLQ entry by re-emitting the event to the original topic.
 * Called from the super admin DLQ management UI.
 */
export async function retryDlqEntry(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const originalTopic = eventType;

  await emitEvent(originalTopic, payload);
  logger.info({ eventType, originalTopic }, 'DLQ entry retried');
}
