// admin/logs.ts
// System logs query response types (S5-A00 — Loki query proxy).
// Extracted from services/core-api/src/modules/admin/schemas/logs-schemas.ts.

import { z } from 'zod';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  // Backend may send 'unknown' for unparseable levels — broader than LogLevel.
  level: z.string(),
  tenant: z.string().nullable(),
  message: z.string(),
  // Optional metadata — the backend doesn't send this today, but the field
  // is reserved for future expansion. Frontends should handle its absence.
  meta: z.record(z.unknown()).optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogsResponseSchema = z.object({
  logs: z.array(LogEntrySchema),
  total: z.number().int().min(0),
});
export type LogsResponse = z.infer<typeof LogsResponseSchema>;
