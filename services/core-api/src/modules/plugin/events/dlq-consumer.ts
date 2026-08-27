import { Prisma } from '@prisma/client';

import { dlqDedupeKey, dlqPayloadSchema } from '../../../events/dlq-contract.js';
import { decryptWireEvent } from '../../../events/event-crypto.js';
import { getTenantEventKey } from '../../../events/event-key-service.js';
import { wireEventEnvelopeSchema } from '../../../events/event-envelope.js';
import { createConsumer, Topics } from '../../../lib/kafka.js';
import {
  awaitOwnedHandlers,
  commitOffsetGuarded,
  getConsumerGeneration,
  isAssigned,
  trackHandler,
  waitForConsumerAssignment,
} from '../../../lib/kafka-consumer.js';
import { isRetriablePrismaError } from '../../../lib/kafka-errors.js';
import { logger } from '../../../lib/logger.js';

import type { PrismaClient } from '@prisma/client';

const CONSUMER_GROUP_ID = 'plexica-system-dlq-processor';
let consumer: ReturnType<typeof createConsumer> | null = null;
let isRunning = false;

export async function persistDlqEntry(db: PrismaClient, input: unknown): Promise<boolean> {
  const data = dlqPayloadSchema.parse(input);
  const dedupeKey = dlqDedupeKey(data.installId, data.source);
  return db.$transaction(async (tx) => {
    const tenant = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT status::text AS status FROM core.tenants
      WHERE id = ${data.tenantId}::uuid FOR UPDATE
    `);
    if (tenant[0]?.status !== 'active') return false;
    const count = await tx.$executeRaw(Prisma.sql`
      INSERT INTO core.dead_letter_queue (
        tenant_id, install_id, event_id, event_type, schema_version, payload,
        plugin_id, error_message, retry_count, original_topic,
        original_partition, original_offset, dedupe_key, status, failed_at
      ) VALUES (
        ${data.tenantId}::uuid, ${data.installId}::uuid, ${data.event.eventId}::uuid,
        ${data.event.type}, ${data.event.schemaVersion},
        ${JSON.stringify(data.event)}::jsonb, ${data.pluginId}::uuid,
        ${data.errorDetail ?? data.errorCode}, ${data.retryCount}, ${data.source.topic},
        ${data.source.partition}, ${data.source.offset}::bigint, ${dedupeKey},
        'pending', now()
      ) ON CONFLICT (dedupe_key) DO NOTHING
    `);
    return count === 1;
  });
}

class PermanentDlqError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Parses the raw DLQ bridge message. Malformed JSON is permanent poison — it
 * must never be retried (it would block the bridge forever). Throws
 * PermanentDlqError so the caller commits and skips the record.
 */
export function parseDlqPayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new PermanentDlqError('DLQ_ENVELOPE_SCHEMA_INVALID');
  }
}

export async function handleDlqMessage(db: PrismaClient, input: unknown): Promise<boolean> {
  let wire;
  try {
    wire = wireEventEnvelopeSchema.parse(input);
  } catch {
    throw new PermanentDlqError('DLQ_ENVELOPE_SCHEMA_INVALID');
  }
  const tenant = await db.tenant.findUnique({
    where: { id: wire.tenantId },
    select: { status: true },
  });
  if (tenant?.status !== 'active') return false;
  let outer;
  try {
    const key = await getTenantEventKey(db, wire.tenantId, wire.encryption.keyVersion);
    outer = decryptWireEvent(wire, key);
  } catch (error) {
    const current = await db.tenant.findUnique({
      where: { id: wire.tenantId },
      select: { status: true },
    });
    if (current?.status !== 'active') return false;
    if (isRetriablePrismaError(error)) throw error;
    const msg = error instanceof Error ? error.message : '';
    if (
      msg === 'Tenant event key is unavailable' ||
      msg === 'Tenant event key material is unavailable'
    ) {
      throw new PermanentDlqError('DLQ_DECRYPT_FAILED');
    }
    // Unknown decrypt failure for active tenant: treat as transient unless proven permanent.
    // But if it's an auth tag failure, decryptWireEvent will throw with native crypto error;
    // that is permanent poison — commit after sanitized handling. We conservatively treat
    // any non-transient crypto error as permanent to avoid blocking bridge.
    if (error instanceof PermanentDlqError) throw error;
    throw new PermanentDlqError('DLQ_DECRYPT_FAILED');
  }
  let payload;
  try {
    payload = dlqPayloadSchema.parse(outer.payload);
  } catch {
    throw new PermanentDlqError('DLQ_PAYLOAD_SCHEMA_INVALID');
  }
  if (outer.eventId !== payload.event.eventId || outer.tenantId !== payload.tenantId) {
    throw new PermanentDlqError('DLQ_IDENTITY_MISMATCH');
  }
  return persistDlqEntry(db, payload);
}

export async function startDlqConsumer(): Promise<void> {
  if (isRunning) return;
  const { prisma } = await import('../../../lib/database.js');
  consumer = createConsumer(CONSUMER_GROUP_ID);
  try {
    await consumer.connect();
    await consumer.subscribe({ topics: [Topics.dlq] });
    const activeConsumer = consumer;
    await activeConsumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: ({ topic, partition, message }) => {
        const offset = message.offset;
        const nextOffset = (BigInt(offset) + 1n).toString();
        const generation = getConsumerGeneration(activeConsumer);
        const task = (async () => {
          try {
            await handleDlqMessage(prisma, parseDlqPayload(message.value?.toString() ?? ''));
            // Pre-check before commit (KJM-009): never commit stale work.
            if (
              getConsumerGeneration(activeConsumer) !== generation ||
              !isAssigned(activeConsumer, topic, partition)
            )
              throw new Error('KAFKA_COMMIT_STALE_GENERATION');
            await commitOffsetGuarded(activeConsumer, topic, partition, nextOffset);
          } catch (error) {
            if (error instanceof PermanentDlqError) {
              logger.error(
                { topic, partition, offset, code: error.code },
                'DLQ bridge permanent error detected'
              );
              if (
                getConsumerGeneration(activeConsumer) !== generation ||
                !isAssigned(activeConsumer, topic, partition)
              )
                throw new Error('KAFKA_COMMIT_STALE_GENERATION');
              await commitOffsetGuarded(activeConsumer, topic, partition, nextOffset);
              logger.error(
                { topic, partition, offset, code: error.code },
                'DLQ bridge permanent error skipped'
              );
              return;
            }
            if (String((error as Error).message ?? '').includes('KAFKA_COMMIT_STALE_GENERATION'))
              throw error;
            logger.error(
              { topic, partition, offset, code: 'DLQ_BRIDGE_TRANSIENT' },
              'DLQ bridge transient failure'
            );
            throw error;
          }
        })();
        trackHandler(activeConsumer, task);
        return task;
      },
    });
    await waitForConsumerAssignment(activeConsumer, 15000);
  } catch (error) {
    try {
      await awaitOwnedHandlers(consumer);
      await consumer.disconnect();
    } catch {
      // ignore
    }
    consumer = null;
    throw error;
  }
  isRunning = true;
  logger.info('DLQ bridge consumer started');
}

export async function stopDlqConsumer(): Promise<void> {
  if (!consumer) return;
  try {
    await awaitOwnedHandlers(consumer);
    await consumer.disconnect();
  } catch {
    logger.error({ code: 'DLQ_DISCONNECT_FAILED' }, 'Failed to disconnect DLQ bridge');
  }
  consumer = null;
  isRunning = false;
}
