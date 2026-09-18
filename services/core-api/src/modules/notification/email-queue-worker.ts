// email-queue-worker.ts
// SMTP retry worker over core.email_queue (feature 006-03). runTick() claims a
// batch, sends via nodemailer (sendMailNow), and schedules retries with
// 1s/4s/16s backoff (base × 4^attempt) before dead-lettering after
// NOTIFICATION_EMAIL_MAX_ATTEMPTS (4 = 1 send + 3 retries). Each send is
// bounded by a 10s Promise.race timeout (sendMailNow) so a hung SMTP cannot
// strand a claim. Mailpit is the dev/test SMTP target.

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
  const rows = await emailQueue.claim(batchSize);
  if (rows.length === 0) return result;

  await Promise.all(
    rows.map(async (row) => {
      try {
        // Bound the send so a hung SMTP connection cannot strand the lease:
        // a timeout rejects, the catch schedules a retry, and the worker (or
        // its successor after a crash) re-claims the row.
        await sendMailNow(row.toAddress, row.subject, row.htmlBody, {
          timeoutMs: SEND_TIMEOUT_MS,
        });
      } catch (error) {
        const attempts = row.attempts + 1;
        if (attempts >= config.NOTIFICATION_EMAIL_MAX_ATTEMPTS) {
          await emailQueue.settle(row.id, { status: 'dead', attempts, lastError: error });
          result.dead += 1;
          logger.error(
            { id: row.id, emailType: row.emailType, code: 'EMAIL_DEAD' },
            'Email dead-lettered after max attempts'
          );
        } else {
          await emailQueue.settle(row.id, {
            status: 'failed',
            attempts,
            nextAttemptAt: nextAttemptAt(row.attempts),
            lastError: error,
          });
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

      // Send succeeded — count it, then settle('sent') in isolation: a
      // state-transition failure must NOT reclassify a delivered email as
      // failed (no duplicate on re-claim) and must NOT abort the other rows
      // in this tick. The row is re-claimed after lease expiry if the settle
      // write truly failed.
      result.sent += 1;
      try {
        await emailQueue.settle(row.id, { status: 'sent', sentAt: new Date() });
      } catch (error) {
        logger.warn(
          {
            id: row.id,
            emailType: row.emailType,
            err: String(error),
            code: 'EMAIL_SETTLE_SENT_FAILED',
          },
          'Email delivered but settle(sent) failed — row re-claimed after lease expiry'
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
