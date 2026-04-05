// rate-limit-resolve.test.ts
// Integration tests for @fastify/rate-limit — public resolve endpoint.
// Tests GET /api/tenants/resolve (30 req/min, IP-keyed).
//
// Database dependencies are mocked so this test runs without a live PostgreSQL
// instance or prisma generate.

import { describe, expect, it, vi } from 'vitest';

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

import { buildTestServer } from './helpers/rate-limit-helpers.js';

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
