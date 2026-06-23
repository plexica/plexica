// auth-guard.tsx
// Route guard — redirects unauthenticated users to Keycloak login.
// Renders children once authenticated; shows nothing while redirecting.
//
// NEW-H-2: Only redirect when status === 'unauthenticated'.
// When status === 'expired', SessionExpiredHandler owns the flow:
// it shows a 3-second toast (EC-05) before calling login().
//
// Silent-refresh-before-redirect: when status is 'unauthenticated' but a
// refresh token is present (e.g. page reload after the 60 s access token TTL),
// attempt a silent token refresh first. Only redirect to Keycloak if the
// refresh fails or no refresh token exists.
// The api-client already handles the mid-session case (retry-on-401), so no
// periodic timer is needed here — this guard only covers the initial page load.

import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores/auth-store.js';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const refresh = useAuthStore((s) => s.refresh);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);
  const login = useAuthStore((s) => s.login);

  // Track whether a silent refresh attempt is in flight to avoid calling
  // login() before the refresh has had a chance to restore the session.
  const refreshAttempted = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated') return;

    // If a refresh token exists and we haven't tried yet, attempt a silent
    // refresh before falling back to a full Keycloak redirect.
    if (refreshToken !== null && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refresh().catch(() => {
        // Refresh token is expired or revoked — mark as expired so
        // SessionExpiredHandler shows the toast, then redirects to Keycloak.
        setSessionExpired();
      });
      return;
    }

    // No refresh token available (or refresh already attempted and failed via
    // setSessionExpired path) — redirect immediately to Keycloak.
    if (refreshToken === null) {
      void login();
    }
  }, [status, refreshToken, refresh, setSessionExpired, login]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
