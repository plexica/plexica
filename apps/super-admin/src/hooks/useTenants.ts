// apps/super-admin/src/hooks/useTenants.ts

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Tenant } from '@/types';

export type TenantStatus = 'all' | 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING';

export function useTenants() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TenantStatus>('all');

  // Fetch tenants
  const {
    data: tenantsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  // Suspend tenant mutation
  const suspendMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.suspendTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  // Activate tenant mutation
  const activateMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.activateTenant(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const allTenants: Tenant[] = tenantsData?.tenants || [];

  // Filter tenants based on search and status
  const filteredTenants = allTenants.filter((tenant) => {
    const matchesSearch =
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Statistics
  const stats = {
    total: allTenants.length,
    active: allTenants.filter((t) => t.status === 'ACTIVE').length,
    suspended: allTenants.filter((t) => t.status === 'SUSPENDED').length,
    provisioning: allTenants.filter((t) => t.status === 'PROVISIONING').length,
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all';

  return {
    // Data
    tenants: filteredTenants,
    allTenants,
    stats,
    isLoading,
    error,

    // Filters
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    clearFilters,
    hasActiveFilters,

    // Mutations
    suspendTenant: suspendMutation.mutate,
    activateTenant: activateMutation.mutate,
    isSuspending: suspendMutation.isPending,
    isActivating: activateMutation.isPending,

    // Actions
    refetch,
  };
}
