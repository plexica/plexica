// tenant-detail-audit-tab.tsx — Audit tab content for the tenant detail page.
// Fetches the platform audit log filtered by tenantId via useAuditLog hook.

import { FormattedMessage, useIntl } from 'react-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plexica/ui';

import { useAuditLog } from '../../hooks/use-audit-log.js';

import type { AuditAction, AuditEntry } from '../../types/admin-types.js';

interface TenantDetailAuditTabProps {
  tenantId: string;
  tenantName: string;
}

const ACTION_BADGE_CLASS: Record<AuditAction, string> = {
  'tenant.provision': 'bg-primary-100 text-primary-800',
  'tenant.suspend': 'bg-warning-light text-warning-dark',
  'tenant.reactivate': 'bg-success-light text-success-dark',
  'tenant.delete': 'bg-error-light text-error-dark',
  'plugin.publish': 'bg-primary-100 text-primary-800',
  'plugin.unpublish': 'bg-neutral-100 text-neutral-700',
  'plugin.review': 'bg-neutral-100 text-neutral-700',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

function AuditRow({ entry }: { entry: AuditEntry }): JSX.Element {
  const badgeClass = ACTION_BADGE_CLASS[entry.action] ?? 'bg-neutral-100 text-neutral-700';
  return (
    <TableRow>
      <TableCell className="text-neutral-600">{formatTimestamp(entry.createdAt)}</TableCell>
      <TableCell className="text-neutral-700">{entry.actorId}</TableCell>
      <TableCell>
        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {entry.action}
        </span>
      </TableCell>
      <TableCell className="text-neutral-600">{entry.resourceType}</TableCell>
    </TableRow>
  );
}

export function TenantDetailAuditTab({ tenantId, tenantName }: TenantDetailAuditTabProps): JSX.Element {
  const intl = useIntl();
  const { data, isLoading, isError } = useAuditLog({ tenantId });

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">
        <FormattedMessage id="tenant.audit.title" values={{ name: tenantName }} />
      </h2>

      {isLoading && (
        <div
          className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500"
          aria-busy="true"
          aria-label={intl.formatMessage({ id: 'tenant.audit.loading' })}
        >
          <FormattedMessage id="tenant.audit.loading" />
        </div>
      )}

      {isError && (
        <div role="alert" className="rounded-md border border-error-light bg-error-light/20 p-4 text-sm text-error-dark">
          <FormattedMessage id="tenant.audit.error" />
        </div>
      )}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          <FormattedMessage id="tenant.audit.empty" />
        </div>
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><FormattedMessage id="tenant.audit.column.timestamp" /></TableHead>
              <TableHead><FormattedMessage id="tenant.audit.column.actor" /></TableHead>
              <TableHead><FormattedMessage id="tenant.audit.column.action" /></TableHead>
              <TableHead><FormattedMessage id="tenant.audit.column.resource" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
