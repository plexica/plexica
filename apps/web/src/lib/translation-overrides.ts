// lib/translation-overrides.ts
// Pure helpers turning the raw override list into the flat message map the
// IntlProvider merge consumes (006-10). Precedence at the shell boundary:
// overrides > plugin > core — override keys must therefore NOT be filtered by
// whether they also exist in the core catalog (they may also override plugin
// bundle keys).

import type { TranslationOverrideList, TranslationLocale } from '../services/translations-api.js';

/** Flattens the overrides object for one locale: `{ key: value }`. */
export function overridesForLocale(
  data: TranslationOverrideList | undefined,
  locale: TranslationLocale
): Record<string, string> {
  if (data === undefined) return {};
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(data.overrides)) {
    const value = values[locale];
    if (typeof value === 'string' && value.length > 0) result[key] = value;
  }
  return result;
}

/** The distinct keys carrying at least one locale override, sorted. */
export function overrideKeys(data: TranslationOverrideList | undefined): string[] {
  if (data === undefined) return [];
  return Object.keys(data.overrides).sort();
}

/** The override value for `key`+`locale`, or undefined when absent. */
export function overrideValue(
  data: TranslationOverrideList | undefined,
  key: string,
  locale: TranslationLocale
): string | undefined {
  return data?.overrides[key]?.[locale];
}