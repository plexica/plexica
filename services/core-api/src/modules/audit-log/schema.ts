// schema.ts
// Zod validation schemas for audit-log query endpoints.
// Implements: Spec 003, Phase 10

import { z } from 'zod';

// Accept both ISO date (YYYY-MM-DD) and full ISO datetime (YYYY-MM-DDTHH:mm:ss.sssZ).
// HTML <input type="date"> sends date-only strings; API clients may send full datetime.
const dateOrDatetime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
    'Must be a valid date (YYYY-MM-DD) or datetime (ISO 8601)'
  );

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actorId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  fromDate: dateOrDatetime.optional(),
  toDate: dateOrDatetime.optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
