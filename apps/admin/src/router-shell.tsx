// router-shell.tsx
// Root + shell + callback + login + index route definitions for the admin app.
// Kept separate to avoid circular imports between router.tsx and routes.
//
// Key difference from apps/web: NO tenant resolution. The admin app
// authenticates against the Keycloak master realm, not a tenant realm.

import React from 'react';
import { createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router';

import { AppShell } from './components/layout/app-shell.js';
import { AuthCallbackPage } from './pages/auth-callback-page.js';
import { LoginPage } from './pages/login-page.js';
import { AuthGuard } from './components/auth/auth-guard.js';

// Root route — no tenant resolution (admin uses master realm).
export const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// /callback — handles the Keycloak PKCE redirect.
// Must be public (unguarded) so the auth callback can be processed.
export const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: AuthCallbackPage,
});

// /login — redirect page to Keycloak PKCE login.
// No longer a password form; auto-redirects to Keycloak.
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// / → redirect to /dashboard.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
});

// Authenticated shell layout — guarded by AuthGuard.
export const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: () => (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  ),
});
