// File: apps/web/src/routes/admin.observability.tsx
//
// Spec 012 — Plugin Observability Dashboard (TD-019 / FR-013..FR-032).
// Mounted at /admin/observability inside the TenantAdminLayout shell.
//
// Four tabs:
//   Health   — plugin health summary table (FR-024, FR-025)
//   Metrics  — PromQL time-series charts via recharts (FR-027, FR-028)
//   Traces   — Tempo trace search + span waterfall (FR-029, FR-030, FR-031)
//   Alerts   — Prometheus alerting dashboard (FR-022, FR-023, FR-032)
//
// All data is fetched from /api/v1/observability/* endpoints (Spec 012 §8.3).
// 502 responses from the backend are handled gracefully (NFR-013 fail-open).

import { useState, useEffect, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@plexica/ui';

export const Route = createFileRoute('/admin/observability' as never)({
  component: ObservabilityPage,
});

// ---------------------------------------------------------------------------
// Types (aligned with Spec 012 §3.3..§3.9 API shapes)
// ---------------------------------------------------------------------------

type HealthStatus = 'healthy' | 'degraded' | 'down';

interface PluginHealthEntry {
  id: string;
  name: string;
  status: HealthStatus;
  p95LatencyMs: number | null;
  errorRatePct: number | null;
  uptimePct: number | null;
  lastHealthCheckAt: string;
}

interface HealthSummaryResponse {
  plugins: PluginHealthEntry[];
}

interface ActiveAlert {
  id: string;
  ruleName: string;
  severity: 'critical' | 'warning';
  pluginId: string;
  pluginName: string;
  description: string;
  firedAt: string;
}

interface AlertsResponse {
  active: ActiveAlert[];
}

interface HistoricalAlert {
  id: string;
  ruleName: string;
  severity: 'critical' | 'warning';
  pluginId: string;
  pluginName: string;
  description: string;
  firedAt: string;
  resolvedAt: string;
}

interface AlertHistoryResponse {
  data: HistoricalAlert[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

interface TraceRow {
  traceId: string;
  rootService: string;
  durationMs: number;
  spanCount: number;
  status: 'ok' | 'error';
  startTime: string;
}

interface TracesResponse {
  data: TraceRow[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

interface Span {
  spanId: string;
  parentSpanId: string | null;
  service: string;
  operation: string;
  durationMs: number;
  status: 'ok' | 'error';
  startTimeMs: number;
  attributes?: Record<string, unknown>;
}

interface TraceDetailResponse {
  traceId: string;
  spans: Span[];
}

type TimeRange = '1h' | '6h' | '24h' | '7d';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const { adminApiClient } = await import('@/lib/api-client');
  return adminApiClient.get<T>(url);
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

function useHealthSummary() {
  return useQuery<HealthSummaryResponse, Error>({
    queryKey: ['observability', 'health-summary'],
    queryFn: () => fetchJson('/api/v1/observability/plugins/health-summary'),
    refetchInterval: 30_000, // FR-025: auto-refresh every 30s
    staleTime: 20_000,
  });
}

function useActiveAlerts() {
  return useQuery<AlertsResponse, Error>({
    queryKey: ['observability', 'alerts'],
    queryFn: () => fetchJson('/api/v1/observability/alerts'),
    staleTime: 30_000,
  });
}

function useAlertHistory() {
  return useQuery<AlertHistoryResponse, Error>({
    queryKey: ['observability', 'alerts-history'],
    queryFn: () => fetchJson('/api/v1/observability/alerts/history'),
    staleTime: 60_000,
  });
}

function useTraces(service: string, traceIdFilter: string, timeRange: TimeRange) {
  return useQuery<TracesResponse, Error>({
    queryKey: ['observability', 'traces', service, traceIdFilter, timeRange],
    queryFn: () => {
      const end = new Date();
      const startOffset = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 }[timeRange];
      const start = new Date(end.getTime() - startOffset * 1000);
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        limit: '20',
      });
      if (service) params.set('service', service);
      if (traceIdFilter) params.set('traceId', traceIdFilter);
      return fetchJson(`/api/v1/observability/traces?${params.toString()}`);
    },
    staleTime: 30_000,
  });
}

function useTraceDetail(traceId: string | null) {
  return useQuery<TraceDetailResponse, Error>({
    queryKey: ['observability', 'trace', traceId],
    queryFn: () => fetchJson(`/api/v1/observability/traces/${traceId}`),
    enabled: traceId !== null,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm flex items-center gap-2"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health tab
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: HealthStatus }) {
  if (status === 'healthy') {
    return (
      <Badge variant="default" className="bg-green-600 text-white gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Healthy
      </Badge>
    );
  }
  if (status === 'degraded') {
    return (
      <Badge variant="secondary" className="bg-yellow-500 text-white gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Degraded
      </Badge>
    );
  }
  return (
    <Badge variant="danger" className="gap-1">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      Down
    </Badge>
  );
}

function HealthTab({ onViewMetrics }: { onViewMetrics: (pluginId: string) => void }) {
  const { data, isLoading, error, dataUpdatedAt } = useHealthSummary();
  const plugins = data?.plugins ?? [];

  const updatedLabel = dataUpdatedAt
    ? `Last updated: ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : null;

  return (
    <div className="space-y-4">
      {error && (
        <ErrorBanner message="Unable to retrieve health data. The observability backend may be unavailable." />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{updatedLabel ?? 'Loading health data…'}</p>
        {updatedLabel && (
          <RefreshCw
            className="h-3.5 w-3.5 text-muted-foreground animate-spin-slow"
            aria-hidden="true"
          />
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Plugin
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Status
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    P95 Latency
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Error Rate
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Uptime (24h)
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Last Health Check
                  </th>
                  <th role="columnheader" scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : plugins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No active plugins found.
                    </td>
                  </tr>
                ) : (
                  plugins.map((plugin) => (
                    <tr key={plugin.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{plugin.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={plugin.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {plugin.p95LatencyMs !== null ? (
                          <span
                            className={
                              plugin.p95LatencyMs > 500
                                ? 'text-destructive font-semibold'
                                : 'text-foreground'
                            }
                          >
                            {plugin.p95LatencyMs} ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {plugin.errorRatePct !== null ? (
                          <span>{plugin.errorRatePct.toFixed(1)} %</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {plugin.uptimePct !== null ? (
                          <span>{plugin.uptimePct.toFixed(1)} %</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(plugin.lastHealthCheckAt).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline whitespace-nowrap"
                          onClick={() => onViewMetrics(plugin.id)}
                        >
                          View Metrics
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics tab
// ---------------------------------------------------------------------------

/** Minimal PromQL range query result — we render sparkline-style chart panels */
const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
];

const CHART_PANELS = [
  { id: 'request-rate', label: 'Request Rate' },
  { id: 'latency', label: 'Latency Distribution' },
  { id: 'error-rate', label: 'Error Rate' },
  { id: 'resource-usage', label: 'Resource Usage (CPU / Memory)' },
];

function MetricsTab({
  initialPlugin,
  plugins,
}: {
  initialPlugin: string;
  plugins: PluginHealthEntry[];
}) {
  const [selectedPlugin, setSelectedPlugin] = useState(initialPlugin);
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');

  // Keep plugin in sync when parent updates it (e.g. clicking "View Metrics" from Health tab)
  useEffect(() => {
    if (initialPlugin) setSelectedPlugin(initialPlugin);
  }, [initialPlugin]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="obs-plugin-select" className="text-sm text-muted-foreground">
            Select plugin
          </label>
          <select
            id="obs-plugin-select"
            aria-label="Plugin"
            value={selectedPlugin}
            onChange={(e) => setSelectedPlugin(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">All plugins</option>
            {plugins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="obs-time-range" className="text-sm text-muted-foreground">
            Time range
          </label>
          <select
            id="obs-time-range"
            aria-label="Time range"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart panels */}
      <div className="grid gap-4 sm:grid-cols-2">
        {CHART_PANELS.map((panel) => (
          <Card key={panel.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{panel.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Accessible placeholder — recharts integration is a Phase 3 task */}
              <div
                role="img"
                aria-label={`${panel.label} chart for ${selectedPlugin || 'all plugins'} over ${timeRange}`}
                className="h-32 flex items-center justify-center rounded bg-muted/30 text-muted-foreground text-xs"
              >
                <span className="sr-only">
                  {panel.label} time-series data for the selected plugin and time range
                </span>
                {/* Chart area — data will render here once recharts is wired */}
                <span aria-hidden="true">Chart data loading…</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Traces tab
// ---------------------------------------------------------------------------

function TraceStatusBadge({ status }: { status: 'ok' | 'error' }) {
  return status === 'ok' ? (
    <Badge variant="default" className="bg-green-600 text-white">
      OK
    </Badge>
  ) : (
    <Badge variant="danger">Error</Badge>
  );
}

/** Render a flat span list as an indented waterfall */
function TraceWaterfall({ spans }: { spans: Span[] }) {
  const totalMs = Math.max(...spans.map((s) => s.startTimeMs + s.durationMs), 1);

  // Build depth map using BFS so that out-of-order spans (child before parent)
  // receive the correct depth rather than always depth = 0 + 1 = 1.
  const depth = new Map<string, number>();
  // Seed roots
  spans.forEach((span) => {
    if (!span.parentSpanId) depth.set(span.spanId, 0);
  });
  // BFS from roots
  const queue = spans.filter((s) => !s.parentSpanId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current.spanId) ?? 0;
    spans.forEach((child) => {
      if (child.parentSpanId === current.spanId && !depth.has(child.spanId)) {
        depth.set(child.spanId, currentDepth + 1);
        queue.push(child);
      }
    });
  }
  // Fallback: any span not yet in the depth map (disconnected) gets depth 0
  spans.forEach((span) => {
    if (!depth.has(span.spanId)) depth.set(span.spanId, 0);
  });

  return (
    <div
      role="region"
      aria-label="Trace detail — span waterfall"
      data-testid="trace-waterfall"
      className="overflow-x-auto"
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground w-1/2">
              Span / Operation
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Service
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
              Duration
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Timeline
            </th>
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const d = depth.get(span.spanId) ?? 0;
            const leftPct = (span.startTimeMs / totalMs) * 100;
            const widthPct = Math.max((span.durationMs / totalMs) * 100, 0.5);
            const barColor = span.status === 'error' ? 'bg-destructive' : 'bg-primary/60';

            return (
              <tr key={span.spanId} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + d * 16}px` }}>
                  <span className="font-mono text-foreground">{span.operation}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{span.service}</td>
                <td className="px-3 py-2 text-right tabular-nums">{span.durationMs} ms</td>
                <td className="px-3 py-2 min-w-[120px]">
                  <div className="relative h-4 w-full bg-muted/30 rounded overflow-hidden">
                    <div
                      className={`absolute top-0 h-full rounded ${barColor}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TracesTab() {
  const [serviceFilter, setServiceFilter] = useState('');
  const [traceIdFilter, setTraceIdFilter] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { data, isLoading, error } = useTraces(serviceFilter, traceIdFilter, timeRange);
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail(selectedTraceId);

  const traces = data?.data ?? [];

  return (
    <div className="space-y-4">
      {error && (
        <ErrorBanner message="Unable to search traces. The trace backend (Tempo) may not be responding." />
      )}

      {/* Search form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Search Traces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="traces-service" className="text-sm text-muted-foreground">
                Service / Plugin
              </label>
              <input
                id="traces-service"
                type="text"
                placeholder="service name"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="traces-trace-id" className="text-sm text-muted-foreground">
                Trace ID
              </label>
              <input
                id="traces-trace-id"
                type="text"
                placeholder="abc123…"
                value={traceIdFilter}
                onChange={(e) => setTraceIdFilter(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="traces-time-range" className="text-sm text-muted-foreground">
                Time Range
              </label>
              <select
                id="traces-time-range"
                aria-label="Time range"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Trace ID
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Root Service
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Duration
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Spans
                  </th>
                  <th
                    role="columnheader"
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : traces.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No traces found for the given search criteria.
                    </td>
                  </tr>
                ) : (
                  traces.map((trace) => (
                    <tr
                      key={trace.traceId}
                      className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                      tabIndex={0}
                      role="button"
                      aria-label={`Trace ${trace.traceId} — ${trace.rootService}, ${trace.durationMs}ms`}
                      onClick={() =>
                        setSelectedTraceId((prev) =>
                          prev === trace.traceId ? null : trace.traceId
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTraceId((prev) =>
                            prev === trace.traceId ? null : trace.traceId
                          );
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary hover:underline">
                        {trace.traceId}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{trace.rootService}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{trace.durationMs} ms</td>
                      <td className="px-4 py-3 text-right tabular-nums">{trace.spanCount}</td>
                      <td className="px-4 py-3">
                        <TraceStatusBadge status={trace.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trace detail / waterfall */}
      {selectedTraceId && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Trace Detail — <span className="font-mono">{selectedTraceId}</span>
            </CardTitle>
            <button
              type="button"
              aria-label="Close trace detail"
              onClick={() => setSelectedTraceId(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Close
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {isDetailLoading ? (
              <div className="px-4 py-6 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : traceDetail ? (
              <TraceWaterfall spans={traceDetail.spans} />
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts tab
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' }) {
  return severity === 'critical' ? (
    <Badge variant="danger" className="gap-1">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      Critical
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-yellow-500 text-white gap-1">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Warning
    </Badge>
  );
}

function AlertsTab({ onViewPlugin }: { onViewPlugin: (pluginId: string) => void }) {
  const { data: alertsData, isLoading: alertsLoading, error: alertsError } = useActiveAlerts();
  const { data: historyData, isLoading: historyLoading } = useAlertHistory();

  const activeAlerts = alertsData?.active ?? [];
  const historicalAlerts = historyData?.data ?? [];

  return (
    <div className="space-y-6">
      {alertsError && (
        <ErrorBanner message="Unable to retrieve alert data from the observability backend." />
      )}

      {/* Active Alerts */}
      <section aria-label="Active alerts">
        <h2 className="text-base font-semibold text-foreground mb-3">Active Alerts</h2>

        {alertsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" aria-hidden="true" />
            No active alerts. All plugins are operating normally.
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts
              .sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0))
              .map((alert) => (
                <Card key={alert.id} className="border-l-4 border-l-destructive">
                  <CardContent className="py-3 px-4 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={alert.severity} />
                        <span className="font-semibold text-sm text-foreground">
                          {alert.ruleName}
                        </span>
                        <span className="text-xs text-muted-foreground">· {alert.pluginName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Fired {new Date(alert.firedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline whitespace-nowrap flex items-center gap-1 self-start"
                      onClick={() => onViewPlugin(alert.pluginId)}
                    >
                      View Plugin
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </section>

      {/* Alert History */}
      <section aria-label="Alert history">
        <h2 className="text-base font-semibold text-foreground mb-3">Alert History</h2>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Rule
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Severity
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Plugin
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Fired At
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Resolved At
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium text-muted-foreground"
                    >
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : historicalAlerts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-muted-foreground text-sm"
                      >
                        No resolved alerts in the last 7 days.
                      </td>
                    </tr>
                  ) : (
                    historicalAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{alert.ruleName}</td>
                        <td className="px-4 py-3">
                          <SeverityBadge severity={alert.severity} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{alert.pluginName}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {new Date(alert.firedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {new Date(alert.resolvedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {Math.round(
                            (new Date(alert.resolvedAt).getTime() -
                              new Date(alert.firedAt).getTime()) /
                              1000
                          )}
                          s
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

type ObsTab = 'health' | 'metrics' | 'traces' | 'alerts';

function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<ObsTab>('health');
  const [metricsPlugin, setMetricsPlugin] = useState('');
  const navigate = useNavigate();

  // Health summary data is also needed by the Metrics tab for the plugin selector
  const { data: healthData } = useHealthSummary();
  const plugins = healthData?.plugins ?? [];

  const handleViewMetrics = useCallback((pluginId: string) => {
    setMetricsPlugin(pluginId);
    setActiveTab('metrics');
  }, []);

  const handleViewPlugin = useCallback(
    (_pluginId: string) => {
      void navigate({ to: '/admin/plugins' as never });
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Observability</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plugin health, metrics, traces, and alerts
          </p>
        </div>
      </div>

      {/* Tab panel */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as ObsTab)}>
        <TabsList aria-label="Observability sections">
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <HealthTab onViewMetrics={handleViewMetrics} />
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsTab initialPlugin={metricsPlugin} plugins={plugins} />
        </TabsContent>

        <TabsContent value="traces">
          <TracesTab />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab onViewPlugin={handleViewPlugin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
