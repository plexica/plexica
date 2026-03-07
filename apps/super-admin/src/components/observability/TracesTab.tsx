// File: apps/super-admin/src/components/observability/TracesTab.tsx
//
// Traces tab for the Observability dashboard.
// Composed of:
//   TraceSearchForm   — service / traceId / time-range / limit inputs
//   TraceResultsTable — paginated, status badge (colour + icon), click-to-waterfall
//   SpanWaterfall     — shown in adjacent panel once a trace row is selected
//
// WCAG 2.1 AA:
//   - All form inputs have associated <label> elements (4.1.2)
//   - Status badge uses colour + icon (not colour-only, 1.4.1)
//   - Selected trace opens SpanWaterfall in a landmark region below the table
//   - Keyboard focus moves to SpanWaterfall heading when a trace is selected
//
// Spec 012 — T012-31

import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle, XCircle, Minus, Search } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { useTraces } from '@/hooks/useObservability';
import { TimeRangeSelector, buildTimeRange } from './TimeRangeSelector';
import type { TimeRange } from './TimeRangeSelector';
import type { TraceResult } from '@/api/observability';

// Lazy-load SpanWaterfall to keep the initial Traces tab chunk smaller
const SpanWaterfall = React.lazy(() => import('./SpanWaterfall'));

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type TraceStatus = 'ok' | 'error' | 'unset';

function StatusBadge({ status }: { status: TraceStatus }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
        <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
        OK
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      Unset
    </span>
  );
}

// ---------------------------------------------------------------------------
// TraceSearchForm
// ---------------------------------------------------------------------------

interface SearchFormValues {
  service: string;
  traceId: string;
  timeRange: TimeRange;
  limit: number;
}

const DEFAULT_LIMIT = 20;

function TraceSearchForm({
  values,
  onChange,
  onSearch,
  isLoading,
}: {
  values: SearchFormValues;
  onChange: (partial: Partial<SearchFormValues>) => void;
  onSearch: () => void;
  isLoading: boolean;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Search Traces</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3" role="search">
          {/* Service filter */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="trace-service" className="text-xs font-medium text-muted-foreground">
              Service
            </label>
            <input
              id="trace-service"
              type="text"
              placeholder="e.g. my-plugin"
              value={values.service}
              onChange={(e) => onChange({ service: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Trace ID filter */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label htmlFor="trace-id" className="text-xs font-medium text-muted-foreground">
              Trace ID
            </label>
            <input
              id="trace-id"
              type="text"
              placeholder="Exact trace ID"
              value={values.traceId}
              onChange={(e) => onChange({ traceId: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Time range */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground" id="trace-time-label">
              Time Range
            </span>
            <div aria-labelledby="trace-time-label">
              <TimeRangeSelector
                value={values.timeRange}
                onChange={(tr) => onChange({ timeRange: tr })}
              />
            </div>
          </div>

          {/* Limit */}
          <div className="flex flex-col gap-1 w-20">
            <label htmlFor="trace-limit" className="text-xs font-medium text-muted-foreground">
              Limit
            </label>
            <select
              id="trace-limit"
              value={values.limit}
              onChange={(e) => onChange({ limit: Number(e.target.value) })}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            size="sm"
            className="h-8 self-end"
            disabled={isLoading}
            aria-label="Search traces"
          >
            <Search className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Search
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TraceResultsTable
// ---------------------------------------------------------------------------

function TraceResultsTable({
  traces,
  isLoading,
  selectedTraceId,
  onSelect,
}: {
  traces: TraceResult[];
  isLoading: boolean;
  selectedTraceId: string | null;
  onSelect: (traceId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading traces…">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No traces found for the selected filters. Try broadening the time range or removing filters.
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Trace results">
            <thead className="border-b bg-muted/40">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Trace ID
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Root Span
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Service
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"
                >
                  Duration (ms)
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Spans
                </th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => {
                const isSelected = trace.traceId === selectedTraceId;
                return (
                  <tr
                    key={trace.traceId}
                    onClick={() => onSelect(trace.traceId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(trace.traceId);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`View trace ${trace.traceId}`}
                    className={[
                      'border-b last:border-0 cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {trace.traceId.slice(0, 16)}…
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{trace.rootSpanName}</td>
                    <td className="px-4 py-3">{trace.serviceName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trace.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{trace.durationMs}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{trace.spanCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TracesTab
// ---------------------------------------------------------------------------

export default function TracesTab() {
  const [formValues, setFormValues] = useState<SearchFormValues>({
    service: '',
    traceId: '',
    timeRange: buildTimeRange(60),
    limit: DEFAULT_LIMIT,
  });

  // Only submit when the user clicks Search — not on every keystroke
  const [submittedParams, setSubmittedParams] = useState<typeof formValues | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const waterfallRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError, error } = useTraces(
    submittedParams
      ? {
          start: submittedParams.timeRange.start,
          end: submittedParams.timeRange.end,
          service: submittedParams.service || undefined,
          traceId: submittedParams.traceId || undefined,
          limit: submittedParams.limit,
        }
      : // Provide a dummy disabled query when nothing has been submitted yet
        { start: '', end: '' }
  );

  const handleSearch = useCallback(() => {
    setSubmittedParams({ ...formValues });
    setSelectedTraceId(null);
  }, [formValues]);

  const handleTraceSelect = useCallback((traceId: string) => {
    setSelectedTraceId(traceId);
    // Move focus to waterfall heading for keyboard users
    requestAnimationFrame(() => {
      waterfallRef.current?.focus();
    });
  }, []);

  const traces = data?.traces ?? [];

  return (
    <div className="space-y-4">
      <TraceSearchForm
        values={formValues}
        onChange={(partial) => setFormValues((v) => ({ ...v, ...partial }))}
        onSearch={handleSearch}
        isLoading={isLoading}
      />

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Failed to load traces: {error?.message ?? 'Unknown error'}
        </div>
      )}

      {/* Results — only render after first search */}
      {submittedParams !== null && !isError && (
        <TraceResultsTable
          traces={traces}
          isLoading={isLoading}
          selectedTraceId={selectedTraceId}
          onSelect={handleTraceSelect}
        />
      )}

      {/* Waterfall detail — shown when a trace is selected */}
      {selectedTraceId && (
        <section aria-label="Trace detail" aria-live="polite">
          <React.Suspense
            fallback={
              <div className="space-y-2" aria-busy="true" aria-label="Loading trace detail…">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-40 w-full" />
              </div>
            }
          >
            <SpanWaterfall traceId={selectedTraceId} ref={waterfallRef} />
          </React.Suspense>
        </section>
      )}
    </div>
  );
}
