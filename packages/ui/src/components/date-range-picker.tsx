// date-range-picker.tsx — DateRangePicker component
// Simple two-input date range using native <input type="date">
// WCAG 2.1 AA: aria-labels for from/to inputs

import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  label?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  label,
  disabled = false,
}: DateRangePickerProps): React.JSX.Element {
  const inputClass = cn(
    'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
    disabled && 'cursor-not-allowed opacity-50'
  );

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value || undefined;
    onChange(value, to);
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value || undefined;
    onChange(from, value);
  }

  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && <span className="text-sm font-medium text-neutral-700">{label}</span>}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from ?? ''}
          max={to}
          onChange={handleFromChange}
          disabled={disabled}
          aria-label="From date"
          className={inputClass}
        />
        <span className="text-sm text-neutral-500" aria-hidden="true">
          —
        </span>
        <input
          type="date"
          value={to ?? ''}
          min={from}
          onChange={handleToChange}
          disabled={disabled}
          aria-label="To date"
          className={inputClass}
        />
      </div>
    </div>
  );
}
