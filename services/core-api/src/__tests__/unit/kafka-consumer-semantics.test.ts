// unit/kafka-consumer-semantics.test.ts
// Unit tests for consumer rebalance state, guarded commits and owned-handler drain.

import { KafkaJS } from '@confluentinc/kafka-javascript';
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

import {
  awaitOwnedHandlers,
  commitOffsetGuarded,
  createKafkaConsumer,
  isConsumerClosing,
  markConsumerClosing,
  processAndCommit,
  trackHandler,
  waitForConsumerAssignment,
} from '../../lib/kafka-consumer.js';

type RebalanceCb = (
  error: unknown,
  assignment?: Array<{ topic: string; partition: number }>
) => void;

function makeConsumer() {
  const callbacks: { rebalance?: RebalanceCb } = {};
  const consumer = {
    assignment: vi.fn(() => [] as Array<{ topic: string; partition: number }>),
    commitOffsets: vi.fn().mockResolvedValue(undefined),
  };
  mocks.consumer.mockImplementation((options: { rebalance_cb?: unknown }) => {
    callbacks.rebalance = options.rebalance_cb as RebalanceCb;
    return consumer;
  });
  const assign = (topic: string, partition: number) =>
    callbacks.rebalance?.({ code: KafkaJS.ErrorCodes.ERR__ASSIGN_PARTITIONS }, [
      { topic, partition },
    ]);
  const revoke = (topic: string, partition: number) =>
    callbacks.rebalance?.({ code: KafkaJS.ErrorCodes.ERR__REVOKE_PARTITIONS }, [
      { topic, partition },
    ]);
  return { consumer, assign, revoke };
}

describe('commitOffsetGuarded', () => {
  it('throws KAFKA_COMMIT_STALE_GENERATION when the partition is not assigned', async () => {
    const { consumer } = makeConsumer();
    const c = createKafkaConsumer('g');
    await expect(commitOffsetGuarded(c, 't1', 0, '1')).rejects.toThrow(
      'KAFKA_COMMIT_STALE_GENERATION'
    );
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
  });

  it('throws KAFKA_COMMIT_STALE_GENERATION when the generation changes during commit', async () => {
    const { consumer, assign, revoke } = makeConsumer();
    const c = createKafkaConsumer('g');
    assign('t1', 0);
    consumer.commitOffsets.mockImplementation(async () => {
      revoke('t1', 0);
    });
    await expect(commitOffsetGuarded(c, 't1', 0, '5')).rejects.toThrow(
      'KAFKA_COMMIT_STALE_GENERATION'
    );
  });

  it('commits the next offset when the assignment is stable', async () => {
    const { consumer, assign } = makeConsumer();
    const c = createKafkaConsumer('g');
    assign('t1', 0);
    await expect(commitOffsetGuarded(c, 't1', 0, '5')).resolves.toBeUndefined();
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 't1', partition: 0, offset: '5' },
    ]);
  });
});

describe('waitForConsumerAssignment', () => {
  it('returns once the consumer reports a direct assignment', async () => {
    const { consumer } = makeConsumer();
    const c = createKafkaConsumer('g');
    consumer.assignment.mockReturnValue([{ topic: 't1', partition: 0 }]);
    await expect(waitForConsumerAssignment(c, 1000)).resolves.toBeUndefined();
  });

  it('throws KAFKA_CONSUMER_NOT_READY when no assignment appears before the deadline', async () => {
    const { consumer } = makeConsumer();
    const c = createKafkaConsumer('g');
    consumer.assignment.mockReturnValue([]);
    await expect(waitForConsumerAssignment(c, 40)).rejects.toThrow('KAFKA_CONSUMER_NOT_READY');
  });
});

describe('markConsumerClosing / isConsumerClosing', () => {
  it('tracks the closing flag per consumer', () => {
    const c = createKafkaConsumer('g');
    expect(isConsumerClosing(c)).toBe(false);
    markConsumerClosing(c);
    expect(isConsumerClosing(c)).toBe(true);
  });
});

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
});

describe('processAndCommit', () => {
  it('commits offset+1 after the work succeeds', async () => {
    const { consumer, assign } = makeConsumer();
    const c = createKafkaConsumer('g');
    assign('t1', 0);
    const work = vi.fn().mockResolvedValue(undefined);
    await expect(processAndCommit(c, 't1', 0, '42', work)).resolves.toBeUndefined();
    expect(work).toHaveBeenCalledOnce();
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: 't1', partition: 0, offset: '43' },
    ]);
  });

  it('does not commit when the work throws', async () => {
    const { consumer, assign } = makeConsumer();
    const c = createKafkaConsumer('g');
    assign('t1', 0);
    await expect(
      processAndCommit(c, 't1', 0, '42', async () => {
        throw new Error('work failed');
      })
    ).rejects.toThrow('work failed');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
  });

  it('throws KAFKA_COMMIT_STALE_GENERATION when the generation changes during commit', async () => {
    const { consumer, assign, revoke } = makeConsumer();
    const c = createKafkaConsumer('g');
    assign('t1', 0);
    consumer.commitOffsets.mockImplementation(async () => {
      revoke('t1', 0);
    });
    await expect(processAndCommit(c, 't1', 0, '42', async () => undefined)).rejects.toThrow(
      'KAFKA_COMMIT_STALE_GENERATION'
    );
  });
});
