// audit-log-page.tsx
// Displays paginated tenant audit log.
// Filters managed via InlineFilter: actor (text), action type (select), date range.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  InlineFilter,
  Pagination,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from '@plexica/ui';

import { useAuditLog, useAuditActionTypes } from '../hooks/use-audit-log.js';
import { ExpandableRow } from '../components/audit/expandable-row.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

import type { FilterValues } from '@plexica/ui';
import type { AuditLogEntry } from '../types/audit.js';

const PAGE_SIZE = 20;

export function AuditLogPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const { data: actionTypesData } = useAuditActionTypes();
  const actionTypes = actionTypesData ?? [];

  // Derive API filter params from InlineFilter values — build object without undefined keys
  // to satisfy exactOptionalPropertyTypes in tsconfig.
  const dateRange = filterValues.dateRange as { from?: string; to?: string } | undefined;
  const actionTypeRaw = filterValues.actionType as string | undefined;
  const actorIdRaw = filterValues.actorId as string | undefined;

  const apiFilters: Parameters<typeof useAuditLog>[0] = { page, limit: PAGE_SIZE };
  if (actorIdRaw) apiFilters.actorId = actorIdRaw;
  if (actionTypeRaw) apiFilters.actionType = actionTypeRaw;
  if (dateRange?.from) apiFilters.fromDate = dateRange.from;
  if (dateRange?.to) apiFilters.toDate = dateRange.to;

  const { data, isPending, isError, refetch } = useAuditLog(apiFilters);

  const filterDefs = [
    {
      key: 'actorId',
      label: intl.formatMessage({ id: 'auditLog.filter.actor' }),
      type: 'text' as const,
    },
    {
      key: 'actionType',
      label: intl.formatMessage({ id: 'auditLog.filter.action' }),
      type: 'select' as const,
      options: [
        { value: '', label: intl.formatMessage({ id: 'auditLog.filter.allActions' }) },
        ...actionTypes.map((a) => ({ value: a.key, label: a.label })),
      ],
    },
    {
      key: 'dateRange',
      label: intl.formatMessage({ id: 'auditLog.filter.dateRange' }),
      type: 'date-range' as const,
    },
  ];

  function handleFilterChange(values: FilterValues): void {
    setPage(1);
    setFilterValues(values);
  }

  const entries: AuditLogEntry[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="auditLog.title" />
      </h1>

      <InlineFilter
        filters={filterDefs}
        values={filterValues}
        onChange={handleFilterChange}
      />

      {/* Loading state */}
      {isPending && (
        <div aria-live="polite" className="space-y-2">
          <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-12" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <PageError onRetry={() => void refetch()} />
      )}

      {/* Table */}
      {!isPending && !isError && (
        <>
          <Table aria-label={intl.formatMessage({ id: 'auditLog.title' })}>
            <TableHeader>
              <TableRow>
                <TableHead><FormattedMessage id="auditLog.table.actor" /></TableHead>
                <TableHead><FormattedMessage id="auditLog.table.action" /></TableHead>
                <TableHead><FormattedMessage id="auditLog.table.target" /></TableHead>
                <TableHead><FormattedMessage id="auditLog.table.time" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">
                    <FormattedMessage id="auditLog.empty" />
                  </td>
                </TableRow>
              ) : (
                entries.map((entry: AuditLogEntry) => (
                  <ExpandableRow key={entry.id} entry={entry} />
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
