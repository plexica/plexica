// email-queue.service.ts
// Durable SMTP retry queue over core.email_queue (ADR-035, feature 006-03):
// SKIP LOCKED claim with a lease, event_id-keyed idempotent enqueue, and
// effectively-once delivery (CodeRabbit #10) — markDelivered() stamps
// delivered_at on send success, claim() never re-claims a delivered row, and
// retireDelivered() retires delivered-but-unsettled rows without re-sending.
// to_address is never logged (§6).

import { Prisma } from '@prisma/client';

import { logger } from '../../lib/logger.js';

import { settleEmailQueue } from './email-queue-settle.js';

import type { PrismaClient } from '@prisma/client';
import type { EmailQueueRow } from './types.js';
import type { EmailSettleUpdate } from './email-queue-settle.js';

export { redactEmail, sanitizeEmailError } from './email-error-sanitize.js';
export type { EmailSettleUpdate } from './email-queue-settle.js';

export interface EmailEnqueueInput {
  tenantId?: string;
  toAddress: string;
  subject: string;
  htmlBody: string;
  emailType: string;
  /** Consumer event_id — makes the enqueue idempotent (ON CONFLICT DO NOTHING). */
  eventId?: string;
}

/** Raw-SQL executor (core PrismaClient or a tenant tx client both satisfy this). */
export interface RawSqlClient {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

/**
 * Idempotent insert into core.email_queue, usable from ANY raw-SQL client
 * (core or tenant tx). With `eventId` the row is dedupe_key-keyed via
 * ON CONFLICT DO NOTHING so a redelivery cannot double-enqueue.
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
  deliveredAt: Date | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  leaseToken: string;
  dedupeKey: string | null;
}

function toRow(row: EmailQueueSqlRow): EmailQueueRow {
  return row;
}

export class EmailQueueService {
  constructor(protected readonly db: PrismaClient) {}

  /** Idempotent enqueue (dedupe_key = eventId); returns null on conflict. */
  async enqueue(input: EmailEnqueueInput): Promise<string | null> {
    const id = await enqueueEmailRaw(this.db, input);
    if (id !== null) logger.debug({ id, emailType: input.emailType }, 'Email enqueued');
    return id;
  }

  /**
   * Claims up to `batchSize` due rows atomically (UPDATE ... RETURNING, SKIP
   * LOCKED): pending/failed rows whose next_attempt_at is due PLUS `sending`
   * rows whose lease expired (crash recovery). Rows with delivered_at set are
   * NEVER re-claimed (CodeRabbit #10) — a delivered email is never re-sent;
   * retireDelivered() retires them instead.
   */
  async claim(batchSize = 10, now = new Date(), leaseMs = 60_000): Promise<EmailQueueRow[]> {
    // Per-batch fencing token: every settle/retry predicates on it, so a stale
    // holder cannot overwrite a row a successor re-claimed after lease expiry.
    const leaseToken = crypto.randomUUID();
    const rows = await this.db.$queryRaw<EmailQueueSqlRow[]>(Prisma.sql`
      UPDATE core.email_queue AS queue
      SET status = 'sending',
          lease_token = ${leaseToken}::uuid,
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
          AND candidate.delivered_at IS NULL
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
        queue.sent_at AS "sentAt", queue.delivered_at AS "deliveredAt",
        queue.claimed_at AS "claimedAt", queue.lease_expires_at AS "leaseExpiresAt",
        queue.lease_token AS "leaseToken", queue.dedupe_key AS "dedupeKey"
    `);
    return rows.map(toRow);
  }

  /**
   * Writes the delivered_at marker on send success, fenced by the lease_token
   * (CodeRabbit #10): a crash or settle failure after delivery can never cause
   * a re-claim re-send. False = stale claim — do NOT settle or re-send.
   */
  async markDelivered(id: string, leaseToken: string): Promise<boolean> {
    const count = await this.db.$executeRaw(Prisma.sql`
      UPDATE core.email_queue
      SET delivered_at = now()
      WHERE id = ${id}::uuid
        AND lease_token = ${leaseToken}::uuid
        AND delivered_at IS NULL
    `);
    return count === 1;
  }

  /**
   * Housekeeping (CodeRabbit #10): retires a delivered-but-unsettled row
   * (delivered_at set, lease expired — the holder delivered then crashed before
   * settle) to `sent` WITHOUT re-sending. Lease-expiry guard prevents racing a
   * live holder mid-settle.
   */
  async retireDelivered(now = new Date()): Promise<number> {
    return this.db.$executeRaw(Prisma.sql`
      UPDATE core.email_queue
      SET status = 'sent',
          sent_at = COALESCE(sent_at, delivered_at),
          claimed_at = NULL,
          lease_expires_at = NULL,
          lease_token = NULL
      WHERE status = 'sending'
        AND delivered_at IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ${now}::timestamptz
    `);
  }

  /** Settles a claimed row, fenced by the lease_token (see email-queue-settle.ts). */
  async settle(id: string, leaseToken: string, update: EmailSettleUpdate): Promise<boolean> {
    return settleEmailQueue(this.db, id, leaseToken, update);
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
