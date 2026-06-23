// audit-log-page.tsx
// Displays paginated tenant audit log with filters: actor, action type, date range.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Input,
  Select,
  Pagination,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from '@plexica/ui';

import { useAuditLog, useAuditActionTypes } from '../hooks/use-audit-log.js';
import { ExpandableRow } from '../components/audit/expandable-row.js';

import type { AuditLogEntry, AuditLogFilters } from '../types/audit.js';

const PAGE_SIZE = 20;
// Radix UI <Select.Item value=""> throws — empty string is reserved for
// "no selection" / placeholder display.  Use a sentinel instead.
const ALL_SENTINEL = '__all__';

export function AuditLogPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Omit<AuditLogFilters, 'page' | 'limit'>>({});

  const { data, isPending, isError } = useAuditLog({ ...filters, page, limit: PAGE_SIZE });
  const { data: actionTypesData } = useAuditActionTypes();

  const entries: AuditLogEntry[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const actionTypes = actionTypesData ?? [];

  function handleTextFilter(key: keyof typeof filters, value: string): void {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      ...(value !== '' ? { [key]: value } : { [key]: undefined }),
    }));
  }

  function handleSelectFilter(key: keyof typeof filters, value: string): void {
    setPage(1);
    const cleared = value === ALL_SENTINEL;
    setFilters((prev) => ({
      ...prev,
      ...(cleared ? { [key]: undefined } : { [key]: value }),
    }));
  }

  const actionTypeOptions = [
    { value: ALL_SENTINEL, label: intl.formatMessage({ id: 'auditLog.filter.action' }) },
    ...actionTypes.map((a) => ({ value: a.key, label: a.label })),
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="auditLog.title" />
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={intl.formatMessage({ id: 'auditLog.filter.actor' })}
          aria-label={intl.formatMessage({ id: 'auditLog.filter.actor' })}
          onChange={(e) => handleTextFilter('actorId', e.target.value)}
          className="w-44"
        />

        <Select
          aria-label={intl.formatMessage({ id: 'auditLog.filter.action' })}
          options={actionTypeOptions}
          onValueChange={(v) => handleSelectFilter('actionType', v)}
        />

        <Input
          type="date"
          aria-label={intl.formatMessage({ id: 'auditLog.filter.from' })}
          onChange={(e) => handleTextFilter('fromDate', e.target.value)}
          className="w-40"
        />

        <Input
          type="date"
          aria-label={intl.formatMessage({ id: 'auditLog.filter.to' })}
          onChange={(e) => handleTextFilter('toDate', e.target.value)}
          className="w-40"
        />
      </div>

      {/* Table */}
      {isPending && (
        <div aria-live="polite" className="text-sm text-neutral-500">
          <FormattedMessage id="common.loading" />
        </div>
      )}
      {isError && (
        <div role="alert" className="text-sm text-red-600">
          <FormattedMessage id="common.error" />
        </div>
      )}

      {!isPending && !isError && (
        <>
          <Table aria-label={intl.formatMessage({ id: 'auditLog.title' })}>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <FormattedMessage id="auditLog.table.actor" />
                </TableHead>
                <TableHead>
                  <FormattedMessage id="auditLog.table.action" />
                </TableHead>
                <TableHead>
                  <FormattedMessage id="auditLog.table.target" />
                </TableHead>
                <TableHead>
                  <FormattedMessage id="auditLog.table.time" />
                </TableHead>
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
