// pagination.tsx — Pagination component
// Prev/Next + current page indicator
// WCAG 2.1 AA: keyboard accessible, aria-labels, aria-disabled

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/cn.js';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
}: PaginationProps): React.JSX.Element {
  const isPrevDisabled = disabled || page <= 1;
  const isNextDisabled = disabled || page >= totalPages;

  const btnClass = cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm',
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
    'hover:bg-neutral-50'
  );

  return (
    <nav aria-label="Pagination" className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          onPageChange(page - 1);
        }}
        disabled={isPrevDisabled}
        aria-label="Previous page"
        aria-disabled={isPrevDisabled}
        className={cn(btnClass, isPrevDisabled && 'cursor-not-allowed opacity-50')}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      <span className="text-sm text-neutral-700" aria-live="polite" aria-atomic="true">
        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
      </span>

      <button
        type="button"
        onClick={() => {
          onPageChange(page + 1);
        }}
        disabled={isNextDisabled}
        aria-label="Next page"
        aria-disabled={isNextDisabled}
        className={cn(btnClass, isNextDisabled && 'cursor-not-allowed opacity-50')}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
