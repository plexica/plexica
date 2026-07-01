// dashboard-page.tsx
// Main dashboard page — KPI stat cards with real data + per-card error/loading states.

import { Activity } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { RefreshCw } from 'lucide-react';

import { useCurrentUser } from '../hooks/use-current-user.js';
import { useDashboardStats } from '../hooks/use-dashboard-stats.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { DashboardWidgetSlot } from '../mf-host/extension-slots/dashboard-widget-slot.js';

// ─── StatCard ────────────────────────────────────────────────────────────────
// Independent per-card states: loading, error (with retry), value, or unavailable.

interface StatCardProps {
  labelId: string;
  value: string | number | undefined;
  isLoading?: boolean;
  isError?: boolean;
  isUnavailable?: boolean;
  onRetry?: () => void;
}

function StatCard({
  labelId,
  value,
  isLoading = false,
  isError = false,
  isUnavailable = false,
  onRetry,
}: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-neutral-500">
        <FormattedMessage id={labelId} />
      </p>
      {isLoading ? (
        <SkeletonLoader className="mt-2 h-8 w-1/3" />
      ) : isError ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-error">
            <FormattedMessage id="common.error" />
          </span>
          {onRetry !== undefined && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label="Retry"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <p className="mt-1 text-2xl font-bold text-neutral-900">
          {isUnavailable || value === undefined ? '—' : value}
        </p>
      )}
    </div>
  );
}

// ─── DashboardPage ───────────────────────────────────────────────────────────

export function DashboardPage(): JSX.Element {
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const {
    workspaceCount,
    userCount,
    isWorkspaceLoading,
    isUserLoading: isUsersLoading,
    isWorkspaceError,
    isUserError,
    refetchWorkspaces,
    refetchUsers,
  } = useDashboardStats();

  return (
    <div className="space-y-6 p-6">
      {/* Greeting */}
      {isUserLoading ? (
        <SkeletonLoader className="h-8 w-64" />
      ) : (
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="dashboard.greeting" values={{ firstName: user?.firstName ?? '' }} />
        </h1>
      )}

      {/* KPI Grid — each card loads and errors independently */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          labelId="dashboard.stats.users"
          value={userCount}
          isLoading={isUsersLoading}
          isError={isUserError}
          onRetry={refetchUsers}
        />
        <StatCard
          labelId="dashboard.stats.workspaces"
          value={workspaceCount}
          isLoading={isWorkspaceLoading}
          isError={isWorkspaceError}
          onRetry={refetchWorkspaces}
        />
        <StatCard labelId="dashboard.stats.plugins" value={undefined} isUnavailable />
        <StatCard labelId="dashboard.stats.storage" value={undefined} isUnavailable />
      </div>

      {/* Plugin widget extension point — dashboard-widget:grid slot */}
      <DashboardWidgetSlot pluginEntries={[]} />

      {/* Recent Activity */}
      <section aria-label="Recent activity">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">
          <FormattedMessage id="dashboard.activity.title" />
        </h2>
        <EmptyState
          icon={Activity}
          heading={<FormattedMessage id="dashboard.activity.empty.heading" />}
          description={<FormattedMessage id="dashboard.activity.empty.description" />}
        />
      </section>
    </div>
  );
}
