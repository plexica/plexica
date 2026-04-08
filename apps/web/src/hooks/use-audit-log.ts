// use-audit-log.ts
// TanStack Query hooks for tenant audit log.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery } from '@tanstack/react-query';

import { auditApi } from '../services/audit-api.js';

import type { AuditLogFilters } from '../types/audit.js';

export function useAuditLog(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => auditApi.list(filters),
  });
}

export function useAuditActionTypes() {
  return useQuery({
    queryKey: ['audit-action-types'],
    queryFn: () => auditApi.getActionTypes(),
    staleTime: 10 * 60 * 1000, // action type list is stable
  });
}
