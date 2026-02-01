/**
 * Tenant Lifecycle Unit Tests
 *
 * Tests tenant state transitions, validation, and edge cases.
 * Covers:
 * - State transitions (PROVISIONING -> ACTIVE -> SUSPENDED -> DELETED)
 * - Slug validation and formatting
 * - Edge cases (duplicate slugs, invalid characters, rollback)
 * - Input validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantService, type CreateTenantInput } from '../../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';
import { permissionService } from '../../../services/permission.service.js';
import { keycloakService } from '../../../services/keycloak.service.js';

// Mock dependencies
const mockTenantCreate = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantDelete = vi.fn();
const mockExecuteRawUnsafe = vi.fn();

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      create: (...args: any[]) => mockTenantCreate(...args),
      update: (...args: any[]) => mockTenantUpdate(...args),
      findUnique: (...args: any[]) => mockTenantFindUnique(...args),
      delete: (...args: any[]) => mockTenantDelete(...args),
    },
    $executeRawUnsafe: (...args: any[]) => mockExecuteRawUnsafe(...args),
  },
}));

vi.mock('../../../services/keycloak.service.js', () => ({
  keycloakService: {
    createRealm: vi.fn().mockResolvedValue(undefined),
    deleteRealm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/permission.service.js', () => ({
  permissionService: {
    initializeDefaultRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Tenant Lifecycle', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reconfigure mocks after clearing
    vi.mocked(permissionService.initializeDefaultRoles).mockResolvedValue(undefined);
    vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);
    vi.mocked(keycloakService.deleteRealm).mockResolvedValue(undefined);

    service = new TenantService();
  });

  describe('State Transitions', () => {
    it('should transition from PROVISIONING to ACTIVE on successful creation', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.ACTIVE,
      });

      const result = await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
      });

      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.ACTIVE },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          settings: true,
          theme: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should transition from ACTIVE to SUSPENDED via updateTenant', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      const result = await service.updateTenant('tenant-123', {
        status: TenantStatus.SUSPENDED,
      });

      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should transition from SUSPENDED to ACTIVE (reactivate)', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.SUSPENDED,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.ACTIVE,
      });

      const result = await service.updateTenant('tenant-123', {
        status: TenantStatus.ACTIVE,
      });

      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should mark tenant as SUSPENDED on provisioning failure', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Schema creation failed'));
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      await expect(
        service.createTenant({
          slug: 'test-tenant',
          name: 'Test Tenant',
        })
      ).rejects.toThrow('Failed to provision tenant');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: expect.objectContaining({
          status: TenantStatus.SUSPENDED,
        }),
      });
    });
  });

  describe('Slug Validation', () => {
    it('should accept valid lowercase alphanumeric slug with hyphens', async () => {
      const validSlugs = [
        'test-tenant',
        'acme-corp',
        'my-company-123',
        'a',
        'a-b-c-d-e',
        '123-456',
      ];

      for (const slug of validSlugs) {
        const mockTenant = {
          id: 'tenant-id',
          slug,
          name: 'Test',
          status: TenantStatus.PROVISIONING,
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: {},
          theme: {},
        };

        mockTenantCreate.mockResolvedValue(mockTenant);
        mockExecuteRawUnsafe.mockResolvedValue(undefined);
        mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

        await expect(service.createTenant({ slug, name: 'Test' })).resolves.not.toThrow();
      }
    });

    it('should reject slug with uppercase letters', async () => {
      await expect(service.createTenant({ slug: 'Test-Tenant', name: 'Test' })).rejects.toThrow(
        /slug must be.*lowercase/i
      );
    });

    it('should reject slug with special characters', async () => {
      const invalidSlugs = [
        'test_tenant', // underscore
        'test.tenant', // dot
        'test@tenant', // at
        'test tenant', // space
        'test/tenant', // slash
        'test\\tenant', // backslash
      ];

      for (const slug of invalidSlugs) {
        await expect(service.createTenant({ slug, name: 'Test' })).rejects.toThrow(/slug must be/i);
      }
    });

    it('should reject slug that is too short (empty)', async () => {
      await expect(service.createTenant({ slug: '', name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );
    });

    it('should reject slug that is too long (>50 chars)', async () => {
      const longSlug = 'a'.repeat(51);
      await expect(service.createTenant({ slug: longSlug, name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );
    });

    it('should accept slug at maximum length (50 chars)', async () => {
      const maxSlug = 'a'.repeat(50);
      const mockTenant = {
        id: 'tenant-id',
        slug: maxSlug,
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      await expect(service.createTenant({ slug: maxSlug, name: 'Test' })).resolves.not.toThrow();
    });
  });

  describe('Schema Name Generation', () => {
    it('should generate schema name with tenant_ prefix', () => {
      const schemaName = service.getSchemaName('test-tenant');
      expect(schemaName).toBe('tenant_test_tenant');
    });

    it('should replace hyphens with underscores in schema name', () => {
      const schemaName = service.getSchemaName('my-company-name');
      expect(schemaName).toBe('tenant_my_company_name');
    });

    it('should handle slug with no hyphens', () => {
      const schemaName = service.getSchemaName('acme');
      expect(schemaName).toBe('tenant_acme');
    });

    it('should handle slug with multiple consecutive hyphens', () => {
      const schemaName = service.getSchemaName('test--tenant');
      expect(schemaName).toBe('tenant_test__tenant');
    });
  });

  describe('Edge Cases', () => {
    it('should reject duplicate slug', async () => {
      mockTenantCreate.mockRejectedValue({
        code: 'P2002', // Prisma unique constraint violation
        meta: { target: ['slug'] },
      });

      await expect(service.createTenant({ slug: 'existing-tenant', name: 'Test' })).rejects.toThrow(
        /already exists/i
      );
    });

    it('should handle provisioning failure and not leave orphaned data', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockRejectedValueOnce(new Error('Database error'));
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
        settings: { provisioningError: 'Database error' },
      });

      await expect(service.createTenant({ slug: 'test-tenant', name: 'Test' })).rejects.toThrow(
        'Failed to provision tenant'
      );

      // Should update status to indicate failure
      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-123' },
          data: expect.objectContaining({
            status: TenantStatus.SUSPENDED,
          }),
        })
      );
    });

    it('should handle Keycloak realm creation failure', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined); // Schema creation succeeds

      const { keycloakService } = await import('../../../services/keycloak.service.js');
      vi.mocked(keycloakService.createRealm).mockRejectedValue(
        new Error('Keycloak connection failed')
      );

      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      await expect(service.createTenant({ slug: 'test-tenant', name: 'Test' })).rejects.toThrow(
        'Failed to provision tenant'
      );
    });

    it('should handle permission initialization failure', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      const { keycloakService } = await import('../../../services/keycloak.service.js');
      vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);

      const { permissionService } = await import('../../../services/permission.service.js');
      vi.mocked(permissionService.initializeDefaultRoles).mockRejectedValue(
        new Error('Permission setup failed')
      );

      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      await expect(service.createTenant({ slug: 'test-tenant', name: 'Test' })).rejects.toThrow(
        'Failed to provision tenant'
      );
    });
  });

  describe('Input Validation', () => {
    it('should accept valid tenant name', async () => {
      const mockTenant = {
        id: 'tenant-id',
        slug: 'test',
        name: 'Test Tenant Name',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'test',
        name: 'Test Tenant Name',
      });

      expect(result.name).toBe('Test Tenant Name');
    });

    it('should accept optional settings object', async () => {
      const settings = { theme: 'dark', language: 'en' };
      const mockTenant = {
        id: 'tenant-id',
        slug: 'test',
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings,
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'test',
        name: 'Test',
        settings,
      });

      expect(result.settings).toEqual(settings);
    });

    it('should accept optional theme object', async () => {
      const theme = { primaryColor: '#007bff', logo: 'logo.png' };
      const mockTenant = {
        id: 'tenant-id',
        slug: 'test',
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme,
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'test',
        name: 'Test',
        theme,
      });

      expect(result.theme).toEqual(theme);
    });
  });

  describe('Get Operations', () => {
    it('should get tenant by ID', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
        plugins: [],
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);

      const result = await service.getTenant('tenant-123');

      expect(result).toEqual(mockTenant);
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        include: expect.any(Object),
      });
    });

    it('should throw error when tenant not found by ID', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should get tenant by slug', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
        plugins: [],
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);

      const result = await service.getTenantBySlug('test-tenant');

      expect(result).toEqual(mockTenant);
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { slug: 'test-tenant' },
        include: expect.any(Object),
      });
    });

    it('should throw error when tenant not found by slug', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenantBySlug('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('Update Operations', () => {
    it('should update tenant name', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Old Name',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        name: 'New Name',
      });

      const result = await service.updateTenant('tenant-123', {
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
    });

    it('should update tenant settings', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: { old: 'value' },
        theme: {},
      };

      const newSettings = { new: 'value', updated: true };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        settings: newSettings,
      });

      const result = await service.updateTenant('tenant-123', {
        settings: newSettings,
      });

      expect(result.settings).toEqual(newSettings);
    });

    it('should throw error when updating nonexistent tenant', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.updateTenant('nonexistent', { name: 'New Name' })).rejects.toThrow(
        'Tenant not found'
      );
    });
  });

  describe('Delete Operations', () => {
    it('should soft delete tenant by updating status', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      await service.deleteTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-123' },
        })
      );
    });

    it('should throw error when deleting nonexistent tenant', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.deleteTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });
});
