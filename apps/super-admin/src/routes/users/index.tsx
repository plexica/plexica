// File: apps/super-admin/src/routes/users/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { AppLayout } from '@/components/Layout/AppLayout';
import { UsersView } from '@/components/views/UsersView';

export const Route = createFileRoute('/users/')({
  component: UsersPage,
});

function UsersPage() {
  return (
    <ProtectedRoute requiredRole="super-admin">
      <AppLayout>
        <UsersView />
      </AppLayout>
    </ProtectedRoute>
  );
}
