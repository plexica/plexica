// File: apps/plugin-analytics/src/routes/index.ts

import type { PluginRoute } from '../manifest';

/**
 * Export plugin routes for dynamic registration
 * The host app will import this to register routes
 */
export const routes: PluginRoute[] = [
  {
    path: '/plugins/analytics',
    componentName: 'DashboardPage',
    title: 'Analytics Dashboard',
    layout: 'default',
  },
  {
    path: '/plugins/analytics/reports',
    componentName: 'ReportsPage',
    title: 'Reports',
    layout: 'default',
    permissions: ['plugin.analytics.reports.view'],
  },
];

export default routes;
