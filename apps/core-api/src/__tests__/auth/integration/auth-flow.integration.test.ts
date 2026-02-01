/**
 * Authentication Flow Integration Tests
 *
 * Tests the complete authentication flow using real Keycloak and database.
 * This verifies that users can authenticate, tokens are validated, and
 * permissions are correctly enforced.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import type { FastifyInstance } from 'fastify';

describe('Auth Flow Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Build Fastify app
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testContext.cleanup();
  });

  describe('Token-based Authentication', () => {
    it('should authenticate with valid JWT token', async () => {
      // Get real token from Keycloak
      const tokenResponse = await testContext.auth.getRealSuperAdminToken();

      // Make authenticated request
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
      });
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: {
          authorization: 'Bearer invalid-token-here',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with expired token', async () => {
      // Create token that expires immediately
      const expiredToken = testContext.auth.createMockToken(
        {
          sub: 'test-user',
          email: 'test@example.com',
        },
        -1 // Expired
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Role-based Authorization', () => {
    it('should allow super admin to access admin endpoints', async () => {
      const tokenResponse = await testContext.auth.getRealSuperAdminToken();

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });

      expect(response.statusCode).not.toBe(403);
    });

    it('should deny tenant member access to admin endpoints', async () => {
      const tokenResponse = await testContext.auth.getRealTenantMemberToken('acme');

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow tenant admin to access tenant resources', async () => {
      const tokenResponse = await testContext.auth.getRealTenantAdminToken('acme');

      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      expect(response.statusCode).not.toBe(403);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token successfully', async () => {
      const tokenResponse = await testContext.auth.getRealSuperAdminToken();

      expect(tokenResponse.refresh_token).toBeDefined();

      // TODO: Implement token refresh endpoint test
      // This requires implementing the refresh endpoint in the app
    });

    it('should reject refresh with invalid refresh token', async () => {
      // TODO: Test refresh with invalid token
    });
  });

  describe('Multi-tenant Token Validation', () => {
    it('should extract tenant ID from token', async () => {
      const tokenResponse = await testContext.auth.getRealTenantAdminToken('acme');

      const tenantId = testContext.auth.extractTenantId(tokenResponse.access_token);

      expect(tenantId).toBe('acme-corp');
    });

    it('should validate token belongs to correct tenant', async () => {
      const tokenResponse = await testContext.auth.getRealTenantAdminToken('acme');

      // Try to access demo-company resources with acme token
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
          'x-tenant-id': 'demo-company', // Wrong tenant!
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Permission Enforcement', () => {
    it('should enforce workspace permissions', async () => {
      const tokenResponse = await testContext.auth.getRealTenantMemberToken('acme');

      // Member should not be able to delete workspace
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/workspaces/workspace-acme-default',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow admin to perform privileged operations', async () => {
      const tokenResponse = await testContext.auth.getRealTenantAdminToken('acme');

      // Admin should be able to create workspace
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tokenResponse.access_token}`,
          'x-tenant-id': 'acme-corp',
          'content-type': 'application/json',
        },
        payload: {
          slug: 'test-workspace',
          name: 'Test Workspace',
        },
      });

      expect(response.statusCode).not.toBe(403);
    });
  });
});
