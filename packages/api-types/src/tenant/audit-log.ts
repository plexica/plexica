// tenant/audit-log.ts
// Tenant audit log entry types (per-tenant audit_log table, Spec 003).
// Distinct from admin/audit.ts which is the platform-level audit log.

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditActionType {
  key: string;
  label: string;
}
