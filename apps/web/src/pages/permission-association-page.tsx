// permission-association-page.tsx
// Workspace-level permission panel: shows member roles for a specific workspace.

import { FormattedMessage } from 'react-intl';
import { useParams } from '@tanstack/react-router';

import { PermissionAssociationPanel } from '../components/user/permission-association-panel.js';

function useRoleId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).roleId ?? '';
}

export function PermissionAssociationPage(): JSX.Element {
  const roleId = useRoleId();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="members.title" />
      </h1>
      <PermissionAssociationPanel workspaceId={roleId} />
    </div>
  );
}
