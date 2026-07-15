// tenant-detail-info-tab.tsx — Info tab content for the tenant detail page.
// Renders tenant metadata in a definition list (<dl>) with a status badge.

import { FormattedMessage } from 'react-intl';
import type { ReactNode } from 'react';

import { TenantStatusBadge } from './tenant-status-badge.js';

import type { TenantDetail } from '../../types/admin-types.js';

interface TenantDetailInfoTabProps {
  detail: TenantDetail;
}

interface FieldProps {
  labelKey: string;
  children: ReactNode;
}

function Field({ labelKey, children }: FieldProps): JSX.Element {
  return (
    <div className="flex border-b border-neutral-100 px-4 py-3 last:border-0">
      <dt className="w-48 shrink-0 text-sm font-medium text-neutral-500">
        <FormattedMessage id={labelKey} />
      </dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function TenantDetailInfoTab({ detail }: TenantDetailInfoTabProps): JSX.Element {
  const t = detail.tenant;
  return (
    <section aria-label="Tenant information" className="rounded-lg border border-neutral-200">
      <dl className="divide-y divide-neutral-100">
        <Field labelKey="tenant.fields.slug">{t.slug}</Field>
        <Field labelKey="tenant.fields.name">{t.name}</Field>
        <Field labelKey="tenant.fields.status"><TenantStatusBadge status={t.status} /></Field>
        <Field labelKey="tenant.fields.version">{t.version}</Field>
        <Field labelKey="tenant.fields.created">{formatDate(t.createdAt)}</Field>
        <Field labelKey="tenant.fields.updated">{formatDate(t.updatedAt)}</Field>
        <Field labelKey="tenant.fields.bucket">{t.minioBucket ?? '\u2014'}</Field>
      </dl>
    </section>
  );
}
