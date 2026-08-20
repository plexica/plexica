// profile-page.tsx
// User profile page: avatar upload + profile form with Select for timezone/language.
// Settings Panel pattern: two sections, isDirty indicator, save feedback.

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, FileUpload, Select } from '@plexica/ui';

import { useProfile, useUpdateProfile, useUploadAvatar } from '../hooks/use-profile.js';
import { AVATAR_UPLOAD } from '../services/profile-api.js';
import { languageOptions, timezoneOptions } from '../i18n/profile-options.js';
import {
  acceptAttribute,
  megabytes,
  mimeTypeLabels,
  uploadErrorMessageId,
} from '../i18n/upload-messages.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

import type { SelectOption } from '../i18n/profile-options.js';
import type { Control } from 'react-hook-form';
import type { IntlShape } from 'react-intl';

const schema = z.object({
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1),
  language: z.string().min(2).max(10),
});
type FormValues = z.infer<typeof schema>;

/** Labelled Select bound to the form — shared by timezone and language. */
function selectField(
  intl: IntlShape,
  control: Control<FormValues>,
  name: 'timezone' | 'language',
  labelId: string,
  options: SelectOption[]
): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-700">
        <FormattedMessage id={labelId} />
      </label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            options={options}
            value={field.value}
            onValueChange={(v) => field.onChange(v)}
            placeholder={intl.formatMessage({ id: 'common.select.placeholder' })}
            aria-label={intl.formatMessage({ id: labelId })}
          />
        )}
      />
    </div>
  );
}

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
  const {
    mutate: uploadAvatar,
    isPending: isUploading,
    isError: isUploadError,
    error: uploadError,
  } = useUploadAvatar();

  // Bumped on every failed upload. Remounting FileUpload discards the optimistic
  // `blob:` preview, so a failed upload no longer looks like a successful one.
  const [uploadAttempt, setUploadAttempt] = useState(0);

  const { register, handleSubmit, reset, control, formState: { errors, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { displayName: '', timezone: 'UTC', language: 'en' },
    });

  // Only reset the form on initial data load — NOT on background refetches,
  // which would undo any in-progress user edits and disable the Save button.
  const initialized = useRef(false);
  useEffect(() => {
    if (data !== undefined && !initialized.current) {
      reset({
        displayName: data.displayName ?? '',
        timezone: data.timezone || 'UTC',
        language: data.language || 'en',
      });
      initialized.current = true;
    }
  }, [data, reset]);

  // Constraints AND copy both derive from AVATAR_UPLOAD — one source of truth.
  const uploadValues = {
    maxMb: megabytes(AVATAR_UPLOAD.maxBytes),
    formats: intl.formatList(mimeTypeLabels(AVATAR_UPLOAD.mimeTypes), { type: 'disjunction' }),
  };

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
          description={<FormattedMessage id="profile.avatar.description" values={uploadValues} />}
        >
          <FileUpload
            key={uploadAttempt}
            accept={acceptAttribute(AVATAR_UPLOAD.mimeTypes)}
            maxSizeBytes={AVATAR_UPLOAD.maxBytes}
            onFile={(f) => {
              uploadAvatar(f, { onError: () => { setUploadAttempt((n) => n + 1); } });
            }}
            disabled={isUploading}
            {...(isUploadError
              ? {
                  error: intl.formatMessage(
                    { id: uploadErrorMessageId(uploadError) },
                    uploadValues
                  ),
                }
              : {})}
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
            {selectField(intl, control, 'timezone', 'profile.timezone.label', timezoneOptions(data.timezone))}
            {selectField(intl, control, 'language', 'profile.language.label', languageOptions(data.language))}
            <SaveBar isDirty={isDirty} isSaving={isSaving} saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="profile.save" />} />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
