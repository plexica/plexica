// rate-limit.test.ts
// Integration tests for @fastify/rate-limit — admin endpoint rate limits.
// Tests POST /api/admin/tenants (5 req/min) and POST /api/admin/tenants/migrate-all (2 req/5 min).
//
// Auth is stubbed at root level so request.user is populated before the
// preHandler lifecycle hook where route keyGenerators run.
// A real Redis store is NOT used — @fastify/rate-limit falls back to in-memory.
//
// Database dependencies are mocked so this test runs without a live PostgreSQL
// instance or prisma generate.

import { describe, expect, it, vi } from 'vitest';

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
// request.user is populated by the root-level onRequest stub in buildTestServer().
vi.mock('../middleware/auth-middleware.js', () => ({
  authMiddleware: vi.fn().mockResolvedValue(undefined),
}));

import { buildTestServer } from './helpers/rate-limit-helpers.js';

// ---------------------------------------------------------------------------
// POST /api/admin/tenants — 5 req/min limit (ADR-012), keyed by user ID
// ---------------------------------------------------------------------------
describe('Rate limit — POST /api/admin/tenants (5 req/min, user-keyed)', () => {
  it('returns 429 on the 6th request', async () => {
    const server = await buildTestServer();
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
    const server = await buildTestServer();
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
      const res74 = lastRes as Awaited<ReturnType<typeof server.inject>>;
      const body = JSON.parse(res74.body) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(typeof body.error.message).toBe('string');
    } finally {
      await server.close();
    }
  });

  it('429 response carries x-ratelimit and retry-after headers', async () => {
    const server = await buildTestServer();
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
      const res93 = lastRes as Awaited<ReturnType<typeof server.inject>>;
      expect(res93.statusCode).toBe(429);
      expect(res93.headers['retry-after']).toBeDefined();
      expect(Number(res93.headers['x-ratelimit-limit'])).toBe(5);
      expect(Number(res93.headers['x-ratelimit-remaining'])).toBe(0);
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
    const server = await buildTestServer();
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
    const server = await buildTestServer();
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
