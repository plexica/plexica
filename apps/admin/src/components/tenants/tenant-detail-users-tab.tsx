// tenant-detail-users-tab.tsx — Users tab content for the tenant detail page.
// Read-only cross-schema aggregates (userCount, workspaceCount) per FR 005-03.

import { FormattedMessage } from 'react-intl';
import { Users, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TenantDetail } from '../../types/admin-types.js';

interface TenantDetailUsersTabProps {
  detail: TenantDetail;
}

interface CountCardProps {
  icon: ReactNode;
  labelId: string;
  value: number;
}

function CountCard({ icon, labelId, value }: CountCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2 text-neutral-500">
        <span className="text-neutral-400" aria-hidden="true">{icon}</span>
        <span className="text-sm font-medium">
          <FormattedMessage id={labelId} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

export function TenantDetailUsersTab({ detail }: TenantDetailUsersTabProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">
        <FormattedMessage id="tenant.users.title" values={{ name: detail.tenant.name }} />
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CountCard
          icon={<Users className="h-5 w-5" />}
          labelId="tenant.users.totalUsers"
          value={detail.userCount}
        />
        <CountCard
          icon={<Workflow className="h-5 w-5" />}
          labelId="tenant.fields.workspaceCount"
          value={detail.workspaceCount}
        />
      </div>
      <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
        <FormattedMessage id="tenant.users.note" />
      </p>
    </section>
  );
}
