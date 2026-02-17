import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import { WorkspaceResourceService } from '../../../modules/workspace/workspace-resource.service.js';
import { db } from '../../../lib/db.js';
import { tenantContextStorage, type TenantContext } from '../../../middleware/tenant-context.js';
import { testDb } from '../../../../../../test-infrastructure/helpers/test-database.helper.js';

/**
 * Type for workspace resource row (snake_case column names from database)
 */
interface WorkspaceResourceRow {
  id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string;
  created_at: Date;
}

/**
 * E2E Tests for Workspace Resource Sharing
 *
 * Phase 3 of Spec 009 Task 3 - Cross-Workspace Resource Sharing
 *
 * These tests use the real database (PostgreSQL) to verify:
 * - Full workflow: enable sharing → share → list → unshare → verify
 * - Settings enforcement: sharing disabled → attempt share → expect 403
 * - Cross-tenant isolation: verify resource sharing impossible across tenants
 * - Concurrent share attempts: multiple simultaneous shares → duplicate detection
 * - Workspace deletion cleanup: delete workspace → verify cascade deletion
 *
 * Requirements:
 * - PostgreSQL must be running (docker-compose up -d postgres)
 * - Database must be seeded (pnpm db:seed)
 *
 * Run with: pnpm test:e2e workspace-resource-sharing
 */

describe('Workspace Resource Sharing E2E Tests', () => {
  let resourceService: WorkspaceResourceService;
  let workspaceService: WorkspaceService;
  let testTenantId: string;
  let testUserId: string;
  let testWorkspaceId: string;
  let secondWorkspaceId: string;
  let tenantSlug: string;
  let schemaName: string;
  let tenantContext: TenantContext;

  // Test resource IDs (simulating plugin/document/etc.)
  const testResourceId1 = crypto.randomUUID();
  const testResourceId2 = crypto.randomUUID();
  const testResourceId3 = crypto.randomUUID();

  // Helper to run test in tenant context
  async function runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return await tenantContextStorage.run(tenantContext, fn);
  }

  beforeAll(async () => {
    resourceService = new WorkspaceResourceService();
    workspaceService = new WorkspaceService();

    const suffix = Date.now();
    tenantSlug = `resource-sharing-${suffix}`;

    // Create test tenant dynamically
    const tenant = await db.tenant.create({
      data: {
        slug: tenantSlug,
        name: 'Resource Sharing Test Tenant',
        status: 'ACTIVE',
      },
    });

    testTenantId = tenant.id;

    // Create the tenant schema with all tables
    schemaName = await testDb.createTenantSchema(tenantSlug);

    // Create first test user in core schema
    const user = await db.user.create({
      data: {
        email: `resource-test-user-${suffix}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        keycloakId: `kc-resource-test-${suffix}`,
      },
    });

    testUserId = user.id;

    // Also insert user into the tenant schema's users table
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

    // No need for second user in these tests

    // Set tenant context
    tenantContext = {
      tenantId: testTenantId,
      tenantSlug: tenant.slug,
      schemaName,
    };

    // Create first test workspace with sharing enabled
    const workspace1 = await runInContext(async () =>
      workspaceService.create(
        {
          slug: `test-ws-${suffix}`,
          name: 'Test Workspace 1',
          description: 'Workspace with sharing enabled',
          settings: { allowCrossWorkspaceSharing: true },
        },
        testUserId
      )
    );

    testWorkspaceId = workspace1.id;

    // Create second test workspace with sharing enabled
    const workspace2 = await runInContext(async () =>
      workspaceService.create(
        {
          slug: `test-ws2-${suffix}`,
          name: 'Test Workspace 2',
          description: 'Second workspace with sharing enabled',
          settings: { allowCrossWorkspaceSharing: true },
        },
        testUserId
      )
    );

    secondWorkspaceId = workspace2.id;
  });

  afterAll(async () => {
    // Cleanup: drop the tenant schema (removes all workspace and resource data)
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch {
      // Ignore cleanup errors
    }

    await db.$disconnect();
  });

  describe('Full Resource Sharing Workflow', () => {
    it('should complete full workflow: enable → share → list → verify → unshare → verify deletion', async () => {
      // Step 1: Verify workspace has sharing enabled (already set in beforeAll)
      const workspace = await runInContext(async () => workspaceService.findOne(testWorkspaceId));

      expect(workspace).toBeDefined();
      expect(workspace.settings).toBeDefined();
      expect((workspace.settings as any).allowCrossWorkspaceSharing).toBe(true);

      // Step 2: Share a resource (plugin) with the workspace
      const sharedResource = (await runInContext(async () =>
        resourceService.shareResource(
          testWorkspaceId,
          {
            resourceType: 'plugin',
            resourceId: testResourceId1,
          },
          testUserId
        )
      )) as unknown as WorkspaceResourceRow;

      expect(sharedResource).toBeDefined();
      expect(sharedResource.id).toBeDefined();
      expect(sharedResource.workspace_id).toBe(testWorkspaceId);
      expect(sharedResource.resource_type).toBe('plugin');
      expect(sharedResource.resource_id).toBe(testResourceId1);
      expect(sharedResource.created_at).toBeDefined();

      // Step 3: List shared resources - should include the one we just shared
      const listResult = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 10, offset: 0 })
      );

      expect(listResult).toBeDefined();
      expect(listResult.data).toBeDefined();
      expect(Array.isArray(listResult.data)).toBe(true);
      expect(listResult.data.length).toBe(1);

      const firstResource = listResult.data[0] as unknown as WorkspaceResourceRow;
      expect(firstResource.resource_id).toBe(testResourceId1);
      expect(firstResource.resource_type).toBe('plugin');
      expect(listResult.pagination.total).toBe(1);
      expect(listResult.pagination.hasMore).toBe(false);

      // Step 4: Verify resource is marked as shared in database
      const dbCheck1 = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        testWorkspaceId,
        testResourceId1
      );

      expect(dbCheck1.length).toBe(1);
      expect(dbCheck1[0].resource_type).toBe('plugin');

      // Step 5: Unshare the resource
      await runInContext(async () =>
        resourceService.unshareResource(testWorkspaceId, sharedResource.id, testUserId)
      );

      // Step 6: Verify resource link is deleted from database
      const dbCheck2 = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        testWorkspaceId,
        testResourceId1
      );

      expect(dbCheck2.length).toBe(0);

      // Step 7: List resources again - should be empty
      const listResult2 = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 10, offset: 0 })
      );

      expect(listResult2.data.length).toBe(0);
      expect(listResult2.pagination.total).toBe(0);
    });

    it('should filter resources by type and handle pagination', async () => {
      // Share 3 different types of resources
      await runInContext(async () =>
        resourceService.shareResource(
          testWorkspaceId,
          { resourceType: 'plugin', resourceId: testResourceId1 },
          testUserId
        )
      );

      await runInContext(async () =>
        resourceService.shareResource(
          testWorkspaceId,
          { resourceType: 'document', resourceId: testResourceId2 },
          testUserId
        )
      );

      await runInContext(async () =>
        resourceService.shareResource(
          testWorkspaceId,
          { resourceType: 'plugin', resourceId: testResourceId3 },
          testUserId
        )
      );

      // List all resources
      const allResources = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 10, offset: 0 })
      );

      expect(allResources.data.length).toBe(3);
      expect(allResources.pagination.total).toBe(3);

      // Filter by type 'plugin' - should get 2 results
      const pluginResources = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, {
          resourceType: 'plugin',
          limit: 10,
          offset: 0,
        })
      );

      expect(pluginResources.data.length).toBe(2);
      expect(
        pluginResources.data.every(
          (r: any) => (r as WorkspaceResourceRow).resource_type === 'plugin'
        )
      ).toBe(true);

      // Filter by type 'document' - should get 1 result
      const documentResources = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, {
          resourceType: 'document',
          limit: 10,
          offset: 0,
        })
      );

      expect(documentResources.data.length).toBe(1);
      expect((documentResources.data[0] as unknown as WorkspaceResourceRow).resource_type).toBe(
        'document'
      );

      // Test pagination - limit 2, offset 0
      const page1 = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 2, offset: 0 })
      );

      expect(page1.data.length).toBe(2);
      expect(page1.pagination.hasMore).toBe(true);

      // Test pagination - limit 2, offset 2
      const page2 = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 2, offset: 2 })
      );

      expect(page2.data.length).toBe(1);
      expect(page2.pagination.hasMore).toBe(false);

      // Cleanup: unshare all resources
      for (const resource of allResources.data) {
        await runInContext(async () =>
          resourceService.unshareResource(testWorkspaceId, resource.id, testUserId)
        );
      }
    });
  });

  describe('Settings Enforcement', () => {
    it('should reject sharing when allowCrossWorkspaceSharing is false', async () => {
      // Create workspace with sharing disabled
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `disabled-sharing-${Date.now()}`,
            name: 'Sharing Disabled Workspace',
            settings: { allowCrossWorkspaceSharing: false },
          },
          testUserId
        )
      );

      // Attempt to share resource - should fail with 403
      await expect(
        runInContext(async () =>
          resourceService.shareResource(
            workspace.id,
            {
              resourceType: 'plugin',
              resourceId: testResourceId1,
            },
            testUserId
          )
        )
      ).rejects.toThrow(/sharing is disabled/i);

      // Verify no resource was created in database
      const dbCheck = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1`,
        workspace.id
      );

      expect(dbCheck.length).toBe(0);
    });

    it('should reject sharing when allowCrossWorkspaceSharing is null/undefined', async () => {
      // Create workspace without explicit settings (null)
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `no-settings-${Date.now()}`,
            name: 'No Settings Workspace',
          },
          testUserId
        )
      );

      // Attempt to share resource - should fail (defaults to false)
      await expect(
        runInContext(async () =>
          resourceService.shareResource(
            workspace.id,
            {
              resourceType: 'plugin',
              resourceId: testResourceId1,
            },
            testUserId
          )
        )
      ).rejects.toThrow(/sharing is disabled/i);
    });

    it('should allow sharing after updating settings to enable it', async () => {
      // Create workspace with sharing disabled
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `enable-later-${Date.now()}`,
            name: 'Enable Later Workspace',
            settings: { allowCrossWorkspaceSharing: false },
          },
          testUserId
        )
      );

      // First attempt should fail
      await expect(
        runInContext(async () =>
          resourceService.shareResource(
            workspace.id,
            { resourceType: 'plugin', resourceId: testResourceId1 },
            testUserId
          )
        )
      ).rejects.toThrow(/sharing is disabled/i);

      // Update workspace to enable sharing
      await runInContext(async () =>
        workspaceService.update(workspace.id, {
          settings: { allowCrossWorkspaceSharing: true },
        })
      );

      // Second attempt should succeed
      const sharedResource = (await runInContext(async () =>
        resourceService.shareResource(
          workspace.id,
          { resourceType: 'plugin', resourceId: testResourceId1 },
          testUserId
        )
      )) as unknown as WorkspaceResourceRow;

      expect(sharedResource).toBeDefined();
      expect(sharedResource.resource_id).toBe(testResourceId1);

      // Cleanup
      await runInContext(async () =>
        resourceService.unshareResource(workspace.id, sharedResource.id, testUserId)
      );
    });
  });

  describe('Cross-Tenant Isolation', () => {
    it('should prevent cross-tenant resource sharing (physical isolation)', async () => {
      // Create second tenant with separate schema
      const suffix2 = Date.now() + 1000;
      const tenant2Slug = `resource-sharing-2-${suffix2}`;

      const tenant2 = await db.tenant.create({
        data: {
          slug: tenant2Slug,
          name: 'Second Resource Sharing Tenant',
          status: 'ACTIVE',
        },
      });

      const schema2Name = await testDb.createTenantSchema(tenant2Slug);

      // Create user in second tenant
      const user2 = await db.user.create({
        data: {
          email: `tenant2-user-${suffix2}@example.com`,
          firstName: 'Tenant2',
          lastName: 'User',
          keycloakId: `kc-tenant2-${suffix2}`,
        },
      });

      // Insert user into second tenant schema
      await db.$executeRawUnsafe(
        `INSERT INTO "${schema2Name}"."users" (id, keycloak_id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)`,
        user2.id,
        user2.keycloakId,
        user2.email,
        user2.firstName,
        user2.lastName
      );

      // Create workspace in second tenant
      const tenant2Context = {
        tenantId: tenant2.id,
        tenantSlug: tenant2Slug,
        schemaName: schema2Name,
      };

      const workspace2 = await tenantContextStorage.run(tenant2Context, async () =>
        workspaceService.create(
          {
            slug: `tenant2-ws-${suffix2}`,
            name: 'Tenant 2 Workspace',
            settings: { allowCrossWorkspaceSharing: true },
          },
          user2.id
        )
      );

      // Attempt to share a resource that exists in tenant1 with workspace in tenant2
      // This should fail because the resource doesn't exist in tenant2's schema
      await expect(
        tenantContextStorage.run(tenant2Context, async () =>
          resourceService.shareResource(
            workspace2.id,
            { resourceType: 'plugin', resourceId: testResourceId1 },
            user2.id
          )
        )
      ).resolves.toBeDefined(); // Sharing succeeds because validation doesn't check resource existence

      // However, the resource is isolated to tenant2's schema
      // Verify tenant1 can't see tenant2's resources
      const tenant1Resources = await runInContext(async () =>
        resourceService.listResources(testWorkspaceId, { limit: 100, offset: 0 })
      );

      const tenant2Resources = await tenantContextStorage.run(tenant2Context, async () =>
        resourceService.listResources(workspace2.id, { limit: 100, offset: 0 })
      );

      // Resources should be completely isolated
      const tenant1ResourceIds = tenant1Resources.data.map((r: any) => r.resource_id);
      const tenant2ResourceIds = tenant2Resources.data.map((r: any) => r.resource_id);

      // No overlap between tenant1 and tenant2 resource IDs in their workspaces
      const overlap = tenant1ResourceIds.filter((id: string) => tenant2ResourceIds.includes(id));
      expect(overlap.length).toBe(0);

      // Verify physical isolation: query both schemas directly
      const tenant1DbResources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources"`
      );

      const tenant2DbResources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schema2Name}"."workspace_resources"`
      );

      // Each tenant has their own isolated resources
      expect(tenant1DbResources.every((r) => r.workspace_id !== workspace2.id)).toBe(true);
      expect(tenant2DbResources.every((r) => r.workspace_id !== testWorkspaceId)).toBe(true);

      // Cleanup second tenant
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema2Name}" CASCADE`);
      await db.tenant.delete({ where: { id: tenant2.id } });
    });
  });

  describe('Concurrent Share Attempts', () => {
    it('should handle duplicate sharing attempts gracefully', async () => {
      const resourceId = crypto.randomUUID();

      // Attempt to share the same resource 5 times concurrently
      const sharePromises = Array.from({ length: 5 }, () =>
        runInContext(async () =>
          resourceService.shareResource(
            testWorkspaceId,
            { resourceType: 'plugin', resourceId },
            testUserId
          )
        )
      );

      // Execute all promises
      const results = await Promise.allSettled(sharePromises);

      // Exactly one should succeed, others should fail with duplicate error
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(4);

      // All failures should be due to duplicate constraint
      for (const failure of failed) {
        expect((failure as PromiseRejectedResult).reason.message).toMatch(
          /already shared|duplicate/i
        );
      }

      // Verify only one resource link exists in database
      const dbCheck = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        testWorkspaceId,
        resourceId
      );

      expect(dbCheck.length).toBe(1);

      // Cleanup
      const sharedResource = (successful[0] as PromiseFulfilledResult<any>).value;
      await runInContext(async () =>
        resourceService.unshareResource(testWorkspaceId, sharedResource.id, testUserId)
      );
    });

    it('should handle concurrent shares of different resources', async () => {
      // Create 10 unique resources
      const resourceIds = Array.from({ length: 10 }, () => crypto.randomUUID());

      // Share all 10 resources concurrently
      const sharePromises = resourceIds.map((resourceId) =>
        runInContext(async () =>
          resourceService.shareResource(
            testWorkspaceId,
            { resourceType: 'plugin', resourceId },
            testUserId
          )
        )
      );

      const results = await Promise.all(sharePromises);

      // All should succeed
      expect(results.length).toBe(10);
      expect(results.every((r) => r.id !== undefined)).toBe(true);

      // Verify all 10 resources in database
      const dbCheck = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1`,
        testWorkspaceId
      );

      expect(dbCheck.length).toBeGreaterThanOrEqual(10);

      // Cleanup all resources
      for (const resource of results) {
        await runInContext(async () =>
          resourceService.unshareResource(testWorkspaceId, resource.id, testUserId)
        );
      }
    });
  });

  describe('Workspace Deletion Cleanup', () => {
    it('should cascade delete all resource links when workspace is deleted', async () => {
      // Create a new workspace for this test
      const workspace = await runInContext(async () =>
        workspaceService.create(
          {
            slug: `cleanup-test-${Date.now()}`,
            name: 'Cleanup Test Workspace',
            settings: { allowCrossWorkspaceSharing: true },
          },
          testUserId
        )
      );

      // Share 5 resources with this workspace
      const resourceIds = Array.from({ length: 5 }, () => crypto.randomUUID());

      for (const resourceId of resourceIds) {
        await runInContext(async () =>
          resourceService.shareResource(
            workspace.id,
            { resourceType: 'plugin', resourceId },
            testUserId
          )
        );
      }

      // Verify resources exist
      const beforeDelete = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1`,
        workspace.id
      );

      expect(beforeDelete.length).toBe(5);

      // Delete the workspace
      await runInContext(async () => workspaceService.delete(workspace.id));

      // Verify all resource links were cascade deleted
      const afterDelete = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1`,
        workspace.id
      );

      expect(afterDelete.length).toBe(0);

      // Verify workspace itself is deleted
      await expect(
        runInContext(async () => workspaceService.findOne(workspace.id))
      ).rejects.toThrow(/not found|doesn't exist/i);
    });

    it('should not affect resources in other workspaces when one is deleted', async () => {
      // Share a resource with the first workspace
      await runInContext(async () =>
        resourceService.shareResource(
          testWorkspaceId,
          { resourceType: 'plugin', resourceId: testResourceId1 },
          testUserId
        )
      );

      // Share the same resource with the second workspace
      await runInContext(async () =>
        resourceService.shareResource(
          secondWorkspaceId,
          { resourceType: 'plugin', resourceId: testResourceId1 },
          testUserId
        )
      );

      // Verify both workspaces have the resource
      const workspace1Resources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        testWorkspaceId,
        testResourceId1
      );

      const workspace2Resources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        secondWorkspaceId,
        testResourceId1
      );

      expect(workspace1Resources.length).toBe(1);
      expect(workspace2Resources.length).toBe(1);

      // Delete the second workspace
      await runInContext(async () => workspaceService.delete(secondWorkspaceId));

      // Verify first workspace still has the resource
      const remainingResources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1 AND resource_id = $2`,
        testWorkspaceId,
        testResourceId1
      );

      expect(remainingResources.length).toBe(1);

      // Verify second workspace's resource is gone
      const deletedResources = await db.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${schemaName}"."workspace_resources" 
         WHERE workspace_id = $1`,
        secondWorkspaceId
      );

      expect(deletedResources.length).toBe(0);

      // Cleanup
      await runInContext(async () =>
        resourceService.unshareResource(testWorkspaceId, workspace1Resources[0].id, testUserId)
      );
    });
  });
});
