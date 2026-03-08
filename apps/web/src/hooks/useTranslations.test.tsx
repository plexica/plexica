// apps/web/src/hooks/useTranslations.test.tsx
//
// Tests for the two-step content-addressed translation caching (NFR-005 / TD-013).
//
// useTranslations uses globalThis.fetch (not apiClient) so all mocking is done
// via vi.stubGlobal('fetch', ...) — never via vi.mock('@/lib/api-client').
//
// The two-step flow:
//   Step 1 — stable URL:  GET /api/v1/translations/:locale/:namespace
//             → returns JSON bundle + X-Translation-Hash header
//   Step 2 — hashed URL:  GET /api/v1/translations/:locale/:namespace/:hash
//             → returns immutable JSON bundle (or follows 302 to new hash)
//
// useNamespaces delegates through apiClient (unchanged), so its tests still
// use vi.mock('@/lib/api-client').

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslations, useNamespaces } from './useTranslations';
import { IntlProvider } from '@/contexts/IntlContext';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock auth store so getAccessToken() returns a controlled value.
// useTranslations now selects `s.isAuthenticated` (a boolean), not s.user.
// ---------------------------------------------------------------------------
vi.mock('@/stores/auth.store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuthStore: vi.fn((selector: (s: any) => unknown) => selector({ isAuthenticated: false })),
  getAccessToken: vi.fn(() => null),
}));

import { getAccessToken } from '@/stores/auth.store';

// Mock getTenantFromUrl — default returns 'default'; individual tests override this.
vi.mock('@/lib/tenant', () => ({
  getTenantFromUrl: vi.fn(() => 'default'),
}));

import { getTenantFromUrl } from '@/lib/tenant';

// Mock apiClient used by useNamespaces
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <IntlProvider>{children}</IntlProvider>
    </QueryClientProvider>
  );
}

/**
 * Build a minimal Response-like object whose `.json()` and `.headers.get()`
 * can be awaited, matching the Fetch API shape used by fetchWithHash().
 */
function makeFetchResponse(body: unknown, options: { status?: number; hash?: string | null } = {}) {
  const { status = 200, hash = null } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-translation-hash' ? hash : null),
    },
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// useTranslations — two-step fetch
// ---------------------------------------------------------------------------

describe('useTranslations', () => {
  const stableBundle = {
    locale: 'en',
    namespace: 'core',
    messages: { greeting: 'Hello', farewell: 'Goodbye' },
    hash: 'a1b2c3d4',
  };

  const hashedBundle = {
    locale: 'en',
    namespace: 'core',
    messages: { greeting: 'Hello', farewell: 'Goodbye' },
    hash: 'a1b2c3d4',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Step 1: fetches stable URL and captures X-Translation-Hash header', async () => {
    const fetchMock = vi
      .fn()
      // Step 1 — stable URL
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: 'a1b2c3d4' }))
      // Step 2 — hashed URL
      .mockResolvedValueOnce(makeFetchResponse(hashedBundle));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Step 1 call — stable URL
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/translations/en/core',
      expect.objectContaining({ credentials: 'include' })
    );

    // Step 2 call — content-addressed URL using the hash from step 1
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/translations/en/core/a1b2c3d4',
      expect.objectContaining({ credentials: 'include', redirect: 'follow' })
    );

    expect(result.current.translations).toEqual({ greeting: 'Hello', farewell: 'Goodbye' });
    expect(result.current.hash).toBe('a1b2c3d4');
    expect(result.current.isError).toBe(false);
  });

  it('Step 2: does NOT fire until Step 1 resolves a valid 8-char hex hash', async () => {
    const fetchMock = vi
      .fn()
      // Step 1 returns a bundle with no hash header (edge case: CDN strips headers)
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: null }));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Only one fetch call — Step 2 is gated by a valid hash
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still returns Step 1 data as fallback
    expect(result.current.translations).toEqual({ greeting: 'Hello', farewell: 'Goodbye' });
  });

  it('Step 2: is blocked when hash fails the /^[a-f0-9]{8}$/ regex guard', async () => {
    const fetchMock = vi
      .fn()
      // Step 1 returns a malformed hash (not 8 hex chars)
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: 'INVALID!' }));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Step 2 must NOT fire
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('attaches Authorization header when getAccessToken() returns a token', async () => {
    vi.mocked(getAccessToken).mockReturnValue('test-access-token');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: 'a1b2c3d4' }))
      .mockResolvedValueOnce(makeFetchResponse(hashedBundle));

    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Both Step 1 and Step 2 must carry the bearer token
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
      })
    );
  });

  it('does NOT attach Authorization header when unauthenticated', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: 'a1b2c3d4' }))
      .mockResolvedValueOnce(makeFetchResponse(hashedBundle));

    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, step1Options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = step1Options.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBeUndefined();
  });

  it('appends ?tenant= query param when tenantSlug is present', async () => {
    // Simulate an authenticated user; getTenantFromUrl provides the slug
    const { useAuthStore: mockUseAuthStore } = await import('@/stores/auth.store');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockUseAuthStore).mockImplementation((selector: (s: any) => unknown) =>
      selector({ isAuthenticated: true })
    );
    vi.mocked(getTenantFromUrl).mockReturnValue('acme');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeFetchResponse(stableBundle, { hash: 'a1b2c3d4' }))
      .mockResolvedValueOnce(makeFetchResponse(hashedBundle));

    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [step1Url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(step1Url).toContain('?tenant=acme');

    const [step2Url] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(step2Url).toContain('?tenant=acme');
  });

  it('handles 404 gracefully — returns empty translations, no error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeFetchResponse(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useTranslations({ namespace: 'nonexistent', locale: 'en' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.translations).toEqual({});
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces non-404 errors via isError', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeFetchResponse(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2000 });

    expect(result.current.translations).toEqual({});
  });

  it('does not fetch when enabled=false', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useTranslations({ namespace: 'core', locale: 'en', enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when namespace is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: '', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses provided locale instead of context locale', async () => {
    const itBundle = { ...stableBundle, locale: 'it', messages: { greeting: 'Ciao' } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeFetchResponse(itBundle, { hash: 'a1b2c3d4' }))
      .mockResolvedValueOnce(makeFetchResponse(itBundle));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'it' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const [step1Url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(step1Url).toContain('/api/v1/translations/it/core');
    expect(result.current.translations).toEqual({ greeting: 'Ciao' });
  });

  it('returns isLoading=false and empty translations when both queries are idle', () => {
    // Neither query fires (namespace empty) — hook should not hang in loading state
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: '', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.translations).toEqual({});
  });

  it('W3/FR-003: merges English fallback when backend returns locale="en" for a non-English request', async () => {
    // When backend falls back to English (FR-003), the response has locale "en" even though
    // the caller requested "fr". W1 guard (resolvedData.locale === 'en') must allow the merge.
    const frenchRequestEnFallbackBundle = {
      locale: 'en', // server fell back
      namespace: 'core',
      messages: { greeting: 'Hello (en fallback)' },
      hash: 'fb000001',
    };

    const fetchMock = vi
      .fn()
      // Step 1 — stable URL returns the English fallback
      .mockResolvedValueOnce(makeFetchResponse(frenchRequestEnFallbackBundle, { hash: 'fb000001' }))
      // Step 2 — content-addressed URL returns the same bundle
      .mockResolvedValueOnce(makeFetchResponse(frenchRequestEnFallbackBundle));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'fr' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The fallback messages must be available — W1 guard allows locale 'en' through
    expect(result.current.translations).toEqual({ greeting: 'Hello (en fallback)' });
    expect(result.current.isError).toBe(false);
  });

  it('W3/Edge Case #6: AbortSignal is threaded into both Step 1 and Step 2 fetch calls', async () => {
    // Verify that the signal from TanStack Query is passed all the way through
    // fetchWithHash (Step 1) and the hashed fetch (Step 2) for proper cancellation support.
    const stableBundle = {
      locale: 'en',
      namespace: 'core',
      messages: { greeting: 'Hello' },
      hash: 'ab12cd34',
    };

    let capturedStep1Signal: AbortSignal | undefined;
    let capturedStep2Signal: AbortSignal | undefined;

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if ((url as string).includes('/ab12cd34')) {
        capturedStep2Signal = init?.signal ?? undefined;
        return Promise.resolve(makeFetchResponse(stableBundle));
      } else {
        capturedStep1Signal = init?.signal ?? undefined;
        return Promise.resolve(makeFetchResponse(stableBundle, { hash: 'ab12cd34' }));
      }
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'en' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Both steps must have received an AbortSignal instance
    expect(capturedStep1Signal).toBeInstanceOf(AbortSignal);
    expect(capturedStep2Signal).toBeInstanceOf(AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// useNamespaces — uses apiClient (unchanged path)
// ---------------------------------------------------------------------------

describe('useNamespaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('fetches multiple namespaces in parallel via apiClient', async () => {
    const mockCore = { locale: 'en-US', namespace: 'core', messages: { key1: 'val1' } };
    const mockAuth = { locale: 'en-US', namespace: 'auth', messages: { key2: 'val2' } };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockCore).mockResolvedValueOnce(mockAuth);

    const { result } = renderHook(() => useNamespaces(['core', 'auth']), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/en-US/core');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/en-US/auth');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('handles 404 gracefully for individual namespaces', async () => {
    const mockCore = { locale: 'en', namespace: 'core', messages: { key1: 'val1' } };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(mockCore)
      .mockRejectedValueOnce({ statusCode: 404 });

    const { result } = renderHook(() => useNamespaces(['core', 'nonexistent']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.errors).toEqual([]);
  });

  it('collects non-404 errors in errors array', async () => {
    const error500 = { statusCode: 500, message: 'Server error' };
    vi.mocked(apiClient.get).mockRejectedValueOnce(error500);

    const { result } = renderHook(() => useNamespaces(['failing-namespace']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].namespace).toBe('failing-namespace');
  });

  it('aggregates loading state across all queries', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ messages: {} }), 100);
        })
    );

    const { result } = renderHook(() => useNamespaces(['core', 'auth', 'workspace']), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 500 });
  });

  it('handles empty namespace array', () => {
    const { result } = renderHook(() => useNamespaces([]), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.errors).toEqual([]);
    expect(result.current.queries).toEqual([]);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not call mergeMessages repeatedly on re-renders when data has not changed', async () => {
    const mockResponse = { namespace: 'core', translations: { key: 'value' } };
    vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

    const { result, rerender } = renderHook(() => useNamespaces(['core']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callCountAfterLoad = vi.mocked(apiClient.get).mock.calls.length;

    rerender();
    rerender();
    rerender();

    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(callCountAfterLoad);
    expect(result.current.queries[0].dataUpdatedAt).toBeGreaterThan(0);
  });
});
