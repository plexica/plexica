// unit/notification/connection-manager.test.ts
// Unit tests for the SSE heartbeat eviction path (CodeRabbit #5): when the
// heartbeat write fails (res.write returns false), the connection is evicted —
// mirroring the failed-write eviction in publish(). Uses fake timers so the
// heartbeat interval fires deterministically. Pure unit tests — mock
// ServerResponse, no network.

import { describe, expect, it, vi } from 'vitest';

import { config } from '../../../lib/config.js';
import { connectionManager } from '../../../modules/notification/connection-manager.js';

import type { ServerResponse } from 'node:http';

function mockRes(writeResult: boolean): {
  res: ServerResponse;
  end: ReturnType<typeof vi.fn>;
} {
  const res = {
    destroyed: false,
    writableEnded: false,
    writableNeedDrain: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => writeResult),
    end: vi.fn(),
    on: vi.fn(),
  };
  return { res: res as unknown as ServerResponse, end: res.end };
}

describe('connectionManager — eviction on failed heartbeat write (CodeRabbit #5)', () => {
  it('evicts the connection when the heartbeat write returns false', () => {
    vi.useFakeTimers();
    const { res, end } = mockRes(false);
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);

    expect(end).toHaveBeenCalledTimes(1);
    expect(connectionManager.connectionCount).toBe(0);
    handle.close();
    vi.useRealTimers();
  });

  it('keeps a healthy connection alive when the heartbeat write succeeds', () => {
    vi.useFakeTimers();
    const { res, end } = mockRes(true);
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);

    expect(end).not.toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);
    handle.close();
    expect(connectionManager.connectionCount).toBe(0);
    vi.useRealTimers();
  });
});
