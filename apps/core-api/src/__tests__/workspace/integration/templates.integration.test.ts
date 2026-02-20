/**
 * Integration Tests: Workspace Templates & Plugin Endpoints — Spec 011 Phase 2
 *
 * Tests the following endpoints against a real database:
 *   GET  /api/workspace-templates
 *   GET  /api/workspace-templates/:id
 *   POST   /api/workspaces/:workspaceId/plugins
 *   GET    /api/workspaces/:workspaceId/plugins
 *   PATCH  /api/workspaces/:workspaceId/plugins/:pluginId
 *   DELETE /api/workspaces/:workspaceId/plugins/:pluginId
 *
 * Pattern: buildTestApp() + testContext.auth.createMockToken()
 * (same approach as workspace-crud.integration.test.ts)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

describe('Workspace Templates & Plugin Endpoints Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let testTenantSlug: string;
  let schemaName: string;
  let workspaceId: string;

  // Track created workspaces for cleanup
  const createdWorkspaceIds: string[] = [];

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    testTenantSlug = `tmpl-intg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;

    // Create test tenant
    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'Templates Integration Tenant',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'Test1234!',
      },
    });

    if (tenantRes.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantRes.body}`);
    }

    const adminUserId = 'c3c3c3c3-3333-4333-c333-333333333333';

    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: adminUserId,
      email: `admin@${testTenantSlug}.test`,
      given_name: 'Templates',
      family_name: 'Admin',
    });

    // Ensure admin user exists in tenant schema
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      adminUserId,
      adminUserId,
      `admin@${testTenantSlug}.test`,
      'Templates',
      'Admin'
    );

    // Create a workspace for plugin endpoint tests
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-slug': testTenantSlug,
        'content-type': 'application/json',
      },
      payload: {
        slug: `tmpl-test-ws-${Date.now()}`,
        name: 'Templates Test Workspace',
      },
    });

    if (wsRes.statusCode !== 201) {
      throw new Error(`Failed to create test workspace: ${wsRes.body}`);
    }

    workspaceId = wsRes.json().id;
    createdWorkspaceIds.push(workspaceId);
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM "${schemaName}"."workspace_members" WHERE workspace_id = $1`,
          id
        );
        await db.$executeRawUnsafe(`DELETE FROM "${schemaName}"."workspaces" WHERE id = $1`, id);
      } catch {
        // ignore cleanup errors
      }
    }

    if (app) {
      await app.close();
    }
  });

  // ── GET /api/workspace-templates ──────────────────────────────────────────

  describe('GET /api/workspace-templates', () => {
    it('should return an empty array when no tenant plugins provide templates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspace-templates',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      // No tenant plugins → no templates available
      expect(body).toHaveLength(0);
    });

    it('should return 401 when no authorization token is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspace-templates',
        headers: { 'x-tenant-slug': testTenantSlug },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 when an invalid token is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspace-templates',
        headers: {
          authorization: 'Bearer invalid.token.value',
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── GET /api/workspace-templates/:id ─────────────────────────────────────

  describe('GET /api/workspace-templates/:id', () => {
    it('should return 404 for a non-existent template UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspace-templates/00000000-0000-4000-a000-000000000000',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      // Constitution Art. 6.2 error format
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });

    it('should return 401 when no authorization token is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspace-templates/00000000-0000-4000-a000-000000000001',
        headers: { 'x-tenant-slug': testTenantSlug },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── POST /api/workspaces/:workspaceId/plugins ─────────────────────────────

  describe('POST /api/workspaces/:workspaceId/plugins', () => {
    it('should return 400 when the plugin is not enabled at tenant level', async () => {
      // No tenant_plugins record exists for this plugin → PLUGIN_NOT_TENANT_ENABLED
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/plugins`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          pluginId: 'non-existent-plugin',
        },
      });

      // The service throws PLUGIN_NOT_TENANT_ENABLED → HTTP 400
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('PLUGIN_NOT_TENANT_ENABLED');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/plugins`,
        headers: { 'x-tenant-slug': testTenantSlug, 'content-type': 'application/json' },
        payload: { pluginId: 'some-plugin' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── GET /api/workspaces/:workspaceId/plugins ──────────────────────────────

  describe('GET /api/workspaces/:workspaceId/plugins', () => {
    it('should return an empty array when no plugins are configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/plugins`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });
  });

  // ── PATCH /api/workspaces/:workspaceId/plugins/:pluginId ──────────────────

  describe('PATCH /api/workspaces/:workspaceId/plugins/:pluginId', () => {
    it('should return 404 when the plugin is not configured for the workspace', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/plugins/non-existent-plugin`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { config: { key: 'value' } },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('WORKSPACE_PLUGIN_NOT_FOUND');
    });
  });

  // ── DELETE /api/workspaces/:workspaceId/plugins/:pluginId ─────────────────

  describe('DELETE /api/workspaces/:workspaceId/plugins/:pluginId', () => {
    it('should return 404 when the plugin is not configured for the workspace', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/plugins/non-existent-plugin`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('WORKSPACE_PLUGIN_NOT_FOUND');
    });
  });
});
