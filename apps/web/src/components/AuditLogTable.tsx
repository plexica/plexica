// apps/web/src/components/AuditLogTable.tsx
//
// T008-58: Reusable audit log table component.
// Used by Tenant Admin (apps/web) and Super Admin (apps/super-admin).
//
// Features:
//  - Column set: Timestamp, Action, Resource Type, Resource ID, User ID,
//    Tenant ID (opt-in via showTenantColumn), IP Address
//  - Loading state: 5 animated skeleton rows
//  - Empty state: ScrollText icon + message
//  - Pagination nav with First/Prev/Next/Last controls
//  - WCAG 2.1 AA: role="table", <th scope="col">, aria-current, aria-label

import { ScrollText, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@plexica/ui';
import { Button } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Types (exported so consumers can import them)
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditLogTableProps {
  entries: AuditLogEntry[];
  isLoading?: boolean;
  meta?: AuditLogMeta;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  /** When true, shows the Tenant ID column (for Super Admin global view). */
  showTenantColumn?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(value: string | undefined, len = 12): string {
  if (!value) return '—';
  return value.length > len ? `${value.slice(0, len)}…` : value;
}

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

const SKELETON_ROW_COUNT = 5;

interface SkeletonRowsProps {
  colCount: number;
}

function SkeletonRows({ colCount }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: colCount }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton shape="line" height={16} width={j === 0 ? 120 : 80} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ colCount }: { colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount} className="px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ScrollText className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">No audit log entries found</p>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Pagination nav
// ---------------------------------------------------------------------------

interface PaginationNavProps {
  meta: AuditLogMeta;
  currentPage: number;
  onPageChange: (page: number) => void;
}

function PaginationNav({ meta, currentPage, onPageChange }: PaginationNavProps) {
  const { limit, total, totalPages } = meta;
  const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav
      aria-label="Audit log pagination"
      className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground"
    >
      <span>{total === 0 ? 'No entries' : `Showing ${start}–${end} of ${total} entries`}</span>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={isFirst}
          aria-label="First page"
        >
          <ChevronFirst className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isFirst}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        <span
          aria-current="page"
          aria-label={`Page ${currentPage} of ${totalPages}`}
          className="px-2 py-1 text-xs text-foreground font-medium select-none"
        >
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isLast}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={isLast}
          aria-label="Last page"
        >
          <ChevronLast className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// AuditLogTable
// ---------------------------------------------------------------------------

export function AuditLogTable({
  entries,
  isLoading = false,
  meta,
  onPageChange,
  currentPage = 1,
  showTenantColumn = false,
}: AuditLogTableProps) {
  const baseColumns = [
    'Timestamp',
    'Action',
    'Resource Type',
    'Resource ID',
    'User ID',
    'IP Address',
  ];

  // Insert Tenant ID after User ID when showTenantColumn is true
  const columns = showTenantColumn
    ? ['Timestamp', 'Action', 'Resource Type', 'Resource ID', 'User ID', 'Tenant ID', 'IP Address']
    : baseColumns;

  const colCount = columns.length;

  return (
    <div className="w-full rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table role="table" className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {isLoading ? (
              <SkeletonRows colCount={colCount} />
            ) : entries.length === 0 ? (
              <EmptyState colCount={colCount} />
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-foreground font-mono text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">{entry.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.resourceType ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {truncate(entry.resourceId)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {truncate(entry.userId)}
                  </td>
                  {showTenantColumn && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {truncate(entry.tenantId)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {entry.ipAddress ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta && onPageChange && (
        <PaginationNav meta={meta} currentPage={currentPage} onPageChange={onPageChange} />
      )}
    </div>
  );
}
