// sse-client.test.ts
// Unit tests for the SSE client reconnect loop (review B1): a mid-read abort
// (stale-watchdog abort / half-open socket) must NOT kill the connection — the
// client must clear the watchdog and retry instead of dying until a reload.
// The fetch + store are stubbed so no browser or backend is required.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client.js', () => ({ API_BASE: 'http://localhost:3000' }));
vi.mock('../stores/auth-store.js', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'test-token' }) },
}));

import { SseClient } from './sse-client.js';

const encoder = new TextEncoder();

/** A stream that emits one heartbeat chunk then errors on the next read. */
function halfOpenStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(':ping\n\n'));
    },
    pull() {
      // Simulate the stale-watchdog abort / a half-open socket: the next
      // reader.read() rejects.
      throw new Error('SSE_HALF_OPEN_READ_ERROR');
    },
  });
}

/** A stream that stays open but silent — keeps the client "connected". */
function idleStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      // Never enqueue, never error — reader.read() stays pending.
      return;
    },
  });
}

function fakeResponse(stream: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Condition not met within ${String(timeoutMs)}ms`);
}

describe('SseClient reconnect (B1)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries the connection when a mid-read abort rejects the stream, instead of dying', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls += 1;
      // First attempt errors mid-read; the retry succeeds and stays connected.
      return calls === 1 ? fakeResponse(halfOpenStream()) : fakeResponse(idleStream());
    });

    const client = new SseClient();
    try {
      client.start();
      // The first read rejects immediately → scheduleRetry (~1s backoff + jitter).
      await waitFor(() => calls >= 2, 5_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      client.stop();
    }
  });

  it('stops cleanly without scheduling a retry after stop()', async () => {
    fetchMock.mockImplementation(async () => fakeResponse(idleStream()));

    const client = new SseClient();
    client.start();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    client.stop();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect the connection when stop() races an in-flight fetch', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const client = new SseClient();
    client.start();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    client.stop();

    // The fetch resolves AFTER stop(): the stale generation must abort the
    // orphaned controller and never reconnect (start-after-stop race, N-minor).
    resolveFetch(fakeResponse(idleStream()));
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears a pending retry on stop() so a later start() can schedule retries again', async () => {
    // Every attempt errors mid-read → a ~1s retry timer stays pending. A
    // stop() during that pending retry must null the timer reference
    // (scheduleRetry() bails while retryTimer !== null) — otherwise the next
    // start()'s retry is silently dropped and reconnection dies forever.
    fetchMock.mockImplementation(async () => fakeResponse(halfOpenStream()));

    const client = new SseClient();
    try {
      client.start();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // attempt #1, retry pending
      client.stop();
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      expect(fetchMock).toHaveBeenCalledTimes(1); // stopped — no resurrection

      client.start(); // attempt #2 — must be able to schedule retries again
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await waitFor(() => fetchMock.mock.calls.length >= 3, 5_000); // its retry fires
    } finally {
      // The retry spawned by the third fetch would keep invoking the fetch mock
      // after the test returns — stop the client before exiting (review).
      client.stop();
    }
  });
});
