// apps/super-admin/src/hooks/useUsers.ts

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  createdAt: string;
}

export function useUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Fetch tenants (for filtering dropdown)
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const tenants = tenantsData?.data || [];

  // Fetch users from real API
  const {
    data: usersData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['users', tenantFilter !== 'all' ? tenantFilter : undefined],
    queryFn: () => {
      const params: { tenantId?: string; search?: string; role?: string } = {};
      // Pass tenant filter to API for server-side filtering
      if (tenantFilter !== 'all') {
        // Find the tenant ID from the slug
        const tenant = tenants.find((t: any) => t.slug === tenantFilter);
        if (tenant) {
          params.tenantId = tenant.id;
        }
      }
      return apiClient.getUsers(params);
    },
  });

  const allUsers: User[] = (usersData?.data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name || u.email,
    firstName: null,
    lastName: null,
    tenantId: u.tenantId,
    tenantName: u.tenantName ?? '',
    tenantSlug: u.tenantSlug ?? '',
    roles: u.roles || [],
    createdAt: u.createdAt,
  }));

  // Client-side filtering for search and role (API handles tenant filter)
  const filteredUsers = allUsers.filter((user) => {
    const matchesSearch =
      searchQuery === '' ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTenant = tenantFilter === 'all' || user.tenantSlug === tenantFilter;
    const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);

    return matchesSearch && matchesTenant && matchesRole;
  });

  // Get unique roles from all users
  const allRoles = Array.from(new Set(allUsers.flatMap((u) => u.roles)));

  // Statistics
  const stats = {
    total: usersData?.pagination?.total ?? allUsers.length,
    tenants: tenants.length,
    roles: allRoles.length,
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTenantFilter('all');
    setRoleFilter('all');
  };

  const hasActiveFilters = searchQuery !== '' || tenantFilter !== 'all' || roleFilter !== 'all';

  return {
    // Data
    users: filteredUsers,
    allUsers,
    tenants,
    allRoles,
    stats,
    isLoading,
    error,

    // Filters
    searchQuery,
    setSearchQuery,
    tenantFilter,
    setTenantFilter,
    roleFilter,
    setRoleFilter,
    clearFilters,
    hasActiveFilters,

    // Actions
    refetch,
  };
}
