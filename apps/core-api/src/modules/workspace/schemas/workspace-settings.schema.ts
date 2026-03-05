// apps/core-api/src/modules/workspace/schemas/workspace-settings.schema.ts
//
// Zod schema for workspace settings (Spec 009, Task 4 / Gap 4).
// Constitution Art. 5.3 — all external input validated with Zod.
//
// Settings are stored as a JSONB column on the workspaces table.
// This schema acts as the single source of truth for the shape,
// defaults, and validation rules of that JSON blob.

import { z } from 'zod';
import type { ZodIssue } from 'zod';

/**
 * Full workspace settings schema with defaults.
 *
 * Field semantics:
 *   defaultMemberRole       — role assigned to newly added members when none is specified
 *   allowCrossWorkspaceSharing — whether resources can be shared FROM this workspace
 *   maxMembers              — max number of members (0 = unlimited)
 *   isPublic                — whether the workspace is discoverable within the tenant
 *   notificationsEnabled    — whether workspace-level notifications are active
 */
export const WorkspaceSettingsSchema = z.object({
  defaultMemberRole: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
  allowCrossWorkspaceSharing: z.boolean().default(false),
  maxMembers: z
    .number()
    .int('maxMembers must be an integer')
    .min(0, 'maxMembers cannot be negative')
    .default(0), // 0 = unlimited
  isPublic: z.boolean().default(false),
  notificationsEnabled: z.boolean().default(true),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/**
 * Partial schema used for PATCH operations — all fields optional.
 */
export const WorkspaceSettingsUpdateSchema = WorkspaceSettingsSchema.partial();

export type WorkspaceSettingsUpdate = z.infer<typeof WorkspaceSettingsUpdateSchema>;

/**
 * Validate a raw (unknown) settings object against the full schema.
 * Returns a typed result with field-level error messages.
 */
export function validateWorkspaceSettings(data: unknown): {
  valid: boolean;
  settings?: WorkspaceSettings;
  errors: string[];
} {
  const result = WorkspaceSettingsSchema.safeParse(data);
  if (result.success) {
    return { valid: true, settings: result.data, errors: [] };
  }
  return {
    valid: false,
    errors: (result.error.issues as ZodIssue[]).map(
      (e) => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`
    ),
  };
}

/**
 * Validate a raw (unknown) partial settings object against the update schema.
 */
export function validateWorkspaceSettingsUpdate(data: unknown): {
  valid: boolean;
  settings?: WorkspaceSettingsUpdate;
  errors: string[];
} {
  const result = WorkspaceSettingsUpdateSchema.safeParse(data);
  if (result.success) {
    return { valid: true, settings: result.data, errors: [] };
  }
  return {
    valid: false,
    errors: (result.error.issues as ZodIssue[]).map(
      (e) => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`
    ),
  };
}

/**
 * Merge a partial settings update into an existing settings object (or defaults).
 *
 * Always returns a fully-valid WorkspaceSettings (never partial).
 * Strips unknown keys via the Zod parse step.
 */
export function mergeSettings(
  existing: WorkspaceSettings | Record<string, unknown> | null | undefined,
  update: WorkspaceSettingsUpdate
): WorkspaceSettings {
  const defaults = WorkspaceSettingsSchema.parse({});
  const base: WorkspaceSettings =
    existing != null ? WorkspaceSettingsSchema.parse({ ...defaults, ...existing }) : defaults;

  return WorkspaceSettingsSchema.parse({ ...base, ...update });
}

/**
 * Fastify JSON schema for the PATCH /workspaces/:workspaceId/settings request body.
 * Used for fast Fastify-level validation before the Zod layer.
 */
export const updateSettingsBodyJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    defaultMemberRole: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
    allowCrossWorkspaceSharing: { type: 'boolean' },
    maxMembers: { type: 'integer', minimum: 0 },
    isPublic: { type: 'boolean' },
    notificationsEnabled: { type: 'boolean' },
  },
};
