// locales.ts
// Locale registry for the tenant web app (006-06).
// Exports the EN+IT catalogs plus the `MessageCatalog` type used to enforce
// key parity between locales — a key missing from one catalog is a type error
// wherever `MessageCatalog`-typed values are assigned (e.g. IntlProvider).
//
// EN remains the DEFAULT fallback via react-intl `defaultMessage` (spec risk
// "Missing i18n keys at runtime → fallback to English default").

import { messages } from './messages.en.js';
import { messagesIt } from './messages.it.js';

/**
 * Supported UI locales. Stored on the profile (`user_profile.language`,
 * ISO 639-1) and mirrored in the auth store (`locale`).
 */
export const SUPPORTED_LOCALES = ['en', 'it'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

/** Registry: static core catalogs keyed by locale code. */
export const locales: Record<LocaleCode, Record<string, string>> = {
  en: messages,
  it: messagesIt,
};

/**
 * Message catalog type — every entry is `{ [key]: string }`. Both catalogs
 * satisfy it, so swapping `en`/`it` keeps the exact same key set at compile
 * time (the runtime parity check lives in __tests__/i18n-keys.test.ts).
 */
export type MessageCatalog = (typeof locales)[LocaleCode];

/** True when a stored profile `language` value maps to a supported UI locale. */
export function isSupportedLocale(value: string | undefined): value is LocaleCode {
  return SUPPORTED_LOCALES.includes(value as LocaleCode);
}

/** Active locale with unknown values falling back to the default. */
export function resolveLocale(value: string | undefined | null): LocaleCode {
  return isSupportedLocale(value ?? undefined) ? (value as LocaleCode) : 'en';
}