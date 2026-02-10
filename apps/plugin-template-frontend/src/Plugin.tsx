// File: apps/plugin-template-frontend/src/Plugin.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

/**
 * Main Plugin component — entry point loaded by the host via Module Federation.
 *
 * The host passes `PluginProps` (tenantId, userId, workspaceId) which you can
 * forward to sub-pages. In a real plugin you'd use your own internal router or
 * let the host's TanStack Router handle page switching via the manifest routes.
 *
 * This default export renders the HomePage. Individual pages are also exported
 * from `./routes` so the host can mount them at their declared paths.
 */
const Plugin: React.FC<PluginProps> = (props) => {
  return <HomePage {...props} />;
};

export default Plugin;

/**
 * Named exports for the host router to mount individual pages.
 * The `componentName` in your manifest routes (e.g. "HomePage", "SettingsPage")
 * maps to these exports.
 */
export { HomePage, SettingsPage };
