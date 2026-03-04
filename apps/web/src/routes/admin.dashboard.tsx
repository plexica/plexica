// File: apps/web/src/routes/admin.dashboard.tsx
//
// T008-51 — Tenant Admin Dashboard screen.
// Shows overview metrics: users, teams, plugins, storage, API calls.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { createFileRoute } from '@tanstack/react-router';
import { Users, Users2, Puzzle, HardDrive, Activity, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { useTenantAdminDashboard } from '@/hooks/useTenantAdminDashboard';

export const Route = createFileRoute('/admin/dashboard' as never)({
  component: TenantAdminDashboardPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  loading?: boolean;
}

function StatCard({ title, value, subtext, icon: Icon, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-24 mb-1" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminDashboardPage() {
  const { data, isLoading, error } = useTenantAdminDashboard();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your tenant environment</p>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load dashboard metrics. Please refresh to try again.
        </div>
      )}

      {/* Stats grid */}
      <section aria-label="Tenant metrics">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Users"
            value={data ? formatNumber(data.totalUsers) : '—'}
            subtext={data ? `${data.activeUsers} active` : undefined}
            icon={Users}
            loading={isLoading}
          />
          <StatCard
            title="Pending Invitations"
            value={data ? formatNumber(data.pendingInvitations) : '—'}
            subtext="Awaiting acceptance"
            icon={Mail}
            loading={isLoading}
          />
          <StatCard
            title="Teams"
            value={data ? formatNumber(data.totalTeams) : '—'}
            subtext="Active teams"
            icon={Users2}
            loading={isLoading}
          />
          <StatCard
            title="Active Plugins"
            value={data ? formatNumber(data.activePlugins) : '—'}
            subtext="Enabled for this tenant"
            icon={Puzzle}
            loading={isLoading}
          />
          <StatCard
            title="Storage Used"
            value={data ? formatBytes(data.storageUsedBytes) : '—'}
            subtext="Across all workspaces"
            icon={HardDrive}
            loading={isLoading}
          />
          <StatCard
            title="API Calls (24h)"
            value={data ? formatNumber(data.apiCalls24h) : '—'}
            subtext="Last 24 hours"
            icon={Activity}
            loading={isLoading}
          />
        </div>
      </section>
    </div>
  );
}
