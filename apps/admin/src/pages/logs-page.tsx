// logs-page.tsx — System Logs Viewer (S5-A04, FR 005-10).
// Filter bar (tenant, level, limit) + explicit Search button (no auto-search —
// Loki queries are expensive). Log table with expandable rows for metadata.
// Graceful 503 handling: distinguishes SERVICE_UNAVAILABLE (Loki down) from
// LOG_QUERY_TIMEOUT. Data fetched only via TanStack Query (Rule 3).
// All UI strings via react-intl; Lucide icons; no emoji.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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

  const entries = data?.data ?? [];
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
        <ErrorBanner error={error} onRetry={() => void refetch()} intl={intl} />
      )}

      {!isError && hasSearched && isLoading && (
        <div aria-label={intl.formatMessage({ id: 'admin.logs.loading' })}>
          <LogTableSkeleton />
        </div>
      )}

      {!isError && hasSearched && !isLoading && entries.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          <FormattedMessage id="admin.logs.empty" />
        </div>
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
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          <FormattedMessage id="admin.logs.empty" />
        </div>
      )}
    </section>
  );
}

interface ErrorBannerProps {
  error: unknown;
  onRetry: () => void;
  intl: ReturnType<typeof useIntl>;
}

function ErrorBanner({ error, onRetry, intl }: ErrorBannerProps): JSX.Element {
  const { key } = resolveError(error);
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <FormattedMessage id="admin.logs.error.title" />
      </p>
      <p className="mt-1 text-red-700">
        <FormattedMessage id={key} />
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        aria-label={intl.formatMessage({ id: 'admin.logs.retry' })}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        <FormattedMessage id="admin.logs.retry" />
      </button>
    </div>
  );
}
