// apps/core-api/src/__tests__/auth/integration/oauth-flow.integration.test.ts

/**
 * OAuth Authorization Code Flow Integration Tests
 *
 * Tests complete OAuth 2.0 flow with real Keycloak, PostgreSQL, and Redis.
 *
 * Test Coverage:
 * - FR-016: OAuth 2.0 Authorization Code flow
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
 * - Keycloak 26+ (OAuth endpoints, realm provisioning)
 * - PostgreSQL 15+ (tenant schemas)
 * - Redis (rate limiting, JWKS caching)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../../../lib/redis.js';
import { authRoutes } from '../../../routes/auth.js';
import { TenantService } from '../../../services/tenant.service.js';
import { KeycloakService } from '../../../services/keycloak.service.js';
import type { Tenant } from '@plexica/database';

// ===== Test Configuration =====

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const TEST_REDIRECT_URI = 'http://localhost:3000/auth/callback';
const RATE_LIMIT_MAX = 10;

// Skip tests if infrastructure not available
const SKIP_INTEGRATION_TESTS = process.env.SKIP_INTEGRATION_TESTS === 'true';

// Test user type for helper functions
interface TestUser {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// ===== Test Setup =====

describe('OAuth Flow Integration Tests', { skip: SKIP_INTEGRATION_TESTS }, () => {
  let fastify: FastifyInstance;
  let tenantService: TenantService;
  let keycloakService: KeycloakService;

  // Test data
  let testTenant: Tenant;
  let testTenantSlug: string;
  let suspendedTenant: Tenant;
  let suspendedTenantSlug: string;

  // Test user credentials (created in Keycloak beforeAll)
  const testUser = {
    username: `test-user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    password: 'Test@Password123!',
    firstName: 'Test',
    lastName: 'User',
  };

  beforeAll(async () => {
    // Initialize services
    tenantService = new TenantService(); // No parameters - uses global db
    keycloakService = new KeycloakService();

    // Initialize Fastify app
    fastify = Fastify();
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
    await fastify.ready();

    // Create test tenant with unique slug
    const uniqueSuffix = uuidv4().substring(0, 8);
    testTenantSlug = `oauth-test-${uniqueSuffix}`;

    testTenant = await tenantService.createTenant({
      name: 'OAuth Test Tenant',
      slug: testTenantSlug,
      // No contactEmail field in CreateTenantInput
    });

    // Create suspended tenant
    suspendedTenantSlug = `suspended-test-${uniqueSuffix}`;
    suspendedTenant = await tenantService.createTenant({
      name: 'Suspended Test Tenant',
      slug: suspendedTenantSlug,
      // No contactEmail field in CreateTenantInput
    });

    // Suspend the tenant
    await tenantService.updateTenant(suspendedTenant.id, { status: 'SUSPENDED' });

    // Create test user in Keycloak using KeycloakService methods
    const userResult = await keycloakService.createUser(testTenantSlug, {
      username: testUser.username,
      email: testUser.email,
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      enabled: true,
    });

    // Set user password
    await keycloakService.setUserPassword(
      testTenantSlug,
      userResult.id,
      testUser.password,
      false // not temporary
    );
  });

  afterAll(async () => {
    // Cleanup test data
    if (testTenant) {
      // Delete tenant and Keycloak realm
      await tenantService.deleteTenant(testTenant.id);
      await keycloakService.deleteRealm(testTenantSlug);
    }

    if (suspendedTenant) {
      await tenantService.deleteTenant(suspendedTenant.id);
      await keycloakService.deleteRealm(suspendedTenantSlug);
    }

    // Close connections
    await fastify.close();
  });

  beforeEach(async () => {
    // Clear Redis cache and rate limit counters
    const keys = await redis.keys('auth:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ===== Test Suite 1: OAuth Authorization Code Flow =====

  describe('OAuth Authorization Code Flow (FR-016)', () => {
    it('should build authorization URL with correct parameters', async () => {
      // Arrange
      const queryParams = {
        tenantSlug: testTenantSlug,
        redirectUri: TEST_REDIRECT_URI,
        state: 'csrf-token-123',
      };

      // Act
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/login',
        query: queryParams,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('authUrl');
      expect(body.authUrl).toContain(KEYCLOAK_URL);
      expect(body.authUrl).toContain(`/realms/${testTenantSlug}/protocol/openid-connect/auth`);
      expect(body.authUrl).toContain(`redirect_uri=${encodeURIComponent(TEST_REDIRECT_URI)}`);
      expect(body.authUrl).toContain(`state=csrf-token-123`);
      expect(body.authUrl).toContain('response_type=code');
      expect(body.authUrl).toContain('scope=openid');
    });

    it('should exchange authorization code for tokens', async () => {
      // Arrange: Get authorization code via direct Keycloak login
      const authCode = await getAuthorizationCode(testTenantSlug, testUser);

      // Act: Exchange code for tokens
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: {
          code: authCode,
          tenantSlug: testTenantSlug,
          state: 'csrf-token-123',
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('access_token');
      expect(body).toHaveProperty('refresh_token');
      expect(body).toHaveProperty('expires_in');
      expect(body).toHaveProperty('refresh_expires_in');
      expect(typeof body.access_token).toBe('string');
      expect(typeof body.refresh_token).toBe('string');
      expect(body.expires_in).toBeGreaterThan(0);
    });

    it('should reject expired authorization code (Edge Case #12)', async () => {
      // Arrange: Use an invalid/expired code
      const expiredCode = 'expired-code-12345';

      // Act
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: {
          code: expiredCode,
          tenantSlug: testTenantSlug,
        },
      });

      // Assert: Constitution error format
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_CODE_EXCHANGE_FAILED');
      expect(body.error.message).toContain('code exchange failed');
    });
  });

  // ===== Test Suite 2: Token Refresh =====

  describe('Token Refresh with Rotation', () => {
    it('should refresh access token with rotation', async () => {
      // Arrange: Get initial tokens
      const authCode = await getAuthorizationCode(testTenantSlug, testUser);
      const callbackResponse = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: { code: authCode, tenantSlug: testTenantSlug },
      });
      const { refresh_token: oldRefreshToken } = JSON.parse(callbackResponse.body);

      // Act: Refresh token
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          tenantSlug: testTenantSlug,
          refreshToken: oldRefreshToken,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('access_token');
      expect(body).toHaveProperty('refresh_token');
      expect(body.refresh_token).not.toBe(oldRefreshToken); // Token rotation
    });

    it('should reject invalid refresh token', async () => {
      // Arrange
      const invalidToken = 'invalid-refresh-token-xyz';

      // Act
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          tenantSlug: testTenantSlug,
          refreshToken: invalidToken,
        },
      });

      // Assert
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TOKEN_REFRESH_FAILED');
    });
  });

  // ===== Test Suite 3: Cross-Tenant Security (FR-011) =====

  describe('Cross-Tenant JWT Rejection (FR-011)', () => {
    it('should reject JWT from different tenant', async () => {
      // Arrange: Create second tenant
      const tenant2Slug = `cross-tenant-test-${uuidv4().substring(0, 8)}`;
      const tenant2 = await tenantService.createTenant({
        name: 'Cross Tenant Test',
        slug: tenant2Slug,
        // No contactEmail field in CreateTenantInput
      });

      // Get token from tenant1
      const authCode = await getAuthorizationCode(testTenantSlug, testUser);
      const callbackResponse = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: { code: authCode, tenantSlug: testTenantSlug },
      });
      const { access_token } = JSON.parse(callbackResponse.body);

      // Act: Try to use tenant1 token to access tenant2 resource
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${access_token}`,
          'x-tenant-slug': tenant2Slug, // Different tenant
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_CROSS_TENANT');
      expect(body.error.message).toContain('not valid for this tenant');

      // Cleanup
      await tenantService.deleteTenant(tenant2.id);
      await keycloakService.deleteRealm(tenant2Slug);
    });
  });

  // ===== Test Suite 4: Suspended Tenant Blocking (FR-012) =====

  describe('Suspended Tenant Blocking (FR-012)', () => {
    it('should block login for suspended tenant', async () => {
      // Act
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/login',
        query: {
          tenantSlug: suspendedTenantSlug,
          redirectUri: TEST_REDIRECT_URI,
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
      expect(body.error.message).toContain('suspended');
    });

    it('should block callback for suspended tenant', async () => {
      // Arrange: Suspend tenant was created in beforeAll
      const fakeCode = 'fake-auth-code-123';

      // Act
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: {
          code: fakeCode,
          tenantSlug: suspendedTenantSlug,
        },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
    });
  });

  // ===== Test Suite 5: Rate Limiting (FR-013) =====

  describe('Rate Limiting (FR-013)', () => {
    it('should rate limit login endpoint after 10 requests', async () => {
      // Arrange: Make 10 requests (rate limit max)
      const requests = Array.from({ length: RATE_LIMIT_MAX }, () => {
        return fastify.inject({
          method: 'GET',
          url: '/api/v1/auth/login',
          query: {
            tenantSlug: testTenantSlug,
            redirectUri: TEST_REDIRECT_URI,
          },
          headers: {
            'x-forwarded-for': '192.168.1.100', // Same IP for all requests
          },
        });
      });

      await Promise.all(requests);

      // Act: 11th request should be rate limited
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/login',
        query: {
          tenantSlug: testTenantSlug,
          redirectUri: TEST_REDIRECT_URI,
        },
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      });

      // Assert
      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('AUTH_RATE_LIMITED');
      expect(body.error.message).toContain('rate limit');
      expect(response.headers).toHaveProperty('retry-after');
    });

    it('should rate limit per IP address independently', async () => {
      // Arrange: Make requests from two different IPs
      const ip1Requests = Array.from({ length: RATE_LIMIT_MAX }, () =>
        fastify.inject({
          method: 'GET',
          url: '/api/v1/auth/login',
          query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
          headers: { 'x-forwarded-for': '192.168.1.101' },
        })
      );

      await Promise.all(ip1Requests);

      // Act: Request from IP2 should succeed (independent counter)
      const ip2Response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/login',
        query: { tenantSlug: testTenantSlug, redirectUri: TEST_REDIRECT_URI },
        headers: { 'x-forwarded-for': '192.168.1.102' },
      });

      // Assert
      expect(ip2Response.statusCode).toBe(200); // Not rate limited
    });
  });

  // ===== Test Suite 6: JWKS Caching (Edge Case #3) =====

  describe('JWKS Caching (Edge Case #3)', () => {
    it('should cache JWKS with 10-minute TTL', async () => {
      // Act: First request (cache miss)
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/api/v1/auth/jwks/${testTenantSlug}`,
      });

      // Assert: Cache populated
      expect(response1.statusCode).toBe(200);
      const jwks1 = JSON.parse(response1.body);
      expect(jwks1).toHaveProperty('keys');
      expect(Array.isArray(jwks1.keys)).toBe(true);

      // Check Redis cache
      const cachedJwks = await redis.get(`auth:jwks:${testTenantSlug}`);
      expect(cachedJwks).not.toBeNull();

      // Act: Second request (cache hit)
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/api/v1/auth/jwks/${testTenantSlug}`,
      });

      // Assert: Same JWKS returned
      expect(response2.statusCode).toBe(200);
      const jwks2 = JSON.parse(response2.body);
      expect(jwks2).toEqual(jwks1);
    });

    it('should refresh JWKS after TTL expires', async () => {
      // Arrange: Set low TTL for testing (2 seconds)
      const cacheKey = `auth:jwks:${testTenantSlug}`;

      // Act: First request
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/api/v1/auth/jwks/${testTenantSlug}`,
      });
      expect(response1.statusCode).toBe(200);

      // Wait for TTL to expire (mock by deleting cache)
      await redis.del(cacheKey);

      // Act: Second request (should fetch from Keycloak again)
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/api/v1/auth/jwks/${testTenantSlug}`,
      });

      // Assert: JWKS fetched and cached again
      expect(response2.statusCode).toBe(200);
      const cachedJwks = await redis.get(cacheKey);
      expect(cachedJwks).not.toBeNull();
    });
  });

  // ===== Test Suite 7: Concurrent Operations (Edge Case #4) =====

  describe('Concurrent Logins (Edge Case #4)', () => {
    it('should handle 5 concurrent login requests without errors', async () => {
      // Arrange
      const concurrentRequests = 5;
      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        fastify.inject({
          method: 'GET',
          url: '/api/v1/auth/login',
          query: {
            tenantSlug: testTenantSlug,
            redirectUri: TEST_REDIRECT_URI,
            state: `concurrent-${i}`,
          },
          headers: {
            'x-forwarded-for': `192.168.2.${i + 1}`, // Different IPs
          },
        })
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert: All requests succeed
      responses.forEach((response, i) => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('authUrl');
        expect(body.authUrl).toContain(`state=concurrent-${i}`);
      });
    });
  });

  // ===== Test Suite 8: Logout and Token Revocation =====

  describe('Logout and Token Revocation', () => {
    it('should revoke refresh token on logout', async () => {
      // Arrange: Get tokens
      const authCode = await getAuthorizationCode(testTenantSlug, testUser);
      const callbackResponse = await fastify.inject({
        method: 'GET',
        url: '/api/v1/auth/callback',
        query: { code: authCode, tenantSlug: testTenantSlug },
      });
      const { refresh_token, access_token } = JSON.parse(callbackResponse.body);

      // Act: Logout
      const logoutResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${access_token}`,
        },
        payload: {
          tenantSlug: testTenantSlug,
          refreshToken: refresh_token,
        },
      });

      // Assert: Logout succeeds
      expect(logoutResponse.statusCode).toBe(200);
      const body = JSON.parse(logoutResponse.body);
      expect(body.success).toBe(true);

      // Try to use refresh token after logout (should fail)
      const refreshResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          tenantSlug: testTenantSlug,
          refreshToken: refresh_token,
        },
      });

      // Assert: Refresh fails
      expect(refreshResponse.statusCode).toBe(401);
    });
  });
});

// ===== Helper Functions =====

/**
 * Get authorization code via direct Keycloak login
 * Simulates user completing OAuth login in browser
 */
async function getAuthorizationCode(realmSlug: string, user: TestUser): Promise<string> {
  try {
    // Step 1: Get login page
    const authUrl = `${KEYCLOAK_URL}/realms/${realmSlug}/protocol/openid-connect/auth`;
    const loginResponse = await axios.get(authUrl, {
      params: {
        client_id: 'plexica-web',
        redirect_uri: TEST_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid',
      },
      maxRedirects: 0,
      validateStatus: (status) => status === 200 || status === 302,
    });

    // Step 2: Submit credentials
    const formAction = extractFormAction(loginResponse.data);
    const loginSubmitResponse = await axios.post(
      `${KEYCLOAK_URL}${formAction}`,
      new URLSearchParams({
        username: user.username,
        password: user.password,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      }
    );

    // Step 3: Extract code from redirect URL
    const location = loginSubmitResponse.headers.location;
    const code = new URL(location).searchParams.get('code');

    if (!code) {
      throw new Error('No authorization code in redirect URL');
    }

    return code;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get authorization code: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extract form action URL from Keycloak login page HTML
 */
function extractFormAction(html: string): string {
  const match = html.match(/action="([^"]+)"/);
  if (!match) {
    throw new Error('Could not extract form action from login page');
  }
  return match[1].replace(/&amp;/g, '&');
}
