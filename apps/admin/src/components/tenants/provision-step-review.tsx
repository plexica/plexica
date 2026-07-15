// provision-step-review.tsx — Wizard Step 2: review summary (S5-403).
// Shows the resources that will be created and asks for confirmation.

import { AlertTriangle } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import type { ProvisionFormValues } from './provision-schema.js';

interface ProvisionStepReviewProps {
  values: ProvisionFormValues;
  onBack: () => void;
  onProvision: () => void;
  isPending: boolean;
}

function SummaryRow({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-sm font-medium text-neutral-600">{label}</dt>
      <dd className="text-sm text-neutral-900">
        {value}
        {hint !== undefined && <span className="ml-2 text-neutral-400">({hint})</span>}
      </dd>
    </div>
  );
}

export function ProvisionStepReview({
  values,
  onBack,
  onProvision,
  isPending,
}: ProvisionStepReviewProps): JSX.Element {
  const intl = useIntl();
  const schemaName = `tenant_${values.slug}`;
  const realmName = `plexica-${values.slug}`;
  const bucket = `tenant-${values.slug}`;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-neutral-900">
        {intl.formatMessage({ id: 'admin.provision.step2.heading' })}
      </h2>

      <dl className="rounded-lg border border-neutral-200 bg-white px-4">
        <SummaryRow
          label={intl.formatMessage({ id: 'admin.provision.review.schema' })}
          value={schemaName}
          hint={intl.formatMessage({ id: 'admin.provision.review.newSchema' })}
        />
        <SummaryRow
          label={intl.formatMessage({ id: 'admin.provision.review.realm' })}
          value={realmName}
          hint={intl.formatMessage({ id: 'admin.provision.review.newRealm' })}
        />
        <SummaryRow
          label={intl.formatMessage({ id: 'admin.provision.review.bucket' })}
          value={bucket}
          hint={intl.formatMessage({ id: 'admin.provision.review.newBucket' })}
        />
        <SummaryRow
          label={intl.formatMessage({ id: 'admin.provision.review.admin' })}
          value={values.adminEmail}
          hint={intl.formatMessage({ id: 'admin.provision.review.tempPassword' })}
        />
      </dl>

      <div
        className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
        role="note"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <FormattedMessage id="admin.provision.review.warning" />
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
          {intl.formatMessage({ id: 'admin.provision.back' })}
        </Button>
        <Button type="button" variant="primary" onClick={onProvision} loading={isPending}>
          {intl.formatMessage({ id: 'admin.provision.provision' })}
        </Button>
      </div>
    </div>
  );
}
