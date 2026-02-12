// File: apps/plugin-crm/src/manifest.ts

import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'crm',
  name: 'CRM',
  version: '0.1.0',
  description: 'Customer Relationship Management - manage contacts, deals, and sales pipeline',
  author: 'Plexica Team',
  icon: 'Users',
  routes: [
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
  ],
  menuItems: [
    {
      id: 'crm-main',
      label: 'CRM',
      icon: 'Users',
      path: '/plugins/crm',
      order: 10,
    },
  ],
  permissions: [
    'plugin.crm.view',
    'plugin.crm.contacts.view',
    'plugin.crm.contacts.edit',
    'plugin.crm.deals.view',
    'plugin.crm.deals.edit',
  ],
};

export default manifest;
