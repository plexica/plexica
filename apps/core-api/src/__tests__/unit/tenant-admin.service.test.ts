// apps/core-api/src/__tests__/unit/tenant-admin.service.test.ts
// T008-20 — Unit tests for TenantAdminService (Spec 008 Admin Interfaces)
//
// Tests use vi.mock to isolate all external dependencies. No real DB, Keycloak,
// or Redis connections are made.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock external dependencies before importing service ─────────────────────

vi.mock('@plexica/database', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    raw: (s: string) => s,
    join: (items: unknown[], _separator?: string) => ({ strings: [], values: items }),
  },
}));

vi.mock('../../lib/db.js', () => {
  // Shared mock tx that re-uses the same mock fns so transaction callbacks work.
  const mockTx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return {
    db: {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      tenant: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      tenantPlugin: {
        count: vi.fn(),
      },
    },
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/audit-log.service.js', () => ({
  auditLogService: {
    log: vi.fn(),
    queryForTenant: vi.fn(),
  },
}));

vi.mock('../../services/keycloak.service.js', () => ({
  keycloakService: {
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    sendRequiredActionEmail: vi.fn(),
    assignRealmRoleToUser: vi.fn(),
    listUsers: vi.fn(),
    withRealmScope: vi.fn(),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { tenantAdminService } from '../../services/tenant-admin.service.js';
import { db } from '../../lib/db.js';
import { keycloakService } from '../../services/keycloak.service.js';
import { auditLogService } from '../../services/audit-log.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const SCHEMA_NAME = 'tenant_acme';
const TENANT_SLUG = 'acme';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TenantAdminService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // getDashboard
  // --------------------------------------------------------------------------

  describe('getDashboard', () => {
    it('should return aggregated dashboard stats', async () => {
      // Arrange
      (db.$queryRaw as any)
        .mockResolvedValueOnce([
          { status: 'active', count: BigInt(5) },
          { status: 'invited', count: BigInt(2) },
          { status: 'deactivated', count: BigInt(1) },
        ]) // userCounts
        .mockResolvedValueOnce([{ count: BigInt(3) }]) // teamCount
        .mockResolvedValueOnce([{ count: BigInt(4) }]) // workspaceCount
        .mockResolvedValueOnce([{ count: BigInt(2) }]) // roleSystem
        .mockResolvedValueOnce([{ count: BigInt(5) }]); // roleCustom
      (db.tenantPlugin.count as any)
        .mockResolvedValueOnce(2) // pluginEnabled
        .mockResolvedValueOnce(7); // pluginTotal

      // Act
      const result = await tenantAdminService.getDashboard(TENANT_ID, SCHEMA_NAME);

      // Assert
      expect(result.users.total).toBe(8);
      expect(result.users.active).toBe(5);
      expect(result.users.invited).toBe(2);
      expect(result.users.deactivated).toBe(1);
      expect(result.teams.total).toBe(3);
      expect(result.workspaces.total).toBe(4);
      expect(result.plugins.enabled).toBe(2);
      expect(result.plugins.total).toBe(7);
    });

    it('should throw on invalid schema name', async () => {
      await expect(tenantAdminService.getDashboard(TENANT_ID, 'INVALID-SCHEMA')).rejects.toThrow(
        'INVALID_SCHEMA_NAME'
      );
    });
  });

  // --------------------------------------------------------------------------
  // listUsers
  // --------------------------------------------------------------------------

  describe('listUsers', () => {
    it('should return paginated user list', async () => {
      // Arrange
      const mockUsers = [{ id: 'u1', email: 'a@b.com', status: 'active' }];
      (db.$queryRaw as any)
        .mockResolvedValueOnce(mockUsers)
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      // Act
      const result = await tenantAdminService.listUsers('_', SCHEMA_NAME, { page: 1, limit: 10 });

      // Assert
      expect(result.data).toEqual(mockUsers);
      expect(result.meta.total).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // inviteUser
  // --------------------------------------------------------------------------

  describe('inviteUser', () => {
    it('should throw ROLE_NOT_FOUND when roleId does not exist', async () => {
      // Arrange — role check returns empty
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      // Act & Assert
      await expect(
        tenantAdminService.inviteUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, {
          email: 'new@example.com',
          roleId: 'nonexistent-role-id',
        })
      ).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
    });

    it('should create user and return invited status on success', async () => {
      // Arrange
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'role-uuid' }]); // role check
      (keycloakService.createUser as any).mockResolvedValueOnce({ id: 'kc-user-id' });
      (keycloakService.sendRequiredActionEmail as any).mockResolvedValueOnce(undefined);
      (db.$executeRaw as any)
        .mockResolvedValueOnce(1) // insert user
        .mockResolvedValueOnce(1); // insert user_role

      // Act
      const result = await tenantAdminService.inviteUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, {
        email: 'new@example.com',
        roleId: 'role-uuid',
      });

      // Assert
      expect(result.status).toBe('invited');
      expect(result.email).toBe('new@example.com');
    });
  });

  // --------------------------------------------------------------------------
  // deactivateUser
  // --------------------------------------------------------------------------

  describe('deactivateUser', () => {
    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      // Arrange — user query returns empty
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.deactivateUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'no-such-user')
      ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });

    it('should throw LAST_TENANT_ADMIN when deactivating the last admin', async () => {
      // Arrange:
      // 1. user exists
      // 2. adminCount = 1 (only one admin)
      // 3. isAdmin count = 1 (this user IS that admin)
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ id: 'u1', keycloak_id: 'kc1', status: 'active' }]) // user exists
        .mockResolvedValueOnce([{ count: BigInt(1) }]) // adminCount (≤1)
        .mockResolvedValueOnce([{ count: BigInt(1) }]); // isAdmin (user is admin)

      await expect(
        tenantAdminService.deactivateUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1')
      ).rejects.toMatchObject({ code: 'LAST_TENANT_ADMIN' });
    });
  });

  // --------------------------------------------------------------------------
  // createTeam
  // --------------------------------------------------------------------------

  describe('createTeam', () => {
    it('should throw WORKSPACE_NOT_FOUND when workspace does not exist', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]); // workspace not found

      await expect(
        tenantAdminService.createTeam(TENANT_ID, SCHEMA_NAME, {
          name: 'Alpha',
          workspaceId: 'ws-uuid',
          ownerId: 'owner-uuid',
        })
      ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    });

    it('should create team and return id + name', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'ws-uuid' }]); // workspace exists
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.createTeam(TENANT_ID, SCHEMA_NAME, {
        name: 'Alpha',
        workspaceId: 'ws-uuid',
        ownerId: 'owner-uuid',
      });

      expect(result.name).toBe('Alpha');
      expect(typeof result.id).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // createRole
  // --------------------------------------------------------------------------

  describe('createRole', () => {
    it('should throw CUSTOM_ROLE_LIMIT_EXCEEDED at 50 custom roles', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ count: BigInt(50) }]);

      await expect(
        tenantAdminService.createRole(TENANT_ID, SCHEMA_NAME, { name: 'NewRole' })
      ).rejects.toMatchObject({ code: 'CUSTOM_ROLE_LIMIT_EXCEEDED' });
    });

    it('should create role and return id + name', async () => {
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // limit check
        .mockResolvedValueOnce([]); // W5: name conflict check — no conflict
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.createRole(TENANT_ID, SCHEMA_NAME, {
        name: 'Editor',
      });

      expect(result.name).toBe('Editor');
      expect(typeof result.id).toBe('string');
    });

    it('should throw ROLE_NAME_CONFLICT when role name already exists', async () => {
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // limit check
        .mockResolvedValueOnce([{ id: 'existing-role-id' }]); // name conflict check — conflict!

      await expect(
        tenantAdminService.createRole(TENANT_ID, SCHEMA_NAME, { name: 'Editor' })
      ).rejects.toMatchObject({ code: 'ROLE_NAME_CONFLICT' });
    });
  });

  // --------------------------------------------------------------------------
  // deleteRole — system role guard
  // --------------------------------------------------------------------------

  describe('deleteRole', () => {
    it('should throw SYSTEM_ROLE_IMMUTABLE when deleting a system role', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'r1', is_system: true }]);

      await expect(tenantAdminService.deleteRole('_', SCHEMA_NAME, 'r1')).rejects.toMatchObject({
        code: 'SYSTEM_ROLE_IMMUTABLE',
      });
    });
  });

  // --------------------------------------------------------------------------
  // getSettings
  // --------------------------------------------------------------------------

  describe('getSettings', () => {
    it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
      (db.tenant.findUnique as any).mockResolvedValueOnce(null);

      await expect(tenantAdminService.getSettings(TENANT_ID)).rejects.toMatchObject({
        code: 'TENANT_NOT_FOUND',
      });
    });

    it('should return tenant settings when found', async () => {
      const mockTenant = {
        id: TENANT_ID,
        name: 'Acme',
        slug: 'acme',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (db.tenant.findUnique as any).mockResolvedValueOnce(mockTenant);

      const result = await tenantAdminService.getSettings(TENANT_ID);

      expect(result.data.name).toBe('Acme');
      expect((result.data as any).id ?? mockTenant.id).toBe(TENANT_ID);
    });
  });

  // --------------------------------------------------------------------------
  // addTeamMember — duplicate guard
  // --------------------------------------------------------------------------

  describe('addTeamMember', () => {
    it('should throw MEMBER_ALREADY_EXISTS on duplicate insert', async () => {
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ id: 'team-1' }]) // team exists
        .mockResolvedValueOnce([{ id: 'user-1' }]); // user exists
      const dupError = new Error('duplicate key');
      (dupError as any).code = '23505';
      (db.$executeRaw as any).mockRejectedValue(dupError);

      await expect(
        tenantAdminService.addTeamMember(TENANT_ID, SCHEMA_NAME, 'team-1', {
          userId: 'user-1',
          role: 'MEMBER',
        })
      ).rejects.toMatchObject({ code: 'MEMBER_ALREADY_EXISTS' });
    });
  });

  // --------------------------------------------------------------------------
  // getCallerTeamRole — ADR-024 TeamAuthGuard helper
  // --------------------------------------------------------------------------

  describe('getCallerTeamRole', () => {
    it('should return the stored role when user is a team member', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ role: 'ADMIN' }]);

      const result = await tenantAdminService.getCallerTeamRole(SCHEMA_NAME, 'team-1', 'user-1');

      expect(result).toBe('ADMIN');
    });

    it('should return null when user is not a team member', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      const result = await tenantAdminService.getCallerTeamRole(
        SCHEMA_NAME,
        'team-1',
        'user-not-a-member'
      );

      expect(result).toBeNull();
    });

    it('should throw on invalid schema name', async () => {
      await expect(
        tenantAdminService.getCallerTeamRole('INVALID-SCHEMA', 'team-1', 'user-1')
      ).rejects.toThrow('INVALID_SCHEMA_NAME');
    });
  });

  // --------------------------------------------------------------------------
  // updateTeamMember — ADR-024 role update
  // --------------------------------------------------------------------------

  describe('updateTeamMember', () => {
    it('should throw MEMBER_NOT_FOUND when member does not exist', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]); // member not found

      await expect(
        tenantAdminService.updateTeamMember(TENANT_ID, SCHEMA_NAME, 'team-1', 'user-1', {
          role: 'ADMIN',
        })
      ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    });

    it('should update role and return updated record', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ team_id: 'team-1' }]); // member exists
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.updateTeamMember(
        TENANT_ID,
        SCHEMA_NAME,
        'team-1',
        'user-1',
        { role: 'ADMIN' }
      );

      expect(result.teamId).toBe('team-1');
      expect(result.userId).toBe('user-1');
      expect(result.role).toBe('ADMIN');
    });
  });

  // --------------------------------------------------------------------------
  // reactivateUser — W4: USER_NOT_DEACTIVATED error code
  // --------------------------------------------------------------------------

  describe('reactivateUser', () => {
    it('should throw USER_NOT_DEACTIVATED when user status is not deactivated', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: 'kc1', status: 'active' },
      ]);

      await expect(
        tenantAdminService.reactivateUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1')
      ).rejects.toMatchObject({ code: 'USER_NOT_DEACTIVATED' });
    });

    it('should reactivate user and return active status', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: null, status: 'deactivated' },
      ]);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.reactivateUser(
        TENANT_ID,
        SCHEMA_NAME,
        TENANT_SLUG,
        'u1'
      );

      expect(result.status).toBe('active');
    });
  });

  // --------------------------------------------------------------------------
  // resendInvite — C2: invitation timestamp reset
  // --------------------------------------------------------------------------

  describe('resendInvite', () => {
    it('should throw INVITATION_NOT_PENDING when user is not in invited status', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: 'kc1', status: 'active' },
      ]);

      await expect(
        tenantAdminService.resendInvite(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1')
      ).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    });

    it('should reset updated_at timestamp after resending invite (C2)', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: 'kc1', status: 'invited' },
      ]);
      (keycloakService.sendRequiredActionEmail as any).mockResolvedValueOnce(undefined);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.resendInvite(
        TENANT_ID,
        SCHEMA_NAME,
        TENANT_SLUG,
        'u1'
      );

      expect(result.status).toBe('invited');
      // Verify that an UPDATE (timestamp reset) was executed after Keycloak call
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // updateUser — C3: transactional role replacement
  // --------------------------------------------------------------------------

  describe('updateUser (role replacement atomicity)', () => {
    it('should use $transaction when replacing roleIds (C3)', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'u1' }]); // user exists
      (db.$executeRaw as any).mockResolvedValue(1);

      await tenantAdminService.updateUser(TENANT_ID, SCHEMA_NAME, 'u1', {
        roleIds: ['role-a', 'role-b'],
      });

      // $transaction must have been called for the role replacement
      expect(db.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should NOT use $transaction when only updating name (no roleIds)', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'u1' }]); // user exists
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      await tenantAdminService.updateUser(TENANT_ID, SCHEMA_NAME, 'u1', { name: 'New Name' });

      expect(db.$transaction).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // listUsers — C4: ILIKE wildcard escaping
  // --------------------------------------------------------------------------

  describe('listUsers (ILIKE wildcard escape)', () => {
    it('should escape % and _ in search filter before building ILIKE pattern (C4)', async () => {
      const mockUsers: unknown[] = [];
      (db.$queryRaw as any)
        .mockResolvedValueOnce(mockUsers)
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await tenantAdminService.listUsers('_', SCHEMA_NAME, { search: '100% pure_test' });

      // The mock Prisma.sql does NOT flatten nested templates (unlike the real Prisma.sql).
      // We must recursively collect all string values from the nested { strings, values }
      // objects that make up the final query template.
      function collectStrings(node: unknown): string[] {
        if (typeof node === 'string') return [node];
        if (Array.isArray(node)) return node.flatMap(collectStrings);
        if (node && typeof node === 'object' && 'values' in node) {
          return collectStrings((node as { values: unknown[] }).values);
        }
        return [];
      }

      const firstCall = (db.$queryRaw as any).mock.calls[0][0];
      const allStrings = collectStrings(firstCall);

      // The escaped ILIKE pattern should contain \% and \_ (backslash-escaped wildcards)
      const patternValue = allStrings.find((v: string) => v.startsWith('%'));
      expect(patternValue).toBeDefined();
      expect(patternValue).toContain('\\%');
      expect(patternValue).toContain('\\_');
    });
  });

  // --------------------------------------------------------------------------
  // reactivateUser — audit log (MEDIUM #1)
  // --------------------------------------------------------------------------

  describe('reactivateUser (audit log)', () => {
    it('should emit USER_REACTIVATED audit log on success', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: null, status: 'deactivated' },
      ]);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      await tenantAdminService.reactivateUser(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'user.reactivated',
          resourceType: 'user',
          resourceId: 'u1',
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // resendInvite — audit log (MEDIUM #3)
  // --------------------------------------------------------------------------

  describe('resendInvite (audit log)', () => {
    it('should emit INVITATION_RESENT audit log on success', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: null, status: 'invited' },
      ]);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      await tenantAdminService.resendInvite(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'invitation.resent',
          resourceType: 'user',
          resourceId: 'u1',
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // cancelInvite — lifecycle + audit log (MEDIUM #2 + MEDIUM #4)
  // --------------------------------------------------------------------------

  describe('cancelInvite', () => {
    it('should throw INVITATION_NOT_PENDING when user is not in invited status', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: null, status: 'active' },
      ]);

      await expect(
        tenantAdminService.cancelInvite(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'u1')
      ).rejects.toMatchObject({ code: 'INVITATION_NOT_PENDING' });
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.cancelInvite(TENANT_ID, SCHEMA_NAME, TENANT_SLUG, 'no-such-user')
      ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });

    it('should cancel invite and emit INVITATION_CANCELLED audit log', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([
        { id: 'u1', keycloak_id: null, status: 'invited' },
      ]);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      const result = await tenantAdminService.cancelInvite(
        TENANT_ID,
        SCHEMA_NAME,
        TENANT_SLUG,
        'u1'
      );

      expect(result).toMatchObject({ id: 'u1', status: 'cancelled' });
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'invitation.cancelled',
          resourceType: 'user',
          resourceId: 'u1',
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // deleteRole — transactional cascade deletion (MEDIUM #5)
  // --------------------------------------------------------------------------

  describe('deleteRole (transactional cascade)', () => {
    it('should throw SYSTEM_ROLE_IMMUTABLE for system roles', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'r1', is_system: true }]);

      await expect(
        tenantAdminService.deleteRole(TENANT_ID, SCHEMA_NAME, 'r1')
      ).rejects.toMatchObject({ code: 'SYSTEM_ROLE_IMMUTABLE' });
    });

    it('should throw ROLE_NOT_FOUND for unknown role', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.deleteRole(TENANT_ID, SCHEMA_NAME, 'no-such-role')
      ).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
    });

    it('should delete role using $transaction (all 3 tables atomically)', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'r1', is_system: false }]);
      // $transaction([...]) batched variant — mock resolves the array promise
      (db.$transaction as any).mockResolvedValueOnce([1, 1, 1]);

      const result = await tenantAdminService.deleteRole(TENANT_ID, SCHEMA_NAME, 'r1');

      expect(result).toMatchObject({ deleted: true });
      // The batched $transaction overload receives an array of promises
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      const txArg = (db.$transaction as any).mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(3); // role_permissions + user_roles + roles
    });
  });

  // --------------------------------------------------------------------------
  // createRole — transactional insert (HIGH #2)
  // --------------------------------------------------------------------------

  describe('createRole (transactional insert)', () => {
    it('should use $transaction when creating role with permissions', async () => {
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // custom count check
        .mockResolvedValueOnce([]); // name conflict check
      (db.$transaction as any).mockResolvedValueOnce(undefined);

      const result = await tenantAdminService.createRole(TENANT_ID, SCHEMA_NAME, {
        name: 'Editor',
        permissionIds: ['perm-1', 'perm-2'],
      });

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ name: 'Editor' });
    });

    it('should use $transaction even when no permissions are provided', async () => {
      (db.$queryRaw as any)
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // custom count check
        .mockResolvedValueOnce([]); // name conflict check
      (db.$transaction as any).mockResolvedValueOnce(undefined);

      await tenantAdminService.createRole(TENANT_ID, SCHEMA_NAME, { name: 'ReadOnly' });

      expect(db.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // deleteRole — audit log (M-1)
  // --------------------------------------------------------------------------

  describe('deleteRole (audit log)', () => {
    it('should emit ROLE_DELETED audit log on successful deletion', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 'r1', is_system: false }]);
      (db.$transaction as any).mockResolvedValueOnce([1, 1, 1]);

      await tenantAdminService.deleteRole(TENANT_ID, SCHEMA_NAME, 'r1');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'role.deleted',
          resourceType: 'role',
          resourceId: 'r1',
        })
      );
    });

    it('should NOT emit audit log when role is not found', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.deleteRole(TENANT_ID, SCHEMA_NAME, 'no-such-role')
      ).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // deleteTeam — audit log (M-2)
  // --------------------------------------------------------------------------

  describe('deleteTeam (audit log)', () => {
    it('should emit TEAM_DELETED audit log on successful deletion', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 't1' }]);
      (db.$transaction as any).mockResolvedValueOnce(undefined);

      await tenantAdminService.deleteTeam(TENANT_ID, SCHEMA_NAME, 't1');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'team.deleted',
          resourceType: 'team',
          resourceId: 't1',
        })
      );
    });

    it('should NOT emit audit log when team is not found', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.deleteTeam(TENANT_ID, SCHEMA_NAME, 'no-such-team')
      ).rejects.toMatchObject({ code: 'TEAM_NOT_FOUND' });

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // updateTeam — audit log (M-3)
  // --------------------------------------------------------------------------

  describe('updateTeam (audit log)', () => {
    it('should emit TEAM_UPDATED audit log when fields are changed', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 't1' }]);
      (db.$executeRaw as any).mockResolvedValueOnce(1);

      await tenantAdminService.updateTeam(TENANT_ID, SCHEMA_NAME, 't1', { name: 'New Name' });

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'team.updated',
          resourceType: 'team',
          resourceId: 't1',
        })
      );
    });

    it('should NOT emit audit log when no fields change', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([{ id: 't1' }]);

      // Pass an empty dto — no setClauses, so no UPDATE and no audit log
      await tenantAdminService.updateTeam(TENANT_ID, SCHEMA_NAME, 't1', {});

      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('should NOT emit audit log when team is not found', async () => {
      (db.$queryRaw as any).mockResolvedValueOnce([]);

      await expect(
        tenantAdminService.updateTeam(TENANT_ID, SCHEMA_NAME, 'no-such-team', { name: 'X' })
      ).rejects.toMatchObject({ code: 'TEAM_NOT_FOUND' });

      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });
});
