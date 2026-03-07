/**
 * Unit Tests: ObservabilityService
 *
 * Spec 012, T012-35 (ADR-026, ADR-027, ADR-028, ADR-030).
 *
 * Strategy: mock `fetch` at the global level (vi.stubGlobal) and mock
 * `db` to return canned plugin lists. This keeps every test fast and
 * deterministic without requiring a running Prometheus/Tempo/Loki.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock factories
// ---------------------------------------------------------------------------

const { mockDbFindMany } = vi.hoisted(() => {
  const mockDbFindMany = vi.fn();
  return { mockDbFindMany };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db.js', () => ({
  db: {
    plugin: {
      findMany: mockDbFindMany,
    },
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ObservabilityService,
  observabilityService,
  InvalidQueryError,
  InvalidTimeRangeError,
  TraceNotFoundError,
  ObservabilityBackendError,
} from '../../../services/observability.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-03-07T12:00:00.000Z';
const HOUR_AGO = '2026-03-07T11:00:00.000Z';

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    })
  );
}

function mockFetchFail(status = 500): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: vi.fn().mockResolvedValue({}),
    })
  );
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('ObservabilityService — singleton', () => {
  it('should return the same instance on repeated calls', () => {
    const a = ObservabilityService.getInstance();
    const b = ObservabilityService.getInstance();
    expect(a).toBe(b);
  });

  it('exported singleton matches getInstance()', () => {
    expect(observabilityService).toBe(ObservabilityService.getInstance());
  });
});

// ---------------------------------------------------------------------------
// getPluginSummaries — fail-open behaviour
// ---------------------------------------------------------------------------

describe('ObservabilityService.getPluginSummaries()', () => {
  beforeEach(() => {
    mockDbFindMany.mockResolvedValue([
      { id: 'plugin-aaa', name: 'Plugin AAA' },
      { id: 'plugin-bbb', name: 'Plugin BBB' },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should return an empty array when no ACTIVE plugins exist', async () => {
    mockDbFindMany.mockResolvedValue([]);
    const result = await observabilityService.getPluginSummaries();
    expect(result).toEqual([]);
  });

  it('should fail-open and return null metrics when Prometheus is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await observabilityService.getPluginSummaries();
    expect(result).toHaveLength(2);
    expect(result[0].scraped).toBe(false);
    expect(result[0].requestCount).toBeNull();
    expect(result[0].p95LatencySeconds).toBeNull();
    expect(result[0].errorRate).toBeNull();
  });

  it('should mark plugin as scraped=false when Prometheus has no up metric', async () => {
    mockFetchOk({ data: { result: [] } });
    const result = await observabilityService.getPluginSummaries();
    expect(result[0].scraped).toBe(false);
  });

  it('should include pluginId and pluginName on each summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unreachable')));
    const result = await observabilityService.getPluginSummaries();
    expect(result[0].pluginId).toBe('plugin-aaa');
    expect(result[0].pluginName).toBe('Plugin AAA');
  });

  it('should filter by pluginId when provided in query', async () => {
    mockDbFindMany.mockResolvedValue([{ id: 'plugin-aaa', name: 'Plugin AAA' }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unreachable')));
    const result = await observabilityService.getPluginSummaries({ pluginId: 'plugin-aaa' });
    expect(result).toHaveLength(1);
    expect(result[0].pluginId).toBe('plugin-aaa');
  });
});

// ---------------------------------------------------------------------------
// queryPluginMetrics — validation
// ---------------------------------------------------------------------------

describe('ObservabilityService.queryPluginMetrics()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should throw InvalidTimeRangeError when start >= end', async () => {
    await expect(
      observabilityService.queryPluginMetrics(
        'plugin-x',
        'http_requests_total',
        NOW, // start == end
        NOW
      )
    ).rejects.toThrow(InvalidTimeRangeError);
  });

  it('should throw InvalidTimeRangeError when range exceeds 30 days', async () => {
    const longAgo = '2025-12-01T00:00:00.000Z';
    await expect(
      observabilityService.queryPluginMetrics('plugin-x', 'http_requests_total', longAgo, NOW)
    ).rejects.toThrow(InvalidTimeRangeError);
  });

  it('should throw InvalidQueryError for a metric not on the allowlist', async () => {
    await expect(
      observabilityService.queryPluginMetrics(
        'plugin-x',
        'os_secret_data{job="admin"}',
        HOUR_AGO,
        NOW
      )
    ).rejects.toThrow(InvalidQueryError);
  });

  it('should pass with an allowlisted metric and valid time range', async () => {
    mockFetchOk({ data: { resultType: 'matrix', result: [] } });
    const result = await observabilityService.queryPluginMetrics(
      'plugin-x',
      'http_requests_total',
      HOUR_AGO,
      NOW
    );
    expect(result).toBeDefined();
  });

  it('should throw ObservabilityBackendError when Prometheus is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(
      observabilityService.queryPluginMetrics('plugin-x', 'http_requests_total', HOUR_AGO, NOW)
    ).rejects.toThrow(ObservabilityBackendError);
  });
});

// ---------------------------------------------------------------------------
// getActiveAlerts
// ---------------------------------------------------------------------------

describe('ObservabilityService.getActiveAlerts()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should return an array of firing alerts', async () => {
    mockFetchOk({
      data: {
        alerts: [
          {
            labels: { alertname: 'HighErrorRate', severity: 'critical', plugin_id: 'p1' },
            annotations: { description: 'Error rate too high' },
            state: 'firing',
            activeAt: '2026-03-07T10:00:00Z',
            value: '0.05',
          },
        ],
      },
    });
    const alerts = await observabilityService.getActiveAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertName).toBe('HighErrorRate');
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].pluginId).toBe('p1');
  });

  it('should return empty array when no alerts are firing', async () => {
    mockFetchOk({ data: { alerts: [] } });
    const alerts = await observabilityService.getActiveAlerts();
    expect(alerts).toEqual([]);
  });

  it('should filter alerts by severity when provided', async () => {
    mockFetchOk({
      data: {
        alerts: [
          {
            labels: { alertname: 'A', severity: 'critical' },
            annotations: {},
            state: 'firing',
          },
          {
            labels: { alertname: 'B', severity: 'warning' },
            annotations: {},
            state: 'firing',
          },
        ],
      },
    });
    const alerts = await observabilityService.getActiveAlerts('critical');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertName).toBe('A');
  });

  it('should throw ObservabilityBackendError when Prometheus returns non-OK status', async () => {
    mockFetchFail(503);
    await expect(observabilityService.getActiveAlerts()).rejects.toThrow(ObservabilityBackendError);
  });
});

// ---------------------------------------------------------------------------
// getAlertHistory — pagination
// ---------------------------------------------------------------------------

describe('ObservabilityService.getAlertHistory()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should return pagination metadata', async () => {
    mockFetchOk({ data: { alerts: [] } });
    const result = await observabilityService.getAlertHistory(1, 20);
    expect(result.pagination).toMatchObject({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  });

  it('should clamp perPage to max 100', async () => {
    mockFetchOk({ data: { alerts: [] } });
    const result = await observabilityService.getAlertHistory(1, 9999);
    expect(result.pagination.per_page).toBe(100);
  });

  it('should clamp page to minimum 1', async () => {
    mockFetchOk({ data: { alerts: [] } });
    const result = await observabilityService.getAlertHistory(-5, 10);
    expect(result.pagination.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// searchTraces
// ---------------------------------------------------------------------------

describe('ObservabilityService.searchTraces()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should throw InvalidTimeRangeError when start >= end', async () => {
    await expect(observabilityService.searchTraces({ start: NOW, end: NOW })).rejects.toThrow(
      InvalidTimeRangeError
    );
  });

  it('should return trace list from Tempo', async () => {
    mockFetchOk({
      traces: [
        {
          traceID: 'abc123',
          rootServiceName: 'plugin-a',
          durationMs: 45,
          spanSet: { spans: [{}, {}] },
          startTimeUnixNano: '1741348800000000000',
        },
      ],
    });
    const result = await observabilityService.searchTraces({ start: HOUR_AGO, end: NOW });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].traceId).toBe('abc123');
    expect(result.data[0].spanCount).toBe(2);
  });

  it('should throw ObservabilityBackendError when Tempo is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(observabilityService.searchTraces({ start: HOUR_AGO, end: NOW })).rejects.toThrow(
      ObservabilityBackendError
    );
  });
});

// ---------------------------------------------------------------------------
// getTrace
// ---------------------------------------------------------------------------

describe('ObservabilityService.getTrace()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should throw TraceNotFoundError when Tempo returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: vi.fn() }));
    await expect(observabilityService.getTrace('nonexistent-trace')).rejects.toThrow(
      TraceNotFoundError
    );
  });

  it('should return a trace detail with root spans', async () => {
    mockFetchOk({
      batches: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'plugin-x' } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  spanID: 'span001',
                  parentSpanID: null,
                  name: 'HTTP GET /health',
                  durationNanos: '5000000',
                  startTimeUnixNano: '1741348800000000000',
                  statusCode: 200,
                  attributes: [],
                },
              ],
            },
          ],
        },
      ],
    });
    const detail = await observabilityService.getTrace('trace001');
    expect(detail.traceId).toBe('trace001');
    expect(detail.rootService).toBe('plugin-x');
    expect(detail.spans).toHaveLength(1);
    expect(detail.spans[0].operationName).toBe('HTTP GET /health');
  });
});

// ---------------------------------------------------------------------------
// getPluginLogs
// ---------------------------------------------------------------------------

describe('ObservabilityService.getPluginLogs()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should throw InvalidTimeRangeError when start >= end', async () => {
    await expect(observabilityService.getPluginLogs('plugin-x', NOW, NOW)).rejects.toThrow(
      InvalidTimeRangeError
    );
  });

  it('should throw InvalidQueryError for a malformed LogQL filter', async () => {
    await expect(
      observabilityService.getPluginLogs('plugin-x', HOUR_AGO, NOW, '{job="plugins"}')
    ).rejects.toThrow(InvalidQueryError);
  });

  it('should accept a valid pipe-filter expression', async () => {
    mockFetchOk({ data: { result: [] } });
    const result = await observabilityService.getPluginLogs(
      'plugin-x',
      HOUR_AGO,
      NOW,
      '|= "error"'
    );
    expect(result.data).toEqual([]);
  });

  it('should parse JSON log lines and extract level and message fields', async () => {
    const logLine = JSON.stringify({ level: 'error', msg: 'timeout', traceId: 'trace-1' });
    mockFetchOk({
      data: {
        result: [
          {
            stream: { service: 'plugin-x' },
            values: [['1741348800000000000', logLine]],
          },
        ],
      },
    });
    const result = await observabilityService.getPluginLogs('plugin-x', HOUR_AGO, NOW);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].level).toBe('error');
    expect(result.data[0].traceId).toBe('trace-1');
  });

  it('should handle plain-text (non-JSON) log lines gracefully', async () => {
    mockFetchOk({
      data: {
        result: [
          {
            stream: {},
            values: [['1741348800000000000', 'plain text log line']],
          },
        ],
      },
    });
    const result = await observabilityService.getPluginLogs('plugin-x', HOUR_AGO, NOW);
    expect(result.data[0].message).toBe('plain text log line');
    expect(result.data[0].level).toBe('info');
  });
});
