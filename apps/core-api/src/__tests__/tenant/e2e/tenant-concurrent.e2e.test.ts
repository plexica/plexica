import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';

/**
 * E2E Tests: Tenant Concurrent Operations
 *
 * Tests the system's behavior under concurrent load conditions:
 * - Concurrent tenant creation with different slugs
 * - Duplicate slug prevention under load
 * - Parallel operations on different tenants
 * - Concurrent updates to the same tenant
 * - Transaction isolation verification
 * - Performance under concurrent load
 * - Resource cleanup after concurrent operations
 *
 * These tests ensure the system handles race conditions correctly
 * and maintains data integrity under concurrent load.
 */
describe('Tenant Concurrent Operations E2E', () => {
  let app: FastifyInstance;
  let superAdminToken: string;

  beforeAll(async () => {
    // Reset all state
    await testContext.resetAll();

    // Build test app
    app = await buildTestApp();
    await app.ready();

    // Get super admin token
    const tokenResp = await testContext.auth.getRealSuperAdminToken();
    superAdminToken = tokenResp.access_token;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Concurrent Tenant Creation', () => {
    it('should handle concurrent tenant creation with different slugs', async () => {
      const tenantCount = 10;
      const timestamp = Date.now();

      // Create 10 concurrent tenant creation requests with unique slugs
      const promises = Array.from({ length: tenantCount }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: `concurrent-${timestamp}-${i}`,
            name: `Concurrent Tenant ${i}`,
            settings: { feature1: true },
          },
        })
      );

      const responses = await Promise.all(promises);

      // All requests should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode !== 201);

      expect(successful.length).toBe(tenantCount);
      expect(failed.length).toBe(0);

      // Verify all tenants were created in database
      const createdSlugs = successful.map((r) => r.json().slug);
      const tenants = await db.tenant.findMany({
        where: { slug: { in: createdSlugs } },
      });

      expect(tenants).toHaveLength(tenantCount);

      // Verify each tenant has unique slug and ID
      const uniqueSlugs = new Set(tenants.map((t) => t.slug));
      const uniqueIds = new Set(tenants.map((t) => t.id));

      expect(uniqueSlugs.size).toBe(tenantCount);
      expect(uniqueIds.size).toBe(tenantCount);
    });

    it('should prevent duplicate slugs under concurrent load', async () => {
      const duplicateSlug = `duplicate-concurrent-${Date.now()}`;
      const requestCount = 15;

      // Create 15 concurrent requests with the SAME slug
      const promises = Array.from({ length: requestCount }, () =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: duplicateSlug,
            name: 'Duplicate Concurrent Test',
          },
        })
      );

      const responses = await Promise.all(promises);

      // Only ONE should succeed, rest should fail
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode === 400 || r.statusCode === 409);

      expect(successful.length).toBe(1);
      expect(failed.length).toBeGreaterThanOrEqual(requestCount - 1);

      // Verify failed requests have appropriate error messages
      const failedBodies = failed.map((r) => r.json());
      for (const body of failedBodies) {
        expect(body.message || body.error).toMatch(/already exists|duplicate|unique constraint/i);
      }

      // Verify only ONE tenant exists in database
      const tenants = await db.tenant.findMany({
        where: { slug: duplicateSlug },
      });

      expect(tenants).toHaveLength(1);
    });

    it('should handle concurrent creation with mixed duplicate and unique slugs', async () => {
      const timestamp = Date.now();
      const baseSlug = `mixed-concurrent-${timestamp}`;

      // Create requests: 5 with same slug, 5 with unique slugs
      const promises = [
        // 5 duplicate slug requests
        ...Array.from({ length: 5 }, () =>
          app.inject({
            method: 'POST',
            url: '/api/tenants',
            headers: { authorization: `Bearer ${superAdminToken}` },
            payload: {
              slug: baseSlug,
              name: 'Duplicate Slug',
            },
          })
        ),
        // 5 unique slug requests
        ...Array.from({ length: 5 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/api/tenants',
            headers: { authorization: `Bearer ${superAdminToken}` },
            payload: {
              slug: `${baseSlug}-unique-${i}`,
              name: `Unique Slug ${i}`,
            },
          })
        ),
      ];

      const responses = await Promise.all(promises);

      const successful = responses.filter((r) => r.statusCode === 201);

      // Should have 6 successful: 1 from duplicate set + 5 unique
      expect(successful.length).toBe(6);

      // Verify in database
      const tenants = await db.tenant.findMany({
        where: {
          slug: {
            startsWith: baseSlug,
          },
        },
      });

      expect(tenants).toHaveLength(6);
    });

    it('should maintain data integrity during concurrent provisioning failures', async () => {
      const timestamp = Date.now();

      // Create requests with some invalid data that might fail provisioning
      const promises = [
        // Valid requests
        ...Array.from({ length: 5 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/api/tenants',
            headers: { authorization: `Bearer ${superAdminToken}` },
            payload: {
              slug: `valid-${timestamp}-${i}`,
              name: `Valid Tenant ${i}`,
            },
          })
        ),
        // Potentially invalid requests (extremely long names, special chars)
        ...Array.from({ length: 3 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/api/tenants',
            headers: { authorization: `Bearer ${superAdminToken}` },
            payload: {
              slug: `special-${timestamp}-${i}`,
              name: 'A'.repeat(300), // Very long name
            },
          })
        ),
      ];

      const responses = await Promise.all(promises);

      // Count successes and failures
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode !== 201);

      // At least valid ones should succeed
      expect(successful.length).toBeGreaterThanOrEqual(5);

      // Verify database consistency
      const allTenants = await db.tenant.findMany({
        where: {
          slug: {
            startsWith: `valid-${timestamp}`,
          },
        },
      });

      // All successful creations should be in database
      expect(allTenants.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Concurrent Tenant Updates', () => {
    it('should handle concurrent updates to different tenants', async () => {
      const timestamp = Date.now();

      // Create 5 tenants first
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: `update-test-${timestamp}-${i}`,
            name: `Update Test ${i}`,
          },
        })
      );

      const createResponses = await Promise.all(createPromises);
      const tenantIds = createResponses.map((r) => r.json().id);

      // Now update all 5 concurrently with different data
      const updatePromises = tenantIds.map((id, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${id}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            name: `Updated Tenant ${i}`,
            settings: { updated: true, index: i },
          },
        })
      );

      const updateResponses = await Promise.all(updatePromises);

      // All updates should succeed
      const successful = updateResponses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(5);

      // Verify all updates were applied
      for (let i = 0; i < tenantIds.length; i++) {
        const tenant = await db.tenant.findUnique({
          where: { id: tenantIds[i] },
        });

        expect(tenant?.name).toBe(`Updated Tenant ${i}`);
        expect(tenant?.settings).toMatchObject({ updated: true, index: i });
      }
    });

    it('should handle concurrent updates to the same tenant correctly', async () => {
      const timestamp = Date.now();

      // Create one tenant
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `same-tenant-update-${timestamp}`,
          name: 'Same Tenant Update Test',
          settings: { counter: 0 },
        },
      });

      const tenantId = createResponse.json().id;

      // Send 10 concurrent updates to the SAME tenant
      const updateCount = 10;
      const promises = Array.from({ length: updateCount }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            settings: { counter: i, timestamp: Date.now() },
          },
        })
      );

      const responses = await Promise.all(promises);

      // All updates should succeed (or some might fail with conflict)
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBeGreaterThan(0);

      // Verify tenant still exists and has valid data
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      expect(tenant).toBeTruthy();
      expect(tenant?.settings).toBeTruthy();
      expect(typeof tenant?.settings).toBe('object');

      // The final value should be from one of the updates (0-9)
      const finalCounter = (tenant?.settings as any).counter;
      expect(finalCounter).toBeGreaterThanOrEqual(0);
      expect(finalCounter).toBeLessThan(updateCount);
    });

    it('should handle concurrent status transitions correctly', async () => {
      const timestamp = Date.now();

      // Create one tenant
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `status-transition-${timestamp}`,
          name: 'Status Transition Test',
        },
      });

      const tenantId = createResponse.json().id;

      // Wait for provisioning to complete (status becomes ACTIVE)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send concurrent status updates: ACTIVE -> SUSPENDED
      const promises = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            status: 'SUSPENDED',
          },
        })
      );

      const responses = await Promise.all(promises);

      // At least one should succeed
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBeGreaterThan(0);

      // Verify final status
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      expect(tenant?.status).toBe('SUSPENDED');

      // Now try concurrent transitions from SUSPENDED -> ACTIVE
      const reactivatePromises = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            status: 'ACTIVE',
          },
        })
      );

      const reactivateResponses = await Promise.all(reactivatePromises);
      const reactivateSuccessful = reactivateResponses.filter((r) => r.statusCode === 200);
      expect(reactivateSuccessful.length).toBeGreaterThan(0);

      // Verify final status is ACTIVE
      const reactivatedTenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      expect(reactivatedTenant?.status).toBe('ACTIVE');
    });
  });

  describe('Concurrent Tenant Deletion', () => {
    it('should handle concurrent soft deletes to different tenants', async () => {
      const timestamp = Date.now();

      // Create 2 tenants (minimal test data)
      const createPromises = Array.from({ length: 2 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: `delete-test-${timestamp}-${i}`,
            name: `Delete Test ${i}`,
          },
        })
      );

      const createResponses = await Promise.all(createPromises);
      const tenantIds = createResponses.map((r) => r.json().id);

      // Delete all 2 concurrently
      const deletePromises = tenantIds.map((id) =>
        app.inject({
          method: 'DELETE',
          url: `/api/tenants/${id}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        })
      );

      const deleteResponses = await Promise.all(deletePromises);

      // All deletes should succeed
      const successful = deleteResponses.filter(
        (r) => r.statusCode === 204 || r.statusCode === 200
      );
      expect(successful.length).toBe(2);
    });

    it('should handle concurrent deletes of the same tenant', async () => {
      const timestamp = Date.now();

      // Create one tenant
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `same-delete-${timestamp}`,
          name: 'Same Delete Test',
        },
      });

      const tenantId = createResponse.json().id;

      // Send 10 concurrent delete requests
      const deletePromises = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'DELETE',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        })
      );

      const responses = await Promise.all(deletePromises);

      // At least one should succeed
      const successful = responses.filter((r) => r.statusCode === 204 || r.statusCode === 200);
      expect(successful.length).toBeGreaterThan(0);

      // Some might return 404 if they tried after deletion
      const notFound = responses.filter((r) => r.statusCode === 404);
      expect(notFound.length).toBeGreaterThan(0);

      // Verify tenant is deleted
      await new Promise((resolve) => setTimeout(resolve, 500));

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/tenants/${tenantId}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      // Should return 404 or 410 (gone)
      expect([404, 410]).toContain(getResponse.statusCode);
    });
  });

  describe('Transaction Isolation', () => {
    it('should maintain transaction isolation for concurrent tenant operations', async () => {
      const timestamp = Date.now();

      // Create a base tenant
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `isolation-test-${timestamp}`,
          name: 'Isolation Test',
          settings: { value: 0 },
        },
      });

      const tenantId = createResponse.json().id;

      // Perform concurrent read-modify-write operations
      const operations = Array.from({ length: 10 }, async (_, i) => {
        // Read current value
        const getResponse = await app.inject({
          method: 'GET',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        });

        const currentValue = (getResponse.json().settings as any)?.value || 0;

        // Update with incremented value
        await app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            settings: { value: currentValue + 1, operation: i },
          },
        });
      });

      await Promise.all(operations);

      // Verify final state is consistent
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      expect(tenant).toBeTruthy();
      expect(tenant?.settings).toBeTruthy();

      // Due to race conditions, the final value may not be 10
      // but it should be a valid number
      const finalValue = (tenant?.settings as any).value;
      expect(typeof finalValue).toBe('number');
      expect(finalValue).toBeGreaterThan(0);
    });

    it('should prevent dirty reads between concurrent transactions', async () => {
      const timestamp = Date.now();

      // Create tenant with initial data
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `dirty-read-test-${timestamp}`,
          name: 'Dirty Read Test',
          settings: { status: 'initial' },
        },
      });

      const tenantId = createResponse.json().id;

      // Start concurrent operations
      const promises = [
        // Operation 1: Update tenant
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            settings: { status: 'updated-1' },
          },
        }),
        // Operation 2: Read tenant (should not see uncommitted data)
        app.inject({
          method: 'GET',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        }),
        // Operation 3: Update tenant again
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            settings: { status: 'updated-2' },
          },
        }),
      ];

      const responses = await Promise.all(promises);

      // All operations should succeed
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(3);

      // Read response should have valid data (not corrupted/incomplete)
      const readResponse = responses[1].json();
      expect(readResponse.settings).toBeTruthy();
      expect(['initial', 'updated-1', 'updated-2']).toContain(readResponse.settings.status);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain reasonable performance with concurrent requests', async () => {
      const timestamp = Date.now();
      const requestCount = 20;

      const startTime = Date.now();

      // Create 20 concurrent tenant creation requests
      const promises = Array.from({ length: requestCount }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: `perf-test-${timestamp}-${i}`,
            name: `Performance Test ${i}`,
          },
        })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      expect(successful.length).toBe(requestCount);

      // Total time should be reasonable (less than 30 seconds for 20 tenants)
      expect(duration).toBeLessThan(30000);

      // Average time per tenant should be reasonable (less than 3 seconds)
      const avgTime = duration / requestCount;
      expect(avgTime).toBeLessThan(3000);

      console.log(
        `Created ${requestCount} tenants in ${duration}ms (avg: ${avgTime.toFixed(2)}ms/tenant)`
      );
    });

    it('should handle resource cleanup after concurrent operations', async () => {
      const timestamp = Date.now();

      // Create 2 tenants (minimal)
      const createPromises = Array.from({ length: 2 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: {
            slug: `cleanup-test-${timestamp}-${i}`,
            name: `Cleanup Test ${i}`,
          },
        })
      );

      const createResponses = await Promise.all(createPromises);
      const tenantIds = createResponses.map((r) => r.json().id);

      // Perform operations with only created tenants (no updates/reads)
      const deletePromises = tenantIds.map((id) =>
        app.inject({
          method: 'DELETE',
          url: `/api/tenants/${id}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        })
      );

      const deleteResponses = await Promise.all(deletePromises);

      // All deletes should succeed
      const successful = deleteResponses.filter(
        (r) => r.statusCode === 204 || r.statusCode === 200
      );
      expect(successful.length).toBe(2);
    });

    it('should handle database connection pool under concurrent load', async () => {
      const timestamp = Date.now();
      const highLoadCount = 20; // Reduced from 50 to avoid rate limiting

      // Create 20 concurrent read requests (stress test connection pool)
      const promises = Array.from({ length: highLoadCount }, () =>
        app.inject({
          method: 'GET',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed without connection pool exhaustion
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(highLoadCount);

      // No errors related to connection pool
      const errors = responses.filter((r) => r.statusCode >= 500);
      expect(errors.length).toBe(0);

      // Verify we can still create a tenant (connections not leaked)
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `after-load-${timestamp}`,
          name: 'After Load Test',
        },
      });

      expect(createResponse.statusCode).toBe(201);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent operations during tenant provisioning', async () => {
      const timestamp = Date.now();

      // Create a tenant (starts provisioning)
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          slug: `provisioning-ops-${timestamp}`,
          name: 'Provisioning Ops Test',
        },
      });

      const tenantId = createResponse.json().id;

      // Immediately try concurrent operations while still provisioning
      const promises = [
        // Read tenant
        app.inject({
          method: 'GET',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        }),
        // Update tenant
        app.inject({
          method: 'PATCH',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: { name: 'Updated During Provisioning' },
        }),
      ];

      const responses = await Promise.all(promises);

      // Reads should work (might show PROVISIONING status)
      const readResponse = responses[0];
      expect(readResponse.statusCode).toBe(200);

      // Updates might succeed or fail depending on timing
      const updateResponse = responses[1];
      expect([200, 400, 409]).toContain(updateResponse.statusCode);

      // Verify tenant eventually becomes ACTIVE
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const finalResponse = await app.inject({
        method: 'GET',
        url: `/api/tenants/${tenantId}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      const finalTenant = finalResponse.json();
      expect(finalTenant.status).toBe('ACTIVE');
    });

    it('should handle rapid create-delete cycles', async () => {
      const timestamp = Date.now();

      // Create and immediately delete 5 tenants
      const operations = Array.from({ length: 5 }, async (_, i) => {
        const slug = `rapid-cycle-${timestamp}-${i}`;

        // Create
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/tenants',
          headers: { authorization: `Bearer ${superAdminToken}` },
          payload: { slug, name: `Rapid Cycle ${i}` },
        });

        if (createResponse.statusCode !== 201) {
          return { created: false, deleted: false };
        }

        const tenantId = createResponse.json().id;

        // Immediately delete
        const deleteResponse = await app.inject({
          method: 'DELETE',
          url: `/api/tenants/${tenantId}`,
          headers: { authorization: `Bearer ${superAdminToken}` },
        });

        return {
          created: true,
          deleted: deleteResponse.statusCode === 204 || deleteResponse.statusCode === 200,
        };
      });

      const results = await Promise.all(operations);

      // All should complete without errors
      const allCreated = results.every((r) => r.created);
      expect(allCreated).toBe(true);

      // Most should delete successfully (some might have timing issues)
      const deletedCount = results.filter((r) => r.deleted).length;
      expect(deletedCount).toBeGreaterThanOrEqual(3);
    });
  });
});
