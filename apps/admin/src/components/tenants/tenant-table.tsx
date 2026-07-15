// tenant-table.tsx — Tenant list table + loading skeleton (S5-203).

import { FormattedMessage } from 'react-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plexica/ui';

import { TenantStatusBadge } from './tenant-status-badge.js';

import type { TenantListItem, TenantStatus } from '../../types/admin-types.js';

interface TenantTableProps {
  tenants: TenantListItem[];
  onRowClick: (tenantId: string) => void;
}

export function TenantTable({ tenants, onRowClick }: TenantTableProps): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><FormattedMessage id="tenants.columns.name" /></TableHead>
          <TableHead><FormattedMessage id="tenants.columns.slug" /></TableHead>
          <TableHead><FormattedMessage id="tenants.columns.status" /></TableHead>
          <TableHead><FormattedMessage id="tenants.columns.created" /></TableHead>
          <TableHead><FormattedMessage id="tenants.actions.view" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((t) => (
          <TenantRow key={t.id} tenant={t} onRowClick={onRowClick} />
        ))}
      </TableBody>
    </Table>
  );
}

interface TenantRowProps {
  tenant: TenantListItem;
  onRowClick: (tenantId: string) => void;
}

function TenantRow({ tenant, onRowClick }: TenantRowProps): JSX.Element {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => onRowClick(tenant.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onRowClick(tenant.id);
      }}
      tabIndex={0}
    >
      <TableCell className="font-medium text-neutral-900">{tenant.name}</TableCell>
      <TableCell className="text-neutral-600">{tenant.slug}</TableCell>
      <TableCell><TenantStatusBadge status={tenant.status as TenantStatus} /></TableCell>
      <TableCell className="text-neutral-600">{tenant.createdAt.slice(0, 10)}</TableCell>
      <TableCell>
        <span className="text-primary-600 hover:underline">
          <FormattedMessage id="tenants.actions.view" />
        </span>
      </TableCell>
    </TableRow>
  );
}

export function TenantTableSkeleton(): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200">
      <div className="divide-y divide-neutral-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-4 px-4 py-3">
            <div className="h-4 w-40 rounded bg-neutral-200" />
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="h-4 w-12 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
