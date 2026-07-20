// router-shell-routes.tsx
// All authenticated shell child routes for the admin app.
// Imported by router.tsx and added to shellRoute.addChildren([...]).
// Initially placeholders — filled per feature in subsequent sprint cards.

import { createRoute } from '@tanstack/react-router';

import { shellRoute } from './router-shell.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { TenantsPage } from './pages/tenants-page.js';
import { TenantDetailPage } from './pages/tenant-detail-page.js';
import { ProvisionPage } from './pages/provision-page.js';
import { PluginsPage } from './pages/plugins-page.js';
import { HealthPage } from './pages/health-page.js';
import { LogsPage } from './pages/logs-page.js';
import { KafkaPage } from './pages/kafka-page.js';

export const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export const tenantsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/tenants',
  component: TenantsPage,
});

export const tenantDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/tenants/$tenantId',
  component: TenantDetailPage,
});

export const provisionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/provision',
  component: ProvisionPage,
});

export const pluginsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/plugins',
  component: PluginsPage,
});

export const healthRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/health',
  component: HealthPage,
});

export const logsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/logs',
  component: LogsPage,
});

export const kafkaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/kafka',
  component: KafkaPage,
});

export const shellChildRoutes = [
  dashboardRoute,
  tenantsRoute,
  tenantDetailRoute,
  provisionRoute,
  pluginsRoute,
  healthRoute,
  logsRoute,
  kafkaRoute,
];
