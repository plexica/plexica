// error-state.tsx
// Inline error state for API/data-fetching failures (formerly web's PageError).
// Shows icon + heading + optional description + optional retry button.
// Distinct from error-boundary fallbacks. Use onRetry={refetch} from TanStack
// Query to re-trigger the failed request.
// Strings arrive as ReactNode props — @plexica/ui must not depend on react-intl
// or on any app's message dictionaries.

import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from './button.js';

export interface ErrorStateProps {
  heading: React.ReactNode;
  description?: React.ReactNode | undefined;
  /** Accessible label for the retry button. Pass a localized string from the caller. */
  retryLabel?: React.ReactNode | undefined;
  onRetry?: (() => void) | undefined;
}

export function ErrorState({
  heading,
  description,
  retryLabel = 'Retry',
  onRetry,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white px-6 py-12 text-center"
    >
      <AlertCircle className="mb-4 h-8 w-8 text-error" aria-hidden="true" />
      <p className="text-base font-medium text-neutral-900">{heading}</p>
      {description !== undefined && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      {onRetry !== undefined && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
