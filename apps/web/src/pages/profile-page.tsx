// profile-page.tsx
// User profile page: avatar upload + profile form + sessions + password card.
// Settings Panel pattern: sections with save feedback. The profile form lives
// in components/profile/profile-form.tsx (Constitution Rule 4).

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { FileUpload } from '@plexica/ui';

import { useProfile, useUploadAvatar } from '../hooks/use-profile.js';
import { AVATAR_UPLOAD } from '../services/profile-api.js';
import {
  acceptAttribute,
  megabytes,
  mimeTypeLabels,
  uploadErrorMessageId,
} from '../i18n/upload-messages.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { AvatarHeader } from '../components/profile/avatar-header.js';
import { PasswordCard } from '../components/profile/password-card.js';
import { ProfileForm } from '../components/profile/profile-form.js';
import { SessionsCard } from '../components/profile/sessions-card.js';
import { SettingsSection } from '../components/settings/settings-section.js';

function ProfileSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">
        <FormattedMessage id="skeleton.loading" />
      </span>
      <SkeletonLoader className="h-8 w-24" />
      <SkeletonLoader variant="card" className="h-28" />
      <SkeletonLoader variant="card" className="h-52" />
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError, refetch } = useProfile();
  const {
    mutate: uploadAvatar,
    isPending: isUploading,
    isError: isUploadError,
    error: uploadError,
  } = useUploadAvatar();

  // Bumped on every failed upload. Remounting FileUpload discards the optimistic
  // `blob:` preview, so a failed upload no longer looks like a successful one.
  const [uploadAttempt, setUploadAttempt] = useState(0);

  // Constraints AND copy both derive from AVATAR_UPLOAD — one source of truth.
  const uploadValues = {
    maxMb: megabytes(AVATAR_UPLOAD.maxBytes),
    formats: intl.formatList(mimeTypeLabels(AVATAR_UPLOAD.mimeTypes), { type: 'disjunction' }),
  };

  if (isPending) return <ProfileSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="profile.title" />
      </h1>

      <div className="max-w-2xl space-y-4">
        {/* Identity — Keycloak picture claim wins (006-12) */}
        <AvatarHeader profile={data} />

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
              uploadAvatar(f, {
                onError: () => {
                  setUploadAttempt((n) => n + 1);
                },
              });
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

        {/* Profile form — mounts once loaded, so defaults never need a reset */}
        <ProfileForm
          initial={{
            displayName: data.displayName ?? '',
            email: data.email,
            timezone: data.timezone || 'UTC',
            language: data.language || 'en',
          }}
        />

        {/* Sessions (006-13) + password via Keycloak console (006-14) */}
        <SessionsCard />
        <PasswordCard accountUrl={data.keycloakAccountUrl} />
      </div>
    </div>
  );
}
