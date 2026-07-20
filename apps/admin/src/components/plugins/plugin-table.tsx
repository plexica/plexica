// plugin-table.tsx — Plugin catalog table + loading skeleton (S5-803).

import { FormattedMessage } from 'react-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plexica/ui';

import { PluginStatusBadge, ReviewStatusBadge } from './plugin-status-badge.js';

import type { Plugin } from '../../types/admin-types.js';

interface PluginTableProps {
  plugins: Plugin[];
  onReview: (plugin: Plugin) => void;
}

export function PluginTable({ plugins, onReview }: PluginTableProps): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><FormattedMessage id="plugins.columns.name" /></TableHead>
          <TableHead><FormattedMessage id="plugins.columns.slug" /></TableHead>
          <TableHead><FormattedMessage id="plugins.columns.status" /></TableHead>
          <TableHead><FormattedMessage id="plugins.columns.review" /></TableHead>
          <TableHead><FormattedMessage id="plugins.columns.installed" /></TableHead>
          <TableHead><FormattedMessage id="plugins.columns.actions" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plugins.map((p) => (
          <PluginRow key={p.slug} plugin={p} onReview={onReview} />
        ))}
      </TableBody>
    </Table>
  );
}

interface PluginRowProps {
  plugin: Plugin;
  onReview: (plugin: Plugin) => void;
}

function PluginRow({ plugin, onReview }: PluginRowProps): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium text-neutral-900">{plugin.name}</TableCell>
      <TableCell className="text-neutral-600">{plugin.slug}</TableCell>
      <TableCell><PluginStatusBadge status={plugin.status} /></TableCell>
      <TableCell><ReviewStatusBadge status={plugin.reviewStatus} /></TableCell>
      <TableCell className="text-neutral-600">{plugin.installedCount}</TableCell>
      <TableCell>
        {plugin.reviewStatus === 'pending' ? (
          <button
            type="button"
            className="text-sm font-medium text-primary-600 hover:underline"
            onClick={() => onReview(plugin)}
            aria-label={`${plugin.name}`}
          >
            <FormattedMessage id="plugins.actions.review" />
          </button>
        ) : (
          <span className="text-neutral-300" aria-hidden="true">&mdash;</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PluginTableSkeleton(): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200">
      <div className="divide-y divide-neutral-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-4 px-4 py-3">
            <div className="h-4 w-32 rounded bg-neutral-200" />
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-4 w-10 rounded bg-neutral-200" />
            <div className="h-4 w-16 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
