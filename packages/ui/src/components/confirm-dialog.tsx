// confirm-dialog.tsx — ConfirmDialog component
// Reusable confirm/destructive dialog replacing window.confirm()
// WCAG 2.1 AA: focus trap + ESC handled by Radix, aria-labelledby

import * as React from 'react';

import { Button } from './button.js';
import { DialogRoot, DialogContent, DialogTitle, DialogDescription } from './dialog.js';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  loading = false,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={cancelLabel}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
