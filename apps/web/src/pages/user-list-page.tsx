// user-list-page.tsx
// Paginated list of tenant users with search and remove action.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Users } from 'lucide-react';
import { Button, Input, Pagination } from '@plexica/ui';

import { useUsers } from '../hooks/use-users.js';
import { RemoveUserDialog } from '../components/user/remove-user-dialog.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { EmptyState } from '../components/feedback/empty-state.js';
import { PageError } from '../components/feedback/page-error.js';

function UserListSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-24" />
      <SkeletonLoader className="h-9 w-full max-w-sm rounded-md" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" className="h-14" />
        ))}
      </div>
    </div>
  );
}

export function UserListPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  const filters = search ? { page, search } : { page };
  const { data, isPending, isError, refetch } = useUsers(filters);

  if (isPending) return <UserListSkeleton />;
  if (isError) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const users = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="users.title" />
      </h1>

      <div className="max-w-sm">
        <Input
          type="search"
          placeholder={intl.formatMessage({ id: 'users.search.placeholder' })}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label={intl.formatMessage({ id: 'common.search' })}
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          heading={<FormattedMessage id="users.list.empty" />}
          description={<FormattedMessage id="users.list.empty.description" />}
        />
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.userId}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{u.displayName ?? u.email}</p>
                {u.displayName !== null && u.displayName !== undefined && (
                  <p className="text-xs text-neutral-500">{u.email}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRemoveUserId(u.userId)}>
                <FormattedMessage id="common.delete" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      {removeUserId !== null && (
        <RemoveUserDialog
          userId={removeUserId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setRemoveUserId(null);
          }}
        />
      )}
    </div>
  );
}
