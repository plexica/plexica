// lib/format.ts
// Locale-aware date/number/currency formatting (006-08).
//
// Built on `Intl.DateTimeFormat` / `Intl.NumberFormat` — no new dependency.
// Every helper takes an explicit `locale` + `timezone` so pure call sites
// (lib code, tests) stay framework-free; components use `use-formatter` which
// binds the active auth-store locale + the profile timezone automatically.
//
// This module intentionally has NO React/react-intl import — react-intl's
// FormattedDate/FormattedNumber remain available for inline JSX.

/** Date/number locale + timezone context. */
export interface FormatContext {
  locale: string;
  timezone: string;
}

const DEFAULT_TIMEZONE = 'UTC';

/** Validates a timezone against Intl; invalid/empty values fall back to UTC. */
export function safeTimezone(value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return DEFAULT_TIMEZONE;
  // Intl throws RangeError on unknown timezones — a bad stored value must fall
  // back to UTC rather than crash the render.
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export type FormatDateOptions = Intl.DateTimeFormatOptions;
export type FormatNumberOptions = Intl.NumberFormatOptions;

/**
 * Formats an ISO timestamp as a locale-aware date+time in the user's timezone.
 * Falls back to the raw string when the value is not a parseable date
 * (e.g. legacy empty buckets) so a corrupt row never crashes the table.
 */
export function formatDateTime(
  iso: string,
  context: FormatContext,
  options: FormatDateOptions = {}
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatter = new Intl.DateTimeFormat(context.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: safeTimezone(context.timezone),
    ...options,
  });
  return formatter.format(date);
}

/** Locale-aware date without the time component. */
export function formatDate(
  iso: string,
  context: FormatContext,
  options: FormatDateOptions = {}
): string {
  return formatDateTime(iso, context, { ...options, hour: undefined, minute: undefined });
}

/** Locale-aware number (grouping, decimals). */
export function formatNumber(
  value: number,
  locale: string,
  options: FormatNumberOptions = {}
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Locale-aware currency. */
export function formatCurrency(
  value: number,
  currency: string,
  locale: string,
  options: FormatNumberOptions = {}
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, ...options }).format(value);
}
