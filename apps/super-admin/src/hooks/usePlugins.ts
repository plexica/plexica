// apps/super-admin/src/hooks/usePlugins.ts

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Plugin } from '@/types';

export type PluginStatus = 'all' | 'PUBLISHED' | 'DRAFT' | 'DEPRECATED';

export function usePlugins() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PluginStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Fetch plugins
  const {
    data: pluginsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.getPlugins(),
  });

  const allPlugins: Plugin[] = pluginsData?.plugins || [];

  // Get unique categories
  const categories = Array.from(new Set(allPlugins.map((p) => p.category)));

  // Filter plugins based on search, status, and category
  const filteredPlugins = allPlugins.filter((plugin) => {
    const matchesSearch =
      plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.author.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || plugin.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || plugin.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Statistics
  const stats = {
    total: allPlugins.length,
    published: allPlugins.filter((p) => p.status === 'PUBLISHED').length,
    draft: allPlugins.filter((p) => p.status === 'DRAFT').length,
    deprecated: allPlugins.filter((p) => p.status === 'DEPRECATED').length,
    categories: categories.length,
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || categoryFilter !== 'all';

  return {
    // Data
    plugins: filteredPlugins,
    allPlugins,
    categories,
    stats,
    isLoading,
    error,

    // Filters
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    clearFilters,
    hasActiveFilters,
  };
}
