// auth-callback-page.tsx
// Handles the Keycloak OIDC redirect at /callback after PKCE login.
// Extracts code + state from URL, calls handleCallback, navigates to /dashboard.

import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { FormattedMessage } from 'react-intl';
import { z } from 'zod';

import { useAuthStore } from '../stores/auth-store.js';

export function AuthCallbackPage(): JSX.Element {
  const navigate = useNavigate();
  const handleCallback = useAuthStore((s) => s.handleCallback);
  const [errorId, setErrorId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = z
      .object({
        code: z.string().min(1).max(4096),
        state: z.string().min(1).max(512),
      })
      .safeParse({ code: params.get('code'), state: params.get('state') });

    if (!parsed.success) {
      setErrorId('admin.login.callbackInvalid');
      return;
    }

    let active = true;
    void handleCallback(parsed.data.code, parsed.data.state)
      .then(() => {
        if (active) void navigate({ to: '/dashboard' });
      })
      .catch(() => {
        if (active) setErrorId('admin.login.callbackFailed');
      });
    return () => {
      active = false;
    };
  }, [handleCallback, navigate]);

  if (errorId !== null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert" aria-live="assertive" className="text-red-600">
          <FormattedMessage id={errorId} />
        </p>
        <Link to="/login" className="text-neutral-600 underline">
          <FormattedMessage id="admin.login.backToLogin" defaultMessage="Back to login" />
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center" aria-busy="true">
      <p role="status" aria-live="polite" className="text-neutral-600">
        <FormattedMessage id="admin.login.signingIn" defaultMessage="Signing in…" />
      </p>
    </main>
  );
}
