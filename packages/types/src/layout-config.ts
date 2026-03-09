// File: packages/types/src/layout-config.ts

/**
 * Shared TypeScript types for the Frontend Layout Engine (Spec 014).
 *
 * These types define the data shapes for layout configurations, form schemas
 * contributed by plugins, and the resolved layout returned by the API.
 *
 * ADR-002: layout_configs lives in tenant schema.
 * ADR-024: RoleKey covers 7 roles from the hybrid role model.
 */

// ---------------------------------------------------------------------------
// Role Keys (ADR-024 — hybrid Keycloak + team member role model)
// ---------------------------------------------------------------------------

/**
 * All 7 role keys recognised by the layout engine.
 * Matches the roles in ADR-024 (Keycloak realm roles + workspace team roles).
 */
export const LAYOUT_ROLE_KEYS = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'TENANT_MEMBER',
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
] as const;

export type RoleKey = (typeof LAYOUT_ROLE_KEYS)[number];

// ---------------------------------------------------------------------------
// Visibility / scope types
// ---------------------------------------------------------------------------

/** Visibility state for a configurable field. */
export type FieldVisibility = 'visible' | 'hidden' | 'readonly';

/** Visibility state for a configurable table column. */
export type ColumnVisibility = 'visible' | 'hidden';

/** Layout scope level. */
export type LayoutScopeType = 'tenant' | 'workspace';

// ---------------------------------------------------------------------------
// JSONB override shapes (stored in layout_configs table)
// ---------------------------------------------------------------------------

/**
 * Override for a single form field.
 * `globalVisibility` is the fallback for any role not listed in `visibility`.
 */
export interface FieldOverride {
  /** References ManifestField.fieldId */
  fieldId: string;
  /** Render order (0-based). */
  order: number;
  /** Fallback visibility for roles not listed in `visibility`. */
  globalVisibility: FieldVisibility;
  /** Per-role overrides. Roles omitted here use `globalVisibility`. */
  visibility: Partial<Record<RoleKey, FieldVisibility>>;
}

/**
 * Override for a form section.
 * Only ordering is configurable; visibility is derived from its fields.
 */
export interface SectionOverride {
  /** References ManifestSection.sectionId */
  sectionId: string;
  /** Render order (0-based). */
  order: number;
}

/**
 * Override for a table column.
 * `globalVisibility` is the fallback for any role not listed in `visibility`.
 */
export interface ColumnOverride {
  /** References ManifestColumn.columnId */
  columnId: string;
  /** Fallback visibility for roles not listed in `visibility`. */
  globalVisibility: ColumnVisibility;
  /** Per-role overrides. Roles omitted here use `globalVisibility`. */
  visibility: Partial<Record<RoleKey, ColumnVisibility>>;
}

// ---------------------------------------------------------------------------
// Layout config entity (database model representation)
// ---------------------------------------------------------------------------

/**
 * Snapshot of a layout config stored as `previous_version` for single-step undo.
 */
export interface LayoutConfigSnapshot {
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
}

/**
 * Full layout config entity as returned by the API.
 */
export interface LayoutConfig {
  id: string;
  formId: string;
  pluginId: string;
  scopeType: LayoutScopeType;
  /** NULL for tenant-scope configs; workspace UUID for workspace-scope. */
  scopeId: string | null;
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
  /** Previous config snapshot for single-step revert (FR-018, FR-019). */
  previousVersion: LayoutConfigSnapshot | null;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  /** Used as ETag for optimistic concurrency control. */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Plugin manifest form schema (contributed by plugins via manifest.formSchemas)
// ---------------------------------------------------------------------------

/**
 * A field declared in the plugin manifest for a configurable form.
 */
export interface ManifestField {
  /** Unique identifier within the form. Must be kebab-case or snake_case. */
  fieldId: string;
  /** Human-readable label. */
  label: string;
  /** Field type (e.g. "text", "email", "date", "select"). */
  type: string;
  /** Whether the field is required for form submission. */
  required: boolean;
  /** Default value used when the field is hidden (FR-010). */
  defaultValue: unknown;
  /** Section this field belongs to. References ManifestSection.sectionId. */
  sectionId: string;
  /** Default render order (0-based). */
  order: number;
}

/**
 * A section declared in the plugin manifest for a configurable form.
 */
export interface ManifestSection {
  /** Unique identifier within the form. */
  sectionId: string;
  /** Human-readable label. */
  label: string;
  /** Default render order (0-based). */
  order: number;
}

/**
 * A table column declared in the plugin manifest for a configurable list view.
 */
export interface ManifestColumn {
  /** Unique identifier within the form. */
  columnId: string;
  /** Human-readable header label. */
  label: string;
  /** Default render order (0-based). */
  order: number;
}

/**
 * A form schema contributed by a plugin in its manifest.
 * Describes the configurable fields, sections, and columns for one form/view.
 */
export interface FormSchema {
  /** Unique form identifier across the platform (e.g. "crm-contact-form"). */
  formId: string;
  /** Human-readable label shown in the admin panel. */
  label: string;
  sections: ManifestSection[];
  fields: ManifestField[];
  columns: ManifestColumn[];
}

// ---------------------------------------------------------------------------
// Resolved layout (API response shape — GET /resolved)
// ---------------------------------------------------------------------------

/**
 * A single resolved field entry in the resolved layout response.
 */
export interface ResolvedField {
  fieldId: string;
  /** Final render order after applying overrides. */
  order: number;
  /** Effective visibility for the requesting user. */
  visibility: FieldVisibility;
  /** Convenience alias: true when visibility === 'readonly'. */
  readonly: boolean;
  /** Default value to auto-inject when field is hidden (FR-010). */
  defaultValue?: unknown;
  /** Whether this field is required in the manifest. */
  required?: boolean;
}

/**
 * A single resolved column entry in the resolved layout response.
 */
export interface ResolvedColumn {
  columnId: string;
  /** Effective visibility for the requesting user. */
  visibility: ColumnVisibility;
}

/**
 * A single resolved section entry in the resolved layout response.
 */
export interface ResolvedSection {
  sectionId: string;
  /** Final render order after applying overrides. */
  order: number;
}

/**
 * The fully resolved layout for a form, personalised for the requesting user.
 * Returned by GET /api/v1/layout-configs/:formId/resolved.
 *
 * - `source: 'workspace'` — workspace-level config applied.
 * - `source: 'tenant'`    — tenant-level config applied (no workspace override).
 * - `source: 'manifest'`  — no config saved; manifest defaults used (fail-open).
 */
export interface ResolvedLayout {
  formId: string;
  source: 'workspace' | 'tenant' | 'manifest';
  sections: ResolvedSection[];
  fields: ResolvedField[];
  columns: ResolvedColumn[];
}

// ---------------------------------------------------------------------------
// Request / response shapes used by the frontend hook
// ---------------------------------------------------------------------------

/**
 * Configurable form summary returned by GET /api/v1/layout-configs/forms.
 */
export interface ConfigurableFormSummary {
  formId: string;
  pluginId: string;
  pluginName: string;
  label: string;
  fieldCount: number;
  sectionCount: number;
  columnCount: number;
  /** Whether an active layout config exists for this form (tenant or workspace). */
  hasConfig: boolean;
  /**
   * Full form schema from the plugin manifest.
   * Included so the admin panel can display human-readable field labels
   * without a secondary fetch (M09 fix).
   */
  schema?: FormSchema;
}

/**
 * PUT /api/v1/layout-configs/:formId request body.
 *
 * NOTE: The canonical type is defined as a Zod-inferred type in
 * `apps/core-api/src/schemas/layout-config.schema.ts`.  This file re-exports
 * a structural alias that matches that shape so frontend packages can import
 * from `@plexica/types` without a direct dependency on the core-api schemas.
 * Do NOT add `pluginId` here — it is not in the Zod schema and was a source
 * of type collision (M06 fix).
 */
export interface SaveLayoutConfigInput {
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
  /**
   * Set to `true` to bypass the required-field-no-default warning (FR-011).
   * The dialog on the frontend resends with this flag set.
   */
  acknowledgeWarnings?: boolean;
}
