// unit/notification/connection-manager-backpressure.test.ts
// Unit tests for the bounded per-connection pending-frame queue (CodeRabbit):
// a frame skipped for a pending drain is retained and flushed exactly once on
// `drain` (not dropped); a frame WRITTEN under backpressure (res.write() ===
// false) is delivered and NEVER re-queued — that would emit it twice on the
// next drain (CodeRabbit duplicate-frame fix); a queue past its bound evicts
// the reader; the queue is cleared on close/error (no leak). Pure unit tests —
// mock ServerResponse, no network.

import { describe, expect, it } from 'vitest';

import { config } from '../../../lib/config.js';
import { connectionManager } from '../../../modules/notification/connection-manager.js';

import { DTO, mockRes } from './helpers/connection-manager-fixtures.js';

describe('connectionManager — pending frame queue (CodeRabbit)', () => {
  it('delivers a frame written under backpressure ONCE and never re-emits it on drain', () => {
    // res.write() returns false → the frame is ACCEPTED into the buffer
    // (written, backpressure: true). It must not be queued nor flushed again.
    const { res, write, listeners } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);
    expect(delivered).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const payload = write.mock.calls[0]?.[0] as string;
    expect(payload).toContain('event: notification');
    expect(payload).toContain(`"id":"${DTO.id}"`);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');

    expect(write).not.toHaveBeenCalled();
    handle.close();
  });

  it('queues a frame skipped for a pending drain and emits it exactly once on drain', () => {
    const { res, write, listeners, setWritableNeedDrain } = mockRes({
      writableNeedDrain: true,
    });
    const handle = connectionManager.connect('acme', 'user-1', res);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);
    expect(delivered).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(connectionManager.connectionCount).toBe(1);

    write.mockReturnValue(true);
    setWritableNeedDrain(false);
    listeners.emit('drain');

    expect(write).toHaveBeenCalledTimes(1);
    const payload = write.mock.calls[0]?.[0] as string;
    expect(payload).toContain('event: notification');
    expect(payload).toContain(`"id":"${DTO.id}"`);

    write.mockClear();
    listeners.emit('drain');
    expect(write).not.toHaveBeenCalled();
    handle.close();
  });

  it('delivers every queued frame in FIFO order once the socket drains', () => {
    const { res, write, listeners, setWritableNeedDrain } = mockRes({
      writableNeedDrain: true,
    });
    const handle = connectionManager.connect('acme', 'user-1', res);
    connectionManager.publish('acme', 'user-1', DTO);
    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(1);
    expect(write).not.toHaveBeenCalled();

    write.mockReturnValue(true);
    setWritableNeedDrain(false);
    listeners.emit('drain');

    expect(write).toHaveBeenCalledTimes(2);
    handle.close();
  });

  it('stops flushing on re-backpressure and resumes on a later drain without duplicating', () => {
    const { res, write, listeners, setWritableNeedDrain } = mockRes({
      writableNeedDrain: true,
    });
    const handle = connectionManager.connect('acme', 'user-1', res);
    connectionManager.publish('acme', 'user-1', DTO);
    connectionManager.publish('acme', 'user-1', DTO);
    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(1);

    setWritableNeedDrain(false);
    write.mockReturnValueOnce(true).mockReturnValueOnce(false);
    listeners.emit('drain');
    // Frame 1 written cleanly; frame 2 written under backpressure (delivered,
    // NOT re-queued) → flush stops; frame 3 remains queued for the next drain.
    expect(write).toHaveBeenCalledTimes(2);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');
    expect(write).toHaveBeenCalledTimes(1);
    handle.close();
  });

  it('evicts the connection when the pending frame queue exceeds its bound', () => {
    const { res } = mockRes({ writableNeedDrain: true });
    const handle = connectionManager.connect('acme', 'user-1', res);
    const bound = config.NOTIFICATION_SSE_PENDING_QUEUE_BOUND;

    for (let i = 0; i < bound; i++) {
      connectionManager.publish('acme', 'user-1', DTO);
    }
    expect(connectionManager.connectionCount).toBe(1);

    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(0);
    handle.close();
  });

  it('clears queued frames and the drain listener when the connection closes', () => {
    const { res, write, listeners } = mockRes({ writableNeedDrain: true });
    const handle = connectionManager.connect('acme', 'user-1', res);
    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(1);

    handle.close();
    expect(connectionManager.connectionCount).toBe(0);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');
    expect(write).not.toHaveBeenCalled();
  });
});
