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
import { TenantService } from '../../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';
import { permissionService } from '../../../services/permission.service.js';
import { keycloakService } from '../../../services/keycloak.service.js';

// Mock dependencies
const mockTenantCreate = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantDelete = vi.fn();
const mockExecuteRawUnsafe = vi.fn();
const mockExecuteRaw = vi.fn();

// MinIO mock (required because hardDeleteTenant uses it)
vi.mock('../../../services/minio-client.js', () => ({
  getMinioClient: () => ({
    removeTenantBucket: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Redis mock (required because hardDeleteTenant uses it)
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    scan: vi.fn().mockResolvedValue(['0', []]),
    del: vi.fn().mockResolvedValue(0),
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

vi.mock('../../../services/provisioning-steps/index.js', () => ({
  SchemaStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRealmStep: vi.fn().mockImplementation(() => ({})),
  KeycloakClientsStep: vi.fn().mockImplementation(() => ({})),
  KeycloakRolesStep: vi.fn().mockImplementation(() => ({})),
  MinioBucketStep: vi.fn().mockImplementation(() => ({})),
  AdminUserStep: vi.fn().mockImplementation(() => ({})),
  InvitationStep: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      create: (...args: any[]) => mockTenantCreate(...args),
      update: (...args: any[]) => mockTenantUpdate(...args),
      findUnique: (...args: any[]) => mockTenantFindUnique(...args),
      delete: (...args: any[]) => mockTenantDelete(...args),
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

// Shared admin email constant
const ADMIN_EMAIL = 'admin@example.com';

describe('Tenant Lifecycle', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reconfigure mocks after clearing
    vi.mocked(permissionService.initializeDefaultRoles).mockResolvedValue(undefined);
    vi.mocked(keycloakService.createRealm).mockResolvedValue(undefined);
    vi.mocked(keycloakService.provisionRealmClients).mockResolvedValue(undefined);
    vi.mocked(keycloakService.provisionRealmRoles).mockResolvedValue(undefined);
    vi.mocked(keycloakService.configureRefreshTokenRotation).mockResolvedValue(undefined);
    vi.mocked(keycloakService.deleteRealm).mockResolvedValue(undefined);

    // Default orchestrator succeeds
    mockProvision.mockResolvedValue({ success: true, completedSteps: [] });

    service = new TenantService();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // State Transitions
  // ──────────────────────────────────────────────────────────────────────────────

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
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.ACTIVE,
      });

      const result = await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      });

      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.ACTIVE },
      });
    });

    it('should transition from ACTIVE to SUSPENDED via suspendTenant', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      });

      const result = await service.suspendTenant('tenant-123');

      expect(result.status).toBe(TenantStatus.SUSPENDED);
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { status: TenantStatus.SUSPENDED },
      });
    });

    it('should transition from SUSPENDED to ACTIVE via activateTenant', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.SUSPENDED,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.ACTIVE,
      });

      const result = await service.activateTenant('tenant-123');

      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should transition from ACTIVE to PENDING_DELETION via deleteTenant', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.PENDING_DELETION });

      const result = await service.deleteTenant('tenant-123');

      expect(result).toHaveProperty('deletionScheduledAt');
    });

    it('should report provisioning error when orchestrator fails', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
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

      await expect(
        service.createTenant({
          slug: 'test-tenant',
          name: 'Test Tenant',
          adminEmail: ADMIN_EMAIL,
        })
      ).rejects.toThrow('Failed to provision tenant: Schema creation failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Slug Validation
  // ──────────────────────────────────────────────────────────────────────────────

  describe('Slug Validation', () => {
    it('should accept valid lowercase alphanumeric slug with hyphens', async () => {
      // Must be 3+ chars, start with letter, end with alphanumeric
      const validSlugs = ['tes', 'test-tenant', 'acme-corp', 'my-company-123', 'abc-def'];

      for (const slug of validSlugs) {
        vi.clearAllMocks();
        mockProvision.mockResolvedValue({ success: true, completedSteps: [] });

        const mockTenant = {
          id: 'tenant-id',
          slug,
          name: 'Test',
          status: TenantStatus.PROVISIONING,
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: {},
          translationOverrides: {},
          defaultLocale: 'en',
          theme: {},
        };

        mockTenantCreate.mockResolvedValue(mockTenant);
        mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

        await expect(
          service.createTenant({ slug, name: 'Test', adminEmail: ADMIN_EMAIL })
        ).resolves.not.toThrow();
      }
    });

    it('should reject slug with uppercase letters', async () => {
      await expect(
        service.createTenant({ slug: 'Test-Tenant', name: 'Test', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow(/slug must be/i);
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
        await expect(
          service.createTenant({ slug, name: 'Test', adminEmail: ADMIN_EMAIL })
        ).rejects.toThrow(/slug must be/i);
      }
    });

    it('should reject slug that is too short (empty)', async () => {
      await expect(
        service.createTenant({ slug: '', name: 'Test', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow(/slug must be/i);
    });

    it('should reject slug that is too long (>64 chars)', async () => {
      const longSlug = 'a'.repeat(65);
      await expect(
        service.createTenant({ slug: longSlug, name: 'Test', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow(/slug must be/i);
    });

    it('should accept slug at maximum length (64 chars)', async () => {
      // pattern: /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/ → max 64 chars total
      // prefix: 'a', body: 62 chars, suffix: 'b'
      const maxSlug = 'a' + 'b'.repeat(62) + 'c';
      const mockTenant = {
        id: 'tenant-id',
        slug: maxSlug,
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      await expect(
        service.createTenant({ slug: maxSlug, name: 'Test', adminEmail: ADMIN_EMAIL })
      ).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Schema Name Generation
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should reject duplicate slug', async () => {
      mockTenantCreate.mockRejectedValue({
        code: 'P2002', // Prisma unique constraint violation
        meta: { target: ['slug'] },
      });

      await expect(
        service.createTenant({ slug: 'existing-tenant', name: 'Test', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow(/already exists/i);
    });

    it('should propagate provisioning failure through orchestrator', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockProvision.mockResolvedValue({ success: false, error: 'Database error' });

      await expect(
        service.createTenant({ slug: 'test-tenant', name: 'Test', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow('Failed to provision tenant');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Input Validation
  // ──────────────────────────────────────────────────────────────────────────────

  describe('Input Validation', () => {
    it('should accept valid tenant name', async () => {
      const mockTenant = {
        id: 'tenant-id',
        slug: 'tst',
        name: 'Test Tenant Name',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'tst',
        name: 'Test Tenant Name',
        adminEmail: ADMIN_EMAIL,
      });

      expect(result.name).toBe('Test Tenant Name');
    });

    it('should accept optional settings object', async () => {
      const settings = { theme: 'dark', language: 'en' };
      const mockTenant = {
        id: 'tenant-id',
        slug: 'tst',
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings,
        theme: {},
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'tst',
        name: 'Test',
        adminEmail: ADMIN_EMAIL,
        settings,
      });

      expect(result.settings).toEqual(settings);
    });

    it('should accept optional theme object', async () => {
      const theme = { primaryColor: '#007bff', logo: 'logo.png' };
      const mockTenant = {
        id: 'tenant-id',
        slug: 'tst',
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme,
      };

      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'tst',
        name: 'Test',
        adminEmail: ADMIN_EMAIL,
        theme,
      });

      expect(result.theme).toEqual(theme);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Get Operations
  // ──────────────────────────────────────────────────────────────────────────────

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
        translationOverrides: {},
        defaultLocale: 'en',
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
        translationOverrides: {},
        defaultLocale: 'en',
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

  // ──────────────────────────────────────────────────────────────────────────────
  // Update Operations
  // ──────────────────────────────────────────────────────────────────────────────

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
        translationOverrides: {},
        defaultLocale: 'en',
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

  // ──────────────────────────────────────────────────────────────────────────────
  // Delete Operations
  // ──────────────────────────────────────────────────────────────────────────────

  describe('Delete Operations', () => {
    it('should soft delete ACTIVE tenant to PENDING_DELETION', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };

      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.PENDING_DELETION,
      });

      const result = await service.deleteTenant('tenant-123');

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-123' },
          data: expect.objectContaining({ status: TenantStatus.PENDING_DELETION }),
        })
      );
      expect(result).toHaveProperty('deletionScheduledAt');
    });

    it('should throw error when deleting nonexistent tenant', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.deleteTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should throw when trying to delete PENDING_DELETION tenant (service guard)', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test',
        status: TenantStatus.PENDING_DELETION,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };
      mockTenantFindUnique.mockResolvedValue(mockTenant);

      await expect(service.deleteTenant('tenant-123')).rejects.toThrow(
        /Cannot delete tenant with status: PENDING_DELETION/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('should throw when trying to delete PROVISIONING tenant (service guard)', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test',
        status: TenantStatus.PROVISIONING,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        translationOverrides: {},
        defaultLocale: 'en',
        theme: {},
      };
      mockTenantFindUnique.mockResolvedValue(mockTenant);

      await expect(service.deleteTenant('tenant-123')).rejects.toThrow(
        /Cannot delete tenant with status: PROVISIONING/
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });
  });
});
