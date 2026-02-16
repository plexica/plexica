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

// Export utilities (browser-safe)
export { flattenMessages, unflattenMessages } from './flatten.js';
export { resolveLocale, isValidLocale } from './locale.js';
export { mergeOverrides } from './merge.js';
export { createNamespacedIntl } from './intl.js';

// NOTE: generateContentHash is Node.js-only (uses node:crypto)
// Backend code should import it directly: import { generateContentHash } from '@plexica/i18n/hash';
