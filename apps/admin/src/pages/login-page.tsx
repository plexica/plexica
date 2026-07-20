// login-page.tsx
// Admin login form — direct password grant against the Keycloak master realm.
// No PKCE browser flow: the admin app is an internal tool.

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FormattedMessage, useIntl } from 'react-intl';

import { useAuthStore } from '../stores/auth-store.js';

export function LoginPage(): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const intl = useIntl();

  const submitting = status === 'authenticating';

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      void navigate({ to: '/dashboard' });
    } catch {
      setError(intl.formatMessage({ id: 'admin.login.error' }));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="text-xl font-bold text-neutral-900">
          <FormattedMessage id="admin.login.title" />
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          <FormattedMessage id="admin.login.subtitle" />
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-neutral-700">
              <FormattedMessage id="admin.login.username" />
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              <FormattedMessage id="admin.login.password" />
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            <FormattedMessage id={submitting ? 'admin.login.signingIn' : 'admin.login.submit'} />
          </button>
        </form>
      </div>
    </div>
  );
}
