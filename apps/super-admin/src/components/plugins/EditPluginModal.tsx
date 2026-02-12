// apps/super-admin/src/components/plugins/EditPluginModal.tsx

import { useState } from 'react';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plugin } from '../../types';
import { apiClient } from '../../lib/api-client';

interface EditPluginModalProps {
  plugin: Plugin;
  onClose: () => void;
}

export function EditPluginModal({ plugin, onClose }: EditPluginModalProps) {
  const [name, setName] = useState(plugin.name);
  const [description, setDescription] = useState(plugin.description);
  const [version, setVersion] = useState(plugin.version);
  const [longDescription, setLongDescription] = useState(plugin.longDescription || '');
  const [homepage, setHomepage] = useState(plugin.homepage || '');
  const [repository, setRepository] = useState(plugin.repository || '');
  const [tags, setTags] = useState<string[]>(plugin.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const hasChanges =
    name !== plugin.name ||
    description !== plugin.description ||
    version !== plugin.version ||
    longDescription !== (plugin.longDescription || '') ||
    homepage !== (plugin.homepage || '') ||
    repository !== (plugin.repository || '') ||
    JSON.stringify(tags) !== JSON.stringify(plugin.tags || []);

  const isValid = name.trim().length >= 1 && description.trim().length >= 1;

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Build core updates (name, version, description) via admin endpoint
      const coreUpdates: Record<string, string> = {};
      if (name !== plugin.name) coreUpdates.name = name.trim();
      if (version !== plugin.version) coreUpdates.version = version.trim();
      if (description !== plugin.description) coreUpdates.description = description.trim();

      // Build metadata updates via marketplace endpoint
      const metadataUpdates: Record<string, unknown> = {};
      if (longDescription !== (plugin.longDescription || ''))
        metadataUpdates.description = longDescription.trim();
      if (homepage !== (plugin.homepage || ''))
        metadataUpdates.homepage = homepage.trim() || undefined;
      if (repository !== (plugin.repository || ''))
        metadataUpdates.repository = repository.trim() || undefined;
      if (JSON.stringify(tags) !== JSON.stringify(plugin.tags || [])) metadataUpdates.tags = tags;

      const promises: Promise<unknown>[] = [];

      if (Object.keys(coreUpdates).length > 0) {
        promises.push(apiClient.updatePlugin(plugin.id, coreUpdates));
      }

      if (Object.keys(metadataUpdates).length > 0) {
        promises.push(
          apiClient.updatePluginMetadata(
            plugin.id,
            metadataUpdates as {
              description?: string;
              longDescription?: string;
              tags?: string[];
              homepage?: string;
              repository?: string;
            }
          )
        );
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins-stats'] });
      queryClient.invalidateQueries({ queryKey: ['plugin', plugin.id] });
      setSubmitError(null);
      onClose();
    },
    onError: (err: Error) => {
      setSubmitError(err.message || 'Failed to update plugin');
    },
  });

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = () => {
    if (!hasChanges) {
      onClose();
      return;
    }
    setSubmitError(null);
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Edit Plugin</h2>
              <p className="text-sm text-muted-foreground">{plugin.id}</p>
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
        <div className="p-6 space-y-5">
          {submitError && (
            <Card className="bg-destructive/10 border-destructive/30">
              <div className="p-3">
                <p className="text-destructive text-sm">{submitError}</p>
              </div>
            </Card>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Plugin Name</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Plugin name"
            />
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Version</label>
            <Input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>

          {/* Short Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Short Description
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              maxLength={150}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.length}/150 characters
            </p>
          </div>

          {/* Category (read-only) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Category</label>
            <Input type="text" value={plugin.category} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground mt-1">
              Category cannot be changed after creation
            </p>
          </div>

          {/* Long Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Long Description
            </label>
            <textarea
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder="Detailed description..."
              rows={4}
              className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Homepage */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Homepage URL</label>
            <Input
              type="url"
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              placeholder="https://myplugin.com"
            />
          </div>

          {/* Repository */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Repository URL</label>
            <Input
              type="url"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="https://github.com/user/plugin"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag (press Enter)"
              />
              <Button variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : hasChanges ? 'Save Changes' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  );
}
