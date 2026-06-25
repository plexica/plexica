// tenant-branding-page.tsx
// Form to update tenant branding: logo, primary color, dark mode.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, FileUpload, ToggleSwitch } from '@plexica/ui';

import { useBranding, useUpdateBranding, useUploadLogo } from '../hooks/use-tenant-settings.js';
import { ColorPicker } from '../components/settings/color-picker.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

function BrandingSkeleton(): JSX.Element {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-28" />
      <div className="max-w-lg space-y-6">
        <SkeletonLoader variant="card" className="h-24" />
        <SkeletonLoader variant="card" className="h-10" />
        <SkeletonLoader variant="card" className="h-10" />
        <SkeletonLoader className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function TenantBrandingPage(): JSX.Element {
  const intl = useIntl();
  const { data, isPending, isError, refetch } = useBranding();
  const { mutate: updateBranding, isPending: isSaving } = useUpdateBranding();
  const { mutate: uploadLogo, isPending: isUploading } = useUploadLogo();

  const [primaryColor, setPrimaryColor] = useState('#0f172a');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (data !== undefined) {
      setPrimaryColor(data.primaryColor);
      setDarkMode(data.darkMode);
    }
  }, [data]);

  if (isPending) return <BrandingSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  function handleSave(): void {
    updateBranding({ primaryColor, darkMode });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="settings.branding.title" />
      </h1>

      <div className="max-w-lg space-y-6">
        <div>
          <p className="mb-1 text-sm font-medium text-neutral-700">
            <FormattedMessage id="settings.branding.logo.label" />
          </p>
          <FileUpload
            accept="image/*"
            maxSizeBytes={2 * 1024 * 1024}
            onFile={(f) => uploadLogo(f)}
            disabled={isUploading}
            {...(data.logoUrl !== null ? { preview: data.logoUrl } : {})}
          />
        </div>

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

        <Button onClick={handleSave} loading={isSaving}>
          <FormattedMessage id="settings.branding.save" />
        </Button>
      </div>
    </div>
  );
}
