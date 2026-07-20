// provision-step-result.tsx — Wizard Step 3: progress / result (S5-403).
// Loading spinner while provisioning, success panel with temp password, or
// error panel keyed by conflict type. All status updates announced via aria-live.

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import type { ProvisionTenantError } from '../../hooks/use-tenants.js';
import type { ProvisionResult, TenantConflictType } from '../../types/admin-types.js';

interface ProvisionStepResultProps {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: ProvisionResult | undefined;
  error: ProvisionTenantError | null;
  onBackToStart: () => void;
}

const CONFLICT_MESSAGE_KEY: Record<TenantConflictType, string> = {
  tenant_slug_exists: 'admin.provision.error.conflict.tenant_slug_exists',
  schema_exists: 'admin.provision.error.conflict.schema_exists',
  realm_exists: 'admin.provision.error.conflict.realm_exists',
  bucket_exists: 'admin.provision.error.conflict.bucket_exists',
};

export function ProvisionStepResult({
  isPending,
  isSuccess,
  isError,
  data,
  error,
  onBackToStart,
}: ProvisionStepResultProps): JSX.Element {
  if (isPending) return <ProvisionInProgress />;
  if (isSuccess && data !== undefined) return <ProvisionSuccess data={data} />;
  if (isError) return <ProvisionError error={error} onBackToStart={onBackToStart} />;
  return <ProvisionInProgress />;
}

function ProvisionInProgress(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-10" aria-live="assertive">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" aria-hidden="true" />
      <p className="text-sm font-medium text-neutral-900">
        <FormattedMessage id="admin.provision.progress.title" />
      </p>
      <p className="text-sm text-error-dark">
        <FormattedMessage id="admin.provision.progress.warning" />
      </p>
    </div>
  );
}

function ProvisionSuccess({ data }: { data: ProvisionResult }): JSX.Element {
  const intl = useIntl();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(data.tempPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold">
          <FormattedMessage id="admin.provision.success.title" />
        </h2>
      </div>

      <dl className="rounded-lg border border-neutral-200 bg-white px-4 text-sm">
        <Row label={intl.formatMessage({ id: 'admin.provision.review.slug' })} value={data.slug} />
        <Row label={intl.formatMessage({ id: 'admin.provision.review.realm' })} value={data.realmName} />
        <Row label={intl.formatMessage({ id: 'admin.provision.review.schema' })} value={data.schemaName} />
        <Row label={intl.formatMessage({ id: 'admin.provision.review.bucket' })} value={data.minioBucket} />
      </dl>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-medium text-neutral-900">
          {intl.formatMessage({ id: 'admin.provision.success.tempPassword' })}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded bg-white px-2 py-1 text-sm">{data.tempPassword}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {intl.formatMessage({ id: 'admin.provision.success.copy' })}
          </Button>
          <span className="text-xs text-green-700" aria-live="polite">
            {copied ? intl.formatMessage({ id: 'admin.provision.success.copied' }) : ''}
          </span>
        </div>
        <p className="mt-2 text-xs text-amber-800">
          <FormattedMessage id="admin.provision.success.tempPasswordHelper" />
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => void navigate({ to: '/tenants' })}>
          {intl.formatMessage({ id: 'admin.provision.success.viewTenants' })}
        </Button>
        <Button type="button" variant="primary" onClick={() => void navigate({ to: '/dashboard' })}>
          {intl.formatMessage({ id: 'admin.provision.success.done' })}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 font-medium text-neutral-600">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}

function ProvisionError({
  error,
  onBackToStart,
}: {
  error: ProvisionTenantError | null;
  onBackToStart: () => void;
}): JSX.Element {
  const intl = useIntl();
  const conflictType = error?.conflictType ?? null;
  const messageKey = conflictType !== null
    ? CONFLICT_MESSAGE_KEY[conflictType]
    : 'admin.provision.error.conflict.unknown';

  return (
    <div className="flex flex-col gap-4" aria-live="assertive">
      <div
        className="flex items-start gap-2 rounded-md border border-error-light bg-error-light/20 p-4 text-sm text-error-dark"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            <FormattedMessage id="admin.provision.error.title" />
          </p>
          <p>
            <FormattedMessage id={messageKey} />
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="button" variant="primary" onClick={onBackToStart}>
          {intl.formatMessage({ id: 'admin.provision.error.backToStart' })}
        </Button>
      </div>
    </div>
  );
}
