// reactivate-dialog.tsx — Reactivate tenant confirmation dialog (S5-603).
// Mirrors the suspend dialog with reactivate messaging. Handles 409 version
// conflict (optimistic lock) the same way as suspend.

import { FormattedMessage, useIntl } from 'react-intl';
import { PlayCircle } from 'lucide-react';
import { Button, DialogRoot, DialogContent, DialogTitle, DialogDescription } from '@plexica/ui';

import { useReactivateTenant } from '../../hooks/use-tenant-lifecycle.js';
import { ApiError } from '../../services/api-client.js';

interface ReactivateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  version: number;
  onReactivated?: () => void;
}

export function ReactivateDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  version,
  onReactivated,
}: ReactivateDialogProps): JSX.Element {
  const intl = useIntl();
  const { mutate, isPending, error, reset } = useReactivateTenant();

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleConfirm(): void {
    mutate(
      { id: tenantId, version },
      {
        onSuccess: () => {
          onReactivated?.();
          handleOpenChange(false);
        },
      }
    );
  }

  const isConflict = error instanceof ApiError && error.status === 409;
  const errorMessage = isConflict
    ? intl.formatMessage({ id: 'tenants.reactivate.error.conflict' })
    : error instanceof Error
      ? intl.formatMessage({ id: 'tenants.reactivate.error.generic' })
      : null;

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        closeLabel={intl.formatMessage({ id: 'common.cancel' })}
      >
        <div className="flex items-start gap-3">
          <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <DialogTitle>
              <FormattedMessage id="tenants.reactivate.title" values={{ name: tenantName }} />
            </DialogTitle>
            <DialogDescription className="mt-1">
              <FormattedMessage id="tenants.reactivate.warning" />
            </DialogDescription>
          </div>
        </div>

        <p className="mt-4 text-sm text-neutral-500">
          <FormattedMessage id="tenant.fields.version" />: {version}
        </p>

        {errorMessage !== null && (
          <p role="alert" className="mt-3 text-sm text-error">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            <FormattedMessage id="common.cancel" />
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending}
          >
            <FormattedMessage id="tenants.reactivate.confirm" />
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
