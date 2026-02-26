// File: packages/api-client/src/schemas.ts
//
// Zod runtime schemas for API response validation (MEDIUM #8).
// These mirror the TypeScript interfaces in @plexica/types but add runtime
// shape-checking so bad API responses surface as clear validation errors
// rather than silent undefined access.

import { z } from 'zod';
import { PLUGIN_STATUSES, PLUGIN_LIFECYCLE_STATUSES } from '@plexica/types';

// ---------------------------------------------------------------------------
// Plugin entity schema
// ---------------------------------------------------------------------------

export const PluginStatusSchema = z.enum(PLUGIN_STATUSES);
export const PluginLifecycleStatusSchema = z.enum(PLUGIN_LIFECYCLE_STATUSES);

/**
 * Zod schema for `PluginEntity` (the base plugin shape returned by the
 * registry and marketplace endpoints).
 *
 * All required fields are strict; optional fields use `.optional()`.
 * Extra server fields are stripped by `.strip()` (default in Zod v4) so
 * the returned object always matches the TS interface.
 */
export const PluginEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  category: z.string(),
  status: PluginStatusSchema,
  lifecycleStatus: PluginLifecycleStatusSchema,
  icon: z.string().optional(),
  homepage: z.string().optional(),
  tenantCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PluginEntitySchema = z.infer<typeof PluginEntitySchema>;

/**
 * Schema for the paginated plugin list response (GET /api/v1/plugins).
 */
export const PaginatedPluginEntitySchema = z.object({
  data: z.array(PluginEntitySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

/**
 * Schema for the plugin stats response (GET /api/v1/plugins/stats).
 * Keys are lifecycle status names + "total"; values are integer counts.
 */
export const PluginStatsSchema = z.record(z.string(), z.number());
