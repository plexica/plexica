// apps/web/src/routes/activity-log.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';

export const Route = createFileRoute('/activity-log')({
  component: ActivityLogPage,
});

function ActivityLogPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Activity Log</h1>
          <p className="text-muted-foreground">View all workspace activities and changes</p>
        </div>

        {/* Coming Soon Empty State */}
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Activity Tracking</h2>
          <p className="text-sm text-muted-foreground mb-1">
            Comprehensive activity logging with search, filtering, timeline views, and CSV export.
          </p>
          <p className="text-xs text-muted-foreground">This feature is coming soon.</p>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
