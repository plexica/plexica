// role-management-page.tsx
// Shows role cards and the permission action matrix.

import { FormattedMessage } from 'react-intl';

import { useRoles, useActionMatrix } from '../hooks/use-roles.js';
import { RoleCard } from '../components/user/role-card.js';
import { ActionMatrixTable } from '../components/user/action-matrix-table.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

function RoleManagementSkeleton(): JSX.Element {
  return (
    <div className="space-y-8 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" className="h-32" />
        ))}
      </div>
      <SkeletonLoader variant="card" className="h-56" />
    </div>
  );
}

export function RoleManagementPage(): JSX.Element {
  const { data: rolesData, isPending: rolesLoading, isError: rolesError, refetch: refetchRoles } = useRoles();
  const { data: matrixData, isPending: matrixLoading, isError: matrixError, refetch: refetchMatrix } = useActionMatrix();

  const isLoading = rolesLoading || matrixLoading;
  const isError = rolesError || matrixError;

  if (isLoading) return <RoleManagementSkeleton />;
  if (isError) {
    return (
      <div className="p-6">
        <PageError
          onRetry={() => {
            void refetchRoles();
            void refetchMatrix();
          }}
        />
      </div>
    );
  }

  const roles = rolesData ?? [];
  const matrix = matrixData ?? [];

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="roles.title" />
      </h1>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <RoleCard key={r.name} role={r} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">
          <FormattedMessage id="roles.matrix.title" />
        </h2>
        <ActionMatrixTable rows={matrix} />
      </section>
    </div>
  );
}
