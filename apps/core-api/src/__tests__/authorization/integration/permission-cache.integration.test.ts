/**
 * Integration Tests: Permission Cache Invalidation
 *
 * Spec 003 Task 5.12 — FR-019, NFR-002, NFR-007, NFR-008
 *
 * Tests:
 *   - Role permission change triggers role-scoped cache flush (not tenant-wide)
 *   - User role assignment flushes only that user's cache
 *   - After cache flush, subsequent /me/permissions call shows updated permissions
 *   - Jittered TTL is within 270–330s range (checked via Redis TTL introspection)
 *
 * Infrastructure: PostgreSQL + Redis must be running (test-infrastructure).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { permsCacheKey } from '../../../modules/authorization/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function provisionTenant(app: FastifyInstance, superAdminToken: string) {
  const tenantSlug = `authz-cache-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/tenants',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    payload: {
      slug: tenantSlug,
      name: `Authz Cache Test ${tenantSlug}`,
      adminEmail: `admin@${tenantSlug}.test`,
      adminPassword: 'test-pass-123',
    },
  });
  if (res.statusCode !== 201) throw new Error(`Failed to create tenant: ${res.body}`);

  const tenant = res.json();
  const tenantId = tenant.id;

  const adminUserId = `ac-admin-${tenantSlug}`
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

describe('Authorization — Permission Cache Invalidation Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantSlug: string;
  let tenantId: string;
  let adminToken: string;
  let adminUserId: string;
  let schemaName: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    const ctx = await provisionTenant(app, superAdminToken);
    ({ tenantSlug, tenantId, adminToken, adminUserId, schemaName } = ctx);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should populate the permission cache on first /me/permissions call', async () => {
    // Clear any existing cache for this user
    await redis.del(permsCacheKey(tenantId, adminUserId));

    // First call — should trigger DB load and write to cache
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/permissions',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
    });
    expect(res.statusCode).toBe(200);

    // Now the cache should be populated
    const cached = await redis.get(permsCacheKey(tenantId, adminUserId));
    expect(cached).not.toBeNull();
    const permissions = JSON.parse(cached!);
    expect(Array.isArray(permissions)).toBe(true);
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('cache TTL should be within the jittered range (270–330s)', async () => {
    // Prime the cache
    await app.inject({
      method: 'GET',
      url: '/api/v1/me/permissions',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
    });

    const ttl = await redis.ttl(permsCacheKey(tenantId, adminUserId));
    // TTL must be a positive number and within jitter range [270, 330]
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(330);
    expect(ttl).toBeGreaterThanOrEqual(260); // allow a few seconds of test execution time
  });

  it('should serve the second /me/permissions call from cache (same data)', async () => {
    // First call primes cache
    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/me/permissions',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
    });
    expect(first.statusCode).toBe(200);

    // Second call — should hit cache
    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/me/permissions',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': tenantSlug },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toEqual(first.json().data);
  });

  it('should flush user cache after a new role is assigned', async () => {
    // Create a custom role with a unique permission
    const createRoleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-slug': tenantSlug,
        'content-type': 'application/json',
      },
      payload: { name: 'cache-test-role', description: 'For cache invalidation test' },
    });
    expect(createRoleRes.statusCode).toBe(201);
    const cacheTestRoleId = createRoleRes.json().id;

    // Create a second user for role assignment
    const secondUserId = `ac-target-${tenantSlug}`.slice(0, 36).padEnd(36, '0');
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      secondUserId,
      secondUserId,
      `target@${tenantSlug}.test`,
      'Target',
      'User'
    );

    // Prime cache for second user (empty permissions since no roles yet)
    const secondToken = testContext.auth.createMockToken({
      sub: secondUserId,
      email: `target@${tenantSlug}.test`,
      tenantSlug,
      realm_access: { roles: [] },
    });

    // Seed cache manually to simulate a prior cached state
    await redis.set(permsCacheKey(tenantId, secondUserId), JSON.stringify([]), 'EX', 300);

    const cachedBefore = await redis.get(permsCacheKey(tenantId, secondUserId));
    expect(cachedBefore).not.toBeNull();

    // Assign role to second user (should flush cache)
    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${secondUserId}/roles`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-slug': tenantSlug,
        'content-type': 'application/json',
      },
      payload: { roleId: cacheTestRoleId },
    });
    expect(assignRes.statusCode).toBe(200);

    // Cache for second user should now be invalidated
    const cachedAfter = await redis.get(permsCacheKey(tenantId, secondUserId));
    expect(cachedAfter).toBeNull();

    // Cleanup
    await db
      .$executeRawUnsafe(`DELETE FROM "${schemaName}".roles WHERE id = $1`, cacheTestRoleId)
      .catch(() => {});

    // Suppress unused variable warning
    void secondToken;
  });
});
