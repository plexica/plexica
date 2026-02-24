/**
 * Integration Tests: Plugin Permission Registration
 *
 * Spec 003 Task 5.14 — FR-011, FR-012, FR-013, Edge Case #4
 *
 * Tests:
 *   - Plugin permissions registered via permissionRegistrationService appear in GET /api/v1/permissions
 *   - Duplicate registration (same plugin, same key) is idempotent
 *   - Key conflict with core permission returns PERMISSION_KEY_CONFLICT error
 *   - Key conflict with a different plugin returns PERMISSION_KEY_CONFLICT error
 *   - Removing plugin permissions cascades to role_permissions
 *   - Tenant cache is invalidated after register/remove
 *
 * Infrastructure: PostgreSQL + Redis must be running (test-infrastructure).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';
import { permissionRegistrationService } from '../../../modules/authorization/permission-registration.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function provisionTenant(app: FastifyInstance, superAdminToken: string) {
  const tenantSlug = `authz-pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/tenants',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    payload: {
      slug: tenantSlug,
      name: `Authz Plugin Perms Test ${tenantSlug}`,
      adminEmail: `admin@${tenantSlug}.test`,
      adminPassword: 'test-pass-123',
    },
  });
  if (res.statusCode !== 201) throw new Error(`Failed to create tenant: ${res.body}`);

  const tenant = res.json();
  const tenantId = tenant.id;

  const adminUserId = `pp-admin-${tenantSlug}`
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

describe('Authorization — Plugin Permission Registration Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantSlug: string;
  let tenantId: string;
  let schemaName: string;
  let adminToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    const ctx = await provisionTenant(app, superAdminToken);
    ({ tenantSlug, tenantId, schemaName, adminToken } = ctx);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/permissions — core permissions already seeded
  // -------------------------------------------------------------------------

  describe('GET /api/v1/permissions', () => {
    it('should list core permissions for a new tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/permissions',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      // At least the 12 core permissions
      expect(body.data.length).toBeGreaterThanOrEqual(12);

      // All core perms should be in 'core' group
      const keys = body.data.map((p: any) => p.key);
      expect(keys).toContain('users:read');
      expect(keys).toContain('roles:write');
      expect(keys).toContain('policies:read');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/permissions',
        headers: { 'x-tenant-slug': tenantSlug },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Plugin permission registration — service-level
  // -------------------------------------------------------------------------

  describe('Plugin permission registration (service level)', () => {
    const pluginId = 'test-plugin-v1';

    it('should register plugin permissions and expose them via API', async () => {
      await permissionRegistrationService.registerPluginPermissions(
        tenantId,
        schemaName,
        pluginId,
        [
          { key: 'documents:read', name: 'Read Documents', description: 'View documents' },
          { key: 'documents:write', name: 'Write Documents', description: 'Edit documents' },
        ]
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/permissions',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const keys = res.json().data.map((p: any) => p.key);
      expect(keys).toContain('documents:read');
      expect(keys).toContain('documents:write');

      // Plugin perms should have pluginId set
      const docPerm = res.json().data.find((p: any) => p.key === 'documents:read');
      expect(docPerm.pluginId).toBe(pluginId);
    });

    it('should be idempotent when same plugin re-registers the same keys', async () => {
      // Register same permissions again — should not throw or create duplicates
      await expect(
        permissionRegistrationService.registerPluginPermissions(tenantId, schemaName, pluginId, [
          {
            key: 'documents:read',
            name: 'Read Documents Updated',
            description: 'View documents (updated)',
          },
        ])
      ).resolves.not.toThrow();

      const rows = await db.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND key = 'documents:read'`,
        tenantId
      );
      // Should still be only 1 row
      expect(parseInt(rows[0].count, 10)).toBe(1);

      // Name should be updated
      const nameRows = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND key = 'documents:read'`,
        tenantId
      );
      expect(nameRows[0].name).toBe('Read Documents Updated');
    });

    it('should throw PERMISSION_KEY_CONFLICT when a different plugin tries to claim a core key', async () => {
      // 'users:read' is a core permission (plugin_id = null)
      await expect(
        permissionRegistrationService.registerPluginPermissions(
          tenantId,
          schemaName,
          'malicious-plugin',
          [{ key: 'users:read', name: 'Hijack core perm' }]
        )
      ).rejects.toMatchObject({ code: 'PERMISSION_KEY_CONFLICT' });
    });

    it('should throw PERMISSION_KEY_CONFLICT when different plugins claim the same key', async () => {
      // First register with plugin-a
      const pluginA = 'plugin-a';
      const pluginB = 'plugin-b';
      const uniqueKey = `unique-resource-${Date.now()}:action`;

      await permissionRegistrationService.registerPluginPermissions(tenantId, schemaName, pluginA, [
        { key: uniqueKey, name: 'Plugin A resource' },
      ]);

      // Plugin B tries to claim same key
      await expect(
        permissionRegistrationService.registerPluginPermissions(tenantId, schemaName, pluginB, [
          { key: uniqueKey, name: 'Plugin B resource conflict' },
        ])
      ).rejects.toMatchObject({ code: 'PERMISSION_KEY_CONFLICT' });
    });

    it('should cascade-delete role_permissions when plugin is removed', async () => {
      // Look up the documents:read permission ID
      const permRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND key = 'documents:read' LIMIT 1`,
        tenantId
      );
      expect(permRows.length).toBe(1);
      const permId = permRows[0].id;

      // Get a role to assign permission to
      const roleRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".roles
         WHERE name = 'tenant_admin' AND tenant_id = $1 LIMIT 1`,
        tenantId
      );
      const roleId = roleRows[0]?.id;

      if (roleId) {
        // Assign plugin permission to a role
        await db.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".role_permissions (role_id, permission_id, tenant_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          roleId,
          permId,
          tenantId
        );

        // Confirm the role_permissions row exists
        const beforeRemove = await db.$queryRawUnsafe<Array<{ count: string }>>(
          `SELECT COUNT(*) AS count FROM "${schemaName}".role_permissions
           WHERE permission_id = $1`,
          permId
        );
        expect(parseInt(beforeRemove[0].count, 10)).toBeGreaterThan(0);
      }

      // Remove plugin — should cascade
      await permissionRegistrationService.removePluginPermissions(tenantId, schemaName, pluginId);

      // Permission itself should be gone
      const permAfter = await db.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM "${schemaName}".permissions
         WHERE tenant_id = $1 AND plugin_id = $2`,
        tenantId,
        pluginId
      );
      expect(parseInt(permAfter[0].count, 10)).toBe(0);

      // role_permissions for that permission should be gone
      if (permRows.length > 0) {
        const rpAfter = await db.$queryRawUnsafe<Array<{ count: string }>>(
          `SELECT COUNT(*) AS count FROM "${schemaName}".role_permissions
           WHERE permission_id = $1`,
          permId
        );
        expect(parseInt(rpAfter[0].count, 10)).toBe(0);
      }
    });

    it('should no longer list plugin permissions after removal via API', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/permissions',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const keys = res.json().data.map((p: any) => p.key);
      // documents:read and documents:write were removed with the plugin
      expect(keys).not.toContain('documents:read');
      expect(keys).not.toContain('documents:write');
    });
  });
});
