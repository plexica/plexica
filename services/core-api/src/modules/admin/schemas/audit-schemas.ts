// schemas/audit-schemas.ts
// Zod schemas for the platform audit log (S5-301 / ADR-022 Decision 2).
//
// The platform audit log lives in core.platform_audit_log and records every
// super-admin action. It is distinct from per-tenant audit_logs (Spec 003).
// metadata is JSONB carrying structural data only — NO PII (Security §6).

import { z } from 'zod';

// Known audit actions. Grows as the admin module lands new features.
// Values mirror ADR-022 Decision 2 and the Prisma PlatformAuditLog model.
export const AuditActionSchema = z.enum([
  'tenant.provision',
  'tenant.suspend',
  'tenant.reactivate',
  'tenant.delete',
  'plugin.publish',
  'plugin.unpublish',
  'plugin.review',
]);

export const AuditResourceTypeSchema = z.enum([
  'tenant',
  'plugin',
  'plugin_version',
]);

// Query params for GET /api/v1/admin/audit-logs.
// page defaults to 1, pageSize to 20 (capped at 100 — DoS guard).
export const AuditQuerySchema = z.object({
  action: AuditActionSchema.optional(),
  tenantId: z.string().uuid().optional(),
  actorId: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Single audit entry as returned to clients. mirrors PlatformAuditLog columns.
export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  actorId: z.string(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().uuid().nullable(),
  tenantId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  ipAddress: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const AuditLogResponseSchema = z.object({
  data: z.array(AuditEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});

// Internal validation for writeAuditEntry calls.
// metadata is a JSONB object — callers MUST NOT place PII here (Security §6).
export const WriteAuditEntrySchema = z.object({
  actorId: z.string().min(1).max(255),
  action: AuditActionSchema,
  resourceType: AuditResourceTypeSchema,
  resourceId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  ipAddress: z
    .string()
    .max(45) // IPv6 max length
    .optional(),
});

export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditResourceType = z.infer<typeof AuditResourceTypeSchema>;
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
export type WriteAuditEntry = z.infer<typeof WriteAuditEntrySchema>;
