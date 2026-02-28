// apps/super-admin/src/components/views/PluginsView.tsx
//
// Review fixes applied (T004-28):
//   HIGH #3: empty-state guard — registryHasFilters checked before statCounts['total']
//   HIGH #4 / MEDIUM #11: header CTA → "Register Plugin" (tab-conditional)
//   HIGH #5: tablist Arrow-left / Arrow-right keyboard navigation (WCAG 2.1 AA)
//   MEDIUM #12: stub handlers now show informational toast instead of console.log

import { useState, useRef, useCallback } from 'react';
import {
  Button,
  Input,
  Badge,
  Card,
  Alert,
  AlertTitle,
  AlertDescription,
  EmptyState,
  Skeleton,
} from '@plexica/ui';
import { Search, Puzzle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlugins } from '@/hooks';
import type { PluginStatusFilter } from '@/hooks/usePlugins';
import { usePluginSearch } from '@/hooks/usePluginSearch';
import type { LifecycleStatusFilter } from '@/hooks/usePluginSearch';
import { PLUGIN_LIFECYCLE_STATUSES } from '@plexica/types';
import { Plugin } from '@/types';
import { PluginDetailModal } from '../plugins/PluginDetailModal';
import { EditPluginModal } from '../plugins/EditPluginModal';
import { PluginReviewQueue } from '../marketplace/PluginReviewQueue';
import { PublishPluginModal } from '../marketplace/PublishPluginModal';
import { PluginCard } from '../plugins/PluginCard';
import { PluginInstallProgress } from '../plugins/PluginInstallProgress';
import { EnablePluginDialog } from '../plugins/EnablePluginDialog';
import { DisablePluginDialog } from '../plugins/DisablePluginDialog';
import { UpdatePluginDialog } from '../plugins/UpdatePluginDialog';
import { UninstallPluginDialog } from '../plugins/UninstallPluginDialog';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Skeleton card placeholder for Registry loading state
// ---------------------------------------------------------------------------
function RegistryCardSkeleton() {
  return (
    <Card className="p-5 flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-start justify-between">
        <Skeleton shape="rect" width={40} height={40} />
        <Skeleton width={72} height={22} />
      </div>
      <Skeleton width="60%" height={18} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="80%" height={14} />
      <div className="flex gap-2 mt-auto pt-2">
        <Skeleton width="50%" height={32} shape="rect" />
        <Skeleton width="50%" height={32} shape="rect" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat summary bar
// ---------------------------------------------------------------------------
function StatSummaryBar({ counts }: { counts: Record<string, number> }) {
  const total = counts['total'] ?? 0;
  const active = counts['ACTIVE'] ?? 0;
  const installed = counts['INSTALLED'] ?? 0;
  const registered = counts['REGISTERED'] ?? 0;
  const other = total - active - installed - registered;

  return (
    <p className="mb-4 text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
      <strong className="text-foreground">{total}</strong> plugins total
      {' • '}
      <strong className="text-foreground">{active}</strong> active
      {' • '}
      <strong className="text-foreground">{installed}</strong> installed
      {' • '}
      <strong className="text-foreground">{registered}</strong> registered
      {' • '}
      <strong className="text-foreground">{Math.max(0, other)}</strong> other
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function PluginsView() {
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [installingPlugin, setInstallingPlugin] = useState<Plugin | null>(null);
  const [enablingPlugin, setEnablingPlugin] = useState<Plugin | null>(null);
  const [disablingPlugin, setDisablingPlugin] = useState<Plugin | null>(null);
  const [updatingPlugin, setUpdatingPlugin] = useState<Plugin | null>(null);
  const [uninstallingPlugin, setUninstallingPlugin] = useState<Plugin | null>(null);
  const [activeTab, setActiveTab] = useState<'registry' | 'marketplace' | 'review-queue'>(
    'registry'
  );
  const [showPublishModal, setShowPublishModal] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Tab refs for Arrow-key navigation (HIGH #5)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ---- Registry tab state (new) ----
  const {
    inputValue,
    setInputValue,
    lifecycleFilter,
    setLifecycleFilter,
    page: registryPage,
    setPage: setRegistryPage,
    plugins: registryPlugins,
    pagination: registryPagination,
    statCounts,
    isLoading: registryLoading,
    error: registryError,
    refetch: registryRefetch,
    clearFilters: clearRegistryFilters,
    hasActiveFilters: registryHasFilters,
  } = usePluginSearch();

  // ---- Marketplace tab state (existing) ----
  const {
    plugins,
    categories,
    stats,
    isLoading,
    error,
    pagination,
    page,
    setPage,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    clearFilters,
    hasActiveFilters,
  } = usePlugins();

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return 'default';
      case 'DRAFT':
        return 'secondary';
      case 'DEPRECATED':
        return 'danger';
      case 'PENDING_REVIEW':
        return 'outline';
      case 'REJECTED':
        return 'danger';
      default:
        return 'outline';
    }
  };

  // Pagination helpers (marketplace)
  const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  // Pagination helpers (registry)
  const regStartItem =
    registryPagination.total === 0
      ? 0
      : (registryPagination.page - 1) * registryPagination.limit + 1;
  const regEndItem = Math.min(
    registryPagination.page * registryPagination.limit,
    registryPagination.total
  );

  // ---- Stub action handlers — MEDIUM #12: toast instead of silent console.log ----
  const handleInstall = useCallback((plugin: Plugin) => {
    setInstallingPlugin(plugin);
  }, []);

  const handleEnable = useCallback((plugin: Plugin) => {
    setEnablingPlugin(plugin);
  }, []);

  const handleDisable = useCallback((plugin: Plugin) => {
    setDisablingPlugin(plugin);
  }, []);

  const handleUpdate = useCallback((plugin: Plugin) => {
    setUpdatingPlugin(plugin);
  }, []);

  const handleUninstall = useCallback((plugin: Plugin) => {
    setUninstallingPlugin(plugin);
  }, []);

  // Tab IDs for ARIA
  const tabs = [
    { id: 'registry', label: 'Registry' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'review-queue', label: 'Review Queue' },
  ] as const;

  // HIGH #5: Arrow key navigation on the tablist
  const handleTabKeyDown = (e: React.KeyboardEvent, currentIdx: number) => {
    let nextIdx = currentIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = tabs.length - 1;
    } else {
      return; // nothing to do
    }
    e.preventDefault();
    setActiveTab(tabs[nextIdx].id);
    tabRefs.current[nextIdx]?.focus();
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Plugins</h1>
          <p className="text-muted-foreground">Manage the plugin registry and marketplace</p>
        </div>
        {/* HIGH #4 / MEDIUM #11: label is tab-contextual */}
        {activeTab === 'registry' ? (
          <Button onClick={() => setShowPublishModal(true)}>+ Register Plugin</Button>
        ) : (
          <Button onClick={() => setShowPublishModal(true)}>+ Publish Plugin</Button>
        )}
      </div>

      {/* Tab list — HIGH #5: tabIndex management + Arrow key handler */}
      <div className="mb-6 border-b border-border">
        <div role="tablist" aria-label="Plugin management tabs" className="flex gap-6">
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Registry tab panel                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="tabpanel-registry"
        role="tabpanel"
        aria-labelledby="tab-registry"
        hidden={activeTab !== 'registry'}
      >
        {/* Error state */}
        {registryError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Failed to load plugins</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{(registryError as Error).message}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => registryRefetch()}
                className="ml-4 shrink-0"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Search + filter controls */}
        {!registryError && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search plugins..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-10"
                aria-label="Search plugins by name or description"
              />
            </div>

            {/* Lifecycle status filter */}
            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value as LifecycleStatusFilter)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Filter by lifecycle status"
            >
              <option value="all">All Statuses</option>
              {PLUGIN_LIFECYCLE_STATUSES.map((ls) => (
                <option key={ls} value={ls}>
                  {ls.charAt(0) + ls.slice(1).toLowerCase()}
                </option>
              ))}
            </select>

            {/* Clear filters */}
            {registryHasFilters && (
              <Button variant="ghost" size="sm" onClick={clearRegistryFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Stat summary bar */}
        {!registryError && <StatSummaryBar counts={statCounts} />}

        {/* Loading: 6 skeleton cards */}
        {registryLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <RegistryCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Plugin grid */}
        {!registryLoading && !registryError && (
          <>
            {registryPlugins.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {registryPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin as Plugin}
                      onView={setSelectedPlugin}
                      onInstall={handleInstall}
                      onEnable={handleEnable}
                      onDisable={handleDisable}
                      onUpdate={handleUpdate}
                      onUninstall={handleUninstall}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {registryPagination.totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {regStartItem}–{regEndItem} of {registryPagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRegistryPage(registryPage - 1)}
                        disabled={registryPage <= 1}
                        aria-label="Previous page"
                      >
                        ‹
                      </Button>
                      <span className="text-sm text-foreground px-2">
                        Page {registryPagination.page} of {registryPagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRegistryPage(registryPage + 1)}
                        disabled={registryPage >= registryPagination.totalPages}
                        aria-label="Next page"
                      >
                        ›
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : registryHasFilters ? (
              /* HIGH #3: filters active → always show "no results" empty state,
                 regardless of whether statCounts has resolved yet */
              <EmptyState
                icon={<Search className="h-16 w-16" />}
                title="No plugins found"
                description="Try adjusting your search or filters."
                action={{
                  label: 'Clear filters',
                  onClick: clearRegistryFilters,
                }}
              />
            ) : statCounts['total'] === 0 || statCounts['total'] === undefined ? (
              /* Empty — no plugins registered at all (HIGH #4: updated CTA label) */
              <EmptyState
                icon={<Puzzle className="h-16 w-16" />}
                title="No plugins registered"
                description="Register your first plugin to extend the platform."
                action={{
                  label: '+ Register Plugin',
                  onClick: () => setShowPublishModal(true),
                }}
              />
            ) : (
              /* Empty — filtered with no results (fallback) */
              <EmptyState
                icon={<Search className="h-16 w-16" />}
                title="No plugins found"
                description="Try adjusting your search or filters."
                action={{
                  label: 'Clear filters',
                  onClick: clearRegistryFilters,
                }}
              />
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Marketplace tab panel (existing, unchanged)                         */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="tabpanel-marketplace"
        role="tabpanel"
        aria-labelledby="tab-marketplace"
        hidden={activeTab !== 'marketplace'}
      >
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
          <Card className="bg-destructive/10 border-destructive/30 mb-6">
            <div className="p-4">
              <p className="text-destructive text-sm">
                <strong>Error:</strong> Failed to load plugins. {(error as Error).message}
              </p>
            </div>
          </Card>
        )}

        {/* Search and Filters */}
        {!isLoading && !error && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search plugins by name, description, or author..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PluginStatusFilter)}
                className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Statuses</option>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="DEPRECATED">Deprecated</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            <div className="mb-6 flex items-center gap-6 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">{stats.total}</strong> total plugins
              </span>
              <span>•</span>
              <span>
                <strong className="text-foreground">{stats.published}</strong> published
              </span>
              <span>•</span>
              <span>
                <strong className="text-foreground">{stats.categories}</strong> categories
              </span>
              {hasActiveFilters && (
                <>
                  <span>•</span>
                  <span>
                    <strong className="text-foreground">{pagination.total}</strong> results
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {/* Plugins Grid */}
        {!isLoading && !error && (
          <>
            {plugins.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {plugins.map((plugin) => (
                    <Card key={plugin.id} className="p-6 flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                          {plugin.icon || '?'}
                        </div>
                        <Badge variant={getStatusBadgeVariant(plugin.status)}>
                          {plugin.status}
                        </Badge>
                      </div>
                      <h3
                        className="text-lg font-semibold text-foreground mb-1 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setSelectedPlugin(plugin)}
                      >
                        {plugin.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {plugin.description}
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        v{plugin.version} • {plugin.category}
                      </p>
                      <div className="flex items-center justify-between text-sm text-muted-foreground mb-4 flex-grow">
                        <span>By {plugin.author}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setSelectedPlugin(plugin)}
                        >
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setEditingPlugin(plugin)}
                        >
                          Edit
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                {pagination.totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {startItem}–{endItem} of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page <= 1}
                      >
                        ‹
                      </Button>
                      <span className="text-sm text-foreground px-2">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page >= pagination.totalPages}
                      >
                        ›
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : stats.total === 0 ? (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">?</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No plugins yet</h3>
                <p className="text-muted-foreground mb-6">
                  Publish your first plugin to the marketplace
                </p>
                <Button onClick={() => setShowPublishModal(true)}>+ Publish Plugin</Button>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">?</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No plugins found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Review Queue tab panel (existing, unchanged)                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="tabpanel-review-queue"
        role="tabpanel"
        aria-labelledby="tab-review-queue"
        hidden={activeTab !== 'review-queue'}
      >
        {activeTab === 'review-queue' && <PluginReviewQueue />}
      </div>

      {/* Plugin Detail Modal */}
      {selectedPlugin && (
        <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}

      {/* Edit Plugin Modal */}
      {editingPlugin && (
        <EditPluginModal plugin={editingPlugin} onClose={() => setEditingPlugin(null)} />
      )}

      {/* Publish Plugin Modal */}
      {showPublishModal && (
        <PublishPluginModal
          onClose={() => setShowPublishModal(false)}
          onSuccess={() => {
            setShowPublishModal(false);
            queryClient.invalidateQueries({ queryKey: ['plugins'] });
            queryClient.invalidateQueries({ queryKey: ['plugins-stats'] });
            queryClient.invalidateQueries({ queryKey: ['plugins-categories'] });
            queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
            queryClient.invalidateQueries({ queryKey: ['registry-plugins-counts'] });
            queryClient.invalidateQueries({ queryKey: ['registry-plugins-stats'] });
          }}
        />
      )}

      {/* Plugin Install Progress panel — shown inline over registry when install is triggered */}
      {installingPlugin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl">
            <PluginInstallProgress
              pluginId={installingPlugin.id}
              pluginName={installingPlugin.name}
              pluginVersion={installingPlugin.version}
              onComplete={() => {
                setInstallingPlugin(null);
                queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
                queryClient.invalidateQueries({ queryKey: ['registry-plugins-stats'] });
                toast({
                  variant: 'success',
                  title: `${installingPlugin.name} installed. Enable it now from the registry.`,
                });
              }}
              onCancel={() => {
                setInstallingPlugin(null);
                queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
                toast({ title: 'Installation cancelled.' });
              }}
              onRetry={() => {
                // hook handles retry internally; just clear any stale query
                queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
              }}
            />
          </div>
        </div>
      )}

      {/* Enable Plugin Dialog */}
      {enablingPlugin && (
        <EnablePluginDialog
          plugin={enablingPlugin}
          open={!!enablingPlugin}
          onOpenChange={(o) => {
            if (!o) setEnablingPlugin(null);
          }}
          onSuccess={() => setEnablingPlugin(null)}
        />
      )}

      {/* Disable Plugin Dialog */}
      {disablingPlugin && (
        <DisablePluginDialog
          plugin={disablingPlugin}
          open={!!disablingPlugin}
          onOpenChange={(o) => {
            if (!o) setDisablingPlugin(null);
          }}
          onSuccess={() => setDisablingPlugin(null)}
        />
      )}

      {/* Update Plugin Dialog */}
      {updatingPlugin && (
        <UpdatePluginDialog
          plugin={updatingPlugin}
          open={!!updatingPlugin}
          onOpenChange={(o) => {
            if (!o) setUpdatingPlugin(null);
          }}
          onSuccess={() => setUpdatingPlugin(null)}
        />
      )}

      {/* Uninstall Plugin Dialog */}
      {uninstallingPlugin && (
        <UninstallPluginDialog
          plugin={uninstallingPlugin}
          open={!!uninstallingPlugin}
          onOpenChange={(o) => {
            if (!o) setUninstallingPlugin(null);
          }}
          onSuccess={() => setUninstallingPlugin(null)}
        />
      )}
    </div>
  );
}
