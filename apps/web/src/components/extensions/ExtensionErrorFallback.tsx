// apps/web/src/components/extensions/ExtensionErrorFallback.tsx
//
// T013-13: Error fallback rendered when an extension contribution fails to
// load or throws during render (FR-008, US-007, NFR-011).
//
// Two variants:
//   compact — inline "Extension unavailable" with AlertTriangle icon.
//             Suitable for action/toolbar slots where space is tight.
//   card    — full card with dismiss button.
//             Suitable for panel/form slots.
//
// A11y: role="alert", aria-live="assertive" on both variants.
//       Dismiss button has aria-label describing what is being dismissed.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExtensionErrorFallbackProps {
  /** Human-readable plugin name for messages and aria-labels. */
  pluginName: string;
  /** The error that caused the failure (may be null if only a timeout). */
  error: Error | null;
  /** Callback to retry mounting the contribution. */
  onRetry: () => void;
  /**
   * Visual variant.
   * - compact: a single inline row — use for action/toolbar slots.
   * - card: a bordered card with dismiss button — use for panel/form slots.
   * Defaults to 'compact'.
   */
  variant?: 'compact' | 'card';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ExtensionErrorFallback: React.FC<ExtensionErrorFallbackProps> = ({
  pluginName,
  error,
  onRetry,
  variant = 'compact',
}) => {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  const message =
    error?.message && error.message.length > 0
      ? error.message.slice(0, 120)
      : 'Extension unavailable';

  if (variant === 'compact') {
    return (
      <span
        role="alert"
        aria-live="assertive"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="extension-error-fallback-compact"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
        <span>Extension unavailable</span>
        <button
          type="button"
          onClick={onRetry}
          className="underline hover:no-underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
          aria-label={`Retry loading ${pluginName} extension`}
        >
          Retry
        </button>
      </span>
    );
  }

  // card variant
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3"
      data-testid="extension-error-fallback-card"
    >
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive leading-snug">Extension unavailable</p>
        {import.meta.env.DEV && message && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={message}>
            {message}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{pluginName}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          aria-label={`Retry loading ${pluginName} extension`}
          className="h-7 text-xs"
        >
          Retry
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded"
          aria-label={`Dismiss failed extension from ${pluginName}`}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
