// config-features.ts
// Zod shape for the cross-cutting feature config group (spec 006: notifications,
// observability/metrics, OTel stub, Keycloak account URL). Kept in its own file
// so lib/config.ts stays under the 200-line constitution limit (Rule 4).
// Spread into configSchema via `...featuresConfigShape.shape`.

import { z } from 'zod';

export const featuresConfigShape = z.object({
  // Notifications (ADR-035, features 006-01…006-05)
  // SSE heartbeat keepalive interval.
  NOTIFICATION_SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(20_000),
  // Per-user open SSE connection cap (oldest evicted).
  NOTIFICATION_SSE_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().min(1).default(5),
  // Per-connection bounded queue for frames published while the SSE socket
  // buffer is backed up: queued (not dropped) and flushed on `drain`. A reader
  // stalled past the bound is evicted rather than buffering unbounded memory.
  NOTIFICATION_SSE_PENDING_QUEUE_BOUND: z.coerce.number().int().min(1).default(32),
  // Defense-in-depth consumer cap: max notification events per user per minute.
  NOTIFICATION_CONSUMER_CAP_PER_MIN: z.coerce.number().int().min(1).default(100),
  // Emission cap: max notifications per plugin per user per minute (Redis counter).
  NOTIFICATION_EMIT_RATE_LIMIT_PER_PLUGIN_USER_PER_MIN: z.coerce.number().int().min(1).default(10),
  // Email queue retry worker (006-03): max attempts (4 = 1 send + 3 retries
  // at 1s/4s/16s backoff, ADR-035) and base backoff.
  NOTIFICATION_EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  NOTIFICATION_EMAIL_BACKOFF_MS: z.coerce.number().int().min(100).default(1_000),
  NOTIFICATION_EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),

  // Prometheus / metrics (ADR-036, features 006-17…006-20).
  // Path served by the /metrics route (root instance, public opt-in).
  PROMETHEUS_METRICS_PATH: z.string().default('/metrics'),
  // Gauge refresh interval (30s) — scrape only serializes the registry (NFR < 100ms).
  PROMETHEUS_GAUGE_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  // Optional bearer token guarding /metrics when set; open by default (ADR-036).
  METRICS_TOKEN: z.string().min(1).optional(),

  // OpenTelemetry tracing stub (feature 006-19, deferred to Sprint 7).
  // Disabled by default; no @opentelemetry/* dependencies land this sprint.
  // Deliberate stricter boolean idiom: `z.enum(['true','false'])` + transform
  // rejects any non-boolean literal (vs config.ts TRUST_PROXY's z.preprocess),
  // so a typo like OTEL_TRACING_ENABLED=1 fails fast instead of coercing.
  OTEL_TRACING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // Per-realm Keycloak account console URL (feature 006-14).
  // {realm} is substituted with the tenant realm at runtime.
  KEYCLOAK_ACCOUNT_URL_PATTERN: z.string().default('http://localhost:8080/realms/{realm}/account/'),
});
