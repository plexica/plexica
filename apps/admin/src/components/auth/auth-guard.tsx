// auth-guard.tsx
// Route guard for the admin app.
// Unlike apps/web (which redirects to Keycloak PKCE flow), the admin app uses
// a password-grant login form served at /login. Unauthenticated users are
// redirected there. A silent refresh is attempted first when a refresh token
// is present (e.g. page reload after access-token TTL expiry).

import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';

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
  const navigate = useNavigate();

  const refreshAttempted = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated') return;

    if (refreshToken !== null && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refresh().catch(() => {
        setSessionExpired();
      });
      return;
    }

    if (refreshToken === null) {
      void navigate({ to: '/login' });
    }
  }, [status, refreshToken, refresh, setSessionExpired, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
