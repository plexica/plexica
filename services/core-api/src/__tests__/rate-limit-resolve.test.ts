// rate-limit-resolve.test.ts
// Integration tests for @fastify/rate-limit — public resolve endpoint.
// Tests GET /api/tenants/resolve (30 req/min, IP-keyed).
//
// Uses a minimal route stub instead of the real tenantRoutes plugin so the
// rate limit value is hardcoded (avoids env config conflicts: .env overrides
// RATE_LIMIT_RESOLVE_MAX to 100 for Playwright E2E, but this test verifies
// the 30 req/min threshold with only 31 requests).
// No vi.mock — no Redis: @fastify/rate-limit falls back to in-memory store.
//
// A fresh Fastify instance is built per test so rate-limit counters
// are isolated between test cases.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { prisma } from '../lib/database.js';
import { configureErrorHandler } from '../middleware/error-handler.js';
import { rateLimitErrorResponseBuilder } from '../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

const RESOLVE_MAX = 30;

const SLUG = 'rl-resolve-test';
const SCHEMA = 'tenant_rl_resolve_test';

// ---------------------------------------------------------------------------
// DB fixture setup/teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing === null) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const t = await tx.tenant.create({
        data: { slug: SLUG, name: 'RL Resolve Test', status: 'active' },
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
// Factory — fresh server per test to reset in-memory rate-limit counters.
// ---------------------------------------------------------------------------
async function buildResolveServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: RESOLVE_MAX,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  // Stub route that returns 200 — exercises the rate-limit layer without
  // importing the real tenantRoutes plugin (which reads RATE_LIMIT_RESOLVE_MAX
  // from env config that Playwright overrides to 100).
  server.get('/api/tenants/resolve', async () => ({ exists: true }));

  await server.ready();
  return server;
}

// ---------------------------------------------------------------------------
// GET /api/tenants/resolve — 30 req/min limit, keyed by IP (ADR-012)
// ---------------------------------------------------------------------------
describe('Rate limit — GET /api/tenants/resolve (30 req/min, IP key)', () => {
  it('returns 429 on the 31st request', async () => {
    const server = await buildResolveServer();
    try {
      const results: number[] = [];
      for (let i = 0; i < 31; i++) {
        const res = await server.inject({
          method: 'GET',
          url: `/api/tenants/resolve?slug=${SLUG}`,
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
    const server = await buildResolveServer();
    try {
      let lastRes: Awaited<ReturnType<typeof server.inject>> | undefined;
      for (let i = 0; i < 31; i++) {
        lastRes = await server.inject({
          method: 'GET',
          url: `/api/tenants/resolve?slug=${SLUG}`,
        });
      }
      expect(lastRes).toBeDefined();
      const res = lastRes as Awaited<ReturnType<typeof server.inject>>;
      const body = JSON.parse(res.body) as { error: { code: string } };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    } finally {
      await server.close();
    }
  });
});
