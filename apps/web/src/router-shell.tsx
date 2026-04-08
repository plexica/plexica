// router-shell.tsx
// Exports the root and shell route definitions shared between router.tsx and router-shell-routes.tsx.
// Kept separate to avoid circular imports.

import React from 'react';
import { createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router';

import { resolveTenant, TenantResolutionError } from './services/tenant-resolver.js';
import { useAuthStore } from './stores/auth-store.js';
import { AppShell } from './components/layout/app-shell.js';
import { AuthCallbackPage } from './pages/auth-callback-page.js';
import { OrgErrorPage } from './pages/org-error-page.js';
import { AuthGuard } from './components/auth/auth-guard.js';

// Root route — resolves tenant on app load
export const rootRoute = createRootRoute({
  loader: async ({ location }) => {
    if (location.pathname === '/org-error' || location.pathname === '/callback') {
      return {};
    }
    const stored = useAuthStore.getState();
    if (stored.tenantSlug !== null && stored.realm !== null) {
      return { tenant: { slug: stored.tenantSlug, realm: stored.realm } };
    }
    try {
      const tenant = await resolveTenant();
      useAuthStore.getState().setTenantContext(tenant.slug, tenant.realm);
      return { tenant };
    } catch (err) {
      if (err instanceof TenantResolutionError) {
        throw redirect({ to: '/org-error', search: { reason: err.reason } });
      }
      throw redirect({ to: '/org-error', search: { reason: 'unknown' } });
    }
  },
  component: () => <Outlet />,
});

// /callback
export const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: AuthCallbackPage,
});

// /org-error
export const orgErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/org-error',
  component: OrgErrorPage,
});

// / → redirect to /dashboard
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
});

// Authenticated shell layout
export const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: () => (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  ),
});
