// page-error.tsx
// Inline error state for API/data-fetching failures.
// Shows icon + message + optional retry button.
// Distinct from ErrorFallback (which is for error boundaries).
// Use onRetry={refetch} from TanStack Query to re-trigger the failed request.

import { AlertCircle, RefreshCw } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@plexica/ui';

interface PageErrorProps {
  onRetry?: () => void;
}

export function PageError({ onRetry }: PageErrorProps): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white px-6 py-12 text-center"
    >
      <AlertCircle className="mb-4 h-8 w-8 text-error" aria-hidden="true" />
      <p className="text-base font-medium text-neutral-900">
        <FormattedMessage id="error.page.heading" />
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        <FormattedMessage id="error.page.description" />
      </p>
      {onRetry !== undefined && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            <FormattedMessage id="common.retry" />
          </Button>
        </div>
      )}
    </div>
  );
}
