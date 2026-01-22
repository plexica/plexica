// File: apps/plugin-crm/src/routes/index.ts

import type { PluginRoute } from '../manifest';

/**
 * Export plugin routes for dynamic registration
 * The host app will import this to register routes
 */
export const routes: PluginRoute[] = [
  {
    path: '/plugins/crm',
    componentName: 'HomePage',
    title: 'CRM Dashboard',
    layout: 'default',
  },
  {
    path: '/plugins/crm/contacts',
    componentName: 'ContactsPage',
    title: 'Contacts',
    layout: 'default',
    permissions: ['plugin.crm.contacts.view'],
  },
  {
    path: '/plugins/crm/deals',
    componentName: 'DealsPage',
    title: 'Deals',
    layout: 'default',
    permissions: ['plugin.crm.deals.view'],
  },
];

export default routes;
