// Unit tests for TenantService
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantService } from '../../../services/tenant.service';
import { db } from '../../../lib/db';

// Mock dependencies
vi.mock('../../../lib/db', () => ({
  db: {
    tenant: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../../services/keycloak.service', () => ({
  keycloakService: {
    createRealm: vi.fn().mockResolvedValue(undefined),
    deleteRealm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/permission.service', () => ({
  permissionService: {
    initializeDefaultRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantService();
  });

  describe('createTenant', () => {
    it('should create a tenant with PROVISIONING status', async () => {
      const mockTenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'PROVISIONING',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0);
      vi.mocked(db.tenant.update).mockResolvedValue({ ...mockTenant, status: 'ACTIVE' } as any);

      const result = await service.createTenant({ slug: 'test-tenant', name: 'Test Tenant' });

      expect(db.tenant.create).toHaveBeenCalledWith({
        data: {
          slug: 'test-tenant',
          name: 'Test Tenant',
          status: 'PROVISIONING',
          settings: {},
          theme: {},
        },
      });

      expect(result.status).toEqual('ACTIVE');
    });

    it('should create a PostgreSQL schema for the tenant', async () => {
      const mockTenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'PROVISIONING',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0);
      vi.mocked(db.tenant.update).mockResolvedValue({ ...mockTenant, status: 'ACTIVE' } as any);

      await service.createTenant({ slug: 'test-tenant', name: 'Test Tenant' });

      // Should create schema
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA IF NOT EXISTS')
      );
    });

    it('should update tenant status to ACTIVE after successful provisioning', async () => {
      const mockTenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'PROVISIONING',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0);
      vi.mocked(db.tenant.update).mockResolvedValue({
        ...mockTenant,
        status: 'ACTIVE',
      } as any);

      await service.createTenant({ slug: 'test-tenant', name: 'Test Tenant' });

      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'test-tenant-id' },
        data: { status: 'ACTIVE' },
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

    it('should handle provisioning errors gracefully', async () => {
      const mockTenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'PROVISIONING',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.create).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockRejectedValue(new Error('Schema creation failed'));
      vi.mocked(db.tenant.update).mockResolvedValue({ ...mockTenant, status: 'SUSPENDED' } as any);

      await expect(
        service.createTenant({ slug: 'test-tenant', name: 'Test Tenant' })
      ).rejects.toThrow('Failed to provision tenant');
    });
  });

  describe('hardDeleteTenant', () => {
    it('should delete tenant and drop PostgreSQL schema', async () => {
      const mockTenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        theme: {},
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0);
      vi.mocked(db.tenant.delete).mockResolvedValue(mockTenant as any);

      await service.hardDeleteTenant('test-tenant-id');

      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DROP SCHEMA IF EXISTS')
      );
      expect(db.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'test-tenant-id' },
      });
    });
  });
});
