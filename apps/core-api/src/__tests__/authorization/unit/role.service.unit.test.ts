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
  // listRoles
  // -------------------------------------------------------------------------

  describe('listRoles', () => {
    /**
     * Helpers: build mock rows that mimic the CTE+LEFT JOIN shape
     * returned by the listRoles query.
     */
    function makeJoinRow(
      roleId: string,
      roleName: string,
      isSystem: boolean,
      permKey: string | null = null,
      permId: string | null = null
    ) {
      return {
        role_id: roleId,
        role_tenant_id: TENANT_ID,
        role_name: roleName,
        role_description: null,
        role_is_system: isSystem,
        role_created_at: new Date('2025-01-01'),
        role_updated_at: new Date('2025-01-01'),
        perm_id: permId,
        perm_tenant_id: permKey ? TENANT_ID : null,
        perm_key: permKey,
        perm_name: permKey,
        perm_description: null,
        perm_plugin_id: null,
        perm_created_at: permKey ? new Date('2025-01-01') : null,
      };
    }

    it('should return a role with no permissions when LEFT JOIN yields NULL perm columns', async () => {
      // Arrange
      // count query → 1, JOIN query → 1 row with NULL perm, custom count → 0
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: '1' }]) // total count
        .mockResolvedValueOnce([makeJoinRow('role-1', 'Viewer', false, null, null)]) // CTE+JOIN
        .mockResolvedValueOnce([{ count: '1' }]); // custom role count

      // Act
      const result = await service.listRoles(TENANT_ID, VALID_SCHEMA);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('role-1');
      expect(result.data[0].permissions).toEqual([]);
    });

    it('should group multiple JOIN rows for the same role into one role with N permissions', async () => {
      // Arrange — two rows for the same role, each with a different permission
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([
          makeJoinRow('role-1', 'Editor', false, 'users:read', 'p-1'),
          makeJoinRow('role-1', 'Editor', false, 'users:write', 'p-2'),
        ])
        .mockResolvedValueOnce([{ count: '1' }]);

      // Act
      const result = await service.listRoles(TENANT_ID, VALID_SCHEMA);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].permissions).toHaveLength(2);
      expect(result.data[0].permissions.map((p) => p.key)).toEqual(['users:read', 'users:write']);
    });

    it('should return correct pagination meta', async () => {
      // Arrange — 5 total roles, page 2, limit 2
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: '5' }])
        .mockResolvedValueOnce([
          makeJoinRow('role-3', 'C', false, null, null),
          makeJoinRow('role-4', 'D', false, null, null),
        ])
        .mockResolvedValueOnce([{ count: '5' }]);

      // Act
      const result = await service.listRoles(TENANT_ID, VALID_SCHEMA, { page: 2, limit: 2 });

      // Assert
      expect(result.meta.total).toBe(5);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('should scope all queries to the correct tenantId (tenant isolation)', async () => {
      // Arrange
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      // Act
      await service.listRoles(TENANT_ID, VALID_SCHEMA);

      // Assert — every call to $queryRawUnsafe must pass TENANT_ID as a parameter
      for (const call of mockDb.$queryRawUnsafe.mock.calls) {
        // call[0] is the SQL string, call[1..n] are params
        const params = call.slice(1);
        expect(params).toContain(TENANT_ID);
      }
    });

    it('should return empty page when no roles exist', async () => {
      // Arrange
      mockDb.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      // Act
      const result = await service.listRoles(TENANT_ID, VALID_SCHEMA);

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.customRoleCount).toBe(0);
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
