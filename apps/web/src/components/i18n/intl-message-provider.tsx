// components/i18n/intl-message-provider.tsx
// Locale-driven IntlProvider (006-07). Derives `locale` + `messages` from the
// Zustand auth store and merges, in precedence order:
//   overrides > plugin bundles > core catalog   (006-10, D-8)
//
// Re-renders IN PLACE on locale switch — no page reload (NFR-006-3). Overrides
// come from TanStack Query (staleTime 10 min, shell boot fetch); plugin bundles
// arrive asynchronously via the plugin-message registry (useSyncExternalStore),
// so a bundle registering mid-session updates every consumer.

import { useMemo, useSyncExternalStore } from 'react';
import { IntlProvider } from 'react-intl';

import { useAuthStore } from '../../stores/auth-store.js';
import { resolveLocale, locales, SUPPORTED_LOCALES } from '../../i18n/locales.js';
import {
  getPluginMessages,
  getPluginMessagesVersion,
  subscribePluginMessages,
} from '../../i18n/plugin-message-registry.js';
import { useBootstrapLocaleSync } from '../../hooks/use-locale.js';
import { useTranslationOverrides } from '../../hooks/use-translations.js';
import { overridesForLocale } from '../../lib/translation-overrides.js';

import type { ReactNode } from 'react';
import type { TranslationLocale } from '../../services/translations-api.js';

const SERVER_SNAPSHOT = 0;

export function IntlMessageProvider({ children }: { children: ReactNode }): JSX.Element {
  const storeLocale = useAuthStore((state) => state.locale);
  const locale = resolveLocale(storeLocale);

  // Profile `language` is the source of truth — sync once at session start.
  useBootstrapLocaleSync();

  const { data: overrides } = useTranslationOverrides();

  // Numeric snapshot only (never the message map itself — a fresh object every
  // snapshot would re-render forever). The map is re-read inside useMemo.
  const pluginVersion = useSyncExternalStore(
    subscribePluginMessages,
    // getSnapshot must stay referentially stable for the same plugin state:
    // version sums loadedAt so a new bundle bumps it.
    () => getPluginMessagesVersion(locale),
    () => SERVER_SNAPSHOT
  );

  const messages = useMemo(() => {
    const pluginMessages = getPluginMessages(locale);
    const overrideMessages = overridesForLocale(overrides, locale as TranslationLocale);
    // Precedence: overrides > plugin > core. Spread order = last wins.
    return { ...locales[locale], ...pluginMessages, ...overrideMessages };
  }, [locale, pluginVersion, overrides]);

  const userLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';

  return (
    <IntlProvider locale={userLocale} defaultLocale="en" messages={messages}>
      {/* Fragment wrapper: our React 19 `ReactNode` type includes `bigint`,
          react-intl's IntlProvider children is typed against @types/react 18 —
          passing the value through a Fragment element bridges the boundary. */}
      <>{children}</>
    </IntlProvider>
  );
}