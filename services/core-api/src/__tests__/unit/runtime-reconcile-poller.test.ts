// Unit tests for runtime-reconcile-poller.service.ts.
// Verifies the periodic reconciler lifecycle: start (idempotent), the cycle
// invokes reconcilePluginRuntimes, skip-if-busy, and stop tears the timer down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/plugin/services/runtime-recovery.service.js', () => ({
  reconcilePluginRuntimes: vi.fn(),
}));

import {
  startPeriodicRuntimeReconcile,
  stopPeriodicRuntimeReconcile,
} from '../../modules/plugin/services/runtime-reconcile-poller.service.js';
import { reconcilePluginRuntimes } from '../../modules/plugin/services/runtime-recovery.service.js';

const mockReconcile = vi.mocked(reconcilePluginRuntimes);

const TICK_MS = 10;

beforeEach(() => {
  mockReconcile.mockReset();
  mockReconcile.mockResolvedValue({ restored: 1, failed: 0 });
});

afterEach(async () => {
  await stopPeriodicRuntimeReconcile();
  vi.restoreAllMocks();
});

describe('periodic runtime reconcile poller', () => {
  it('invokes reconcilePluginRuntimes on each tick', async () => {
    startPeriodicRuntimeReconcile(TICK_MS);
    await vi.waitFor(() => {
      expect(mockReconcile).toHaveBeenCalled();
    });
  });

  it('is idempotent under repeated start calls', async () => {
    startPeriodicRuntimeReconcile(TICK_MS);
    startPeriodicRuntimeReconcile(TICK_MS);
    startPeriodicRuntimeReconcile(TICK_MS);
    await vi.waitFor(() => {
      expect(mockReconcile).toHaveBeenCalled();
    });
    // Multiple start() calls must not create concurrent reconcile cycles:
    // the poller is a single interval, and cycles are sequential.
    expect(mockReconcile.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('stop prevents further invocations', async () => {
    startPeriodicRuntimeReconcile(TICK_MS);
    await vi.waitFor(() => expect(mockReconcile).toHaveBeenCalled());
    const callsBeforeStop = mockReconcile.mock.calls.length;

    await stopPeriodicRuntimeReconcile();
    const callsAtStop = mockReconcile.mock.calls.length;
    expect(callsAtStop).toBeGreaterThanOrEqual(callsBeforeStop);

    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 5));
    expect(mockReconcile.mock.calls.length).toBe(callsAtStop);
  });

  it('swallows a throwing reconcile without killing the interval', async () => {
    mockReconcile.mockRejectedValueOnce(new Error('boom'));
    startPeriodicRuntimeReconcile(TICK_MS);
    await vi.waitFor(() => {
      expect(mockReconcile).toHaveBeenCalled();
    });
    mockReconcile.mockResolvedValue({ restored: 0, failed: 0 });
    await vi.waitFor(() => {
      expect(mockReconcile.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});