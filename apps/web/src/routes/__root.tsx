// apps/web/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../components/AuthProvider';
import { MockAuthProvider } from '../components/MockAuthProvider';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { PluginProvider } from '../contexts/PluginContext';
import { ToastProvider } from '../components/ToastProvider';

// In E2E test mode, use MockAuthProvider which bypasses Keycloak
const isE2ETestMode = import.meta.env.VITE_E2E_TEST_MODE === 'true';
const SelectedAuthProvider = isE2ETestMode ? MockAuthProvider : AuthProvider;

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <SelectedAuthProvider>
      <WorkspaceProvider>
        <PluginProvider>
          <ToastProvider />
          <Outlet />
        </PluginProvider>
      </WorkspaceProvider>
    </SelectedAuthProvider>
  );
}
