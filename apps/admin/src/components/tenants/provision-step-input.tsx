// provision-step-input.tsx — Wizard Step 1: tenant details form (S5-403).
// react-hook-form + Zod (Rule 3). "Next" advances only when the form is valid.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useIntl } from 'react-intl';
import { Button, Input } from '@plexica/ui';

import { provisionSchema, type ProvisionFormValues } from './provision-schema.js';

interface ProvisionStepInputProps {
  defaultValues: ProvisionFormValues;
  onNext: (values: ProvisionFormValues) => void;
  onCancel: () => void;
}

export function ProvisionStepInput({
  defaultValues,
  onNext,
  onCancel,
}: ProvisionStepInputProps): JSX.Element {
  const intl = useIntl();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ProvisionFormValues>({
    resolver: zodResolver(provisionSchema),
    defaultValues,
    mode: 'onChange',
  });

  function resolveError(messageId: string | undefined): string | undefined {
    return messageId !== undefined ? intl.formatMessage({ id: messageId }) : undefined;
  }

  const slugError = resolveError(errors.slug?.message);
  const nameError = resolveError(errors.name?.message);
  const emailError = resolveError(errors.adminEmail?.message);

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-neutral-900">
        {intl.formatMessage({ id: 'admin.provision.step1.heading' })}
      </h2>

      <Input
        label={intl.formatMessage({ id: 'admin.provision.slug.label' })}
        helperText={intl.formatMessage({ id: 'admin.provision.slug.helper' })}
        {...(slugError !== undefined ? { error: slugError } : {})}
        autoComplete="off"
        {...register('slug')}
      />

      <Input
        label={intl.formatMessage({ id: 'admin.provision.name.label' })}
        {...(nameError !== undefined ? { error: nameError } : {})}
        autoComplete="off"
        {...register('name')}
      />

      <Input
        type="email"
        label={intl.formatMessage({ id: 'admin.provision.adminEmail.label' })}
        helperText={intl.formatMessage({ id: 'admin.provision.adminEmail.helper' })}
        {...(emailError !== undefined ? { error: emailError } : {})}
        autoComplete="off"
        {...register('adminEmail')}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {intl.formatMessage({ id: 'admin.provision.cancel' })}
        </Button>
        <Button type="submit" variant="primary" disabled={!isValid}>
          {intl.formatMessage({ id: 'admin.provision.next' })}
        </Button>
      </div>
    </form>
  );
}
