// apps/core-api/src/__tests__/authorization/unit/authorization.service.unit.test.ts
//
// Unit tests for AuthorizationService — 100% coverage required (Art. 4.1).
// Spec 003 Task 5.3 — FR-001, FR-002, FR-006, FR-010, FR-016, NFR-003, NFR-005

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are initialized before vi.mock() hoisting
// ---------------------------------------------------------------------------

const { mockPermissionCacheService, mockRoleService, mockTenantService } = vi.hoisted(() => ({
  mockPermissionCacheService: {
    getUserPermissions: vi.fn(),
    setUserPermissions: vi.fn(),
  },
  mockRoleService: {
    getUserPermissions: vi.fn(),
  },
  mockTenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

vi.mock('../../../modules/authorization/permission-cache.service.js', () => ({
  permissionCacheService: mockPermissionCacheService,
}));
vi.mock('../../../modules/authorization/role.service.js', () => ({
  roleService: mockRoleService,
}));
vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: mockTenantService,
}));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import { AuthorizationService } from '../../../modules/authorization/authorization.service.js';
import { SYSTEM_ROLES } from '../../../modules/authorization/constants.js';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthorizationService();
  });

  // -------------------------------------------------------------------------
  // matchesPermission
  // -------------------------------------------------------------------------

  describe('matchesPermission', () => {
    it('should return true for exact match', () => {
      expect(service.matchesPermission('users:read', 'users:read')).toBe(true);
    });

    it('should return false for different permissions', () => {
      expect(service.matchesPermission('users:read', 'users:write')).toBe(false);
    });

    it('should match *:* wildcard against any permission', () => {
      expect(service.matchesPermission('*:*', 'users:read')).toBe(true);
      expect(service.matchesPermission('*:*', 'workspaces:write')).toBe(true);
    });

    it('should match resource:* wildcard against all actions on that resource', () => {
      expect(service.matchesPermission('users:*', 'users:read')).toBe(true);
      expect(service.matchesPermission('users:*', 'users:write')).toBe(true);
      expect(service.matchesPermission('users:*', 'workspaces:read')).toBe(false);
    });

    it('should not match resource:* against a different resource', () => {
      expect(service.matchesPermission('roles:*', 'users:read')).toBe(false);
    });

    it('should handle three-segment permissions with wildcard', () => {
      expect(service.matchesPermission('resource:sub:*', 'resource:sub:action')).toBe(true);
      expect(service.matchesPermission('resource:sub:*', 'resource:other:action')).toBe(false);
    });

    it('should not match when user perm has more segments than required', () => {
      expect(service.matchesPermission('users:read:extra', 'users:read')).toBe(false);
    });

    it('should not match when user perm has fewer segments than required', () => {
      expect(service.matchesPermission('users', 'users:read')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isSuperAdmin
  // -------------------------------------------------------------------------

  describe('isSuperAdmin', () => {
    it('should return true when roles include super_admin', () => {
      expect(service.isSuperAdmin([SYSTEM_ROLES.SUPER_ADMIN])).toBe(true);
    });

    it('should return true when super_admin is among multiple roles', () => {
      expect(service.isSuperAdmin(['user', SYSTEM_ROLES.SUPER_ADMIN, 'tenant_admin'])).toBe(true);
    });

    it('should return false when roles do not include super_admin', () => {
      expect(service.isSuperAdmin(['user', 'tenant_admin'])).toBe(false);
    });

    it('should return false for empty roles array', () => {
      expect(service.isSuperAdmin([])).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // authorize — cache hit path
  // -------------------------------------------------------------------------

  describe('authorize — cache hit path', () => {
    it('should return ALLOW when cached permissions satisfy required permissions', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue([
        'users:read',
        'workspaces:read',
      ]);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:read']);

      // Assert
      expect(result.permitted).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(mockRoleService.getUserPermissions).not.toHaveBeenCalled();
    });

    it('should return DENY when cached permissions do not satisfy required', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(['users:read']);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:write']);

      // Assert
      expect(result.permitted).toBe(false);
      expect(result.fromCache).toBe(true);
    });

    it('should return ALLOW for empty required permissions (open endpoint)', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue([]);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', []);

      // Assert
      expect(result.permitted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // authorize — cache miss path
  // -------------------------------------------------------------------------

  describe('authorize — cache miss path', () => {
    it('should load from DB on cache miss and write back to cache', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(null);
      mockRoleService.getUserPermissions.mockResolvedValue({
        permissionKeys: ['users:read'],
        roleIds: ['role-1'],
      });
      mockPermissionCacheService.setUserPermissions.mockResolvedValue(undefined);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:read']);

      // Assert
      expect(result.permitted).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(mockRoleService.getUserPermissions).toHaveBeenCalledWith('t1', 'tenant_t1', 'u1');
      expect(mockPermissionCacheService.setUserPermissions).toHaveBeenCalledWith(
        't1',
        'u1',
        ['users:read'],
        ['role-1']
      );
    });

    it('should evaluate wildcard permissions from DB', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(null);
      mockRoleService.getUserPermissions.mockResolvedValue({
        permissionKeys: ['users:*'],
        roleIds: ['role-admin'],
      });
      mockPermissionCacheService.setUserPermissions.mockResolvedValue(undefined);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:write']);

      // Assert
      expect(result.permitted).toBe(true);
    });

    it('should require ALL permissions to be satisfied (conjunction)', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(null);
      mockRoleService.getUserPermissions.mockResolvedValue({
        permissionKeys: ['users:read'],
        roleIds: ['role-1'],
      });
      mockPermissionCacheService.setUserPermissions.mockResolvedValue(undefined);

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', [
        'users:read',
        'users:write',
      ]);

      // Assert
      expect(result.permitted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // authorize — fail-closed on error (NFR-005)
  // -------------------------------------------------------------------------

  describe('authorize — fail-closed on error', () => {
    it('should return DENY without throwing on unexpected cache error', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockRejectedValue(
        new Error('Unexpected Redis error')
      );

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:read']);

      // Assert — must be DENY, must not throw
      expect(result.permitted).toBe(false);
      expect(result.fromCache).toBe(false);
      expect(result.userPermissions).toEqual([]);
    });

    it('should return DENY without throwing on DB error', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(null);
      mockRoleService.getUserPermissions.mockRejectedValue(new Error('DB connection lost'));

      // Act
      const result = await service.authorize('u1', 't1', 'tenant_t1', ['users:read']);

      // Assert
      expect(result.permitted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getUserEffectivePermissions
  // -------------------------------------------------------------------------

  describe('getUserEffectivePermissions', () => {
    it('should return permissions and wildcards from cache', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue([
        'users:read',
        'roles:*',
        'workspaces:write',
      ]);

      // Act
      const result = await service.getUserEffectivePermissions('u1', 't1', 'tenant_t1');

      // Assert
      expect(result.data).toEqual(['users:read', 'roles:*', 'workspaces:write']);
      expect(result.wildcards).toEqual(['roles:*']);
    });

    it('should load from DB on cache miss and populate wildcards', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockResolvedValue(null);
      mockRoleService.getUserPermissions.mockResolvedValue({
        permissionKeys: ['users:read', '*:*'],
        roleIds: ['role-super'],
      });
      mockPermissionCacheService.setUserPermissions.mockResolvedValue(undefined);

      // Act
      const result = await service.getUserEffectivePermissions('u1', 't1', 'tenant_t1');

      // Assert
      expect(result.data).toEqual(['users:read', '*:*']);
      expect(result.wildcards).toEqual(['*:*']);
    });

    it('should return empty arrays on error (fail-safe)', async () => {
      // Arrange
      mockPermissionCacheService.getUserPermissions.mockRejectedValue(new Error('error'));

      // Act
      const result = await service.getUserEffectivePermissions('u1', 't1', 'tenant_t1');

      // Assert
      expect(result.data).toEqual([]);
      expect(result.wildcards).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getSchemaName
  // -------------------------------------------------------------------------

  describe('getSchemaName', () => {
    it('should delegate to tenantService', () => {
      const result = service.getSchemaName('my-tenant');
      expect(mockTenantService.getSchemaName).toHaveBeenCalledWith('my-tenant');
      expect(result).toBe('tenant_my_tenant');
    });
  });
});
