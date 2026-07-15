// dashboard-page.tsx — Super-admin dashboard (S5-B01, FR 005-01).
// Polls /admin/dashboard/metrics every 30s via TanStack Query (useDashboardMetrics).
// Renders KPI cards, overall health indicator, tenant status breakdown chips,
// and quick-action navigation cards. Loading → skeletons, error → banner + retry.
// totalUsers/workspaceCount show "Unavailable" when null (MED-3 review fix).
// All strings via react-intl; icons via Lucide (no emoji).

import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Building2, CheckCircle2, Layers, Loader2, MailWarning, Plug, ServerCog, Users } from 'lucide-react';

import { HealthIndicator } from '../components/dashboard/health-indicator.js';
import { KpiCard } from '../components/dashboard/kpi-card.js';
import { QuickActionCard } from '../components/dashboard/quick-action-card.js';
import { TenantStatusChips } from '../components/dashboard/tenant-status-chips.js';
import { useDashboardMetrics } from '../hooks/use-dashboard.js';

const SKELETON_CARDS = 6;

export function DashboardPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useDashboardMetrics();
  const intl = useIntl();

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">
          <FormattedMessage id="dashboard.title" />
        </h1>
        {!isLoading && !isError && data && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-600">
              <FormattedMessage id="dashboard.health.status" />
            </span>
            <HealthIndicator status={data.healthStatus} />
          </div>
        )}
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <FormattedMessage id="dashboard.error" />
          </p>
          {error instanceof Error && <p className="mt-1 text-red-700">{error.message}</p>}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            <FormattedMessage id="dashboard.retry" />
          </button>
        </div>
      )}

      {isLoading && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label={intl.formatMessage({ id: 'dashboard.loading' })}
        >
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100" />
          ))}
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.tenants' })}
              value={data.tenantCount}
              icon={Building2}
            />
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.activeTenants' })}
              value={data.activeTenantCount}
              icon={CheckCircle2}
            />
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.plugins' })}
              value={data.pluginCount}
              icon={Plug}
              subtext={intl.formatMessage({ id: 'dashboard.metrics.activePlugins' }, { count: data.activePluginCount })}
            />
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.dlqDepth' })}
              value={data.dlqDepth}
              icon={MailWarning}
            />
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.totalUsers' })}
              value={data.totalUsers ?? intl.formatMessage({ id: 'dashboard.metrics.unavailable' })}
              icon={Users}
            />
            <KpiCard
              label={intl.formatMessage({ id: 'dashboard.metrics.workspaceCount' })}
              value={data.workspaceCount ?? intl.formatMessage({ id: 'dashboard.metrics.unavailable' })}
              icon={Layers}
            />
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">
              <FormattedMessage id="dashboard.tenantStatus.title" />
            </h2>
            <TenantStatusChips
              active={data.activeTenantCount}
              suspended={data.suspendedTenantCount}
              pendingDeletion={data.pendingDeletionCount}
              deleted={Math.max(0, data.tenantCount - data.activeTenantCount - data.suspendedTenantCount - data.pendingDeletionCount)}
            />
          </div>
        </>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          <FormattedMessage id="dashboard.quickActions.title" />
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickActionCard to="/provision" labelId="dashboard.quickActions.provision" icon={Building2} />
          <QuickActionCard to="/health" labelId="dashboard.quickActions.health" icon={ServerCog} />
          <QuickActionCard to="/logs" labelId="dashboard.quickActions.logs" icon={Layers} />
        </div>
        {isLoading && (
          <p className="inline-flex items-center gap-1 text-xs text-neutral-500" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            <FormattedMessage id="dashboard.loading" />
          </p>
        )}
      </div>
    </section>
  );
}
