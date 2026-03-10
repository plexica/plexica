// File: packages/api-client/__tests__/rate-limit-retry.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { HttpClient } from '../src/client.js';
import { ApiError, parseRetryAfter as parseRetryAfterFromIndex } from '../src/index.js';
import type { AuthTokenProvider } from '../src/types.js';
import { parseRetryAfter } from '../src/retry-after.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(opts?: {
  onRateLimited?: (retryAfter: number) => void;
  maxRetries?: number;
  enabled?: boolean;
  retryMethods?: string[];
}): { client: HttpClient; mock: MockAdapter } {
  const client = new HttpClient({
    baseUrl: 'http://localhost:3000',
    onRateLimited: opts?.onRateLimited,
    retryConfig: {
      maxRetries: opts?.maxRetries,
      enabled: opts?.enabled,
      retryMethods: opts?.retryMethods,
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock = new MockAdapter((client as any).axios);
  return { client, mock };
}

// Constitution Art. 6.2 nested error envelope (the format core-api always sends)
const RATE_LIMIT_BODY = {
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded. Try again in 1 seconds.',
    details: { scope: 'auth', limit: 10, windowSeconds: 60, retryAfter: 1 },
  },
};

/**
 * Run `fn()` and advance fake timers concurrently so that the catch handler
 * is attached before the interceptor's setTimeout fires. Without this, Vitest
 * sees the rejection as "unhandled" because the timer callback runs before
 * the awaiting test has attached its own rejection handler.
 */
async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
  const [result] = await Promise.all([fn(), vi.runAllTimersAsync()]);
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HttpClient — 429 rate-limit handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Single retry success
  // -------------------------------------------------------------------------

  it('should retry once on 429 and return the successful response', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      if (callCount === 1) {
        return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
      }
      return [200, { ok: true }];
    });

    const result = await runWithTimers(() => client.get('/api/test'));
    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // All retries exhausted
  // -------------------------------------------------------------------------

  it('should throw ApiError after all retries are exhausted (default maxRetries=2)', async () => {
    const { client, mock } = makeClient();
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    // 1 original + 2 retries = 3 total calls
    expect(callCount).toBe(3);
  });

  it('should throw ApiError with isRateLimited=true when retries exhausted', async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '5' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.isRateLimited).toBe(true);
      expect(apiErr.statusCode).toBe(429);
    }
  });

  // -------------------------------------------------------------------------
  // retryAfter field on thrown error
  // -------------------------------------------------------------------------

  it('should populate retryAfter on the thrown ApiError', async () => {
    const { client, mock } = makeClient({ maxRetries: 0 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '42' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as ApiError).retryAfter).toBe(42);
    }
  });

  it('should use safe default retryAfter=60 when Retry-After header is missing', async () => {
    const { client, mock } = makeClient({ maxRetries: 0 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY);

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as ApiError).retryAfter).toBe(60);
    }
  });

  // -------------------------------------------------------------------------
  // onRateLimited callback
  // -------------------------------------------------------------------------

  it('should call onRateLimited with the retryAfter value after retries exhausted', async () => {
    const onRateLimited = vi.fn();
    const { client, mock } = makeClient({ onRateLimited, maxRetries: 1 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '30' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    expect(onRateLimited).toHaveBeenCalledOnce();
    expect(onRateLimited).toHaveBeenCalledWith(30);
  });

  it('should NOT call onRateLimited when the retry succeeds', async () => {
    const onRateLimited = vi.fn();
    const { client, mock } = makeClient({ onRateLimited, maxRetries: 2 });
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      return callCount === 1 ? [429, RATE_LIMIT_BODY, { 'retry-after': '1' }] : [200, { ok: true }];
    });

    await runWithTimers(() => client.get('/api/test'));
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Retry disabled
  // -------------------------------------------------------------------------

  it('should not retry when retryConfig.enabled is false', async () => {
    const onRateLimited = vi.fn();
    const { client, mock } = makeClient({ onRateLimited, enabled: false });
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    // Should have been called exactly once — no retries
    expect(callCount).toBe(1);
    expect(onRateLimited).toHaveBeenCalledOnce();
  });

  it('should not retry when maxRetries is 0', async () => {
    const onRateLimited = vi.fn();
    const { client, mock } = makeClient({ onRateLimited, maxRetries: 0 });
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    expect(callCount).toBe(1);
    expect(onRateLimited).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Exponential back-off timing
  // -------------------------------------------------------------------------

  it('should apply exponential back-off: attempt 1 delay = retryAfterMs', async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '2' });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch {
      // expected
    }

    // First (and only) retry delay: 2s * 2^0 = 2000ms
    const delays = setTimeoutSpy.mock.calls.map((args) => args[1]);
    expect(delays).toContain(2000);
  });

  it('should double the delay on the second retry attempt', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '2' });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch {
      // expected
    }

    // Attempt 1 delay: 2s * 2^0 = 2000ms
    // Attempt 2 delay: 2s * 2^1 = 4000ms
    const delays = setTimeoutSpy.mock.calls.map((args) => args[1]);
    expect(delays).toContain(2000);
    expect(delays).toContain(4000);
  });

  it('should cap back-off delay at 30 seconds', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });

    // retryAfter=20 → attempt 2 delay = 20*1000*2 = 40_000 → capped at 30_000
    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '20' });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch {
      // expected
    }

    const delays = setTimeoutSpy.mock.calls.map((args) => args[1]);
    // No delay should exceed 30_000
    expect(delays.every((d) => (d as number) <= 30_000)).toBe(true);
    // Attempt 2 should be capped at 30_000
    expect(delays).toContain(30_000);
  });

  // -------------------------------------------------------------------------
  // No conflict between 429 and 401
  // -------------------------------------------------------------------------

  it('should handle 401 independently — 429 retry does not interfere with token refresh', async () => {
    let currentToken = 'expired-token';
    const provider: AuthTokenProvider = {
      getToken: () => currentToken,
      refreshToken: async () => {
        currentToken = 'new-token';
        return true;
      },
    };

    const { client, mock } = makeClient({ maxRetries: 1 });
    client.setAuthProvider(provider);

    let callCount = 0;
    mock.onGet('/api/test').reply((config) => {
      callCount++;
      if (config.headers?.Authorization === 'Bearer expired-token') {
        return [401, { error: 'Unauthorized', message: 'Token expired' }];
      }
      return [200, { ok: true }];
    });

    const result = await runWithTimers(() => client.get('/api/test'));
    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  it('should preserve auth headers on 429 retry requests', async () => {
    const provider: AuthTokenProvider = {
      getToken: () => 'my-token',
    };

    const { client, mock } = makeClient({ maxRetries: 1 });
    client.setAuthProvider(provider);

    let callCount = 0;
    const authHeaders: (string | undefined)[] = [];

    mock.onGet('/api/test').reply((config) => {
      callCount++;
      authHeaders.push(config.headers?.Authorization as string | undefined);
      return callCount === 1 ? [429, RATE_LIMIT_BODY, { 'retry-after': '1' }] : [200, { ok: true }];
    });

    await runWithTimers(() => client.get('/api/test'));
    // Both original and retry should have the same auth header
    expect(authHeaders[0]).toBe('Bearer my-token');
    expect(authHeaders[1]).toBe('Bearer my-token');
  });

  // -------------------------------------------------------------------------
  // Constitution Art. 6.2 nested error envelope parsing
  // -------------------------------------------------------------------------

  it('should unwrap the nested Art. 6.2 error envelope: errorCode, message, details', async () => {
    const { client, mock } = makeClient({ maxRetries: 0 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '5' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      // errorCode must come from error.code, not [object Object]
      expect(apiErr.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(apiErr.message).toBe('Rate limit exceeded. Try again in 1 seconds.');
      expect(apiErr.details).toEqual({
        scope: 'auth',
        limit: 10,
        windowSeconds: 60,
        retryAfter: 1,
      });
    }
  });

  it('should fall back to generic message when response body is absent', async () => {
    const { client, mock } = makeClient({ maxRetries: 0 });

    // No body at all
    mock.onGet('/api/test').reply(429, null, { 'retry-after': '10' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(apiErr.message).toContain('10');
    }
  });

  it('should apply minimum 1 000ms retry delay when retryAfter=0', async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '0' });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch {
      // expected
    }

    const delays = setTimeoutSpy.mock.calls.map((args) => args[1] as number);
    // No delay should be 0 — minimum floor is 1 000ms
    expect(delays.every((d) => d >= 1_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-10 contract: parseRetryAfter re-export identity (TS-01)
// ---------------------------------------------------------------------------

describe('parseRetryAfter — re-export identity contract (AC-10)', () => {
  it('should be the same function reference whether imported from index or retry-after module', () => {
    // Ensures useAuthorizationApi.ts (and any other consumer) that imports
    // parseRetryAfter from @plexica/api-client gets the canonical implementation
    // and not a locally-defined duplicate.
    expect(parseRetryAfterFromIndex).toBe(parseRetryAfter);
  });
});

// ---------------------------------------------------------------------------
// C-01 regression: throwing onRateLimited must not replace the ApiError
// ---------------------------------------------------------------------------

describe('HttpClient — C-01: onRateLimited callback safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should still throw ApiError even if onRateLimited callback throws', async () => {
    // If the callback throws, the catch block swallows it and the authoritative
    // ApiError is still the rejection reason (not the callback error).
    const onRateLimited = () => {
      throw new Error('toast library crashed');
    };
    const { client, mock } = makeClient({ onRateLimited, maxRetries: 0 });

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '5' });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      // Must be ApiError — not the "toast library crashed" error
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).isRateLimited).toBe(true);
      expect((err as ApiError).statusCode).toBe(429);
    }
  });
});

// ---------------------------------------------------------------------------
// C-02 regression: abort signal respected before and after sleep
// ---------------------------------------------------------------------------

describe('HttpClient — C-02: abort signal awareness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reject with CanceledError when signal is already aborted before sleep', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    const controller = new AbortController();

    // Abort the signal before the request is made
    controller.abort();

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '1' });

    try {
      await runWithTimers(() => client.get('/api/test', undefined, controller.signal));
      expect.fail('Should have thrown');
    } catch (err) {
      // CanceledError is thrown when the signal is already aborted (C-02 pre-sleep check)
      expect(axios.isCancel(err)).toBe(true);
    }
  });

  it('should reject with CanceledError when signal fires during back-off sleep', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    const controller = new AbortController();

    mock.onGet('/api/test').reply(429, RATE_LIMIT_BODY, { 'retry-after': '10' });

    // Abort mid-sleep by aborting after request starts
    const promise = client.get('/api/test', undefined, controller.signal);
    controller.abort();

    try {
      await Promise.all([promise, vi.runAllTimersAsync()]);
      expect.fail('Should have thrown');
    } catch (err) {
      // CanceledError is thrown when signal fires during backoff (C-02 post-sleep check)
      expect(axios.isCancel(err)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// retryMethods: idempotency guard for non-GET methods
// ---------------------------------------------------------------------------

describe('HttpClient — retryMethods idempotency guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT retry POST by default (POST is non-idempotent)', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    let callCount = 0;

    mock.onPost('/api/test').reply(() => {
      callCount++;
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.post('/api/test', { foo: 'bar' }));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    // Only 1 call — POST not retried with default retryMethods
    expect(callCount).toBe(1);
  });

  it('should NOT retry DELETE by default', async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    let callCount = 0;

    mock.onDelete('/api/test').reply(() => {
      callCount++;
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.delete('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    expect(callCount).toBe(1);
  });

  it('should retry GET by default (GET is idempotent)', async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });
    let callCount = 0;

    mock.onGet('/api/test').reply(() => {
      callCount++;
      // Always 429 so we can count retries
      return [429, RATE_LIMIT_BODY, { 'retry-after': '1' }];
    });

    try {
      await runWithTimers(() => client.get('/api/test'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
    // 1 original + 1 retry = 2 total
    expect(callCount).toBe(2);
  });

  it('should retry POST when explicitly listed in retryMethods', async () => {
    const { client, mock } = makeClient({
      maxRetries: 1,
      retryMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    });
    let callCount = 0;

    mock.onPost('/api/test').reply(() => {
      callCount++;
      return callCount === 1 ? [429, RATE_LIMIT_BODY, { 'retry-after': '1' }] : [200, { ok: true }];
    });

    const result = await runWithTimers(() => client.post('/api/test', {}));
    expect(result).toEqual({ ok: true });
    // 1 original + 1 retry = 2 total
    expect(callCount).toBe(2);
  });
});
