// File: apps/super-admin/src/routes/analytics.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { AppLayout } from '@/components/Layout/AppLayout';
import { AnalyticsView } from '@/components/views/AnalyticsView';

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <ProtectedRoute requiredRole="super-admin">
      <AppLayout>
        <AnalyticsView />
      </AppLayout>
    </ProtectedRoute>
  );
}
