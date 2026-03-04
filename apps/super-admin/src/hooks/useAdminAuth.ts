// File: apps/super-admin/src/hooks/useAdminAuth.ts
//
// Auth guard hook for the Super Admin portal (Spec 008 T008-41).
// `useRequireSuperAdmin()` reads the current user's roles from AuthContext
// and redirects to '/' if the user lacks the 'super-admin' role.

import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/contexts/AuthContext';

/**
 * Requires the current user to have the 'super-admin' role.
 *
 * - While auth is loading, returns `null` (caller should render a spinner).
 * - If the user is not authenticated or lacks the role, navigates to '/' and returns `null`.
 * - Otherwise returns the current `User` object.
 *
 * Place at the top of every Super Admin layout or page component.
 */
export function useRequireSuperAdmin(): User | null {
  const { isLoading, isAuthenticated, user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !isSuperAdmin()) {
      void navigate({ to: '/' });
    }
  }, [isLoading, isAuthenticated, isSuperAdmin, navigate]);

  if (isLoading) return null;
  if (!isAuthenticated || !isSuperAdmin()) return null;
  return user;
}
