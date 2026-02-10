import { useState } from 'react';
import { Button, Badge } from '@plexica/ui';
import { X } from 'lucide-react';
import { Plugin } from '../../types';
import { PluginVersionManager } from '../marketplace/PluginVersionManager';
import { PluginAnalytics } from '../marketplace/PluginAnalytics';

interface PluginDetailModalProps {
  plugin: Plugin;
  onClose: () => void;
}

export function PluginDetailModal({ plugin, onClose }: PluginDetailModalProps) {
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return 'default';
      case 'DRAFT':
        return 'secondary';
      case 'DEPRECATED':
        return 'danger';
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
                {plugin.icon || '🧩'}
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
              <Badge variant={getStatusBadgeVariant(plugin.status)}>{plugin.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Category:</span>
              <span className="text-sm text-foreground">{plugin.category}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{plugin.description}</p>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Plugin ID</p>
              <p className="text-sm text-foreground font-mono">{plugin.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Author</p>
              <p className="text-sm text-foreground">{plugin.author}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Version</p>
              <p className="text-sm text-foreground font-mono">{plugin.version}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Published</p>
              <p className="text-sm text-foreground">
                {new Date(plugin.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Technical Info */}
          {plugin.entryPoint && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Technical Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entry Point:</span>
                  <span className="text-foreground font-mono text-xs">{plugin.entryPoint}</span>
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
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Active Users</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Detailed statistics coming in future release
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowVersionManager(true)}>
                Manage Versions
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAnalytics(true)}>
                View Analytics
              </Button>
              <Button variant="outline" size="sm">
                Edit Plugin
              </Button>
              <Button variant="outline" size="sm">
                View Installations
              </Button>
              {plugin.status === 'PUBLISHED' && (
                <Button variant="danger" size="sm">
                  Deprecate
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
            // Optionally refresh plugin data
            setShowVersionManager(false);
          }}
        />
      )}

      {/* Analytics Modal */}
      {showAnalytics && <PluginAnalytics plugin={plugin} onClose={() => setShowAnalytics(false)} />}
    </div>
  );
}
