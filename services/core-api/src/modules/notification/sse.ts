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
 * Writes a single SSE frame. Multi-line JSON is split across `data:` lines per
 * the SSE spec so a payload never truncates the stream. Returns false when the
 * socket is already closed OR the socket buffer is full (writableNeedDrain —
 * backpressure): the caller should treat the connection as dead and evict it
 * rather than queueing more frames (per-user cap 5).
 */
export function writeEvent(res: ServerResponse, frame: SseFrame): boolean {
  if (res.destroyed || res.writableEnded) return false;
  if (res.writableNeedDrain) {
    logger.warn(
      { code: 'SSE_BACKPRESSURE' },
      'SSE socket buffer full — evicting slow consumer connection'
    );
    return false;
  }
  let payload = '';
  if (frame.event !== undefined) payload += `event: ${frame.event}\n`;
  if (frame.id !== undefined) payload += `id: ${frame.id}\n`;
  if (frame.retry !== undefined) payload += `retry: ${frame.retry}\n`;
  const json = JSON.stringify(frame.data);
  for (const line of json.split('\n')) payload += `data: ${line}\n`;
  payload += '\n';
  // res.write() returns false when the kernel buffer is full (backpressure) —
  // propagate it so connection-manager.publish evicts the slow consumer.
  return res.write(payload);
}

/** Keepalive comment frame — resets proxies' idle timeouts (20 s cadence). */
export function writeHeartbeat(res: ServerResponse): boolean {
  if (res.destroyed || res.writableEnded) return false;
  if (res.writableNeedDrain) return false;
  res.write(':ping\n\n');
  return true;
}
