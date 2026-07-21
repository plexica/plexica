// auth-guard.tsx
// Route guard for the tenant web app.
// Uses useSilentRefresh from @plexica/auth for the shared silent-refresh pattern.
// When unauthenticated with no refresh token, redirects to Keycloak PKCE login.

import { useCallback } from 'react';

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
  const login = useAuthStore((s) => s.login);

  const onUnauthenticated = useCallback(() => {
    void login();
  }, [login]);

  const { isAuthenticated: guarded } = useSilentRefresh(
    { status, isAuthenticated, refreshToken, refresh, setSessionExpired },
    onUnauthenticated,
  );

  if (!guarded) {
    return null;
  }

  return <>{children}</>;
}
