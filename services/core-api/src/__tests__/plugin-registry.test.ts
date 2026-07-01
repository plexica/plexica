// plugin-registry.test.ts
// Integration tests — Plugin registry CRUD (Spec 004, Phase 1).

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { adminCatalogRoutes } from '../modules/plugin/routes/admin-catalog.routes.js';
import { adminPublishRoutes } from '../modules/plugin/routes/admin-publish.routes.js';
import { adminVersionsRoutes } from '../modules/plugin/routes/admin-versions.routes.js';

import { createTestServer, makeFullStub, isDbReachable } from './helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

let server: FastifyInstance;

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'plexica-master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const validManifest = {
  slug: 'test-crm', name: 'Test CRM', version: '1.0.0', description: 'A test CRM plugin',
  author: 'Test Author', icon: 'users', categories: ['sales'],
  hosting: { type: 'sidecar' as const, image: 'test/test-crm:1.0.0', port: 3000 },
  declaredTables: [{ name: 'test_crm_contacts', migrationFile: '001_create_contacts.sql' }],
  actions: [
    { action: 'test-crm:contact:create', label: 'Create Contact', defaultRole: 'member' as const },
    { action: 'test-crm:contact:read', label: 'Read Contact', defaultRole: 'viewer' as const },
  ],
  events: { subscribes: ['plexica.workspace.created'] },
};

beforeAll(async () => {
  // Fail hard if DB is not reachable — no silent skips (Constitution Rule 2)
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error('Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.');
  }

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(adminCatalogRoutes);
  await server.register(adminPublishRoutes);
  await server.register(adminVersionsRoutes);
  await server.ready();
});

afterAll(async () => { await server.close(); });

afterEach(async () => {
  await prisma.pluginVersion.deleteMany({ where: { plugin: { slug: { startsWith: 'test-' } } } });
  await prisma.plugin.deleteMany({ where: { slug: { startsWith: 'test-' } } });
});

describe('Plugin Registry — CRUD', () => {
  it('POST /api/v1/admin/plugins/register — creates a plugin', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: validManifest.slug, name: validManifest.name,
        registryUrl: 'https://registry.example.com', imageName: validManifest.slug, imageTag: '1.0.0',
        manifest: validManifest },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).slug).toBe('test-crm');
  });

  it('POST register — rejects duplicate slug', async () => {
    await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: 'test-crm', name: 'Test CRM', registryUrl: 'https://registry.example.com',
        imageName: 'test-crm', imageTag: '1.0.0', manifest: validManifest } });
    const res = await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: 'test-crm', name: 'Duplicate', registryUrl: 'https://registry.example.com',
        imageName: 'test-crm', imageTag: '1.0.0', manifest: validManifest } });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/v1/admin/plugins — lists plugins', async () => {
    await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: 'test-plugin-a', name: 'Plugin A', registryUrl: 'https://registry.example.com',
        imageName: 'test-plugin-a', imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-plugin-a', name: 'Plugin A' } } });
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/plugins' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST publish/unpublish flow', async () => {
    await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: 'test-pub', name: 'Pub Test', registryUrl: 'https://registry.example.com',
        imageName: 'test-pub', imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-pub', name: 'Pub Test' } } });

    const pub = await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/test-pub/publish' });
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(pub.payload).status).toBe('published');

    const unpub = await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/test-pub/unpublish' });
    expect(unpub.statusCode).toBe(200);
    expect(JSON.parse(unpub.payload).status).toBe('unpublished');
  });

  it('GET versions — returns version history in single query', async () => {
    await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/register',
      payload: { slug: 'test-versions', name: 'Versions', registryUrl: 'https://registry.example.com',
        imageName: 'test-versions', imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-versions', name: 'Versions' } } });
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/plugins/test-versions/versions' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toBeInstanceOf(Array);
  });

  it('POST publish — returns 404 for non-existent plugin', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/v1/admin/plugins/non-existent/publish' });
    expect(res.statusCode).toBe(404);
  });
});
