// schemas/logs-schemas.ts
// Zod validation schemas for the admin logs query endpoint (Spec 005, S5-A00).
//
// Admin filters (tenant, level, time range, limit) are validated here before
// being translated into a LogQL query against the Loki HTTP API. The LogEntry
// shape mirrors the structured Pino log line written by core-api.

import { z } from 'zod';

import { ADMIN_LOG_LEVELS, LOG_TENANT_SLUG_RE } from '../../../lib/logging-contract.js';

// Tenant uses the provisioning slug contract before exact JSON comparison.

export const LogsQuerySchema = z.object({
  tenant: z.string().regex(LOG_TENANT_SLUG_RE, 'tenant must be a valid tenant slug').optional(),
  level: z.enum(ADMIN_LOG_LEVELS).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.string(),
  tenant: z.string().nullable(),
  message: z.string(),
});

export const LogsResponseSchema = z.object({
  logs: z.array(LogEntrySchema),
  total: z.number().int().min(0),
});

export type LogsQuery = z.infer<typeof LogsQuerySchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type LogsResponse = z.infer<typeof LogsResponseSchema>;
