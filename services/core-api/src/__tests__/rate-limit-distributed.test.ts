// rate-limit-distributed.test.ts
// Integration test: verify that @fastify/rate-limit enforces limits correctly
// when Redis is shared between multiple Node.js process instances (distributed).
//
// Two independent Fastify instances each connect to the same Redis URL.
// Requests sent to instance A consume from the same counter as requests sent to
// instance B for the same user ID. This proves the Redis-backed state is shared.
//
// Skipped when REDIS_URL is not set (no Redis available in the environment).
// In CI, REDIS_URL is always available (see ci.yml env block).

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';

// Mock all database/provisioning/auth dependencies — this test is purely about
// cross-instance rate-limit counter sharing via Redis.
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
import { GLOBAL_RATE_LIMIT, rateLimitErrorResponseBuilder } from '../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth-middleware.js';

const REDIS_URL = process.env['REDIS_URL'] ?? '';
const hasRedis = REDIS_URL.length > 0;

// Use a unique run ID as the user ID to avoid counter pollution across
// parallel test runs or re-runs within the same minute.
const RUN_ID = `dist-test-${Date.now()}`;

const USER: AuthUser = {
  id: RUN_ID,
  email: 'dist-test@example.com',
  firstName: 'Dist',
  lastName: 'Test',
  realm: 'master',
  roles: ['super_admin'],
};

async function buildInstance(redisClient: Redis): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
    redis: redisClient,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  server.addHook('onRequest', async (request) => {
    request.user = USER;
  });

  await server.register(tenantRoutes);
  await server.ready();
  return server;
}

describe.skipIf(!hasRedis)(
  'Rate limit — distributed (shared Redis counter across two instances)',
  () => {
    it('request count is shared between two server instances', async () => {
      const redisA = new Redis(REDIS_URL, { lazyConnect: true });
      const redisB = new Redis(REDIS_URL, { lazyConnect: true });

      await redisA.connect();
      await redisB.connect();

      const instanceA = await buildInstance(redisA);
      const instanceB = await buildInstance(redisB);

      try {
        // Send 4 requests to instance A — uses 4 of the 5 allowed for POST /api/admin/tenants
        for (let i = 0; i < 4; i++) {
          const res = await instanceA.inject({
            method: 'POST',
            url: '/api/admin/tenants',
            payload: { slug: `dist-${i}`, name: 'Dist', adminEmail: 'x@x.com' },
          });
          expect(res.statusCode).not.toBe(429);
        }

        // 5th request to instance B — still within limit (counter shared = 4 used)
        const fifthRes = await instanceB.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'dist-5', name: 'Dist', adminEmail: 'x@x.com' },
        });
        expect(fifthRes.statusCode).not.toBe(429);

        // 6th request to instance B — over the 5 req/min limit
        const sixthRes = await instanceB.inject({
          method: 'POST',
          url: '/api/admin/tenants',
          payload: { slug: 'dist-6', name: 'Dist', adminEmail: 'x@x.com' },
        });
        expect(sixthRes.statusCode).toBe(429);
      } finally {
        await instanceA.close();
        await instanceB.close();
        redisA.disconnect();
        redisB.disconnect();
      }
    });
  }
);
