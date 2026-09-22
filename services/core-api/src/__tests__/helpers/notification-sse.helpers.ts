// notification-sse.helpers.ts
// Shared SSE test helpers for the notification integration suites: a fake
// ServerResponse that captures written frames (used to assert SSE delivery
// through the ConnectionManager without real HTTP) plus frame assertions.

import { EventEmitter } from 'node:events';

import type { ServerResponse } from 'node:http';

export interface FakeSseResponse extends EventEmitter {
  destroyed: boolean;
  writableEnded: boolean;
  writableNeedDrain: boolean;
  frames: string[];
  setHeader: (name: string, value: string | number | readonly string[]) => void;
  flushHeaders: () => void;
  write: (chunk: string) => boolean;
  end: () => void;
  destroy: () => void;
}

/** Creates a ServerResponse-shaped object that captures every written frame. */
export function createFakeSseResponse(): FakeSseResponse {
  const emitter = new EventEmitter();
  const res: FakeSseResponse = Object.assign(emitter, {
    destroyed: false,
    writableEnded: false,
    writableNeedDrain: false,
    frames: [] as string[],
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    write(chunk: string): boolean {
      res.frames.push(chunk);
      return true;
    },
    end(): void {
      res.writableEnded = true;
    },
    destroy(): void {
      res.destroyed = true;
    },
  });
  return res;
}

/** Returns true when the captured frames contain an `event: <name>` frame. */
export function hasSseEvent(res: FakeSseResponse, eventName: string): boolean {
  return res.frames.some((frame) => frame.includes(`event: ${eventName}\n`));
}

/** Returns the JSON payload of the first frame for the given event name. */
export function sseEventPayload<T>(res: FakeSseResponse, eventName: string): T | null {
  for (const frame of res.frames) {
    if (!frame.includes(`event: ${eventName}\n`)) continue;
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (data.length === 0) continue;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/** Polls until an SSE frame for `eventName` appears (delivery < 2s NFR window). */
export async function waitForSseEvent(
  res: FakeSseResponse,
  eventName: string,
  opts: { timeoutMs?: number; pollMs?: number } = {}
): Promise<void> {
  const { timeoutMs = 2_000, pollMs = 50 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasSseEvent(res, eventName)) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`SSE event "${eventName}" not received within ${String(timeoutMs)}ms`);
}

/** Cast helper so tests can hand the fake to ConnectionManager.connect(). */
export function asServerResponse(res: FakeSseResponse): ServerResponse {
  return res as unknown as ServerResponse;
}