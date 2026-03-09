/**
 * LayoutConfigValidationService — T014-06 (Spec 014 Frontend Layout Engine)
 *
 * Validates layout config overrides against plugin manifest schemas:
 *   - Field / section / column ID existence check (FR-020)
 *   - Required field hidden-without-default detection (FR-011)
 *   - Stale reference detection — IDs that were removed from the manifest (Edge Case #1)
 *   - JSONB payload size guard (256 KB, Edge Case #6)
 *
 * Constitution Compliance:
 *   - Article 5.3: Zod-based input validation for all external inputs
 *   - Article 6.1: Domain errors with SCREAMING_SNAKE_CASE codes
 *   - Article 4.3: 200-field manifest processed in < 10 ms (NFR-004)
 */

import type { FormSchema, FieldOverride, SectionOverride, ColumnOverride } from '@plexica/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed serialised JSONB payload size in bytes (Edge Case #6). */
const MAX_JSONB_BYTES = 256 * 1024; // 256 KB

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SaveLayoutConfigOverrides {
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
}

export interface ValidationResult {
  valid: boolean;
  /** INVALID_FIELD_REFERENCE — references that do not exist in the manifest. */
  invalidReferences: InvalidReference[];
  /** Fields that are hidden/readonly for all effective roles AND have no default value. */
  requiredFieldWarnings: RequiredFieldWarning[];
  /** References present in overrides but no longer in the manifest. */
  staleReferences: StaleReference[];
}

export interface InvalidReference {
  type: 'field' | 'section' | 'column';
  id: string;
}

export interface RequiredFieldWarning {
  fieldId: string;
  label: string;
}

export interface StaleReference {
  type: 'field' | 'section' | 'column';
  id: string;
}

// ---------------------------------------------------------------------------
// LayoutConfigValidationService
// ---------------------------------------------------------------------------

export class LayoutConfigValidationService {
  /**
   * Full validation of layout config overrides against the given form schema.
   *
   * Returns a `ValidationResult` with:
   *   - `valid: false` when any `invalidReferences` exist (hard error → 400)
   *   - `requiredFieldWarnings` populated when required fields are being hidden
   *     without a default value (soft warning → 400 with `acknowledgeWarnings`)
   *   - `staleReferences` populated when IDs no longer exist in manifest (warning only)
   *
   * @param overrides  Proposed field/section/column overrides from the PUT request
   * @param manifest   The authoritative form schema from the plugin manifest
   */
  validateAgainstManifest(
    overrides: SaveLayoutConfigOverrides,
    manifest: FormSchema
  ): ValidationResult {
    const fieldIds = new Set(manifest.fields.map((f) => f.fieldId));
    const sectionIds = new Set(manifest.sections.map((s) => s.sectionId));
    const columnIds = new Set(manifest.columns.map((c) => c.columnId));

    const invalidReferences: InvalidReference[] = [];
    const staleReferences: StaleReference[] = [];

    // Check field overrides
    for (const f of overrides.fields) {
      if (!fieldIds.has(f.fieldId)) {
        invalidReferences.push({ type: 'field', id: f.fieldId });
      }
    }

    // Check section overrides
    for (const s of overrides.sections) {
      if (!sectionIds.has(s.sectionId)) {
        invalidReferences.push({ type: 'section', id: s.sectionId });
      }
    }

    // Check column overrides
    for (const c of overrides.columns) {
      if (!columnIds.has(c.columnId)) {
        invalidReferences.push({ type: 'column', id: c.columnId });
      }
    }

    // Required field warnings (only for IDs that ARE in the manifest)
    const requiredFieldWarnings = this.detectRequiredFieldWarnings(overrides.fields, manifest);

    // Stale references = valid IDs from a prior manifest version that no longer exist
    // For overrides that ARE invalid references we already reported them above;
    // stale detection here means they existed before but were removed — we treat
    // them the same as invalid (they are the same set from a structural standpoint)
    // so we surface them in staleReferences for informational purposes.
    // Note: stale == invalid at save time; we keep a separate list for UI annotation.
    for (const ref of invalidReferences) {
      staleReferences.push(ref);
    }

    return {
      valid: invalidReferences.length === 0,
      invalidReferences,
      requiredFieldWarnings,
      staleReferences,
    };
  }

  /**
   * Detect required fields that are being hidden or set read-only for *all*
   * roles without having a `defaultValue` in the manifest.
   *
   * If a field has a `defaultValue`, the value can be auto-injected (FR-010),
   * so no warning is needed.
   *
   * @param fieldOverrides  Array of FieldOverride from the PUT request
   * @param manifest        The form schema from the plugin manifest
   */
  detectRequiredFieldWarnings(
    fieldOverrides: FieldOverride[],
    manifest: FormSchema
  ): RequiredFieldWarning[] {
    const warnings: RequiredFieldWarning[] = [];

    // Build a lookup map for quick access
    const manifestFieldMap = new Map(manifest.fields.map((f) => [f.fieldId, f]));

    for (const override of fieldOverrides) {
      const manifestField = manifestFieldMap.get(override.fieldId);
      if (!manifestField) continue; // invalid ref — handled by validateAgainstManifest
      if (!manifestField.required) continue; // not required — no warning needed
      if (manifestField.defaultValue !== undefined && manifestField.defaultValue !== null) {
        // Has a default value → auto-inject will handle it (FR-010) — no warning
        continue;
      }

      // Determine the effective visibility: if globalVisibility hides the field
      // for any role, or if every role-specific override hides it, emit a warning.
      // Note: 'readonly' is NOT treated as hidden — a readonly required field is
      // still visible and can be pre-filled by the system (FR-010). Only 'hidden'
      // triggers the warning (TD-030 fix).
      const isGloballyHidden = override.globalVisibility === 'hidden';

      const roleValues = Object.values(override.visibility ?? {});
      const hasRoleHidingAll = roleValues.length > 0 && roleValues.every((v) => v === 'hidden');

      if (isGloballyHidden || hasRoleHidingAll) {
        warnings.push({ fieldId: override.fieldId, label: manifestField.label });
      }
    }

    return warnings;
  }

  /**
   * Detect stale references: field/section/column IDs present in stored overrides
   * that are no longer present in the current manifest. These are silently skipped
   * during resolution (Edge Case #1) but surfaced here for the admin UI to annotate.
   *
   * @param overrides  Existing stored overrides (not a new PUT request)
   * @param manifest   Current form schema from the plugin manifest
   */
  detectStaleReferences(
    overrides: SaveLayoutConfigOverrides,
    manifest: FormSchema
  ): StaleReference[] {
    const fieldIds = new Set(manifest.fields.map((f) => f.fieldId));
    const sectionIds = new Set(manifest.sections.map((s) => s.sectionId));
    const columnIds = new Set(manifest.columns.map((c) => c.columnId));

    const stale: StaleReference[] = [];

    for (const f of overrides.fields) {
      if (!fieldIds.has(f.fieldId)) stale.push({ type: 'field', id: f.fieldId });
    }
    for (const s of overrides.sections) {
      if (!sectionIds.has(s.sectionId)) stale.push({ type: 'section', id: s.sectionId });
    }
    for (const c of overrides.columns) {
      if (!columnIds.has(c.columnId)) stale.push({ type: 'column', id: c.columnId });
    }

    return stale;
  }

  /**
   * Validate that the serialised overrides payload does not exceed 256 KB
   * (Edge Case #6 — large plugin forms with many roles).
   *
   * @param overrides  The payload to check
   * @returns `true` if within limit, `false` if oversized
   */
  validateSize(overrides: SaveLayoutConfigOverrides): boolean {
    const json = JSON.stringify(overrides);
    return Buffer.byteLength(json, 'utf8') <= MAX_JSONB_BYTES;
  }
}

/** Singleton instance shared across the application. */
export const layoutConfigValidationService = new LayoutConfigValidationService();
