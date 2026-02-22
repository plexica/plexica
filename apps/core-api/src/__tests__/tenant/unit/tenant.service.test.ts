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
const mockExecuteRaw = vi.fn();

// MinIO mock
const mockRemoveTenantBucket = vi.fn();
vi.mock('../../../services/minio-client.js', () => ({
  getMinioClient: () => ({
    removeTenantBucket: mockRemoveTenantBucket,
  }),
}));

// Redis mock
const mockRedisScan = vi.fn();
const mockRedisDel = vi.fn();
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    scan: (...args: any[]) => mockRedisScan(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  },
}));

// ProvisioningOrchestrator mock — prevents real step execution in unit tests
const mockProvision = vi.fn();
vi.mock('../../../services/provisioning-orchestrator.js', () => ({
  ProvisioningOrchestrator: vi.fn().mockImplementation(() => ({
    provision: mockProvision,
  })),
  provisioningOrchestrator: { provision: vi.fn() },
}));

// Mock provisioning steps so they don't try to import real clients
vi.mock('../../../services/provisioning-steps/index.js', () => ({
  SchemaStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRealmStep: vi.fn().mockImplementation(() => ({})),
  KeycloakClientsStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRolesStep: vi.fn().mockImplementation(() => ({})),
  MinioBucketStep: vi.fn().mockImplementation(() => ({})),
  AdminUserStep: vi.fn().mockImplementation(() => ({})),
  InvitationStep: vi.fn().mockImplementation(() => ({})),
}));

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
    $executeRaw: (...args: any[]) => mockExecuteRaw(...args),
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

    // Default MinIO / Redis happy path
    mockRemoveTenantBucket.mockResolvedValue(undefined);
    mockRedisScan.mockResolvedValue(['0', []]);
    mockRedisDel.mockResolvedValue(1);

    // Default orchestrator succeeds
    mockProvision.mockResolvedValue({ success: true, completedSteps: [] });

    service = new TenantService();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // validateSlug
  // ──────────────────────────────────────────────────────────────────────────────

  describe('validateSlug', () => {
    it('should accept valid slugs via createTenant', async () => {
      // 3-char min, starts with letter, ends with alphanumeric
      const validSlugs = ['acm', 'acme-corp', 'abc123', 'my-tenant-42'];

      for (const slug of validSlugs) {
        vi.clearAllMocks();
        mockProvision.mockResolvedValue({ success: true, completedSteps: [] });

        const tenant = makeMockTenant({ slug, status: TenantStatus.PROVISIONING });
        mockTenantCreate.mockResolvedValue(tenant);
        mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

        await expect(
          service.createTenant({ slug, name: 'Test', adminEmail: 'admin@example.com' })
        ).resolves.not.toThrow();
      }
    });

    it('should reject uppercase letters', async () => {
      await expect(
        service.createTenant({ slug: 'ACME-Corp', name: 'Test', adminEmail: 'admin@example.com' })
      ).rejects.toThrow(/slug must be/i);

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject special characters', async () => {
      await expect(
        service.createTenant({ slug: 'acme@corp!', name: 'Test', adminEmail: 'a@b.com' })
      ).rejects.toThrow(/slug must be/i);

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject slugs longer than 64 chars', async () => {
      await expect(
        service.createTenant({ slug: 'a'.repeat(65), name: 'Test', adminEmail: 'a@b.com' })
      ).rejects.toThrow(/slug must be/i);

      expect(mockTenantCreate).not.toHaveBeenCalled();
    });

    it('should reject empty slug', async () => {
      await expect(
        service.createTenant({ slug: '', name: 'Test', adminEmail: 'a@b.com' })
      ).rejects.toThrow(/slug must be/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // getSchemaName
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // createTenant
  // ──────────────────────────────────────────────────────────────────────────────

  describe('createTenant', () => {
    it('should create tenant record and provision via orchestrator', async () => {
      const provisioningTenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      const activeTenant = makeMockTenant({ status: TenantStatus.ACTIVE });

      mockTenantCreate.mockResolvedValue(provisioningTenant);
      mockTenantUpdate.mockResolvedValue(activeTenant);

      const input: CreateTenantInput = {
        slug: 'acme-corp',
        name: 'ACME Corporation',
        adminEmail: 'admin@acme.com',
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

      // Verify orchestrator was invoked
      expect(mockProvision).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          tenantSlug: 'acme-corp',
          adminEmail: 'admin@acme.com',
        }),
        expect.any(Array)
      );

      // Verify status updated to ACTIVE
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.ACTIVE },
      });

      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should pass optional settings and theme to db.tenant.create', async () => {
      const settings = { feature: 'enabled' };
      const theme = { primaryColor: '#fff' };
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING, settings, theme });

      mockTenantCreate.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      await service.createTenant({
        slug: 'acme-corp',
        name: 'ACME Corporation',
        adminEmail: 'admin@acme.com',
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
        service.createTenant({ slug: 'acme-corp', name: 'ACME', adminEmail: 'a@b.com' })
      ).rejects.toThrow(/already exists/i);
    });

    it('should rethrow non-P2002 database errors', async () => {
      mockTenantCreate.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.createTenant({ slug: 'acme-corp', name: 'ACME', adminEmail: 'a@b.com' })
      ).rejects.toThrow('Connection lost');
    });

    it('should throw provisioning error when orchestrator fails', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantCreate.mockResolvedValue(tenant);
      mockProvision.mockResolvedValue({ success: false, error: 'Schema creation failed' });

      await expect(
        service.createTenant({ slug: 'acme-corp', name: 'ACME', adminEmail: 'a@b.com' })
      ).rejects.toThrow('Failed to provision tenant: Schema creation failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // getTenant / getTenantBySlug
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // listTenants
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // updateTenant
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // suspendTenant — new method (HIGH-3 fix)
  // ──────────────────────────────────────────────────────────────────────────────

  describe('suspendTenant', () => {
    it('should suspend an ACTIVE tenant (ACTIVE → SUSPENDED)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.SUSPENDED });

      const result = await service.suspendTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.SUSPENDED },
      });
      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should throw when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.suspendTenant('nonexistent')).rejects.toThrow('Tenant not found');
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is already SUSPENDED', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.SUSPENDED });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.suspendTenant('tenant-123')).rejects.toThrow(
        /Cannot suspend tenant with status: SUSPENDED/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is PROVISIONING (state machine guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.suspendTenant('tenant-123')).rejects.toThrow(
        /Cannot suspend tenant with status: PROVISIONING/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is PENDING_DELETION (state machine guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.suspendTenant('tenant-123')).rejects.toThrow(
        /Cannot suspend tenant with status: PENDING_DELETION/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is DELETED (state machine guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.DELETED });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.suspendTenant('tenant-123')).rejects.toThrow(
        /Cannot suspend tenant with status: DELETED/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // deleteTenant — now with service-layer guards (MEDIUM-5 fix)
  // ──────────────────────────────────────────────────────────────────────────────

  describe('deleteTenant', () => {
    it('should soft delete an ACTIVE tenant (ACTIVE → PENDING_DELETION)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({
        ...tenant,
        status: TenantStatus.PENDING_DELETION,
      });

      const result = await service.deleteTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: expect.objectContaining({
          status: TenantStatus.PENDING_DELETION,
          deletionScheduledAt: expect.any(Date),
        }),
      });
      expect(result).toHaveProperty('deletionScheduledAt');
    });

    it('should soft delete a SUSPENDED tenant (SUSPENDED → PENDING_DELETION)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.SUSPENDED });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.PENDING_DELETION });

      await service.deleteTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: expect.objectContaining({ status: TenantStatus.PENDING_DELETION }),
      });
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.deleteTenant('nonexistent')).rejects.toThrow('Tenant not found');
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is already PENDING_DELETION (service-layer guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.deleteTenant('tenant-123')).rejects.toThrow(
        /Cannot delete tenant with status: PENDING_DELETION/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is DELETED (service-layer guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.DELETED });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.deleteTenant('tenant-123')).rejects.toThrow(
        /Cannot delete tenant with status: DELETED/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when tenant is PROVISIONING (service-layer guard)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.deleteTenant('tenant-123')).rejects.toThrow(
        /Cannot delete tenant with status: PROVISIONING/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should schedule deletion 30 days in the future', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.PENDING_DELETION });

      const before = Date.now();
      const result = await service.deleteTenant('tenant-123');
      const after = Date.now();

      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      const scheduledMs = result.deletionScheduledAt.getTime();
      expect(scheduledMs).toBeGreaterThanOrEqual(before + expectedMs - 1000);
      expect(scheduledMs).toBeLessThanOrEqual(after + expectedMs + 1000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // activateTenant — new method
  // ──────────────────────────────────────────────────────────────────────────────

  describe('activateTenant', () => {
    it('should reactivate a SUSPENDED tenant (SUSPENDED → ACTIVE)', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.SUSPENDED });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.ACTIVE });

      const result = await service.activateTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.ACTIVE },
      });
      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should rescue a PENDING_DELETION tenant (PENDING_DELETION → SUSPENDED, clears date)', async () => {
      const tenant = makeMockTenant({
        status: TenantStatus.PENDING_DELETION,
        deletionScheduledAt: new Date(),
      });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantUpdate.mockResolvedValue({ ...tenant, status: TenantStatus.SUSPENDED });

      const result = await service.activateTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.SUSPENDED, deletionScheduledAt: null },
      });
      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should throw when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.activateTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should throw when trying to activate an ACTIVE tenant', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.activateTenant('tenant-123')).rejects.toThrow(
        /Cannot activate tenant with status: ACTIVE/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when trying to activate a PROVISIONING tenant', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PROVISIONING });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.activateTenant('tenant-123')).rejects.toThrow(
        /Cannot activate tenant with status: PROVISIONING/
      );
    });

    it('should throw when trying to activate a DELETED tenant', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.DELETED });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.activateTenant('tenant-123')).rejects.toThrow(
        /Cannot activate tenant with status: DELETED/
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // hardDeleteTenant — now cleans MinIO + Redis (HIGH-1 fix)
  // ──────────────────────────────────────────────────────────────────────────────

  describe('hardDeleteTenant', () => {
    it('should delete Keycloak realm, MinIO bucket, Redis keys, drop schema, and delete record', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantDelete.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      // Simulate one iteration of Redis SCAN returning 2 keys, then done
      mockRedisScan
        .mockResolvedValueOnce(['1', ['tenant:acme-corp:session', 'tenant:acme-corp:cache']])
        .mockResolvedValueOnce(['0', []]);

      await service.hardDeleteTenant('tenant-123');

      // Keycloak realm deleted
      expect(keycloakService.deleteRealm).toHaveBeenCalledWith('acme-corp');

      // MinIO bucket removed
      expect(mockRemoveTenantBucket).toHaveBeenCalledWith('acme-corp');

      // Redis scan + del
      expect(mockRedisScan).toHaveBeenCalledWith('0', 'MATCH', 'tenant:acme-corp:*', 'COUNT', 100);
      expect(mockRedisDel).toHaveBeenCalledWith(
        'tenant:acme-corp:session',
        'tenant:acme-corp:cache'
      );

      // Schema drop
      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        'DROP SCHEMA IF EXISTS "tenant_acme_corp" CASCADE'
      );

      // Tenant record deleted
      expect(mockTenantDelete).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
    });

    it('should skip Redis del when scan returns no keys', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantDelete.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockRedisScan.mockResolvedValue(['0', []]); // no keys

      await service.hardDeleteTenant('tenant-123');

      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it('should continue after MinIO failure (non-fatal) and still delete record', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantDelete.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockRemoveTenantBucket.mockRejectedValue(new Error('MinIO unavailable'));

      await service.hardDeleteTenant('tenant-123');

      expect(logger.warn).toHaveBeenCalled();
      expect(mockTenantDelete).toHaveBeenCalled();
    });

    it('should continue after Redis failure (non-fatal) and still delete record', async () => {
      const tenant = makeMockTenant({ status: TenantStatus.PENDING_DELETION });
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockTenantDelete.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockResolvedValue(undefined);
      mockRedisScan.mockRejectedValue(new Error('Redis unavailable'));

      await service.hardDeleteTenant('tenant-123');

      expect(logger.warn).toHaveBeenCalled();
      expect(mockTenantDelete).toHaveBeenCalled();
    });

    it('should throw error when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.hardDeleteTenant('nonexistent')).rejects.toThrow('Tenant not found');

      expect(keycloakService.deleteRealm).not.toHaveBeenCalled();
      expect(mockTenantDelete).not.toHaveBeenCalled();
    });

    it('should wrap schema drop failure in descriptive error', async () => {
      const tenant = makeMockTenant();
      mockTenantFindUnique.mockResolvedValue(tenant);
      mockExecuteRawUnsafe.mockRejectedValue(new Error('Permission denied'));

      await expect(service.hardDeleteTenant('tenant-123')).rejects.toThrow(
        'Failed to delete tenant: Permission denied'
      );
    });

    it('should validate slug before using in SQL (HIGH-2 guard)', async () => {
      // Tenant with an invalid slug stored in database should still be validated
      const tenant = makeMockTenant({ slug: 'INVALID_SLUG!' });
      mockTenantFindUnique.mockResolvedValue(tenant);

      await expect(service.hardDeleteTenant('tenant-123')).rejects.toThrow(/slug must be/i);

      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
      expect(keycloakService.deleteRealm).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // installPlugin / uninstallPlugin
  // ──────────────────────────────────────────────────────────────────────────────

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
});
