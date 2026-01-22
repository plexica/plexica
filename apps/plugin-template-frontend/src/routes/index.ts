// File: apps/plugin-template-frontend/src/routes/index.ts

import type { PluginRoute } from '../manifest';

/**
 * Export plugin routes for dynamic registration
 * The host app will import this to register routes
 */
export const routes: PluginRoute[] = [
  {
    path: '/plugins/template',
    componentName: 'HomePage',
    title: 'Template Home',
    layout: 'default',
  },
  {
    path: '/plugins/template/settings',
    componentName: 'SettingsPage',
    title: 'Template Settings',
    layout: 'default',
    permissions: ['plugin.template.settings.view'],
  },
];

export default routes;
