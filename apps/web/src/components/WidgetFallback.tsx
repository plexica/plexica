// apps/web/src/components/WidgetFallback.tsx
//
// T010-3.3: Fallback placeholder rendered when a widget fails to load.
//
// Displays an informative, non-alarming message so the rest of the page
// continues to work while developers diagnose the loading failure.
//
// WCAG 2.1 AA: role="status" + aria-label for screen readers.
// Semantic Tailwind tokens only — no hardcoded color values.
//
// FR-011, NFR-008

// React is in scope via the JSX transform

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WidgetFallbackProps {
  /** Plugin ID that owns the widget (used for debug info). */
  pluginId: string;
  /** Widget name that failed to load (used for debug info). */
  widgetName: string;
}

// ---------------------------------------------------------------------------
// WidgetFallback
// ---------------------------------------------------------------------------

export function WidgetFallback({ pluginId, widgetName }: WidgetFallbackProps) {
  return (
    <div
      role="status"
      aria-label={`Widget unavailable: ${pluginId}/${widgetName}`}
      data-testid="widget-unavailable"
      className="border-2 border-dashed border-muted rounded-lg p-4 text-center"
    >
      {/* Icon */}
      <div className="text-2xl mb-2" aria-hidden="true">
        📦
      </div>

      {/* Heading */}
      <p className="text-sm font-medium text-muted-foreground mb-1">Widget Unavailable</p>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-2">
        The requested widget could not be loaded from the plugin.
      </p>

      {/* Debug info */}
      <p className="text-xs text-muted-foreground font-mono">
        {pluginId}/{widgetName}
      </p>
    </div>
  );
}

export default WidgetFallback;
