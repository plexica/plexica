// workspace-members-page.tsx
// Shows workspace members with add/invite, role change, and remove actions.
// All destructive actions guarded by ConfirmDialog.
// Role labels localized via react-intl.

import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { UserPlus, Users } from 'lucide-react';
import {
  Button,
  Select,
  Badge,
  ConfirmDialog,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@plexica/ui';

import {
  useWorkspaceMembers,
  useRemoveWorkspaceMember,
  useChangeMemberRole,
} from '../hooks/use-workspace-members.js';
import { AddMemberDialog } from '../components/user/add-member-dialog.js';
import { useInvitations } from '../hooks/use-invitations.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

function MembersSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <div className="flex items-center justify-between">
        <SkeletonLoader className="h-8 w-28" />
        <SkeletonLoader className="h-9 w-36 rounded-md" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function WorkspaceMembersPage(): JSX.Element {
  const intl = useIntl();
  const workspaceId = useWorkspaceId();
  const [showInvite, setShowInvite] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useWorkspaceMembers(workspaceId);
  const { data: invData } = useInvitations(workspaceId);
  const { mutate: removeM, isPending: isRemoving } = useRemoveWorkspaceMember();
  const { mutate: changeRole, isError: isRoleError } = useChangeMemberRole();

  // Role options localized via react-intl (not hardcoded English)
  const roleOptions = [
    { value: 'admin', label: intl.formatMessage({ id: 'members.role.admin' }) },
    { value: 'member', label: intl.formatMessage({ id: 'members.role.member' }) },
    { value: 'viewer', label: intl.formatMessage({ id: 'members.role.viewer' }) },
  ];

  if (isPending) return <MembersSkeleton />;
  if (isError) {
    return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;
  }

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

      {/* Role change error — shown inline above the table */}
      {isRoleError && (
        <p role="alert" className="text-sm text-error">
          <FormattedMessage id="common.error" />
        </p>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          heading={<FormattedMessage id="workspace.members.empty" />}
          description={<FormattedMessage id="workspace.members.empty.description" />}
          action={
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              <FormattedMessage id="members.invite" />
            </Button>
          }
        />
      ) : (
        <Table aria-label={intl.formatMessage({ id: 'members.title' })}>
          <TableHeader>
            <TableRow>
              <TableHead><FormattedMessage id="profile.displayName.label" /></TableHead>
              <TableHead className="hidden sm:table-cell">
                <FormattedMessage id="login.email.label" />
              </TableHead>
              <TableHead><FormattedMessage id="members.role.member" /></TableHead>
              <TableHead>
                <span className="sr-only"><FormattedMessage id="common.actions" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>
                  <div>
                    <p className="font-medium text-neutral-900">{m.displayName ?? m.email}</p>
                    <p className="text-xs text-neutral-500 sm:hidden">{m.email}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden text-neutral-600 sm:table-cell">{m.email}</TableCell>
                <TableCell>
                  <Select
                    options={roleOptions}
                    value={m.role}
                    onValueChange={(v) => changeRole({ workspaceId, userId: m.userId, role: v })}
                    aria-label={intl.formatMessage({ id: 'members.role.member' })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setRemoveTargetId(m.userId)}
                    aria-label={intl.formatMessage({ id: 'members.remove.confirm.title' })}
                  >
                    <FormattedMessage id="common.delete" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
                  <Badge variant="pending" label={intl.formatMessage({ id: 'members.invitation.pending' })} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <AddMemberDialog workspaceId={workspaceId} open={showInvite} onOpenChange={setShowInvite} />

      {/* Confirmation dialog for member removal */}
      <ConfirmDialog
        open={removeTargetId !== null}
        onOpenChange={(open) => { if (!open) setRemoveTargetId(null); }}
        title={intl.formatMessage({ id: 'members.remove.confirm.title' })}
        description={intl.formatMessage({ id: 'members.remove.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.delete' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        variant="destructive"
        onConfirm={() => {
          if (removeTargetId === null) return;
          removeM(
            { workspaceId, userId: removeTargetId },
            { onSuccess: () => setRemoveTargetId(null) },
          );
        }}
        loading={isRemoving}
      />
    </div>
  );
}
