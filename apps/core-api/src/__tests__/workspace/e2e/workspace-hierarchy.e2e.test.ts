/**
 * E2E Tests: Workspace Hierarchy — Spec 011 Phase 1
 *
 * Tests the hierarchy service with a real database (direct service calls):
 * - Creating parent/child/grandchild workspaces
 * - Verifying depth and path fields
 * - Getting tree structure
 * - Getting direct children
 * - Re-parenting a workspace
 * - Preventing deletion of non-leaf workspace
 * - Preventing cycle in reparent
 * - MAX_DEPTH enforcement
 *
 * Requirements: PostgreSQL must be running (docker-compose up -d postgres)
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import { WorkspaceHierarchyService } from '../../../modules/workspace/workspace-hierarchy.service.js';
import { db } from '../../../lib/db.js';
import { tenantContextStorage, type TenantContext } from '../../../middleware/tenant-context.js';
import { testDb } from '../../../../../../test-infrastructure/helpers/test-database.helper.js';

describe('Workspace Hierarchy E2E', () => {
  let workspaceService: WorkspaceService;
  let hierarchyService: WorkspaceHierarchyService;
  let testTenantId: string;
  let testUserId: string;
  let tenantSlug: string;
  let schemaName: string;
  let tenantContext: TenantContext;

  const createdWorkspaceIds: string[] = [];

  async function runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContextStorage.run(tenantContext, fn);
  }

  beforeAll(async () => {
    workspaceService = new WorkspaceService();
    hierarchyService = new WorkspaceHierarchyService();

    const suffix = Date.now();
    tenantSlug = `ws-hier-e2e-${suffix}`;

    const tenant = await db.tenant.create({
      data: {
        slug: tenantSlug,
        name: 'Workspace Hierarchy E2E Tenant',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    schemaName = await testDb.createTenantSchema(tenantSlug);

    const user = await db.user.create({
      data: {
        email: `hier-e2e-${suffix}@example.com`,
        firstName: 'Hierarchy',
        lastName: 'Tester',
        keycloakId: `kc-hier-e2e-${suffix}`,
      },
    });
    testUserId = user.id;

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

    tenantContext = {
      tenantId: testTenantId,
      tenantSlug: tenant.slug,
      schemaName,
    };
  });

  afterAll(async () => {
    try {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch {
      // ignore
    }
    try {
      await db.user.deleteMany({ where: { keycloakId: { startsWith: `kc-hier-e2e-` } } });
      await db.tenant.delete({ where: { id: testTenantId } });
    } catch {
      // ignore
    }
    await db.$disconnect();
  });

  // ── Root workspace ─────────────────────────────────────────────────────────

  describe('Root workspace creation', () => {
    it('should create a root workspace with depth=0 and path=id', async () => {
      const ws = await runInContext(() =>
        workspaceService.create(
          { slug: `root-hier-${Date.now()}`, name: 'Root Hierarchy Workspace' },
          testUserId
        )
      );

      createdWorkspaceIds.push(ws.id);

      expect(ws.depth).toBe(0);
      expect(ws.path).toBe(ws.id);
      expect(ws.parentId).toBeNull();
    });
  });

  // ── Parent/child/grandchild chain ──────────────────────────────────────────

  describe('Hierarchy chain (parent → child → grandchild)', () => {
    let rootId: string;
    let childId: string;
    let grandchildId: string;

    beforeAll(async () => {
      const root = await runInContext(() =>
        workspaceService.create(
          { slug: `hier-root-${Date.now()}`, name: 'Hierarchy Root' },
          testUserId
        )
      );
      rootId = root.id;
      createdWorkspaceIds.push(rootId);

      const child = await runInContext(() =>
        workspaceService.create(
          { slug: `hier-child-${Date.now()}`, name: 'Hierarchy Child', parentId: rootId },
          testUserId
        )
      );
      childId = child.id;
      createdWorkspaceIds.push(childId);

      const grandchild = await runInContext(() =>
        workspaceService.create(
          {
            slug: `hier-grandchild-${Date.now()}`,
            name: 'Hierarchy Grandchild',
            parentId: childId,
          },
          testUserId
        )
      );
      grandchildId = grandchild.id;
      createdWorkspaceIds.push(grandchildId);
    });

    it('should have depth=1 and correct path for child', async () => {
      const ws = await runInContext(() => workspaceService.findOne(childId, tenantContext));
      expect(ws.depth).toBe(1);
      expect(ws.path).toBe(`${rootId}/${childId}`);
      expect(ws.parentId).toBe(rootId);
    });

    it('should have depth=2 and correct path for grandchild', async () => {
      const ws = await runInContext(() => workspaceService.findOne(grandchildId, tenantContext));
      expect(ws.depth).toBe(2);
      expect(ws.path).toBe(`${rootId}/${childId}/${grandchildId}`);
      expect(ws.parentId).toBe(childId);
    });

    describe('MAX_DEPTH enforcement (override to 2 for test speed)', () => {
      let savedMaxDepth: string | undefined;

      beforeEach(() => {
        savedMaxDepth = process.env.WORKSPACE_MAX_DEPTH;
        process.env.WORKSPACE_MAX_DEPTH = '2';
      });

      afterEach(() => {
        if (savedMaxDepth === undefined) {
          delete process.env.WORKSPACE_MAX_DEPTH;
        } else {
          process.env.WORKSPACE_MAX_DEPTH = savedMaxDepth;
        }
      });

      it('should block creation of a workspace at depth=2 when MAX_DEPTH=2 (MAX_DEPTH exceeded)', async () => {
        // grandchildId is depth=2; with MAX_DEPTH=2, a child of grandchild would be at depth=3 — rejected
        await expect(
          runInContext(() =>
            workspaceService.create(
              { slug: `too-deep-${Date.now()}`, name: 'Too Deep', parentId: grandchildId },
              testUserId
            )
          )
        ).rejects.toThrow(/maximum hierarchy depth/);
      });
    });

    it('should return getDirectChildren of root correctly', async () => {
      const children = await hierarchyService.getDirectChildren(rootId, tenantContext);
      const ids = children.map((c) => c.id);
      expect(ids).toContain(childId);
    });

    it('should return getDescendants of root (includes child and grandchild)', async () => {
      const descendants = await hierarchyService.getDescendants(rootId, tenantContext);
      const ids = descendants.map((d) => d.id);
      expect(ids).toContain(childId);
      expect(ids).toContain(grandchildId);
    });

    it('should return a nested tree via getTree', async () => {
      const tree = await hierarchyService.getTree(testUserId, tenantContext);
      const rootNode = tree.find((n) => n.id === rootId);
      expect(rootNode).toBeDefined();
      const childNode = rootNode?.children.find((c) => c.id === childId);
      expect(childNode).toBeDefined();
      const gcNode = childNode?.children.find((c) => c.id === grandchildId);
      expect(gcNode).toBeDefined();
    });

    it('hasChildren should return true for root', async () => {
      const result = await hierarchyService.hasChildren(rootId, tenantContext);
      expect(result).toBe(true);
    });

    it('hasChildren should return false for grandchild (leaf)', async () => {
      const result = await hierarchyService.hasChildren(grandchildId, tenantContext);
      expect(result).toBe(false);
    });

    it('should block delete of a workspace with children', async () => {
      await expect(
        runInContext(() => workspaceService.delete(rootId, tenantContext))
      ).rejects.toThrow(/children/);
    });
  });

  // ── Reparent ───────────────────────────────────────────────────────────────

  describe('reparent()', () => {
    let sourceRootId: string;
    let targetRootId: string;
    let childToMoveId: string;

    beforeAll(async () => {
      const src = await runInContext(() =>
        workspaceService.create(
          { slug: `reparent-src-${Date.now()}`, name: 'Reparent Source' },
          testUserId
        )
      );
      sourceRootId = src.id;
      createdWorkspaceIds.push(sourceRootId);

      const tgt = await runInContext(() =>
        workspaceService.create(
          { slug: `reparent-tgt-${Date.now()}`, name: 'Reparent Target' },
          testUserId
        )
      );
      targetRootId = tgt.id;
      createdWorkspaceIds.push(targetRootId);

      const child = await runInContext(() =>
        workspaceService.create(
          { slug: `child-to-move-${Date.now()}`, name: 'Child to Move', parentId: sourceRootId },
          testUserId
        )
      );
      childToMoveId = child.id;
      createdWorkspaceIds.push(childToMoveId);
    });

    it('should move child from source to target root', async () => {
      const result = await workspaceService.reparent(
        childToMoveId,
        targetRootId,
        testUserId,
        tenantContext
      );

      expect(result.parentId).toBe(targetRootId);
      expect(result.depth).toBe(1);
      expect(result.path).toBe(`${targetRootId}/${childToMoveId}`);
    });

    it('should promote child to root when parentId=null', async () => {
      const result = await workspaceService.reparent(
        childToMoveId,
        null,
        testUserId,
        tenantContext
      );

      expect(result.parentId).toBeNull();
      expect(result.depth).toBe(0);
      expect(result.path).toBe(childToMoveId);
    });

    it('should be a no-op when already at desired parent (returns current state)', async () => {
      // After above, childToMoveId is a root (parentId=null)
      const result = await workspaceService.reparent(
        childToMoveId,
        null,
        testUserId,
        tenantContext
      );
      expect(result.parentId).toBeNull();
      expect(result.depth).toBe(0);
    });

    it('should detect cycle when moving a workspace under its own descendant', async () => {
      // Move childToMoveId under sourceRootId again first
      await workspaceService.reparent(childToMoveId, sourceRootId, testUserId, tenantContext);

      // Now try to move sourceRootId under childToMoveId (its descendant)
      await expect(
        workspaceService.reparent(sourceRootId, childToMoveId, testUserId, tenantContext)
      ).rejects.toThrow(/REPARENT_CYCLE_DETECTED|descendant/);
    });

    it('should throw for non-existent target parent', async () => {
      await expect(
        workspaceService.reparent(
          childToMoveId,
          '00000000-0000-0000-0000-999999999999',
          testUserId,
          tenantContext
        )
      ).rejects.toThrow(/not found/);
    });
  });
});
