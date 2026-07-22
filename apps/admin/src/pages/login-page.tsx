// login-page.tsx
// Admin login page — redirects to Keycloak PKCE login.
// After PKCE migration, the login form is replaced by a redirect to Keycloak's
// own login page, which supports MFA, SSO, and social login.
// The /callback route handles the redirect back to the app.

import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

import { useAuthStore } from '../stores/auth-store.js';

export function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    // Auto-redirect to Keycloak on mount.
    // The login action generates a PKCE challenge, stores state in
    // sessionStorage, and redirects the browser to Keycloak.
    if (status === 'unauthenticated') {
      void login();
    }
  }, []); // intentionally empty — runs once on mount only

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md text-center">
        <h1 className="text-xl font-bold text-neutral-900">
          <FormattedMessage id="admin.login.title" />
        </h1>
        <p className="mt-4 text-sm text-neutral-500">
          {status === 'authenticating' ? (
            <FormattedMessage id="admin.login.redirecting" defaultMessage="Redirecting to login…" />
          ) : (
            <FormattedMessage id="admin.login.redirect" defaultMessage="Redirecting to Keycloak…" />
          )}
        </p>
        <button
          type="button"
          onClick={() => void login()}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          <FormattedMessage id="admin.login.submit" />
        </button>
      </div>
    </div>
  );
}
