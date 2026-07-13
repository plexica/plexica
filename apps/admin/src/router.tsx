// router.tsx
// TanStack Router configuration for the admin app.
// No Module Federation — standalone app (plan D-2).
// Root + login + index routes are in router-shell.tsx.
// Shell child routes are in router-shell-routes.tsx.

import { createRouter } from '@tanstack/react-router';

import { rootRoute, loginRoute, indexRoute, shellRoute } from './router-shell.js';
import { shellChildRoutes } from './router-shell-routes.js';

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  shellRoute.addChildren([...shellChildRoutes]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
