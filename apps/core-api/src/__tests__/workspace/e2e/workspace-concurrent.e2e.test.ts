import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRole } from '@plexica/database';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';

/**
 * E2E Tests: Workspace Concurrent Operations
 *
 * Tests the system's behavior under concurrent load:
 * - Concurrent member additions
 * - Concurrent role updates
 * - Race conditions on last admin protection
 * - Concurrent workspace updates
 * - Transaction isolation
 *
 * These tests ensure the system handles race conditions correctly
 * and maintains data integrity under concurrent load.
 */
describe('Workspace Concurrent Operations E2E', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    // Reset all state
    await testContext.resetAll();

    // Build test app
    app = await buildTestApp();
    await app.ready();

    // Get admin token
    const adminTokenResp = await testContext.auth.getRealTenantAdminToken('acme-corp');
    adminToken = adminTokenResp.access_token;

    // Get user ID
    const adminUser = await db.user.findFirst({
      where: { email: 'test-tenant-admin-acme@example.com' },
    });
    adminUserId = adminUser!.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Concurrent Member Additions', () => {
    it('should handle concurrent member additions to same workspace', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `concurrent-add-${Date.now()}`,
          name: 'Concurrent Add Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 10 users
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          db.user.create({
            data: {
              email: `concurrent-user-${i}-${Date.now()}@example.com`,
              firstName: 'User',
              lastName: `${i}`,
              keycloakId: `keycloak-${i}-${Date.now()}`,
            },
          })
        )
      );

      // Add all 10 users concurrently
      const promises = users.map((user) =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      expect(successful.length).toBe(10);

      // Verify all members in database
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
      `)) as any[];

      // Should have 11 members (10 added + 1 creator)
      expect(members.length).toBe(11);
    });

    it('should prevent duplicate members under concurrent load', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `duplicate-member-${Date.now()}`,
          name: 'Duplicate Member Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create one user
      const user = await db.user.create({
        data: {
          email: `duplicate-test-${Date.now()}@example.com`,
          firstName: 'Duplicate',
          lastName: 'Test',
          keycloakId: `keycloak-dup-${Date.now()}`,
        },
      });

      // Try to add same user 10 times concurrently
      const promises = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        })
      );

      const responses = await Promise.all(promises);

      // Only ONE should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode === 409);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(9);

      // Verify only one membership in database
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${user.id}'
      `)) as any[];

      expect(members.length).toBe(1);
    });
  });

  describe('Concurrent Role Updates', () => {
    it('should handle concurrent role updates to different members', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `concurrent-role-${Date.now()}`,
          name: 'Concurrent Role Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 5 users and add them
      const users = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          db.user.create({
            data: {
              email: `role-user-${i}-${Date.now()}@example.com`,
              firstName: 'User',
              lastName: `${i}`,
              keycloakId: `keycloak-role-${i}-${Date.now()}`,
            },
          })
        )
      );

      // Add all users as members
      for (const user of users) {
        await app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        });
      }

      // Update all roles concurrently (promote to admin)
      const promises = users.map((user) =>
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${user.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            role: WorkspaceRole.ADMIN,
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(5);

      // Verify all are admins
      const members = (await db.$queryRawUnsafe(
        `
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = ANY($1::text[])
      `,
        [users.map((u) => u.id)]
      )) as any[];

      members.forEach((member) => {
        expect(member.role).toBe(WorkspaceRole.ADMIN);
      });
    });

    it('should handle concurrent updates to same member role', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `same-member-role-${Date.now()}`,
          name: 'Same Member Role Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create and add one user
      const user = await db.user.create({
        data: {
          email: `same-role-${Date.now()}@example.com`,
          firstName: 'Same',
          lastName: 'Role',
          keycloakId: `keycloak-same-${Date.now()}`,
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: user.id,
          role: WorkspaceRole.MEMBER,
        },
      });

      // Send 10 concurrent role updates
      const promises = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${user.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            role: i % 2 === 0 ? WorkspaceRole.ADMIN : WorkspaceRole.VIEWER,
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed (or most should succeed)
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBeGreaterThan(0);

      // Verify member has a valid role (one of the attempted updates)
      const member = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${user.id}'
      `)) as any[];

      expect(member.length).toBe(1);
      expect([WorkspaceRole.ADMIN, WorkspaceRole.VIEWER]).toContain(member[0].role);
    });
  });

  describe('Race Condition on Last Admin Protection', () => {
    it('should prevent race condition when two admins try to remove themselves', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `race-last-admin-${Date.now()}`,
          name: 'Race Last Admin Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add second admin
      const admin2 = await db.user.create({
        data: {
          email: `admin2-race-${Date.now()}@example.com`,
          firstName: 'Admin',
          lastName: 'Two',
          keycloakId: `keycloak-admin2-${Date.now()}`,
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: admin2.id,
          role: WorkspaceRole.ADMIN,
        },
      });

      // Both admins try to demote themselves concurrently
      const promises = [
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { role: WorkspaceRole.MEMBER },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${admin2.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { role: WorkspaceRole.MEMBER },
        }),
      ];

      const responses = await Promise.all(promises);

      // One should succeed, one should fail
      const successful = responses.filter((r) => r.statusCode === 200);
      const failed = responses.filter((r) => r.statusCode === 400);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify at least one admin remains
      const admins = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      expect(admins.length).toBeGreaterThanOrEqual(1);
    });

    it('should prevent race condition on removing last admin', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `race-remove-admin-${Date.now()}`,
          name: 'Race Remove Admin Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add second admin
      const admin2 = await db.user.create({
        data: {
          email: `admin2-remove-${Date.now()}@example.com`,
          firstName: 'Admin',
          lastName: 'Two',
          keycloakId: `keycloak-admin2-remove-${Date.now()}`,
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: admin2.id,
          role: WorkspaceRole.ADMIN,
        },
      });

      // Both admins try to remove themselves concurrently
      const promises = [
        app.inject({
          method: 'DELETE',
          url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        }),
        app.inject({
          method: 'DELETE',
          url: `/api/workspaces/${workspaceId}/members/${admin2.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
        }),
      ];

      const responses = await Promise.all(promises);

      // One should succeed, one should fail
      const successful = responses.filter((r) => r.statusCode === 204);
      const failed = responses.filter((r) => r.statusCode === 400);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify exactly one admin remains
      const admins = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      expect(admins.length).toBe(1);
    });
  });

  describe('Concurrent Workspace Updates', () => {
    it('should handle concurrent workspace name updates', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `concurrent-update-${Date.now()}`,
          name: 'Concurrent Update Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Send 10 concurrent name updates
      const promises = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: `Updated Name ${i}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed (last write wins)
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(10);

      // Verify workspace has one of the updated names
      const workspace = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."Workspace"
        WHERE "id" = '${workspaceId}'
      `)) as any[];

      expect(workspace.length).toBe(1);
      expect(workspace[0].name).toMatch(/Updated Name \d+/);
    });

    it('should handle concurrent settings updates', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `concurrent-settings-${Date.now()}`,
          name: 'Concurrent Settings Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Send concurrent settings updates
      const promises = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            settings: { counter: i, timestamp: Date.now() },
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(5);

      // Verify workspace has valid settings
      const workspace = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."Workspace"
        WHERE "id" = '${workspaceId}'
      `)) as any[];

      expect(workspace.length).toBe(1);
      expect(workspace[0].settings).toBeDefined();
      expect(typeof workspace[0].settings).toBe('object');
    });
  });

  describe('Concurrent Workspace Creation', () => {
    it('should handle concurrent workspace creation with different slugs', async () => {
      const timestamp = Date.now();

      // Create 10 workspaces concurrently with unique slugs
      const promises = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/workspaces',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            slug: `concurrent-ws-${timestamp}-${i}`,
            name: `Concurrent Workspace ${i}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      expect(successful.length).toBe(10);

      // Verify all workspaces in database
      const workspaces = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."Workspace"
        WHERE "slug" LIKE 'concurrent-ws-${timestamp}-%'
      `)) as any[];

      expect(workspaces.length).toBe(10);
    });

    it('should prevent duplicate slugs under concurrent load', async () => {
      const duplicateSlug = `duplicate-ws-${Date.now()}`;

      // Try to create 10 workspaces with same slug concurrently
      const promises = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/workspaces',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            slug: duplicateSlug,
            name: 'Duplicate Workspace',
          },
        })
      );

      const responses = await Promise.all(promises);

      // Only ONE should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode === 409);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(9);

      // Verify only one workspace exists
      const workspaces = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."Workspace"
        WHERE "slug" = '${duplicateSlug}'
      `)) as any[];

      expect(workspaces.length).toBe(1);
    });
  });

  describe('Transaction Isolation', () => {
    it('should maintain transaction isolation for workspace operations', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `transaction-isolation-${Date.now()}`,
          name: 'Transaction Isolation Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Perform concurrent read-modify-write operations
      const operations = Array.from({ length: 10 }, async (_, i) => {
        // Read current state
        const getResponse = await app.inject({
          method: 'GET',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        const workspace = getResponse.json();

        // Update based on current state
        await app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            settings: {
              ...workspace.settings,
              operation: i,
              timestamp: Date.now(),
            },
          },
        });
      });

      await Promise.all(operations);

      // Verify final state is consistent
      const workspace = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."Workspace"
        WHERE "id" = '${workspaceId}'
      `)) as any[];

      expect(workspace.length).toBe(1);
      expect(workspace[0].settings).toBeDefined();
      expect(typeof workspace[0].settings).toBe('object');
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with concurrent operations', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `perf-test-${Date.now()}`,
          name: 'Performance Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 20 users
      const users = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          db.user.create({
            data: {
              email: `perf-user-${i}-${Date.now()}@example.com`,
              firstName: 'Perf',
              lastName: `${i}`,
              keycloakId: `keycloak-perf-${i}-${Date.now()}`,
            },
          })
        )
      );

      const startTime = Date.now();

      // Add all 20 users concurrently
      const promises = users.map((user) =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        })
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      expect(successful.length).toBe(20);

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      console.log(`Added 20 members concurrently in ${duration}ms`);
    });

    it('should handle database connection pool under load', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          slug: `connection-pool-${Date.now()}`,
          name: 'Connection Pool Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Send 50 concurrent read requests
      const promises = Array.from({ length: 50 }, () =>
        app.inject({
          method: 'GET',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed (no connection pool exhaustion)
      const successful = responses.filter((r) => r.statusCode === 200);
      expect(successful.length).toBe(50);

      // No server errors
      const errors = responses.filter((r) => r.statusCode >= 500);
      expect(errors.length).toBe(0);
    });
  });
});
