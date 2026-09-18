// email-queue.service.ts
// Durable SMTP retry queue over core.email_queue (ADR-035, feature 006-03).
// enqueue/claim/settle with SKIP LOCKED claim semantics, a lease on claimed
// rows (claimed_at + lease_expires_at, mirroring the outbox lease pattern in
// events/outbox-repository.ts), and event_id-keyed idempotent enqueue. A crash
// between claim and settle cannot orphan a row forever: the claim re-claims
// `sending` rows whose lease expired. to_address is never logged (§6).

import { Prisma } from '@prisma/client';

import { logger } from '../../lib/logger.js';

import { sanitizeEmailError } from './email-error-sanitize.js';

import type { PrismaClient } from '@prisma/client';
import type { EmailQueueRow } from './types.js';

export { redactEmail, sanitizeEmailError } from './email-error-sanitize.js';

export interface EmailEnqueueInput {
  tenantId?: string;
  toAddress: string;
  subject: string;
  htmlBody: string;
  emailType: string;
  /** Consumer event_id — makes the enqueue idempotent (ON CONFLICT DO NOTHING). */
  eventId?: string;
}

export type EmailSettleUpdate =
  | { status: 'sent'; sentAt: Date }
  | { status: 'failed'; attempts: number; nextAttemptAt: Date; lastError: unknown }
  | { status: 'dead'; attempts: number; lastError: unknown };

/** Raw-SQL executor (core PrismaClient or a tenant tx client both satisfy this). */
export interface RawSqlClient {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

/**
 * Idempotent insert into core.email_queue usable from ANY client that can run
 * raw SQL — including inside a tenant `$transaction` (cross-schema write,
 * same pattern as outbox-repository.enqueueEvent). When `eventId` is set the
 * row is keyed by the unique `dedupe_key` with `ON CONFLICT DO NOTHING`, so a
 * consumer redelivery after a crash cannot double-enqueue (F6 recoverability).
 */
export async function enqueueEmailRaw(
  client: RawSqlClient,
  input: EmailEnqueueInput
): Promise<string | null> {
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO core.email_queue (
      tenant_id, to_address, subject, html_body, email_type, status, attempts,
      next_attempt_at, dedupe_key
    ) VALUES (
      ${input.tenantId ?? null}::uuid, ${input.toAddress}, ${input.subject},
      ${input.htmlBody}, ${input.emailType}, 'pending', 0, now(),
      ${input.eventId ?? null}
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `);
  return rows[0]?.id ?? null;
}

interface EmailQueueSqlRow {
  id: string;
  tenantId: string | null;
  toAddress: string;
  subject: string;
  htmlBody: string;
  emailType: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  dedupeKey: string | null;
}

function toRow(row: EmailQueueSqlRow): EmailQueueRow {
  return row;
}

export class EmailQueueService {
  constructor(private readonly db: PrismaClient) {}

  /** Idempotent enqueue (dedupe_key = eventId); returns null on conflict. */
  async enqueue(input: EmailEnqueueInput): Promise<string | null> {
    const id = await enqueueEmailRaw(this.db, input);
    if (id !== null) logger.debug({ id, emailType: input.emailType }, 'Email enqueued');
    return id;
  }

  /**
   * Claims up to `batchSize` due rows atomically: `UPDATE ... RETURNING` with
   * `FOR UPDATE SKIP LOCKED` moves them to `sending` so a concurrent worker or
   * crash never double-sends. Candidates are `pending`/`failed` rows whose
   * `next_attempt_at` is due PLUS `sending` rows whose lease has expired
   * (crash between claim and settle). The lease mirrors the outbox pattern:
   * `claimed_at` + `lease_expires_at` are stamped on claim and cleared on
   * settle.
   */
  async claim(batchSize = 10, now = new Date(), leaseMs = 60_000): Promise<EmailQueueRow[]> {
    const rows = await this.db.$queryRaw<EmailQueueSqlRow[]>(Prisma.sql`
      UPDATE core.email_queue AS queue
      SET status = 'sending',
          claimed_at = now(),
          lease_expires_at = now() + (${leaseMs} * interval '1 millisecond')
      FROM (
        SELECT candidate.id
        FROM core.email_queue AS candidate
        LEFT JOIN core.tenants AS tenant ON tenant.id = candidate.tenant_id
        WHERE (
            candidate.tenant_id IS NULL
            OR tenant.status::text = 'active'
          )
          AND (
            (
              candidate.status IN ('pending', 'failed')
              AND candidate.next_attempt_at <= ${now}::timestamptz
            )
            OR (
              candidate.status = 'sending'
              AND candidate.lease_expires_at IS NOT NULL
              AND candidate.lease_expires_at <= ${now}::timestamptz
            )
          )
        ORDER BY candidate.next_attempt_at
        FOR UPDATE OF candidate SKIP LOCKED
        LIMIT ${batchSize}
      ) AS claimed
      WHERE queue.id = claimed.id
      RETURNING queue.id, queue.tenant_id AS "tenantId", queue.to_address AS "toAddress",
        queue.subject, queue.html_body AS "htmlBody", queue.email_type AS "emailType",
        queue.status, queue.attempts, queue.next_attempt_at AS "nextAttemptAt",
        queue.last_error AS "lastError", queue.created_at AS "createdAt",
        queue.sent_at AS "sentAt", queue.claimed_at AS "claimedAt",
        queue.lease_expires_at AS "leaseExpiresAt", queue.dedupe_key AS "dedupeKey"
    `);
    return rows.map(toRow);
  }

  /** Marks the row sent / failed (schedules retry) / dead (dead-lettered). */
  async settle(id: string, update: EmailSettleUpdate): Promise<void> {
    if (update.status === 'sent') {
      await this.db.emailQueue.update({
        where: { id },
        data: {
          status: 'sent',
          sentAt: update.sentAt,
          lastError: null,
          claimedAt: null,
          leaseExpiresAt: null,
        },
      });
      return;
    }
    // ADR-035 invariant enforced at the persistence boundary: last_error is
    // sanitized here (not just by callers) so no future caller can persist PII.
    const lastError = sanitizeEmailError(update.lastError);
    await this.db.emailQueue.update({
      where: { id },
      data: {
        status: update.status,
        attempts: update.attempts,
        lastError,
        claimedAt: null,
        leaseExpiresAt: null,
        ...(update.status === 'failed' ? { nextAttemptAt: update.nextAttemptAt } : {}),
      },
    });
  }

  async countPending(now = new Date()): Promise<number> {
    return this.db.emailQueue.count({
      where: { status: 'pending', nextAttemptAt: { lte: now } },
    });
  }

  async countDead(): Promise<number> {
    return this.db.emailQueue.count({ where: { status: 'dead' } });
  }
}
