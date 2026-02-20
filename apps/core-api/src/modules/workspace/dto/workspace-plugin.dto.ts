// apps/core-api/src/modules/workspace/dto/workspace-plugin.dto.ts
//
// DTOs and Zod validation schemas for workspace-plugin endpoints.
// Implements Spec 011 Phase 2 — FR-023, FR-024, FR-025.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const EnableWorkspacePluginSchema = z.object({
  pluginId: z.string({ error: 'pluginId is required' }).min(1, 'pluginId is required'),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export type EnableWorkspacePluginDto = z.infer<typeof EnableWorkspacePluginSchema>;

export const UpdateWorkspacePluginSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export type UpdateWorkspacePluginDto = z.infer<typeof UpdateWorkspacePluginSchema>;

// ---------------------------------------------------------------------------
// Validation helpers (returns string[] for consistency with other DTOs)
// ---------------------------------------------------------------------------

export function validateEnableWorkspacePlugin(data: unknown): string[] {
  const result = EnableWorkspacePluginSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

export function validateUpdateWorkspacePlugin(data: unknown): string[] {
  const result = UpdateWorkspacePluginSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}
