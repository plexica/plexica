// consumer-dlq.ts
// Dead-lettering for core notification consumer failures (ADR-016). Core
// consumers carry no plugin install context, so a reserved synthetic install id
// keys the dedupe; the storage tier (core.dead_letter_queue) is shared with
// plugin DLQ entries. Write is idempotent (ON CONFLICT dedupe_key DO NOTHING).
// ADR-016 amendment: error detail is a bounded code + Prisma code / error name
// only — never raw driver message text (which can embed interpolated values).

import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

import type { DomainEventEnvelope, WireEventEnvelope } from '../../events/event-envelope.js';
import type { SourceCoordinates } from '../../events/dlq-contract.js';

/** Reserved install id for core-sourced DLQ entries (not a real installation). */
export const NOTIFICATION_CONSUMER_INSTALL_ID = '00000000-0000-4000-8000-000000000001';

function dedupeKey(source: SourceCoordinates): string {
  return createHash('sha256')
    .update(
      `${NOTIFICATION_CONSUMER_INSTALL_ID}\n${source.topic}\n${source.partition}\n${source.offset}`
    )
    .digest('hex');
}

/**
 * Bounded error detail for the DLQ: `CODE:PrismaP-code-or-ErrorName`. No raw
 * message text — Prisma/driver errors can embed interpolated values (ADR-016
 * amendment §Security: error fields contain codes and bounded sanitized text).
 */
export function dlqErrorDetail(code: string, error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const prismaCode = (error as { code?: unknown })?.code;
  return `${code}:${typeof prismaCode === 'string' ? prismaCode : name}`.slice(0, 512);
}

export async function moveToNotificationDlq(
  event: DomainEventEnvelope,
  source: SourceCoordinates,
  errorCode: string,
  errorDetail?: string,
  retryCount = 1
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO core.dead_letter_queue (
      tenant_id, install_id, event_id, event_type, schema_version, payload,
      error_message, retry_count, original_topic, original_partition,
      original_offset, dedupe_key, status, failed_at
    ) VALUES (
      ${event.tenantId}::uuid, ${NOTIFICATION_CONSUMER_INSTALL_ID}::uuid,
      ${event.eventId}::uuid, ${event.type}, ${event.schemaVersion},
      ${JSON.stringify(event)}::jsonb, ${errorDetail ?? errorCode},
      ${retryCount}, ${source.topic}, ${source.partition}, ${source.offset}::bigint,
      ${dedupeKey(source)}, 'pending', now()
    )
    ON CONFLICT (dedupe_key) DO NOTHING
  `);
  logger.error(
    { eventId: event.eventId, tenantId: event.tenantId, errorCode },
    'Notification event dead-lettered'
  );
}

/**
 * Dead-letters a message that failed BEFORE decryption (wire envelope only).
 * The wire metadata (eventId/tenantId/type) is available before decryption, so
 * a decrypt failure is a permanent poison record — never committed silently.
 * retryCount is 0 (no processing attempt ever ran), matching the plugin
 * consumer's malformed/decrypt DLQ convention.
 */
export async function moveWireToNotificationDlq(
  wire: WireEventEnvelope,
  source: SourceCoordinates,
  errorCode: string
): Promise<void> {
  const synthetic: DomainEventEnvelope = {
    eventId: wire.eventId,
    type: wire.type,
    schemaVersion: wire.schemaVersion,
    tenantId: wire.tenantId,
    occurredAt: wire.occurredAt,
    producer: wire.producer,
    correlationId: wire.correlationId,
    causationId: wire.causationId,
    payload: {},
  };
  await moveToNotificationDlq(synthetic, source, errorCode, undefined, 0);
}
