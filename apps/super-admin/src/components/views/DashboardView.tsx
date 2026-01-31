// File: apps/super-admin/src/components/views/DashboardView.tsx

import { Card } from '@plexica/ui';
import { Building2, Users, Puzzle, BarChart3, TrendingUp, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Link } from '@tanstack/react-router';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    direction: 'up' | 'down';
  };
  linkTo?: string;
}

function DashboardStatCard({ title, value, icon, trend, linkTo }: StatCardProps) {
  const content = (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-foreground">{value}</h3>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp
                className={`h-3 w-3 ${trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}`}
              />
              <span
                className={`text-xs ${trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}`}
              >
                {trend.value}
              </span>
            </div>
          )}
        </div>
        <div className="ml-4 p-3 bg-primary/10 rounded-lg">{icon}</div>
      </div>
    </Card>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }

  return content;
}

export function DashboardView() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiClient.getAnalyticsOverview(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-1">Platform Dashboard</h2>
        <p className="text-muted-foreground">Overview of your Plexica platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <DashboardStatCard
          title="Total Tenants"
          value={analytics?.totalTenants || 0}
          icon={<Building2 className="h-6 w-6 text-primary" />}
          linkTo="/tenants"
        />
        <DashboardStatCard
          title="Active Tenants"
          value={analytics?.activeTenants || 0}
          icon={<Activity className="h-6 w-6 text-green-500" />}
          linkTo="/tenants"
        />
        <DashboardStatCard
          title="Total Users"
          value={analytics?.totalUsers || 0}
          icon={<Users className="h-6 w-6 text-blue-500" />}
          linkTo="/users"
        />
        <DashboardStatCard
          title="Available Plugins"
          value={analytics?.totalPlugins || 0}
          icon={<Puzzle className="h-6 w-6 text-purple-500" />}
          linkTo="/plugins"
        />
        <DashboardStatCard
          title="Suspended Tenants"
          value={analytics?.suspendedTenants || 0}
          icon={<Building2 className="h-6 w-6 text-orange-500" />}
          linkTo="/tenants"
        />
        <DashboardStatCard
          title="API Calls (24h)"
          value={analytics?.apiCalls24h || 0}
          icon={<BarChart3 className="h-6 w-6 text-indigo-500" />}
          linkTo="/analytics"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenant Management
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Manage workspace tenants, view their status, and control access.
          </p>
          <Link to="/tenants">
            <span className="text-sm text-primary hover:underline cursor-pointer">
              Go to Tenants →
            </span>
          </Link>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Plugin Registry
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Browse the global plugin marketplace and manage plugin availability.
          </p>
          <Link to="/plugins">
            <span className="text-sm text-primary hover:underline cursor-pointer">
              Go to Plugins →
            </span>
          </Link>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            View and manage users across all tenants with role-based access.
          </p>
          <Link to="/users">
            <span className="text-sm text-primary hover:underline cursor-pointer">
              Go to Users →
            </span>
          </Link>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Platform Analytics
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            View detailed analytics and insights about platform usage.
          </p>
          <Link to="/analytics">
            <span className="text-sm text-primary hover:underline cursor-pointer">
              Go to Analytics →
            </span>
          </Link>
        </Card>
      </div>

      {/* System Health */}
      <Card className="p-6 mt-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">System Health</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="text-sm text-muted-foreground">All systems operational</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
