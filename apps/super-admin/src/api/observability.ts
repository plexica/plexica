// File: apps/super-admin/src/api/observability.ts
//
// Typed API client functions for Spec 012 Plugin Observability endpoints.
// All functions call /api/v1/observability/* which requires super_admin auth.
//
// Spec 012 — T012-28

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Shared helper — typed GET with query string serialisation
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryParams = Record<string, any>;

function buildUrl(path: string, params?: QueryParams): string {
  if (!params) return path;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `${path}?${qs}` : path;
}

// Rely on the existing apiClient.axios instance (same auth, same base URL)
async function get<T>(path: string, params?: QueryParams): Promise<T> {
  const url = buildUrl(path, params);
  const response = await (
    apiClient as unknown as { axios: { get: (url: string) => Promise<{ data: T }> } }
  ).axios.get(url);
  return response.data;
}

// ---------------------------------------------------------------------------
// Types — aligned with observability-v1.ts response shapes
// ---------------------------------------------------------------------------

export type PluginHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'unknown';

export interface PluginHealthSummary {
  pluginId: string;
  pluginName: string;
  status: PluginHealthStatus;
  requestRate: number; // req/s averaged over last 5 min
  errorRate: number; // 0–1 fraction
  p95LatencyMs: number;
  lastCheckedAt: string; // ISO 8601
}

export interface HealthSummaryResponse {
  plugins: PluginHealthSummary[];
  totalActive: number;
  unhealthyCount: number;
  generatedAt: string;
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

export interface ActiveAlert {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  summary: string;
  activeAt: string; // ISO 8601
  labels: Record<string, string>;
}

export interface ActiveAlertsResponse {
  alerts: ActiveAlert[];
  total: number;
}

export interface AlertHistoryEntry {
  alertName: string;
  pluginId: string | null;
  severity: AlertSeverity;
  summary: string;
  firedAt: string;
  resolvedAt: string | null;
  labels: Record<string, string>;
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
// API functions
// ---------------------------------------------------------------------------

export async function getPluginHealthSummary(): Promise<HealthSummaryResponse> {
  return get<HealthSummaryResponse>('/api/v1/observability/plugins/health-summary');
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
  return get<PluginLogsResponse>(`/api/v1/observability/plugins/${pluginId}/logs`, params);
}

export async function getActiveAlerts(severity?: AlertSeverity): Promise<ActiveAlertsResponse> {
  return get<ActiveAlertsResponse>(
    '/api/v1/observability/alerts',
    severity ? { severity } : undefined
  );
}

export async function getAlertHistory(page = 1, perPage = 20): Promise<AlertHistoryResponse> {
  return get<AlertHistoryResponse>('/api/v1/observability/alerts/history', {
    page,
    per_page: perPage,
  });
}

export interface TracesQueryParams {
  start: string;
  end: string;
  service?: string;
  traceId?: string;
  limit?: number;
}

export async function searchTraces(params: TracesQueryParams): Promise<TracesResponse> {
  return get<TracesResponse>('/api/v1/observability/traces', params);
}

export async function getTraceDetail(traceId: string): Promise<TraceDetailResponse> {
  return get<TraceDetailResponse>(`/api/v1/observability/traces/${traceId}`);
}
