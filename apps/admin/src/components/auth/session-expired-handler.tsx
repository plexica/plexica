// session-expired-handler.tsx
// Subscribes to auth store status; shows a banner and redirects to Keycloak
// login when the admin session expires.

import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

import { clearAuthQueryCache } from '../../services/auth-query-cache.js';
import { useAuthStore } from '../../stores/auth-store.js';

const REDIRECT_DELAY_MS = 3_000;

export function SessionExpiredHandler(): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    if (status !== 'expired') return;
    clearAuthQueryCache();
    const timer = setTimeout(() => {
      void login().catch(() => {
        window.location.href = '/login';
      });
    }, REDIRECT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status, login]);

  if (status !== 'expired') return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-50 rounded-md bg-amber-500 px-4 py-3 text-sm text-neutral-900 shadow-lg"
    >
      <FormattedMessage id="admin.session.expired" />
    </div>
  );
}
