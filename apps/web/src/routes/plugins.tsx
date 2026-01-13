// apps/web/src/routes/plugins.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useState } from 'react';
import type { TenantPlugin } from '../types';

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
});

function PluginsPage() {
  const { tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch tenant plugins
  const {
    data: pluginsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tenant-plugins', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { plugins: [] };
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
      if (currentStatus === 'active') {
        return await apiClient.deactivatePlugin(tenant.id, pluginId);
      } else {
        return await apiClient.activatePlugin(tenant.id, pluginId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-plugins'] });
    },
  });

  // Uninstall plugin mutation
  const uninstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      return await apiClient.uninstallPlugin(tenant.id, pluginId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-plugins'] });
    },
  });

  const plugins: TenantPlugin[] = pluginsData?.plugins || [];
  const activeCount = plugins.filter((p) => p.status === 'active').length;

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
              <div className="flex items-center bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    viewMode === 'list'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  List
                </button>
              </div>
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              <strong>Error:</strong> Failed to load plugins. Please try again later.
            </p>
          </div>
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
            <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
              Browse Plugin Marketplace
            </button>
          </div>
        )}

        {/* Plugins Grid/List */}
        {!isLoading && !error && plugins.length > 0 && (
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
            ))}
          </div>
        )}
      </AppLayout>
    </ProtectedRoute>
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
  viewMode: 'grid' | 'list';
  onToggleStatus: (pluginId: string, currentStatus: string) => void;
  onUninstall: (pluginId: string) => void;
  isToggling: boolean;
  isUninstalling: boolean;
}) {
  const { plugin, status, installedAt, configuration } = tenantPlugin;
  const isActive = status === 'active';

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
            <button
              onClick={() => onToggleStatus(plugin.id, status)}
              disabled={isToggling}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isToggling ? '...' : isActive ? 'Disable' : 'Enable'}
            </button>
            <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors">
              Configure
            </button>
            <button
              onClick={() => onUninstall(plugin.id)}
              disabled={isUninstalling}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUninstalling ? '...' : 'Uninstall'}
            </button>
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
        <button
          onClick={() => onToggleStatus(plugin.id, status)}
          disabled={isToggling}
          className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isToggling ? 'Processing...' : isActive ? 'Disable Plugin' : 'Enable Plugin'}
        </button>
        <div className="flex gap-2">
          <button className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors">
            Configure
          </button>
          <button
            onClick={() => onUninstall(plugin.id)}
            disabled={isUninstalling}
            className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUninstalling ? '...' : 'Uninstall'}
          </button>
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
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        status === 'active'
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }`}
    >
      {status === 'active' ? '● Active' : '○ Inactive'}
    </span>
  );
}
