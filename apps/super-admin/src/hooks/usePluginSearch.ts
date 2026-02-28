// apps/super-admin/src/hooks/usePluginSearch.ts
//
// Debounced search + lifecycle-status filter hook for the Registry tab.
// Calls GET /api/v1/plugins (T004-09) with 300 ms input debounce.
// Stats counts come from GET /api/v1/plugins/stats (server-side aggregation)
// to avoid fetching hundreds of full entities client-side (T004-28 review fix).

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PluginLifecycleStatus } from '@plexica/types';

export type LifecycleStatusFilter = 'all' | PluginLifecycleStatus;

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

export function usePluginSearch() {
  // Raw input — updated on every keystroke
  const [inputValue, setInputValue] = useState('');
  // Debounced value — sent to the API
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleStatusFilter>('all');
  const [page, setPage] = useState(1);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce input → debouncedSearch (300 ms)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(inputValue);
      setPage(1); // reset page on new search
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue]);

  // Reset page when filter changes
  const handleSetLifecycleFilter = (filter: LifecycleStatusFilter) => {
    setLifecycleFilter(filter);
    setPage(1);
  };

  const queryParams = {
    search: debouncedSearch || undefined,
    lifecycleStatus:
      lifecycleFilter === 'all' ? undefined : (lifecycleFilter as PluginLifecycleStatus),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['registry-plugins', queryParams],
    queryFn: () => apiClient.getRegistryPlugins(queryParams),
  });

  const plugins = data?.data ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  };

  // Per-lifecycle-status counts for the stat summary bar.
  // Uses the dedicated /stats endpoint (server-side aggregation) so totals are
  // always accurate regardless of page size — fixes HIGH #1 / MEDIUM #6.
  const { data: statCounts = {} } = useQuery({
    queryKey: ['registry-plugins-stats'],
    queryFn: () => apiClient.getRegistryPluginStats(),
    staleTime: 30_000,
  });

  const clearFilters = () => {
    setInputValue('');
    setDebouncedSearch('');
    setLifecycleFilter('all');
    setPage(1);
  };

  const hasActiveFilters = inputValue !== '' || lifecycleFilter !== 'all';

  return {
    // State
    inputValue,
    setInputValue,
    lifecycleFilter,
    setLifecycleFilter: handleSetLifecycleFilter,
    page,
    setPage,

    // Data
    plugins,
    pagination,
    statCounts,
    isLoading,
    error,
    refetch,

    // Helpers
    clearFilters,
    hasActiveFilters,
  };
}
