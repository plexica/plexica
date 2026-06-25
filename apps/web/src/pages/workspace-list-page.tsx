// workspace-list-page.tsx
// Lists all workspaces with status filter via InlineFilter and create action.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Plus, LayoutGrid } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button, Badge, Pagination, InlineFilter } from '@plexica/ui';

import { useWorkspaces } from '../hooks/use-workspaces.js';
import { CreateWorkspaceDialog } from '../components/workspace/create-workspace-dialog.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

import type { FilterValues } from '@plexica/ui';

function WorkspaceListSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <div className="flex items-center justify-between">
        <SkeletonLoader className="h-8 w-40" />
        <SkeletonLoader className="h-9 w-36 rounded-md" />
      </div>
      <SkeletonLoader className="h-10 w-48 rounded-md" />
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
  const [filterValues, setFilterValues] = useState<FilterValues>({ status: 'active' });
  const [showCreate, setShowCreate] = useState(false);

  const status = filterValues.status as 'active' | 'archived' | undefined;
  const filters = status !== undefined ? { page, status } : { page };

  const { data, isPending, isError, refetch } = useWorkspaces(filters);

  const filterDefs = [
    {
      key: 'status',
      label: intl.formatMessage({ id: 'common.status' }),
      type: 'select' as const,
      options: [
        { value: '', label: intl.formatMessage({ id: 'workspace.status.all' }) },
        { value: 'active', label: intl.formatMessage({ id: 'workspace.status.active' }) },
        { value: 'archived', label: intl.formatMessage({ id: 'workspace.status.archived' }) },
      ],
    },
  ];

  function handleFilterChange(values: FilterValues): void {
    setPage(1);
    setFilterValues(values);
  }

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

      <InlineFilter
        filters={filterDefs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      {workspaces.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          heading={<FormattedMessage id="workspace.list.empty" />}
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
                <div className="min-w-0">
                  <Link
                    to={wsTo}
                    params={wsParams}
                    className="font-medium text-neutral-900 hover:text-primary-600"
                  >
                    {ws.name}
                  </Link>
                  {ws.description !== null && (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{ws.description}</p>
                  )}
                </div>
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
