// File: apps/super-admin/src/components/observability/AlertsTab.tsx
//
// Alerts tab for the Observability dashboard.
// Composed of:
//   ActiveAlertCard    — severity badge (colour + text), role="alert" for critical
//   AlertHistoryTable  — paginated, severity filter, "View Plugin" link
//
// WCAG 2.1 AA:
//   - Severity badge uses colour + text (not colour-only, 1.4.1)
//   - Critical cards have role="alert" so screen readers announce them (4.1.3)
//   - Pagination buttons have descriptive aria-label (4.1.2)
//   - Empty state has a clear positive message ("All systems operational")
//
// Spec 012 — T012-33

import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { useActiveAlerts, useAlertHistory } from '@/hooks/useObservability';
import type { ActiveAlert, AlertHistoryEntry, AlertSeverity } from '@/api/observability';

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    cardBorderClass: string;
  }
> = {
  critical: {
    label: 'Critical',
    Icon: AlertCircle,
    badgeClass: 'text-destructive',
    cardBorderClass: 'border-destructive/40 bg-destructive/5',
  },
  warning: {
    label: 'Warning',
    Icon: AlertTriangle,
    badgeClass: 'text-amber-600',
    cardBorderClass: 'border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20',
  },
  info: {
    label: 'Info',
    Icon: Info,
    badgeClass: 'text-blue-600',
    cardBorderClass: 'border-blue-400/40 bg-blue-50/50 dark:bg-blue-950/20',
  },
};

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { label, Icon, badgeClass } = SEVERITY_CONFIG[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${badgeClass}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ActiveAlertCard
// ---------------------------------------------------------------------------

function ActiveAlertCard({
  alert,
  onViewPlugin,
}: {
  alert: ActiveAlert;
  onViewPlugin: (pluginId: string) => void;
}) {
  const isCritical = alert.severity === 'critical';
  const { cardBorderClass } = SEVERITY_CONFIG[alert.severity];
  const activeAt = new Date(alert.activeAt);

  return (
    <div
      role={isCritical ? 'alert' : 'status'}
      aria-label={`${alert.severity} alert: ${alert.alertName}`}
      className={`rounded-lg border p-4 space-y-2 ${cardBorderClass}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <span className="font-medium text-sm">{alert.alertName}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <time dateTime={alert.activeAt} title={activeAt.toLocaleString()}>
            {activeAt.toLocaleTimeString()}
          </time>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{alert.summary}</p>

      <div className="flex items-center gap-3 flex-wrap">
        {alert.pluginId && (
          <button
            onClick={() => onViewPlugin(alert.pluginId!)}
            className="text-xs text-primary underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={`View metrics for plugin ${alert.pluginId}`}
          >
            View Plugin
          </button>
        )}
        {/* Show top labels */}
        {Object.entries(alert.labels)
          .slice(0, 3)
          .map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
            >
              {k}={v}
            </span>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertHistoryTable
// ---------------------------------------------------------------------------

const SEVERITY_FILTER_OPTIONS: Array<{ value: AlertSeverity | 'all'; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

function formatDuration(firedAt: string, resolvedAt: string | null): string {
  if (!resolvedAt) return 'Ongoing';
  const ms = new Date(resolvedAt).getTime() - new Date(firedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function AlertHistoryTable() {
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const perPage = 10;

  const { data, isLoading, isError, error } = useAlertHistory(page, perPage);

  const filteredAlerts: AlertHistoryEntry[] =
    severityFilter === 'all'
      ? (data?.alerts ?? [])
      : (data?.alerts ?? []).filter((a) => a.severity === severityFilter);

  const totalPages = data?.pagination.totalPages ?? 1;

  const handlePrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const handleNext = useCallback(() => setPage((p) => Math.min(totalPages, p + 1)), [totalPages]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Alert History</CardTitle>
          {/* Severity filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="history-severity-filter" className="text-xs text-muted-foreground">
              Severity:
            </label>
            <select
              id="history-severity-filter"
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value as AlertSeverity | 'all');
                setPage(1);
              }}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SEVERITY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading alert history…">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            Failed to load alert history: {error?.message ?? 'Unknown error'}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No alerts in history.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Alert history">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Alert
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
                      className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                    >
                      Fired At
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Duration
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((entry, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium max-w-[180px] truncate">
                        {entry.alertName}
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={entry.severity} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {entry.pluginId ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <time dateTime={entry.firedAt}>
                          {new Date(entry.firedAt).toLocaleString()}
                        </time>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {formatDuration(entry.firedAt, entry.resolvedAt)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.resolvedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            Firing
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                <span className="text-muted-foreground text-xs">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page <= 1}
                    onClick={handlePrev}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page >= totalPages}
                    onClick={handleNext}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AlertsTab
// ---------------------------------------------------------------------------

export default function AlertsTab() {
  const { data, isLoading, isError, error } = useActiveAlerts();
  const navigate = useNavigate();

  const handleViewPlugin = useCallback(
    (pluginId: string) => {
      void navigate({
        search: { tab: 'metrics', plugin: pluginId } as never,
        replace: true,
      });
    },
    [navigate]
  );

  const alerts = data?.alerts ?? [];

  // Sort: critical first, then warning, then info; within each group oldest first
  const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const sortedAlerts = [...alerts].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.activeAt).getTime() - new Date(b.activeAt).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Active alerts section */}
      <section aria-label="Active alerts">
        <h2 className="text-sm font-semibold mb-3">
          Active Alerts
          {data && data.total > 0 && (
            <span className="ml-2 rounded-full bg-destructive/10 text-destructive text-xs px-2 py-0.5">
              {data.total}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading active alerts…">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            Failed to load active alerts: {error?.message ?? 'Unknown error'}
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div
            className="flex items-center gap-2 rounded-lg border border-green-300/50 bg-green-50/50 dark:bg-green-950/20 p-4 text-sm text-green-700"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            All systems operational — no active alerts.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAlerts.map((alert, i) => (
              <ActiveAlertCard
                key={`${alert.alertName}-${i}`}
                alert={alert}
                onViewPlugin={handleViewPlugin}
              />
            ))}
          </div>
        )}
      </section>

      {/* Alert history section */}
      <section aria-label="Alert history">
        <AlertHistoryTable />
      </section>
    </div>
  );
}
