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
 *
 * Prefer targetPluginId + targetSlotId together for the <ExtensionSlot> read path.
 * The legacy slotId param (bare slot ID without plugin scope) is kept for backwards
 * compatibility with admin tooling but MUST NOT be used from the frontend component.
 */
export const GetContributionsQuerySchema = z
  .object({
    /** Bare slot ID (admin use only — prefer targetPluginId + targetSlotId). */
    slotId: safeOptionalString,
    /** Target plugin ID (identifies the plugin that owns the slot). */
    targetPluginId: safeString.min(1).max(255).optional(),
    /** Target slot ID scoped to targetPluginId. */
    targetSlotId: safeString.min(1).max(255).optional(),
    workspaceId: optionalUuid,
    pluginId: safeString.min(1).max(255).optional(),
    type: slotTypeSchema.optional(),
  })
  .strict()
  .refine((d) => !(d.targetSlotId && !d.targetPluginId), {
    message: 'targetPluginId is required when targetSlotId is provided',
    path: ['targetPluginId'],
  });

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
// Manifest declaration schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for ContributionDeclaration from plugin manifests.
 * Adds .url() validation to previewUrl (M-03) so malformed preview URLs are
 * rejected at the validation boundary before they reach the database.
 * Art. 5.3: All external input validated with Zod schemas.
 */
export const ContributionDeclarationSchema = z
  .object({
    targetPluginId: safeString.min(1).max(255),
    targetSlotId: safeString.min(1).max(255),
    componentName: safeString.min(1).max(255),
    priority: z.number().int().min(0).max(999).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    /** M-03: URL validation added — rejects non-URL strings for preview thumbnails. */
    previewUrl: z
      .string()
      .url({ message: 'previewUrl must be a valid URL' })
      .refine((s) => !s.includes('\u0000'), { message: 'String must not contain null bytes' })
      .optional(),
    description: safeOptionalString,
  })
  .strict();

export type ValidatedContributionDeclaration = z.infer<typeof ContributionDeclarationSchema>;

/**
 * Zod schema for ExtensibleEntityDeclaration from plugin manifests.
 * C-04 fix: entities were previously upserted without Zod validation.
 * Art. 5.3: All external input validated with Zod schemas.
 */
export const ExtensibleEntityDeclarationSchema = z
  .object({
    entityType: safeString.min(1).max(255),
    label: safeString.min(1).max(255),
    fieldSchema: z.record(z.string(), z.unknown()),
  })
  .strict();

export type ValidatedExtensibleEntityDeclaration = z.infer<
  typeof ExtensibleEntityDeclarationSchema
>;

/**
 * Zod schema for DataExtensionDeclaration from plugin manifests.
 * C-04 fix: dataExtensions were previously upserted without Zod validation,
 * meaning sidecarUrl values could bypass SSRF pre-validation entirely.
 * Art. 5.3: All external input validated with Zod schemas.
 */
export const DataExtensionDeclarationSchema = z
  .object({
    targetPluginId: safeString.min(1).max(255),
    targetEntityType: safeString.min(1).max(255),
    /** Must be a valid URL — validated here before storage (SSRF pre-validation layer). */
    sidecarUrl: z
      .string()
      .url({ message: 'sidecarUrl must be a valid URL' })
      .refine((s) => !s.includes('\u0000'), { message: 'String must not contain null bytes' })
      .refine((s) => /^https?:\/\//i.test(s), {
        message: 'sidecarUrl must use http or https scheme',
      }),
    fieldSchema: z.record(z.string(), z.unknown()),
    description: safeOptionalString,
  })
  .strict();

export type ValidatedDataExtensionDeclaration = z.infer<typeof DataExtensionDeclarationSchema>;

// ---------------------------------------------------------------------------
// Admin / operator route schemas (W-12, W-8)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/extension-registry/sync-status/:pluginId
 * Route params for sync status query (W-8: operator observability endpoint).
 */
export const SyncStatusParamsSchema = z
  .object({
    pluginId: safeString.min(1).max(255),
  })
  .strict();

export type SyncStatusParams = z.infer<typeof SyncStatusParamsSchema>;

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
