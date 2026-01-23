// File: apps/super-admin/src/routes/__root.tsx

import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Outlet />
        <ToastProvider />
      </AuthProvider>
    </ThemeProvider>
  );
}
