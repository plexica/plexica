// tenant-branding-page.tsx
// Form to update tenant branding: logo, primary color, dark mode.
// Settings Panel pattern: two sections (Logo, Appearance), manual dirty tracking.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { FileUpload, ToggleSwitch } from '@plexica/ui';

import { useBranding, useUpdateBranding, useUploadLogo } from '../hooks/use-tenant-settings.js';
import { LOGO_UPLOAD } from '../services/settings-api.js';
import {
  acceptAttribute,
  megabytes,
  mimeTypeLabels,
  uploadErrorMessageId,
} from '../i18n/upload-messages.js';
import { ColorPicker } from '../components/settings/color-picker.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';

function BrandingSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-28" />
      <SkeletonLoader variant="card" className="h-36" />
      <SkeletonLoader variant="card" className="h-36" />
    </div>
  );
}

export function TenantBrandingPage(): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useBranding();
  const { mutate: updateBranding, isPending: isSaving } = useUpdateBranding();
  const {
    mutate: uploadLogo,
    isPending: isUploading,
    isError: isUploadError,
    error: uploadError,
  } = useUploadLogo();

  const [primaryColor, setPrimaryColor] = useState('#0f172a');
  const [darkMode, setDarkMode] = useState(false);
  // Bumped on every failed upload. Remounting FileUpload discards the optimistic
  // `blob:` preview, so a failed upload no longer looks like a successful one.
  const [uploadAttempt, setUploadAttempt] = useState(0);

  useEffect(() => {
    if (data !== undefined) {
      setPrimaryColor(data.primaryColor);
      setDarkMode(data.darkMode);
    }
  }, [data]);

  // Upload constraints and copy both derive from LOGO_UPLOAD — one source.
  const uploadValues = {
    maxMb: megabytes(LOGO_UPLOAD.maxBytes),
    formats: intl.formatList(mimeTypeLabels(LOGO_UPLOAD.mimeTypes), { type: 'disjunction' }),
  };

  if (isPending) return <BrandingSkeleton />;
  if (isError || data === undefined) {
    return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;
  }

  // Manual dirty tracking — branding uses controlled state, not RHF
  const isDirty = primaryColor !== data.primaryColor || darkMode !== data.darkMode;

  function handleSave(): void {
    updateBranding({ primaryColor, darkMode }, {
      onSuccess: () => { markSaved(); },
    });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.branding.title" />
      </h1>

      <div className="max-w-2xl space-y-4">
        {/* Logo section — independent upload, no dirty tracking */}
        <SettingsSection
          title={<FormattedMessage id="settings.branding.logo.label" />}
          description={
            <FormattedMessage id="settings.branding.logo.description" values={uploadValues} />
          }
        >
          <FileUpload
            key={uploadAttempt}
            accept={acceptAttribute(LOGO_UPLOAD.mimeTypes)}
            maxSizeBytes={LOGO_UPLOAD.maxBytes}
            onFile={(f) => {
              uploadLogo(f, { onError: () => { setUploadAttempt((n) => n + 1); } });
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
            {...(data.logoUrl !== null ? { preview: data.logoUrl } : {})}
          />
        </SettingsSection>

        {/* Appearance section — color + dark mode with save */}
        <SettingsSection
          title={<FormattedMessage id="settings.branding.appearance.title" />}
          description={<FormattedMessage id="settings.branding.appearance.description" />}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="space-y-6"
          >
            <ColorPicker
              label={intl.formatMessage({ id: 'settings.branding.primaryColor.label' })}
              value={primaryColor}
              onChange={setPrimaryColor}
            />
            <ToggleSwitch
              label={intl.formatMessage({ id: 'settings.branding.darkMode.label' })}
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
            <SaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="settings.branding.save" />}
            />
          </form>
        </SettingsSection>
      </div>
    </div>
  );
}
