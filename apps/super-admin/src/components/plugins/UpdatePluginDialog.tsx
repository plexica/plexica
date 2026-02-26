// File: apps/super-admin/src/components/plugins/UpdatePluginDialog.tsx
//
// Lifecycle confirmation dialog for updating a plugin to a new version.
// Design ref: design-spec.md Screen 3c.
//
// Shows:
//   - Version diff (current → target)
//   - Changes summary (permissions, events, migrations)
//   - Info panel: what the update will do + rollback note (role="note")
//   - Breaking changes alert (if breaking === true): requires name confirmation input
//   - "Update Plugin" primary button

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  Button,
  Alert,
  AlertDescription,
  Input,
} from '@plexica/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, AlertTriangle } from 'lucide-react';
import type { PluginEntity } from '@plexica/types';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface UpdatePluginDialogProps {
  plugin: PluginEntity;
  /** The target version to update to. Shown in the version diff. */
  targetVersion?: string;
  /** If true, the update includes breaking changes and requires name confirmation. */
  breaking?: boolean;
  /** Short changelog excerpt to display. */
  changelog?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UpdatePluginDialog({
  plugin,
  targetVersion,
  breaking = false,
  changelog,
  open,
  onOpenChange,
  onSuccess,
}: UpdatePluginDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');

  const nameConfirmed = !breaking || confirmName === plugin.name;
  const confirmInputId = `update-confirm-input-${plugin.id}`;
  const confirmInstructionId = `update-confirm-instruction-${plugin.id}`;

  const { mutate: upgrade, isPending } = useMutation({
    mutationFn: () => apiClient.upgradePlugin(plugin.id, targetVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['registry-plugin-stats'] });
      toast({ title: `${plugin.name} updated successfully.` });
      onOpenChange(false);
      setConfirmName('');
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to update plugin.';
      setApiError(message);
    },
  });

  const handleConfirm = () => {
    if (!nameConfirmed) return;
    setApiError(null);
    upgrade();
  };

  const handleClose = () => {
    setApiError(null);
    setConfirmName('');
    onOpenChange(false);
  };

  const descriptionId = `update-dialog-desc-${plugin.id}`;
  const titleId = `update-dialog-title-${plugin.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-w-lg"
      >
        <DialogHeader>
          <DialogTitle id={titleId}>Update {plugin.name}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4" id={descriptionId}>
          {/* API error */}
          {apiError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* Version diff */}
          {targetVersion && (
            <p className="text-sm font-medium" aria-label="Version change">
              Current: <span className="font-mono text-muted-foreground">v{plugin.version}</span>
              {' → '}
              New: <span className="font-mono text-foreground">v{targetVersion}</span>
            </p>
          )}

          {/* Changelog excerpt */}
          {changelog && (
            <div>
              <p className="text-sm font-medium mb-1">Changes:</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{changelog}</p>
            </div>
          )}

          {/* Breaking changes alert */}
          {breaking && (
            <Alert variant="destructive" role="alert" aria-label="Breaking changes warning">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                This update contains breaking changes. Review carefully before proceeding.
              </AlertDescription>
            </Alert>
          )}

          {/* Info panel: what the update will do */}
          <div
            role="note"
            aria-label="Update process information"
            className="rounded-md border border-border bg-muted/40 p-3"
          >
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Info className="h-4 w-4 text-blue-500 shrink-0" aria-hidden="true" />
              <span>This update will:</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Pull the new container image</li>
              <li>Run migrations in all tenant schemas</li>
              <li>Hot-swap the running container</li>
              <li>Verify health check</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              If the update fails, the previous version will be automatically restored.
            </p>
          </div>

          {/* Name confirmation input for breaking changes */}
          {breaking && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground" id={confirmInstructionId}>
                Type <strong>{plugin.name}</strong> to confirm:
              </p>
              <Input
                id={confirmInputId}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={plugin.name}
                aria-label="Type plugin name to confirm"
                aria-describedby={confirmInstructionId}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending || !nameConfirmed}
            aria-disabled={isPending || !nameConfirmed}
          >
            {isPending ? 'Updating…' : 'Update Plugin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
