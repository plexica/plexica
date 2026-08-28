// Integration test for dev-mode plugin registration (F2).
// Verifies that POST /api/v1/dev/plugins/register works WITHOUT a user JWT:
// devRouteAuth gates on NODE_ENV=development + loopback + X-Tenant-Slug and
// resolves the tenant context, so a scaffolded plugin's registerBackend()
// (which sends no Authorization header) can register its local backend.
//
// Mounts the routes exactly as production does (pluginDevRoutes), outside the
// authenticated tenantScope.

import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureErrorHandler } from '../middleware/error-handler.js';
import { devRouteAuth } from '../middleware/dev-route-auth.js';
import { devPluginRoutes } from '../modules/plugin/routes/dev.routes.js';
import { getDevBackend } from '../modules/plugin/services/dev-backends.js';
import { config } from '../lib/config.js';

import { cleanupTenant, seedTenant } from './helpers/db-tenant.helpers.js';
import { isDbReachable } from './helpers/reachability.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

const TENANT_SLUG = `devreg-${randomUUID().slice(0, 8)}`;
const PLUGIN_SLUG = `devreg-plugin-${randomUUID().slice(0, 8)}`;
const BACKEND_URL = 'http://127.0.0.1:4999';

let app: FastifyInstance;
let context: TenantContext;

beforeAll(async () => {
  // The middleware reads process.env.NODE_ENV explicitly (fail-closed);
  // dev.routes.ts also reads config.NODE_ENV at module scope as
  // defense-in-depth. Both must be set for the dev gates to open.
  process.env['NODE_ENV'] = 'development';
  config.NODE_ENV = 'development';
  ({ tenantContext: context } = await seedTenant(TENANT_SLUG));
  app = Fastify({ logger: false });
  configureErrorHandler(app);
  // Production mounting: pluginDevRoutes outside tenantScope with devRouteAuth.
  app.addHook('preHandler', devRouteAuth);
  await app.register(devPluginRoutes);
  await app.ready();
});

afterAll(async () => {
  delete process.env['NODE_ENV'];
  await app?.close();
  await cleanupTenant(TENANT_SLUG);
});

describe('dev plugin registration without user JWT', () => {
  skipIfNoDb('registers a backend from localhost with a valid tenant header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/plugins/register',
      headers: { 'x-tenant-slug': TENANT_SLUG },
      payload: {
        slug: PLUGIN_SLUG,
        backendUrl: BACKEND_URL,
        extensionPoints: ['sidebar:admin'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.pluginUrl).toContain(`/api/v1/plugins/${PLUGIN_SLUG}/proxy`);
    expect(getDevBackend(PLUGIN_SLUG) !== undefined).toBe(true);
  });

  skipIfNoDb('lists the registered dev plugin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dev/plugins',
      headers: { 'x-tenant-slug': TENANT_SLUG },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const entry = body.data.find((p: { slug: string }) => p.slug === PLUGIN_SLUG);
    expect(entry).toBeDefined();
    expect(entry.backendUrl).toBe(BACKEND_URL);
  });

  skipIfNoDb('unregisters the dev backend', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/plugins/unregister',
      headers: { 'x-tenant-slug': TENANT_SLUG },
      payload: { slug: PLUGIN_SLUG },
    });

    expect(res.statusCode).toBe(200);
    expect(getDevBackend(PLUGIN_SLUG) !== undefined).toBe(false);
  });

  skipIfNoDb('rejects requests without a tenant header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/plugins/register',
      payload: { slug: PLUGIN_SLUG, backendUrl: BACKEND_URL },
    });

    expect(res.statusCode).toBe(400);
  });

  skipIfNoDb('keeps the same plugin slug isolated per tenant (M-1)', async () => {
    const otherSlug = `devreg-other-${randomUUID().slice(0, 8)}`;
    await seedTenant(otherSlug);
    try {
      // Same slug, different tenant.
      const otherRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dev/plugins/register',
        headers: { 'x-tenant-slug': otherSlug },
        payload: { slug: PLUGIN_SLUG, backendUrl: 'http://127.0.0.1:4998' },
      });
      expect(otherRes.statusCode).toBe(200);

      // Re-register in the first tenant too (a prior test may have unregistered).
      const firstRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dev/plugins/register',
        headers: { 'x-tenant-slug': TENANT_SLUG },
        payload: { slug: PLUGIN_SLUG, backendUrl: BACKEND_URL },
      });
      expect(firstRes.statusCode).toBe(200);

      // Unregister in the first tenant must NOT affect the second tenant.
      const unregFirst = await app.inject({
        method: 'POST',
        url: '/api/v1/dev/plugins/unregister',
        headers: { 'x-tenant-slug': TENANT_SLUG },
        payload: { slug: PLUGIN_SLUG },
      });
      expect(unregFirst.statusCode).toBe(200);

      const listOther = await app.inject({
        method: 'GET',
        url: '/api/v1/dev/plugins',
        headers: { 'x-tenant-slug': otherSlug },
      });
      const otherEntries = listOther.json().data.filter(
        (p: { slug: string }) => p.slug === PLUGIN_SLUG
      );
      expect(otherEntries.length).toBe(1);
    } finally {
      await cleanupTenant(otherSlug);
    }
  });
});