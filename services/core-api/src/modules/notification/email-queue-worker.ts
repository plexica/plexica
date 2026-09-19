// email-queue-worker.ts
// SMTP retry worker over core.email_queue (feature 006-03). runTick() retires
// delivered-but-unsettled rows, claims a batch, sends via nodemailer
// (sendMailNow), and schedules retries with 1s/4s/16s backoff (base × 4^attempt)
// before dead-lettering after NOTIFICATION_EMAIL_MAX_ATTEMPTS (4 = 1 send + 3
// retries). Each send is bounded at the socket level (8s native SMTP timeouts,
// 10s Promise.race backstop in sendMailNow) so a hung SMTP cannot strand a
// claim; the transport is closed on timeout to abort the in-flight SMTP op.
// Every settle is fenced by the claim's lease_token, so a stale holder cannot
// overwrite a re-claimed row. Delivery is effectively-once (CodeRabbit #10):
// the worker writes the delivered_at marker the moment a send is confirmed, so
// a settle('sent') failure or a crash after delivery can never cause a re-claim
// to re-send — the only residual window is a crash between SMTP acceptance and
// the marker write (milliseconds, ADR-035 at-least-once). Mailpit is the
// dev/test SMTP target.

import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { sendMailNow } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';

import { EmailQueueService, redactEmail } from './email-queue.service.js';

export interface EmailQueueTickResult {
  sent: number;
  failed: number;
  dead: number;
}

const BACKOFF_MULTIPLIER = 4;
const SEND_TIMEOUT_MS = 10_000;

function nextAttemptAt(attemptsBefore: number, base = config.NOTIFICATION_EMAIL_BACKOFF_MS): Date {
  return new Date(Date.now() + base * BACKOFF_MULTIPLIER ** attemptsBefore);
}

/**
 * One worker cycle: claim a batch, send each, and settle. Failures are never
 * dropped — they are either rescheduled (next_attempt_at backoff) or
 * dead-lettered after max attempts. Returns per-outcome counts.
 */
export async function runTick(
  batchSize = 10,
  emailQueue = new EmailQueueService(prisma)
): Promise<EmailQueueTickResult> {
  const result: EmailQueueTickResult = { sent: 0, failed: 0, dead: 0 };
  // Reconcile prior delivered-but-unsettled rows FIRST: a holder that wrote the
  // delivered_at marker and crashed before settle('sent') must be retired to
  // 'sent' without a re-send (CodeRabbit #10). Only then claim new work.
  const retired = await emailQueue.retireDelivered();
  if (retired > 0) {
    logger.info(
      { retired, code: 'EMAIL_DELIVERED_RETIRED' },
      'Retired delivered emails without re-sending'
    );
  }
  const rows = await emailQueue.claim(batchSize);
  if (rows.length === 0) return result;

  await Promise.all(
    rows.map(async (row) => {
      try {
        // Bound the send so a hung SMTP connection cannot strand the lease:
        // a timeout rejects, the catch schedules a retry, and the worker (or
        // its successor after a crash) re-claims the row. sendMailNow closes
        // its transport on timeout, so the in-flight SMTP op is aborted before
        // this retry path runs — shrinking the duplicate window. At-least-once
        // semantics (ADR-035) still allow a duplicate only on a crash between
        // SMTP acceptance and the delivered_at marker write (milliseconds):
        // prefer a duplicate over a lost email.
        await sendMailNow(row.toAddress, row.subject, row.htmlBody, {
          timeoutMs: SEND_TIMEOUT_MS,
        });
      } catch (error) {
        const attempts = row.attempts + 1;
        if (attempts >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS) {
          // Fenced settle: false means the claim is stale (row re-claimed or
          // purged) — ignore it, another holder owns the row now.
          const settled = await emailQueue.settle(row.id, row.leaseToken, {
            status: 'dead',
            attempts,
            lastError: error,
          });
          if (!settled) return;
          result.dead += 1;
          logger.error(
            { id: row.id, emailType: row.emailType, code: 'EMAIL_DEAD' },
            'Email dead-lettered after max attempts'
          );
        } else {
          const settled = await emailQueue.settle(row.id, row.leaseToken, {
            status: 'failed',
            attempts,
            nextAttemptAt: nextAttemptAt(row.attempts),
            lastError: error,
          });
          if (!settled) return;
          result.failed += 1;
          logger.warn(
            {
              id: row.id,
              emailType: row.emailType,
              toAddress: redactEmail(row.toAddress),
              attempts,
              code: 'EMAIL_RETRY',
            },
            'Email send failed — scheduled retry'
          );
        }
        return;
      }

      // Send succeeded — write the delivered_at marker FIRST (fenced by the
      // claim lease): from this instant the email is effectively-once and a
      // crash or settle failure can never cause a re-claim to re-send
      // (CodeRabbit #10). If the marker write is stale (0 rows — the claim was
      // re-claimed/purged before we delivered), another holder owns the row:
      // log and stop — do NOT settle, do NOT re-send.
      const marked = await emailQueue.markDelivered(row.id, row.leaseToken);
      if (!marked) {
        logger.warn(
          { id: row.id, emailType: row.emailType, code: 'EMAIL_DELIVERED_MARKER_STALE' },
          'Email sent but delivered_at marker write was stale — row owned by another claim; not re-sent'
        );
        return;
      }
      result.sent += 1;
      try {
        await emailQueue.settle(row.id, row.leaseToken, { status: 'sent', sentAt: new Date() });
      } catch (error) {
        // Settle(sent) failed but the delivered_at marker is already set: the
        // next tick's retireDelivered() retires the row to 'sent' WITHOUT
        // re-sending — the email is never sent twice (CodeRabbit #10).
        logger.warn(
          {
            id: row.id,
            emailType: row.emailType,
            err: String(error),
            code: 'EMAIL_SETTLE_SENT_FAILED',
          },
          'Email delivered (delivered_at set) but settle(sent) failed — will be retired without re-sending'
        );
      }
    })
  );

  logger.info(
    { sent: result.sent, failed: result.failed, dead: result.dead },
    'Email queue tick complete'
  );
  return result;
}

let interval: ReturnType<typeof setInterval> | undefined;

/** Starts the periodic worker. Idempotent; the timer is unref'd (non-blocking). */
export function startEmailQueueWorker(
  intervalMs = config.NOTIFICATION_EMAIL_WORKER_INTERVAL_MS
): void {
  if (interval) return;
  interval = setInterval(() => {
    void runTick().catch((error) =>
      logger.error(
        { code: 'EMAIL_WORKER_TICK_FAILED', err: String(error) },
        'Email queue tick failed'
      )
    );
  }, intervalMs);
  interval.unref();
}

export function stopEmailQueueWorker(): void {
  if (interval) {
    clearInterval(interval);
    interval = undefined;
  }
}
