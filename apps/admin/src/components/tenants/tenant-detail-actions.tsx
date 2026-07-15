// tenant-detail-actions.tsx — Lifecycle action buttons area for the tenant
// detail page. Buttons are placeholders — handlers are no-ops until the
// lifecycle mutation cards are implemented (S5-503 / S5-603 / S5-704).

import { FormattedMessage, useIntl } from 'react-intl';
import { ArrowRight, Pause, Play, Trash2 } from 'lucide-react';

import type { TenantStatus } from '../../types/admin-types.js';

interface TenantDetailActionsProps {
  status: TenantStatus;
  tenantName: string;
}

// Placeholder handlers — wired in S5-503 (suspend), S5-603 (reactivate),
// S5-704 (delete / deletion-status).
const noop = (): void => {};

export function TenantDetailActions({ status, tenantName }: TenantDetailActionsProps): JSX.Element | null {
  const intl = useIntl();

  if (status === 'pending_deletion') {
    return (
      <section
        className="rounded-lg border border-orange-200 bg-orange-50 p-4"
        aria-label={intl.formatMessage({ id: 'tenant.actions.deletionInProgress' })}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-orange-800">
          <FormattedMessage id="tenant.actions.deletionInProgress" />
        </p>
        <button
          type="button"
          onClick={noop} // TODO: wire to S5-704 deletion-status panel
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-orange-800 underline hover:text-orange-900"
        >
          <FormattedMessage id="tenant.actions.viewDeletionStatus" />
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </section>
    );
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
          onClick={noop} // TODO: wire to S5-503
          title={isSuspended ? intl.formatMessage({ id: 'tenant.actions.suspendDisabled' }) : undefined}
          aria-label={intl.formatMessage({ id: 'tenant.actions.suspend' }) + ' ' + tenantName}
          className="inline-flex items-center gap-2 rounded-md border border-warning-dark bg-white px-3 py-1.5 text-sm font-medium text-warning-dark hover:bg-warning-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.suspend" />
        </button>
        <button
          type="button"
          disabled={isActive}
          onClick={noop} // TODO: wire to S5-603
          title={isActive ? intl.formatMessage({ id: 'tenant.actions.reactivateDisabled' }) : undefined}
          aria-label={intl.formatMessage({ id: 'tenant.actions.reactivate' }) + ' ' + tenantName}
          className="inline-flex items-center gap-2 rounded-md border border-success-dark bg-white px-3 py-1.5 text-sm font-medium text-success-dark hover:bg-success-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.reactivate" />
        </button>
        <button
          type="button"
          onClick={noop} // TODO: wire to S5-704
          aria-label={intl.formatMessage({ id: 'tenant.actions.delete' }) + ' ' + tenantName}
          className="inline-flex items-center gap-2 rounded-md border border-error-dark bg-white px-3 py-1.5 text-sm font-medium text-error-dark hover:bg-error-light"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="tenant.actions.delete" />
        </button>
      </div>
    </section>
  );
}
