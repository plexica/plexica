import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import type { TenantContext } from '../../../middleware/tenant-context.js';

/**
 * Unit tests for WorkspaceService Redis caching functionality
 *
 * Tests verify:
 * - Cache get/set/invalidation behavior
 * - Cache hit/miss scenarios
 * - TTL values
 * - Fallback behavior when Redis is unavailable
 * - Service works without cache (optional parameter)
 */

describe('WorkspaceService Membership Caching', () => {
  let mockDb: any;
  let mockRedis: any;
  let service: WorkspaceService;
  let tenantContext: TenantContext;

  beforeEach(() => {
    // Reset mocks before each test
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
    };

    mockDb = {
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      user: {
        findUnique: vi.fn(),
      },
    };

    tenantContext = {
      tenantId: 'tenant-123',
      tenantSlug: 'acme-corp',
      schemaName: 'tenant_acme_corp',
      userId: 'user-456',
    };

    service = new WorkspaceService(mockDb, undefined, mockRedis as unknown as Redis);
  });

  describe('cache get (getMembership)', () => {
    const workspaceId = 'workspace-1';
    const userId = 'user-1';
    const mockMembership = {
      workspaceId: 'workspace-1',
      userId: 'user-1',
      role: 'ADMIN',
      invitedBy: 'user-0',
      joinedAt: new Date('2024-01-01'),
    };

    it('should return cached membership on cache hit', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMembership));

      // Act
      const result = await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      // Note: JSON.parse converts Date to string, so expect string not Date object
      expect(result).toEqual({
        ...mockMembership,
        joinedAt: '2024-01-01T00:00:00.000Z', // Date becomes string after JSON round-trip
      });
      expect(mockRedis.get).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`
      );
      expect(mockDb.$transaction).not.toHaveBeenCalled(); // Should NOT query database
    });

    it('should query database on cache miss', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        // Simulate transaction callback
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([
            {
              workspace_id: workspaceId,
              user_id: userId,
              role: 'ADMIN',
              invited_by: 'user-0',
              joined_at: new Date('2024-01-01'),
            },
          ]),
        };
        return callback(txMock);
      });

      // Act
      const result = await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result).toBeDefined();
      expect(result?.userId).toBe(userId);
      expect(mockDb.$transaction).toHaveBeenCalled(); // Should query database
    });

    it('should populate cache after database query', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([
            {
              workspace_id: workspaceId,
              user_id: userId,
              role: 'ADMIN',
              invited_by: 'user-0',
              joined_at: new Date('2024-01-01'),
            },
          ]),
        };
        return callback(txMock);
      });

      // Act
      await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`,
        expect.any(String),
        'EX',
        300 // TTL in seconds
      );
    });

    it('should set cache TTL to 300 seconds', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([
            {
              workspace_id: workspaceId,
              user_id: userId,
              role: 'MEMBER',
              invited_by: 'user-0',
              joined_at: new Date('2024-01-01'),
            },
          ]),
        };
        return callback(txMock);
      });

      // Act
      await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[2]).toBe('EX'); // Expiry mode
      expect(setCall[3]).toBe(300); // TTL = 5 minutes
    });

    it('should fall back to database when Redis is unavailable', async () => {
      // Arrange
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([
            {
              workspace_id: workspaceId,
              user_id: userId,
              role: 'VIEWER',
              invited_by: 'user-0',
              joined_at: new Date('2024-01-01'),
            },
          ]),
        };
        return callback(txMock);
      });

      // Act
      const result = await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result).toBeDefined();
      expect(result?.role).toBe('VIEWER');
      expect(mockDb.$transaction).toHaveBeenCalled(); // Should still query database
    });

    it('should work without cache (cache = undefined)', async () => {
      // Arrange
      const serviceWithoutCache = new WorkspaceService(mockDb, undefined, undefined);
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([
            {
              workspace_id: workspaceId,
              user_id: userId,
              role: 'ADMIN',
              invited_by: 'user-0',
              joined_at: new Date('2024-01-01'),
            },
          ]),
        };
        return callback(txMock);
      });

      // Act
      const result = await serviceWithoutCache.getMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result).toBeDefined();
      expect(result?.userId).toBe(userId);
      expect(mockDb.$transaction).toHaveBeenCalled(); // Should query database
    });
  });

  describe('cache invalidation', () => {
    const workspaceId = 'workspace-1';
    const userId = 'user-1';

    it('should delete cache key when member is added', async () => {
      // Arrange
      const dto = { userId, role: 'MEMBER' as const };
      const invitedBy = 'user-admin';

      mockDb.user.findUnique.mockResolvedValue({
        id: userId,
        keycloakId: 'kc-123',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ id: workspaceId }]) // First call: workspaceCheck returns workspace exists
            .mockResolvedValueOnce([]) // Second call: existingCheck returns empty (user not a member yet)
            .mockResolvedValueOnce([
              // Third call: getMember returns the new member
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'MEMBER',
                invited_by: invitedBy,
                joined_at: new Date('2024-01-01'),
                user_email: 'user@example.com',
                user_first_name: 'John',
                user_last_name: 'Doe',
              },
            ]),
        };
        return callback(txMock);
      });

      // Act
      await service.addMember(workspaceId, dto, invitedBy, tenantContext);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`
      );
    });

    it('should delete cache key when member role is updated', async () => {
      // Arrange
      const newRole = 'ADMIN' as const;

      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'MEMBER',
                invited_by: 'user-0',
                joined_at: new Date('2024-01-01'),
              },
            ])
            .mockResolvedValueOnce([{ count: 2 }]) // Admin count
            .mockResolvedValueOnce([
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'ADMIN',
                invited_by: 'user-0',
                joined_at: new Date('2024-01-01'),
              },
            ]),
        };
        return callback(txMock);
      });

      // Act
      await service.updateMemberRole(workspaceId, userId, newRole, tenantContext);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`
      );
    });

    it('should delete cache key when member is removed', async () => {
      // Arrange
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ count: 2 }]) // Admin count
            .mockResolvedValueOnce([
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'MEMBER',
                invited_by: 'user-0',
                joined_at: new Date('2024-01-01'),
              },
            ]),
        };
        return callback(txMock);
      });

      // Act
      await service.removeMember(workspaceId, userId, tenantContext);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`
      );
    });

    it('should delete all member cache keys when workspace is deleted', async () => {
      // Arrange
      // The service avoids the O(N) blocking KEYS command. On workspace delete it
      // invalidates only the aggregation key; per-member entries expire via TTL.

      // hasChildren() calls this.db.$queryRaw directly (outside transaction)
      // NOTE: With the TOCTOU fix, all checks are now inside the transaction.
      // The old db-level mock is no longer needed; remove it.

      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ id: workspaceId }]) // workspace existence check
            .mockResolvedValueOnce([{ count: 0 }]) // child count — no children
            .mockResolvedValueOnce([{ count: 0 }]), // team count — no teams
        };
        return callback(txMock);
      });

      // Act
      await service.delete(workspaceId, tenantContext);

      // Assert: only the aggregation key is invalidated (no KEYS scan)
      expect(mockRedis.keys).not.toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:members:agg`
      );
    });

    it('should not throw when cache invalidation fails', async () => {
      // Arrange
      mockRedis.del.mockRejectedValue(new Error('Redis connection failed'));
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ count: 2 }]) // Admin count
            .mockResolvedValueOnce([
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'MEMBER',
                invited_by: 'user-0',
                joined_at: new Date('2024-01-01'),
              },
            ]),
        };
        return callback(txMock);
      });

      // Act & Assert
      await expect(service.removeMember(workspaceId, userId, tenantContext)).resolves.not.toThrow();
    });
  });

  describe('cache key format', () => {
    it('should generate tenant-scoped cache key', async () => {
      // Arrange
      const workspaceId = 'workspace-abc';
      const userId = 'user-xyz';
      mockRedis.get.mockResolvedValue(null);
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([]),
        };
        return callback(txMock);
      });

      // Act
      await service.getMembership(workspaceId, userId, tenantContext);

      // Assert
      const expectedKey = `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`;
      expect(mockRedis.get).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe('checkAccessAndGetMembership caching', () => {
    const workspaceId = 'workspace-1';
    const userId = 'user-1';
    const mockMembership = {
      workspaceId: 'workspace-1',
      userId: 'user-1',
      role: 'ADMIN',
      invitedBy: 'user-0',
      joinedAt: new Date('2024-01-01'),
    };

    it('should return cached membership when cache hit (workspace existence still verified)', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMembership));
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([{ id: workspaceId }]), // Workspace exists
        };
        return callback(txMock);
      });

      // Act
      const result = await service.checkAccessAndGetMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result.exists).toBe(true);
      // Note: JSON.parse converts Date to string, so expect string not Date object
      expect(result.membership).toEqual({
        ...mockMembership,
        joinedAt: '2024-01-01T00:00:00.000Z', // Date becomes string after JSON round-trip
      });
      expect(mockRedis.get).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`
      );
      // Workspace existence should still be verified from database
      expect(mockDb.$transaction).toHaveBeenCalled();
    });

    it('should query membership on cache miss and populate cache', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ id: workspaceId }]) // Workspace exists
            .mockResolvedValueOnce([
              {
                workspace_id: workspaceId,
                user_id: userId,
                role: 'ADMIN',
                invited_by: 'user-0',
                joined_at: new Date('2024-01-01'),
              },
            ]), // Membership query
        };
        return callback(txMock);
      });

      // Act
      const result = await service.checkAccessAndGetMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result.exists).toBe(true);
      expect(result.membership).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `tenant:${tenantContext.tenantId}:workspace:${workspaceId}:member:${userId}`,
        expect.any(String),
        'EX',
        300
      );
    });

    it('should return exists=false when workspace does not exist (even with cached membership)', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMembership));
      mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(undefined),
          $queryRaw: vi.fn().mockResolvedValue([]), // Workspace does NOT exist
        };
        return callback(txMock);
      });

      // Act
      const result = await service.checkAccessAndGetMembership(workspaceId, userId, tenantContext);

      // Assert
      expect(result.exists).toBe(false);
      expect(result.membership).toBeNull();
    });
  });
});
