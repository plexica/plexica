// router.tsx
// TanStack Router configuration.
// Root loader resolves tenant; authenticated routes are wrapped in AppShell.
// Shell child routes are in router-shell-routes.tsx.
// Route definitions (root, shell, index, callback, org-error) are in router-shell.tsx.

import React from 'react';
import { createRoute, createRouter } from '@tanstack/react-router';

import { rootRoute, callbackRoute, orgErrorRoute, indexRoute, shellRoute } from './router-shell.js';
import { shellChildRoutes } from './router-shell-routes.js';

// /test-error — dev/E2E only: triggers RouteErrorBoundary for E2E testing (M-6)
const testRoutesEnabled = import.meta.env.DEV || import.meta.env.VITE_E2E === 'true';

const LazyTestErrorPage = testRoutesEnabled
  ? React.lazy(() =>
      import('./pages/test-error-page.js').then((m) => ({ default: m.TestErrorPage }))
    )
  : null;

const testErrorRoute =
  testRoutesEnabled && LazyTestErrorPage !== null
    ? createRoute({
        getParentRoute: () => shellRoute,
        path: '/test-error',
        component: LazyTestErrorPage,
      })
    : null;

const routeTree = rootRoute.addChildren([
  indexRoute,
  callbackRoute,
  orgErrorRoute,
  shellRoute.addChildren([
    ...shellChildRoutes,
    ...(testErrorRoute !== null ? [testErrorRoute] : []),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
