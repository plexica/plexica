// user-routes.test.ts
// Integration tests for /api/me and /api/tenants/resolve endpoints.
//
// NOTE: with isolate:false a prior test file (e.g. rate-limit.test.ts) may have
// registered a vi.mock for database.js that persists in the module cache.
// vi.unmock is hoisted by Vitest before imports, ensuring this file always uses
// the real Prisma client so that the "unknown slug" assertion is not fooled by
// a mocked { status: 'active' } leaking from a previous test file.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import { prisma } from '../lib/database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import userRoutes from '../modules/user/user-routes.js';
import tenantRoutes from '../modules/tenant/tenant-routes.js';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

// Vitest hoists vi.unmock calls (like vi.mock) before module resolution.
// This removes any mock registered by a prior test file for database.js.
vi.unmock('../lib/database.js');

const RESOLVE_SLUG = 'resolve-test-tenant';
const RESOLVE_SCHEMA = 'tenant_resolve_test_tenant';

let server: FastifyInstance;

beforeAll(async () => {
  // Seed a tenant for the resolve endpoint tests
  const existing = await prisma.tenant.findUnique({ where: { slug: RESOLVE_SLUG } });
  if (existing === null) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const t = await tx.tenant.create({
        data: { slug: RESOLVE_SLUG, name: RESOLVE_SLUG, status: 'active' },
      });
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${RESOLVE_SCHEMA}"`);
      await tx.tenantConfig.create({
        data: { tenantId: t.id, keycloakRealm: `plexica-${RESOLVE_SLUG}` },
      });
    });
  }

  server = Fastify({ logger: false });
  configureErrorHandler(server);
  await server.register(tenantRoutes);

  await server.register(async (tenantScope) => {
    tenantScope.addHook('preHandler', authMiddleware);
    tenantScope.addHook('preHandler', tenantContextMiddleware);
    await tenantScope.register(userRoutes);
  });

  await server.ready();
});

afterAll(async () => {
  await server.close();
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${RESOLVE_SCHEMA}" CASCADE`);
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: RESOLVE_SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: RESOLVE_SLUG } });
  await prisma.$disconnect();
});

describe('GET /api/me', () => {
  it('returns 401 when no Authorization header provided', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/me',
      headers: { 'x-tenant-slug': RESOLVE_SLUG },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid bearer token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/me',
      headers: {
        authorization: 'Bearer invalid.token.value',
        'x-tenant-slug': RESOLVE_SLUG,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/tenants/resolve', () => {
  it('returns { exists: true } for a known active tenant (realm omitted — anti-enumeration, Decision ID-002)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tenants/resolve?slug=${RESOLVE_SLUG}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { exists: boolean; realm?: string };
    expect(body.exists).toBe(true);
    // realm is intentionally NOT returned — frontend derives it via toRealmName() convention.
    // Exposing the internal realm name to unauthenticated callers aids tenant enumeration.
    expect(body.realm).toBeUndefined();
  });

  it('returns { exists: false } for unknown slug', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tenants/resolve?slug=definitely-no-such-tenant',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { exists: boolean };
    expect(body.exists).toBe(false);
  });

  it('returns 400 TENANT_REQUIRED when slug param is missing', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tenants/resolve' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('TENANT_REQUIRED');
  });
});
