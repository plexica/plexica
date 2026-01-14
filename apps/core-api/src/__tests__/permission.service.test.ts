// Unit tests for PermissionService
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService, Permissions } from '../services/permission.service';
import { db } from '../lib/db';

// Mock database
vi.mock('../lib/db', () => ({
  db: {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

describe('PermissionService', () => {
  let service: PermissionService;
  const testSchema = 'tenant_test';
  const testUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PermissionService();
  });

  describe('getUserPermissions', () => {
    it('should return aggregated permissions from user roles', async () => {
      const mockResult = [
        { permissions: ['users.read', 'users.write'] },
        { permissions: ['posts.read', 'users.read'] }, // Duplicate should be deduplicated
      ];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.getUserPermissions(testUserId, testSchema);

      expect(result).toHaveLength(3);
      expect(result).toContain('users.read');
      expect(result).toContain('users.write');
      expect(result).toContain('posts.read');

      // Verify schema was set and reset
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(`SET search_path TO "${testSchema}"`);
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith('SET search_path TO public, core');
    });

    it('should return empty array when user has no roles', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue([]);

      const result = await service.getUserPermissions(testUserId, testSchema);

      expect(result).toEqual([]);
    });

    it('should handle roles with no permissions', async () => {
      const mockResult = [{ permissions: [] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.getUserPermissions(testUserId, testSchema);

      expect(result).toEqual([]);
    });

    it('should reset schema even on error', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValueOnce(0 as any); // SET search_path
      vi.mocked(db.$queryRawUnsafe).mockRejectedValue(new Error('Database error'));
      vi.mocked(db.$executeRawUnsafe).mockResolvedValueOnce(0 as any); // RESET search_path

      await expect(service.getUserPermissions(testUserId, testSchema)).rejects.toThrow(
        'Database error'
      );

      // Verify schema was reset
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith('SET search_path TO public, core');
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the permission', async () => {
      const mockResult = [{ permissions: ['users.read', 'users.write'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasPermission(testUserId, testSchema, 'users.read');

      expect(result).toBe(true);
    });

    it('should return false when user does not have the permission', async () => {
      const mockResult = [{ permissions: ['users.read'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasPermission(testUserId, testSchema, 'users.write');

      expect(result).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the permissions', async () => {
      const mockResult = [{ permissions: ['users.read'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasAnyPermission(testUserId, testSchema, [
        'users.read',
        'users.write',
        'users.delete',
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user has none of the permissions', async () => {
      const mockResult = [{ permissions: ['posts.read'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasAnyPermission(testUserId, testSchema, [
        'users.read',
        'users.write',
      ]);

      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all of the permissions', async () => {
      const mockResult = [{ permissions: ['users.read', 'users.write', 'users.delete'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasAllPermissions(testUserId, testSchema, [
        'users.read',
        'users.write',
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user is missing some permissions', async () => {
      const mockResult = [{ permissions: ['users.read'] }];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockResult);

      const result = await service.hasAllPermissions(testUserId, testSchema, [
        'users.read',
        'users.write',
      ]);

      expect(result).toBe(false);
    });
  });

  describe('createRole', () => {
    it('should create a new role with permissions', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      const result = await service.createRole(
        testSchema,
        'moderator',
        ['posts.read', 'posts.write'],
        'Moderator role'
      );

      expect(result.name).toBe('moderator');
      expect(result.permissions).toEqual(['posts.read', 'posts.write']);
      expect(result.description).toBe('Moderator role');
      expect(result.id).toBeDefined();

      // Verify SQL execution
      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.any(String), // id (UUID)
        'moderator',
        'Moderator role',
        JSON.stringify(['posts.read', 'posts.write'])
      );
    });

    it('should create role without description', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      const result = await service.createRole(testSchema, 'viewer', ['posts.read']);

      expect(result.name).toBe('viewer');
      expect(result.description).toBeUndefined();
    });

    it('should reset schema after creating role', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      await service.createRole(testSchema, 'test', ['test.read']);

      expect(db.$executeRawUnsafe).toHaveBeenCalledWith('SET search_path TO public, core');
    });
  });

  describe('updateRolePermissions', () => {
    it('should update role permissions', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      const roleId = 'role-123';
      const newPermissions = ['users.read', 'users.write', 'users.delete'];

      await service.updateRolePermissions(testSchema, roleId, newPermissions);

      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        JSON.stringify(newPermissions),
        roleId
      );
    });
  });

  describe('getRoles', () => {
    it('should return all roles in a tenant', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'admin',
          description: 'Administrator',
          permissions: ['users.read', 'users.write'],
        },
        {
          id: 'role-2',
          name: 'user',
          description: null,
          permissions: ['users.read'],
        },
      ];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockRoles);

      const result = await service.getRoles(testSchema);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'role-1',
        name: 'admin',
        description: 'Administrator',
        permissions: ['users.read', 'users.write'],
      });
      expect(result[1].description).toBeUndefined();
    });
  });

  describe('assignRoleToUser', () => {
    it('should assign role to user', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      const roleId = 'role-123';

      await service.assignRoleToUser(testSchema, testUserId, roleId);

      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        testUserId,
        roleId
      );
    });
  });

  describe('removeRoleFromUser', () => {
    it('should remove role from user', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      const roleId = 'role-123';

      await service.removeRoleFromUser(testSchema, testUserId, roleId);

      expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        testUserId,
        roleId
      );
    });
  });

  describe('getUserRoles', () => {
    it('should return user roles', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'admin',
          description: 'Administrator',
          permissions: ['users.read', 'users.write'],
        },
      ];

      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);
      vi.mocked(db.$queryRawUnsafe).mockResolvedValue(mockRoles);

      const result = await service.getUserRoles(testSchema, testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('admin');
    });
  });

  describe('initializeDefaultRoles', () => {
    it('should create admin, user, and guest roles', async () => {
      vi.mocked(db.$executeRawUnsafe).mockResolvedValue(0 as any);

      await service.initializeDefaultRoles(testSchema);

      // Should have created 3 roles
      const executeCalls = vi.mocked(db.$executeRawUnsafe).mock.calls;
      const insertCalls = executeCalls.filter((call) => call[0].toString().includes('INSERT INTO'));

      expect(insertCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Permissions constants', () => {
    it('should export permission constants', () => {
      expect(Permissions.USERS_READ).toBe('users.read');
      expect(Permissions.USERS_WRITE).toBe('users.write');
      expect(Permissions.USERS_DELETE).toBe('users.delete');
      expect(Permissions.ROLES_READ).toBe('roles.read');
      expect(Permissions.SETTINGS_READ).toBe('settings.read');
      expect(Permissions.PLUGINS_READ).toBe('plugins.read');
    });
  });
});
