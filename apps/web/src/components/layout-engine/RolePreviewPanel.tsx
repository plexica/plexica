// File: apps/web/src/components/layout-engine/RolePreviewPanel.tsx
//
// T014-22 — Read-only form preview for a selected role in the admin panel.
// Spec 014 Frontend Layout Engine — FR-014, NFR-010.
//
// Renders a non-interactive preview of how the form will look for a given role,
// based on the CURRENT (possibly unsaved) field overrides and section overrides.
//
// Features:
//   - Role badge in header
//   - Fields sorted by configured order, grouped into sections
//   - Read-only fields shown with muted background + "(read-only)" label
//   - Hidden fields omitted from preview, listed in footer for admin reference
//   - All inputs have tabIndex={-1} — not in tab order (non-interactive preview)
//   - aria-live="polite" so screen readers announce role change updates

import type {
  ManifestField,
  ManifestSection,
  FieldOverride,
  SectionOverride,
  RoleKey,
  FieldVisibility,
} from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RolePreviewPanelProps {
  /** The role to preview as. When null, shows a prompt to select a role. */
  role: RoleKey | null;
  /** All fields from the manifest. */
  fields: ManifestField[];
  /** Current field overrides (including unsaved changes). */
  overrides: FieldOverride[];
  /** All sections from the manifest. */
  sections: ManifestSection[];
  /** Current section order overrides (including unsaved changes). */
  sectionOverrides: SectionOverride[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldVisibility(
  overrides: FieldOverride[],
  fieldId: string,
  role: RoleKey
): FieldVisibility {
  const override = overrides.find((o) => o.fieldId === fieldId);
  if (!override) return 'visible';
  return override.visibility[role] ?? override.globalVisibility;
}

function getFieldOrder(overrides: FieldOverride[], fieldId: string, defaultOrder: number): number {
  return overrides.find((o) => o.fieldId === fieldId)?.order ?? defaultOrder;
}

function getSectionOrder(
  sectionOverrides: SectionOverride[],
  sectionId: string,
  defaultOrder: number
): number {
  return sectionOverrides.find((o) => o.sectionId === sectionId)?.order ?? defaultOrder;
}

// ---------------------------------------------------------------------------
// Preview field renderer
// ---------------------------------------------------------------------------

interface PreviewFieldProps {
  field: ManifestField;
  visibility: FieldVisibility;
}

function PreviewField({ field, visibility }: PreviewFieldProps) {
  const isReadonly = visibility === 'readonly';

  const inputClasses = [
    'w-full rounded border border-border px-2 py-1.5 text-sm',
    isReadonly ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-background',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1">
      <label
        className="block text-xs font-medium text-foreground"
        htmlFor={`preview-${field.fieldId}`}
      >
        {field.label}
        {field.required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
        {isReadonly && (
          <span className="ml-1 text-xs text-muted-foreground font-normal">(read-only)</span>
        )}
      </label>
      <input
        id={`preview-${field.fieldId}`}
        type="text"
        className={inputClasses}
        // Use sample placeholder — preview is not for data entry
        placeholder={field.defaultValue ? String(field.defaultValue) : `Sample ${field.label}`}
        readOnly
        tabIndex={-1}
        aria-readonly="true"
        aria-label={`${field.label}${isReadonly ? ' (read-only)' : ''}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Read-only role-based form preview panel for the admin configuration panel.
 *
 * @example
 * ```tsx
 * <RolePreviewPanel
 *   role={selectedRole}
 *   fields={schema.fields}
 *   overrides={currentOverrides}
 *   sections={schema.sections}
 *   sectionOverrides={currentSectionOverrides}
 * />
 * ```
 */
export function RolePreviewPanel({
  role,
  fields,
  overrides,
  sections,
  sectionOverrides,
}: RolePreviewPanelProps) {
  // No role selected — show prompt
  if (!role) {
    return (
      <div
        className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
        data-testid="role-preview-panel-empty"
      >
        Select a role to preview the form.
      </div>
    );
  }

  // Sort fields by configured order
  const sortedFields = [...fields].sort((a, b) => {
    const aOrder = getFieldOrder(overrides, a.fieldId, a.order);
    const bOrder = getFieldOrder(overrides, b.fieldId, b.order);
    return aOrder - bOrder;
  });

  // Sort sections by configured order
  const sortedSections = [...sections].sort((a, b) => {
    const aOrder = getSectionOrder(sectionOverrides, a.sectionId, a.order);
    const bOrder = getSectionOrder(sectionOverrides, b.sectionId, b.order);
    return aOrder - bOrder;
  });

  // Compute visibility for each field under the selected role
  const visibleFields = sortedFields.filter(
    (f) => getFieldVisibility(overrides, f.fieldId, role) !== 'hidden'
  );
  const hiddenFields = sortedFields.filter(
    (f) => getFieldVisibility(overrides, f.fieldId, role) === 'hidden'
  );

  // Group visible fields by section (in section order)
  const fieldsBySection = new Map<string, ManifestField[]>();
  const unsectionedFields: ManifestField[] = [];

  for (const field of visibleFields) {
    if (field.sectionId) {
      const existing = fieldsBySection.get(field.sectionId) ?? [];
      fieldsBySection.set(field.sectionId, [...existing, field]);
    } else {
      unsectionedFields.push(field);
    }
  }

  return (
    <div
      aria-live="polite"
      aria-label={`Form preview for ${role} role`}
      data-testid="role-preview-panel"
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Form Preview (read-only)
        </span>
        <span
          className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          aria-hidden="true"
        >
          {role}
        </span>
      </div>

      {/* Preview card */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-6" role="presentation">
        {/* Sections with their fields */}
        {sortedSections.map((section) => {
          const sectionFields = fieldsBySection.get(section.sectionId) ?? [];
          if (sectionFields.length === 0) return null;

          return (
            <div key={section.sectionId}>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 pb-1 border-b border-border">
                {section.label}
              </h3>
              <div className="space-y-3">
                {sectionFields.map((field) => (
                  <PreviewField
                    key={field.fieldId}
                    field={field}
                    visibility={getFieldVisibility(overrides, field.fieldId, role)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Unsectioned fields */}
        {unsectionedFields.length > 0 && (
          <div className="space-y-3">
            {unsectionedFields.map((field) => (
              <PreviewField
                key={field.fieldId}
                field={field}
                visibility={getFieldVisibility(overrides, field.fieldId, role)}
              />
            ))}
          </div>
        )}

        {/* Empty state when all fields hidden */}
        {visibleFields.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            All fields are hidden for the {role} role.
          </p>
        )}
      </div>

      {/* Hidden fields annotation (admin reference only) */}
      {hiddenFields.length > 0 && (
        <div className="mt-2 px-1 space-y-0.5" aria-label="Fields hidden for this role">
          {hiddenFields.map((field) => (
            <p
              key={field.fieldId}
              className="text-xs text-muted-foreground italic"
              aria-label={`${field.label}: hidden for ${role}`}
            >
              ({field.label}: hidden for {role})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
