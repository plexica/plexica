// profile-page.tsx
// User profile page: display name, timezone, language, avatar upload.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Input, FileUpload } from '@plexica/ui';

import { useProfile, useUpdateProfile, useUploadAvatar } from '../hooks/use-profile.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

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
      <div className="max-w-lg space-y-6">
        <SkeletonLoader variant="card" className="h-24 w-24 rounded-lg" />
        <div className="space-y-4">
          <SkeletonLoader variant="card" className="h-10" />
          <SkeletonLoader variant="card" className="h-10" />
          <SkeletonLoader variant="card" className="h-10" />
          <SkeletonLoader className="h-9 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError, refetch } = useProfile();
  const { mutate: updateProfile, isPending: isSaving } = useUpdateProfile();
  const { mutate: uploadAvatar, isPending: isUploading } = useUploadAvatar();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', timezone: 'UTC', language: 'en' },
  });

  useEffect(() => {
    if (data !== undefined) {
      reset({
        displayName: data.displayName ?? '',
        timezone: data.timezone,
        language: data.language,
      });
    }
  }, [data, reset]);

  if (isPending) return <ProfileSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const profile = data;

  function onSubmit(values: FormValues): void {
    updateProfile(values);
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="profile.title" />
      </h1>

      <div className="max-w-lg space-y-6">
        <div>
          <p className="mb-1 text-sm font-medium text-neutral-700">
            <FormattedMessage id="profile.avatar.label" />
          </p>
          <FileUpload
            accept="image/*"
            maxSizeBytes={2 * 1024 * 1024}
            onFile={(f) => uploadAvatar(f)}
            disabled={isUploading}
            {...(profile.avatarUrl !== null ? { preview: profile.avatarUrl } : {})}
          />
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <Input
            label={intl.formatMessage({ id: 'profile.displayName.label' })}
            {...register('displayName')}
            {...(errors.displayName?.message !== undefined
              ? { error: errors.displayName.message }
              : {})}
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

          <Button type="submit" loading={isSaving}>
            <FormattedMessage id="profile.save" />
          </Button>
        </form>
      </div>
    </div>
  );
}
