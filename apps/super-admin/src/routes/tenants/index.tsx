// File: apps/super-admin/src/routes/tenants/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TenantsView } from '@/components/views/TenantsView';

export const Route = createFileRoute('/tenants/')({
  component: TenantsPage,
});

function TenantsPage() {
  return (
    <ProtectedRoute requiredRole="super-admin">
      <AppLayout>
        <TenantsView />
      </AppLayout>
    </ProtectedRoute>
  );
}
