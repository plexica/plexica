// unit/consumer-manager-shutdown.test.ts
// Per-group cancellation race: delete while creation is in flight, registered
// teardown, and shared-pending rejection semantics.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createConsumer: vi.fn(),
  startLagMonitoring: vi.fn(),
  stopLagMonitoring: vi.fn(),
}));

vi.mock('../../lib/kafka.js', () => ({
  createConsumer: mocks.createConsumer,
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../modules/plugin/events/lag-metrics.service.js', () => ({
  startLagMonitoring: mocks.startLagMonitoring,
  stopLagMonitoring: mocks.stopLagMonitoring,
}));

import {
  createConsumerGroup,
  deleteConsumerGroup,
} from '../../modules/plugin/events/consumer-manager.service.js';
import { cancellingGroups } from '../../modules/plugin/events/consumer-group-state.js';

const INSTALL_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PLUGIN_ID = 'plugin-1';

const handler = vi.fn().mockResolvedValue(undefined);

function makeFakeConsumer(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
    assignment: vi.fn().mockReturnValue([]),
    commitOffsets: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    ...overrides,
  };
}

describe('consumer-manager per-group cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels an in-flight creation: no registration, no lag monitoring, consumer disconnected', async () => {
    let resolveConnect!: () => void;
    const consumer = makeFakeConsumer({
      connect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      ),
    });
    mocks.createConsumer.mockReturnValue(consumer);

    const creating = createConsumerGroup(
      INSTALL_ID,
      TENANT_ID,
      'acme',
      ['plexica.workspace.*'],
      handler,
      PLUGIN_ID
    );
    await Promise.resolve();
    const deleting = deleteConsumerGroup(INSTALL_ID, 'acme');
    resolveConnect();

    await expect(creating).rejects.toMatchObject({ code: 'CONSUMER_GROUP_CANCELLED' });
    await deleting;
    expect(consumer.subscribe).not.toHaveBeenCalled();
    expect(mocks.startLagMonitoring).not.toHaveBeenCalled();
    expect(consumer.disconnect).toHaveBeenCalled();
  });

  it('disconnects a registered group and stops lag monitoring on delete', async () => {
    const consumer = makeFakeConsumer({
      assignment: vi.fn().mockReturnValue([{ topic: 'plexica.workspace.created', partition: 0 }]),
    });
    mocks.createConsumer.mockReturnValue(consumer);

    await createConsumerGroup(
      INSTALL_ID,
      TENANT_ID,
      'acme',
      ['plexica.workspace.*'],
      handler,
      PLUGIN_ID
    );
    expect(mocks.startLagMonitoring).toHaveBeenCalled();

    await deleteConsumerGroup(INSTALL_ID, 'acme');
    expect(consumer.disconnect).toHaveBeenCalled();
    expect(mocks.stopLagMonitoring).toHaveBeenCalledWith(INSTALL_ID);
  });

  it('a second createConsumerGroup shares the cancelled pending and rejects with the cancelled error', async () => {
    let resolveConnect!: () => void;
    const consumer = makeFakeConsumer({
      connect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      ),
    });
    mocks.createConsumer.mockReturnValue(consumer);

    const first = createConsumerGroup(
      INSTALL_ID,
      TENANT_ID,
      'acme',
      ['plexica.workspace.*'],
      handler,
      PLUGIN_ID
    );
    await Promise.resolve();
    const deleting = deleteConsumerGroup(INSTALL_ID, 'acme');
    const second = createConsumerGroup(
      INSTALL_ID,
      TENANT_ID,
      'acme',
      ['plexica.workspace.*'],
      handler,
      PLUGIN_ID
    );
    resolveConnect();

    await expect(first).rejects.toMatchObject({ code: 'CONSUMER_GROUP_CANCELLED' });
    await expect(second).rejects.toMatchObject({ code: 'CONSUMER_GROUP_CANCELLED' });
    await deleting;
    expect(mocks.startLagMonitoring).not.toHaveBeenCalled();
  });

  it('keeps the cancellation marker while creation is in flight past the delete budget and clears it once creation settles', async () => {
    vi.useFakeTimers();
    try {
      let resolveConnect!: () => void;
      const consumer = makeFakeConsumer({
        connect: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveConnect = resolve;
            })
        ),
      });
      mocks.createConsumer.mockReturnValue(consumer);

      const creating = createConsumerGroup(
        INSTALL_ID,
        TENANT_ID,
        'acme',
        ['plexica.workspace.*'],
        handler,
        PLUGIN_ID
      );
      await Promise.resolve();
      const deleting = deleteConsumerGroup(INSTALL_ID, 'acme');

      // The delete settle budget expires while the creation is still connecting,
      // so the marker must be retained (not cleared in the hot path).
      await vi.advanceTimersByTimeAsync(30000);

      // Now the creation settles (connects, then aborts because the marker is
      // still set); the marker is cleared rejection-safe via pending.then.
      resolveConnect();

      await expect(creating).rejects.toMatchObject({ code: 'CONSUMER_GROUP_CANCELLED' });
      await deleting;
      expect(cancellingGroups.has(`plugin-${INSTALL_ID}-acme`)).toBe(false);
      expect(consumer.subscribe).not.toHaveBeenCalled();
      expect(mocks.startLagMonitoring).not.toHaveBeenCalled();
      expect(consumer.disconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
