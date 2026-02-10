// File: apps/plugin-analytics/src/Plugin.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';

/**
 * Main Plugin component - Analytics
 * This exports all page components for Module Federation
 */

// Import page components
import DashboardPage from './components/DashboardPage';
import ReportsPage from './components/ReportsPage';

// Export components for Module Federation
export { DashboardPage, ReportsPage };

// Default export (optional, for backwards compatibility)
const Plugin: React.FC<PluginProps> = (props) => {
  return <DashboardPage {...props} />;
};

export default Plugin;
