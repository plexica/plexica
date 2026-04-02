// auth-callback-page.tsx
// Handles the Keycloak OIDC redirect at /callback.
// Extracts code + state from URL, calls handleCallback, navigates to /dashboard.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { useIntl, FormattedMessage } from 'react-intl';

import { useAuthStore } from '../stores/auth-store.js';

export function AuthCallbackPage(): JSX.Element {
  const navigate = useNavigate();
  const intl = useIntl();
  const handleCallback = useAuthStore((s) => s.handleCallback);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code === null || state === null) {
      setError(intl.formatMessage({ id: 'auth.callback.error' }));
      return;
    }

    void handleCallback(code, state)
      .then(() => navigate({ to: '/dashboard' }))
      .catch((err: unknown) => {
        setError(String(err instanceof Error ? err.message : err));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error !== null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert" className="text-error">
          {error}
        </p>
        {/* M-8: use TanStack Router <Link> instead of raw <a href> to avoid full page reload */}
        <Link to="/" className="text-primary-600 underline">
          <FormattedMessage id="auth.callback.backToLogin" />
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center" aria-busy="true">
      <p className="text-neutral-600">
        <FormattedMessage id="auth.callback.loading" />
      </p>
    </main>
  );
}
