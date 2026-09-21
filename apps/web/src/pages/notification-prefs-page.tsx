// notification-prefs-page.tsx
// Per-type inApp/email channel toggles (006-04), saved as a partial nested
// PATCH (NFR < 300ms round-trip). Route: /notifications/preferences.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, ToggleSwitch } from '@plexica/ui';

import {
  useNotificationPreferences,
  useNotificationTypes,
  useSaveNotificationPreferences,
} from '../hooks/use-notification-prefs.js';
import { prefsHaveChanges, type PrefsDraft } from '../lib/notification-prefs.js';

import type { NotificationPreferences } from '../types/notification.js';

function usePrefsDraft(): {
  draft: PrefsDraft | null;
  loaded: PrefsDraft | null;
  setChannel: (key: string, channel: 'inApp' | 'email', checked: boolean) => void;
} {
  const { data: prefs } = useNotificationPreferences();
  const [draft, setDraft] = useState<PrefsDraft | null>(null);

  // Dirty-check baseline (B2): snapshot of the persisted prefs.
  const loaded: PrefsDraft | null = prefs === undefined ? null : buildDraft(prefs);

  // The draft is NEVER nulled on save (B2'): it stays mounted through the
  // post-save refetch, killing the loading flash (button disables again).
  useEffect(() => {
    if (prefs === undefined) return;
    setDraft((current) => current ?? buildDraft(prefs));
  }, [prefs]);

  function setChannel(key: string, channel: 'inApp' | 'email', checked: boolean): void {
    setDraft((current) => {
      if (current === null) return current;
      if (key === 'defaults') {
        return { ...current, defaults: { ...current.defaults, [channel]: checked } };
      }
      const type = current.types[key] ?? { ...current.defaults };
      return {
        ...current,
        types: { ...current.types, [key]: { ...type, [channel]: checked } },
      };
    });
  }

  return { draft, loaded, setChannel };
}

function buildDraft(prefs: NotificationPreferences): PrefsDraft {
  return {
    defaults: { ...prefs.defaults },
    types: Object.fromEntries(
      Object.entries(prefs.types).map(([key, channel]) => [key, { ...channel }])
    ),
  };
}

export function NotificationPrefsPage(): JSX.Element {
  const intl = useIntl();
  const { data: typesData, isPending, isError } = useNotificationTypes();
  const save = useSaveNotificationPreferences();
  const { draft, loaded, setChannel } = usePrefsDraft();
  // Local confirmation flag (B2'): set on save success — never read from the
  // mutation's isSuccess (which reset() wiped synchronously).
  const [justSaved, setJustSaved] = useState(false);

  if (isPending || draft === null) {
    return (
      <p className="p-6 text-sm text-neutral-500">
        <FormattedMessage id="notifications.prefs.loading" />
      </p>
    );
  }
  if (isError || typesData === undefined)
    return (
      <p className="p-6 text-sm text-red-600">
        <FormattedMessage id="notifications.prefs.error" />
      </p>
    );

  const typeDefinitions = typesData.types;
  // Real dirty flag (B2): enabled only while the draft differs from persisted.
  const hasChanges = loaded !== null && prefsHaveChanges(draft, loaded);

  function handleChannelChange(key: string, channel: 'inApp' | 'email', checked: boolean): void {
    setJustSaved(false);
    setChannel(key, channel, checked);
  }

  function handleSave(): void {
    if (draft === null) return;
    save.mutate(
      { defaults: draft.defaults, types: draft.types },
      { onSuccess: () => setJustSaved(true) }
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="notifications.prefs.title" />
      </h1>

      {/* Defaults — applies to any type without an explicit override. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          <FormattedMessage id="notifications.prefs.defaults.heading" />
        </h2>
        <div className="rounded-lg border border-neutral-200 p-4">
          <ToggleSwitch
            checked={draft.defaults.inApp}
            onCheckedChange={(checked) => handleChannelChange('defaults', 'inApp', checked)}
            label={intl.formatMessage({ id: 'notifications.prefs.channel.inApp' })}
          />
          <div className="h-3" />
          <ToggleSwitch
            checked={draft.defaults.email}
            onCheckedChange={(checked) => handleChannelChange('defaults', 'email', checked)}
            label={intl.formatMessage({ id: 'notifications.prefs.channel.email' })}
          />
        </div>
      </section>

      {/* Per-type overrides. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          <FormattedMessage id="notifications.prefs.types.heading" />
        </h2>
        {typeDefinitions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            <FormattedMessage id="notifications.prefs.types.empty" />
          </p>
        ) : (
          <div className="space-y-3">
            {typeDefinitions.map((definition) => {
              const channel = draft.types[definition.key] ?? draft.defaults;
              return (
                <div
                  key={definition.key}
                  data-testid={`prefs-type-${definition.key}`}
                  className="rounded-lg border border-neutral-200 p-4"
                >
                  <p className="text-sm font-medium text-neutral-900">
                    {intl.formatMessage({
                      id: definition.labelKey,
                      defaultMessage: definition.labelKey,
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">{definition.key}</p>
                  <div className="mt-3 space-y-2">
                    {definition.channels.includes('inApp') && (
                      <ToggleSwitch
                        checked={channel.inApp}
                        onCheckedChange={(checked) =>
                          handleChannelChange(definition.key, 'inApp', checked)
                        }
                        label={intl.formatMessage({ id: 'notifications.prefs.channel.inApp' })}
                      />
                    )}
                    {definition.channels.includes('email') && (
                      <ToggleSwitch
                        checked={channel.email}
                        onCheckedChange={(checked) =>
                          handleChannelChange(definition.key, 'email', checked)
                        }
                        label={intl.formatMessage({ id: 'notifications.prefs.channel.email' })}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={save.isPending}
          disabled={!hasChanges || save.isPending}
        >
          <FormattedMessage id="notifications.prefs.save" />
        </Button>
        {!hasChanges && justSaved && (
          <span className="text-sm text-emerald-600">
            <FormattedMessage id="notifications.prefs.saved" />
          </span>
        )}
      </div>
    </div>
  );
}
