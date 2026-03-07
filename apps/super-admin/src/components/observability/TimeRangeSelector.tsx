// File: apps/super-admin/src/components/observability/TimeRangeSelector.tsx
//
// Preset time-range picker used by the Metrics tab.
// Emits { start, end } strings (RFC3339) on change.
//
// Spec 012 — T012-30

import { useCallback, useMemo } from 'react';

export interface TimeRange {
  start: string; // RFC3339
  end: string; // RFC3339
  label: string;
}

const PRESETS: Array<{ label: string; minutes: number }> = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

function toRFC3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildTimeRange(minutes: number): TimeRange {
  const now = new Date();
  const start = new Date(now.getTime() - minutes * 60 * 1000);
  return {
    start: toRFC3339(start),
    end: toRFC3339(now),
    label: PRESETS.find((p) => p.minutes === minutes)?.label ?? `${minutes}m`,
  };
}

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const activeMinutes = useMemo(() => {
    const end = new Date(value.end).getTime();
    const start = new Date(value.start).getTime();
    return Math.round((end - start) / 60000);
  }, [value.start, value.end]);

  const handleSelect = useCallback(
    (minutes: number) => {
      onChange(buildTimeRange(minutes));
    },
    [onChange]
  );

  return (
    <div role="group" aria-label="Select time range" className="flex items-center gap-1">
      {PRESETS.map((preset) => {
        const isActive = activeMinutes === preset.minutes;
        return (
          <button
            key={preset.label}
            onClick={() => handleSelect(preset.minutes)}
            aria-pressed={isActive}
            className={[
              'px-3 py-1 rounded text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            ].join(' ')}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
