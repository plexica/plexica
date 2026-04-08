// role-card.tsx
// Card component for displaying a role's name, scope and description.

import { Shield } from 'lucide-react';
import { Badge } from '@plexica/ui';

import type { Role } from '../../types/user-management.js';

interface RoleCardProps {
  role: Role;
}

export function RoleCard({ role }: RoleCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <h3 className="font-medium text-neutral-900">{role.name}</h3>
        </div>
        <Badge
          variant={role.scope === 'tenant' ? 'admin' : 'member'}
          label={role.scope === 'tenant' ? 'Tenant' : 'Workspace'}
        />
      </div>
      <p className="mt-1 text-sm text-neutral-500">{role.description}</p>
      <p className="mt-2 text-xs text-neutral-400">{role.actionCount} actions</p>
    </div>
  );
}
