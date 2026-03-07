// File: apps/super-admin/src/components/observability/AccessibleChartToggle.tsx
//
// Toggle that switches a chart panel between the recharts SVG view and an
// equivalent HTML <table> fallback for screen readers (ADR-029 requirement).
//
// WCAG:
//   - aria-pressed on toggle button
//   - Table is always rendered in the DOM (just visually hidden when chart
//     is active) so screen readers can always access the data.
//
// Spec 012 — T012-30

import { BarChart2, Table } from 'lucide-react';

export interface AccessibleChartToggleProps {
  /** Whether the data table is currently shown */
  showTable: boolean;
  onToggle: () => void;
}

export function AccessibleChartToggle({ showTable, onToggle }: AccessibleChartToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={showTable}
      aria-label={showTable ? 'Switch to chart view' : 'Switch to table view'}
      className={[
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        showTable
          ? 'bg-muted text-foreground'
          : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {showTable ? (
        <>
          <BarChart2 className="h-3.5 w-3.5" aria-hidden="true" />
          Chart
        </>
      ) : (
        <>
          <Table className="h-3.5 w-3.5" aria-hidden="true" />
          Table
        </>
      )}
    </button>
  );
}
