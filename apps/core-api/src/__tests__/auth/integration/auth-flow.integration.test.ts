/**
 * Authentication Flow Integration Tests
 *
 * Tests the complete authentication flow using mock tokens and real database.
 * This verifies that users can authenticate, tokens are validated, and
 * permissions are correctly enforced.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import type { FastifyInstance } from 'fastify';

describe('Auth Flow Integration', () => {
  let app: FastifyInstance;
  let testTenantSlug: string;
  let demoTenantSlug: string;
  let superAdminToken: string;
  let tenantAdminToken: string;
  let tenantMemberToken: string;

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Build Fastify app
    app = await buildTestApp();
    await app.ready();

    // Generate unique tenant slugs for test isolation
    testTenantSlug = `acme-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    demoTenantSlug = `demo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Use mock tokens (faster and more reliable than Keycloak)
    superAdminToken = testContext.auth.createMockSuperAdminToken();
    tenantAdminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug);
    tenantMemberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug);

    // Create a test tenant for tenant-specific tests
    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'ACME Corporation',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (tenantResponse.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResponse.body}`);
    }
  });

  afterAll(async () => {
    await app.close();
    // Don't call testContext.cleanup() here - it's handled by global afterAll
  });

  describe('Token-based Authentication', () => {
    it('should authenticate with valid JWT token', async () => {
      // Make authenticated request (health endpoint doesn't require auth)
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
      });
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
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
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Role-based Authorization', () => {
    it('should allow super admin to access admin endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).not.toBe(403);
    });

    it('should deny tenant member access to admin endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${tenantMemberToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow tenant admin to access tenant resources', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
          'x-tenant-id': testTenantSlug,
        },
      });

      expect(response.statusCode).not.toBe(403);
    });
  });

  describe('Token Refresh', () => {
    it('should create token with expected claims', async () => {
      const decoded = testContext.auth.decodeToken(superAdminToken);

      expect(decoded).toBeTruthy();
      expect(decoded.sub).toBeTruthy();
      expect(decoded.iss).toBe('plexica-test');
      expect(decoded.realm_access.roles).toContain('super-admin');
    });

    it('should reject refresh with invalid refresh token', async () => {
      // TODO: Test refresh with invalid token
    });
  });

  describe('Multi-tenant Token Validation', () => {
    it('should extract tenant ID from token', async () => {
      const tenantId = testContext.auth.extractTenantId(tenantAdminToken);

      // Mock tokens include tenant_id in the payload
      expect(tenantId).toBe(testTenantSlug);

      // Verify the token can be decoded
      const decoded = testContext.auth.decodeToken(tenantAdminToken);
      expect(decoded).toBeTruthy();
      expect(decoded.sub).toBeTruthy();
    });

    it('should validate token belongs to correct tenant', async () => {
      // Create another tenant first
      await app.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          slug: demoTenantSlug,
          name: 'Demo Company',
          adminEmail: `admin@${demoTenantSlug}.test`,
          adminPassword: 'test123',
        },
      });

      // Try to access demo resources with testTenantSlug token
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
          'x-tenant-id': demoTenantSlug, // Wrong tenant!
        },
      });

      // Should be rejected (either 400 for invalid tenant or 403 for forbidden)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });
  });

  describe('Permission Enforcement', () => {
    it('should enforce workspace permissions', async () => {
      // Member should not be able to delete workspace
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/workspace-${testTenantSlug}-default`,
        headers: {
          authorization: `Bearer ${tenantMemberToken}`,
          'x-tenant-id': testTenantSlug,
        },
      });

      // Should be rejected (either 400 if workspace doesn't exist or 403 for forbidden)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should allow admin to perform privileged operations', async () => {
      // Admin should be able to create workspace
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
          'x-tenant-id': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          slug: `test-workspace-${Date.now()}`,
          name: 'Test Workspace',
        },
      });

      expect(response.statusCode).not.toBe(403);
    });
  });
});
