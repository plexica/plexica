// use-health.ts
// TanStack Query hook for the admin health endpoint.
// Polls every 10s (refetchInterval) so operators see near-real-time status.
// Data fetching uses TanStack Query only — Rule 3 (one pattern per operation).

import { useQuery } from '@tanstack/react-query';

import { getHealth } from '../services/admin-api.js';

import type { HealthResponse } from '../types/admin-types.js';

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['admin', 'health'],
    queryFn: () => getHealth(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
