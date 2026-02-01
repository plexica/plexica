/**
 * Permission Integration Tests
 *
 * Tests the permission service with real database and Redis cache.
 * Covers:
 * - Permission caching with Redis
 * - Permission resolution across roles
 * - Dynamic permission updates
 * - Permission aggregation from multiple roles
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { permissionService, Permissions } from '../../../services/permission.service.js';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';

describe('Permission Service Integration', () => {
  let acmeUserId: string;
  let demoUserId: string;
  let acmeAdminRoleId: string;
  let acmeUserRoleId: string;
  let demoAdminRoleId: string;

  beforeAll(async () => {
    // Reset database and seed test data
    await testContext.resetAll();

    // Get test users from seed data
    const acmeUsers = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM tenant_acme_corp.users LIMIT 1`
    );
    acmeUserId = acmeUsers[0].id;

    const demoUsers = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM tenant_demo_company.users LIMIT 1`
    );
    demoUserId = demoUsers[0].id;
  });

  afterAll(async () => {
    await db.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear Redis cache before each test
    await redis.flushdb();
  });

  describe('Role and Permission Management', () => {
    it('should create roles with permissions', async () => {
      const role = await permissionService.createRole(
        'tenant_acme_corp',
        'test-admin',
        [Permissions.USERS_READ, Permissions.USERS_WRITE, Permissions.SETTINGS_READ],
        'Test admin role'
      );

      expect(role).toBeDefined();
      expect(role.name).toBe('test-admin');
      expect(role.permissions).toHaveLength(3);
      expect(role.permissions).toContain(Permissions.USERS_READ);
      expect(role.permissions).toContain(Permissions.USERS_WRITE);
      expect(role.permissions).toContain(Permissions.SETTINGS_READ);

      acmeAdminRoleId = role.id;
    });

    it('should get all roles in a tenant', async () => {
      // Create additional roles
      await permissionService.createRole(
        'tenant_acme_corp',
        'test-user',
        [Permissions.USERS_READ],
        'Test user role'
      );

      const roles = await permissionService.getRoles('tenant_acme_corp');

      expect(roles.length).toBeGreaterThanOrEqual(2);
      const testAdminRole = roles.find((r) => r.name === 'test-admin');
      const testUserRole = roles.find((r) => r.name === 'test-user');

      expect(testAdminRole).toBeDefined();
      expect(testUserRole).toBeDefined();
      expect(testUserRole?.permissions).toHaveLength(1);
    });

    it('should get a specific role by ID', async () => {
      const role = await permissionService.getRole('tenant_acme_corp', acmeAdminRoleId);

      expect(role).toBeDefined();
      expect(role?.id).toBe(acmeAdminRoleId);
      expect(role?.name).toBe('test-admin');
      expect(role?.permissions).toContain(Permissions.USERS_READ);
    });

    it('should update role permissions', async () => {
      // Update permissions - add new permission
      await permissionService.updateRolePermissions('tenant_acme_corp', acmeAdminRoleId, [
        Permissions.USERS_READ,
        Permissions.USERS_WRITE,
        Permissions.USERS_DELETE, // New permission
      ]);

      const updatedRole = await permissionService.getRole('tenant_acme_corp', acmeAdminRoleId);

      expect(updatedRole?.permissions).toHaveLength(3);
      expect(updatedRole?.permissions).toContain(Permissions.USERS_DELETE);
    });

    it('should validate schema name to prevent SQL injection', async () => {
      await expect(
        permissionService.createRole(
          'tenant_malicious"; DROP TABLE users; --',
          'malicious-role',
          []
        )
      ).rejects.toThrow(/Invalid schema name/);

      await expect(
        permissionService.getUserPermissions(acmeUserId, "tenant_malicious' OR '1'='1")
      ).rejects.toThrow(/Invalid schema name/);
    });
  });

  describe('User Role Assignment', () => {
    beforeEach(async () => {
      // Create roles for user assignment tests
      const adminRole = await permissionService.createRole(
        'tenant_acme_corp',
        'integration-admin',
        [
          Permissions.USERS_READ,
          Permissions.USERS_WRITE,
          Permissions.SETTINGS_READ,
          Permissions.SETTINGS_WRITE,
        ],
        'Integration test admin'
      );
      acmeAdminRoleId = adminRole.id;

      const userRole = await permissionService.createRole(
        'tenant_acme_corp',
        'integration-user',
        [Permissions.USERS_READ, Permissions.SETTINGS_READ],
        'Integration test user'
      );
      acmeUserRoleId = userRole.id;
    });

    it('should assign role to user', async () => {
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, acmeAdminRoleId);

      const userRoles = await permissionService.getUserRoles('tenant_acme_corp', acmeUserId);

      expect(userRoles.length).toBeGreaterThanOrEqual(1);
      const assignedRole = userRoles.find((r) => r.id === acmeAdminRoleId);
      expect(assignedRole).toBeDefined();
      expect(assignedRole?.name).toBe('integration-admin');
    });

    it('should prevent duplicate role assignments', async () => {
      // Assign role twice
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, acmeUserRoleId);
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, acmeUserRoleId);

      const userRoles = await permissionService.getUserRoles('tenant_acme_corp', acmeUserId);
      const matchingRoles = userRoles.filter((r) => r.id === acmeUserRoleId);

      expect(matchingRoles).toHaveLength(1);
    });

    it('should remove role from user', async () => {
      // First assign
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, acmeUserRoleId);

      // Then remove
      await permissionService.removeRoleFromUser('tenant_acme_corp', acmeUserId, acmeUserRoleId);

      const userRoles = await permissionService.getUserRoles('tenant_acme_corp', acmeUserId);
      const removedRole = userRoles.find((r) => r.id === acmeUserRoleId);

      expect(removedRole).toBeUndefined();
    });
  });

  describe('Permission Resolution', () => {
    beforeEach(async () => {
      // Clear any existing roles
      await redis.flushdb();

      // Create roles with different permissions
      const adminRole = await permissionService.createRole(
        'tenant_acme_corp',
        'resolution-admin',
        [
          Permissions.USERS_READ,
          Permissions.USERS_WRITE,
          Permissions.USERS_DELETE,
          Permissions.SETTINGS_READ,
          Permissions.SETTINGS_WRITE,
        ],
        'Resolution test admin'
      );

      const moderatorRole = await permissionService.createRole(
        'tenant_acme_corp',
        'resolution-moderator',
        [Permissions.USERS_READ, Permissions.USERS_WRITE, Permissions.SETTINGS_READ],
        'Resolution test moderator'
      );

      const viewerRole = await permissionService.createRole(
        'tenant_acme_corp',
        'resolution-viewer',
        [Permissions.USERS_READ],
        'Resolution test viewer'
      );

      acmeAdminRoleId = adminRole.id;

      // Assign multiple roles to user
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, adminRole.id);
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, moderatorRole.id);
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, viewerRole.id);
    });

    it('should aggregate permissions from multiple roles', async () => {
      const permissions = await permissionService.getUserPermissions(
        acmeUserId,
        'tenant_acme_corp'
      );

      // Should have all unique permissions from all roles
      expect(permissions).toContain(Permissions.USERS_READ);
      expect(permissions).toContain(Permissions.USERS_WRITE);
      expect(permissions).toContain(Permissions.USERS_DELETE);
      expect(permissions).toContain(Permissions.SETTINGS_READ);
      expect(permissions).toContain(Permissions.SETTINGS_WRITE);

      // Should not have duplicates
      const uniquePermissions = new Set(permissions);
      expect(permissions.length).toBe(uniquePermissions.size);
    });

    it('should check if user has specific permission', async () => {
      const hasRead = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_READ
      );
      const hasDelete = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_DELETE
      );
      const hasPlugins = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.PLUGINS_WRITE
      );

      expect(hasRead).toBe(true);
      expect(hasDelete).toBe(true);
      expect(hasPlugins).toBe(false); // User doesn't have this permission
    });

    it('should check if user has any of multiple permissions', async () => {
      const hasAny = await permissionService.hasAnyPermission(
        acmeUserId,
        'tenant_acme_corp',
        [Permissions.PLUGINS_READ, Permissions.USERS_READ] // Has one
      );
      const hasNone = await permissionService.hasAnyPermission(
        acmeUserId,
        'tenant_acme_corp',
        [Permissions.PLUGINS_READ, Permissions.PLUGINS_WRITE] // Has neither
      );

      expect(hasAny).toBe(true);
      expect(hasNone).toBe(false);
    });

    it('should check if user has all of multiple permissions', async () => {
      const hasAll = await permissionService.hasAllPermissions(
        acmeUserId,
        'tenant_acme_corp',
        [Permissions.USERS_READ, Permissions.USERS_WRITE] // Has both
      );
      const hasSome = await permissionService.hasAllPermissions(
        acmeUserId,
        'tenant_acme_corp',
        [Permissions.USERS_READ, Permissions.PLUGINS_READ] // Has only one
      );

      expect(hasAll).toBe(true);
      expect(hasSome).toBe(false);
    });
  });

  describe('Dynamic Permission Updates', () => {
    beforeEach(async () => {
      const role = await permissionService.createRole(
        'tenant_acme_corp',
        'dynamic-role',
        [Permissions.USERS_READ],
        'Dynamic update test'
      );
      acmeAdminRoleId = role.id;

      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, role.id);
    });

    it('should reflect permission changes immediately', async () => {
      // Check initial permission
      const hasBefore = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_WRITE
      );
      expect(hasBefore).toBe(false);

      // Update role to add permission
      await permissionService.updateRolePermissions('tenant_acme_corp', acmeAdminRoleId, [
        Permissions.USERS_READ,
        Permissions.USERS_WRITE, // Added
      ]);

      // Check updated permission
      const hasAfter = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_WRITE
      );
      expect(hasAfter).toBe(true);
    });

    it('should handle permission removal', async () => {
      // Update role to add permission first
      await permissionService.updateRolePermissions('tenant_acme_corp', acmeAdminRoleId, [
        Permissions.USERS_READ,
        Permissions.USERS_WRITE,
      ]);

      let hasWrite = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_WRITE
      );
      expect(hasWrite).toBe(true);

      // Remove permission
      await permissionService.updateRolePermissions('tenant_acme_corp', acmeAdminRoleId, [
        Permissions.USERS_READ, // Only this one remains
      ]);

      hasWrite = await permissionService.hasPermission(
        acmeUserId,
        'tenant_acme_corp',
        Permissions.USERS_WRITE
      );
      expect(hasWrite).toBe(false);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    beforeEach(async () => {
      // Create roles in both tenants
      const acmeRole = await permissionService.createRole(
        'tenant_acme_corp',
        'isolation-admin',
        [Permissions.USERS_READ, Permissions.USERS_WRITE],
        'ACME admin role'
      );
      acmeAdminRoleId = acmeRole.id;

      const demoRole = await permissionService.createRole(
        'tenant_demo_company',
        'isolation-admin',
        [Permissions.USERS_DELETE, Permissions.SETTINGS_WRITE],
        'Demo admin role'
      );
      demoAdminRoleId = demoRole.id;

      // Assign roles to users in their respective tenants
      await permissionService.assignRoleToUser('tenant_acme_corp', acmeUserId, acmeAdminRoleId);
      await permissionService.assignRoleToUser('tenant_demo_company', demoUserId, demoAdminRoleId);
    });

    it('should isolate permissions between tenants', async () => {
      // Check ACME user permissions
      const acmePermissions = await permissionService.getUserPermissions(
        acmeUserId,
        'tenant_acme_corp'
      );

      // Check Demo user permissions
      const demoPermissions = await permissionService.getUserPermissions(
        demoUserId,
        'tenant_demo_company'
      );

      // ACME user should have their permissions
      expect(acmePermissions).toContain(Permissions.USERS_READ);
      expect(acmePermissions).toContain(Permissions.USERS_WRITE);
      expect(acmePermissions).not.toContain(Permissions.USERS_DELETE);
      expect(acmePermissions).not.toContain(Permissions.SETTINGS_WRITE);

      // Demo user should have their permissions
      expect(demoPermissions).toContain(Permissions.USERS_DELETE);
      expect(demoPermissions).toContain(Permissions.SETTINGS_WRITE);
      expect(demoPermissions).not.toContain(Permissions.USERS_READ);
      expect(demoPermissions).not.toContain(Permissions.USERS_WRITE);
    });

    it('should not allow cross-tenant permission queries', async () => {
      // Try to get ACME role from Demo tenant - should return null
      const crossTenantRole = await permissionService.getRole(
        'tenant_demo_company',
        acmeAdminRoleId
      );

      expect(crossTenantRole).toBeNull();
    });

    it('should isolate roles between tenants', async () => {
      const acmeRoles = await permissionService.getRoles('tenant_acme_corp');
      const demoRoles = await permissionService.getRoles('tenant_demo_company');

      // Find the isolation-admin roles
      const acmeAdmin = acmeRoles.find((r) => r.name === 'isolation-admin');
      const demoAdmin = demoRoles.find((r) => r.name === 'isolation-admin');

      // Both should exist but have different IDs and permissions
      expect(acmeAdmin).toBeDefined();
      expect(demoAdmin).toBeDefined();
      expect(acmeAdmin?.id).not.toBe(demoAdmin?.id);
      expect(acmeAdmin?.permissions).not.toEqual(demoAdmin?.permissions);
    });
  });

  describe('Role Deletion', () => {
    it('should delete a role', async () => {
      const role = await permissionService.createRole(
        'tenant_acme_corp',
        'deletable-role',
        [Permissions.USERS_READ],
        'Role to be deleted'
      );

      await permissionService.deleteRole('tenant_acme_corp', role.id);

      const deletedRole = await permissionService.getRole('tenant_acme_corp', role.id);
      expect(deletedRole).toBeNull();
    });

    it('should handle deletion of non-existent role gracefully', async () => {
      const nonExistentId = 'non-existent-role-id';

      await expect(
        permissionService.deleteRole('tenant_acme_corp', nonExistentId)
      ).resolves.not.toThrow();
    });
  });

  describe('Default Roles Initialization', () => {
    it('should initialize default roles for a new tenant', async () => {
      await permissionService.initializeDefaultRoles('tenant_acme_corp');

      const roles = await permissionService.getRoles('tenant_acme_corp');

      // Should have at least admin, user, and guest roles
      const adminRole = roles.find((r) => r.name === 'admin');
      const userRole = roles.find((r) => r.name === 'user');
      const guestRole = roles.find((r) => r.name === 'guest');

      expect(adminRole).toBeDefined();
      expect(userRole).toBeDefined();
      expect(guestRole).toBeDefined();

      // Admin should have all permissions
      expect(adminRole?.permissions.length).toBeGreaterThan(5);

      // User should have basic permissions
      expect(userRole?.permissions).toContain(Permissions.USERS_READ);
      expect(userRole?.permissions).toContain(Permissions.SETTINGS_READ);

      // Guest should have minimal permissions
      expect(guestRole?.permissions).toContain(Permissions.USERS_READ);
      expect(guestRole?.permissions.length).toBe(1);
    });
  });
});
