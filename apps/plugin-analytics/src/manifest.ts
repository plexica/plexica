// File: apps/plugin-analytics/src/manifest.ts

import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'analytics',
  name: 'Analytics',
  version: '0.1.0',
  description: 'Advanced analytics and reporting - visualize data and generate insights',
  author: 'Plexica Team',
  icon: 'BarChart3',
  routes: [
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
  ],
  menuItems: [
    {
      id: 'analytics-main',
      label: 'Analytics',
      icon: 'BarChart3',
      path: '/plugins/analytics',
      order: 20,
    },
  ],
  permissions: [
    'plugin.analytics.view',
    'plugin.analytics.reports.view',
    'plugin.analytics.reports.export',
  ],
};

export default manifest;
