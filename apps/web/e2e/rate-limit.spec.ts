// rate-limit.spec.ts
// E2E test: verify that @fastify/rate-limit enforces limits on the public
// GET /api/tenants/resolve endpoint (30 req/min, IP-keyed — ADR-012).
//
// Uses the Playwright `request` fixture to send raw HTTP requests directly
// to the API, bypassing the browser/UI layer. This is the appropriate pattern
// for API-level rate-limit verification (Constitution Rule 1: every feature
// with user-observable behaviour has an E2E test — rate limiting is
// user-observable as HTTP 429).
//
// Skipped when PLAYWRIGHT_API_URL is not set (e.g. local development without
// a running core-api). In CI, PLAYWRIGHT_API_URL is forwarded by ci.yml.

import { expect, test } from '@playwright/test';

const API_URL = process.env['PLAYWRIGHT_API_URL'] ?? '';
const hasApi = API_URL.length > 0;

test.describe('Rate limit — GET /api/tenants/resolve (30 req/min)', () => {
  test.skip(!hasApi, 'Requires PLAYWRIGHT_API_URL pointing to a running core-api instance');

  test('returns 429 on the 31st request within 1 minute', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test`;
    const results: number[] = [];

    for (let i = 0; i < 31; i++) {
      const res = await request.get(url);
      results.push(res.status());
    }

    // First 30 must not be rate-limited
    expect(results.slice(0, 30).every((code) => code !== 429)).toBe(true);
    // 31st must be rate-limited
    expect(results[30]).toBe(429);
  });

  test('429 response has RATE_LIMIT_EXCEEDED error envelope', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-envelope`;
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < 31; i++) {
      lastRes = await request.get(url);
    }

    expect(lastRes!.status()).toBe(429);
    const body = (await lastRes!.json()) as { error?: { code?: string; retryAfter?: string } };
    expect(body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(typeof body.error?.retryAfter).toBe('string');
  });

  test('429 response includes Retry-After header', async ({ request }) => {
    const url = `${API_URL}/api/tenants/resolve?slug=nonexistent-tenant-e2e-test-header`;
    let lastRes: Awaited<ReturnType<typeof request.get>> | undefined;

    for (let i = 0; i < 31; i++) {
      lastRes = await request.get(url);
    }

    expect(lastRes!.status()).toBe(429);
    const retryAfter = lastRes!.headers()['retry-after'];
    expect(retryAfter).toBeDefined();
    expect((retryAfter ?? '').length).toBeGreaterThan(0);
  });
});
