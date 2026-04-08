// tenant-auth-config-page.tsx
// Form to update tenant authentication config: MFA, session TTL.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Input, ToggleSwitch } from '@plexica/ui';

import { useAuthConfig, useUpdateAuthConfig } from '../hooks/use-tenant-settings.js';

const schema = z.object({
  mfaRequired: z.boolean(),
  sessionMaxSecs: z
    .number()
    .int()
    .min(60)
    .max(86400 * 7),
});

type FormValues = z.infer<typeof schema>;

export function TenantAuthConfigPage(): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError } = useAuthConfig();
  const { mutate: updateConfig, isPending: isSaving } = useUpdateAuthConfig();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mfaRequired: false, sessionMaxSecs: 3600 },
  });

  const mfaRequired = watch('mfaRequired');

  useEffect(() => {
    if (data?.data !== undefined) {
      reset({
        mfaRequired: data.data.mfaRequired ?? false,
        sessionMaxSecs: data.data.sessionMaxSecs ?? 3600,
      });
    }
  }, [data, reset]);

  function onSubmit(values: FormValues): void {
    updateConfig(values);
  }

  if (isPending)
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  if (isError)
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.auth.title" />
      </h1>

      <form
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="max-w-lg space-y-6"
        noValidate
      >
        <ToggleSwitch
          label={intl.formatMessage({ id: 'settings.auth.mfa.label' })}
          checked={mfaRequired}
          onCheckedChange={(checked) => setValue('mfaRequired', checked)}
        />

        <div>
          <Input
            type="number"
            label={intl.formatMessage({ id: 'settings.auth.sessionMaxSecs.label' })}
            {...register('sessionMaxSecs', { valueAsNumber: true })}
            {...(errors.sessionMaxSecs?.message !== undefined
              ? { error: errors.sessionMaxSecs.message }
              : {})}
          />
        </div>

        <Button type="submit" loading={isSaving}>
          <FormattedMessage id="settings.auth.save" />
        </Button>
      </form>
    </div>
  );
}
