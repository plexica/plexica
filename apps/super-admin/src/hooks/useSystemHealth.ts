// File: apps/super-admin/src/hooks/useSystemHealth.ts
//
// TanStack Query hook for system health polling.
// Calls GET /api/admin/system/health every 30 seconds so the Dashboard
// and Health screens always show a near-real-time status.
//
// Spec 008 — T008-43

import { useQuery } from '@tanstack/react-query';
import { getSystemHealth, type SystemHealth } from '@/api/admin';

export function useSystemHealth() {
  const { data, isLoading, isError, error, refetch } = useQuery<SystemHealth, Error>({
    queryKey: ['systemHealth'],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  return { data, isLoading, isError, error, refetch };
}
