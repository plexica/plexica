// profile-form.tsx
// Profile details form (006-11): display name, email, timezone, language.
// Extracted from profile-page.tsx (Constitution Rule 4 — no file above 200
// lines). Self-contained TanStack Query mutation — the page mounts it only
// after the profile has loaded, so `defaultValues` never needs a reset dance
// (background refetches must not undo in-progress edits). All strings via
// react-intl; validation failures map to localized messages, never raw Zod.

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input, Select } from '@plexica/ui';

import { useUpdateProfile } from '../../hooks/use-profile.js';
import { languageOptions, timezoneOptions } from '../../i18n/profile-options.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../settings/settings-section.js';

import type { SelectOption } from '../../i18n/profile-options.js';
import type { UpdateProfilePayload } from '../../types/profile.js';
import type { Control } from 'react-hook-form';
import type { IntlShape } from 'react-intl';

const schema = z.object({
  // Auto-provisioned profiles arrive with '' displayName/email
  // (profile-page.tsx maps null → ''). Empty means "no change" — the submit
  // payload omits it — so it must pass validation, while a non-empty value
  // is still format-checked.
  displayName: z.string().max(120),
  email: z.union([z.literal(''), z.string().email().max(255)]),
  timezone: z.string().min(1),
  language: z.string().min(2).max(10),
});
type FormValues = z.infer<typeof schema>;

/** Values the page forwards from the loaded profile — applied once at mount. */
export interface ProfileFormInitial {
  displayName: string;
  email: string;
  timezone: string;
  language: string;
}

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

export function ProfileForm({ initial }: { initial: ProfileFormInitial }): JSX.Element {
  const intl = useIntl();
  const { saveStatus, markSaved } = useSaveStatus();
  const { mutate: updateProfile, isPending: isSaving, isError: isSaveError } = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial });

  function onSubmit(values: FormValues): void {
    // PATCH carries only fields changed in this submission: sending the whole
    // mount-time snapshot would resubmit a stale email after another tab
    // edited it first, and the backend would sync that stale value back to
    // Keycloak. Empty strings mean "no change" (auto-provisioned profile)
    // and are omitted, so they never trigger the Keycloak email sync.
    const payload: UpdateProfilePayload = {};
    if (dirtyFields.displayName === true && values.displayName !== '') {
      payload.displayName = values.displayName;
    }
    if (dirtyFields.email === true && values.email !== '') {
      payload.email = values.email;
    }
    if (dirtyFields.timezone === true) payload.timezone = values.timezone;
    if (dirtyFields.language === true) payload.language = values.language;

    // Reachable when the only edits collapsed to empty (e.g. a name edit
    // cleared back to ''): nothing to send, so treat the form as saved.
    if (Object.keys(payload).length === 0) {
      reset(values);
      markSaved();
      return;
    }

    updateProfile(payload, {
      onSuccess: () => {
        reset(values);
        markSaved();
      },
    });
  }

  return (
    <SettingsSection title={<FormattedMessage id="profile.title" />}>
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
          {...(errors.displayName !== undefined
            ? { error: intl.formatMessage({ id: 'profile.displayName.error' }) }
            : {})}
        />
        <Input
          label={intl.formatMessage({ id: 'profile.email.label' })}
          type="email"
          {...register('email')}
          {...(errors.email !== undefined
            ? { error: intl.formatMessage({ id: 'profile.email.error' }) }
            : {})}
        />
        {selectField(
          intl,
          control,
          'timezone',
          'profile.timezone.label',
          timezoneOptions(initial.timezone)
        )}
        {selectField(
          intl,
          control,
          'language',
          'profile.language.label',
          languageOptions(initial.language)
        )}
        <SaveBar
          isDirty={isDirty}
          isSaving={isSaving}
          saveStatus={saveStatus}
          saveLabel={<FormattedMessage id="profile.save" />}
        />
        {/* Failed saves stay on the form for correction — the mutation error
            is localized, never raw. */}
        {isSaveError && (
          <p className="text-sm text-red-600" role="alert">
            <FormattedMessage id="profile.save.error" />
          </p>
        )}
      </form>
    </SettingsSection>
  );
}
