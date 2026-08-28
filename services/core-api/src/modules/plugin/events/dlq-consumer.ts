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
import { disconnectConsumerWithBudget } from '../../../lib/kafka-shutdown.js';
import { logger } from '../../../lib/logger.js';

import type { PrismaClient } from '@prisma/client';

const CONSUMER_GROUP_ID = 'plexica-system-dlq-processor';
const STALE_GEN = 'KAFKA_COMMIT_STALE_GENERATION';
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

// Malformed JSON is permanent poison — never retried, or it blocks the bridge forever.
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
    // Conservative: any non-transient decrypt failure on an active tenant is poison.
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
        const stale = (): boolean =>
          getConsumerGeneration(activeConsumer) !== generation ||
          !isAssigned(activeConsumer, topic, partition);
        const task = (async () => {
          try {
            await handleDlqMessage(prisma, parseDlqPayload(message.value?.toString() ?? ''));
            // Pre-check before commit (KJM-009): never commit stale work.
            if (stale()) throw new Error(STALE_GEN);
            await commitOffsetGuarded(activeConsumer, topic, partition, nextOffset);
          } catch (error) {
            if (error instanceof PermanentDlqError) {
              logger.error(
                { topic, partition, offset, code: error.code },
                'DLQ bridge permanent error detected'
              );
              if (stale()) throw new Error(STALE_GEN);
              try {
                await commitOffsetGuarded(activeConsumer, topic, partition, nextOffset);
              } catch (commitError) {
                // Rebalance landed during the commit round-trip; the client already committed.
                if (String((commitError as Error).message ?? '').includes(STALE_GEN)) {
                  logger.error({ code: 'DLQ_POISON_COMMIT_STALE' }, 'DLQ poison commit stale');
                  return;
                }
                throw commitError;
              }
              logger.error(
                { topic, partition, offset, code: error.code },
                'DLQ bridge permanent error skipped'
              );
              return;
            }
            if (String((error as Error).message ?? '').includes(STALE_GEN)) throw error;
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
      await disconnectConsumerWithBudget(consumer);
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
    await disconnectConsumerWithBudget(consumer);
  } catch {
    logger.error({ code: 'DLQ_DISCONNECT_FAILED' }, 'Failed to disconnect DLQ bridge');
  }
  consumer = null;
  isRunning = false;
}
