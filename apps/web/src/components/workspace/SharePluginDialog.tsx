// apps/web/src/components/workspace/SharePluginDialog.tsx
//
// T8.2 / T3.5: Multi-select dialog for batch plugin sharing.
// Per design-spec.md §4.3 — two checkbox lists (plugins + target workspaces),
// selection summary, Share button disabled until ≥1 plugin and ≥1 workspace.
// Q1 resolved: multi-select checkboxes (not single-select).
// Connects to POST /api/v1/workspaces/:id/resources/share (T3 API).

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@plexica/ui';
import { Button, Checkbox, Input, Label, Spinner } from '@plexica/ui';
import { Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Plugin {
  id: string;
  name: string;
  description?: string;
}

export interface TargetWorkspace {
  id: string;
  name: string;
  /** If true, this workspace is the current one and should be disabled */
  isCurrent?: boolean;
}

interface SharePluginDialogProps {
  open: boolean;
  plugins: Plugin[];
  targetWorkspaces: TargetWorkspace[];
  isLoadingPlugins?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onShare: (pluginIds: string[], workspaceIds: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TITLE_ID = 'share-plugin-dialog-title';

export function SharePluginDialog({
  open,
  plugins,
  targetWorkspaces,
  isLoadingPlugins = false,
  isSubmitting = false,
  error,
  onClose,
  onShare,
}: SharePluginDialogProps) {
  const [selectedPluginIds, setSelectedPluginIds] = useState<Set<string>>(new Set());
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<string>>(new Set());
  const [pluginSearch, setPluginSearch] = useState('');
  const [workspaceSearch, setWorkspaceSearch] = useState('');

  const filteredPlugins = useMemo(
    () => plugins.filter((p) => p.name.toLowerCase().includes(pluginSearch.toLowerCase())),
    [plugins, pluginSearch]
  );

  const filteredWorkspaces = useMemo(
    () =>
      targetWorkspaces.filter((w) => w.name.toLowerCase().includes(workspaceSearch.toLowerCase())),
    [targetWorkspaces, workspaceSearch]
  );

  const canShare = selectedPluginIds.size > 0 && selectedWorkspaceIds.size > 0 && !isSubmitting;

  function togglePlugin(id: string) {
    setSelectedPluginIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleWorkspace(id: string) {
    setSelectedWorkspaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleShare() {
    if (!canShare) return;
    await onShare(Array.from(selectedPluginIds), Array.from(selectedWorkspaceIds));
    // Reset on success (parent closes dialog)
    setSelectedPluginIds(new Set());
    setSelectedWorkspaceIds(new Set());
    setPluginSearch('');
    setWorkspaceSearch('');
  }

  function handleClose() {
    setSelectedPluginIds(new Set());
    setSelectedWorkspaceIds(new Set());
    setPluginSearch('');
    setWorkspaceSearch('');
    onClose();
  }

  // Build selection summary
  const selectedPluginNames = plugins
    .filter((p) => selectedPluginIds.has(p.id))
    .map((p) => p.name)
    .join(', ');
  const selectedWorkspaceNames = targetWorkspaces
    .filter((w) => selectedWorkspaceIds.has(w.id))
    .map((w) => w.name)
    .join(', ');

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent
        aria-labelledby={TITLE_ID}
        className="sm:max-w-lg"
        role="dialog"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle id={TITLE_ID} className="text-base font-semibold">
            Share Plugin
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Share a plugin with other workspaces in your tenant.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plugin selector */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">Select Plugin</Label>
            <div className="relative mb-2">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search installed plugins..."
                value={pluginSearch}
                onChange={(e) => setPluginSearch(e.target.value)}
                className="pl-8"
                aria-label="Search installed plugins"
              />
            </div>
            {isLoadingPlugins ? (
              <div className="flex items-center justify-center h-20">
                <Spinner size="sm" />
              </div>
            ) : (
              <div
                role="group"
                aria-label="Available plugins"
                className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border"
              >
                {filteredPlugins.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No plugins found</p>
                ) : (
                  filteredPlugins.map((plugin) => (
                    <div key={plugin.id} className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        id={`plugin-${plugin.id}`}
                        checked={selectedPluginIds.has(plugin.id)}
                        onCheckedChange={() => togglePlugin(plugin.id)}
                        disabled={isSubmitting}
                        aria-label={plugin.name}
                      />
                      <label
                        htmlFor={`plugin-${plugin.id}`}
                        className="text-sm text-foreground cursor-pointer select-none"
                      >
                        {plugin.name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Workspace selector */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Select Target Workspace(s)
            </Label>
            <div className="relative mb-2">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search workspaces..."
                value={workspaceSearch}
                onChange={(e) => setWorkspaceSearch(e.target.value)}
                className="pl-8"
                aria-label="Search workspaces"
              />
            </div>
            <div
              role="group"
              aria-label="Target workspaces"
              className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border"
            >
              {filteredWorkspaces.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No workspaces found</p>
              ) : (
                filteredWorkspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      id={`workspace-${workspace.id}`}
                      checked={selectedWorkspaceIds.has(workspace.id)}
                      onCheckedChange={() => !workspace.isCurrent && toggleWorkspace(workspace.id)}
                      disabled={workspace.isCurrent || isSubmitting}
                      aria-disabled={workspace.isCurrent || isSubmitting ? 'true' : undefined}
                      aria-label={
                        workspace.isCurrent
                          ? `${workspace.name} (current workspace, disabled)`
                          : workspace.name
                      }
                    />
                    <label
                      htmlFor={`workspace-${workspace.id}`}
                      className={[
                        'text-sm cursor-pointer select-none',
                        workspace.isCurrent
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground',
                      ].join(' ')}
                    >
                      {workspace.name}
                      {workspace.isCurrent && (
                        <span className="ml-1 text-xs text-muted-foreground">(current)</span>
                      )}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selection summary */}
          {selectedPluginIds.size > 0 && selectedWorkspaceIds.size > 0 && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
              <span className="font-medium text-foreground">Selected:</span> {selectedPluginNames} →{' '}
              {selectedWorkspaceNames}
            </p>
          )}

          {/* Error */}
          {error && (
            <p role="alert" aria-live="polite" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={!canShare} aria-disabled={!canShare}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" aria-hidden="true" />
                Sharing...
              </span>
            ) : (
              'Share Selected'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
