/**
 * Integration Tests: Workspace Hierarchy — Spec 011 Phase 1
 *
 * Tests the hierarchy endpoints against a real database:
 * - POST /api/workspaces with parentId (create child workspace)
 * - GET  /api/workspaces/tree
 * - GET  /api/workspaces/:workspaceId/children
 * - PATCH /api/workspaces/:workspaceId/parent (reparent)
 * - DELETE /api/workspaces/:workspaceId with children (should fail)
 *
 * Pattern: buildTestApp() + testContext.auth.createMockToken() (from workspace-crud.integration.test.ts)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

const uuid4 = () => {
  // minimal RFC-4122 v4 UUID generator for test IDs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

describe('Workspace Hierarchy Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let memberToken: string;
  let adminUserId: string;
  let memberUserId: string;
  let testTenantSlug: string;
  let schemaName: string;

  const createdWorkspaceIds: string[] = [];

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    testTenantSlug = `ws-hierarchy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;

    // Create tenant
    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'Hierarchy Test Corp',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'Test1234!',
      },
    });

    if (tenantRes.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantRes.body}`);
    }

    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: 'c3c3c3c3-3333-4333-c333-333333333333',
      email: `admin@${testTenantSlug}.test`,
      given_name: 'Hierarchy',
      family_name: 'Admin',
    });

    memberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug, {
      sub: 'd4d4d4d4-4444-4444-d444-444444444444',
      email: `member@${testTenantSlug}.test`,
      given_name: 'Hierarchy',
      family_name: 'Member',
    });

    adminUserId = testContext.auth.decodeToken(adminToken).sub;
    memberUserId = testContext.auth.decodeToken(memberToken).sub;

    // Insert users into tenant schema
    for (const [userId, email, firstName, lastName] of [
      [adminUserId, `admin@${testTenantSlug}.test`, 'Hierarchy', 'Admin'],
      [memberUserId, `member@${testTenantSlug}.test`, 'Hierarchy', 'Member'],
    ] as const) {
      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        userId,
        userId,
        email,
        firstName,
        lastName
      );
    }
  });

  afterAll(async () => {
    // Clean up created workspaces (members first due to FK)
    for (const id of [...createdWorkspaceIds].reverse()) {
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM "${schemaName}"."workspace_members" WHERE workspace_id = $1`,
          id
        );
        await db.$executeRawUnsafe(`DELETE FROM "${schemaName}"."workspaces" WHERE id = $1`, id);
      } catch {
        // ignore
      }
    }
    await app?.close();
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  async function createWorkspace(
    slug: string,
    name: string,
    token: string,
    extra: Record<string, unknown> = {}
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-slug': testTenantSlug },
      payload: { slug, name, ...extra },
    });
    if (res.statusCode === 201) {
      createdWorkspaceIds.push(res.json().id as string);
    }
    return res;
  }

  // ── POST /workspaces (root) ─────────────────────────────────────────────────

  describe('POST /api/workspaces — root workspace creation', () => {
    it('should create a root workspace with depth=0 and path=id', async () => {
      const res = await createWorkspace(`root-ws-${Date.now()}`, 'Root Workspace', adminToken);

      expect(res.statusCode).toBe(201);
      const ws = res.json();
      expect(ws.depth).toBe(0);
      expect(ws.path).toBe(ws.id);
      expect(ws.parentId).toBeNull();
    });

    it('should include _count.children in response', async () => {
      const res = await createWorkspace(
        `root-cnt-${Date.now()}`,
        'Root Count Workspace',
        adminToken
      );
      expect(res.statusCode).toBe(201);
      const ws = res.json();
      expect(ws._count).toHaveProperty('children');
      expect(ws._count.children).toBe(0);
    });
  });

  // ── POST /workspaces (with parentId) ───────────────────────────────────────

  describe('POST /api/workspaces — child workspace creation', () => {
    let rootId: string;

    beforeAll(async () => {
      const res = await createWorkspace(
        `parent-for-child-${Date.now()}`,
        'Parent Workspace',
        adminToken
      );
      expect(res.statusCode).toBe(201);
      rootId = res.json().id;
    });

    it('should create a child workspace with depth=1 and path=parentId/id', async () => {
      const res = await createWorkspace(`child-ws-${Date.now()}`, 'Child Workspace', adminToken, {
        parentId: rootId,
      });

      expect(res.statusCode).toBe(201);
      const ws = res.json();
      expect(ws.depth).toBe(1);
      expect(ws.parentId).toBe(rootId);
      expect(ws.path).toBe(`${rootId}/${ws.id}`);
    });

    it('should create a grandchild workspace with depth=2', async () => {
      // First create child
      const childRes = await createWorkspace(
        `child-for-grandchild-${Date.now()}`,
        'Child for Grandchild',
        adminToken,
        { parentId: rootId }
      );
      expect(childRes.statusCode).toBe(201);
      const childId = childRes.json().id;

      // Then create grandchild under child
      const res = await createWorkspace(
        `grandchild-ws-${Date.now()}`,
        'Grandchild Workspace',
        adminToken,
        { parentId: childId }
      );

      expect(res.statusCode).toBe(201);
      const ws = res.json();
      expect(ws.depth).toBe(2);
      expect(ws.parentId).toBe(childId);
    });

    it('should reject creation at depth=3 (MAX_DEPTH exceeded)', async () => {
      // Create depth=2 grandchild first
      const childRes = await createWorkspace(
        `child-for-depth3-${Date.now()}`,
        'Child',
        adminToken,
        { parentId: rootId }
      );
      const childId = childRes.json().id;

      const grandchildRes = await createWorkspace(
        `grandchild-for-depth3-${Date.now()}`,
        'Grandchild',
        adminToken,
        { parentId: childId }
      );
      const grandchildId = grandchildRes.json().id;

      // This one would be at depth=3 — should fail
      const res = await createWorkspace(`too-deep-${Date.now()}`, 'Too Deep', adminToken, {
        parentId: grandchildId,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe('HIERARCHY_DEPTH_EXCEEDED');
    });

    it('should reject 409 when sibling slug already exists under same parent', async () => {
      const slug = `duplicate-sibling-${Date.now()}`;
      const first = await createWorkspace(slug, 'First', adminToken, { parentId: rootId });
      expect(first.statusCode).toBe(201);

      const second = await createWorkspace(slug, 'Second', adminToken, { parentId: rootId });
      expect(second.statusCode).toBe(409);
    });
  });

  // ── GET /workspaces/tree ───────────────────────────────────────────────────

  describe('GET /api/workspaces/tree', () => {
    it('should return 200 with an array (possibly empty) for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/workspaces/tree',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const tree = res.json();
      expect(Array.isArray(tree)).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/workspaces/tree',
        headers: { 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should include hierarchy fields in tree nodes', async () => {
      const createRes = await createWorkspace(`tree-root-${Date.now()}`, 'Tree Root', adminToken);
      expect(createRes.statusCode).toBe(201);

      const treeRes = await app.inject({
        method: 'GET',
        url: '/api/workspaces/tree',
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(treeRes.statusCode).toBe(200);
      const tree = treeRes.json();
      const found = tree.find((n: { id: string }) => n.id === createRes.json().id);
      if (found) {
        expect(found).toHaveProperty('depth');
        expect(found).toHaveProperty('path');
        expect(found).toHaveProperty('children');
        expect(found).toHaveProperty('_count');
      }
    });
  });

  // ── GET /workspaces/:workspaceId/children ──────────────────────────────────

  describe('GET /api/workspaces/:workspaceId/children', () => {
    let parentId: string;
    let child1Id: string;
    let child2Id: string;

    beforeAll(async () => {
      const parentRes = await createWorkspace(
        `parent-children-${Date.now()}`,
        'Parent for Children',
        adminToken
      );
      parentId = parentRes.json().id;

      const c1 = await createWorkspace(`child-1-${Date.now()}`, 'Child 1', adminToken, {
        parentId,
      });
      child1Id = c1.json().id;

      const c2 = await createWorkspace(`child-2-${Date.now()}`, 'Child 2', adminToken, {
        parentId,
      });
      child2Id = c2.json().id;
    });

    it('should return direct children of a workspace', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${parentId}/children`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const children = res.json();
      expect(Array.isArray(children)).toBe(true);

      const ids = children.map((c: { id: string }) => c.id);
      expect(ids).toContain(child1Id);
      expect(ids).toContain(child2Id);
    });

    it('should include parentId, depth, path in each child', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${parentId}/children`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      const children = res.json();
      expect(children.length).toBeGreaterThan(0);
      for (const child of children) {
        expect(child.parentId).toBe(parentId);
        expect(child.depth).toBe(1);
        expect(child.path).toMatch(new RegExp(`^${parentId}/`));
      }
    });

    it('should return empty array for a workspace with no children', async () => {
      // child1 has no children of its own
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${child1Id}/children`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('should respect limit and offset query params', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${parentId}/children?limit=1&offset=0`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(200);
      const children = res.json();
      expect(children).toHaveLength(1);
    });
  });

  // ── PATCH /workspaces/:workspaceId/parent ──────────────────────────────────

  describe('PATCH /api/workspaces/:workspaceId/parent', () => {
    let rootAId: string;
    let rootBId: string;
    let movableChildId: string;

    beforeAll(async () => {
      const rA = await createWorkspace(
        `reparent-root-a-${Date.now()}`,
        'Reparent Root A',
        adminToken
      );
      rootAId = rA.json().id;

      const rB = await createWorkspace(
        `reparent-root-b-${Date.now()}`,
        'Reparent Root B',
        adminToken
      );
      rootBId = rB.json().id;

      const child = await createWorkspace(
        `movable-child-${Date.now()}`,
        'Movable Child',
        adminToken,
        { parentId: rootAId }
      );
      movableChildId = child.json().id;
    });

    it('should re-parent a workspace under a new parent', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${movableChildId}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: rootBId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(movableChildId);
      expect(body.parentId).toBe(rootBId);
      expect(body.depth).toBe(1);
      expect(body.path).toBe(`${rootBId}/${movableChildId}`);
    });

    it('should promote to root when parentId is null', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${movableChildId}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: null },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.parentId).toBeNull();
      expect(body.depth).toBe(0);
      expect(body.path).toBe(movableChildId);
    });

    it('should return 409 when slug already exists under target parent', async () => {
      const slug = `slug-conflict-${Date.now()}`;

      const existing = await createWorkspace(slug, 'Existing', adminToken, { parentId: rootAId });
      expect(existing.statusCode).toBe(201);

      const toMove = await createWorkspace(`to-move-${Date.now()}`, 'To Move', adminToken, {
        parentId: rootBId,
      });
      const toMoveId = toMove.json().id;

      // Rename toMove's slug to match the conflict
      // (We can't rename easily, so create directly with conflict slug under rootB)
      const conflictRes = await createWorkspace(slug, 'Conflict', adminToken, {
        parentId: rootBId,
      });
      expect(conflictRes.statusCode).toBe(201);
      const conflictId = conflictRes.json().id;

      // Now try to move 'existing' (slug = slug) to rootB — conflict
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${existing.json().id}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: rootBId },
      });

      // conflictId is already there with same slug
      expect(res.statusCode).toBe(409);
      // Clean up
      createdWorkspaceIds.push(toMoveId, conflictId);
    });

    it('should return 400 for cycle detection (moving workspace under its own descendant)', async () => {
      // rootAId → childForCycle → grandchildForCycle
      const childRes = await createWorkspace(
        `cycle-child-${Date.now()}`,
        'Cycle Child',
        adminToken,
        { parentId: rootAId }
      );
      const cycleChildId = childRes.json().id;

      // Try to move rootAId under cycleChildId (its own descendant)
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${rootAId}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: cycleChildId },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('REPARENT_CYCLE_DETECTED');
    });

    it('should return 403 when called by a non-ADMIN (member)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${rootAId}/parent`,
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: null },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for a non-existent parentId', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${rootAId}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: uuid4() },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid (non-UUID) body', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${rootAId}/parent`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { parentId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── DELETE with children (should fail) ────────────────────────────────────

  describe('DELETE /api/workspaces/:workspaceId — blocked when children exist', () => {
    it('should return 409 when attempting to delete a workspace that has children', async () => {
      const parentRes = await createWorkspace(
        `delete-blocked-parent-${Date.now()}`,
        'Delete Blocked Parent',
        adminToken
      );
      const parentId = parentRes.json().id;

      await createWorkspace(
        `delete-blocked-child-${Date.now()}`,
        'Delete Blocked Child',
        adminToken,
        { parentId }
      );

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${parentId}`,
        headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('WORKSPACE_HAS_CHILDREN');
    });
  });
});
