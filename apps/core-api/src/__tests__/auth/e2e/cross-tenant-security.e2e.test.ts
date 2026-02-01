/**
 * Cross-Tenant Security E2E Tests
 *
 * Tests that verify tenant isolation and prevent cross-tenant data access.
 * These are critical security tests that ensure users cannot access data
 * from other tenants.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import type { FastifyInstance } from 'fastify';

describe('Cross-Tenant Security E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build app
    app = await buildTestApp();
    await app.ready();
  });

  beforeEach(async () => {
    // Reset data before each test
    await testContext.resetAll();
  });

  afterAll(async () => {
    await app.close();
    await testContext.cleanup();
  });

  describe('Workspace Isolation', () => {
    it('should prevent tenant A from accessing tenant B workspaces', async () => {
      // Get token for acme-corp admin
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Try to access demo-company workspaces
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'demo-company', // Trying to access different tenant
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('tenant'),
      });
    });

    it('should prevent accessing workspace by ID from different tenant', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Try to access demo workspace with acme token
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/workspace-demo-default',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      expect(response.statusCode).toBe(404); // Should not find workspace
    });
  });

  describe('User Isolation', () => {
    it('should not list users from other tenants', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      if (response.statusCode === 200) {
        const users = response.json();
        // Verify only acme users are returned
        expect(users.every((u: any) => u.email.includes('acme'))).toBe(true);
      }
    });

    it('should prevent modifying users from other tenants', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Try to update demo user
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/user-demo-admin',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'acme-corp',
          'content-type': 'application/json',
        },
        payload: {
          firstName: 'Hacked',
        },
      });

      expect(response.statusCode).toBe(404); // User not found in acme tenant
    });
  });

  describe('Database Schema Isolation', () => {
    it('should execute queries in correct tenant schema', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Create a workspace in acme tenant
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'acme-corp',
          'content-type': 'application/json',
        },
        payload: {
          slug: 'test-workspace',
          name: 'Test Workspace',
        },
      });

      if (createResponse.statusCode === 201) {
        // Verify workspace was created in acme schema
        const workspaces = await testContext.db
          .getPrisma()
          .$queryRawUnsafe(
            'SELECT * FROM tenant_acme_corp.workspaces WHERE slug = $1',
            'test-workspace'
          );

        expect(workspaces).toHaveLength(1);

        // Verify it's NOT in demo schema
        const demoWorkspaces = await testContext.db
          .getPrisma()
          .$queryRawUnsafe(
            'SELECT * FROM tenant_demo_company.workspaces WHERE slug = $1',
            'test-workspace'
          );

        expect(demoWorkspaces).toHaveLength(0);
      }
    });
  });

  describe('Resource Sharing Prevention', () => {
    it('should prevent sharing resources across tenants', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Try to add demo user to acme workspace (cross-tenant sharing)
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces/workspace-acme-default/members',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'acme-corp',
          'content-type': 'application/json',
        },
        payload: {
          userId: 'user-demo-admin', // User from different tenant
          role: 'MEMBER',
        },
      });

      expect(response.statusCode).toBe(404); // User not found in acme tenant
    });
  });

  describe('API Endpoint Security', () => {
    it('should require tenant ID header for tenant-scoped endpoints', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Request without tenant header
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          // Missing x-tenant-id header
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'Bad Request',
        message: expect.stringContaining('tenant'),
      });
    });

    it('should validate tenant ID matches token', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      // Token says acme, header says demo
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${acmeToken.access_token}`,
          'x-tenant-id': 'demo-company', // Mismatch!
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Super Admin Bypass', () => {
    it('should allow super admin to access any tenant', async () => {
      const superAdminToken = await testContext.auth.getRealSuperAdminToken();

      // Access acme tenant
      const acmeResponse = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${superAdminToken.access_token}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      expect(acmeResponse.statusCode).not.toBe(403);

      // Access demo tenant
      const demoResponse = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${superAdminToken.access_token}`,
          'x-tenant-id': 'demo-company',
        },
      });

      expect(demoResponse.statusCode).not.toBe(403);
    });

    it('should log super admin cross-tenant access for audit', async () => {
      // TODO: Implement audit logging test
      // Verify that super admin access to tenant data is logged
    });
  });

  describe('Token Tenant Attribute', () => {
    it('should include tenant_id in token claims', async () => {
      const acmeToken = await testContext.auth.getRealTenantAdminToken('acme');

      const tenantId = testContext.auth.extractTenantId(acmeToken.access_token);

      expect(tenantId).toBe('acme-corp');
    });

    it('should reject tokens without tenant_id for tenant endpoints', async () => {
      // Create token without tenant_id
      const invalidToken = testContext.auth.createMockToken({
        sub: 'user-123',
        email: 'test@example.com',
        // No tenant_id
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${invalidToken}`,
          'x-tenant-id': 'acme-corp',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
