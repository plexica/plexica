/**
 * MetricsService — Core API Prometheus metrics
 *
 * Spec 012, Task T012-07 (ADR-027).
 *
 * Exposes a dedicated prom-client Registry with HTTP request counters and
 * duration histograms for the core-api. The registry is merged with the
 * event-bus registry at GET /metrics so Prometheus scrapes a single endpoint.
 *
 * Constitution Article 4.3: histogram buckets aligned with P95 < 200ms SLA.
 * Constitution Article 9.2: error rate alerting threshold 1% (see prometheus rules).
 */

import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class MetricsService {
  private static instance: MetricsService;

  readonly registry: Registry;

  /** Total HTTP requests handled by core-api, labelled by method/route/status. */
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;

  /**
   * HTTP request duration histogram.
   * Buckets aligned with Constitution Art. 4.3 P95 < 200ms SLA.
   */
  readonly httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status'>;

  private constructor() {
    this.registry = new Registry();

    // Collect default Node.js / process metrics into this registry.
    collectDefaultMetrics({ register: this.registry, prefix: 'plexica_' });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests handled by core-api',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds (core-api)',
      labelNames: ['method', 'route', 'status'],
      // Buckets cover fast API responses up through the Constitution 200ms SLA
      // and wider monitoring bands (500ms, 1s, 2s, 5s) for outlier detection.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /** Serialise all metrics in Prometheus text exposition format v0.0.4. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header for the Prometheus scrape endpoint. */
  get contentType(): string {
    return this.registry.contentType;
  }
}

/** Singleton instance — import this directly instead of using getInstance(). */
export const metricsService = MetricsService.getInstance();
