// pages/translations-admin-page.tsx
// Tenant translation overrides admin page (006-10).
// Lists every override for the tenant with per-locale editors. Editing is
// tenant-admin only (server-side ABAC `settings:update` — the page is a UI
// hint via useAbac, never a security boundary). Precedence in the shell:
// overrides > plugin > core.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '@plexica/ui';

import { useAbac } from '../hooks/use-abac.js';
import { useTranslationOverrides, useUpsertTranslation } from '../hooks/use-translations.js';
import { overrideKeys, overrideValue } from '../lib/translation-overrides.js';
import { OverrideEditorRow } from '../components/translations/override-editor-row.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

import type { TranslationLocale } from '../services/translations-api.js';

const addSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/, 'translations.key.invalid'),
});
type AddValues = z.infer<typeof addSchema>;

function TranslationsSkeleton(): JSX.Element {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">
        <FormattedMessage id="translations.loading" />
      </span>
      <SkeletonLoader className="h-8 w-48" />
      <SkeletonLoader variant="card" className="h-24" />
    </div>
  );
}

export function TranslationsAdminPage(): JSX.Element {
  const intl = useIntl();
  const isAdmin = useAbac();
  const { data, isPending, isError, refetch } = useTranslationOverrides();
  const upsert = useUpsertTranslation();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  function showFeedback(message: string, isError = false): void {
    setFeedback(message);
    setFeedbackIsError(isError);
  }
  // Local draft keys added by the admin but not yet persisted with a real
  // value — creating a row happens on first Save (empty value = revert, so
  // the draft must NOT hit the API until it has content).
  const [draftKeys, setDraftKeys] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
  });

  if (isPending) return <TranslationsSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const persistedKeys = overrideKeys(data);
  const keys = [...persistedKeys, ...draftKeys.filter((key) => !persistedKeys.includes(key))];

  function handleSave(keyName: string, locale: TranslationLocale, value: string): void {
    upsert.mutate(
      { key: keyName, payload: { locale, value } },
      {
        onSuccess: () => {
          showFeedback(
            intl.formatMessage({
              id: value === '' ? 'translations.reverted' : 'translations.saved',
            })
          );
          setDraftKeys((current) => current.filter((key) => key !== keyName));
        },
        onError: () => {
          // A failed PUT must not be silent: surface it through the same
          // feedback slot as success (localized — session-006 review Major 3).
          showFeedback(intl.formatMessage({ id: 'translations.error' }), true);
        },
      }
    );
  }

  function onSubmit(values: AddValues): void {
    // Client-side draft row only — it becomes a real override on first Save
    // with a non-empty value.
    setFeedback(null);
    setFeedbackIsError(false);
    reset();
    setDraftKeys((current) => (current.includes(values.key) ? current : [...current, values.key]));
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="translations.title" />
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          <FormattedMessage id="translations.description" />
        </p>
      </div>

      {feedback !== null && (
        <p
          className={feedbackIsError ? 'text-sm text-rose-600' : 'text-sm text-emerald-600'}
          data-testid="translations-feedback"
        >
          {feedback}
        </p>
      )}

      {isAdmin && (
        <section className="max-w-xl rounded-lg border border-neutral-200 p-4">
          <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2" noValidate>
            <div className="flex-1">
              <Input
                label={intl.formatMessage({ id: 'translations.key.label' })}
                {...(errors.key !== undefined
                  ? { error: intl.formatMessage({ id: 'translations.key.invalid' }) }
                  : {})}
                {...register('key')}
              />
            </div>
            <Button variant="outline" size="sm" type="submit" loading={upsert.isPending}>
              <FormattedMessage id="translations.add" />
            </Button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          <FormattedMessage id="translations.overrides.heading" />
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-neutral-500">
            <FormattedMessage id="translations.empty" />
          </p>
        ) : (
          keys.map((keyName) => (
            <OverrideEditorRow
              key={keyName}
              keyName={keyName}
              values={{
                en: overrideValue(data, keyName, 'en'),
                it: overrideValue(data, keyName, 'it'),
              }}
              isAdmin={isAdmin}
              isSaving={upsert.isPending}
              onSave={(locale, value) => handleSave(keyName, locale, value)}
            />
          ))
        )}
      </section>
    </div>
  );
}
