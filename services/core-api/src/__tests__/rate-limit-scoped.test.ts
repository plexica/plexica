// rate-limit-scoped.test.ts
// Integration test for the scoped rate-limit pattern used in index.ts:
// a second @fastify/rate-limit registration inside an encapsulated scope
// (adminScope) applies a stricter, user-keyed limit IN ADDITION to the
// global IP-keyed one, without affecting routes outside the scope.
//
// This replaced the former in-memory scope preHandler (per-process Map),
// which allowed N × max with N replicas and ignored TRUST_PROXY.

import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { configureErrorHandler } from '../middleware/error-handler.js';
import { TRUSTED_AUTH_SYMBOL } from '../middleware/auth-middleware.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKey,
  rateLimitErrorResponseBuilder,
} from '../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';

const ADMIN_USER: AuthUser = {
  id: 'scoped-admin-user',
  keycloakUserId: 'scoped-admin-user',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  realm: 'master',
  roles: ['super_admin'],
};

const SCOPED_MAX = 3;

// Mirrors index.ts: global registration + scoped second registration.
async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  await server.register(async (adminScope) => {
    // Fake auth middleware — populates request.user like authMiddleware does.
    adminScope.addHook('preHandler', async (request) => {
      request.user = ADMIN_USER;
      (request as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
    });
    await adminScope.register(rateLimit, {
      global: true,
      max: SCOPED_MAX,
      timeWindow: '1 minute',
      hook: 'preHandler',
      keyGenerator: rateLimitKey,
      errorResponseBuilder: rateLimitErrorResponseBuilder,
    });
    adminScope.get('/api/v1/admin/thing', async () => ({ ok: true }));
  });

  server.get('/api/public/thing', async () => ({ ok: true }));

  await server.ready();
  return server;
}

describe('Scoped rate limit (index.ts admin-scope pattern)', () => {
  it('enforces the stricter scoped limit on in-scope routes', async () => {
    const server = await buildServer();
    try {
      const codes: number[] = [];
      for (let i = 0; i < SCOPED_MAX + 2; i++) {
        const res = await server.inject({ method: 'GET', url: '/api/v1/admin/thing' });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, SCOPED_MAX).every((c) => c === 200)).toBe(true);
      expect(codes[SCOPED_MAX]).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('keys the scoped limit by user ID, not by IP', async () => {
    const server = await buildServer();
    try {
      // Same user, different source IPs — the counter must be shared.
      for (let i = 0; i < SCOPED_MAX; i++) {
        const res = await server.inject({
          method: 'GET',
          url: '/api/v1/admin/thing',
          remoteAddress: `10.9.${i}.1`,
        });
        expect(res.statusCode).toBe(200);
      }
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/thing',
        remoteAddress: '10.9.99.1',
      });
      expect(res.statusCode).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('does not affect routes outside the scope', async () => {
    const server = await buildServer();
    try {
      // Exhaust the scoped limit, then verify a public route still works.
      for (let i = 0; i < SCOPED_MAX + 1; i++) {
        await server.inject({ method: 'GET', url: '/api/v1/admin/thing' });
      }
      const res = await server.inject({ method: 'GET', url: '/api/public/thing' });
      expect(res.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});
