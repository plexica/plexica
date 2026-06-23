// workspace-members-page.tsx
// Shows workspace members list with add/invite and remove/role-change actions.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { Button, Select, Badge } from '@plexica/ui';

import {
  useWorkspaceMembers,
  useRemoveWorkspaceMember,
  useChangeMemberRole,
} from '../hooks/use-workspace-members.js';
import { AddMemberDialog } from '../components/user/add-member-dialog.js';
import { useInvitations } from '../hooks/use-invitations.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export function WorkspaceMembersPage(): JSX.Element {
  const intl = useIntl();
  const workspaceId = useWorkspaceId();
  const [showInvite, setShowInvite] = useState(false);

  const { data, isPending, isError } = useWorkspaceMembers(workspaceId);
  const { data: invData } = useInvitations(workspaceId);
  const { mutate: removeM, isPending: isRemoving } = useRemoveWorkspaceMember();
  const { mutate: changeRole } = useChangeMemberRole();

  if (isPending)
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  if (isError)
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );

  const members = data?.data ?? [];
  const invitations = invData?.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="members.title" />
        </h1>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="members.invite" />
        </Button>
      </div>

      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">
                {m.displayName ?? m.email}
              </p>
              <p className="truncate text-xs text-neutral-500">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                options={roleOptions}
                value={m.role}
                onValueChange={(v) => changeRole({ workspaceId, userId: m.userId, role: v })}
                aria-label={intl.formatMessage({ id: 'members.role.member' })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeM({ workspaceId, userId: m.userId })}
                disabled={isRemoving}
                aria-label={intl.formatMessage({ id: 'members.remove.confirm.title' })}
              >
                <FormattedMessage id="common.delete" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {invitations.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">
            <FormattedMessage id="members.invitation.pending" />
          </h2>
          <ul className="space-y-2">
            {invitations
              .filter((i) => i.status === 'pending')
              .map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-neutral-300 bg-white p-3"
                >
                  <span className="text-sm text-neutral-600">{inv.email}</span>
                  <Badge
                    variant="pending"
                    label={intl.formatMessage({ id: 'members.invitation.pending' })}
                  />
                </li>
              ))}
          </ul>
        </section>
      )}

      <AddMemberDialog workspaceId={workspaceId} open={showInvite} onOpenChange={setShowInvite} />
    </div>
  );
}
