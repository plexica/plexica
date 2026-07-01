// events/event-dispatcher.service.ts
// Forwards Kafka events to plugin backends via HTTP POST.
// On exhaustion: moves event to DLQ per AC-06.

import { logger } from '../../../lib/logger.js';

import { moveToDlq } from './dlq.service.js';

const RETRY_DELAYS: Record<number, number> = { 0: 100, 1: 500, 2: 2_000 };
const MAX_RETRIES = 3;

/**
 * Dispatches an event to a plugin backend via HTTP POST /_plexica/event.
 * Retries with exponential backoff on failure.
 * On last retry exhaustion, moves the event to the DLQ (AC-06).
 */
export async function dispatchEvent(
  backendUrl: string,
  eventType: string,
  payload: Record<string, unknown>,
  correlationId: string,
  installId?: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${backendUrl.replace(/\/+$/, '')}/_plexica/event`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plexica-Correlation-Id': correlationId,
          'X-Plexica-Event-Type': eventType,
        },
        body: JSON.stringify({
          type: eventType,
          payload,
          timestamp: new Date().toISOString(),
          correlationId,
        }),
        signal: AbortSignal.timeout(5_000), // 5s timeout
      });

      if (response.ok) {
        return { success: true };
      }

      // Non-retryable status codes
      if (response.status === 400 || response.status === 422) {
        const errorMsg = `Plugin returned ${response.status}`;
        await maybeMoveToDlq(installId, eventType, payload, errorMsg, attempt);
        return { success: false, error: errorMsg };
      }

      // Retry on 5xx
      await sleep(RETRY_DELAYS[attempt] ?? 2_000);
    } catch (err) {
      const message = (err as Error).message;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt] ?? 2_000);
      } else {
        const errorMsg = `Failed after ${MAX_RETRIES} retries: ${message}`;
        await maybeMoveToDlq(installId, eventType, payload, errorMsg, attempt);
        return { success: false, error: errorMsg };
      }
    }
  }

  // All retries exhausted — move to DLQ
  const errorMsg = 'Max retries exceeded';
  await maybeMoveToDlq(installId, eventType, payload, errorMsg, MAX_RETRIES - 1);
  return { success: false, error: errorMsg };
}

async function maybeMoveToDlq(
  installId: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  if (!installId) return;
  try {
    await moveToDlq(installId, eventType, payload, errorMessage, retryCount);
  } catch (err) {
    logger.error({ err, installId, eventType }, 'Failed to move event to DLQ');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
