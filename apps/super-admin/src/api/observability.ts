// File: apps/super-admin/src/api/observability.ts
//
// Typed API client functions for Spec 012 Plugin Observability endpoints.
// All functions call /api/v1/observability/* which requires super_admin auth.
//
// Spec 012 — T012-28

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Shared helper — typed GET via HttpClient public method
// ---------------------------------------------------------------------------

type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Typed GET wrapper that delegates to the existing `apiClient.get<T>()` public
 * method inherited from HttpClient (packages/api-client/src/client.ts).
 *
 * This replaces the previous `(apiClient as unknown as { axios: ... }).axios.get()`
 * double-cast, which bypassed TypeScript type-checking and the response interceptor.
 * Using the public `get()` method ensures auth headers, error normalisation, and
 * AbortSignal support are all handled consistently.
 */
async function get<T>(path: string, params?: QueryParams): Promise<T> {
  return apiClient.get<T>(path, params as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Types — aligned with observability-v1.ts response shapes
// ---------------------------------------------------------------------------

/**
 * Raw per-plugin summary as returned by the backend:
 *   GET /api/v1/observability/plugins/health-summary → { data: PluginObservabilitySummaryRaw[] }
 *
 * Field notes (backend schema: observability.schema.ts):
 *   - requestCount    : total request count in query window (null if not scraped)
 *   - p95LatencySeconds: P95 latency in seconds (null if not scraped)
 *   - errorRate       : HTTP 5xx fraction [0,1] (null if not scraped)
 *   - scraped         : whether Prometheus has an active target for this plugin
 *   - lastScrapedAt   : ISO 8601 or null
 */
interface PluginObservabilitySummaryRaw {
  pluginId: string;
  pluginName: string;
  scraped: boolean;
  requestCount: number | null;
  p95LatencySeconds: number | null;
  errorRate: number | null;
  lastScrapedAt: string | null;
}

export type PluginHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'unknown';

/**
 * Normalised per-plugin health summary exposed to UI components.
 * Derived from PluginObservabilitySummaryRaw by deriveHealthStatus().
 */
export interface PluginHealthSummary {
  pluginId: string;
  pluginName: string;
  status: PluginHealthStatus;
  /** req/s, derived from requestCount over a fixed 5-min window; 0 if not scraped */
  requestRate: number;
  /** 0–1 fraction; 0 if not scraped */
  errorRate: number;
  /** P95 latency in milliseconds (converted from seconds); 0 if not scraped */
  p95LatencyMs: number;
  lastCheckedAt: string | null; // ISO 8601 or null
}

export interface HealthSummaryResponse {
  plugins: PluginHealthSummary[];
  totalActive: number;
  unhealthyCount: number;
}

export interface MetricDataPoint {
  timestamp: string; // ISO 8601
  value: number;
}

export interface MetricSeries {
  metric: Record<string, string>; // label set
  values: MetricDataPoint[];
}

export interface PluginMetricsResponse {
  pluginId: string;
  query: string;
  start: string;
  end: string;
  step: string;
  series: MetricSeries[];
}

export interface LogLine {
  timestamp: string;
  level: string;
  message: string;
  traceId?: string;
  spanId?: string;
  labels: Record<string, string>;
}

export interface PluginLogsResponse {
  pluginId: string;
  lines: LogLine[];
  total: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Raw alert object as returned by the backend alerts endpoint:
 *   GET /api/v1/observability/alerts → { data: AlertRaw[] }
 *
 * Field notes: backend uses `description` (not `summary`), no `labels` field.
 */
interface AlertRaw {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  description: string;
  state: string;
  activeAt: string | null;
  value: string | null;
}

/**
 * Normalised active alert for UI components.
 * `summary` is mapped from backend `description`.
 * `labels` is an empty object (not returned by the backend).
 */
export interface ActiveAlert {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  /** Mapped from backend `description` field. */
  summary: string;
  activeAt: string; // ISO 8601 — backend activeAt (null coerced to epoch string)
  labels: Record<string, string>;
}

export interface ActiveAlertsResponse {
  alerts: ActiveAlert[];
  total: number;
}

/**
 * Raw alert history item as returned by the backend:
 *   GET /api/v1/observability/alerts/history → { data: AlertHistoryRaw[], pagination: {...} }
 *
 * Field notes: no `summary` or `labels` — only `alertName, severity, pluginId, firedAt,
 * resolvedAt, duration`.
 */
interface AlertHistoryRaw {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  firedAt: string | null;
  resolvedAt: string | null;
  duration: number | null;
}

/**
 * Normalised alert history entry for UI components.
 * `summary` is synthesised as empty string (not available from backend).
 * `labels` is an empty object (not available from backend).
 */
export interface AlertHistoryEntry {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  summary: string;
  firedAt: string;
  resolvedAt: string | null;
  labels: Record<string, string>;
}

/**
 * Raw pagination envelope from backend (snake_case):
 *   { page, per_page, total, total_pages }
 */
interface PaginationRaw {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface AlertHistoryResponse {
  alerts: AlertHistoryEntry[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface TraceResult {
  traceId: string;
  rootSpanName: string;
  serviceName: string;
  durationMs: number;
  startTime: string;
  status: 'ok' | 'error' | 'unset';
  spanCount: number;
}

export interface TracesResponse {
  traces: TraceResult[];
  total: number;
}

export interface Span {
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: string;
  durationMs: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: string; attributes: Record<string, string> }>;
}

export interface TraceDetailResponse {
  traceId: string;
  spans: Span[];
  durationMs: number;
  rootServiceName: string;
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derive a UI-friendly health status from raw backend metrics.
 *
 * Rules (conservative — prefer "degraded" over "unhealthy" to avoid alarm fatigue):
 *   - not scraped           → 'unreachable'
 *   - errorRate > 0.05      → 'degraded'
 *   - p95LatencySeconds > 1 → 'degraded'
 *   - otherwise             → 'healthy'
 */
function deriveHealthStatus(raw: PluginObservabilitySummaryRaw): PluginHealthStatus {
  if (!raw.scraped) return 'unreachable';
  if (raw.errorRate !== null && raw.errorRate > 0.05) return 'degraded';
  if (raw.p95LatencySeconds !== null && raw.p95LatencySeconds > 1) return 'degraded';
  return 'healthy';
}

/**
 * Convert a raw backend summary to the UI PluginHealthSummary shape.
 *
 * - requestRate: derived from requestCount over the default 5-min (300s) window
 * - p95LatencyMs: convert seconds → milliseconds
 */
function toPluginHealthSummary(raw: PluginObservabilitySummaryRaw): PluginHealthSummary {
  const WINDOW_SECONDS = 300;
  return {
    pluginId: raw.pluginId,
    pluginName: raw.pluginName,
    status: deriveHealthStatus(raw),
    requestRate: raw.requestCount !== null ? raw.requestCount / WINDOW_SECONDS : 0,
    errorRate: raw.errorRate ?? 0,
    p95LatencyMs: raw.p95LatencySeconds !== null ? Math.round(raw.p95LatencySeconds * 1000) : 0,
    lastCheckedAt: raw.lastScrapedAt,
  };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/observability/plugins/health-summary
 *
 * Backend envelope: { data: PluginObservabilitySummaryRaw[] }
 * Transformed to: HealthSummaryResponse with derived status, requestRate, p95LatencyMs.
 */
export async function getPluginHealthSummary(): Promise<HealthSummaryResponse> {
  const envelope = await get<{ data: PluginObservabilitySummaryRaw[] }>(
    '/api/v1/observability/plugins/health-summary'
  );
  const plugins = (envelope.data ?? []).map(toPluginHealthSummary);
  const unhealthyCount = plugins.filter(
    (p) => p.status === 'degraded' || p.status === 'unreachable'
  ).length;
  return {
    plugins,
    totalActive: plugins.length,
    unhealthyCount,
  };
}

export interface PluginMetricsQueryParams {
  query: string;
  start: string;
  end: string;
  step?: string;
}

export async function getPluginMetrics(
  pluginId: string,
  params: PluginMetricsQueryParams
): Promise<PluginMetricsResponse> {
  return get<PluginMetricsResponse>(`/api/v1/observability/plugins/${pluginId}/query`, {
    ...params,
    step: params.step ?? '60s',
  });
}

export interface PluginLogsQueryParams {
  start: string;
  end: string;
  query?: string;
  limit?: number;
}

export async function getPluginLogs(
  pluginId: string,
  params: PluginLogsQueryParams
): Promise<PluginLogsResponse> {
  return get<PluginLogsResponse>(`/api/v1/observability/plugins/${pluginId}/logs`, { ...params });
}

/**
 * GET /api/v1/observability/alerts
 *
 * Backend envelope: { data: AlertRaw[] }
 * Transformed to: ActiveAlertsResponse { alerts, total }.
 *
 * Mapping notes:
 *   - backend `description` → UI `summary`
 *   - `labels` set to {} (backend does not expose label map in this endpoint)
 *   - `activeAt` coerced from null → epoch string to satisfy non-null UI requirement
 */
export async function getActiveAlerts(severity?: AlertSeverity): Promise<ActiveAlertsResponse> {
  const envelope = await get<{ data: AlertRaw[] }>(
    '/api/v1/observability/alerts',
    severity ? { severity } : undefined
  );
  const alerts: ActiveAlert[] = (envelope.data ?? []).map((raw) => ({
    alertName: raw.alertName,
    pluginId: raw.pluginId,
    severity: raw.severity,
    summary: raw.description,
    activeAt: raw.activeAt ?? new Date(0).toISOString(),
    labels: {},
  }));
  return { alerts, total: alerts.length };
}

/**
 * GET /api/v1/observability/alerts/history
 *
 * Backend envelope: { data: AlertHistoryRaw[], pagination: PaginationRaw }
 * Backend pagination uses snake_case (per_page, total_pages).
 * Transformed to: AlertHistoryResponse with camelCase pagination.
 *
 * Mapping notes:
 *   - `summary` set to '' (not available from backend)
 *   - `labels` set to {} (not available from backend)
 *   - `firedAt` coerced from null → epoch string
 */
export async function getAlertHistory(
  page = 1,
  perPage = 20,
  severity?: 'critical' | 'warning' | 'info'
): Promise<AlertHistoryResponse> {
  const params: Record<string, string | number> = { page, per_page: perPage };
  if (severity) params.severity = severity;
  const envelope = await get<{ data: AlertHistoryRaw[]; pagination: PaginationRaw }>(
    '/api/v1/observability/alerts/history',
    params
  );
  const alerts: AlertHistoryEntry[] = (envelope.data ?? []).map((raw) => ({
    alertName: raw.alertName,
    pluginId: raw.pluginId,
    severity: raw.severity,
    summary: '',
    firedAt: raw.firedAt ?? new Date(0).toISOString(),
    resolvedAt: raw.resolvedAt,
    labels: {},
  }));
  const p = envelope.pagination ?? { page: 1, per_page: perPage, total: 0, total_pages: 1 };
  return {
    alerts,
    pagination: {
      page: p.page,
      perPage: p.per_page,
      total: p.total,
      totalPages: p.total_pages,
    },
  };
}

export interface TracesQueryParams {
  start: string;
  end: string;
  service?: string;
  traceId?: string;
  limit?: number;
}

export async function searchTraces(params: TracesQueryParams): Promise<TracesResponse> {
  // Backend returns { data: TraceRaw[], pagination: { total, limit, hasMore } }
  // Frontend expects  { traces: TraceResult[], total: number }
  const raw = await get<{
    data: Array<{
      traceId: string;
      rootService: string;
      durationMs: number;
      spanCount: number;
      status: 'ok' | 'error' | 'unset';
      startTime: string | null;
    }>;
    pagination: { total: number; limit: number; hasMore: boolean };
  }>('/api/v1/observability/traces', { ...params });

  return {
    traces: raw.data.map((t) => ({
      traceId: t.traceId,
      rootSpanName: t.rootService,
      serviceName: t.rootService,
      durationMs: t.durationMs,
      startTime: t.startTime ?? new Date(0).toISOString(),
      status: t.status,
      spanCount: t.spanCount,
    })),
    total: raw.pagination.total,
  };
}

export async function getTraceDetail(traceId: string): Promise<TraceDetailResponse> {
  // Backend returns { data: { traceId, rootService, durationMs, spans } }
  // Frontend expects top-level { traceId, spans, durationMs, rootServiceName }
  const raw = await get<{
    data: {
      traceId: string;
      rootService: string;
      durationMs: number;
      spans: Span[];
    };
  }>(`/api/v1/observability/traces/${traceId}`);

  return {
    traceId: raw.data.traceId,
    spans: raw.data.spans,
    durationMs: raw.data.durationMs,
    rootServiceName: raw.data.rootService,
  };
}
