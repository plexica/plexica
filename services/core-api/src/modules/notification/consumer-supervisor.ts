// consumer-supervisor.ts
// Bounded supervision for the notification consumer's startup (ADR-035,
// feature 006-01). The consumer must not block boot (fire-and-forget), but a
// one-shot failed start leaves in-app notifications degraded until a core
// restart — a broker still provisioning its topic only needs a retry window.
// The supervisor retries with exponential backoff up to MAX_RETRIES, then logs
// NOTIF_CONSUMER_SUPERVISOR_EXHAUSTED and gives up (never loops forever).
// Shutdown clears the pending retry timer so the consumer is never (re)started
// during or after teardown, mirroring how disconnectKafka() marks the producer
// permanently closed.

import { logger } from '../../lib/logger.js';

import { startNotificationConsumer } from './consumer.js';

const MAX_RETRIES = 5;
// 1s / 2s / 4s / 8s / 16s — exponential and bounded.
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let started = false;
let stopped = false;

async function attemptStart(): Promise<void> {
  try {
    await startNotificationConsumer();
    retries = 0;
    return;
  } catch (error) {
    if (stopped) return;
    // The consumer rejects with NOTIF_CONSUMER_CLOSING once shutdown began —
    // treat it as a stop signal, never a retryable failure.
    if (error instanceof Error && error.message === 'NOTIF_CONSUMER_CLOSING') return;
    if (retries >= MAX_RETRIES) {
      logger.error(
        { code: 'NOTIF_CONSUMER_SUPERVISOR_EXHAUSTED' },
        'Notification consumer failed to start after retries — in-app notifications degraded until restart'
      );
      return;
    }
    const delayMs = RETRY_BACKOFF_MS[retries];
    retries += 1;
    logger.warn(
      { attempt: retries, delayMs, code: 'NOTIF_CONSUMER_START_FAILED' },
      'Notification consumer failed to start — scheduling retry'
    );
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void attemptStart();
    }, delayMs);
    retryTimer.unref();
  }
}

/**
 * Starts the supervised notification consumer. Idempotent and fire-and-forget:
 * the first attempt runs immediately, failed starts are retried with
 * exponential backoff on unref'd timers, so boot is never blocked.
 */
export function startNotificationConsumerSupervisor(): void {
  if (started || stopped) return;
  started = true;
  void attemptStart();
}

/**
 * Stops the supervisor: clears the pending retry timer and prevents any
 * further attempt, so a shutdown racing startup never restarts the consumer
 * after teardown. Idempotent.
 */
export function stopNotificationConsumerSupervisor(): void {
  stopped = true;
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
}
