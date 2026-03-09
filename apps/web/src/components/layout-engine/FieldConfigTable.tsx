// File: apps/web/src/components/layout-engine/FieldConfigTable.tsx
//
// T014-19 — Field ordering and role-visibility grid table for the admin panel.
// Spec 014 Frontend Layout Engine — FR-003, FR-012, FR-013, NFR-010.
//
// Shows all manifest fields with:
//   - Up/Down order controls (disabled at boundaries)
//   - Per-role visibility toggle (cycles: visible → readonly → hidden → visible)
//   - Global visibility select (fallback for roles not individually configured)
//   - Required field indicator (⚠) for fields with required: true
//   - Stale field indicator (!) for fields not present in manifest (Edge Case #1)
//
// ARIA: role="grid" on table, role="row" per row, role="rowheader" for field name.

import React from 'react';
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { Select, Tooltip } from '@plexica/ui';
import { VisibilityToggle } from './VisibilityToggle';
import type { ManifestField, FieldOverride, RoleKey, FieldVisibility } from '@plexica/types';
import { LAYOUT_ROLE_KEYS } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldConfigTableProps {
  /** All fields declared in the plugin manifest. */
  fields: ManifestField[];
  /** Current field overrides (from layout config or defaults). */
  overrides: FieldOverride[];
  /** Role keys to show as columns. Defaults to all 7 LAYOUT_ROLE_KEYS. */
  roles?: RoleKey[];
  /** Callback when the admin moves a field up or down. */
  onOrderChange: (fieldId: string, direction: 'up' | 'down') => void;
  /** Callback when a per-role visibility toggle is cycled. */
  onVisibilityChange: (fieldId: string, role: RoleKey, next: FieldVisibility) => void;
  /** Callback when the global visibility select changes. */
  onGlobalChange: (fieldId: string, globalVisibility: FieldVisibility) => void;
  /** When true, all interactive controls are disabled (e.g. during save). */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the FieldOverride for a given fieldId, or a default if not configured.
 */
function getOverride(
  overrides: FieldOverride[],
  fieldId: string,
  defaultOrder: number
): FieldOverride {
  return (
    overrides.find((o) => o.fieldId === fieldId) ?? {
      fieldId,
      order: defaultOrder,
      globalVisibility: 'visible',
      visibility: {},
    }
  );
}

/**
 * Returns the per-role visibility for a given role (falls back to globalVisibility).
 */
function getRoleVisibility(override: FieldOverride, role: RoleKey): FieldVisibility {
  return override.visibility[role] ?? override.globalVisibility;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Grid table component for configuring field ordering and per-role visibility.
 *
 * @example
 * ```tsx
 * <FieldConfigTable
 *   fields={schema.fields}
 *   overrides={currentConfig.fields}
 *   roles={['TENANT_ADMIN', 'MEMBER', 'VIEWER']}
 *   onOrderChange={handleOrderChange}
 *   onVisibilityChange={handleVisibilityChange}
 *   onGlobalChange={handleGlobalChange}
 * />
 * ```
 */
export function FieldConfigTable({
  fields,
  overrides,
  roles = [...LAYOUT_ROLE_KEYS],
  onOrderChange,
  onVisibilityChange,
  onGlobalChange,
  disabled = false,
}: FieldConfigTableProps) {
  // Build the set of fieldIds in manifest for stale-field detection
  const manifestFieldIds = new Set(fields.map((f) => f.fieldId));

  // Merge manifest fields with any overrides and sort by current order
  const sortedFields = [...fields].sort((a, b) => {
    const aOverride = getOverride(overrides, a.fieldId, a.order);
    const bOverride = getOverride(overrides, b.fieldId, b.order);
    return aOverride.order - bOverride.order;
  });

  // Detect stale overrides (fieldId in overrides but not in manifest)
  const staleFieldIds = new Set(
    overrides.map((o) => o.fieldId).filter((id) => !manifestFieldIds.has(id))
  );

  const staleOverrides = overrides.filter((o) => staleFieldIds.has(o.fieldId));

  return (
    <div
      role="grid"
      aria-label="Field configuration"
      aria-busy={disabled ? 'true' : 'false'}
      className="w-full overflow-x-auto"
      data-testid="field-config-table"
    >
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr role="row" className="bg-muted text-muted-foreground">
            <th role="columnheader" scope="col" className="px-3 py-2 text-left font-medium">
              Field
            </th>
            <th role="columnheader" scope="col" className="px-3 py-2 text-center font-medium w-20">
              Order
            </th>
            {roles.map((role) => (
              <th
                key={role}
                role="columnheader"
                scope="col"
                className="px-2 py-2 text-center font-medium"
              >
                {role}
              </th>
            ))}
            <th role="columnheader" scope="col" className="px-3 py-2 text-center font-medium">
              Global
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedFields.map((field, idx) => {
            const override = getOverride(overrides, field.fieldId, field.order);
            const isFirst = idx === 0;
            const isLast = idx === sortedFields.length - 1;
            const position = idx + 1;

            return (
              <tr
                key={field.fieldId}
                role="row"
                className="border-b border-border hover:bg-muted/30 transition-colors"
                data-testid={`field-row-${field.fieldId}`}
              >
                {/* Field name */}
                <td
                  role="rowheader"
                  scope="row"
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  <span className="flex items-center gap-1.5">
                    {field.label}
                    {field.required && (
                      <Tooltip content="Required field">
                        <span aria-label="Required field">
                          <AlertTriangle
                            size={14}
                            className="text-yellow-600 flex-shrink-0"
                            aria-hidden="true"
                          />
                        </span>
                      </Tooltip>
                    )}
                  </span>
                </td>

                {/* Order controls */}
                <td role="gridcell" className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-center">
                    <button
                      type="button"
                      onClick={() => onOrderChange(field.fieldId, 'up')}
                      disabled={disabled || isFirst}
                      aria-label={`Move ${field.label} up`}
                      aria-disabled={isFirst ? 'true' : undefined}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <ChevronUp size={14} aria-hidden="true" />
                    </button>
                    <span
                      aria-live="polite"
                      aria-label={`${field.label} is at position ${position} of ${sortedFields.length}`}
                      className="w-5 text-center text-xs text-muted-foreground tabular-nums"
                    >
                      {position}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOrderChange(field.fieldId, 'down')}
                      disabled={disabled || isLast}
                      aria-label={`Move ${field.label} down`}
                      aria-disabled={isLast ? 'true' : undefined}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  </div>
                </td>

                {/* Per-role visibility toggles */}
                {roles.map((role) => (
                  <td key={role} role="gridcell" className="px-2 py-1 text-center">
                    <VisibilityToggle
                      mode="field"
                      value={getRoleVisibility(override, role)}
                      onChange={(next) => onVisibilityChange(field.fieldId, role, next)}
                      fieldLabel={field.label}
                      roleLabel={role}
                      disabled={disabled}
                    />
                  </td>
                ))}

                {/* Global visibility select */}
                <td role="gridcell" className="px-3 py-1 text-center">
                  <Select
                    value={override.globalVisibility}
                    onValueChange={(val) => onGlobalChange(field.fieldId, val as FieldVisibility)}
                    disabled={disabled}
                    aria-label={`${field.label} global visibility`}
                  >
                    <option value="visible">visible</option>
                    <option value="readonly">read-only</option>
                    <option value="hidden">hidden</option>
                  </Select>
                </td>
              </tr>
            );
          })}

          {/* Stale fields (in config but not in manifest — Edge Case #1) */}
          {staleOverrides.map((staleOverride) => (
            <tr
              key={staleOverride.fieldId}
              role="row"
              className="border-b border-border bg-yellow-50/50 text-muted-foreground"
              data-testid={`field-row-stale-${staleOverride.fieldId}`}
            >
              <td role="rowheader" scope="row" className="px-3 py-2 font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <span className="line-through text-muted-foreground">
                    {staleOverride.fieldId}
                  </span>
                  <Tooltip content="Stale: this field no longer exists in the plugin manifest">
                    <span
                      aria-label={`Stale: field ${staleOverride.fieldId} no longer in plugin manifest`}
                      className="text-xs px-1 py-0.5 bg-yellow-200 text-yellow-800 rounded font-mono"
                    >
                      !
                    </span>
                  </Tooltip>
                </span>
              </td>
              <td
                role="gridcell"
                colSpan={roles.length + 2}
                className="px-3 py-2 text-xs text-muted-foreground italic"
              >
                This field was removed from the plugin. It will be cleaned up on the next save.
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-2 px-3 py-1.5 text-xs text-muted-foreground flex flex-wrap gap-3">
        <span className="flex items-center gap-1">
          <span className="text-green-600 font-medium">✓ₑ</span> editable
        </span>
        <span className="flex items-center gap-1">
          <span className="text-blue-600 font-medium">✓ᵣ</span> read-only
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-600 font-medium">✗</span> hidden
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle size={12} className="text-yellow-600" aria-hidden="true" />
          required field
        </span>
        <span className="flex items-center gap-1">
          <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded font-mono">!</span>
          stale field
        </span>
      </div>
    </div>
  );
}
