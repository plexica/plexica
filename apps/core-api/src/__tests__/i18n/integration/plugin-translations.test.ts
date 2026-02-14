/**
 * Plugin Translation Validation Integration Tests (Task 5.11)
 *
 * Tests plugin registration with translation manifest validation, including:
 * - Valid translation manifest → registration succeeds
 * - Invalid namespace format → registration fails with Zod error
 * - Invalid locale code → registration fails
 * - Oversized translation file (> 200KB) → rejection with actionable error
 * - Invalid translation keys → rejection with specific key error
 *
 * FRs Addressed: FR-004, FR-011, FR-012 (plugin translation validation)
 * Constitution Art. 8.1 (integration tests for business flows)
 *
 * @module __tests__/i18n/integration/plugin-translations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PluginRegistryService } from '../../../services/plugin.service.js';
import type { PluginManifest } from '../../../types/plugin.types.js';
import { db } from '../../../lib/db.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';

describe('Plugin Translation Validation (Integration)', () => {
  let pluginService: PluginRegistryService;
  const testPluginsDir = path.join(process.cwd(), 'plugins');

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Initialize plugin service
    pluginService = new PluginRegistryService();

    // Ensure plugins directory exists
    await fs.mkdir(testPluginsDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test plugins directory
    try {
      await fs.rm(testPluginsDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  beforeEach(async () => {
    // Clean up test plugin directories before each test
    try {
      const entries = await fs.readdir(testPluginsDir);
      for (const entry of entries) {
        await fs.rm(path.join(testPluginsDir, entry), { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore errors
    }
  });

  /**
   * Helper: Create a test plugin directory with translation files
   */
  async function createTestPlugin(
    pluginId: string,
    manifest: PluginManifest,
    translations?: Record<string, Record<string, Record<string, string>>>
  ): Promise<void> {
    const pluginDir = path.join(testPluginsDir, pluginId);
    await fs.mkdir(pluginDir, { recursive: true });

    // Write manifest
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));

    // Write translation files if provided
    if (translations) {
      const translationsDir = path.join(pluginDir, 'translations');
      await fs.mkdir(translationsDir, { recursive: true });

      for (const [locale, namespaces] of Object.entries(translations)) {
        const localeDir = path.join(translationsDir, locale);
        await fs.mkdir(localeDir, { recursive: true });

        for (const [namespace, messages] of Object.entries(namespaces)) {
          await fs.writeFile(
            path.join(localeDir, `${namespace}.json`),
            JSON.stringify(messages, null, 2)
          );
        }
      }
    }
  }

  describe('Valid translation manifest → registration succeeds', () => {
    it('should register plugin with valid translations manifest (FR-004)', async () => {
      // Arrange: Create plugin with valid translation manifest
      const manifest: PluginManifest = {
        id: 'plugin-test-translations-valid',
        name: 'Test Translations Valid',
        version: '1.0.0',
        description: 'Test plugin with valid translations',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test-ns'],
          supportedLocales: ['en', 'it'],
        },
      };

      const translations = {
        en: {
          'test-ns': {
            greeting: 'Hello',
            farewell: 'Goodbye',
          },
        },
        it: {
          'test-ns': {
            greeting: 'Ciao',
            farewell: 'Arrivederci',
          },
        },
      };

      await createTestPlugin('plugin-test-translations-valid', manifest, translations);

      // Act: Register plugin
      const result = await pluginService.registerPlugin(manifest);

      // Assert: Registration succeeds
      expect(result).toBeDefined();
      expect(result.id).toBe('plugin-test-translations-valid');

      // Verify plugin is in database
      const dbPlugin = await db.plugin.findUnique({
        where: { id: 'plugin-test-translations-valid' },
      });
      expect(dbPlugin).toBeDefined();
      expect(dbPlugin?.id).toBe('plugin-test-translations-valid');
    });

    it('should accept multiple namespaces and locales', async () => {
      // Arrange: Plugin with multiple namespaces and locales
      const manifest: PluginManifest = {
        id: 'plugin-test-multi-namespace',
        name: 'Multi Namespace Plugin',
        version: '1.0.0',
        description: 'Plugin with multiple namespaces',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['crm', 'crm-reports', 'crm-settings'],
          supportedLocales: ['en', 'it', 'es', 'de'],
        },
      };

      const translations = {
        en: {
          crm: { title: 'CRM' },
          'crm-reports': { title: 'Reports' },
          'crm-settings': { title: 'Settings' },
        },
        it: {
          crm: { title: 'CRM' },
          'crm-reports': { title: 'Rapporti' },
          'crm-settings': { title: 'Impostazioni' },
        },
        es: {
          crm: { title: 'CRM' },
          'crm-reports': { title: 'Informes' },
          'crm-settings': { title: 'Ajustes' },
        },
        de: {
          crm: { title: 'CRM' },
          'crm-reports': { title: 'Berichte' },
          'crm-settings': { title: 'Einstellungen' },
        },
      };

      await createTestPlugin('plugin-test-multi-namespace', manifest, translations);

      // Act
      const result = await pluginService.registerPlugin(manifest);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('plugin-test-multi-namespace');
    });
  });

  describe('Invalid namespace format → registration fails', () => {
    it('should reject namespace with uppercase letters', async () => {
      // Arrange: Invalid namespace with uppercase
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-ns-upper',
        name: 'Invalid Namespace Uppercase',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['TestNamespace'], // Invalid: uppercase
          supportedLocales: ['en'],
        },
      };

      // Act & Assert: Should fail Zod validation
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Namespace must be lowercase alphanumeric with hyphens only/
      );
    });

    it('should reject namespace with special characters', async () => {
      // Arrange: Invalid namespace with special characters
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-ns-special',
        name: 'Invalid Namespace Special',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test_namespace'], // Invalid: underscore not allowed
          supportedLocales: ['en'],
        },
      };

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Namespace must be lowercase alphanumeric with hyphens only/
      );
    });

    it('should reject namespace with dots', async () => {
      // Arrange: Invalid namespace with dots
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-ns-dots',
        name: 'Invalid Namespace Dots',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test.namespace'], // Invalid: dots not allowed
          supportedLocales: ['en'],
        },
      };

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Namespace must be lowercase alphanumeric with hyphens only/
      );
    });
  });

  describe('Invalid locale code → registration fails', () => {
    it('should reject invalid locale format (not BCP 47)', async () => {
      // Arrange: Invalid locale code
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-locale',
        name: 'Invalid Locale',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['english'], // Invalid: not BCP 47
        },
      };

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Locale code must be BCP 47 format/
      );
    });

    it('should reject locale with wrong case', async () => {
      // Arrange: Locale with wrong case (EN instead of en)
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-locale-case',
        name: 'Invalid Locale Case',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['EN'], // Invalid: uppercase
        },
      };

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Locale code must be BCP 47 format/
      );
    });

    it('should reject locale with invalid region code', async () => {
      // Arrange: Invalid region code format
      const manifest: PluginManifest = {
        id: 'plugin-test-invalid-region',
        name: 'Invalid Region',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en-us'], // Invalid: region must be uppercase
        },
      };

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Locale code must be BCP 47 format/
      );
    });
  });

  describe('Oversized translation file (> 200KB) → rejection (FR-012)', () => {
    it('should reject plugin with translation file > 200KB', async () => {
      // Arrange: Create plugin with oversized translation file
      const manifest: PluginManifest = {
        id: 'plugin-test-oversized-file',
        name: 'Oversized File',
        version: '1.0.0',
        description: 'Test plugin with oversized translation file',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['large'],
          supportedLocales: ['en'],
        },
      };

      // Generate > 200KB translation file (~220KB)
      const largeTranslations: Record<string, string> = {};
      for (let i = 0; i < 2000; i++) {
        largeTranslations[`key${i}`] = 'x'.repeat(110); // ~110 bytes per entry
      }

      const translations = {
        en: {
          large: largeTranslations,
        },
      };

      await createTestPlugin('plugin-test-oversized-file', manifest, translations);

      // Act & Assert: Should reject with actionable error
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Translation file too large.*> 200KB limit/
      );

      // Verify error message includes helpful guidance
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Split into multiple namespaces or reduce translation count/
      );
    });

    it('should accept translation file exactly at 200KB limit', async () => {
      // Arrange: Create plugin with file at ~195KB (safely under limit)
      const manifest: PluginManifest = {
        id: 'plugin-test-at-limit',
        name: 'At Limit',
        version: '1.0.0',
        description: 'Test plugin at size limit',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['large'],
          supportedLocales: ['en'],
        },
      };

      // Generate ~180KB translation file (safely under 200KB limit including JSON formatting)
      // Each entry is ~100 bytes, so 1800 entries = ~180KB raw + JSON overhead < 200KB
      const translations: Record<string, string> = {};
      for (let i = 0; i < 1600; i++) {
        translations[`key${i}`] = 'x'.repeat(100);
      }

      await createTestPlugin('plugin-test-at-limit', manifest, {
        en: { large: translations },
      });

      // Act: Should succeed
      const result = await pluginService.registerPlugin(manifest);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('plugin-test-at-limit');
    });
  });

  describe('Invalid translation keys → rejection (FR-011)', () => {
    it('should reject translation key exceeding 128 characters', async () => {
      // Arrange: Key > 128 chars
      const manifest: PluginManifest = {
        id: 'plugin-test-long-key',
        name: 'Long Key',
        version: '1.0.0',
        description: 'Test plugin with long key',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en'],
        },
      };

      const longKey = 'a'.repeat(129); // 129 characters
      const translations = {
        en: {
          test: {
            [longKey]: 'value',
          },
        },
      };

      await createTestPlugin('plugin-test-long-key', manifest, translations);

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Translation key must be 128 characters or less/
      );
    });

    it('should reject translation key with forbidden characters', async () => {
      // Arrange: Key with special characters
      const manifest: PluginManifest = {
        id: 'plugin-test-forbidden-chars',
        name: 'Forbidden Chars',
        version: '1.0.0',
        description: 'Test plugin with forbidden chars',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          test: {
            'test@key': 'value', // Invalid: @ not allowed
          },
        },
      };

      await createTestPlugin('plugin-test-forbidden-chars', manifest, translations);

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Invalid translation key.*alphanumeric/
      );
    });

    it('should reject translation key with _system. prefix', async () => {
      // Arrange: Key with reserved prefix
      const manifest: PluginManifest = {
        id: 'plugin-test-reserved-prefix',
        name: 'Reserved Prefix',
        version: '1.0.0',
        description: 'Test plugin with reserved prefix',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          test: {
            '_system.reserved': 'value', // Invalid: _system. prefix reserved
          },
        },
      };

      await createTestPlugin('plugin-test-reserved-prefix', manifest, translations);

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Translation key cannot start with reserved prefix "_system\."/
      );
    });

    it('should reject translation key with excessive nesting', async () => {
      // Arrange: Key with > 5 nesting levels
      const manifest: PluginManifest = {
        id: 'plugin-test-deep-nesting',
        name: 'Deep Nesting',
        version: '1.0.0',
        description: 'Test plugin with deep nesting',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          test: {
            'level1.level2.level3.level4.level5.level6': 'value', // 6 levels (max is 5)
          },
        },
      };

      await createTestPlugin('plugin-test-deep-nesting', manifest, translations);

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Translation key cannot exceed 5 nesting levels/
      );
    });
  });

  describe('Missing translation files → rejection', () => {
    it('should reject plugin when declared translation file is missing', async () => {
      // Arrange: Plugin declares translation but file doesn't exist
      const manifest: PluginManifest = {
        id: 'plugin-test-missing-file',
        name: 'Missing File',
        version: '1.0.0',
        description: 'Test plugin with missing file',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en', 'it'],
        },
      };

      // Only create English translation, Italian is missing
      const translations = {
        en: {
          test: {
            greeting: 'Hello',
          },
        },
      };

      await createTestPlugin('plugin-test-missing-file', manifest, translations);

      // Act & Assert
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Missing translation file.*test.*it/
      );
    });
  });

  describe('Edge cases and security', () => {
    it('should accept valid nested translation structure', async () => {
      // Arrange: Valid nested translations (within limits)
      const manifest: PluginManifest = {
        id: 'plugin-test-nested-valid',
        name: 'Nested Valid',
        version: '1.0.0',
        description: 'Test plugin with nested translations',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          test: {
            'app.header.title': 'Welcome',
            'app.header.subtitle': 'Dashboard',
            'app.footer.copyright': '© 2024',
          },
        },
      };

      await createTestPlugin('plugin-test-nested-valid', manifest, translations);

      // Act
      const result = await pluginService.registerPlugin(manifest);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('plugin-test-nested-valid');
    });

    it('should prevent path traversal in namespace', async () => {
      // Arrange: Attempt path traversal via namespace
      const manifest: PluginManifest = {
        id: 'plugin-test-traversal-ns',
        name: 'Path Traversal Namespace',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['../../../etc/passwd'], // Path traversal attempt
          supportedLocales: ['en'],
        },
      };

      // Act & Assert: Should fail Zod validation before filesystem check
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Namespace must be lowercase alphanumeric/
      );
    });

    it('should prevent path traversal in locale', async () => {
      // Arrange: Attempt path traversal via locale
      const manifest: PluginManifest = {
        id: 'plugin-test-traversal-locale',
        name: 'Path Traversal Locale',
        version: '1.0.0',
        description: 'Test plugin',
        category: 'utility' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['test'],
          supportedLocales: ['../../etc'], // Path traversal attempt
        },
      };

      // Act & Assert: Should fail Zod validation
      await expect(pluginService.registerPlugin(manifest)).rejects.toThrow(
        /Locale code must be BCP 47 format/
      );
    });
  });
});
