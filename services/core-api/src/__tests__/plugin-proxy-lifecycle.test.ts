import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
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
import {
  MEMBER_ID,
  OUTSIDER_ID,
  PLUGIN_SLUG,
  SLUG,
  bindProxyFixture,
  createBackend,
} from './helpers/plugin-proxy-fixture.js';
import { createTestServer, isDbReachable } from './helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let app: FastifyInstance;
let context: TenantContext;
let installId: string;
let visibleWorkspaceId: string;
let hiddenWorkspaceId: string;
let fixture: ReturnType<typeof bindProxyFixture> & {
  forwarded: { count: number };
  close: () => Promise<void>;
};

beforeAll(async () => {
  const backendFixture = createBackend();
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
  await new Promise<void>((resolve) => backendFixture.backend.listen(0, '127.0.0.1', resolve));
  registerDevBackend(PLUGIN_SLUG, {
    baseUrl: `http://127.0.0.1:${backendFixture.port()}`,
    installId,
  });
  app = await createTestServer();
  app.addHook('preHandler', async (request) => {
    await bindProxyFixture({ app, context, forwarded: backendFixture.forwarded }).authStub(request);
  });
  await app.register(proxyRoutes);
  await app.register(visibilityRoutes);
  await app.ready();
  fixture = {
    ...bindProxyFixture({ app, context, forwarded: backendFixture.forwarded }),
    forwarded: backendFixture.forwarded,
    close: backendFixture.close,
  };
});

afterAll(async () => {
  unregisterDevBackend(PLUGIN_SLUG, installId);
  await app?.close();
  await fixture?.close();
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
    const active = await fixture.request(installId, visibleWorkspaceId);
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({ role: 'member', workspaceId: visibleWorkspaceId });

    await fixture.expectDenied(() => fixture.request(installId, hiddenWorkspaceId));
    await fixture.expectDenied(() => fixture.request(installId, undefined, true));
    await fixture.expectDenied(() => fixture.request(installId, randomUUID(), true));
    await fixture.expectDenied(() => fixture.request(installId, visibleWorkspaceId, false, true));

    const tenantDb = buildTenantClientForCtx(context);
    for (const status of ['installing', 'failed', 'deactivated', 'uninstalled']) {
      await tenantDb.pluginInstallation.update({ where: { id: installId }, data: { status } });
      await clearVisibilityCache(installId);
      await fixture.expectDenied(() => fixture.request(installId, visibleWorkspaceId));
    }
    await tenantDb.pluginInstallation.update({ where: { id: installId }, data: { status: 'active' } });
    await prisma.tenant.update({ where: { id: context.tenantId }, data: { status: 'suspended' } });
    await fixture.expectDenied(() => fixture.request(installId, visibleWorkspaceId));
    await prisma.tenant.update({ where: { id: context.tenantId }, data: { status: 'active' } });
    await clearVisibilityCache(installId);

    expect((await fixture.request(installId, visibleWorkspaceId)).statusCode).toBe(200);
    await fixture.expectDenied(() => fixture.request(installId, hiddenWorkspaceId));
    await tenantDb.$disconnect();
  }, 30_000);

  skipIfNoDb('invalid installId param returns 422, not 500', async () => {
    // The route uses installIdParamSchema.parse() on request.params. Without the
    // ZodError branch in the error handler, this produced a 500 for a client-side
    // input error. Regression guard: must be 422 with VALIDATION_ERROR.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/not-a-uuid/visibility',
      headers: { 'x-test-admin': 'true' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});