// File: apps/super-admin/src/components/observability/HealthTab.tsx
//
// Health tab content for the Observability dashboard.
// Shows a sortable HealthSummaryTable with 30s auto-refresh.
// Clicking a row sets a filter for the Metrics tab (via URL search param).
//
// WCAG 2.1 AA:
//   - aria-sort on sortable column headers
//   - aria-live region announces status changes
//   - HealthStatusBadge uses colour + icon + text (WCAG 1.4.1)
//   - Skeleton loading has aria-busy="true"
//
// Spec 012 — T012-29

import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { HealthStatusBadge } from './HealthStatusBadge';
import { AutoRefreshIndicator } from './AutoRefreshIndicator';
import { useHealthSummary } from '@/hooks/useObservability';
import type { PluginHealthSummary } from '@/api/observability';

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

type SortKey = 'pluginName' | 'status' | 'requestRate' | 'errorRate' | 'p95LatencyMs';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER = { healthy: 0, degraded: 1, unreachable: 2, unknown: 3 };

function sortPlugins(
  plugins: PluginHealthSummary[],
  key: SortKey,
  dir: SortDir
): PluginHealthSummary[] {
  return [...plugins].sort((a, b) => {
    let cmp = 0;
    if (key === 'status') {
      cmp = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
    } else if (key === 'pluginName') {
      cmp = a.pluginName.localeCompare(b.pluginName);
    } else {
      cmp = (a[key] as number) - (b[key] as number);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// SortButton — renders a column header with sort indicator
// ---------------------------------------------------------------------------

function SortButton({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentKey === sortKey;
  const ariaSortValue = isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSortValue as 'ascending' | 'descending' | 'none'}
      className="px-4 py-3 text-left text-sm font-medium text-muted-foreground whitespace-nowrap"
    >
      <button
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive ? (
          currentDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// HealthTab
// ---------------------------------------------------------------------------

export default function HealthTab() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHealthSummary();
  const navigate = useNavigate();

  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  // Navigate to Metrics tab filtered to the clicked plugin
  const handleRowClick = useCallback(
    (pluginId: string) => {
      void navigate({
        search: { tab: 'metrics', plugin: pluginId } as never,
        replace: true,
      });
    },
    [navigate]
  );

  const plugins = data?.plugins ?? [];
  const sorted = sortPlugins(plugins, sortKey, sortDir);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading health data…">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Failed to load health data: {error?.message ?? 'Unknown error'}
      </div>
    );
  }

  // ── Summary cards ─────────────────────────────────────────────────────────

  const unhealthyCount = data?.unhealthyCount ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary + refresh row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-sm">
          <span>
            <strong>{data?.totalActive ?? 0}</strong> active plugins
          </span>
          {unhealthyCount > 0 ? (
            <span className="font-medium text-destructive" role="status" aria-live="polite">
              {unhealthyCount} unhealthy
            </span>
          ) : (
            <span className="text-green-700 font-medium" role="status" aria-live="polite">
              All systems operational
            </span>
          )}
        </div>
        <AutoRefreshIndicator
          intervalSeconds={30}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plugin Health Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              aria-label="Plugin health summary"
              aria-live="polite"
              aria-busy={isFetching}
            >
              <thead className="border-b bg-muted/40">
                <tr>
                  <SortButton
                    label="Plugin"
                    sortKey="pluginName"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="Status"
                    sortKey="status"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="Req/s"
                    sortKey="requestRate"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="Error %"
                    sortKey="errorRate"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortButton
                    label="P95 ms"
                    sortKey="p95LatencyMs"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No active plugins found.
                    </td>
                  </tr>
                ) : (
                  sorted.map((plugin) => (
                    <tr
                      key={plugin.pluginId}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(plugin.pluginId)}
                      tabIndex={0}
                      role="button"
                      aria-label={`View metrics for ${plugin.pluginName}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(plugin.pluginId);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{plugin.pluginName}</td>
                      <td className="px-4 py-3">
                        <HealthStatusBadge status={plugin.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 tabular-nums">{plugin.requestRate.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {(plugin.errorRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 tabular-nums">{plugin.p95LatencyMs}</td>
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
