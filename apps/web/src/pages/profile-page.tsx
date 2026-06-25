// profile-page.tsx
// User profile page: avatar upload + profile form with Select for timezone/language.
// Settings Panel pattern: two sections, isDirty indicator, save feedback.

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, FileUpload, Select } from '@plexica/ui';

import { useProfile, useUpdateProfile, useUploadAvatar } from '../hooks/use-profile.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

// Curated IANA timezone list (most common zones)
const TIMEZONE_OPTIONS = [
  'UTC', 'Europe/London', 'Europe/Rome', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Stockholm',
  'Europe/Warsaw', 'Europe/Athens', 'Europe/Helsinki', 'Europe/Lisbon',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'America/Mexico_City', 'America/Bogota', 'America/Lima',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
].map((tz) => ({ value: tz, label: tz.replace('_', ' ') }));

// Curated supported language codes
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
  { value: 'ar', label: 'العربية' },
];

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
      <SkeletonLoader variant="card" className="h-52" />
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useProfile();
  const { mutate: updateProfile, isPending: isSaving } = useUpdateProfile();
  const { mutate: uploadAvatar, isPending: isUploading } = useUploadAvatar();

  const { register, handleSubmit, reset, control, formState: { errors, isDirty } } =
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
    updateProfile(values, { onSuccess: () => { reset(values); markSaved(); } });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="profile.title" />
      </h1>

      <div className="max-w-2xl space-y-4">
        {/* Avatar — independent upload */}
        <SettingsSection
          title={<FormattedMessage id="profile.avatar.label" />}
          description={<FormattedMessage id="profile.avatar.description" />}
        >
          <FileUpload
            accept="image/*" maxSizeBytes={2 * 1024 * 1024}
            onFile={(f) => uploadAvatar(f)} disabled={isUploading}
            {...(data.avatarUrl !== null ? { preview: data.avatarUrl } : {})}
          />
        </SettingsSection>

        {/* Profile form */}
        <SettingsSection title={<FormattedMessage id="profile.title" />}>
          <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="space-y-4" noValidate>
            <Input
              label={intl.formatMessage({ id: 'profile.displayName.label' })}
              {...register('displayName')}
              {...(errors.displayName?.message !== undefined ? { error: errors.displayName.message } : {})}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="profile.timezone.label" />
              </label>
              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <Select
                    options={TIMEZONE_OPTIONS}
                    value={field.value}
                    onValueChange={(v) => field.onChange(v)}
                    aria-label={intl.formatMessage({ id: 'profile.timezone.label' })}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="profile.language.label" />
              </label>
              <Controller
                name="language"
                control={control}
                render={({ field }) => (
                  <Select
                    options={LANGUAGE_OPTIONS}
                    value={field.value}
                    onValueChange={(v) => field.onChange(v)}
                    aria-label={intl.formatMessage({ id: 'profile.language.label' })}
                  />
                )}
              />
            </div>
            <SaveBar isDirty={isDirty} isSaving={isSaving} saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="profile.save" />} />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
