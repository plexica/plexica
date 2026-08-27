// unit/kafka-admin.test.ts
// Unit tests for kafka-admin helpers with fake admin objects — no broker/DB.

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
}));

vi.mock('../../lib/kafka-client.js', () => ({
  kafkaClient: { admin: mocks.admin },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getConsumerGroupLag, waitForTopicLeaders, withKafkaAdmin } from '../../lib/kafka-admin.js';

function fakeAdmin(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    fetchOffsets: vi.fn(),
    fetchTopicOffsets: vi.fn(),
    fetchTopicMetadata: vi.fn(),
    ...overrides,
  };
}

describe('getConsumerGroupLag', () => {
  it('uses the low watermark when a partition has no committed offset', async () => {
    const admin = fakeAdmin({
      fetchOffsets: vi.fn().mockResolvedValue([{ topic: 't1', partitions: [] }]),
      fetchTopicOffsets: vi.fn().mockResolvedValue([{ partition: 0, high: '100', low: '40' }]),
    });
    await expect(getConsumerGroupLag(admin as never, 'g', ['t1'])).resolves.toBe(60);
  });

  it('skips committed offset -1 and treats the partition as uncommitted', async () => {
    const admin = fakeAdmin({
      fetchOffsets: vi
        .fn()
        .mockResolvedValue([{ topic: 't1', partitions: [{ partition: 0, offset: '-1' }] }]),
      fetchTopicOffsets: vi.fn().mockResolvedValue([{ partition: 0, high: '100', low: '30' }]),
    });
    await expect(getConsumerGroupLag(admin as never, 'g', ['t1'])).resolves.toBe(70);
  });

  it('reports zero lag when the committed offset exceeds the high watermark', async () => {
    const admin = fakeAdmin({
      fetchOffsets: vi
        .fn()
        .mockResolvedValue([{ topic: 't1', partitions: [{ partition: 0, offset: '500' }] }]),
      fetchTopicOffsets: vi.fn().mockResolvedValue([{ partition: 0, high: '100', low: '0' }]),
    });
    await expect(getConsumerGroupLag(admin as never, 'g', ['t1'])).resolves.toBe(0);
  });

  it('caps aggregated lag at MAX_SAFE_INTEGER (M-08)', async () => {
    const admin = fakeAdmin({
      fetchOffsets: vi.fn().mockResolvedValue([{ topic: 't1', partitions: [] }]),
      fetchTopicOffsets: vi
        .fn()
        .mockResolvedValue([{ partition: 0, high: '9007199254740993', low: '0' }]),
    });
    await expect(getConsumerGroupLag(admin as never, 'g', ['t1'])).resolves.toBe(
      Number.MAX_SAFE_INTEGER
    );
  });

  it('aggregates lag across partitions and topics', async () => {
    const admin = fakeAdmin({
      fetchOffsets: vi
        .fn()
        .mockResolvedValue([{ topic: 't1', partitions: [{ partition: 0, offset: '10' }] }]),
      fetchTopicOffsets: vi.fn().mockImplementation(async (topic: string) =>
        topic === 't1'
          ? [
              { partition: 0, high: '60', low: '0' },
              { partition: 1, high: '80', low: '0' },
            ]
          : [{ partition: 0, high: '50', low: '0' }]
      ),
    });
    await expect(getConsumerGroupLag(admin as never, 'g', ['t1', 't2'])).resolves.toBe(180);
  });
});

describe('waitForTopicLeaders', () => {
  it('resolves once every requested topic has an elected leader', async () => {
    const admin = fakeAdmin({
      fetchTopicMetadata: vi
        .fn()
        .mockResolvedValue([
          { name: 't1', partitions: [{ partition: 0, leader: 1, leaderNode: 'n1' }] },
        ]),
    });
    await expect(waitForTopicLeaders(admin as never, ['t1'], 100)).resolves.toBeUndefined();
  });

  it('throws KAFKA_TOPIC_LEADERS_TIMEOUT when leaders never become ready', async () => {
    const admin = fakeAdmin({
      fetchTopicMetadata: vi
        .fn()
        .mockResolvedValue([
          { name: 't1', partitions: [{ partition: 0, leader: -1, leaderNode: null }] },
        ]),
    });
    await expect(waitForTopicLeaders(admin as never, ['t1'], 50)).rejects.toThrow(
      'KAFKA_TOPIC_LEADERS_TIMEOUT'
    );
  });
});

describe('withKafkaAdmin', () => {
  it('runs the operation and disconnects the admin', async () => {
    const admin = fakeAdmin();
    mocks.admin.mockReturnValue(admin);
    const result = await withKafkaAdmin(async (a) => {
      expect(a).toBe(admin);
      return 42;
    });
    expect(result).toBe(42);
    expect(admin.connect).toHaveBeenCalledOnce();
    expect(admin.disconnect).toHaveBeenCalledOnce();
  });

  it('rejects with a sanitized TimeoutError when connect hangs', async () => {
    const admin = fakeAdmin({ connect: vi.fn(() => new Promise<void>(() => {})) });
    mocks.admin.mockReturnValue(admin);
    await expect(
      withKafkaAdmin(async () => undefined, { connectTimeoutMs: 20 })
    ).rejects.toMatchObject({ name: 'TimeoutError', code: 'KAFKA_ADMIN_CONNECT_TIMEOUT' });
  });

  it('observes and cleans up a late-settling connect after the timeout fires', async () => {
    let resolveConnect!: () => void;
    const admin = fakeAdmin({
      connect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      ),
    });
    mocks.admin.mockReturnValue(admin);
    const operation = withKafkaAdmin(async () => 1, { connectTimeoutMs: 10 });
    await expect(operation).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'KAFKA_ADMIN_CONNECT_TIMEOUT',
    });
    expect(admin.disconnect).not.toHaveBeenCalled();
    resolveConnect();
    await vi.waitFor(() => expect(admin.disconnect).toHaveBeenCalledOnce());
  });
});
