// apps/web/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AuthProvider } from '../components/AuthProvider';
import { MockAuthProvider } from '../components/MockAuthProvider';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { PluginProvider } from '../contexts/PluginContext';
import { ToastProvider } from '../components/ToastProvider';
import { bootstrapAuth } from '../stores/auth.store';

// In E2E test mode, use MockAuthProvider which bypasses Keycloak
const isE2ETestMode = import.meta.env.VITE_E2E_TEST_MODE === 'true';
const SelectedAuthProvider = isE2ETestMode ? MockAuthProvider : AuthProvider;

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  // Bootstrap the new OAuth store (attempt session resume from sessionStorage)
  // This runs once on mount and is safe to call in parallel with AuthProvider.
  useEffect(() => {
    void bootstrapAuth();
  }, []);

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
