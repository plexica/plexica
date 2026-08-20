// dashboard-page.tsx — Super-admin dashboard (S5-B01, FR 005-01).
// Polls /admin/dashboard/metrics every 30s via TanStack Query (useDashboardMetrics).
// Renders KPI cards, overall health indicator, tenant status breakdown chips,
// and quick-action navigation cards. Loading → skeletons, error → banner + retry.
// totalUsers/workspaceCount show "Unavailable" when null (MED-3 review fix).
// All strings via react-intl; icons via Lucide (no emoji).

import { FormattedMessage, useIntl } from 'react-intl';
import { Building2, CheckCircle2, Layers, Loader2, MailWarning, Plug, ServerCog, Users } from 'lucide-react';
import { CardGridSkeleton, ErrorState } from '@plexica/ui';

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
        <ErrorState
          heading={<FormattedMessage id="dashboard.error" />}
          description={error instanceof Error ? error.message : undefined}
          retryLabel={<FormattedMessage id="dashboard.retry" />}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && (
        <CardGridSkeleton
          count={SKELETON_CARDS}
          ariaLabel={intl.formatMessage({ id: 'dashboard.loading' })}
        />
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
