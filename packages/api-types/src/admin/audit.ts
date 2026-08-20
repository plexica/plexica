// admin/audit.ts
// Platform audit log response schemas (S5-301 / ADR-022 Decision 2).
// Extracted from services/core-api/src/modules/admin/schemas/audit-schemas.ts.

import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'tenant.provision',
  'tenant.suspend',
  'tenant.reactivate',
  'tenant.delete',
  'plugin.publish',
  'plugin.unpublish',
  'plugin.review',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditResourceTypeSchema = z.enum([
  'tenant',
  'plugin',
  'plugin_version',
]);

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  actorId: z.string(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().uuid().nullable(),
  tenantId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AuditLogResponseSchema = z.object({
  data: z.array(AuditEntrySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
