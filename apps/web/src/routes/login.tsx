// File: apps/web/src/routes/login.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../components/AuthProvider';
import { useAuthStore } from '../stores/auth-store';
import { useEffect } from 'react';
import { Button } from '@plexica/ui';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { isAuthenticated, login, isLoading } = useAuth();
  const { tenant } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[LoginPage] useEffect triggered', {
      isAuthenticated,
      tenant: tenant?.slug,
      isLoading,
    });

    if (isLoading) return;

    // If authenticated, always redirect to home
    // The tenant is determined by the URL subdomain, not user selection
    if (isAuthenticated) {
      console.log('[LoginPage] Authenticated, navigating to home');
      navigate({ to: '/', replace: true });
    }
  }, [isAuthenticated, tenant, navigate, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card border border-border rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Plexica</h1>
          <p className="mt-2 text-muted-foreground">Sign in to access your workspace</p>
        </div>

        <Button onClick={login} size="lg" className="w-full">
          Sign in with Keycloak
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          <p>Multi-tenant SaaS Platform</p>
        </div>
      </div>
    </div>
  );
}
