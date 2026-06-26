// extension-slots/plugin-slot.tsx
// Shared component rendering plugin components inside Suspense + error boundaries.

import { Suspense } from 'react';
import { PluginSlotErrorBoundary } from '../error-boundary.js';
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

export function PluginSlot({ entries }: PluginSlotProps): JSX.Element {
  return (
    <PluginContextProvider>
      {entries.map((entry) => (
        <PluginSlotErrorBoundary key={entry.slug} pluginSlug={entry.slug}>
          <Suspense fallback={<PluginLoadingFallback />}>
            <div data-plugin-slot={entry.extensionPoint} data-plugin-slug={entry.slug}>
              {/* Plugin MF component renders here when remote is loaded */}
              <EmptySlot slug={entry.slug} point={entry.extensionPoint} />
            </div>
          </Suspense>
        </PluginSlotErrorBoundary>
      ))}
    </PluginContextProvider>
  );
}
