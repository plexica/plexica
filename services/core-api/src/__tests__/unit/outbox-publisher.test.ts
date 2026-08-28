// unit/outbox-publisher.test.ts
// Unit tests for the outbox publisher lifecycle: a stuck batch must not
// stall shutdown indefinitely (bounded stop).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { startOutboxPublisher, stopOutboxPublisher } from '../../events/outbox-publisher.js';

vi.mock('../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../lib/kafka.js', () => ({ sendKafkaEnvelope: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('outbox publisher lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stopOutboxPublisher resolves immediately when no batch is running', async () => {
    vi.useFakeTimers();
    await expect(stopOutboxPublisher()).resolves.toBeUndefined();
  });

  it('stopOutboxPublisher resolves within the bound when a batch never settles', async () => {
    vi.useFakeTimers();
    const stuck = (): Promise<never> => new Promise<never>(() => {});
    startOutboxPublisher(1_000, stuck);
    const stop = stopOutboxPublisher();
    await vi.advanceTimersByTimeAsync(30000);
    await expect(stop).resolves.toBeUndefined();
  });
});
