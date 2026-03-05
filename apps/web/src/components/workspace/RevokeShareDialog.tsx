// apps/web/src/components/workspace/RevokeShareDialog.tsx
//
// T8.4: Confirmation dialog for revoking a shared resource.
// Per design-spec.md §4.6 — shows plugin name + target workspace,
// Cancel and destructive "Revoke Access" buttons.
// Uses @radix-ui Dialog (same pattern as DestructiveConfirmModal).

import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@plexica/ui';
import { Button, Spinner } from '@plexica/ui';
import { AlertTriangle } from 'lucide-react';
import type { SharedResource } from './SharedResourceRow';

interface RevokeShareDialogProps {
  open: boolean;
  resource: SharedResource | null;
  /** Name of the workspace access is being revoked from. */
  targetWorkspaceName: string;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

const TITLE_ID = 'revoke-share-dialog-title';

export function RevokeShareDialog({
  open,
  resource,
  targetWorkspaceName,
  isLoading = false,
  error,
  onClose,
  onConfirm,
}: RevokeShareDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus to Cancel on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      cancelRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  if (!resource) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        aria-labelledby={TITLE_ID}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md"
        role="dialog"
        aria-modal="true"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle id={TITLE_ID} className="text-base font-semibold text-foreground">
                Revoke Sharing
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Are you sure you want to stop sharing{' '}
                <span className="font-medium text-foreground">
                  &ldquo;{resource.resourceName}&rdquo;
                </span>{' '}
                with <span className="font-medium text-foreground">{targetWorkspaceName}</span>?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The <span className="font-medium">{targetWorkspaceName}</span> workspace will lose
                access to this plugin.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Inline error */}
        <div role="alert" aria-live="polite" className="min-h-0">
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            aria-disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" aria-hidden="true" />
                Revoking...
              </span>
            ) : (
              'Revoke Access'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
