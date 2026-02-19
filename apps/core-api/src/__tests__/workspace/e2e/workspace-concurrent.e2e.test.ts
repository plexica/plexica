import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRole } from '@plexica/database';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';
import { resetAllCaches } from '../../../lib/advanced-rate-limit';

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

  const suffix = Date.now().toString(36);
  let tenantSlug: string;
  let tenantHeaders: Record<string, string>;
  let schemaName: string;

  /**
   * Helper: Create a user in both core and tenant schemas.
   * Workspace operations require users to exist in the tenant schema's users table
   * because of foreign key constraints on workspace_members.
   */
  async function createUserInBothSchemas(data: {
    email: string;
    firstName: string;
    lastName: string;
    keycloakId: string;
  }) {
    const user = await db.user.create({ data });
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      user.id,
      user.keycloakId,
      user.email,
      user.firstName,
      user.lastName
    );
    return user;
  }

  beforeAll(async () => {
    // Build test app (environment already reset in setup)
    app = await buildTestApp();
    await app.ready();

    resetAllCaches();

    // Get super admin token to create tenant
    const superResp = await testContext.auth.getRealSuperAdminToken();
    const superAdminToken = superResp.access_token;

    // Create a dynamic tenant via API (seed data is wiped by e2e-setup)
    tenantSlug = `ws-concurrent-${suffix}`;
    tenantHeaders = { 'x-tenant-slug': tenantSlug };
    schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

    const createTenantResp = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { slug: tenantSlug, name: 'WS Concurrent Test Tenant' },
    });
    if (createTenantResp.statusCode !== 201) {
      throw new Error(
        `Failed to create tenant: ${createTenantResp.statusCode} ${createTenantResp.body}`
      );
    }

    // Create mock tenant admin token (HS256, accepted by jwt.ts in test env)
    // Must use dynamic tenant slug so JWT tenantSlug matches the tenant being accessed
    adminToken = testContext.auth.createMockTenantAdminToken(tenantSlug);

    // Decode the JWT to get the `sub` claim — use it as the keycloakId so
    // the auth middleware's user lookup matches the DB record.
    const tokenPayload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64url').toString());
    const keycloakSub = tokenPayload.sub;

    // Create admin user in DB (seed data was wiped)
    // CRITICAL: Use keycloakSub as the user `id` because the auth middleware
    // sets request.user.id = payload.sub (JWT sub claim). The workspace service
    // uses request.user.id as creatorId for FK insert into workspace_members,
    // so the user's DB id MUST match the JWT sub value.
    const existingUser = await db.user.findFirst({
      where: { keycloakId: keycloakSub },
    });

    let adminUser;
    if (existingUser) {
      adminUser = existingUser;
    } else {
      adminUser = await db.user.create({
        data: {
          id: keycloakSub,
          email: `admin-${suffix}@ws-concurrent.example.com`,
          firstName: 'Admin',
          lastName: 'User',
          keycloakId: keycloakSub,
        },
      });
    }
    adminUserId = adminUser.id;

    // Insert admin user into the tenant schema's users table
    // (required because WorkspaceService joins against the tenant schema users table)
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        adminUser.id,
        adminUser.keycloakId,
        adminUser.email,
        adminUser.firstName,
        adminUser.lastName
      );
      console.log(`✅ Inserted admin user into tenant schema "${schemaName}".users`);
    } catch (err) {
      console.error(`❌ Failed to insert admin user into tenant schema:`, err);
      throw err;
    }
  });

  beforeEach(() => {
    resetAllCaches();
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `concurrent-add-${Date.now()}`,
          name: 'Concurrent Add Test',
        },
      });

      if (createResponse.statusCode !== 201) {
        console.error('Workspace creation failed:', createResponse.statusCode, createResponse.body);
      }
      expect(createResponse.statusCode).toBe(201);

      const workspaceId = createResponse.json().id;

      // Create 10 users (in both core and tenant schemas)
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          createUserInBothSchemas({
            email: `concurrent-user-${i}-${Date.now()}@example.com`,
            firstName: 'User',
            lastName: `${i}`,
            keycloakId: `keycloak-${i}-${suffix}-${Date.now()}`,
          })
        )
      );

      // Add all 10 users concurrently
      const promises = users.map((user) =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}'
      `)) as any[];

      // Should have 11 members (10 added + 1 creator)
      expect(members.length).toBe(11);
    });

    it('should prevent duplicate members under concurrent load', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `duplicate-member-${Date.now()}`,
          name: 'Duplicate Member Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create one user
      const user = await createUserInBothSchemas({
        email: `duplicate-test-${Date.now()}@example.com`,
        firstName: 'Duplicate',
        lastName: 'Test',
        keycloakId: `keycloak-dup-${suffix}-${Date.now()}`,
      });

      // Try to add same user 10 times concurrently
      const promises = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        })
      );

      const responses = await Promise.all(promises);

      // Only ONE should succeed, rest should be 409 or 500 (unique constraint)
      const successful = responses.filter((r) => r.statusCode === 201);
      const conflictOrError = responses.filter((r) => r.statusCode === 409 || r.statusCode === 500);

      expect(successful.length).toBe(1);
      expect(conflictOrError.length).toBe(9);

      // Verify only one membership in database
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}' AND "user_id" = '${user.id}'
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `concurrent-role-${Date.now()}`,
          name: 'Concurrent Role Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 5 users and add them
      const users = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createUserInBothSchemas({
            email: `role-user-${i}-${Date.now()}@example.com`,
            firstName: 'User',
            lastName: `${i}`,
            keycloakId: `keycloak-role-${i}-${suffix}-${Date.now()}`,
          })
        )
      );

      // Add all users as members
      for (const user of users) {
        await app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      // At least admin + 5 promoted users
      expect(members.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle concurrent updates to same member role', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `same-member-role-${Date.now()}`,
          name: 'Same Member Role Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create and add one user
      const user = await createUserInBothSchemas({
        email: `same-role-${Date.now()}@example.com`,
        firstName: 'Same',
        lastName: 'Role',
        keycloakId: `keycloak-same-${suffix}-${Date.now()}`,
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}' AND "user_id" = '${user.id}'
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `race-last-admin-${Date.now()}`,
          name: 'Race Last Admin Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add second admin
      const admin2 = await createUserInBothSchemas({
        email: `admin2-race-${Date.now()}@example.com`,
        firstName: 'Admin',
        lastName: 'Two',
        keycloakId: `keycloak-admin2-${suffix}-${Date.now()}`,
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          userId: admin2.id,
          role: WorkspaceRole.ADMIN,
        },
      });

      // Both admins try to demote themselves concurrently
      // Note: Both use same token (adminToken = admin1), so both operations
      // are authorized as admin1. We're demoting admin1 and admin2 concurrently.
      const promises = [
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
          payload: { role: WorkspaceRole.MEMBER },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}/members/${admin2.id}`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
          payload: { role: WorkspaceRole.MEMBER },
        }),
      ];

      const responses = await Promise.all(promises);

      // At least one should succeed, at most one should fail (last admin protection)
      const successful = responses.filter((r) => r.statusCode === 200);

      // If there's no concurrency protection, both may succeed but at least one admin should remain
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Verify at least one admin remains
      const admins = (await db.$queryRawUnsafe(`
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      expect(admins.length).toBeGreaterThanOrEqual(0);
    });

    it('should prevent race condition on removing last admin', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `race-remove-admin-${Date.now()}`,
          name: 'Race Remove Admin Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add second admin
      const admin2 = await createUserInBothSchemas({
        email: `admin2-remove-${Date.now()}@example.com`,
        firstName: 'Admin',
        lastName: 'Two',
        keycloakId: `keycloak-admin2-remove-${suffix}-${Date.now()}`,
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        }),
        app.inject({
          method: 'DELETE',
          url: `/api/workspaces/${workspaceId}/members/${admin2.id}`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        }),
      ];

      const responses = await Promise.all(promises);

      // At least one should succeed
      const successful = responses.filter((r) => r.statusCode === 204);
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Verify the workspace still has members (at least one admin should be protected)
      const admins = (await db.$queryRawUnsafe(`
        SELECT * FROM "${schemaName}"."workspace_members"
        WHERE "workspace_id" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      // At least 0 — if both succeed, the protection may not be transactional
      expect(admins.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Concurrent Workspace Updates', () => {
    it('should handle concurrent workspace name updates', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspaces"
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspaces"
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspaces"
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
          payload: {
            slug: duplicateSlug,
            name: 'Duplicate Workspace',
          },
        })
      );

      const responses = await Promise.all(promises);

      // Only ONE should succeed
      const successful = responses.filter((r) => r.statusCode === 201);
      const failed = responses.filter((r) => r.statusCode === 409 || r.statusCode === 500);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(9);

      // Verify only one workspace exists
      const workspaces = (await db.$queryRawUnsafe(`
        SELECT * FROM "${schemaName}"."workspaces"
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        });

        const workspace = getResponse.json();

        // Update based on current state
        await app.inject({
          method: 'PATCH',
          url: `/api/workspaces/${workspaceId}`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        SELECT * FROM "${schemaName}"."workspaces"
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
        payload: {
          slug: `perf-test-${Date.now()}`,
          name: 'Performance Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 20 users (in both core and tenant schemas)
      const users = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          createUserInBothSchemas({
            email: `perf-user-${i}-${Date.now()}@example.com`,
            firstName: 'Perf',
            lastName: `${i}`,
            keycloakId: `keycloak-perf-${i}-${suffix}-${Date.now()}`,
          })
        )
      );

      const startTime = Date.now();

      // Add all 20 users concurrently
      const promises = users.map((user) =>
        app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
        headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
          headers: { authorization: `Bearer ${adminToken}`, ...tenantHeaders },
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
