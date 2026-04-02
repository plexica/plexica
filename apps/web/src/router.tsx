// router.tsx
// TanStack Router configuration.
// Root loader resolves tenant; authenticated routes are wrapped in AppShell.

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { resolveTenant, TenantResolutionError } from './services/tenant-resolver.js';
import { useAuthStore } from './stores/auth-store.js';
import { AppShell } from './components/layout/app-shell.js';
import { RouteErrorBoundary } from './components/error/route-error-boundary.js';
import { AuthCallbackPage } from './pages/auth-callback-page.js';
import { OrgErrorPage } from './pages/org-error-page.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { AuthGuard } from './components/auth/auth-guard.js';

// Dev-only import for error boundary E2E tests (M-6)
// Tree-shaken away in production builds by Vite.
const TestErrorPage = import.meta.env.DEV
  ? (await import('./pages/test-error-page.js')).TestErrorPage
  : null;

// Root route — resolves tenant on app load
const rootRoute = createRootRoute({
  loader: async () => {
    // Fast path: tenant already resolved in a previous navigation (e.g. returning
    // from the Keycloak OAuth redirect). Zustand persists tenantSlug + realm in
    // sessionStorage, so they survive the full-page redirect to Keycloak and back.
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

// /callback — handles Keycloak OIDC redirect (no shell)
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: AuthCallbackPage,
});

// /org-error — tenant resolution failure (no shell)
const orgErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/org-error',
  component: OrgErrorPage,
});

// Authenticated shell layout route — all protected routes nest here
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: () => (
    <AuthGuard>
      <RouteErrorBoundary>
        <AppShell />
      </RouteErrorBoundary>
    </AuthGuard>
  ),
});

// /dashboard
const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dashboard',
  component: DashboardPage,
});

// /test-error — dev/test only: triggers RouteErrorBoundary for E2E testing (M-6)
const testErrorRoute =
  import.meta.env.DEV && TestErrorPage !== null
    ? createRoute({
        getParentRoute: () => shellRoute,
        path: '/test-error',
        component: TestErrorPage,
      })
    : null;

// / → redirect to /dashboard
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  callbackRoute,
  orgErrorRoute,
  shellRoute.addChildren([dashboardRoute, ...(testErrorRoute !== null ? [testErrorRoute] : [])]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
