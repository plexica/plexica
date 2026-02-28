// File: apps/super-admin/src/components/plugins/DisablePluginDialog.tsx
//
// Lifecycle confirmation dialog for disabling a plugin (ACTIVE → DISABLED).
// Design ref: design-spec.md Screen 3b.
//
// Shows:
//   - Impact warning with tenant count (destructive alert, role="alert")
//   - Data preservation note
//   - "Disable Plugin" destructive button

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
import { AlertTriangle } from 'lucide-react';
import type { PluginEntity } from '@plexica/types';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface DisablePluginDialogProps {
  plugin: PluginEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DisablePluginDialog({
  plugin,
  open,
  onOpenChange,
  onSuccess,
}: DisablePluginDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const tenantCount = plugin.tenantCount ?? 0;

  const { mutate: disable, isPending } = useMutation({
    mutationFn: () => apiClient.disablePlugin(plugin.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['registry-plugin-stats'] });
      toast({ title: `${plugin.name} disabled successfully.` });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to disable plugin.';
      setApiError(message);
    },
  });

  const handleConfirm = () => {
    setApiError(null);
    disable();
  };

  const handleClose = () => {
    setApiError(null);
    onOpenChange(false);
  };

  const descriptionId = `disable-dialog-desc-${plugin.id}`;
  const titleId = `disable-dialog-title-${plugin.id}`;

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
          <DialogTitle id={titleId}>Disable {plugin.name}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4" id={descriptionId}>
          {/* API error */}
          {apiError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* Impact warning */}
          <div
            role="alert"
            aria-label="Impact warning"
            className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3"
          >
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Impact Warning</span>
            </div>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
              {tenantCount > 0 && (
                <li>
                  {tenantCount} tenant{tenantCount !== 1 ? 's' : ''} currently{' '}
                  {tenantCount !== 1 ? 'have' : 'has'} this plugin enabled
                </li>
              )}
              <li>Active users will lose access to {plugin.name} features immediately</li>
              <li>Plugin container will be stopped</li>
              <li>All tenant data will be preserved</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Disabling…' : 'Disable Plugin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
