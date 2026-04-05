// rate-limit-resolve.test.ts
// Integration tests for @fastify/rate-limit — public resolve endpoint.
// Tests GET /api/tenants/resolve (30 req/min, IP-keyed).
//
// Database dependencies are mocked so this test runs without a live PostgreSQL
// instance or prisma generate.

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Mock database and migration dependencies.
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

  server.addHook('onRequest', async (request) => {
    request.user = SUPER_ADMIN_USER;
  });

  await server.register(tenantRoutes);
  await server.ready();
  return server;
}

// ---------------------------------------------------------------------------
// GET /api/tenants/resolve — 30 req/min limit, keyed by IP (ADR-012)
// ---------------------------------------------------------------------------
describe('Rate limit — GET /api/tenants/resolve (30 req/min, IP key)', () => {
  it('returns 429 on the 31st request', async () => {
    const server = await buildTestServer();
    try {
      const results: number[] = [];

      for (let i = 0; i < 31; i++) {
        const res = await server.inject({
          method: 'GET',
          url: '/api/tenants/resolve?slug=acme',
        });
        results.push(res.statusCode);
      }

      expect(results.slice(0, 30).every((code) => code !== 429)).toBe(true);
      expect(results[30]).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('429 body uses { error: { code: RATE_LIMIT_EXCEEDED } } envelope', async () => {
    const server = await buildTestServer();
    try {
      let lastRes: Awaited<ReturnType<typeof server.inject>> | undefined;
      for (let i = 0; i < 31; i++) {
        lastRes = await server.inject({
          method: 'GET',
          url: '/api/tenants/resolve?slug=acme',
        });
      }
      const body = JSON.parse(lastRes!.body) as { error: { code: string } };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    } finally {
      await server.close();
    }
  });
});
