// audit-api.ts
// Typed API functions for audit log domain.
// Used by TanStack Query hooks in use-audit-log.ts.

import { apiClient } from './api-client.js';

import type { AuditLogEntry, AuditLogFilters, AuditActionType } from '../types/audit.js';

export const auditApi = {
  list: (filters?: AuditLogFilters) => {
    const params: Record<string, string> = {};
    if (filters?.page !== undefined) params['page'] = String(filters.page);
    if (filters?.limit !== undefined) params['limit'] = String(filters.limit);
    if (filters?.actorId) params['actorId'] = filters.actorId;
    if (filters?.actionType) params['actionType'] = filters.actionType;
    if (filters?.fromDate) params['fromDate'] = filters.fromDate;
    if (filters?.toDate) params['toDate'] = filters.toDate;
    const qs = Object.keys(params).length > 0 ? '?' + new URLSearchParams(params).toString() : '';
    return apiClient.get<{
      data: AuditLogEntry[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/v1/tenant/audit-log${qs}`);
  },

  getActionTypes: () => apiClient.get<AuditActionType[]>('/api/v1/tenant/audit-log/action-types'),
};
