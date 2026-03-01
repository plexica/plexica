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

import React, { Suspense, useMemo } from 'react';
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
  // Memoize so the lazy component is only created once per unique plugin+widget
  // combination. Re-creating React.lazy() on every render would reset Suspense.
  const Widget = useMemo(
    () => loadWidget({ pluginId, widgetName, fallback }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pluginId, widgetName, fallback]
  );

  return (
    <Suspense fallback={<WidgetLoadingSkeleton />}>
      <Widget {...props} />
    </Suspense>
  );
}

export default WidgetLoader;
