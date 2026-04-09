// tenant-auth-config-page.tsx
// Form to update tenant authentication config: brute force protection, session TTL.
// Fields map to Keycloak realm settings via the backend auth-config API.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Input, ToggleSwitch } from '@plexica/ui';

import { useAuthConfig, useUpdateAuthConfig } from '../hooks/use-tenant-settings.js';

const schema = z.object({
  bruteForceProtected: z.boolean(),
  ssoSessionMaxLifespan: z.number().int().min(300).max(86400),
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
    defaultValues: { bruteForceProtected: true, ssoSessionMaxLifespan: 36000 },
  });

  const bruteForceProtected = watch('bruteForceProtected');

  useEffect(() => {
    if (data !== undefined) {
      reset({
        bruteForceProtected: data.bruteForceProtected ?? true,
        ssoSessionMaxLifespan: data.ssoSessionMaxLifespan ?? 36000,
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
          label={intl.formatMessage({ id: 'settings.auth.bruteForce.label' })}
          checked={bruteForceProtected}
          onCheckedChange={(checked) => setValue('bruteForceProtected', checked)}
        />

        <div>
          <Input
            type="number"
            label={intl.formatMessage({ id: 'settings.auth.sessionLifespan.label' })}
            {...register('ssoSessionMaxLifespan', { valueAsNumber: true })}
            {...(errors.ssoSessionMaxLifespan?.message !== undefined
              ? { error: errors.ssoSessionMaxLifespan.message }
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
