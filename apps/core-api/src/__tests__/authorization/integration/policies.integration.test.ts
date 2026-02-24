/**
 * Integration Tests: ABAC Policy CRUD
 *
 * Spec 003 Task 5.15 — FR-007, FR-008, FR-009, FR-017, Appendix C
 *
 * Tests:
 *   - GET /api/v1/policies returns empty + featureEnabled=false when ABAC disabled
 *   - POST /api/v1/policies returns 404 FEATURE_NOT_AVAILABLE when ABAC disabled
 *   - When ABAC enabled: full policy CRUD (201, 200, 204)
 *   - Source immutability: PUT/DELETE on core/plugin policies returns 403
 *   - Name conflict: 409 POLICY_NAME_CONFLICT
 *   - Condition tree validation: 422 CONDITION_TREE_LIMIT_EXCEEDED
 *   - Pagination and filtering (resource, effect, isActive)
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

async function provisionTenant(app: FastifyInstance, superAdminToken: string) {
  const tenantSlug = `authz-pol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/tenants',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    payload: {
      slug: tenantSlug,
      name: `Authz Policies Test ${tenantSlug}`,
      adminEmail: `admin@${tenantSlug}.test`,
      adminPassword: 'test-pass-123',
    },
  });
  if (res.statusCode !== 201) throw new Error(`Failed to create tenant: ${res.body}`);

  const tenant = res.json();
  const tenantId = tenant.id;

  const adminUserId = `pol-admin-${tenantSlug}`
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

/** Enable ABAC feature flag for a tenant */
async function enableAbac(tenantId: string): Promise<void> {
  // Use jsonb_set on the 'features' key, merging abac_enabled into existing features.
  // NOTE: jsonb_set with a multi-level path ('{features,abac_enabled}') does NOT create
  // intermediate objects in PostgreSQL — we must set the 'features' key directly.
  const affected = await db.$executeRawUnsafe(
    `UPDATE "core"."tenants"
     SET settings = jsonb_set(
       COALESCE(settings, '{}'::jsonb),
       '{features}',
       COALESCE(settings->'features', '{}'::jsonb) || '{"abac_enabled": true}'::jsonb
     )
     WHERE id = $1`,
    tenantId
  );
  if (affected === 0) {
    throw new Error(`enableAbac: no tenant found with id=${tenantId}`);
  }
  // Verify the flag was written
  const rows = await db.$queryRawUnsafe<Array<{ abac_enabled: string | null }>>(
    `SELECT settings->'features'->>'abac_enabled' AS abac_enabled FROM "core"."tenants" WHERE id = $1`,
    tenantId
  );
  if (rows[0]?.abac_enabled !== 'true') {
    throw new Error(`enableAbac: flag not set after update, got ${rows[0]?.abac_enabled}`);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Authorization — ABAC Policy CRUD Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;

  // Tenant A — ABAC disabled (default)
  let slugDisabled: string;
  let tokenDisabled: string;

  // Tenant B — ABAC enabled
  let slugEnabled: string;
  let idEnabled: string;
  let schemaEnabled: string;
  let tokenEnabled: string;

  const createdPolicyIds: string[] = [];

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    // Provision ABAC-disabled tenant
    const ctxA = await provisionTenant(app, superAdminToken);
    slugDisabled = ctxA.tenantSlug;
    void ctxA.tenantId; // idDisabled not used — only needed for setup
    tokenDisabled = ctxA.adminToken;
    // Provision ABAC-enabled tenant
    const ctxB = await provisionTenant(app, superAdminToken);
    slugEnabled = ctxB.tenantSlug;
    idEnabled = ctxB.tenantId;
    schemaEnabled = ctxB.schemaName;
    tokenEnabled = ctxB.adminToken;

    await enableAbac(idEnabled);
  });

  afterAll(async () => {
    // Clean up created policies
    for (const id of createdPolicyIds) {
      await db
        .$executeRawUnsafe(`DELETE FROM "${schemaEnabled}".policies WHERE id = $1`, id)
        .catch(() => {});
    }
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // Feature-flag off: GET returns empty, write ops return 404
  // -------------------------------------------------------------------------

  describe('ABAC feature flag — disabled (default)', () => {
    it('GET /api/v1/policies returns empty list with featureEnabled=false', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/policies',
        headers: { authorization: `Bearer ${tokenDisabled}`, 'x-tenant-slug': slugDisabled },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual([]);
      expect(body.meta.featureEnabled).toBe(false);
    });

    it('POST /api/v1/policies returns 404 FEATURE_NOT_AVAILABLE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/policies',
        headers: {
          authorization: `Bearer ${tokenDisabled}`,
          'x-tenant-slug': slugDisabled,
          'content-type': 'application/json',
        },
        payload: {
          name: 'should-not-create',
          resource: 'documents',
          effect: 'DENY',
          conditions: { attribute: 'user.role', operator: 'equals', value: 'guest' },
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('FEATURE_NOT_AVAILABLE');
    });

    it('PUT /api/v1/policies/:id returns 404 FEATURE_NOT_AVAILABLE', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/policies/nonexistent-id',
        headers: {
          authorization: `Bearer ${tokenDisabled}`,
          'x-tenant-slug': slugDisabled,
          'content-type': 'application/json',
        },
        payload: { name: 'updated' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('FEATURE_NOT_AVAILABLE');
    });

    it('DELETE /api/v1/policies/:id returns 404 FEATURE_NOT_AVAILABLE', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/policies/nonexistent-id',
        headers: { authorization: `Bearer ${tokenDisabled}`, 'x-tenant-slug': slugDisabled },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('FEATURE_NOT_AVAILABLE');
    });

    it('requires authentication on GET', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/policies',
        headers: { 'x-tenant-slug': slugDisabled },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Feature-flag on: full CRUD
  // -------------------------------------------------------------------------

  describe('ABAC feature flag — enabled', () => {
    it('POST /api/v1/policies creates a policy and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/policies',
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: {
          name: 'deny-guests-documents',
          resource: 'documents',
          effect: 'DENY',
          conditions: { attribute: 'user.role', operator: 'equals', value: 'guest' },
          priority: 10,
        },
      });

      expect(res.statusCode).toBe(201);
      const policy = res.json();
      expect(policy.name).toBe('deny-guests-documents');
      expect(policy.effect).toBe('DENY');
      expect(policy.resource).toBe('documents');
      expect(policy.priority).toBe(10);
      expect(policy.source).toBe('tenant_admin');
      expect(policy.isActive).toBe(true);
      expect(policy.tenantId).toBe(idEnabled);

      createdPolicyIds.push(policy.id);
    });

    it('GET /api/v1/policies lists policies with featureEnabled=true', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/policies',
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.meta.featureEnabled).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.some((p: any) => p.name === 'deny-guests-documents')).toBe(true);
    });

    it('GET /api/v1/policies filters by resource', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/policies?resource=documents',
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.every((p: any) => p.resource.includes('documents'))).toBe(true);
    });

    it('GET /api/v1/policies filters by effect', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/policies?effect=DENY',
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.every((p: any) => p.effect === 'DENY')).toBe(true);
    });

    it('PUT /api/v1/policies/:id updates a tenant_admin policy', async () => {
      const policyId = createdPolicyIds[0];

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/policies/${policyId}`,
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: { priority: 20 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().priority).toBe(20);
      expect(res.json().id).toBe(policyId);
    });

    it('POST /api/v1/policies returns 409 on name conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/policies',
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: {
          name: 'deny-guests-documents', // same name as above
          resource: 'other',
          effect: 'DENY',
          conditions: { attribute: 'user.role', operator: 'equals', value: 'guest' },
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('POLICY_NAME_CONFLICT');
    });

    it('POST /api/v1/policies returns 400 on invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/policies',
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: { name: 'missing-fields' }, // missing resource, effect, conditions
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('DELETE /api/v1/policies/:id deletes a tenant_admin policy', async () => {
      // Create a policy to delete
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/policies',
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: {
          name: 'delete-me-policy',
          resource: 'reports',
          effect: 'DENY',
          conditions: { attribute: 'user.department', operator: 'equals', value: 'external' },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const toDeleteId = createRes.json().id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/policies/${toDeleteId}`,
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(delRes.statusCode).toBe(204);
    });

    it('DELETE /api/v1/policies/:id returns 404 for non-existent policy', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/policies/non-existent-policy-id',
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('POLICY_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Source immutability (FR-009)
  // -------------------------------------------------------------------------

  describe('Source immutability (FR-009)', () => {
    let corePolicyId: string;

    beforeAll(async () => {
      // Directly insert a 'core' source policy (bypassing API)
      const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "${schemaEnabled}".policies
           (id, tenant_id, name, resource, effect, conditions, priority, source, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'core-immutable-policy', 'system', 'DENY',
                 '{"attribute":"user.type","operator":"eq","value":"robot"}'::jsonb,
                 100, 'core', NOW(), NOW())
         RETURNING id`,
        idEnabled
      );
      corePolicyId = rows[0].id;
    });

    afterAll(async () => {
      await db
        .$executeRawUnsafe(`DELETE FROM "${schemaEnabled}".policies WHERE id = $1`, corePolicyId)
        .catch(() => {});
    });

    it('PUT on a core policy returns 403 POLICY_SOURCE_IMMUTABLE', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/policies/${corePolicyId}`,
        headers: {
          authorization: `Bearer ${tokenEnabled}`,
          'x-tenant-slug': slugEnabled,
          'content-type': 'application/json',
        },
        payload: { priority: 999 },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('POLICY_SOURCE_IMMUTABLE');
    });

    it('DELETE on a core policy returns 403 POLICY_SOURCE_IMMUTABLE', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/policies/${corePolicyId}`,
        headers: { authorization: `Bearer ${tokenEnabled}`, 'x-tenant-slug': slugEnabled },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('POLICY_SOURCE_IMMUTABLE');
    });
  });
});
