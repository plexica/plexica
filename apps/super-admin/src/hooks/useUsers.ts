// apps/super-admin/src/hooks/useUsers.ts

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  status: string;
  lastLogin: string;
  createdAt: string;
}

export function useUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Fetch tenants (for filtering)
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const tenants = tenantsData?.tenants || [];

  // NOTE: Using mock data since backend API endpoint doesn't exist yet
  // In production, this would use: useQuery({ queryKey: ['users'], queryFn: () => apiClient.getUsers() })
  const mockUsers: User[] = [
    {
      id: '1',
      email: 'john.doe@acme.com',
      name: 'John Doe',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T10:30:00Z',
      createdAt: '2026-01-10T08:00:00Z',
    },
    {
      id: '2',
      email: 'jane.smith@globex.com',
      name: 'Jane Smith',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-14T09:15:00Z',
      createdAt: '2026-01-11T10:00:00Z',
    },
    {
      id: '3',
      email: 'bob.johnson@acme.com',
      name: 'Bob Johnson',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-13T16:45:00Z',
      createdAt: '2026-01-12T14:00:00Z',
    },
    {
      id: '4',
      email: 'alice.williams@demo.com',
      name: 'Alice Williams',
      tenantId: tenants.find((t: any) => t.slug === 'demo-company')?.id || '3',
      tenantName: 'Demo Company',
      tenantSlug: 'demo-company',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T11:00:00Z',
      createdAt: '2026-01-09T09:00:00Z',
    },
    {
      id: '5',
      email: 'charlie.brown@globex.com',
      name: 'Charlie Brown',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-12T14:30:00Z',
      createdAt: '2026-01-08T11:00:00Z',
    },
  ];

  const allUsers = mockUsers;

  // Filter users
  const filteredUsers = allUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTenant = tenantFilter === 'all' || user.tenantSlug === tenantFilter;
    const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);

    return matchesSearch && matchesTenant && matchesRole;
  });

  // Get unique roles
  const allRoles = Array.from(new Set(allUsers.flatMap((u) => u.roles)));

  // Statistics
  const stats = {
    total: allUsers.length,
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
    isLoading: false, // Mock data, no loading state
    error: null,

    // Filters
    searchQuery,
    setSearchQuery,
    tenantFilter,
    setTenantFilter,
    roleFilter,
    setRoleFilter,
    clearFilters,
    hasActiveFilters,
  };
}
