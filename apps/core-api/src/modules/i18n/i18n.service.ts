/**
 * TranslationService - Core backend service for translation resolution
 *
 * Responsibilities:
 * - Load translation files from disk (file-based structure)
 * - Merge tenant overrides from database onto plugin translations
 * - Generate content hashes for immutable caching
 * - Validate translation keys
 * - Enforce 200KB file size limit per namespace
 * - Resolve locale fallback chain: requested → en
 *
 * @module modules/i18n/i18n.service
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '../../lib/db.js';
import { PluginLifecycleService } from '../../services/plugin.service.js';
import {
  flattenMessages,
  mergeOverrides,
  type TranslationBundle,
  type TenantOverrides,
  type LocaleInfo,
  type NamespacedMessages,
} from '@plexica/i18n';
import { generateContentHash } from '@plexica/i18n/hash.js';
import { LocaleCodeSchema, NamespaceSchema, TranslationKeySchema } from './i18n.schemas.js';
import type { PluginManifest } from '../../types/plugin.types.js';
import { Prisma } from '@plexica/database';

// Constants
const TRANSLATIONS_DIR = path.join(process.cwd(), 'translations');
const MAX_FILE_SIZE = 200 * 1024; // 200KB per FR-012
const DEFAULT_LOCALE = 'en';

// Error codes
const ERROR_CODES = {
  INVALID_LOCALE: 'INVALID_LOCALE',
  LOCALE_NOT_FOUND: 'LOCALE_NOT_FOUND',
  NAMESPACE_NOT_FOUND: 'NAMESPACE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_TRANSLATION_KEY: 'INVALID_TRANSLATION_KEY',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
} as const;

/**
 * Validation result for translation keys
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ key: string; message: string }>;
}

/**
 * TranslationService - Core translation resolution and management
 */
export class TranslationService {
  private pluginService: PluginLifecycleService;

  constructor() {
    this.pluginService = new PluginLifecycleService();
  }

  /**
   * Get translations for a specific locale and namespace
   * Optionally merges tenant overrides if tenantSlug is provided
   *
   * @param locale - BCP 47 locale code (e.g., 'en', 'it')
   * @param namespace - Plugin namespace (e.g., 'core', 'crm')
   * @param tenantSlug - Optional tenant slug for override merging
   * @returns Translation bundle with locale, namespace, hash, and messages
   * @throws Error if locale or namespace is invalid/not found
   */
  async getTranslations(
    locale: string,
    namespace: string,
    tenantSlug?: string
  ): Promise<TranslationBundle> {
    // Validate inputs
    const localeValidation = LocaleCodeSchema.safeParse(locale);
    if (!localeValidation.success) {
      throw new Error(`${ERROR_CODES.INVALID_LOCALE}: ${localeValidation.error.message}`);
    }

    const namespaceValidation = NamespaceSchema.safeParse(namespace);
    if (!namespaceValidation.success) {
      throw new Error(`${ERROR_CODES.NAMESPACE_NOT_FOUND}: Invalid namespace format`);
    }

    // Load base translations from file
    let messages: Record<string, string>;
    try {
      messages = await this.loadNamespaceFile(locale, namespace);
    } catch (error) {
      // Try fallback to default locale (FR-003)
      if (locale !== DEFAULT_LOCALE) {
        messages = await this.loadNamespaceFile(DEFAULT_LOCALE, namespace);
        locale = DEFAULT_LOCALE; // Update locale to reflect fallback
        // If this also fails, error will propagate naturally
      } else {
        // Requested default locale but namespace not found - namespace doesn't exist
        throw error;
      }
    }

    // Merge tenant overrides if tenantSlug provided (FR-006, FR-007)
    if (tenantSlug) {
      const tenant = await db.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, translationOverrides: true },
      });

      if (tenant) {
        const overrides = tenant.translationOverrides as Prisma.JsonValue;
        const tenantOverrides = (overrides as TenantOverrides) || {};

        // Extract overrides for this specific locale + namespace
        const localeOverrides = tenantOverrides[locale]?.[namespace] || {};
        const mergeResult = mergeOverrides(messages, localeOverrides);
        messages = mergeResult.messages;
      }
      // If tenant not found, continue without overrides (no error - tenant may not exist yet)
    }

    // Generate content hash for cache-busting (FR-010)
    const contentHash = generateContentHash(messages);

    return {
      locale,
      namespace,
      messages,
      contentHash,
    };
  }

  /**
   * Load and flatten a single namespace JSON file from disk
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @returns Flattened messages (dotted key paths)
   * @throws Error if file not found or exceeds size limit
   */
  async loadNamespaceFile(locale: string, namespace: string): Promise<Record<string, string>> {
    const filePath = path.join(TRANSLATIONS_DIR, locale, `${namespace}.json`);

    // Check if file exists and get stats
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      throw new Error(
        `${ERROR_CODES.NAMESPACE_NOT_FOUND}: Translation file not found at ${filePath}`
      );
    }

    // Enforce file size limit (FR-012)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(
        `${ERROR_CODES.FILE_TOO_LARGE}: Translation file exceeds 200KB limit (${stats.size} bytes)`
      );
    }

    // Read and parse JSON file
    const content = await fs.readFile(filePath, 'utf-8');
    const messages = JSON.parse(content) as NamespacedMessages;

    // Flatten nested structure to dotted keys
    return flattenMessages(messages);
  }

  /**
   * Get namespaces for enabled plugins only (FR-005)
   *
   * @param tenantId - Tenant UUID
   * @returns Array of namespace strings from enabled plugins
   */
  async getEnabledNamespaces(tenantId: string): Promise<string[]> {
    // Get all installed plugins for tenant
    const installations = await this.pluginService.getInstalledPlugins(tenantId);

    // Filter to enabled plugins only
    const enabledPlugins = installations.filter((installation) => installation.enabled);

    // Extract namespaces from plugin manifests
    const namespaces: string[] = ['core']; // Core namespace always available

    for (const installation of enabledPlugins) {
      const manifest = installation.plugin.manifest as unknown as PluginManifest;
      if (manifest.translations?.namespaces) {
        namespaces.push(...manifest.translations.namespaces);
      }
    }

    // Remove duplicates and return as array
    const uniqueNamespaces = Array.from(new Set(namespaces));
    return uniqueNamespaces;
  }

  /**
   * Get tenant translation overrides from database
   *
   * @param tenantId - Tenant UUID
   * @returns Tenant overrides object
   * @throws Error if tenant not found
   */
  async getTenantOverrides(tenantId: string): Promise<TenantOverrides> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { translationOverrides: true },
    });

    if (!tenant) {
      throw new Error(`${ERROR_CODES.TENANT_NOT_FOUND}: Tenant '${tenantId}' not found`);
    }

    return (tenant.translationOverrides as unknown as TenantOverrides) || {};
  }

  /**
   * Update tenant translation overrides
   * Invalidates cache for this tenant
   *
   * @param tenantId - Tenant UUID
   * @param overrides - New tenant overrides
   * @returns Updated overrides
   * @throws Error if tenant not found or validation fails
   */
  async updateTenantOverrides(
    tenantId: string,
    overrides: TenantOverrides
  ): Promise<TenantOverrides> {
    // Verify tenant exists
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new Error(`${ERROR_CODES.TENANT_NOT_FOUND}: Tenant '${tenantId}' not found`);
    }

    // Validate all translation keys in overrides
    const allKeys: string[] = [];
    for (const locale of Object.keys(overrides)) {
      for (const namespace of Object.keys(overrides[locale] || {})) {
        const namespaceKeys = Object.keys(overrides[locale]?.[namespace] || {});
        allKeys.push(...namespaceKeys);
      }
    }

    const validation = this.validateTranslationKeys(allKeys);
    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => `${e.key}: ${e.message}`).join('; ');
      throw new Error(`${ERROR_CODES.INVALID_TRANSLATION_KEY}: ${errorMessages}`);
    }

    // Update database
    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        translationOverrides: overrides as unknown as Prisma.InputJsonValue,
      },
      select: { translationOverrides: true },
    });

    // Note: Cache invalidation will be handled by TranslationCacheService
    // in the route handler after this service call

    return (updated.translationOverrides as unknown as TenantOverrides) || {};
  }

  /**
   * Validate translation keys against FR-011 rules
   *
   * @param keys - Array of translation keys to validate
   * @returns Validation result with errors if any
   */
  validateTranslationKeys(keys: string[]): ValidationResult {
    const errors: Array<{ key: string; message: string }> = [];

    for (const key of keys) {
      const validation = TranslationKeySchema.safeParse(key);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        errors.push({
          key,
          message: firstError?.message || 'Invalid key format',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate content hash for a specific locale/namespace/tenant combination
   * Used for cache-busting URLs and ETag headers
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @param tenantSlug - Optional tenant slug
   * @returns 8-character hex hash
   */
  async getContentHash(locale: string, namespace: string, tenantSlug?: string): Promise<string> {
    const bundle = await this.getTranslations(locale, namespace, tenantSlug);
    return bundle.contentHash;
  }

  /**
   * Get all available locales with metadata
   * Scans the translations directory for available locale folders
   *
   * @returns Array of locale information
   */
  async getAvailableLocales(): Promise<LocaleInfo[]> {
    const locales: LocaleInfo[] = [];

    try {
      // Read translations directory
      const entries = await fs.readdir(TRANSLATIONS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const localeCode = entry.name;

          // Validate locale code format
          const validation = LocaleCodeSchema.safeParse(localeCode);
          if (!validation.success) {
            continue; // Skip invalid locale directories
          }

          // Get locale display names (basic implementation - could be enhanced with Intl.DisplayNames)
          locales.push({
            code: localeCode,
            displayName: this.getLocaleDisplayName(localeCode),
            isRTL: this.isRTLLocale(localeCode),
          });
        }
      }
    } catch {
      // If translations directory doesn't exist, return empty array
      return [];
    }

    return locales.sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Get English display name for a locale code
   * Basic implementation - could be enhanced with Intl.DisplayNames API
   *
   * @param localeCode - BCP 47 locale code
   * @returns English name of the locale
   */
  private getLocaleDisplayName(localeCode: string): string {
    const localeNames: Record<string, string> = {
      en: 'English',
      it: 'Italian',
      es: 'Spanish',
      de: 'German',
      fr: 'French',
      pt: 'Portuguese',
      'pt-BR': 'Portuguese (Brazil)',
      'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)',
      ja: 'Japanese',
      ko: 'Korean',
    };

    return localeNames[localeCode] || localeCode.toUpperCase();
  }

  /**
   * Get native display name for a locale code
   * Basic implementation - could be enhanced with Intl.DisplayNames API
   *
   * @param localeCode - BCP 47 locale code
   * @returns Native name of the locale
   */
  private getLocaleNativeName(localeCode: string): string {
    const nativeNames: Record<string, string> = {
      en: 'English',
      it: 'Italiano',
      es: 'Español',
      de: 'Deutsch',
      fr: 'Français',
      pt: 'Português',
      'pt-BR': 'Português (Brasil)',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ja: '日本語',
      ko: '한국어',
    };

    return nativeNames[localeCode] || localeCode.toUpperCase();
  }

  /**
   * Check if a locale uses right-to-left text direction
   *
   * @param localeCode - BCP 47 locale code
   * @returns True if RTL, false otherwise
   */
  private isRTLLocale(localeCode: string): boolean {
    const rtlLocales = ['ar', 'he', 'fa', 'ur', 'yi'];
    const baseLang = localeCode.split('-')[0];
    return rtlLocales.includes(baseLang || '');
  }
}
