// tenant-detail-plugins-tab.tsx — Plugins tab content for the tenant detail page.
// Lists plugin installations from the tenant schema (read-only per FR 005-03).

import { FormattedMessage } from 'react-intl';
import { Puzzle } from 'lucide-react';
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plexica/ui';

import type { TenantDetail, TenantDetailPluginInstallation } from '../../types/admin-types.js';

interface TenantDetailPluginsTabProps {
  detail: TenantDetail;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function PluginRow({ install }: { install: TenantDetailPluginInstallation }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium text-neutral-900">{install.pluginSlug}</TableCell>
      <TableCell className="text-neutral-700 capitalize">{install.status}</TableCell>
      <TableCell className="text-neutral-600">{formatDate(install.installedAt)}</TableCell>
    </TableRow>
  );
}

export function TenantDetailPluginsTab({ detail }: TenantDetailPluginsTabProps): JSX.Element {
  const installs = detail.pluginInstallations;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">
        <FormattedMessage id="tenant.plugins.title" values={{ count: installs.length }} />
      </h2>
      {installs.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          heading={<FormattedMessage id="tenant.plugins.empty" />}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><FormattedMessage id="tenant.plugins.column.plugin" /></TableHead>
              <TableHead><FormattedMessage id="tenant.plugins.column.status" /></TableHead>
              <TableHead><FormattedMessage id="tenant.plugins.column.installed" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {installs.map((install) => (
              <PluginRow key={install.pluginSlug} install={install} />
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-sm text-neutral-500">
        <FormattedMessage id="tenant.plugins.note" />
      </p>
    </section>
  );
}
