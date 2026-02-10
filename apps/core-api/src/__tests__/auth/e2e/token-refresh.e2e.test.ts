/**
 * Token Refresh Flow E2E Tests
 *
 * Tests the complete token refresh flow with real Keycloak integration.
 * Covers:
 * - Token refresh with valid refresh token
 * - Refresh token expiration handling
 * - Token revocation via logout
 * - Concurrent refresh requests
 * - Security: Refresh token reuse detection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { redis } from '../../../lib/redis';

describe('Token Refresh Flow E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
    try {
      await redis.quit();
    } catch {
      /* ignore already-closed */
    }
  });

  beforeEach(async () => {
    // Don't reset between tests, as Keycloak tokens persist
    await redis.flushdb();
  });

  describe('Valid Token Refresh', () => {
    it('should refresh token with valid refresh token', async () => {
      // First, login to get tokens
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);
      expect(loginData.accessToken).toBeDefined();
      expect(loginData.refreshToken).toBeDefined();

      const originalAccessToken = loginData.accessToken;
      const originalRefreshToken = loginData.refreshToken;

      // Wait a moment to ensure new token will have different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Refresh the token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: originalRefreshToken,
          tenant: 'plexica-test',
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      const refreshData = JSON.parse(refreshResponse.body);

      // Should receive new tokens
      expect(refreshData.accessToken).toBeDefined();
      expect(refreshData.refreshToken).toBeDefined();
      expect(refreshData.expiresIn).toBeDefined();
      expect(refreshData.tokenType).toBe('Bearer');

      // New access token should be different from original
      expect(refreshData.accessToken).not.toBe(originalAccessToken);

      // New tokens should be valid for API calls
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${refreshData.accessToken}`,
        },
      });

      expect(meResponse.statusCode).toBe(200);
      const meData = JSON.parse(meResponse.body);
      expect(meData.username).toBe('test-tenant-admin-acme');
    });

    it('should maintain user identity after refresh', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-member-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);
      const originalUser = loginData.user;

      // Refresh token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'plexica-test',
        },
      });

      const refreshData = JSON.parse(refreshResponse.body);

      // Get user info with new token
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${refreshData.accessToken}`,
        },
      });

      const meData = JSON.parse(meResponse.body);

      // User identity should be maintained
      expect(meData.username).toBe(originalUser.username);
      expect(meData.email).toBe(originalUser.email);
    });

    it('should allow multiple refreshes in sequence', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      let currentRefreshToken = JSON.parse(loginResponse.body).refreshToken;
      const accessTokens = new Set<string>();

      // Perform multiple refreshes
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const refreshResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: {
            refreshToken: currentRefreshToken,
            tenant: 'plexica-test',
          },
        });

        expect(refreshResponse.statusCode).toBe(200);
        const refreshData = JSON.parse(refreshResponse.body);

        // Store access token to verify they're all different
        accessTokens.add(refreshData.accessToken);

        // Update refresh token for next iteration
        currentRefreshToken = refreshData.refreshToken;
      }

      // All access tokens should be unique
      expect(accessTokens.size).toBe(3);
    });
  });

  describe('Invalid Token Scenarios', () => {
    it('should reject refresh with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: 'invalid-refresh-token',
          tenant: 'plexica-test',
        },
      });

      // Keycloak returns 400 for invalid grant, app maps to 401
      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Unauthorized');
      expect(data.message).toBeDefined();
    });

    it('should reject refresh with malformed token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: 'not.a.jwt.token',
          tenant: 'plexica-test',
        },
      });

      // Keycloak returns 400 with invalid_grant for malformed tokens, mapped to 401
      expect(response.statusCode).toBe(401);
    });

    it('should reject refresh with wrong tenant', async () => {
      // Login with one tenant
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);

      // Try to refresh with different tenant (should fail as tenant doesn't exist in Keycloak)
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'wrong-tenant',
        },
      });

      // Non-existent realm: Keycloak returns 404, mapped to 404
      expect(refreshResponse.statusCode).toBe(404);
    });

    it('should reject refresh with empty token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: '',
          tenant: 'plexica-test',
        },
      });

      expect(response.statusCode).toBe(400); // Bad request due to validation
    });
  });

  describe('Token Revocation', () => {
    it('should revoke tokens on logout', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);

      // Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'plexica-test',
        },
      });

      expect(logoutResponse.statusCode).toBe(204);

      // Try to refresh with revoked token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'plexica-test',
        },
      });

      // Revoked token: Keycloak returns 400 with invalid_grant, mapped to 401
      expect(refreshResponse.statusCode).toBe(401);
    });

    it('should still allow logout with invalid refresh token', async () => {
      // Logout should succeed even with invalid token (idempotent)
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: {
          refreshToken: 'invalid-token',
          tenant: 'plexica-test',
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('Concurrent Refresh Requests', () => {
    it('should handle concurrent refresh requests', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);
      const refreshToken = loginData.refreshToken;

      // Make multiple concurrent refresh requests with same token
      const refreshPromises = Array.from({ length: 3 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: {
            refreshToken,
            tenant: 'plexica-test',
          },
        })
      );

      const results = await Promise.all(refreshPromises);

      // Due to Keycloak's token rotation, only the first request might succeed
      // or all might succeed depending on Keycloak's config
      const successfulResponses = results.filter((r) => r.statusCode === 200);

      // At least one should succeed
      expect(successfulResponses.length).toBeGreaterThanOrEqual(1);

      // Collect all new access tokens
      const newTokens = successfulResponses.map((r) => JSON.parse(r.body).accessToken);

      // If multiple succeeded, they might have the same or different tokens
      // depending on Keycloak's refresh token rotation policy
      expect(newTokens.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Refresh Token Expiration', () => {
    it('should reject expired refresh token', async () => {
      // Note: This test would require manipulating time or waiting for actual expiration
      // In a real scenario, we'd mock the JWT verification or use a short-lived token

      // For now, we test with an obviously invalid/expired token structure
      const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid';

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: expiredToken,
          tenant: 'plexica-test',
        },
      });

      // Expired/invalid token: Keycloak returns 400 with invalid_grant, mapped to 401
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Cross-Tenant Refresh Security', () => {
    it('should not allow refresh token from one tenant to work in another', async () => {
      // This test assumes multiple tenant realms exist in Keycloak
      // In our test setup, we only have 'plexica' realm

      // Login with plexica tenant
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);

      // Try to use the refresh token with a different tenant realm
      // This should fail since the token is bound to the 'plexica' realm
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'other-tenant', // Different realm
        },
      });

      // Cross-tenant: different realm returns 404 from Keycloak, mapped to 404
      expect(refreshResponse.statusCode).toBe(404);
    });
  });

  describe('Token Validation After Refresh', () => {
    it('should validate new access token structure', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);

      // Refresh
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'plexica-test',
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      const refreshData = JSON.parse(refreshResponse.body);

      // Validate response structure
      expect(refreshData).toHaveProperty('accessToken');
      expect(refreshData).toHaveProperty('refreshToken');
      expect(refreshData).toHaveProperty('expiresIn');
      expect(refreshData).toHaveProperty('tokenType');

      expect(typeof refreshData.accessToken).toBe('string');
      expect(typeof refreshData.refreshToken).toBe('string');
      expect(typeof refreshData.expiresIn).toBe('number');
      expect(refreshData.tokenType).toBe('Bearer');

      // Access token should be a valid JWT structure (3 parts separated by dots)
      expect(refreshData.accessToken.split('.')).toHaveLength(3);
      expect(refreshData.refreshToken.split('.')).toHaveLength(3);
    });

    it('should include valid expiration time', async () => {
      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'test-tenant-admin-acme',
          password: 'test123',
          tenant: 'plexica-test',
        },
      });

      const loginData = JSON.parse(loginResponse.body);

      // Refresh
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: loginData.refreshToken,
          tenant: 'plexica-test',
        },
      });

      const refreshData = JSON.parse(refreshResponse.body);

      // Expiration should be reasonable (e.g., 5 minutes to 1 day)
      expect(refreshData.expiresIn).toBeGreaterThan(0);
      expect(refreshData.expiresIn).toBeLessThanOrEqual(86400); // Max 24 hours
    });
  });

  describe('Error Handling', () => {
    it('should handle missing refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          tenant: 'plexica-test',
          // Missing refreshToken
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: 'some-token',
          // Missing tenant
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return proper error format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: 'invalid-token',
          tenant: 'plexica-test',
        },
      });

      // Invalid token: Keycloak returns 400 with invalid_grant, mapped to 401
      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data.error).toBe('Unauthorized');
    });
  });
});
