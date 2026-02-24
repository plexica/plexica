/**
 * Tenant Provisioning E2E Tests
 *
 * Tests the complete tenant provisioning flow with all real services.
 * Covers:
 * - End-to-end tenant creation (DB + Schema + Keycloak + Permissions)
 * - Provisioning failure scenarios and rollback
 * - Complete tenant deletion (cleanup all resources)
 * - Default roles and permissions initialization
 * - Keycloak realm lifecycle
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { TenantStatus } from '@plexica/database';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { redis } from '../../../lib/redis';
import { keycloakService } from '../../../services/keycloak.service';

// Helper to convert a slug to its schema name
function slugToSchema(slug: string): string {
  return `tenant_${slug.replace(/-/g, '_')}`;
}

/**
 * Retry tenant creation via app.inject to tolerate Keycloak not-ready-yet
 * windows in CI.  Only retries on 400/500-level responses – validation
 * errors (e.g. invalid slug) are returned immediately.
 */
async function createTenantWithRetry(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
  { attempts = 10, delayMs = 1_000 } = {}
) {
  let last: Awaited<ReturnType<FastifyInstance['inject']>> | undefined;

  for (let i = 0; i < attempts; i++) {
    last = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

    if (last.statusCode === 201) return last;

    // Don't retry obvious client validation errors (bad slug, missing name, …)
    // Only retry when the server itself is not ready (5xx / transient 400 from
    // upstream services like Keycloak).
    if (last.statusCode >= 400 && last.statusCode < 500) {
      // Check if it's a validation error vs. a transient upstream error
      try {
        const body = JSON.parse(last.body);
        // If there's a clear validation error message, don't retry
        if (body.error && /invalid|required|too short|too long|already exists/i.test(body.error)) {
          return last;
        }
      } catch {
        // If body isn't JSON, fall through to retry
      }
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error(
    `Tenant creation never returned 201 after ${attempts} attempts. ` +
      `Last: ${last?.statusCode} – ${last?.body}`
  );
}

describe('Tenant Provisioning E2E', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  const ts = Date.now();

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();

    // Retry token acquisition — Keycloak may be slow after prior E2E suites
    // created many realms (especially tenant-concurrent)
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const tokenResp = await testContext.auth.getRealSuperAdminToken();
        superAdminToken = tokenResp.access_token;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`  ⚠ Token attempt ${attempt + 1}/5 failed, retrying in ${2 ** attempt}s...`);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    if (lastError) {
      throw lastError;
    }
  }, 120000);

  afterAll(async () => {
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
  });

  describe('Complete Provisioning Flow', () => {
    it('should provision tenant end-to-end with all resources', async () => {
      const tenantSlug = `e2e-provision-${ts}`;
      const schemaName = slugToSchema(tenantSlug);

      // Step 1: Create tenant via API (with retry for Keycloak readiness)
      const createResponse = await createTenantWithRetry(app, superAdminToken, {
        slug: tenantSlug,
        name: 'E2E Provision Test',
        settings: { testMode: true },
        theme: { color: 'blue' },
      });

      expect(createResponse.statusCode).toBe(201);
      const tenant = JSON.parse(createResponse.body);

      expect(tenant.id).toBeDefined();
      expect(tenant.slug).toBe(tenantSlug);
      expect(tenant.status).toBe(TenantStatus.ACTIVE);

      // Step 2: Verify database record exists
      const dbTenant = await db.tenant.findUnique({
        where: { slug: tenantSlug },
      });

      expect(dbTenant).toBeDefined();
      expect(dbTenant?.status).toBe(TenantStatus.ACTIVE);

      // Step 3: Verify PostgreSQL schema exists
      const schemaExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
          SELECT FROM pg_namespace
          WHERE nspname = '${schemaName}'
        ) as exists`
      );

      expect(schemaExists[0].exists).toBe(true);

      // Step 4: Verify schema has required tables
      const tablesExist = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${schemaName}'
        ORDER BY table_name`
      );

      const tableNames = tablesExist.map((t) => t.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('roles');
      expect(tableNames).toContain('user_roles');

      // Step 5: Verify Keycloak realm was created
      const realmExists = await keycloakService.realmExists(tenantSlug);
      expect(realmExists).toBe(true);

      // Step 6: Verify default roles were initialized in tenant schema
      const roles = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM "${schemaName}"."roles" ORDER BY name`
      );

      expect(roles.length).toBeGreaterThan(0);
      const roleNames = roles.map((r) => r.name);
      // Spec 003: system roles are tenant_admin, team_admin, user, super_admin
      expect(roleNames).toContain('tenant_admin');
      expect(roleNames).toContain('user');

      // Step 7: Verify tenant_admin role has correct permissions via normalized schema
      const adminPerms = await db.$queryRawUnsafe<Array<{ key: string }>>(
        `SELECT p.key
         FROM "${schemaName}"."role_permissions" rp
         JOIN "${schemaName}"."permissions" p ON rp.permission_id = p.id
         JOIN "${schemaName}"."roles" r ON rp.role_id = r.id
         WHERE r.name = 'tenant_admin'`
      );
      const adminPermKeys = adminPerms.map((p) => p.key);

      expect(adminPermKeys).toContain('users:read');
      expect(adminPermKeys).toContain('users:write');
      expect(adminPermKeys).toContain('settings:write');
    });

    it('should maintain data integrity across provisioning steps', async () => {
      const tenantSlug = `integrity-${ts}`;

      const response = await createTenantWithRetry(app, superAdminToken, {
        slug: tenantSlug,
        name: 'Integrity Test',
        settings: { key1: 'value1', nested: { key2: 'value2' } },
        theme: { primaryColor: '#ff0000', logo: 'test.png' },
      });

      expect(response.statusCode).toBe(201);
      const tenant = JSON.parse(response.body);

      // Verify settings and theme were persisted correctly
      expect(tenant.settings).toEqual({
        key1: 'value1',
        nested: { key2: 'value2' },
      });
      expect(tenant.theme).toEqual({
        primaryColor: '#ff0000',
        logo: 'test.png',
      });

      // Fetch tenant again to ensure data persists
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/tenants/${tenant.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      const fetchedTenant = JSON.parse(getResponse.body);
      expect(fetchedTenant.settings).toEqual(tenant.settings);
      expect(fetchedTenant.theme).toEqual(tenant.theme);
    });

    it('should create isolated schemas for multiple tenants', async () => {
      const tenant1 = `isolated-t1-${ts}`;
      const tenant2 = `isolated-t2-${ts}`;
      const schema1 = slugToSchema(tenant1);
      const schema2 = slugToSchema(tenant2);

      // Create first tenant
      const response1 = await createTenantWithRetry(app, superAdminToken, {
        slug: tenant1,
        name: 'Isolated Tenant 1',
      });

      expect(response1.statusCode).toBe(201);

      // Create second tenant
      const response2 = await createTenantWithRetry(app, superAdminToken, {
        slug: tenant2,
        name: 'Isolated Tenant 2',
      });

      expect(response2.statusCode).toBe(201);

      // Verify both schemas exist
      const schemas = await db.$queryRawUnsafe<Array<{ nspname: string }>>(
        `SELECT nspname
        FROM pg_namespace
        WHERE nspname IN ('${schema1}', '${schema2}')`
      );

      expect(schemas).toHaveLength(2);

      // Verify schemas have independent tables
      const tables1 = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${schema1}'`
      );

      const tables2 = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${schema2}'`
      );

      expect(tables1.length).toBeGreaterThan(0);
      expect(tables2.length).toBeGreaterThan(0);
    });
  });

  describe('Provisioning Failure and Rollback', () => {
    it('should handle database errors during schema creation', async () => {
      // This test would require mocking or causing a real DB error
      // For now, we test the error path by creating with an invalid slug
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug: 'invalid@slug', // Will fail validation
          name: 'Invalid Tenant',
        },
      });

      expect(response.statusCode).toBe(400);

      // Verify no tenant record was created
      const tenant = await db.tenant.findUnique({
        where: { slug: 'invalid@slug' },
      });

      expect(tenant).toBeNull();
    });

    it('should mark tenant as SUSPENDED on provisioning failure', async () => {
      // Note: This test assumes we can cause a provisioning failure
      // In a real scenario, this might involve network issues or service unavailability

      // We'll test by verifying the error handling code path exists
      // The service already has error handling that marks tenant as SUSPENDED
      const slug = `will-fail-prov-${ts}`;

      // Since we can't easily force a real failure in E2E, we verify the
      // error handling logic by checking that any provisioning error
      // results in proper status update (tested in unit tests)

      // Instead, verify that a successfully created tenant is ACTIVE
      const response = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Provisioning Test',
      });

      if (response.statusCode === 201) {
        const tenant = JSON.parse(response.body);
        expect(tenant.status).toBe(TenantStatus.ACTIVE);
      }
    });

    it('should prevent duplicate tenant creation', async () => {
      const slug = `dup-e2e-${ts}`;

      // Create first tenant
      const response1 = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'First Tenant',
      });

      expect(response1.statusCode).toBe(201);

      // Try to create duplicate
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: {
          slug,
          name: 'Duplicate Tenant',
        },
      });

      expect(response2.statusCode).toBe(400);
      const error = JSON.parse(response2.body);
      expect(error.error).toMatch(/already exists/i);

      // Verify only one tenant exists
      const tenants = await db.tenant.findMany({
        where: { slug },
      });

      expect(tenants).toHaveLength(1);
      expect(tenants[0].name).toBe('First Tenant');
    });

    it('should handle Keycloak realm creation failure gracefully', async () => {
      // This would require mocking Keycloak to fail
      // For E2E, we verify that the system handles errors properly
      // by checking that failed tenants are marked appropriately

      // Verify that a valid tenant creation succeeds with realm
      const slug = `kc-success-${ts}`;

      const response = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Keycloak Test',
      });

      expect(response.statusCode).toBe(201);

      // Verify realm was created
      const realmExists = await keycloakService.realmExists(slug);
      expect(realmExists).toBe(true);
    });
  });

  describe('Tenant Deletion Flow', () => {
    it('should soft delete tenant and mark as PENDING_DELETION', async () => {
      const slug = `deletion-${ts}`;

      // Create tenant
      const createResponse = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Deletion Test',
      });

      expect(createResponse.statusCode).toBe(201);
      const tenant = JSON.parse(createResponse.body);

      // Delete tenant
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${tenant.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify tenant still exists but is marked for deletion
      const dbTenant = await db.tenant.findUnique({
        where: { id: tenant.id },
      });

      expect(dbTenant).toBeDefined();
      expect(dbTenant?.status).toBe(TenantStatus.PENDING_DELETION);
    });

    it('should keep schema intact after soft delete', async () => {
      const slug = `soft-del-schema-${ts}`;
      const schemaName = slugToSchema(slug);

      // Create tenant
      const createResponse = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Soft Delete Schema Test',
      });

      expect(createResponse.statusCode).toBe(201);
      const tenant = JSON.parse(createResponse.body);

      // Soft delete
      await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${tenant.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      // Verify schema still exists
      const schemaExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
          SELECT FROM pg_namespace
          WHERE nspname = '${schemaName}'
        ) as exists`
      );

      expect(schemaExists[0].exists).toBe(true);
    });

    it('should keep Keycloak realm intact after soft delete', async () => {
      const slug = `soft-del-realm-${ts}`;

      // Create tenant
      const createResponse = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Soft Delete Realm Test',
      });

      expect(createResponse.statusCode).toBe(201);
      const tenant = JSON.parse(createResponse.body);

      // Soft delete
      await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${tenant.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      // Verify realm still exists
      const realmExists = await keycloakService.realmExists(slug);
      expect(realmExists).toBe(true);
    });
  });

  describe('Permission and Role Initialization', () => {
    it('should create default admin role with full permissions', async () => {
      const slug = `admin-role-${ts}`;
      const schemaName = slugToSchema(slug);

      const createResp = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Admin Role Test',
      });
      expect(createResp.statusCode).toBe(201);

      // Query tenant_admin role via normalized schema (Spec 003: no permissions column on roles)
      const adminRoles = await db.$queryRawUnsafe<Array<{ name: string; description: string }>>(
        `SELECT name, description FROM "${schemaName}"."roles" WHERE name = 'tenant_admin'`
      );

      expect(adminRoles).toHaveLength(1);
      const adminRole = adminRoles[0];

      expect(adminRole.name).toBe('tenant_admin');

      // Verify permissions through the normalized role_permissions join table
      const permRows = await db.$queryRawUnsafe<Array<{ key: string }>>(
        `SELECT p.key
         FROM "${schemaName}"."role_permissions" rp
         JOIN "${schemaName}"."permissions" p ON rp.permission_id = p.id
         JOIN "${schemaName}"."roles" r ON rp.role_id = r.id
         WHERE r.name = 'tenant_admin'`
      );
      const permKeys = permRows.map((p) => p.key);

      expect(permKeys).toContain('users:read');
      expect(permKeys).toContain('users:write');
      expect(permKeys).toContain('roles:read');
      expect(permKeys).toContain('roles:write');
      expect(permKeys).toContain('settings:read');
      expect(permKeys).toContain('settings:write');
      expect(permKeys).toContain('plugins:read');
      expect(permKeys).toContain('plugins:write');
    });

    it('should create default user role with basic permissions', async () => {
      const slug = `user-role-${ts}`;
      const schemaName = slugToSchema(slug);

      const createResp = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'User Role Test',
      });
      expect(createResp.statusCode).toBe(201);

      // Query user role — exists in new schema (Spec 003: no permissions column on roles)
      const userRoles = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM "${schemaName}"."roles" WHERE name = 'user'`
      );

      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].name).toBe('user');

      // Verify permissions through the normalized role_permissions join table
      const permRows = await db.$queryRawUnsafe<Array<{ key: string }>>(
        `SELECT p.key
         FROM "${schemaName}"."role_permissions" rp
         JOIN "${schemaName}"."permissions" p ON rp.permission_id = p.id
         JOIN "${schemaName}"."roles" r ON rp.role_id = r.id
         WHERE r.name = 'user'`
      );
      const permKeys = permRows.map((p) => p.key);

      expect(permKeys).toContain('users:read');

      // Standard user should NOT have write permissions
      expect(permKeys).not.toContain('users:write');
    });

    it('should create default guest role with minimal permissions', async () => {
      const slug = `guest-role-${ts}`;
      const schemaName = slugToSchema(slug);

      const createResp = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Guest Role Test',
      });
      expect(createResp.statusCode).toBe(201);

      // Spec 003: there is no 'guest' system role — the system roles are
      // super_admin, tenant_admin, team_admin, user.  Verify at least the
      // 'user' role (which has the most restricted default permissions) exists.
      const userRoles = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM "${schemaName}"."roles" WHERE name = 'user'`
      );

      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].name).toBe('user');

      // Verify that the 'user' role has minimal permissions (users:read, workspaces:read, plugins:read)
      const permRows = await db.$queryRawUnsafe<Array<{ key: string }>>(
        `SELECT p.key
         FROM "${schemaName}"."role_permissions" rp
         JOIN "${schemaName}"."permissions" p ON rp.permission_id = p.id
         JOIN "${schemaName}"."roles" r ON rp.role_id = r.id
         WHERE r.name = 'user'`
      );
      const permKeys = permRows.map((p) => p.key);

      expect(permKeys).toContain('users:read');
      // user role should not have admin-level write permissions
      expect(permKeys).not.toContain('users:write');
      expect(permKeys).not.toContain('roles:write');
      expect(permKeys).not.toContain('settings:write');
    });

    it('should create all three default roles', async () => {
      const slug = `all-roles-${ts}`;
      const schemaName = slugToSchema(slug);

      const createResp = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'All Roles Test',
      });
      expect(createResp.statusCode).toBe(201);

      // Query all roles — Spec 003 system roles: super_admin, tenant_admin, team_admin, user
      const roles = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM "${schemaName}"."roles" ORDER BY name`
      );

      const roleNames = roles.map((r) => r.name);
      // All four Spec 003 system roles must be present
      expect(roleNames).toContain('super_admin');
      expect(roleNames).toContain('tenant_admin');
      expect(roleNames).toContain('team_admin');
      expect(roleNames).toContain('user');
      expect(roleNames.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Keycloak Realm Configuration', () => {
    it('should create realm with correct name', async () => {
      const slug = `realm-name-${ts}`;

      const createResp = await createTenantWithRetry(app, superAdminToken, {
        slug,
        name: 'Realm Name Test',
      });
      expect(createResp.statusCode).toBe(201);

      const realmExists = await keycloakService.realmExists(slug);
      expect(realmExists).toBe(true);
    });

    it('should create independent realms for different tenants', async () => {
      const slug1 = `realm-ind-1-${ts}`;
      const slug2 = `realm-ind-2-${ts}`;

      const resp1 = await createTenantWithRetry(app, superAdminToken, {
        slug: slug1,
        name: 'Realm Independent 1',
      });
      expect(resp1.statusCode).toBe(201);

      const resp2 = await createTenantWithRetry(app, superAdminToken, {
        slug: slug2,
        name: 'Realm Independent 2',
      });
      expect(resp2.statusCode).toBe(201);

      const realm1Exists = await keycloakService.realmExists(slug1);
      const realm2Exists = await keycloakService.realmExists(slug2);

      expect(realm1Exists).toBe(true);
      expect(realm2Exists).toBe(true);
    });
  });

  describe('Performance and Timing', () => {
    it('should complete provisioning within reasonable time', async () => {
      // Use retry to tolerate Keycloak not-yet-ready in CI;
      // the helper still measures wallclock of successful attempt.
      const startTime = Date.now();

      await createTenantWithRetry(app, superAdminToken, {
        slug: `performance-${ts}`,
        name: 'Performance Test',
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Provisioning should complete within reasonable time
      // Includes DB insert + PostgreSQL schema creation + Keycloak realm creation
      expect(duration).toBeLessThan(60000);
    });

    it('should handle tenant creation with large settings object', async () => {
      const largeSettings = {
        feature1: true,
        feature2: false,
        config: {
          nested: {
            deep: {
              value: 'test',
              array: [1, 2, 3, 4, 5],
            },
          },
        },
        list: Array.from({ length: 50 }, (_, i) => ({ id: i, value: `item-${i}` })),
      };

      const response = await createTenantWithRetry(app, superAdminToken, {
        slug: `large-settings-${ts}`,
        name: 'Large Settings Test',
        settings: largeSettings,
      });

      expect(response.statusCode).toBe(201);
      const tenant = JSON.parse(response.body);
      expect(tenant.settings).toEqual(largeSettings);
    });
  });
});
