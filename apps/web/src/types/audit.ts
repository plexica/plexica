// audit.ts — Re-export from @plexica/api-types (ADR-029).
// The AuditLogEntry and AuditActionType types are now sourced from the
// shared package. App-specific filter types stay here.

export type { AuditLogEntry, AuditActionType } from '@plexica/api-types';

export interface AuditLogFilters {
  page?: number;
  pageSize?: number;
  actorId?: string;
  actionType?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AuditLogResponse {
  data: import('@plexica/api-types').AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
