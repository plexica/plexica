// File: apps/super-admin/src/components/observability/SpanWaterfall.tsx
//
// Hierarchical span timeline for a single trace.
//
// Layout:
//   - Left column (40%): indented span tree (operation name + service)
//   - Right column (60%): proportional duration bar on a shared time axis
//
// WCAG 2.1 AA:
//   - role="tree" / role="treeitem" on the hierarchy (WCAG 1.3.1)
//   - Arrow key navigation between span rows (2.1.1)
//   - Error spans labelled aria-label="Error span: <name>" (1.3.3)
//   - Colour + icon for status (not colour-only, 1.4.1)
//   - Mobile: outer div is horizontally scrollable (NFR-018)
//
// SpanDetailPanel is rendered below the waterfall and shows the full
// attributes for the selected span (role="complementary").
//
// Spec 012 — T012-32

import React, { forwardRef, useCallback, useId, useMemo, useState } from 'react';
import { CheckCircle, XCircle, Minus, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { useTraceDetail } from '@/hooks/useObservability';
import type { Span, TraceDetailResponse } from '@/api/observability';

// ---------------------------------------------------------------------------
// Span tree builder — flat list → tree by parentSpanId
// ---------------------------------------------------------------------------

interface SpanNode {
  span: Span;
  depth: number;
  children: SpanNode[];
}

function buildSpanTree(spans: Span[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  for (const span of spans) {
    map.set(span.spanId, { span, depth: 0, children: [] });
  }

  for (const span of spans) {
    const node = map.get(span.spanId)!;
    if (span.parentSpanId && map.has(span.parentSpanId)) {
      const parent = map.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Flatten to ordered list for rendering (DFS)
  const result: SpanNode[] = [];
  function dfs(node: SpanNode) {
    result.push(node);
    node.children.forEach(dfs);
  }
  roots.forEach(dfs);

  return result;
}

// ---------------------------------------------------------------------------
// Time axis calculations
// ---------------------------------------------------------------------------

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function spanOffset(span: Span, traceStart: number, traceDuration: number): number {
  const spanStart = new Date(span.startTime).getTime() - traceStart;
  return pct(spanStart, traceDuration);
}

function spanWidth(span: Span, traceDuration: number): number {
  return Math.max(0.5, pct(span.durationMs, traceDuration));
}

// ---------------------------------------------------------------------------
// SpanStatusIcon
// ---------------------------------------------------------------------------

function SpanStatusIcon({ status }: { status: Span['status'] }) {
  if (status === 'ok')
    return <CheckCircle className="h-3 w-3 text-green-600 shrink-0" aria-hidden="true" />;
  if (status === 'error')
    return <XCircle className="h-3 w-3 text-destructive shrink-0" aria-hidden="true" />;
  return <Minus className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// SpanRow
// ---------------------------------------------------------------------------

const BAR_COLORS: Record<Span['status'], string> = {
  ok: 'bg-primary/60',
  error: 'bg-destructive/70',
  unset: 'bg-muted-foreground/40',
};

function SpanRow({
  node,
  traceStart,
  traceDuration,
  isSelected,
  onSelect,
  onKeyDown,
  rowIndex,
  totalRows,
  labelledById,
}: {
  node: SpanNode;
  traceStart: number;
  traceDuration: number;
  isSelected: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  rowIndex: number;
  totalRows: number;
  labelledById: string;
}) {
  const { span, depth } = node;
  const offsetPct = spanOffset(span, traceStart, traceDuration);
  const widthPct = spanWidth(span, traceDuration);
  const isError = span.status === 'error';

  const ariaLabel = isError
    ? `Error span: ${span.operationName} — ${span.durationMs}ms`
    : `${span.operationName} — ${span.durationMs}ms`;

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-label={ariaLabel}
      aria-setsize={totalRows}
      aria-posinset={rowIndex + 1}
      tabIndex={isSelected ? 0 : -1}
      id={`${labelledById}-row-${rowIndex}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={[
        'flex items-stretch border-b last:border-0 cursor-pointer transition-colors min-h-[36px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        isSelected ? 'bg-primary/5' : 'hover:bg-muted/20',
      ].join(' ')}
    >
      {/* Left: span name (40% width) */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 text-xs shrink-0 overflow-hidden"
        style={{ width: '40%', paddingLeft: `${8 + depth * 16}px` }}
      >
        <SpanStatusIcon status={span.status} />
        <span className="truncate font-mono">{span.operationName}</span>
        <span className="text-muted-foreground shrink-0">{span.durationMs}ms</span>
      </div>

      {/* Right: duration bar (60% width) */}
      <div className="relative flex-1 flex items-center py-1.5 overflow-hidden">
        <div
          className={`absolute h-4 rounded-sm ${BAR_COLORS[span.status]}`}
          style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpanDetailPanel
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : `Copy ${value}`}
      className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

function SpanDetailPanel({ span }: { span: Span }) {
  const entries = Object.entries(span.attributes);

  return (
    <section
      role="complementary"
      aria-label={`Span detail: ${span.operationName}`}
      className="mt-4"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Span Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* IDs */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <span className="text-muted-foreground">Span ID</span>
            <span className="flex items-center">
              {span.spanId}
              <CopyButton value={span.spanId} />
            </span>
            {span.parentSpanId && (
              <>
                <span className="text-muted-foreground">Parent ID</span>
                <span className="flex items-center">
                  {span.parentSpanId}
                  <CopyButton value={span.parentSpanId} />
                </span>
              </>
            )}
            <span className="text-muted-foreground">Service</span>
            <span>{span.serviceName}</span>
            <span className="text-muted-foreground">Duration</span>
            <span>{span.durationMs} ms</span>
            <span className="text-muted-foreground">Status</span>
            <span>{span.status}</span>
          </div>

          {/* Attributes */}
          {entries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Attributes</p>
              <div className="rounded-md border bg-muted/30 divide-y text-xs font-mono">
                {entries.map(([key, val]) => (
                  <div key={key} className="flex px-3 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-40 truncate">{key}</span>
                    <span className="truncate">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          {span.events.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Events ({span.events.length})
              </p>
              <div className="space-y-1">
                {span.events.map((evt, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="font-medium">{evt.name}</span>
                    <span className="ml-2 text-muted-foreground font-mono">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SpanWaterfall (exported, forwardRef for focus management)
// ---------------------------------------------------------------------------

interface SpanWaterfallProps {
  traceId: string;
}

const SpanWaterfall = forwardRef<HTMLDivElement, SpanWaterfallProps>(function SpanWaterfall(
  { traceId },
  ref
) {
  const { data, isLoading, isError, error } = useTraceDetail(traceId);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const treeId = useId();

  // Build flat ordered node list
  const nodes: SpanNode[] = useMemo(() => (data ? buildSpanTree(data.spans) : []), [data]);
  const traceStartMs = data
    ? Math.min(...data.spans.map((s) => new Date(s.startTime).getTime()))
    : 0;
  const traceDurationMs = data?.durationMs ?? 1;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowDown') nextIndex = Math.min(index + 1, nodes.length - 1);
      else if (e.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0);
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = nodes.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        const nextSpanId = nodes[nextIndex].span.spanId;
        setSelectedSpanId(nextSpanId);
        // Move DOM focus to the new row
        const el = document.getElementById(`${treeId}-row-${nextIndex}`);
        el?.focus();
      }
    },
    [nodes, treeId]
  );

  const selectedSpan = selectedSpanId
    ? ((data as TraceDetailResponse | undefined)?.spans.find((s) => s.spanId === selectedSpanId) ??
      null)
    : null;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 p-4" aria-busy="true" aria-label="Loading trace…">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Failed to load trace: {error?.message ?? 'Unknown error'}
      </div>
    );
  }

  if (!data || nodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        No span data for this trace.
      </div>
    );
  }

  return (
    <div ref={ref} tabIndex={-1} className="space-y-4 outline-none">
      {/* Header */}
      <h2 className="text-sm font-semibold flex items-center gap-2">
        Trace: <span className="font-mono text-muted-foreground">{traceId.slice(0, 24)}…</span>
        <CopyButton value={traceId} />
        <span className="text-muted-foreground">— {data.durationMs} ms total</span>
      </h2>

      <Card>
        {/* Time axis header */}
        <CardHeader className="pb-1 pt-3">
          <div className="flex text-[10px] text-muted-foreground">
            <div style={{ width: '40%' }} className="shrink-0">
              Span
            </div>
            <div className="flex-1 flex justify-between">
              <span>0 ms</span>
              <span>{Math.round(traceDurationMs / 2)} ms</span>
              <span>{traceDurationMs} ms</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Horizontal scroll for narrow screens */}
          <div className="overflow-x-auto">
            <div
              role="tree"
              aria-label={`Spans for trace ${traceId}`}
              id={treeId}
              style={{ minWidth: '600px' }}
            >
              {nodes.map((node, index) => (
                <SpanRow
                  key={node.span.spanId}
                  node={node}
                  traceStart={traceStartMs}
                  traceDuration={traceDurationMs}
                  isSelected={node.span.spanId === selectedSpanId}
                  onSelect={() => setSelectedSpanId(node.span.spanId)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  rowIndex={index}
                  totalRows={nodes.length}
                  labelledById={treeId}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail panel for selected span */}
      {selectedSpan && <SpanDetailPanel span={selectedSpan} key={selectedSpan.spanId} />}
    </div>
  );
});

export default SpanWaterfall;
