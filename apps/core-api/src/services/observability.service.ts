/**
 * ObservabilityService
 *
 * Spec 012, Tasks T012-20..T012-24 (ADR-026, ADR-027, ADR-028, ADR-030).
 *
 * Provides a typed interface for querying the observability stack:
 *   - Prometheus (metrics, alerts)
 *   - Loki       (logs)
 *   - Tempo      (traces)
 *
 * All queries are read-only. Write operations (scrape target management) are
 * handled by PluginTargetsService (T012-09).
 *
 * Constitution Article 4.3: queries must complete within 200ms P95; callers
 * should add their own timeouts via AbortController when needed.
 *
 * Environment variables:
 *   PROMETHEUS_URL  — default http://prometheus:9090
 *   LOKI_URL        — default http://loki:3100
 *   TEMPO_URL       — default http://tempo:3200
 */

import { logger } from '../lib/logger.js';
import type { MetricsQuery, PluginObservabilitySummary } from '../schemas/observability.schema.js';
import { db } from '../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const LOKI_URL = process.env.LOKI_URL ?? 'http://loki:3100';
const TEMPO_URL = process.env.TEMPO_URL ?? 'http://tempo:3200';

/** Timeout for backend observability queries in milliseconds. */
const QUERY_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function queryPrometheus(
  query: string,
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Prometheus responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function queryPrometheusRange(
  query: string,
  start: string,
  end: string,
  step: string = '60s',
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ query, start, end, step });
    const url = `${PROMETHEUS_URL}/api/v1/query_range?${params}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Prometheus range query responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Safe plugin ID pattern: alphanumeric, hyphens and underscores only.
 * Used to prevent PromQL / LogQL label-value injection (CRITICAL-1).
 * Plugin IDs are validated to this pattern at registration time
 * (plugin.service.ts validateManifest), but we re-validate here as
 * defence-in-depth at every query boundary.
 */
const SAFE_PLUGIN_ID = /^[a-zA-Z0-9_-]+$/;

function assertSafePluginId(pluginId: string): void {
  if (!SAFE_PLUGIN_ID.test(pluginId)) {
    throw new InvalidQueryError(
      `Invalid plugin ID: "${pluginId}". Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }
}

/**
 * Convert a millisecond Unix timestamp to a Loki nanosecond string.
 *
 * CRITICAL-2 fix: arithmetic `ms * 1_000_000` overflows Number.MAX_SAFE_INTEGER
 * for real-world timestamps (e.g. 2026-01-01 = 1.77e12 ms → 1.77e18 ns which
 * exceeds 2^53 ≈ 9e15). String concatenation avoids the precision loss.
 */
function msToLokiNanoseconds(ms: number): string {
  return ms.toString() + '000000';
}

// ---------------------------------------------------------------------------
// ObservabilityService
// ---------------------------------------------------------------------------

export class ObservabilityService {
  private static instance: ObservabilityService;

  static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Return an observability summary for every ACTIVE plugin.
   * Fails open — if Prometheus is unreachable, returns summaries with null metrics.
   */
  async getPluginSummaries(query: MetricsQuery = {}): Promise<PluginObservabilitySummary[]> {
    const activePlugins = await db.plugin.findMany({
      where: {
        lifecycleStatus: PluginLifecycleStatus.ACTIVE,
        ...(query.pluginId ? { id: query.pluginId } : {}),
      },
      select: { id: true, name: true },
    });

    const summaries = await Promise.all(
      activePlugins.map(async (plugin) => {
        try {
          return await this._fetchPluginMetrics(plugin.id, plugin.name, query);
        } catch (err) {
          logger.warn(
            { pluginId: plugin.id, error: err instanceof Error ? err.message : String(err) },
            'Failed to fetch observability metrics for plugin (non-blocking)'
          );
          return {
            pluginId: plugin.id,
            pluginName: plugin.name,
            scraped: false,
            requestCount: null,
            p95LatencySeconds: null,
            errorRate: null,
            lastScrapedAt: null,
          } satisfies PluginObservabilitySummary;
        }
      })
    );

    return summaries;
  }

  private async _fetchPluginMetrics(
    pluginId: string,
    pluginName: string,
    query: MetricsQuery
  ): Promise<PluginObservabilitySummary> {
    // CRITICAL-1: Validate before interpolating into PromQL label values
    assertSafePluginId(pluginId);

    const now = new Date();
    const from = query.from ?? new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const to = query.to ?? now.toISOString();

    // Check whether Prometheus has a live target for this plugin.
    const upResult = (await queryPrometheus(
      `up{job="plugins", plugin_id="${pluginId}"}`
    )) as PrometheusQueryResult;

    const upVector = upResult?.data?.result ?? [];
    const isScraped = upVector.length > 0 && upVector[0]?.value?.[1] === '1';

    if (!isScraped) {
      return {
        pluginId,
        pluginName,
        scraped: false,
        requestCount: null,
        p95LatencySeconds: null,
        errorRate: null,
        lastScrapedAt: null,
      };
    }

    // Total requests in window
    const requestCountResult = (await queryPrometheus(
      `increase(http_requests_total{job="plugins", plugin_id="${pluginId}"}[${_isoRangeToDuration(from, to)}])`
    )) as PrometheusQueryResult;
    const requestCount = _extractScalar(requestCountResult);

    // P95 latency
    const p95Result = (await queryPrometheus(
      `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="plugins", plugin_id="${pluginId}"}[${_isoRangeToDuration(from, to)}]))`
    )) as PrometheusQueryResult;
    const p95LatencySeconds = _extractScalar(p95Result);

    // Error rate
    const errorRateResult = (await queryPrometheus(
      `sum(rate(http_requests_total{job="plugins", plugin_id="${pluginId}", status=~"5.."}[${_isoRangeToDuration(from, to)}])) / sum(rate(http_requests_total{job="plugins", plugin_id="${pluginId}"}[${_isoRangeToDuration(from, to)}]))`
    )) as PrometheusQueryResult;
    const errorRate = _extractScalar(errorRateResult);

    // Last scrape timestamp from Prometheus target metadata
    const lastScrapedAt = upVector[0]?.value?.[0]
      ? new Date(Number(upVector[0].value[0]) * 1000).toISOString()
      : null;

    return {
      pluginId,
      pluginName,
      scraped: true,
      requestCount: requestCount !== null ? Math.round(requestCount) : null,
      p95LatencySeconds,
      errorRate: errorRate !== null ? Math.min(1, Math.max(0, errorRate)) : null,
      lastScrapedAt,
    };
  }

  /**
   * Fetch log lines for a plugin from Loki.
   * Returns raw Loki result (callers format as needed).
   */
  async queryLogs(pluginId: string, from: string, to: string, limit = 100): Promise<unknown> {
    // CRITICAL-1: Validate before interpolating into LogQL label values
    assertSafePluginId(pluginId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const logQuery = `{plugin_id="${pluginId}"}`;
      const params = new URLSearchParams({
        query: logQuery,
        start: msToLokiNanoseconds(new Date(from).getTime()), // nanoseconds (CRITICAL-2: string concat avoids overflow)
        end: msToLokiNanoseconds(new Date(to).getTime()),
        limit: String(limit),
        direction: 'backward',
      });
      const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Loki responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch traces for a plugin from Tempo.
   * Returns raw Tempo result (callers format as needed).
   */
  async queryTraces(pluginId: string, from: string, to: string, limit = 20): Promise<unknown> {
    // CRITICAL-1: Validate before interpolating into Tempo tag filter
    assertSafePluginId(pluginId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({
        tags: `plugin_id=${pluginId}`,
        start: String(Math.floor(new Date(from).getTime() / 1000)),
        end: String(Math.floor(new Date(to).getTime() / 1000)),
        limit: String(limit),
      });
      const res = await fetch(`${TEMPO_URL}/api/search?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Tempo responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute a raw Prometheus instant query. Internal use only.
   */
  private async rawQuery(promql: string): Promise<unknown> {
    return queryPrometheus(promql);
  }

  /**
   * Execute a raw Prometheus range query. Internal use only.
   */
  private async rawQueryRange(
    promql: string,
    from: string,
    to: string,
    step?: string
  ): Promise<unknown> {
    return queryPrometheusRange(promql, from, to, step);
  }

  // ---------------------------------------------------------------------------
  // T012-21: queryPluginMetrics — PromQL range query scoped to a plugin
  // ---------------------------------------------------------------------------

  /**
   * Proxy a Prometheus range query for a specific plugin.
   *
   * The `query` is validated against the METRIC_NAME_ALLOWLIST to prevent
   * PromQL injection (spec edge case #14, Art. 5.3). The plugin_id label
   * is always injected so the query is scoped to the given plugin.
   *
   * FR-028: GET /api/v1/observability/plugins/:id/query
   *
   * @throws {InvalidQueryError}      if the metric name is not on the allowlist
   * @throws {InvalidTimeRangeError}  if start ≥ end or window > 30 days
   * @throws {ObservabilityBackendError} if Prometheus is unreachable
   */
  async queryPluginMetrics(
    pluginId: string,
    query: string,
    start: string,
    end: string,
    step: string = '60s'
  ): Promise<PromQueryResult> {
    // CRITICAL-1: Validate before interpolating into PromQL label values
    assertSafePluginId(pluginId);

    // Validate time range
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      throw new InvalidTimeRangeError('start must be before end');
    }
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (endMs - startMs > THIRTY_DAYS_MS) {
      throw new InvalidTimeRangeError('Time range cannot exceed 30 days');
    }

    // Validate metric name against allowlist (injection prevention)
    const metricName = _extractMetricName(query);
    if (!metricName || !METRIC_NAME_ALLOWLIST.has(metricName)) {
      throw new InvalidQueryError(
        `Query must reference an allowed metric name. Allowed: ${[...METRIC_NAME_ALLOWLIST].join(', ')}`
      );
    }

    // Inject plugin_id label to scope the query to this plugin
    const scopedQuery = _injectPluginLabel(query, pluginId);

    try {
      const result = await queryPrometheusRange(scopedQuery, start, end, step);
      return result as PromQueryResult;
    } catch (err) {
      logger.warn(
        { pluginId, error: err instanceof Error ? err.message : String(err) },
        'Prometheus range query failed'
      );
      throw new ObservabilityBackendError('Prometheus is unreachable or returned an error');
    }
  }

  // ---------------------------------------------------------------------------
  // T012-22: getActiveAlerts + getAlertHistory — Prometheus alerts
  // ---------------------------------------------------------------------------

  /**
   * Return currently-firing Prometheus alerts, optionally filtered by severity.
   * FR-022: GET /api/v1/observability/alerts
   *
   * @throws {ObservabilityBackendError} if Prometheus is unreachable
   */
  async getActiveAlerts(severity?: AlertSeverityFilter): Promise<Alert[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(`${PROMETHEUS_URL}/api/v1/alerts`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Prometheus responded ${res.status}`);
      const body = (await res.json()) as PrometheusAlertsResponse;
      const alerts: Alert[] = (body?.data?.alerts ?? [])
        .filter((a) => a.state === 'firing')
        .filter((a) => !severity || a.labels?.severity === severity)
        .map((a) => ({
          alertName: a.labels?.alertname ?? 'unknown',
          severity: (a.labels?.severity ?? 'info') as AlertSeverityFilter,
          pluginId: a.labels?.plugin_id ?? null,
          description: a.annotations?.description ?? a.annotations?.summary ?? '',
          state: a.state ?? 'firing',
          activeAt: a.activeAt ?? null,
          value: a.value ?? null,
        }));
      return alerts;
    } catch (err) {
      if (err instanceof ObservabilityBackendError) throw err;
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to fetch active alerts from Prometheus'
      );
      throw new ObservabilityBackendError('Prometheus is unreachable or returned an error');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Return paginated resolved alerts from the last 7 days via a Prometheus
   * range query on the `ALERTS_FOR_STATE` metric.
   * FR-023: GET /api/v1/observability/alerts/history
   *
   * **Semantic limitation**: Prometheus `/api/v1/alerts` only exposes the
   * *current* alert state snapshot; it does not store resolution events or
   * historical timestamps. As a result:
   *   - `resolvedAt` is always `null` — Prometheus has no resolution event log.
   *   - `duration` is always `null` — cannot be computed without resolvedAt.
   *
   * A full alert history with resolution timestamps requires Alertmanager
   * configured with an external history store (e.g. Alertmanager + Cortex or
   * Thanos Ruler). This is tracked as future work (deferred, post-v1.0).
   *
   * @throws {ObservabilityBackendError} if Prometheus is unreachable
   */
  async getAlertHistory(
    page: number = 1,
    perPage: number = 20,
    severity?: AlertSeverityFilter
  ): Promise<PaginatedAlerts> {
    const safePage = Math.max(1, page);
    const safePerPage = Math.min(Math.max(1, perPage), 100);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      // Query resolved alerts over the last 7 days.
      // Prometheus ALERTS metric captures currently-firing alerts; we use
      // the /api/v1/alerts endpoint to retrieve all alerts including resolved
      // ones. Prometheus does not natively store resolved alert history unless
      // Alertmanager is configured with a history store. We proxy what's
      // available: inactive/resolved alerts from /api/v1/alerts.
      const res = await fetch(`${PROMETHEUS_URL}/api/v1/alerts`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Prometheus responded ${res.status}`);
      const body = (await res.json()) as PrometheusAlertsResponse;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const resolved = (body?.data?.alerts ?? [])
        .filter((a) => a.state === 'inactive' || a.state === 'pending')
        .filter((a) => {
          if (!a.activeAt) return true;
          return new Date(a.activeAt) >= sevenDaysAgo;
        })
        // Server-side severity filter (FR-023): applied before pagination so
        // that page/total counts are accurate for the filtered result set.
        .filter((a) => !severity || (a.labels?.severity ?? 'info') === severity);

      const total = resolved.length;
      const totalPages = Math.ceil(total / safePerPage);
      const offset = (safePage - 1) * safePerPage;
      const items = resolved.slice(offset, offset + safePerPage).map((a) => ({
        alertName: a.labels?.alertname ?? 'unknown',
        severity: (a.labels?.severity ?? 'info') as AlertSeverityFilter,
        pluginId: a.labels?.plugin_id ?? null,
        firedAt: a.activeAt ?? null,
        resolvedAt: null, // Prometheus API does not expose resolvedAt
        duration: null,
      }));

      return {
        data: items,
        pagination: {
          page: safePage,
          per_page: safePerPage,
          total,
          total_pages: totalPages,
        },
      };
    } catch (err) {
      if (err instanceof ObservabilityBackendError) throw err;
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to fetch alert history from Prometheus'
      );
      throw new ObservabilityBackendError('Prometheus is unreachable or returned an error');
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // T012-23: searchTraces + getTrace — Tempo
  // ---------------------------------------------------------------------------

  /**
   * Search traces via the Tempo HTTP search API.
   * FR-030: GET /api/v1/observability/traces
   *
   * @throws {InvalidTimeRangeError}     if start ≥ end
   * @throws {ObservabilityBackendError} if Tempo is unreachable
   */
  async searchTraces(opts: {
    service?: string;
    traceId?: string;
    start: string;
    end: string;
    limit?: number;
  }): Promise<PaginatedTraces> {
    const { service, traceId, start, end, limit = 20 } = opts;

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      throw new InvalidTimeRangeError('start must be before end');
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({
        start: String(Math.floor(startMs / 1000)),
        end: String(Math.floor(endMs / 1000)),
        limit: String(safeLimit),
      });
      if (service) params.set('tags', `service.name=${service}`);
      if (traceId) params.set('traceId', traceId);

      const res = await fetch(`${TEMPO_URL}/api/search?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Tempo responded ${res.status}`);
      const body = (await res.json()) as TempoSearchResponse;

      const traces: TraceResult[] = (body?.traces ?? []).map((t) => ({
        traceId: t.traceID ?? '',
        rootService: t.rootServiceName ?? 'unknown',
        durationMs: t.durationMs ?? 0,
        spanCount: t.spanSet?.spans?.length ?? 0,
        status: 'ok',
        startTime: t.startTimeUnixNano
          ? new Date(Math.floor(Number(t.startTimeUnixNano) / 1_000_000)).toISOString()
          : null,
      }));

      return {
        data: traces,
        pagination: {
          page: 1,
          per_page: safeLimit,
          total: traces.length,
          total_pages: 1,
        },
      };
    } catch (err) {
      if (err instanceof InvalidTimeRangeError) throw err;
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Tempo trace search failed'
      );
      throw new ObservabilityBackendError('Tempo is unreachable or returned an error');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Retrieve a full trace from Tempo and transform it into a nested span tree.
   * FR-031: GET /api/v1/observability/traces/:traceId
   *
   * @throws {TraceNotFoundError}        if the trace does not exist in Tempo
   * @throws {ObservabilityBackendError} if Tempo is unreachable
   */
  async getTrace(traceId: string): Promise<TraceDetail> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(`${TEMPO_URL}/api/traces/${encodeURIComponent(traceId)}`, {
        signal: controller.signal,
      });
      if (res.status === 404) {
        throw new TraceNotFoundError(`Trace ${traceId} not found`);
      }
      if (!res.ok) throw new Error(`Tempo responded ${res.status}`);

      const body = (await res.json()) as TempoTraceResponse;
      const flatSpans = _extractSpans(body);
      const rootSpans = _buildSpanTree(flatSpans);

      const rootSpan = rootSpans[0] ?? null;

      // F-006: Wall-clock trace duration = max(spanStart + spanDuration) - min(spanStart).
      // Using Math.max(...allDurations) was wrong — that returns the longest individual span
      // duration, not the end-to-end elapsed time of the trace.
      let totalDuration = 0;
      if (flatSpans.length > 0) {
        let minStartMs = Infinity;
        let maxEndMs = -Infinity;
        for (const span of flatSpans) {
          if (span.startTime) {
            const spanStartMs = new Date(span.startTime).getTime();
            const spanEndMs = spanStartMs + span.durationMs;
            if (spanStartMs < minStartMs) minStartMs = spanStartMs;
            if (spanEndMs > maxEndMs) maxEndMs = spanEndMs;
          }
        }
        totalDuration =
          isFinite(minStartMs) && isFinite(maxEndMs) && maxEndMs > minStartMs
            ? maxEndMs - minStartMs
            : Math.max(...flatSpans.map((s) => s.durationMs)); // fallback: no startTime data
      }

      return {
        traceId,
        rootService: rootSpan?.serviceName ?? 'unknown',
        durationMs: totalDuration,
        spans: rootSpans,
      };
    } catch (err) {
      if (err instanceof TraceNotFoundError || err instanceof ObservabilityBackendError) throw err;
      logger.warn(
        { traceId, error: err instanceof Error ? err.message : String(err) },
        'Tempo getTrace failed'
      );
      throw new ObservabilityBackendError('Tempo is unreachable or returned an error');
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // T012-24: getPluginLogs — Loki
  // ---------------------------------------------------------------------------

  /**
   * Query plugin logs from Loki, with optional LogQL filter expression.
   * FR-018: GET /api/v1/observability/plugins/:id/logs
   *
   * The `query` parameter is validated to contain only safe LogQL filter
   * expressions (pipe stages) to prevent LogQL injection (spec edge case #14).
   *
   * @throws {InvalidQueryError}         if the LogQL filter is malformed
   * @throws {InvalidTimeRangeError}     if start ≥ end
   * @throws {ObservabilityBackendError} if Loki is unreachable
   */
  async getPluginLogs(
    pluginId: string,
    start: string,
    end: string,
    query?: string,
    limit: number = 100
  ): Promise<PaginatedLogs> {
    // CRITICAL-1: Validate before interpolating into LogQL label values
    assertSafePluginId(pluginId);

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      throw new InvalidTimeRangeError('start must be before end');
    }

    // Validate optional LogQL filter (only pipe-stage filters allowed)
    if (query !== undefined && query !== '') {
      if (!_isValidLogQLFilter(query)) {
        throw new InvalidQueryError(
          'query must be a valid LogQL filter expression (e.g. |= "error", |~ "timeout")'
        );
      }
    }

    const safeLimit = Math.min(Math.max(1, limit), 1000);

    // Build LogQL stream selector + optional filter
    const streamSelector = `{plugin_id="${pluginId}"}`;
    const logQLQuery = query ? `${streamSelector} ${query}` : streamSelector;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({
        query: logQLQuery,
        start: msToLokiNanoseconds(startMs), // nanoseconds (CRITICAL-2: string concat avoids overflow)
        end: msToLokiNanoseconds(endMs),
        limit: String(safeLimit),
        direction: 'backward',
      });
      const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Loki responded ${res.status}`);

      const body = (await res.json()) as LokiQueryRangeResponse;
      const entries: LogEntry[] = [];

      for (const stream of body?.data?.result ?? []) {
        const serviceLabel = (stream.stream?.service as string | undefined) ?? pluginId;
        for (const [tsNs, line] of stream.values ?? []) {
          const tsMs = Math.floor(Number(tsNs) / 1_000_000);
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(line) as Record<string, unknown>;
          } catch {
            // Not JSON — treat as plain text message
          }
          entries.push({
            timestamp: new Date(tsMs).toISOString(),
            level: (parsed.level as string | undefined) ?? 'info',
            message:
              (parsed.msg as string | undefined) ?? (parsed.message as string | undefined) ?? line,
            traceId: (parsed.traceId as string | undefined) ?? null,
            tenantId: (parsed.tenantId as string | undefined) ?? null,
            service: serviceLabel,
          });
        }
      }

      const total = entries.length;
      const perPage = safeLimit;
      return {
        data: entries,
        pagination: {
          page: 1,
          per_page: perPage,
          total,
          total_pages: 1,
        },
      };
    } catch (err) {
      if (
        err instanceof InvalidQueryError ||
        err instanceof InvalidTimeRangeError ||
        err instanceof ObservabilityBackendError
      )
        throw err;
      logger.warn(
        { pluginId, error: err instanceof Error ? err.message : String(err) },
        'Loki log query failed'
      );
      throw new ObservabilityBackendError('Loki is unreachable or returned an error');
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// T012-21..24: Error classes
// ---------------------------------------------------------------------------

/** Thrown when a PromQL or LogQL expression is invalid or not on the allowlist. */
export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQueryError';
  }
}

/** Thrown when the supplied time range is invalid (start ≥ end, > 30 days, etc.). */
export class InvalidTimeRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimeRangeError';
  }
}

/** Thrown when a trace ID is not found in Tempo. */
export class TraceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceNotFoundError';
  }
}

/** Thrown when Prometheus, Tempo, or Loki is unreachable or returns an error. */
export class ObservabilityBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservabilityBackendError';
  }
}

// ---------------------------------------------------------------------------
// Internal type helpers (T012-20..T012-24)
// ---------------------------------------------------------------------------

interface PrometheusQueryResult {
  data?: {
    result?: Array<{
      metric?: Record<string, string>;
      value?: [number, string];
    }>;
  };
}

/** Extract the first scalar value from a Prometheus instant query result. */
function _extractScalar(result: PrometheusQueryResult): number | null {
  const vector = result?.data?.result ?? [];
  if (vector.length === 0) return null;
  const raw = vector[0]?.value?.[1];
  if (raw === undefined) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

/**
 * Convert an ISO date pair to a Prometheus range duration string (e.g. "3600s").
 * Clamps to a minimum of 60s to avoid trivially-small windows.
 */
function _isoRangeToDuration(from: string, to: string): string {
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  const diffS = Math.max(60, Math.floor(diffMs / 1000));
  return `${diffS}s`;
}

// ---------------------------------------------------------------------------
// T012-21: PromQL allowlist and injection-prevention helpers
// ---------------------------------------------------------------------------

/**
 * Allowlisted metric names for the plugin metrics query endpoint (FR-028).
 * Only metrics defined in ADR-030 are permitted to prevent PromQL injection.
 */
const METRIC_NAME_ALLOWLIST = new Set([
  'http_requests_total',
  'http_request_duration_seconds',
  'http_request_duration_seconds_bucket',
  'http_request_duration_seconds_count',
  'http_request_duration_seconds_sum',
  'process_cpu_seconds_total',
  'process_resident_memory_bytes',
  'nodejs_heap_size_used_bytes',
  'nodejs_active_handles_total',
  'nodejs_eventloop_lag_seconds',
]);

/**
 * Extract the leaf metric name from a PromQL expression.
 *
 * CRITICAL-4 fix: the original regex matched the first identifier in the
 * expression, which is a PromQL function name (e.g. `histogram_quantile`)
 * when wrapper functions are used.  This broke FR-028 for histogram/rate
 * queries and allowed allowlist bypass by prepending an allowed metric name.
 *
 * Fix: recursively strip the known PromQL aggregation/transformation function
 * names before extracting the leaf metric identifier.
 *
 * Known wrapper functions (extend as needed):
 *   histogram_quantile, rate, irate, increase, delta, deriv,
 *   sum, avg, max, min, count, stddev, stdvar, topk, bottomk
 */
const PROMQL_WRAPPER_FN_RE =
  /^(?:histogram_quantile|rate|irate|increase|delta|deriv|sum|avg|max|min|count|stddev|stdvar|topk|bottomk)\s*\(/i;

function _extractMetricName(query: string): string | null {
  let expr = query.trim();

  // Strip wrapping function calls iteratively until no more match.
  // Each iteration strips one layer: `fn(...)` → the argument string inside.
  // We only strip the outer wrapper; the inner content is then re-examined.
  let prev: string;
  do {
    prev = expr;
    const fnMatch = PROMQL_WRAPPER_FN_RE.exec(expr);
    if (!fnMatch) break;

    // Find the matching closing paren for the opening paren at fnMatch[0].length-1
    const openIdx = fnMatch[0].length - 1; // index of '('
    let depth = 1;
    let closeIdx = openIdx + 1;
    while (closeIdx < expr.length && depth > 0) {
      if (expr[closeIdx] === '(') depth++;
      else if (expr[closeIdx] === ')') depth--;
      closeIdx++;
    }
    // The argument list is everything between the outermost parens.
    // Strip numeric-literal leading arguments (e.g. `histogram_quantile(0.95, ...)`).
    const inner = expr.slice(openIdx + 1, closeIdx - 1).trim();
    const withoutNumericLeading = inner.replace(/^[\d.]+\s*,\s*/, '').trim();
    expr = withoutNumericLeading || inner;
  } while (expr !== prev);

  // Now expr should start with the bare metric name (possibly with label selectors).
  const match = expr.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s*(?:\{|\[|$)/);
  if (match) return match[1];

  // Fallback: plain metric name with no selectors
  const plain = expr.match(/^[a-zA-Z_:][a-zA-Z0-9_:]*/);
  return plain ? plain[0] : null;
}

/**
 * Inject `plugin_id="<pluginId>"` label into the first label selector in the query.
 * If no selector is present, appends one.
 */
function _injectPluginLabel(query: string, pluginId: string): string {
  const label = `plugin_id="${pluginId}"`;
  // If a selector already exists, inject inside it
  if (query.includes('{')) {
    return query
      .replace(/\{/, `{${label},`)
      .replace(/,\s*\}/, '}')
      .replace(/\{,/, '{');
  }
  // Append label selector after the metric name
  return query.replace(
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)/,
    (_match, metricName: string) => `${metricName}{${label}}`
  );
}

// ---------------------------------------------------------------------------
// T012-21: Response type for PromQL range queries
// ---------------------------------------------------------------------------

export interface PromQueryResult {
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      values: Array<[number, string]>;
    }>;
  };
}

// ---------------------------------------------------------------------------
// T012-22: Alert types and Prometheus alerts response
// ---------------------------------------------------------------------------

export type AlertSeverityFilter = 'critical' | 'warning' | 'info';

export interface Alert {
  alertName: string;
  severity: AlertSeverityFilter;
  pluginId: string | null;
  description: string;
  state: string;
  activeAt: string | null;
  value: string | null;
}

export interface AlertHistoryItem {
  alertName: string;
  severity: AlertSeverityFilter;
  pluginId: string | null;
  firedAt: string | null;
  resolvedAt: string | null;
  duration: string | null;
}

export interface PaginatedAlerts {
  data: AlertHistoryItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface PrometheusAlertsResponse {
  data?: {
    alerts?: Array<{
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      state?: string;
      activeAt?: string;
      value?: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// T012-23: Trace types and Tempo response helpers
// ---------------------------------------------------------------------------

export interface TraceResult {
  traceId: string;
  rootService: string;
  durationMs: number;
  spanCount: number;
  status: string;
  startTime: string | null;
}

export interface Span {
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  durationMs: number;
  statusCode: number | null;
  startTime: string | null;
  attributes: Record<string, string>;
  children: Span[];
}

export interface TraceDetail {
  traceId: string;
  rootService: string;
  durationMs: number;
  spans: Span[];
}

export interface PaginatedTraces {
  data: TraceResult[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface TempoSearchResponse {
  traces?: Array<{
    traceID?: string;
    rootServiceName?: string;
    rootTraceName?: string;
    startTimeUnixNano?: string | number;
    durationMs?: number;
    spanSet?: { spans?: unknown[] };
  }>;
}

interface TempoSpanRaw {
  spanID?: string;
  parentSpanID?: string;
  name?: string;
  serviceName?: string;
  durationNanos?: string | number;
  statusCode?: number;
  startTimeUnixNano?: string | number;
  attributes?: Array<{ key?: string; value?: { stringValue?: string } }>;
}

interface TempoTraceResponse {
  batches?: Array<{
    resource?: {
      attributes?: Array<{ key?: string; value?: { stringValue?: string } }>;
    };
    scopeSpans?: Array<{
      spans?: TempoSpanRaw[];
    }>;
  }>;
}

/** Flatten all spans from a Tempo OTLP trace response into a list of typed Span objects. */
function _extractSpans(body: TempoTraceResponse): Span[] {
  const spans: Span[] = [];
  for (const batch of body?.batches ?? []) {
    const resourceAttrs: Record<string, string> = {};
    for (const attr of batch?.resource?.attributes ?? []) {
      if (attr.key && attr.value?.stringValue !== undefined) {
        resourceAttrs[attr.key] = attr.value.stringValue;
      }
    }
    const serviceName = resourceAttrs['service.name'] ?? 'unknown';

    for (const scope of batch?.scopeSpans ?? []) {
      for (const s of scope?.spans ?? []) {
        const spanAttrs: Record<string, string> = {};
        for (const attr of s?.attributes ?? []) {
          if (attr.key && attr.value?.stringValue !== undefined) {
            spanAttrs[attr.key] = attr.value.stringValue;
          }
        }
        const durationNs = Number(s?.durationNanos ?? 0);
        const startNs = Number(s?.startTimeUnixNano ?? 0);
        spans.push({
          spanId: s?.spanID ?? '',
          parentSpanId: s?.parentSpanID ?? null,
          operationName: s?.name ?? '',
          serviceName,
          durationMs: Math.round(durationNs / 1_000_000),
          statusCode: s?.statusCode ?? null,
          startTime: startNs ? new Date(Math.floor(startNs / 1_000_000)).toISOString() : null,
          attributes: spanAttrs,
          children: [],
        });
      }
    }
  }
  return spans;
}

/** Build a nested span tree from a flat list of spans. Root spans have no parentSpanId. */
function _buildSpanTree(spans: Span[]): Span[] {
  const byId = new Map<string, Span>(spans.map((s) => [s.spanId, s]));
  const roots: Span[] = [];
  for (const span of spans) {
    if (!span.parentSpanId || !byId.has(span.parentSpanId)) {
      roots.push(span);
    } else {
      const parent = byId.get(span.parentSpanId);
      parent?.children.push(span);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// T012-24: Log types and Loki response
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  traceId: string | null;
  tenantId: string | null;
  service: string;
}

export interface PaginatedLogs {
  data: LogEntry[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface LokiQueryRangeResponse {
  data?: {
    result?: Array<{
      stream?: Record<string, string>;
      values?: Array<[string, string]>;
    }>;
  };
}

/**
 * Validate a LogQL filter expression.
 * Only pipe-stage filters are allowed (|= "text", |~ "regex", != "text", !~ "regex").
 * This prevents LogQL injection via arbitrary stream selectors or sub-queries.
 */
function _isValidLogQLFilter(filter: string): boolean {
  // Must start with a pipe-stage operator
  const trimmed = filter.trim();
  // Allow one or more pipe-filter stages, e.g.: |= "error" |~ "timeout"
  const pipeFilterPattern =
    /^(\|=\s*"[^"]*"|\|~\s*"[^"]*"|!=\s*"[^"]*"|!~\s*"[^"]*")(\s+(\|=\s*"[^"]*"|\|~\s*"[^"]*"|!=\s*"[^"]*"|!~\s*"[^"]*"))*$/;
  return pipeFilterPattern.test(trimmed);
}

/** Singleton instance. */
export const observabilityService = ObservabilityService.getInstance();
