/**
 * Layout Config Validation Schemas — Spec 014 Frontend Layout Engine
 *
 * Zod schemas for validating layout config request bodies, plugin manifest
 * formSchemas extensions, and JSONB field/section/column override shapes.
 *
 * Constitution Art. 5.3: All external input validated with Zod schemas.
 * Plan §5.3: Validation rules for PUT body and plugin manifest extension.
 */

import { z } from 'zod';
import { LAYOUT_ROLE_KEYS } from '@plexica/types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed size in bytes for the layout config JSONB payload (plan §3.5). */
const LAYOUT_CONFIG_MAX_BYTES = 256 * 1024; // 256 KB

/** Pattern for valid field/section/column IDs (kebab-case or snake_case). */
const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

// ============================================================================
// Primitive schemas
// ============================================================================

/** Valid role key — exactly the 7 roles from ADR-024. */
export const roleKeySchema = z.enum(LAYOUT_ROLE_KEYS);

/** Field visibility states. */
const fieldVisibilitySchema = z.enum(['visible', 'hidden', 'readonly']);

/** Column visibility states. */
const columnVisibilitySchema = z.enum(['visible', 'hidden']);

/**
 * Per-role visibility map — all keys optional, only recognised roles allowed.
 * Uses z.partialRecord (Zod v4) so that .default({}) is type-safe: {} is a
 * valid partial record but not a full Record<RoleKey, ...> that z.record would
 * require for its default value.
 */
const fieldVisibilityMapSchema = z.partialRecord(roleKeySchema, fieldVisibilitySchema).default({});
const columnVisibilityMapSchema = z
  .partialRecord(roleKeySchema, columnVisibilitySchema)
  .default({});

/** Validated field ID — kebab-case or snake_case. */
const fieldIdSchema = z.string().min(1).max(255).regex(ID_PATTERN, {
  message: 'Field ID must be kebab-case or snake_case (e.g. "first-name" or "first_name")',
});

/** Validated section ID. */
const sectionIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(ID_PATTERN, { message: 'Section ID must be kebab-case or snake_case' });

/** Validated column ID. */
const columnIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(ID_PATTERN, { message: 'Column ID must be kebab-case or snake_case' });

// ============================================================================
// Override schemas (JSONB field shapes stored in layout_configs)
// ============================================================================

/**
 * Schema for a single field override.
 * Validates structure stored in layout_configs.fields JSONB.
 */
export const fieldOverrideSchema = z.object({
  fieldId: fieldIdSchema,
  order: z.number().int().min(0),
  globalVisibility: fieldVisibilitySchema,
  visibility: fieldVisibilityMapSchema,
});

/**
 * Schema for a single section override.
 * Validates structure stored in layout_configs.sections JSONB.
 */
export const sectionOverrideSchema = z.object({
  sectionId: sectionIdSchema,
  order: z.number().int().min(0),
});

/**
 * Schema for a single column override.
 * Validates structure stored in layout_configs.columns JSONB.
 */
export const columnOverrideSchema = z.object({
  columnId: columnIdSchema,
  globalVisibility: columnVisibilitySchema,
  visibility: columnVisibilityMapSchema,
});

// ============================================================================
// PUT /api/v1/layout-configs/:formId request body
// ============================================================================

/**
 * Request body schema for PUT /api/v1/layout-configs/:formId.
 * Also used for PUT /api/v1/workspaces/:wId/layout-configs/:formId.
 *
 * - `acknowledgeWarnings`: set to true to bypass REQUIRED_FIELD_NO_DEFAULT warning.
 * - Validates 256 KB size limit on the serialised payload.
 */
export const saveLayoutConfigSchema = z
  .object({
    pluginId: z.string().uuid({ message: 'pluginId must be a valid UUID' }),
    fields: z.array(fieldOverrideSchema).default([]),
    sections: z.array(sectionOverrideSchema).default([]),
    columns: z.array(columnOverrideSchema).default([]),
    acknowledgeWarnings: z.boolean().default(false),
    /**
     * TD-034: Clients that cannot set the `If-Match` request header (e.g. the
     * TenantApiClient wrapper) pass the ETag as a body field instead.
     * The route handler reads `If-Match` first, and falls back to this field.
     */
    etag: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // 256 KB JSONB size guard
    const serialised = JSON.stringify({
      fields: data.fields,
      sections: data.sections,
      columns: data.columns,
    });
    if (Buffer.byteLength(serialised, 'utf8') > LAYOUT_CONFIG_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Layout config payload exceeds the 256 KB limit (LAYOUT_CONFIG_TOO_LARGE)`,
        path: [],
      });
    }
  });

export type SaveLayoutConfigInput = z.infer<typeof saveLayoutConfigSchema>;

// ============================================================================
// Plugin manifest formSchemas extension (T014-04 / T014-13)
// ============================================================================

/**
 * Schema for a field declared in a plugin's form schema manifest.
 */
export const manifestFieldSchema = z.object({
  fieldId: fieldIdSchema,
  label: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  sectionId: sectionIdSchema,
  order: z.number().int().min(0),
});

/**
 * Schema for a section declared in a plugin's form schema manifest.
 */
export const manifestSectionSchema = z.object({
  sectionId: sectionIdSchema,
  label: z.string().min(1).max(255),
  order: z.number().int().min(0),
});

/**
 * Schema for a column declared in a plugin's form schema manifest.
 */
export const manifestColumnSchema = z.object({
  columnId: columnIdSchema,
  label: z.string().min(1).max(255),
  order: z.number().int().min(0),
});

/**
 * Schema for a single form schema contributed by a plugin manifest.
 * Supports up to 200 fields, 50 sections, and 50 columns per form (NFR-004).
 */
export const formSchemaManifestSchema = z.object({
  formId: z
    .string()
    .min(1)
    .max(255)
    .regex(ID_PATTERN, { message: 'formId must be kebab-case or snake_case' }),
  label: z.string().min(1).max(255),
  sections: z.array(manifestSectionSchema).max(50),
  fields: z.array(manifestFieldSchema).max(200),
  columns: z.array(manifestColumnSchema).max(200),
});

/**
 * Schema for the optional `formSchemas` array in a plugin manifest.
 * Validates backward-compatible manifest extension (T014-02).
 */
export const manifestFormSchemasSchema = z
  .array(formSchemaManifestSchema)
  .max(20, { message: 'A plugin may declare at most 20 form schemas' })
  .optional();

export type FormSchemaManifest = z.infer<typeof formSchemaManifestSchema>;
