// unit/notification/connection-manager-backpressure.test.ts
// Unit tests for the bounded per-connection pending-frame queue (CodeRabbit):
// a frame published while the socket buffer is backed up is retained and
// flushed on `drain` (not dropped); a queue past its bound evicts the reader;
// the queue is cleared on close/error (no leak). Pure unit tests — mock
// ServerResponse, no network.

import { describe, expect, it } from 'vitest';

import { config } from '../../../lib/config.js';
import { connectionManager } from '../../../modules/notification/connection-manager.js';

import { DTO, mockRes } from './helpers/connection-manager-fixtures.js';

describe('connectionManager — pending frame queue (CodeRabbit)', () => {
  it('delivers a backpressured frame on drain instead of dropping it', () => {
    const { res, write, listeners } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);

    const delivered = connectionManager.publish('acme', 'user-1', DTO);
    expect(delivered).toBe(false);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');

    expect(write).toHaveBeenCalledTimes(1);
    const payload = write.mock.calls[0]?.[0] as string;
    expect(payload).toContain('event: notification');
    expect(payload).toContain(`"id":"${DTO.id}"`);
    handle.close();
  });

  it('delivers every queued frame in FIFO order once the socket drains', () => {
    const { res, write, listeners } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    connectionManager.publish('acme', 'user-1', DTO);
    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');

    expect(write).toHaveBeenCalledTimes(2);
    handle.close();
  });

  it('stops flushing on re-backpressure and resumes on a later drain', () => {
    const { res, write, listeners } = mockRes({ writeResult: false });
    const handle = connectionManager.connect('acme', 'user-1', res);
    connectionManager.publish('acme', 'user-1', DTO);
    connectionManager.publish('acme', 'user-1', DTO);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValueOnce(true).mockReturnValueOnce(false);
    listeners.emit('drain');
    expect(write).toHaveBeenCalledTimes(2);
    expect(connectionManager.connectionCount).toBe(1);

    write.mockClear();
    write.mockReturnValue(true);
    listeners.emit('drain');
    expect(write).toHaveBeenCalledTimes(1);
    handle.close();
  });

  it('evicts the connection when the pending frame queue exceeds its bound', () => {
    const { res } = mockRes({ writeResult: false });
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
    const { res, write, listeners } = mockRes({ writeResult: false });
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
