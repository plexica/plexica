/**
 * Integration Tests: /metrics Endpoint
 *
 * Spec 012, T012-39 (ADR-027).
 *
 * Tests the merged Prometheus scrape endpoint at GET /metrics:
 *   - Returns merged prom-client + event-bus registry output
 *   - Content-Type is Prometheus text exposition format v0.0.4
 *   - Requires super_admin auth (401 without token, 403 for tenant admin)
 *   - GET /api/metrics/events — event-bus metrics only
 *   - POST /api/metrics/events/reset — resets event metrics (non-prod only)
 *
 * Strategy: use buildTestApp() with the real MetricsService singleton.
 * prom-client Registry.merge() is exercised against the real registries.
 * We do NOT mock prom-client — verifying the real output is the point.
 *
 * Constitution Compliance:
 *   - Article 4.3 (Performance): response contains HELP + TYPE lines
 *   - Article 9.2 (Monitoring): /metrics endpoint required by Art. 9.2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';

describe('/metrics Endpoint — Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    const slug = `metrics-test-${Date.now()}`;
    tenantAdminToken = testContext.auth.createMockTenantAdminToken(slug);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // GET /metrics — merged Prometheus scrape endpoint
  // =========================================================================

  describe('GET /metrics', () => {
    it('200 — returns Prometheus text exposition format with correct Content-Type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-type']).toContain('0.0.4');
    });

    it('200 — body contains HELP and TYPE lines (valid Prometheus exposition)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('# HELP');
      expect(res.body).toContain('# TYPE');
    });

    it('200 — body includes core-api http_requests_total metric', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('http_requests_total');
    });

    it('200 — body includes Node.js default metrics (plexica_ prefix)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('plexica_');
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 — tenant admin does not have super_admin role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/metrics/events — event-bus metrics only
  // =========================================================================

  describe('GET /api/metrics/events', () => {
    it('200 — returns event-bus metrics in Prometheus format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics/events',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/metrics/events',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/metrics/events/reset — test-only reset endpoint
  // =========================================================================

  describe('POST /api/metrics/events/reset', () => {
    it('200 — resets event metrics in test environment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/metrics/events/reset',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ success: boolean; message: string }>();
      expect(body.success).toBe(true);
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/metrics/events/reset',
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
