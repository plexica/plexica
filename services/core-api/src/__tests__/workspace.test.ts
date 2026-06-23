// workspace.test.ts
// Integration tests — INT-01: Workspace CRUD, hierarchy, archive/restore, reparent, templates.
// Spec 003, Phase 18.1

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { workspaceRoutes } from '../modules/workspace/routes.js';

import { createTestServer, makeFullStub, isDbReachable } from './helpers/server.helpers.js';
import {
  seedTenant,
  seedUserProfile,
  wipeTenantWorkspaces,
  cleanupTenant,
} from './helpers/db.helpers.js';
import {
  mustCreateWorkspace,
  createWorkspaceViaApi,
  getWorkspaceViaApi,
  deleteWorkspaceViaApi,
  restoreWorkspaceViaApi,
  reparentWorkspaceViaApi,
} from './helpers/workspace.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { WorkspaceDetailDto } from '../modules/workspace/types.js';

const SLUG = 'ws-int01-test';
// Fixed UUID so req.user.id matches workspace.created_by UUID FK constraint
const ACTOR = '00000000-0101-0001-0000-000000000001';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  // Pass the same UUID as userId so req.user.id == workspace.created_by == user_profile.user_id
  await seedUserProfile(ctx, ACTOR, `${ACTOR}@test.plexica.io`, 'WS Actor', ACTOR);

  server = await createTestServer();
  const stub = makeFullStub(ACTOR, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(workspaceRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG };
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantWorkspaces(ctx);
});

describe('INT-01 Workspace CRUD', () => {
  skipIfNoDb('creates a workspace (POST /api/v1/workspaces → 201)', async () => {
    const { statusCode, body } = await createWorkspaceViaApi(server, reqHeaders, { name: 'Alpha' });
    expect(statusCode).toBe(201);
    const ws = body as WorkspaceDetailDto;
    expect(ws.name).toBe('Alpha');
    expect(ws.status).toBe('active');
    expect(ws.materializedPath).toMatch(/^\/alpha/);
  });

  skipIfNoDb('lists workspaces (GET /api/v1/workspaces)', async () => {
    await mustCreateWorkspace(server, reqHeaders, 'Beta');
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body) as { data: WorkspaceDetailDto[] };
    expect(data.some((w) => w.name === 'Beta')).toBe(true);
  });

  skipIfNoDb('gets a workspace by id (GET /api/v1/workspaces/:id)', async () => {
    const created = await mustCreateWorkspace(server, reqHeaders, 'Gamma');
    const { statusCode, body } = await getWorkspaceViaApi(server, reqHeaders, created.id);
    expect(statusCode).toBe(200);
    expect((body as WorkspaceDetailDto).id).toBe(created.id);
  });

  skipIfNoDb('updates workspace name (PATCH /api/v1/workspaces/:id)', async () => {
    const ws = await mustCreateWorkspace(server, reqHeaders, 'Delta');
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${ws.id}`,
      headers: { 'content-type': 'application/json', ...reqHeaders },
      body: JSON.stringify({ name: 'Delta Renamed' }),
    });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as WorkspaceDetailDto).name).toBe('Delta Renamed');
  });
});

describe('INT-01 Workspace hierarchy', () => {
  skipIfNoDb('creates child workspace with materialized_path containing parent', async () => {
    const parent = await mustCreateWorkspace(server, reqHeaders, 'Parent');
    const child = await mustCreateWorkspace(server, reqHeaders, 'Child', { parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    expect(child.materializedPath).toContain(parent.materializedPath);
  });

  skipIfNoDb('rejects depth > 10 (MAX_HIERARCHY_DEPTH)', async () => {
    let current = await mustCreateWorkspace(server, reqHeaders, 'Depth0');
    // Build 10 levels; the 11th should fail
    for (let i = 1; i <= 10; i++) {
      const { statusCode, body } = await createWorkspaceViaApi(server, reqHeaders, {
        name: `Depth${i}`,
        parentId: current.id,
      });
      if (i < 10) {
        expect(statusCode).toBe(201);
        current = body as WorkspaceDetailDto;
      } else {
        expect(statusCode).toBeGreaterThanOrEqual(409);
      }
    }
  });
});

describe('INT-01 Archive / restore', () => {
  skipIfNoDb('soft-deletes workspace (DELETE → status archived)', async () => {
    const ws = await mustCreateWorkspace(server, reqHeaders, 'ToArchive');
    expect(await deleteWorkspaceViaApi(server, reqHeaders, ws.id)).toBe(204);
    const { statusCode, body } = await getWorkspaceViaApi(server, reqHeaders, ws.id);
    expect(statusCode).toBe(200);
    expect((body as WorkspaceDetailDto).status).toBe('archived');
  });

  skipIfNoDb('restores archived workspace within 30 days', async () => {
    const ws = await mustCreateWorkspace(server, reqHeaders, 'ToRestore');
    await deleteWorkspaceViaApi(server, reqHeaders, ws.id);
    const { statusCode } = await restoreWorkspaceViaApi(server, reqHeaders, ws.id);
    expect(statusCode).toBe(200);
  });
});

describe('INT-01 Reparent', () => {
  skipIfNoDb('recalculates materialized_path after reparent', async () => {
    const a = await mustCreateWorkspace(server, reqHeaders, 'ParentA');
    const b = await mustCreateWorkspace(server, reqHeaders, 'ParentB');
    const child = await mustCreateWorkspace(server, reqHeaders, 'Child', { parentId: a.id });
    const { statusCode, body } = await reparentWorkspaceViaApi(server, reqHeaders, child.id, b.id);
    expect(statusCode).toBe(200);
    const result = body as { materializedPath: string };
    expect(result.materializedPath).toContain(b.materializedPath ?? '/parentb');
  });

  skipIfNoDb('rejects reparent to own descendant (CIRCULAR_REPARENT)', async () => {
    const parent = await mustCreateWorkspace(server, reqHeaders, 'PX');
    const child = await mustCreateWorkspace(server, reqHeaders, 'CX', { parentId: parent.id });
    const { statusCode } = await reparentWorkspaceViaApi(server, reqHeaders, parent.id, child.id);
    expect(statusCode).toBeGreaterThanOrEqual(409);
  });
});
