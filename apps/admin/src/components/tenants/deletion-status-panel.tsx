// deletion-status-panel.tsx — Deletion saga status panel (S5-704).
// Renders the ordered GDPR deletion steps with
// status icons, attempts, last error and per-step retry. Auto-refreshes via
// useDeletionStatus (5s polling, stops when all done or any failed).
// aria-live="polite" announces status transitions to screen readers.

import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Check, Circle, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@plexica/ui';

import { useDeletionStatus, useRetryDeletionStep } from '../../hooks/use-tenant-lifecycle.js';

import type {
  DeletionStepName,
  DeletionStepStatus,
  TenantDeletionStepResponse,
} from '../../types/admin-types.js';

interface DeletionStatusPanelProps {
  tenantId: string;
  tenantName: string;
}

const STEP_LABELS: Record<DeletionStepName, string> = {
  event_data_purge: 'tenants.deletion.step.eventDataPurge',
  schema_drop: 'tenants.deletion.step.schemaDrop',
  realm_delete: 'tenants.deletion.step.realmDelete',
  bucket_delete: 'tenants.deletion.step.bucketDelete',
};

const ORDER: DeletionStepName[] = [
  'event_data_purge',
  'schema_drop',
  'realm_delete',
  'bucket_delete',
];

function sortSteps(steps: TenantDeletionStepResponse[]): TenantDeletionStepResponse[] {
  return [...steps].sort(
    (a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step)
  );
}

function StatusIcon({ status }: { status: DeletionStepStatus }): JSX.Element {
  switch (status) {
    case 'done':
      return <Check className="h-4 w-4 text-success" aria-hidden="true" />;
    case 'in_progress':
      return <Loader2 className="h-4 w-4 animate-spin text-primary-600" aria-hidden="true" />;
    case 'failed':
      return <X className="h-4 w-4 text-error" aria-hidden="true" />;
    default:
      return <Circle className="h-4 w-4 text-neutral-400" aria-hidden="true" />;
  }
}

function statusMessageKey(status: DeletionStepStatus): string {
  switch (status) {
    case 'done':
      return 'tenants.deletion.status.done';
    case 'in_progress':
      return 'tenants.deletion.status.inProgress';
    case 'failed':
      return 'tenants.deletion.status.failed';
    default:
      return 'tenants.deletion.status.pending';
  }
}

export function DeletionStatusPanel({
  tenantId,
  tenantName,
}: DeletionStatusPanelProps): JSX.Element {
  const intl = useIntl();
  const { data, isLoading, isError, refetch } = useDeletionStatus(tenantId);
  const retry = useRetryDeletionStep(tenantId);

  const steps = data !== undefined ? sortSteps(data.steps) : [];
  const allDone = steps.length > 0 && steps.every((s) => s.status === 'done');

  return (
    <section
      aria-label={intl.formatMessage({ id: 'tenants.deletion.title' }, { name: tenantName })}
      className="rounded-lg border border-orange-200 bg-orange-50 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-orange-900">
          <FormattedMessage id="tenants.deletion.title" values={{ name: tenantName }} />
        </h2>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => void refetch()}
          aria-label={intl.formatMessage({ id: 'tenants.deletion.refresh' })}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <FormattedMessage id="tenants.deletion.refresh" />
        </Button>
      </div>

      <div aria-live="polite" className="mt-3 space-y-2">
        {isLoading && (
          <p className="text-sm text-orange-800">
            <FormattedMessage id="tenants.deletion.loading" />
          </p>
        )}
        {isError && (
          <p role="alert" className="text-sm text-error">
            <FormattedMessage id="tenants.deletion.error" />
          </p>
        )}

        <ol className="space-y-2">
          {steps.map((step) => {
            const label = intl.formatMessage({ id: STEP_LABELS[step.step] });
            const statusText = intl.formatMessage({ id: statusMessageKey(step.status) });
            return (
              <li
                key={step.id}
                className="flex flex-col gap-1 rounded-md border border-orange-100 bg-white p-3"
                aria-current={step.status === 'in_progress' ? 'step' : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                    <StatusIcon status={step.status} />
                    <span>{label}</span>
                    <span className="sr-only">{statusText}</span>
                    <span className="text-neutral-600" aria-hidden="true">{statusText}</span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    <FormattedMessage
                      id="tenants.deletion.attempts"
                      values={{ count: step.attempts }}
                    />
                  </span>
                </div>

                {step.status === 'failed' && (
                  <div className="mt-1 space-y-1">
                    {step.lastError !== null && (
                      <p className="text-xs text-error">
                        <FormattedMessage
                          id="tenants.deletion.lastError"
                          values={{ error: step.lastError }}
                        />
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => retry.mutate(step.id)}
                      loading={retry.isPending}
                      aria-label={`${intl.formatMessage({ id: 'tenants.deletion.retry' })}: ${label}`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      <FormattedMessage id="tenants.deletion.retry" />
                    </Button>
                    {retry.error instanceof Error && (
                      <p role="alert" className="text-xs text-error">
                        <FormattedMessage id="tenants.deletion.retryError" />
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {allDone && (
          <p className="text-sm font-medium text-success-dark">
            <FormattedMessage id="tenants.deletion.complete" />
          </p>
        )}
      </div>
    </section>
  );
}
