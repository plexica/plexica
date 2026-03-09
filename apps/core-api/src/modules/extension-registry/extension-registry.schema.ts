// File: apps/core-api/src/modules/extension-registry/extension-registry.schema.ts
//
// Spec 013 — Extension Points (T013-04)
// Zod validation schemas for all 8 extension-registry API endpoints.
// Art. 5.3: All external input validated with Zod schemas.
// Null byte injection prevention: string fields reject \u0000 (lessons-learned anti-pattern).

import { z } from 'zod';
import { EXTENSION_SLOT_TYPES } from '@plexica/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rejects null bytes (lessons-learned: i18n spec injection attack pattern) */
const safeString = z.string().refine((s) => !s.includes('\u0000'), {
  message: 'String must not contain null bytes',
});

const safeOptionalString = safeString.max(255).optional();

/** UUID v4 format */
const uuidSchema = z.string().uuid({ message: 'Must be a valid UUID' });
const optionalUuid = uuidSchema.optional();

/** Extension slot type */
const slotTypeSchema = z.enum(EXTENSION_SLOT_TYPES);

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/extension-registry/slots
 * Filters for listing extension slots.
 */
export const GetSlotsQuerySchema = z
  .object({
    pluginId: safeString.min(1).max(255).optional(),
    type: slotTypeSchema.optional(),
  })
  .strict();

export type GetSlotsQuery = z.infer<typeof GetSlotsQuerySchema>;

/**
 * GET /api/v1/extension-registry/slots/:pluginId
 * Route params for single-plugin slots query.
 */
export const GetSlotsByPluginParamsSchema = z
  .object({
    pluginId: safeString.min(1).max(255),
  })
  .strict();

export type GetSlotsByPluginParams = z.infer<typeof GetSlotsByPluginParamsSchema>;

/**
 * GET /api/v1/extension-registry/contributions
 * Filters for listing contributions.
 */
export const GetContributionsQuerySchema = z
  .object({
    slotId: safeOptionalString,
    workspaceId: optionalUuid,
    pluginId: safeString.min(1).max(255).optional(),
    type: slotTypeSchema.optional(),
  })
  .strict();

export type GetContributionsQuery = z.infer<typeof GetContributionsQuerySchema>;

/**
 * GET /api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions
 * Route params for entity extension aggregation.
 */
export const EntityExtensionParamsSchema = z
  .object({
    pluginId: safeString.min(1).max(255),
    entityType: safeString.min(1).max(255),
    entityId: safeString.min(1).max(255),
  })
  .strict();

export type EntityExtensionParams = z.infer<typeof EntityExtensionParamsSchema>;

/**
 * GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents
 * Route params for slot dependents query.
 */
export const SlotDependentsParamsSchema = z
  .object({
    pluginId: safeString.min(1).max(255),
    slotId: safeString.min(1).max(255),
  })
  .strict();

export type SlotDependentsParams = z.infer<typeof SlotDependentsParamsSchema>;

/**
 * PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId
 * Route params.
 */
export const VisibilityPatchParamsSchema = z
  .object({
    workspaceId: uuidSchema,
    contributionId: uuidSchema,
  })
  .strict();

export type VisibilityPatchParams = z.infer<typeof VisibilityPatchParamsSchema>;

/**
 * PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId
 * Request body.
 */
export const VisibilityPatchSchema = z
  .object({
    isVisible: z.boolean(),
  })
  .strict();

export type VisibilityPatch = z.infer<typeof VisibilityPatchSchema>;

// ---------------------------------------------------------------------------
// Feature-flag helper
// ---------------------------------------------------------------------------

/**
 * Checks whether the extension_points_enabled feature flag is set in tenant settings.
 * Returns false when the flag is absent (default-off, Art. 9.1.1).
 */
export function isExtensionPointsEnabled(tenantSettings: Record<string, unknown>): boolean {
  return tenantSettings['extension_points_enabled'] === true;
}
