// sse.ts
// Manual Server-Sent Events framing on the raw Node response (ADR-035 D-1,
// story E06-S001). Zero new dependency: event frames and the keepalive
// heartbeat are written directly to `reply.raw` (ServerResponse). All SSE
// wire-format code lives in this file (Rule 4).

import { logger } from '../../lib/logger.js';

import type { ServerResponse } from 'node:http';

export interface SseFrame {
  event?: string;
  id?: string;
  data: unknown;
  retry?: number;
}

export function writeSseHeaders(res: ServerResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush immediately so the client's fetch() resolves and the connection is
  // established before the first heartbeat (NFR-006-1: connect < 1 s). Without
  // this nothing is written until the first frame/heartbeat.
  res.flushHeaders();
}

/**
 * Result of a single SSE frame write, discriminating three states (CodeRabbit —
 * res.write() semantics):
 * - `{ written: true, backpressure: false }` — frame accepted, buffer has room.
 * - `{ written: true, backpressure: true }` — frame ACCEPTED into the kernel
 *   buffer; `res.write()` returned false, which only signals the buffer is now
 *   full (writableNeedDrain). The frame is delivered — never re-send it.
 * - `{ written: false, reason: 'drain' }` — frame NOT written; a drain was
 *   already pending before the write, so the caller queues it for `drain`.
 * - `{ written: false, reason: 'closed' }` — frame NOT written; the socket is
 *   destroyed/ended, so the caller evicts the connection.
 */
export type SseWriteResult =
  { written: true; backpressure: boolean } | { written: false; reason: 'drain' | 'closed' };

/**
 * Writes a single SSE frame. Multi-line JSON is split across `data:` lines per
 * the SSE spec so a payload never truncates the stream. A `res.write()` that
 * returns false is backpressure, NOT a skipped write: the frame is already in
 * the buffer and must not be queued/flushed again (that would emit it twice).
 * Only a drain-pending skip (checked before writing) leaves the frame unqueued
 * for the caller; only a destroyed/ended socket warrants eviction.
 */
export function writeEvent(res: ServerResponse, frame: SseFrame): SseWriteResult {
  if (res.destroyed || res.writableEnded) return { written: false, reason: 'closed' };
  if (res.writableNeedDrain) {
    logger.warn(
      { code: 'SSE_BACKPRESSURE' },
      'SSE socket buffer full — skipping frame for slow consumer'
    );
    return { written: false, reason: 'drain' };
  }
  let payload = '';
  if (frame.event !== undefined) payload += `event: ${frame.event}\n`;
  if (frame.id !== undefined) payload += `id: ${frame.id}\n`;
  if (frame.retry !== undefined) payload += `retry: ${frame.retry}\n`;
  const json = JSON.stringify(frame.data);
  for (const line of json.split('\n')) payload += `data: ${line}\n`;
  payload += '\n';
  // res.write() returning false is backpressure, NOT a failed write — the frame
  // is accepted into the buffer. Surface it as written+backpressure so callers
  // never queue an already-delivered frame (duplicate emission on drain).
  const accepted = res.write(payload);
  return { written: true, backpressure: !accepted };
}

/**
 * Keepalive comment frame — resets proxies' idle timeouts (20 s cadence).
 * Returns the raw res.write() result so the heartbeat scheduler can tell a
 * stalled-but-alive socket (false = kernel buffer full / backpressure) from a
 * dead one; the caller only evicts destroyed/ended sockets.
 */
export function writeHeartbeat(res: ServerResponse): boolean {
  if (res.destroyed || res.writableEnded) return false;
  if (res.writableNeedDrain) return false;
  return res.write(':ping\n\n');
}
