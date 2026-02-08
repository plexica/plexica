import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import { db } from '../../../lib/db.js';
import { WorkspaceRole } from '@plexica/database';
import { tenantContextStorage, type TenantContext } from '../../../middleware/tenant-context.js';
import { testDb } from '../../../../../../test-infrastructure/helpers/test-database.helper.js';

/**
 * E2E Tests for Workspace Service
 *
 * These tests use the real database (PostgreSQL) instead of mocks
 * to verify that the workspace service works correctly with actual data.
 *
 * Requirements:
 * - PostgreSQL must be running (docker-compose up -d postgres)
 * - Database must be seeded (pnpm db:seed)
 *
 * Run with: pnpm test workspace.e2e
 */

describe('Workspace E2E Tests', () => {
  let workspaceService: WorkspaceService;
  let testTenantId: string;
  let testUserId: string;
  let secondUserId: string;
  let tenantSlug: string;
  let schemaName: string;
  const createdWorkspaceIds: string[] = [];
  let tenantContext: TenantContext;

  // Helper to run test in tenant context
  async function runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return await tenantContextStorage.run(tenantContext, fn);
  }

  beforeAll(async () => {
    workspaceService = new WorkspaceService();

    const suffix = Date.now();
    tenantSlug = `ws-lifecycle-${suffix}`;

    // Create test tenant dynamically (seed data is wiped by e2e-setup)
    const tenant = await db.tenant.create({
      data: {
        slug: tenantSlug,
        name: 'Workspace Lifecycle Test Tenant',
        status: 'ACTIVE',
      },
    });

    testTenantId = tenant.id;

    // Create the tenant schema with all tables (workspaces, workspace_members, users, teams, etc.)
    schemaName = await testDb.createTenantSchema(tenantSlug);

    // Create test user in core schema
    const user = await db.user.create({
      data: {
        email: `ws-lifecycle-user-${suffix}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        keycloakId: `kc-ws-lifecycle-${suffix}`,
      },
    });

    testUserId = user.id;

    // Also insert user into the tenant schema's users table
    // (required because WorkspaceService joins against the tenant schema users table)
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

    // Create a second test user for the add-member test
    const user2 = await db.user.create({
      data: {
        email: `ws-lifecycle-user2-${suffix}@example.com`,
        firstName: 'Second',
        lastName: 'User',
        keycloakId: `kc-ws-lifecycle2-${suffix}`,
      },
    });

    secondUserId = user2.id;

    // Set tenant context — use the real tenant schema (which has tenant_id column)
    tenantContext = {
      tenantId: testTenantId,
      tenantSlug: tenant.slug,
      schemaName,
    };
  });

  afterAll(async () => {
    // Cleanup: drop the tenant schema (removes all workspace data within it)
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch {
      // Ignore cleanup errors
    }

    await db.$disconnect();
  });

  describe('Create Workspace', () => {
    it('should create a workspace with real database', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `e2e-test-${Date.now()}`,
            name: 'E2E Test Workspace',
            description: 'Created by E2E test',
            settings: { theme: 'dark' },
          },
          testUserId
        )
      );

      expect(workspace).toBeDefined();
      expect(workspace.id).toBeDefined();
      expect(workspace.slug).toContain('e2e-test');
      expect(workspace.name).toBe('E2E Test Workspace');

      // Track for cleanup
      createdWorkspaceIds.push(workspace.id);

      // Verify in database using raw query to check tenantId
      const dbWorkspace = await db.$queryRawUnsafe<any[]>(
        `SELECT tenant_id, slug, name FROM "${schemaName}"."workspaces" WHERE id = $1`,
        workspace.id
      );

      expect(dbWorkspace[0].tenant_id).toBe(testTenantId);
      expect(dbWorkspace[0].name).toBe('E2E Test Workspace');
    });

    it('should enforce unique slug per tenant', async () => {
      const slug = `unique-test-${Date.now()}`;

      // Create first workspace
      const workspace1 = await runInContext(async () =>
        workspaceService.create(
          {
            slug,
            name: 'First Workspace',
          },
          testUserId
        )
      );

      createdWorkspaceIds.push(workspace1.id);

      // Try to create duplicate
      await expect(
        runInContext(async () =>
          workspaceService.create(
            {
              slug,
              name: 'Duplicate Workspace',
            },
            testUserId
          )
        )
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('Retrieve Workspaces', () => {
    it('should retrieve all user workspaces from database', async () => {
      // Create a test workspace
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `retrieve-test-${Date.now()}`,
            name: 'Retrieve Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // Get all workspaces
      const workspaces = await runInContext(async () => workspaceService.findAll(testUserId));

      expect(workspaces).toBeDefined();
      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBeGreaterThan(0);

      // Should include our test workspace
      const found = workspaces.find((w: any) => w.id === workspace.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Retrieve Test Workspace');
    });

    it('should retrieve workspace by ID with details', async () => {
      const created = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `detail-test-${Date.now()}`,
            name: 'Detail Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(created.id);

      const workspace = await runInContext(async () => workspaceService.findOne(created.id));

      expect(workspace).toBeDefined();
      expect(workspace.id).toBe(created.id);
      expect(workspace.name).toBe('Detail Test Workspace');
      expect(workspace.members).toBeDefined();
      expect(workspace.teams).toBeDefined();
    });
  });

  describe('Update Workspace', () => {
    it('should update workspace name and description', async () => {
      const created = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `update-test-${Date.now()}`,
            name: 'Update Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(created.id);

      const updated = await runInContext(async () =>
        workspaceService.update(created.id, {
          name: 'Updated Name',
          description: 'Updated description',
        })
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');

      // Verify in database
      const dbWorkspace = await db.$queryRawUnsafe<any[]>(
        `SELECT name, description FROM "${schemaName}"."workspaces" WHERE id = $1`,
        created.id
      );

      expect(dbWorkspace[0].name).toBe('Updated Name');
      expect(dbWorkspace[0].description).toBe('Updated description');
    });
  });

  describe('Workspace Members', () => {
    it('should add member to workspace', async () => {
      // Create workspace
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `members-test-${Date.now()}`,
            name: 'Members Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // Add member
      const member = await runInContext(async () =>
        workspaceService.addMember(
          workspace.id,
          { userId: secondUserId, role: WorkspaceRole.MEMBER },
          testUserId
        )
      );

      expect(member).toBeDefined();
      expect(member.userId).toBe(secondUserId);
      expect(member.role).toBe(WorkspaceRole.MEMBER);

      // Verify in database (tenant schema)
      const dbMembers = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_members"
         WHERE "workspace_id" = $1 AND "user_id" = $2`,
        workspace.id,
        secondUserId
      );

      expect(dbMembers.length).toBe(1);
      expect(dbMembers[0].role).toBe(WorkspaceRole.MEMBER);
    });

    it('should prevent removing last admin', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `admin-test-${Date.now()}`,
            name: 'Admin Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // testUserId is the only admin
      await expect(
        runInContext(async () => workspaceService.removeMember(workspace.id, testUserId))
      ).rejects.toThrow(/last admin/);
    });
  });

  describe('Delete Workspace', () => {
    it('should delete workspace from database', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `delete-test-${Date.now()}`,
            name: 'Delete Test Workspace',
          },
          testUserId
        )
      );

      const workspaceId = workspace.id;

      // Delete workspace
      await runInContext(async () => workspaceService.delete(workspaceId));

      // Verify it's gone from database
      const dbWorkspace = await db.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${schemaName}"."workspaces" WHERE id = $1`,
        workspaceId
      );

      expect(dbWorkspace.length).toBe(0);
    });

    it('should prevent deleting workspace with teams', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `teams-test-${Date.now()}`,
            name: 'Teams Test Workspace',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // Create a team
      await runInContext(async () =>
        workspaceService.createTeam(workspace.id, {
          name: 'Test Team',
          ownerId: testUserId,
        })
      );

      // Try to delete workspace
      await expect(runInContext(async () => workspaceService.delete(workspace.id))).rejects.toThrow(
        /existing teams/
      );
    });
  });

  describe('Tenant Isolation E2E', () => {
    it('should enforce tenantId in database', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `isolation-test-${Date.now()}`,
            name: 'Isolation Test',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // Verify tenant_id is set in database
      const dbWorkspace = await db.$queryRawUnsafe<any[]>(
        `SELECT tenant_id FROM "${schemaName}"."workspaces" WHERE id = $1`,
        workspace.id
      );

      expect(dbWorkspace[0].tenant_id).toBe(testTenantId);
    });

    it('should filter queries by tenantId', async () => {
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `filter-test-${Date.now()}`,
            name: 'Filter Test',
          },
          testUserId
        )
      );
      createdWorkspaceIds.push(workspace.id);

      // Get all workspaces - should be filtered by tenant
      const workspaces = await runInContext(async () => workspaceService.findAll(testUserId));

      // All workspaces should have correct tenant_id in database
      for (const ws of workspaces) {
        const dbWs = await db.$queryRawUnsafe<any[]>(
          `SELECT tenant_id FROM "${schemaName}"."workspaces" WHERE id = $1`,
          ws.id
        );
        if (dbWs.length > 0) {
          expect(dbWs[0].tenant_id).toBe(testTenantId);
        }
      }
    });
  });
});
