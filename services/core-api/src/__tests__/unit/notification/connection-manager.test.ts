// unit/notification/connection-manager.test.ts
// Unit tests for SSE connection eviction semantics (CodeRabbit #5, round 2):
// a false heartbeat/publish write result is BACKPRESSURE, not failure — the
// connection survives and resumes after drain. Only a socket that is actually
// dead (destroyed/ended) is evicted; a frame skipped for a pending drain is
// queued, while a frame WRITTEN under backpressure is delivered and never
// re-queued (bound/overflow/flush tests live in connection-manager-backpressure.test.ts).
// Uses fake timers so the heartbeat interval fires deterministically. Pure
// unit tests — mock ServerResponse, no network.

import { describe, expect, it, vi } from 'vitest';

import { config } from '../../../lib/config.js';
import { connectionManager } from '../../../modules/notification/connection-manager.js';

import { DTO, mockRes } from './helpers/connection-manager-fixtures.js';

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
  it('queues a frame skipped for a pending drain instead of dropping it, without evicting', () => {
    const { res, write } = mockRes({ writableNeedDrain: true });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);

    expect(delivered).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);
    handle.close();
    expect(connectionManager.connectionCount).toBe(0);
  });

  it('treats a write returning false as delivered — backpressured frame is NOT queued', () => {
    // res.write() === false means the frame was ACCEPTED into the buffer. The
    // publish must report delivery and leave the pending queue empty.
    const { res, write } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    expect(connectionManager.connectionCount).toBe(1);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);

    expect(delivered).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(connectionManager.connectionCount).toBe(1);
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
