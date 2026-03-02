// apps/web/src/components/WidgetLoader.tsx
//
// T010-3.2: High-level widget rendering component.
//
// Combines loadWidget() and <Suspense> into a single ergonomic wrapper:
//   - Memoizes the lazy component to prevent unnecessary re-creations
//   - Shows a pulsing skeleton while the remote module is loading
//   - Forwards arbitrary props to the resolved widget component
//
// FR-011

import React, { Suspense } from 'react';
import { loadWidget } from '@/lib/widget-loader';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WidgetLoaderProps {
  /** Plugin ID — must match the Module Federation remote name. */
  pluginId: string;
  /** Widget name exposed by the plugin (e.g. "ContactCard"). */
  widgetName: string;
  /** Props forwarded verbatim to the loaded widget component. */
  props?: Record<string, unknown>;
  /** Custom fallback component to use if the widget fails to load. */
  fallback?: React.ComponentType;
}

// ---------------------------------------------------------------------------
// Module-level widget component cache
//
// React Compiler rule: React.lazy() must never be called during render.
// Caching at module level ensures each unique pluginId/widgetName pair
// produces exactly one lazy component instance for the app lifetime.
// ---------------------------------------------------------------------------
const _widgetLoaderCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

function getCachedWidget(
  pluginId: string,
  widgetName: string,
  fallback?: React.ComponentType
): React.ComponentType<Record<string, unknown>> {
  // When a custom fallback is provided, bypass the cache so the specific
  // fallback component is always honoured.
  if (fallback) {
    return loadWidget({ pluginId, widgetName, fallback }) as React.ComponentType<
      Record<string, unknown>
    >;
  }
  const key = `${pluginId}/${widgetName}`;
  let comp = _widgetLoaderCache.get(key);
  if (!comp) {
    comp = loadWidget({ pluginId, widgetName }) as React.ComponentType<Record<string, unknown>>;
    _widgetLoaderCache.set(key, comp);
  }
  return comp;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function WidgetLoadingSkeleton() {
  return (
    <div
      className="animate-pulse rounded-md bg-muted h-24 w-full"
      aria-hidden="true"
      data-testid="widget-loading-skeleton"
    />
  );
}

// ---------------------------------------------------------------------------
// WidgetLoader
// ---------------------------------------------------------------------------

export function WidgetLoader({ pluginId, widgetName, props = {}, fallback }: WidgetLoaderProps) {
  // Stable lazy component from module-level cache — React.lazy() is only ever
  // called once per pluginId/widgetName pair (inside the cache helper), not on
  // every render.
  const Widget = getCachedWidget(pluginId, widgetName, fallback);

  return (
    <Suspense fallback={<WidgetLoadingSkeleton />}>
      {/* eslint-disable-next-line react-hooks/static-components -- Widget is memoised in a module-level Map; React.lazy() is called at most once per key, not on every render. */}
      <Widget {...props} />
    </Suspense>
  );
}

export default WidgetLoader;
