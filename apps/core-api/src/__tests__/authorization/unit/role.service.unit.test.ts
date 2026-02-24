// apps/core-api/src/__tests__/authorization/unit/role.service.unit.test.ts
//
// Unit tests for RoleService.
// Spec 003 Task 5.2 — FR-003–FR-006, FR-018, FR-019, NFR-009

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
    debouncedInvalidateForRole: vi.fn(),
    invalidateForRole: vi.fn(),
    invalidateForUser: vi.fn(),
  },
}));

vi.mock('../../../lib/db.js', () => ({ db: mockDb }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../modules/authorization/permission-cache.service.js', () => ({
  permissionCacheService: mockPermissionCacheService,
}));
// Mock require() used inside assignRoleToUser / removeRoleFromUser
vi.mock('../../../lib/redis.js', () => ({
  default: { sadd: vi.fn(), srem: vi.fn() },
}));

import {
  RoleService,
  SystemRoleImmutableError,
  CustomRoleLimitError,
  RoleNameConflictError,
  RoleNotFoundError,
} from '../../../modules/authorization/role.service.js';
import { MAX_CUSTOM_ROLES } from '../../../modules/authorization/constants.js';

const VALID_SCHEMA = 'tenant_acme';
const TENANT_ID = 'tenant-id-1';

// Helper: a typical role DB row
function makeRoleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'role-1',
    tenant_id: TENANT_ID,
    name: 'Viewer',
    description: 'Read only',
    is_system: false,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('RoleService', () => {
  let service: RoleService;

  beforeEach(() => {
    // resetAllMocks clears both call history AND unconsumed mockResolvedValueOnce queue,
    // preventing stale queue items from leaking between tests.
    vi.resetAllMocks();
    service = new RoleService();

    // Default: transaction delegates to the callback
    mockDb.$transaction.mockImplementation((fn: any) =>
      fn({
        $queryRawUnsafe: mockDb.$queryRawUnsafe,
        $executeRawUnsafe: mockDb.$executeRawUnsafe,
      })
    );
  });

  // -------------------------------------------------------------------------
  // validateSchemaName (indirectly via createRole)
  // -------------------------------------------------------------------------

  describe('schema name validation', () => {
    it('should throw on invalid schema name', async () => {
      // Arrange — skip to the actual schema validation
      await expect(
        service.createRole(TENANT_ID, 'invalid-schema!', {
          name: 'X',
          description: undefined,
          permissionIds: [],
        })
      ).rejects.toThrow('Invalid schema name');
    });
  });

  // -------------------------------------------------------------------------
  // createRole
  // -------------------------------------------------------------------------

  describe('createRole', () => {
    it('should throw CustomRoleLimitError when limit is reached', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ count: String(MAX_CUSTOM_ROLES) }]);

      // Act & Assert
      await expect(
        service.createRole(TENANT_ID, VALID_SCHEMA, {
          name: 'New',
          description: undefined,
          permissionIds: [],
        })
      ).rejects.toThrow(CustomRoleLimitError);
    });

    it('should throw RoleNameConflictError when name already exists', async () => {
      // Arrange — count OK, then name conflict
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ id: 'existing-role' }]);

      // Act & Assert
      await expect(
        service.createRole(TENANT_ID, VALID_SCHEMA, {
          name: 'Duplicate',
          description: undefined,
          permissionIds: [],
        })
      ).rejects.toThrow(RoleNameConflictError);
    });

    it('should create a role and return it with permissions', async () => {
      // Arrange
      const newRow = makeRoleRow({ name: 'Editor' });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: '0' }]) // custom count
        .mockResolvedValueOnce([]) // name check — no conflict
        .mockResolvedValueOnce([newRow]) // INSERT role
        .mockResolvedValueOnce([]); // getRolePermissions

      // Act
      const result = await service.createRole(TENANT_ID, VALID_SCHEMA, {
        name: 'Editor',
        description: 'Can edit',
        permissionIds: [],
      });

      // Assert
      expect(result.name).toBe('Editor');
      expect(mockPermissionCacheService.debouncedInvalidateForRole).toHaveBeenCalledWith(
        TENANT_ID,
        newRow.id
      );
    });
  });

  // -------------------------------------------------------------------------
  // getRole
  // -------------------------------------------------------------------------

  describe('getRole', () => {
    it('should throw RoleNotFoundError when role does not exist', async () => {
      // Arrange
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([]) // role query — no rows
        .mockResolvedValueOnce([]); // permissions (won't be reached)

      // Act & Assert
      await expect(service.getRole(TENANT_ID, VALID_SCHEMA, 'missing-id')).rejects.toThrow(
        RoleNotFoundError
      );
    });

    it('should return a role with its permissions', async () => {
      // Arrange
      const row = makeRoleRow();
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([row]) // role
        .mockResolvedValueOnce([]); // permissions

      // Act
      const result = await service.getRole(TENANT_ID, VALID_SCHEMA, 'role-1');

      // Assert
      expect(result.id).toBe('role-1');
      expect(result.permissions).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // updateRole
  // -------------------------------------------------------------------------

  describe('updateRole', () => {
    it('should throw SystemRoleImmutableError when updating a system role', async () => {
      // Arrange — getRole returns a system role
      const systemRow = makeRoleRow({ is_system: true, name: 'super_admin' });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([systemRow]) // getRole lookup
        .mockResolvedValueOnce([]); // getRolePermissions

      // Act & Assert
      await expect(
        service.updateRole(TENANT_ID, VALID_SCHEMA, 'role-system', { name: 'Hacked' })
      ).rejects.toThrow(SystemRoleImmutableError);
    });

    it('should throw RoleNameConflictError when new name already taken', async () => {
      // Arrange
      const customRow = makeRoleRow({ is_system: false, name: 'OldName' });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([customRow]) // getRole
        .mockResolvedValueOnce([]) // getRolePermissions
        .mockResolvedValueOnce([{ id: 'other-role' }]); // name conflict check

      // Act & Assert
      await expect(
        service.updateRole(TENANT_ID, VALID_SCHEMA, 'role-1', { name: 'AlreadyExists' })
      ).rejects.toThrow(RoleNameConflictError);
    });

    it('should update role fields and invalidate cache', async () => {
      // Arrange
      const customRow = makeRoleRow({ is_system: false, name: 'OldName' });
      const updatedRow = makeRoleRow({ name: 'NewName' });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([customRow]) // getRole
        .mockResolvedValueOnce([]) // getRolePermissions
        .mockResolvedValueOnce([]) // name conflict check — no conflict
        .mockResolvedValueOnce([updatedRow]) // getRole after update
        .mockResolvedValueOnce([]); // getRolePermissions after update

      // Act
      const result = await service.updateRole(TENANT_ID, VALID_SCHEMA, 'role-1', {
        name: 'NewName',
      });

      // Assert
      expect(result.name).toBe('NewName');
      expect(mockPermissionCacheService.debouncedInvalidateForRole).toHaveBeenCalledWith(
        TENANT_ID,
        'role-1'
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteRole
  // -------------------------------------------------------------------------

  describe('deleteRole', () => {
    it('should throw SystemRoleImmutableError when deleting a system role', async () => {
      // Arrange
      const systemRow = makeRoleRow({ is_system: true, name: 'tenant_admin' });
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([systemRow]).mockResolvedValueOnce([]);

      // Act & Assert
      await expect(service.deleteRole(TENANT_ID, VALID_SCHEMA, 'role-system')).rejects.toThrow(
        SystemRoleImmutableError
      );
    });

    it('should delete a custom role and invalidate cache', async () => {
      // Arrange
      const customRow = makeRoleRow({ is_system: false });
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([customRow]) // getRole
        .mockResolvedValueOnce([]); // getRolePermissions
      mockPermissionCacheService.invalidateForRole.mockResolvedValue(undefined);
      mockDb.$executeRawUnsafe.mockResolvedValue(1);

      // Act
      await service.deleteRole(TENANT_ID, VALID_SCHEMA, 'role-1');

      // Assert
      expect(mockPermissionCacheService.invalidateForRole).toHaveBeenCalledWith(
        TENANT_ID,
        'role-1'
      );
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // assignRoleToUser
  // -------------------------------------------------------------------------

  describe('assignRoleToUser', () => {
    it('should throw RoleNotFoundError when role does not exist in tenant', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([]); // no role found

      // Act & Assert
      await expect(
        service.assignRoleToUser(TENANT_ID, VALID_SCHEMA, 'u1', 'missing-role')
      ).rejects.toThrow(RoleNotFoundError);
    });

    it('should assign role and invalidate user cache', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'role-1' }]); // role exists
      mockDb.$executeRawUnsafe.mockResolvedValue(1);
      mockPermissionCacheService.invalidateForUser.mockResolvedValue(undefined);

      // Act
      await service.assignRoleToUser(TENANT_ID, VALID_SCHEMA, 'u1', 'role-1');

      // Assert
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockPermissionCacheService.invalidateForUser).toHaveBeenCalledWith(TENANT_ID, 'u1');
    });
  });

  // -------------------------------------------------------------------------
  // removeRoleFromUser
  // -------------------------------------------------------------------------

  describe('removeRoleFromUser', () => {
    it('should remove role and invalidate user cache', async () => {
      // Arrange
      mockDb.$executeRawUnsafe.mockResolvedValue(1);
      mockPermissionCacheService.invalidateForUser.mockResolvedValue(undefined);

      // Act
      await service.removeRoleFromUser(TENANT_ID, VALID_SCHEMA, 'u1', 'role-1');

      // Assert
      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockPermissionCacheService.invalidateForUser).toHaveBeenCalledWith(TENANT_ID, 'u1');
    });
  });

  // -------------------------------------------------------------------------
  // getUserPermissions
  // -------------------------------------------------------------------------

  describe('getUserPermissions', () => {
    it('should return unique permission keys and role IDs', async () => {
      // Arrange
      mockDb.$queryRawUnsafe.mockResolvedValueOnce([
        { permission_key: 'users:read', role_id: 'role-1' },
        { permission_key: 'users:read', role_id: 'role-2' }, // duplicate key
        { permission_key: 'workspaces:read', role_id: 'role-1' },
      ]);

      // Act
      const result = await service.getUserPermissions(TENANT_ID, VALID_SCHEMA, 'u1');

      // Assert
      expect(result.permissionKeys).toEqual(['users:read', 'workspaces:read']);
      expect(result.roleIds).toEqual(['role-1', 'role-2']);
    });
  });
});
