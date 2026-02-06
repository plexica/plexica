/**
 * Plugin Installation Integration Tests (Phase 5, Task 5.4)
 *
 * Integration tests for plugin installation, activation, configuration, and uninstallation.
 * Tests the complete lifecycle with real database and authentication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';

describe('Plugin Installation Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;
  let testPluginId: string;
  let testTenantId: string;
  let demoTenantId: string;

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Build the Fastify app
    app = await buildTestApp();
    await app.ready();

    // Get super admin token
    // Use mock tokens for integration tests (faster and more reliable)
    superAdminToken = testContext.auth.createMockSuperAdminToken();
    

    // Create test tenant (acme)
    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: 'acme',
        name: 'ACME Corporation',
        adminEmail: 'admin@acme.test',
        adminPassword: 'test123',
      },
    });

    if (tenantResponse.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResponse.body}`);
    }

    const tenantData = tenantResponse.json();
    testTenantId = tenantData.id;

    // Create demo tenant for multi-tenant tests
    const demoResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: 'demo',
        name: 'Demo Company',
        adminEmail: 'admin@demo.test',
        adminPassword: 'test123',
      },
    });

    if (demoResponse.statusCode !== 201) {
      throw new Error(`Failed to create demo tenant: ${demoResponse.body}`);
    }

    const demoData = demoResponse.json();
    demoTenantId = demoData.id;

    // Get tenant admin token
    // tenantAdminToken = testContext.auth.createMockTenantAdminToken('acme');
    

    testPluginId = `plugin-test-${Date.now()}`;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /tenants/:id/plugins/:pluginId/install', () => {
    it('should install a plugin to a tenant', async () => {
      // First, register the plugin in the global registry (super admin)
      const pluginManifest = {
        id: testPluginId,
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for integration testing',
        category: 'utility',
        metadata: {
          author: {
            name: 'Test Author',
            email: 'test@example.com',
          },
          license: 'MIT',
        },
        config: [
          {
            key: 'apiKey',
            type: 'string',
            label: 'API Key',
            required: true,
          },
        ],
      };

      const registerResp = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: pluginManifest,
      });

      expect(registerResp.statusCode).toBe(201);

      // Now install the plugin to the tenant
      const installResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/install`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: {
            apiKey: 'test-api-key-123',
          },
        },
      });

      expect(installResp.statusCode).toBe(201);
      const installation = installResp.json();
      expect(installation.pluginId).toBe(testPluginId);
      expect(installation.tenantId).toBe(testTenantId);
      expect(installation.configuration).toEqual({
        apiKey: 'test-api-key-123',
      });

      // Verify in database
      const dbInstallation = await db.tenantPlugin.findFirst({
        where: {
          tenantId: testTenantId,
          pluginId: testPluginId,
        },
      });

      expect(dbInstallation).toBeTruthy();
      expect(dbInstallation!.configuration).toEqual({
        apiKey: 'test-api-key-123',
      });
    });

    it('should reject installation without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/install`,
        payload: {
          configuration: {},
        },
      });

      expect(response.statusCode).toBe(403); // 403 when no auth header is provided
    });

    it('should reject installation of non-existent plugin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/plugin-nonexistent/install`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: {},
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject duplicate installation', async () => {
      // Try to install the same plugin again
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/install`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: {
            apiKey: 'different-key',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.error).toContain('already installed');
    });

    it('should install plugin with default configuration', async () => {
      const pluginId = `plugin-defaults-${Date.now()}`;

      // Register plugin with config defaults
      const pluginManifest = {
        id: pluginId,
        name: 'Plugin with Defaults',
        version: '1.0.0',
        description: 'Plugin with default config values',
        category: 'utility',
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
        config: [
          {
            key: 'timeout',
            type: 'number',
            label: 'Timeout',
            default: 30,
          },
          {
            key: 'enabled',
            type: 'boolean',
            label: 'Enabled',
            default: true,
          },
        ],
      };

      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: pluginManifest,
      });

      // Install without providing config (should use defaults)
      const installResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
        payload: {},
      });

      expect(installResp.statusCode).toBe(201);
      const installation = installResp.json();
      expect(installation.configuration.timeout).toBe(30);
      expect(installation.configuration.enabled).toBe(true);
    });
  });

  describe('POST /tenants/:id/plugins/:pluginId/activate', () => {
    it('should activate an installed plugin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/activate`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.enabled).toBe(true);

      // Verify in database
      const installation = await db.tenantPlugin.findFirst({
        where: {
          tenantId: testTenantId,
          pluginId: testPluginId,
        },
      });

      expect(installation!.enabled).toBe(true);
    });

    it('should reject activation of non-installed plugin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/plugin-not-installed/activate`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /tenants/:id/plugins/:pluginId/deactivate', () => {
    it('should deactivate an active plugin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/deactivate`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.enabled).toBe(false);

      // Verify in database
      const installation = await db.tenantPlugin.findFirst({
        where: {
          tenantId: testTenantId,
          pluginId: testPluginId,
        },
      });

      expect(installation!.enabled).toBe(false);
    });

    it('should allow reactivation after deactivation', async () => {
      // Reactivate
      const activateResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/activate`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(activateResp.statusCode).toBe(200);
      expect(activateResp.json().enabled).toBe(true);

      // Deactivate again
      const deactivateResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/deactivate`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });

      expect(deactivateResp.statusCode).toBe(200);
      expect(deactivateResp.json().enabled).toBe(false);
    });
  });

  describe('PATCH /tenants/:id/plugins/:pluginId/configuration', () => {
    it('should update plugin configuration', async () => {
      const newConfig = {
        apiKey: 'updated-api-key-456',
        additionalSetting: 'value',
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/configuration`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: newConfig,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.configuration).toEqual(newConfig);

      // Verify in database
      const installation = await db.tenantPlugin.findFirst({
        where: {
          tenantId: testTenantId,
          pluginId: testPluginId,
        },
      });

      expect(installation!.configuration).toEqual(newConfig);
    });

    it('should reject configuration update for non-installed plugin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}/plugins/plugin-not-installed/configuration`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: { test: 'value' },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should allow partial configuration updates', async () => {
      // Update only one field
      const partialConfig = {
        apiKey: 'partially-updated-key',
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/configuration`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: partialConfig,
        },
      });

      expect(response.statusCode).toBe(200);
      // Configuration should be replaced, not merged
      const result = response.json();
      expect(result.configuration).toEqual(partialConfig);
    });
  });

  describe('GET /tenants/:id/plugins', () => {
    it('should list all installed plugins for a tenant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${testTenantId}/plugins`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const plugins = response.json();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBeGreaterThan(0);

      // Should include our test plugin
      const testPlugin = plugins.find((p: any) => p.pluginId === testPluginId);
      expect(testPlugin).toBeTruthy();
      expect(testPlugin.tenantId).toBe(testTenantId);
    });

    it('should return empty array for tenant with no plugins', async () => {
      // Use demo tenant which has no plugins installed
      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${demoTenantId}/plugins`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const plugins = response.json();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });
  });

  describe('DELETE /tenants/:id/plugins/:pluginId', () => {
    it('should uninstall a plugin from a tenant', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify plugin is removed from database
      const installation = await db.tenantPlugin.findFirst({
        where: {
          tenantId: testTenantId,
          pluginId: testPluginId,
        },
      });

      expect(installation).toBeNull();
    });

    it('should reject uninstall of non-installed plugin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${testTenantId}/plugins/plugin-not-installed`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should allow reinstallation after uninstall', async () => {
      // Install
      const installResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/install`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
        payload: { configuration: { apiKey: 'reinstall-key' } },
      });
      expect(installResp.statusCode).toBe(201);

      // Uninstall
      const uninstallResp = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });
      expect(uninstallResp.statusCode).toBe(204);

      // Reinstall with different config
      const reinstallResp = await app.inject({
        method: 'POST',
        url: `/api/tenants/${testTenantId}/plugins/${testPluginId}/install`,
        headers: { authorization: `Bearer ${tenantAdminToken}` },
        payload: { configuration: { apiKey: 'new-key-after-reinstall' } },
      });
      expect(reinstallResp.statusCode).toBe(201);

      const installation = reinstallResp.json();
      expect(installation.configuration.apiKey).toBe('new-key-after-reinstall');
    });
  });

  describe('Plugin installation across multiple tenants', () => {
    it('should allow same plugin installed in different tenants', async () => {
      // Install in demo tenant
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${demoTenantId}/plugins/${testPluginId}/install`,
        headers: {
          authorization: `Bearer ${tenantAdminToken}`,
        },
        payload: {
          configuration: {
            apiKey: 'demo-api-key',
          },
        },
      });

      expect(response.statusCode).toBe(201);

      // Verify both tenants have the plugin
      const demoInstallation = await db.tenantPlugin.findFirst({
        where: { tenantId: demoTenantId, pluginId: testPluginId },
      });
      const acmeInstallation = await db.tenantPlugin.findFirst({
        where: { tenantId: testTenantId, pluginId: testPluginId },
      });

      expect(demoInstallation).toBeTruthy();
      expect(acmeInstallation).toBeTruthy();
      expect(demoInstallation!.configuration).not.toEqual(acmeInstallation!.configuration);
    });
  });
});
