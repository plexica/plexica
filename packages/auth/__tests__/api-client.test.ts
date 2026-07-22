import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/api-client.js';

function response(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: () => void } {
  let resolve = (): void => undefined;
  let reject = (): void => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = () => rejectPromise(new Error('refresh failed'));
  });
  return { promise, resolve, reject };
}

describe('API client refresh handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should share one refresh across concurrent 401 responses', async () => {
    const refresh = deferred();
    const refreshTokens = vi.fn(() => refresh.promise);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { request: 1 }))
      .mockResolvedValueOnce(response(200, { request: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      getTokens: () => ({ accessToken: 'access', refreshToken: 'refresh' }),
      refreshTokens,
      onSessionExpired: vi.fn(),
    });

    const first = client.get<{ request: number }>('/one');
    const second = client.get<{ request: number }>('/two');
    await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledTimes(1));
    refresh.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([{ request: 1 }, { request: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('should expire once when a shared refresh fails', async () => {
    const refresh = deferred();
    const onSessionExpired = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    const client = createApiClient({
      getTokens: () => ({ accessToken: 'access', refreshToken: 'refresh' }),
      refreshTokens: vi.fn(() => refresh.promise),
      onSessionExpired,
    });

    const first = client.get('/one');
    const second = client.get('/two');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    refresh.reject();

    await expect(first).rejects.toThrow('Session expired');
    await expect(second).rejects.toThrow('Session expired');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('should expire the session when the retried request remains unauthorized', async () => {
    const onSessionExpired = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    const client = createApiClient({
      getTokens: () => ({ accessToken: 'access', refreshToken: 'refresh' }),
      refreshTokens: vi.fn().mockResolvedValue(undefined),
      onSessionExpired,
    });

    await expect(client.get('/protected')).rejects.toThrow('Session expired');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
