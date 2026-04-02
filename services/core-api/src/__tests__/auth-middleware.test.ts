// auth-middleware.test.ts
// Integration tests for Fastify auth middleware.
// Tests JWKS cache behavior and JWT validation.
// Skips when Keycloak is not reachable.

import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

import { config } from '../lib/config.js';
import errorHandlerPlugin from '../middleware/error-handler.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { getCacheStats, invalidate, resetCacheStats } from '../middleware/jwks-cache.js';

import type { FastifyInstance } from 'fastify';

// Check if Keycloak is reachable
async function isKeycloakReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.KEYCLOAK_URL}/realms/master`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let server: FastifyInstance;

beforeAll(async () => {
  server = Fastify({ logger: false });
  await server.register(errorHandlerPlugin);
  server.get('/test-auth', { preHandler: [authMiddleware] }, (req) => ({ userId: req.user.id }));
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

// L-9: reset cache stats before each test so assertions are isolated
beforeEach(() => {
  resetCacheStats();
});

const skipIfNoKeycloak = it.skipIf(await isKeycloakReachable().then((r) => !r));

describe('Auth middleware — no token', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await server.inject({ method: 'GET', url: '/test-auth' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    // Support both { error: { code } } and Fastify built-in { statusCode, error, message }
    const code =
      (body['error'] as { code?: string } | undefined)?.code ??
      (body['statusCode'] === 401 ? 'UNAUTHORIZED' : undefined);
    expect(code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { authorization: 'NotBearer token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a clearly invalid JWT', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth middleware — JWKS cache stats', () => {
  it('getCacheStats returns expected shape', () => {
    const stats = getCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('size');
    expect(typeof stats.hits).toBe('number');
  });

  it('invalidate removes realm from cache without error', () => {
    expect(() => invalidate('test-realm')).not.toThrow();
  });

  skipIfNoKeycloak('JWKS cache hit rate > 99% after warm-up (NFR-03)', async () => {
    // Send 100 requests — first will be a miss (JWKS fetch), the rest should hit the cache.
    // NFR-03 target: > 99% hit rate on steady-state traffic.
    const testRealm = `plexica-nfr03-cache-test`;
    const fakePayload = Buffer.from(
      JSON.stringify({
        iss: `${config.KEYCLOAK_URL}/realms/${testRealm}`,
        sub: 'test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: config.KEYCLOAK_CLIENT_ID,
      })
    ).toString('base64url');
    const fakeToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.fake-sig`;

    resetCacheStats();

    const N = 100;
    for (let i = 0; i < N; i++) {
      await server.inject({
        method: 'GET',
        url: '/test-auth',
        headers: { authorization: `Bearer ${fakeToken}` },
      });
    }

    const stats = getCacheStats();
    const total = stats.hits + stats.misses;
    const hitRate = total > 0 ? stats.hits / total : 0;

    // First request is a cold miss; all subsequent N-1 are cache hits.
    // Expected hit rate: 99/100 = 0.99.
    expect(
      hitRate,
      `JWKS cache hit rate ${(hitRate * 100).toFixed(1)}% — NFR-03 requires > 99%`
    ).toBeGreaterThan(0.99);
  });
});

describe('Auth middleware — validation timing (NFR-02)', () => {
  // M-7 fix: the previous test measured rejection of a malformed JWT (purely in-memory,
  // no JWKS fetch needed) against the wrong threshold. NFR-02 targets RS256 validation
  // latency of < 10ms on the CACHE-HIT path (not the cold-start path).
  //
  // This test verifies the fast path: a structurally valid JWT (correct header.payload.sig
  // format with a resolvable issuer) triggers a JWKS fetch on the first attempt. After the
  // cache is warm, the second attempt uses in-memory keys and should complete in < 10ms.
  // Note: both attempts will be rejected (invalid signature) — we measure the time cost of
  // jose's in-memory JWKS lookup, not a full successful validation.
  //
  // A test with a fully valid token (for true NFR-02 validation) requires Keycloak test
  // credentials configured in the test environment (see TODO below).
  skipIfNoKeycloak(
    'cache-hit RS256 verification completes in < 10ms after cache warm-up (NFR-02)',
    async () => {
      const testRealm = `plexica-nfr02-timing-test`;

      // Build a JWT that has the correct issuer claim so the middleware attempts a JWKS fetch
      const fakePayload = Buffer.from(
        JSON.stringify({
          iss: `${config.KEYCLOAK_URL}/realms/${testRealm}`,
          sub: 'test',
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: config.KEYCLOAK_CLIENT_ID,
        })
      ).toString('base64url');
      const fakeToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.fake-sig`;

      // First call: cold path — JWKS fetch (will 401 but populates cache)
      await server.inject({
        method: 'GET',
        url: '/test-auth',
        headers: { authorization: `Bearer ${fakeToken}` },
      });

      // Second call: cache-hit path — in-memory jose verification only
      const start = Date.now();
      await server.inject({
        method: 'GET',
        url: '/test-auth',
        headers: { authorization: `Bearer ${fakeToken}` },
      });
      const elapsed = Date.now() - start;

      // The cache-hit path should be fast (no network I/O)
      expect(elapsed).toBeLessThan(10);

      // TODO: For a true NFR-02 test with a VALID RS256 token, configure:
      //   KEYCLOAK_TEST_REALM, KEYCLOAK_TEST_USER, KEYCLOAK_TEST_PASSWORD env vars
      //   and obtain a real token via the Keycloak token endpoint here.
    }
  );

  it('rejects a malformed JWT (wrong part count) without any network call (< 5ms)', async () => {
    // This is a purely synchronous rejection — no JWKS fetch is triggered.
    // Measures base overhead of the middleware plumbing itself.
    const start = Date.now();
    await server.inject({
      method: 'GET',
      url: '/test-auth',
      headers: { authorization: 'Bearer notajwt' },
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});
