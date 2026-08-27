// unit/dlq-consumer.test.ts
// Unit tests for the DLQ bridge poison-record handling with a fake consumer.

import { KafkaJS } from '@confluentinc/kafka-javascript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumer: vi.fn(),
}));

vi.mock('../../lib/kafka-client.js', () => ({
  kafkaClient: { consumer: mocks.consumer },
}));
vi.mock('../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Topics } from '../../lib/kafka.js';
import { logger } from '../../lib/logger.js';
import {
  parseDlqPayload,
  startDlqConsumer,
  stopDlqConsumer,
} from '../../modules/plugin/events/dlq-consumer.js';

type EachMessage = (args: {
  topic: string;
  partition: number;
  message: { offset: string; value: Buffer | null };
}) => Promise<void>;

type RebalanceCb = (
  error: unknown,
  assignment?: Array<{ topic: string; partition: number }>
) => void;

function fakeConsumer() {
  const callbacks: { rebalance?: RebalanceCb } = {};
  const eachMessageRef: { current: EachMessage | null } = { current: null };
  const consumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    assignment: vi.fn(() => [{ topic: Topics.dlq, partition: 0 }]),
    commitOffsets: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(async ({ eachMessage }: { eachMessage: EachMessage }) => {
      eachMessageRef.current = eachMessage;
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  mocks.consumer.mockImplementation((options: { rebalance_cb?: unknown }) => {
    callbacks.rebalance = options.rebalance_cb as RebalanceCb;
    return consumer;
  });
  const revoke = (topic: string, partition: number) =>
    callbacks.rebalance?.({ code: KafkaJS.ErrorCodes.ERR__REVOKE_PARTITIONS }, [
      { topic, partition },
    ]);
  return { consumer, eachMessageRef, revoke };
}

describe('parseDlqPayload', () => {
  it('parses valid JSON envelopes', () => {
    expect(parseDlqPayload('{"ok":true}')).toEqual({ ok: true });
  });

  it('throws PermanentDlqError(DLQ_ENVELOPE_SCHEMA_INVALID) on malformed JSON', () => {
    expect(() => parseDlqPayload('{definitely not json')).toThrow('DLQ_ENVELOPE_SCHEMA_INVALID');
  });

  it('throws PermanentDlqError(DLQ_ENVELOPE_SCHEMA_INVALID) on empty input', () => {
    expect(() => parseDlqPayload('')).toThrow('DLQ_ENVELOPE_SCHEMA_INVALID');
  });
});

describe('startDlqConsumer poison records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumer.mockReset();
    vi.mocked(logger.error).mockReset();
  });

  afterEach(async () => {
    await stopDlqConsumer();
  });

  it('commits and skips a malformed poison record without retrying', async () => {
    const { consumer, eachMessageRef } = fakeConsumer();
    await startDlqConsumer();
    expect(eachMessageRef.current).not.toBeNull();

    await eachMessageRef.current!({
      topic: Topics.dlq,
      partition: 0,
      message: { value: Buffer.from('{not-json'), offset: '5' },
    });

    expect(consumer.commitOffsets).toHaveBeenCalledTimes(1);
    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: Topics.dlq, partition: 0, offset: '6' },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DLQ_ENVELOPE_SCHEMA_INVALID' }),
      'DLQ bridge permanent error detected'
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DLQ_ENVELOPE_SCHEMA_INVALID' }),
      'DLQ bridge permanent error skipped'
    );
  });

  it('commits and skips a null-valued poison record', async () => {
    const { consumer, eachMessageRef } = fakeConsumer();
    await startDlqConsumer();

    await eachMessageRef.current!({
      topic: Topics.dlq,
      partition: 0,
      message: { value: null, offset: '9' },
    });

    expect(consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: Topics.dlq, partition: 0, offset: '10' },
    ]);
  });

  it('never commits a poison record when the generation changes before commit', async () => {
    const { consumer, eachMessageRef, revoke } = fakeConsumer();
    vi.mocked(logger.error).mockImplementation(() => {
      revoke(Topics.dlq, 0);
    });
    await startDlqConsumer();

    await expect(
      eachMessageRef.current!({
        topic: Topics.dlq,
        partition: 0,
        message: { value: Buffer.from('{bad'), offset: '5' },
      })
    ).rejects.toThrow('KAFKA_COMMIT_STALE_GENERATION');
    expect(consumer.commitOffsets).not.toHaveBeenCalled();
  });
});
