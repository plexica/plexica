/**
 * Locale resolution utilities with fallback chain logic.
 *
 * Resolves user locale from multiple sources with priority-based fallback.
 */

import type { LocaleResolutionOptions } from './types.js';

/**
 * BCP 47 locale code validation regex.
 *
 * Matches:
 * - Language only: "en", "it", "fr"
 * - Language + region: "en-US", "it-IT", "fr-FR"
 * - Language + script + region: "zh-Hans-CN"
 *
 * @see https://tools.ietf.org/html/bcp47
 */
const BCP47_REGEX = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/**
 * Validate locale code format (BCP 47).
 *
 * @param locale - Locale code to validate
 * @returns True if valid BCP 47 format
 *
 * @example
 * ```typescript
 * isValidLocale('en');       // true
 * isValidLocale('it-IT');    // true
 * isValidLocale('zh-Hans-CN'); // true
 * isValidLocale('invalid');  // false
 * isValidLocale('en_US');    // false (underscore not allowed)
 * ```
 */
export function isValidLocale(locale: string): boolean {
  return BCP47_REGEX.test(locale);
}

/**
 * Resolve user locale from fallback chain.
 *
 * Priority order:
 * 1. Browser locale (from Accept-Language header or navigator.language)
 * 2. User preference (from user profile)
 * 3. Tenant default locale (from Tenant.default_locale)
 * 4. System default ("en")
 *
 * Invalid locale codes are skipped and fallback continues.
 *
 * @param options - Locale resolution options
 * @returns Resolved locale code (guaranteed to return a value, defaulting to "en")
 *
 * @example
 * ```typescript
 * // Browser locale takes priority
 * resolveLocale({
 *   browserLocale: 'it-IT',
 *   userLocale: 'en',
 *   tenantDefaultLocale: 'fr'
 * });
 * // Result: "it-IT"
 *
 * // Fallback to user preference
 * resolveLocale({
 *   browserLocale: undefined,
 *   userLocale: 'en',
 *   tenantDefaultLocale: 'fr'
 * });
 * // Result: "en"
 *
 * // Fallback to system default
 * resolveLocale({});
 * // Result: "en"
 *
 * // Invalid locale skipped
 * resolveLocale({
 *   browserLocale: 'invalid_locale',
 *   tenantDefaultLocale: 'fr'
 * });
 * // Result: "fr"
 * ```
 */
export function resolveLocale(options: LocaleResolutionOptions): string {
  const { browserLocale, userLocale, tenantDefaultLocale } = options;

  // Try browser locale first
  if (browserLocale && isValidLocale(browserLocale)) {
    return browserLocale;
  }

  // Try user preference second
  if (userLocale && isValidLocale(userLocale)) {
    return userLocale;
  }

  // Try tenant default third
  if (tenantDefaultLocale && isValidLocale(tenantDefaultLocale)) {
    return tenantDefaultLocale;
  }

  // Fallback to system default
  return 'en';
}
