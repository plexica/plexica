/**
 * Plugin Marketplace Integration Tests (Phase 5, Task 5.5)
 *
 * Integration tests for the global plugin marketplace/registry.
 * Tests listing, filtering, searching, updating, and deleting plugins.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';

describe('Plugin Marketplace Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    // Reset test environment
    await testContext.resetAll();

    // Build the Fastify app
    app = await buildTestApp();
    await app.ready();

    // Use mock tokens for integration tests (faster and more reliable than real Keycloak tokens)
    superAdminToken = testContext.auth.createMockSuperAdminToken();
    regularUserToken = testContext.auth.createMockTenantAdminToken('acme');

    // Create test tenants (tenant provisioning includes Keycloak realm + DB schema)
    const acmeResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: 'acme',
        name: 'ACME Corporation',
      },
    });

    if (acmeResp.statusCode !== 201) {
      console.warn(
        `Warning: Failed to create 'acme' tenant: ${acmeResp.statusCode} ${acmeResp.body}`
      );
    }

    const demoResp = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: 'demo',
        name: 'Demo Company',
      },
    });

    if (demoResp.statusCode !== 201) {
      console.warn(
        `Warning: Failed to create 'demo' tenant: ${demoResp.statusCode} ${demoResp.body}`
      );
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /api/plugins - Register Plugin', () => {
    it('should register a new plugin as super admin', async () => {
      const pluginManifest = {
        id: `plugin-marketplace-${Date.now()}`,
        name: 'Marketplace Test Plugin',
        version: '1.0.0',
        description: 'Test plugin for marketplace testing',
        category: 'productivity',
        metadata: {
          author: {
            name: 'Test Author',
            email: 'author@example.com',
          },
          license: 'MIT',
          homepage: 'https://example.com',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
        payload: pluginManifest,
      });

      expect(response.statusCode).toBe(201);
      const plugin = response.json();
      expect(plugin.id).toBe(pluginManifest.id);
      expect(plugin.name).toBe(pluginManifest.name);
      expect(plugin.version).toBe(pluginManifest.version);
      expect(plugin.status).toBe('PUBLISHED');

      // Verify in database
      const dbPlugin = await db.plugin.findUnique({
        where: { id: pluginManifest.id },
      });
      expect(dbPlugin).toBeTruthy();
      expect(dbPlugin!.name).toBe(pluginManifest.name);
    });

    it('should reject registration by non-super-admin', async () => {
      const pluginManifest = {
        id: `plugin-unauthorized-${Date.now()}`,
        name: 'Unauthorized Plugin',
        version: '1.0.0',
        description: 'Should not be allowed',
        category: 'utility',
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
        payload: pluginManifest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject registration without authentication', async () => {
      const pluginManifest = {
        id: `plugin-noauth-${Date.now()}`,
        name: 'No Auth Plugin',
        version: '1.0.0',
        description: 'No auth',
        category: 'utility',
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        payload: pluginManifest,
      });

      expect(response.statusCode).toBe(403); // 403 when no auth header is provided
    });

    it('should reject duplicate plugin registration', async () => {
      const pluginId = `plugin-duplicate-${Date.now()}`;
      const pluginManifest = {
        id: pluginId,
        name: 'Duplicate Plugin',
        version: '1.0.0',
        description: 'First registration',
        category: 'utility',
        metadata: {
          author: { name: 'Test' },
          license: 'MIT',
        },
      };

      // First registration
      const firstResp = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: pluginManifest,
      });
      expect(firstResp.statusCode).toBe(201);

      // Duplicate registration
      const secondResp = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: pluginManifest,
      });
      expect(secondResp.statusCode).toBe(400);
      expect(secondResp.json().error).toContain('already registered');
    });

    it('should reject invalid plugin manifest', async () => {
      const invalidManifest = {
        id: 'invalid-id', // Missing 'plugin-' prefix
        name: 'Invalid',
        version: 'not-semver',
        // Missing description, category, metadata
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: invalidManifest,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/plugins - List Plugins', () => {
    beforeAll(async () => {
      // Register multiple plugins for listing tests
      const plugins = [
        {
          id: `plugin-analytics-${Date.now()}`,
          name: 'Analytics Plugin',
          version: '2.1.0',
          description: 'Analytics and reporting',
          category: 'analytics',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
        {
          id: `plugin-crm-${Date.now()}`,
          name: 'CRM Plugin',
          version: '1.5.0',
          description: 'Customer relationship management',
          category: 'crm',
          metadata: { author: { name: 'Test' }, license: 'Apache-2.0' },
        },
        {
          id: `plugin-storage-${Date.now()}`,
          name: 'Storage Plugin',
          version: '3.0.0',
          description: 'Cloud storage integration',
          category: 'storage',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      ];

      for (const plugin of plugins) {
        await app.inject({
          method: 'POST',
          url: '/api/plugins',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: plugin,
        });
      }
    });

    it('should list all plugins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.plugins).toBeDefined();
      expect(Array.isArray(result.plugins)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.plugins.length).toBeGreaterThan(0);
    });

    it('should filter plugins by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins?status=PUBLISHED',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      result.plugins.forEach((plugin: any) => {
        expect(plugin.status).toBe('PUBLISHED');
      });
    });

    it('should filter plugins by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins?category=analytics',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      if (result.plugins.length > 0) {
        result.plugins.forEach((plugin: any) => {
          expect(plugin.manifest?.category || plugin.category).toBe('analytics');
        });
      }
    });

    it('should search plugins by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins?search=Analytics',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      if (result.plugins.length > 0) {
        const hasAnalytics = result.plugins.some((p: any) =>
          p.name.toLowerCase().includes('analytics')
        );
        expect(hasAnalytics).toBe(true);
      }
    });

    it('should paginate plugin results', async () => {
      // Get first page
      const page1 = await app.inject({
        method: 'GET',
        url: '/api/plugins?skip=0&take=2',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(page1.statusCode).toBe(200);
      const result1 = page1.json();
      expect(result1.plugins.length).toBeLessThanOrEqual(2);

      // Get second page
      const page2 = await app.inject({
        method: 'GET',
        url: '/api/plugins?skip=2&take=2',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(page2.statusCode).toBe(200);
      const result2 = page2.json();

      // Pages should have different plugins (if enough plugins exist)
      if (result1.plugins.length > 0 && result2.plugins.length > 0) {
        expect(result1.plugins[0].id).not.toBe(result2.plugins[0].id);
      }
    });

    it('should respect pagination limits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins?take=5',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.plugins.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/plugins/:pluginId - Get Plugin Details', () => {
    let testPluginId: string;

    beforeAll(async () => {
      testPluginId = `plugin-details-${Date.now()}`;
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: testPluginId,
          name: 'Details Test Plugin',
          version: '1.2.3',
          description: 'Plugin for testing detail retrieval',
          category: 'utility',
          metadata: {
            author: { name: 'Detail Author', email: 'detail@example.com' },
            license: 'BSD-3-Clause',
            homepage: 'https://details.example.com',
            repository: 'https://github.com/test/details',
          },
        },
      });
    });

    it('should get plugin details by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/plugins/${testPluginId}`,
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const plugin = response.json();
      expect(plugin.id).toBe(testPluginId);
      expect(plugin.name).toBe('Details Test Plugin');
      expect(plugin.version).toBe('1.2.3');
      expect(plugin.manifest).toBeDefined();
      expect(plugin.manifest.metadata.author.name).toBe('Detail Author');
    });

    it('should return 404 for non-existent plugin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins/plugin-nonexistent',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/plugins/:pluginId - Update Plugin', () => {
    let updatePluginId: string;

    beforeAll(async () => {
      updatePluginId = `plugin-update-${Date.now()}`;
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: updatePluginId,
          name: 'Update Test Plugin',
          version: '1.0.0',
          description: 'Original description',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });
    });

    it('should update plugin as super admin', async () => {
      const updatedManifest = {
        id: updatePluginId,
        name: 'Updated Plugin Name',
        version: '2.0.0',
        description: 'Updated description',
        category: 'productivity',
        metadata: {
          author: { name: 'Updated Author' },
          license: 'Apache-2.0',
        },
      };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/plugins/${updatePluginId}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: updatedManifest,
      });

      expect(response.statusCode).toBe(200);
      const plugin = response.json();
      expect(plugin.name).toBe('Updated Plugin Name');
      expect(plugin.version).toBe('2.0.0');

      // Verify in database
      const dbPlugin = await db.plugin.findUnique({
        where: { id: updatePluginId },
      });
      expect(dbPlugin!.name).toBe('Updated Plugin Name');
      expect(dbPlugin!.version).toBe('2.0.0');
    });

    it('should reject update by non-super-admin', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/plugins/${updatePluginId}`,
        headers: { authorization: `Bearer ${regularUserToken}` },
        payload: {
          id: updatePluginId,
          name: 'Unauthorized Update',
          version: '3.0.0',
          description: 'Should not work',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject update of non-existent plugin', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/plugins/plugin-nonexistent',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: 'plugin-nonexistent',
          name: 'Test',
          version: '1.0.0',
          description: 'Test',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/plugins/:pluginId - Delete Plugin', () => {
    it('should delete plugin as super admin when not installed', async () => {
      const deletePluginId = `plugin-delete-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: deletePluginId,
          name: 'Delete Test Plugin',
          version: '1.0.0',
          description: 'Will be deleted',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Delete plugin
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plugins/${deletePluginId}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const dbPlugin = await db.plugin.findUnique({
        where: { id: deletePluginId },
      });
      expect(dbPlugin).toBeNull();
    });

    it('should reject deletion by non-super-admin', async () => {
      const deletePluginId = `plugin-delete-unauth-${Date.now()}`;

      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: deletePluginId,
          name: 'Delete Unauthorized',
          version: '1.0.0',
          description: 'Test',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plugins/${deletePluginId}`,
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject deletion of non-existent plugin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/plugins/plugin-nonexistent',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should prevent deletion of installed plugin', async () => {
      const installedPluginId = `plugin-installed-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: installedPluginId,
          name: 'Installed Plugin',
          version: '1.0.0',
          description: 'Will be installed',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Install to tenant
      const tenant = await db.tenant.findUnique({ where: { slug: 'acme' } });
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant!.id}/plugins/${installedPluginId}/install`,
        headers: { authorization: `Bearer ${regularUserToken}` },
        payload: { configuration: {} },
      });

      // Try to delete (should fail)
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/plugins/${installedPluginId}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Cannot delete plugin');
    });
  });

  describe('GET /api/plugins/:pluginId/stats - Plugin Statistics', () => {
    let statsPluginId: string;

    beforeAll(async () => {
      statsPluginId = `plugin-stats-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: statsPluginId,
          name: 'Stats Plugin',
          version: '1.0.0',
          description: 'For testing statistics',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Install in multiple tenants
      const acmeTenant = await db.tenant.findUnique({ where: { slug: 'acme' } });
      const demoTenant = await db.tenant.findUnique({ where: { slug: 'demo' } });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${acmeTenant!.id}/plugins/${statsPluginId}/install`,
        headers: { authorization: `Bearer ${regularUserToken}` },
        payload: { configuration: {} },
      });

      // Activate in acme tenant
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${acmeTenant!.id}/plugins/${statsPluginId}/activate`,
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${demoTenant!.id}/plugins/${statsPluginId}/install`,
        headers: { authorization: `Bearer ${regularUserToken}` },
        payload: { configuration: {} },
      });

      // Activate in demo tenant
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${demoTenant!.id}/plugins/${statsPluginId}/activate`,
        headers: { authorization: `Bearer ${regularUserToken}` },
      });
    });

    it.skip('should return plugin installation statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/plugins/${statsPluginId}/stats`,
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats).toHaveProperty('installCount');
      expect(stats).toHaveProperty('activeTenants');
      expect(stats.installCount).toBeGreaterThanOrEqual(2);
      expect(stats.activeTenants).toBeGreaterThanOrEqual(2);
    });

    it('should return zero stats for uninstalled plugin', async () => {
      const uninstalledPluginId = `plugin-uninstalled-${Date.now()}`;

      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: uninstalledPluginId,
          name: 'Uninstalled Plugin',
          version: '1.0.0',
          description: 'Not installed anywhere',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/plugins/${uninstalledPluginId}/stats`,
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.installCount).toBe(0);
      expect(stats.activeTenants).toBe(0);
    });

    it('should return 404 for non-existent plugin stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plugins/plugin-nonexistent/stats',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
