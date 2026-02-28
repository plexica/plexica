// File: apps/super-admin/src/components/plugins/EnablePluginDialog.tsx
//
// Lifecycle confirmation dialog for enabling a plugin (INSTALLED → ACTIVE).
// Design ref: design-spec.md Screen 3a.
//
// Shows:
//   - "This will:" action list
//   - Permissions info panel (role="note")
//   - Event subscription count in the action list
//   - Tenant impact message
//   - "Enable Plugin" primary button

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
} from '@plexica/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck } from 'lucide-react';
import type { PluginEntity } from '@plexica/types';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface EnablePluginDialogProps {
  plugin: PluginEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the plugin has been successfully enabled. */
  onSuccess?: () => void;
}

function extractPermissions(plugin: PluginEntity): string[] {
  const manifest = (plugin as { manifest?: Record<string, unknown> }).manifest;
  if (!manifest) return [];
  const perms = manifest['permissions'];
  if (Array.isArray(perms)) {
    return perms
      .map((p) => {
        if (typeof p === 'string') return p;
        if (typeof p === 'object' && p !== null && 'key' in p) return String(p['key']);
        return null;
      })
      .filter((p): p is string => p !== null);
  }
  return [];
}

function extractEventCount(plugin: PluginEntity): number {
  const manifest = (plugin as { manifest?: Record<string, unknown> }).manifest;
  if (!manifest) return 0;
  const events = manifest['events'];
  if (Array.isArray(events)) return events.length;
  return 0;
}

export function EnablePluginDialog({
  plugin,
  open,
  onOpenChange,
  onSuccess,
}: EnablePluginDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const permissions = extractPermissions(plugin);
  const eventCount = extractEventCount(plugin);

  const { mutate: enable, isPending } = useMutation({
    mutationFn: () => apiClient.enablePlugin(plugin.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['registry-plugin-stats'] });
      toast({ title: `${plugin.name} enabled successfully.` });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to enable plugin.';
      setApiError(message);
    },
  });

  const handleConfirm = () => {
    setApiError(null);
    enable();
  };

  const handleClose = () => {
    setApiError(null);
    onOpenChange(false);
  };

  const descriptionId = `enable-dialog-desc-${plugin.id}`;
  const titleId = `enable-dialog-title-${plugin.id}`;

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
          <DialogTitle id={titleId}>Enable {plugin.name}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4" id={descriptionId}>
          {/* API error inline alert */}
          {apiError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* "This will:" bullet list */}
          <div>
            <p className="text-sm font-medium mb-2">This will:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Start the plugin container</li>
              <li>Register in service discovery</li>
              {eventCount > 0 && (
                <li>
                  Configure event subscriptions ({eventCount} event{eventCount !== 1 ? 's' : ''})
                </li>
              )}
              <li>Run health check verification</li>
            </ul>
          </div>

          {/* Permissions info panel */}
          {permissions.length > 0 && (
            <div
              role="note"
              aria-label="Permissions to be activated"
              className="rounded-md border border-border bg-muted/40 p-3"
            >
              <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                <Info className="h-4 w-4 text-blue-500 shrink-0" aria-hidden="true" />
                <span>Permissions to be activated:</span>
              </div>
              <ul className="space-y-1">
                {permissions.map((perm) => (
                  <li key={perm} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <code>{perm}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tenant impact */}
          <p className="text-sm text-muted-foreground">
            Tenants will be able to enable this plugin for their organizations after activation.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Enabling…' : 'Enable Plugin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
