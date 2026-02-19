// apps/core-api/src/__tests__/auth/integration/oauth-flow.integration.test.ts

/**
 * OAuth Authorization Code Flow Integration Tests
 *
 * Tests the auth routes via the full middleware stack (buildTestApp).
 * Uses mock HS256 tokens instead of real Keycloak to avoid needing a
 * live OAuth exchange in the integration test tier.
 *
 * Test Coverage:
 * - FR-016: OAuth 2.0 Authorization Code flow (URL building, error paths)
 * - FR-011: Cross-tenant JWT rejection
 * - FR-012: Suspended tenant blocking
 * - FR-013: Rate limiting (10 req/IP/min)
 * - Edge Case #3: JWKS TTL and cache refresh
 * - Edge Case #4: Concurrent logins
 * - Edge Case #12: Expired authorization code
 *
 * Constitution Compliance:
 * - Article 1.2: Multi-Tenancy Isolation
 * - Article 4.1: Test Coverage ≥80%
 * - Article 5.1: Tenant Validation
 * - Article 6.2: Error Format
 * - Article 8.2: Test Quality (AAA pattern, independent tests)
 *
 * Infrastructure Requirements:
 * - PostgreSQL 15+ (tenant schema)
 * - Redis (rate limiting, JWKS caching)
 * - No real Keycloak login flow required at this tier
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../../../lib/redis.js';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { TenantService } from '../../../services/tenant.service.js';
import { config } from '../../../config/index.js';
import type { TenantStatus } from '@plexica/database';

// ===== Test Configuration =====

const TEST_REDIRECT_URI = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3001/auth/callback';
const RATE_LIMIT_MAX = config.authRateLimitMax; // default 10

// Skip tests if integration infrastructure not available
const SKIP_INTEGRATION_TESTS = process.env.SKIP_INTEGRATION_TESTS === 'true';

// ===== Test Setup =====

describe('OAuth Flow Integration Tests', { skip: SKIP_INTEGRATION_TESTS }, () => {
  let app: FastifyInstance;
  let tenantService: TenantService;
  let superAdminToken: string;

  // Test data — created once per suite
  let testTenantSlug: string;
  let suspendedTenantId: string;
  let suspendedTenantSlug: string;

  beforeAll(async () => {
    // Build full app with all middleware
    app = await buildTestApp();
    await app.ready();

    tenantService = new TenantService();
    superAdminToken = testContext.auth.createMockSuperAdminToken();

    const uniqueSuffix = uuidv4().substring(0, 8);

    // ── Create active test tenant ──────────────────────────────────
    testTenantSlug = `oauth-int-${uniqueSuffix}`;

    const tenantResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'OAuth Integration Test Tenant',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (tenantResp.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResp.body}`);
    }

    // testTenantId not needed — tenant managed via API only
    void tenantResp.json().id;

    // ── Create suspended tenant ────────────────────────────────────
    suspendedTenantSlug = `suspended-int-${uniqueSuffix}`;

    const suspResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: suspendedTenantSlug,
        name: 'Suspended Integration Tenant',
        adminEmail: `admin@${suspendedTenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (suspResp.statusCode !== 201) {
      throw new Error(`Failed to create suspended tenant: ${suspResp.body}`);
    }

    suspendedTenantId = suspResp.json().id;

    // Suspend the tenant directly via service
    await tenantService.updateTenant(suspendedTenantId, {
      status: 'SUSPENDED' as TenantStatus,
    });
  }, 60_000); // 60s for Keycloak provisioning

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear auth rate-limit keys and global rate-limit keys before each test
    const authKeys = await redis.keys('auth:ratelimit:*');
    if (authKeys.length > 0) await redis.del(...authKeys);

    const globalKeys = await redis.keys('test-rate-limit:*');
    if (globalKeys.length > 0) await redis.del(...globalKeys);

    // Clear JWKS cache
    const jwksKeys = await redis.keys('auth:jwks:*');
    if (jwksKeys.length > 0) await redis.del(...jwksKeys);
  });

  // ===== Test Suite 1: Authorization URL Building (FR-016) =====

  describe('OAuth Authorization URL Building (FR-016)', () => {
    it('should return authorization URL with correct parameters', async () => {
      // Arrange
      const state = 'csrf-token-123';

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        query: {
          tenantSlug: testTenantSlug,
          redirectUri: TEST_REDIRECT_URI,
          state,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('authUrl');
      expect(body.authUrl).toContain(`/realms/${testTenantSlug}/protocol/openid-connect/auth`);
      expect(body.authUrl).toContain(encodeURIComponent(TEST_REDIRECT_URI));
      expect(body.authUrl).toContain(`state=${state}`);
      expect(body.authUrl).toContain('response_type=code');
      expect(body.authUrl).toContain('scope=openid');
    });

    it('should include code_challenge in authorization URL (PKCE)', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        query: {
          tenantSlug: testTenantSlug,
          redirectUri: TEST_REDIRECT_URI,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.authUrl).toContain('code_challenge');
      expect(body.authUrl).toContain('code_challenge_method=S256');
    });
  });

  // ===== Test Suite 2: Expired / Invalid Authorization Code (Edge Case #12) =====

  describe('Authorization Code Exchange (Edge Case #12)', () => {
    it('should reject expired or invalid authorization code', async () => {
      // Arrange
      const expiredCode = 'invalid-code-xyz-12345';

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/callback',
        query: {
          code: expiredCode,
          tenantSlug: testTenantSlug,
          codeVerifier: 'some-code-verifier',
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_CODE_EXCHANGE_FAILED');
    });
  });

  // ===== Test Suite 3: Token Refresh Error Path =====

  describe('Token Refresh (Error Path)', () => {
    it('should reject invalid refresh token', async () => {
      // Arrange
      const invalidToken = 'invalid-refresh-token-xyz';

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          tenantSlug: testTenantSlug,
          refreshToken: invalidToken,
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TOKEN_REFRESH_FAILED');
    });
  });

  // ===== Test Suite 4: Cross-Tenant JWT Rejection (FR-011) =====

  describe('Cross-Tenant JWT Rejection (FR-011)', () => {
    it('should reject JWT from different tenant when accessing with wrong tenant header', async () => {
      // Arrange: Create second tenant
      const tenant2Slug = `cross-tenant-int-${uuidv4().substring(0, 8)}`;

      const tenant2Resp = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          slug: tenant2Slug,
          name: 'Cross Tenant Int Test',
          adminEmail: `admin@${tenant2Slug}.test`,
          adminPassword: 'test123',
        },
      });

      if (tenant2Resp.statusCode !== 201) {
        throw new Error(`Failed to create cross-tenant test tenant: ${tenant2Resp.body}`);
      }

      // Use a mock token scoped to testTenantSlug
      const tenant1Token = testContext.auth.createMockTenantAdminToken(testTenantSlug);

      // Act: Present testTenantSlug token but claim to be tenant2 via header
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${tenant1Token}`,
          'x-tenant-slug': tenant2Slug, // Mismatched tenant
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_CROSS_TENANT');
    }, 30_000);
  });

  // ===== Test Suite 5: Suspended Tenant Blocking (FR-012) =====

  describe('Suspended Tenant Blocking (FR-012)', () => {
    it('should block login URL generation for suspended tenant', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        query: {
          tenantSlug: suspendedTenantSlug,
          redirectUri: TEST_REDIRECT_URI,
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
      expect(body.error.message).toContain('suspended');
    });

    it('should block callback for suspended tenant', async () => {
      // Arrange: suspended tenant created in beforeAll
      const fakeCode = 'fake-auth-code-123';

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/callback',
        query: {
          code: fakeCode,
          tenantSlug: suspendedTenantSlug,
          codeVerifier: 'some-verifier',
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
    });
  });

  // ===== Test Suite 6: Rate Limiting (FR-013) =====

  describe('Rate Limiting (FR-013)', () => {
    it('should rate limit after RATE_LIMIT_MAX requests from the same IP', async () => {
      // Arrange: exhaust the per-IP limit
      const ip = '192.168.50.100';

      for (let i = 0; i < RATE_LIMIT_MAX; i++) {
        const r = await app.inject({
          method: 'GET',
          url: '/api/auth/login',
          query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
          headers: { 'x-forwarded-for': ip },
        });
        expect(r.statusCode).toBe(200);
      }

      // Act: one more request from the same IP
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
        headers: { 'x-forwarded-for': ip },
      });

      // Assert
      expect(response.statusCode).toBe(429);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_RATE_LIMITED');
      expect(response.headers).toHaveProperty('retry-after');
    });

    it('should NOT rate limit a different IP independently', async () => {
      // Arrange: exhaust limit for ip1
      const ip1 = '192.168.50.101';
      const ip2 = '192.168.50.102';

      for (let i = 0; i < RATE_LIMIT_MAX; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/auth/login',
          query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
          headers: { 'x-forwarded-for': ip1 },
        });
      }

      // Act: request from ip2 should succeed
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/login',
        query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
        headers: { 'x-forwarded-for': ip2 },
      });

      // Assert
      expect(response.statusCode).toBe(200);
    });
  });

  // ===== Test Suite 7: JWKS Caching (Edge Case #3) =====

  describe('JWKS Caching (Edge Case #3)', () => {
    it('should return JWKS and populate Redis cache', async () => {
      // Act: first request (cache miss)
      const response1 = await app.inject({
        method: 'GET',
        url: `/api/auth/jwks/${testTenantSlug}`,
      });

      // Assert
      expect(response1.statusCode).toBe(200);
      const jwks1 = response1.json();
      expect(jwks1).toHaveProperty('keys');
      expect(Array.isArray(jwks1.keys)).toBe(true);

      // Redis should now have the cached value
      const cached = await redis.get(`auth:jwks:${testTenantSlug}`);
      expect(cached).not.toBeNull();

      // Act: second request (cache hit)
      const response2 = await app.inject({
        method: 'GET',
        url: `/api/auth/jwks/${testTenantSlug}`,
      });

      // Assert: same response
      expect(response2.statusCode).toBe(200);
      expect(response2.json()).toEqual(jwks1);
    });

    it('should re-fetch JWKS after cache is cleared', async () => {
      const cacheKey = `auth:jwks:${testTenantSlug}`;

      // Prime the cache
      await app.inject({
        method: 'GET',
        url: `/api/auth/jwks/${testTenantSlug}`,
      });

      // Simulate TTL expiry by deleting the cache key
      await redis.del(cacheKey);

      // Act: request again (cache miss → re-fetched from Keycloak)
      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/jwks/${testTenantSlug}`,
      });

      // Assert: re-fetched and cached again
      expect(response.statusCode).toBe(200);
      const cachedAfter = await redis.get(cacheKey);
      expect(cachedAfter).not.toBeNull();
    });
  });

  // ===== Test Suite 8: Concurrent Logins (Edge Case #4) =====

  describe('Concurrent Logins (Edge Case #4)', () => {
    it('should handle 5 concurrent login requests from different IPs without errors', async () => {
      // Arrange: 5 concurrent requests, each from a distinct IP
      const requests = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: 'GET',
          url: '/api/auth/login',
          query: {
            tenantSlug: testTenantSlug,
            redirectUri: TEST_REDIRECT_URI,
            state: `concurrent-${i}`,
          },
          headers: { 'x-forwarded-for': `192.168.60.${i + 1}` },
        })
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert: all succeed
      responses.forEach((response, i) => {
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body).toHaveProperty('authUrl');
        expect(body.authUrl).toContain(`state=concurrent-${i}`);
      });
    });
  });
});
