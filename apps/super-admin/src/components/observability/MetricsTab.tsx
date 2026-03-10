// File: apps/super-admin/src/components/observability/MetricsTab.tsx
//
// Metrics tab — 4-panel recharts grid for the selected plugin.
// Panels: request rate, latency (P50/P95/P99), error rate, resources.
//
// Plugin is selected via the `?plugin=` search param (set by HealthTab row click
// or manually via the plugin selector in this tab).
//
// Spec 012 — T012-30

import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route as ObservabilityRoute } from '@/routes/_layout/observability';
import { MetricsChartPanel } from './MetricsChartPanel';
import { TimeRangeSelector, buildTimeRange } from './TimeRangeSelector';
import { AutoRefreshIndicator } from './AutoRefreshIndicator';
import { usePluginMetrics } from '@/hooks/useObservability';
import type { TimeRange } from './TimeRangeSelector';
import type { MetricSeries } from '@/api/observability';

// ---------------------------------------------------------------------------
// PromQL queries for each panel
// ---------------------------------------------------------------------------

const EMPTY_SERIES: MetricSeries[] = [];

interface QueryConfig {
  label: string;
  query: string;
  unit: string;
}

// NOTE: Do NOT include plugin_id in these query templates.
// The backend's _injectPluginLabel() injects plugin_id={pluginId} automatically
// before forwarding to Prometheus, preventing duplicate label selectors that
// produce invalid PromQL. See observability.service.ts _injectPluginLabel().
function buildQueries(): QueryConfig[] {
  return [
    {
      label: 'Request Rate',
      query: `rate(http_requests_total[5m])`,
      unit: ' req/s',
    },
    {
      label: 'Latency',
      query: `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) * 1000`,
      unit: 'ms',
    },
    {
      label: 'Error Rate',
      query: `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`,
      unit: '',
    },
    {
      label: 'CPU Usage',
      query: `process_cpu_seconds_total`,
      unit: '%',
    },
  ];
}

// ---------------------------------------------------------------------------
// Single panel — lazy-fetches its own query
// ---------------------------------------------------------------------------

function MetricsPanel({
  config,
  pluginId,
  timeRange,
}: {
  config: QueryConfig;
  pluginId: string;
  timeRange: TimeRange;
}) {
  const { data, isLoading } = usePluginMetrics(pluginId, {
    query: config.query,
    start: timeRange.start,
    end: timeRange.end,
    step: '60s',
  });

  return (
    <MetricsChartPanel
      title={config.label}
      series={data?.series ?? EMPTY_SERIES}
      unit={config.unit}
      isLoading={isLoading}
    />
  );
}

// ---------------------------------------------------------------------------
// MetricsTab
// ---------------------------------------------------------------------------

export default function MetricsTab() {
  const search = ObservabilityRoute.useSearch();
  const pluginId = (search as { plugin?: string }).plugin ?? '';
  const navigate = useNavigate();

  const [timeRange, setTimeRange] = useState<TimeRange>(() => buildTimeRange(60));
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setTimeRange(
      buildTimeRange(
        Math.round(
          (new Date(timeRange.end).getTime() - new Date(timeRange.start).getTime()) / 60000
        )
      )
    );
    setRefreshKey((k) => k + 1);
  }, [timeRange]);

  const handlePluginChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void navigate({ search: { tab: 'metrics', plugin: e.target.value } as never, replace: true });
    },
    [navigate]
  );

  if (!pluginId) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Enter a plugin ID below or click a row in the{' '}
          <button
            className="underline text-primary hover:no-underline"
            onClick={() => void navigate({ search: { tab: 'health' } as never, replace: true })}
          >
            Health tab
          </button>{' '}
          to view metrics.
        </p>
        <div className="flex items-center gap-2 max-w-xs">
          <label htmlFor="plugin-id-input" className="text-sm font-medium whitespace-nowrap">
            Plugin ID
          </label>
          <input
            id="plugin-id-input"
            type="text"
            placeholder="e.g. my-plugin"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={handlePluginChange}
          />
        </div>
      </div>
    );
  }

  const queries = buildQueries();

  return (
    <div className="space-y-4" key={refreshKey}>
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Plugin:</span>
          <code className="text-sm bg-muted px-2 py-0.5 rounded">{pluginId}</code>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <AutoRefreshIndicator intervalSeconds={60} onRefresh={handleRefresh} />
        </div>
      </div>

      {/* 2×2 chart grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {queries.map((config) => (
          <MetricsPanel
            key={config.label}
            config={config}
            pluginId={pluginId}
            timeRange={timeRange}
          />
        ))}
      </div>
    </div>
  );
}
