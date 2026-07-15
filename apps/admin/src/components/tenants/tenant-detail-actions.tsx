// tenant-detail-actions.tsx — Lifecycle action buttons + dialogs for the tenant
// detail page (S5-503 suspend, S5-603 reactivate, S5-704 delete + deletion
// status). When the tenant is `pending_deletion` the DeletionStatusPanel
// replaces the action buttons.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Pause, Play, Trash2 } from 'lucide-react';

import { DeletionStatusPanel } from './deletion-status-panel.js';
import { DeleteDialog } from './delete-dialog.js';
import { ReactivateDialog } from './reactivate-dialog.js';
import { SuspendDialog } from './suspend-dialog.js';

import type { TenantStatus } from '../../types/admin-types.js';

interface TenantDetailActionsProps {
  tenantId: string;
  status: TenantStatus;
  tenantName: string;
  slug: string;
  version: number;
}

type DialogKind = 'suspend' | 'reactivate' | 'delete' | null;

export function TenantDetailActions({
  tenantId,
  status,
  tenantName,
  slug,
  version,
}: TenantDetailActionsProps): JSX.Element | null {
  const intl = useIntl();
  const [dialog, setDialog] = useState<DialogKind>(null);

  if (status === 'pending_deletion') {
    return <DeletionStatusPanel tenantId={tenantId} tenantName={tenantName} />;
  }

  if (status === 'deleted') {
    return null;
  }

  const isActive = status === 'active';
  const isSuspended = status === 'suspended';

  return (
    <section className="space-y-2" aria-label={intl.formatMessage({ id: 'tenant.actions.title' })}>
      <h2 className="text-sm font-semibold text-neutral-700">
        <FormattedMessage id="tenant.actions.title" />
      </h2>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isSuspended}
          onClick={() => setDialog('suspend')}
          title={isSuspended ? intl.formatMessage({ id: 'tenant.actions.suspendDisabled' }) : undefined}
          aria-label={`${intl.formatMessage({ id: 'tenant.actions.suspend' })} ${tenantName}`}
          className="inline-flex items-center gap-2 rounded-md border border-warning-dark bg-white px-3 py-1.5 text-sm font-medium text-warning-dark hover:bg-warning-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.suspend" />
        </button>
        <button
          type="button"
          disabled={isActive}
          onClick={() => setDialog('reactivate')}
          title={isActive ? intl.formatMessage({ id: 'tenant.actions.reactivateDisabled' }) : undefined}
          aria-label={`${intl.formatMessage({ id: 'tenant.actions.reactivate' })} ${tenantName}`}
          className="inline-flex items-center gap-2 rounded-md border border-success-dark bg-white px-3 py-1.5 text-sm font-medium text-success-dark hover:bg-success-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.reactivate" />
        </button>
        <button
          type="button"
          onClick={() => setDialog('delete')}
          aria-label={`${intl.formatMessage({ id: 'tenant.actions.delete' })} ${tenantName}`}
          className="inline-flex items-center gap-2 rounded-md border border-error-dark bg-white px-3 py-1.5 text-sm font-medium text-error-dark hover:bg-error-light"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.delete" />
        </button>
      </div>

      <SuspendDialog
        open={dialog === 'suspend'}
        onOpenChange={(o) => setDialog(o ? 'suspend' : null)}
        tenantId={tenantId}
        tenantName={tenantName}
        version={version}
      />
      <ReactivateDialog
        open={dialog === 'reactivate'}
        onOpenChange={(o) => setDialog(o ? 'reactivate' : null)}
        tenantId={tenantId}
        tenantName={tenantName}
        version={version}
      />
      <DeleteDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        tenantId={tenantId}
        tenantName={tenantName}
        slug={slug}
      />
    </section>
  );
}
