// File: apps/web/src/routes/login.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../components/AuthProvider';
import { useEffect } from 'react';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { isAuthenticated, login, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: '/' });
    }
  }, [isAuthenticated, navigate]);

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

        <button
          onClick={login}
          className="w-full px-4 py-3 text-white bg-primary hover:bg-primary/90 rounded-lg font-medium transition-colors"
        >
          Sign in with Keycloak
        </button>

        <div className="text-center text-sm text-muted-foreground">
          <p>Multi-tenant SaaS Platform</p>
        </div>
      </div>
    </div>
  );
}
