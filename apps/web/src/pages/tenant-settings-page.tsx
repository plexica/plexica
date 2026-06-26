// tenant-settings-page.tsx
// Form to edit tenant display name. Slug is read-only.
// Settings Panel pattern: SettingsSection card, isDirty indicator, save feedback.

import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@plexica/ui';

import { useTenantSettings, useUpdateTenantSettings } from '../hooks/use-tenant-settings.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

const schema = z.object({ displayName: z.string().min(1) });
type FormValues = z.infer<typeof schema>;

function TenantSettingsSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-40" />
      <div className="space-y-4">
        <SkeletonLoader variant="card" className="h-28" />
      </div>
    </div>
  );
}

export function TenantSettingsPage(): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useTenantSettings();
  const { mutate, isPending: isSaving } = useUpdateTenantSettings();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (data !== undefined) reset({ displayName: data.displayName });
  }, [data, reset]);

  if (isPending) return <TenantSettingsSkeleton />;
  if (isError || data === undefined) {
    return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;
  }

  function onSubmit(values: FormValues): void {
    mutate({ displayName: values.displayName }, {
      onSuccess: () => {
        reset({ displayName: values.displayName });
        markSaved();
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.general.title" />
      </h1>

      <div className="max-w-2xl">
        <SettingsSection
          title={<FormattedMessage id="settings.general.title" />}
          description={<FormattedMessage id="settings.general.displayName.description" />}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label={intl.formatMessage({ id: 'settings.general.displayName.label' })}
              {...(errors.displayName?.message !== undefined ? { error: errors.displayName.message } : {})}
              {...register('displayName')}
            />
            <Input
              label={intl.formatMessage({ id: 'settings.general.slug.label' })}
              value={data.slug}
              disabled
              readOnly
              helperText={intl.formatMessage({ id: 'settings.general.slug.tooltip' })}
            />
            <SaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="settings.general.save" />}
            />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
