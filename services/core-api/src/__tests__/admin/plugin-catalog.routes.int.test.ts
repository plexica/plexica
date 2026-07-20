// plugin-catalog.routes.int.test.ts
// Integration tests — super-admin plugin review + publish/unpublish (S5-800,
// ADR-022 Decision 5). Uses real DB; auth/tenant are stubbed via makeFullStub.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { pluginCatalogRoutes } from '../../modules/admin/routes/plugin-catalog.routes.js';
import { adminPublishRoutes } from '../../modules/plugin/routes/admin-publish.routes.js';
import { createTestServer, isDbReachable, makeFullStub } from '../helpers/server.helpers.js';
import {
  buildTenantClientForCtx,
  cleanupTenant,
  seedTenant,
} from '../helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

let server: FastifyInstance;

interface SeedPluginInput {
  slug: string;
  status?: string;
  reviewStatus?: string;
}

async function seedPlugin(input: SeedPluginInput): Promise<string> {
  const row = await prisma.plugin.create({
    data: {
      slug: input.slug,
      name: input.slug,
      version: '1.0.0',
      author: 'Test',
      categories: [],
      manifest: {},
      status: input.status ?? 'draft',
      reviewStatus: input.reviewStatus ?? 'none',
      registryUrl: 'https://registry.example.com',
      imageName: input.slug,
      imageTag: '1.0.0',
      createdByKeycloakId: SUPER_ADMIN_ACTOR,
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  if (!(await isDbReachable())) {
    throw new Error('Database is not reachable — ensure PostgreSQL is running.');
  }
  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(pluginCatalogRoutes, { prefix: '/api/v1/admin' });
  await server.register(adminPublishRoutes);
  await server.ready();
});

afterAll(async () => { if (server) await server.close(); });

afterEach(async () => {
  await prisma.platformAuditLog.deleteMany({
    where: { action: { startsWith: 'plugin.' }, actorId: SUPER_ADMIN_ACTOR },
  });
  await prisma.plugin.deleteMany({ where: { slug: { startsWith: 'test-cat-' } } });
});

describe('Plugin Catalog — review + publish/unpublish', () => {
  it('POST review approve — flips pending → approved (200)', async () => {
    await seedPlugin({ slug: 'test-cat-pending', reviewStatus: 'pending' });
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-pending/review',
      payload: { decision: 'approve', notes: 'looks good' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.reviewStatus).toBe('approved');
    expect(body.reviewedBy).toBe(SUPER_ADMIN_ACTOR);
  });

  it('POST review — rejects non-pending plugin (422 VALIDATION_ERROR)', async () => {
    await seedPlugin({ slug: 'test-cat-approved', reviewStatus: 'approved' });
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-approved/review',
      payload: { decision: 'approve' },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });

  it('POST review — 404 PLUGIN_NOT_FOUND for unknown slug', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-missing/review',
      payload: { decision: 'approve' },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).error.code).toBe('PLUGIN_NOT_FOUND');
  });

  it('POST publish — 403 REVIEW_REQUIRED when not approved', async () => {
    await seedPlugin({ slug: 'test-cat-unapproved', status: 'draft', reviewStatus: 'none' });
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-unapproved/publish',
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).error.code).toBe('REVIEW_REQUIRED');
  });

  it('POST publish — 200 after approval, then unpublish → unpublished (no installs)', async () => {
    const id = await seedPlugin({ slug: 'test-cat-flow', reviewStatus: 'approved' });
    const pub = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-flow/publish',
    });
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(pub.payload).status).toBe('published');

    const unpub = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-flow/unpublish',
    });
    expect(unpub.statusCode).toBe(200);
    const body = JSON.parse(unpub.payload);
    expect(body.status).toBe('unpublished');
    expect(body.installedCount).toBe(0);
    expect(body.id).toBe(id);
  });

  it('POST unpublish — → deprecated when installations exist', async () => {
    const pluginId = await seedPlugin({ slug: 'test-cat-dep', status: 'published', reviewStatus: 'approved' });
    const { tenantContext } = await seedTenant('test-cat-dep');
    const tenantDb = buildTenantClientForCtx(tenantContext);
    try {
      await tenantDb.pluginInstallation.create({
        data: {
          pluginId,
          tenantSlug: tenantContext.slug,
          status: 'active',
          hostingType: 'sidecar',
          installedBy: SUPER_ADMIN_ACTOR,
        },
      });
    } finally {
      await tenantDb.$disconnect();
    }

    const unpub = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/test-cat-dep/unpublish',
    });
    expect(unpub.statusCode).toBe(200);
    const body = JSON.parse(unpub.payload);
    expect(body.status).toBe('deprecated');
    expect(body.installedCount).toBeGreaterThanOrEqual(1);

    await cleanupTenant('test-cat-dep');
  });
});
