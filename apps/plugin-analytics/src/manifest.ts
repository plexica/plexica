// File: apps/plugin-template-frontend/src/manifest.ts

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  routes: PluginRoute[];
  menuItems: PluginMenuItem[];
  permissions?: string[];
}

export interface PluginRoute {
  path: string;
  componentName: string;
  title: string;
  layout?: 'default' | 'fullscreen' | 'minimal';
  permissions?: string[];
}

export interface PluginMenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: PluginMenuItem[];
  permissions?: string[];
  order?: number;
}

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
