// File: apps/super-admin/src/routes/plugins/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PluginsView } from '@/components/views/PluginsView';

export const Route = createFileRoute('/plugins/')({
  component: PluginsPage,
});

function PluginsPage() {
  return (
    <ProtectedRoute requiredRole="super-admin">
      <AppLayout>
        <PluginsView />
      </AppLayout>
    </ProtectedRoute>
  );
}
