// File: apps/super-admin/src/hooks/useSuperAdminDashboard.ts
//
// TanStack Query hook for the Super Admin Dashboard endpoint.
// Fetches platform-wide summary metrics (tenants, users, plugins, API calls)
// plus embedded system health from GET /api/admin/dashboard.
//
// Spec 008 — T008-43

import { useQuery } from '@tanstack/react-query';
import { getSuperAdminDashboard, type SuperAdminDashboard } from '@/api/admin';

export function useSuperAdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery<SuperAdminDashboard, Error>({
    queryKey: ['superAdminDashboard'],
    queryFn: getSuperAdminDashboard,
    staleTime: 30_000,
  });

  return { data, isLoading, isError, error, refetch };
}
