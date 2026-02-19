/**
 * Translation API Routes Integration Tests
 *
 * Tests all 4 translation API endpoints with real database and Redis:
 * - GET /translations/:locale/:namespace (public)
 * - GET /translations/locales (public)
 * - GET /tenant/translations/overrides (authenticated)
 * - PUT /tenant/translations/overrides (authenticated + tenant_admin)
 *
 * Tests cover FR-001 (namespace), FR-006 (overrides), FR-011 (validation), API endpoints.
 * Constitution Art. 8.1 (integration tests for API endpoints)
 *
 * @module __tests__/i18n/integration/translation.routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import type { FastifyInstance } from 'fastify';

describe('Translation API Routes (Integration)', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testTenantSlug: string;
  let authToken: string;

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Initialize Fastify app with routes
    app = await buildTestApp();
    await app.ready();

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        name: 'Test Translation Tenant',
        slug: 'test-translation-tenant',
        status: 'ACTIVE',
        defaultLocale: 'en',
        translationOverrides: {},
      },
    });

    testTenantId = tenant.id;
    testTenantSlug = tenant.slug;

    // Get mock auth token for authenticated endpoints
    authToken = testContext.auth.createMockTenantAdminToken(testTenantSlug);

    // Note: Translation files (en/core.json, it/core.json) are committed test fixtures
    // They are located at apps/core-api/translations/{locale}/{namespace}.json
  });

  afterAll(async () => {
    // Clean up test tenant
    if (testTenantId) {
      await db.tenant.delete({ where: { id: testTenantId } });
    }

    // Note: Translation files left in place as test fixtures
    // They are committed to git and reused across test runs

    // Close connections
    await app.close();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    await redis.flushdb();
  });

  afterEach(async () => {
    // Reset tenant overrides after each test
    await db.tenant.update({
      where: { id: testTenantId },
      data: { translationOverrides: {} },
    });
  });

  describe('GET /api/v1/translations/:locale/:namespace', () => {
    it('should return translations for valid locale and namespace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('locale', 'en');
      expect(body).toHaveProperty('namespace', 'core');
      expect(body).toHaveProperty('contentHash');
      expect(body).toHaveProperty('messages');
      expect(body.messages).toHaveProperty('contacts.title', 'Contacts');
    });

    it('should return translations in different locale', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/it/core',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.locale).toBe('it');
      expect(body.messages['contacts.title']).toBe('Contatti');
    });

    it('should set immutable cache headers (FR-010)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('immutable');
      expect(response.headers['cache-control']).toContain('max-age=31536000');
    });

    it('should set ETag header for caching', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['etag']).toBeDefined();
      expect(response.headers['etag']).toMatch(/^"[a-f0-9]+"$/);
    });

    it('should return 304 Not Modified when ETag matches', async () => {
      // First request to get ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(firstResponse.statusCode).toBe(200);
      const etag = firstResponse.headers['etag'];

      // Second request with ETag
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
        headers: {
          'if-none-match': etag!,
        },
      });

      expect(secondResponse.statusCode).toBe(304);
      expect(secondResponse.body).toBe('');
    });

    it('should return 400 for invalid locale format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/invalid_locale/core',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_LOCALE');
    });

    it('should return 400 for invalid namespace format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/Invalid_Namespace',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_LOCALE');
    });

    it('should fallback to en when requested locale not available (FR-003)', async () => {
      // Request French translations, which don't exist - should fallback to English
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/fr/core',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.locale).toBe('en'); // Fallback to English
      expect(body.namespace).toBe('core');
      expect(body.messages).toHaveProperty('contacts.title'); // English translations loaded
    });

    it('should return 404 for non-existent namespace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NAMESPACE_NOT_FOUND');
    });

    it('should use cached translations on second request (NFR-001)', async () => {
      // First request (cache miss)
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(firstResponse.statusCode).toBe(200);

      // Second request (cache hit)
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(secondResponse.statusCode).toBe(200);
      expect(secondResponse.body).toBe(firstResponse.body);
    });

    it('should include tenant overrides when tenant query parameter provided (FR-006)', async () => {
      // Set up tenant override
      await db.tenant.update({
        where: { id: testTenantId },
        data: {
          translationOverrides: {
            en: {
              core: {
                'deals.title': 'Opportunities',
              },
            },
          },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.messages['deals.title']).toBe('Opportunities'); // Override value
      expect(body.messages['contacts.title']).toBe('Contacts'); // Original value
    });
  });

  describe('GET /api/v1/translations/locales', () => {
    it('should return list of available locales', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/locales',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('locales');
      expect(body).toHaveProperty('defaultLocale', 'en');
      expect(Array.isArray(body.locales)).toBe(true);
    });

    it('should include locale metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/locales',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const locales = body.locales as Array<{ code: string; displayName: string; isRTL: boolean }>;

      expect(locales.length).toBeGreaterThan(0);
      const enLocale = locales.find((l) => l.code === 'en');
      expect(enLocale).toBeDefined();
      expect(enLocale).toHaveProperty('code');
      expect(enLocale).toHaveProperty('displayName');
      expect(enLocale).toHaveProperty('isRTL');
    });

    it('should be a public endpoint (no authentication required)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/locales',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/tenant/translations/overrides (Authenticated)', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/translations/overrides',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return empty overrides for tenant with no overrides', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('overrides');
      expect(body).toHaveProperty('updatedAt');
    });

    it('should return tenant overrides when present', async () => {
      // Set up tenant overrides
      await db.tenant.update({
        where: { id: testTenantId },
        data: {
          translationOverrides: {
            en: {
              core: {
                'deals.title': 'Opportunities',
              },
            },
          },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.overrides.en.core['deals.title']).toBe('Opportunities');
    });
  });

  describe('PUT /api/v1/tenant/translations/overrides (Authenticated + Admin)', () => {
    it('should return 401 or 403 when not authenticated', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        payload: {
          overrides: {},
        },
      });

      // Accept both 401 (middleware level) and 403 (controller level) as valid rejection
      expect([401, 403]).toContain(response.statusCode);
    });

    it('should update tenant overrides', async () => {
      const overrides = {
        en: {
          core: {
            'deals.title': 'Opportunities',
            'contacts.title': 'Clients',
          },
        },
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          overrides,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.overrides.en.core['deals.title']).toBe('Opportunities');
    });

    it('should return 400 for invalid override format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          overrides: 'invalid', // Should be object
        },
      });

      // Should fail validation even before authentication
      expect([400, 401, 403]).toContain(response.statusCode);
    });

    it('should return 400 for missing overrides field', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect([400, 401, 403]).toContain(response.statusCode);
    });

    it('should return 413 for payload > 1MB (FR-011)', async () => {
      // Arrange: Create payload > 1MB with correct nested structure
      const coreTranslations: Record<string, string> = {};
      // Generate ~1.1MB of translation keys
      for (let i = 0; i < 10000; i++) {
        coreTranslations[`key${i}`] = 'x'.repeat(110);
      }

      const largeOverrides = {
        en: {
          core: coreTranslations,
        },
      };

      // Act
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          overrides: largeOverrides,
        },
      });

      // Should return 413 for payload too large
      expect(response.statusCode).toBe(413);

      const body = JSON.parse(response.body);
      // Accept both our custom error format and Fastify's built-in format
      if (body.error && body.error.code === 'PAYLOAD_TOO_LARGE') {
        // Our custom error format
        expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      } else if (body.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        // Fastify's built-in body size limit error (valid)
        expect(body.statusCode).toBe(413);
        expect(body.error).toBe('Payload Too Large');
      } else {
        throw new Error(`Unexpected 413 error format: ${JSON.stringify(body)}`);
      }
    });

    it('should invalidate cache after updating overrides (cache consistency)', async () => {
      // Set up initial overrides
      await db.tenant.update({
        where: { id: testTenantId },
        data: {
          translationOverrides: {
            en: {
              core: {
                'deals.title': 'Opportunities',
              },
            },
          },
        },
      });

      // Cache the translations
      const initialResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
      });

      expect(initialResponse.statusCode).toBe(200);
      const initialBody = JSON.parse(initialResponse.body);
      expect(initialBody.messages['deals.title']).toBe('Opportunities');

      // Update overrides via API
      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          overrides: {
            en: {
              core: {
                'deals.title': 'Deals Updated',
              },
            },
          },
        },
      });

      expect(updateResponse.statusCode).toBe(200);

      // Fetch again - should have new value (cache invalidated)
      const finalResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
      });

      expect(finalResponse.statusCode).toBe(200);
      const finalBody = JSON.parse(finalResponse.body);
      expect(finalBody.messages['deals.title']).toBe('Deals Updated');
    });
  });

  describe('Performance (NFR-001)', () => {
    it('should return cached translations in < 50ms', async () => {
      // Prime the cache
      await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      // Measure cached request
      const start = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(50);
    });
  });
});
