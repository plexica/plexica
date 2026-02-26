/**
 * Tenant Plugin Integration Tests — T004-25
 *
 * Integration tests for the tenant-admin v1 plugin management API:
 *   GET    /api/v1/tenant/plugins           — list installed plugins for tenant
 *   POST   /api/v1/tenant/plugins/:id/enable
 *   POST   /api/v1/tenant/plugins/:id/disable
 *   PUT    /api/v1/tenant/plugins/:id/config
 *
 * Uses buildTestApp() + real test database + mock tokens.
 * CONTAINER_ADAPTER=null so no Docker is required.
 *
 * Setup strategy:
 *   - Register + globally install + activate the plugin (global lifecycle)
 *   - Directly insert TenantPlugin rows in the DB for test tenants
 *     (installPlugin mutates global lifecycleStatus so cannot be called twice)
 *   - Test tenant isolation: token for tenant A cannot affect tenant B's plugins
 *
 * Spec 004 Task T004-25.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUGIN_ID = 'plugin-tenant-test';
const TENANT_A_SLUG = 'tenant-a-plugin-test';
const TENANT_B_SLUG = 'tenant-b-plugin-test';

const TEST_MANIFEST = {
  id: PLUGIN_ID,
  name: 'Tenant Integration Test Plugin',
  version: '1.0.0',
  description: 'Integration test plugin for tenant-level tests (≥10 chars)',
  category: 'utility',
  metadata: {
    license: 'MIT',
    author: { name: 'test-author' },
    image: 'plexica/tenant-test:1.0.0',
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

/** Delete a plugin and all its TenantPlugin rows. */
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

/** Register + globally install + activate the plugin via the API. */
async function setupGloballyActivePlugin(app: FastifyInstance, superAdminToken: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { authorization: `Bearer ${superAdminToken}` },
    payload: TEST_MANIFEST,
  });
  if (register.statusCode !== 200) {
    throw new Error(`Register failed (${register.statusCode}): ${register.body}`);
  }

  const install = await app.inject({
    method: 'POST',
    url: `/api/v1/plugins/${PLUGIN_ID}/install`,
    headers: { authorization: `Bearer ${superAdminToken}` },
    payload: {},
  });
  if (install.statusCode !== 200) {
    throw new Error(`Install failed (${install.statusCode}): ${install.body}`);
  }

  const activate = await app.inject({
    method: 'POST',
    url: `/api/v1/plugins/${PLUGIN_ID}/enable`,
    headers: { authorization: `Bearer ${superAdminToken}` },
  });
  if (activate.statusCode !== 200) {
    throw new Error(`Activate failed (${activate.statusCode}): ${activate.body}`);
  }
}

/** Directly create a TenantPlugin row for a tenant (simulates per-tenant install). */
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
// Test suite
// ---------------------------------------------------------------------------

describe('Tenant Plugin Integration (T004-25)', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAToken: string;
  let tenantBToken: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    // Ensure global platform tenant for FK constraint
    await ensureGlobalTenant();

    // Create two real tenants
    tenantAId = await createTenant(TENANT_A_SLUG);
    tenantBId = await createTenant(TENANT_B_SLUG);

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    tenantAToken = testContext.auth.createMockTenantAdminToken(TENANT_A_SLUG);
    tenantBToken = testContext.auth.createMockTenantAdminToken(TENANT_B_SLUG);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(async () => {
    await cleanupPlugin(PLUGIN_ID);
  });

  // =========================================================================
  // GET /api/v1/tenant/plugins — list
  // =========================================================================

  describe('GET /api/v1/tenant/plugins', () => {
    it('returns empty array when no plugins installed for tenant', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns 401 without auth', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
      });

      expect(resp.statusCode).toBe(401);
    });

    it('returns plugin list after tenant installation', async () => {
      // Setup: globally active plugin + tenant installation
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, false);

      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantAToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as Array<{ pluginId: string; enabled: boolean }>;
      expect(Array.isArray(body)).toBe(true);
      const entry = body.find((p) => p.pluginId === PLUGIN_ID);
      expect(entry).toBeDefined();
      expect(entry?.enabled).toBe(false);
    });

    it('tenant isolation: tenant B cannot see tenant A plugins', async () => {
      // Setup: globally active plugin + tenant A installation only
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, true);

      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/plugins',
        headers: { authorization: `Bearer ${tenantBToken}` },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json() as Array<{ pluginId: string }>;
      const entry = body.find((p) => p.pluginId === PLUGIN_ID);
      expect(entry).toBeUndefined();
    });
  });

  // =========================================================================
  // POST /api/v1/tenant/plugins/:id/enable
  // =========================================================================

  describe('POST /api/v1/tenant/plugins/:id/enable', () => {
    it('enables a globally-active plugin for the tenant → 200; enabled becomes true', async () => {
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, false);

      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/enable`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });

      expect(resp.statusCode).toBe(200);

      const row = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantAId, pluginId: PLUGIN_ID } },
      });
      expect(row?.enabled).toBe(true);
    });

    it('returns 409 when plugin is not globally ACTIVE (only INSTALLED)', async () => {
      // Register + install globally (NOT activated → INSTALLED state)
      await app.inject({
        method: 'POST',
        url: '/api/v1/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: TEST_MANIFEST,
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/plugins/${PLUGIN_ID}/install`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });
      // Plugin is now INSTALLED, not ACTIVE
      await createTenantInstallation(tenantAId, PLUGIN_ID, false);

      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/enable`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });

      expect(resp.statusCode).toBe(409);
      const body = resp.json();
      expect(body.error.code).toBe('PLUGIN_NOT_GLOBALLY_ACTIVE');
    });

    it('returns 401 without auth', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/enable`,
      });

      expect(resp.statusCode).toBe(401);
    });

    it('tenant isolation: tenant B enable does not affect tenant A', async () => {
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, false);
      await createTenantInstallation(tenantBId, PLUGIN_ID, false);

      // Tenant B enables their copy
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/enable`,
        headers: { authorization: `Bearer ${tenantBToken}` },
      });

      expect(resp.statusCode).toBe(200);

      // Tenant A's copy should still be disabled
      const rowA = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantAId, pluginId: PLUGIN_ID } },
      });
      expect(rowA?.enabled).toBe(false);

      // Tenant B's copy should be enabled
      const rowB = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantBId, pluginId: PLUGIN_ID } },
      });
      expect(rowB?.enabled).toBe(true);
    });
  });

  // =========================================================================
  // POST /api/v1/tenant/plugins/:id/disable
  // =========================================================================

  describe('POST /api/v1/tenant/plugins/:id/disable', () => {
    it('disables an enabled plugin for the tenant → 200; enabled becomes false', async () => {
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, true); // start enabled

      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/disable`,
        headers: { authorization: `Bearer ${tenantAToken}` },
      });

      expect(resp.statusCode).toBe(200);

      const row = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantAId, pluginId: PLUGIN_ID } },
      });
      expect(row?.enabled).toBe(false);
    });

    it('returns 401 without auth', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/disable`,
      });

      expect(resp.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // PUT /api/v1/tenant/plugins/:id/config
  // =========================================================================

  describe('PUT /api/v1/tenant/plugins/:id/config', () => {
    it('updates plugin configuration for the tenant → 200', async () => {
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, true);

      const newConfig = { debug: true, maxRetries: 3 };
      const resp = await app.inject({
        method: 'PUT',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/config`,
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: newConfig,
      });

      expect(resp.statusCode).toBe(200);

      const row = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantAId, pluginId: PLUGIN_ID } },
      });
      const config = row?.configuration as Record<string, unknown>;
      expect(config.debug).toBe(true);
      expect(config.maxRetries).toBe(3);
    });

    it('returns 401 without auth', async () => {
      const resp = await app.inject({
        method: 'PUT',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/config`,
        payload: {},
      });

      expect(resp.statusCode).toBe(401);
    });

    it('tenant isolation: tenant B config update does not affect tenant A config', async () => {
      await setupGloballyActivePlugin(app, superAdminToken);
      await createTenantInstallation(tenantAId, PLUGIN_ID, true);
      await createTenantInstallation(tenantBId, PLUGIN_ID, true);

      // Set different configs for A and B
      await app.inject({
        method: 'PUT',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/config`,
        headers: { authorization: `Bearer ${tenantAToken}` },
        payload: { tenant: 'A' },
      });
      await app.inject({
        method: 'PUT',
        url: `/api/v1/tenant/plugins/${PLUGIN_ID}/config`,
        headers: { authorization: `Bearer ${tenantBToken}` },
        payload: { tenant: 'B' },
      });

      const rowA = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantAId, pluginId: PLUGIN_ID } },
      });
      const rowB = await db.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId: tenantBId, pluginId: PLUGIN_ID } },
      });

      const configA = rowA?.configuration as Record<string, unknown>;
      const configB = rowB?.configuration as Record<string, unknown>;
      expect(configA.tenant).toBe('A');
      expect(configB.tenant).toBe('B');
    });
  });
});
