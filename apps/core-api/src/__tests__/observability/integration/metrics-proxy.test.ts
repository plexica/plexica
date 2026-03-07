/**
 * Integration Tests: Plugin Metrics Proxy — GET /api/v1/plugins/:id/metrics
 *
 * Spec 012, T012-40 (ADR-030, T012-18).
 *
 * Tests the plugin metrics proxy endpoint registered in plugin-v1.ts:
 *   GET /api/v1/plugins/:id/metrics
 *
 * This endpoint (T012-18):
 *   - Requires super_admin auth
 *   - Returns 404 when the plugin does not exist
 *   - Returns 503 PLUGIN_NOT_ACTIVE when plugin is not in ACTIVE lifecycle state
 *   - Proxies GET /metrics from the plugin container (http://plugin-<id>:8080/metrics)
 *   - Returns raw Prometheus text exposition (text/plain; version=0.0.4)
 *   - Returns 503 PLUGIN_UNREACHABLE when the container is unreachable
 *
 * Strategy:
 *   - Mock pluginRegistryService.getPlugin() via vi.mock to return
 *     canned plugin records (avoids a real DB call for lifecycle checks).
 *   - Mock global fetch via vi.stubGlobal to simulate container responses.
 *   - Use buildTestApp() for the full Fastify instance.
 *
 * Constitution Compliance:
 *   - Article 6.2 (Error Response Format): { error: { code, message } }
 *   - Article 5.1 (Auth): all routes require super_admin auth
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Hoist mock factories
// ---------------------------------------------------------------------------

const { mockGetPlugin } = vi.hoisted(() => ({
  mockGetPlugin: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock plugin registry service — intercept before route registration
// ---------------------------------------------------------------------------

vi.mock('../../../services/plugin.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/plugin.service.js')>();
  return {
    ...original,
    pluginRegistryService: {
      ...((original as { pluginRegistryService?: object }).pluginRegistryService ?? {}),
      getPlugin: mockGetPlugin,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { PluginLifecycleStatus } from '@plexica/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_PLUGIN = {
  id: 'plugin-test-001',
  name: 'Test Plugin',
  version: '1.0.0',
  lifecycleStatus: PluginLifecycleStatus.ACTIVE,
  status: 'PUBLISHED',
  manifest: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INACTIVE_PLUGIN = {
  ...ACTIVE_PLUGIN,
  id: 'plugin-test-002',
  lifecycleStatus: PluginLifecycleStatus.INSTALLED,
};

const SAMPLE_PROMETHEUS_BODY = `# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status="200"} 42
# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005"} 42
`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Plugin Metrics Proxy — GET /api/v1/plugins/:id/metrics', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    const slug = `metrics-proxy-test-${Date.now()}`;
    tenantAdminToken = testContext.auth.createMockTenantAdminToken(slug);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Happy path — active plugin with reachable container
  // =========================================================================

  it('200 — proxies raw Prometheus metrics from active plugin container', async () => {
    mockGetPlugin.mockResolvedValueOnce(ACTIVE_PLUGIN);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(SAMPLE_PROMETHEUS_BODY),
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total');
    expect(res.body).toContain('http_request_duration_seconds');
  });

  it('200 — response body is the exact raw text from the container (no transformation)', async () => {
    mockGetPlugin.mockResolvedValueOnce(ACTIVE_PLUGIN);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(SAMPLE_PROMETHEUS_BODY),
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.body).toBe(SAMPLE_PROMETHEUS_BODY);
  });

  // =========================================================================
  // Auth checks
  // =========================================================================

  it('401 — no Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
    });
    expect(res.statusCode).toBe(401);
  });

  it('403 — tenant admin does not have super_admin role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${tenantAdminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // =========================================================================
  // Plugin not found
  // =========================================================================

  it('404 — PLUGIN_NOT_FOUND when plugin does not exist', async () => {
    mockGetPlugin.mockRejectedValueOnce(new Error('Plugin not found'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/nonexistent-plugin/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('PLUGIN_NOT_FOUND');
  });

  // =========================================================================
  // Plugin lifecycle guard
  // =========================================================================

  it('503 — PLUGIN_NOT_ACTIVE when plugin lifecycle is INSTALLED (not ACTIVE)', async () => {
    mockGetPlugin.mockResolvedValueOnce(INACTIVE_PLUGIN);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-002/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('PLUGIN_NOT_ACTIVE');
  });

  // =========================================================================
  // Container unreachable
  // =========================================================================

  it('503 — PLUGIN_UNREACHABLE when container fetch throws (ECONNREFUSED)', async () => {
    mockGetPlugin.mockResolvedValueOnce(ACTIVE_PLUGIN);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('PLUGIN_UNREACHABLE');
  });

  it('503 — PLUGIN_UNREACHABLE when container returns non-OK status', async () => {
    mockGetPlugin.mockResolvedValueOnce(ACTIVE_PLUGIN);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      })
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('PLUGIN_UNREACHABLE');
  });

  it('503 — PLUGIN_UNREACHABLE when container fetch times out (AbortError)', async () => {
    mockGetPlugin.mockResolvedValueOnce(ACTIVE_PLUGIN);
    const abortError = new DOMException('signal aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/plugin-test-001/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('PLUGIN_UNREACHABLE');
  });
});
