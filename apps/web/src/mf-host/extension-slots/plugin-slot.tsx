// extension-slots/plugin-slot.tsx
// Shared component rendering plugin components inside Suspense + error boundaries.

import { createElement, Suspense, useMemo } from 'react';

import { PluginSlotErrorBoundary } from '../error-boundary.js';
import { loadPluginComponent } from '../plugin-loader.js';
import { PluginContextProvider } from '../use-plugin-context.js';
import { SkeletonLoader } from '../../components/feedback/skeleton-loader.js';
import { useAuthStore } from '../../stores/auth-store.js';

interface PluginSlotEntry {
  slug: string;
  installId: string;
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
        [{slug}] {point}
      </div>
    );
  }
  return null;
}

function PluginSlotInner({ entries, workspaceId }: PluginSlotProps): JSX.Element {
  const accessToken = useAuthStore((state) => state.accessToken) ?? '';
  const tenantSlug = useAuthStore((state) => state.tenantSlug) ?? '';
  const components = useMemo(
    () =>
      entries.map((entry) => ({
        slug: entry.slug,
        installId: entry.installId,
        extPoint: entry.extensionPoint,
        Component: loadPluginComponent(entry.remoteEntryUrl, entry.slug, entry.extensionPoint),
      })),
    [entries],
  );

  return (
    <>
      {components.map(({ slug, installId, extPoint, Component }) => (
        <PluginSlotErrorBoundary key={slug} pluginSlug={slug}>
          <Suspense fallback={<PluginLoadingFallback />}>
            <div data-plugin-slot={extPoint} data-plugin-slug={slug}>
              {Component ? createElement(Component, {
                apiBaseUrl: `/api/v1/plugins/${installId}/proxy`,
                accessToken,
                tenantSlug,
                workspaceId,
              }) : <EmptySlot slug={slug} point={extPoint} />}
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
