// apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx
//
// User-friendly fallback UI rendered by PluginErrorBoundary when a plugin
// throws an unhandled error during render or in a lifecycle method.
//
// Design (from tasks.md T1.2):
// ┌─────────────────────────────────────────┐
// │ ⚠️  Plugin Unavailable                  │
// │                                         │
// │ The "CRM" plugin could not be loaded.   │
// │ This might be a temporary network issue.│
// │                                         │
// │ Error: Failed to fetch module           │
// │                                         │
// │ [Retry]  [Go Back]                      │
// └─────────────────────────────────────────┘

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Button } from '@plexica/ui';

export interface PluginErrorFallbackProps {
  /** Display name of the plugin that failed. */
  pluginName: string;
  /** The error that was caught. */
  error: Error | null;
  /** Callback to clear the error state and retry rendering the plugin. */
  onRetry: () => void;
}

export function PluginErrorFallback({ pluginName, error, onRetry }: PluginErrorFallbackProps) {
  const navigate = useNavigate();
  // M-7: Focus the fallback container when it mounts so screen readers announce
  // the error immediately (WCAG 2.4.3 Focus Order).
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div
        ref={containerRef}
        className="w-full max-w-[500px] rounded-lg border border-border bg-card p-8 shadow-sm"
        role="alert"
        aria-live="assertive"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl" aria-hidden="true">
            ⚠️
          </span>
          <h2 className="text-lg font-semibold text-foreground">Plugin Unavailable</h2>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">
          The <span className="font-medium text-foreground">"{pluginName}"</span> plugin could not
          be loaded. This might be a temporary network issue.
        </p>

        {/* Error detail — only shown in development (never exposed in production) */}
        {import.meta.env.DEV && error?.message && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 mb-6">
            <p className="text-xs font-mono text-destructive break-all">Error: {error.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* T010-32: A11Y-S02 — explicit aria-label as defensive measure in case
              Button component wraps children with aria-hidden in some variants */}
          <Button
            onClick={onRetry}
            variant="default"
            size="sm"
            aria-label={`Retry loading ${pluginName} plugin`}
          >
            Retry
          </Button>
          <Button
            onClick={() => void navigate({ to: '/plugins' })}
            variant="secondary"
            size="sm"
            aria-label="Go back to plugins list"
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
