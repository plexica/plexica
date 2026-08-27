// lib/kafka-shutdown.ts
// Bounded disconnect for shutdown paths: a hung native disconnect must not
// stall teardown past the shutdown budget (KJM-NFR-005).

import { logger } from './logger.js';

import type { KafkaConsumer } from './kafka-client.js';

const CONSUMER_DISCONNECT_BUDGET_MS = 30000;

export async function disconnectConsumerWithBudget(
  consumer: KafkaConsumer,
  budgetMs = CONSUMER_DISCONNECT_BUDGET_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, budgetMs);
    timer.unref?.();
  });
  // Promise.race subscribes to `disconnect` at construction, so a rejection
  // after the budget expired is still observed (no unhandled rejection).
  try {
    const disconnect = consumer.disconnect();
    await Promise.race([disconnect, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (timedOut) {
    logger.warn({ code: 'KAFKA_CONSUMER_DISCONNECT_TIMEOUT' }, 'Consumer disconnect timed out');
  }
}

/**
 * Waits for `promise` up to `budgetMs`. Resolves true if it settled within
 * budget, false if the budget expired first. Never throws on timeout: the
 * input promise is left to settle and any late rejection is observed by the
 * race subscription (no unhandled rejection). Rethrows if the input rejects
 * before the budget.
 */
export async function settleWithBudget(
  promise: Promise<unknown>,
  budgetMs = CONSUMER_DISCONNECT_BUDGET_MS
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, Math.max(0, budgetMs));
    timer.unref?.();
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return !timedOut;
}