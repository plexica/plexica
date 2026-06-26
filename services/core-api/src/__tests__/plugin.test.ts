// plugin.test.ts
// Integration tests — Plugin registry CRUD + manifest validation (Spec 004, Phase 1).

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { adminCatalogRoutes } from '../modules/plugin/routes/admin-catalog.routes.js';
import { adminPublishRoutes } from '../modules/plugin/routes/admin-publish.routes.js';
import { adminVersionsRoutes } from '../modules/plugin/routes/admin-versions.routes.js';

import { createTestServer, makeFullStub, isDbReachable } from './helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let server: FastifyInstance;

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';

const mockTenantContext: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'plexica-master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const validManifest = {
  slug: 'test-crm',
  name: 'Test CRM',
  version: '1.0.0',
  description: 'A test CRM plugin',
  author: 'Test Author',
  icon: 'users',
  categories: ['sales'],
  hosting: {
    type: 'sidecar' as const,
    image: 'test/test-crm:1.0.0',
    port: 3000,
  },
  declaredTables: [
    { name: 'test_crm_contacts', migrationFile: '001_create_contacts.sql' },
  ],
  actions: [
    { action: 'test-crm:contact:create', label: 'Create Contact', defaultRole: 'member' as const },
    { action: 'test-crm:contact:read', label: 'Read Contact', defaultRole: 'viewer' as const },
  ],
  events: {
    subscribes: ['plexica.workspace.created'],
  },
};

beforeAll(async () => {
  server = await createTestServer();
  const stub = makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']);
  server.addHook('preHandler', stub);
  await server.register(adminCatalogRoutes);
  await server.register(adminPublishRoutes);
  await server.register(adminVersionsRoutes);
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

describe('Plugin Registry — CRUD', () => {
  // Clean up test data after each test
  afterEach(async () => {
    await prisma.pluginVersion.deleteMany({ where: { plugin: { slug: { startsWith: 'test-' } } } });
    await prisma.plugin.deleteMany({ where: { slug: { startsWith: 'test-' } } });
  });

  skipIfNoDb('POST /api/v1/admin/plugins/register — creates a plugin', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: validManifest.slug,
        name: validManifest.name,
        registryUrl: 'https://registry.example.com',
        imageName: validManifest.slug,
        imageTag: '1.0.0',
        manifest: validManifest,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.slug).toBe('test-crm');
    expect(body.status).toBe('draft');
    expect(body.id).toBeDefined();
  });

  skipIfNoDb('POST /api/v1/admin/plugins/register — rejects duplicate slug', async () => {
    // First registration
    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-crm',
        name: 'Test CRM',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-crm',
        imageTag: '1.0.0',
        manifest: validManifest,
      },
    });

    // Second registration — same slug
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-crm',
        name: 'Test CRM Duplicate',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-crm',
        imageTag: '1.0.0',
        manifest: validManifest,
      },
    });

    expect(res.statusCode).toBe(409);
  });

  skipIfNoDb('POST /api/v1/admin/plugins/register — rejects invalid manifest', async () => {
    const invalidManifest = { ...validManifest, slug: 'INVALID_SLUG' };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'invalid',
        name: 'Invalid Plugin',
        registryUrl: 'https://registry.example.com',
        imageName: 'invalid',
        imageTag: '1.0.0',
        manifest: invalidManifest,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('slug');
  });

  skipIfNoDb('GET /api/v1/admin/plugins — lists plugins with pagination', async () => {
    // Register two plugins
    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-plugin-a',
        name: 'Plugin A',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-plugin-a',
        imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-plugin-a', name: 'Plugin A' },
      },
    });

    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-plugin-b',
        name: 'Plugin B',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-plugin-b',
        imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-plugin-b', name: 'Plugin B' },
      },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/plugins',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  skipIfNoDb('POST /api/v1/admin/plugins/:slug/publish — publishes a draft plugin', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-publish',
        name: 'Publish Test',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-publish',
        imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-publish', name: 'Publish Test' },
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/test-publish/publish',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('published');
  });

  skipIfNoDb('POST /api/v1/admin/plugins/:slug/unpublish — unpublishes a published plugin', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-unpublish',
        name: 'Unpublish Test',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-unpublish',
        imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-unpublish', name: 'Unpublish Test' },
      },
    });

    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/test-unpublish/publish',
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/test-unpublish/unpublish',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('unpublished');
  });

  skipIfNoDb('GET /api/v1/admin/plugins/:slug/versions — returns version history', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-versions',
        name: 'Versions Test',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-versions',
        imageTag: '1.0.0',
        manifest: { ...validManifest, slug: 'test-versions', name: 'Versions Test' },
      },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/plugins/test-versions/versions',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('Manifest Validation — Business Rules', () => {
  skipIfNoDb('rejects action with wrong namespace prefix', async () => {
    // Action key "workspace:create:test" collides with core prefix
    const badManifest = {
      ...validManifest,
      slug: 'test-bad-actions',
      actions: [{ action: 'workspace:create:test', label: 'Bad', defaultRole: 'member' as const }],
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-bad-actions',
        name: 'Bad Actions',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-bad-actions',
        imageTag: '1.0.0',
        manifest: badManifest,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('core action namespace');
  });

  skipIfNoDb('rejects table name without plugin prefix', async () => {
    const badManifest = {
      ...validManifest,
      slug: 'test-bad-table',
      declaredTables: [{ name: 'contacts', migrationFile: '001.sql' }],
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-bad-table',
        name: 'Bad Table',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-bad-table',
        imageTag: '1.0.0',
        manifest: badManifest,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('prefixed');
  });

  skipIfNoDb('rejects 2-part action key (must be 3-part for plugins)', async () => {
    const badManifest = {
      ...validManifest,
      slug: 'test-2part',
      actions: [{ action: 'contact:create', label: 'Bad', defaultRole: 'member' as const }],
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-2part',
        name: '2-Part Action',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-2part',
        imageTag: '1.0.0',
        manifest: badManifest,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  skipIfNoDb('rejects manifest with missing required fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/register',
      payload: {
        slug: 'test-missing',
        name: 'Missing Fields',
        registryUrl: 'https://registry.example.com',
        imageName: 'test-missing',
        imageTag: '1.0.0',
        manifest: { slug: 'test-missing' }, // missing most required fields
      },
    });

    expect(res.statusCode).toBe(400);
  });

  skipIfNoDb('returns 404 for non-existent plugin', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/admin/plugins/non-existent/publish',
    });

    expect(res.statusCode).toBe(404);
  });
});
