// apps/super-admin/src/components/DestructiveConfirmModal.tsx
//
// T008-58: Reusable destructive-action confirmation modal.
// Used by Tenant Admin (apps/web) and Super Admin (apps/super-admin).
//
// Two variants:
//  - 'simple-confirm'  — Confirm enabled immediately
//  - 'typed-confirm'   — Confirm only enabled when user types confirmText exactly
//
// A11y:
//  - role="dialog" aria-modal="true" via Radix Dialog
//  - aria-labelledby → title element id
//  - Focus trap: input (typed-confirm) or Cancel button (simple-confirm)
//  - aria-live="polite" on error region
//  - Escape key → onClose (Radix handles this natively)

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Spinner } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DestructiveConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Default: 'simple-confirm' */
  variant?: 'typed-confirm' | 'simple-confirm';
  /** The text the user must type exactly (for typed-confirm variant). */
  confirmText?: string;
  /** Confirm button label. Default: "Confirm" */
  confirmLabel?: string;
  /** Cancel button label. Default: "Cancel" */
  cancelLabel?: string;
  /** Disables both buttons and shows spinner on Confirm while action runs. */
  isLoading?: boolean;
  /** Inline error displayed above the buttons. */
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TITLE_ID = 'destructive-confirm-title';

export function DestructiveConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  variant = 'simple-confirm',
  confirmText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  error,
}: DestructiveConfirmModalProps) {
  const [typedValue, setTypedValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Resolve effective variant: if typed-confirm but no confirmText provided,
  // fall back to simple-confirm.
  const effectiveVariant =
    variant === 'typed-confirm' && confirmText ? 'typed-confirm' : 'simple-confirm';

  // Reset typed value whenever the modal opens.
  useEffect(() => {
    if (open) {
      setTypedValue('');
    }
  }, [open]);

  // Move focus to the appropriate element when modal opens.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (effectiveVariant === 'typed-confirm') {
        inputRef.current?.focus();
      } else {
        cancelRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open, effectiveVariant]);

  const isConfirmEnabled =
    !isLoading && (effectiveVariant === 'simple-confirm' || typedValue === confirmText);

  function handleConfirm() {
    if (!isConfirmEnabled) return;
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        aria-labelledby={TITLE_ID}
        // Prevent Radix from auto-focusing its close button;
        // we manage focus ourselves via the useEffect above.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle id={TITLE_ID} className="text-base font-semibold text-foreground">
                {title}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Typed-confirm input */}
        {effectiveVariant === 'typed-confirm' && confirmText && (
          <div className="space-y-2 mt-2">
            <Label htmlFor="destructive-confirm-input" className="text-sm text-foreground">
              Type{' '}
              <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-xs">
                {confirmText}
              </code>{' '}
              to confirm
            </Label>
            <Input
              id="destructive-confirm-input"
              ref={inputRef}
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={confirmText}
              autoComplete="off"
              disabled={isLoading}
              aria-describedby={error ? 'dcm-error' : undefined}
            />
          </div>
        )}

        {/* Inline error */}
        <div id="dcm-error" role="alert" aria-live="polite" className="min-h-0">
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            aria-disabled={!isConfirmEnabled}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" aria-hidden="true" />
                {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
