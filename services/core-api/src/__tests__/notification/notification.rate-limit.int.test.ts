// notification.rate-limit.int.test.ts
// INT (review M2): the SSE connect rate limit must key on the USER (10/min/user
// per ADR-035), not the IP. Without `hook: 'preHandler'` on the stream route,
// @fastify/rate-limit runs at onRequest — before authMiddleware populates
// request.user — so rateLimitKey falls back to request.ip and every tenant user
// shares one 10/min bucket. The test tells per-user from per-IP apart by
// exhausting the first user's bucket and then connecting as a second user on
// the same IP: per-user keying gives the second user a fresh bucket.

import { randomUUID } from 'node:crypto';

import rateLimit from '@fastify/rate-limit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { redis } from '../../lib/redis.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitErrorResponseBuilder,
  SSE_CONNECT_RATE_LIMIT,
} from '../../lib/rate-limit-config.js';
import { notificationModuleRoutes } from '../../modules/notification/index.js';
import { cleanupTenant, seedTenant } from '../helpers/db.helpers.js';
import { createTestServer, isDbReachable } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG = 'notif-int-routes-rl';

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let ctx: TenantContext;

beforeAll(async () => {
  const seeded = await seedTenant(SLUG);
  ctx = seeded.tenantContext;
});

afterAll(async () => {
  await cleanupTenant(SLUG);
  await prismaDisconnect();
});

async function prismaDisconnect(): Promise<void> {
  const { prisma } = await import('../../lib/database.js');
  await prisma.$disconnect();
}

/** Reconnects the shared Redis client (a prior file may have quit() it). */
async function ensureRedis(): Promise<boolean> {
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      return (await redis.ping()) === 'PONG';
    }
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

describe('SSE connect rate limit (INT, M2)', () => {
  skipIfNoDb(
    'is per-user (preHandler) — (limit+1)-th same-user connect → 429, a second user on the same IP is unaffected',
    async (testContext) => {
      if (!(await ensureRedis())) {
        testContext.skip();
        return;
      }

      // Fresh per-run user ids: the Redis bucket is unique to this run, so a
      // leftover bucket from a prior run within the 60s window cannot bleed in.
      const userA = randomUUID();
      const userB = randomUUID();

      // Varies the authenticated user per request via a header (the scope-level
      // auth stub normally injects a single fixed user).
      const rateServer: FastifyInstance = await createTestServer();
      rateServer.addHook('preHandler', async (request: FastifyRequest) => {
        const user = request.headers['x-test-user'] === 'second' ? userB : userA;
        (request as FastifyRequest & { user?: unknown }).user = {
          id: user,
          keycloakUserId: user,
          email: `${user}@test.plexica.io`,
          firstName: 'Test',
          lastName: 'User',
          realm: ctx.realmName,
          roles: ['tenant_admin'],
        };
        request.tenantContext = ctx;
      });
      await rateServer.register(rateLimit, {
        global: true,
        max: GLOBAL_RATE_LIMIT.max,
        timeWindow: '1 minute',
        redis,
        errorResponseBuilder: rateLimitErrorResponseBuilder,
      });
      await rateServer.register(notificationModuleRoutes);
      await rateServer.listen({ port: 0, host: '127.0.0.1' });
      const address = rateServer.server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      const base = `http://127.0.0.1:${String(port)}`;

      const controllers: AbortController[] = [];
      try {
        // Drive the assertion off the CONFIGURED limit (not a hardcoded 10):
        // E2E/CI overrides NOTIFICATION_SSE_CONNECT_RATE_LIMIT to 100 (N3), and
        // the suite must pass there too — the limit+1-th connect is 429.
        const connectLimit = SSE_CONNECT_RATE_LIMIT.max;
        const statuses: number[] = [];
        for (let i = 0; i < connectLimit + 1; i++) {
          const controller = new AbortController();
          controllers.push(controller);
          const res = await fetch(`${base}/api/v1/notifications/stream`, {
            signal: controller.signal,
          });
          statuses.push(res.status);
        }
        expect(statuses.slice(0, connectLimit).every((s) => s === 200)).toBe(true);
        expect(statuses[connectLimit]).toBe(429);

        // Second user, same IP — must NOT be rate-limited (per-user keying).
        const secondController = new AbortController();
        controllers.push(secondController);
        const second = await fetch(`${base}/api/v1/notifications/stream`, {
          headers: { 'x-test-user': 'second' },
          signal: secondController.signal,
        });
        expect(second.status).toBe(200);
      } finally {
        for (const controller of controllers) controller.abort();
        await rateServer.close();
      }
    }
  );
});
