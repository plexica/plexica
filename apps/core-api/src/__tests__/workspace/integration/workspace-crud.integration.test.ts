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
  let superAdminToken: string;
  let adminToken: string;
  let memberToken: string;
  let adminUserId: string;
  let memberUserId: string;
  let testTenantSlug: string;
  let schemaName: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    try {
      console.log('Step 1: Starting beforeAll hook...');

      // Reset all state
      console.log('Step 2: Resetting test context...');
      await testContext.resetAll();
      console.log('Step 2: Test context reset complete');

      // Build test app
      console.log('Step 3: Building test app...');
      app = await buildTestApp();
      console.log('Step 3: Test app built, checking if valid:', !!app);

      console.log('Step 4: Waiting for app.ready()...');
      await app.ready();
      console.log('Step 4: App ready');

      // Get super admin token to create tenant
      // Use mock tokens for integration tests (faster and more reliable)
      console.log('Step 5: Creating super admin token...');
      superAdminToken = testContext.auth.createMockSuperAdminToken();
      console.log('Step 5: Super admin token created');

      // Generate unique tenant slug for test isolation
      testTenantSlug = `acme-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
      console.log('Step 6: Generated tenant slug:', testTenantSlug);

      // Create test tenant
      console.log('Step 7: Creating tenant via POST /api/admin/tenants...');
      const tenantResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          slug: testTenantSlug,
          name: 'ACME Corporation',
          adminEmail: `admin@${testTenantSlug}.test`,
          adminPassword: 'test123',
        },
      });
      console.log('Step 7: Tenant response status:', tenantResponse.statusCode);

      if (tenantResponse.statusCode !== 201) {
        console.error('❌ Failed to create tenant. Response body:', tenantResponse.body);
        throw new Error(`Failed to create test tenant: ${tenantResponse.body}`);
      }

      // Get tenant ID from response
      const tenant = tenantResponse.json();
      const tenantId = tenant.id;
      console.log('Step 8: Tenant created with ID:', tenantId);

      // Use mock tokens for integration tests (more reliable than real Keycloak tokens)
      // IMPORTANT: Mock tokens need tenantSlug (not tenantId) to match auth middleware expectations
      // Use valid UUIDs since the API validates userId format
      console.log('Step 9: Creating mock tokens...');
      adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
        sub: 'c3c3c3c3-3333-4333-c333-333333333333',
        email: `admin@${testTenantSlug}.test`,
        given_name: 'Test',
        family_name: 'Admin',
      });

      memberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug, {
        sub: 'd4d4d4d4-4444-4444-d444-444444444444',
        email: `member@${testTenantSlug}.test`,
        given_name: 'Test',
        family_name: 'Member',
      });
      console.log('Step 9: Mock tokens created');

      // Decode tokens to get user IDs and verify tenantSlug
      console.log('Step 10: Decoding tokens to get user IDs...');
      const adminDecoded = testContext.auth.decodeToken(adminToken);
      const memberDecoded = testContext.auth.decodeToken(memberToken);

      console.log('Admin token payload:', JSON.stringify(adminDecoded, null, 2));
      console.log('Admin token tenantSlug:', adminDecoded.tenantSlug);
      console.log('Expected tenantSlug:', testTenantSlug);

      adminUserId = adminDecoded.sub;
      memberUserId = memberDecoded.sub;
      console.log('Step 10: User IDs extracted - Admin:', adminUserId, 'Member:', memberUserId);

      // Step 11: Create test users in the tenant schema
      // The workspace service expects users to exist when creating workspace members
      console.log('Step 11: Creating test users in database...');
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        adminUserId,
        adminUserId,
        `admin@${testTenantSlug}.test`,
        'Test',
        'Admin'
      );

      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        memberUserId,
        memberUserId,
        `member@${testTenantSlug}.test`,
        'Test',
        'Member'
      );
      console.log('Step 11: Test users created');

      console.log('✅ beforeAll hook complete!');
    } catch (error) {
      console.error('❌ beforeAll FAILED with error:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup created workspaces
    const schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
    for (const id of createdWorkspaceIds) {
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM "${schemaName}"."workspace_members" WHERE "workspace_id" = $1`,
          id
        );
        await db.$executeRawUnsafe(`DELETE FROM "${schemaName}"."workspaces" WHERE "id" = $1`, id);
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `test-workspace-${Date.now()}`,
          name: 'Test Workspace',
          description: 'A test workspace',
          settings: { theme: 'dark' },
        },
      });

      if (response.statusCode !== 201) {
        console.log('❌ Test failed! Response status:', response.statusCode);
        console.log('Response body:', response.body);
      }

      expect(response.statusCode).toBe(201);
      const workspace = response.json();

      expect(workspace).toHaveProperty('id');
      expect(workspace.slug).toMatch(/test-workspace-\d+/);
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.description).toBe('A test workspace');
      expect(workspace.settings).toEqual({ theme: 'dark' });

      createdWorkspaceIds.push(workspace.id);

      // Verify in database
      const schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
      const dbWorkspace = (await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspaces" WHERE "id" = $1`,
        workspace.id
      )) as any[];

      expect(dbWorkspace).toHaveLength(1);
      expect(dbWorkspace[0].slug).toBe(workspace.slug);
    });

    it('should make creator ADMIN automatically', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `creator-admin-${Date.now()}`,
          name: 'Creator Admin Test',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      // Verify creator is admin
      const schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
      const membership = (await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspace_members" WHERE "workspace_id" = $1 AND "user_id" = $2`,
        workspace.id,
        adminUserId
      )) as any[];

      expect(membership).toHaveLength(1);
      expect(membership[0].role).toBe(WorkspaceRole.ADMIN);
    });

    it('should validate slug uniqueness per tenant', async () => {
      const slug = `unique-slug-${Date.now()}`;

      // Create first workspace
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: { slug, name: 'First Workspace' },
      });

      expect(response1.statusCode).toBe(201);
      createdWorkspaceIds.push(response1.json().id);

      // Try to create with same slug
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: { slug, name: 'Second Workspace' },
      });

      expect(response2.statusCode).toBe(409);
      const body = response2.json();
      expect(body.error.message).toMatch(/already exists|duplicate/i);
    });

    it('should set default settings if not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
          headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
          payload: { slug, name: 'Test Workspace' },
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should require name field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `member-created-${Date.now()}`,
          name: 'Member Created Workspace',
        },
      });

      expect(response.statusCode).toBe(201);
      const workspace = response.json();
      createdWorkspaceIds.push(workspace.id);

      // Member should be admin of their own workspace
      const schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;
      const membership = (await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspace_members" WHERE "workspace_id" = $1 AND "user_id" = $2`,
        workspace.id,
        memberUserId
      )) as any[];

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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': testTenantSlug },
      });

      // Either 404 or 403 is acceptable
      expect([403, 404]).toContain(otherUserResponse.statusCode);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `update-test-${Date.now()}`,
          name: 'Update Test Workspace',
        },
      });

      workspaceId = response.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        memberUserId,
        memberDecoded.sub,
        memberDecoded.email,
        memberDecoded.given_name || 'Member',
        memberDecoded.family_name || 'User'
      );

      // Add member to workspace
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES ($1, $2, 'MEMBER', $3, NOW())
        ON CONFLICT DO NOTHING`,
        workspaceId,
        memberUserId,
        adminUserId
      );
    });

    it('should update workspace name (ADMIN only)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          name: 'Updated Workspace Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace.name).toBe('Updated Workspace Name');

      // Verify in database
      const dbWorkspace = (await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspaces" WHERE "id" = $1`,
        workspaceId
      )) as any[];

      expect(dbWorkspace[0].name).toBe('Updated Workspace Name');
    });

    it('should update workspace description (ADMIN only)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
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
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `delete-test-${Date.now()}`,
          name: 'Delete Test Workspace',
        },
      });

      const workspaceId = createResponse.json().id;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify deletion
      const dbWorkspace = await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspaces" WHERE "id" = $1`,
        workspaceId
      );

      expect(dbWorkspace).toHaveLength(0);
    });

    it('should prevent deletion with teams', async () => {
      // Create workspace with team
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `delete-with-teams-${Date.now()}`,
          name: 'Delete With Teams Test',
        },
      });

      const workspaceId = createResponse.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Create a team
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."teams" ("id", "workspace_id", "name", "owner_id", "created_at", "updated_at")
        VALUES (gen_random_uuid(), $1, 'Test Team', $2, NOW(), NOW())`,
        workspaceId,
        adminUserId
      );

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(deleteResponse.statusCode).toBe(400);
      const body = deleteResponse.json();
      expect(body.error.message).toMatch(/teams|cannot delete/i);
    });

    it('should cascade delete members', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `delete-cascade-${Date.now()}`,
          name: 'Delete Cascade Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        memberUserId,
        memberDecoded.sub,
        memberDecoded.email,
        memberDecoded.given_name || 'Member',
        memberDecoded.family_name || 'User'
      );

      // Add additional member
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES ($1, $2, 'MEMBER', $3, NOW())`,
        workspaceId,
        memberUserId,
        adminUserId
      );

      // Delete workspace
      await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      // Verify members are deleted
      const dbMembers = await db.$queryRawUnsafe(
        `SELECT * FROM "${schemaName}"."workspace_members" WHERE "workspace_id" = $1`,
        workspaceId
      );

      expect(dbMembers).toHaveLength(0);
    });

    it('should return 403 for non-admin', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
        payload: {
          slug: `delete-auth-test-${Date.now()}`,
          name: 'Delete Auth Test',
        },
      });

      const workspaceId = createResponse.json().id;
      createdWorkspaceIds.push(workspaceId);

      // Ensure member user exists in tenant schema
      const memberDecoded = testContext.auth.decodeToken(memberToken);
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" ("id", "keycloak_id", "email", "first_name", "last_name", "created_at", "updated_at")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        memberUserId,
        memberDecoded.sub,
        memberDecoded.email,
        memberDecoded.given_name || 'Member',
        memberDecoded.family_name || 'User'
      );

      // Add member
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."workspace_members" ("workspace_id", "user_id", "role", "invited_by", "joined_at")
        VALUES ($1, $2, 'MEMBER', $3, NOW())`,
        workspaceId,
        memberUserId,
        adminUserId
      );

      // Try to delete as member
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${memberToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(deleteResponse.statusCode).toBe(403);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/workspaces/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
