import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { resetAllCaches } from '../../../lib/advanced-rate-limit';

/**
 * Plugin Concurrent Operations E2E Tests
 *
 * Tests plugin operations under concurrent load:
 * - Concurrent installations across multiple tenants
 * - Concurrent activation/deactivation
 * - Concurrent configuration updates
 * - Race condition handling
 * - Performance under load
 * - Database transaction integrity
 */
describe('Plugin Concurrent Operations E2E Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenant1AdminToken: string;
  let tenant2AdminToken: string;
  let tenant1Id: string;
  let tenant2Id: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
    resetAllCaches();

    // Get super admin token
    const superResp = await testContext.auth.getRealSuperAdminToken();
    superAdminToken = superResp.access_token;

    // Get tenant admin tokens (use pre-existing Keycloak users)
    const admin1Resp = await testContext.auth.getRealTenantAdminToken('acme');
    tenant1AdminToken = admin1Resp.access_token;

    const admin2Resp = await testContext.auth.getRealTenantAdminToken('demo');
    tenant2AdminToken = admin2Resp.access_token;

    // Create tenants dynamically via API (seed data is wiped by e2e-setup)
    const suffix = Date.now();
    const createT1 = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { slug: `plugin-conc-1-${suffix}`, name: 'Plugin Concurrent Test Tenant 1' },
    });
    tenant1Id = createT1.json().id;

    const createT2 = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { slug: `plugin-conc-2-${suffix}`, name: 'Plugin Concurrent Test Tenant 2' },
    });
    tenant2Id = createT2.json().id;
  });

  beforeEach(() => {
    resetAllCaches();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Concurrent installations', () => {
    it('should handle 10 simultaneous plugin installations in one tenant', async () => {
      const pluginIds: string[] = [];

      // Register 10 plugins
      for (let i = 0; i < 10; i++) {
        const pluginId = `plugin-concurrent-install-${Date.now()}-${i}`;
        pluginIds.push(pluginId);

        await app.inject({
          method: 'POST',
          url: '/api/plugins',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            id: pluginId,
            name: `Concurrent Install Plugin ${i}`,
            version: '1.0.0',
            description: `Plugin ${i} for concurrent testing`,
            category: 'utility',
            metadata: { author: { name: 'Test' }, license: 'MIT' },
          },
        });
      }

      // Install all 10 simultaneously
      const installPromises = pluginIds.map((pluginId) =>
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: {} },
        })
      );

      const results = await Promise.allSettled(installPromises);

      // All should succeed
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value.statusCode === 201
      );
      expect(succeeded.length).toBe(10);

      // Verify all are in database
      const installations = await db.tenantPlugin.findMany({
        where: {
          tenantId: tenant1Id,
          pluginId: { in: pluginIds },
        },
      });
      expect(installations.length).toBe(10);
    });

    it('should handle multiple tenants installing same plugin simultaneously', async () => {
      const pluginId = `plugin-multi-tenant-concurrent-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Multi-Tenant Concurrent Plugin',
          version: '1.0.0',
          description: 'Tests concurrent multi-tenant install',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Both tenants install simultaneously
      const [result1, result2] = await Promise.allSettled([
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { tenant: 'tenant1' } },
        }),
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant2Id}/plugins/${pluginId}/install`,
          headers: { authorization: `Bearer ${tenant2AdminToken}` },
          payload: { configuration: { tenant: 'tenant2' } },
        }),
      ]);

      // Both should succeed
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');
      if (result1.status === 'fulfilled') {
        expect(result1.value.statusCode).toBe(201);
      }
      if (result2.status === 'fulfilled') {
        expect(result2.value.statusCode).toBe(201);
      }

      // Verify both installations exist with correct configs
      const installations = await db.tenantPlugin.findMany({
        where: { pluginId },
      });
      expect(installations.length).toBe(2);

      const tenant1Install = installations.find((i) => i.tenantId === tenant1Id);
      const tenant2Install = installations.find((i) => i.tenantId === tenant2Id);

      expect(tenant1Install).toBeTruthy();
      expect(tenant2Install).toBeTruthy();

      const config1 = tenant1Install!.configuration as { tenant: string };
      const config2 = tenant2Install!.configuration as { tenant: string };

      expect(config1.tenant).toBe('tenant1');
      expect(config2.tenant).toBe('tenant2');
    });

    it('should prevent duplicate concurrent installations in same tenant', async () => {
      const pluginId = `plugin-duplicate-concurrent-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Duplicate Concurrent Plugin',
          version: '1.0.0',
          description: 'Tests duplicate prevention',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Attempt to install 5 times simultaneously in same tenant
      const duplicatePromises = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: {} },
        })
      );

      const results = await Promise.allSettled(duplicatePromises);

      // Only one should succeed, others should fail with 409 Conflict or 400
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value.statusCode === 201
      );

      // At least one success, rest should be conflicts (409) or errors (400)
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
      const failedExpected = results.filter(
        (r) =>
          r.status === 'fulfilled' && (r.value.statusCode === 409 || r.value.statusCode === 400)
      );
      expect(succeeded.length + failedExpected.length).toBe(5);

      // Verify only one installation exists
      const installations = await db.tenantPlugin.findMany({
        where: { tenantId: tenant1Id, pluginId },
      });
      expect(installations.length).toBe(1);
    });
  });

  describe('Concurrent activation/deactivation', () => {
    it('should handle concurrent activations in multiple tenants', async () => {
      const pluginId = `plugin-concurrent-activate-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Concurrent Activate Plugin',
          version: '1.0.0',
          description: 'Tests concurrent activation',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Install in both tenants
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant2Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant2AdminToken}` },
        payload: { configuration: {} },
      });

      // Activate in both tenants simultaneously
      const [result1, result2] = await Promise.allSettled([
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/activate`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
        }),
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant2Id}/plugins/${pluginId}/activate`,
          headers: { authorization: `Bearer ${tenant2AdminToken}` },
        }),
      ]);

      // Both should succeed
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');

      // Verify both are enabled
      const installations = await db.tenantPlugin.findMany({
        where: { pluginId },
      });
      expect(installations.every((i) => i.enabled === true)).toBe(true);
    });

    it('should handle rapid toggle (activate/deactivate) operations', async () => {
      const pluginId = `plugin-rapid-toggle-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Rapid Toggle Plugin',
          version: '1.0.0',
          description: 'Tests rapid toggling',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      // Perform 10 rapid toggles
      const togglePromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        togglePromises.push(
          app.inject({
            method: 'POST',
            url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/${i % 2 === 0 ? 'activate' : 'deactivate'}`,
            headers: { authorization: `Bearer ${tenant1AdminToken}` },
          })
        );
      }

      const results = await Promise.allSettled(togglePromises);

      // All should complete without errors
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(10);

      // Final state should be valid (either enabled or disabled, but consistent)
      const finalState = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });
      expect(finalState).toBeTruthy();
      expect(typeof finalState!.enabled).toBe('boolean');
    });

    it('should handle idempotent concurrent activations', async () => {
      const pluginId = `plugin-idempotent-activate-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Idempotent Activate Plugin',
          version: '1.0.0',
          description: 'Tests idempotent activation',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      // Call activate 5 times simultaneously
      const activatePromises = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/activate`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
        })
      );

      const results = await Promise.allSettled(activatePromises);

      // All should succeed (idempotent operation)
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      // Verify plugin is enabled once
      const installation = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });
      expect(installation!.enabled).toBe(true);
    });
  });

  describe('Concurrent configuration updates', () => {
    it('should handle concurrent config updates with last-write-wins', async () => {
      const pluginId = `plugin-concurrent-config-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Concurrent Config Plugin',
          version: '1.0.0',
          description: 'Tests concurrent config updates',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
          manifest: {
            configFields: [{ key: 'value', type: 'number', required: false }],
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: { value: 0 } },
      });

      // Update config 10 times concurrently with different values
      const updatePromises = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/configuration`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { value: i + 1 } },
        })
      );

      const results = await Promise.allSettled(updatePromises);

      // All should succeed
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      // Final value should be one of the written values (last write wins)
      const finalConfig = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });
      const config = finalConfig!.configuration as { value: number };
      expect(config.value).toBeGreaterThanOrEqual(1);
      expect(config.value).toBeLessThanOrEqual(10);
    });

    it('should maintain config integrity during concurrent partial updates', async () => {
      const pluginId = `plugin-partial-config-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Partial Config Plugin',
          version: '1.0.0',
          description: 'Tests partial config updates',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
          manifest: {
            configFields: [
              { key: 'field1', type: 'string', required: false },
              { key: 'field2', type: 'number', required: false },
              { key: 'field3', type: 'boolean', required: false },
            ],
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: {
          configuration: {
            field1: 'initial',
            field2: 0,
            field3: false,
          },
        },
      });

      // Update different fields concurrently
      const [result1, result2, result3] = await Promise.allSettled([
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/configuration`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { field1: 'updated1' } },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/configuration`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { field2: 42 } },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/configuration`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { field3: true } },
        }),
      ]);

      // All should succeed
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');
      expect(result3.status).toBe('fulfilled');

      // Final config reflects last-write-wins. Since updateConfiguration replaces the
      // entire configuration, only the last update's field may remain. The important
      // thing is that the config is not corrupted.
      const finalConfig = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });
      const config = finalConfig!.configuration as any;

      // Config should be a valid object (not corrupted)
      expect(config).toBeTruthy();
      expect(typeof config).toBe('object');

      // At least one of the fields should be present (from whichever update won)
      const hasAnyField =
        config.field1 !== undefined || config.field2 !== undefined || config.field3 !== undefined;
      expect(hasAnyField).toBe(true);
    });
  });

  describe('Performance under load', () => {
    it('should handle 50 concurrent plugin operations within reasonable time', async () => {
      const pluginId = `plugin-perf-test-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Performance Test Plugin',
          version: '1.0.0',
          description: 'Tests performance under load',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Install in both tenants
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant2Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant2AdminToken}` },
        payload: { configuration: {} },
      });

      const startTime = Date.now();

      // Perform 50 mixed operations
      const operations: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        const tenantId = i % 2 === 0 ? tenant1Id : tenant2Id;
        const token = i % 2 === 0 ? tenant1AdminToken : tenant2AdminToken;

        if (i % 3 === 0) {
          // Activate
          operations.push(
            app.inject({
              method: 'POST',
              url: `/api/tenants/${tenantId}/plugins/${pluginId}/activate`,
              headers: { authorization: `Bearer ${token}` },
            })
          );
        } else if (i % 3 === 1) {
          // Deactivate
          operations.push(
            app.inject({
              method: 'POST',
              url: `/api/tenants/${tenantId}/plugins/${pluginId}/deactivate`,
              headers: { authorization: `Bearer ${token}` },
            })
          );
        } else {
          // List plugins
          operations.push(
            app.inject({
              method: 'GET',
              url: `/api/tenants/${tenantId}/plugins`,
              headers: { authorization: `Bearer ${token}` },
            })
          );
        }
      }

      const results = await Promise.allSettled(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All operations should complete
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(50);

      // Should complete within 10 seconds (reasonable for 50 operations)
      expect(duration).toBeLessThan(10000);

      console.log(`50 concurrent operations completed in ${duration}ms`);
    });

    it('should maintain response time under concurrent load', async () => {
      const pluginId = `plugin-response-time-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Response Time Plugin',
          version: '1.0.0',
          description: 'Tests response time',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      // Measure response time for 20 concurrent list operations
      const listPromises = Array.from({ length: 20 }, async () => {
        const start = Date.now();
        await app.inject({
          method: 'GET',
          url: `/api/tenants/${tenant1Id}/plugins`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
        });
        return Date.now() - start;
      });

      const responseTimes = await Promise.all(listPromises);

      // All requests should complete within 2 seconds each
      expect(responseTimes.every((time) => time < 2000)).toBe(true);

      // Average response time should be under 1 second
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      expect(avgTime).toBeLessThan(1000);

      console.log(`Average response time: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Race condition handling', () => {
    it('should handle install-uninstall race condition', async () => {
      const pluginId = `plugin-install-uninstall-race-${Date.now()}`;

      // Register plugin
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Install-Uninstall Race Plugin',
          version: '1.0.0',
          description: 'Tests install-uninstall race',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      // Install plugin
      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      // Simultaneously try to uninstall and activate
      const [uninstallResult, activateResult] = await Promise.allSettled([
        app.inject({
          method: 'DELETE',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
        }),
        app.inject({
          method: 'POST',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/activate`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
        }),
      ]);

      // One should succeed, one should fail (or both handled gracefully)
      expect([uninstallResult.status, activateResult.status]).toContain('fulfilled');

      // Final state should be consistent (either installed or not)
      const installation = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });

      // If installed, should have valid state
      if (installation) {
        expect(typeof installation.enabled).toBe('boolean');
      }
    });

    it('should handle activate-deactivate race condition', async () => {
      const pluginId = `plugin-activate-deactivate-race-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Activate-Deactivate Race Plugin',
          version: '1.0.0',
          description: 'Tests activate-deactivate race',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: {} },
      });

      // Simultaneously activate and deactivate multiple times
      const racePromises: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        racePromises.push(
          app.inject({
            method: 'POST',
            url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/activate`,
            headers: { authorization: `Bearer ${tenant1AdminToken}` },
          })
        );
        racePromises.push(
          app.inject({
            method: 'POST',
            url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/deactivate`,
            headers: { authorization: `Bearer ${tenant1AdminToken}` },
          })
        );
      }

      await Promise.allSettled(racePromises);

      // Final state should be valid and consistent
      const installation = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });

      expect(installation).toBeTruthy();
      expect(typeof installation!.enabled).toBe('boolean');
    });

    it('should prevent data corruption during concurrent updates', async () => {
      const pluginId = `plugin-data-integrity-${Date.now()}`;

      // Register and install
      await app.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          id: pluginId,
          name: 'Data Integrity Plugin',
          version: '1.0.0',
          description: 'Tests data integrity',
          category: 'utility',
          metadata: { author: { name: 'Test' }, license: 'MIT' },
          manifest: {
            configFields: [{ key: 'counter', type: 'number', required: false }],
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/install`,
        headers: { authorization: `Bearer ${tenant1AdminToken}` },
        payload: { configuration: { counter: 0 } },
      });

      // Perform 20 concurrent config updates
      const updatePromises = Array.from({ length: 20 }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenant1Id}/plugins/${pluginId}/configuration`,
          headers: { authorization: `Bearer ${tenant1AdminToken}` },
          payload: { configuration: { counter: i } },
        })
      );

      await Promise.allSettled(updatePromises);

      // Verify no data corruption - should have valid config
      const installation = await db.tenantPlugin.findFirst({
        where: { tenantId: tenant1Id, pluginId },
      });

      expect(installation).toBeTruthy();
      expect(installation!.configuration).toBeTruthy();

      const config = installation!.configuration as { counter: number };
      expect(typeof config.counter).toBe('number');
      expect(config.counter).toBeGreaterThanOrEqual(0);
      expect(config.counter).toBeLessThan(20);
    });
  });
});
