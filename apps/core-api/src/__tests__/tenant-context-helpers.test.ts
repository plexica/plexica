// Tests for tenant context helper functions
import { describe, it, expect, vi } from 'vitest';
import {
  tenantContextStorage,
  getTenantContext,
  getCurrentTenantSchema,
  getWorkspaceIdOrThrow,
  getWorkspaceId,
  setWorkspaceId,
  getUserId,
  setUserId,
  executeInTenantSchema,
  type TenantContext,
} from '../middleware/tenant-context';

describe('Tenant Context Helper Functions', () => {
  const mockContext: TenantContext = {
    tenantId: 'tenant-123',
    tenantSlug: 'test-tenant',
    schemaName: 'tenant_test_tenant',
    workspaceId: 'workspace-456',
    userId: 'user-789',
  };

  describe('getTenantContext', () => {
    it('should return undefined when no context is set', () => {
      // When no context is set, getTenantContext returns undefined
      const context = getTenantContext();
      expect(context).toBeUndefined();
    });

    it('should return context when set in AsyncLocalStorage', () => {
      const result = tenantContextStorage.run(mockContext, () => {
        return getTenantContext();
      });
      expect(result).toEqual(mockContext);
    });
  });

  describe('getCurrentTenantSchema', () => {
    it('should return schema name from context', () => {
      const result = tenantContextStorage.run(mockContext, () => {
        return getCurrentTenantSchema();
      });
      expect(result).toBe('tenant_test_tenant');
    });

    it('should return undefined when no context is set', () => {
      // This will be undefined as we're not in a context
      const result = getCurrentTenantSchema();
      expect(result).toBeUndefined();
    });
  });

  describe('getWorkspaceId', () => {
    it('should return workspace ID from context', () => {
      const result = tenantContextStorage.run(mockContext, () => {
        return getWorkspaceId();
      });
      expect(result).toBe('workspace-456');
    });

    it('should return undefined when workspace ID is not set', () => {
      const contextWithoutWorkspace: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      };

      const result = tenantContextStorage.run(contextWithoutWorkspace, () => {
        return getWorkspaceId();
      });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no context is set', () => {
      const result = getWorkspaceId();
      expect(result).toBeUndefined();
    });
  });

  describe('getWorkspaceIdOrThrow', () => {
    it('should return workspace ID when available', () => {
      const result = tenantContextStorage.run(mockContext, () => {
        return getWorkspaceIdOrThrow();
      });
      expect(result).toBe('workspace-456');
    });

    it('should throw when workspace ID is not set', () => {
      const contextWithoutWorkspace: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      };

      expect(() => {
        tenantContextStorage.run(contextWithoutWorkspace, () => {
          return getWorkspaceIdOrThrow();
        });
      }).toThrow('No workspace context available');
    });

    it('should throw when no context is set', () => {
      expect(() => {
        getWorkspaceIdOrThrow();
      }).toThrow('No tenant context available');
    });
  });

  describe('setWorkspaceId', () => {
    it('should set workspace ID in context', () => {
      const result = tenantContextStorage.run({ ...mockContext }, () => {
        setWorkspaceId('new-workspace-id');
        return getWorkspaceId();
      });
      expect(result).toBe('new-workspace-id');
    });

    it('should throw when no context is set', () => {
      expect(() => {
        setWorkspaceId('new-workspace-id');
      }).toThrow('No tenant context available');
    });
  });

  describe('getUserId', () => {
    it('should return user ID from context', () => {
      const result = tenantContextStorage.run(mockContext, () => {
        return getUserId();
      });
      expect(result).toBe('user-789');
    });

    it('should return undefined when user ID is not set', () => {
      const contextWithoutUser: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_test_tenant',
      };

      const result = tenantContextStorage.run(contextWithoutUser, () => {
        return getUserId();
      });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no context is set', () => {
      const result = getUserId();
      expect(result).toBeUndefined();
    });
  });

  describe('setUserId', () => {
    it('should set user ID in context', () => {
      const result = tenantContextStorage.run({ ...mockContext }, () => {
        setUserId('new-user-id');
        return getUserId();
      });
      expect(result).toBe('new-user-id');
    });

    it('should throw when no context is set', () => {
      expect(() => {
        setUserId('new-user-id');
      }).toThrow('No tenant context available');
    });
  });

  describe('executeInTenantSchema', () => {
    it('should execute callback with correct schema path', async () => {
      const mockPrisma = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      };

      const callback = vi.fn().mockResolvedValue({ result: 'success' });

      const result = await tenantContextStorage.run(mockContext, async () => {
        return executeInTenantSchema(mockPrisma, callback);
      });

      expect(result).toEqual({ result: 'success' });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'SET search_path TO "tenant_test_tenant"'
      );
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith('SET search_path TO public, core');
      expect(callback).toHaveBeenCalledWith(mockPrisma);
    });

    it('should reset schema even when callback throws', async () => {
      const mockPrisma = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      };

      const callback = vi.fn().mockRejectedValue(new Error('Query failed'));

      await expect(
        tenantContextStorage.run(mockContext, async () => {
          return executeInTenantSchema(mockPrisma, callback);
        })
      ).rejects.toThrow('Query failed');

      // Should still reset schema
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith('SET search_path TO public, core');
    });

    it('should throw when no tenant context is available', async () => {
      const mockPrisma = {
        $executeRawUnsafe: vi.fn(),
      };

      const callback = vi.fn();

      await expect(executeInTenantSchema(mockPrisma, callback)).rejects.toThrow(
        'No tenant context available'
      );
    });

    it('should throw for invalid schema name', async () => {
      const invalidContext: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'invalid-schema!', // Invalid characters
      };

      const mockPrisma = {
        $executeRawUnsafe: vi.fn(),
      };

      const callback = vi.fn();

      await expect(
        tenantContextStorage.run(invalidContext, async () => {
          return executeInTenantSchema(mockPrisma, callback);
        })
      ).rejects.toThrow('Invalid schema name');
    });

    it('should allow valid schema names with underscores and numbers', async () => {
      const validContext: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'test-tenant',
        schemaName: 'tenant_123_abc',
      };

      const mockPrisma = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      };

      const callback = vi.fn().mockResolvedValue({ result: 'success' });

      const result = await tenantContextStorage.run(validContext, async () => {
        return executeInTenantSchema(mockPrisma, callback);
      });

      expect(result).toEqual({ result: 'success' });
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'SET search_path TO "tenant_123_abc"'
      );
    });
  });
});
