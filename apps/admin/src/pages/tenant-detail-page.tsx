// tenant-detail-page.tsx — Tenant detail page with 4 tabs (S5-304, FR 005-03).
// Info / Users / Plugins / Audit. Tab state persists in the URL (?tab=...).
// Data fetched only via TanStack Query (Rule 3). All strings via react-intl.

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronLeft } from 'lucide-react';
import { Tabs } from '@plexica/ui';

import { TenantDetailActions } from '../components/tenants/tenant-detail-actions.js';
import { TenantDetailAuditTab } from '../components/tenants/tenant-detail-audit-tab.js';
import { TenantDetailInfoTab } from '../components/tenants/tenant-detail-info-tab.js';
import { TenantDetailPluginsTab } from '../components/tenants/tenant-detail-plugins-tab.js';
import { TenantDetailUsersTab } from '../components/tenants/tenant-detail-users-tab.js';
import { TenantStatusBadge } from '../components/tenants/tenant-status-badge.js';
import { useTenantDetail } from '../hooks/use-tenants.js';

const VALID_TABS = ['info', 'users', 'plugins', 'audit'] as const;
type TabValue = (typeof VALID_TABS)[number];

function isTabValue(v: unknown): v is TabValue {
  return typeof v === 'string' && (VALID_TABS as readonly string[]).includes(v);
}

export function TenantDetailPage(): JSX.Element {
  const intl = useIntl();
  const navigate = useNavigate();
  const { tenantId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { tab?: unknown };

  const initialTab: TabValue = isTabValue(search.tab) ? search.tab : 'info';
  const [tab, setTab] = useState<TabValue>(initialTab);

  const id = tenantId ?? '';
  const { data, isLoading, isError, error, refetch } = useTenantDetail(id);

  function handleTabChange(value: string): void {
    if (!isTabValue(value)) return;
    setTab(value);
    void navigate({ to: '/tenants/$tenantId', params: { tenantId: id }, search: { tab: value } });
  }

  if (isLoading) {
    return <TenantDetailSkeleton />;
  }

  if (isError || !data) {
    const isNotFound = error instanceof Error && /not found/i.test(error.message);
    return (
      <section className="space-y-4">
        <BackLink />
        <div
          role="alert"
          className="rounded-lg border border-error-light bg-error-light/20 p-6 text-center"
        >
          <p className="text-sm font-medium text-error-dark">
            <FormattedMessage
              id={isNotFound ? 'tenant.error.notFound' : 'tenant.error.loadFailed'}
            />
          </p>
          {!isNotFound && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-md bg-error-dark px-3 py-1.5 text-sm font-medium text-white hover:bg-error"
            >
              <FormattedMessage id="tenant.retry" />
            </button>
          )}
          <div className="mt-3">
            <Link to="/tenants" className="text-sm text-primary-600 hover:underline">
              <FormattedMessage id="tenant.backToList" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const t = data.tenant;

  const tabs = [
    {
      value: 'info',
      label: intl.formatMessage({ id: 'tenant.tabs.info' }),
      content: <TenantDetailInfoTab detail={data} />,
    },
    {
      value: 'users',
      label: intl.formatMessage({ id: 'tenant.tabs.users' }),
      content: <TenantDetailUsersTab detail={data} />,
    },
    {
      value: 'plugins',
      label: intl.formatMessage({ id: 'tenant.tabs.plugins' }),
      content: <TenantDetailPluginsTab detail={data} />,
    },
    {
      value: 'audit',
      label: intl.formatMessage({ id: 'tenant.tabs.audit' }),
      content: <TenantDetailAuditTab tenantId={t.id} tenantName={t.name} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <header className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-neutral-900">{t.name}</h1>
          <div className="flex items-center gap-3">
            <TenantStatusBadge status={t.status} />
            <span className="text-sm text-neutral-500">
              <FormattedMessage id="tenant.version" values={{ version: t.version }} />
            </span>
          </div>
        </div>
      </header>

      <Tabs tabs={tabs} value={tab} onValueChange={handleTabChange} />

      <TenantDetailActions
        tenantId={t.id}
        status={t.status}
        tenantName={t.name}
        slug={t.slug}
        version={t.version}
      />
    </div>
  );
}

function BackLink(): JSX.Element {
  return (
    <Link
      to="/tenants"
      className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      <FormattedMessage id="tenant.breadcrumb.back" />
    </Link>
  );
}

function TenantDetailSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <BackLink />
      <div className="h-20 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100" />
      <div className="h-10 w-full animate-pulse rounded bg-neutral-100" />
      <div className="space-y-2 rounded-lg border border-neutral-200 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 w-full animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
