// components/translations/override-editor-row.tsx
// One override row in the translations admin page: shows both locale values,
// lets an admin edit a single locale value and saves (upsert) or reverts
// (empty value → server deletes the row). Read-only when not admin.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@plexica/ui';

import type { TranslationLocale } from '../../services/translations-api.js';

interface OverrideEditorRowProps {
  keyName: string;
  values: Partial<Record<TranslationLocale, string | undefined>>;
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (locale: TranslationLocale, value: string) => void;
}

function LocaleEditor({
  locale,
  value,
  isAdmin,
  isSaving,
  onSave,
}: {
  locale: TranslationLocale;
  value: string;
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (locale: TranslationLocale, value: string) => void;
}): JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState(value);

  // Re-sync the draft whenever the server value changes (e.g. a revert empties
  // the row or a refetch lands a saved value) — otherwise the input keeps a
  // stale snapshot after revert (session-006 review Major 3).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="flex items-center gap-2" data-testid={`override-value-${locale}`}>
      <span className="w-14 shrink-0 text-xs font-medium uppercase text-neutral-400">
        {intl.formatMessage({ id: `translations.locale.${locale}` })}
      </span>
      <input
        type="text"
        value={draft}
        disabled={!isAdmin}
        aria-label={intl.formatMessage(
          { id: 'translations.value.label' },
          { locale: intl.formatMessage({ id: `translations.locale.${locale}` }) }
        )}
        onChange={(e) => setDraft(e.target.value)}
        className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-neutral-50"
      />
      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            loading={isSaving}
            disabled={draft === value || isSaving}
            onClick={() => onSave(locale, draft)}
          >
            <FormattedMessage id="translations.save" />
          </Button>
          {value !== '' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={() => onSave(locale, '')}
            >
              <FormattedMessage id="translations.revert" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function OverrideEditorRow({
  keyName,
  values,
  isAdmin,
  isSaving,
  onSave,
}: OverrideEditorRowProps): JSX.Element {
  return (
    <div
      className="rounded-lg border border-neutral-200 p-4"
      data-testid={`override-row-${keyName}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">
          {keyName}
        </code>
        {!isAdmin && (
          <span className="text-xs text-neutral-400">
            <FormattedMessage id="translations.notAdmin" />
          </span>
        )}
      </div>
      <div className="space-y-2">
        <LocaleEditor
          locale="en"
          value={values.en ?? ''}
          isAdmin={isAdmin}
          isSaving={isSaving}
          onSave={onSave}
        />
        <LocaleEditor
          locale="it"
          value={values.it ?? ''}
          isAdmin={isAdmin}
          isSaving={isSaving}
          onSave={onSave}
        />
      </div>
    </div>
  );
}
