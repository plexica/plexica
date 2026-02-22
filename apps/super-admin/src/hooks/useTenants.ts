// apps/super-admin/src/hooks/useTenants.ts

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Tenant } from '@/types';

export type TenantStatusFilter =
  | 'all'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'PROVISIONING'
  | 'PENDING_DELETION'
  | 'DELETED';

const DEFAULT_PAGE_SIZE = 20;

export function useTenants() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Fetch tenants — delegates filtering, search, and pagination to the server
  const {
    data: tenantsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenants', { search: searchQuery, status: statusFilter, page, limit: pageSize }],
    queryFn: () =>
      apiClient.getTenants({
        search: searchQuery || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: pageSize,
      }),
  });

  const tenants: Tenant[] = tenantsData?.data ?? [];
  const pagination = tenantsData?.pagination ?? {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  };

  // Compute stats from two API calls (consolidated from 4): total + a breakdown
  // by fetching all statuses at once and deriving counts from pagination totals.
  // We fetch two filtered calls (active, suspended) and compute provisioning +
  // pending_deletion from the total.
  const { data: statsData } = useQuery({
    queryKey: ['tenants-stats'],
    queryFn: async () => {
      const [all, active, suspended, provisioning] = await Promise.all([
        apiClient.getTenants({ limit: 1 }),
        apiClient.getTenants({ status: 'ACTIVE', limit: 1 }),
        apiClient.getTenants({ status: 'SUSPENDED', limit: 1 }),
        apiClient.getTenants({ status: 'PROVISIONING', limit: 1 }),
      ]);
      return {
        total: all.pagination.total,
        active: active.pagination.total,
        suspended: suspended.pagination.total,
        provisioning: provisioning.pagination.total,
      };
    },
    staleTime: 30_000, // Cache stats for 30s to avoid excessive requests
  });

  const stats = statsData ?? { total: 0, active: 0, suspended: 0, provisioning: 0 };

  // Suspend tenant mutation
  const suspendMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.suspendTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });

  // Activate tenant mutation
  const activateMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.activateTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });

  // Delete tenant mutation (soft delete — sets PENDING_DELETION + 30-day schedule)
  const deleteMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.deleteTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPage(1);
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all';

  return {
    // Data
    tenants,
    pagination,
    stats,
    isLoading,
    error,

    // Filters
    searchQuery,
    setSearchQuery: (q: string) => {
      setSearchQuery(q);
      setPage(1); // Reset to first page on search change
    },
    statusFilter,
    setStatusFilter: (s: TenantStatusFilter) => {
      setStatusFilter(s);
      setPage(1); // Reset to first page on filter change
    },
    clearFilters,
    hasActiveFilters,

    // Pagination
    page,
    setPage,
    pageSize,
    setPageSize,

    // Mutations
    suspendTenant: suspendMutation.mutate,
    activateTenant: activateMutation.mutate,
    deleteTenant: deleteMutation.mutate,
    isSuspending: suspendMutation.isPending,
    isActivating: activateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Actions
    refetch,
  };
}
