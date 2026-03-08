/**
 * Integration tests for Workspace Resource Sharing API endpoints
 *
 * Tests the 3 resource sharing API routes via the full middleware stack:
 * - POST /api/workspaces/:workspaceId/resources/share
 * - GET /api/workspaces/:workspaceId/resources
 * - DELETE /api/workspaces/:workspaceId/resources/:resourceId
 *
 * Uses buildTestApp() so all middleware runs:
 * - authMiddleware (JWT validation)
 * - tenantContextMiddleware (sets request.tenant)
 * - workspaceGuard (verifies workspace belongs to tenant)
 * - workspaceRoleGuard (verifies caller has ADMIN role)
 *
 * Spec 009 Task 3: Cross-Workspace Resource Sharing
 * Constitution Art. 4.1 (Test Coverage ≥80%)
 * Constitution Art. 6.2 (Error Format)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

describe('Workspace Resource Sharing Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let adminUserId: string;
  let testTenantSlug: string;
  let testTenantId: string;
  let schemaName: string;
  let testWorkspaceId: string;
  /** A plugin seeded into core.plugins + core.tenant_plugins so the plugin guard passes */
  let seededPluginId: string;

  beforeAll(async () => {
    // ── Build full app ──────────────────────────────────────────────
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    // ── Create isolated tenant ──────────────────────────────────────
    testTenantSlug = `res-int-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;

    const tenantResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'Resource Integration Tenant',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (tenantResp.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResp.body}`);
    }

    testTenantId = tenantResp.json().id;

    // ── Seed a plugin in core.plugins + core.tenant_plugins ─────────
    // The workspace-resource service's plugin guard queries tenant_plugins
    // (Spec 004 table). Without a seeded row, sharing resourceType='plugin'
    // returns PLUGIN_NOT_FOUND (404). We insert minimal rows here so the
    // integration tests can exercise the happy-path for plugin shares.
    seededPluginId = uuidv4();
    await db.$executeRaw`
      INSERT INTO plugins (id, name, version, manifest, status, lifecycle_status, created_at, updated_at)
      VALUES (
        ${seededPluginId},
        ${'test-plugin-' + seededPluginId.substring(0, 8)},
        '1.0.0',
        '{"name":"test-plugin","version":"1.0.0"}'::jsonb,
        'PUBLISHED',
        'ACTIVE',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await db.$executeRaw`
      INSERT INTO tenant_plugins ("tenantId", "pluginId", enabled, configuration, installed_at)
      VALUES (${testTenantId}, ${seededPluginId}, true, '{}'::jsonb, NOW())
      ON CONFLICT ("tenantId", "pluginId") DO NOTHING
    `;

    // ── Create mock admin token ─────────────────────────────────────
    // Use a deterministic UUID so the FK in workspace_members can be satisfied
    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: 'a1a1a1a1-1111-4111-a111-111111111111',
      email: `admin@${testTenantSlug}.test`,
      given_name: 'Resource',
      family_name: 'Admin',
    });

    const decoded = testContext.auth.decodeToken(adminToken);
    adminUserId = decoded.sub;

    // ── Insert admin user into tenant schema ─────────────────────────
    // Workspace service stores creatorId → FK into tenant's users table
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      adminUserId,
      adminUserId,
      `admin@${testTenantSlug}.test`,
      'Resource',
      'Admin'
    );

    // ── Create workspace with sharing ENABLED via API ────────────────
    const wsResp = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-slug': testTenantSlug,
        'content-type': 'application/json',
      },
      payload: {
        name: 'Resource Test Workspace',
        slug: 'resource-test-ws',
        settings: { allowCrossWorkspaceSharing: true },
      },
    });

    if (wsResp.statusCode !== 201) {
      throw new Error(`Failed to create workspace: ${wsResp.body}`);
    }

    testWorkspaceId = wsResp.json().id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/workspaces/:workspaceId/resources/share
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/workspaces/:workspaceId/resources/share', () => {
    it('should share a resource with workspace (201)', async () => {
      // Arrange — use the seeded plugin ID so the plugin guard passes
      const resourceId = seededPluginId;

      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          resourceType: 'plugin',
          resourceId,
        },
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = response.json();
      // Service now maps to camelCase — all schema fields must be present
      expect(body).toHaveProperty('id');
      expect(typeof body.id).toBe('string');
      expect(body.workspaceId).toBe(testWorkspaceId);
      expect(body.resourceType).toBe('plugin');
      expect(body.resourceId).toBe(resourceId);
      expect(typeof body.createdAt).toBe('string');
    });

    it('should return 403 when cross-workspace sharing is disabled', async () => {
      // Arrange: update workspace settings to disable sharing directly in DB
      await db.$executeRawUnsafe(
        `UPDATE "${schemaName}"."workspaces"
         SET settings = $1::jsonb
         WHERE id = $2`,
        JSON.stringify({ allowCrossWorkspaceSharing: false }),
        testWorkspaceId
      );

      const resourceId = uuidv4();

      // Act
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { resourceType: 'plugin', resourceId },
      });

      // Assert
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('SHARING_DISABLED');

      // Restore sharing for subsequent tests
      await db.$executeRawUnsafe(
        `UPDATE "${schemaName}"."workspaces"
         SET settings = $1::jsonb
         WHERE id = $2`,
        JSON.stringify({ allowCrossWorkspaceSharing: true }),
        testWorkspaceId
      );
    });

    it('should return 409 when resource is already shared (duplicate)', async () => {
      // Arrange: share once
      const resourceId = uuidv4();
      const firstResp = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { resourceType: 'dataset', resourceId },
      });
      expect(firstResp.statusCode).toBe(201);

      // Act: share same resource again
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { resourceType: 'dataset', resourceId },
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('RESOURCE_ALREADY_SHARED');
      expect(body.error.message).toContain('already shared');
    });

    it('should return 400 when request body is invalid', async () => {
      // Arrange: empty resourceType and non-UUID resourceId fail schema validation
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          resourceType: '', // violates minLength: 1
          resourceId: 'not-a-uuid', // violates format: uuid
        },
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/workspaces/:workspaceId/resources
  // ────────────────────────────────────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/resources', () => {
    let sharedResourceIds: string[];

    beforeAll(async () => {
      // Pre-share 3 resources for the list tests.
      // Use distinct resource types with fresh UUIDs (seededPluginId already
      // shared in the POST test above, so we avoid duplicate-share errors here).
      sharedResourceIds = [uuidv4(), uuidv4(), uuidv4()];
      const types = ['template', 'dataset', 'dataset'];

      for (let i = 0; i < 3; i++) {
        const r = await app.inject({
          method: 'POST',
          url: `/api/workspaces/${testWorkspaceId}/resources/share`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            'x-tenant-slug': testTenantSlug,
            'content-type': 'application/json',
          },
          payload: { resourceType: types[i], resourceId: sharedResourceIds[i] },
        });
        if (r.statusCode !== 201) {
          throw new Error(`Failed to pre-share resource ${i}: ${r.body}`);
        }
      }
    });

    it('should list shared resources with default pagination (200)', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      // At least 3 resources (may be more from prior test sharing)
      expect(body.data.length).toBeGreaterThanOrEqual(3);
      expect(body).toHaveProperty('pagination');
      expect(body.pagination.limit).toBe(50);
      expect(body.pagination.offset).toBe(0);
      expect(typeof body.pagination.total).toBe('number');
      expect(typeof body.pagination.hasMore).toBe('boolean');
    });

    it('should filter resources by resourceType query parameter (200)', async () => {
      // Act: filter to only 'template' type
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources?resourceType=template`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      // All returned items must have camelCase fields per response schema
      body.data.forEach(
        (item: {
          id: string;
          workspaceId: string;
          resourceType: string;
          resourceId: string;
          createdAt: string;
        }) => {
          expect(typeof item.id).toBe('string');
          expect(item.workspaceId).toBe(testWorkspaceId);
          expect(typeof item.resourceType).toBe('string');
          expect(typeof item.resourceId).toBe('string');
          expect(typeof item.createdAt).toBe('string');
        }
      );
    });

    it('should support pagination with limit and offset (200)', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${testWorkspaceId}/resources?limit=2&offset=0`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.offset).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /api/workspaces/:workspaceId/resources/:resourceId
  // ────────────────────────────────────────────────────────────────

  describe('DELETE /api/workspaces/:workspaceId/resources/:resourceId', () => {
    it('should unshare a resource from workspace (204)', async () => {
      // Arrange: share a fresh dataset resource then unshare it
      // (seededPluginId is already shared from the POST test above)
      const resourceId = uuidv4();
      const shareResp = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/resources/share`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { resourceType: 'dataset', resourceId },
      });
      expect(shareResp.statusCode).toBe(201);
      const resourceLinkId = shareResp.json().id;

      // Act
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${testWorkspaceId}/resources/${resourceLinkId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Assert
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify resource is gone — a second DELETE should return 404
      const verifyResp = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${testWorkspaceId}/resources/${resourceLinkId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });
      expect(verifyResp.statusCode).toBe(404);
    });

    it('should return 404 when resource link does not exist', async () => {
      // Arrange: non-existent resource link ID
      const nonExistentId = uuidv4();

      // Act
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${testWorkspaceId}/resources/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      // Assert
      // The service throws "Resource link not found: <id>"
      // mapServiceError matches /not found/i → WORKSPACE_NOT_FOUND (per error-formatter.ts line 125)
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('WORKSPACE_NOT_FOUND');
      expect(body.error.message).toContain('not found');
    });
  });
});
