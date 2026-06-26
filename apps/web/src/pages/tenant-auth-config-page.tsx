// tenant-auth-config-page.tsx
// Form to update tenant authentication config: brute force protection, session TTL.
// Settings Panel pattern: SettingsSection card, isDirty indicator, save feedback.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, ToggleSwitch } from '@plexica/ui';

import { useAuthConfig, useUpdateAuthConfig } from '../hooks/use-tenant-settings.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

const schema = z.object({
  bruteForceProtected: z.boolean(),
  ssoSessionMaxLifespan: z.number().int().min(300).max(86400),
});
type FormValues = z.infer<typeof schema>;

function AuthConfigSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-36" />
      <SkeletonLoader variant="card" className="h-36" />
    </div>
  );
}

export function TenantAuthConfigPage(): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useAuthConfig();
  const { mutate: updateConfig, isPending: isSaving } = useUpdateAuthConfig();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } =
    useForm<FormValues>({
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

  if (isPending) return <AuthConfigSkeleton />;
  if (isError) return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;

  function onSubmit(values: FormValues): void {
    updateConfig(values, {
      onSuccess: () => {
        reset(values); markSaved();
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.auth.title" />
      </h1>

      <div className="max-w-2xl">
        <SettingsSection
          title={<FormattedMessage id="settings.auth.title" />}
          description={<FormattedMessage id="settings.auth.description" />}
        >
          <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-6" noValidate>
            <ToggleSwitch
              label={intl.formatMessage({ id: 'settings.auth.bruteForce.label' })}
              checked={bruteForceProtected}
              onCheckedChange={(checked) => setValue('bruteForceProtected', checked, { shouldDirty: true })}
            />
            <Input
              type="number"
              label={intl.formatMessage({ id: 'settings.auth.sessionLifespan.label' })}
              {...register('ssoSessionMaxLifespan', { valueAsNumber: true })}
              {...(errors.ssoSessionMaxLifespan?.message !== undefined
                ? { error: errors.ssoSessionMaxLifespan.message } : {})}
            />
            <SaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="settings.auth.save" />}
            />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
