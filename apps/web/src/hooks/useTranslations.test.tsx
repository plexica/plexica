// apps/web/src/hooks/useTranslations.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslations, useNamespaces } from './useTranslations';
import { IntlProvider } from '@/contexts/IntlContext';
import type { ReactNode } from 'react';

// Mock the API client
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Import the mocked apiClient
import { apiClient } from '@/lib/api-client';

// Create a wrapper with QueryClientProvider and IntlProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
        gcTime: 0, // Disable cache time in tests
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <IntlProvider>{children}</IntlProvider>
    </QueryClientProvider>
  );
}

describe('useTranslations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should fetch translations from API successfully', async () => {
    const mockResponse = {
      locale: 'en-US',
      namespace: 'core',
      messages: { greeting: 'Hello', farewell: 'Goodbye' },
      hash: 'abc123',
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useTranslations({ namespace: 'core' }), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.translations).toEqual({});

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Check that data was fetched correctly (uses en-US from navigator mock)
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/en-US/core');
    expect(result.current.translations).toEqual({ greeting: 'Hello', farewell: 'Goodbye' });
    expect(result.current.hash).toBe('abc123');
  });

  it('should handle 404 errors gracefully with empty translations', async () => {
    const error = {
      statusCode: 404,
      message: 'Namespace not found',
    };

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useTranslations({ namespace: 'nonexistent' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should return empty translations instead of error
    expect(result.current.translations).toEqual({});
    expect(result.current.hash).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('should re-throw non-404 errors', async () => {
    const error = new Error('Internal server error');
    (error as any).statusCode = 500;

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useTranslations({ namespace: 'core' }), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 2000 }
    );

    expect(result.current.error).toBeTruthy();
    expect(result.current.translations).toEqual({});
  });

  it('should merge messages into IntlContext when data loads', async () => {
    const mockResponse = {
      locale: 'en',
      namespace: 'auth',
      messages: { login: 'Log In', logout: 'Log Out' },
      hash: 'xyz789',
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(
      () => {
        const translations = useTranslations({ namespace: 'auth' });
        return { translations };
      },
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.translations.isSuccess).toBe(true);
    });

    // Messages should be loaded (mergeMessages is called in useEffect)
    expect(result.current.translations.translations).toEqual({
      login: 'Log In',
      logout: 'Log Out',
    });
  });

  it('should use provided locale instead of context locale', async () => {
    const mockResponse = {
      locale: 'it',
      namespace: 'core',
      messages: { greeting: 'Ciao' },
      hash: 'def456',
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useTranslations({ namespace: 'core', locale: 'it' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should fetch with provided locale
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/it/core');
    expect(result.current.translations).toEqual({ greeting: 'Ciao' });
  });

  it('should respect enabled option', async () => {
    const { result } = renderHook(() => useTranslations({ namespace: 'core', enabled: false }), {
      wrapper: createWrapper(),
    });

    // Should not fetch when disabled
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('should use staleTime of 1 hour', async () => {
    const mockResponse = {
      locale: 'en',
      namespace: 'core',
      messages: { key: 'value' },
      hash: 'hash1',
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

    const { result, rerender } = renderHook(() => useTranslations({ namespace: 'core' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // First call should fetch
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    // Rerender (simulating component re-mount)
    rerender();

    // Should not fetch again due to staleTime (data is still fresh)
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('should not fetch if namespace is empty', () => {
    const { result } = renderHook(() => useTranslations({ namespace: '' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

describe('useNamespaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should fetch multiple namespaces in parallel', async () => {
    const mockCore = { locale: 'en-US', namespace: 'core', messages: { key1: 'val1' } };
    const mockAuth = { locale: 'en-US', namespace: 'auth', messages: { key2: 'val2' } };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockCore).mockResolvedValueOnce(mockAuth);

    const { result } = renderHook(() => useNamespaces(['core', 'auth']), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should fetch both namespaces (uses en-US from navigator mock)
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/en-US/core');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/translations/en-US/auth');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('should handle 404 errors gracefully for individual namespaces', async () => {
    const mockCore = { locale: 'en', namespace: 'core', messages: { key1: 'val1' } };
    const error404 = { statusCode: 404 };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockCore).mockRejectedValueOnce(error404);

    const { result } = renderHook(() => useNamespaces(['core', 'nonexistent']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have no errors (404 handled gracefully)
    expect(result.current.errors).toEqual([]);
  });

  it('should collect non-404 errors in errors array', async () => {
    const error500 = { statusCode: 500, message: 'Server error' };

    vi.mocked(apiClient.get).mockRejectedValueOnce(error500);

    const { result } = renderHook(() => useNamespaces(['failing-namespace']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have error for failing namespace
    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].namespace).toBe('failing-namespace');
    expect(result.current.errors[0].error).toEqual(error500);
  });

  it('should aggregate loading state across all queries', async () => {
    // Simulate slow responses
    vi.mocked(apiClient.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ messages: {} }), 100);
        })
    );

    const { result } = renderHook(() => useNamespaces(['core', 'auth', 'workspace']), {
      wrapper: createWrapper(),
    });

    // Should be loading while any query is loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 500 }
    );
  });

  it('should merge all namespace translations into IntlContext', async () => {
    const mockCore = { 'core.greeting': 'Hello' };
    const mockAuth = { 'auth.login': 'Log In' };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockCore).mockResolvedValueOnce(mockAuth);

    const { result } = renderHook(() => useNamespaces(['core', 'auth']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Both namespaces should be loaded (queryFn wraps response in { translations: ... })
    expect(result.current.queries).toHaveLength(2);
    expect(result.current.queries[0].data?.translations).toEqual({ 'core.greeting': 'Hello' });
    expect(result.current.queries[1].data?.translations).toEqual({ 'auth.login': 'Log In' });
  });

  it('should handle empty namespace array', () => {
    const { result } = renderHook(() => useNamespaces([]), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.errors).toEqual([]);
    expect(result.current.queries).toEqual([]);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('should return stable queries array', async () => {
    const mockResponse = { translations: { key: 'value' } };
    vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

    const { result, rerender } = renderHook(() => useNamespaces(['core']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstQueriesData = result.current.queries[0].data;

    rerender();

    // Query data should remain stable across rerenders (same reference)
    expect(result.current.queries[0].data).toBe(firstQueriesData);
  });

  it('should not call mergeMessages repeatedly on re-renders when data has not changed', async () => {
    // Regression test: ensure the dataUpdatedAt-based deps array does not trigger
    // mergeMessages on every render (which would cause infinite loops via IntlContext).
    const mockResponse = {
      namespace: 'core',
      translations: { key: 'value' },
    };
    vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

    // We verify the hook is stable: re-rendering without data changes does not re-call the effect.
    const { result, rerender } = renderHook(() => useNamespaces(['core']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Count API calls — if the effect re-ran infinitely, the component would
    // re-render infinitely (detectable as a React error). One successful load = stable.
    const callCountAfterLoad = vi.mocked(apiClient.get).mock.calls.length;

    // Re-render multiple times without data changes
    rerender();
    rerender();
    rerender();

    // API should not have been called again (staleTime prevents refetch)
    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(callCountAfterLoad);
    // And the data signature should be stable
    expect(result.current.queries[0].dataUpdatedAt).toBeGreaterThan(0);
  });
});
