// plugin-detail-sheet.tsx
// Slide-in sheet showing full plugin details: description, permissions, data tables, events.
// WCAG 2.1 AA: focus trap on open, Escape to close, focus on close button first.

import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';
import { X } from 'lucide-react';

import type { PluginCatalogEntry } from '../../types/plugin.js';
import { SkeletonLoader } from '../feedback/skeleton-loader.js';

interface PluginDetailSheetProps {
  plugin: PluginCatalogEntry | undefined;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onInstall: (slug: string) => void;
}

export function PluginDetailSheet({
  plugin,
  isOpen,
  isPending,
  onClose,
  onInstall,
}: PluginDetailSheetProps): JSX.Element | null {
  const intl = useIntl();
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save current focus and trap it inside the sheet
    previousFocusRef.current = document.activeElement as HTMLElement;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Simple focus trap: Tab wraps between first and last focusable elements
      if (e.key === 'Tab' && sheetRef.current !== null) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (first === undefined || last === undefined) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Move focus to first focusable element inside the sheet
    requestAnimationFrame(() => {
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when sheet closes
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="relative z-50 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({ id: 'marketplace.detail.title' })}
      >
        {isPending || plugin === undefined ? (
          <div className="space-y-4" aria-busy="true">
            <SkeletonLoader className="h-6 w-32" />
            <SkeletonLoader variant="card" className="h-20" />
            <SkeletonLoader className="h-4 w-full" />
            <SkeletonLoader className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-lg text-primary-600">
                  <span className="text-sm font-bold">{plugin.name.charAt(0)}</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{plugin.name}</h2>
                  <p className="text-sm text-neutral-500">
                    {plugin.author} &middot; v{plugin.version}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded p-1 text-neutral-400 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                aria-label={intl.formatMessage({ id: 'marketplace.close' })}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-600">{plugin.description}</p>

            <div className="mb-3">
              <span className="text-xs font-medium text-neutral-500">
                <FormattedMessage id="marketplace.categories.all" />:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {plugin.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              <FormattedMessage id="marketplace.installCount" values={{ count: plugin.installCount }} />
            </p>

            <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
              <Button variant="secondary" onClick={onClose}>
                <FormattedMessage id="marketplace.close" />
              </Button>
              <Button
                variant="primary"
                disabled={plugin.isInstalled}
                onClick={() => onInstall(plugin.slug)}
              >
                <FormattedMessage
                  id={plugin.isInstalled ? 'marketplace.installed' : 'marketplace.install'}
                />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
