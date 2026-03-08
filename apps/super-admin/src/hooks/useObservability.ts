// File: apps/super-admin/src/hooks/useObservability.ts
//
// React Query hooks for Spec 012 Plugin Observability endpoints.
//
// Hook summary:
//   useHealthSummary        — polls GET /api/v1/observability/plugins/health-summary (30s)
//   usePluginMetrics        — queries GET /api/v1/observability/plugins/:id/query
//   usePluginLogs           — queries GET /api/v1/observability/plugins/:id/logs
//   useActiveAlerts         — polls GET /api/v1/observability/alerts (60s)
//   useAlertHistory         — paginated GET /api/v1/observability/alerts/history
//   useTraces               — queries GET /api/v1/observability/traces
//   useTraceDetail          — queries GET /api/v1/observability/traces/:traceId
//   useActiveAlertsCount    — derived from useActiveAlerts for sidebar badge
//
// Spec 012 — T012-28

import { useQuery } from '@tanstack/react-query';
import {
  getPluginHealthSummary,
  getPluginMetrics,
  getPluginLogs,
  getActiveAlerts,
  getAlertHistory,
  searchTraces,
  getTraceDetail,
  type AlertSeverity,
  type PluginMetricsQueryParams,
  type PluginLogsQueryParams,
  type TracesQueryParams,
  type HealthSummaryResponse,
  type PluginMetricsResponse,
  type PluginLogsResponse,
  type ActiveAlertsResponse,
  type AlertHistoryResponse,
  type TracesResponse,
  type TraceDetailResponse,
} from '@/api/observability';

// ---------------------------------------------------------------------------
// useHealthSummary
// Polls every 30s so the Health tab stays near-real-time.
// ---------------------------------------------------------------------------

export function useHealthSummary() {
  return useQuery<HealthSummaryResponse, Error>({
    queryKey: ['observability', 'health-summary'],
    queryFn: getPluginHealthSummary,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// usePluginMetrics
// Fetches a PromQL range query for a specific plugin.
// Only runs when pluginId is non-empty and params are provided.
// ---------------------------------------------------------------------------

export function usePluginMetrics(pluginId: string, params: PluginMetricsQueryParams) {
  return useQuery<PluginMetricsResponse, Error>({
    queryKey: ['observability', 'plugin-metrics', pluginId, params],
    queryFn: () => getPluginMetrics(pluginId, params),
    enabled: !!pluginId && !!params.query && !!params.start && !!params.end,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// usePluginLogs
// Fetches LogQL log lines for a specific plugin.
// ---------------------------------------------------------------------------

export function usePluginLogs(pluginId: string, params: PluginLogsQueryParams) {
  return useQuery<PluginLogsResponse, Error>({
    queryKey: ['observability', 'plugin-logs', pluginId, params],
    queryFn: () => getPluginLogs(pluginId, params),
    enabled: !!pluginId && !!params.start && !!params.end,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useActiveAlerts
// Polls every 60s — feeds both the Alerts tab and the sidebar badge.
// ---------------------------------------------------------------------------

export function useActiveAlerts(severity?: AlertSeverity) {
  return useQuery<ActiveAlertsResponse, Error>({
    queryKey: ['observability', 'active-alerts', severity],
    queryFn: () => getActiveAlerts(severity),
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// useActiveAlertsCount
// Lightweight hook for the sidebar nav badge. Returns 0 on error so the badge
// never shows stale state after a backend outage.
// ---------------------------------------------------------------------------

export function useActiveAlertsCount(): number {
  const { data } = useActiveAlerts();
  return data?.total ?? 0;
}

// ---------------------------------------------------------------------------
// useAlertHistory
// Paginated alert history.
// ---------------------------------------------------------------------------

export function useAlertHistory(page = 1, perPage = 20) {
  return useQuery<AlertHistoryResponse, Error>({
    queryKey: ['observability', 'alert-history', page, perPage],
    queryFn: () => getAlertHistory(page, perPage),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// useTraces
// Searches for traces via Tempo.
// Only runs when start and end are provided (required Tempo query params).
// ---------------------------------------------------------------------------

export function useTraces(params: TracesQueryParams) {
  return useQuery<TracesResponse, Error>({
    queryKey: ['observability', 'traces', params],
    queryFn: () => searchTraces(params),
    enabled: !!params.start && !!params.end,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useTraceDetail
// Fetches the full span tree for a single trace.
// ---------------------------------------------------------------------------

export function useTraceDetail(traceId: string | null) {
  return useQuery<TraceDetailResponse, Error>({
    queryKey: ['observability', 'trace-detail', traceId],
    queryFn: () => getTraceDetail(traceId!),
    enabled: !!traceId,
    staleTime: 5 * 60_000, // trace data is immutable once captured
  });
}
