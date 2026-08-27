// unit/kafka-producer-lifecycle.test.ts
// Unit tests for producer lifecycle: closed terminal state, bounded teardown.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  producer: vi.fn(),
}));

vi.mock('../../lib/kafka-client.js', () => ({
  kafkaClient: { producer: mocks.producer },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  disconnectKafka,
  getProducer,
  isKafkaProducerClosed,
  KafkaProducerClosedError,
  registerSend,
  resetKafkaProducerForTests,
} from '../../lib/kafka-producer.js';
import { logger } from '../../lib/logger.js';

function fakeProducer() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue([{ errorCode: 0 }]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetKafkaProducerForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('disconnectKafka', () => {
  it('drains registered sends and disconnects the active producer within the budget', async () => {
    const producer = fakeProducer();
    mocks.producer.mockReturnValue(producer);
    const p = await getProducer();
    expect(p).toBe(producer);

    let release!: () => void;
    const send = new Promise<void>((resolve) => {
      release = resolve;
    });
    registerSend(send);
    let sendSettled = false;
    void send.then(() => {
      sendSettled = true;
    });

    const closing = disconnectKafka();
    expect(isKafkaProducerClosed()).toBe(true);
    release();
    await closing;

    expect(sendSettled).toBe(true);
    expect(producer.disconnect).toHaveBeenCalledOnce();
  });

  it('rejects new getProducer and registerSend once closed', async () => {
    const producer = fakeProducer();
    mocks.producer.mockReturnValue(producer);
    await getProducer();
    await disconnectKafka();

    await expect(getProducer()).rejects.toBeInstanceOf(KafkaProducerClosedError);
    expect(() => registerSend(Promise.resolve())).toThrow(KafkaProducerClosedError);
    expect(isKafkaProducerClosed()).toBe(true);
  });

  it('resolves within the shutdown budget when the native connect never settles', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    producer.connect.mockReturnValue(new Promise<void>(() => {}));
    mocks.producer.mockReturnValue(producer);

    void getProducer();
    const closing = disconnectKafka();

    await vi.advanceTimersByTimeAsync(30000);

    await expect(closing).resolves.toBeUndefined();
    expect(producer.disconnect).not.toHaveBeenCalled();
  });

  it('logs SHUTDOWN_DEADLINE_EXCEEDED when the shutdown budget is exhausted', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    producer.connect.mockReturnValue(new Promise<void>(() => {}));
    mocks.producer.mockReturnValue(producer);

    void getProducer();
    const closing = disconnectKafka();

    await vi.advanceTimersByTimeAsync(30000);
    await closing;

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SHUTDOWN_DEADLINE_EXCEEDED' }),
      expect.any(String)
    );
  });

  it('resolves within the budget when a send is parked on a hung connect', async () => {
    vi.useFakeTimers();
    const producer = fakeProducer();
    const hungConnect = new Promise<void>(() => {});
    producer.connect.mockReturnValue(hungConnect);
    mocks.producer.mockReturnValue(producer);

    void getProducer();
    // A send task parked on the never-settling connect stays in activeSends.
    const parkedSend = hungConnect.then(() => undefined);
    registerSend(parkedSend);

    const closing = disconnectKafka();

    await vi.advanceTimersByTimeAsync(30000);
    await vi.advanceTimersByTimeAsync(1);

    await expect(closing).resolves.toBeUndefined();
  });

  it('disconnects a producer whose connect succeeds after the budget exhausted', async () => {
    vi.useFakeTimers();
    let releaseConnect!: () => void;
    const hungConnect = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const producer = fakeProducer();
    producer.connect.mockReturnValue(hungConnect);
    mocks.producer.mockReturnValue(producer);

    void getProducer();
    const closing = disconnectKafka();

    await vi.advanceTimersByTimeAsync(30000);
    releaseConnect();
    await vi.advanceTimersByTimeAsync(0);

    await closing;
    expect(producer.disconnect).toHaveBeenCalledOnce();
  });

  it('resetKafkaProducerForTests re-arms a closed producer', async () => {
    const producer = fakeProducer();
    mocks.producer.mockReturnValue(producer);
    await getProducer();
    await disconnectKafka();
    expect(isKafkaProducerClosed()).toBe(true);

    resetKafkaProducerForTests();
    expect(isKafkaProducerClosed()).toBe(false);

    const p = await getProducer();
    expect(p).toBe(producer);
  });
});
