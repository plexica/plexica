// logs-page.tsx — System Logs Viewer (S5-A04, FR 005-10).
// Filter bar (tenant, level, limit) + explicit Search button (no auto-search —
// Loki queries are expensive). Log table with expandable rows for metadata.
// Graceful 503 handling: distinguishes SERVICE_UNAVAILABLE (Loki down) from
// LOG_QUERY_TIMEOUT. Data fetched only via TanStack Query (Rule 3).
// All UI strings via react-intl; Lucide icons; no emoji.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { EmptyState, ErrorState } from '@plexica/ui';

import {
  LogFilters,
  type LogFilterValues,
  type LogLevelFilter,
  type LogLimit,
} from '../components/logs/log-filters.js';
import { LogTable, LogTableSkeleton } from '../components/logs/log-table.js';
import { useLogs, type LogsQueryParams } from '../hooks/use-logs.js';
import { ApiError } from '../services/api-client.js';

const DEFAULT_FILTERS: LogFilterValues = {
  tenant: '',
  level: 'all',
  limit: 100,
};

function toQueryParams(values: LogFilterValues): LogsQueryParams {
  const params: LogsQueryParams = { limit: values.limit };
  const tenant = values.tenant.trim();
  if (tenant.length > 0) params.tenant = tenant;
  if (values.level !== 'all') params.level = values.level;
  return params;
}

interface ErrorDisplay {
  key: string;
}

function resolveError(error: unknown): ErrorDisplay {
  if (error instanceof ApiError) {
    if (error.code === 'LOG_QUERY_TIMEOUT') {
      return { key: 'admin.logs.error.queryTimeout' };
    }
    if (error.status === 503 || error.code === 'SERVICE_UNAVAILABLE') {
      return { key: 'admin.logs.error.serviceUnavailable' };
    }
  }
  return { key: 'admin.logs.error.generic' };
}

export function LogsPage(): JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<LogFilterValues>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<LogFilterValues | null>(null);

  const queryParams = applied !== null ? toQueryParams(applied) : null;
  const { data, isLoading, isError, error, refetch, isFetching } = useLogs(
    queryParams ?? {},
    applied !== null,
  );

  const entries = data?.logs ?? [];
  const hasSearched = applied !== null;
  const isTruncated = hasSearched && entries.length >= applied.limit;

  function handleSearch(): void {
    setApplied(draft);
  }

  function handleClear(): void {
    setDraft(DEFAULT_FILTERS);
    setApplied(null);
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">
        <FormattedMessage id="admin.logs.title" />
      </h1>

      <LogFilters
        values={draft}
        onTenantChange={(tenant) => setDraft((p) => ({ ...p, tenant }))}
        onLevelChange={(level: LogLevelFilter) => setDraft((p) => ({ ...p, level }))}
        onLimitChange={(limit: LogLimit) => setDraft((p) => ({ ...p, limit }))}
        onSearch={handleSearch}
        onClear={handleClear}
        loading={isFetching}
      />

      {isError && (
        <ErrorState
          heading={<FormattedMessage id="admin.logs.error.title" />}
          description={<FormattedMessage id={resolveError(error).key} />}
          retryLabel={<FormattedMessage id="admin.logs.retry" />}
          onRetry={() => void refetch()}
        />
      )}

      {!isError && hasSearched && isLoading && (
        <div aria-label={intl.formatMessage({ id: 'admin.logs.loading' })}>
          <LogTableSkeleton />
        </div>
      )}

      {!isError && hasSearched && !isLoading && entries.length === 0 && (
        <EmptyState heading={<FormattedMessage id="admin.logs.empty" />} />
      )}

      {!isError && hasSearched && !isLoading && entries.length > 0 && (
        <div className="space-y-2">
          <LogTable entries={entries} />
          <p className="text-sm text-neutral-600" aria-live="polite">
            {isTruncated ? (
              <FormattedMessage
                id="admin.logs.truncated"
                values={{ limit: applied.limit }}
              />
            ) : (
              <FormattedMessage
                id="admin.logs.resultCount"
                values={{ count: entries.length }}
              />
            )}
          </p>
        </div>
      )}

      {!isError && !hasSearched && (
        <EmptyState heading={<FormattedMessage id="admin.logs.empty" />} />
      )}
    </section>
  );
}
