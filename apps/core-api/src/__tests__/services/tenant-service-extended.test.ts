// Extended tests for Tenant Service - covering business logic and edge cases
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TenantService,
  type CreateTenantInput,
  type UpdateTenantInput,
} from '../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';
import { db } from '../../lib/db';

// Mock dependencies
vi.mock('../../lib/db.js', () => ({
  db: {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    plugin: {
      findUnique: vi.fn(),
    },
    tenantPlugin: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../services/keycloak.service.js', () => ({
  keycloakService: {
    createRealm: vi.fn(),
    deleteRealm: vi.fn(),
  },
}));

vi.mock('../../services/permission.service.js', () => ({
  permissionService: {
    initializeDefaultRoles: vi.fn(),
  },
}));

import { keycloakService } from '../../services/keycloak.service.js';
import { permissionService } from '../../services/permission.service.js';

describe('TenantService - Extended Tests', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantService();

    // Setup default mocks
    vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);
    vi.mocked(keycloakService.deleteRealm).mockResolvedValue(undefined);
    vi.mocked(permissionService.initializeDefaultRoles).mockResolvedValue(undefined);
    vi.mocked(db.$executeRawUnsafe).mockResolvedValue(undefined as any);
  });

  describe('createTenant - Error Handling', () => {
    it('should throw error for invalid slug format', async () => {
      const input: CreateTenantInput = {
        slug: 'INVALID-Slug', // Has uppercase
        name: 'Test Tenant',
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should throw error for slug with special characters', async () => {
      const input: CreateTenantInput = {
        slug: 'tenant@invalid!',
        name: 'Test Tenant',
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should throw error for slug exceeding length limit', async () => {
      const input: CreateTenantInput = {
        slug: 'a'.repeat(51),
        name: 'Test Tenant',
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should handle duplicate slug (P2002 unique constraint)', async () => {
      const input: CreateTenantInput = {
        slug: 'acme-corp',
        name: 'Test Tenant',
      };

      const error = new Error('Unique constraint failed');
      (error as any).code = 'P2002';

      vi.mocked(db.tenant.create).mockRejectedValue(error);

      await expect(service.createTenant(input)).rejects.toThrow('already exists');
    });

    it('should handle Keycloak realm creation failure', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.PROVISIONING,
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(undefined as any);
      vi.mocked(keycloakService.createRealm).mockRejectedValue(
        new Error('Keycloak connection failed')
      );
      vi.mocked(db.tenant.update).mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      } as any);

      await expect(service.createTenant(input)).rejects.toThrow('Failed to provision tenant');

      // Verify tenant was marked as suspended
      expect(db.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTenant.id },
          data: expect.objectContaining({
            status: TenantStatus.SUSPENDED,
          }),
        })
      );
    });

    it('should handle PostgreSQL schema creation failure', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.PROVISIONING,
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockRejectedValue(new Error('Schema creation failed'));
      vi.mocked(db.tenant.update).mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      } as any);

      await expect(service.createTenant(input)).rejects.toThrow('Failed to provision tenant');
    });
  });

  describe('createTenant - Success Cases', () => {
    it('should successfully create tenant with all steps', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
        settings: { theme: 'dark' },
        theme: { colors: { primary: '#000' } },
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.ACTIVE,
        settings: input.settings,
        theme: input.theme,
      };

      vi.mocked(db.tenant.create).mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.PROVISIONING,
      } as any);
      vi.mocked(db.tenant.update).mockResolvedValue(mockTenant as any);

      const result = await service.createTenant(input);

      expect(result).toEqual(mockTenant);
      expect(db.tenant.create).toHaveBeenCalled();
      expect(keycloakService.createRealm).toHaveBeenCalledWith(input.slug, input.name);
      expect(permissionService.initializeDefaultRoles).toHaveBeenCalled();
    });

    it('should create tenant with default empty settings', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.ACTIVE,
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.create).mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.PROVISIONING,
      } as any);
      vi.mocked(db.tenant.update).mockResolvedValue(mockTenant as any);

      const result = await service.createTenant(input);

      expect(result.settings).toEqual({});
      expect(result.theme).toEqual({});
    });
  });

  describe('getTenant', () => {
    it('should retrieve tenant by ID with plugins', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        plugins: [{ pluginId: 'plugin-1', plugin: { name: 'Plugin 1' } }],
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);

      const result = await service.getTenant('tenant-1');

      expect(result).toEqual(mockTenant);
      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        include: expect.any(Object),
      });
    });

    it('should throw error if tenant not found', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.getTenant('non-existent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('getTenantBySlug', () => {
    it('should retrieve tenant by slug with plugins', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        plugins: [],
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);

      const result = await service.getTenantBySlug('test-tenant');

      expect(result).toEqual(mockTenant);
      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-tenant' },
        include: expect.any(Object),
      });
    });

    it('should throw error if tenant not found by slug', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.getTenantBySlug('non-existent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('listTenants', () => {
    it('should list all tenants without filters', async () => {
      const mockTenants = [
        { id: 'tenant-1', slug: 'tenant-1', name: 'Tenant 1', status: TenantStatus.ACTIVE },
        { id: 'tenant-2', slug: 'tenant-2', name: 'Tenant 2', status: TenantStatus.ACTIVE },
      ];

      vi.mocked(db.tenant.findMany).mockResolvedValue(mockTenants as any);
      vi.mocked(db.tenant.count).mockResolvedValue(2);

      const result = await service.listTenants();

      expect(result.tenants).toEqual(mockTenants);
      expect(result.total).toBe(2);
    });

    it('should filter tenants by status', async () => {
      const mockTenants = [{ id: 'tenant-1', status: TenantStatus.SUSPENDED }];

      vi.mocked(db.tenant.findMany).mockResolvedValue(mockTenants as any);
      vi.mocked(db.tenant.count).mockResolvedValue(1);

      await service.listTenants({ status: TenantStatus.SUSPENDED });

      expect(db.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TenantStatus.SUSPENDED },
        })
      );
    });

    it('should apply pagination', async () => {
      vi.mocked(db.tenant.findMany).mockResolvedValue([]);
      vi.mocked(db.tenant.count).mockResolvedValue(100);

      await service.listTenants({ skip: 50, take: 25 });

      expect(db.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 25,
        })
      );
    });
  });

  describe('updateTenant', () => {
    it('should update tenant information', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
      };

      const updateInput: UpdateTenantInput = {
        name: 'Updated Tenant',
        status: TenantStatus.SUSPENDED,
      };

      const updatedTenant = {
        ...mockTenant,
        ...updateInput,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.tenant.update).mockResolvedValue(updatedTenant as any);

      const result = await service.updateTenant('tenant-1', updateInput);

      expect(result).toEqual(updatedTenant);
      expect(db.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: updateInput,
        })
      );
    });

    it('should throw error if tenant not found', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.updateTenant('non-existent', { name: 'Updated' })).rejects.toThrow(
        'Tenant not found'
      );
    });

    it('should update only provided fields', async () => {
      const mockTenant = {
        id: 'tenant-1',
        name: 'Original Name',
        status: TenantStatus.ACTIVE,
        settings: { key: 'value' },
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.tenant.update).mockResolvedValue(mockTenant as any);

      await service.updateTenant('tenant-1', { name: 'New Name' });

      expect(db.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'New Name',
            status: undefined,
            settings: undefined,
            theme: undefined,
          },
        })
      );
    });
  });

  describe('deleteTenant (soft delete)', () => {
    it('should mark tenant as pending deletion', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.tenant.update).mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.PENDING_DELETION,
      } as any);

      await service.deleteTenant('tenant-1');

      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { status: TenantStatus.PENDING_DELETION },
      });
    });

    it('should throw error if tenant not found', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.deleteTenant('non-existent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('hardDeleteTenant', () => {
    it('should permanently delete tenant and all resources', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.tenant.delete).mockResolvedValue(mockTenant as any);

      await service.hardDeleteTenant('tenant-1');

      expect(keycloakService.deleteRealm).toHaveBeenCalledWith('test-tenant');
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('DROP SCHEMA'));
      expect(db.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
      });
    });

    it('should throw error if tenant not found', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.hardDeleteTenant('non-existent')).rejects.toThrow('Tenant not found');
    });

    it('should throw error if Keycloak deletion fails', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(keycloakService.deleteRealm).mockRejectedValue(
        new Error('Keycloak deletion failed')
      );

      await expect(service.hardDeleteTenant('tenant-1')).rejects.toThrow('Failed to delete tenant');
    });

    it('should throw error if schema deletion fails', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(keycloakService.deleteRealm).mockResolvedValue(undefined);
      vi.mocked(db.$executeRawUnsafe).mockRejectedValue(new Error('Schema deletion failed'));

      await expect(service.hardDeleteTenant('tenant-1')).rejects.toThrow('Failed to delete tenant');
    });
  });

  describe('installPlugin', () => {
    it('should install plugin for tenant', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'plugin-1';
      const config = { apiKey: 'test-key' };

      const mockTenant = { id: tenantId, slug: 'test-tenant' };
      const mockPlugin = { id: pluginId, name: 'Test Plugin' };
      const mockInstallation = {
        tenantId,
        pluginId,
        enabled: true,
        configuration: config,
        plugin: mockPlugin,
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
      vi.mocked(db.tenantPlugin.create).mockResolvedValue(mockInstallation as any);

      const result = await service.installPlugin(tenantId, pluginId, config);

      expect(result).toEqual(mockInstallation);
      expect(db.tenantPlugin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tenantId,
            pluginId,
            enabled: true,
            configuration: config,
          },
        })
      );
    });

    it('should throw error if tenant not found', async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      await expect(service.installPlugin('non-existent', 'plugin-1')).rejects.toThrow(
        'Tenant not found'
      );
    });

    it('should throw error if plugin not found', async () => {
      const mockTenant = { id: 'tenant-1' };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(service.installPlugin('tenant-1', 'non-existent')).rejects.toThrow(
        'Plugin not found'
      );
    });

    it('should throw error if plugin already installed', async () => {
      const mockTenant = { id: 'tenant-1' };
      const mockPlugin = { id: 'plugin-1' };
      const mockExisting = { tenantId: 'tenant-1', pluginId: 'plugin-1' };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(mockExisting as any);

      await expect(service.installPlugin('tenant-1', 'plugin-1')).rejects.toThrow(
        'already installed'
      );
    });
  });

  describe('uninstallPlugin', () => {
    it('should uninstall plugin from tenant', async () => {
      vi.mocked(db.tenantPlugin.delete).mockResolvedValue({} as any);

      await service.uninstallPlugin('tenant-1', 'plugin-1');

      expect(db.tenantPlugin.delete).toHaveBeenCalledWith({
        where: {
          tenantId_pluginId: {
            tenantId: 'tenant-1',
            pluginId: 'plugin-1',
          },
        },
      });
    });
  });

  describe('getSchemaName', () => {
    it('should generate schema name with underscore prefix', () => {
      const schemaName = service.getSchemaName('my-tenant');
      expect(schemaName).toBe('tenant_my_tenant');
    });

    it('should replace multiple hyphens', () => {
      const schemaName = service.getSchemaName('my-test-tenant-app');
      expect(schemaName).toBe('tenant_my_test_tenant_app');
    });

    it('should handle single word slugs', () => {
      const schemaName = service.getSchemaName('mytenantapp');
      expect(schemaName).toBe('tenant_mytenantapp');
    });
  });
});
