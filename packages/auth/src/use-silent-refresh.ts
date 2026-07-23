// use-silent-refresh.ts
// Shared React hook for the "silent token refresh before redirect" pattern.
// Both apps/web and apps/admin use the same logic:
//   1. If the user is unauthenticated but has a refresh token → attempt silent refresh
//   2. If refresh fails → mark session as expired
//   3. If no refresh token → call the onUnauthenticated callback (navigate to login, trigger PKCE, etc.)

import { useEffect, useRef } from 'react';

export interface SilentRefreshConfig {
  status: 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';
  isAuthenticated: boolean;
  refreshToken: string | null;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
}

/**
 * Hook that encapsulates the silent refresh logic.
 *
 * Call from AuthGuard or any component that guards authenticated content.
 * If the user is unauthenticated and has no refresh token, `onUnauthenticated`
 * is called so the parent can decide how to redirect (router.navigate vs
 * window.location.href to Keycloak).
 *
 * Returns `isAuthenticated` — the guard should render `null` or a spinner
 * while this is false.
 */
export function useSilentRefresh(
  config: SilentRefreshConfig,
  onUnauthenticated: () => void,
): { isAuthenticated: boolean } {
  const { status, isAuthenticated, refreshToken, refresh, setSessionExpired } = config;

  const refreshAttempted = useRef(false);
  const unauthenticatedHandled = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated') {
      // Reset guards when leaving unauthenticated state so they can fire again
      // if the component re-enters it (e.g. after a failed login attempt).
      refreshAttempted.current = false;
      unauthenticatedHandled.current = false;
      return;
    }

    if (refreshToken !== null && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refresh().catch(() => {
        setSessionExpired();
      });
      return;
    }

    if (refreshToken === null && !unauthenticatedHandled.current) {
      unauthenticatedHandled.current = true;
      onUnauthenticated();
    }
  }, [status, refreshToken, refresh, setSessionExpired, onUnauthenticated]);

  return { isAuthenticated };
}
