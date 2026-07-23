import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { TRUSTED_AUTH_SYMBOL } from '../middleware/auth-middleware.js';
import { proxyRoutes } from '../modules/plugin/routes/proxy.routes.js';
import { visibilityRoutes } from '../modules/plugin/routes/visibility.routes.js';
import { registerDevBackend, unregisterDevBackend } from '../modules/plugin/services/dev-backends.js';
import { clearVisibilityCache } from '../modules/plugin/services/visibility.service.js';

import {
  buildTenantClientForCtx,
  cleanupTenant,
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
} from './helpers/db.helpers.js';
import { createTestServer, isDbReachable } from './helpers/server.helpers.js';

import type { AddressInfo } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = `proxy-lifecycle-${process.pid}`;
const PLUGIN_SLUG = `proxy-fixture-${process.pid}`;
const MEMBER_ID = '00000000-0000-4000-8000-000000000041';
const OUTSIDER_ID = '00000000-0000-4000-8000-000000000042';
const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let app: FastifyInstance;
let context: TenantContext;
let installId: string;
let visibleWorkspaceId: string;
let hiddenWorkspaceId: string;
let forwarded = 0;
const backend = createServer((request, response) => {
  forwarded++;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({
    role: request.headers['x-plexica-user-role'],
    workspaceId: request.headers['x-plexica-workspace-id'],
  }));
});

async function authStub(request: FastifyRequest): Promise<void> {
  const admin = request.headers['x-test-admin'] === 'true';
  const userId = request.headers['x-test-outsider'] === 'true' ? OUTSIDER_ID : MEMBER_ID;
  request.user = {
    id: userId,
    keycloakUserId: userId,
    email: 'proxy-test@example.invalid',
    firstName: 'Proxy',
    lastName: 'Test',
    realm: context.realmName,
    roles: admin ? ['tenant_admin'] : [],
  } satisfies AuthUser;
  request.tenantContext = context;
  (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
}

function proxyHeaders(workspaceId?: string, admin = false): Record<string, string> {
  return {
    ...(workspaceId ? { 'x-plexica-workspace-id': workspaceId } : {}),
    ...(admin ? { 'x-test-admin': 'true' } : {}),
  };
}

async function request(workspaceId?: string, admin = false, outsider = false) {
  const response = app.inject({
    method: 'GET',
    url: `/api/v1/plugins/${installId}/proxy/context`,
    headers: {
      ...proxyHeaders(workspaceId, admin),
      ...(outsider ? { 'x-test-outsider': 'true' } : {}),
    },
  });
  return Promise.race([
    response,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Proxy request timed out after ${forwarded} forwards`)), 10_000)
    ),
  ]);
}

async function expectDenied(task: () => ReturnType<typeof request>): Promise<void> {
  const before = forwarded;
  expect((await task()).statusCode).toBeGreaterThanOrEqual(400);
  expect(forwarded).toBe(before);
}

beforeAll(async () => {
  ({ tenantContext: context } = await seedTenant(SLUG));
  await seedUserProfile(context, MEMBER_ID, 'member@example.invalid', 'Member', MEMBER_ID);
  await seedUserProfile(context, OUTSIDER_ID, 'outsider@example.invalid', 'Outsider', OUTSIDER_ID);
  visibleWorkspaceId = (await seedWorkspace(context, 'Visible', MEMBER_ID)).id;
  hiddenWorkspaceId = (await seedWorkspace(context, 'Hidden', MEMBER_ID)).id;
  await seedWorkspaceMember(context, visibleWorkspaceId, MEMBER_ID, 'member');
  await seedWorkspaceMember(context, hiddenWorkspaceId, MEMBER_ID, 'member');
  const plugin = await prisma.plugin.create({
    data: {
      slug: PLUGIN_SLUG, name: 'Proxy fixture', version: '1.0.0', author: 'Plexica',
      registryUrl: 'https://registry.example.invalid', imageName: 'proxy-fixture',
      imageTag: '1.0.0', createdByKeycloakId: 'integration-test',
    },
  });
  const tenantDb = buildTenantClientForCtx(context);
  installId = (await tenantDb.pluginInstallation.create({
    data: {
      pluginId: plugin.id, tenantSlug: SLUG, version: '1.0.0', status: 'active',
      hostingType: 'sidecar', tenantDefaultVisibility: 'enabled', installedBy: MEMBER_ID,
    },
  })).id;
  await tenantDb.pluginWorkspaceVisibility.create({
    data: { installId, workspaceId: hiddenWorkspaceId, isEnabled: false, isOverride: true },
  });
  await tenantDb.$disconnect();
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const port = (backend.address() as AddressInfo).port;
  registerDevBackend(PLUGIN_SLUG, { baseUrl: `http://127.0.0.1:${port}`, installId });
  app = await createTestServer();
  app.addHook('preHandler', authStub);
  await app.register(proxyRoutes);
  await app.register(visibilityRoutes);
  await app.ready();
});

afterAll(async () => {
  unregisterDevBackend(PLUGIN_SLUG, installId);
  await app?.close();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
  await prisma.plugin.deleteMany({ where: { slug: PLUGIN_SLUG } });
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

describe('plugin proxy lifecycle and visibility gate', () => {
  skipIfNoDb('returns the same visibility entry shape from PATCH and GET', async () => {
    const url = `/api/v1/plugins/${installId}/visibility`;
    const patch = await app.inject({
      method: 'PATCH', url,
      headers: { 'x-test-admin': 'true', 'content-type': 'application/json' },
      payload: [{ workspaceId: hiddenWorkspaceId, isEnabled: true }],
    });
    expect(patch.statusCode).toBe(200);
    const patched = patch.json() as Array<Record<string, unknown>>;
    expect(patched.find((entry) => entry['workspaceId'] === hiddenWorkspaceId)).toMatchObject({
      workspaceId: hiddenWorkspaceId, workspaceName: 'Hidden',
      isEnabled: true, isOverride: true, updatedAt: expect.any(String),
    });
    const get = await app.inject({ method: 'GET', url, headers: { 'x-test-admin': 'true' } });
    expect(get.json()).toEqual(patched);
    await app.inject({
      method: 'PATCH', url,
      headers: { 'x-test-admin': 'true', 'content-type': 'application/json' },
      payload: [{ workspaceId: hiddenWorkspaceId, isEnabled: false }],
    });
  });

  skipIfNoDb('forwards only an active, visible installation in a verified workspace', async () => {
    const active = await request(visibleWorkspaceId);
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({ role: 'member', workspaceId: visibleWorkspaceId });

    await expectDenied(() => request(hiddenWorkspaceId));
    await expectDenied(() => request(undefined, true));
    await expectDenied(() => request(randomUUID(), true));
    await expectDenied(() => request(visibleWorkspaceId, false, true));

    const tenantDb = buildTenantClientForCtx(context);
    for (const status of ['installing', 'failed', 'deactivated', 'uninstalled']) {
      await tenantDb.pluginInstallation.update({ where: { id: installId }, data: { status } });
      await clearVisibilityCache(installId);
      await expectDenied(() => request(visibleWorkspaceId));
    }
    await tenantDb.pluginInstallation.update({ where: { id: installId }, data: { status: 'active' } });
    await prisma.tenant.update({ where: { id: context.tenantId }, data: { status: 'suspended' } });
    await expectDenied(() => request(visibleWorkspaceId));
    await prisma.tenant.update({ where: { id: context.tenantId }, data: { status: 'active' } });
    await clearVisibilityCache(installId);

    expect((await request(visibleWorkspaceId)).statusCode).toBe(200);
    await expectDenied(() => request(hiddenWorkspaceId));
    await tenantDb.$disconnect();
  }, 30_000);
});
