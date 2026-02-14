/**
 * @plexica/i18n - Shared Internationalization Utilities
 *
 * Namespace-based translations with FormatJS (ICU MessageFormat) support.
 * Used by both backend (core-api) and frontend (web-client) packages.
 *
 * @module @plexica/i18n
 */

// Export types (will be defined in types.ts)
export type {
  TranslationBundle,
  TenantOverrides,
  LocaleInfo,
  NamespacedMessages,
  LocaleResolutionOptions,
  OverrideMergeResult,
} from './types.js';

// Export utilities (will be implemented in respective files)
export { flattenMessages, unflattenMessages } from './flatten.js';
export { generateContentHash } from './hash.js';
export { resolveLocale, isValidLocale } from './locale.js';
export { mergeOverrides } from './merge.js';
export { createNamespacedIntl } from './intl.js';
