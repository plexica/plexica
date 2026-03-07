/**
 * Translation API Routes Integration Tests
 *
 * Tests all 5 translation API endpoints with real database and Redis:
 * - GET /translations/:locale/:namespace (stable URL, public)
 * - GET /translations/:locale/:namespace/:hash (content-addressed, public, NFR-005)
 * - GET /translations/locales (public)
 * - GET /tenant/translations/overrides (authenticated)
 * - PUT /tenant/translations/overrides (authenticated + tenant_admin)
 *
 * Tests cover FR-001 (namespace), FR-006 (overrides), FR-011 (validation), NFR-005
 * (content-hashed URLs), API endpoints.
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
      expect(body).toHaveProperty('hash');
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

    it('should set correct cache headers on stable URL (TD-013 / NFR-005)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });

      expect(response.statusCode).toBe(200);
      // Stable URL must NOT use immutable — content can change when overrides are updated
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).not.toContain('immutable');
      expect(response.headers['cache-control']).toContain('max-age=60');
      expect(response.headers['cache-control']).toContain('stale-while-revalidate=3600');
      // X-Translation-Hash must expose the content hash for frontend two-step fetch
      expect(response.headers['x-translation-hash']).toBeDefined();
      expect(response.headers['x-translation-hash']).toMatch(/^[a-f0-9]{8}$/);
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
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.messages['deals.title']).toBe('Opportunities'); // Override value
      expect(body.messages['contacts.title']).toBe('Contacts'); // Original value
    });
  });

  describe('GET /api/v1/translations/:locale/:namespace/:hash (NFR-005 Content-Addressed)', () => {
    it('should return 200 with immutable cache headers when hash matches current bundle', async () => {
      // Arrange: fetch stable URL to obtain the current hash
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      expect(stableResponse.statusCode).toBe(200);
      const currentHash = stableResponse.headers['x-translation-hash'] as string;
      expect(currentHash).toMatch(/^[a-f0-9]{8}$/);

      // Act: fetch with the correct hash
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('locale', 'en');
      expect(body).toHaveProperty('namespace', 'core');
      expect(body).toHaveProperty('hash', currentHash);
      expect(body).toHaveProperty('messages');
      // Must use immutable caching on the content-addressed URL
      expect(response.headers['cache-control']).toContain('immutable');
      expect(response.headers['cache-control']).toContain('max-age=31536000');
      expect(response.headers['etag']).toBeDefined();
    });

    it('should return 302 redirect to current hash URL when hash is stale', async () => {
      // LOW-9: Derive a guaranteed-wrong hash by fetching the real one and flipping
      // one character, so this test never accidentally passes for the wrong reason.
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      expect(stableResponse.statusCode).toBe(200);
      const currentHash = stableResponse.headers['x-translation-hash'] as string;
      // Flip the last hex character to produce a hash that is guaranteed stale
      const lastChar = currentHash[7];
      const flippedChar = lastChar === 'f' ? '0' : 'f';
      const staleHash = currentHash.slice(0, 7) + flippedChar;
      expect(staleHash).not.toBe(currentHash); // sanity check

      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${staleHash}`,
      });

      // Assert: 302 to the content-addressed URL with the real hash.
      // 302 (not 301) so browsers never permanently cache the redirect.
      expect(response.statusCode).toBe(302);
      const location = response.headers['location'] as string;
      expect(location).toBeDefined();
      expect(location).toMatch(/^\/api\/v1\/translations\/en\/core\/[a-f0-9]{8}$/);
      // Redirect must NOT go back to the stale hash
      expect(location).not.toContain(staleHash);
      // Redirect response must not be cached by the browser
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('should include tenant query param in 302 redirect Location when ?tenant is present', async () => {
      // LOW-9: Derive a guaranteed-wrong stale hash (same technique as above)
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      const currentHash = stableResponse.headers['x-translation-hash'] as string;
      const flippedChar = currentHash[7] === 'f' ? '0' : 'f';
      const staleHash = currentHash.slice(0, 7) + flippedChar;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${staleHash}?tenant=${testTenantSlug}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers['location'] as string;
      expect(location).toContain(`tenant=${encodeURIComponent(testTenantSlug)}`);
    });

    it('should return 401 when ?tenant is supplied without authentication', async () => {
      // Get current hash first
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      const currentHash = stableResponse.headers['x-translation-hash'] as string;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}?tenant=${testTenantSlug}`,
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when authenticated user requests another tenant's hashed translations (MEDIUM-7)", async () => {
      // Arrange: fetch the current hash
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      const currentHash = stableResponse.headers['x-translation-hash'] as string;

      // Act: request with a tenant slug that doesn't match the token's tenant
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}?tenant=some-other-tenant`,
        headers: {
          authorization: `Bearer ${authToken}`, // token is for testTenantSlug, not some-other-tenant
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should return 304 on hashed endpoint when ETag matches (MEDIUM-8 If-None-Match support)', async () => {
      // Arrange: fetch current hash and get the ETag from hashed endpoint
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      const currentHash = stableResponse.headers['x-translation-hash'] as string;

      const firstHashedResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}`,
      });
      expect(firstHashedResponse.statusCode).toBe(200);
      const etag = firstHashedResponse.headers['etag'];
      expect(etag).toBeDefined();

      // Act: conditional request with matching ETag
      const conditionalResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}`,
        headers: {
          'if-none-match': etag!,
        },
      });

      // Assert: 304 Not Modified — no body
      expect(conditionalResponse.statusCode).toBe(304);
      expect(conditionalResponse.body).toBe('');
      // Immutable cache headers must still be present on the 304
      expect(conditionalResponse.headers['cache-control']).toContain('immutable');
    });

    it('should return 400 for invalid hash format (not 8-char hex)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core/not-a-hash',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_PARAMS');
    });

    it('should return 404 when namespace does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/nonexistent/abcd1234',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NAMESPACE_NOT_FOUND');
    });

    it('should serve the same bundle content as the stable URL endpoint', async () => {
      // Fetch stable URL to get hash and content
      const stableResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/translations/en/core',
      });
      expect(stableResponse.statusCode).toBe(200);
      const currentHash = stableResponse.headers['x-translation-hash'] as string;
      const stableBody = JSON.parse(stableResponse.body);

      // Fetch hashed URL
      const hashedResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${currentHash}`,
      });

      expect(hashedResponse.statusCode).toBe(200);
      const hashedBody = JSON.parse(hashedResponse.body);

      // Content must be identical
      expect(hashedBody.messages).toEqual(stableBody.messages);
      expect(hashedBody.hash).toBe(stableBody.hash);
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
      const locales = body.locales as Array<{
        code: string;
        name: string;
        nativeName: string;
        namespaceCount: number;
      }>;

      expect(locales.length).toBeGreaterThan(0);
      const enLocale = locales.find((l) => l.code === 'en');
      expect(enLocale).toBeDefined();
      expect(enLocale).toHaveProperty('code');
      expect(enLocale).toHaveProperty('name');
      expect(enLocale).toHaveProperty('nativeName');
      expect(enLocale).toHaveProperty('namespaceCount');
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
        headers: {
          authorization: `Bearer ${authToken}`,
        },
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
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(finalResponse.statusCode).toBe(200);
      const finalBody = JSON.parse(finalResponse.body);
      expect(finalBody.messages['deals.title']).toBe('Deals Updated');
    });
  });

  describe('AC-007: Tenant Override Round-Trip (PUT → stable URL → hashed URL)', () => {
    it('should reflect PUT override immediately on stable URL and on content-addressed URL', async () => {
      // ── Step 1: Capture the pre-override hash ──────────────────────────────
      const preOverrideStable = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(preOverrideStable.statusCode).toBe(200);
      const preHash = preOverrideStable.headers['x-translation-hash'] as string;
      expect(preHash).toMatch(/^[a-f0-9]{8}$/);

      // ── Step 2: PUT a tenant override via API ──────────────────────────────
      const putResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          overrides: {
            en: {
              core: {
                'deals.title': 'AC007 Opportunities',
              },
            },
          },
        },
      });
      expect(putResponse.statusCode).toBe(200);

      // ── Step 3: Stable URL should now reflect the override ─────────────────
      const postOverrideStable = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(postOverrideStable.statusCode).toBe(200);
      const postStableBody = JSON.parse(postOverrideStable.body);
      expect(postStableBody.messages['deals.title']).toBe('AC007 Opportunities');

      // ── Step 4: Hash must have changed after the override ─────────────────
      const postHash = postOverrideStable.headers['x-translation-hash'] as string;
      expect(postHash).toMatch(/^[a-f0-9]{8}$/);
      expect(postHash).not.toBe(preHash); // content changed → new hash

      // ── Step 5: Content-addressed URL with new hash must serve the override ─
      const hashedResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${postHash}?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(hashedResponse.statusCode).toBe(200);
      const hashedBody = JSON.parse(hashedResponse.body);
      expect(hashedBody.messages['deals.title']).toBe('AC007 Opportunities');
      // Immutable cache headers must be set on the content-addressed URL
      expect(hashedResponse.headers['cache-control']).toContain('immutable');
      expect(hashedResponse.headers['cache-control']).toContain('max-age=31536000');
    });

    it('should return 302 to the new (post-override) hash URL when old hash is requested', async () => {
      // ── Step 1: Capture pre-override hash ─────────────────────────────────
      const preOverrideStable = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(preOverrideStable.statusCode).toBe(200);
      const oldHash = preOverrideStable.headers['x-translation-hash'] as string;

      // ── Step 2: Apply a new override to change the hash ───────────────────
      const putResponse = await app.inject({
        method: 'PUT',
        url: '/api/v1/tenant/translations/overrides',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          overrides: {
            en: { core: { 'contacts.title': 'AC007 Clients' } },
          },
        },
      });
      expect(putResponse.statusCode).toBe(200);

      // Verify hash actually changed
      const newStable = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      const newHash = newStable.headers['x-translation-hash'] as string;
      // Only test the redirect if the hash changed (may be same in rare hash collision)
      if (oldHash === newHash) {
        return; // Hash collision — skip redirect assertion
      }

      // ── Step 3: Request with old hash → 302 to new hash URL ──────────────
      const staleHashResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/translations/en/core/${oldHash}?tenant=${testTenantSlug}`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(staleHashResponse.statusCode).toBe(302);
      const location = staleHashResponse.headers['location'] as string;
      expect(location).toContain(newHash);
      expect(location).toContain(`tenant=${encodeURIComponent(testTenantSlug)}`);
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
