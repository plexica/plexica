// profile-page.tsx
// User profile page: avatar upload + profile form.
// Settings Panel pattern: two sections, isDirty indicator, save feedback.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, FileUpload } from '@plexica/ui';

import { useProfile, useUpdateProfile, useUploadAvatar } from '../hooks/use-profile.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

const schema = z.object({
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1),
  language: z.string().min(2).max(10),
});
type FormValues = z.infer<typeof schema>;

function ProfileSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-24" />
      <SkeletonLoader variant="card" className="h-28" />
      <SkeletonLoader variant="card" className="h-44" />
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useProfile();
  const { mutate: updateProfile, isPending: isSaving } = useUpdateProfile();
  const { mutate: uploadAvatar, isPending: isUploading } = useUploadAvatar();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { displayName: '', timezone: 'UTC', language: 'en' },
    });

  useEffect(() => {
    if (data !== undefined) {
      reset({ displayName: data.displayName ?? '', timezone: data.timezone, language: data.language });
    }
  }, [data, reset]);

  if (isPending) return <ProfileSkeleton />;
  if (isError || data === undefined) {
    return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;
  }

  function onSubmit(values: FormValues): void {
    updateProfile(values, {
      onSuccess: () => {
        reset(values); markSaved();
      },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="profile.title" />
      </h1>

      <div className="max-w-2xl space-y-4">
        {/* Avatar — independent upload section */}
        <SettingsSection
          title={<FormattedMessage id="profile.avatar.label" />}
          description={<FormattedMessage id="profile.avatar.description" />}
        >
          <FileUpload
            accept="image/*"
            maxSizeBytes={2 * 1024 * 1024}
            onFile={(f) => uploadAvatar(f)}
            disabled={isUploading}
            {...(data.avatarUrl !== null ? { preview: data.avatarUrl } : {})}
          />
        </SettingsSection>

        {/* Profile form — name, timezone, language */}
        <SettingsSection
          title={<FormattedMessage id="profile.title" />}
          description={<FormattedMessage id="profile.displayName.label" />}
        >
          <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-4" noValidate>
            <Input
              label={intl.formatMessage({ id: 'profile.displayName.label' })}
              {...register('displayName')}
              {...(errors.displayName?.message !== undefined ? { error: errors.displayName.message } : {})}
            />
            <Input
              label={intl.formatMessage({ id: 'profile.timezone.label' })}
              {...register('timezone')}
              {...(errors.timezone?.message !== undefined ? { error: errors.timezone.message } : {})}
            />
            <Input
              label={intl.formatMessage({ id: 'profile.language.label' })}
              {...register('language')}
              {...(errors.language?.message !== undefined ? { error: errors.language.message } : {})}
            />
            <SaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="profile.save" />}
            />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
