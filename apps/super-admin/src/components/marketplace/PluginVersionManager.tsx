/**
 * Plugin Version Manager Component
 *
 * Manages plugin versions for super-admins:
 * - View all versions of a plugin
 * - Publish new versions
 * - Mark a version as latest
 * - View changelog for each version
 */

import { useState, useEffect } from 'react';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { X, Plus, CheckCircle, Clock, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Plugin, PluginVersion } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface PluginVersionManagerProps {
  plugin: Plugin;
  onClose: () => void;
  onSuccess?: () => void;
}

interface NewVersionForm {
  version: string;
  changelog: string;
  setAsLatest: boolean;
}

export function PluginVersionManager({ plugin, onClose, onSuccess }: PluginVersionManagerProps) {
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const [newVersion, setNewVersion] = useState<NewVersionForm>({
    version: '',
    changelog: '',
    setAsLatest: true,
  });

  useEffect(() => {
    loadVersions();
  }, [plugin.id]);

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getMarketplacePlugin(plugin.id, true);
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
      toast({
        title: 'Failed to load versions',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublishVersion = async () => {
    if (!newVersion.version.trim() || !newVersion.changelog.trim()) {
      toast({
        title: 'Validation error',
        description: 'Version and changelog are required',
        variant: 'error',
      });
      return;
    }

    setIsPublishing(true);

    try {
      await apiClient.publishVersion(plugin.id, {
        version: newVersion.version,
        changelog: newVersion.changelog,
        manifest: plugin.manifest || {},
        setAsLatest: newVersion.setAsLatest,
      });

      toast({
        title: 'Version published',
        description: `Version ${newVersion.version} has been published successfully`,
        variant: 'success',
      });

      setNewVersion({ version: '', changelog: '', setAsLatest: true });
      setShowPublishForm(false);
      loadVersions();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to publish version:', error);
      toast({
        title: 'Failed to publish version',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const toggleVersionExpanded = (versionId: string) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId);
    } else {
      newExpanded.add(versionId);
    }
    setExpandedVersions(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Version Manager</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin.name} • {versions.length} version{versions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Publish New Version Button */}
          {!showPublishForm && (
            <Button
              onClick={() => setShowPublishForm(true)}
              className="w-full mb-6"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Publish New Version
            </Button>
          )}

          {/* Publish New Version Form */}
          {showPublishForm && (
            <Card className="p-6 mb-6 border-2 border-primary">
              <h3 className="text-lg font-semibold text-foreground mb-4">Publish New Version</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Version Number *
                  </label>
                  <Input
                    type="text"
                    value={newVersion.version}
                    onChange={(e) => setNewVersion({ ...newVersion, version: e.target.value })}
                    placeholder="e.g., 1.1.0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use semantic versioning (e.g., 1.0.0, 2.1.3)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Changelog *
                  </label>
                  <textarea
                    value={newVersion.changelog}
                    onChange={(e) => setNewVersion({ ...newVersion, changelog: e.target.value })}
                    placeholder="What's new in this version?"
                    rows={4}
                    className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="setAsLatest"
                    checked={newVersion.setAsLatest}
                    onChange={(e) =>
                      setNewVersion({ ...newVersion, setAsLatest: e.target.checked })
                    }
                    className="w-4 h-4 text-primary bg-card border-border rounded focus:ring-2 focus:ring-primary"
                  />
                  <label htmlFor="setAsLatest" className="text-sm text-foreground">
                    Mark as latest version
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={handlePublishVersion} disabled={isPublishing} className="flex-1">
                    {isPublishing ? (
                      <>
                        <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2"></div>
                        Publishing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Publish Version
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setShowPublishForm(false)}
                    variant="outline"
                    disabled={isPublishing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
                <p className="text-muted-foreground">Loading versions...</p>
              </div>
            </div>
          )}

          {/* Versions List */}
          {!isLoading && versions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Published Versions
              </h3>

              {versions.map((version) => {
                const isExpanded = expandedVersions.has(version.id);

                return (
                  <Card key={version.id} className="p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3 flex-1">
                        <Package className="h-5 w-5 text-primary" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg font-semibold text-foreground">
                              v{version.version}
                            </h4>
                            {version.isLatest && (
                              <Badge variant="default" className="text-xs">
                                Latest
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(version.publishedAt)}
                            </span>
                            <span>•</span>
                            <span>{version.downloadCount.toLocaleString()} downloads</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleVersionExpanded(version.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {/* Expanded Changelog */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <h5 className="text-sm font-semibold text-foreground mb-2">Changelog</h5>
                        <div className="text-sm text-muted-foreground whitespace-pre-line bg-muted/30 rounded-lg p-3">
                          {version.changelog}
                        </div>

                        {version.assetUrl && (
                          <div className="mt-3">
                            <a
                              href={version.assetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              Download Asset →
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && versions.length === 0 && (
            <Card className="p-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No versions yet</h3>
              <p className="text-muted-foreground mb-6">
                This plugin doesn&apos;t have any published versions yet
              </p>
              {!showPublishForm && (
                <Button onClick={() => setShowPublishForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Publish First Version
                </Button>
              )}
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {versions.length > 0 && (
              <>Latest: v{versions.find((v) => v.isLatest)?.version || versions[0]?.version}</>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
