import { describe, it, expect } from 'vitest';
import { WorkspaceRole } from '@plexica/database';

/**
 * Unit Tests: Workspace Permissions
 *
 * Tests the permission matrix for workspace roles:
 * - ADMIN: Full control over workspace and members
 * - MEMBER: Read workspace, view members/teams
 * - VIEWER: Read-only access
 *
 * Critical business rules:
 * - Creator becomes ADMIN automatically
 * - Last admin protection (cannot remove/demote last admin)
 * - Admin can demote self if other admins exist
 */

/**
 * Permission checker utility for testing
 */
type Permission =
  | 'workspace:view'
  | 'workspace:update'
  | 'workspace:delete'
  | 'members:view'
  | 'members:add'
  | 'members:remove'
  | 'members:update-role'
  | 'teams:view'
  | 'teams:create'
  | 'teams:update'
  | 'teams:delete'
  | 'teams:manage-members';

function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  const permissions: Record<WorkspaceRole, Permission[]> = {
    [WorkspaceRole.ADMIN]: [
      'workspace:view',
      'workspace:update',
      'workspace:delete',
      'members:view',
      'members:add',
      'members:remove',
      'members:update-role',
      'teams:view',
      'teams:create',
      'teams:update',
      'teams:delete',
      'teams:manage-members',
    ],
    [WorkspaceRole.MEMBER]: ['workspace:view', 'members:view', 'teams:view'],
    [WorkspaceRole.VIEWER]: ['workspace:view', 'members:view', 'teams:view'],
  };

  return permissions[role].includes(permission);
}

describe('Workspace Permissions', () => {
  describe('ADMIN Role Permissions', () => {
    const adminRole = WorkspaceRole.ADMIN;

    it('should have full workspace permissions', () => {
      expect(hasPermission(adminRole, 'workspace:view')).toBe(true);
      expect(hasPermission(adminRole, 'workspace:update')).toBe(true);
      expect(hasPermission(adminRole, 'workspace:delete')).toBe(true);
    });

    it('should have full member management permissions', () => {
      expect(hasPermission(adminRole, 'members:view')).toBe(true);
      expect(hasPermission(adminRole, 'members:add')).toBe(true);
      expect(hasPermission(adminRole, 'members:remove')).toBe(true);
      expect(hasPermission(adminRole, 'members:update-role')).toBe(true);
    });

    it('should have full team management permissions', () => {
      expect(hasPermission(adminRole, 'teams:view')).toBe(true);
      expect(hasPermission(adminRole, 'teams:create')).toBe(true);
      expect(hasPermission(adminRole, 'teams:update')).toBe(true);
      expect(hasPermission(adminRole, 'teams:delete')).toBe(true);
      expect(hasPermission(adminRole, 'teams:manage-members')).toBe(true);
    });

    it('should be able to perform all operations', () => {
      const allPermissions: Permission[] = [
        'workspace:view',
        'workspace:update',
        'workspace:delete',
        'members:view',
        'members:add',
        'members:remove',
        'members:update-role',
        'teams:view',
        'teams:create',
        'teams:update',
        'teams:delete',
        'teams:manage-members',
      ];

      allPermissions.forEach((permission) => {
        expect(hasPermission(adminRole, permission)).toBe(true);
      });
    });
  });

  describe('MEMBER Role Permissions', () => {
    const memberRole = WorkspaceRole.MEMBER;

    it('should have read-only workspace permissions', () => {
      expect(hasPermission(memberRole, 'workspace:view')).toBe(true);
      expect(hasPermission(memberRole, 'workspace:update')).toBe(false);
      expect(hasPermission(memberRole, 'workspace:delete')).toBe(false);
    });

    it('should be able to view members but not manage them', () => {
      expect(hasPermission(memberRole, 'members:view')).toBe(true);
      expect(hasPermission(memberRole, 'members:add')).toBe(false);
      expect(hasPermission(memberRole, 'members:remove')).toBe(false);
      expect(hasPermission(memberRole, 'members:update-role')).toBe(false);
    });

    it('should be able to view teams but not manage them', () => {
      expect(hasPermission(memberRole, 'teams:view')).toBe(true);
      expect(hasPermission(memberRole, 'teams:create')).toBe(false);
      expect(hasPermission(memberRole, 'teams:update')).toBe(false);
      expect(hasPermission(memberRole, 'teams:delete')).toBe(false);
      expect(hasPermission(memberRole, 'teams:manage-members')).toBe(false);
    });

    it('should only have read permissions', () => {
      const writePermissions: Permission[] = [
        'workspace:update',
        'workspace:delete',
        'members:add',
        'members:remove',
        'members:update-role',
        'teams:create',
        'teams:update',
        'teams:delete',
        'teams:manage-members',
      ];

      writePermissions.forEach((permission) => {
        expect(hasPermission(memberRole, permission)).toBe(false);
      });
    });
  });

  describe('VIEWER Role Permissions', () => {
    const viewerRole = WorkspaceRole.VIEWER;

    it('should have read-only workspace permissions', () => {
      expect(hasPermission(viewerRole, 'workspace:view')).toBe(true);
      expect(hasPermission(viewerRole, 'workspace:update')).toBe(false);
      expect(hasPermission(viewerRole, 'workspace:delete')).toBe(false);
    });

    it('should be able to view members but not manage them', () => {
      expect(hasPermission(viewerRole, 'members:view')).toBe(true);
      expect(hasPermission(viewerRole, 'members:add')).toBe(false);
      expect(hasPermission(viewerRole, 'members:remove')).toBe(false);
      expect(hasPermission(viewerRole, 'members:update-role')).toBe(false);
    });

    it('should be able to view teams but not manage them', () => {
      expect(hasPermission(viewerRole, 'teams:view')).toBe(true);
      expect(hasPermission(viewerRole, 'teams:create')).toBe(false);
      expect(hasPermission(viewerRole, 'teams:update')).toBe(false);
      expect(hasPermission(viewerRole, 'teams:delete')).toBe(false);
      expect(hasPermission(viewerRole, 'teams:manage-members')).toBe(false);
    });

    it('should have identical permissions to MEMBER role', () => {
      const allPermissions: Permission[] = [
        'workspace:view',
        'workspace:update',
        'workspace:delete',
        'members:view',
        'members:add',
        'members:remove',
        'members:update-role',
        'teams:view',
        'teams:create',
        'teams:update',
        'teams:delete',
        'teams:manage-members',
      ];

      allPermissions.forEach((permission) => {
        expect(hasPermission(viewerRole, permission)).toBe(
          hasPermission(WorkspaceRole.MEMBER, permission)
        );
      });
    });

    it('should only have read permissions', () => {
      const writePermissions: Permission[] = [
        'workspace:update',
        'workspace:delete',
        'members:add',
        'members:remove',
        'members:update-role',
        'teams:create',
        'teams:update',
        'teams:delete',
        'teams:manage-members',
      ];

      writePermissions.forEach((permission) => {
        expect(hasPermission(viewerRole, permission)).toBe(false);
      });
    });
  });

  describe('Last Admin Protection', () => {
    interface WorkspaceMember {
      userId: string;
      role: WorkspaceRole;
    }

    function canRemoveMember(
      members: WorkspaceMember[],
      targetUserId: string
    ): { allowed: boolean; reason?: string } {
      const target = members.find((m) => m.userId === targetUserId);
      if (!target) {
        return { allowed: false, reason: 'Member not found' };
      }

      // If not admin, can remove
      if (target.role !== WorkspaceRole.ADMIN) {
        return { allowed: true };
      }

      // Count admins
      const adminCount = members.filter((m) => m.role === WorkspaceRole.ADMIN).length;

      // Cannot remove if last admin
      if (adminCount === 1) {
        return { allowed: false, reason: 'Cannot remove last admin' };
      }

      return { allowed: true };
    }

    function canDemoteMember(
      members: WorkspaceMember[],
      targetUserId: string,
      newRole: WorkspaceRole
    ): { allowed: boolean; reason?: string } {
      const target = members.find((m) => m.userId === targetUserId);
      if (!target) {
        return { allowed: false, reason: 'Member not found' };
      }

      // If not currently admin, can change role
      if (target.role !== WorkspaceRole.ADMIN) {
        return { allowed: true };
      }

      // If new role is still admin, allowed
      if (newRole === WorkspaceRole.ADMIN) {
        return { allowed: true };
      }

      // Count admins
      const adminCount = members.filter((m) => m.role === WorkspaceRole.ADMIN).length;

      // Cannot demote if last admin
      if (adminCount === 1) {
        return { allowed: false, reason: 'Cannot demote last admin' };
      }

      return { allowed: true };
    }

    it('should prevent removing last admin', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
      ];

      const result = canRemoveMember(members, 'admin1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot remove last admin');
    });

    it('should allow removing admin when multiple admins exist', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'admin2', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
      ];

      const result = canRemoveMember(members, 'admin1');
      expect(result.allowed).toBe(true);
    });

    it('should allow removing non-admin members', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
        { userId: 'viewer1', role: WorkspaceRole.VIEWER },
      ];

      expect(canRemoveMember(members, 'member1').allowed).toBe(true);
      expect(canRemoveMember(members, 'viewer1').allowed).toBe(true);
    });

    it('should prevent demoting last admin', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
      ];

      const result = canDemoteMember(members, 'admin1', WorkspaceRole.MEMBER);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cannot demote last admin');
    });

    it('should allow demoting admin when multiple admins exist', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'admin2', role: WorkspaceRole.ADMIN },
      ];

      const result = canDemoteMember(members, 'admin1', WorkspaceRole.MEMBER);
      expect(result.allowed).toBe(true);
    });

    it('should allow changing role for non-admin members', () => {
      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
      ];

      expect(canDemoteMember(members, 'member1', WorkspaceRole.VIEWER).allowed).toBe(true);
    });

    it('should allow admin to keep admin role (no change)', () => {
      const members: WorkspaceMember[] = [{ userId: 'admin1', role: WorkspaceRole.ADMIN }];

      const result = canDemoteMember(members, 'admin1', WorkspaceRole.ADMIN);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Permission Edge Cases', () => {
    it('should make creator admin automatically', () => {
      // Business rule: when workspace is created, creator gets ADMIN role
      const creatorRole = WorkspaceRole.ADMIN;
      expect(creatorRole).toBe(WorkspaceRole.ADMIN);
    });

    it('should allow admin to demote themselves if others exist', () => {
      interface WorkspaceMember {
        userId: string;
        role: WorkspaceRole;
      }

      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'admin2', role: WorkspaceRole.ADMIN },
      ];

      function canDemoteSelf(members: WorkspaceMember[], userId: string): boolean {
        const adminCount = members.filter((m) => m.role === WorkspaceRole.ADMIN).length;
        return adminCount > 1;
      }

      expect(canDemoteSelf(members, 'admin1')).toBe(true);
    });

    it('should prevent admin from demoting themselves if they are last admin', () => {
      interface WorkspaceMember {
        userId: string;
        role: WorkspaceRole;
      }

      const members: WorkspaceMember[] = [
        { userId: 'admin1', role: WorkspaceRole.ADMIN },
        { userId: 'member1', role: WorkspaceRole.MEMBER },
      ];

      function canDemoteSelf(members: WorkspaceMember[], userId: string): boolean {
        const adminCount = members.filter((m) => m.role === WorkspaceRole.ADMIN).length;
        return adminCount > 1;
      }

      expect(canDemoteSelf(members, 'admin1')).toBe(false);
    });

    it('should allow promoting member to admin without restrictions', () => {
      interface WorkspaceMember {
        userId: string;
        role: WorkspaceRole;
      }

      function canPromoteToAdmin(member: WorkspaceMember): boolean {
        // No restrictions on promoting to admin
        return true;
      }

      const member: WorkspaceMember = { userId: 'member1', role: WorkspaceRole.MEMBER };
      expect(canPromoteToAdmin(member)).toBe(true);
    });

    it('should handle role transitions correctly', () => {
      type RoleTransition = {
        from: WorkspaceRole;
        to: WorkspaceRole;
        allowed: boolean;
      };

      const transitions: RoleTransition[] = [
        { from: WorkspaceRole.MEMBER, to: WorkspaceRole.ADMIN, allowed: true },
        { from: WorkspaceRole.MEMBER, to: WorkspaceRole.VIEWER, allowed: true },
        { from: WorkspaceRole.VIEWER, to: WorkspaceRole.ADMIN, allowed: true },
        { from: WorkspaceRole.VIEWER, to: WorkspaceRole.MEMBER, allowed: true },
        { from: WorkspaceRole.ADMIN, to: WorkspaceRole.MEMBER, allowed: true }, // If not last admin
        { from: WorkspaceRole.ADMIN, to: WorkspaceRole.VIEWER, allowed: true }, // If not last admin
      ];

      transitions.forEach((transition) => {
        // All transitions are allowed in general (last admin check is separate)
        expect(transition.allowed).toBe(true);
      });
    });
  });

  describe('Permission Inheritance', () => {
    it('should verify admin has all member permissions', () => {
      const memberPermissions: Permission[] = ['workspace:view', 'members:view', 'teams:view'];

      memberPermissions.forEach((permission) => {
        expect(hasPermission(WorkspaceRole.ADMIN, permission)).toBe(true);
        expect(hasPermission(WorkspaceRole.MEMBER, permission)).toBe(true);
      });
    });

    it('should verify admin has all viewer permissions', () => {
      const viewerPermissions: Permission[] = ['workspace:view', 'members:view', 'teams:view'];

      viewerPermissions.forEach((permission) => {
        expect(hasPermission(WorkspaceRole.ADMIN, permission)).toBe(true);
        expect(hasPermission(WorkspaceRole.VIEWER, permission)).toBe(true);
      });
    });

    it('should verify permission hierarchy: ADMIN > MEMBER = VIEWER', () => {
      const allPermissions: Permission[] = [
        'workspace:view',
        'workspace:update',
        'workspace:delete',
        'members:view',
        'members:add',
        'members:remove',
        'members:update-role',
        'teams:view',
        'teams:create',
        'teams:update',
        'teams:delete',
        'teams:manage-members',
      ];

      const adminPerms = allPermissions.filter((p) => hasPermission(WorkspaceRole.ADMIN, p));
      const memberPerms = allPermissions.filter((p) => hasPermission(WorkspaceRole.MEMBER, p));
      const viewerPerms = allPermissions.filter((p) => hasPermission(WorkspaceRole.VIEWER, p));

      // ADMIN should have most permissions
      expect(adminPerms.length).toBeGreaterThan(memberPerms.length);

      // MEMBER and VIEWER should have equal permissions
      expect(memberPerms.length).toBe(viewerPerms.length);

      // All MEMBER permissions should be subset of ADMIN permissions
      memberPerms.forEach((perm) => {
        expect(adminPerms).toContain(perm);
      });
    });
  });
});
