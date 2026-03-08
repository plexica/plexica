/**
 * Observability Schemas
 *
 * Spec 012, Task T012-19.
 *
 * Zod schemas for the observability API request/response shapes
 * (query parameters, alert payloads, etc.).
 *
 * Constitution Article 5.3 §1: all external input validated with Zod.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** ISO 8601 datetime string with coarse validation. */
const IsoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be ISO 8601 datetime')
  .describe('ISO 8601 datetime string');

// ---------------------------------------------------------------------------
// Metrics query
// ---------------------------------------------------------------------------

/**
 * Query parameters for the metrics summary endpoint.
 * Accepts an optional time range; defaults to the last hour.
 */
export const MetricsQuerySchema = z.object({
  /** Start of the query window (ISO 8601). Defaults to 1 hour ago. */
  from: IsoDateString.optional(),
  /** End of the query window (ISO 8601). Defaults to now. */
  to: IsoDateString.optional(),
  /** Specific plugin ID to filter metrics. */
  pluginId: z.string().min(1).optional(),
  /** Prometheus metric name filter (prefix match). */
  metric: z.string().min(1).max(255).optional(),
});

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

// ---------------------------------------------------------------------------
// Alert rule
// ---------------------------------------------------------------------------

export const AlertSeveritySchema = z.enum(['critical', 'warning', 'info']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  expr: z.string().min(1),
  forDuration: z.string().regex(/^\d+[smh]$/, 'Duration must be e.g. "30s", "5m", "1h"'),
  severity: AlertSeveritySchema,
  summary: z.string().min(1).max(500),
  description: z.string().min(1).max(2000),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

// ---------------------------------------------------------------------------
// Plugin observability summary response
// ---------------------------------------------------------------------------

export const PluginObservabilitySummarySchema = z.object({
  pluginId: z.string(),
  pluginName: z.string(),
  /** Whether Prometheus currently has an active scrape target for this plugin. */
  scraped: z.boolean(),
  /** Total request count in the query window (null if not scraped). */
  requestCount: z.number().int().nullable(),
  /** P95 latency in seconds in the query window (null if not scraped). */
  p95LatencySeconds: z.number().nullable(),
  /** HTTP 5xx error rate [0, 1] in the query window (null if not scraped). */
  errorRate: z.number().min(0).max(1).nullable(),
  /** Timestamp of the last successful scrape (ISO 8601, null if never scraped). */
  lastScrapedAt: z.string().nullable(),
});

export type PluginObservabilitySummary = z.infer<typeof PluginObservabilitySummarySchema>;
