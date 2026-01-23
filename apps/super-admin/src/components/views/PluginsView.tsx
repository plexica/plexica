import { useState } from 'react';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { Search } from 'lucide-react';
import { usePlugins } from '@/hooks';
import { Plugin } from '@/types';
import { PluginDetailModal } from '../plugins/PluginDetailModal';

export function PluginsView() {
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  const {
    plugins,
    categories,
    stats,
    isLoading,
    error,
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
      case 'published':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'deprecated':
        return 'danger';
      default:
        return 'outline';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Plugin Marketplace</h2>
          <p className="text-muted-foreground">Manage global plugin registry</p>
        </div>
        <Button>+ Publish Plugin</Button>
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
            {/* Search Input */}
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

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="deprecated">Deprecated</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Stats */}
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
                  <strong className="text-foreground">{plugins.length}</strong> results
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plugins.map((plugin) => (
                <Card key={plugin.id} className="p-6 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                      {plugin.icon || '🧩'}
                    </div>
                    <Badge variant={getStatusBadgeVariant(plugin.status)}>{plugin.status}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">{plugin.name}</h3>
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
                    <Button variant="outline" size="sm" className="flex-1">
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : stats.total === 0 ? (
            <Card className="p-12 text-center">
              <div className="text-6xl mb-4">🧩</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No plugins yet</h3>
              <p className="text-muted-foreground mb-6">
                Publish your first plugin to the marketplace
              </p>
              <Button>+ Publish Plugin</Button>
            </Card>
          ) : (
            <Card className="p-12 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No plugins found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </Card>
          )}
        </>
      )}

      {/* Plugin Detail Modal */}
      {selectedPlugin && (
        <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}
    </div>
  );
}
