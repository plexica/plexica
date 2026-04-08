// schema.ts
// Zod validation schemas for audit-log query endpoints.
// Implements: Spec 003, Phase 10

import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actorId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
