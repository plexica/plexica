// apps/web/src/components/WidgetContainer.tsx
//
// T005-05: Cross-plugin widget embed wrapper.
// Orchestrates Spec 010 Phase 3 primitives: loadWidget(), WidgetFallback.
//
// ⚠️ [NEEDS UPDATE] Once Spec 010 Phase 3 is merged, replace the stub
// `loadWidget` below with the real import:
//   import { loadWidget } from '../lib/widget-loader';
//
// FR-011, NFR-008

import React, { Suspense, useEffect, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Stub — replace with Spec 010 Phase 3 real implementation
// TODO: import { loadWidget } from '../lib/widget-loader';
// ---------------------------------------------------------------------------
type WidgetModule = { default: React.ComponentType<Record<string, unknown>> };

async function loadWidget(_pluginId: string, _widgetName: string): Promise<WidgetModule> {
  // [NEEDS UPDATE] Spec 010 Phase 3 will provide the real loadWidget function.
  throw new Error('loadWidget is not yet implemented — awaiting Spec 010 Phase 3.');
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
  /** Custom error fallback. Falls back to built-in WidgetFallback. */
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
 * The previous bg-destructive/10 + text-destructive pair could fall below
 * the AA threshold when primary destructive color is mid-lightness.
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
  const [WidgetComponent, setWidgetComponent] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setHasError(false);
    setWidgetComponent(null);

    loadWidget(pluginId, widgetName)
      .then((mod) => {
        if (!cancelled) {
          setWidgetComponent(() => mod.default);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pluginId, widgetName]);

  return (
    <section
      role="region"
      aria-label={title}
      aria-busy={isLoading ? 'true' : 'false'}
      className="space-y-3"
    >
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {isLoading && (fallback ?? <SkeletonFallback />)}

      {!isLoading && hasError && (errorFallback ?? <BuiltInErrorFallback title={title} />)}

      {!isLoading && !hasError && WidgetComponent && (
        <Suspense fallback={fallback ?? <SkeletonFallback />}>
          <WidgetComponent {...widgetProps} />
        </Suspense>
      )}
    </section>
  );
};
