// File: apps/web/src/hooks/useTenantAdminDashboard.ts
//
// T008-51 — TanStack Query hook for Tenant Admin Dashboard data.
// Spec 008 Admin Interfaces

import { useQuery } from '@tanstack/react-query';
import { getTenantDashboard } from '@/api/admin';

export function useTenantAdminDashboard() {
  return useQuery({
    queryKey: ['tenant-admin', 'dashboard'],
    queryFn: getTenantDashboard,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
