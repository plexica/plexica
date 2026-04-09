// tenant-settings-page.tsx
// Form to edit tenant display name. Slug is read-only.

import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@plexica/ui';

import { useTenantSettings, useUpdateTenantSettings } from '../hooks/use-tenant-settings.js';

const schema = z.object({
  displayName: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function TenantSettingsPage(): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError } = useTenantSettings();
  const { mutate, isPending: isSaving } = useUpdateTenantSettings();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (data !== undefined) {
      reset({ displayName: data.displayName });
    }
  }, [data, reset]);

  if (isPending)
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  if (isError || data === undefined)
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );

  function onSubmit(values: FormValues): void {
    mutate({ displayName: values.displayName });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.general.title" />
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4" noValidate>
        <Input
          label={intl.formatMessage({ id: 'settings.general.displayName.label' })}
          {...(errors.displayName?.message !== undefined
            ? { error: errors.displayName.message }
            : {})}
          {...register('displayName')}
        />
        <Input
          label={intl.formatMessage({ id: 'settings.general.slug.label' })}
          value={data.slug}
          disabled
          readOnly
          helperText={intl.formatMessage({ id: 'settings.general.slug.tooltip' })}
        />
        <Button type="submit" loading={isSaving}>
          <FormattedMessage id="settings.general.save" />
        </Button>
      </form>
    </div>
  );
}
