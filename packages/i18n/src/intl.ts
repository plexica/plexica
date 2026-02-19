/**
 * FormatJS (ICU MessageFormat) integration wrapper.
 *
 * Provides namespace-scoped IntlShape instances with tenant override support.
 */

import { createIntl, createIntlCache, type IntlShape, type IntlConfig } from '@formatjs/intl';
import { mergeOverrides } from './merge.js';

/**
 * Global cache for IntlShape instances.
 *
 * Reuses compiled message formatters across calls for better performance.
 * Cache is keyed by locale to avoid recompiling parsers.
 *
 * @see https://formatjs.io/docs/intl#createintlcache
 */
const intlCache = createIntlCache();

/**
 * Create namespace-scoped FormatJS IntlShape instance.
 *
 * Wraps `@formatjs/intl` with namespace-based message loading and optional
 * tenant overrides. Returns an IntlShape instance with all ICU MessageFormat
 * methods (formatMessage, formatNumber, formatDate, etc.).
 *
 * @param locale - BCP 47 locale code (e.g., "en", "it-IT")
 * @param namespace - Namespace identifier (e.g., "common", "dashboard")
 * @param messages - Base translation messages (flat dotted keys)
 * @param overrides - Optional tenant-specific overrides
 * @returns FormatJS IntlShape instance
 *
 * @example
 * ```typescript
 * const intl = createNamespacedIntl('en', 'dashboard', {
 *   'dashboard.welcome': 'Welcome, {name}!',
 *   'dashboard.itemCount': 'You have {count, plural, one {# item} other {# items}}.'
 * });
 *
 * // ICU MessageFormat interpolation
 * console.log(intl.formatMessage({ id: 'dashboard.welcome' }, { name: 'Alice' }));
 * // Output: "Welcome, Alice!"
 *
 * // ICU MessageFormat pluralization
 * console.log(intl.formatMessage({ id: 'dashboard.itemCount' }, { count: 3 }));
 * // Output: "You have 3 items."
 *
 * // With tenant overrides
 * const intlWithOverrides = createNamespacedIntl(
 *   'en',
 *   'dashboard',
 *   { 'dashboard.welcome': 'Welcome, {name}!' },
 *   { 'dashboard.welcome': 'Hello, {name}!' }  // Override
 * );
 *
 * console.log(intlWithOverrides.formatMessage({ id: 'dashboard.welcome' }, { name: 'Bob' }));
 * // Output: "Hello, Bob!" (override applied)
 * ```
 *
 * @see https://formatjs.io/docs/intl
 * @see https://formatjs.io/docs/core-concepts/icu-syntax
 */
export function createNamespacedIntl(
  locale: string,
  _namespace: string, // Reserved for future scoped error logging
  messages: Record<string, string>,
  overrides?: Record<string, string>
): IntlShape {
  // Merge tenant overrides if provided
  const finalMessages = overrides ? mergeOverrides(messages, overrides).messages : messages;

  // Create IntlConfig
  const config: IntlConfig = {
    locale,
    messages: finalMessages,
    defaultLocale: 'en',
    // Fallback to key if translation is missing
    onError: (err) => {
      if (err.code === 'MISSING_TRANSLATION') {
        console.warn(`[i18n] Missing translation: ${err.descriptor?.id} (locale: ${locale})`);
      } else {
        console.error(`[i18n] FormatJS error:`, err);
      }
    },
  };

  // Create IntlShape instance with cache
  return createIntl(config, intlCache);
}
