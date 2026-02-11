import { useState } from 'react';
import { Button, Badge } from '@plexica/ui';
import { X, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plugin } from '../../types';
import { apiClient } from '../../lib/api-client';
import { PluginVersionManager } from '../marketplace/PluginVersionManager';
import { PluginAnalytics } from '../marketplace/PluginAnalytics';

interface PluginDetailModalProps {
  plugin: Plugin;
  onClose: () => void;
}

export function PluginDetailModal({ plugin, onClose }: PluginDetailModalProps) {
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch full plugin details (includes installCount, averageRating, ratingCount, versions)
  const { data: detail } = useQuery({
    queryKey: ['plugin', plugin.id],
    queryFn: () => apiClient.getPlugin(plugin.id),
  });

  // Fetch tenant installs
  const { data: installs } = useQuery({
    queryKey: ['plugin-installs', plugin.id],
    queryFn: () => apiClient.getPluginInstalls(plugin.id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['plugins'] });
    queryClient.invalidateQueries({ queryKey: ['plugins-stats'] });
    queryClient.invalidateQueries({ queryKey: ['plugin', plugin.id] });
  };

  const deprecateMutation = useMutation({
    mutationFn: () => apiClient.deprecatePlugin(plugin.id),
    onSuccess: () => {
      invalidateAll();
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to deprecate plugin');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deletePlugin(plugin.id),
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to delete plugin');
    },
  });

  // Use detail data if available, fallback to passed plugin
  const pluginData = detail || plugin;

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
      default:
        return 'outline';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                {plugin.icon || '?'}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{plugin.name}</h2>
                <p className="text-sm text-muted-foreground">v{plugin.version}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status and Category */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <Badge variant={getStatusBadgeVariant(pluginData.status)}>{pluginData.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Category:</span>
              <span className="text-sm text-foreground">{pluginData.category}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {pluginData.description}
            </p>
            {pluginData.longDescription && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                {pluginData.longDescription}
              </p>
            )}
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Plugin ID</p>
              <p className="text-sm text-foreground font-mono">{pluginData.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Author</p>
              <p className="text-sm text-foreground">
                {pluginData.author}
                {pluginData.authorEmail && (
                  <span className="text-muted-foreground"> ({pluginData.authorEmail})</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Version</p>
              <p className="text-sm text-foreground font-mono">{pluginData.version}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Published</p>
              <p className="text-sm text-foreground">
                {pluginData.publishedAt
                  ? new Date(pluginData.publishedAt).toLocaleDateString()
                  : new Date(pluginData.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Links */}
          {(pluginData.homepage || pluginData.repository) && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Links</h3>
              <div className="flex gap-4">
                {pluginData.homepage && (
                  <a
                    href={pluginData.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Homepage
                  </a>
                )}
                {pluginData.repository && (
                  <a
                    href={pluginData.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Repository
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {pluginData.tags && pluginData.tags.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {pluginData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Technical Info */}
          {pluginData.entryPoint && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Technical Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entry Point:</span>
                  <span className="text-foreground font-mono text-xs">{pluginData.entryPoint}</span>
                </div>
              </div>
            </div>
          )}

          {/* Installation Statistics */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Installs</p>
                <p className="text-xl font-bold text-foreground">{pluginData.installCount ?? 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <p className="text-xl font-bold text-foreground">
                  {pluginData.averageRating != null && pluginData.averageRating > 0
                    ? `${Number(pluginData.averageRating).toFixed(1)}/5`
                    : 'N/A'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Reviews</p>
                <p className="text-xl font-bold text-foreground">{pluginData.ratingCount ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Tenant Installs */}
          {installs && installs.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Installed by {installs.length} tenant{installs.length !== 1 ? 's' : ''}
              </h3>
              <div className="space-y-2">
                {installs.slice(0, 5).map((install) => (
                  <div
                    key={install.tenantId}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded p-2"
                  >
                    <span className="font-mono text-foreground">
                      {install.tenantId.substring(0, 8)}...
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(install.installedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {installs.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    +{installs.length - 5} more tenants
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Version History */}
          {detail?.versions && detail.versions.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Version History ({detail.versions.length})
              </h3>
              <div className="space-y-2">
                {detail.versions.slice(0, 5).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-foreground">v{v.version}</span>
                      {v.isLatest && <Badge variant="default">Latest</Badge>}
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(v.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {detail.versions.length > 5 && (
                  <button
                    onClick={() => setShowVersionManager(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    View all {detail.versions.length} versions
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            {actionError && (
              <div className="mb-3 p-2 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
                {actionError}
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowVersionManager(true)}>
                Manage Versions
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAnalytics(true)}>
                View Analytics
              </Button>
              {pluginData.status === 'PUBLISHED' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deprecateMutation.mutate()}
                  disabled={deprecateMutation.isPending}
                >
                  {deprecateMutation.isPending ? 'Deprecating...' : 'Deprecate'}
                </Button>
              )}
              {(pluginData.status === 'DRAFT' || pluginData.status === 'DEPRECATED') && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm('Are you sure you want to delete this plugin? This cannot be undone.')
                    ) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Plugin'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </div>

      {/* Version Manager Modal */}
      {showVersionManager && (
        <PluginVersionManager
          plugin={plugin}
          onClose={() => setShowVersionManager(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['plugin', plugin.id] });
            setShowVersionManager(false);
          }}
        />
      )}

      {/* Analytics Modal */}
      {showAnalytics && <PluginAnalytics plugin={plugin} onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}
