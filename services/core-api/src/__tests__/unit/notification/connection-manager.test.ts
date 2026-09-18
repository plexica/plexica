// unit/notification/connection-manager.test.ts
// Unit tests for SSE connection eviction semantics (CodeRabbit #5, round 2):
// a false heartbeat/publish write result is BACKPRESSURE, not failure — the
// connection survives and resumes after drain. Only a socket that is actually
// dead (destroyed/ended) is evicted. Uses fake timers so the heartbeat
// interval fires deterministically. Pure unit tests — mock ServerResponse, no
// network.

import { describe, expect, it, vi } from 'vitest';

import { config } from '../../../lib/config.js';
import { connectionManager } from '../../../modules/notification/connection-manager.js';

import type { NotificationDto } from '../../../modules/notification/types.js';
import type { ServerResponse } from 'node:http';

function mockRes(
  overrides: {
    writeResult?: boolean;
    destroyed?: boolean;
    writableEnded?: boolean;
    writableNeedDrain?: boolean;
  } = {}
): {
  res: ServerResponse;
  end: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  const res = {
    destroyed: overrides.destroyed ?? false,
    writableEnded: overrides.writableEnded ?? false,
    writableNeedDrain: overrides.writableNeedDrain ?? false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => overrides.writeResult ?? true),
    end: vi.fn(),
    on: vi.fn(),
  };
  return { res: res as unknown as ServerResponse, end: res.end, write: res.write };
}

const DTO: NotificationDto = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'workspace.invite',
  titleKey: 'notification.workspace.invite.title',
  bodyKey: 'notification.workspace.invite.body',
  metadata: {},
  read: false,
  createdAt: '2026-09-18T00:00:00.000Z',
};

describe('connectionManager — heartbeat backpressure (CodeRabbit #5, round 2)', () => {
  it('does NOT evict a backpressured connection when the heartbeat write returns false', () => {
    vi.useFakeTimers();
    const { res, end } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);

    expect(end).not.toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);
    handle.close();
    vi.useRealTimers();
  });

  it('resumes heartbeat writes after the socket drains', () => {
    vi.useFakeTimers();
    const { res, end, write } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);
    expect(end).not.toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);

    write.mockReturnValue(true);
    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);

    expect(end).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);
    handle.close();
    vi.useRealTimers();
  });

  it('evicts a destroyed response on the heartbeat tick', () => {
    vi.useFakeTimers();
    const { res } = mockRes({ destroyed: true });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    vi.advanceTimersByTime(config.NOTIFICATION_SSE_HEARTBEAT_MS);

    expect(connectionManager.connectionCount).toBe(0);
    handle.close();
    vi.useRealTimers();
  });

  it('keeps a healthy connection alive when the heartbeat write succeeds', () => {
    vi.useFakeTimers();
    const { res, end } = mockRes({ writeResult: true });
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

describe('connectionManager — publish backpressure (CodeRabbit #5, round 2)', () => {
  it('skips a backpressured connection but does NOT evict it', () => {
    const { res, write } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);

    expect(delivered).toBe(false);
    expect(connectionManager.connectionCount).toBe(1);
    expect(write).toHaveBeenCalled();
    handle.close();
    expect(connectionManager.connectionCount).toBe(0);
  });

  it('evicts only connections whose response is destroyed or ended', () => {
    const dead = mockRes({ destroyed: true });
    const deadHandle = connectionManager.connect('acme', 'user-1', dead.res);
    const ended = mockRes({ writableEnded: true });
    const endedHandle = connectionManager.connect('acme', 'user-1', ended.res);
    expect(connectionManager.connectionCount).toBe(2);

    connectionManager.publish('acme', 'user-1', DTO);

    expect(connectionManager.connectionCount).toBe(0);
    deadHandle.close();
    endedHandle.close();
  });

  it('delivers to a healthy connection and keeps it registered', () => {
    const { res, write } = mockRes({ writeResult: true });
    const handle = connectionManager.connect('acme', 'user-1', res);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);

    expect(delivered).toBe(true);
    expect(write).toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);
    handle.close();
    expect(connectionManager.connectionCount).toBe(0);
  });
});
