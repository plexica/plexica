/**
 * Plugin System E2E Tests — T004-26
 *
 * End-to-end test covering the complete plugin lifecycle critical path:
 *   US-001: Super-admin registers → installs → activates a plugin
 *   US-002: Tenant admin enables/disables a plugin for their tenant
 *   US-006: Health proxy returns 503 (PLUGIN_UNREACHABLE) with NullContainerAdapter
 *
 * Flow:
 *   1. Super-admin: register → install → enable (ACTIVE)
 *   2. Verify GET /api/v1/plugins shows lifecycleStatus: 'ACTIVE'
 *   3. Tenant admin: enable plugin for tenant → TenantPlugin.enabled = true
 *   4. Verify GET /api/v1/tenant/plugins includes plugin with enabled: true
 *   5. GET /api/v1/plugins/:id/health → 503 PLUGIN_UNREACHABLE (no real container)
 *   6. Tenant admin: disable → plugin still ACTIVE globally
 *   7. Super-admin: disable → plugin DISABLED; tenant list shows enabled: false
 *   8. Super-admin: uninstall → plugin UNINSTALLED; tenant list empty
 *
 * Uses buildTestApp() + real test database + mock JWT tokens.
 * CONTAINER_ADAPTER=null — no Docker required.
 *
 * Spec 004 Task T004-26.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { PluginLifecycleStatus } from '@plexica/database';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUGIN_ID = 'plugin-e2e-system';
const TENANT_SLUG = 'tenant-e2e-system';

const TEST_MANIFEST = {
  id: PLUGIN_ID,
  name: 'E2E System Test Plugin',
  version: '1.0.0',
  description: 'E2E test plugin covering the full system critical path',
  category: 'utility',
  metadata: {
    license: 'MIT',
    author: { name: 'e2e-author' },
    image: 'plexica/e2e-system:1.0.0',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure the global sentinel tenant row exists after a DB reset. */
async function ensureGlobalTenant() {
  await db.tenant.upsert({
    where: { id: '__global__' },
    update: {},
    create: {
      id: '__global__',
      slug: '__global__',
      name: 'Global Platform Tenant',
      status: 'ACTIVE',
    },
  });
}

/** Create a real tenant in the DB and return its id. */
async function createTenant(slug: string): Promise<string> {
  const tenant = await db.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: `Test Tenant ${slug}`,
      status: 'ACTIVE',
    },
  });
  return tenant.id;
}

/** Delete a plugin and all its TenantPlugin rows (best-effort). */
async function cleanupPlugin(pluginId: string) {
  try {
    await db.tenantPlugin.deleteMany({ where: { pluginId } });
  } catch {
    // not found — ignore
  }
  try {
    await db.plugin.delete({ where: { id: pluginId } });
  } catch {
    // not found — ignore
  }
}

/** Directly create a TenantPlugin row to simulate per-tenant install. */
async function createTenantInstallation(tenantId: string, pluginId: string, enabled = false) {
  await db.tenantPlugin.upsert({
    where: { tenantId_pluginId: { tenantId, pluginId } },
    update: {},
    create: {
      tenantId,
      pluginId,
      enabled,
      configuration: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Plugin System E2E (T004-26)', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;
  let tenantId: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    // Ensure __global__ sentinel tenant (FK constraint for platform-level installs)
    await ensureGlobalTenant();

    // Create a real tenant for tenant-admin operations
    tenantId = await createTenant(TENANT_SLUG);

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    tenantAdminToken = testContext.auth.createMockTenantAdminToken(TENANT_SLUG);
  });

  afterAll(async () => {
    await cleanupPlugin(PLUGIN_ID);
    if (app) await app.close();
  });

  // =========================================================================
  // Critical path: register → install → activate (super-admin)
  // =========================================================================

  describe('Step 1 — Super-admin: register plugin', () => {
    it('POST /api/v1/plugins registers the plugin → 200 with REGISTERED status', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/v1/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: TEST_MANIFEST,
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.id).toBe(PLUGIN_ID);
      expect(body.lifecycleStatus).toBe(PluginLifecycleStatus.REGISTERED);
    });
  });

  describe('Step 2 — Super-admin: install plugin', () => {
    it('POST /api/v1/plugins/:id/install transitions to INSTALLED → 200', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/plugins/${PLUGIN_ID}/install`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });

      expect(resp.statusCode).toBe(200);

      const plugin = await db.plugin.findUnique({ where: { id: PLUGIN_ID } });
      expect(plugin?.lifecycleStatus).toBe(PluginLifecycleStatus.INSTALLED);
    });
  });

  describe('Step 3 — Super-admin: activate plugin', () => {
    it('POST /api/v1/plugins/:id/enable transitions to ACTIVE → 200', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/plugins/${PLUGIN_ID}/enable`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);

      const plugin = await db.plugin.findUnique({ where: { id: PLUGIN_ID } });
      expect(plugin?.lifecycleStatus).toBe(PluginLifecycleStatus.ACTIVE);
    });

    it('GET /api/v1/plugins shows plugin with lifecycleStatus ACTIVE', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as { plugins: Array<{ id: string; lifecycleStatus: string }> };
      expect(Array.isArray(body.plugins)).toBe(true);
      const entry = body.plugins.find((p) => p.id === PLUGIN_ID);
      expect(entry).toBeDefined();
      expect(entry?.lifecycleStatus).toBe(PluginLifecycleStatus.ACTIVE);
    });
  });

  // =========================================================================
  // Critical path: tenant-admin enables plugin for their tenant
  // =========================================================================

  describe('Step 4 — Tenant admin: enable plugin for tenant', () => {
    it('POST /api/v1/tenant/plugins/:id/enable → 200; TenantPlugin.enabled = true', async () => {
      // Create the TenantPlugin installation row first (direct DB insert)
      await createTenantInstallation(tenantId, PLUGIN_ID, false);

      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/enable`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);

      const row = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId, pluginId: PLUGIN_ID } },
      });
      expect(row?.enabled).toBe(true);
    });

    it('GET /api/v1/tenant/plugins includes plugin with enabled: true', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as Array<{ pluginId: string; enabled: boolean }>;
      expect(Array.isArray(body)).toBe(true);
      const entry = body.find((p) => p.pluginId === PLUGIN_ID);
      expect(entry).toBeDefined();
      expect(entry?.enabled).toBe(true);
    });
  });

  // =========================================================================
  // Critical path: health proxy returns 503 (no real container)
  // =========================================================================

  describe('Step 5 — Plugin invocation (health proxy)', () => {
    it('GET /api/v1/plugins/:id/health → 503 PLUGIN_UNREACHABLE (NullContainerAdapter)', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: `/api/v1/plugins/${PLUGIN_ID}/health`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      // With CONTAINER_ADAPTER=null no real container runs; the health proxy
      // will try to connect to http://plugin-<id>:8080/health and fail with
      // a network error, resulting in 503 PLUGIN_UNREACHABLE.
      expect(resp.statusCode).toBe(503);
      const body = resp.json();
      expect(body.error.code).toBe('PLUGIN_UNREACHABLE');
    });
  });

  // =========================================================================
  // Disable scenarios
  // =========================================================================

  describe('Step 6 — Tenant admin: disable plugin', () => {
    it('POST /api/v1/tenant/plugins/:id/disable → 200; plugin still ACTIVE globally', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/disable`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);

      // TenantPlugin row: enabled = false
      const row = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId, pluginId: PLUGIN_ID } },
      });
      expect(row?.enabled).toBe(false);

      // Global plugin still ACTIVE
      const plugin = await db.plugin.findUnique({ where: { id: PLUGIN_ID } });
      expect(plugin?.lifecycleStatus).toBe(PluginLifecycleStatus.ACTIVE);
    });
  });

  describe('Step 7 — Super-admin: disable plugin globally', () => {
    it('POST /api/v1/plugins/:id/disable → 200; lifecycleStatus becomes DISABLED', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/plugins/${PLUGIN_ID}/disable`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);

      const plugin = await db.plugin.findUnique({ where: { id: PLUGIN_ID } });
      expect(plugin?.lifecycleStatus).toBe(PluginLifecycleStatus.DISABLED);
    });

    it('GET /api/v1/tenant/plugins still shows plugin (tenant record persists) with enabled: false', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as Array<{ pluginId: string; enabled: boolean }>;
      // The TenantPlugin row is preserved even when the global plugin is disabled
      const entry = body.find((p) => p.pluginId === PLUGIN_ID);
      expect(entry).toBeDefined();
      expect(entry?.enabled).toBe(false);
    });
  });

  // =========================================================================
  // Uninstall scenario
  // =========================================================================

  describe('Step 8 — Super-admin: uninstall plugin', () => {
    it('DELETE /api/v1/plugins/:id → 200; lifecycleStatus reverts to INSTALLED (per-tenant row still exists)', async () => {
      const resp = await app.inject({
        method: 'DELETE',
        url: `/api/v1/plugins/${PLUGIN_ID}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.success).toBe(true);

      const plugin = await db.plugin.findUnique({ where: { id: PLUGIN_ID } });
      expect(plugin?.lifecycleStatus).toBe(PluginLifecycleStatus.INSTALLED);
    });

    it('GET /api/v1/tenant/plugins: plugin entry has lifecycleStatus INSTALLED after uninstall (per-tenant row still exists)', async () => {
      // uninstallPlugin removes the __global__ TenantPlugin row only.
      // The per-tenant TenantPlugin row (created in Step 4) persists, so
      // remainingInstallations > 0 and the plugin reverts to INSTALLED.
      // getInstalledPlugins returns all TenantPlugin rows so the entry is still visible —
      // with lifecycleStatus: INSTALLED — reflecting the revert.
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as Array<{
        pluginId: string;
        plugin: { lifecycleStatus: string };
      }>;
      const entry = body.find((p) => p.pluginId === PLUGIN_ID);
      expect(entry).toBeDefined();
      expect(entry?.plugin.lifecycleStatus).toBe(PluginLifecycleStatus.INSTALLED);
    });
  });
});
