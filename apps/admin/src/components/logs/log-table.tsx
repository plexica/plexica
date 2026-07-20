// log-table.tsx — System logs table with expandable rows (S5-A04).
// Columns: timestamp, level badge (icon + color, never color alone), tenant,
// message. Row click toggles metadata expansion (aria-expanded).
// Lucide icons for level badges; no emoji (Constitution frontend patterns).

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  AlertTriangle,
  Bug,
  ChevronRight,
  Info,
  OctagonAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plexica/ui';
import { cn } from '@plexica/ui';

import type { LogLevel, LogEntry } from '../../types/admin-types.js';

interface LevelConfig {
  icon: LucideIcon;
  i18nKey: string;
  className: string;
}

const LEVEL_CONFIG: Record<LogLevel, LevelConfig> = {
  debug: { icon: Bug, i18nKey: 'admin.logs.level.debug', className: 'bg-neutral-100 text-neutral-700' },
  info: { icon: Info, i18nKey: 'admin.logs.level.info', className: 'bg-success-light text-success-dark' },
  warn: { icon: AlertTriangle, i18nKey: 'admin.logs.level.warn', className: 'bg-warning-light text-warning-dark' },
  error: { icon: OctagonAlert, i18nKey: 'admin.logs.level.error', className: 'bg-error-light text-error-dark' },
};

function LogLevelBadge({ level }: { level: LogLevel }): JSX.Element {
  const cfg = LEVEL_CONFIG[level];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        cfg.className
      )}
      role="img"
      aria-label={level}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <FormattedMessage id={cfg.i18nKey} />
    </span>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

interface LogTableProps {
  entries: LogEntry[];
}

export function LogTable({ entries }: LogTableProps): JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead><FormattedMessage id="admin.logs.columns.timestamp" /></TableHead>
          <TableHead><FormattedMessage id="admin.logs.columns.level" /></TableHead>
          <TableHead><FormattedMessage id="admin.logs.columns.tenant" /></TableHead>
          <TableHead><FormattedMessage id="admin.logs.columns.message" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, i) => {
          const isOpen = expanded.has(i);
          const hasMeta = entry.meta !== undefined && Object.keys(entry.meta).length > 0;
          return (
            <LogRow
              key={`${entry.timestamp}-${i}`}
              entry={entry}
              isOpen={isOpen}
              hasMeta={hasMeta}
              onToggle={() => toggle(i)}
            />
          );
        })}
      </TableBody>
    </Table>
  );
}

interface LogRowProps {
  entry: LogEntry;
  isOpen: boolean;
  hasMeta: boolean;
  onToggle: () => void;
}

function LogRow({ entry, isOpen, hasMeta, onToggle }: LogRowProps): JSX.Element {
  const intl = useIntl();
  const expandLabel = isOpen
    ? intl.formatMessage({ id: 'admin.logs.collapse' })
    : intl.formatMessage({ id: 'admin.logs.expand' });

  return (
    <>
      <TableRow
        className={cn(hasMeta && 'cursor-pointer')}
        onClick={hasMeta ? onToggle : undefined}
        onKeyDown={(e) => {
          if (hasMeta && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={hasMeta ? 0 : undefined}
      >
        <TableCell className="w-10">
          {hasMeta && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              aria-expanded={isOpen}
              aria-label={expandLabel}
              className="text-neutral-400 hover:text-neutral-700"
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
            </button>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-xs text-neutral-600">
          {formatTimestamp(entry.timestamp)}
        </TableCell>
        <TableCell><LogLevelBadge level={entry.level} /></TableCell>
        <TableCell className="text-neutral-700">
          {entry.tenant ?? intl.formatMessage({ id: 'admin.logs.noTenant' })}
        </TableCell>
        <TableCell className="text-neutral-900">{entry.message}</TableCell>
      </TableRow>
      {isOpen && hasMeta && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={4}>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                <FormattedMessage id="admin.logs.columns.metadata" />
              </p>
              <pre className="overflow-x-auto text-xs text-neutral-800" aria-label={intl.formatMessage({ id: 'admin.logs.columns.metadata' })}>
                {JSON.stringify(entry.meta, null, 2)}
              </pre>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function LogTableSkeleton(): JSX.Element {
  return (
    <div className="rounded-lg border border-neutral-200">
      <div className="divide-y divide-neutral-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-4 px-4 py-3">
            <div className="h-4 w-28 rounded bg-neutral-200" />
            <div className="h-4 w-16 rounded bg-neutral-200" />
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-4 flex-1 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
