// File: apps/super-admin/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { MockAuthProvider } from '@/components/providers/MockAuthProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Check if we're in E2E test mode
const isE2ETestMode = import.meta.env.VITE_E2E_TEST_MODE === 'true';

// Debug: Always log the environment variable value
console.log(
  '🔍 [Debug] VITE_E2E_TEST_MODE =',
  import.meta.env.VITE_E2E_TEST_MODE,
  typeof import.meta.env.VITE_E2E_TEST_MODE
);
console.log('🔍 [Debug] isE2ETestMode =', isE2ETestMode);

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Use MockAuthProvider in E2E test mode, otherwise use real AuthProvider
  const SelectedAuthProvider = isE2ETestMode ? MockAuthProvider : AuthProvider;

  if (isE2ETestMode) {
    console.log('🧪 [E2E Test Mode] Using MockAuthProvider');
  } else {
    console.log('🔐 [Production Mode] Using real AuthProvider with Keycloak');
  }

  return (
    <ThemeProvider>
      <SelectedAuthProvider>
        <Outlet />
        <ToastProvider />
      </SelectedAuthProvider>
    </ThemeProvider>
  );
}
