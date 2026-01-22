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
  id: 'plugin-template',
  name: 'Plugin Template',
  version: '0.1.0',
  description: 'A template for creating Plexica frontend plugins',
  author: 'Plexica Team',
  icon: 'Package',
  routes: [
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
  ],
  menuItems: [
    {
      id: 'template-home',
      label: 'Template',
      icon: 'Package',
      path: '/plugins/template',
      order: 100,
    },
  ],
  permissions: [
    'plugin.template.view',
    'plugin.template.settings.view',
    'plugin.template.settings.edit',
  ],
};

export default manifest;
