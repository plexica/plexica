// suspend-dialog.tsx — Suspend tenant confirmation dialog (S5-503).
// Replaces window.confirm with a Radix Dialog. Handles 409 version conflict
// (optimistic lock) by surfacing a retry hint; the caller refetches on close.

import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle } from 'lucide-react';
import { Button, DialogRoot, DialogContent, DialogTitle, DialogDescription } from '@plexica/ui';

import { useSuspendTenant } from '../../hooks/use-tenant-lifecycle.js';
import { ApiError } from '../../services/api-client.js';

interface SuspendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  version: number;
  /** Called after a successful suspend so the caller can refetch if needed. */
  onSuspended?: () => void;
}

export function SuspendDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  version,
  onSuspended,
}: SuspendDialogProps): JSX.Element {
  const intl = useIntl();
  const { mutate, isPending, error, reset } = useSuspendTenant();

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleConfirm(): void {
    mutate(
      { id: tenantId, version },
      {
        onSuccess: () => {
          onSuspended?.();
          handleOpenChange(false);
        },
      }
    );
  }

  const isConflict = error instanceof ApiError && error.status === 409;
  const errorMessage = isConflict
    ? intl.formatMessage({ id: 'tenants.suspend.error.conflict' })
    : error instanceof Error
      ? intl.formatMessage({ id: 'tenants.suspend.error.generic' })
      : null;

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        closeLabel={intl.formatMessage({ id: 'common.cancel' })}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <DialogTitle>
              <FormattedMessage id="tenants.suspend.title" values={{ name: tenantName }} />
            </DialogTitle>
            <DialogDescription className="mt-1">
              <FormattedMessage id="tenants.suspend.warning" />
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
            <FormattedMessage id="tenants.suspend.confirm" />
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
