// apps/super-admin/src/hooks/useTenants.ts
//
// TanStack Query hooks for tenant data management (Spec 008 T008-44).
//
// useTenants        — list query with search / status filter / pagination state
// useCreateTenant   — POST /admin/tenants
// useUpdateTenant   — PATCH /admin/tenants/:id
// useSuspendTenant  — POST /admin/tenants/:id/suspend
// useReactivateTenant — POST /admin/tenants/:id/activate
// useDeleteTenant   — DELETE /admin/tenants/:id

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Tenant } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantStatusFilter =
  | 'all'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'PROVISIONING'
  | 'PENDING_DELETION'
  | 'DELETED';

export interface TenantsQueryParams {
  search?: string;
  status?: TenantStatusFilter;
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// useTenants — list hook (includes local filter / pagination state)
// ---------------------------------------------------------------------------

export function useTenants(initialParams?: TenantsQueryParams) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState(initialParams?.search ?? '');
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>(
    initialParams?.status ?? 'all'
  );
  const [page, setPage] = useState(initialParams?.page ?? 1);
  const [pageSize] = useState(initialParams?.limit ?? DEFAULT_PAGE_SIZE);

  const params = {
    search: searchQuery || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: pageSize,
  };

  const {
    data: tenantsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenants', params],
    queryFn: () => apiClient.getTenants(params),
    staleTime: 60_000,
  });

  const tenants: Tenant[] = tenantsData?.data ?? [];
  const pagination = tenantsData?.pagination ?? {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  };

  // Compact stats query — four parallel requests, each fetches 1 item for the count
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
    staleTime: 30_000,
  });

  const stats = statsData ?? { total: 0, active: 0, suspended: 0, provisioning: 0 };

  // Inline mutations kept for components that consume useTenants() directly
  const suspendMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.suspendTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.activateTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });

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
      setPage(1);
    },
    statusFilter,
    setStatusFilter: (s: TenantStatusFilter) => {
      setStatusFilter(s);
      setPage(1);
    },
    clearFilters,
    hasActiveFilters: searchQuery !== '' || statusFilter !== 'all',

    // Pagination
    page,
    setPage,
    pageSize,

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

// ---------------------------------------------------------------------------
// Standalone mutation hooks — used by the route-level screens
// ---------------------------------------------------------------------------

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string; adminEmail: string; pluginIds?: string[] }) =>
      apiClient.createTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        settings: Record<string, unknown>;
        theme: Record<string, unknown>;
      }>;
    }) => apiClient.updateTenant(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => apiClient.suspendTenant(tenantId),
    onSuccess: (_result, tenantId) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });
}

export function useReactivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => apiClient.activateTenant(tenantId),
    onSuccess: (_result, tenantId) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => apiClient.deleteTenant(tenantId),
    onSuccess: (_result, tenantId) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    },
  });
}
