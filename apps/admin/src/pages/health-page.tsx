// health-page.tsx — System health dashboard (S5-103, FR 005-09).
// Polls /admin/health every 10s via TanStack Query (useHealth hook).
// Renders a grid of ServiceStatusCard components. Loading → skeletons,
// error → inline banner with retry. All strings via react-intl.

import { FormattedMessage, useIntl } from 'react-intl';
import { CardGridSkeleton, ErrorState } from '@plexica/ui';

import { ServiceStatusCard } from '../components/health/service-status-card.js';
import { useHealth } from '../hooks/use-health.js';

const SKELETON_COUNT = 5;

export function HealthPage(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useHealth();
  const intl = useIntl();

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">
        <FormattedMessage id="admin.health.title" />
      </h1>

      {isLoading && (
        <CardGridSkeleton
          count={SKELETON_COUNT}
          ariaLabel={intl.formatMessage({ id: 'admin.health.loading' })}
        />
      )}

      {isError && (
        <ErrorState
          heading={<FormattedMessage id="admin.health.error" />}
          description={error instanceof Error ? error.message : undefined}
          retryLabel={<FormattedMessage id="admin.health.retry" />}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.services.map((svc) => (
            <ServiceStatusCard
              key={svc.name}
              name={svc.name}
              status={svc.status}
              latencyMs={svc.latencyMs}
            />
          ))}
        </div>
      )}
    </section>
  );
}
