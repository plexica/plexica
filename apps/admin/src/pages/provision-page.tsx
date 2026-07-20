// provision-page.tsx — 3-step tenant provisioning wizard (S5-403 / FR 005-04).
// Step 1: input form → Step 2: review → Step 3: progress/result.
// Form via react-hook-form + Zod (Rule 3). Mutation via TanStack Query.
// All strings via react-intl. Lucide icons only.

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useIntl } from 'react-intl';

import { StepProgressIndicator } from '../components/tenants/step-progress-indicator.js';
import { ProvisionStepInput } from '../components/tenants/provision-step-input.js';
import { ProvisionStepReview } from '../components/tenants/provision-step-review.js';
import { ProvisionStepResult } from '../components/tenants/provision-step-result.js';
import {
  PROVISION_FORM_DEFAULTS,
  type ProvisionFormValues,
} from '../components/tenants/provision-schema.js';
import { useProvisionTenant } from '../hooks/use-tenants.js';

type Step = 1 | 2 | 3;

export function ProvisionPage(): JSX.Element {
  const intl = useIntl();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<ProvisionFormValues>(PROVISION_FORM_DEFAULTS);

  const provision = useProvisionTenant();

  const stepLabels = [
    intl.formatMessage({ id: 'admin.provision.step.details' }),
    intl.formatMessage({ id: 'admin.provision.step.review' }),
    intl.formatMessage({ id: 'admin.provision.step.progress' }),
  ];

  function handleNext(nextValues: ProvisionFormValues): void {
    setValues(nextValues);
    setStep(2);
  }

  function handleProvision(): void {
    provision.reset();
    provision.mutate(values);
    setStep(3);
  }

  function handleBackToStart(): void {
    provision.reset();
    setValues(PROVISION_FORM_DEFAULTS);
    setStep(1);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold text-neutral-900">
        {intl.formatMessage({ id: 'admin.provision.title' })}
      </h1>

      <StepProgressIndicator currentStep={step} totalSteps={3} labels={stepLabels} />

      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        {step === 1 && (
          <ProvisionStepInput
            defaultValues={values}
            onNext={handleNext}
            onCancel={() => void navigate({ to: '/tenants' })}
          />
        )}

        {step === 2 && (
          <ProvisionStepReview
            values={values}
            onBack={() => setStep(1)}
            onProvision={handleProvision}
            isPending={provision.isPending}
          />
        )}

        {step === 3 && (
          <ProvisionStepResult
            isPending={provision.isPending}
            isSuccess={provision.isSuccess}
            isError={provision.isError}
            data={provision.data}
            error={provision.error}
            onBackToStart={handleBackToStart}
          />
        )}
      </div>
    </div>
  );
}
