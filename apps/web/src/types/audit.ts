// audit.ts — TypeScript types for audit log domain.
// Pure type definitions — no runtime logic.

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  actorId?: string;
  actionType?: string;
  workspaceId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AuditActionType {
  key: string;
  label: string;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}
