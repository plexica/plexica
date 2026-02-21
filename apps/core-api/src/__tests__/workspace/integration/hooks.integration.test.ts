/**
 * Integration Tests: Plugin Template Registration API — Spec 011 Phase 3 (T011-17)
 *
 * Tests the plugin template management endpoints with real database and auth:
 *   POST   /api/plugins/:pluginId/templates        → 201 (superadmin)
 *   POST   /api/plugins/:pluginId/templates        → 403 (non-superadmin)
 *   POST   /api/plugins/:pluginId/templates        → 400 (items > 50)
 *   POST   /api/plugins/:pluginId/templates        → 400 (Zod validation failure)
 *   PUT    /api/plugins/:pluginId/templates/:id    → 404 (template not found)
 *   PUT    /api/plugins/:pluginId/templates/:id    → 400 (plugin does not own)
 *   DELETE /api/plugins/:pluginId/templates/:id    → 204 (success)
 *   DELETE /api/plugins/:pluginId/templates/:id    → 400 (template not found)
 *
 * Uses buildTestApp() + mock tokens. DB cleaned up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

describe('Plugin Template Registration API Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;

  /** Plugin IDs used across tests — inserted as real rows in `plugins` table */
  const pluginIdA = 'hook-test-plugin-a';
  const pluginIdB = 'hook-test-plugin-b';

  /** Template IDs created during tests — collected for cleanup */
  const createdTemplateIds: string[] = [];

  // ---------------------------------------------------------------------------
  // Setup & teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    await testContext.resetAll();

    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    // Create a tenant for the non-superadmin token
    const tenantSlug = `hook-integ-${Date.now()}`;
    const tenantResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: tenantSlug,
        name: 'Hook Test Tenant',
        adminEmail: `admin@${tenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (tenantResp.statusCode !== 201) {
      throw new Error(`Failed to create tenant for hook integration tests: ${tenantResp.body}`);
    }

    tenantAdminToken = testContext.auth.createMockTenantAdminToken(tenantSlug, {
      sub: 'a1a1a1a1-1111-4111-a111-111111111111',
      email: `admin@${tenantSlug}.test`,
    });

    // Insert two minimal plugin rows so FK constraints are satisfied
    await db.$executeRawUnsafe(
      `INSERT INTO plugins (id, name, version, description, category, status, metadata, manifest, created_at, updated_at)
       VALUES ($1, $2, '1.0.0', 'Integration test plugin A', 'test', 'PUBLISHED', '{}', '{}', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      pluginIdA,
      'Hook Test Plugin A'
    );
    await db.$executeRawUnsafe(
      `INSERT INTO plugins (id, name, version, description, category, status, metadata, manifest, created_at, updated_at)
       VALUES ($1, $2, '1.0.0', 'Integration test plugin B', 'test', 'PUBLISHED', '{}', '{}', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      pluginIdB,
      'Hook Test Plugin B'
    );
  });

  afterAll(async () => {
    // Clean up templates created during tests
    for (const id of createdTemplateIds) {
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM workspace_template_items WHERE template_id = $1::uuid`,
          id
        );
        await db.$executeRawUnsafe(`DELETE FROM workspace_templates WHERE id = $1::uuid`, id);
      } catch {
        // ignore cleanup errors
      }
    }

    // Remove test plugins
    try {
      await db.$executeRawUnsafe(`DELETE FROM plugins WHERE id IN ($1, $2)`, pluginIdA, pluginIdB);
    } catch {
      // ignore
    }

    if (app) {
      await app.close();
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/plugins/:pluginId/templates
  // ---------------------------------------------------------------------------

  describe('POST /api/plugins/:pluginId/templates', () => {
    it('should create a template and return 201 when called by superadmin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'My Hook Integration Template',
          description: 'Created by integration test',
          isDefault: false,
          metadata: { source: 'integration-test' },
          items: [{ type: 'plugin', pluginId: pluginIdA, sortOrder: 0 }],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('My Hook Integration Template');
      expect(body.provided_by_plugin_id).toBe(pluginIdA);
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items).toHaveLength(1);

      createdTemplateIds.push(body.id);
    });

    it('should return 403 when called by a tenant admin (non-superadmin)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Should Not Be Created',
          isDefault: false,
          metadata: {},
          items: [],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 when items array exceeds 50 entries', async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        type: 'plugin' as const,
        pluginId: `over-limit-plugin-${i}`,
        sortOrder: i,
      }));

      const response = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Too Many Items',
          isDefault: false,
          metadata: {},
          items,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when body fails Zod validation (missing required name)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          // 'name' is required — omitting it triggers Zod error
          isDefault: false,
          metadata: {},
          items: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/plugins/:pluginId/templates/:templateId
  // ---------------------------------------------------------------------------

  describe('PUT /api/plugins/:pluginId/templates/:templateId', () => {
    it('should return 400 when template does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000099';

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plugins/${pluginIdA}/templates/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Renamed',
          isDefault: false,
          metadata: {},
          items: [],
        },
      });

      // Service throws TEMPLATE_NOT_FOUND → route returns 400
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when plugin does not own the template', async () => {
      // First create a template owned by pluginA
      const createResp = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Owned By Plugin A',
          isDefault: false,
          metadata: {},
          items: [],
        },
      });
      expect(createResp.statusCode).toBe(201);
      const template = createResp.json();
      createdTemplateIds.push(template.id);

      // Now try to update it as pluginB (not the owner)
      const updateResp = await app.inject({
        method: 'PUT',
        url: `/api/plugins/${pluginIdB}/templates/${template.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Stolen Update',
          isDefault: false,
          metadata: {},
          items: [],
        },
      });

      // Service throws INSUFFICIENT_PERMISSIONS → route returns 400
      expect(updateResp.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/plugins/:pluginId/templates/:templateId
  // ---------------------------------------------------------------------------

  describe('DELETE /api/plugins/:pluginId/templates/:templateId', () => {
    it('should delete an existing template and return 204', async () => {
      // Create a template to be deleted
      const createResp = await app.inject({
        method: 'POST',
        url: `/api/plugins/${pluginIdA}/templates`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'To Be Deleted',
          isDefault: false,
          metadata: {},
          items: [],
        },
      });
      expect(createResp.statusCode).toBe(201);
      const template = createResp.json();

      const deleteResp = await app.inject({
        method: 'DELETE',
        url: `/api/plugins/${pluginIdA}/templates/${template.id}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(deleteResp.statusCode).toBe(204);
    });

    it('should return 400 when template does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000098';

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plugins/${pluginIdA}/templates/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      // Service throws TEMPLATE_NOT_FOUND → route returns 400
      expect(response.statusCode).toBe(400);
    });
  });
});
