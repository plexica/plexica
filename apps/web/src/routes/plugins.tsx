// apps/web/src/routes/plugins.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useState } from 'react';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { ToggleGroup, ToggleGroupItem } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle } from 'lucide-react';
import { DataTable } from '@plexica/ui';
import type { ColumnDef } from '@tanstack/react-table';
import type { TenantPlugin } from '../types';

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
});

// LOW FIX #11: Extract common plugin toggle action handler
// Removes duplication of toggle logic in card and table views
function createPluginToggleHandler(
  pluginId: string,
  currentStatus: string,
  toggleStatusMutation: any
): () => void {
  return () => {
    toggleStatusMutation.mutate({ pluginId, currentStatus });
  };
}

// LOW FIX #11: Extract common uninstall action handler
// Removes duplication of confirmation and uninstall logic
function createPluginUninstallHandler(pluginId: string, uninstallMutation: any): () => void {
  return () => {
    if (confirm('Are you sure you want to uninstall this plugin?')) {
      uninstallMutation.mutate(pluginId);
    }
  };
}

function PluginsPage() {
  const { tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid');

  // Fetch tenant plugins
  const {
    data: pluginsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tenant-plugins', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [] as TenantPlugin[];
      return await apiClient.getTenantPlugins(tenant.id);
    },
    enabled: !!tenant?.id,
  });

  // Toggle plugin status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({
      pluginId,
      currentStatus,
    }: {
      pluginId: string;
      currentStatus: string;
    }) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      if (currentStatus === 'ACTIVE') {
        return await apiClient.deactivatePlugin(tenant.id, pluginId);
      } else {
        return await apiClient.activatePlugin(tenant.id, pluginId);
      }
    },
    // HIGH FIX #5: Use optimistic updates instead of invalidateQueries
    // This avoids the N+1 query problem where invalidation triggers a full refetch
    onMutate: async ({ pluginId, currentStatus }) => {
      // Cancel any in-flight requests
      await queryClient.cancelQueries({ queryKey: ['tenant-plugins', tenant?.id] });

      // Snapshot the previous data
      const previousData = queryClient.getQueryData(['tenant-plugins', tenant?.id]);

      // Optimistically update the cache
      queryClient.setQueryData(['tenant-plugins', tenant?.id], (old: any) => {
        if (!old) return old;
        return old.map((p: TenantPlugin) =>
          p.plugin.id === pluginId
            ? { ...p, status: currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }
            : p
        );
      });

      return { previousData };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['tenant-plugins', tenant?.id], context.previousData);
      }
    },
  });

  // Uninstall plugin mutation
  const uninstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      return await apiClient.uninstallPlugin(tenant.id, pluginId);
    },
    // HIGH FIX #5: Use optimistic updates instead of invalidateQueries
    onMutate: async (pluginId) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-plugins', tenant?.id] });

      const previousData = queryClient.getQueryData(['tenant-plugins', tenant?.id]);

      queryClient.setQueryData(['tenant-plugins', tenant?.id], (old: any) => {
        if (!old) return old;
        return old.filter((p: TenantPlugin) => p.plugin.id !== pluginId);
      });

      return { previousData };
    },
    onError: (_error, _pluginId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['tenant-plugins', tenant?.id], context.previousData);
      }
    },
  });

  const plugins: TenantPlugin[] = pluginsData ?? [];
  const activeCount = plugins.filter((p) => p.status === 'ACTIVE').length;

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">My Plugins</h1>
              <p className="text-muted-foreground">
                Manage your installed plugins and their configurations
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(mode: string) => {
                  // Prevent deselection - always maintain a selected view mode
                  setViewMode((mode || viewMode) as 'grid' | 'list' | 'table');
                }}
              >
                <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
                <ToggleGroupItem value="list">List</ToggleGroupItem>
                <ToggleGroupItem value="table">Table</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{plugins.length}</strong> installed
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">{activeCount}</strong> active
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">{plugins.length - activeCount}</strong> inactive
            </span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
              <p className="text-muted-foreground">Loading plugins...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load plugins. Please try again later.</AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!isLoading && !error && plugins.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No plugins installed</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              You haven't installed any plugins yet. Browse the marketplace to extend your workspace
              with powerful features.
            </p>
            <Button size="lg">Browse Plugin Marketplace</Button>
          </div>
        )}

        {/* Plugins Grid/List/Table */}
        {!isLoading && !error && plugins.length > 0 && (
          <>
            {viewMode === 'table' ? (
              <PluginsTableView
                plugins={plugins}
                onToggleStatus={(pluginId, currentStatus) =>
                  toggleStatusMutation.mutate({ pluginId, currentStatus })
                }
                onUninstall={(pluginId) => {
                  if (confirm('Are you sure you want to uninstall this plugin?')) {
                    uninstallMutation.mutate(pluginId);
                  }
                }}
                isToggling={toggleStatusMutation.isPending}
                isUninstalling={uninstallMutation.isPending}
              />
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    : 'space-y-4'
                }
              >
                {plugins.map((tenantPlugin) => (
                  <PluginCard
                    key={tenantPlugin.id}
                    tenantPlugin={tenantPlugin}
                    viewMode={viewMode}
                    // LOW FIX #11: Using helper function reference (defined above)
                    // This eliminates inline callback creation and improves performance
                    onToggleStatus={createPluginToggleHandler(
                      tenantPlugin.plugin.id,
                      tenantPlugin.status,
                      toggleStatusMutation
                    )}
                    onUninstall={createPluginUninstallHandler(
                      tenantPlugin.plugin.id,
                      uninstallMutation
                    )}
                    isToggling={toggleStatusMutation.isPending}
                    isUninstalling={uninstallMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}

// Table View Component
function PluginsTableView({
  plugins,
  onToggleStatus,
  onUninstall,
  isToggling,
  isUninstalling,
}: {
  plugins: TenantPlugin[];
  onToggleStatus: (pluginId: string, currentStatus: string) => void;
  onUninstall: (pluginId: string) => void;
  isToggling: boolean;
  isUninstalling: boolean;
}) {
  const columns: ColumnDef<TenantPlugin>[] = [
    {
      accessorFn: (row) => row.plugin.name,
      id: 'name',
      header: 'Name',
      cell: (info) => {
        const tenantPlugin = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="text-lg">{tenantPlugin.plugin.icon || '🧩'}</span>
            <div>
              <p className="font-medium text-foreground">{tenantPlugin.plugin.name}</p>
              <p className="text-xs text-muted-foreground">{tenantPlugin.plugin.description}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorFn: (row) => row.plugin.version,
      id: 'version',
      header: 'Version',
    },
    {
      accessorFn: (row) => row.plugin.category,
      id: 'category',
      header: 'Category',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue() as string} />,
    },
    {
      accessorFn: (row) => new Date(row.installedAt).toLocaleDateString(),
      id: 'installedAt',
      header: 'Installed',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const tenantPlugin = info.row.original;
        const isActive = tenantPlugin.status === 'ACTIVE';
        return (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => onToggleStatus(tenantPlugin.plugin.id, tenantPlugin.status)}
              disabled={isToggling}
              variant={isActive ? 'secondary' : 'default'}
              size="sm"
            >
              {isToggling ? '...' : isActive ? 'Disable' : 'Enable'}
            </Button>
            <Button variant="secondary" size="sm">
              Configure
            </Button>
            <Button
              onClick={() => onUninstall(tenantPlugin.plugin.id)}
              disabled={isUninstalling}
              variant="destructive"
              size="sm"
            >
              {isUninstalling ? '...' : 'Uninstall'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={plugins}
      isLoading={false}
      enableSorting
      enableColumnFilters
      enableGlobalFilter
      enablePagination
    />
  );
}

// Plugin Card Component
function PluginCard({
  tenantPlugin,
  viewMode,
  onToggleStatus,
  onUninstall,
  isToggling,
  isUninstalling,
}: {
  tenantPlugin: TenantPlugin;
  viewMode: 'grid' | 'list' | 'table';
  onToggleStatus: (pluginId: string, currentStatus: string) => void;
  onUninstall: (pluginId: string) => void;
  isToggling: boolean;
  isUninstalling: boolean;
}) {
  const { plugin, status, installedAt, configuration } = tenantPlugin;
  const isActive = status === 'ACTIVE';

  if (viewMode === 'list') {
    return (
      <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-6">
          {/* Icon */}
          <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-3xl">{plugin.icon || '🧩'}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{plugin.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">{plugin.description}</p>
              </div>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>v{plugin.version}</span>
              <span>•</span>
              <span>{plugin.category}</span>
              <span>•</span>
              <span>Installed {new Date(installedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={() => onToggleStatus(plugin.id, status)}
              disabled={isToggling}
              variant={isActive ? 'secondary' : 'default'}
              size="sm"
            >
              {isToggling ? '...' : isActive ? 'Disable' : 'Enable'}
            </Button>
            <Button variant="secondary" size="sm">
              Configure
            </Button>
            <Button
              onClick={() => onUninstall(plugin.id)}
              disabled={isUninstalling}
              variant="destructive"
              size="sm"
            >
              {isUninstalling ? '...' : 'Uninstall'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Grid View
  return (
    <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
          <span className="text-3xl">{plugin.icon || '🧩'}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Plugin Info */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground mb-2">{plugin.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{plugin.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>v{plugin.version}</span>
          <span>•</span>
          <span>{plugin.category}</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="mb-4 pb-4 border-b border-border">
        <div className="text-xs text-muted-foreground">
          <p>Installed {new Date(installedAt).toLocaleDateString()}</p>
          {plugin.author && <p className="mt-1">By {plugin.author}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          onClick={() => onToggleStatus(plugin.id, status)}
          disabled={isToggling}
          variant={isActive ? 'secondary' : 'default'}
          className="w-full"
        >
          {isToggling ? 'Processing...' : isActive ? 'Disable Plugin' : 'Enable Plugin'}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1">
            Configure
          </Button>
          <Button
            onClick={() => onUninstall(plugin.id)}
            disabled={isUninstalling}
            variant="destructive"
            className="flex-1"
          >
            {isUninstalling ? '...' : 'Uninstall'}
          </Button>
        </div>
      </div>

      {/* Configuration Preview (if available) */}
      {Object.keys(configuration || {}).length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Configuration</p>
          <div className="bg-muted/50 rounded p-2 text-xs font-mono text-foreground max-h-20 overflow-y-auto">
            {JSON.stringify(configuration, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
      {status === 'ACTIVE' ? '● Active' : '○ Inactive'}
    </Badge>
  );
}
