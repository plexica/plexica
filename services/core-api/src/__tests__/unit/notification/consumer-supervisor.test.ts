// unit/notification/consumer-supervisor.test.ts
// Unit tests for the bounded notification consumer supervisor (CodeRabbit
// round 2): failed consumer starts are retried with exponential backoff up to
// MAX_RETRIES, then the supervisor gives up (never loops forever). Shutdown
// clears the pending retry timer so the consumer is never restarted during or
// after teardown. Pure unit tests — consumer.ts is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startNotificationConsumer: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/logger.js', () => ({ logger: mocks.logger }));
vi.mock('../../../modules/notification/consumer.js', () => ({
  startNotificationConsumer: mocks.startNotificationConsumer,
}));

type SupervisorModule = typeof import('../../../modules/notification/consumer-supervisor.js');
let mod: SupervisorModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  mod = await import('../../../modules/notification/consumer-supervisor.js');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('notification consumer supervisor (CodeRabbit round 2)', () => {
  it('starts successfully without scheduling retries', async () => {
    mocks.startNotificationConsumer.mockResolvedValue(undefined);

    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));
    expect(mocks.logger.warn).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('is idempotent — a second start call does not double-start', async () => {
    mocks.startNotificationConsumer.mockResolvedValue(undefined);

    mod.startNotificationConsumerSupervisor();
    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));
  });

  it('retries with exponential backoff after a transient failure and recovers', async () => {
    mocks.startNotificationConsumer
      .mockRejectedValueOnce(new Error('broker unavailable'))
      .mockResolvedValueOnce(undefined);

    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(2));
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_RETRIES and logs NOTIF_CONSUMER_SUPERVISOR_EXHAUSTED', async () => {
    mocks.startNotificationConsumer.mockRejectedValue(new Error('broker unavailable'));

    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));

    // 1s + 2s + 4s + 8s + 16s backoff, then the supervisor exhausts.
    await vi.advanceTimersByTimeAsync(31_000);

    expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(6);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOTIF_CONSUMER_SUPERVISOR_EXHAUSTED' }),
      expect.any(String)
    );

    // No further retries fire after exhaustion.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(6);
  });

  it('stop clears a pending retry and never restarts the consumer', async () => {
    mocks.startNotificationConsumer.mockRejectedValue(new Error('broker unavailable'));

    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));

    mod.stopNotificationConsumerSupervisor();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the consumer rejects with NOTIF_CONSUMER_CLOSING', async () => {
    mocks.startNotificationConsumer.mockRejectedValue(new Error('NOTIF_CONSUMER_CLOSING'));

    mod.startNotificationConsumerSupervisor();

    await vi.waitFor(() => expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.startNotificationConsumer).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('start after stop is a no-op', async () => {
    mod.stopNotificationConsumerSupervisor();
    mod.startNotificationConsumerSupervisor();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.startNotificationConsumer).not.toHaveBeenCalled();
  });
});
