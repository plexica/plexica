// File: apps/plugin-template-frontend/src/routes/index.ts

import type { PluginRoute } from '@plexica/types';

/**
 * Export plugin routes for dynamic registration.
 * The host app imports this to register routes via Module Federation.
 *
 * Each route's `componentName` must match a named export from `Plugin.tsx`
 * (e.g. "HomePage" → `export { HomePage }` in Plugin.tsx).
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
