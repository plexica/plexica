/**
 * Integration Tests: Observability V1 Routes
 *
 * Spec 012, T012-38 (ADR-026, ADR-027, ADR-028, ADR-030).
 *
 * Tests all 7 observability endpoints registered at /api/v1/observability:
 *   GET /plugins/health-summary
 *   GET /plugins/:id/query
 *   GET /plugins/:id/logs
 *   GET /alerts
 *   GET /alerts/history
 *   GET /traces
 *   GET /traces/:traceId
 *
 * Strategy: mock ObservabilityService to return canned data, use
 * buildTestApp() for the full Fastify instance, and testContext.auth for
 * token generation. Tests cover: auth (401/403), validation (400),
 * backend errors (502/404), and happy paths (200).
 *
 * Constitution Compliance:
 *   - Article 1.2 §1 (Security First): all routes require super_admin auth
 *   - Article 6.2 (Error Response Format): { error: { code, message } }
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Hoist mock factories — must be before vi.mock()
// ---------------------------------------------------------------------------

const {
  mockGetPluginSummaries,
  mockQueryPluginMetrics,
  mockGetPluginLogs,
  mockGetActiveAlerts,
  mockGetAlertHistory,
  mockSearchTraces,
  mockGetTrace,
} = vi.hoisted(() => ({
  mockGetPluginSummaries: vi.fn(),
  mockQueryPluginMetrics: vi.fn(),
  mockGetPluginLogs: vi.fn(),
  mockGetActiveAlerts: vi.fn(),
  mockGetAlertHistory: vi.fn(),
  mockSearchTraces: vi.fn(),
  mockGetTrace: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ObservabilityService singleton — intercept before route registration
// ---------------------------------------------------------------------------

vi.mock('../../../services/observability.service.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../services/observability.service.js')>();
  return {
    ...original,
    observabilityService: {
      getPluginSummaries: mockGetPluginSummaries,
      queryPluginMetrics: mockQueryPluginMetrics,
      getPluginLogs: mockGetPluginLogs,
      getActiveAlerts: mockGetActiveAlerts,
      getAlertHistory: mockGetAlertHistory,
      searchTraces: mockSearchTraces,
      getTrace: mockGetTrace,
    },
    ObservabilityService: { getInstance: vi.fn() },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import {
  InvalidQueryError,
  InvalidTimeRangeError,
  TraceNotFoundError,
  ObservabilityBackendError,
} from '../../../services/observability.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-03-07T12:00:00';
const HOUR_AGO = '2026-03-07T11:00:00';

const SAMPLE_SUMMARIES = [
  {
    pluginId: 'plugin-aaa',
    pluginName: 'Plugin AAA',
    scraped: true,
    requestCount: 100,
    p95LatencySeconds: 0.05,
    errorRate: 0.01,
    lastScrapedAt: NOW,
  },
];

const SAMPLE_METRICS = { data: { resultType: 'matrix', result: [] } };

const SAMPLE_LOGS = {
  data: [{ timestamp: NOW, level: 'info', message: 'started', traceId: null }],
  pagination: { total: 1, limit: 100, hasMore: false },
};

const SAMPLE_ALERTS = [
  {
    alertName: 'HighErrorRate',
    severity: 'critical',
    pluginId: 'plugin-aaa',
    description: 'Error rate too high',
    state: 'firing',
    activeAt: NOW,
    value: '0.05',
  },
];

const SAMPLE_ALERT_HISTORY = {
  data: [],
  pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
};

const SAMPLE_TRACES = {
  data: [
    {
      traceId: 'abc123',
      rootService: 'plugin-aaa',
      durationMs: 45,
      spanCount: 3,
      status: 'ok',
      startTime: NOW,
    },
  ],
  pagination: { total: 1, limit: 20, hasMore: false },
};

const SAMPLE_TRACE_DETAIL = {
  traceId: 'abc123',
  rootService: 'plugin-aaa',
  durationMs: 45,
  spans: [
    {
      spanId: 'span001',
      parentSpanId: null,
      operationName: 'HTTP GET /health',
      durationMs: 45,
      startTime: NOW,
      statusCode: 200,
      attributes: {},
    },
  ],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Observability V1 Routes — Integration Tests', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let tenantAdminToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();

    // A regular tenant admin does NOT have super_admin role
    const slug = `obs-test-${Date.now()}`;
    tenantAdminToken = testContext.auth.createMockTenantAdminToken(slug);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // GET /api/v1/observability/plugins/health-summary
  // =========================================================================

  describe('GET /api/v1/observability/plugins/health-summary', () => {
    it('200 — returns plugin summaries for super_admin', async () => {
      mockGetPluginSummaries.mockResolvedValueOnce(SAMPLE_SUMMARIES);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/health-summary',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: typeof SAMPLE_SUMMARIES }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].pluginId).toBe('plugin-aaa');
      expect(body.data[0].scraped).toBe(true);
    });

    it('200 — empty array when no plugins match', async () => {
      mockGetPluginSummaries.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/health-summary',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toEqual([]);
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/health-summary',
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 — tenant admin does not have super_admin role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/health-summary',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('502 — returns OBSERVABILITY_BACKEND_UNAVAILABLE when service throws', async () => {
      mockGetPluginSummaries.mockRejectedValueOnce(
        new ObservabilityBackendError('Prometheus unreachable')
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/health-summary',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(502);
      const body = res.json<{ error: { code: string; message: string } }>();
      expect(body.error.code).toBe('OBSERVABILITY_BACKEND_UNAVAILABLE');
    });
  });

  // =========================================================================
  // GET /api/v1/observability/plugins/:id/query
  // =========================================================================

  describe('GET /api/v1/observability/plugins/:id/query', () => {
    const validQuery = `query=http_requests_total&start=${HOUR_AGO}&end=${NOW}&step=60s`;

    it('200 — returns Prometheus range query result', async () => {
      mockQueryPluginMetrics.mockResolvedValueOnce(SAMPLE_METRICS);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/query?${validQuery}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { resultType: string } }>();
      expect(body.data.resultType).toBe('matrix');
    });

    it('400 — missing required query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/plugin-aaa/query?start=2026-03-07T11:00:00&end=2026-03-07T12:00:00',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('INVALID_QUERY');
    });

    it('400 — INVALID_QUERY when service rejects the PromQL expression', async () => {
      mockQueryPluginMetrics.mockRejectedValueOnce(
        new InvalidQueryError('Metric not on allowlist')
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/query?${validQuery}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_QUERY');
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/query?${validQuery}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('502 — backend unavailable', async () => {
      mockQueryPluginMetrics.mockRejectedValueOnce(
        new ObservabilityBackendError('Prometheus down')
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/query?${validQuery}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/v1/observability/plugins/:id/logs
  // =========================================================================

  describe('GET /api/v1/observability/plugins/:id/logs', () => {
    const validParams = `start=${HOUR_AGO}&end=${NOW}`;

    it('200 — returns plugin logs', async () => {
      mockGetPluginLogs.mockResolvedValueOnce(SAMPLE_LOGS);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/logs?${validParams}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof SAMPLE_LOGS>();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });

    it('400 — missing required start/end parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/plugins/plugin-aaa/logs',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('400 — INVALID_QUERY when service rejects malformed LogQL filter', async () => {
      mockGetPluginLogs.mockRejectedValueOnce(
        new InvalidQueryError('Malformed LogQL filter expression')
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/logs?${validParams}&query=%7Bjob%3D%22plugins%22%7D`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/plugins/plugin-aaa/logs?${validParams}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/observability/alerts
  // =========================================================================

  describe('GET /api/v1/observability/alerts', () => {
    it('200 — returns currently-firing alerts', async () => {
      mockGetActiveAlerts.mockResolvedValueOnce(SAMPLE_ALERTS);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: typeof SAMPLE_ALERTS }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].alertName).toBe('HighErrorRate');
      expect(body.data[0].severity).toBe('critical');
    });

    it('200 — returns empty array when no alerts are firing', async () => {
      mockGetActiveAlerts.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toEqual([]);
    });

    it('400 — invalid severity value', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts?severity=urgent',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts',
      });
      expect(res.statusCode).toBe(401);
    });

    it('502 — backend unavailable', async () => {
      mockGetActiveAlerts.mockRejectedValueOnce(
        new ObservabilityBackendError('Prometheus unreachable')
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/v1/observability/alerts/history
  // =========================================================================

  describe('GET /api/v1/observability/alerts/history', () => {
    it('200 — returns paginated alert history', async () => {
      mockGetAlertHistory.mockResolvedValueOnce(SAMPLE_ALERT_HISTORY);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts/history?page=1&per_page=20',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof SAMPLE_ALERT_HISTORY>();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.per_page).toBe(20);
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts/history',
      });
      expect(res.statusCode).toBe(401);
    });

    it('403 — tenant admin cannot access alert history', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/alerts/history',
        headers: { authorization: `Bearer ${tenantAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/v1/observability/traces
  // =========================================================================

  describe('GET /api/v1/observability/traces', () => {
    const validParams = `start=${HOUR_AGO}&end=${NOW}`;

    it('200 — returns trace list', async () => {
      mockSearchTraces.mockResolvedValueOnce(SAMPLE_TRACES);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/traces?${validParams}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof SAMPLE_TRACES>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].traceId).toBe('abc123');
    });

    it('400 — missing required start/end parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/traces',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('400 — INVALID_TIME_RANGE when service rejects time range', async () => {
      mockSearchTraces.mockRejectedValueOnce(new InvalidTimeRangeError('start must be before end'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/traces?${validParams}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_TIME_RANGE');
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/traces?${validParams}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('502 — backend unavailable', async () => {
      mockSearchTraces.mockRejectedValueOnce(new ObservabilityBackendError('Tempo unreachable'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/observability/traces?${validParams}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(502);
    });
  });

  // =========================================================================
  // GET /api/v1/observability/traces/:traceId
  // =========================================================================

  describe('GET /api/v1/observability/traces/:traceId', () => {
    it('200 — returns full trace detail', async () => {
      mockGetTrace.mockResolvedValueOnce(SAMPLE_TRACE_DETAIL);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/traces/abc123',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: typeof SAMPLE_TRACE_DETAIL }>();
      expect(body.data.traceId).toBe('abc123');
      expect(body.data.spans).toHaveLength(1);
    });

    it('404 — TRACE_NOT_FOUND when trace does not exist in Tempo', async () => {
      mockGetTrace.mockRejectedValueOnce(new TraceNotFoundError('Trace not found'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/traces/nonexistent',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('TRACE_NOT_FOUND');
    });

    it('401 — no Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/traces/abc123',
      });
      expect(res.statusCode).toBe(401);
    });

    it('502 — backend unavailable', async () => {
      mockGetTrace.mockRejectedValueOnce(new ObservabilityBackendError('Tempo unreachable'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/traces/abc123',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(502);
    });
  });
});
