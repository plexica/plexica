// apps/web/src/hooks/usePluginSearch.ts
//
// Hook for searching and filtering the plugin registry.
// Provides debounced search, lifecycle filter state, and paginated results.
// Uses adminApiClient.getRegistryPlugins (T004-28 lifecycle endpoint).
//
// T004-33 — design-spec.md Screen 1 (Registry listing)

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApiClient } from '@/lib/api-client';
import type { PluginEntity, PluginLifecycleStatus } from '@plexica/types';
import type { PaginatedResponse } from '@plexica/api-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePluginSearchOptions {
  /** Initial search query */
  initialQuery?: string;
  /** Initial lifecycle filter */
  initialLifecycleStatus?: PluginLifecycleStatus | 'ALL';
  /** Items per page (default: 20) */
  pageSize?: number;
}

export interface UsePluginSearchResult {
  /** Current search query (controlled) */
  query: string;
  /** Update the search query (triggers debounced fetch) */
  setQuery: (q: string) => void;
  /** Current lifecycle filter */
  lifecycleFilter: PluginLifecycleStatus | 'ALL';
  /** Update the lifecycle filter (triggers immediate fetch) */
  setLifecycleFilter: (status: PluginLifecycleStatus | 'ALL') => void;
  /** Current page (1-indexed) */
  page: number;
  /** Navigate to a specific page */
  setPage: (page: number) => void;
  /** Plugin results for the current page */
  plugins: PluginEntity[];
  /** Total number of matching plugins */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** True while a fetch is in-flight */
  isLoading: boolean;
  /** Error from the last fetch, if any */
  error: Error | null;
  /** Manually re-trigger the current fetch */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePluginSearch(options: UsePluginSearchOptions = {}): UsePluginSearchResult {
  const {
    initialQuery = '',
    initialLifecycleStatus = 'ALL',
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  const [query, setQueryState] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [lifecycleFilter, setLifecycleFilterState] = useState<PluginLifecycleStatus | 'ALL'>(
    initialLifecycleStatus
  );
  const [page, setPageState] = useState(1);
  const [result, setResult] = useState<PaginatedResponse<PluginEntity> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest request to avoid stale responses
  const requestIdRef = useRef(0);

  // -------------------------------------------------------------------------
  // Debounce: update debouncedQuery after DEBOUNCE_MS of no typing
  // -------------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      // Reset to page 1 when query changes
      setPageState(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------
  const fetchPlugins = useCallback(
    async (searchQuery: string, lifecycle: PluginLifecycleStatus | 'ALL', currentPage: number) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const params: {
          search?: string;
          lifecycleStatus?: PluginLifecycleStatus;
          page: number;
          limit: number;
        } = {
          page: currentPage,
          limit: pageSize,
        };

        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }
        if (lifecycle !== 'ALL') {
          params.lifecycleStatus = lifecycle;
        }

        const data = await adminApiClient.getRegistryPlugins(params);

        // Discard stale responses
        if (requestId !== requestIdRef.current) return;

        setResult(data);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err : new Error('Failed to fetch plugins'));
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [pageSize]
  );

  // -------------------------------------------------------------------------
  // Trigger fetch on debounced query / filter / page changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchPlugins(debouncedQuery, lifecycleFilter, page);
  }, [debouncedQuery, lifecycleFilter, page, fetchPlugins]);

  // -------------------------------------------------------------------------
  // Public setters — reset to page 1 when filter changes
  // -------------------------------------------------------------------------
  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    // Page reset is handled in the debounce effect above
  }, []);

  const setLifecycleFilter = useCallback((status: PluginLifecycleStatus | 'ALL') => {
    setLifecycleFilterState(status);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const refetch = useCallback(() => {
    fetchPlugins(debouncedQuery, lifecycleFilter, page);
  }, [debouncedQuery, lifecycleFilter, page, fetchPlugins]);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const plugins = result?.data ?? [];
  const total = result?.pagination.total ?? 0;
  const totalPages = result?.pagination.totalPages ?? 1;

  return {
    query,
    setQuery,
    lifecycleFilter,
    setLifecycleFilter,
    page,
    setPage,
    plugins,
    total,
    totalPages,
    isLoading,
    error,
    refetch,
  };
}
