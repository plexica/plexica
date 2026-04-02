// dashboard-page.tsx
// Main dashboard page — shows user greeting and stat cards.
// Uses useCurrentUser() hook for TanStack Query data fetching.

import { Activity } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { useCurrentUser } from '../hooks/use-current-user.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';

export function DashboardPage(): JSX.Element {
  const { user, isLoading } = useCurrentUser();

  return (
    <div className="space-y-6 p-6">
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-neutral-900">
        {isLoading ? (
          <SkeletonLoader variant="text" />
        ) : (
          <FormattedMessage id="dashboard.greeting" values={{ firstName: user?.firstName ?? '' }} />
        )}
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)
        ) : (
          <>
            <StatCard labelId="dashboard.stats.users" value="—" />
            <StatCard labelId="dashboard.stats.workspaces" value="—" />
            <StatCard labelId="dashboard.stats.plugins" value="—" />
            <StatCard labelId="dashboard.stats.storage" value="—" />
          </>
        )}
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

interface StatCardProps {
  labelId: string;
  value: string;
}

function StatCard({ labelId, value }: StatCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-neutral-500">
        <FormattedMessage id={labelId} />
      </p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}
