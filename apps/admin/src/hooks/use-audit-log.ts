// use-audit-log.ts — TanStack Query hook for the platform audit log.
// Used by the Tenant Detail Audit tab (filters by tenantId).
// Data fetching uses TanStack Query only — Rule 3 (one pattern per operation).

import { useQuery } from '@tanstack/react-query';

import { getAuditLog } from '../services/admin-api.js';

export interface UseAuditLogParams {
  tenantId?: string;
  action?: string;
  page?: number;
}

export function useAuditLog(params: UseAuditLogParams) {
  const queryKey = ['admin', 'audit-log', params] as const;
  return useQuery({
    queryKey,
    queryFn: () => getAuditLog(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
