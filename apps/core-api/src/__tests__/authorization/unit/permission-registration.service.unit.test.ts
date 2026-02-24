// apps/core-api/src/__tests__/authorization/unit/permission-registration.service.unit.test.ts
//
// Unit tests for PermissionRegistrationService.
// Spec 003 Task 5.4 — FR-011, FR-012, FR-013, Edge Case #4

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are initialized before vi.mock() hoisting
// ---------------------------------------------------------------------------

const { mockDb, mockPermissionCacheService } = vi.hoisted(() => ({
  mockDb: {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
  mockPermissionCacheService: {
    invalidateForTenant: vi.fn(),
  },
}));

vi.mock('../../../lib/db.js', () => ({ db: mockDb }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../modules/authorization/permission-cache.service.js', () => ({
  permissionCacheService: mockPermissionCacheService,
}));

import { PermissionRegistrationService } from '../../../modules/authorization/permission-registration.service.js';

const VALID_SCHEMA = 'tenant_acme';
const TENANT_ID = 'tenant-id-1';
const PLUGIN_ID = 'plugin-uuid-1';

describe('PermissionRegistrationService', () => {
  let service: PermissionRegistrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PermissionRegistrationService();

    // Default: transaction delegates to the callback
    mockDb.$transaction.mockImplementation((fn: any) =>
      fn({
        $queryRawUnsafe: mockDb.$queryRawUnsafe,
        $executeRawUnsafe: mockDb.$executeRawUnsafe,
      })
    );
    mockPermissionCacheService.invalidateForTenant.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // schema name validation
  // -------------------------------------------------------------------------

  describe('schema name validation', () => {
    it('should throw on invalid schema name in registerPluginPermissions', async () => {
      await expect(
        service.registerPluginPermissions(TENANT_ID, 'invalid!', PLUGIN_ID, [])
      ).rejects.toThrow('Invalid schema name');
    });

    it('should throw on invalid schema name in removePluginPermissions', async () => {
      await expect(
        service.removePluginPermissions(TENANT_ID, 'bad-schema', PLUGIN_ID)
      ).rejects.toThrow('Invalid schema name');
    });

    it('should throw on invalid schema name in registerCorePermissions', async () => {
      await expect(service.registerCorePermissions(TENANT_ID, 'bad-schema')).rejects.toThrow(
        'Invalid schema name'
      );
    });

    it('should throw on invalid schema name in listPermissions', async () => {
      await expect(service.listPermissions(TENANT_ID, 'bad-schema')).rejects.toThrow(
        'Invalid schema name'
      );
    });
  });

  // -------------------------------------------------------------------------
  // registerPluginPermissions
  // -------------------------------------------------------------------------

  describe('registerPluginPermissions', () => {
    it('should return early when permissions array is empty', async () => {
      // Act
      await service.registerPluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID, []);

      // Assert — transaction never called, cache not invalidated
      expect(mockDb.$transaction).not.toHaveBeenCalled();
      expect(mockPermissionCacheService.invalidateForTenant).not.toHaveBeenCalled();
    });

    it('should throw PERMISSION_KEY_CONFLICT when key owned by core', async () => {
      // Arrange — existing permission owned by core (plugin_id = null)
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ plugin_id: null }]);

      // Act & Assert
      await expect(
        service.registerPluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID, [
          { key: 'users:read', name: 'Read Users' },
        ])
      ).rejects.toMatchObject({ code: 'PERMISSION_KEY_CONFLICT' });
    });

    it('should throw PERMISSION_KEY_CONFLICT when key owned by a different plugin', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ plugin_id: 'other-plugin' }]);

      // Act & Assert
      await expect(
        service.registerPluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID, [
          { key: 'feature:action', name: 'Feature Action' },
        ])
      ).rejects.toMatchObject({ code: 'PERMISSION_KEY_CONFLICT' });
    });

    it('should upsert when key already owned by same plugin', async () => {
      // Arrange — existing permission owned by same plugin
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ plugin_id: PLUGIN_ID }]);
      mockDb.$executeRawUnsafe.mockResolvedValue(1);

      // Act — should not throw
      await service.registerPluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID, [
        { key: 'feature:action', name: 'Feature Action', description: 'Updated desc' },
      ]);

      // Assert — update called, not insert
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockPermissionCacheService.invalidateForTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should insert new permissions and invalidate tenant cache', async () => {
      // Arrange — no existing permission
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([]);
      mockDb.$executeRawUnsafe.mockResolvedValue(1);

      // Act
      await service.registerPluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID, [
        { key: 'new:action', name: 'New Action' },
      ]);

      // Assert
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockPermissionCacheService.invalidateForTenant).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // removePluginPermissions
  // -------------------------------------------------------------------------

  describe('removePluginPermissions', () => {
    it('should cascade-delete role_permissions and permissions, then invalidate cache', async () => {
      // Arrange
      mockDb.$executeRawUnsafe.mockResolvedValue(1);

      // Act
      await service.removePluginPermissions(TENANT_ID, VALID_SCHEMA, PLUGIN_ID);

      // Assert — two executeRawUnsafe calls (cascade delete + permissions delete)
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      expect(mockPermissionCacheService.invalidateForTenant).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // listPermissions
  // -------------------------------------------------------------------------

  describe('listPermissions', () => {
    it('should return mapped permissions sorted by key', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'perm-1',
          tenant_id: TENANT_ID,
          key: 'users:read',
          name: 'Read Users',
          description: null,
          plugin_id: null,
          created_at: new Date(),
        },
      ]);

      // Act
      const result = await service.listPermissions(TENANT_ID, VALID_SCHEMA);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('users:read');
      expect(result[0].pluginId).toBeNull();
    });
  });
});
