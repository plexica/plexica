import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRole } from '@plexica/database';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';

/**
 * Integration Tests: Workspace CRUD Operations
 *
 * Tests complete workspace lifecycle with real database and authentication:
 * - Create workspace
 * - List workspaces
 * - Get workspace details
 * - Update workspace
 * - Delete workspace
 *
 * These tests use real Keycloak tokens and verify database state.
 */
describe('Workspace CRUD Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let adminUserId: string;
  let memberUserId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    // Reset all state
    await testContext.resetAll();

    // Build test app
    app = await buildTestApp();
    await app.ready();

    // Get super admin token to create tenant
    const superAdminResp = await testContext.auth.getRealSuperAdminToken();
    const superAdminToken = superAdminResp.access_token;

    // Create test tenant
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

    // Get tokens for admin and member
    const adminTokenResp = await testContext.auth.getRealTenantAdminToken('acme');
    adminToken = adminTokenResp.access_token;

    const memberTokenResp = await testContext.auth.getRealTenantMemberToken('acme');
    memberToken = memberTokenResp.access_token;

    // Decode tokens to get user IDs
    const adminDecoded = testContext.auth.decodeToken(adminToken);
    const memberDecoded = testContext.auth.decodeToken(memberToken);

    adminUserId = adminDecoded.sub;
    memberUserId = memberDecoded.sub;
  });

  afterAll(async () => {
    // Cleanup created workspaces
    for (const id of createdWorkspaceIds) {
      try {
        await db.$executeRaw`
          DELETE FROM "tenant_acme"."workspace_members" WHERE "workspace_id" = ${id}
        `;
        await db.$executeRaw`
          DELETE FROM "tenant_acme"."workspaces" WHERE "id" = ${id}
        `;
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    if (app) {
      await app.close();
    }
  });

  describe('POST /api/workspaces - Create Workspace', () => {
    it('should create workspace for authenticated user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `test-workspace-${Date.now()}`,
          name: 'Test Workspace',
          description: 'A test workspace',
          settings: { theme: 'dark' },
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();

      expect(workspace).toHaveProperty('id');
      expect(workspace.slug).toMatch(/test-workspace-\d+/);
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.description).toBe('A test workspace');
      expect(workspace.settings).toEqual({ theme: 'dark' });

      createdWorkspaceIds.push(workspace.id);

      // Verify in database
      const dbWorkspace = (await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspaces"
        WHERE "id" = ${workspace.id}
      `) as any[];

      expect(dbWorkspace).toHaveLength(1);
      expect(dbWorkspace[0].slug).toBe(workspace.slug);
    });

    it('should make creator ADMIN automatically', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `creator-admin-${Date.now()}`,
          name: 'Creator Admin Test',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      // Verify creator is admin
      const membership = (await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspace_members"
        WHERE "workspace_id" = ${workspace.id} AND "user_id" = ${adminUserId}
      `) as any[];

      expect(membership).toHaveLength(1);
      expect(membership[0].role).toBe(WorkspaceRole.ADMIN);
    });

    it('should validate slug uniqueness per tenant', async () => {
      const slug = `unique-slug-${Date.now()}`;

      // Create first workspace
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: { slug, name: 'First Workspace' },
      });

      expect(response1.statusCode).toBe(201);
      createdWorkspaceIds.push(response1.json().id);

      // Try to create with same slug
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: { slug, name: 'Second Workspace' },
      });

      expect(response2.statusCode).toBe(409);
      const body = response2.json();
      expect(body.message || body.error).toMatch(/already exists|duplicate/i);
    });

    it('should set default settings if not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `default-settings-${Date.now()}`,
          name: 'Default Settings Workspace',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      expect(workspace.settings).toBeDefined();
      expect(typeof workspace.settings).toBe('object');
    });

    it('should return 201 with workspace data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `response-check-${Date.now()}`,
          name: 'Response Check Workspace',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      // Should include essential fields
      expect(workspace).toHaveProperty('id');
      expect(workspace).toHaveProperty('slug');
      expect(workspace).toHaveProperty('name');
      expect(workspace).toHaveProperty('createdAt');
      expect(workspace).toHaveProperty('updatedAt');
      expect(workspace).toHaveProperty('members');
      expect(workspace).toHaveProperty('_count');
    });

    it('should reject invalid slug format', async () => {
      const invalidSlugs = ['UPPERCASE', 'with spaces', 'with_underscores', '@special'];

      for (const slug of invalidSlugs) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/workspaces',
          headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
          payload: { slug, name: 'Test Workspace' },
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should require name field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `no-name-${Date.now()}`,
          // name missing
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require slug field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          // slug missing
          name: 'Test Workspace',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should allow any authenticated user to create workspace', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `member-created-${Date.now()}`,
          name: 'Member Created Workspace',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      // Member should be admin of their own workspace
      const membership = (await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspace_members"
        WHERE "workspace_id" = ${workspace.id} AND "user_id" = ${memberUserId}
      `) as any[];

      expect(membership[0].role).toBe(WorkspaceRole.ADMIN);
    });
  });

  describe('GET /api/workspaces - List Workspaces', () => {
    let userWorkspaceId: string;

    beforeAll(async () => {
      // Create workspace for listing tests
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `list-test-${Date.now()}`,
          name: 'List Test Workspace',
        },
      });

      userWorkspaceId = response.json().id;
      createdWorkspaceIds.push(userWorkspaceId);
    });

    it("should list user's workspaces", async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBeGreaterThan(0);

      // Should only include workspaces where user is member
      const workspaceIds = workspaces.map((w: any) => w.id);
      expect(workspaceIds).toContain(userWorkspaceId);
    });

    it('should include role in each workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      workspaces.forEach((workspace: any) => {
        expect(workspace).toHaveProperty('memberRole');
        expect(['ADMIN', 'MEMBER', 'VIEWER']).toContain(workspace.memberRole);
      });
    });

    it('should filter by role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces?role=ADMIN',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      workspaces.forEach((workspace: any) => {
        expect(workspace.memberRole).toBe(WorkspaceRole.ADMIN);
      });
    });

    it('should paginate results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces?limit=5&offset=0',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBeLessThanOrEqual(5);
    });

    it('should sort by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces?sortBy=name&sortOrder=asc',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      if (workspaces.length > 1) {
        for (let i = 0; i < workspaces.length - 1; i++) {
          expect(workspaces[i].name.localeCompare(workspaces[i + 1].name)).toBeLessThanOrEqual(0);
        }
      }
    });

    it('should sort by creation date', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces?sortBy=createdAt&sortOrder=desc',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspaces = response.json();

      if (workspaces.length > 1) {
        for (let i = 0; i < workspaces.length - 1; i++) {
          const date1 = new Date(workspaces[i].createdAt).getTime();
          const date2 = new Date(workspaces[i + 1].createdAt).getTime();
          expect(date1).toBeGreaterThanOrEqual(date2);
        }
      }
    });
  });

  describe('GET /api/workspaces/:id - Get Workspace', () => {
    let workspaceId: string;

    beforeAll(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `get-test-${Date.now()}`,
          name: 'Get Test Workspace',
          description: 'Workspace for get tests',
        },
      });

      workspaceId = response.json().id;
      createdWorkspaceIds.push(workspaceId);
    });

    it('should get workspace details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.id).toBe(workspaceId);
      expect(workspace.name).toBe('Get Test Workspace');
      expect(workspace.description).toBe('Workspace for get tests');
    });

    it('should include member count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace).toHaveProperty('_count');
      expect(workspace._count).toHaveProperty('members');
      expect(workspace._count.members).toBeGreaterThan(0);
    });

    it('should include team count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace).toHaveProperty('_count');
      expect(workspace._count).toHaveProperty('teams');
      expect(typeof workspace._count.teams).toBe('number');
    });

    it("should include user's role", async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace).toHaveProperty('userRole');
      expect(workspace.userRole).toBe(WorkspaceRole.ADMIN);
    });

    it('should return 404 for non-member', async () => {
      // Use member token who is not in this workspace
      const otherUserResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': 'acme' },
      });

      // Either 404 or 403 is acceptable
      expect([403, 404]).toContain(otherUserResponse.statusCode);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/workspaces/:id - Update Workspace', () => {
    let workspaceId: string;

    beforeAll(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `update-test-${Date.now()}`,
          name: 'Update Test Workspace',
        },
      });

      workspaceId = response.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES (${memberUserId}, ${memberDecoded.sub}, ${memberDecoded.email}, ${memberDecoded.given_name || 'Member'}, ${memberDecoded.family_name || 'User'}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `;

      // Add member to workspace
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES (${workspaceId}, ${memberUserId}, 'MEMBER', ${adminUserId}, NOW())
        ON CONFLICT DO NOTHING
      `;
    });

    it('should update workspace name (ADMIN only)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          name: 'Updated Workspace Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.name).toBe('Updated Workspace Name');

      // Verify in database
      const dbWorkspace = (await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspaces"
        WHERE "id" = ${workspaceId}
      `) as any[];

      expect(dbWorkspace[0].name).toBe('Updated Workspace Name');
    });

    it('should update workspace description (ADMIN only)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.description).toBe('Updated description');
    });

    it('should update workspace settings (ADMIN only)', async () => {
      const newSettings = { theme: 'light', notifications: true };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          settings: newSettings,
        },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.settings).toEqual(newSettings);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          name: 'Unauthorized Update',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate updates', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          name: '', // Empty name invalid
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle partial updates', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          name: 'Partial Update Test',
          // Only updating name, not description or settings
        },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.name).toBe('Partial Update Test');
      // Description and settings should remain unchanged
      expect(workspace.description).toBe('Updated description');
    });
  });

  describe('DELETE /api/workspaces/:id - Delete Workspace', () => {
    it('should delete workspace (ADMIN only)', async () => {
      // Create workspace to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `delete-test-${Date.now()}`,
          name: 'Delete Test Workspace',
        },
      });

      const workspaceId = createResponse.json().id;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify deletion
      const dbWorkspace = await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspaces"
        WHERE "id" = ${workspaceId}
      `;

      expect(dbWorkspace).toHaveLength(0);
    });

    it('should prevent deletion with teams', async () => {
      // Create workspace with team
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `delete-with-teams-${Date.now()}`,
          name: 'Delete With Teams Test',
        },
      });

      const workspaceId = createResponse.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Create a team
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."teams" ("id", "workspace_id", "name", "owner_id", "created_at", "updated_at")
        VALUES (gen_random_uuid(), ${workspaceId}, 'Test Team', ${adminUserId}, NOW(), NOW())
      `;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(deleteResponse.statusCode).toBe(400);
      const body = deleteResponse.json();
      expect(body.message || body.error).toMatch(/teams|cannot delete/i);
    });

    it('should cascade delete members', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `delete-cascade-${Date.now()}`,
          name: 'Delete Cascade Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES (${memberUserId}, ${memberDecoded.sub}, ${memberDecoded.email}, ${memberDecoded.given_name || 'Member'}, ${memberDecoded.family_name || 'User'}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `;

      // Add additional member
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES (${workspaceId}, ${memberUserId}, 'MEMBER', ${adminUserId}, NOW())
      `;

      // Delete workspace
      await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      // Verify members are deleted
      const dbMembers = await db.$queryRaw`
        SELECT * FROM "tenant_acme"."workspace_members"
        WHERE "workspace_id" = ${workspaceId}
      `;

      expect(dbMembers).toHaveLength(0);
    });

    it('should return 403 for non-admin', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
        payload: {
          slug: `delete-auth-test-${Date.now()}`,
          name: 'Delete Auth Test',
        },
      });

      const workspaceId = createResponse.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES (${memberUserId}, ${memberDecoded.sub}, ${memberDecoded.email}, ${memberDecoded.given_name || 'Member'}, ${memberDecoded.family_name || 'User'}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `;

      // Add member
      await db.$executeRaw`
        INSERT INTO "tenant_acme"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES (${workspaceId}, ${memberUserId}, 'MEMBER', ${adminUserId}, NOW())
      `;

      // Try to delete as member
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(deleteResponse.statusCode).toBe(403);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/workspaces/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': 'acme' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
