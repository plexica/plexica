// pending-frame-queue.ts
// Bounded per-connection SSE pending-frame queue (CodeRabbit, feature 006-01):
// frames published while the socket buffer is backed up are buffered here and
// flushed on `drain` instead of dropped. Overflow evicts the connection via
// the caller (evict > unbounded memory). Independent of tenant/schema.

import { writeEvent } from './sse.js';

import type { ServerResponse } from 'node:http';
import type { SseFrame } from './sse.js';

/**
 * Bounded FIFO queue of frames awaiting a drain on a single SSE response.
 * `push` returns false (never grows past the bound) so the caller can evict
 * the stalled reader; `flush` writes queued frames until the socket backs up
 * again, leaving the rest for the next `drain`.
 */
export class PendingFrameQueue {
  private readonly frames: SseFrame[] = [];

  constructor(
    private readonly bound: number,
    private readonly res: ServerResponse
  ) {}

  get size(): number {
    return this.frames.length;
  }

  /** Appends a frame in FIFO order. Returns false when the bound is reached. */
  push(frame: SseFrame): boolean {
    if (this.frames.length >= this.bound) return false;
    this.frames.push(frame);
    return true;
  }

  /** Writes queued frames; a false write is re-backpressure — stop, wait for next drain. */
  flush(): void {
    if (this.res.destroyed || this.res.writableEnded) return;
    let frame: SseFrame | undefined;
    while ((frame = this.frames.shift()) !== undefined) {
      if (!writeEvent(this.res, frame)) {
        this.frames.unshift(frame);
        return;
      }
    }
  }

  clear(): void {
    this.frames.length = 0;
  }
}
