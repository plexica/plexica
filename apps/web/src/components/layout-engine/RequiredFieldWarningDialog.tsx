// File: apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx
//
// T014-23 — Warning dialog shown when the admin hides a required field with no default.
// Spec 014 Frontend Layout Engine — FR-011, US-007.
//
// Triggered when the backend returns 400 REQUIRED_FIELD_NO_DEFAULT on PUT.
// The consumer resends the save request with `acknowledgeWarnings: true`.
//
// Uses Dialog from @plexica/ui.
// Focus trap: Tab cycles between [Cancel] and [Proceed Anyway].
// Esc closes the dialog (same as Cancel).
// Initial focus: [Cancel] (safer default action per design spec §630).

import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, Button } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RequiredFieldWarningItem {
  fieldId: string;
  label: string;
  /** The role(s) for which the field is being hidden. */
  role: string;
}

export interface RequiredFieldWarningDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** The required fields being hidden without default values. */
  fields: RequiredFieldWarningItem[];
  /** Called when the user cancels (reverts the toggle). */
  onCancel: () => void;
  /** Called when the user proceeds (resends with acknowledgeWarnings: true). */
  onProceed: () => void;
  /** Whether the save is currently in flight (shows spinner on Proceed button). */
  saving?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal warning dialog shown when an admin hides a required field with no default.
 *
 * @example
 * ```tsx
 * <RequiredFieldWarningDialog
 *   open={showWarning}
 *   fields={[{ fieldId: 'email', label: 'Email', role: 'VIEWER' }]}
 *   onCancel={() => setShowWarning(false)}
 *   onProceed={handleProceedWithWarning}
 *   saving={isSaving}
 * />
 * ```
 */
export function RequiredFieldWarningDialog({
  open,
  fields,
  onCancel,
  onProceed,
  saving = false,
}: RequiredFieldWarningDialogProps) {
  // Focus the Cancel button when the dialog opens (safer default per spec)
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && cancelRef.current) {
      // Defer to ensure the dialog is mounted in the DOM before focusing
      requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) {
          onCancel();
        }
      }}
    >
      <div
        aria-labelledby="required-field-warning-title"
        data-testid="required-field-warning-dialog"
        className="flex flex-col gap-4 max-w-md w-full"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <AlertTriangle size={24} className="text-yellow-600 flex-shrink-0" aria-hidden="true" />
          <h2 id="required-field-warning-title" className="text-base font-semibold text-foreground">
            Required Field Warning
          </h2>
        </div>

        {/* Body */}
        <div className="text-sm text-foreground space-y-2">
          <p>The following required fields have no default value and are being hidden:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            {fields.map((f) => (
              <li key={`${f.fieldId}-${f.role}`}>
                <span className="font-medium">{f.label}</span>{' '}
                <span className="text-muted-foreground">(hidden for {f.role})</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2">
            Hiding required fields without default values may cause form submission errors for
            affected users.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cancel and keep fields visible"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onProceed}
            disabled={saving}
            aria-label="Proceed with hiding required fields"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
                Saving…
              </span>
            ) : (
              'Proceed Anyway'
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
