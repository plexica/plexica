// hooks/use-formatter.ts
// React binding of the lib/format helpers (006-08): locale from the auth store,
// timezone from the profile query. Kept OUT of lib/format.ts so the pure
// functions stay importable by unit tests without the auth stack.

import { useAuthStore } from '../stores/auth-store.js';
import { resolveLocale } from '../i18n/locales.js';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  safeTimezone,
  type FormatDateOptions,
  type FormatNumberOptions,
} from '../lib/format.js';

import { useProfile } from './use-profile.js';

export interface Formatter {
  formatDate: (iso: string, options?: FormatDateOptions) => string;
  formatDateTime: (iso: string, options?: FormatDateOptions) => string;
  formatNumber: (value: number, options?: FormatNumberOptions) => string;
  formatCurrency: (value: number, currency: string, options?: FormatNumberOptions) => string;
}

/** Formatters bound to the active app state (006-08). */
export function useFormatter(): Formatter {
  const locale = useAuthStore((state) => state.locale);
  const { data: profile } = useProfile();

  const context = {
    locale: resolveLocale(locale),
    timezone: safeTimezone(profile?.timezone),
  };

  return {
    formatDate: (iso, options) => formatDate(iso, context, options),
    formatDateTime: (iso, options) => formatDateTime(iso, context, options),
    formatNumber: (value, options) => formatNumber(value, context.locale, options),
    formatCurrency: (value, currency, options) =>
      formatCurrency(value, currency, context.locale, options),
  };
}
