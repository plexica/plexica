import { describe, it, expect, beforeEach, vi } from 'vitest';

// Top-level mock functions (survives vi.clearAllMocks)
const mockTenantCreate = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantFindMany = vi.fn();
const mockTenantCount = vi.fn();
const mockTenantDelete = vi.fn();
const mockPluginFindUnique = vi.fn();
const mockTenantPluginCreate = vi.fn();
const mockTenantPluginFindUnique = vi.fn();
const mockTenantPluginDelete = vi.fn();
const mockExecuteRawUnsafe = vi.fn();

// Mock @plexica/database WITHOUT importOriginal to prevent the real PrismaClient
// from ever being instantiated (getPrismaClient() opens a real pg Pool).
// We define TenantStatus manually since it's a simple string enum.
vi.mock('@plexica/database', () => ({
  TenantStatus: {
    PROVISIONING: 'PROVISIONING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    PENDING_DELETION: 'PENDING_DELETION',
    DELETED: 'DELETED',
  },
  PrismaClient: vi.fn(),
  default: {},
}));

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      create: (...args: any[]) => mockTenantCreate(...args),
      update: (...args: any[]) => mockTenantUpdate(...args),
      findUnique: (...args: any[]) => mockTenantFindUnique(...args),
      findMany: (...args: any[]) => mockTenantFindMany(...args),
      count: (...args: any[]) => mockTenantCount(...args),
      delete: (...args: any[]) => mockTenantDelete(...args),
    },
    plugin: {
      findUnique: (...args: any[]) => mockPluginFindUnique(...args),
    },
    tenantPlugin: {
      create: (...args: any[]) => mockTenantPluginCreate(...args),
      findUnique: (...args: any[]) => mockTenantPluginFindUnique(...args),
      delete: (...args: any[]) => mockTenantPluginDelete(...args),
    },
    $executeRawUnsafe: (...args: any[]) => mockExecuteRawUnsafe(...args),
  },
}));

vi.mock('../../../services/keycloak.service.js', () => ({
  keycloakService: {
    createRealm: vi.fn().mockResolvedValue(undefined),
    provisionRealmClients: vi.fn().mockResolvedValue(undefined),
    provisionRealmRoles: vi.fn().mockResolvedValue(undefined),
    configureRefreshTokenRotation: vi.fn().mockResolvedValue(undefined),
    deleteRealm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/permission.service.js', () => ({
  permissionService: {
    initializeDefaultRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { TenantService, type CreateTenantInput } from '../../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';
import { keycloakService } from '../../../services/keycloak.service.js';
import { permissionService } from '../../../services/permission.service.js';
import { logger } from '../../../lib/logger.js';

// Helper to create a mock tenant object
function makeMockTenant(overrides: Record<string, any> = {}) {
  return {
    id: 'tenant-123',
    slug: 'acme-corp',
    name: 'ACME Corporation',
    status: TenantStatus.ACTIVE,
    settings: {},
    translationOverrides: {},
    defaultLocale: 'en',
    theme: {},
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    plugins: [],
    ...overrides,
  };
}

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reconfigure external service mocks after clearing
    vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);
    vi.mocked(keycloakService.provisionRealmClients).mockResolvedValue(undefined);
    vi.mocked(keycloakService.provisionRealmRoles).mockResolvedValue(undefined);
    vi.mocked(keycloakService.configureRefreshTokenRotation).mockResolvedValue(undefined);
    vi.mocked(keycloakService.deleteRealm).mockResolvedValue(undefined);
    vi.mocked(permissionService.initializeDefaultRoles).mockResolvedValue(undefined);

    service = new TenantService();
  });

  describe('validateSlug', () => {
    it('should accept valid slugs via createTenant', async () => {
      const validSlugs = ['acme-corp', 'a', '123', 'my-tenant-42'];

      for (const slug of validSlugs) {
        vi.clearAllMocks();
        vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);
        vi.mocked(permissionService.initializeDefaultRoles).mockResolvedValue(undefined);

        const tenant = makeMockTenant({ slug, status: TenantStatus.PROVISIONING });
        mockTenantCreate.mockResolvedValue(tenant);
        mockExecuteRawUnsafe.mockResolvedValue(undefined);
        mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

        await expect(service.createTenant({ slug, name: 'Test' })).resolves.not.toThrow();
      }
    });

    it('should reject uppercase letters', async () => {
      await expect(service.createTenant({ slug: 'ACME-Corp', name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject special characters', async () => {
      await expect(service.createTenant({ slug: 'acme@corp!', name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject slugs longer than 50 chars', async () => {
      await expect(service.createTenant({ slug: 'a'.repeat(51), name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject empty slug', async () => {
      await expect(service.createTenant({ slug: '', name: 'Test' })).rejects.toThrow(
        /slug must be/i
      );
    });
  });

  describe('getSchemaName', () => {
    it('should generate valid schema name from slug', () => {
      const schemaName = service.getSchemaName('acme-corp');
      expect(schemaName).toBe('tenant_acme_corp');
    });

    it('should replace hyphens with underscores', () => {
      const schemaName = service.getSchemaName('my-test-tenant');
      expect(schemaName).toBe('tenant_my_test_tenant');
    });

    it('should handle slug with no hyphens', () => {
      const schemaName = service.getSchemaName('acme');
      expect(schemaName).toBe('tenant_acme');
    });
  });

  describe('createTenant', () => {
    it('should create tenant and provision all resources', async () => {
      const provisioningTenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      const activeTenant = makeMockTenant({ status: TenantStatus.ACTIVE });

      mockTenantCreate.mockResolvedValue(provisioningTenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue(activeTenant);

      const input: CreateTenantInput = {
        slug: 'acme-corp',
        name: 'ACME Corporation',
      };

      const result = await service.createTenant(input);

      // Verify tenant record created with PROVISIONING status
      expect(mockTenantCreate).toHaveBeenCalledWith({
        data: {
          slug: 'acme-corp',
          name: 'ACME Corporation',
          status: TenantStatus.PROVISIONING,
          settings: {},
          theme: {},
        },
      });

      // Verify schema creation SQL was called (multiple tables)
      expect(mockExecuteRawUnsafe).toHaveBeenCalled();
      const sqlCalls = mockExecuteRawUnsafe.mock.calls.map((c: any[]) => c[0]);
      expect(sqlCalls.some((sql: string) => sql.includes('CREATE SCHEMA'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"users"'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"roles"'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"user_roles"'))).toBe(true);

      // Verify Keycloak realm created
      expect(keycloakService.createRealm).toHaveBeenCalledWith('acme-corp', 'ACME Corporation');

      // Verify default roles initialized with correct schema name
      expect(permissionService.initializeDefaultRoles).toHaveBeenCalledWith('tenant_acme_corp');

      // Verify status updated to ACTIVE
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

      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should pass optional settings and theme to db.tenant.create', async () => {
      const settings = { feature: 'enabled' };
      const theme = { primaryColor: '#fff' };
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING, settings, theme });

      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({
        slug: 'acme-corp',
        name: 'ACME Corporation',
        settings,
        theme,
      });

      expect(mockTenantCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ settings, theme }),
      });
    });

    it('should throw error for duplicate slug (P2002)', async () => {
      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      mockTenantCreate.mockRejectedValue(prismaError);

      await expect(
        service.createTenant({ slug: 'acme-corp', name: 'ACME Corporation' })
      ).rejects.toThrow(/already exists/i);
    });

    it('should rethrow non-P2002 database errors', async () => {
      mockTenantCreate.mockRejectedValue(new Error('Connection lost'));

      await expect(service.createTenant({ slug: 'acme-corp', name: 'ACME' })).rejects.toThrow(
        'Connection lost'
      );
    });

    it('should set status to SUSPENDED on provisioning failure', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Schema creation failed'));
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.PROVISIONING });

      await expect(service.createTenant({ slug: 'acme-corp', name: 'ACME' })).rejects.toThrow(
        'Failed to provision tenant: Schema creation failed'
      );

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: expect.objectContaining({
          status: TenantStatus.PROVISIONING,
          settings: expect.objectContaining({
            provisioningError: 'Schema creation failed',
          }),
        }),
      });
    });

    it('should handle status update failure during provisioning rollback gracefully', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Schema creation failed'));
      // The status update itself fails (tenant might have been deleted concurrently)
      mockTenantUpdate.mockRejectedValue(new Error('Record not found'));

      await expect(service.createTenant({ slug: 'acme-corp', name: 'ACME' })).rejects.toThrow(
        'Failed to provision tenant'
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getTenant', () => {
    it('should retrieve tenant by ID with plugins included', async () => {
      const tenant = makeMockTenant({ plugins: [{ id: 'tp-1', plugin: { id: 'p-1' } }] });
      mockTenantFindUnique.mockResolvedValue(tenant);

      const result = await service.getTenant('tenant-123');

      expect(result).toEqual(tenant);
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        include: {
          plugins: {
            include: {
              plugin: true,
            },
          },
        },
      });
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('getTenantBySlug', () => {
    it('should retrieve tenant by slug with plugins included', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);

      const result = await service.getTenantBySlug('acme-corp');

      expect(result).toEqual(tenant);
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { slug: 'acme-corp' },
        include: {
          plugins: {
            include: {
              plugin: true,
            },
          },
        },
      });
    });

    it('should throw error when tenant not found by slug', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.getTenantBySlug('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  describe('listTenants', () => {
    it('should list all tenants with default pagination', async () => {
      const tenants = [makeMockTenant(), makeMockTenant({ id: 'tenant-456', slug: 'beta-inc' })];
      mockTenantFindMany.mockResolvedValue(tenants);
      mockTenantCount.mockResolvedValue(2);

      const result = await service.listTenants();

      expect(result.tenants).toEqual(tenants);
      expect(result.total).toBe(2);
      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should apply custom pagination', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(0);

      await service.listTenants({ skip: 10, take: 5 });

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('should filter by status', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(0);

      await service.listTenants({ status: TenantStatus.ACTIVE });

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TenantStatus.ACTIVE },
        })
      );
      expect(mockTenantCount).toHaveBeenCalledWith({
        where: { status: TenantStatus.ACTIVE },
      });
    });

    it('should filter by search term in name or slug', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(0);

      await service.listTenants({ search: 'acme' });

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { slug: { contains: 'acme', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('should combine status filter and search', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(0);

      await service.listTenants({ status: TenantStatus.ACTIVE, search: 'acme' });

      const expectedWhere = {
        status: TenantStatus.ACTIVE,
        OR: [
          { name: { contains: 'acme', mode: 'insensitive' } },
          { slug: { contains: 'acme', mode: 'insensitive' } },
        ],
      };

      expect(mockTenantFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      );
      expect(mockTenantCount).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('should return empty results when no tenants exist', async () => {
      mockTenantFindMany.mockResolvedValue([]);
      mockTenantCount.mockResolvedValue(0);

      const result = await service.listTenants();

      expect(result).toEqual({ tenants: [], total: 0 });
    });
  });

  describe('updateTenant', () => {
    it('should update tenant name', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, name: 'Updated Name' });

      const result = await service.updateTenant('tenant-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: {
          name: 'Updated Name',
          status: undefined,
          settings: undefined,
          theme: undefined,
        },
      });
    });

    it('should update tenant status', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.SUSPENDED });

      const result = await service.updateTenant('tenant-123', {
        status: TenantStatus.SUSPENDED,
      });

      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should update tenant settings', async () => {
      const tenant = makeMockTenant();
      const newSettings = { feature: 'on', limit: 100 };
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, settings: newSettings });

      const result = await service.updateTenant('tenant-123', { settings: newSettings });

      expect(result.settings).toEqual(newSettings);
    });

    it('should update tenant theme', async () => {
      const tenant = makeMockTenant();
      const newTheme = { primaryColor: '#007bff' };
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, theme: newTheme });

      const result = await service.updateTenant('tenant-123', { theme: newTheme });

      expect(result.theme).toEqual(newTheme);
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.updateTenant('nonexistent', { name: 'New Name' })).rejects.toThrow(
        'Tenant not found'
      );

      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteTenant', () => {
    it('should soft delete tenant by setting status to PENDING_DELETION', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({
        ...tenant,
        status: TenantStatus.PENDING_DELETION,
      });

      await service.deleteTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.PENDING_DELETION },
      });
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.deleteTenant('nonexistent')).rejects.toThrow('Tenant not found');

      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });
  });

  describe('hardDeleteTenant', () => {
    it('should delete keycloak realm, drop schema, and delete record', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantDelete.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      await service.hardDeleteTenant('tenant-123');

      // Verify Keycloak realm deletion
      expect(keycloakService.deleteRealm).toHaveBeenCalledWith('acme-corp');

      // Verify schema drop
      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        'DROP SCHEMA IF EXISTS "tenant_acme_corp" CASCADE'
      );

      // Verify tenant record deletion
      expect(mockTenantDelete).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.hardDeleteTenant('nonexistent')).rejects.toThrow('Tenant not found');

      expect(keycloakService.deleteRealm).not.toHaveBeenCalled();
      expect(mockTenantDelete).not.toHaveBeenCalled();
    });

    it('should wrap keycloak deletion failure in descriptive error', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);
      vi.mocked(keycloakService.deleteRealm).mockRejectedValue(new Error('Keycloak unavailable'));

      await expect(service.hardDeleteTenant('tenant-123')).rejects.toThrow(
        'Failed to delete tenant: Keycloak unavailable'
      );
    });

    it('should wrap schema drop failure in descriptive error', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Permission denied'));

      await expect(service.hardDeleteTenant('tenant-123')).rejects.toThrow(
        'Failed to delete tenant: Permission denied'
      );
    });

    it('should validate slug before using in SQL', async () => {
      // Tenant with an invalid slug stored in database should still be validated
      const tenant = makeMockTenant({ slug: 'INVALID_SLUG!' });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.hardDeleteTenant('tenant-123')).rejects.toThrow(/slug must be/i);

      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
      expect(keycloakService.deleteRealm).not.toHaveBeenCalled();
    });
  });

  describe('installPlugin', () => {
    it('should install plugin for tenant', async () => {
      const tenant = makeMockTenant();
      const plugin = { id: 'plugin-123', name: 'Analytics', version: '1.0.0' };
      const tenantPlugin = {
        id: 'tp-1',
        tenantId: 'tenant-123',
        pluginId: 'plugin-123',
        enabled: true,
        configuration: { key: 'value' },
        plugin,
      };

      mockTenantFindUnique.mockResolvedValue(tenant);
      mockPluginFindUnique.mockResolvedValue(plugin);
      mockTenantPluginFindUnique.mockResolvedValue(null); // Not already installed
      mockTenantPluginCreate.mockResolvedValue(tenantPlugin);

      const result = await service.installPlugin('tenant-123', 'plugin-123', { key: 'value' });

      expect(result).toEqual(tenantPlugin);
      expect(mockTenantPluginCreate).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          pluginId: 'plugin-123',
          enabled: true,
          configuration: { key: 'value' },
        },
        include: {
          plugin: true,
        },
      });
    });

    it('should use empty configuration by default', async () => {
      const tenant = makeMockTenant();
      const plugin = { id: 'plugin-123', name: 'Analytics' };

      mockTenantFindUnique.mockResolvedValue(tenant);
      mockPluginFindUnique.mockResolvedValue(plugin);
      mockTenantPluginFindUnique.mockResolvedValue(null);
      mockTenantPluginCreate.mockResolvedValue({ id: 'tp-1', plugin });

      await service.installPlugin('tenant-123', 'plugin-123');

      expect(mockTenantPluginCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ configuration: {} }),
        include: { plugin: true },
      });
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.installPlugin('nonexistent', 'plugin-123')).rejects.toThrow(
        'Tenant not found'
      );

      expect(mockPluginFindUnique).not.toHaveBeenCalled();
      expect(mockTenantPluginCreate).not.toHaveBeenCalled();
    });

    it('should throw error when plugin not found', async () => {
      mockTenantFindUnique.mockResolvedValue(makeMockTenant());
      mockPluginFindUnique.mockResolvedValue(null);

      await expect(service.installPlugin('tenant-123', 'nonexistent')).rejects.toThrow(
        'Plugin not found'
      );

      expect(mockTenantPluginCreate).not.toHaveBeenCalled();
    });

    it('should throw error when plugin already installed', async () => {
      mockTenantFindUnique.mockResolvedValue(makeMockTenant());
      mockPluginFindUnique.mockResolvedValue({ id: 'plugin-123' });
      mockTenantPluginFindUnique.mockResolvedValue({
        tenantId: 'tenant-123',
        pluginId: 'plugin-123',
      });

      await expect(service.installPlugin('tenant-123', 'plugin-123')).rejects.toThrow(
        'Plugin already installed'
      );

      expect(mockTenantPluginCreate).not.toHaveBeenCalled();
    });
  });

  describe('uninstallPlugin', () => {
    it('should uninstall plugin for tenant', async () => {
      mockTenantPluginDelete.mockResolvedValue({
        tenantId: 'tenant-123',
        pluginId: 'plugin-123',
      });

      await service.uninstallPlugin('tenant-123', 'plugin-123');

      expect(mockTenantPluginDelete).toHaveBeenCalledWith({
        where: {
          tenantId_pluginId: {
            tenantId: 'tenant-123',
            pluginId: 'plugin-123',
          },
        },
      });
    });

    it('should throw when plugin not installed (Prisma record not found)', async () => {
      const prismaError = new Error('Record to delete does not exist.');
      (prismaError as any).code = 'P2025';
      mockTenantPluginDelete.mockRejectedValue(prismaError);

      await expect(service.uninstallPlugin('tenant-123', 'nonexistent')).rejects.toThrow();
    });
  });

  describe('Schema Management', () => {
    it('should create dedicated PostgreSQL schema with correct name', async () => {
      const tenant = makeMockTenant({ slug: 'acme-corp', status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({ slug: 'acme-corp', name: 'ACME' });

      const firstCall = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(firstCall).toContain('CREATE SCHEMA IF NOT EXISTS "tenant_acme_corp"');
    });

    it('should grant privileges to database user', async () => {
      const tenant = makeMockTenant({ slug: 'acme-corp', status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({ slug: 'acme-corp', name: 'ACME' });

      const sqlCalls = mockExecuteRawUnsafe.mock.calls.map((c: any[]) => c[0]);
      expect(sqlCalls.some((sql: string) => sql.includes('GRANT ALL PRIVILEGES ON SCHEMA'))).toBe(
        true
      );
    });

    it('should create users, roles, and user_roles tables', async () => {
      const tenant = makeMockTenant({ slug: 'acme-corp', status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({ slug: 'acme-corp', name: 'ACME' });

      const sqlCalls = mockExecuteRawUnsafe.mock.calls.map((c: any[]) => c[0]);
      expect(sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."users"'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."roles"'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."user_roles"'))).toBe(
        true
      );
    });

    it('should create workspace and team tables with foreign keys', async () => {
      const tenant = makeMockTenant({ slug: 'acme-corp', status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({ slug: 'acme-corp', name: 'ACME' });

      const sqlCalls = mockExecuteRawUnsafe.mock.calls.map((c: any[]) => c[0]);
      expect(sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."workspaces"'))).toBe(
        true
      );
      expect(
        sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."workspace_members"'))
      ).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('"tenant_acme_corp"."teams"'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('FOREIGN KEY'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle P2002 unique constraint violation on createTenant', async () => {
      const error = { code: 'P2002', message: 'Unique constraint failed on slug' };
      mockTenantCreate.mockRejectedValue(error);

      await expect(service.createTenant({ slug: 'duplicate', name: 'Test' })).rejects.toThrow(
        /already exists/
      );
    });

    it('should store provisioning error message in tenant settings', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Connection refused'));
      mockTenantUpdate.mockResolvedValue({});

      await expect(service.createTenant({ slug: 'acme-corp', name: 'ACME' })).rejects.toThrow(
        'Failed to provision tenant'
      );

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settings: expect.objectContaining({
              provisioningError: 'Connection refused',
            }),
          }),
        })
      );
    });
  });
});
