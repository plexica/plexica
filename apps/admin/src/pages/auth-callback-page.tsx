// auth-callback-page.tsx
// Handles the Keycloak OIDC redirect at /callback after PKCE login.
// Extracts code + state from URL, calls handleCallback, navigates to /dashboard.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { FormattedMessage } from 'react-intl';

import { useAuthStore } from '../stores/auth-store.js';

export function AuthCallbackPage(): JSX.Element {
  const navigate = useNavigate();
  const handleCallback = useAuthStore((s) => s.handleCallback);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code === null || state === null) {
      setError('Missing authorization code or state parameter.');
      return;
    }

    void handleCallback(code, state)
      .then(() => navigate({ to: '/dashboard' }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      });
  }, []); // intentionally empty — runs once on mount only

  if (error !== null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert" className="text-red-600">
          {error}
        </p>
        <Link to="/login" className="text-neutral-600 underline">
          <FormattedMessage id="admin.login.backToLogin" defaultMessage="Back to login" />
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center" aria-busy="true">
      <p className="text-neutral-600">
        <FormattedMessage id="admin.login.signingIn" defaultMessage="Signing in…" />
      </p>
    </main>
  );
}
