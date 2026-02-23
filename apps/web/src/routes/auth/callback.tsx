// apps/web/src/routes/auth/callback.tsx
//
// OAuth 2.0 callback route — Screen 2 (Auth Callback Loading State).
// After Keycloak redirects back with ?code=...&state=..., this route:
//  1. Shows a loading spinner while exchanging the code for tokens
//  2. On success: stores tokens in auth store, restores deep-link, navigates to home
//  3. On error: navigates to /auth/error with an error code query param

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuthStore, type TokenSet } from '@/stores/auth.store';
import { exchangeCode } from '@/lib/auth-client';

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
});

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setTokens, consumeDeepLink, setError } = useAuthStore();
  const exchangedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? undefined;
    const error = params.get('error');

    if (error || !code) {
      const errCode = error ?? 'MISSING_CODE';
      navigate({ to: '/auth/error', search: { code: errCode }, replace: true });
      return;
    }

    exchangeCode(code, state)
      .then((data) => {
        const tokenSet: TokenSet = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        setTokens(tokenSet);

        // Restore deep-link or go home
        const deepLink = consumeDeepLink();
        navigate({ to: deepLink ?? '/', replace: true });
      })
      .catch((err: unknown) => {
        const code =
          err instanceof Error && 'code' in err
            ? (err as { code: string }).code
            : 'EXCHANGE_FAILED';
        setError('Sign in failed. Please try again.');
        navigate({ to: '/auth/error', search: { code }, replace: true });
      });
  }, [navigate, setTokens, consumeDeepLink, setError]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Signing you in, please wait"
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--auth-bg-gradient-from)] to-[var(--auth-bg-gradient-to)]"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
