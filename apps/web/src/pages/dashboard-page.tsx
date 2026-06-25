// dashboard-page.tsx
// Main dashboard page — shows user greeting and KPI stat cards.
// Uses useCurrentUser() for greeting and useDashboardStats() for real counts.
// Each KPI card has an independent loading state to avoid all-or-nothing rendering.

import { Activity } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { useCurrentUser } from '../hooks/use-current-user.js';
import { useDashboardStats } from '../hooks/use-dashboard-stats.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';

// KPI card: renders a skeleton inside the card shell while loading,
// so the layout never shifts between loading and loaded states.
interface StatCardProps {
  labelId: string;
  value: string | number | undefined;
  isLoading?: boolean;
  isUnavailable?: boolean;
}

function StatCard({ labelId, value, isLoading = false, isUnavailable = false }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-neutral-500">
        <FormattedMessage id={labelId} />
      </p>
      {isLoading ? (
        <SkeletonLoader className="mt-2 h-8 w-1/3" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-neutral-900">
          {isUnavailable || value === undefined ? '—' : value}
        </p>
      )}
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const {
    workspaceCount,
    userCount,
    isWorkspaceLoading,
    isUserLoading: isUsersLoading,
  } = useDashboardStats();

  return (
    <div className="space-y-6 p-6">
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-neutral-900">
        {isUserLoading ? (
          <SkeletonLoader className="h-8 w-64" />
        ) : (
          <FormattedMessage id="dashboard.greeting" values={{ firstName: user?.firstName ?? '' }} />
        )}
      </h1>

      {/* KPI Grid — each card loads independently */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          labelId="dashboard.stats.users"
          value={userCount}
          isLoading={isUsersLoading}
        />
        <StatCard
          labelId="dashboard.stats.workspaces"
          value={workspaceCount}
          isLoading={isWorkspaceLoading}
        />
        <StatCard
          labelId="dashboard.stats.plugins"
          value={undefined}
          isUnavailable
        />
        <StatCard
          labelId="dashboard.stats.storage"
          value={undefined}
          isUnavailable
        />
      </div>

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
