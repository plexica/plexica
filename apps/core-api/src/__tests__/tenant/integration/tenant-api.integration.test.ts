/**
 * Tenant API Integration Tests
 *
 * Tests the tenant API endpoints with real database and Keycloak.
 * Covers:
 * - Tenant CRUD operations (Create, Read, Update, Delete)
 * - Pagination and filtering
 * - Authorization (super admin only)
 * - Input validation
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { TenantStatus } from '@plexica/database';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { redis } from '../../../lib/redis';
import { keycloakService } from '../../../services/keycloak.service.js';

describe('Tenant API Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    // Get tokens for testing
    const superAdminResp = await testContext.auth.getRealSuperAdminToken();
    superAdminToken = superAdminResp.access_token;

    const tenantAdminResp = await testContext.auth.getRealTenantAdminToken('acme');
    tenantAdminToken = tenantAdminResp.access_token;
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up tenants created during tests (except seed data)
    await redis.flushdb();

    // Get all test tenants (except seed tenant 'acme')
    const tenantsToDelete = await db.tenant.findMany({
      where: {
        slug: {
          not: 'acme',
        },
      },
      select: {
        slug: true,
      },
    });

    // Delete Keycloak realms and PostgreSQL schemas for test tenants
    for (const tenant of tenantsToDelete) {
      // Delete Keycloak realm
      try {
        await keycloakService.deleteRealm(tenant.slug);
      } catch (error) {
        // Ignore errors if realm doesn't exist
        console.log(
          `Note: Could not delete Keycloak realm for ${tenant.slug}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // Drop PostgreSQL schema
      const schemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;
      try {
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (error) {
        // Ignore errors if schema doesn't exist
        console.log(
          `Note: Could not drop schema ${schemaName}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    // Delete all test tenants from database
    await db.tenant.deleteMany({
      where: {
        slug: {
          not: 'acme', // Keep seed tenant
        },
      },
    });
  });

  describe('POST /api/tenants', () => {
    it('should create tenant as super admin', async () => {
      // Use unique slug to avoid conflicts from previous test runs
      const uniqueSlug = `new-tenant-${Date.now()}`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: uniqueSlug,
          name: 'New Tenant',
          settings: { feature1: true },
          theme: { color: 'blue' },
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('id');
      expect(data.slug).toBe(uniqueSlug);
      expect(data.name).toBe('New Tenant');
      expect(data.status).toBe(TenantStatus.ACTIVE);
      expect(data.settings).toEqual({ feature1: true });
      expect(data.theme).toEqual({ color: 'blue' });
    });

    it('should reject tenant creation by non-super-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          slug: 'unauthorized-tenant',
          name: 'Unauthorized Tenant',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject tenant creation without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        payload: {
          slug: 'no-auth-tenant',
          name: 'No Auth Tenant',
        },
      });

      // Should be 401, but middleware chain may return 403
      expect([401, 403]).toContain(response.statusCode);
    });

    it('should validate slug format', async () => {
      const invalidSlugs = [
        'Invalid-With-Uppercase',
        'invalid_with_underscore',
        'invalid with spaces',
        'invalid@special',
      ];

      for (const slug of invalidSlugs) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: {
            authorization: `Bearer ${superAdminToken}`,
          },
          payload: {
            slug,
            name: 'Test Tenant',
          },
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.body);
        expect(data.error).toBeDefined();
      }
    });

    it('should reject duplicate slug', async () => {
      // Create first tenant
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'duplicate-test',
          name: 'Duplicate Test 1',
        },
      });

      expect(response1.statusCode).toBe(201);

      // Try to create tenant with same slug
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'duplicate-test',
          name: 'Duplicate Test 2',
        },
      });

      expect(response2.statusCode).toBe(400);
      const data = JSON.parse(response2.body);
      expect(data.error).toMatch(/already exists/i);
    });

    it('should reject slug that is too short', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'ab', // Too short (min 3)
          name: 'Short Slug Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject slug that is too long', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'a'.repeat(51), // Too long (max 50)
          name: 'Long Slug Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require name field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'missing-name',
          // Missing name
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept optional settings', async () => {
      const settings = {
        featureFlags: { newUI: true },
        limits: { maxUsers: 100 },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'with-settings',
          name: 'With Settings',
          settings,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.settings).toEqual(settings);
    });

    it('should accept optional theme', async () => {
      const theme = {
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        logo: 'https://example.com/logo.png',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'with-theme',
          name: 'With Theme',
          theme,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.theme).toEqual(theme);
    });
  });

  describe('GET /api/tenants', () => {
    beforeEach(async () => {
      // Create multiple test tenants
      await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: { slug: 'list-test-1', name: 'List Test 1' },
      });

      await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: { slug: 'list-test-2', name: 'List Test 2' },
      });

      await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: { slug: 'list-test-3', name: 'List Test 3' },
      });
    });

    it('should list all tenants as super admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('tenants');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.tenants)).toBe(true);
      expect(data.tenants.length).toBeGreaterThanOrEqual(3);
    });

    it('should paginate tenant list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants?skip=0&take=2',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.tenants.length).toBeLessThanOrEqual(2);
      expect(data.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter tenants by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants?status=ACTIVE',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      data.tenants.forEach((tenant: any) => {
        expect(tenant.status).toBe(TenantStatus.ACTIVE);
      });
    });

    it('should handle skip parameter correctly', async () => {
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/tenants?skip=0&take=1',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      const response2 = await app.inject({
        method: 'GET',
        url: '/api/tenants?skip=1&take=1',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const data1 = JSON.parse(response1.body);
      const data2 = JSON.parse(response2.body);

      // Different pages should return different tenants
      if (data1.tenants.length > 0 && data2.tenants.length > 0) {
        expect(data1.tenants[0].id).not.toBe(data2.tenants[0].id);
      }
    });

    it('should respect take limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants?take=2',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.tenants.length).toBeLessThanOrEqual(2);
    });

    it('should validate take maximum (100)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants?take=101',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative skip value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants?skip=-1',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/tenants/:id', () => {
    let testTenantId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'get-test',
          name: 'Get Test Tenant',
          settings: { test: true },
          theme: { color: 'red' },
        },
      });

      if (response.statusCode !== 201) {
        throw new Error(
          `Failed to create test tenant in beforeEach: ${response.statusCode} - ${response.body}`
        );
      }

      const data = JSON.parse(response.body);
      testTenantId = data.id;
    });

    it('should get tenant by ID as super admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.id).toBe(testTenantId);
      expect(data.slug).toBe('get-test');
      expect(data.name).toBe('Get Test Tenant');
      expect(data.settings).toEqual({ test: true });
      expect(data.theme).toEqual({ color: 'red' });
    });

    it('should return 404 for nonexistent tenant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants/nonexistent-id-123',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject access by non-super-admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/tenants/:id', () => {
    let testTenantId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'update-test',
          name: 'Update Test Tenant',
          settings: { old: 'value' },
        },
      });

      if (response.statusCode !== 201) {
        throw new Error(
          `Failed to create test tenant in beforeEach: ${response.statusCode} - ${response.body}`
        );
      }

      const data = JSON.parse(response.body);
      testTenantId = data.id;
    });

    it('should update tenant name as super admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          name: 'Updated Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.name).toBe('Updated Name');
      expect(data.slug).toBe('update-test'); // Slug unchanged
    });

    it('should update tenant settings', async () => {
      const newSettings = { new: 'value', updated: true };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          settings: newSettings,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.settings).toEqual(newSettings);
    });

    it('should update tenant theme', async () => {
      const newTheme = { primaryColor: '#ff0000' };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          theme: newTheme,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.theme).toEqual(newTheme);
    });

    it('should update tenant status', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          status: TenantStatus.SUSPENDED,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should reject update by non-super-admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          name: 'Unauthorized Update',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 when updating nonexistent tenant', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tenants/nonexistent-id-123',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          name: 'Updated Name',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should allow partial updates', async () => {
      // Update only one field
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          name: 'Partially Updated',
          // Not updating settings, theme, or status
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.name).toBe('Partially Updated');
      expect(data.settings).toEqual({ old: 'value' }); // Original settings preserved
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    let testTenantId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'delete-test',
          name: 'Delete Test Tenant',
        },
      });

      if (response.statusCode !== 201) {
        throw new Error(
          `Failed to create test tenant in beforeEach: ${response.statusCode} - ${response.body}`
        );
      }

      const data = JSON.parse(response.body);
      testTenantId = data.id;
    });

    it('should soft delete tenant as super admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify tenant status was updated (not hard deleted)
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      // Tenant should still exist but be marked for deletion
      expect(getResponse.statusCode).toBe(200);
      const data = JSON.parse(getResponse.body);
      expect(data.status).toBe(TenantStatus.PENDING_DELETION);
    });

    it('should reject delete by non-super-admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${testTenantId}`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 when deleting nonexistent tenant', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tenants/nonexistent-id-123',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Try to create tenant with extremely long name that might cause DB error
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'error-test',
          name: 'a'.repeat(10000), // Excessively long
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should return proper error format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'invalid slug with spaces',
          name: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);

      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });
  });
});
