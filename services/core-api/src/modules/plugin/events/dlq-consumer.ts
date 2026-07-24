import { Prisma } from '@prisma/client';

import { dlqDedupeKey, dlqPayloadSchema } from '../../../events/dlq-contract.js';
import { decryptWireEvent } from '../../../events/event-crypto.js';
import { getTenantEventKey } from '../../../events/event-key-service.js';
import { wireEventEnvelopeSchema } from '../../../events/event-envelope.js';
import { createConsumer, Topics } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';

import type { PrismaClient } from '@prisma/client';

const CONSUMER_GROUP_ID = 'plexica-system-dlq-processor';
let consumer: ReturnType<typeof createConsumer> | null = null;
let isRunning = false;

export async function persistDlqEntry(
  db: PrismaClient,
  input: unknown
): Promise<boolean> {
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

// Permanent errors that cannot be resolved by retrying the same record.
// Committing the offset skips the poison pill instead of blocking the bridge.
class PermanentDlqError extends Error {
  constructor(readonly code: string) {
    super(code);
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
    where: { id: wire.tenantId }, select: { status: true },
  });
  if (tenant?.status !== 'active') return false;
  let outer;
  try {
    const key = await getTenantEventKey(db, wire.tenantId, wire.encryption.keyVersion);
    outer = decryptWireEvent(wire, key);
  } catch {
    const current = await db.tenant.findUnique({
      where: { id: wire.tenantId }, select: { status: true },
    });
    if (current?.status !== 'active') return false;
    // Decrypt failure for an active tenant is permanent — the key is destroyed
    // or corrupted. Retrying will never succeed; skip to avoid a poison pill.
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
  await consumer.connect();
  await consumer.subscribe({ topic: Topics.dlq, fromBeginning: false });
  const activeConsumer = consumer;
  await activeConsumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = (BigInt(message.offset) + 1n).toString();
      try {
        await handleDlqMessage(prisma, JSON.parse(message.value?.toString() ?? ''));
        await activeConsumer.commitOffsets([{ topic, partition, offset }]);
      } catch (error) {
        if (error instanceof PermanentDlqError) {
          // Permanent errors (identity mismatch, schema invalid, decrypt
          // failure for active tenant) cannot be resolved by retrying.
          // Commit the offset to skip the poison pill and keep the bridge
          // running for all other tenants. Alert via structured log.
          logger.error(
            { topic, partition, offset: message.offset, code: error.code },
            'DLQ bridge skipping permanent error record'
          );
          await activeConsumer.commitOffsets([{ topic, partition, offset }]);
          return;
        }
        // Transient errors (DB connection, Kafka producer) — re-throw so
        // kafkajs retries the same record after backoff.
        logger.error({ topic, partition, offset: message.offset }, 'DLQ bridge transient failure');
        throw error;
      }
    },
  });
  isRunning = true;
  logger.info('DLQ bridge consumer started');
}

export async function stopDlqConsumer(): Promise<void> {
  if (!consumer) return;
  try {
    await consumer.disconnect();
  } catch {
    logger.error({ code: 'DLQ_DISCONNECT_FAILED' }, 'Failed to disconnect DLQ bridge');
  }
  consumer = null;
  isRunning = false;
}
