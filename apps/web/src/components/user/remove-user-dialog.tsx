// remove-user-dialog.tsx
// Confirms removal of a user from the tenant via TypeToConfirmDialog.
// The user must type "CONFIRM" before the destructive action is enabled.
// Mutation errors are shown inline; dialog stays open so the user can retry.

import { useState } from 'react';
import { useIntl } from 'react-intl';
import { TypeToConfirmDialog } from '@plexica/ui';

import { useRemoveUser } from '../../hooks/use-users.js';

interface RemoveUserDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveUserDialog({
  userId,
  open,
  onOpenChange,
}: RemoveUserDialogProps): JSX.Element {
  const intl = useIntl();
  const [serverError, setServerError] = useState<string | null>(null);
  const { mutate, isPending } = useRemoveUser();

  function handleOpenChange(newOpen: boolean): void {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  }

  function handleConfirm(): void {
    setServerError(null);
    mutate(userId, {
      onSuccess: () => handleOpenChange(false),
      onError: () => {
        setServerError(intl.formatMessage({ id: 'common.error' }));
      },
    });
  }

  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={intl.formatMessage({ id: 'users.remove.title' })}
      description={intl.formatMessage({ id: 'users.remove.description' })}
      confirmInstructions={intl.formatMessage({ id: 'users.remove.confirm.instructions' })}
      confirmLabel={intl.formatMessage({ id: 'common.delete' })}
      cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
      onConfirm={handleConfirm}
      loading={isPending}
      error={serverError}
    />
  );
}
