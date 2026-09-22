// notification.rate-limit.int.test.ts
// INT (review M2): the SSE connect rate limit must key on the tenant+USER
// (10/min/user per ADR-035), not the IP or a tenant-less user id. Without
// `hook: 'preHandler'` on the stream route, @fastify/rate-limit runs at
// onRequest — before authMiddleware populates request.user — so rateLimitKey
// falls back to request.ip and every tenant user shares one 10/min bucket.
// Review finding: the key must also carry the tenant id — equal user ids
// across tenants used to share a single bucket. The test tells per-tenant-user
// from per-IP apart by exhausting the first user's bucket in tenant A and then
// connecting as (1) a second user in tenant A on the same IP — a fresh bucket
// per user — and (2) the same first user in a different tenant — a fresh
// bucket per tenant.

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
import { createTestServer, ensureRedis, isDbReachable } from '../helpers/server.helpers.js';

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

describe('SSE connect rate limit (INT, M2)', () => {
  skipIfNoDb(
    'is per-tenant-user (preHandler) — (limit+1)-th same-user connect → 429, a second user in the tenant (or the same user in another tenant) on the same IP is unaffected',
    async (testContext) => {
      if (!(await ensureRedis())) {
        testContext.skip();
        return;
      }

      // Fresh per-run user ids: the Redis bucket is unique to this run, so a
      // leftover bucket from a prior run within the 60s window cannot bleed in.
      const userA = randomUUID();
      const userB = randomUUID();
      // Synthetic second tenant (rate-limit keying consumes only tenantId — no
      // DB row needed): the SAME user id on a DIFFERENT tenant must own a fresh
      // bucket — the per-user key is tenant-scoped (review finding: the previous
      // key omitted the tenant, so equal user ids across tenants shared one
      // bucket).
      const ctxB: TenantContext = {
        tenantId: randomUUID(),
        slug: 'notif-int-routes-rl-b',
        schemaName: 'tenant_notif_int_routes_rl_b',
        realmName: 'plexica-notif-int-routes-rl-b',
      };

      // Varies the authenticated user/tenant per request via a header (the
      // scope-level auth stub normally injects a single fixed user).
      const rateServer: FastifyInstance = await createTestServer();
      rateServer.addHook('preHandler', async (request: FastifyRequest) => {
        const foreignTenant = request.headers['x-test-tenant'] === 'b';
        const user = request.headers['x-test-user'] === 'second' ? userB : userA;
        const tenantContext = foreignTenant ? ctxB : ctx;
        (request as FastifyRequest & { user?: unknown }).user = {
          id: user,
          keycloakUserId: user,
          email: `${user}@test.plexica.io`,
          firstName: 'Test',
          lastName: 'User',
          realm: tenantContext.realmName,
          roles: ['tenant_admin'],
        };
        request.tenantContext = tenantContext;
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

        // Same user id (default userA), DIFFERENT tenant — must NOT be
        // rate-limited: the userA bucket lives in tenant A and must not bleed
        // into tenant B (tenant-scoped per-user keying).
        const foreignController = new AbortController();
        controllers.push(foreignController);
        const foreign = await fetch(`${base}/api/v1/notifications/stream`, {
          headers: { 'x-test-tenant': 'b' },
          signal: foreignController.signal,
        });
        expect(foreign.status).toBe(200);
      } finally {
        for (const controller of controllers) controller.abort();
        await rateServer.close();
      }
    }
  );
});
