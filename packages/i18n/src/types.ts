/**
 * TypeScript types for @plexica/i18n package
 *
 * Shared type definitions used across backend and frontend.
 */

/**
 * Locale resolution options for the fallback chain.
 *
 * Resolution order: browserLocale → userLocale → tenantDefaultLocale → "en"
 *
 * @example
 * ```typescript
 * const locale = resolveLocale({
 *   browserLocale: 'it-IT',
 *   userLocale: undefined,
 *   tenantDefaultLocale: 'en'
 * });
 * // Result: "it-IT"
 * ```
 */
export interface LocaleResolutionOptions {
  /** Locale detected from browser (e.g., navigator.language) */
  browserLocale?: string;

  /** User-specific locale preference from profile */
  userLocale?: string;

  /** Tenant's default locale from Tenant.default_locale */
  tenantDefaultLocale?: string;
}

/**
 * Translation bundle for a single namespace and locale.
 *
 * Represents a complete set of translations for one namespace (e.g., "common", "dashboard")
 * in a specific locale (e.g., "en", "it-IT").
 *
 * @example
 * ```typescript
 * const bundle: TranslationBundle = {
 *   locale: 'en',
 *   namespace: 'dashboard',
 *   messages: {
 *     'dashboard.title': 'Dashboard',
 *     'dashboard.welcome': 'Welcome, {name}!'
 *   },
 *   contentHash: 'a1b2c3d4'
 * };
 * ```
 */
export interface TranslationBundle {
  /** BCP 47 locale code (e.g., "en", "it-IT") */
  locale: string;

  /** Namespace identifier (e.g., "common", "dashboard", "plugin-analytics") */
  namespace: string;

  /** Flat translation messages with dotted keys */
  messages: Record<string, string>;

  /** 8-character SHA-256 content hash for cache busting */
  contentHash: string;
}

/**
 * Tenant-specific translation overrides.
 *
 * Nested structure: `{ locale: { namespace: { key: value } } }`
 *
 * Stored in `Tenant.translation_overrides` JSONB column.
 *
 * @example
 * ```typescript
 * const overrides: TenantOverrides = {
 *   en: {
 *     common: {
 *       'common.greeting': 'Hello from Acme Corp!',
 *       'common.brand': 'Acme Corporation'
 *     }
 *   },
 *   'it-IT': {
 *     common: {
 *       'common.greeting': 'Ciao da Acme Corp!'
 *     }
 *   }
 * };
 * ```
 */
export interface TenantOverrides {
  [locale: string]: {
    [namespace: string]: {
      [key: string]: string;
    };
  };
}

/**
 * Locale metadata information.
 *
 * @example
 * ```typescript
 * const localeInfo: LocaleInfo = {
 *   code: 'it-IT',
 *   displayName: 'Italian (Italy)',
 *   isRTL: false
 * };
 * ```
 */
export interface LocaleInfo {
  /** BCP 47 locale code */
  code: string;

  /** Human-readable locale name (e.g., "Italian (Italy)") */
  displayName: string;

  /** Whether this locale uses right-to-left text direction */
  isRTL: boolean;
}

/**
 * Namespaced translation messages (nested structure).
 *
 * Used for plugin manifest `translations` field and API responses.
 *
 * @example
 * ```typescript
 * const messages: NamespacedMessages = {
 *   dashboard: {
 *     title: 'Dashboard',
 *     actions: {
 *       save: 'Save Changes',
 *       cancel: 'Cancel'
 *     }
 *   }
 * };
 * ```
 */
export interface NamespacedMessages {
  [key: string]: string | NamespacedMessages;
}

/**
 * Override merge result with metadata.
 *
 * Returned by `mergeOverrides` to indicate which override keys had no base key.
 *
 * @example
 * ```typescript
 * const result: OverrideMergeResult = {
 *   messages: {
 *     'common.greeting': 'Custom Hello',
 *     'common.farewell': 'Goodbye'
 *   },
 *   orphanedKeys: [] // No orphaned overrides
 * };
 * ```
 */
export interface OverrideMergeResult {
  /** Merged translation messages (base + overrides) */
  messages: Record<string, string>;

  /** Override keys that had no matching base key */
  orphanedKeys: string[];
}
