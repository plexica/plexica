// error-fallback.tsx
// Error fallback UI shown when an error boundary catches.
// Shows heading + description + navigation options.
// Never exposes stack traces or raw error messages to users.
//
// PASS3-M-5: The `error` prop is prefixed with `_` to signal intentional discard.
// The prop must remain in the interface because React error boundaries pass the
// caught Error object to the fallback component. We do not display it to avoid
// leaking implementation details, but callers should not expect it to be logged here —
// error tracking (e.g., Sentry) should be wired at the error boundary level.

import { Link } from '@tanstack/react-router';
import { useIntl, FormattedMessage } from 'react-intl';

interface ErrorFallbackProps {
  // Received from React error boundary API — intentionally not displayed (see note above).
  error?: Error;
}

export function ErrorFallback({ error: _error }: ErrorFallbackProps): JSX.Element {
  const intl = useIntl();

  return (
    <div
      role="alert"
      className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h2 className="text-xl font-bold text-neutral-900">
        <FormattedMessage id="error.boundary.heading" />
      </h2>

      {/* NEW-L-1: Both branches rendered the same JSX — collapsed to a single unconditional <p>. */}
      <p className="max-w-md text-sm text-neutral-600">
        <FormattedMessage id="error.boundary.description" />
      </p>

      <div className="flex gap-3">
        <Link
          to="/dashboard"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <FormattedMessage id="error.boundary.goToDashboard" />
        </Link>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {intl.formatMessage({ id: 'error.boundary.refresh' })}
        </button>
      </div>
    </div>
  );
}
