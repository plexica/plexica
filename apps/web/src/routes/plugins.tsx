// apps/web/src/routes/plugins.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useState, useMemo } from 'react';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { ToggleGroup, ToggleGroupItem } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle, Download, Search, X } from 'lucide-react';
import { DataTable } from '@plexica/ui';
import type { ColumnDef } from '@tanstack/react-table';
import type { TenantPlugin, Plugin } from '../types';
import { usePlugins } from '../contexts/PluginContext';

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
});

// LOW FIX #11: Extract common plugin toggle action handler
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
function createPluginUninstallHandler(pluginId: string, uninstallMutation: any): () => void {
  return () => {
    if (confirm('Are you sure you want to uninstall this plugin?')) {
      uninstallMutation.mutate(pluginId);
    }
  };
}

type TabValue = 'installed' | 'marketplace';

function PluginsPage() {
  const { tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const { refreshPlugins } = usePlugins();
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid');
  const [activeTab, setActiveTab] = useState<TabValue>('installed');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [configuringPlugin, setConfiguringPlugin] = useState<TenantPlugin | null>(null);

  // Fetch tenant plugins (installed)
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

  // Fetch marketplace catalog
  const {
    data: catalogData,
    isLoading: catalogLoading,
    error: catalogError,
  } = useQuery({
    queryKey: ['marketplace-plugins', marketplaceSearch],
    queryFn: async () => {
      return await apiClient.getPlugins(
        marketplaceSearch ? { search: marketplaceSearch } : undefined
      );
    },
    enabled: activeTab === 'marketplace',
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
    onMutate: async ({ pluginId, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-plugins', tenant?.id] });
      const previousData = queryClient.getQueryData(['tenant-plugins', tenant?.id]);
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
      if (context?.previousData) {
        queryClient.setQueryData(['tenant-plugins', tenant?.id], context.previousData);
      }
    },
    onSettled: () => {
      refreshPlugins();
    },
  });

  // Uninstall plugin mutation
  const uninstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      return await apiClient.uninstallPlugin(tenant.id, pluginId);
    },
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
    onSettled: () => {
      refreshPlugins();
      // Refresh marketplace data so install buttons update
      queryClient.invalidateQueries({ queryKey: ['marketplace-plugins'] });
    },
  });

  // Install plugin mutation
  const installMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      return await apiClient.installPlugin(tenant.id, pluginId, {});
    },
    onSuccess: () => {
      // Refetch installed plugins
      queryClient.invalidateQueries({ queryKey: ['tenant-plugins', tenant?.id] });
      // Refresh sidebar
      refreshPlugins();
    },
  });

  const plugins: TenantPlugin[] = pluginsData ?? [];
  const catalog: Plugin[] = catalogData ?? [];
  const activeCount = plugins.filter((p) => p.status === 'ACTIVE').length;

  // Set of already-installed plugin IDs for the marketplace view
  const installedPluginIds = useMemo(() => new Set(plugins.map((p) => p.plugin.id)), [plugins]);

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Plugins</h1>
              <p className="text-muted-foreground">
                Manage your installed plugins or browse the marketplace
              </p>
            </div>
            <div className="flex items-center gap-3">
              {activeTab === 'installed' && (
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(mode: string) => {
                    setViewMode((mode || viewMode) as 'grid' | 'list' | 'table');
                  }}
                >
                  <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
                  <ToggleGroupItem value="list">List</ToggleGroupItem>
                  <ToggleGroupItem value="table">Table</ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-border">
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'installed'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              My Plugins
              {plugins.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                  {plugins.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'marketplace'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Browse Marketplace
            </button>
          </div>

          {/* Stats (installed tab only) */}
          {activeTab === 'installed' && plugins.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4">
              <span>
                <strong className="text-foreground">{plugins.length}</strong> installed
              </span>
              <span>-</span>
              <span>
                <strong className="text-foreground">{activeCount}</strong> active
              </span>
              <span>-</span>
              <span>
                <strong className="text-foreground">{plugins.length - activeCount}</strong> inactive
              </span>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* INSTALLED TAB                                                    */}
        {/* ================================================================ */}
        {activeTab === 'installed' && (
          <>
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
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
                  You haven't installed any plugins yet. Browse the marketplace to extend your
                  workspace with powerful features.
                </p>
                <Button size="lg" onClick={() => setActiveTab('marketplace')}>
                  Browse Plugin Marketplace
                </Button>
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
                    onConfigure={(tp) => setConfiguringPlugin(tp)}
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
                        onToggleStatus={createPluginToggleHandler(
                          tenantPlugin.plugin.id,
                          tenantPlugin.status,
                          toggleStatusMutation
                        )}
                        onUninstall={createPluginUninstallHandler(
                          tenantPlugin.plugin.id,
                          uninstallMutation
                        )}
                        onConfigure={() => setConfiguringPlugin(tenantPlugin)}
                        isToggling={toggleStatusMutation.isPending}
                        isUninstalling={uninstallMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* MARKETPLACE TAB                                                  */}
        {/* ================================================================ */}
        {activeTab === 'marketplace' && (
          <>
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search plugins..."
                  value={marketplaceSearch}
                  onChange={(e) => setMarketplaceSearch(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {marketplaceSearch && (
                  <button
                    onClick={() => setMarketplaceSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Loading */}
            {catalogLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
                  <p className="text-muted-foreground">Loading marketplace...</p>
                </div>
              </div>
            )}

            {/* Error */}
            {catalogError && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load marketplace. Please try again later.
                </AlertDescription>
              </Alert>
            )}

            {/* Empty catalog */}
            {!catalogLoading && !catalogError && catalog.length === 0 && (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {marketplaceSearch ? 'No plugins found' : 'Marketplace is empty'}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {marketplaceSearch
                    ? `No plugins match "${marketplaceSearch}". Try a different search term.`
                    : 'No plugins are available in the marketplace yet. Check back later.'}
                </p>
                {marketplaceSearch && (
                  <Button variant="secondary" onClick={() => setMarketplaceSearch('')}>
                    Clear search
                  </Button>
                )}
              </div>
            )}

            {/* Marketplace Grid */}
            {!catalogLoading && !catalogError && catalog.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {catalog.map((plugin) => {
                  const isInstalled = installedPluginIds.has(plugin.id);
                  return (
                    <MarketplacePluginCard
                      key={plugin.id}
                      plugin={plugin}
                      isInstalled={isInstalled}
                      isInstalling={
                        installMutation.isPending &&
                        (installMutation.variables as string) === plugin.id
                      }
                      onInstall={() => installMutation.mutate(plugin.id)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* CONFIGURE DIALOG                                                 */}
        {/* ================================================================ */}
        {configuringPlugin && (
          <PluginConfigDialog
            tenantPlugin={configuringPlugin}
            onClose={() => setConfiguringPlugin(null)}
          />
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}

// ---------------------------------------------------------------------------
// Marketplace Plugin Card
// ---------------------------------------------------------------------------
function MarketplacePluginCard({
  plugin,
  isInstalled,
  isInstalling,
  onInstall,
}: {
  plugin: Plugin;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
          <span className="text-3xl">{plugin.icon || '🧩'}</span>
        </div>
        {isInstalled ? (
          <Badge variant="secondary">Installed</Badge>
        ) : (
          <Badge variant="default">{plugin.category}</Badge>
        )}
      </div>

      {/* Plugin Info */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground mb-2">{plugin.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{plugin.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>v{plugin.version}</span>
          {plugin.author && (
            <>
              <span>-</span>
              <span>By {plugin.author}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 border-t border-border">
        {isInstalled ? (
          <Button variant="secondary" className="w-full" disabled>
            Already Installed
          </Button>
        ) : (
          <Button className="w-full" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                Installing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Install Plugin
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin Configuration Dialog
// ---------------------------------------------------------------------------
function PluginConfigDialog({
  tenantPlugin,
  onClose,
}: {
  tenantPlugin: TenantPlugin;
  onClose: () => void;
}) {
  const config = tenantPlugin.configuration || {};
  const hasConfig = Object.keys(config).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{tenantPlugin.plugin.icon || '🧩'}</span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Configure {tenantPlugin.plugin.name}
                </h2>
                <p className="text-sm text-muted-foreground">v{tenantPlugin.plugin.version}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {hasConfig ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Current plugin configuration:</p>
              <div className="bg-muted/50 rounded-lg p-4 text-sm font-mono text-foreground max-h-64 overflow-y-auto">
                <pre>{JSON.stringify(config, null, 2)}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Plugin configuration editing will be available in a future update.
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-2">
                This plugin has no configuration options.
              </p>
              <p className="text-xs text-muted-foreground">
                Configuration editing will be available in a future update.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table View Component
// ---------------------------------------------------------------------------
function PluginsTableView({
  plugins,
  onToggleStatus,
  onUninstall,
  onConfigure,
  isToggling,
  isUninstalling,
}: {
  plugins: TenantPlugin[];
  onToggleStatus: (pluginId: string, currentStatus: string) => void;
  onUninstall: (pluginId: string) => void;
  onConfigure: (tp: TenantPlugin) => void;
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
            <Button variant="secondary" size="sm" onClick={() => onConfigure(tenantPlugin)}>
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

// ---------------------------------------------------------------------------
// Plugin Card Component
// ---------------------------------------------------------------------------
function PluginCard({
  tenantPlugin,
  viewMode,
  onToggleStatus,
  onUninstall,
  onConfigure,
  isToggling,
  isUninstalling,
}: {
  tenantPlugin: TenantPlugin;
  viewMode: 'grid' | 'list' | 'table';
  onToggleStatus: (pluginId: string, currentStatus: string) => void;
  onUninstall: (pluginId: string) => void;
  onConfigure: () => void;
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
              <span>-</span>
              <span>{plugin.category}</span>
              <span>-</span>
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
            <Button variant="secondary" size="sm" onClick={onConfigure}>
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
          <span>-</span>
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
          <Button variant="secondary" className="flex-1" onClick={onConfigure}>
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

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}
