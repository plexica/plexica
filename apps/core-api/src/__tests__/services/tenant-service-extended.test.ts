// Extended tests for Tenant Service - covering business logic and edge cases
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TenantService,
  type CreateTenantInput,
  type UpdateTenantInput,
} from '../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';

// --- Mocks ---

const mockTenantCreate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantFindMany = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantDelete = vi.fn();
const mockTenantCount = vi.fn();
const mockPluginFindUnique = vi.fn();
const mockTenantPluginFindUnique = vi.fn();
const mockTenantPluginCreate = vi.fn();
const mockTenantPluginDelete = vi.fn();
const mockExecuteRaw = vi.fn();
const mockExecuteRawUnsafe = vi.fn();

vi.mock('../../lib/db.js', () => ({
  db: {
    tenant: {
      create: (...args: any[]) => mockTenantCreate(...args),
      findUnique: (...args: any[]) => mockTenantFindUnique(...args),
      findMany: (...args: any[]) => mockTenantFindMany(...args),
      update: (...args: any[]) => mockTenantUpdate(...args),
      delete: (...args: any[]) => mockTenantDelete(...args),
      count: (...args: any[]) => mockTenantCount(...args),
    },
    plugin: {
      findUnique: (...args: any[]) => mockPluginFindUnique(...args),
    },
    tenantPlugin: {
      findUnique: (...args: any[]) => mockTenantPluginFindUnique(...args),
      create: (...args: any[]) => mockTenantPluginCreate(...args),
      delete: (...args: any[]) => mockTenantPluginDelete(...args),
    },
    $executeRaw: (...args: any[]) => mockExecuteRaw(...args),
    $executeRawUnsafe: (...args: any[]) => mockExecuteRawUnsafe(...args),
  },
}));

// ProvisioningOrchestrator mock — prevents real step execution
const mockProvision = vi.fn();
vi.mock('../../services/provisioning-orchestrator.js', () => ({
  ProvisioningOrchestrator: vi.fn().mockImplementation(() => ({
    provision: mockProvision,
  })),
  provisioningOrchestrator: { provision: vi.fn() },
}));

vi.mock('../../services/provisioning-steps/index.js', () => ({
  SchemaStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRealmStep: vi.fn().mockImplementation(() => ({})),
  KeycloakClientsStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRolesStep: vi.fn().mockImplementation(() => ({})),
  MinioBucketStep: vi.fn().mockImplementation(() => ({})),
  AdminUserStep: vi.fn().mockImplementation(() => ({})),
  InvitationStep: vi.fn().mockImplementation(() => ({})),
}));

// MinIO mock — required because hardDeleteTenant uses it
vi.mock('../../services/minio-client.js', () => ({
  getMinioClient: () => ({
    removeTenantBucket: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Redis mock — required because hardDeleteTenant uses it
vi.mock('../../lib/redis.js', () => ({
  redis: {
    scan: vi.fn().mockResolvedValue(['0', []]),
    del: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../services/keycloak.service.js', () => ({
  keycloakService: {
    createRealm: vi.fn().mockResolvedValue(undefined),
    provisionRealmClients: vi.fn().mockResolvedValue(undefined),
    provisionRealmRoles: vi.fn().mockResolvedValue(undefined),
    configureRefreshTokenRotation: vi.fn().mockResolvedValue(undefined),
    deleteRealm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/permission.service.js', () => ({
  permissionService: {
    initializeDefaultRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

// --- Helpers ---

const ADMIN_EMAIL = 'admin@example.com';

describe('TenantService - Extended Tests', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvision.mockResolvedValue({ success: true, completedSteps: [] });
    service = new TenantService();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // createTenant — Error Handling
  // ──────────────────────────────────────────────────────────────────────────────

  describe('createTenant - Error Handling', () => {
    it('should throw error for invalid slug format (uppercase)', async () => {
      const input: CreateTenantInput = {
        slug: 'INVALID-Slug',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should throw error for slug with special characters', async () => {
      const input: CreateTenantInput = {
        slug: 'tenant@invalid!',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should throw error for slug exceeding length limit (>64 chars)', async () => {
      const input: CreateTenantInput = {
        slug: 'a'.repeat(65),
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      await expect(service.createTenant(input)).rejects.toThrow('Tenant slug must be');
    });

    it('should handle duplicate slug (P2002 unique constraint)', async () => {
      const input: CreateTenantInput = {
        slug: 'acme-corp',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      const error = new Error('Unique constraint failed');
      (error as any).code = 'P2002';

      mockTenantCreate.mockRejectedValue(error);

      await expect(service.createTenant(input)).rejects.toThrow('already exists');
    });

    it('should throw when orchestrator reports provisioning failure', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockProvision.mockResolvedValue({
        success: false,
        error: 'Schema creation failed',
        completedSteps: [],
      });

      await expect(service.createTenant(input)).rejects.toThrow('Failed to provision tenant');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // createTenant — Success Cases
  // ──────────────────────────────────────────────────────────────────────────────

  describe('createTenant - Success Cases', () => {
    it('should successfully create tenant and call orchestrator', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
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
        createdAt: new Date(),
        updatedAt: new Date(),
        translationOverrides: {},
        defaultLocale: 'en',
      };

      mockTenantCreate.mockResolvedValue({ ...mockTenant, status: TenantStatus.PROVISIONING });
      mockTenantUpdate.mockResolvedValue(mockTenant);

      const result = await service.createTenant(input);

      expect(result).toEqual(mockTenant);
      expect(mockTenantCreate).toHaveBeenCalled();
      // Provisioning is delegated to the orchestrator (not called directly)
      expect(mockProvision).toHaveBeenCalledTimes(1);
    });

    it('should create tenant with default empty settings', async () => {
      const input: CreateTenantInput = {
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      };

      const mockTenant = {
        id: 'tenant-1',
        slug: input.slug,
        name: input.name,
        status: TenantStatus.ACTIVE,
        settings: {},
        theme: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        translationOverrides: {},
        defaultLocale: 'en',
      };

      mockTenantCreate.mockResolvedValue({ ...mockTenant, status: TenantStatus.PROVISIONING });
      mockTenantUpdate.mockResolvedValue(mockTenant);

      const result = await service.createTenant(input);

      expect(result.settings).toEqual({});
      expect(result.theme).toEqual({});
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // getTenant
  // ──────────────────────────────────────────────────────────────────────────────

  describe('getTenant', () => {
    it('should retrieve tenant by ID with plugins', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        plugins: [{ pluginId: 'plugin-1', plugin: { name: 'Plugin 1' } }],
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);

      const result = await service.getTenant('tenant-1');

      expect(result).toEqual(mockTenant);
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        include: expect.any(Object),
      });
    });

    it('should throw error if tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenant('non-existent')).rejects.toThrow('Tenant not found');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // getTenantBySlug
  // ──────────────────────────────────────────────────────────────────────────────

  describe('getTenantBySlug', () => {
    it('should retrieve tenant by slug with plugins', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
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

    it('should throw error if tenant not found by slug', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenantBySlug('non-existent')).rejects.toThrow('Tenant not found');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // listTenants
  // ──────────────────────────────────────────────────────────────────────────────

  describe('listTenants', () => {
    it('should list all tenants without filters', async () => {
      const mockTenants = [
        { id: 'tenant-1', slug: 'tenant-1', name: 'Tenant 1', status: TenantStatus.ACTIVE },
        { id: 'tenant-2', slug: 'tenant-2', name: 'Tenant 2', status: TenantStatus.ACTIVE },
      ];

      mockTenantFindMany.mockResolvedValue(mockTenants);
      mockTenantCount.mockResolvedValue(2);

      const result = await service.listTenants();

      expect(result.tenants).toEqual(mockTenants);
      expect(result.total).toBe(2);
    });

    it('should filter tenants by status', async () => {
      const mockTenants = [{ id: 'tenant-1', status: TenantStatus.SUSPENDED }];

      mockTenantFindMany.mockResolvedValue(mockTenants);
      mockTenantCount.mockResolvedValue(1);

      await service.listTenants({ status: TenantStatus.SUSPENDED });

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TenantStatus.SUSPENDED },
        })
      );
    });

    it('should apply pagination', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(100);

      await service.listTenants({ skip: 50, take: 25 });

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 25,
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // updateTenant
  // ──────────────────────────────────────────────────────────────────────────────

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
      };

      const updatedTenant = { ...mockTenant, ...updateInput };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue(updatedTenant);

      const result = await service.updateTenant('tenant-1', updateInput);

      expect(result).toEqual(updatedTenant);
      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: expect.objectContaining(updateInput),
        })
      );
    });

    it('should throw error if tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

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

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue(mockTenant);

      await service.updateTenant('tenant-1', { name: 'New Name' });

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Name',
          }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // deleteTenant (soft delete)
  // ──────────────────────────────────────────────────────────────────────────────

  describe('deleteTenant (soft delete)', () => {
    it('should mark tenant as PENDING_DELETION with deletionScheduledAt date', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.PENDING_DELETION,
      });

      const result = await service.deleteTenant('tenant-1');

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: expect.objectContaining({ status: TenantStatus.PENDING_DELETION }),
        })
      );
      expect(result).toHaveProperty('deletionScheduledAt');
    });

    it('should throw error if tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.deleteTenant('non-existent')).rejects.toThrow('Tenant not found');
    });

    it('should throw when trying to delete a PENDING_DELETION tenant (service guard)', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.PENDING_DELETION,
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);

      await expect(service.deleteTenant('tenant-1')).rejects.toThrow(
        /Cannot delete tenant with status: PENDING_DELETION/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // hardDeleteTenant
  // ──────────────────────────────────────────────────────────────────────────────

  describe('hardDeleteTenant', () => {
    it('should permanently delete tenant record and drop schema', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockExecuteRaw.mockResolvedValue(0);
      mockTenantDelete.mockResolvedValue(mockTenant);

      await service.hardDeleteTenant('tenant-1');

      // Schema drop uses $executeRaw (tagged template, not $executeRawUnsafe)
      expect(mockExecuteRaw).toHaveBeenCalled();
      expect(mockTenantDelete).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
      });
    });

    it('should throw error if tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.hardDeleteTenant('non-existent')).rejects.toThrow('Tenant not found');
    });

    it('should continue (non-fatal) if MinIO cleanup fails', async () => {
      const mockTenant = {
        id: 'tenant-1',
        slug: 'test-tenant',
        status: TenantStatus.ACTIVE,
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockExecuteRaw.mockResolvedValue(0);
      mockTenantDelete.mockResolvedValue(mockTenant);

      const { getMinioClient } = await import('../../services/minio-client.js');
      vi.mocked(getMinioClient).mockReturnValueOnce({
        removeTenantBucket: vi.fn().mockRejectedValue(new Error('MinIO unreachable')),
      } as any);

      // Should NOT throw — MinIO failures are non-fatal
      await expect(service.hardDeleteTenant('tenant-1')).resolves.not.toThrow();
      expect(mockTenantDelete).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // installPlugin
  // ──────────────────────────────────────────────────────────────────────────────

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

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockPluginFindUnique.mockResolvedValue(mockPlugin);
      mockTenantPluginFindUnique.mockResolvedValue(null);
      mockTenantPluginCreate.mockResolvedValue(mockInstallation);

      const result = await service.installPlugin(tenantId, pluginId, config);

      expect(result).toEqual(mockInstallation);
      expect(mockTenantPluginCreate).toHaveBeenCalledWith(
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
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.installPlugin('non-existent', 'plugin-1')).rejects.toThrow(
        'Tenant not found'
      );
    });

    it('should throw error if plugin not found', async () => {
      mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1' });
      mockPluginFindUnique.mockResolvedValue(null);

      await expect(service.installPlugin('tenant-1', 'non-existent')).rejects.toThrow(
        'Plugin not found'
      );
    });

    it('should throw error if plugin already installed', async () => {
      mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1' });
      mockPluginFindUnique.mockResolvedValue({ id: 'plugin-1' });
      mockTenantPluginFindUnique.mockResolvedValue({ tenantId: 'tenant-1', pluginId: 'plugin-1' });

      await expect(service.installPlugin('tenant-1', 'plugin-1')).rejects.toThrow(
        'already installed'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // uninstallPlugin
  // ──────────────────────────────────────────────────────────────────────────────

  describe('uninstallPlugin', () => {
    it('should uninstall plugin from tenant', async () => {
      mockTenantPluginDelete.mockResolvedValue({});

      await service.uninstallPlugin('tenant-1', 'plugin-1');

      expect(mockTenantPluginDelete).toHaveBeenCalledWith({
        where: {
          tenantId_pluginId: {
            tenantId: 'tenant-1',
            pluginId: 'plugin-1',
          },
        },
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // getSchemaName
  // ──────────────────────────────────────────────────────────────────────────────

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
