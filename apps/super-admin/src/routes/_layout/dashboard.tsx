// File: apps/super-admin/src/routes/_layout/dashboard.tsx
//
// Super Admin Dashboard screen — T008-43 (Spec 008 Admin Interfaces).
//
// The parent _layout.tsx handles auth guard, sidebar, and header.
// This component renders page content directly via the <Outlet /> slot —
// no ProtectedRoute or AppLayout wrapper needed.
//
// Layout:
//   - Page heading <h1>Dashboard</h1>
//   - 4 metric stat cards (≥1024px: single row; 768px: 2×2 grid)
//   - Compact SystemHealthCard below the metric row
//   - Loading: 5 skeleton placeholders (4 metric + 1 health)
//   - Error: inline error banner with retry button

import { createFileRoute } from '@tanstack/react-router';
import { Building2, Users, Puzzle, BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, Skeleton, StatCard } from '@plexica/ui';
import { SystemHealthCard } from '@/components/SystemHealthCard';
import { useSuperAdminDashboard } from '@/hooks/useSuperAdminDashboard';
import { useSystemHealth } from '@/hooks/useSystemHealth';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_layout/dashboard' as never)({
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Metric skeleton card
// ---------------------------------------------------------------------------

function MetricSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton width={100} height={14} shape="line" />
            <Skeleton width={72} height={28} shape="rect" />
          </div>
          <Skeleton width={40} height={40} shape="rect" className="ml-4 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
    >
      <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function DashboardPage() {
  const {
    data,
    isLoading,
    isError,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useSuperAdminDashboard();

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useSystemHealth();

  const handleRetry = () => {
    void refetchDashboard();
    void refetchHealth();
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform overview and system status</p>
      </div>

      {/* Error banner */}
      {isError && (
        <ErrorBanner
          message={
            dashboardError instanceof Error
              ? dashboardError.message
              : 'Failed to load dashboard data.'
          }
          onRetry={handleRetry}
        />
      )}

      {/* Metric cards — 1 col on mobile, 2 col at md, 4 col at lg */}
      <section aria-label="Platform metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label="Total Tenants"
                value={data?.totalTenants ?? 0}
                icon={<Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
              />
              <StatCard
                label="Total Users"
                value={data?.totalUsers ?? 0}
                icon={<Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
              />
              <StatCard
                label="Active Plugins"
                value={data?.activePlugins ?? 0}
                icon={<Puzzle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
              />
              <StatCard
                label="API Calls (24h)"
                value={data?.apiCalls24h ?? 0}
                icon={<BarChart3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
              />
            </>
          )}
        </div>
      </section>

      {/* System health — compact variant */}
      <section aria-label="System health">
        {isLoading && !health ? (
          <Card>
            <CardContent className="pt-6">
              <Skeleton width={120} height={14} shape="line" className="mb-3" />
              <div className="flex items-center gap-3">
                <Skeleton width={72} height={20} shape="rect" />
                <Skeleton width={160} height={14} shape="line" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <SystemHealthCard
            health={health}
            isLoading={healthLoading && !health}
            variant="compact"
          />
        )}
      </section>
    </div>
  );
}
