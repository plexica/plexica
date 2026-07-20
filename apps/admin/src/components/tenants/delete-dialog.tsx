// delete-dialog.tsx — Delete tenant with type-to-confirm (S5-704).
// Reuses the @plexica/ui TypeToConfirmDialog: the user must type the tenant
// slug exactly before the destructive confirm button enables. Handles 409
// version conflicts and surfaces the 202 Accepted response to the caller so it
// can swap to the DeletionStatusPanel.

import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { TypeToConfirmDialog } from '@plexica/ui';

import { useDeleteTenant } from '../../hooks/use-tenant-lifecycle.js';
import { ApiError } from '../../services/api-client.js';

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  slug: string;
  version: number;
  /** Called after the deletion saga is accepted (202) — caller shows the panel. */
  onDeleted?: () => void;
}

export function DeleteDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  slug,
  version,
  onDeleted,
}: DeleteDialogProps): JSX.Element {
  const intl = useIntl();
  const { mutate, isPending, error, reset } = useDeleteTenant();

  // Reset mutation state whenever the dialog reopens.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleConfirm(): void {
    mutate(
      { id: tenantId, confirmSlug: slug, version },
      {
        onSuccess: () => {
          onDeleted?.();
          handleOpenChange(false);
        },
      }
    );
  }

  const isConflict = error instanceof ApiError && error.status === 409;
  const errorText = isConflict
    ? intl.formatMessage({ id: 'tenants.delete.error.conflict' })
    : error instanceof Error
      ? intl.formatMessage({ id: 'tenants.delete.error.generic' })
      : null;

  const title = intl.formatMessage({ id: 'tenants.delete.title' }, { name: tenantName });
  const warning = intl.formatMessage({ id: 'tenants.delete.warning' });
  const instructions = intl.formatMessage({ id: 'tenants.delete.typeSlug' }, { slug });
  const confirmLabel = intl.formatMessage({ id: 'tenants.delete.confirmButton' });
  const cancelLabel = intl.formatMessage({ id: 'tenants.delete.cancel' });

  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={warning}
      confirmWord={slug}
      confirmInstructions={instructions}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={handleConfirm}
      loading={isPending}
      error={errorText}
    />
  );
}
