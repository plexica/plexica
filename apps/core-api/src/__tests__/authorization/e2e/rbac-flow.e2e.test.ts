/**
 * E2E Tests: RBAC Full Authorization Flow
 *
 * Spec 003 Task 5.17 — FR-001–FR-006, FR-011, FR-016, FR-024, NFR-001, NFR-006
 *
 * Covers the complete RBAC lifecycle end-to-end:
 *
 *   1. Tenant provisioning and system role verification
 *   2. Custom role creation with specific permissions
 *   3. Role assignment to a second user
 *   4. Effective permission check (GET /api/v1/me/permissions)
 *   5. Protected endpoint access with assigned permissions
 *   6. Protected endpoint blocked for user without required permission
 *   7. Role revocation removes access
 *   8. fail-closed: unauthenticated requests always 401
 *   9. fail-closed: missing permission always 403, no permission name leaked
 *  10. Cross-tenant isolation: same user ID in two tenants has separate permissions
 *
 * Infrastructure: PostgreSQL + Redis must be running (test-infrastructure).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function provisionTenant(app: FastifyInstance, superAdminToken: string, label = '') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const tenantSlug = `rbac-e2e-${label ? label + '-' : ''}${suffix}`;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/tenants',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    payload: {
      slug: tenantSlug,
      name: `RBAC E2E Test ${tenantSlug}`,
      adminEmail: `admin@${tenantSlug}.test`,
      adminPassword: 'test-pass-123',
    },
  });
  if (res.statusCode !== 201) throw new Error(`Failed to create tenant: ${res.body}`);

  const tenant = res.json();
  const tenantId = tenant.id;

  return { tenantId, tenantSlug, schemaName };
}

/** Create a user in the given tenant schema and return a token for them. */
async function createUserInTenant(
  schemaName: string,
  tenantId: string,
  tenantSlug: string,
  userLabel: string,
  roleNames: string[] = []
): Promise<{ userId: string; token: string }> {
  const userId = `e2e-${userLabel}-${tenantSlug}`
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 32)
    .padEnd(32, '0')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

  await db.$executeRawUnsafe(
    `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    userId,
    userId,
    `${userLabel}@${tenantSlug}.test`,
    userLabel,
    tenantSlug
  );

  for (const roleName of roleNames) {
    const roleRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "${schemaName}".roles WHERE name = $1 AND tenant_id = $2 LIMIT 1`,
      roleName,
      tenantId
    );
    if (roleRows.length > 0) {
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".user_roles (user_id, role_id, tenant_id, assigned_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        userId,
        roleRows[0].id,
        tenantId
      );
    }
  }

  const token = testContext.auth.createMockToken({
    sub: userId,
    preferred_username: `${userLabel}-${tenantSlug}`,
    email: `${userLabel}@${tenantSlug}.test`,
    tenantSlug,
    realm_access: { roles: roleNames },
  });

  return { userId, token };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RBAC Authorization — Full E2E Flow', () => {
  let app: FastifyInstance;
  let superAdminToken: string;

  let tenantId: string;
  let tenantSlug: string;
  let schemaName: string;

  let adminToken: string;
  let adminUserId: string;

  let regularToken: string;
  let regularUserId: string;

  let customRoleId: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    ({ tenantId, tenantSlug, schemaName } = await provisionTenant(app, superAdminToken));

    // Admin user (has tenant_admin role — all permissions)
    const admin = await createUserInTenant(schemaName, tenantId, tenantSlug, 'admin', [
      'tenant_admin',
    ]);
    adminUserId = admin.userId;
    adminToken = admin.token;

    // Regular user (no roles yet — no permissions)
    const regular = await createUserInTenant(schemaName, tenantId, tenantSlug, 'regular', []);
    regularUserId = regular.userId;
    regularToken = regular.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // Step 1: Verify system roles were provisioned
  // -------------------------------------------------------------------------

  describe('Step 1 — System roles provisioned', () => {
    it('should have 4 system roles after tenant creation', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles?isSystem=true',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const names = res.json().data.map((r: any) => r.name);
      expect(names).toContain('super_admin');
      expect(names).toContain('tenant_admin');
      expect(names).toContain('team_admin');
      expect(names).toContain('user');
    });

    it('admin should have full permissions via /me/permissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const keys: string[] = res.json().data; // data is string[] e.g. ['roles:read', ...]
      expect(keys).toContain('roles:read');
      expect(keys).toContain('roles:write');
      expect(keys).toContain('users:write');
      expect(keys).toContain('policies:write');
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Regular user has no permissions initially
  // -------------------------------------------------------------------------

  describe('Step 2 — Regular user has no initial permissions', () => {
    it('regular user /me/permissions returns empty array', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('regular user cannot list roles (missing roles:read)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(403);
      // NFR-004: 403 must NOT expose the permission name
      const body = res.json();
      expect(body.error.message).not.toContain('roles:read');
    });

    it('regular user cannot create roles (missing roles:write)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${regularToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'should-be-blocked', description: 'Should fail' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: Admin creates a custom role
  // -------------------------------------------------------------------------

  describe('Step 3 — Admin creates custom role', () => {
    it('admin creates viewer role with roles:read permission', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'viewer', description: 'Read-only access to roles' },
      });

      expect(res.statusCode).toBe(201);
      customRoleId = res.json().id;
      expect(customRoleId).toBeTruthy();

      // Assign roles:read permission to the viewer role
      const permRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND key = 'roles:read' LIMIT 1`,
        tenantId
      );
      expect(permRows.length).toBe(1);

      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".role_permissions (role_id, permission_id, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        customRoleId,
        permRows[0].id,
        tenantId
      );
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: Assign the viewer role to the regular user
  // -------------------------------------------------------------------------

  describe('Step 4 — Admin assigns viewer role to regular user', () => {
    it('admin assigns viewer role via POST /api/v1/users/:id/roles', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${regularUserId}/roles`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { roleId: customRoleId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Role assigned successfully');
    });
  });

  // -------------------------------------------------------------------------
  // Step 5: Regular user now has roles:read permission
  // -------------------------------------------------------------------------

  describe('Step 5 — Regular user gains roles:read after assignment', () => {
    it('regular user /me/permissions now includes roles:read', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const keys: string[] = res.json().data; // data is string[] e.g. ['roles:read', ...]
      expect(keys).toContain('roles:read');
      expect(keys).not.toContain('roles:write');
    });

    it('regular user can now list roles (has roles:read)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('regular user still cannot create roles (no roles:write)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${regularToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'still-blocked', description: 'Should still fail' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Step 6: Admin revokes viewer role
  // -------------------------------------------------------------------------

  describe('Step 6 — Admin revokes viewer role from regular user', () => {
    it('admin removes viewer role via DELETE /api/v1/users/:id/roles/:roleId', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${regularUserId}/roles/${customRoleId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(204);
    });

    it('regular user cache is invalidated — permissions returns empty', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('regular user can no longer list roles after revocation', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Step 7: Fail-closed checks
  // -------------------------------------------------------------------------

  describe('Step 7 — Fail-closed: unauthenticated and unpermitted requests', () => {
    it('should return 401 for all protected endpoints without a token', async () => {
      const endpoints = [
        { method: 'GET', url: '/api/v1/roles' },
        { method: 'GET', url: '/api/v1/permissions' },
        { method: 'GET', url: '/api/v1/policies' },
        { method: 'GET', url: '/api/v1/me/roles' },
        { method: 'GET', url: '/api/v1/me/permissions' },
      ];

      for (const { method, url } of endpoints) {
        const res = await app.inject({
          method: method as any,
          url,
          headers: { 'x-tenant-slug': tenantSlug },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it('403 response body must not contain the permission name (NFR-004)', async () => {
      // Regular user (no permissions) tries to access roles endpoint
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.stringify(res.json());
      expect(body).not.toContain('roles:read');
      expect(body).not.toContain('roles:write');
      expect(body).not.toContain('policies:');
      expect(body).not.toContain('users:');
    });
  });

  // -------------------------------------------------------------------------
  // Step 8: /me/roles endpoint
  // -------------------------------------------------------------------------

  describe('Step 8 — GET /api/v1/me/roles', () => {
    it('admin user can see their own roles', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/roles',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const names = res.json().data.map((r: any) => r.name);
      expect(names).toContain('tenant_admin');
    });

    it('regular user with no roles sees empty roles list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/roles',
        headers: { authorization: `Bearer ${regularToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Step 9: Cross-tenant: same userId in two tenants has separate permissions
  // -------------------------------------------------------------------------

  describe('Step 9 — Cross-tenant permission isolation', () => {
    it('admin in tenant A has no permissions in tenant B', async () => {
      // Provision a second tenant
      const {
        tenantId: idB,
        tenantSlug: slugB,
        schemaName: schemB,
      } = await provisionTenant(app, superAdminToken, 'b');

      // Create adminUserId (same ID) in tenant B but with NO roles
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemB}"."users" (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        adminUserId,
        adminUserId,
        `admin@${slugB}.test`,
        'Admin',
        slugB
      );

      // Create token for admin user scoped to tenant B
      const tokenInB = testContext.auth.createMockToken({
        sub: adminUserId,
        preferred_username: `admin-${slugB}`,
        email: `admin@${slugB}.test`,
        tenantSlug: slugB,
        realm_access: { roles: [] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${tokenInB}`, 'x-tenant-slug': slugB },
      });

      expect(res.statusCode).toBe(200);
      // No permissions in tenant B — data should be empty
      expect(res.json().data).toEqual([]);

      // Sanity: the same user still has permissions in tenant A
      const resA = await app.inject({
        method: 'GET',
        url: '/api/v1/me/permissions',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });
      expect(resA.statusCode).toBe(200);
      expect(resA.json().data.length).toBeGreaterThan(0);

      // Suppress unused variable
      void idB;
    });
  });
});
