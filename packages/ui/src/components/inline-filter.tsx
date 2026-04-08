// inline-filter.tsx — InlineFilter component
// Horizontal filter bar supporting text, select, and date-range filter types

import * as React from 'react';

import { Input } from './input.js';
import { Select } from './select.js';
import { DateRangePicker } from './date-range-picker.js';

export type FilterType = 'text' | 'select' | 'date-range';

export interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  options?: Array<{ value: string; label: string }>;
}

export interface FilterValues {
  [key: string]: string | { from?: string; to?: string } | undefined;
}

export interface InlineFilterProps {
  filters: FilterDef[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}

export function InlineFilter({ filters, values, onChange }: InlineFilterProps): React.JSX.Element {
  function updateValue(key: string, value: FilterValues[string]): void {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filters">
      {filters.map((filter) => {
        if (filter.type === 'text') {
          return (
            <div key={filter.key} className="min-w-[160px]">
              <Input
                label={filter.label}
                value={(values[filter.key] as string | undefined) ?? ''}
                onChange={(e) => {
                  updateValue(filter.key, e.target.value || undefined);
                }}
                placeholder={filter.label}
              />
            </div>
          );
        }

        if (filter.type === 'select') {
          const opts = filter.options ?? [];
          return (
            <div key={filter.key} className="min-w-[160px] flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">{filter.label}</span>
              <Select
                options={opts}
                {...(typeof values[filter.key] === 'string'
                  ? { value: values[filter.key] as string }
                  : {})}
                onValueChange={(val) => {
                  updateValue(filter.key, val);
                }}
                placeholder={filter.label}
                aria-label={filter.label}
              />
            </div>
          );
        }

        if (filter.type === 'date-range') {
          const rangeVal = (values[filter.key] as { from?: string; to?: string } | undefined) ?? {};
          const rangeProps: { from?: string; to?: string } = {};
          if (rangeVal.from !== undefined) rangeProps.from = rangeVal.from;
          if (rangeVal.to !== undefined) rangeProps.to = rangeVal.to;
          return (
            <div key={filter.key}>
              <DateRangePicker
                label={filter.label}
                {...rangeProps}
                onChange={(from, to) => {
                  const next: { from?: string; to?: string } = {};
                  if (from !== undefined) next.from = from;
                  if (to !== undefined) next.to = to;
                  updateValue(filter.key, next);
                }}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
