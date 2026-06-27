// events/event-dispatcher.service.ts
// Forwards Kafka events to plugin backends via HTTP POST.

import { logger } from '../../../lib/logger.js';

const RETRY_DELAYS: Record<number, number> = { 0: 100, 1: 500, 2: 2_000 };
const MAX_RETRIES = 3;

/**
 * Dispatches an event to a plugin backend via HTTP POST /_plexica/event.
 * Retries with exponential backoff on failure.
 */
export async function dispatchEvent(
  backendUrl: string,
  eventType: string,
  payload: Record<string, unknown>,
  correlationId: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${backendUrl.replace(/\/+$/, '')}/_plexica/event`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        return { success: false, error: `Plugin returned ${response.status}` };
      }

      // Retry on 5xx
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] ?? 2_000);
      } else {
        return { success: false, error: `Plugin returned ${response.status} after ${MAX_RETRIES} retries` };
      }
    } catch (err) {
      const message = (err as Error).message;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] ?? 2_000);
      } else {
        return { success: false, error: `Failed after ${MAX_RETRIES} retries: ${message}` };
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
