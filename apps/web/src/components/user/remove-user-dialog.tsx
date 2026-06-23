// remove-user-dialog.tsx
// Confirm dialog for removing a user from the tenant.

import { useIntl } from 'react-intl';
import { ConfirmDialog } from '@plexica/ui';

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
  const { mutate, isPending } = useRemoveUser();

  function handleConfirm(): void {
    mutate(userId, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={intl.formatMessage({ id: 'users.remove.title' })}
      description={intl.formatMessage({ id: 'users.remove.description' })}
      confirmLabel={intl.formatMessage({ id: 'common.delete' })}
      cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
      variant="destructive"
      onConfirm={handleConfirm}
      loading={isPending}
    />
  );
}
