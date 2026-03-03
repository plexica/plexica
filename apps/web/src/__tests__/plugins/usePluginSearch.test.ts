// apps/web/src/__tests__/plugins/usePluginSearch.test.ts
//
// T004-33: Unit tests for the usePluginSearch hook.
//
// Coverage:
//  - Initial fetch on mount
//  - Debounced query updates (query change triggers debounce → fetch after 300ms)
//  - Immediate fetch on lifecycleFilter change (resets to page 1)
//  - Page navigation
//  - Loading state management
//  - Error handling (API failure)
//  - Stale response discard (rapid query changes)
//  - refetch() re-triggers current search
//  - Returns correct derived values (plugins, total, totalPages)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client', () => ({
  apiClient: {},
  adminApiClient: {
    getRegistryPlugins: vi.fn(),
  },
}));

import { adminApiClient } from '@/lib/api-client';
import { usePluginSearch } from '@/hooks/usePluginSearch';
import type { PluginEntity } from '@plexica/types';
import type { PaginatedResponse } from '@plexica/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaginatedResponse(
  plugins: Partial<PluginEntity>[],
  overrides: Partial<{ total: number; totalPages: number; page: number; limit: number }> = {}
): PaginatedResponse<PluginEntity> {
  return {
    data: plugins as PluginEntity[],
    pagination: {
      page: overrides.page ?? 1,
      limit: overrides.limit ?? 20,
      total: overrides.total ?? plugins.length,
      totalPages: overrides.totalPages ?? 1,
    },
  };
}

function makePlugin(id: string, name = `Plugin ${id}`): Partial<PluginEntity> {
  return { id, name, version: '1.0.0' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePluginSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------------

  describe('initial fetch', () => {
    it('fetches plugins on mount with default params', async () => {
      const mockPlugins = [makePlugin('p1'), makePlugin('p2')];
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(
        makePaginatedResponse(mockPlugins, { total: 2 })
      );

      const { result } = renderHook(() => usePluginSearch());

      // After mount, isLoading should start true
      expect(result.current.isLoading).toBe(true);

      // Wait for fetch to complete
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(adminApiClient.getRegistryPlugins).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result.current.plugins).toHaveLength(2);
      expect(result.current.total).toBe(2);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('uses provided initialQuery and initialLifecycleStatus', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      renderHook(() =>
        usePluginSearch({ initialQuery: 'analytics', initialLifecycleStatus: 'ACTIVE' })
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(adminApiClient.getRegistryPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'analytics', lifecycleStatus: 'ACTIVE' })
      );
    });

    it('respects custom pageSize', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      renderHook(() => usePluginSearch({ pageSize: 10 }));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(adminApiClient.getRegistryPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
    });

    it('does not include lifecycleStatus param when filter is ALL', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      renderHook(() => usePluginSearch({ initialLifecycleStatus: 'ALL' }));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const call = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls[0][0];
      expect(call).not.toHaveProperty('lifecycleStatus');
    });

    it('does not include search param when query is empty', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      renderHook(() => usePluginSearch({ initialQuery: '' }));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const call = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls[0][0];
      expect(call).not.toHaveProperty('search');
    });
  });

  // -------------------------------------------------------------------------
  // Query debounce
  // -------------------------------------------------------------------------

  describe('debounced query', () => {
    it('debounces query updates by 300ms before fetching', async () => {
      vi.useFakeTimers();
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() => usePluginSearch());

      // Wait for initial fetch
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });
      const initialCallCount = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.length;

      // Type quickly — should not fire a fetch immediately
      act(() => {
        result.current.setQuery('an');
      });
      act(() => {
        result.current.setQuery('ana');
      });
      act(() => {
        result.current.setQuery('anal');
      });

      // Verify no additional fetches fired yet
      expect(vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.length).toBe(initialCallCount);

      // Advance debounce timer
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Now one debounced fetch should have fired with the final query
      const newCalls = vi
        .mocked(adminApiClient.getRegistryPlugins)
        .mock.calls.slice(initialCallCount);
      expect(newCalls.length).toBe(1);
      expect(newCalls[0][0]).toMatchObject({ search: 'anal' });
    });

    it('updates query state immediately (controlled input)', () => {
      vi.useFakeTimers();
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() => usePluginSearch());

      act(() => {
        result.current.setQuery('hello');
      });

      // query state updates immediately, debouncedQuery updates after 300ms
      expect(result.current.query).toBe('hello');
    });

    it('resets to page 1 when query changes', async () => {
      vi.useFakeTimers();
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(
        makePaginatedResponse([], { totalPages: 5 })
      );

      const { result } = renderHook(() => usePluginSearch());

      // Navigate to page 3
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });
      act(() => {
        result.current.setPage(3);
      });

      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
      });

      expect(result.current.page).toBe(3);

      // Change query — should reset page
      act(() => {
        result.current.setQuery('test');
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(result.current.page).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle filter
  // -------------------------------------------------------------------------

  describe('lifecycleFilter', () => {
    it('fetches immediately when filter changes', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const callsBefore = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.length;

      await act(async () => {
        result.current.setLifecycleFilter('ACTIVE');
        await Promise.resolve();
        await Promise.resolve();
      });

      const newCalls = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.slice(callsBefore);
      expect(newCalls.length).toBeGreaterThanOrEqual(1);
      expect(newCalls[0][0]).toMatchObject({ lifecycleStatus: 'ACTIVE' });
    });

    it('resets to page 1 when filter changes', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(
        makePaginatedResponse([], { totalPages: 3 })
      );

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => {
        result.current.setPage(2);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.page).toBe(2);

      act(() => {
        result.current.setLifecycleFilter('DISABLED');
      });

      expect(result.current.page).toBe(1);
    });

    it('returns the current lifecycleFilter value', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() => usePluginSearch());

      expect(result.current.lifecycleFilter).toBe('ALL');

      act(() => {
        result.current.setLifecycleFilter('INSTALLING');
      });

      expect(result.current.lifecycleFilter).toBe('INSTALLING');
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    it('fetches the correct page when setPage is called', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(
        makePaginatedResponse([], { total: 40, totalPages: 2 })
      );

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        result.current.setPage(2);
        await Promise.resolve();
        await Promise.resolve();
      });

      const calls = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toMatchObject({ page: 2 });
    });

    it('returns totalPages from pagination metadata', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(
        makePaginatedResponse([], { total: 100, totalPages: 5 })
      );

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.totalPages).toBe(5);
      expect(result.current.total).toBe(100);
    });

    it('defaults totalPages to 1 when no data has been loaded yet', () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => usePluginSearch());

      expect(result.current.totalPages).toBe(1);
      expect(result.current.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('sets isLoading to true while fetching', async () => {
      let resolve!: (value: PaginatedResponse<PluginEntity>) => void;
      const pending = new Promise<PaginatedResponse<PluginEntity>>((r) => {
        resolve = r;
      });
      vi.mocked(adminApiClient.getRegistryPlugins).mockReturnValue(pending);

      const { result } = renderHook(() => usePluginSearch());

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolve(makePaginatedResponse([]));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('sets error when the API call rejects', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('wraps non-Error rejections in an Error object', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockRejectedValue('string error');

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Failed to fetch plugins');
    });

    it('clears error on a successful subsequent fetch', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins)
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() => usePluginSearch());

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.error).toBeInstanceOf(Error);

      await act(async () => {
        result.current.refetch();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // refetch
  // -------------------------------------------------------------------------

  describe('refetch', () => {
    it('re-fires the current fetch with unchanged params', async () => {
      vi.mocked(adminApiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse([]));

      const { result } = renderHook(() =>
        usePluginSearch({ initialQuery: 'hello', initialLifecycleStatus: 'ACTIVE' })
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const callsBefore = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.length;

      await act(async () => {
        result.current.refetch();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(vi.mocked(adminApiClient.getRegistryPlugins).mock.calls.length).toBe(callsBefore + 1);
      const lastCall = vi.mocked(adminApiClient.getRegistryPlugins).mock.calls[callsBefore][0];
      expect(lastCall).toMatchObject({ search: 'hello', lifecycleStatus: 'ACTIVE' });
    });
  });

  // -------------------------------------------------------------------------
  // Stale response discard
  // -------------------------------------------------------------------------

  describe('stale response discard', () => {
    it('discards stale responses from rapidly superseded requests', async () => {
      vi.useFakeTimers();

      // First request resolves AFTER the second request
      let resolveFirst!: (v: PaginatedResponse<PluginEntity>) => void;
      const firstRequest = new Promise<PaginatedResponse<PluginEntity>>((r) => {
        resolveFirst = r;
      });
      const secondRequest = Promise.resolve(
        makePaginatedResponse([makePlugin('p-from-second')], { total: 1 })
      );

      vi.mocked(adminApiClient.getRegistryPlugins)
        .mockReturnValueOnce(firstRequest)
        .mockReturnValueOnce(secondRequest);

      const { result } = renderHook(() => usePluginSearch());

      // First request is in flight; trigger a second by changing filter
      act(() => {
        result.current.setLifecycleFilter('ACTIVE');
      });

      // Let the second request settle
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Now resolve the first (stale) request — should be ignored
      await act(async () => {
        resolveFirst(makePaginatedResponse([makePlugin('p-from-first')], { total: 99 }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Result should reflect the second (current) request, not the first
      expect(result.current.total).not.toBe(99);
    });
  });
});
