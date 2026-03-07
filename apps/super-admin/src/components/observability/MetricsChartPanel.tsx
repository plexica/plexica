// File: apps/super-admin/src/components/observability/MetricsChartPanel.tsx
//
// Renders a recharts LineChart for a single PromQL range-query result.
// Includes an AccessibleChartToggle that switches to an HTML data table.
//
// WCAG 2.1 AA:
//   - SVG chart has aria-label describing its content
//   - Lines are distinguished by colour AND dash pattern (WCAG 1.4.1)
//   - HTML data table is always in the DOM (visible when table mode is on)
//   - aria-hidden on chart when table is shown; aria-hidden on table otherwise
//
// Spec 012 — T012-30

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@plexica/ui';
import { AccessibleChartToggle } from './AccessibleChartToggle';
import type { MetricSeries } from '@/api/observability';

// ---------------------------------------------------------------------------
// Line colours + dash patterns (WCAG 1.4.1 — not colour-only)
// ---------------------------------------------------------------------------

const LINE_STYLES = [
  { stroke: '#2563eb', strokeDasharray: undefined }, // solid blue
  { stroke: '#16a34a', strokeDasharray: '6 3' }, // dashed green
  { stroke: '#dc2626', strokeDasharray: '2 4' }, // dotted red
  { stroke: '#9333ea', strokeDasharray: '10 4 2 4' }, // dash-dot purple
  { stroke: '#d97706', strokeDasharray: '8 3 2 3 2 3' }, // complex amber
];

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

interface ChartRow {
  time: string;
  [seriesLabel: string]: string | number;
}

function buildChartData(series: MetricSeries[]): ChartRow[] {
  if (!series.length) return [];

  // Collect all unique timestamps
  const timestamps = new Set<string>();
  for (const s of series) {
    for (const pt of s.values) timestamps.add(pt.timestamp);
  }
  const sortedTimestamps = [...timestamps].sort();

  // Build per-timestamp rows
  return sortedTimestamps.map((ts) => {
    const row: ChartRow = { time: formatTimestamp(ts) };
    for (const s of series) {
      const label = seriesLabel(s);
      const pt = s.values.find((v) => v.timestamp === ts);
      if (pt !== undefined) row[label] = pt.value;
    }
    return row;
  });
}

function seriesLabel(s: MetricSeries): string {
  const entries = Object.entries(s.metric).filter(([k]) => k !== '__name__');
  if (!entries.length) return s.metric['__name__'] ?? 'series';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// MetricsChartPanel
// ---------------------------------------------------------------------------

export interface MetricsChartPanelProps {
  title: string;
  series: MetricSeries[];
  unit?: string; // e.g. 'ms', 'req/s', '%'
  isLoading?: boolean;
}

export function MetricsChartPanel({
  title,
  series,
  unit = '',
  isLoading = false,
}: MetricsChartPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const chartData = buildChartData(series);
  const seriesKeys = series.map(seriesLabel);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <AccessibleChartToggle showTable={showTable} onToggle={() => setShowTable((p) => !p)} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            className="h-48 flex items-center justify-center text-muted-foreground text-sm"
            aria-busy="true"
          >
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No data for the selected time range.
          </div>
        ) : (
          <>
            {/* Chart view */}
            <div aria-hidden={showTable} className={showTable ? 'sr-only' : ''}>
              <ResponsiveContainer width="100%" height={192}>
                <LineChart data={chartData} aria-label={`${title} chart`} role="img">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => (unit ? `${v}${unit}` : String(v))}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      unit ? `${value.toFixed(2)}${unit}` : value.toFixed(2)
                    }
                  />
                  <Legend />
                  {seriesKeys.map((key, i) => {
                    const style = LINE_STYLES[i % LINE_STYLES.length];
                    return (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={style.stroke}
                        strokeDasharray={style.strokeDasharray}
                        dot={false}
                        strokeWidth={2}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Table fallback — always in DOM for a11y */}
            <div aria-hidden={!showTable} className={!showTable ? 'sr-only' : 'overflow-x-auto'}>
              <table className="w-full text-xs" aria-label={`${title} data table`}>
                <thead className="border-b">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left font-medium">
                      Time
                    </th>
                    {seriesKeys.map((k) => (
                      <th key={k} scope="col" className="px-2 py-1 text-left font-medium">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr key={row.time} className="border-b last:border-0">
                      <td className="px-2 py-1 tabular-nums">{row.time}</td>
                      {seriesKeys.map((k) => (
                        <td key={k} className="px-2 py-1 tabular-nums">
                          {row[k] !== undefined ? `${(row[k] as number).toFixed(2)}${unit}` : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
