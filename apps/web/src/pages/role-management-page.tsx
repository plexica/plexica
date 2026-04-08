// role-management-page.tsx
// Shows role cards and the permission action matrix.

import { FormattedMessage } from 'react-intl';

import { useRoles, useActionMatrix } from '../hooks/use-roles.js';
import { RoleCard } from '../components/user/role-card.js';
import { ActionMatrixTable } from '../components/user/action-matrix-table.js';

export function RoleManagementPage(): JSX.Element {
  const { data: rolesData, isPending: rolesLoading, isError: rolesError } = useRoles();
  const { data: matrixData, isPending: matrixLoading, isError: matrixError } = useActionMatrix();

  const isLoading = rolesLoading || matrixLoading;
  const isError = rolesError || matrixError;

  if (isLoading) {
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );
  }

  const roles = rolesData?.data ?? [];
  const matrix = matrixData?.data ?? [];

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="roles.title" />
      </h1>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <RoleCard key={r.id} role={r} />
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
