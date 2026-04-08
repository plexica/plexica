// permission-association-panel.tsx
// Lists workspace members with inline role selector.
// Calls useChangeMemberRole on role change.

import { FormattedMessage, useIntl } from 'react-intl';
import { Select } from '@plexica/ui';

import { useWorkspaceMembers, useChangeMemberRole } from '../../hooks/use-workspace-members.js';

interface PermissionAssociationPanelProps {
  workspaceId: string;
}

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export function PermissionAssociationPanel({
  workspaceId,
}: PermissionAssociationPanelProps): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError } = useWorkspaceMembers(workspaceId);
  const { mutate: changeRole } = useChangeMemberRole();

  if (isPending) {
    return (
      <div aria-live="polite" className="text-sm text-neutral-500">
        <FormattedMessage id="common.loading" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="text-sm text-error">
        <FormattedMessage id="common.error" />
      </div>
    );
  }

  const members = data?.data ?? [];

  if (members.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        <FormattedMessage id="common.noData" />
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {members.map((m) => (
        <li key={m.userId} className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900">
              {m.displayName ?? m.email}
            </p>
            <p className="truncate text-xs text-neutral-500">{m.email}</p>
          </div>
          <Select
            options={roleOptions}
            value={m.role}
            onValueChange={(v) => changeRole({ workspaceId, userId: m.userId, role: v })}
            aria-label={intl.formatMessage({ id: 'members.role.member' })}
          />
        </li>
      ))}
    </ul>
  );
}
