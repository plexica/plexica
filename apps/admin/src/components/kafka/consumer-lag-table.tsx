// consumer-lag-table.tsx
// KafkaLagBar (design-spec Component 8) — renders the consumer lag table with
// warning indicators when lag exceeds the threshold (1000 messages).
// Status badge uses icon + text (never color alone — WCAG 1.4.1).

import { FormattedMessage } from 'react-intl';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plexica/ui';

import type { KafkaConsumerLag } from '../../types/admin-types.js';

export const LAG_WARNING_THRESHOLD = 1000;
const SKELETON_ROWS = 4;

function formatLag(value: number): string {
  return value.toLocaleString('en-US');
}

function LagStatus({ lag }: { lag: number }): JSX.Element {
  const isWarning = lag > LAG_WARNING_THRESHOLD;
  if (isWarning) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-light px-2.5 py-0.5 text-xs font-medium text-warning-dark">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <FormattedMessage id="admin.kafka.status.warning" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2.5 py-0.5 text-xs font-medium text-success-dark">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      <FormattedMessage id="admin.kafka.status.ok" />
    </span>
  );
}

export function ConsumerLagTable({ lags }: { lags: KafkaConsumerLag[] }): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><FormattedMessage id="admin.kafka.columns.plugin" /></TableHead>
          <TableHead><FormattedMessage id="admin.kafka.columns.consumerGroup" /></TableHead>
          <TableHead><FormattedMessage id="admin.kafka.columns.lag" /></TableHead>
          <TableHead><FormattedMessage id="admin.kafka.columns.status" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lags.map((row) => {
          const isWarning = row.lag > LAG_WARNING_THRESHOLD;
          return (
            <TableRow key={`${row.pluginSlug}-${row.consumerGroup}`}>
              <TableCell className="font-medium text-neutral-900">{row.pluginSlug}</TableCell>
              <TableCell className="font-mono text-xs">{row.consumerGroup}</TableCell>
              <TableCell
                className={isWarning ? 'font-semibold text-warning-dark' : 'text-neutral-700'}
              >
                {formatLag(row.lag)}
                <span className="sr-only">
                  <FormattedMessage id="admin.kafka.unit.messages" />
                </span>
                {isWarning && (
                  <AlertTriangle
                    className="ml-1.5 inline h-4 w-4 text-warning-dark"
                    aria-hidden="true"
                  />
                )}
              </TableCell>
              <TableCell><LagStatus lag={row.lag} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function KafkaSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 w-72 animate-pulse rounded-md bg-neutral-100" />
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-neutral-200" />
        </div>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="border-b border-neutral-100 px-4 py-3">
            <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function computeTotalLag(lags: KafkaConsumerLag[]): number {
  return lags.reduce((sum, r) => sum + r.lag, 0);
}
