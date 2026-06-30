// extension-slots/plugin-slot.tsx
// Shared component rendering plugin components inside Suspense + error boundaries.

import { createElement, Suspense, useMemo } from 'react';
import { PluginSlotErrorBoundary } from '../error-boundary.js';
import { loadPluginComponent } from '../plugin-loader.js';
import { PluginContextProvider } from '../use-plugin-context.js';
import { SkeletonLoader } from '../../components/feedback/skeleton-loader.js';

interface PluginSlotEntry {
  slug: string;
  remoteEntryUrl: string;
  extensionPoint: string;
}

interface PluginSlotProps {
  entries: PluginSlotEntry[];
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

function PluginSlotInner({ entries }: { entries: PluginSlotEntry[] }): JSX.Element {
  const components = useMemo(
    () =>
      entries.map((entry) => ({
        slug: entry.slug,
        extPoint: entry.extensionPoint,
        Component: loadPluginComponent(entry.remoteEntryUrl, entry.slug),
      })),
    [entries],
  );

  return (
    <>
      {components.map(({ slug, extPoint, Component }) => (
        <PluginSlotErrorBoundary key={slug} pluginSlug={slug}>
          <Suspense fallback={<PluginLoadingFallback />}>
            <div data-plugin-slot={extPoint} data-plugin-slug={slug}>
              {Component ? createElement(Component) : <EmptySlot slug={slug} point={extPoint} />}
            </div>
          </Suspense>
        </PluginSlotErrorBoundary>
      ))}
    </>
  );
}

export function PluginSlot({ entries }: PluginSlotProps): JSX.Element {
  return (
    <PluginContextProvider>
      <PluginSlotInner entries={entries} />
    </PluginContextProvider>
  );
}
