// Integration coverage for user-keyed admin endpoint rate limits.

import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { configureErrorHandler } from '../middleware/error-handler.js';
import { rateLimitKey } from '../lib/rate-limit-key.js';
import { TRUSTED_AUTH_SYMBOL } from '../middleware/auth-middleware.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKeyGenerator,
  rateLimitErrorResponseBuilder,
} from '../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';

const SUPER_ADMIN_USER: AuthUser = {
  id: 'test-super-admin',
  keycloakUserId: 'test-super-admin',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  realm: 'master',
  roles: ['super_admin'],
};

// Manual routes isolate the real rate-limit layer from external services.
async function buildAdminServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  // Fastify hook stub — sets request.user before any lifecycle hook runs.
  // This is NOT vi.mock: the real auth-middleware module is never loaded here.
  server.addHook('onRequest', async (request) => {
    request.user = SUPER_ADMIN_USER;
    (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
  });

  // POST /api/admin/tenants — 5 req/min, user-keyed (ADR-012)
  server.post(
    '/api/admin/tenants',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: rateLimitKey,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(201).send({ id: 'stub-id', slug: 'stub-slug' });
    }
  );

  // POST /api/admin/tenants/migrate-all — 2 req/5 min, user-keyed (ADR-012)
  server.post(
    '/api/admin/tenants/migrate-all',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '5 minutes',
          hook: 'preHandler',
          keyGenerator: rateLimitKey,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ total: 0, succeeded: 0, failed: 0 });
    }
  );

  await server.ready();
  return server;
}

// ---------------------------------------------------------------------------
// POST /api/admin/tenants — 5 req/min limit (ADR-012), keyed by user ID
// ---------------------------------------------------------------------------
describe('Rate limit — POST /api/admin/tenants (5 req/min, user-keyed)', () => {
  it('returns 429 on the 6th request', async () => {
    const server = await buildAdminServer();
    try {
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
    } finally {
      await server.close();
    }
  });

  it('429 body uses { error: { code: RATE_LIMIT_EXCEEDED } } envelope', async () => {
    const server = await buildAdminServer();
    try {
      let lastRes: Awaited<ReturnType<typeof server.inject>> | undefined;
      for (let i = 0; i < 6; i++) {
        lastRes = await server.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'test-slug', name: 'Test', adminEmail: 'x@x.com' },
        });
      }
      expect(lastRes).toBeDefined();
      const res = lastRes as Awaited<ReturnType<typeof server.inject>>;
      const body = JSON.parse(res.body) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(typeof body.error.message).toBe('string');
    } finally {
      await server.close();
    }
  });

  it('429 response carries x-ratelimit and retry-after headers', async () => {
    const server = await buildAdminServer();
    try {
      let lastRes: Awaited<ReturnType<typeof server.inject>> | undefined;
      for (let i = 0; i < 6; i++) {
        lastRes = await server.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'test-slug', name: 'Test', adminEmail: 'x@x.com' },
        });
      }
      expect(lastRes).toBeDefined();
      const res = lastRes as Awaited<ReturnType<typeof server.inject>>;
      expect(res.statusCode).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(Number(res.headers['x-ratelimit-limit'])).toBe(5);
      expect(Number(res.headers['x-ratelimit-remaining'])).toBe(0);
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/tenants/migrate-all — 2 req/5 min limit, keyed by user ID
// ---------------------------------------------------------------------------
describe('Rate limit — POST /api/admin/tenants/migrate-all (2 req/5 min)', () => {
  it('returns 429 on the 3rd request', async () => {
    const server = await buildAdminServer();
    try {
      const results: number[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await server.inject({
          method: 'POST',
          url: '/api/admin/tenants/migrate-all',
        });
        results.push(res.statusCode);
      }
      expect(results.slice(0, 2).every((code) => code !== 429)).toBe(true);
      expect(results[2]).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('migrate-all counter is independent from admin/tenants counter', async () => {
    const server = await buildAdminServer();
    try {
      for (let i = 0; i < 3; i++) {
        await server.inject({ method: 'POST', url: '/api/admin/tenants/migrate-all' });
      }
      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/tenants',
        payload: { slug: 'test', name: 'Test', adminEmail: 'x@x.com' },
      });
      expect(res.statusCode).not.toBe(429);
    } finally {
      await server.close();
    }
  });
});
