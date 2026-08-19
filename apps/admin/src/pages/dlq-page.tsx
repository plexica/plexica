// dlq-page.tsx — Dead Letter Queue management page (S5-901, FR 005-11).
// List, retry, dismiss DLQ entries. Filter by status. Paginated.
// Ported from apps/web (Decision 6, 2026-08-18 — super-admin features live only in admin).

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle } from 'lucide-react';
import { EmptyState, ErrorState, Pagination, Select } from '@plexica/ui';

import { useDlqEntries, useRetryDlq, useDismissDlq } from '../hooks/use-dlq.js';
import { DlqEntryCard } from '../components/dlq/dlq-entry-card.js';

export function DlqPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useDlqEntries(
    statusFilter.length > 0
      ? { page, status: statusFilter as 'pending' | 'retried' | 'dismissed' }
      : { page },
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
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">
            <FormattedMessage id="admin.dlq.title" />
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            <FormattedMessage id="admin.dlq.total" values={{ count: totalCount }} />
          </p>
        </div>
        <Select
          value={statusFilter.length > 0 ? statusFilter : '__all__'}
          onValueChange={(value: string) => {
            setStatusFilter(value === '__all__' ? '' : value);
            setPage(1);
          }}
          options={[
            { value: '__all__', label: intl.formatMessage({ id: 'admin.dlq.filterAll' }) },
            { value: 'pending', label: intl.formatMessage({ id: 'admin.dlq.status.pending' }) },
            { value: 'retried', label: intl.formatMessage({ id: 'admin.dlq.status.retried' }) },
            { value: 'dismissed', label: intl.formatMessage({ id: 'admin.dlq.status.dismissed' }) },
          ]}
          aria-label={intl.formatMessage({ id: 'admin.dlq.status' })}
        />
      </div>

      {isPending && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          heading={<FormattedMessage id="admin.dlq.error.heading" />}
          retryLabel={<FormattedMessage id="admin.dlq.retry" />}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && entries.length === 0 && (
        <EmptyState heading={<FormattedMessage id="admin.dlq.empty" />} />
      )}

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
    </section>
  );
}
