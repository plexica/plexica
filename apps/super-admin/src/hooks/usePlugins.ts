// apps/super-admin/src/hooks/usePlugins.ts

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Plugin } from '@/types';

export type PluginStatusFilter = 'all' | 'PUBLISHED' | 'DRAFT' | 'DEPRECATED';

export function usePlugins() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Fetch plugins with server-side pagination, search, and filters
  const {
    data: pluginsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'plugins',
      {
        search: searchQuery,
        status: statusFilter,
        category: categoryFilter,
        page,
        limit: pageSize,
      },
    ],
    queryFn: () =>
      apiClient.getPlugins({
        search: searchQuery || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        page,
        limit: pageSize,
      }),
  });

  const plugins: Plugin[] = pluginsResponse?.data || [];
  const pagination = pluginsResponse?.pagination || {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  };

  // Fetch stats separately — lightweight queries to get counts per status.
  // Cached for 30 seconds so filter changes don't trigger unnecessary refetches.
  const { data: statsData } = useQuery({
    queryKey: ['plugins-stats'],
    queryFn: async () => {
      const [allRes, publishedRes, draftRes, deprecatedRes] = await Promise.all([
        apiClient.getPlugins({ limit: 1 }),
        apiClient.getPlugins({ status: 'PUBLISHED', limit: 1 }),
        apiClient.getPlugins({ status: 'DRAFT', limit: 1 }),
        apiClient.getPlugins({ status: 'DEPRECATED', limit: 1 }),
      ]);
      return {
        total: allRes.pagination.total,
        published: publishedRes.pagination.total,
        draft: draftRes.pagination.total,
        deprecated: deprecatedRes.pagination.total,
      };
    },
    staleTime: 30_000,
  });

  // Fetch all unique categories from a full list (no filter) for the category dropdown.
  // Cache for 60s since categories rarely change.
  const { data: categoriesData } = useQuery({
    queryKey: ['plugins-categories'],
    queryFn: async () => {
      // Fetch enough plugins to get all categories (use a large limit)
      const res = await apiClient.getPlugins({ limit: 100 });
      const cats = Array.from(new Set(res.data.map((p) => p.category).filter(Boolean)));
      return cats.sort();
    },
    staleTime: 60_000,
  });

  const categories = categoriesData || [];

  const stats = {
    total: statsData?.total ?? 0,
    published: statsData?.published ?? 0,
    draft: statsData?.draft ?? 0,
    deprecated: statsData?.deprecated ?? 0,
    categories: categories.length,
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPage(1);
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || categoryFilter !== 'all';

  // Reset page when filters change
  const handleSetSearchQuery = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleSetStatusFilter = (status: PluginStatusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleSetCategoryFilter = (category: string) => {
    setCategoryFilter(category);
    setPage(1);
  };

  return {
    // Data
    plugins,
    categories,
    stats,
    isLoading,
    error,
    pagination,

    // Pagination
    page,
    setPage,
    pageSize,
    setPageSize,

    // Filters
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    statusFilter,
    setStatusFilter: handleSetStatusFilter,
    categoryFilter,
    setCategoryFilter: handleSetCategoryFilter,
    clearFilters,
    hasActiveFilters,
  };
}
