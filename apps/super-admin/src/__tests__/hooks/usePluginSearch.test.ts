// File: apps/super-admin/src/__tests__/hooks/usePluginSearch.test.ts
//
// Unit tests for the usePluginSearch hook.
// Covers: debounce logic, filter state, pagination reset, statCounts query,
// clearFilters, hasActiveFilters.
//
// @plexica/api-client is mocked so no HTTP calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---- Mock the api-client singleton BEFORE importing the hook ----
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getRegistryPlugins: vi.fn(),
    getRegistryPluginStats: vi.fn(),
  },
  default: {
    getRegistryPlugins: vi.fn(),
    getRegistryPluginStats: vi.fn(),
  },
}));

import { usePluginSearch } from '@/hooks/usePluginSearch';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlugin(id: string) {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: 'A plugin',
    author: 'Plexica',
    category: 'test',
    status: 'PUBLISHED' as const,
    lifecycleStatus: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makePaginatedResponse(plugins = [makePlugin('p1')]) {
  return {
    data: plugins,
    pagination: { page: 1, limit: 20, total: plugins.length, totalPages: 1 },
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePluginSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.mocked(apiClient.getRegistryPlugins).mockResolvedValue(makePaginatedResponse());
    vi.mocked(apiClient.getRegistryPluginStats).mockResolvedValue({
      total: 1,
      ACTIVE: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return default state on initial render', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    expect(result.current.inputValue).toBe('');
    expect(result.current.lifecycleFilter).toBe('all');
    expect(result.current.page).toBe(1);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('should update inputValue immediately on setInputValue', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setInputValue('crm');
    });

    expect(result.current.inputValue).toBe('crm');
  });

  it('should mark hasActiveFilters true when inputValue is set', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setInputValue('crm');
    });

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('should reset page to 1 when input changes (after debounce)', async () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    // Set page to 3 first
    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);

    // Now type — debounce fires after 300 ms
    act(() => {
      result.current.setInputValue('crm');
    });

    // Advance fake timers then flush promises in the same act
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current.page).toBe(1);
  });

  it('should reset page to 1 when lifecycleFilter changes', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setPage(2);
    });
    act(() => {
      result.current.setLifecycleFilter('ACTIVE');
    });

    expect(result.current.page).toBe(1);
    expect(result.current.lifecycleFilter).toBe('ACTIVE');
  });

  it('should mark hasActiveFilters true when lifecycleFilter is not "all"', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setLifecycleFilter('REGISTERED');
    });

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('clearFilters should reset all filter state', () => {
    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setInputValue('crm');
      result.current.setLifecycleFilter('ACTIVE');
      result.current.setPage(3);
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.lifecycleFilter).toBe('all');
    expect(result.current.page).toBe(1);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('should expose plugin data and pagination from query result', async () => {
    // Switch to real timers so React Query's internal promise resolution works
    vi.useRealTimers();

    vi.mocked(apiClient.getRegistryPlugins).mockResolvedValue(
      makePaginatedResponse([makePlugin('p1'), makePlugin('p2')])
    );

    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.plugins).toHaveLength(2);
    });
    expect(result.current.pagination.total).toBe(2);
  });

  it('should expose statCounts from stats query', async () => {
    // Switch to real timers so React Query's internal promise resolution works
    vi.useRealTimers();

    vi.mocked(apiClient.getRegistryPluginStats).mockResolvedValue({
      total: 5,
      ACTIVE: 3,
      INSTALLED: 2,
    });

    const { result } = renderHook(() => usePluginSearch(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.statCounts['total']).toBe(5);
      expect(result.current.statCounts['ACTIVE']).toBe(3);
    });
  });
});
