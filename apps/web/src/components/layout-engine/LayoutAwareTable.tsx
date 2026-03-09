// File: apps/web/src/components/layout-engine/LayoutAwareTable.tsx
//
// T014-16 — Table wrapper component applying layout engine column filtering.
// Spec 014 Frontend Layout Engine — FR-026, FR-005, FR-008, NFR-008.
//
// This component:
//   1. Fetches the resolved layout via `useResolvedLayout` hook
//   2. Filters columns based on resolved column visibility
//   3. Reorders columns based on configured column order
//   4. Passes filtered/ordered columns + data to the underlying DataTable
//   5. Shows skeleton during loading
//   6. Shows empty state when all columns are hidden for the user's role
//   7. Falls back to all manifest columns on error (fail-open, NFR-008)
//
// Column matching: columns passed via `columns` prop are matched to resolved
// layout columns by the `accessorKey` or `id` field of the ColumnDef.
// The layout engine uses `columnId` which should match one of these.

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { EyeOff } from 'lucide-react';
import { DataTable, EmptyState, Skeleton } from '@plexica/ui';
import { useResolvedLayout } from '@/hooks/useResolvedLayout';
import type { ResolvedColumn } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

// Extract DataTable props (minus columns and data which we handle ourselves)
// We use a permissive interface to allow all DataTable pass-through props.
export interface LayoutAwareTableProps<TData, TValue = unknown> {
  /**
   * The form identifier matching the plugin manifest `formId`.
   * The layout engine stores column configs keyed by this same `formId`.
   */
  formId: string;
  /**
   * Optional workspace UUID for workspace-scope resolution.
   * When omitted, tenant-scope config is used.
   */
  workspaceId?: string;
  /**
   * Full column definitions from the plugin. These are filtered/reordered
   * based on the resolved layout config before being passed to DataTable.
   *
   * Each column definition MUST have either an `accessorKey` or `id` that
   * matches the `columnId` from the plugin manifest. This is how the layout
   * engine identifies which columns to show/hide/reorder.
   */
  columns: ColumnDef<TData, TValue>[];
  /**
   * Table data rows.
   */
  data: TData[];
  /**
   * Optional aria-label for the table. Defaults to "Data table".
   */
  'aria-label'?: string;
  /**
   * Enable column sorting in the underlying DataTable.
   */
  enableSorting?: boolean;
  /**
   * Enable pagination in the underlying DataTable.
   */
  enablePagination?: boolean;
  /**
   * Optional CSS class for the wrapper element.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the column identifier from a ColumnDef.
 * Prefers `accessorKey` over `id` since most plugin columns use accessorKey.
 */
function getColumnId<TData, TValue>(col: ColumnDef<TData, TValue>): string | undefined {
  if ('accessorKey' in col && typeof col.accessorKey === 'string') {
    return col.accessorKey;
  }
  return col.id;
}

/**
 * Returns true if ALL resolved columns are hidden.
 */
function allColumnsHidden(columns: ResolvedColumn[]): boolean {
  return columns.length > 0 && columns.every((c) => c.visibility === 'hidden');
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton({
  columnCount = 4,
  className = '',
}: {
  columnCount?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading table"
      className={`space-y-2 ${className}`}
      data-testid="layout-aware-table-skeleton"
    >
      {/* Header row skeleton */}
      <div className="flex gap-4">
        {Array.from({ length: columnCount }).map((_, i) => (
          <Skeleton key={i} shape="line" width={`${100 / columnCount}%`} height="20px" />
        ))}
      </div>
      {/* Data rows skeleton */}
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: columnCount }).map((_, colIdx) => (
            <Skeleton key={colIdx} shape="line" width={`${100 / columnCount}%`} height="16px" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state (all columns hidden)
// ---------------------------------------------------------------------------

function AllColumnsHiddenEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="No columns are visible for your role"
      data-testid="layout-aware-table-empty"
    >
      <EmptyState
        icon={<EyeOff size={48} aria-hidden="true" className="text-muted-foreground" />}
        title="No Columns Visible"
        description="No columns are visible for your role. Contact your administrator if you need access to this view."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Table wrapper that applies layout engine column filtering and ordering.
 *
 * Usage:
 * ```tsx
 * <LayoutAwareTable
 *   formId="crm-contact-form"
 *   workspaceId={workspaceId}
 *   columns={contactColumns}
 *   data={contacts}
 *   aria-label="Contacts list"
 *   enableSorting
 *   enablePagination
 * />
 * ```
 *
 * Column definitions must use `accessorKey` or `id` matching the manifest `columnId`.
 */
export function LayoutAwareTable<TData, TValue = unknown>({
  formId,
  workspaceId,
  columns,
  data,
  'aria-label': ariaLabel = 'Data table',
  enableSorting,
  enablePagination,
  className = '',
}: LayoutAwareTableProps<TData, TValue>) {
  const { data: resolvedLayout, isLoading } = useResolvedLayout({ formId, workspaceId });

  // --- Loading state ---
  if (isLoading) {
    return <TableSkeleton columnCount={columns.length} className={className} />;
  }

  // --- Fail-open: no resolved layout → render with all columns in original order ---
  if (!resolvedLayout) {
    return (
      <div aria-busy="false" className={className} data-testid="layout-aware-table-fallback">
        <DataTable
          columns={columns}
          data={data}
          enableSorting={enableSorting}
          enablePagination={enablePagination}
        />
      </div>
    );
  }

  // --- All columns hidden for this role ---
  if (allColumnsHidden(resolvedLayout.columns)) {
    return <AllColumnsHiddenEmptyState />;
  }

  // Build a map from columnId → resolved column for O(1) lookup
  const resolvedMap = new Map<string, ResolvedColumn>(
    resolvedLayout.columns.map((c) => [c.columnId, c])
  );

  // Build an order map from columnId → index (position in resolved columns array)
  // We preserve the ordering from resolvedLayout.columns array (already sorted server-side).
  const orderMap = new Map<string, number>();
  resolvedLayout.columns.forEach((c, idx) => {
    orderMap.set(c.columnId, idx);
  });

  // Filter out hidden columns, then sort by resolved order
  const filteredColumns = columns
    .filter((col) => {
      const colId = getColumnId(col);
      if (!colId) return true; // Unknown column → keep (fail-open)
      const resolved = resolvedMap.get(colId);
      if (!resolved) return true; // Not in layout config → keep (fail-open for new manifest fields)
      return resolved.visibility !== 'hidden';
    })
    .sort((a, b) => {
      const aId = getColumnId(a);
      const bId = getColumnId(b);
      const aOrder =
        aId !== undefined
          ? (orderMap.get(aId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      const bOrder =
        bId !== undefined
          ? (orderMap.get(bId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });

  return (
    <div
      aria-busy="false"
      aria-label={ariaLabel}
      className={className}
      data-testid="layout-aware-table"
    >
      <DataTable
        columns={filteredColumns}
        data={data}
        enableSorting={enableSorting}
        enablePagination={enablePagination}
      />
    </div>
  );
}
