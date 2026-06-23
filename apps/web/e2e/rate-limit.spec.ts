// rate-limit.spec.ts
// E2E test: verify that @fastify/rate-limit enforces limits on the public
// GET /api/tenants/resolve endpoint (IP-keyed — ADR-012).
//
// The rate limit is configurable via PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX
// (default 30). In dev/E2E with RATE_LIMIT_RESOLVE_MAX=1000, send 1001
// requests; in CI (default 30), send 31. This prevents flaky failures
// when the shared rate-limit budget is consumed across test runs.
//
// Uses the Playwright `request` fixture to send raw HTTP requests directly
// to the API, bypassing the browser/UI layer. This is the appropriate pattern
// for API-level rate-limit verification (Constitution Rule 1: every feature
// with user-observable behaviour has an E2E test — rate limiting is
// user-observable as HTTP 429).
//
// Skipped when PLAYWRIGHT_API_URL is not set.

import { expect, test } from '@playwright/test';

const API_URL = process.env['PLAYWRIGHT_API_URL'] ?? '';
const hasApi = API_URL.length > 0;

// Resolve endpoint rate limit: configurable via env var (default 30).
// In dev mode with RATE_LIMIT_RESOLVE_MAX=1000, the test sends 1001 requests.
const RESOLVE_MAX = Number(process.env['PLAYWRIGHT_RATE_LIMIT_RESOLVE_MAX'] ?? 30);
const TEST_COUNT = RESOLVE_MAX + 1;

test.describe('Rate limit — GET /api/tenants/resolve', () => {
  test.skip(!hasApi, 'Requires PLAYWRIGHT_API_URL pointing to a running core-api instance');

  test('returns 429 after exceeding the rate limit', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test`;
    const results: number[] = [];

    for (let i = 0; i < TEST_COUNT; i++) {
      const res = await request.get(url);
      results.push(res.status());
    }

    // First RESOLVE_MAX must not be rate-limited
    expect(results.slice(0, RESOLVE_MAX).every((code) => code !== 429)).toBe(true);
    // Last request must be rate-limited
    expect(results[results.length - 1]).toBe(429);
  });

  test('429 response has RATE_LIMIT_EXCEEDED error envelope', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-envelope`;
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < TEST_COUNT; i++) {
      lastRes = await request.get(url);
    }

    expect(lastRes).toBeDefined();
    const res = lastRes as Awaited<ReturnType<typeof request.get>>;
    expect(res.status()).toBe(429);
    const body = (await res.json()) as { error?: { code?: string; retryAfter?: string } };
    expect(body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(typeof body.error?.retryAfter).toBe('string');
  });

  test('429 response includes Retry-After header', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-header`;
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < TEST_COUNT; i++) {
      lastRes = await request.get(url);
    }

    expect(lastRes).toBeDefined();
    const res = lastRes as Awaited<ReturnType<typeof request.get>>;
    expect(res.status()).toBe(429);
    const retryAfter = res.headers()['retry-after'];
    expect(retryAfter).toBeDefined();
    expect((retryAfter ?? '').length).toBeGreaterThan(0);
  });
});
