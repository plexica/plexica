/**
 * Plugin Translation Lifecycle E2E Tests (Task 5.13)
 *
 * Tests the complete plugin translation lifecycle with real HTTP requests:
 * - Install plugin with translations → enable → translations available
 * - Disable plugin → translations no longer accessible (404)
 * - Re-enable plugin → translations available again
 * - Namespace isolation: plugin A cannot access plugin B's translations
 *
 * **IMPORTANT**: Translation files are stored in centralized `translations/` directory,
 * not in plugin directories. Tests simulate deployment by copying translation files
 * from plugin dirs to central location when plugins are activated.
 *
 * FRs Addressed: FR-001 (namespace isolation), FR-005 (lazy loading via enable/disable)
 * Constitution Art. 8.1 (E2E tests for critical user workflows)
 *
 * @module __tests__/i18n/e2e/plugin-translations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import * as path from 'path';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { PluginRegistryService, PluginLifecycleService } from '../../../services/plugin.service.js';
import { TranslationCacheService } from '../../../modules/i18n/i18n-cache.service.js';
import type { PluginManifest } from '../../../types/plugin.types.js';

describe('Plugin Translation Lifecycle E2E', () => {
  let app: FastifyInstance;
  let pluginRegistry: PluginRegistryService;
  let pluginLifecycle: PluginLifecycleService;
  let cacheService: TranslationCacheService;
  let testTenantId: string;
  const testPluginsDir = path.join(process.cwd(), 'plugins');
  const centralTranslationsDir = path.join(process.cwd(), 'translations');

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Initialize Fastify app
    app = await buildTestApp();
    await app.ready();

    // Initialize plugin services
    pluginRegistry = new PluginRegistryService();
    pluginLifecycle = new PluginLifecycleService();
    cacheService = new TranslationCacheService();

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        name: 'Plugin Translation Test Tenant',
        slug: 'plugin-trans-test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        translationOverrides: {},
      },
    });

    testTenantId = tenant.id;

    // Ensure directories exist
    await fs.mkdir(testPluginsDir, { recursive: true });
    await fs.mkdir(centralTranslationsDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test plugins directory
    try {
      await fs.rm(testPluginsDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }

    // Clean up test tenant
    if (testTenantId) {
      await db.tenant.delete({ where: { id: testTenantId } });
    }

    // Close connections
    await app.close();
    await redis.quit();
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

    // Clean up plugin installations
    await db.tenantPlugin.deleteMany({ where: { tenantId: testTenantId } });
    await db.plugin.deleteMany({
      where: { id: { startsWith: 'plugin-e2e-' } },
    });
  });

  afterEach(async () => {
    // Clean up deployed translation files after each test
    try {
      const locales = await fs.readdir(centralTranslationsDir);
      for (const locale of locales) {
        const localeDir = path.join(centralTranslationsDir, locale);
        try {
          const files = await fs.readdir(localeDir);
          for (const file of files) {
            // Only delete test plugin translation files, preserve core.json
            if (file !== 'core.json') {
              const namespace = file.replace('.json', '');
              await fs.unlink(path.join(localeDir, file));
              // Invalidate cache for deleted namespace
              await cacheService.invalidateNamespace(locale, namespace);
            }
          }
        } catch (error) {
          // Ignore errors
        }
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

  /**
   * Helper: Deploy plugin translations to central translations/ directory
   * Simulates plugin activation behavior
   */
  async function deployPluginTranslations(
    translations: Record<string, Record<string, Record<string, string>>>
  ): Promise<void> {
    for (const [locale, namespaces] of Object.entries(translations)) {
      const localeDir = path.join(centralTranslationsDir, locale);
      await fs.mkdir(localeDir, { recursive: true });

      for (const [namespace, messages] of Object.entries(namespaces)) {
        await fs.writeFile(
          path.join(localeDir, `${namespace}.json`),
          JSON.stringify(messages, null, 2)
        );
      }
    }
  }

  /**
   * Helper: Remove plugin translations from central directory
   * Simulates plugin deactivation behavior
   */
  async function undeployPluginTranslations(
    namespaces: string[],
    locales: string[]
  ): Promise<void> {
    for (const locale of locales) {
      for (const namespace of namespaces) {
        const filePath = path.join(centralTranslationsDir, locale, `${namespace}.json`);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          // Ignore if file doesn't exist
        }
        // Invalidate cache for this namespace/locale
        await cacheService.invalidateNamespace(locale, namespace);
      }
    }
  }

  describe('Plugin enable → translations available (FR-005)', () => {
    it('should return 404 for plugin when translations not deployed', async () => {
      // Arrange: Create and register plugin with translation files in plugin dir,
      // but DON'T deploy to central directory
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-crm',
        name: 'E2E CRM Plugin',
        version: '1.0.0',
        description: 'Test CRM plugin with translations',
        category: 'crm' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['crm'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          crm: {
            'contacts.title': 'Contacts',
            'deals.title': 'Deals',
          },
        },
      };

      // Create plugin with translation files in plugin directory (for validation)
      await createTestPlugin('plugin-e2e-test-crm', manifest, translations);
      await pluginRegistry.registerPlugin(manifest);

      // Act: Try to fetch translations (not deployed to central directory yet)
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/crm',
      });

      // Assert: 404 because translation files not in central directory
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NAMESPACE_NOT_FOUND');
    });

    it('should make translations available after deployment', async () => {
      // Arrange: Create, register plugin, deploy translations
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-sales',
        name: 'E2E Sales Plugin',
        version: '1.0.0',
        description: 'Test sales plugin',
        category: 'sales' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['sales'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          sales: {
            'dashboard.title': 'Sales Dashboard',
            'pipeline.title': 'Pipeline',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-sales', manifest, translations);
      await pluginRegistry.registerPlugin(manifest);
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-sales', {});
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-sales');

      // Deploy translations to central directory
      await deployPluginTranslations(translations);

      // Act: Fetch translations
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/sales',
      });

      // Assert: Translations available (200)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.locale).toBe('en');
      expect(body.namespace).toBe('sales');
      expect(body.messages['dashboard.title']).toBe('Sales Dashboard');
      expect(body.messages['pipeline.title']).toBe('Pipeline');
    });

    it('should support multiple locales for enabled plugin', async () => {
      // Arrange: Plugin with English and Italian
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-marketing',
        name: 'E2E Marketing Plugin',
        version: '1.0.0',
        description: 'Test marketing plugin',
        category: 'marketing' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['marketing'],
          supportedLocales: ['en', 'it'],
        },
      };

      const translations = {
        en: {
          marketing: {
            'campaigns.title': 'Campaigns',
          },
        },
        it: {
          marketing: {
            'campaigns.title': 'Campagne',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-marketing', manifest, translations);
      await pluginRegistry.registerPlugin(manifest);
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-marketing', {});
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-marketing');
      await deployPluginTranslations(translations);

      // Act: Fetch English
      const enResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/marketing',
      });
      expect(enResponse.statusCode).toBe(200);
      const enBody = JSON.parse(enResponse.body);
      expect(enBody.messages['campaigns.title']).toBe('Campaigns');

      // Act: Fetch Italian
      const itResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/it/marketing',
      });
      expect(itResponse.statusCode).toBe(200);
      const itBody = JSON.parse(itResponse.body);
      expect(itBody.messages['campaigns.title']).toBe('Campagne');
    });
  });

  describe('Plugin disable → translations no longer accessible (FR-005)', () => {
    it('should return 404 after undeploying translations', async () => {
      // Arrange: Deploy, then undeploy
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-support',
        name: 'E2E Support Plugin',
        version: '1.0.0',
        description: 'Test support plugin',
        category: 'support' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['support'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          support: {
            'tickets.title': 'Support Tickets',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-support', manifest, translations);
      await pluginRegistry.registerPlugin(manifest);
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-support', {});
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-support');
      await deployPluginTranslations(translations);

      // Verify translations available
      const enabledResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/support',
      });
      expect(enabledResponse.statusCode).toBe(200);

      // Act: Deactivate and undeploy
      await pluginLifecycle.deactivatePlugin(testTenantId, 'plugin-e2e-test-support');
      await undeployPluginTranslations(['support'], ['en']);

      // Assert: Translations no longer available
      const disabledResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/support',
      });
      expect(disabledResponse.statusCode).toBe(404);
    });
  });

  describe('Plugin re-enable → translations available again (FR-005)', () => {
    it('should restore translations after redeployment', async () => {
      // Arrange: Deploy, undeploy, redeploy
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-projects',
        name: 'E2E Projects Plugin',
        version: '1.0.0',
        description: 'Test projects plugin',
        category: 'projects' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['projects'],
          supportedLocales: ['en'],
        },
      };

      const translations = {
        en: {
          projects: {
            'dashboard.title': 'Projects Dashboard',
            'tasks.title': 'Tasks',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-projects', manifest, translations);
      await pluginRegistry.registerPlugin(manifest);
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-projects', {});

      // Deploy and verify
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-projects');
      await deployPluginTranslations(translations);
      const enabled1 = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/projects',
      });
      expect(enabled1.statusCode).toBe(200);

      // Undeploy and verify
      await pluginLifecycle.deactivatePlugin(testTenantId, 'plugin-e2e-test-projects');
      await undeployPluginTranslations(['projects'], ['en']);
      const disabled = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/projects',
      });
      expect(disabled.statusCode).toBe(404);

      // Redeploy and verify
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-projects');
      await deployPluginTranslations(translations);
      const enabled2 = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/projects',
      });
      expect(enabled2.statusCode).toBe(200);
      const body = JSON.parse(enabled2.body);
      expect(body.messages['dashboard.title']).toBe('Projects Dashboard');
      expect(body.messages['tasks.title']).toBe('Tasks');
    });
  });

  describe('Namespace isolation (FR-001)', () => {
    it('should isolate plugin A translations from plugin B', async () => {
      // Arrange: Two plugins with different namespaces
      const manifestA: PluginManifest = {
        id: 'plugin-e2e-test-hr',
        name: 'E2E HR Plugin',
        version: '1.0.0',
        description: 'Test HR plugin',
        category: 'hr' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['hr'],
          supportedLocales: ['en'],
        },
      };

      const manifestB: PluginManifest = {
        id: 'plugin-e2e-test-finance',
        name: 'E2E Finance Plugin',
        version: '1.0.0',
        description: 'Test finance plugin',
        category: 'finance' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['finance'],
          supportedLocales: ['en'],
        },
      };

      const translationsA = {
        en: {
          hr: {
            'employees.title': 'Employees',
            'departments.title': 'Departments',
          },
        },
      };

      const translationsB = {
        en: {
          finance: {
            'invoices.title': 'Invoices',
            'expenses.title': 'Expenses',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-hr', manifestA, translationsA);
      await createTestPlugin('plugin-e2e-test-finance', manifestB, translationsB);

      await pluginRegistry.registerPlugin(manifestA);
      await pluginRegistry.registerPlugin(manifestB);

      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-hr', {});
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-finance', {});

      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-hr');
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-finance');

      await deployPluginTranslations(translationsA);
      await deployPluginTranslations(translationsB);

      // Act: Fetch HR translations
      const hrResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/hr',
      });

      // Assert: HR translations only
      expect(hrResponse.statusCode).toBe(200);
      const hrBody = JSON.parse(hrResponse.body);
      expect(hrBody.namespace).toBe('hr');
      expect(hrBody.messages['employees.title']).toBe('Employees');
      expect(hrBody.messages['departments.title']).toBe('Departments');
      expect(hrBody.messages['invoices.title']).toBeUndefined(); // No finance keys
      expect(hrBody.messages['expenses.title']).toBeUndefined();

      // Act: Fetch Finance translations
      const financeResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/finance',
      });

      // Assert: Finance translations only
      expect(financeResponse.statusCode).toBe(200);
      const financeBody = JSON.parse(financeResponse.body);
      expect(financeBody.namespace).toBe('finance');
      expect(financeBody.messages['invoices.title']).toBe('Invoices');
      expect(financeBody.messages['expenses.title']).toBe('Expenses');
      expect(financeBody.messages['employees.title']).toBeUndefined(); // No HR keys
      expect(financeBody.messages['departments.title']).toBeUndefined();
    });

    it('should prevent cross-namespace key contamination', async () => {
      // Arrange: Two plugins with same key name in different namespaces
      const manifestReports: PluginManifest = {
        id: 'plugin-e2e-test-reports',
        name: 'E2E Reports Plugin',
        version: '1.0.0',
        description: 'Test reports plugin',
        category: 'reports' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['reports'],
          supportedLocales: ['en'],
        },
      };

      const manifestAnalytics: PluginManifest = {
        id: 'plugin-e2e-test-analytics',
        name: 'E2E Analytics Plugin',
        version: '1.0.0',
        description: 'Test analytics plugin',
        category: 'analytics' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['analytics'],
          supportedLocales: ['en'],
        },
      };

      // Both have 'dashboard.title' key
      const translationsReports = {
        en: {
          reports: {
            'dashboard.title': 'Reports Dashboard',
          },
        },
      };

      const translationsAnalytics = {
        en: {
          analytics: {
            'dashboard.title': 'Analytics Dashboard',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-reports', manifestReports, translationsReports);
      await createTestPlugin('plugin-e2e-test-analytics', manifestAnalytics, translationsAnalytics);

      await pluginRegistry.registerPlugin(manifestReports);
      await pluginRegistry.registerPlugin(manifestAnalytics);

      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-reports', {});
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-analytics', {});

      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-reports');
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-analytics');

      await deployPluginTranslations(translationsReports);
      await deployPluginTranslations(translationsAnalytics);

      // Act & Assert: Each namespace returns its own value
      const reportsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/reports',
      });
      expect(reportsResponse.statusCode).toBe(200);
      const reportsBody = JSON.parse(reportsResponse.body);
      expect(reportsBody.messages['dashboard.title']).toBe('Reports Dashboard');

      const analyticsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/analytics',
      });
      expect(analyticsResponse.statusCode).toBe(200);
      const analyticsBody = JSON.parse(analyticsResponse.body);
      expect(analyticsBody.messages['dashboard.title']).toBe('Analytics Dashboard');
    });
  });

  describe('End-to-end full lifecycle', () => {
    it('should complete full plugin translation lifecycle via API', async () => {
      // Arrange
      const manifest: PluginManifest = {
        id: 'plugin-e2e-test-full-lifecycle',
        name: 'E2E Full Lifecycle Plugin',
        version: '1.0.0',
        description: 'Test plugin for full lifecycle',
        category: 'lifecycle' as any,
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        translations: {
          namespaces: ['lifecycle'],
          supportedLocales: ['en', 'it'],
        },
      };

      const translations = {
        en: {
          lifecycle: {
            'status.active': 'Active',
            'status.inactive': 'Inactive',
          },
        },
        it: {
          lifecycle: {
            'status.active': 'Attivo',
            'status.inactive': 'Inattivo',
          },
        },
      };

      await createTestPlugin('plugin-e2e-test-full-lifecycle', manifest, translations);

      // Ensure cache is clear for lifecycle namespace (cleanup from previous test runs)
      await cacheService.invalidateNamespace('en', 'lifecycle');
      await cacheService.invalidateNamespace('it', 'lifecycle');

      // Step 1: Register plugin
      await pluginRegistry.registerPlugin(manifest);

      // Step 2: Verify translations not available before deployment
      const beforeInstallResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/lifecycle',
      });
      expect(beforeInstallResponse.statusCode).toBe(404);

      // Step 3: Install plugin
      await pluginLifecycle.installPlugin(testTenantId, 'plugin-e2e-test-full-lifecycle', {});

      // Step 4: Install but not enabled → still 404
      const afterInstallResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/lifecycle',
      });
      expect(afterInstallResponse.statusCode).toBe(404);

      // Step 5: Enable plugin and deploy translations
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-full-lifecycle');
      await deployPluginTranslations(translations);

      // Step 6: Verify translations available (English)
      const enabledEnResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/lifecycle',
      });
      expect(enabledEnResponse.statusCode).toBe(200);
      const enBody = JSON.parse(enabledEnResponse.body);
      expect(enBody.messages['status.active']).toBe('Active');

      // Step 7: Verify translations available (Italian)
      const enabledItResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/it/lifecycle',
      });
      expect(enabledItResponse.statusCode).toBe(200);
      const itBody = JSON.parse(enabledItResponse.body);
      expect(itBody.messages['status.active']).toBe('Attivo');

      // Step 8: Disable plugin and undeploy
      await pluginLifecycle.deactivatePlugin(testTenantId, 'plugin-e2e-test-full-lifecycle');
      await undeployPluginTranslations(['lifecycle'], ['en', 'it']);

      // Step 9: Verify translations no longer available
      const afterDisableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/lifecycle',
      });
      expect(afterDisableResponse.statusCode).toBe(404);

      // Step 10: Re-enable and redeploy
      await pluginLifecycle.activatePlugin(testTenantId, 'plugin-e2e-test-full-lifecycle');
      await deployPluginTranslations(translations);

      // Step 11: Verify translations available again
      const afterReEnableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/lifecycle',
      });
      expect(afterReEnableResponse.statusCode).toBe(200);
      const finalBody = JSON.parse(afterReEnableResponse.body);
      expect(finalBody.messages['status.active']).toBe('Active');
      expect(finalBody.messages['status.inactive']).toBe('Inactive');
    });
  });
});
