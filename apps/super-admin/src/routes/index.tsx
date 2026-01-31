// File: apps/super-admin/src/routes/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { AppLayout } from '@/components/Layout/AppLayout';
import { DashboardView } from '@/components/views/DashboardView';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <ProtectedRoute requiredRole="super-admin">
      <AppLayout>
        <DashboardView />
      </AppLayout>
    </ProtectedRoute>
  );
}
