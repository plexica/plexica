// extension-slots/plugin-slot.tsx
// Shared component rendering plugin components inside Suspense + error boundaries.
// Also drives plugin i18n bundle loading (006-09): when an entry ships
// `i18nBundles`, the shell fetches `i18n/{locale}.json` from the MF asset base
// and merges it under `plugin.{slug}.` keys whenever the locale changes.

import { createElement, Suspense, useEffect, useMemo } from 'react';

import { PluginSlotErrorBoundary } from '../error-boundary.js';
import { loadPluginComponent, loadPluginMessages } from '../plugin-loader.js';
import { PluginContextProvider } from '../use-plugin-context.js';
import { SkeletonLoader } from '../../components/feedback/skeleton-loader.js';
import { useAuthStore } from '../../stores/auth-store.js';

/** One MF entry as returned by `GET /api/v1/plugins/workspace/:workspaceId`. */
export interface PluginSlotEntry {
  slug: string;
  installId: string;
  /** Locales this plugin ships i18n bundles for (006-09). */
  i18nBundles?: string[];
  /**
   * Explicit per-locale bundle URLs (006-09). In production the marketplace
   * presigns each locale's object; the loader fetches these DIRECTLY instead
   * of deriving `i18n/{locale}.json` from the (presigned) remoteEntry URL,
   * whose SigV4 signature would not match the sibling object path.
   */
  i18nBundleUrls?: Record<string, string>;
  remoteEntryUrl: string;
  extensionPoint: string;
}

interface PluginSlotProps {
  entries: PluginSlotEntry[];
  workspaceId: string;
}

function PluginLoadingFallback(): JSX.Element {
  return <SkeletonLoader variant="card" className="h-24" />;
}

function EmptySlot({ slug, point }: { slug: string; point: string }): JSX.Element | null {
  if (import.meta.env.DEV) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-2 text-xs text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">
        {/* Dev-only placeholder: slug + extension point are data, not copy */}
        {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- dev debug slot */}
        {`[${slug}] ${point}`}
      </div>
    );
  }
  return null;
}

function PluginSlotInner({ entries, workspaceId }: PluginSlotProps): JSX.Element {
  const accessToken = useAuthStore((state) => state.accessToken) ?? '';
  const tenantSlug = useAuthStore((state) => state.tenantSlug) ?? '';
  const locale = useAuthStore((state) => state.locale);

  // Plugin i18n bundles: refetch whenever the active locale changes so plugin
  // UI re-renders localized through the same react-intl pipeline (006-09).
  useEffect(() => {
    for (const entry of entries) {
      const bundles = entry.i18nBundles ?? [];
      if (bundles.length === 0) continue;
      void loadPluginMessages({
        slug: entry.slug,
        remoteEntryUrl: entry.remoteEntryUrl,
        bundles,
        locale,
        bundleUrls: entry.i18nBundleUrls,
      });
    }
  }, [entries, locale]);

  const components = useMemo(
    () =>
      entries.map((entry) => ({
        slug: entry.slug,
        installId: entry.installId,
        extPoint: entry.extensionPoint,
        Component: loadPluginComponent(entry.remoteEntryUrl, entry.slug, entry.extensionPoint),
      })),
    [entries]
  );

  return (
    <>
      {components.map(({ slug, installId, extPoint, Component }) => (
        <PluginSlotErrorBoundary key={slug} pluginSlug={slug}>
          <Suspense fallback={<PluginLoadingFallback />}>
            <div data-plugin-slot={extPoint} data-plugin-slug={slug}>
              {Component ? (
                createElement(Component, {
                  apiBaseUrl: `/api/v1/plugins/${installId}/proxy`,
                  accessToken,
                  tenantSlug,
                  workspaceId,
                })
              ) : (
                <EmptySlot slug={slug} point={extPoint} />
              )}
            </div>
          </Suspense>
        </PluginSlotErrorBoundary>
      ))}
    </>
  );
}

export function PluginSlot({ entries, workspaceId }: PluginSlotProps): JSX.Element {
  return (
    <PluginContextProvider>
      <PluginSlotInner entries={entries} workspaceId={workspaceId} />
    </PluginContextProvider>
  );
}
