// tenant-context.test.ts
// Integration tests for tenant context middleware.
// Tests context attachment, missing header, unknown slug, realm mismatch.
//
// Note: the middleware no longer sets search_path directly (H-1 replaced
// prisma.$queryRawUnsafe('SET search_path') with withTenantDb() / enterWithTenant()).
// Tests verify the middleware's actual contract: correct TenantContext attachment.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { prisma } from '../lib/database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import { tenantContextMiddleware, clearTenantCache } from '../middleware/tenant-context.js';

import { makeAuthStub, createServerWithRealmStub } from './helpers/tenant-context.helpers.js';

import type { FastifyInstance } from 'fastify';

const TEST_SLUG = 'ctx-test-tenant';
const TEST_SCHEMA = 'tenant_ctx_test_tenant';
const TEST_REALM = `plexica-${TEST_SLUG}`;

let server: FastifyInstance;

// P4-L-2: Registry of ephemeral servers created in individual tests.
// Cleaned up in afterAll to prevent port/resource leaks if a test throws
// before its explicit server.close() call.
const ephemeralServers: FastifyInstance[] = [];

beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: TEST_SLUG } });
  if (existing === null) {
    await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { slug: TEST_SLUG, name: TEST_SLUG, status: 'active' },
      });
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);
      await tx.tenantConfig.create({
        data: { tenantId: t.id, keycloakRealm: TEST_REALM },
      });
    });
  }

  server = Fastify({ logger: false });
  configureErrorHandler(server);
  server.get(
    '/test-ctx',
    { preHandler: [makeAuthStub(TEST_REALM), tenantContextMiddleware] },
    async (req) => ({
      tenantSlug: req.tenantContext.slug,
      schemaName: req.tenantContext.schemaName,
      realmName: req.tenantContext.realmName,
    })
  );
  await server.ready();
});

beforeEach(() => {
  clearTenantCache();
});

afterAll(async () => {
  await server.close();
  // P4-L-2: close any ephemeral servers that may have leaked if a test threw.
  // P5-M-2: afterAll is the sole owner of teardown — no catch() here so real failures surface.
  await Promise.all(ephemeralServers.map((s) => s.close()));
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: TEST_SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.$disconnect();
});

describe('Tenant context middleware', () => {
  it('attaches correct TenantContext to request for known tenant (EC-07)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-ctx',
      headers: { 'x-tenant-slug': TEST_SLUG },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      tenantSlug: string;
      schemaName: string;
      realmName: string;
    };
    expect(body.tenantSlug).toBe(TEST_SLUG);
    expect(body.schemaName).toBe(TEST_SCHEMA);
    expect(body.realmName).toBe(TEST_REALM);
  });

  it('returns 400 INVALID_TENANT_CONTEXT when X-Tenant-Slug header is missing (EC-01)', async () => {
    const res = await server.inject({ method: 'GET', url: '/test-ctx' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_TENANT_CONTEXT');
  });

  it('returns 400 INVALID_TENANT_CONTEXT for unknown slug (EC-02)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-ctx',
      headers: { 'x-tenant-slug': 'definitely-nonexistent-org' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    // ID-002: same code for EC-01 and EC-02 — prevents tenant enumeration
    expect(body.error.code).toBe('INVALID_TENANT_CONTEXT');
  });

  it('uses same generic error code for missing and unknown (ID-002 anti-enumeration)', async () => {
    const [missingRes, unknownRes] = await Promise.all([
      server.inject({ method: 'GET', url: '/test-ctx' }),
      server.inject({
        method: 'GET',
        url: '/test-ctx',
        headers: { 'x-tenant-slug': 'no-such-tenant-xyz' },
      }),
    ]);
    const missing = JSON.parse(missingRes.body) as { error: { code: string } };
    const unknown = JSON.parse(unknownRes.body) as { error: { code: string } };
    expect(missing.error.code).toBe(unknown.error.code);
  });

  it('returns 404 when JWT realm does not match tenant realm (H-2, AC-2)', async () => {
    const wrongRealmServer = await createServerWithRealmStub('plexica-some-other-tenant');
    ephemeralServers.push(wrongRealmServer);

    const res = await wrongRealmServer.inject({
      method: 'GET',
      url: '/test-realm',
      headers: { 'x-tenant-slug': TEST_SLUG },
    });

    // H-2: realm mismatch → 404 (not 401/403) per AC-2 anti-enumeration
    // P5-M-2: server.close() removed — afterAll owns teardown exclusively
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when request.user is absent (authMiddleware not configured) (H-2 fail-safe)', async () => {
    // Simulate a misconfigured route — tenantContextMiddleware without authMiddleware.
    // P4-M-1: the null guard fires BEFORE the DB lookup, so no enumeration oracle.
    const noAuthServer = Fastify({ logger: false });
    ephemeralServers.push(noAuthServer);
    configureErrorHandler(noAuthServer);
    noAuthServer.get('/test-no-auth', { preHandler: [tenantContextMiddleware] }, async () => ({
      ok: true,
    }));
    await noAuthServer.ready();

    const res = await noAuthServer.inject({
      method: 'GET',
      url: '/test-no-auth',
      headers: { 'x-tenant-slug': TEST_SLUG },
    });

    // missing user → fail safe with 404, not a 500 TypeError
    // P5-M-2: server.close() removed — afterAll owns teardown exclusively
    expect(res.statusCode).toBe(404);
  });
});
