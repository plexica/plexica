// File: apps/plugin-crm/src/Plugin.tsx

import React from 'react';

export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

/**
 * Main Plugin component - CRM
 * This exports all page components for Module Federation
 */

// Import page components
import HomePage from './components/HomePage';
import ContactsPage from './components/ContactsPage';
import DealsPage from './components/DealsPage';

// Export components for Module Federation
export { HomePage, ContactsPage, DealsPage };

// Default export (optional, for backwards compatibility)
const Plugin: React.FC<PluginProps> = (props) => {
  return <HomePage {...props} />;
};

export default Plugin;
