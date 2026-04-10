// auth-guard.tsx
// Route guard — redirects unauthenticated users to Keycloak login.
// Renders children once authenticated; shows nothing while redirecting.
//
// NEW-H-2: Only redirect when status === 'unauthenticated'.
// When status === 'expired', SessionExpiredHandler owns the flow:
// it shows a 3-second toast (EC-05) before calling login(). Triggering
// login() here would race against and beat that handler.
//
// Refresh-before-redirect: when a refresh token is present but the access
// token has expired (e.g. page reload after >60 s), useTokenRefresh attempts
// a silent refresh first. The guard defers the login() redirect by one tick
// to allow that refresh to complete and restore status → 'authenticated'.

import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores/auth-store.js';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): JSX.Element | null {
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const login = useAuthStore((s) => s.login);

  // Track whether a silent refresh is in flight (refresh token present but
  // access token expired). Give useTokenRefresh one render cycle to update
  // status before we decide to redirect.
  const silentRefreshPending = useRef(status === 'unauthenticated' && refreshToken !== null);

  useEffect(() => {
    // Once status resolves (either to 'authenticated' or stays 'unauthenticated'
    // after a failed refresh), clear the pending flag.
    if (status !== 'unauthenticated') {
      silentRefreshPending.current = false;
    }
  }, [status]);

  useEffect(() => {
    // Only redirect for genuinely unauthenticated users with no refresh token.
    // 'expired' sessions are handled by SessionExpiredHandler (3s toast → redirect).
    // If a silent refresh is pending, wait for it to settle first.
    if (status === 'unauthenticated' && !silentRefreshPending.current) {
      void login();
    }
  }, [status, login]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
