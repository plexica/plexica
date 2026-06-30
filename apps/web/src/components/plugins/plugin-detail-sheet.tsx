// plugin-detail-sheet.tsx
// Slide-in sheet showing full plugin details: description, permissions, data tables, events.
// WCAG 2.1 AA: focus trap on open, Escape to close, focus on close button first.

import { useRef, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';
import { X, Shield, Database, Radio, ShoppingBag, AlertCircle } from 'lucide-react';

import { useFocusTrap } from '../../hooks/use-focus-trap.js';
import { RatingStars } from './rating-stars.js';
import { CATEGORY_LABEL_MAP } from './plugin-categories.js';
import type { PluginCatalogEntry, PluginAction, PluginTable } from '../../types/plugin.js';
import { SkeletonLoader } from '../feedback/skeleton-loader.js';

interface DetailSheetProps {
  plugin: PluginCatalogEntry | undefined;
  isOpen: boolean;
  isPending: boolean;
  isError?: boolean;
  onClose: () => void;
  onInstall: (slug: string) => void;
  onRetry?: () => void;
}

function InfoSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-700">
        {icon}
        <span>{title}</span>
      </h3>
      {children}
    </div>
  );
}

function PermissionsSummary({ actions }: { actions: PluginAction[] }): JSX.Element {
  return (
    <ul className="space-y-1">
      {actions.map((a) => (
        <li key={a.key} className="flex items-center justify-between text-xs text-neutral-600">
          <span>{a.label}</span>
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {a.defaultRole}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DataTablesSummary({ tables }: { tables: PluginTable[] }): JSX.Element {
  return (
    <ul className="space-y-1">
      {tables.map((t) => (
        <li key={t.name} className="flex items-center justify-between text-xs text-neutral-600">
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px]">{t.name}</code>
          <span className="text-neutral-400">{t.description}</span>
        </li>
      ))}
    </ul>
  );
}

function EventsSummary({ events }: { events: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {events.map((e) => (
        <span key={e} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-mono text-neutral-500">
          {e}
        </span>
      ))}
    </div>
  );
}

export function PluginDetailSheet({
  plugin,
  isOpen,
  isPending,
  isError = false,
  onClose,
  onInstall,
  onRetry,
}: DetailSheetProps): JSX.Element | null {
  const intl = useIntl();
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, onClose, sheetRef);

  if (!isOpen) return null;

  // Guard: plugin is null after loading → show error
  if (!isPending && !isError && !plugin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
        <div ref={sheetRef} className="relative z-50 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-busy="false" aria-label={intl.formatMessage({ id: 'marketplace.detail.title' })}>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
            <p className="text-sm text-neutral-600"><FormattedMessage id="marketplace.error" /></p>
            <Button variant="secondary" className="mt-2" onClick={onClose} type="button"><FormattedMessage id="marketplace.close" /></Button>
          </div>
        </div>
      </div>);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className="relative z-50 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-busy={isPending ? true : false}
        aria-label={intl.formatMessage({ id: 'marketplace.detail.title' })}
      >
        {isPending && !isError ? (
          <div className="space-y-4">
            <SkeletonLoader className="h-6 w-32" />
            <SkeletonLoader variant="card" className="h-20" />
            <SkeletonLoader className="h-4 w-full" />
            <SkeletonLoader className="h-4 w-3/4" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
            <p className="text-sm text-neutral-600"><FormattedMessage id="marketplace.error" /></p>
            {onRetry && (
              <Button variant="secondary" className="mt-4" onClick={onRetry} type="button">
                <FormattedMessage id="plugin.retry" />
              </Button>
            )}
            <Button variant="secondary" className="mt-2" onClick={onClose} type="button">
              <FormattedMessage id="marketplace.close" />
            </Button>
          </div>
        ) : (plugin && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-lg text-primary-600">
                  <span className="text-sm font-bold">{plugin.name.charAt(0)}</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{plugin.name}</h2>
                  <p className="text-sm text-neutral-500">{plugin.author} &middot; v{plugin.version}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={intl.formatMessage({ id: 'marketplace.close' })}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-600">{plugin.description}</p>
            <div className="mb-3"><RatingStars rating={plugin.rating} /></div>

            <div className="mb-4 flex flex-wrap gap-1">
              {plugin.categories.map((cat) => (
                <span key={cat} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  <FormattedMessage id={CATEGORY_LABEL_MAP[cat] ?? cat} defaultMessage={cat} />
                </span>
              ))}
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              <ShoppingBag className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              <FormattedMessage id="marketplace.installCount" values={{ count: plugin.installCount }} />
            </p>

            {plugin.actions !== undefined && plugin.actions.length > 0 && (
              <InfoSection icon={<Shield className="h-4 w-4 text-neutral-500" aria-hidden="true" />} title={intl.formatMessage({ id: 'marketplace.permissions' })}>
                <PermissionsSummary actions={plugin.actions} />
              </InfoSection>
            )}

            {plugin.declaredTables !== undefined && plugin.declaredTables.length > 0 && (
              <InfoSection icon={<Database className="h-4 w-4 text-neutral-500" aria-hidden="true" />} title={intl.formatMessage({ id: 'marketplace.dataTables' })}>
                <DataTablesSummary tables={plugin.declaredTables} />
              </InfoSection>
            )}

            {plugin.declaredEvents !== undefined && plugin.declaredEvents.length > 0 && (
              <InfoSection icon={<Radio className="h-4 w-4 text-neutral-500" aria-hidden="true" />} title={intl.formatMessage({ id: 'marketplace.events' })}>
                <EventsSummary events={plugin.declaredEvents} />
              </InfoSection>
            )}

            <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
              <Button variant="secondary" onClick={onClose} type="button"><FormattedMessage id="marketplace.close" /></Button>
              <Button variant="primary" disabled={plugin.isInstalled} onClick={() => onInstall(plugin.slug)} type="button">
                <FormattedMessage id={plugin.isInstalled ? 'marketplace.installed' : 'marketplace.install'} />
              </Button>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
