// apps/web/src/routes/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const { user, tenant } = useAuthStore();

  // Fetch tenant plugins
  const { data: pluginsData } = useQuery({
    queryKey: ['tenant-plugins', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { plugins: [] };
      return await apiClient.getTenantPlugins(tenant.id);
    },
    enabled: !!tenant?.id,
  });

  const installedPlugins = pluginsData?.plugins || [];
  const activePlugins = installedPlugins.filter((p: any) => p.status === 'active');

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-muted-foreground">Here's what's happening in your workspace today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Active Plugins"
            value={activePlugins.length}
            icon="🧩"
            change="+2 this week"
          />
          <StatCard title="Team Members" value="12" icon="👥" change="+3 this month" />
          <StatCard title="API Calls" value="1.2k" icon="📊" change="+15% vs last week" />
          <StatCard title="Storage Used" value="2.4 GB" icon="💾" change="78% of 10 GB" />
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Installed Plugins */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Installed Plugins</h2>
              <span className="text-sm text-muted-foreground">{installedPlugins.length} total</span>
            </div>

            {installedPlugins.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No plugins installed yet</p>
                <button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
                  Browse Plugin Marketplace
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {installedPlugins.slice(0, 5).map((plugin: any) => (
                  <div
                    key={plugin.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <span className="text-xl">{plugin.plugin.icon || '🧩'}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{plugin.plugin.name}</p>
                        <p className="text-xs text-muted-foreground">v{plugin.plugin.version}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        plugin.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {plugin.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Recent Activity</h2>
            <div className="space-y-4">
              <ActivityItem
                icon="🔧"
                title="Plugin installed"
                description="Analytics Dashboard v2.1.0"
                time="2 hours ago"
              />
              <ActivityItem
                icon="👤"
                title="New team member"
                description="John Doe joined the workspace"
                time="1 day ago"
              />
              <ActivityItem
                icon="⚙️"
                title="Settings updated"
                description="Workspace preferences changed"
                time="3 days ago"
              />
            </div>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Workspace Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <InfoItem label="Workspace ID" value={tenant?.id || 'N/A'} />
            <InfoItem label="Workspace Name" value={tenant?.name || 'N/A'} />
            <InfoItem label="Workspace Slug" value={tenant?.slug || 'N/A'} />
            <InfoItem
              label="Status"
              value={<span className="capitalize">{tenant?.status.toLowerCase() || 'N/A'}</span>}
            />
            <InfoItem
              label="Created"
              value={tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}
            />
            <InfoItem label="Plan" value="Enterprise" />
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Helper Components
function StatCard({
  title,
  value,
  icon,
  change,
}: {
  title: string;
  value: string | number;
  icon: string;
  change: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
      <p className="text-xs text-muted-foreground">{change}</p>
    </div>
  );
}

function ActivityItem({
  icon,
  title,
  description,
  time,
}: {
  icon: string;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground">{time}</span>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
