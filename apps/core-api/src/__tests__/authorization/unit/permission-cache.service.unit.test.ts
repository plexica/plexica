// apps/core-api/src/__tests__/authorization/unit/permission-cache.service.unit.test.ts
//
// Unit tests for PermissionCacheService.
// Spec 003 Task 5.1 — FR-019, NFR-002, NFR-007, NFR-008, Edge Cases #7 and #8

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock redis module before importing the service
// ---------------------------------------------------------------------------
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  ttl: vi.fn(),
  expire: vi.fn(),
  sadd: vi.fn(),
  smembers: vi.fn(),
  srem: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('../../../lib/redis.js', () => ({ default: mockRedis }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import { PermissionCacheService } from '../../../modules/authorization/permission-cache.service.js';
import {
  permsCacheKey,
  roleUsersCacheKey,
  permsKeyPattern,
  CACHE_SAFETY_TTL,
} from '../../../modules/authorization/constants.js';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PermissionCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // getUserPermissions
  // -------------------------------------------------------------------------

  describe('getUserPermissions', () => {
    it('should return parsed permissions on cache hit', async () => {
      // Arrange
      const perms = ['users:read', 'workspaces:read'];
      mockRedis.get.mockResolvedValue(JSON.stringify(perms));

      // Act
      const result = await service.getUserPermissions('t1', 'u1');

      // Assert
      expect(result).toEqual(perms);
      expect(mockRedis.get).toHaveBeenCalledWith(permsCacheKey('t1', 'u1'));
    });

    it('should return null on cache miss', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await service.getUserPermissions('t1', 'u1');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when cached value is not an array', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(JSON.stringify({ not: 'an array' }));

      // Act
      const result = await service.getUserPermissions('t1', 'u1');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null and log warning on Redis error (fail-open)', async () => {
      // Arrange
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));

      // Act
      const result = await service.getUserPermissions('t1', 'u1');

      // Assert
      expect(result).toBeNull();
      // Service did not throw
    });
  });

  // -------------------------------------------------------------------------
  // setUserPermissions
  // -------------------------------------------------------------------------

  describe('setUserPermissions', () => {
    it('should set permissions with jittered TTL and update role→users index', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.ttl.mockResolvedValue(300);
      mockRedis.sadd.mockResolvedValue(1);

      // Act
      await service.setUserPermissions('t1', 'u1', ['users:read'], ['role-1', 'role-2']);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(
        permsCacheKey('t1', 'u1'),
        JSON.stringify(['users:read']),
        'EX',
        expect.any(Number)
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(roleUsersCacheKey('t1', 'role-1'), 'u1');
      expect(mockRedis.sadd).toHaveBeenCalledWith(roleUsersCacheKey('t1', 'role-2'), 'u1');
    });

    it('should enforce safety TTL if key has no expiry after SET', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.ttl.mockResolvedValue(-1); // No expiry set
      mockRedis.sadd.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      // Act
      await service.setUserPermissions('t1', 'u1', [], []);

      // Assert
      expect(mockRedis.expire).toHaveBeenCalledWith(permsCacheKey('t1', 'u1'), CACHE_SAFETY_TTL);
    });

    it('should not call expire when TTL is already set', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.ttl.mockResolvedValue(290);
      mockRedis.sadd.mockResolvedValue(1);

      // Act
      await service.setUserPermissions('t1', 'u1', [], []);

      // Assert
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should silently swallow Redis errors (fail-open)', async () => {
      // Arrange
      mockRedis.set.mockRejectedValue(new Error('Redis down'));

      // Act — should not throw
      await expect(
        service.setUserPermissions('t1', 'u1', ['users:read'], ['role-1'])
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // invalidateForRole
  // -------------------------------------------------------------------------

  describe('invalidateForRole', () => {
    it('should delete all user permission keys for a role and the index key', async () => {
      // Arrange
      const userIds = ['u1', 'u2'];
      mockRedis.smembers.mockResolvedValue(userIds);
      mockRedis.del.mockResolvedValue(2);

      // Act
      await service.invalidateForRole('t1', 'role-1');

      // Assert
      expect(mockRedis.smembers).toHaveBeenCalledWith(roleUsersCacheKey('t1', 'role-1'));
      expect(mockRedis.del).toHaveBeenCalledWith(
        permsCacheKey('t1', 'u1'),
        permsCacheKey('t1', 'u2')
      );
      expect(mockRedis.del).toHaveBeenCalledWith(roleUsersCacheKey('t1', 'role-1'));
    });

    it('should only delete index key when no users are assigned to role', async () => {
      // Arrange
      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.del.mockResolvedValue(1);

      // Act
      await service.invalidateForRole('t1', 'role-empty');

      // Assert
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith(roleUsersCacheKey('t1', 'role-empty'));
    });

    it('should silently swallow Redis errors', async () => {
      // Arrange
      mockRedis.smembers.mockRejectedValue(new Error('Redis down'));

      // Act — should not throw
      await expect(service.invalidateForRole('t1', 'role-1')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // debouncedInvalidateForRole
  // -------------------------------------------------------------------------

  describe('debouncedInvalidateForRole', () => {
    it('should coalesce multiple calls within debounce window', async () => {
      // Arrange
      vi.useFakeTimers();
      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.del.mockResolvedValue(0);

      // Act — call twice rapidly
      service.debouncedInvalidateForRole('t1', 'role-1');
      service.debouncedInvalidateForRole('t1', 'role-1');

      // Advance timers past debounce window
      await vi.runAllTimersAsync();

      // Assert — invalidateForRole called only once
      expect(mockRedis.smembers).toHaveBeenCalledTimes(1);
    });

    it('should fire independently for different roles', async () => {
      // Arrange
      vi.useFakeTimers();
      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.del.mockResolvedValue(0);

      // Act
      service.debouncedInvalidateForRole('t1', 'role-A');
      service.debouncedInvalidateForRole('t1', 'role-B');
      await vi.runAllTimersAsync();

      // Assert — two separate invalidations
      expect(mockRedis.smembers).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // invalidateForUser
  // -------------------------------------------------------------------------

  describe('invalidateForUser', () => {
    it('should delete the user permission cache key', async () => {
      // Arrange
      mockRedis.del.mockResolvedValue(1);

      // Act
      await service.invalidateForUser('t1', 'u1');

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(permsCacheKey('t1', 'u1'));
    });

    it('should silently swallow Redis errors', async () => {
      // Arrange
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      // Act — should not throw
      await expect(service.invalidateForUser('t1', 'u1')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // invalidateForTenant
  // -------------------------------------------------------------------------

  describe('invalidateForTenant', () => {
    it('should scan and delete all permission keys for tenant', async () => {
      // Arrange
      mockRedis.scan
        .mockResolvedValueOnce(['10', ['authz:perms:t1:u1', 'authz:perms:t1:u2']])
        .mockResolvedValueOnce(['0', ['authz:perms:t1:u3']]);
      mockRedis.del.mockResolvedValue(3);

      // Act
      await service.invalidateForTenant('t1');

      // Assert
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        permsKeyPattern('t1'),
        'COUNT',
        100
      );
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should not call del when no keys found', async () => {
      // Arrange
      mockRedis.scan.mockResolvedValueOnce(['0', []]);

      // Act
      await service.invalidateForTenant('t1');

      // Assert
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should silently swallow Redis errors', async () => {
      // Arrange
      mockRedis.scan.mockRejectedValue(new Error('Redis down'));

      // Act — should not throw
      await expect(service.invalidateForTenant('t1')).resolves.toBeUndefined();
    });
  });
});
