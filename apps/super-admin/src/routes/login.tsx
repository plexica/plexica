// File: apps/super-admin/src/routes/login.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button, Card, CardContent } from '@plexica/ui';
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

/**
 * Login Page with Keycloak SSO
 *
 * Redirects authenticated users to /tenants
 * Shows SSO login button for unauthenticated users
 */
function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[LoginPage] User already authenticated, redirecting...');
      navigate({ to: '/tenants' });
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    console.log('[LoginPage] Initiating Keycloak SSO login...');
    login();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 bg-primary rounded-lg items-center justify-center text-white font-bold text-2xl mb-4">
              P
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Plexica Super Admin</h1>
            <p className="text-sm text-muted-foreground">Platform Management Console</p>
          </div>

          {/* SSO Login Button */}
          <div className="space-y-4">
            <Button onClick={handleLogin} className="w-full" size="lg">
              <LogIn className="mr-2 h-5 w-5" />
              Sign in with Keycloak SSO
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You will be redirected to Keycloak for authentication
            </p>
          </div>

          {/* Info Cards */}
          <div className="mt-6 space-y-3">
            {/* Keycloak Realm Info */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">
                Authentication Realm
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">plexica-admin</code>
              </p>
            </div>

            {/* Required Role Info */}
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">
                    Required Role
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    You must have the{' '}
                    <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">super-admin</code>{' '}
                    role in Keycloak to access this application.
                  </p>
                </div>
              </div>
            </div>

            {/* Development Note */}
            <div className="bg-muted border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Note:</strong> Ensure Keycloak is running at{' '}
                <code className="bg-background px-1 rounded">
                  {import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080'}
                </code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
