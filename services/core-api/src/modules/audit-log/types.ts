// types.ts
// Audit log domain types.
// Implements: FR-021, FR-015, plan §5.1.7, §5.1.8

export interface AuditLogEntry {
  actorId: string;
  actionType: string; // Use ACTION_TYPE_MAP keys from action-types.ts
  targetType: string;
  targetId?: string;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface AuditLogDto {
  id: string;
  actorId: string;
  actorDisplayName?: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  actionType?: string;
  from?: Date;
  to?: Date;
  actorId?: string;
  page?: number;
  pageSize?: number;
}
