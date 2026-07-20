// tenant-list.routes.int.test.ts
// Integration tests for GET /api/v1/admin/tenants (Spec 005, S5-201).
// Requires real PostgreSQL. Seeds tenants directly in core.tenants.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { tenantListRoutes } from '../../modules/admin/routes/tenant-list.routes.js';
import { createTestServer, makeFullStub, isDbReachable } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const ADMIN_PREFIX = '/api/v1/admin';
const SLUG_PREFIX = 'test-adm-tl';

let server: FastifyInstance;

beforeAll(async () => {
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error(
      'Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.'
    );
  }

  // Seed 3 tenants with distinct names/slugs/statuses.
  await Promise.all([
    prisma.tenant.create({
      data: { slug: `${SLUG_PREFIX}-alpha`, name: 'Admin List Alpha', status: 'active' },
    }),
    prisma.tenant.create({
      data: { slug: `${SLUG_PREFIX}-beta`, name: 'Admin List Beta', status: 'suspended' },
    }),
    prisma.tenant.create({
      data: { slug: `${SLUG_PREFIX}-gamma`, name: 'Admin List Gamma', status: 'active' },
    }),
  ]);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(
    async (scope) => {
      scope.addHook('preHandler', requireSuperAdmin);
      await scope.register(tenantListRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
  await server.ready();
});

afterAll(async () => {
  if (server !== undefined) await server.close();
  await prisma.tenant.deleteMany({ where: { slug: { startsWith: `${SLUG_PREFIX}-` } } });
});

describe('GET /api/v1/admin/tenants — paginated tenant list', () => {
  it('returns all seeded tenants with pagination metadata', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      data: Array<{ slug: string }>;
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.total).toBeGreaterThanOrEqual(3);
    const slugs = body.data.map((t) => t.slug);
    expect(slugs).toContain(`${SLUG_PREFIX}-alpha`);
    expect(slugs).toContain(`${SLUG_PREFIX}-beta`);
  });

  it('search matches by name', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/tenants?search=${encodeURIComponent('Alpha')}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ name: string }> }>();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const t of body.data) {
      expect(t.name.toLowerCase()).toContain('alpha');
    }
  });

  it('search matches by slug', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/tenants?search=${SLUG_PREFIX}-beta`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ slug: string }> }>();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const slugs = body.data.map((t) => t.slug);
    expect(slugs).toContain(`${SLUG_PREFIX}-beta`);
  });

  it('filters by status=active', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/tenants?status=active' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ slug: string; status: string }> }>();
    for (const t of body.data) {
      expect(t.status).toBe('active');
    }
    const slugs = body.data.map((t) => t.slug);
    expect(slugs).toContain(`${SLUG_PREFIX}-alpha`);
    expect(slugs).not.toContain(`${SLUG_PREFIX}-beta`);
  });

  it('filters by status=suspended', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/tenants?status=suspended' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ slug: string; status: string }> }>();
    const slugs = body.data.map((t) => t.slug);
    expect(slugs).toContain(`${SLUG_PREFIX}-beta`);
    for (const t of body.data) {
      expect(t.status).toBe('suspended');
    }
  });

  it('honours page and pageSize params', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/tenants?pageSize=1&page=2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; page: number; pageSize: number; total: number }>();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  it('rejects an invalid status with 422', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/tenants?status=bogus' });
    expect(res.statusCode).toBe(422);
  });
});
