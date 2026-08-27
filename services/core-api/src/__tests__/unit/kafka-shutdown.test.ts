// unit/kafka-shutdown.test.ts
// Unit tests for the bounded consumer disconnect helper.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { disconnectConsumerWithBudget, settleWithBudget } from '../../lib/kafka-shutdown.js';
import { logger } from '../../lib/logger.js';

import type { KafkaConsumer } from '../../lib/kafka-client.js';

function fakeConsumer(disconnect: ReturnType<typeof vi.fn>): KafkaConsumer {
  return { disconnect } as unknown as KafkaConsumer;
}

describe('disconnectConsumerWithBudget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when the disconnect succeeds', async () => {
    const consumer = fakeConsumer(vi.fn().mockResolvedValue(undefined));
    await expect(disconnectConsumerWithBudget(consumer)).resolves.toBeUndefined();
    expect(consumer.disconnect).toHaveBeenCalledOnce();
  });

  it('rethrows when the disconnect rejects quickly', async () => {
    const consumer = fakeConsumer(vi.fn().mockRejectedValue(new Error('boom')));
    await expect(disconnectConsumerWithBudget(consumer)).rejects.toThrow('boom');
  });

  it('resolves within the budget when the disconnect hangs', async () => {
    vi.useFakeTimers();
    const consumer = fakeConsumer(vi.fn(() => new Promise<void>(() => {})));
    const closing = disconnectConsumerWithBudget(consumer);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(closing).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KAFKA_CONSUMER_DISCONNECT_TIMEOUT' }),
      expect.any(String)
    );
  });
});

describe('settleWithBudget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true when the promise settles before the budget', async () => {
    await expect(settleWithBudget(Promise.resolve(42), 30000)).resolves.toBe(true);
  });

  it('resolves false within the budget when the promise never settles', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const settling = settleWithBudget(never, 30000);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(settling).resolves.toBe(false);
  });

  it('rethrows when the input promise rejects before the budget', async () => {
    const p = Promise.reject(new Error('boom'));
    p.catch(() => undefined);
    await expect(settleWithBudget(p, 30000)).rejects.toThrow('boom');
  });
});