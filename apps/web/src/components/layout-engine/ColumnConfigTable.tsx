// File: apps/web/src/components/layout-engine/ColumnConfigTable.tsx
//
// T014-20 — Column role-visibility grid table for the admin panel.
// Spec 014 Frontend Layout Engine — FR-005, FR-012, NFR-010.
//
// Shows all manifest columns with:
//   - Per-role visibility toggle (2-state: visible / hidden — columns have no readonly)
//   - Global visibility select (fallback for roles not individually configured)
//
// ARIA: role="grid" on table, role="row" per row, role="rowheader" for column name.

import React from 'react';
import { Select } from '@plexica/ui';
import { VisibilityToggle } from './VisibilityToggle';
import type { ManifestColumn, ColumnOverride, RoleKey, ColumnVisibility } from '@plexica/types';
import { LAYOUT_ROLE_KEYS } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ColumnConfigTableProps {
  /** All columns declared in the plugin manifest. */
  columns: ManifestColumn[];
  /** Current column overrides (from layout config or defaults). */
  overrides: ColumnOverride[];
  /** Role keys to show as columns. Defaults to all 7 LAYOUT_ROLE_KEYS. */
  roles?: RoleKey[];
  /** Callback when a per-role column visibility toggle is cycled. */
  onVisibilityChange: (columnId: string, role: RoleKey, next: ColumnVisibility) => void;
  /** Callback when the global column visibility select changes. */
  onGlobalChange: (columnId: string, globalVisibility: ColumnVisibility) => void;
  /** When true, all interactive controls are disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOverride(overrides: ColumnOverride[], columnId: string): ColumnOverride {
  return (
    overrides.find((o) => o.columnId === columnId) ?? {
      columnId,
      globalVisibility: 'visible',
      visibility: {},
    }
  );
}

function getRoleVisibility(override: ColumnOverride, role: RoleKey): ColumnVisibility {
  return override.visibility[role] ?? override.globalVisibility;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Grid table component for configuring per-role column visibility.
 *
 * @example
 * ```tsx
 * <ColumnConfigTable
 *   columns={schema.columns}
 *   overrides={currentConfig.columns}
 *   roles={['TENANT_ADMIN', 'MEMBER', 'VIEWER']}
 *   onVisibilityChange={handleColumnVisibilityChange}
 *   onGlobalChange={handleColumnGlobalChange}
 * />
 * ```
 */
export function ColumnConfigTable({
  columns,
  overrides,
  roles = [...LAYOUT_ROLE_KEYS],
  onVisibilityChange,
  onGlobalChange,
  disabled = false,
}: ColumnConfigTableProps) {
  return (
    <div
      role="grid"
      aria-label="Column configuration"
      aria-busy={disabled ? 'true' : 'false'}
      className="w-full overflow-x-auto"
      data-testid="column-config-table"
    >
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr role="row" className="bg-muted text-muted-foreground">
            <th role="columnheader" scope="col" className="px-3 py-2 text-left font-medium">
              Column
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
          {columns.map((col) => {
            const override = getOverride(overrides, col.columnId);

            return (
              <tr
                key={col.columnId}
                role="row"
                className="border-b border-border hover:bg-muted/30 transition-colors"
                data-testid={`column-row-${col.columnId}`}
              >
                {/* Column name */}
                <td role="rowheader" className="px-3 py-2 font-medium whitespace-nowrap">
                  {col.label}
                </td>

                {/* Per-role visibility toggles (column mode: 2-state) */}
                {roles.map((role) => (
                  <td key={role} role="gridcell" className="px-2 py-1 text-center">
                    <VisibilityToggle
                      mode="column"
                      value={getRoleVisibility(override, role)}
                      onChange={(next) => onVisibilityChange(col.columnId, role, next)}
                      columnLabel={col.label}
                      roleLabel={role}
                      disabled={disabled}
                    />
                  </td>
                ))}

                {/* Global visibility select */}
                <td role="gridcell" className="px-3 py-1 text-center">
                  <Select
                    value={override.globalVisibility}
                    onValueChange={(val) => onGlobalChange(col.columnId, val as ColumnVisibility)}
                    disabled={disabled}
                    aria-label={`${col.label} global visibility`}
                  >
                    <option value="visible">visible</option>
                    <option value="hidden">hidden</option>
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-2 px-3 py-1.5 text-xs text-muted-foreground flex flex-wrap gap-3">
        <span className="flex items-center gap-1">
          <span className="text-green-600 font-medium">✓</span> visible
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-600 font-medium">✗</span> hidden
        </span>
      </div>
    </div>
  );
}
