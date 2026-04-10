// use-token-refresh.ts
// Proactive silent token refresh hook.
//
// Two responsibilities:
//   1. On mount: if rehydration found an expired access token but a valid
//      refresh token exists, attempt a silent refresh immediately so the
//      user is not redirected to Keycloak unnecessarily.
//   2. While authenticated: refresh proactively every REFRESH_INTERVAL_MS
//      (55 s) so the access token never expires between user actions.
//      The access token TTL is 60 s (ID-005); 55 s gives 5 s headroom.
//
// Called once at the application root (main.tsx) via TokenRefreshProvider.

import { useEffect } from 'react';

import { useAuthStore } from '../stores/auth-store.js';

// 55 seconds — access token TTL is 60 s (see decision ID-005)
const REFRESH_INTERVAL_MS = 55_000;

export function useTokenRefresh(): void {
  const status = useAuthStore((s) => s.status);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const refresh = useAuthStore((s) => s.refresh);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);

  // --- On-mount silent refresh ---
  // When `onRehydrateStorage` detects an expired access token it leaves
  // status as 'unauthenticated' but the refresh token may still be valid.
  // Attempt one silent refresh before AuthGuard triggers a Keycloak redirect.
  useEffect(() => {
    if (status === 'unauthenticated' && refreshToken !== null) {
      refresh().catch(() => {
        // Refresh token is also expired — mark session as expired so
        // SessionExpiredHandler shows the toast, then AuthGuard redirects.
        setSessionExpired();
      });
    }
    // Only run once on mount (empty deps would miss the rehydrated state;
    // we check status + refreshToken which are set synchronously by zustand).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Periodic proactive refresh ---
  // Only run the timer when the user is actively authenticated.
  useEffect(() => {
    if (status !== 'authenticated') return;

    const id = setInterval(() => {
      refresh().catch(() => {
        setSessionExpired();
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [status, refresh, setSessionExpired]);
}
