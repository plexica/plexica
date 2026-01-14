// apps/web/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../components/AuthProvider';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <Outlet />
      </WorkspaceProvider>
    </AuthProvider>
  );
}
