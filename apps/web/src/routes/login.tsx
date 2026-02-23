// apps/web/src/routes/login.tsx
//
// AuthLandingPage — redesigned from the old keycloak-js placeholder.
// Implements all 7 states per design-spec Screen 1 + Screen 10 (admin variant).
// Uses the new OAuth 2.0 flow: redirects to backend /auth/login which
// returns Keycloak's authorization URL.

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@plexica/ui';
import { ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getLoginUrl, AuthClientError } from '@/lib/auth-client';
import { getTenantFromUrl } from '@/lib/tenant';
import { RateLimitCountdown } from '@/components/auth/RateLimitCountdown';
import { AuthErrorPage } from '@/components/auth/AuthErrorPage';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

// Determine if this is the super-admin app shell (no tenant subdomain)
function isAdminVariant(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('admin.');
}

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [keycloakError, setKeycloakError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const tenantSlug = getTenantFromUrl();
  const admin = isAdminVariant();

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: '/', replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSignIn = useCallback(async () => {
    if (isRedirecting || rateLimitSeconds !== null) return;
    setIsRedirecting(true);
    setKeycloakError(false);

    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const authUrl = await getLoginUrl(callbackUrl);
      window.location.href = authUrl;
    } catch (err) {
      setIsRedirecting(false);

      if (err instanceof AuthClientError) {
        if (err.status === 429) {
          // Parse Retry-After from error details if available — default 60 s
          setRateLimitSeconds(60);
          return;
        }
        if (err.status === 404 || err.code === 'TENANT_NOT_FOUND') {
          setNotFound(true);
          return;
        }
        if (err.status === 403 || err.code === 'AUTH_TENANT_SUSPENDED') {
          setSuspended(true);
          return;
        }
      }
      setKeycloakError(true);
    }
  }, [isRedirecting, rateLimitSeconds]);

  // Full-screen error pages
  if (notFound) {
    return <AuthErrorPage variant="not-found" slug={tenantSlug} />;
  }
  if (suspended) {
    return <AuthErrorPage variant="suspended" slug={tenantSlug} />;
  }

  // Loading skeleton while auth state is being determined
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--auth-bg-gradient-from)] to-[var(--auth-bg-gradient-to)]">
        <div className="w-full max-w-[var(--auth-card-max-width)] p-8 space-y-4 sm:border sm:border-border sm:rounded-lg sm:shadow-lg sm:bg-card">
          {/* Skeleton logo */}
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-lg bg-muted animate-pulse" aria-hidden="true" />
          </div>
          {/* Skeleton heading */}
          <div className="h-7 bg-muted rounded animate-pulse" aria-hidden="true" />
          <div className="h-4 bg-muted rounded w-3/4 mx-auto animate-pulse" aria-hidden="true" />
          {/* Skeleton button */}
          <div className="h-11 bg-muted rounded animate-pulse" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--auth-bg-gradient-from)] to-[var(--auth-bg-gradient-to)] px-4"
      aria-label={admin ? 'Super admin sign in' : 'Sign in to your workspace'}
    >
      <div className="w-full max-w-[var(--auth-card-max-width)] sm:border sm:border-border sm:rounded-lg sm:shadow-lg sm:bg-card p-8 space-y-6">
        {/* Branding */}
        <div className="flex flex-col items-center text-center space-y-3">
          {admin ? (
            <div className="p-3 rounded-full bg-primary/10">
              <ShieldCheck className="w-10 h-10 text-primary" aria-hidden="true" />
            </div>
          ) : (
            <div
              className="w-16 h-16 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-2xl"
              aria-hidden="true"
            >
              P
            </div>
          )}

          <h1 className="text-2xl font-bold text-foreground">
            {admin ? 'Plexica Admin' : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {admin ? 'Platform management console' : `Sign in to ${tenantSlug}`}
          </p>
        </div>

        {/* Cross-tenant alert (Screen 7) */}
        {/* This is surfaced when the URL has a cross_tenant error param */}
        {new URLSearchParams(window.location.search).get('error') === 'cross_tenant' && (
          <div
            role="alert"
            className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
          >
            You are signed in to a different workspace. Please sign in to continue.
          </div>
        )}

        {/* Keycloak unavailable alert (Screen 8) */}
        {keycloakError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <p className="font-medium">Authentication service unavailable</p>
            <p className="mt-1 text-xs">Please try again in a moment.</p>
          </div>
        )}

        {/* Rate limit countdown (Screen 6) */}
        {rateLimitSeconds !== null && (
          <RateLimitCountdown
            retryAfterSeconds={rateLimitSeconds}
            onExpired={() => setRateLimitSeconds(null)}
          />
        )}

        {/* Sign In button */}
        <Button
          onClick={handleSignIn}
          size="lg"
          className="w-full min-h-[44px]"
          disabled={isRedirecting || rateLimitSeconds !== null}
          aria-label={admin ? 'Sign in to Plexica Admin' : 'Sign in with your account'}
          aria-busy={isRedirecting}
          aria-disabled={isRedirecting || rateLimitSeconds !== null}
        >
          {isRedirecting ? (
            <>
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2"
                aria-hidden="true"
              />
              Redirecting…
            </>
          ) : keycloakError ? (
            'Retry sign in'
          ) : (
            'Sign in'
          )}
        </Button>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground">
          {admin
            ? 'Requires super-admin role in Keycloak'
            : 'You will be redirected to your identity provider'}
        </p>
      </div>
    </main>
  );
}
