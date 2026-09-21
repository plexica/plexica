// email-queue-tenant-scope.helper.ts
// EmailQueueService claim scoped to a single tenant's rows regardless of the
// tenant's status (review M3 email-retry fixture isolation). The dev worker's
// claim excludes 'suspended' tenants, so this is the ONLY claimer that sees the
// fixture rows — deterministic even with the dev core-api running. Kept out of
// the test file for the 200-line gate (Rule 4).

import { Prisma } from '@prisma/client';

import { EmailQueueService } from '../../modules/notification/email-queue.service.js';

import type { PrismaClient } from '@prisma/client';
import type { EmailQueueRow } from '../../modules/notification/types.js';

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

export class TenantScopedEmailQueueService extends EmailQueueService {
  constructor(
    db: PrismaClient,
    private readonly tenantId: string
  ) {
    super(db);
  }

  override async claim(
    batchSize = 10,
    now = new Date(),
    leaseMs = 60_000
  ): Promise<EmailQueueRow[]> {
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
        WHERE candidate.tenant_id = ${this.tenantId}::uuid
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
    return rows as unknown as EmailQueueRow[];
  }
}
