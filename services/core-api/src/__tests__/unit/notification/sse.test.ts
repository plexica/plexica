// unit/notification/sse.test.ts
// Unit tests for the SSE heartbeat backpressure fix (CodeRabbit #5):
// writeHeartbeat must propagate the raw res.write() result (false = kernel
// buffer full / backpressure) so the heartbeat scheduler can evict a stalled
// connection instead of silently buffering bytes. Pure unit tests — mock
// ServerResponse.

import { describe, expect, it, vi } from 'vitest';

import { writeHeartbeat } from '../../../modules/notification/sse.js';

import type { ServerResponse } from 'node:http';

function mockRes(writeResult: boolean): {
  res: ServerResponse;
  write: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn(() => writeResult);
  const res = {
    destroyed: false,
    writableEnded: false,
    writableNeedDrain: false,
    write,
  } as unknown as ServerResponse;
  return { res, write };
}

describe('writeHeartbeat — backpressure propagation (CodeRabbit #5)', () => {
  it('returns the raw res.write() result (false = stalled socket/backpressure)', () => {
    const { res, write } = mockRes(false);
    expect(writeHeartbeat(res)).toBe(false);
    expect(write).toHaveBeenCalledWith(':ping\n\n');

    const ok = mockRes(true);
    expect(writeHeartbeat(ok.res)).toBe(true);
  });

  it('short-circuits false without writing when the socket is destroyed or ended', () => {
    const dead = {
      destroyed: true,
      writableEnded: false,
      writableNeedDrain: false,
      write: vi.fn(() => true),
    } as unknown as ServerResponse;
    expect(writeHeartbeat(dead)).toBe(false);
    expect(dead.write).not.toHaveBeenCalled();

    const ended = {
      destroyed: false,
      writableEnded: true,
      writableNeedDrain: false,
      write: vi.fn(() => true),
    } as unknown as ServerResponse;
    expect(writeHeartbeat(ended)).toBe(false);
    expect(ended.write).not.toHaveBeenCalled();
  });

  it('short-circuits false on backpressure (writableNeedDrain) before writing', () => {
    const drained = {
      destroyed: false,
      writableEnded: false,
      writableNeedDrain: true,
      write: vi.fn(() => true),
    } as unknown as ServerResponse;
    expect(writeHeartbeat(drained)).toBe(false);
    expect(drained.write).not.toHaveBeenCalled();
  });
});
