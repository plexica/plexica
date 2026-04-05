// rate-limit.test.ts
// Integration tests for @fastify/rate-limit — admin endpoint rate limits.
// Tests POST /api/admin/tenants (5 req/min) and POST /api/admin/tenants/migrate-all (2 req/5 min).
//
// Auth is stubbed at root level so request.user is populated before the
// preHandler lifecycle hook where route keyGenerators run (HIGH-3 fix).
// A real Redis store is NOT used — @fastify/rate-limit falls back to in-memory.
//
// Database dependencies are mocked so this test runs without a live PostgreSQL
// instance or prisma generate.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Mock database and migration dependencies — tests focus on rate-limit behavior,
// not tenant provisioning logic.
vi.mock('../lib/database.js', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ status: 'active' }),
    },
  },
}));

vi.mock('../modules/tenant/tenant-provisioning.js', () => ({
  provisionTenant: vi.fn().mockResolvedValue({ id: 'mock-id', slug: 'test-slug' }),
}));

vi.mock('../lib/multi-schema-migrate.js', () => ({
  migrateAll: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
}));

// Mock authMiddleware so the admin scope preHandler is a no-op.
// request.user is populated by the root-level onRequest stub below instead.
vi.mock('../middleware/auth-middleware.js', () => ({
  authMiddleware: vi.fn().mockResolvedValue(undefined),
}));

import { configureErrorHandler } from '../middleware/error-handler.js';
import tenantRoutes from '../modules/tenant/tenant-routes.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';

const SUPER_ADMIN_USER: AuthUser = {
  id: 'test-super-admin',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  realm: 'master',
  roles: ['super_admin'],
};

// ---------------------------------------------------------------------------
// Build isolated test server with in-memory rate limiting (no Redis/Keycloak).
// ---------------------------------------------------------------------------
async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => {
      const body = {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Retry after ${context.after}.`,
          retryAfter: context.after,
        },
      };
      return Object.assign(new Error('Rate limit exceeded'), {
        statusCode: 429,
        rateLimitBody: body,
      });
    },
  });

  // Populate request.user on every request so user-keyed rate limiting works.
  // authMiddleware is mocked above — this stub sets the user object that the
  // route handlers and keyGenerator will read.
  server.addHook('onRequest', async (request) => {
    request.user = SUPER_ADMIN_USER;
  });

  await server.register(tenantRoutes);
  await server.ready();
  return server;
}

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildTestServer();
});

afterAll(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// POST /api/admin/tenants — 5 req/min limit (ADR-012), keyed by user ID
// ---------------------------------------------------------------------------
describe('Rate limit — POST /api/admin/tenants (5 req/min, user-keyed)', () => {
  it('returns 429 on the 6th request', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        payload: { slug: 'test-slug', name: 'Test', adminEmail: 'x@x.com' },
      });
      results.push(res.statusCode);
    }
    expect(results.slice(0, 5).every((code) => code !== 429)).toBe(true);
    expect(results[5]).toBe(429);
  });

  it('429 body uses { error: { code: RATE_LIMIT_EXCEEDED } } envelope (MED-4)', async () => {
    const freshServer = await buildTestServer();
    try {
      let lastRes: Awaited<ReturnType<typeof freshServer.inject>> | undefined;
      for (let i = 0; i < 6; i++) {
        lastRes = await freshServer.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'test-slug', name: 'Test', adminEmail: 'x@x.com' },
        });
      }
      const body = JSON.parse(lastRes!.body) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(typeof body.error.message).toBe('string');
    } finally {
      await freshServer.close();
    }
  });

  it('429 response carries x-ratelimit and retry-after headers (MED-5)', async () => {
    const freshServer = await buildTestServer();
    try {
      let lastRes: Awaited<ReturnType<typeof freshServer.inject>> | undefined;
      for (let i = 0; i < 6; i++) {
        lastRes = await freshServer.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'test-slug', name: 'Test', adminEmail: 'x@x.com' },
        });
      }
      expect(lastRes!.statusCode).toBe(429);
      expect(lastRes!.headers['retry-after']).toBeDefined();
      expect(Number(lastRes!.headers['x-ratelimit-limit'])).toBe(5);
      expect(Number(lastRes!.headers['x-ratelimit-remaining'])).toBe(0);
    } finally {
      await freshServer.close();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/tenants/migrate-all — 2 req/5 min limit (MED-1)
// ---------------------------------------------------------------------------
describe('Rate limit — POST /api/admin/tenants/migrate-all (2 req/5 min)', () => {
  it('returns 429 on the 3rd request', async () => {
    const freshServer = await buildTestServer();
    try {
      const results: number[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await freshServer.inject({
          method: 'POST',
          url: '/api/admin/tenants/migrate-all',
        });
        results.push(res.statusCode);
      }
      expect(results.slice(0, 2).every((code) => code !== 429)).toBe(true);
      expect(results[2]).toBe(429);
    } finally {
      await freshServer.close();
    }
  });

  it('migrate-all counter is independent from admin/tenants counter', async () => {
    const freshServer = await buildTestServer();
    try {
      for (let i = 0; i < 3; i++) {
        await freshServer.inject({ method: 'POST', url: '/api/admin/tenants/migrate-all' });
      }
      const res = await freshServer.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        payload: { slug: 'test', name: 'Test', adminEmail: 'x@x.com' },
      });
      expect(res.statusCode).not.toBe(429);
    } finally {
      await freshServer.close();
    }
  });
});
