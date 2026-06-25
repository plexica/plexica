// type-to-confirm-dialog.tsx — TypeToConfirmDialog component
// Confirmation Flow: type-to-confirm variant.
// Forces the user to type a specific word before enabling a destructive action.
// Implements the state machine: idle → confirming → typing → ready → submitting → success/error
// WCAG: focus moves to input on open, focus trap by Radix, ESC closes.

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from './button.js';
import { Input } from './input.js';
import { DialogRoot, DialogContent, DialogTitle, DialogDescription } from './dialog.js';

export interface TypeToConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Word the user must type exactly. Default: "CONFIRM" */
  confirmWord?: string;
  /** Instruction shown above the input. Default: "Type CONFIRM to proceed" */
  confirmInstructions?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  /** Server-side error to display inline. Reset to null when dialog reopens. */
  error?: string | null;
}

export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord = 'CONFIRM',
  confirmInstructions,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  loading = false,
  error,
}: TypeToConfirmDialogProps): React.JSX.Element {
  const [typedText, setTypedText] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isMatch = typedText === confirmWord;
  const instructions = confirmInstructions ?? `Type ${confirmWord} to proceed`;

  function handleOpenChange(newOpen: boolean): void {
    if (!newOpen) {
      setTypedText('');
    }
    onOpenChange(newOpen);
  }

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        closeLabel={cancelLabel}
        // Move focus to the text input when the dialog opens (WCAG 2.4.3)
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Header: warning icon + title + description */}
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-error"
            aria-hidden="true"
          />
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1">{description}</DialogDescription>
          </div>
        </div>

        {/* Type-to-confirm input */}
        <div className="mt-5 space-y-1.5">
          <p className="text-sm font-medium text-neutral-700">{instructions}</p>
          <Input
            ref={inputRef}
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            aria-label={instructions}
            placeholder={confirmWord}
            disabled={loading}
            autoComplete="off"
          />
        </div>

        {/* Server error — stays visible so user can retry */}
        {error !== null && error !== undefined && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            type="button"
            disabled={!isMatch || loading}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
