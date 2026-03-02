// apps/web/src/lib/widget-loader.ts
//
// T010-3.1: Real loadWidget() utility replacing the stub in WidgetContainer.
//
// Loads a named widget component from a Module Federation remote using
// React.lazy(). On import failure the component gracefully degrades to either
// a caller-supplied fallback or the built-in <WidgetFallback />.
//
// The `/* @vite-ignore */` pragma suppresses Vite's static-analysis warning
// for the dynamic template-literal import — Module Federation resolves these
// strings at runtime, not build-time.
//
// Security: pluginId and widgetName are validated before interpolation into
// the dynamic import path to prevent module path traversal (Constitution Art. 5.3).
//
// FR-011, NFR-008

import React from 'react';
import { logger } from '@/lib/logger';
import { WidgetFallback } from '@/components/WidgetFallback';

// ---------------------------------------------------------------------------
// Validation (Constitution Art. 5.3 — Input Validation)
// ---------------------------------------------------------------------------

/**
 * Plugin IDs must be lowercase letters, numbers, and hyphens only.
 * This mirrors the validation in plugin-loader.ts (PLUGIN_ID_PATTERN).
 */
const PLUGIN_ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Widget names must be PascalCase or camelCase identifiers — no slashes,
 * dots, or path separators that could redirect the Module Federation import
 * to an unintended module.
 */
const WIDGET_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Validates pluginId and widgetName before they are interpolated into the
 * dynamic import path.
 *
 * Throws if either value fails validation so callers receive a clear error
 * rather than silently loading an unintended module.
 */
export function validateWidgetIdentifiers(pluginId: string, widgetName: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(
      `Invalid pluginId "${pluginId}". Must contain only lowercase letters, numbers, and hyphens.`
    );
  }
  if (!WIDGET_NAME_PATTERN.test(widgetName)) {
    throw new Error(
      `Invalid widgetName "${widgetName}". Must be a valid PascalCase or camelCase identifier.`
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadWidgetOptions<T = Record<string, unknown>> {
  /** Plugin ID — must match the Module Federation remote name. */
  pluginId: string;
  /** Exposed widget name within the plugin (e.g. "ContactCard"). */
  widgetName: string;
  /**
   * Optional custom fallback component to use when widget loading fails.
   * When omitted, the built-in `<WidgetFallback>` is rendered.
   */
  fallback?: React.ComponentType<T>;
}

// ---------------------------------------------------------------------------
// loadWidget
// ---------------------------------------------------------------------------

/**
 * Returns a `React.lazy()` component that loads `<widgetName>` from the
 * Module Federation remote identified by `<pluginId>`.
 *
 * The returned component must be used inside a `<Suspense>` boundary.
 *
 * Validates `pluginId` and `widgetName` before use to prevent module path
 * traversal attacks (Constitution Art. 5.3).
 *
 * @example
 * ```tsx
 * const ContactCard = loadWidget({ pluginId: 'crm', widgetName: 'ContactCard' });
 *
 * // Inside a render:
 * <Suspense fallback={<Skeleton />}>
 *   <ContactCard contactId="123" />
 * </Suspense>
 * ```
 */
export function loadWidget<T = Record<string, unknown>>({
  pluginId,
  widgetName,
  fallback,
}: LoadWidgetOptions<T>): React.ComponentType<T> {
  // Validate before interpolation — throws synchronously for invalid inputs.
  validateWidgetIdentifiers(pluginId, widgetName);

  const LazyWidget = React.lazy(async () => {
    try {
      // Module Federation resolves `pluginId/widgetName` at runtime.
      // @vite-ignore tells Vite not to try static analysis on this import.
      const mod = await import(/* @vite-ignore */ `${pluginId}/${widgetName}`);

      // Guard: ensure the module exports a default component (not named-only exports).
      if (typeof mod.default !== 'function' && typeof mod.default !== 'object') {
        throw new Error(
          `Widget "${pluginId}/${widgetName}" does not export a default React component.`
        );
      }

      return mod as { default: React.ComponentType<T> };
    } catch (error) {
      // Sanitize identifiers in log to prevent log injection — only pre-validated
      // values reach here, but we use String() to be explicit.
      logger.error(
        { pluginId: String(pluginId), widgetName: String(widgetName), err: error },
        'Failed to load widget'
      );

      if (fallback) {
        return { default: fallback };
      }

      // Built-in fallback: close over pluginId/widgetName
      const BuiltInFallback: React.FC<T> = () =>
        React.createElement(WidgetFallback, { pluginId, widgetName });
      BuiltInFallback.displayName = `WidgetFallback(${pluginId}/${widgetName})`;

      return { default: BuiltInFallback as React.ComponentType<T> };
    }
  });

  return LazyWidget as unknown as React.ComponentType<T>;
}
