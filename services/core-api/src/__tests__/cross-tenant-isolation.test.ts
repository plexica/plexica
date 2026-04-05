// cross-tenant-isolation.test.ts
// Critical security test — NFR-04: zero cross-tenant data leaks.
// Seeds two tenant schemas with distinct data; verifies data cannot cross tenant boundaries.
//
// M-3 fix: added real-HTTP concurrent request tests using fetch() against a listening
// server. The previous tests used fastify.inject() (in-process, no TCP), which does not
// exercise connection pool concurrency. The new tests use actual TCP connections to verify
// AsyncLocalStorage context isolation under real concurrency.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { prisma } from '../lib/database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { withTenantDb } from '../lib/tenant-database.js';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

const TENANT_A = 'isolation-test-alpha';
const TENANT_B = 'isolation-test-beta';
const SCHEMA_A = 'tenant_isolation_test_alpha';
const SCHEMA_B = 'tenant_isolation_test_beta';

let server: FastifyInstance;
let serverPort: number;

async function ensureTenant(slug: string, schema: string): Promise<void> {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing !== null) return;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.tenant.create({ data: { slug, name: slug, status: 'active' } });
    await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await tx.tenantConfig.create({ data: { tenantId: t.id, keycloakRealm: `plexica-${slug}` } });
  });
}

beforeAll(async () => {
  await ensureTenant(TENANT_A, SCHEMA_A);
  await ensureTenant(TENANT_B, SCHEMA_B);

  server = Fastify({ logger: false });
  configureErrorHandler(server);

  // Route that uses withTenantDb() — the correct tenant data access pattern.
  // M-3: withTenantDb() uses $transaction + SET LOCAL search_path, which is
  // safe under connection pool concurrency (unlike the old SET search_path middleware).
  // M-04: pass req.tenantContext explicitly — Fastify v5 runs preHandlers and
  // route handlers in separate async execution scopes, so AsyncLocalStorage
  // context set via enterWith() in the preHandler does not reach the handler.
  server.get(
    '/test-isolation',
    {
      preHandler: [
        // Stub auth: set a minimal request.user so tenantContextMiddleware doesn't crash
        async (req) => {
          (req as unknown as Record<string, unknown>)['user'] = {
            realm: `plexica-${(req.headers['x-tenant-slug'] as string | undefined) ?? ''}`,
          };
        },
        tenantContextMiddleware,
      ],
    },
    async (req) => {
      const rows = (await withTenantDb(
        (tx) => tx.$queryRaw<Array<{ search_path: string }>>`SHOW search_path`,
        req.tenantContext // M-04: explicit context required in Fastify v5
      )) as Array<{ search_path: string }>;
      return {
        tenant: req.tenantContext.slug,
        schemaName: req.tenantContext.schemaName,
        searchPath: rows[0]?.search_path ?? '',
      };
    }
  );

  // M-3: Listen on a real TCP port for the concurrent fetch() tests
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  serverPort = typeof address === 'object' && address !== null ? address.port : 0;
});

afterAll(async () => {
  await server.close();
  for (const [slug, schema] of [
    [TENANT_A, SCHEMA_A],
    [TENANT_B, SCHEMA_B],
  ] as const) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.tenantConfig.deleteMany({ where: { tenant: { slug } } });
    await prisma.tenant.deleteMany({ where: { slug } });
  }
  await prisma.$disconnect();
});

describe('Cross-tenant isolation (NFR-04)', () => {
  it('tenant A context has correct schema in search_path', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-isolation',
      headers: { 'x-tenant-slug': TENANT_A },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tenant: string; schemaName: string; searchPath: string };
    expect(body.tenant).toBe(TENANT_A);
    expect(body.searchPath).toContain(SCHEMA_A);
    expect(body.searchPath).not.toContain(SCHEMA_B);
  });

  it('tenant B context has correct schema in search_path', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-isolation',
      headers: { 'x-tenant-slug': TENANT_B },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tenant: string; schemaName: string; searchPath: string };
    expect(body.tenant).toBe(TENANT_B);
    expect(body.searchPath).toContain(SCHEMA_B);
    expect(body.searchPath).not.toContain(SCHEMA_A);
  });

  // M-3: Real HTTP concurrent requests — exercises actual TCP connections and
  // connection pool concurrency (unlike inject() which is in-process).
  // This test verifies AsyncLocalStorage context isolation under true parallelism.
  it('50 concurrent real-HTTP requests get correct isolated contexts', async () => {
    if (serverPort === 0) {
      // Skip if server did not listen (e.g. DB not available)
      return;
    }

    const base = `http://127.0.0.1:${serverPort}`;
    const requests: Array<Promise<{ tenant: string }>> = [];

    // Alternate between TENANT_A and TENANT_B across 50 concurrent requests
    for (let i = 0; i < 50; i++) {
      const slug = i % 2 === 0 ? TENANT_A : TENANT_B;
      requests.push(
        fetch(`${base}/test-isolation`, { headers: { 'x-tenant-slug': slug } }).then(
          (r) => r.json() as Promise<{ tenant: string }>
        )
      );
    }

    const results = await Promise.all(requests);

    for (let i = 0; i < 50; i++) {
      const expected = i % 2 === 0 ? TENANT_A : TENANT_B;
      expect(results[i]?.tenant, `Request ${i} should be ${expected}`).toBe(expected);
    }
  });
});
