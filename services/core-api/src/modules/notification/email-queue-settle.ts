// email-queue-settle.ts
// Lease-fenced settle for core.email_queue (ADR-035, CodeRabbit #4): a settle
// must match the claim's lease_token (stamped by claim() as a per-batch UUID),
// so a stale holder cannot overwrite a row that a successor re-claimed after
// lease expiry. A 0-row update means the claim is stale (re-claimed or already
// purged by the GDPR deletion saga) — logged and ignored. Mirrors the
// event_outbox acknowledge/release fencing in events/outbox-repository.ts.

import { logger } from '../../lib/logger.js';

import { sanitizeEmailError } from './email-error-sanitize.js';

import type { PrismaClient } from '@prisma/client';

export type EmailSettleUpdate =
  | { status: 'sent'; sentAt: Date }
  | { status: 'failed'; attempts: number; nextAttemptAt: Date; lastError: unknown }
  | { status: 'dead'; attempts: number; lastError: unknown };

/**
 * Settles a claimed row. Fenced by the claim's `lease_token`: a 0-row update
 * means the claim is stale (the row was re-claimed by a successor after lease
 * expiry, or already purged by the GDPR deletion saga) — logs and returns
 * false so the caller ignores it instead of reclassifying state. Returns true
 * when exactly one row was updated.
 */
export async function settleEmailQueue(
  db: PrismaClient,
  id: string,
  leaseToken: string,
  update: EmailSettleUpdate
): Promise<boolean> {
  if (update.status === 'sent') {
    const result = await db.emailQueue.updateMany({
      where: { id, leaseToken },
      data: {
        status: 'sent',
        sentAt: update.sentAt,
        lastError: null,
        claimedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
      },
    });
    if (result.count === 0) {
      logger.warn(
        { id, code: 'EMAIL_SETTLE_STALE' },
        'Email settle(sent) ignored — stale claim (row re-claimed or purged)'
      );
      return false;
    }
    return true;
  }
  // ADR-035 invariant enforced at the persistence boundary: last_error is
  // sanitized here (not just by callers) so no future caller can persist PII.
  const lastError = sanitizeEmailError(update.lastError);
  const result = await db.emailQueue.updateMany({
    where: { id, leaseToken },
    data: {
      status: update.status,
      attempts: update.attempts,
      lastError,
      claimedAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
      ...(update.status === 'failed' ? { nextAttemptAt: update.nextAttemptAt } : {}),
    },
  });
  if (result.count === 0) {
    logger.warn(
      { id, code: 'EMAIL_SETTLE_STALE' },
      'Email settle ignored — stale claim (row re-claimed or purged)'
    );
    return false;
  }
  return true;
}
