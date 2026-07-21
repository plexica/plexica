// auth-guard.tsx
// Route guard for the admin app.
// Uses useSilentRefresh from @plexica/auth for the shared silent-refresh pattern.
// Unlike apps/web (which redirects to Keycloak PKCE flow), the admin app uses
// a password-grant login form served at /login.
//
// After PKCE migration, this will redirect to Keycloak instead of /login.

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { useSilentRefresh } from '@plexica/auth/use-silent-refresh';

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

  const onUnauthenticated = useCallback(() => {
    void navigate({ to: '/login' });
  }, [navigate]);

  const { isAuthenticated: guarded } = useSilentRefresh(
    { status, isAuthenticated, refreshToken, refresh, setSessionExpired },
    onUnauthenticated,
  );

  if (!guarded) {
    return null;
  }

  return <>{children}</>;
}
