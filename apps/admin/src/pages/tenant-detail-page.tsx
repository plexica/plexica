// tenant-detail-page.tsx — Tenant detail placeholder (S5-C01).

import { useParams } from '@tanstack/react-router';

import { PlaceholderPage } from './placeholder-page.js';

export function TenantDetailPage(): JSX.Element {
  const { tenantId } = useParams({ strict: false });
  return (
    <div>
      <p className="mb-4 text-sm text-neutral-500">Tenant ID: {tenantId}</p>
      <PlaceholderPage titleId="admin.nav.tenants" />
    </div>
  );
}
