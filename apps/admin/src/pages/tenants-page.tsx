// tenants-page.tsx — Tenant list page (S5-203).
// Search + status filter + pagination. Data via TanStack Query only.

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2 } from 'lucide-react';

import { Input, Pagination, Select } from '@plexica/ui';

import { TenantTable, TenantTableSkeleton } from '../components/tenants/tenant-table.js';
import { useTenantList } from '../hooks/use-tenants.js';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'tenants.filter.all' },
  { value: 'active', labelKey: 'tenants.status.active' },
  { value: 'suspended', labelKey: 'tenants.status.suspended' },
  { value: 'pending_deletion', labelKey: 'tenants.status.pending_deletion' },
  { value: 'deleted', labelKey: 'tenants.status.deleted' },
];

export function TenantsPage(): JSX.Element {
  const intl = useIntl();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError } = useTenantList({
    search,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tenants = data?.data ?? [];

  const statusOptions = STATUS_OPTIONS.map((o) => ({
    value: o.value,
    label: intl.formatMessage({ id: o.labelKey }),
  }));

  function goToDetail(tenantId: string): void {
    void navigate({ to: '/tenants/$tenantId', params: { tenantId } });
  }

  function handleClear(): void {
    setSearch('');
    setStatus('all');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-neutral-900">
        <FormattedMessage id="tenants.title" />
      </h1>

      <FilterBar
        search={search}
        status={status}
        statusOptions={statusOptions}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onStatusChange={(v) => { setStatus(v); setPage(1); }}
        onClear={handleClear}
      />

      {isFetching && !isLoading && (
        <span className="self-end text-xs text-neutral-400" aria-live="polite">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />
          <FormattedMessage id="tenants.loading" />
        </span>
      )}

      {isError ? (
        <div role="alert" className="rounded-md border border-error-light bg-error-light/20 p-4 text-sm text-error-dark">
          <FormattedMessage id="tenants.error" />
        </div>
      ) : isLoading ? (
        <TenantTableSkeleton />
      ) : tenants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          <FormattedMessage id="tenants.empty" />
        </div>
      ) : (
        <TenantTable tenants={tenants} onRowClick={goToDetail} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600" aria-live="polite">
          <FormattedMessage
            id="tenants.resultCount"
            values={{
              from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            }}
          />
        </p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

interface FilterBarProps {
  search: string;
  status: string;
  statusOptions: { value: string; label: string }[];
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onClear: () => void;
}

function FilterBar({
  search, status, statusOptions, onSearchChange, onStatusChange, onClear,
}: FilterBarProps): JSX.Element {
  const intl = useIntl();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-72">
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={intl.formatMessage({ id: 'tenants.search.placeholder' })}
          aria-label={intl.formatMessage({ id: 'tenants.search.placeholder' })}
        />
      </div>
      <div className="w-48">
        <Select
          options={statusOptions}
          value={status}
          onValueChange={onStatusChange}
          aria-label={intl.formatMessage({ id: 'tenants.filter.status' })}
        />
      </div>
      <button
        type="button"
        onClick={onClear}
        className="h-10 rounded-md border border-neutral-300 px-3 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        <FormattedMessage id="tenants.filter.clear" />
      </button>
    </div>
  );
}
