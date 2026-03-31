// table.tsx — Table component with semantic HTML and sortable header visuals
// WCAG 2.1 AA: proper th scope, keyboard-accessible sort indicators

import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

import { cn } from '../lib/cn.js';

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="w-full overflow-auto rounded-lg border border-neutral-200">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-neutral-50 border-b border-neutral-200', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('divide-y divide-neutral-100', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('hover:bg-neutral-50 transition-colors', className)} {...props} />
));
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | 'none';
}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, sortable = false, sortDirection = 'none', children, ...props }, ref) => (
    <th
      ref={ref}
      scope="col"
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider',
        sortable && 'cursor-pointer select-none',
        className
      )}
      aria-sort={
        sortable
          ? sortDirection === 'asc' ? 'ascending'
          : sortDirection === 'desc' ? 'descending'
          : 'none'
          : undefined
      }
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && (
          <span aria-hidden="true">
            {sortDirection === 'asc' && <ChevronUp className="h-3 w-3" />}
            {sortDirection === 'desc' && <ChevronDown className="h-3 w-3" />}
            {sortDirection === 'none' && <ChevronsUpDown className="h-3 w-3 opacity-50" />}
          </span>
        )}
      </span>
    </th>
  )
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-4 py-3 text-neutral-700', className)} {...props} />
));
TableCell.displayName = 'TableCell';
