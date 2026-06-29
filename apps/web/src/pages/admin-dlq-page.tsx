// admin-dlq-page.tsx
// Super admin: view, retry, and dismiss dead letter queue entries.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Pagination, Select } from '@plexica/ui';
import { AlertTriangle } from 'lucide-react';

import { useDlqEntries, useRetryDlq, useDismissDlq } from '../hooks/use-plugins.js';
import { DlqEntryCard } from '../components/plugins/dlq-entry-card.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

const PAGE_SIZE = 20;

export function AdminDlqPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useDlqEntries(
    statusFilter.length > 0
      ? { page, status: statusFilter }
      : { page }
  );

  const { mutate: retryEvent } = useRetryDlq();
  const { mutate: dismissEvent } = useDismissDlq();

  const entries = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.total ?? 0;

  function handleRetry(id: string): void {
    setRetryingIds((prev) => new Set(prev).add(id));
    retryEvent(id, {
      onSettled: () => {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }

  function handleDismiss(id: string): void {
    setDismissingIds((prev) => new Set(prev).add(id));
    dismissEvent(id, {
      onSettled: () => {
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            <FormattedMessage id="admin.dlq.title" />
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            <FormattedMessage id="admin.dlq.total" values={{ count: totalCount }} />
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={statusFilter.length > 0 ? statusFilter : '__all__'}
            onValueChange={(value: string) => { setStatusFilter(value === '__all__' ? '' : value); setPage(1); }}
            options={[
              { value: '__all__', label: intl.formatMessage({ id: 'admin.dlq.filterAll' }) },
              { value: 'pending', label: intl.formatMessage({ id: 'admin.dlq.status.pending' }) },
              { value: 'retried', label: intl.formatMessage({ id: 'admin.dlq.status.retried' }) },
              { value: 'dismissed', label: intl.formatMessage({ id: 'admin.dlq.status.dismissed' }) },
            ]}
            aria-label={intl.formatMessage({ id: 'admin.dlq.status' })}
          />
        </div>
      </div>

      {/* Loading state */}
      {isPending && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-16" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && <PageError onRetry={() => void refetch()} />}

      {/* Empty state */}
      {!isPending && !isError && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-4 h-12 w-12 text-neutral-300" />
          <h3 className="text-lg font-medium text-neutral-600">
            <FormattedMessage id="admin.dlq.empty" />
          </h3>
        </div>
      )}

      {/* DLQ entries list */}
      {!isPending && !isError && entries.length > 0 && (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <DlqEntryCard
                key={entry.id}
                entry={entry}
                onRetry={handleRetry}
                onDismiss={handleDismiss}
                isRetrying={retryingIds.has(entry.id)}
                isDismissing={dismissingIds.has(entry.id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
