// File: apps/super-admin/src/components/providers/ProtectedRoute.tsx

import React from 'react';
import { useAuth } from './AuthProvider';
import { Navigate } from '@tanstack/react-router';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

/**
 * Protected route wrapper that requires authentication
 * TODO: Add role-based access control in Phase 3
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isLoading, isAuthenticated } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  // TODO: Check required role when Keycloak is integrated
  // if (requiredRole && !hasRole(requiredRole)) {
  //   return <Navigate to="/unauthorized" />;
  // }

  return <>{children}</>;
};
