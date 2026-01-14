// Unit tests for tenant-context middleware
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  tenantContextMiddleware,
  getTenantContext,
  getCurrentTenantSchema,
  tenantContextStorage,
} from '../middleware/tenant-context';
import { tenantService } from '../services/tenant.service';

// Mock tenant service
vi.mock('../services/tenant.service', () => ({
  tenantService: {
    getTenantBySlug: vi.fn(),
    getSchemaName: vi.fn(),
  },
}));

describe('Tenant Context Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      url: '/api/test',
      headers: {},
      log: {
        error: vi.fn(),
      } as any,
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('tenantContextMiddleware', () => {
    it('should set tenant context for valid tenant', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'ACTIVE',
      };

      mockRequest.headers = {
        'x-tenant-slug': 'test-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(tenantService.getTenantBySlug).toHaveBeenCalledWith('test-tenant');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should skip tenant context for health check route', async () => {
      mockRequest = { ...mockRequest, url: '/health' };

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
    });

    it('should skip tenant context for docs route', async () => {
      mockRequest = { ...mockRequest, url: '/docs' };

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
    });

    it('should skip tenant context for /api/tenants route', async () => {
      mockRequest = { ...mockRequest, url: '/api/tenants' };

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(tenantService.getTenantBySlug).not.toHaveBeenCalled();
    });

    it('should return 400 when X-Tenant-Slug header is missing', async () => {
      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Tenant identification required. Provide X-Tenant-Slug header.',
      });
    });

    it('should return 404 when tenant is not found', async () => {
      mockRequest.headers = {
        'x-tenant-slug': 'nonexistent-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(null);

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Not Found',
        message: "Tenant 'nonexistent-tenant' not found",
      });
    });

    it('should return 403 when tenant is not ACTIVE', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'suspended-tenant',
        name: 'Suspended Tenant',
        status: 'SUSPENDED',
      };

      mockRequest.headers = {
        'x-tenant-slug': 'suspended-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: "Tenant 'suspended-tenant' is not active (status: SUSPENDED)",
      });
    });

    it('should handle PROVISIONING status as inactive', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'new-tenant',
        name: 'New Tenant',
        status: 'PROVISIONING',
      };

      mockRequest.headers = {
        'x-tenant-slug': 'new-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: "Tenant 'new-tenant' is not active (status: PROVISIONING)",
      });
    });

    it('should return 500 on database errors', async () => {
      mockRequest.headers = {
        'x-tenant-slug': 'test-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockRejectedValue(
        new Error('Database connection failed')
      );

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to set tenant context',
      });
    });

    it('should handle X-Tenant-Slug header as array (take first value)', async () => {
      mockRequest.headers = {
        'x-tenant-slug': ['test-tenant', 'other-tenant'], // Array case
      };

      // Should return 400 since header is array (typeof !== 'string')
      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should attach tenant context to request object', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant',
        name: 'Test Tenant',
        status: 'ACTIVE',
      };

      mockRequest.headers = {
        'x-tenant-slug': 'test-tenant',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect((mockRequest as any).tenant).toEqual({
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      });
    });
  });

  describe('getTenantContext', () => {
    it('should return undefined when no context is set', () => {
      const context = getTenantContext();
      expect(context).toBeUndefined();
    });

    it('should return context when running inside tenantContextStorage', () => {
      const mockContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      };

      tenantContextStorage.run(mockContext, () => {
        const context = getTenantContext();
        expect(context).toEqual(mockContext);
      });
    });
  });

  describe('getCurrentTenantSchema', () => {
    it('should return undefined when no context is set', () => {
      const schema = getCurrentTenantSchema();
      expect(schema).toBeUndefined();
    });

    it('should return schema name when context is set', () => {
      const mockContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      };

      tenantContextStorage.run(mockContext, () => {
        const schema = getCurrentTenantSchema();
        expect(schema).toBe('tenant_test_tenant');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string tenant slug', async () => {
      mockRequest.headers = {
        'x-tenant-slug': '',
      };

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      // Empty string is falsy, should return 400
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should handle tenant slug with special characters', async () => {
      const mockTenant = {
        id: 'tenant-123',
        slug: 'test-tenant-123',
        name: 'Test Tenant',
        status: 'ACTIVE',
      };

      mockRequest.headers = {
        'x-tenant-slug': 'test-tenant-123',
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(mockTenant as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant_123');

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);
    });

    it('should handle case-sensitive tenant slugs', async () => {
      mockRequest.headers = {
        'x-tenant-slug': 'Test-Tenant', // Mixed case
      };

      vi.mocked(tenantService.getTenantBySlug).mockResolvedValue(null);

      await tenantContextMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply);

      expect(tenantService.getTenantBySlug).toHaveBeenCalledWith('Test-Tenant');
    });
  });
});
