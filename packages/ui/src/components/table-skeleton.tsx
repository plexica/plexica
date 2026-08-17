// table-skeleton.tsx
// Generic table-shaped loading skeleton: bordered container, optional header
// row, and N body rows of pulsing cells sized per column.
// Replaces the per-table skeleton duplicates previously inlined in each app.
// Respects prefers-reduced-motion. Hidden from screen readers (aria-hidden).

import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface TableSkeletonProps {
  /** Tailwind width class per column (e.g. 'w-40', 'flex-1'). */
  columnWidths: string[];
  /** Number of body rows. Default 5. */
  rows?: number | undefined;
  /** Render a header row (bg-neutral-50) using the same column widths. */
  showHeader?: boolean | undefined;
  /** Override body cell classes (default 'h-4 bg-neutral-200'). */
  cellClassName?: string | undefined;
}

export function TableSkeleton({
  columnWidths,
  rows = 5,
  showHeader = false,
  cellClassName,
}: TableSkeletonProps): React.JSX.Element {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-lg border border-neutral-200">
      {showHeader && (
        <div className="flex gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          {columnWidths.map((width, i) => (
            <div key={i} className={cn('h-3 rounded bg-neutral-200', width)} />
          ))}
        </div>
      )}
      <div className="divide-y divide-neutral-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex animate-pulse gap-4 px-4 py-3 motion-reduce:animate-none"
          >
            {columnWidths.map((width, colIndex) => (
              <div
                key={colIndex}
                className={cn('h-4 rounded bg-neutral-200', cellClassName, width)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
