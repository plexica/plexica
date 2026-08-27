// unit/kafka-consumer-drain.test.ts
// Unit tests for owned-handler drain: bounded wait and snapshot re-check.

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumer: vi.fn(),
}));

vi.mock('../../lib/kafka-client.js', () => ({
  kafkaClient: { consumer: mocks.consumer },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { awaitOwnedHandlers, createKafkaConsumer, trackHandler } from '../../lib/kafka-consumer.js';

const fakeConsumer = {};
mocks.consumer.mockReturnValue(fakeConsumer);

describe('trackHandler / awaitOwnedHandlers', () => {
  it('resolves immediately when there are no owned handlers', async () => {
    const c = createKafkaConsumer('g');
    await expect(awaitOwnedHandlers(c, 50)).resolves.toBeUndefined();
  });

  it('waits for owned handlers to settle and clears them', async () => {
    const c = createKafkaConsumer('g');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    trackHandler(c, pending);
    const drain = awaitOwnedHandlers(c, 5000);
    release();
    await expect(drain).resolves.toBeUndefined();
  });

  it('bounded: resolves on timeout even if a handler never settles', async () => {
    const c = createKafkaConsumer('g');
    trackHandler(c, new Promise<void>(() => {}));
    const start = Date.now();
    await expect(awaitOwnedHandlers(c, 30)).resolves.toBeUndefined();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('swallows handler rejections', async () => {
    const c = createKafkaConsumer('g');
    trackHandler(c, Promise.reject(new Error('boom')));
    await expect(awaitOwnedHandlers(c, 100)).resolves.toBeUndefined();
  });

  it('re-checks for handlers registered after the first snapshot', async () => {
    const c = createKafkaConsumer('g');
    let release!: () => void;
    const late = new Promise<void>((resolve) => {
      release = resolve;
    });
    trackHandler(
      c,
      (async () => {
        await Promise.resolve();
        trackHandler(c, late);
      })()
    );
    const drain = awaitOwnedHandlers(c, 5000);
    let drained = false;
    void drain.then(() => {
      drained = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(drained).toBe(false);
    release();
    await expect(drain).resolves.toBeUndefined();
    expect(drained).toBe(true);
  });
});
