// File: apps/web/src/hooks/useAdminAuth.ts
//
// Auth guard hook for the Tenant Admin section of apps/web (Spec 008 T008-41).
// `useRequireTenantAdmin()` checks whether the current user holds one of the
// recognised tenant-admin roles and redirects to '/' if not.
//
// Role hierarchy (Keycloak realm roles):
//   'admin'         — platform-wide admin (highest privilege in web app)
//   'tenant_admin'  — full tenant administrator
//   'tenant_owner'  — tenant owner (same privilege level for admin UI)
//
// Any of the three roles is sufficient to access the Tenant Admin interface.

import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/components/AuthProvider';

/** Roles that grant access to the Tenant Admin interface. */
const TENANT_ADMIN_ROLES = ['admin', 'tenant_admin', 'tenant_owner'] as const;

/**
 * Requires the current user to hold at least one tenant-admin role.
 *
 * - While auth is loading, returns `false` (caller should render a spinner).
 * - If the user is not authenticated or lacks the required role, navigates to
 *   '/' and returns `false`.
 * - Otherwise returns `true`.
 *
 * Place at the top of every Tenant Admin layout or page component.
 *
 * @example
 * ```tsx
 * function AdminLayout() {
 *   const isAdmin = useRequireTenantAdmin();
 *   if (!isAdmin) return <LoadingSpinner />;
 *   return <Outlet />;
 * }
 * ```
 */
export function useRequireTenantAdmin(): boolean {
  const { isLoading, isAuthenticated, hasRole } = useAuth();
  const navigate = useNavigate();

  const hasTenantAdminRole = TENANT_ADMIN_ROLES.some((role) => hasRole(role));

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !hasTenantAdminRole) {
      void navigate({ to: '/' });
    }
  }, [isLoading, isAuthenticated, hasTenantAdminRole, navigate]);

  if (isLoading) return false;
  return isAuthenticated && hasTenantAdminRole;
}
