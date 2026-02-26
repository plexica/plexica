// File: apps/super-admin/src/components/plugins/UninstallPluginDialog.tsx
//
// Lifecycle confirmation dialog for uninstalling a plugin.
// Design ref: design-spec.md Screen 3d.
//
// Shows:
//   - "This will permanently:" bullet list
//   - Data Cleanup panel with Checkbox (role="note")
//   - Blocked state: if activeTenantCount > 0 → disabled button + warning
//   - Name confirmation input (must match plugin.name exactly to proceed)
//   - "Uninstall Plugin" destructive button

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
  Checkbox,
} from '@plexica/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { PluginEntity } from '@plexica/types';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface UninstallPluginDialogProps {
  plugin: PluginEntity;
  /**
   * Number of tenants that currently have this plugin enabled.
   * When > 0, the uninstall action is blocked until the user disables
   * the plugin for all tenants.
   */
  activeTenantCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function extractPermissionCount(plugin: PluginEntity): number {
  const manifest = (plugin as { manifest?: Record<string, unknown> }).manifest;
  if (!manifest) return 0;
  const perms = manifest['permissions'];
  return Array.isArray(perms) ? perms.length : 0;
}

function extractEventCount(plugin: PluginEntity): number {
  const manifest = (plugin as { manifest?: Record<string, unknown> }).manifest;
  if (!manifest) return 0;
  const events = manifest['events'];
  return Array.isArray(events) ? events.length : 0;
}

export function UninstallPluginDialog({
  plugin,
  activeTenantCount = 0,
  open,
  onOpenChange,
  onSuccess,
}: UninstallPluginDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteData, setDeleteData] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const isBlocked = activeTenantCount > 0;
  const nameConfirmed = confirmName === plugin.name;
  const canProceed = !isBlocked && nameConfirmed;

  const permCount = extractPermissionCount(plugin);
  const eventCount = extractEventCount(plugin);
  const tenantCount = plugin.tenantCount ?? 0;

  const confirmInputId = `uninstall-confirm-input-${plugin.id}`;
  const confirmInstructionId = `uninstall-confirm-instruction-${plugin.id}`;
  const cleanupWarningId = `uninstall-cleanup-warning-${plugin.id}`;
  const checkboxId = `uninstall-delete-data-${plugin.id}`;
  const descriptionId = `uninstall-dialog-desc-${plugin.id}`;
  const titleId = `uninstall-dialog-title-${plugin.id}`;

  const { mutate: uninstall, isPending } = useMutation({
    mutationFn: () => apiClient.uninstallPlugin(plugin.id, deleteData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['registry-plugin-stats'] });
      toast({ title: `${plugin.name} uninstalled successfully.` });
      onOpenChange(false);
      resetState();
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to uninstall plugin.';
      setApiError(message);
    },
  });

  const resetState = () => {
    setDeleteData(false);
    setConfirmName('');
    setApiError(null);
  };

  const handleConfirm = () => {
    if (!canProceed) return;
    setApiError(null);
    uninstall();
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

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
          <DialogTitle id={titleId}>
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
              Uninstall {plugin.name}?
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4" id={descriptionId}>
          {/* API error */}
          {apiError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* Blocked state warning */}
          {isBlocked && (
            <Alert variant="destructive" role="alert" aria-label="Uninstall blocked">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                Cannot uninstall: {activeTenantCount} tenant
                {activeTenantCount !== 1 ? 's' : ''} still{' '}
                {activeTenantCount !== 1 ? 'have' : 'has'} this plugin enabled. Disable the plugin
                for all tenants first.
              </AlertDescription>
            </Alert>
          )}

          {/* "This will permanently:" bullet list */}
          <div>
            <p className="text-sm font-medium mb-2">This will permanently:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Remove the plugin container</li>
              <li>Deregister all API routes</li>
              {permCount > 0 && (
                <li>
                  Remove {permCount} permission{permCount !== 1 ? 's' : ''} from the system
                </li>
              )}
              {eventCount > 0 && (
                <li>
                  Deregister {eventCount} event subscription{eventCount !== 1 ? 's' : ''}
                </li>
              )}
              <li>Remove frontend module registration</li>
            </ul>
          </div>

          {/* Data Cleanup panel */}
          <div
            role="note"
            aria-label="Data cleanup options"
            className="rounded-md border border-border bg-muted/40 p-3 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Data Cleanup</span>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id={checkboxId}
                checked={deleteData}
                onCheckedChange={(checked) => setDeleteData(checked === true)}
                aria-describedby={cleanupWarningId}
              />
              <label htmlFor={checkboxId} className="text-sm cursor-pointer">
                Delete plugin data from all tenant schemas
                {tenantCount > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({tenantCount} tenant{tenantCount !== 1 ? 's' : ''})
                  </span>
                )}
              </label>
            </div>

            {deleteData && (
              <p
                id={cleanupWarningId}
                className="text-xs text-destructive"
                role="note"
                aria-live="polite"
              >
                This cannot be undone. All tenant-specific plugin data will be permanently deleted.
              </p>
            )}
            {!deleteData && (
              // Keep the id in the DOM so aria-describedby resolves even when unchecked
              <span id={cleanupWarningId} className="sr-only">
                Checking this option will permanently delete all tenant plugin data.
              </span>
            )}
          </div>

          {/* Name confirmation */}
          {!isBlocked && (
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || !canProceed}
            aria-disabled={isPending || !canProceed}
            title={isBlocked ? 'Disable in all tenants first' : undefined}
          >
            {isPending ? 'Uninstalling…' : 'Uninstall Plugin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
