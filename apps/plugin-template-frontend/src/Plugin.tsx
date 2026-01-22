// File: apps/plugin-template-frontend/src/Plugin.tsx

import React from 'react';

export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

/**
 * Main Plugin component
 * This is the entry point for your plugin
 */
const Plugin: React.FC<PluginProps> = ({ tenantId, userId, workspaceId }) => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Plugin Template</h1>
      <p className="text-gray-600 mb-2">
        This is a template for creating Plexica plugins with Module Federation.
      </p>

      <div className="mt-4 p-4 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">Plugin Context</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <strong>Tenant ID:</strong> {tenantId}
          </li>
          <li>
            <strong>User ID:</strong> {userId}
          </li>
          {workspaceId && (
            <li>
              <strong>Workspace ID:</strong> {workspaceId}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="font-semibold mb-2">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            Update the plugin manifest in <code>src/manifest.ts</code>
          </li>
          <li>
            Add your routes in <code>src/routes/index.ts</code>
          </li>
          <li>
            Create your pages in <code>src/pages/</code>
          </li>
          <li>
            Build your components in <code>src/components/</code>
          </li>
          <li>
            Run <code>pnpm dev</code> to start development server
          </li>
          <li>
            Run <code>pnpm build</code> to build for production
          </li>
        </ol>
      </div>
    </div>
  );
};

export default Plugin;
