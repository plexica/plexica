// apps/web/src/components/WidgetContainer.tsx
//
// T005-05: Cross-plugin widget embed wrapper.
// Orchestrates Spec 010 Phase 3 primitives: loadWidget(), WidgetFallback.
//
// Gated by the ENABLE_PLUGIN_WIDGETS feature flag (Constitution Art. 9.1).
// When the flag is off the component renders nothing so no Spec 010 phase 3
// code is exercised in production until the feature is ready.
//
// Architecture fix (HIGH-002 from forge-review 2026-03-01):
// The previous implementation used a promise-adapter (loadWidgetModule) that
// wrapped the synchronous React.lazy() return value in Promise.resolve().
// Because React.lazy() is synchronous, the .catch() never fired, making
// hasError and the entire useEffect state machine dead code. The component
// now uses the correct React.lazy() + Suspense + PluginErrorBoundary pattern
// where the error boundary catches errors thrown during lazy resolution.
//
// FR-011, NFR-008

import React, { Suspense, useMemo, type ReactNode } from 'react';
import { useFeatureFlag } from '@/lib/feature-flags';
import { loadWidget } from '@/lib/widget-loader';
import { PluginErrorBoundary } from '@/components/ErrorBoundary/PluginErrorBoundary';

// ---------------------------------------------------------------------------
// Module-level widget component cache
//
// React Compiler rule: React.lazy() must never be called during render.
// Caching at module level ensures each unique pluginId/widgetName pair
// produces exactly one lazy component instance for the app lifetime.
// ---------------------------------------------------------------------------
const _widgetComponentCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

function getCachedWidgetComponent(
  pluginId: string,
  widgetName: string
): React.ComponentType<Record<string, unknown>> {
  const key = `${pluginId}/${widgetName}`;
  let comp = _widgetComponentCache.get(key);
  if (!comp) {
    comp = loadWidget({ pluginId, widgetName }) as React.ComponentType<Record<string, unknown>>;
    _widgetComponentCache.set(key, comp);
  }
  return comp;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface WidgetContainerProps {
  /** ID of the plugin that owns the widget. */
  pluginId: string;
  /** Exported widget component name within the plugin. */
  widgetName: string;
  /** Props forwarded verbatim to the widget component. */
  widgetProps?: Record<string, unknown>;
  /** Section heading text (rendered as h2, used for aria-label). */
  title: string;
  /** Custom loading skeleton. Falls back to built-in pulsing skeleton. */
  fallback?: ReactNode;
  /**
   * Custom error fallback node rendered when the widget throws.
   * When omitted, PluginErrorBoundary's default fallback (PluginErrorFallback) is used.
   */
  errorFallback?: ReactNode;
}

// ---------------------------------------------------------------------------
// Built-in fallback components
// ---------------------------------------------------------------------------
function SkeletonFallback() {
  return <div className="animate-pulse rounded-md bg-muted h-24 w-full" aria-hidden="true" />;
}

/**
 * BuiltInErrorFallback — T005-18 contrast fix.
 *
 * Uses `bg-destructive` (solid) with `text-destructive-foreground` to
 * guarantee WCAG AA (≥4.5:1) contrast ratio regardless of the tenant theme.
 */
function BuiltInErrorFallback({ title }: { title: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive bg-destructive px-4 py-3 text-sm text-destructive-foreground"
      data-testid="widget-error-fallback"
    >
      Failed to load widget: <strong>{title}</strong>
    </div>
  );
}

/**
 * Adapter: converts a ReactNode `errorFallback` prop into the ComponentType
 * signature expected by PluginErrorBoundary.
 */
function makeErrorFallbackComponent(
  node: ReactNode | undefined,
  title: string
): React.ComponentType<{ pluginName: string; error: Error | null; onRetry: () => void }> {
  const Component: React.FC<{
    pluginName: string;
    error: Error | null;
    onRetry: () => void;
  }> = () => <>{node ?? <BuiltInErrorFallback title={title} />}</>;
  Component.displayName = 'WidgetContainerErrorFallback';
  return Component;
}

// ---------------------------------------------------------------------------
// WidgetContainer
// ---------------------------------------------------------------------------
export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  pluginId,
  widgetName,
  widgetProps = {},
  title,
  fallback,
  errorFallback,
}) => {
  const widgetsEnabled = useFeatureFlag('ENABLE_PLUGIN_WIDGETS');

  // Stable lazy component from module-level cache — React.lazy() is only ever
  // called once per pluginId/widgetName pair (inside the cache helper), not on
  // every render.
  const WidgetComponent = getCachedWidgetComponent(pluginId, widgetName);

  // Memoize the error fallback component to keep the PluginErrorBoundary
  // reference stable across renders.
  const ErrorFallbackComponent = useMemo(
    () => makeErrorFallbackComponent(errorFallback, title),
    [errorFallback, title]
  );

  // Flag off → render nothing (Spec 010 Phase 3 not yet live)
  if (!widgetsEnabled) return null;

  return (
    <section role="region" aria-label={title} className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {/* PluginErrorBoundary catches errors thrown during lazy resolution and
          during widget component rendering. It MUST wrap Suspense. */}
      <PluginErrorBoundary pluginId={pluginId} pluginName={title} fallback={ErrorFallbackComponent}>
        <Suspense fallback={fallback ?? <SkeletonFallback />}>
          {/* eslint-disable-next-line react-hooks/static-components -- WidgetComponent is memoised in a module-level Map; React.lazy() is called at most once per key, not on every render. */}
          <WidgetComponent {...widgetProps} />
        </Suspense>
      </PluginErrorBoundary>
    </section>
  );
};
