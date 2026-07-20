// use-dashboard.ts
// TanStack Query hook for the admin dashboard metrics endpoint.
// Polls every 30s (refetchInterval) so operators see near-real-time KPIs.
// Data fetching uses TanStack Query only — Rule 3 (one pattern per operation).

import { useQuery } from '@tanstack/react-query';

import { getDashboardMetrics } from '../services/admin-api.js';

import type { DashboardMetrics } from '../types/admin-types.js';

export function useDashboardMetrics() {
  return useQuery<DashboardMetrics>({
    queryKey: ['admin', 'dashboard', 'metrics'],
    queryFn: () => getDashboardMetrics(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
