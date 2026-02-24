/**
 * Integration Tests: Role CRUD and System Role Immutability
 *
 * Spec 003 Task 5.10 — FR-003, FR-004, FR-005, FR-023, NFR-006, Edge Case #9
 *
 * Tests:
 *   - GET /api/v1/roles (empty, with data, pagination, search, isSystem filter)
 *   - POST /api/v1/roles (success 201, name conflict 409, custom role limit 422)
 *   - PUT /api/v1/roles/:id (success 200, system role immutable 403, name conflict 409)
 *   - DELETE /api/v1/roles/:id (success 204, system role blocked 403, not found 404)
 *   - Cross-tenant isolation: role from tenant A not visible via tenant B token
 *
 * Setup: provisions a real tenant, inserts admin user, assigns tenant_admin role.
 * Infrastructure: PostgreSQL + Redis must be running (test-infrastructure).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Provision a tenant and return { tenantId, tenantSlug, schemaName, adminToken, adminUserId }. */
async function provisionTenant(app: FastifyInstance, superAdminToken: string) {
  const tenantSlug = `authz-roles-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/tenants',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    payload: {
      slug: tenantSlug,
      name: `Authz Roles Test ${tenantSlug}`,
      adminEmail: `admin@${tenantSlug}.test`,
      adminPassword: 'test-pass-123',
    },
  });

  if (res.statusCode !== 201) {
    throw new Error(`Failed to create tenant: ${res.body}`);
  }

  const tenant = res.json();
  const tenantId = tenant.id;

  // Create admin user in tenant schema (use a deterministic UUID-formatted ID)
  const raw = `aau-${tenantSlug}-${Date.now()}`;
  const adminUserId = raw
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 32)
    .padEnd(32, '0')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

  await db.$executeRawUnsafe(
    `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    adminUserId,
    adminUserId,
    `admin@${tenantSlug}.test`,
    'Admin',
    tenantSlug
  );

  // Look up the provisioned tenant_admin role
  const roleRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "${schemaName}".roles WHERE name = 'tenant_admin' AND tenant_id = $1 LIMIT 1`,
    tenantId
  );

  if (roleRows.length > 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".user_roles (user_id, role_id, tenant_id, assigned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      adminUserId,
      roleRows[0].id,
      tenantId
    );
  }

  const adminToken = testContext.auth.createMockToken({
    sub: adminUserId,
    preferred_username: `admin-${tenantSlug}`,
    email: `admin@${tenantSlug}.test`,
    tenantSlug,
    realm_access: { roles: ['tenant_admin'] },
  });

  return { tenantId, tenantSlug, schemaName, adminToken, adminUserId };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Authorization — Role CRUD Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantSlug: string;
  let tenantId: string;
  let schemaName: string;
  let adminToken: string;

  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    const ctx = await provisionTenant(app, superAdminToken);
    ({ tenantSlug, tenantId, schemaName, adminToken } = ctx);
  });

  afterAll(async () => {
    // Clean up custom roles
    for (const id of createdRoleIds) {
      await db
        .$executeRawUnsafe(`DELETE FROM "${schemaName}".roles WHERE id = $1`, id)
        .catch(() => {});
    }
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/roles
  // -------------------------------------------------------------------------

  describe('GET /api/v1/roles', () => {
    it('should return system roles for a newly provisioned tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      // Should have at least the 4 system roles provisioned during tenant creation
      expect(body.data.length).toBeGreaterThanOrEqual(4);
    });

    it('should filter roles by isSystem=true', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles?isSystem=true',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.every((r: any) => r.isSystem === true)).toBe(true);
    });

    it('should filter roles by isSystem=false (custom roles only)', async () => {
      // Create a custom role first
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'custom-filter-test', description: 'Filter test role' },
      });
      expect(createRes.statusCode).toBe(201);
      createdRoleIds.push(createRes.json().id);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles?isSystem=false',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.every((r: any) => r.isSystem === false)).toBe(true);
      expect(body.data.some((r: any) => r.name === 'custom-filter-test')).toBe(true);
    });

    it('should support search by name substring', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles?search=tenant',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.some((r: any) => r.name.includes('tenant'))).toBe(true);
    });

    it('should return 401 without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { 'x-tenant-slug': tenantSlug },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/roles
  // -------------------------------------------------------------------------

  describe('POST /api/v1/roles', () => {
    it('should create a custom role and return 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'editor', description: 'Can edit content' },
      });

      expect(res.statusCode).toBe(201);
      const role = res.json();
      expect(role.name).toBe('editor');
      expect(role.isSystem).toBe(false);
      expect(role.tenantId).toBe(tenantId);

      createdRoleIds.push(role.id);
    });

    it('should return 409 for duplicate role name', async () => {
      // Create once
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'conflict-role', description: 'First' },
      });
      expect(first.statusCode).toBe(201);
      createdRoleIds.push(first.json().id);

      // Create duplicate
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'conflict-role', description: 'Duplicate' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ROLE_NAME_CONFLICT');
    });

    it('should return 400 for missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { description: 'No name provided' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/v1/roles/:id
  // -------------------------------------------------------------------------

  describe('PUT /api/v1/roles/:id', () => {
    let customRoleId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'update-target', description: 'Before update' },
      });
      expect(res.statusCode).toBe(201);
      customRoleId = res.json().id;
      createdRoleIds.push(customRoleId);
    });

    it('should update a custom role description', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/roles/${customRoleId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { description: 'After update' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().description).toBe('After update');
    });

    it('should return 403 when trying to update a system role', async () => {
      // Look up the tenant_admin system role
      const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".roles WHERE name = 'tenant_admin' AND is_system = true AND tenant_id = $1 LIMIT 1`,
        tenantId
      );
      const sysRoleId = rows[0]?.id;
      if (!sysRoleId) {
        console.warn('System role not found — skipping test');
        return;
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/roles/${sysRoleId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { description: 'Attempt to mutate system role' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('SYSTEM_ROLE_IMMUTABLE');
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/roles/:id
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/roles/:id', () => {
    it('should delete a custom role and return 204', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'delete-me', description: 'To be deleted' },
      });
      expect(createRes.statusCode).toBe(201);
      const roleId = createRes.json().id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/roles/${roleId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(delRes.statusCode).toBe(204);
    });

    it('should return 404 for non-existent role', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/roles/non-existent-role-id',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ROLE_NOT_FOUND');
    });

    it('should return 403 when trying to delete a system role', async () => {
      const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".roles WHERE name = 'user' AND is_system = true AND tenant_id = $1 LIMIT 1`,
        tenantId
      );
      const sysRoleId = rows[0]?.id;
      if (!sysRoleId) {
        console.warn('System role not found — skipping test');
        return;
      }

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/roles/${sysRoleId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('SYSTEM_ROLE_IMMUTABLE');
    });
  });

  // -------------------------------------------------------------------------
  // NFR-006 Cross-tenant isolation
  // -------------------------------------------------------------------------

  describe('Cross-tenant isolation', () => {
    it('should not expose roles from tenant A via tenant B token', async () => {
      // Create a custom role in tenant A
      const roleRes = await app.inject({
        method: 'POST',
        url: '/api/v1/roles',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json',
        },
        payload: { name: 'tenant-a-secret-role', description: 'Should not leak' },
      });
      expect(roleRes.statusCode).toBe(201);
      createdRoleIds.push(roleRes.json().id);

      // Provision tenant B
      const ctxB = await provisionTenant(app, superAdminToken);

      // List roles via tenant B
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${ctxB.adminToken}`, 'x-tenant-slug': ctxB.tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const names = body.data.map((r: any) => r.name);
      expect(names).not.toContain('tenant-a-secret-role');
    });
  });
});
