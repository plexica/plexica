// File: apps/super-admin/src/hooks/useAuditLogs.ts
//
// T008-49 — TanStack Query hook for the Global Audit Log screen.
//
// Features:
//  - Accepts filter params: page, limit, action, userId, tenantId, startDate, endDate
//  - keepPreviousData: true — old data stays visible while next page loads (no blank flash)
//  - Returns full AuditLogPage so callers can access meta.total for the 10K cap banner
//
// Spec 008 — T008-49

import { useQuery } from '@tanstack/react-query';
import { getAdminAuditLogs, type AuditLogFilters, type AuditLogPage } from '@/api/admin';

export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery<AuditLogPage, Error>({
    queryKey: ['adminAuditLogs', filters],
    queryFn: () => getAdminAuditLogs(filters),
    placeholderData: (previousData) => previousData,
    staleTime: 0,
  });
}
