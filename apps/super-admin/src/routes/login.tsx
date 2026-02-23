// File: apps/super-admin/src/routes/login.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button, Card, CardContent } from '@plexica/ui';
import { AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

/**
 * Super-Admin Login Page
 *
 * Redirects authenticated admins to the dashboard (/)
 * Shows SSO login button for unauthenticated users
 */
function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: '/' });
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    login();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-white border-r-transparent mb-4"></div>
          <p className="text-slate-300">Checking authentication…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4"
      role="main"
    >
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardContent className="pt-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex w-16 h-16 bg-primary rounded-xl items-center justify-center mb-4"
              aria-hidden="true"
            >
              <Shield className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Plexica Admin</h1>
            <p className="text-sm text-slate-400">Platform Management Console</p>
          </div>

          {/* SSO Login Button */}
          <div className="space-y-4">
            <Button
              onClick={handleLogin}
              className="w-full"
              size="lg"
              aria-label="Sign in with Keycloak SSO"
            >
              <Shield className="mr-2 h-5 w-5" aria-hidden="true" />
              Sign in with Keycloak SSO
            </Button>

            <p className="text-xs text-center text-slate-400">
              You will be redirected to Keycloak for authentication
            </p>
          </div>

          {/* Info Cards */}
          <div className="mt-6 space-y-3">
            {/* Keycloak Realm Info */}
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-200 font-medium mb-1">Authentication Realm</p>
              <p className="text-xs text-blue-300">
                <code className="bg-blue-900 px-1 rounded">plexica-admin</code>
              </p>
            </div>

            {/* Required Role Info */}
            <div className="bg-amber-950 border border-amber-800 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertCircle
                  className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-amber-200 font-medium mb-1">Required Role</p>
                  <p className="text-xs text-amber-300">
                    You must have the <code className="bg-amber-900 px-1 rounded">super-admin</code>{' '}
                    role in Keycloak to access this application.
                  </p>
                </div>
              </div>
            </div>

            {/* Development Note */}
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
              <p className="text-xs text-slate-400">
                <strong className="text-slate-300">Note:</strong> Ensure Keycloak is running at{' '}
                <code className="bg-slate-800 px-1 rounded">
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
