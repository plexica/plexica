// rate-limit.spec.ts
// E2E test: verify that @fastify/rate-limit enforces limits on the public
// GET /api/tenants/resolve endpoint (IP-keyed — ADR-012).
//
// Each test uses a unique trusted-proxy IP, so the full suite cannot consume
// its bucket before this spec starts. Unit/integration tests independently
// cover limiter internals; this full-stack spec keeps exact boundary behavior.
//
// Uses the Playwright `request` fixture to send raw HTTP requests directly
// to the API, bypassing the browser/UI layer. This is the appropriate pattern
// for API-level rate-limit verification (Constitution Rule 1: every feature
// with user-observable behaviour has an E2E test — rate limiting is
// user-observable as HTTP 429).
//
import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';

const API_URL = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

// Resolve endpoint boundary is shared with the core-api E2E configuration.
const RESOLVE_MAX = Number(process.env['PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX'] ?? 30);
const TEST_COUNT = RESOLVE_MAX + 1;

function isolatedRateLimitHeaders(testId: string, retry: number): Record<string, string> {
  const runId = process.env['PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_UUID'] ?? String(process.pid);
  const bytes = createHash('sha256').update(`${runId}:rate:${testId}:${String(retry)}`).digest();
  return {
    'X-Forwarded-For': `10.${bytes[0] ?? 0}.${bytes[1] ?? 0}.${(bytes[2] ?? 0) || 1}`,
  };
}

test.describe('Rate limit — GET /api/tenants/resolve', () => {
  test('returns 429 after exceeding the rate limit', async ({ request }, testInfo) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test`;
    const headers = isolatedRateLimitHeaders(testInfo.testId, testInfo.retry);
    const results: number[] = [];

    for (let i = 0; i < TEST_COUNT; i++) {
      const res = await request.get(url, { headers });
      results.push(res.status());
    }

    // First RESOLVE_MAX must not be rate-limited
    expect(results.slice(0, RESOLVE_MAX).every((code) => code !== 429)).toBe(true);
    // Last request must be rate-limited
    expect(results[results.length - 1]).toBe(429);
  });

  test('429 response has RATE_LIMIT_EXCEEDED error envelope', async ({ request }, testInfo) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-envelope`;
    const headers = isolatedRateLimitHeaders(testInfo.testId, testInfo.retry);
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < TEST_COUNT; i++) {
      lastRes = await request.get(url, { headers });
    }

    expect(lastRes).toBeDefined();
    const res = lastRes as Awaited<ReturnType<typeof request.get>>;
    expect(res.status()).toBe(429);
    const body = (await res.json()) as { error?: { code?: string; retryAfter?: string } };
    expect(body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(typeof body.error?.retryAfter).toBe('string');
  });

  test('429 response includes Retry-After header', async ({ request }, testInfo) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-header`;
    const headers = isolatedRateLimitHeaders(testInfo.testId, testInfo.retry);
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < TEST_COUNT; i++) {
      lastRes = await request.get(url, { headers });
    }

    expect(lastRes).toBeDefined();
    const res = lastRes as Awaited<ReturnType<typeof request.get>>;
    expect(res.status()).toBe(429);
    const retryAfter = res.headers()['retry-after'];
    expect(retryAfter).toBeDefined();
    expect((retryAfter ?? '').length).toBeGreaterThan(0);
  });
});
