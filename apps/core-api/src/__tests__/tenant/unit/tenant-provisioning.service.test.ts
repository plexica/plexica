/**
 * Tenant Provisioning Unit Tests
 *
 * Tests the TenantService provisioning flow (createTenant, hardDeleteTenant).
 * Uses ProvisioningOrchestrator mock to verify orchestrator is called correctly
 * without executing real provisioning steps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantService } from '../../../services/tenant.service.js';
import { TenantStatus } from '@plexica/database';

// --- Mocks ---

const mockTenantCreate = vi.fn();
const mockTenantUpdate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockTenantDelete = vi.fn();
const mockExecuteRaw = vi.fn();
const mockExecuteRawUnsafe = vi.fn();

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      create: (...args: any[]) => mockTenantCreate(...args),
      update: (...args: any[]) => mockTenantUpdate(...args),
      findUnique: (...args: any[]) => mockTenantFindUnique(...args),
      delete: (...args: any[]) => mockTenantDelete(...args),
    },
    $executeRaw: (...args: any[]) => mockExecuteRaw(...args),
    $executeRawUnsafe: (...args: any[]) => mockExecuteRawUnsafe(...args),
  },
}));

// ProvisioningOrchestrator mock — prevents real step execution
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

// MinIO mock — required because hardDeleteTenant uses it
vi.mock('../../../services/minio-client.js', () => ({
  getMinioClient: () => ({
    removeTenantBucket: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Redis mock — required because hardDeleteTenant uses it
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    scan: vi.fn().mockResolvedValue(['0', []]),
    del: vi.fn().mockResolvedValue(0),
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

// --- Helpers ---

const ADMIN_EMAIL = 'admin@example.com';

const makeMockTenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-tenant-id',
  slug: 'test-tenant',
  name: 'Test Tenant',
  status: TenantStatus.PROVISIONING,
  createdAt: new Date(),
  updatedAt: new Date(),
  settings: {},
  translationOverrides: {},
  defaultLocale: 'en',
  theme: {},
  ...overrides,
});

describe('TenantService — Provisioning', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvision.mockResolvedValue({ success: true, completedSteps: [] });
    service = new TenantService();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // createTenant
  // ──────────────────────────────────────────────────────────────────────────────

  describe('createTenant', () => {
    it('should create tenant record with PROVISIONING status initially', async () => {
      const mockTenant = makeMockTenant();
      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      });

      expect(mockTenantCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'test-tenant',
            name: 'Test Tenant',
            status: TenantStatus.PROVISIONING,
          }),
        })
      );
    });

    it('should delegate provisioning to ProvisioningOrchestrator', async () => {
      const mockTenant = makeMockTenant();
      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      });

      expect(mockProvision).toHaveBeenCalledTimes(1);
    });

    it('should update tenant status to ACTIVE after successful provisioning', async () => {
      const mockTenant = makeMockTenant();
      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      });

      expect(result.status).toEqual(TenantStatus.ACTIVE);
      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-tenant-id' },
          data: { status: TenantStatus.ACTIVE },
        })
      );
    });

    it('should throw when orchestrator reports failure', async () => {
      const mockTenant = makeMockTenant();
      mockTenantCreate.mockResolvedValue(mockTenant);
      mockProvision.mockResolvedValue({
        success: false,
        error: 'Schema creation failed',
        completedSteps: [],
      });

      await expect(
        service.createTenant({ slug: 'test-tenant', name: 'Test Tenant', adminEmail: ADMIN_EMAIL })
      ).rejects.toThrow('Failed to provision tenant: Schema creation failed');
    });

    it('should NOT call $executeRawUnsafe directly (provisioning delegated to orchestrator)', async () => {
      const mockTenant = makeMockTenant();
      mockTenantCreate.mockResolvedValue(mockTenant);
      mockTenantUpdate.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      await service.createTenant({
        slug: 'test-tenant',
        name: 'Test Tenant',
        adminEmail: ADMIN_EMAIL,
      });

      // Schema creation is now handled by SchemaStep inside ProvisioningOrchestrator
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // hardDeleteTenant
  // ──────────────────────────────────────────────────────────────────────────────

  describe('hardDeleteTenant', () => {
    it('should drop schema with $executeRaw and delete tenant record', async () => {
      const mockTenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockExecuteRaw.mockResolvedValue(0);
      mockTenantDelete.mockResolvedValue(mockTenant);

      await service.hardDeleteTenant('test-tenant-id');

      // Schema drop uses tagged $executeRaw (parameterized-safe)
      expect(mockExecuteRaw).toHaveBeenCalled();
      expect(mockTenantDelete).toHaveBeenCalledWith({
        where: { id: 'test-tenant-id' },
      });
    });

    it('should proceed with tenant deletion even if MinIO cleanup fails', async () => {
      const mockTenant = makeMockTenant({ status: TenantStatus.ACTIVE });
      mockTenantFindUnique.mockResolvedValue(mockTenant);
      mockExecuteRaw.mockResolvedValue(0);
      mockTenantDelete.mockResolvedValue(mockTenant);

      // getMinioClient().removeTenantBucket throws — should not propagate
      const { getMinioClient } = await import('../../../services/minio-client.js');
      vi.mocked(getMinioClient).mockReturnValueOnce({
        removeTenantBucket: vi.fn().mockRejectedValue(new Error('MinIO unreachable')),
      } as any);

      await expect(service.hardDeleteTenant('test-tenant-id')).resolves.not.toThrow();
      expect(mockTenantDelete).toHaveBeenCalled();
    });

    it('should throw when tenant not found', async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await expect(service.hardDeleteTenant('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });
});
