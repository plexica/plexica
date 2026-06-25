// workspace-list-page.tsx
// Lists all workspaces with status filter and create action.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Plus, LayoutGrid } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button, Badge, Pagination } from '@plexica/ui';

import { useWorkspaces } from '../hooks/use-workspaces.js';
import { CreateWorkspaceDialog } from '../components/workspace/create-workspace-dialog.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

const PAGE_SIZE = 20;

function WorkspaceListSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <div className="flex items-center justify-between">
        <SkeletonLoader className="h-8 w-40" />
        <SkeletonLoader className="h-9 w-36 rounded-md" />
      </div>
      <div className="flex gap-2">
        <SkeletonLoader className="h-7 w-16 rounded-full" />
        <SkeletonLoader className="h-7 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" className="h-14" />
        ))}
      </div>
    </div>
  );
}

export function WorkspaceListPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'active' | 'archived' | undefined>('active');
  const [showCreate, setShowCreate] = useState(false);

  const filters = status !== undefined ? { page, status } : { page };
  const { data, isPending, isError, refetch } = useWorkspaces(filters);

  if (isPending) return <WorkspaceListSkeleton />;
  if (isError) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const workspaces = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="workspace.list.title" />
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="workspace.create.title" />
        </Button>
      </div>

      <div className="flex gap-2">
        {(['active', 'archived'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? undefined : s)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              status === s
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {s === 'active'
              ? intl.formatMessage({ id: 'workspace.status.active' })
              : intl.formatMessage({ id: 'workspace.status.archived' })}
          </button>
        ))}
      </div>

      {workspaces.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          heading={<FormattedMessage id="workspace.list.empty" />}
          description={<FormattedMessage id="workspace.create.title" />}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              <FormattedMessage id="workspace.create.title" />
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {workspaces.map((ws) => {
            // TanStack Router route tree not yet generated — pending full codegen (TD-003)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wsTo = '/workspaces/$workspaceId' as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wsParams = { workspaceId: ws.id } as any;
            return (
              <li
                key={ws.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
              >
                <Link
                  to={wsTo}
                  params={wsParams}
                  className="font-medium text-neutral-900 hover:text-primary-600"
                >
                  {ws.name}
                </Link>
                <Badge
                  variant={ws.status === 'active' ? 'success' : 'default'}
                  label={
                    ws.status === 'active'
                      ? intl.formatMessage({ id: 'workspace.status.active' })
                      : intl.formatMessage({ id: 'workspace.status.archived' })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      <CreateWorkspaceDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
