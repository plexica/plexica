// apps/web/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../components/AuthProvider';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { PluginProvider } from '../contexts/PluginContext';
import { ToastProvider } from '../components/ToastProvider';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <PluginProvider>
          <ToastProvider />
          <Outlet />
        </PluginProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
