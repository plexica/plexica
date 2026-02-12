// apps/web/src/routes/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { TenantPlugin } from '@plexica/types';
import { Card, CardContent } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { CardSkeleton } from '@plexica/ui';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const { tenant } = useAuthStore();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const workspaceId = currentWorkspace?.id;

  // Fetch tenant plugins
  const { data: pluginsData, isLoading: pluginsLoading } = useQuery({
    queryKey: ['tenant-plugins', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [] as TenantPlugin[];
      return await apiClient.getTenantPlugins(tenant.id);
    },
    enabled: !!tenant?.id,
  });

  // Fetch workspace members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      return await apiClient.getWorkspaceMembers(workspaceId);
    },
    enabled: !!workspaceId,
  });

  // Fetch workspace teams
  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['workspace-teams', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      return await apiClient.getWorkspaceTeams(workspaceId);
    },
    enabled: !!workspaceId,
  });

  const installedPlugins = pluginsData ?? [];
  const activePlugins = installedPlugins.filter((p) => p.status === 'ACTIVE');
  const members = membersData ?? [];
  const teams = teamsData ?? [];
  const isLoading = pluginsLoading || membersLoading || teamsLoading;

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Dashboard Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            {currentWorkspace && (
              <p className="text-sm text-muted-foreground mt-1">{currentWorkspace.name}</p>
            )}
          </div>
        </div>

        {/* Metrics Row - Top level stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                title="Active Plugins"
                value={activePlugins.length}
                icon="🧩"
                subtitle={`${installedPlugins.length} installed`}
              />
              <MetricCard
                title="Team Members"
                value={members.length}
                icon="👥"
                subtitle={`in ${currentWorkspace?.name || 'workspace'}`}
              />
              <MetricCard
                title="Teams"
                value={teams.length}
                icon="👥"
                subtitle={`in ${currentWorkspace?.name || 'workspace'}`}
              />
              <MetricCard
                title="Workspaces"
                value={tenant ? 1 : 0}
                icon="🏢"
                subtitle={tenant?.name || 'No tenant'}
              />
            </>
          )}
        </div>

        {/* Widget Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Widget: Plugin Widgets Area */}
          {activePlugins.length > 0 ? (
            <WidgetCard title="Active Plugins" subtitle="Installed" icon="🧩" isEmpty={false}>
              <div className="space-y-3">
                {activePlugins.slice(0, 4).map((plugin) => (
                  <div
                    key={plugin.id}
                    className="flex items-center justify-between p-2 hover:bg-background-secondary rounded"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm">🧩</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {plugin.plugin?.name || plugin.pluginId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          v{plugin.plugin?.version || '1.0.0'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default" className="text-xs">
                      Active
                    </Badge>
                  </div>
                ))}
                {activePlugins.length > 4 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{activePlugins.length - 4} more
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={() => navigate({ to: '/plugins' })}
              >
                Manage Plugins
              </Button>
            </WidgetCard>
          ) : (
            <WidgetCard title="Plugins" subtitle="Get started" icon="🧩" isEmpty={false}>
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  No plugins installed yet. Browse the marketplace to extend your workspace.
                </p>
                <Button size="sm" onClick={() => navigate({ to: '/plugins' })}>
                  Browse Plugins
                </Button>
              </div>
            </WidgetCard>
          )}

          {/* Widget: Team Overview */}
          <WidgetCard
            title="Team Members"
            subtitle={currentWorkspace?.name || 'Workspace'}
            icon="👥"
            isEmpty={members.length === 0}
          >
            {members.length > 0 ? (
              <>
                <div className="space-y-3">
                  {members.slice(0, 4).map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-2 hover:bg-background-secondary rounded"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm">
                            {member.user?.firstName?.[0]?.toUpperCase() ||
                              member.user?.email?.[0]?.toUpperCase() ||
                              '?'}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.user?.firstName
                              ? `${member.user.firstName} ${member.user.lastName || ''}`
                              : member.user?.email || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {members.length > 4 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{members.length - 4} more
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => navigate({ to: '/settings' })}
                >
                  Manage Members
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  No members in this workspace yet.
                </p>
                <Button size="sm" onClick={() => navigate({ to: '/settings' })}>
                  Add Members
                </Button>
              </div>
            )}
          </WidgetCard>

          {/* Widget: Quick Actions */}
          <WidgetCard
            title="Quick Actions"
            subtitle={`${tenant?.name || 'Workspace'}`}
            icon="⚡"
            isEmpty={false}
          >
            <div className="space-y-2">
              <QuickActionButton
                label="Browse Plugins"
                icon="📦"
                onClick={() => navigate({ to: '/plugins' })}
              />
              <QuickActionButton
                label="Manage Members"
                icon="👥"
                onClick={() => navigate({ to: '/members-management' })}
              />
              <QuickActionButton
                label="Workspace Settings"
                icon="⚙️"
                onClick={() => navigate({ to: '/settings' })}
              />
              <QuickActionButton
                label="View Activity"
                icon="📝"
                onClick={() => navigate({ to: '/activity-log' })}
              />
            </div>
          </WidgetCard>
        </div>

        {/* Recent Activity - Empty state (no backend endpoint yet) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
              <Badge variant="secondary" className="text-xs">
                {currentWorkspace?.name || 'Workspace'}
              </Badge>
            </div>
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm text-muted-foreground mb-1">Activity tracking coming soon</p>
              <p className="text-xs text-muted-foreground">
                Workspace events and changes will appear here automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Helper Components

// Metric Card - Top level stats
function MetricCard({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <span className="text-2xl">{icon}</span>
        </div>
        <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Widget Card - Container for plugin widgets
function WidgetCard({
  title,
  subtitle,
  icon,
  isEmpty = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  isEmpty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </div>
        {isEmpty ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">No data available</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// Quick Action Button - for quick actions widget
function QuickActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 text-left rounded-lg hover:bg-background-secondary transition-colors"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}
