// File: apps/super-admin/src/components/providers/ProtectedRoute.tsx

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from '@tanstack/react-router';
import { Card } from '@plexica/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

/**
 * Protected route wrapper with authentication and role-based access control
 *
 * Features:
 * - Requires Keycloak authentication
 * - Supports role-based access (default: super-admin)
 * - Shows loading state during auth check
 * - Redirects to login if unauthenticated
 * - Shows forbidden page if insufficient permissions
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole = 'super-admin',
}) => {
  const { isLoading, isAuthenticated, hasRole, user } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    console.warn('[ProtectedRoute] User not authenticated, redirecting to login');
    return <Navigate to="/login" />;
  }

  // Check required role (default is super-admin)
  if (requiredRole && !hasRole(requiredRole)) {
    console.warn(`[ProtectedRoute] User lacks required role: ${requiredRole}`);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You do not have the required permissions to access this page.
          </p>
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-destructive">
              <strong>Required Role:</strong> {requiredRole}
            </p>
            {user && (
              <p className="text-sm text-muted-foreground mt-2">Logged in as: {user.email}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Please contact your system administrator if you believe this is an error.
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
