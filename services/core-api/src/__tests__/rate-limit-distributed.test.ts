// rate-limit-distributed.test.ts
// Integration test: verify that @fastify/rate-limit enforces limits correctly
// when Redis is shared between multiple Node.js process instances (distributed).
//
// Two independent Fastify instances each connect to the same Redis URL.
// Requests sent to instance A consume from the same counter as requests sent to
// instance B for the same IP. This proves the Redis-backed state is shared.
//
// The public GET /api/tenants/resolve endpoint is used because it:
//   - Requires no authentication (no vi.mock needed)
//   - Has a 30 req/min limit keyed by IP (ADR-012)
//   - Exercises the real tenantRoutes plugin with real Prisma DB
//
// Skipped when REDIS_URL is not set (no Redis available in the environment).
// In CI, REDIS_URL is always available (see ci.yml env block).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';

import { prisma } from '../lib/database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import tenantRoutes from '../modules/tenant/tenant-routes.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKeyGenerator,
  rateLimitErrorResponseBuilder,
} from '../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

const REDIS_URL = process.env['REDIS_URL'] ?? '';
const hasRedis = REDIS_URL.length > 0;

const SLUG = 'rl-dist-test';
const SCHEMA = 'tenant_rl_dist_test';

// Use a unique IP per test run to avoid Redis counter pollution from prior runs
// within the same time window. Date.now() changes each run; pad to valid IP format.
const RUN_SUFFIX = Date.now() % 255;
const RUN_IP = `10.0.${Math.floor(RUN_SUFFIX / 10) % 255}.${RUN_SUFFIX % 255}`;

// ---------------------------------------------------------------------------
// DB fixture setup/teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing === null) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const t = await tx.tenant.create({
        data: { slug: SLUG, name: 'RL Distributed Test', status: 'active' },
      });
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
      await tx.tenantConfig.create({
        data: { tenantId: t.id, keycloakRealm: `plexica-${SLUG}` },
      });
    });
  }
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Build a Fastify instance backed by the provided Redis connection.
// ---------------------------------------------------------------------------
async function buildInstance(redisClient: Redis): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
    redis: redisClient,
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  await server.register(tenantRoutes);
  await server.ready();
  return server;
}

// ---------------------------------------------------------------------------
// Distributed counter test — resolve endpoint, 30 req/min IP-keyed
// ---------------------------------------------------------------------------
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
        // Send 29 requests to instance A — uses 29 of the 30 allowed
        for (let i = 0; i < 29; i++) {
          const res = await instanceA.inject({
            method: 'GET',
            url: `/api/tenants/resolve?slug=${SLUG}`,
            remoteAddress: RUN_IP,
          });
          expect(res.statusCode).not.toBe(429);
        }

        // 30th request to instance B — still within limit (counter shared = 29 used)
        const thirtiethRes = await instanceB.inject({
          method: 'GET',
          url: `/api/tenants/resolve?slug=${SLUG}`,
          remoteAddress: RUN_IP,
        });
        expect(thirtiethRes.statusCode).not.toBe(429);

        // 31st request to instance B — over the 30 req/min limit
        const thirtyFirstRes = await instanceB.inject({
          method: 'GET',
          url: `/api/tenants/resolve?slug=${SLUG}`,
          remoteAddress: RUN_IP,
        });
        expect(thirtyFirstRes.statusCode).toBe(429);
      } finally {
        await instanceA.close();
        await instanceB.close();
        redisA.disconnect();
        redisB.disconnect();
      }
    });
  }
);
