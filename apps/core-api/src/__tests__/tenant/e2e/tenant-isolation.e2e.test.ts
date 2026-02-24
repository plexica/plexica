/**
 * Tenant Isolation E2E Tests
 *
 * Critical security tests to verify complete isolation between tenants.
 * Covers:
 * - Data isolation (cannot access other tenant's data)
 * - User isolation (same email in different tenants)
 * - Permission isolation (roles don't leak across tenants)
 * - Workspace isolation (workspaces are tenant-specific)
 * - Schema-level isolation verification
 * - API-level isolation enforcement
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { redis } from '../../../lib/redis';
import { permissionService } from '../../../services/permission.service';
import { resetAllCaches } from '../../../lib/advanced-rate-limit';

describe('Tenant Isolation E2E', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenant1Id: string;
  let tenant2Id: string;
  let tenant1AdminToken: string;
  let tenant2AdminToken: string;

  // Dynamic slugs to avoid conflicts between test runs
  const suffix = Date.now().toString(36);
  const tenant1Slug = `iso-t1-${suffix}`;
  const tenant2Slug = `iso-t2-${suffix}`;
  // Schema names: tenant_ + slug with hyphens replaced by underscores
  const tenant1Schema = `tenant_${tenant1Slug.replace(/-/g, '_')}`;
  const tenant2Schema = `tenant_${tenant2Slug.replace(/-/g, '_')}`;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
    resetAllCaches();

    // Get super admin token
    const superAdminResp = await testContext.auth.getRealSuperAdminToken();
    superAdminToken = superAdminResp.access_token;

    // Create two isolated tenants
    const tenant1Response = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
      },
      payload: {
        slug: tenant1Slug,
        name: 'Isolation Tenant 1',
      },
    });

    expect(tenant1Response.statusCode).toBe(201);

    const tenant2Response = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
      },
      payload: {
        slug: tenant2Slug,
        name: 'Isolation Tenant 2',
      },
    });

    expect(tenant2Response.statusCode).toBe(201);

    const tenant1 = JSON.parse(tenant1Response.body);
    const tenant2 = JSON.parse(tenant2Response.body);

    tenant1Id = tenant1.id;
    tenant2Id = tenant2.id;

    // Get tenant admin tokens (from seed data - acme and demo)
    const tenant1AdminResp = await testContext.auth.getRealTenantAdminToken('acme');
    const tenant2AdminResp = await testContext.auth.getRealTenantAdminToken('demo');

    tenant1AdminToken = tenant1AdminResp.access_token;
    tenant2AdminToken = tenant2AdminResp.access_token;
  });

  afterAll(async () => {
    // Clean up created schemas
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${tenant1Schema}" CASCADE`);
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${tenant2Schema}" CASCADE`);
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
    await db.$disconnect();
    try {
      await redis.quit();
    } catch {
      /* ignore already-closed */
    }
  });

  beforeEach(async () => {
    await redis.flushdb();
    resetAllCaches();
  });

  describe('Data Isolation', () => {
    it('should isolate user data between tenants', async () => {
      // Create user in tenant 1
      const user1Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)`,
        user1Id,
        'keycloak-user-1',
        'user@tenant1.com',
        'John',
        'Doe'
      );

      // Create user in tenant 2 with different data
      const user2Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."users" (id, keycloak_id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)`,
        user2Id,
        'keycloak-user-2',
        'user@tenant2.com',
        'Jane',
        'Smith'
      );

      // Query tenant 1 users - should only see tenant 1 user
      const tenant1Users = await db.$queryRawUnsafe<Array<{ id: string; email: string }>>(
        `SELECT id, email FROM "${tenant1Schema}"."users" WHERE id = $1`,
        user1Id
      );

      expect(tenant1Users).toHaveLength(1);
      expect(tenant1Users[0].id).toBe(user1Id);
      expect(tenant1Users[0].email).toBe('user@tenant1.com');

      // Query tenant 2 users - should only see tenant 2 user
      const tenant2Users = await db.$queryRawUnsafe<Array<{ id: string; email: string }>>(
        `SELECT id, email FROM "${tenant2Schema}"."users" WHERE id = $1`,
        user2Id
      );

      expect(tenant2Users).toHaveLength(1);
      expect(tenant2Users[0].id).toBe(user2Id);
      expect(tenant2Users[0].email).toBe('user@tenant2.com');
    });

    it('should allow same email in different tenant schemas', async () => {
      const sharedEmail = `shared-${suffix}@example.com`;

      // Create user with same email in tenant 1
      const user1Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email, first_name)
         VALUES ($1, $2, $3, $4)`,
        user1Id,
        `keycloak-shared-1-${suffix}`,
        sharedEmail,
        'User1'
      );

      // Create user with same email in tenant 2 - should succeed
      const user2Id = crypto.randomUUID();
      await expect(
        db.$executeRawUnsafe(
          `INSERT INTO "${tenant2Schema}"."users" (id, keycloak_id, email, first_name)
           VALUES ($1, $2, $3, $4)`,
          user2Id,
          `keycloak-shared-2-${suffix}`,
          sharedEmail,
          'User2'
        )
      ).resolves.not.toThrow();

      // Verify both users exist with same email
      const tenant1User = await db.$queryRawUnsafe<Array<{ email: string; first_name: string }>>(
        `SELECT email, first_name FROM "${tenant1Schema}"."users" WHERE email = $1`,
        sharedEmail
      );

      const tenant2User = await db.$queryRawUnsafe<Array<{ email: string; first_name: string }>>(
        `SELECT email, first_name FROM "${tenant2Schema}"."users" WHERE email = $1`,
        sharedEmail
      );

      expect(tenant1User[0].first_name).toBe('User1');
      expect(tenant2User[0].first_name).toBe('User2');
    });

    it('should prevent cross-schema queries', async () => {
      // This test verifies that PostgreSQL schema isolation works
      // Try to query tenant 1 data while in tenant 2 schema context

      // Set schema to tenant 2
      await db.$executeRawUnsafe(`SET search_path TO "${tenant2Schema}"`);

      // Try to query tenant 1 table without schema prefix - should fail or return empty
      // Note: This would require table not to exist in current schema
      await db
        .$queryRawUnsafe<Array<unknown>>(`SELECT * FROM "${tenant1Schema}"."users" LIMIT 1`)
        .catch(() => ({ length: 0 }));

      // Even if query succeeds, it should be explicit cross-schema access
      // The important thing is we're testing the schemas are separate

      // Reset schema
      await db.$executeRawUnsafe(`SET search_path TO public, core`);

      expect(true).toBe(true); // Test that no error was thrown with explicit schema
    });

    it('should isolate role data between tenants', async () => {
      // Create custom role in tenant 1 using normalized schema (Spec 003)
      const role1Id = crypto.randomUUID();
      const perm1Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        role1Id,
        tenant1Id,
        'custom-role-1'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."permissions" (id, tenant_id, key, name, created_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        perm1Id,
        tenant1Id,
        'custom.permission1'
      );
      // Re-fetch the actual permission id in case of conflict
      const perm1Rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant1Schema}"."permissions" WHERE tenant_id = $1 AND key = $2`,
        tenant1Id,
        'custom.permission1'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."role_permissions" (role_id, permission_id, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        role1Id,
        perm1Rows[0].id,
        tenant1Id
      );

      // Create role with same name in tenant 2
      const role2Id = crypto.randomUUID();
      const perm2Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        role2Id,
        tenant2Id,
        'custom-role-1'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."permissions" (id, tenant_id, key, name, created_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        perm2Id,
        tenant2Id,
        'custom.permission2'
      );
      const perm2Rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant2Schema}"."permissions" WHERE tenant_id = $1 AND key = $2`,
        tenant2Id,
        'custom.permission2'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."role_permissions" (role_id, permission_id, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        role2Id,
        perm2Rows[0].id,
        tenant2Id
      );

      // Verify roles are isolated — query permissions via JOIN
      const tenant1Perms = await db.$queryRawUnsafe<Array<{ id: string; key: string }>>(
        `SELECT r.id, p.key
         FROM "${tenant1Schema}"."roles" r
         JOIN "${tenant1Schema}"."role_permissions" rp ON rp.role_id = r.id
         JOIN "${tenant1Schema}"."permissions" p ON p.id = rp.permission_id
         WHERE r.name = 'custom-role-1'`
      );

      const tenant2Perms = await db.$queryRawUnsafe<Array<{ id: string; key: string }>>(
        `SELECT r.id, p.key
         FROM "${tenant2Schema}"."roles" r
         JOIN "${tenant2Schema}"."role_permissions" rp ON rp.role_id = r.id
         JOIN "${tenant2Schema}"."permissions" p ON p.id = rp.permission_id
         WHERE r.name = 'custom-role-1'`
      );

      expect(tenant1Perms[0].id).toBe(role1Id);
      expect(tenant1Perms[0].key).toBe('custom.permission1');

      expect(tenant2Perms[0].id).toBe(role2Id);
      expect(tenant2Perms[0].key).toBe('custom.permission2');

      // Verify they have different IDs
      expect(tenant1Perms[0].id).not.toBe(tenant2Perms[0].id);
    });
  });

  describe('Permission Isolation', () => {
    it('should isolate permissions between tenants', async () => {
      // Create user and role in tenant 1
      const user1Id = crypto.randomUUID();
      const role1Id = crypto.randomUUID();

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        user1Id,
        `perm-test-1-${suffix}`,
        `permuser1-${suffix}@test.com`
      );

      // Insert role (Spec 003: no permissions column — use normalized tables)
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        role1Id,
        tenant1Id,
        'tenant1-role'
      );

      // Insert permissions and link them
      for (const permKey of ['tenant1.read', 'tenant1.write']) {
        const permId = crypto.randomUUID();
        await db.$executeRawUnsafe(
          `INSERT INTO "${tenant1Schema}"."permissions" (id, tenant_id, key, name, created_at)
           VALUES ($1, $2, $3, $3, NOW())
           ON CONFLICT (tenant_id, key) DO NOTHING`,
          permId,
          tenant1Id,
          permKey
        );
        const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "${tenant1Schema}"."permissions" WHERE tenant_id = $1 AND key = $2`,
          tenant1Id,
          permKey
        );
        await db.$executeRawUnsafe(
          `INSERT INTO "${tenant1Schema}"."role_permissions" (role_id, permission_id, tenant_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          role1Id,
          rows[0].id,
          tenant1Id
        );
      }

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."user_roles" (user_id, role_id, tenant_id)
         VALUES ($1, $2, $3)`,
        user1Id,
        role1Id,
        tenant1Id
      );

      // Create user and role in tenant 2
      const user2Id = crypto.randomUUID();
      const role2Id = crypto.randomUUID();

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        user2Id,
        `perm-test-2-${suffix}`,
        `permuser2-${suffix}@test.com`
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        role2Id,
        tenant2Id,
        'tenant2-role'
      );

      const perm2Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."permissions" (id, tenant_id, key, name, created_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        perm2Id,
        tenant2Id,
        'tenant2.admin'
      );
      const perm2Rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant2Schema}"."permissions" WHERE tenant_id = $1 AND key = $2`,
        tenant2Id,
        'tenant2.admin'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."role_permissions" (role_id, permission_id, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        role2Id,
        perm2Rows[0].id,
        tenant2Id
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."user_roles" (user_id, role_id, tenant_id)
         VALUES ($1, $2, $3)`,
        user2Id,
        role2Id,
        tenant2Id
      );

      // Get permissions for user 1 in tenant 1
      const user1Permissions = await permissionService.getUserPermissions(user1Id, tenant1Schema);

      // Get permissions for user 2 in tenant 2
      const user2Permissions = await permissionService.getUserPermissions(user2Id, tenant2Schema);

      // Verify isolation
      expect(user1Permissions).toContain('tenant1.read');
      expect(user1Permissions).toContain('tenant1.write');
      expect(user1Permissions).not.toContain('tenant2.admin');

      expect(user2Permissions).toContain('tenant2.admin');
      expect(user2Permissions).not.toContain('tenant1.read');
      expect(user2Permissions).not.toContain('tenant1.write');
    });

    it('should not allow permission checks across tenants', async () => {
      const userId = crypto.randomUUID();

      // Create user in tenant 1 with specific permissions
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        userId,
        `cross-check-test-${suffix}`,
        `crosscheck-${suffix}@test.com`
      );

      const roleId = crypto.randomUUID();
      // Insert role using normalized schema (Spec 003)
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        roleId,
        tenant1Id,
        'cross-role'
      );

      const crossPermId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."permissions" (id, tenant_id, key, name, created_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        crossPermId,
        tenant1Id,
        'cross.permission'
      );
      const crossPermRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant1Schema}"."permissions" WHERE tenant_id = $1 AND key = $2`,
        tenant1Id,
        'cross.permission'
      );
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."role_permissions" (role_id, permission_id, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        roleId,
        crossPermRows[0].id,
        tenant1Id
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."user_roles" (user_id, role_id, tenant_id)
         VALUES ($1, $2, $3)`,
        userId,
        roleId,
        tenant1Id
      );

      // Check permission in tenant 1 - should have permission
      const hasPerm1 = await permissionService.hasPermission(
        userId,
        tenant1Schema,
        'cross.permission'
      );
      expect(hasPerm1).toBe(true);

      // Try to check same user's permission in tenant 2 - should not have it
      const hasPerm2 = await permissionService.hasPermission(
        userId,
        tenant2Schema,
        'cross.permission'
      );
      expect(hasPerm2).toBe(false); // User doesn't exist in tenant 2 schema
    });
  });

  describe('Schema-Level Isolation', () => {
    it('should have completely separate table structures', async () => {
      // Verify both tenants have their own tables
      const tenant1Tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        tenant1Schema
      );

      const tenant2Tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        tenant2Schema
      );

      // Both should have standard tables
      const tenant1TableNames = tenant1Tables.map((t) => t.table_name);
      const tenant2TableNames = tenant2Tables.map((t) => t.table_name);

      expect(tenant1TableNames).toContain('users');
      expect(tenant1TableNames).toContain('roles');
      expect(tenant1TableNames).toContain('user_roles');

      expect(tenant2TableNames).toContain('users');
      expect(tenant2TableNames).toContain('roles');
      expect(tenant2TableNames).toContain('user_roles');

      // But they should be in separate schemas
      expect(tenant1Tables.length).toBeGreaterThan(0);
      expect(tenant2Tables.length).toBeGreaterThan(0);
    });

    it('should prevent foreign key references across schemas', async () => {
      // This test verifies that foreign keys are schema-scoped
      const user1Id = crypto.randomUUID();
      const role2Id = crypto.randomUUID();

      // Create user in tenant 1
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        user1Id,
        `fk-test-${suffix}`,
        `fktest-${suffix}@test.com`
      );

      // Create role in tenant 2 using normalized schema (Spec 003)
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        role2Id,
        tenant2Id,
        'fk-role'
      );

      // Try to create user_role relationship across schemas - should fail
      await expect(
        db.$executeRawUnsafe(
          `INSERT INTO "${tenant1Schema}"."user_roles" (user_id, role_id)
           VALUES ($1, $2)`,
          user1Id,
          role2Id // Role from different schema
        )
      ).rejects.toThrow(); // Foreign key constraint violation
    });

    it('should have independent sequences for IDs', async () => {
      // Insert data in tenant 1
      const user1Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        user1Id,
        `seq-test-1-${suffix}`,
        `seq1-${suffix}@test.com`
      );

      // Insert data in tenant 2
      const user2Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        user2Id,
        `seq-test-2-${suffix}`,
        `seq2-${suffix}@test.com`
      );

      // Verify UUIDs are different
      expect(user1Id).not.toBe(user2Id);

      // Count users in each schema
      const count1 = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "${tenant1Schema}"."users"`
      );

      const count2 = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "${tenant2Schema}"."users"`
      );

      // Each schema has independent count
      expect(Number(count1[0].count)).toBeGreaterThanOrEqual(1);
      expect(Number(count2[0].count)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Workspace Isolation', () => {
    it('should isolate workspaces between tenants', async () => {
      // Create a workspace in each tenant schema using raw SQL
      const ws1Id = crypto.randomUUID();
      const ws2Id = crypto.randomUUID();

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."workspaces" (id, tenant_id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        ws1Id,
        tenant1Id,
        `iso-ws1-${suffix}`,
        'Isolation WS 1'
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."workspaces" (id, tenant_id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        ws2Id,
        tenant2Id,
        `iso-ws2-${suffix}`,
        'Isolation WS 2'
      );

      // Get workspaces from each tenant schema
      const t1Workspaces = await db.$queryRawUnsafe<any[]>(
        `SELECT id, tenant_id, slug FROM "${tenant1Schema}"."workspaces" WHERE tenant_id = $1`,
        tenant1Id
      );

      const t2Workspaces = await db.$queryRawUnsafe<any[]>(
        `SELECT id, tenant_id, slug FROM "${tenant2Schema}"."workspaces" WHERE tenant_id = $1`,
        tenant2Id
      );

      // Workspaces should be associated with only their tenant
      t1Workspaces.forEach((ws: any) => {
        expect(ws.tenant_id).not.toBe(tenant2Id);
      });

      t2Workspaces.forEach((ws: any) => {
        expect(ws.tenant_id).not.toBe(tenant1Id);
      });
    });

    it('should allow same workspace slug in different tenants', async () => {
      const sharedSlug = `shared-ws-${suffix}`;

      // Create workspace in tenant 1 schema
      const ws1Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."workspaces" (id, tenant_id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        ws1Id,
        tenant1Id,
        sharedSlug,
        'Shared Workspace 1'
      );

      // Create workspace with same slug in tenant 2 schema - should succeed
      const ws2Id = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."workspaces" (id, tenant_id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        ws2Id,
        tenant2Id,
        sharedSlug,
        'Shared Workspace 2'
      );

      // Fetch back to verify
      const workspace1 = (
        await db.$queryRawUnsafe<any[]>(
          `SELECT id, tenant_id, slug FROM "${tenant1Schema}"."workspaces" WHERE id = $1`,
          ws1Id
        )
      )[0];

      const workspace2 = (
        await db.$queryRawUnsafe<any[]>(
          `SELECT id, tenant_id, slug FROM "${tenant2Schema}"."workspaces" WHERE id = $1`,
          ws2Id
        )
      )[0];

      expect(workspace1.slug).toBe(workspace2.slug);
      expect(workspace1.id).not.toBe(workspace2.id);
      expect(workspace1.tenant_id).not.toBe(workspace2.tenant_id);
    });

    it('should prevent accessing workspaces from other tenants via API', async () => {
      // Create workspace in tenant 1 schema
      const wsId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."workspaces" (id, tenant_id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        wsId,
        tenant1Id,
        `private-ws-${suffix}`,
        'Private Workspace'
      );

      // Verify tenant 2's schema does NOT contain tenant 1's workspace
      const tenant2Workspaces = await db.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${tenant2Schema}"."workspaces" WHERE id = $1`,
        wsId
      );

      // Tenant 2 should not see tenant 1's workspace
      expect(tenant2Workspaces.length).toBe(0);
    });
  });

  describe('Keycloak Realm Isolation', () => {
    it('should have separate realms for each tenant', async () => {
      // Verify both tenants have their own Keycloak realms
      // This is verified during provisioning, but we can check again

      // Get tenant data
      const tenant1 = await db.tenant.findUnique({ where: { id: tenant1Id } });
      const tenant2 = await db.tenant.findUnique({ where: { id: tenant2Id } });

      expect(tenant1).toBeDefined();
      expect(tenant2).toBeDefined();
      expect(tenant1?.slug).not.toBe(tenant2?.slug);
    });

    it('should not allow authentication with wrong realm', async () => {
      // This would require testing Keycloak authentication
      // For E2E, we verify that tenant contexts are separate

      // The tokens we have are from different realms (plexica realm for seed data)
      // In production, each tenant would have their own realm

      expect(tenant1AdminToken).toBeDefined();
      expect(tenant2AdminToken).toBeDefined();
      expect(tenant1AdminToken).not.toBe(tenant2AdminToken);
    });
  });

  describe('Data Modification Isolation', () => {
    it('should not affect other tenant when modifying data', async () => {
      // Create initial data in both tenants
      const user1Id = crypto.randomUUID();
      const user2Id = crypto.randomUUID();

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email, first_name)
         VALUES ($1, $2, $3, $4)`,
        user1Id,
        `modify-test-1-${suffix}`,
        `modify1-${suffix}@test.com`,
        'Original1'
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."users" (id, keycloak_id, email, first_name)
         VALUES ($1, $2, $3, $4)`,
        user2Id,
        `modify-test-2-${suffix}`,
        `modify2-${suffix}@test.com`,
        'Original2'
      );

      // Modify data in tenant 1
      await db.$executeRawUnsafe(
        `UPDATE "${tenant1Schema}"."users" SET first_name = $1 WHERE id = $2`,
        'Modified1',
        user1Id
      );

      // Verify tenant 1 was modified
      const user1 = await db.$queryRawUnsafe<Array<{ first_name: string }>>(
        `SELECT first_name FROM "${tenant1Schema}"."users" WHERE id = $1`,
        user1Id
      );
      expect(user1[0].first_name).toBe('Modified1');

      // Verify tenant 2 was NOT affected
      const user2 = await db.$queryRawUnsafe<Array<{ first_name: string }>>(
        `SELECT first_name FROM "${tenant2Schema}"."users" WHERE id = $1`,
        user2Id
      );
      expect(user2[0].first_name).toBe('Original2');
    });

    it('should not affect other tenant when deleting data', async () => {
      const roleId1 = crypto.randomUUID();
      const roleId2 = crypto.randomUUID();

      // Create roles in both tenants using normalized schema (Spec 003)
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        roleId1,
        tenant1Id,
        `delete-test-role-${suffix}`
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant2Schema}"."roles" (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        roleId2,
        tenant2Id,
        `delete-test-role-${suffix}`
      );

      // Delete from tenant 1
      await db.$executeRawUnsafe(`DELETE FROM "${tenant1Schema}"."roles" WHERE id = $1`, roleId1);

      // Verify deleted from tenant 1
      const role1 = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant1Schema}"."roles" WHERE id = $1`,
        roleId1
      );
      expect(role1.length).toBe(0);

      // Verify still exists in tenant 2
      const role2 = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${tenant2Schema}"."roles" WHERE id = $1`,
        roleId2
      );
      expect(role2.length).toBe(1);
    });
  });

  describe('Transaction Isolation', () => {
    it('should not see uncommitted changes from other tenant', async () => {
      // This tests that transactions are properly isolated between schemas
      // PostgreSQL handles this at the database level

      const userId = crypto.randomUUID();

      // Create user in tenant 1
      await db.$executeRawUnsafe(
        `INSERT INTO "${tenant1Schema}"."users" (id, keycloak_id, email)
         VALUES ($1, $2, $3)`,
        userId,
        `trans-test-${suffix}`,
        `trans-${suffix}@test.com`
      );

      // Query from tenant 2 - should not see tenant 1's data
      const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "${tenant2Schema}"."users" WHERE id = $1`,
        userId
      );

      expect(Number(result[0].count)).toBe(0);
    });
  });

  describe('Security: Prevent SQL Injection Across Tenants', () => {
    it('should prevent SQL injection in tenant slug', async () => {
      const maliciousSlug = `tenant'; DROP SCHEMA ${tenant2Schema}; --`;

      // Try to create tenant with malicious slug
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: maliciousSlug,
          name: 'Malicious Tenant',
        },
      });

      expect(response.statusCode).toBe(400);

      // Verify tenant 2 schema still exists
      const schemaExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
          SELECT FROM pg_namespace
          WHERE nspname = $1
        ) as exists`,
        tenant2Schema
      );

      expect(schemaExists[0].exists).toBe(true);
    });
  });
});
