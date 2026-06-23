// workspace-detail-page.tsx
// Shows workspace details with members and children tabs.

import { useIntl, FormattedMessage } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { Tabs, Badge } from '@plexica/ui';

import { useWorkspace } from '../hooks/use-workspaces.js';
import { useWorkspaceMembers } from '../hooks/use-workspace-members.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

function MembersTab({ workspaceId }: { workspaceId: string }): JSX.Element {
  const { data, isPending, isError } = useWorkspaceMembers(workspaceId);

  if (isPending)
    return (
      <p className="text-sm text-neutral-500">
        <FormattedMessage id="common.loading" />
      </p>
    );
  if (isError)
    return (
      <p className="text-sm text-error" role="alert">
        <FormattedMessage id="common.error" />
      </p>
    );

  const members = data?.data ?? [];
  if (members.length === 0)
    return (
      <p className="text-sm text-neutral-500">
        <FormattedMessage id="common.noData" />
      </p>
    );

  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li
          key={m.userId}
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
        >
          <div>
            <p className="text-sm font-medium text-neutral-900">{m.displayName ?? m.email}</p>
            <p className="text-xs text-neutral-500">{m.email}</p>
          </div>
          <Badge
            variant={m.role === 'admin' ? 'admin' : m.role === 'viewer' ? 'viewer' : 'member'}
            label={m.role}
          />
        </li>
      ))}
    </ul>
  );
}

function ChildrenTab({
  workspace,
}: {
  workspace: { children: Array<{ id: string; name: string }> };
}): JSX.Element {
  if (workspace.children.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        <FormattedMessage id="common.noData" />
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {workspace.children.map((child) => (
        <li
          key={child.id}
          className="rounded-lg border border-neutral-200 bg-white p-3 text-sm font-medium text-neutral-900"
        >
          {child.name}
        </li>
      ))}
    </ul>
  );
}

export function WorkspaceDetailPage(): JSX.Element {
  const intl = useIntl();
  const id = useWorkspaceId();
  const { data, isPending, isError } = useWorkspace(id);

  if (isPending) {
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  }

  if (isError || data === undefined) {
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );
  }

  // Backend returns WorkspaceDetail directly (no { data } wrapper)
  const ws = data;

  const tabs = [
    {
      value: 'members',
      label: intl.formatMessage({ id: 'workspace.detail.members' }),
      content: <MembersTab workspaceId={id} />,
    },
    {
      value: 'children',
      label: intl.formatMessage({ id: 'workspace.detail.children' }),
      content: <ChildrenTab workspace={ws} />,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">{ws.name}</h1>
        <Badge
          variant={ws.status === 'active' ? 'success' : 'default'}
          label={
            ws.status === 'active'
              ? intl.formatMessage({ id: 'workspace.status.active' })
              : intl.formatMessage({ id: 'workspace.status.archived' })
          }
        />
      </div>
      {ws.description !== null && <p className="text-neutral-600">{ws.description}</p>}
      <Tabs tabs={tabs} />
    </div>
  );
}
