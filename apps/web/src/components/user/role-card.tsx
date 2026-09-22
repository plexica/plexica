// role-card.tsx
// Card component for displaying a role's name, scope and description.

import { useIntl } from 'react-intl';
import { Shield } from 'lucide-react';
import { Badge } from '@plexica/ui';

import type { Role } from '../../types/user-management.js';

interface RoleCardProps {
  role: Role;
}

export function RoleCard({ role }: RoleCardProps): JSX.Element {
  const intl = useIntl();
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <h3 className="font-medium text-neutral-900">{role.name}</h3>
        </div>
        <Badge
          variant={role.scope === 'tenant' ? 'admin' : 'member'}
          label={intl.formatMessage({
            id: role.scope === 'tenant' ? 'roles.scope.tenant' : 'roles.scope.workspace',
          })}
        />
      </div>
      <p className="mt-1 text-sm text-neutral-500">{role.description}</p>
      <p className="mt-2 text-xs text-neutral-500">
        {intl.formatMessage({ id: 'roles.actionCount' }, { count: role.actionCount })}
      </p>
    </div>
  );
}
