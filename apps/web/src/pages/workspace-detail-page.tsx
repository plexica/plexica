// workspace-detail-page.tsx
// Shows workspace details with members and children tabs.

import { useIntl, FormattedMessage } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { Users, FolderOpen } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Tabs, Badge } from '@plexica/ui';

import { useWorkspace } from '../hooks/use-workspaces.js';
import { useWorkspaceMembers } from '../hooks/use-workspace-members.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

function TabContentSkeleton(): JSX.Element {
  return (
    <div className="space-y-2 pt-2" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonLoader key={i} variant="card" className="h-12" />
      ))}
    </div>
  );
}

function MembersTab({ workspaceId }: { workspaceId: string }): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError, refetch } = useWorkspaceMembers(workspaceId);

  if (isPending) return <TabContentSkeleton />;
  if (isError) return <PageError onRetry={() => void refetch()} />;

  const members = data?.data ?? [];
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        heading={<FormattedMessage id="workspace.members.empty" />}
        description={<FormattedMessage id="workspace.members.empty.description" />}
      />
    );
  }

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
            label={
              m.role === 'admin'
                ? intl.formatMessage({ id: 'members.role.admin' })
                : m.role === 'viewer'
                  ? intl.formatMessage({ id: 'members.role.viewer' })
                  : intl.formatMessage({ id: 'members.role.member' })
            }
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
      <EmptyState
        icon={FolderOpen}
        heading={<FormattedMessage id="workspace.children.empty" />}
        description={<FormattedMessage id="workspace.children.empty.description" />}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {workspace.children.map((child) => {
        // TanStack Router route tree not yet generated — pending full codegen (TD-003)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wsTo = '/workspaces/$workspaceId' as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wsParams = { workspaceId: child.id } as any;
        return (
          <li
            key={child.id}
            className="rounded-lg border border-neutral-200 bg-white p-3"
          >
            <Link
              to={wsTo}
              params={wsParams}
              className="text-sm font-medium text-neutral-900 hover:text-primary-600"
            >
              {child.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function WorkspaceDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <div className="flex items-center gap-3">
        <SkeletonLoader className="h-8 w-48" />
        <SkeletonLoader className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonLoader variant="card" className="h-48" />
    </div>
  );
}

export function WorkspaceDetailPage(): JSX.Element {
  const intl = useIntl();
  const id = useWorkspaceId();
  const { data, isPending, isError, refetch } = useWorkspace(id);

  if (isPending) return <WorkspaceDetailSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

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
