// health-page.tsx — System health dashboard (S5-103, FR 005-09).
// Polls /admin/health every 10s via TanStack Query (useHealth hook).
// Renders a grid of ServiceStatusCard components. Loading → skeletons,
// error → inline banner with retry. All strings via react-intl.

import { FormattedMessage, useIntl } from 'react-intl';

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
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label={intl.formatMessage({ id: 'admin.health.loading' })}
        >
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100"
            />
          ))}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">
            <FormattedMessage id="admin.health.error" />
          </p>
          {error instanceof Error && <p className="mt-1 text-red-700">{error.message}</p>}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            <FormattedMessage id="admin.health.retry" />
          </button>
        </div>
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
