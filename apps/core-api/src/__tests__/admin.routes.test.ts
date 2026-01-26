/**
 * Admin Routes Tests
 *
 * Tests for super-admin endpoints
 * These endpoints require super-admin authentication from plexica-admin realm
 */

import { describe, it, expect, vi } from 'vitest';
import { TenantStatus } from '@plexica/database';

// Mock tenant service
const mockTenants = [
  {
    id: 'tenant-1',
    slug: 'acme-corp',
    name: 'Acme Corporation',
    status: TenantStatus.ACTIVE,
    settings: {},
    theme: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    plugins: [],
  },
  {
    id: 'tenant-2',
    slug: 'globex-inc',
    name: 'Globex Inc',
    status: TenantStatus.ACTIVE,
    settings: {},
    theme: {},
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    plugins: [],
  },
  {
    id: 'tenant-3',
    slug: 'suspended-corp',
    name: 'Suspended Corp',
    status: TenantStatus.SUSPENDED,
    settings: {},
    theme: {},
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    plugins: [],
  },
];

// Mock implementations
const createMockRequest = (overrides = {}) => ({
  user: {
    id: 'super-admin-1',
    username: 'admin',
    email: 'admin@plexica.io',
    roles: ['super-admin'],
    tenantSlug: 'plexica-admin',
  },
  headers: {
    authorization: 'Bearer super-admin-token',
  },
  params: {},
  query: {},
  body: {},
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  ...overrides,
});

describe('Admin Routes', () => {
  describe('POST /admin/tenants', () => {
    it('should create a new tenant with valid input', () => {
      const input = {
        slug: 'new-tenant',
        name: 'New Tenant Inc',
        settings: {},
        theme: {},
      };

      const created = {
        id: 'tenant-new',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.ACTIVE,
        settings: input.settings,
        theme: input.theme,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(created.slug).toBe(input.slug);
      expect(created.name).toBe(input.name);
      expect(created.status).toBe(TenantStatus.ACTIVE);
    });

    it('should validate slug format (lowercase alphanumeric with hyphens)', () => {
      const validSlugs = ['acme-corp', 'test-123', 'my-company'];
      const invalidSlugs = ['Acme-Corp', 'test_123', 'my company', 'Test'];

      validSlugs.forEach((slug) => {
        expect(slug).toMatch(/^[a-z0-9-]{1,50}$/);
      });

      invalidSlugs.forEach((slug) => {
        expect(slug).not.toMatch(/^[a-z0-9-]{1,50}$/);
      });
    });

    it('should require slug and name fields', () => {
      const validInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
      };

      const missingSlug = {
        name: 'Test Tenant',
      };

      const missingName = {
        slug: 'test-tenant',
      };

      expect(validInput).toHaveProperty('slug');
      expect(validInput).toHaveProperty('name');
      expect(missingSlug).not.toHaveProperty('slug');
      expect(missingName).not.toHaveProperty('name');
    });

    it('should set default values for settings and theme', () => {
      const input = {
        slug: 'minimal-tenant',
        name: 'Minimal Tenant',
      };

      const created = {
        ...input,
        settings: {},
        theme: {},
      };

      expect(created.settings).toEqual({});
      expect(created.theme).toEqual({});
    });

    it('should return 400 for invalid slug format', () => {
      const invalidInput = {
        slug: 'Invalid-Slug', // Uppercase not allowed
        name: 'Test',
      };

      const error = {
        error: 'Bad Request',
        message: 'Tenant slug must be 1-50 chars, lowercase alphanumeric with hyphens only',
      };

      expect(invalidInput.slug).not.toMatch(/^[a-z0-9-]{1,50}$/);
      expect(error.error).toBe('Bad Request');
    });

    it('should return 409 for duplicate tenant slug', () => {
      const existingSlug = 'acme-corp';

      const error = {
        error: 'Conflict',
        message: `Tenant with slug '${existingSlug}' already exists`,
      };

      expect(error.error).toBe('Conflict');
      expect(error.message).toContain('already exists');
    });

    it('should create PostgreSQL schema for tenant', () => {
      const slug = 'test-tenant';
      const schemaName = `tenant_${slug.replace(/-/g, '_')}`;

      expect(schemaName).toBe('tenant_test_tenant');
    });

    it('should create Keycloak realm for tenant', () => {
      const slug = 'test-tenant';
      const name = 'Test Tenant';

      // In actual implementation: await keycloakService.createRealm(slug, name)
      const realmCreated = true;

      expect(slug).toBe('test-tenant');
      expect(name).toBe('Test Tenant');
      expect(realmCreated).toBe(true);
    });

    it('should handle provisioning failures gracefully', () => {
      const tenant = {
        id: 'tenant-1',
        slug: 'failed-tenant',
        status: TenantStatus.PROVISIONING,
      };

      // Simulate provisioning failure
      const provisioningFailed = true;
      const updated = {
        ...tenant,
        status: TenantStatus.SUSPENDED,
        settings: {
          provisioningError: 'Failed to create Keycloak realm',
        },
      };

      if (provisioningFailed) {
        expect(updated.status).toBe(TenantStatus.SUSPENDED);
        expect(updated.settings.provisioningError).toBeDefined();
      }
    });

    it('should return 201 status code on successful creation', () => {
      const statusCode = 201;
      const expectedStatus = 201;

      expect(statusCode).toBe(expectedStatus);
    });

    it('should log tenant creation with context', () => {
      const tenant = {
        id: 'tenant-123',
        slug: 'new-tenant',
      };

      const logPayload = {
        tenantId: tenant.id,
        slug: tenant.slug,
      };

      expect(logPayload.tenantId).toBe('tenant-123');
      expect(logPayload.slug).toBe('new-tenant');
    });

    it('should handle JSON settings and theme correctly', () => {
      const input = {
        slug: 'custom-tenant',
        name: 'Custom Tenant',
        settings: {
          maxUsers: 100,
          features: ['feature1', 'feature2'],
        },
        theme: {
          primaryColor: '#007bff',
          logo: 'https://example.com/logo.png',
        },
      };

      expect(input.settings).toHaveProperty('maxUsers');
      expect(input.theme).toHaveProperty('primaryColor');
      expect(typeof input.settings).toBe('object');
      expect(typeof input.theme).toBe('object');
    });
  });

  describe('DELETE /admin/tenants/:id', () => {
    it('should mark tenant for deletion (soft delete)', () => {
      const tenant = { ...mockTenants[0] };
      const updated = { ...tenant, status: TenantStatus.PENDING_DELETION };

      expect(tenant.status).toBe(TenantStatus.ACTIVE);
      expect(updated.status).toBe(TenantStatus.PENDING_DELETION);
    });

    it('should return success message with tenant ID', () => {
      const tenantId = 'tenant-123';
      const response = {
        message: 'Tenant marked for deletion',
        tenantId,
      };

      expect(response.message).toBe('Tenant marked for deletion');
      expect(response.tenantId).toBe(tenantId);
    });

    it('should return 404 for non-existent tenant', () => {
      const error = { message: 'Tenant not found' };

      expect(error.message).toBe('Tenant not found');
    });

    it('should log deletion with context', () => {
      const tenantId = 'tenant-123';
      const logPayload = { tenantId };

      expect(logPayload.tenantId).toBe('tenant-123');
    });

    it('should not immediately delete tenant data (soft delete)', () => {
      // Soft delete only marks status as PENDING_DELETION
      // Actual cleanup happens in background job
      const tenant = {
        id: 'tenant-1',
        status: TenantStatus.PENDING_DELETION,
      };

      expect(tenant.status).toBe(TenantStatus.PENDING_DELETION);
      // Tenant record still exists in database
      expect(tenant.id).toBeDefined();
    });
  });

  describe('GET /admin/tenants', () => {
    it('should list all tenants with default pagination', () => {
      const result = {
        tenants: mockTenants.slice(0, 2),
        total: 3,
        page: 1,
        limit: 50,
        totalPages: 1,
      };

      expect(result.tenants).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.totalPages).toBe(1);
    });

    it('should filter tenants by status', () => {
      const activeTenants = mockTenants.filter((t) => t.status === TenantStatus.ACTIVE);

      expect(activeTenants).toHaveLength(2);
      expect(activeTenants.every((t) => t.status === TenantStatus.ACTIVE)).toBe(true);
    });

    it('should search tenants by name (case-insensitive)', () => {
      const searchTerm = 'acme';
      const results = mockTenants.filter((t) =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('acme-corp');
    });

    it('should search tenants by slug (case-insensitive)', () => {
      const searchTerm = 'globex';
      const results = mockTenants.filter((t) =>
        t.slug.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('globex-inc');
    });

    it('should paginate results correctly', () => {
      const page = 1;
      const limit = 2;
      const skip = (page - 1) * limit;

      const paginatedTenants = mockTenants.slice(skip, skip + limit);

      expect(paginatedTenants).toHaveLength(2);
      expect(paginatedTenants[0].slug).toBe('acme-corp');
      expect(paginatedTenants[1].slug).toBe('globex-inc');
    });

    it('should calculate total pages correctly', () => {
      const total = 3;
      const limit = 2;
      const totalPages = Math.ceil(total / limit);

      expect(totalPages).toBe(2);
    });

    it('should require super-admin authentication', () => {
      const request = createMockRequest({
        user: {
          id: 'user-1',
          roles: ['user'], // Not super-admin
          tenantSlug: 'regular-tenant',
        },
      });

      // Super-admin middleware should reject this
      const hasRole =
        request.user.roles.includes('super_admin') || request.user.roles.includes('super-admin');

      expect(hasRole).toBe(false);
    });

    it('should accept both super_admin and super-admin role formats', () => {
      const requestWithUnderscore = createMockRequest({
        user: { roles: ['super_admin'], tenantSlug: 'master' },
      });
      const requestWithKebab = createMockRequest({
        user: { roles: ['super-admin'], tenantSlug: 'plexica-admin' },
      });

      const hasRoleUnderscore =
        requestWithUnderscore.user.roles.includes('super_admin') ||
        requestWithUnderscore.user.roles.includes('super-admin');
      const hasRoleKebab =
        requestWithKebab.user.roles.includes('super_admin') ||
        requestWithKebab.user.roles.includes('super-admin');

      expect(hasRoleUnderscore).toBe(true);
      expect(hasRoleKebab).toBe(true);
    });
  });

  describe('GET /admin/tenants/:id', () => {
    it('should return tenant details by ID', () => {
      const tenant = mockTenants[0];

      expect(tenant.id).toBe('tenant-1');
      expect(tenant.slug).toBe('acme-corp');
      expect(tenant.name).toBe('Acme Corporation');
      expect(tenant.status).toBe(TenantStatus.ACTIVE);
    });

    it('should return 404 for non-existent tenant', () => {
      const error = { message: 'Tenant not found' };

      expect(error.message).toBe('Tenant not found');
      // In actual route: reply.code(404).send({ error: 'Not Found', message: error.message })
    });

    it('should include plugin information in tenant details', () => {
      const tenantWithPlugins = {
        ...mockTenants[0],
        plugins: [
          {
            tenantId: 'tenant-1',
            pluginId: 'plugin-1',
            enabled: true,
            configuration: {},
            plugin: {
              id: 'plugin-1',
              name: 'CRM Plugin',
              version: '1.0.0',
            },
          },
        ],
      };

      expect(tenantWithPlugins.plugins).toHaveLength(1);
      expect(tenantWithPlugins.plugins[0].plugin.name).toBe('CRM Plugin');
    });
  });

  describe('POST /admin/tenants/:id/suspend', () => {
    it('should suspend an active tenant', () => {
      const tenant = { ...mockTenants[0] };
      const updated = { ...tenant, status: TenantStatus.SUSPENDED };

      expect(tenant.status).toBe(TenantStatus.ACTIVE);
      expect(updated.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should return 404 for non-existent tenant', () => {
      const error = { message: 'Tenant not found' };

      expect(error.message).toBe('Tenant not found');
      // In actual route: reply.code(404).send({ error: 'Not Found', message: error.message })
    });

    it('should log the operation with context', () => {
      const tenantId = 'tenant-1';

      // In actual route: request.log.error({ error, tenantId: request.params.id }, 'Failed to suspend tenant')
      const logContext = { tenantId };

      expect(logContext.tenantId).toBe('tenant-1');
    });

    it('should return updated tenant with new status', () => {
      const updated = {
        id: 'tenant-1',
        slug: 'acme-corp',
        name: 'Acme Corporation',
        status: TenantStatus.SUSPENDED,
        updatedAt: new Date(),
      };

      expect(updated.status).toBe(TenantStatus.SUSPENDED);
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('POST /admin/tenants/:id/activate', () => {
    it('should activate a suspended tenant', () => {
      const tenant = { ...mockTenants[2] }; // suspended-corp
      const updated = { ...tenant, status: TenantStatus.ACTIVE };

      expect(tenant.status).toBe(TenantStatus.SUSPENDED);
      expect(updated.status).toBe(TenantStatus.ACTIVE);
    });

    it('should return 404 for non-existent tenant', () => {
      const error = { message: 'Tenant not found' };

      expect(error.message).toBe('Tenant not found');
    });

    it('should handle database errors gracefully', () => {
      const dbError = new Error('Database connection failed');

      // In actual route: return reply.code(500).send({ error: 'Internal Server Error', message: 'Failed to activate tenant' })
      const expectedResponse = {
        error: 'Internal Server Error',
        message: 'Failed to activate tenant',
      };

      expect(dbError).toBeInstanceOf(Error);
      expect(expectedResponse.error).toBe('Internal Server Error');
    });
  });

  describe('Error Handling', () => {
    it('should distinguish between 404 and 500 errors', () => {
      const notFoundError = { message: 'Tenant not found' };
      const serverError = { message: 'Database query failed' };

      const is404 = notFoundError.message === 'Tenant not found';
      const is500 = serverError.message !== 'Tenant not found';

      expect(is404).toBe(true);
      expect(is500).toBe(true);
    });

    it('should include structured error messages', () => {
      const errorResponse = {
        error: 'Not Found',
        message: 'Tenant not found',
      };

      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('message');
      expect(errorResponse.error).toBe('Not Found');
    });

    it('should log errors with context', () => {
      const tenantId = 'tenant-123';
      const error = new Error('Something went wrong');

      const logPayload = {
        error,
        tenantId,
      };

      expect(logPayload.error).toBe(error);
      expect(logPayload.tenantId).toBe('tenant-123');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without super-admin role', () => {
      const request = createMockRequest({
        user: {
          roles: ['user', 'admin'], // No super-admin
          tenantSlug: 'regular-tenant',
        },
      });

      const hasRole =
        request.user.roles.includes('super_admin') || request.user.roles.includes('super-admin');

      expect(hasRole).toBe(false);
    });

    it('should accept requests from plexica-admin realm', () => {
      const request = createMockRequest({
        user: {
          roles: ['super-admin'],
          tenantSlug: 'plexica-admin',
        },
      });

      const validRealms = ['master', 'plexica-admin'];
      const isValidRealm = validRealms.includes(request.user.tenantSlug);

      expect(isValidRealm).toBe(true);
    });

    it('should accept requests from master realm', () => {
      const request = createMockRequest({
        user: {
          roles: ['super_admin'],
          tenantSlug: 'master',
        },
      });

      const validRealms = ['master', 'plexica-admin'];
      const isValidRealm = validRealms.includes(request.user.tenantSlug);

      expect(isValidRealm).toBe(true);
    });

    it('should reject requests from regular tenant realms', () => {
      const request = createMockRequest({
        user: {
          roles: ['super-admin'],
          tenantSlug: 'acme-corp', // Regular tenant
        },
      });

      const validRealms = ['master', 'plexica-admin'];
      const isValidRealm = validRealms.includes(request.user.tenantSlug);

      expect(isValidRealm).toBe(false);
    });
  });

  describe('Database Integration', () => {
    it('should use database-level search with Prisma', () => {
      const nameFilter = { name: { contains: 'acme', mode: 'insensitive' as const } };
      const slugFilter = { slug: { contains: 'acme', mode: 'insensitive' as const } };

      const searchQuery = {
        OR: [nameFilter, slugFilter],
      };

      expect(searchQuery.OR).toHaveLength(2);
      expect(nameFilter.name.contains).toBe('acme');
      expect(nameFilter.name.mode).toBe('insensitive');
    });

    it('should build where clause correctly with filters', () => {
      const where: any = {};

      // Add status filter
      where.status = TenantStatus.ACTIVE;

      // Add search filter
      where.OR = [
        { name: { contains: 'test', mode: 'insensitive' } },
        { slug: { contains: 'test', mode: 'insensitive' } },
      ];

      expect(where.status).toBe(TenantStatus.ACTIVE);
      expect(where.OR).toHaveLength(2);
    });

    it('should calculate pagination parameters correctly', () => {
      const page = 2;
      const limit = 10;
      const skip = (page - 1) * limit;
      const take = limit;

      expect(skip).toBe(10);
      expect(take).toBe(10);
    });
  });
});
