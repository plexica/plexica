# Spec: 012 - Plugin Observability

> Epic specification for comprehensive plugin observability: metrics collection,
> distributed tracing, log aggregation, alerting, and admin dashboards for the
> Plexica multi-tenant SaaS platform.
>
> Created by the `forge-pm` agent via `/forge-specify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Draft      |
| Author  | forge-pm   |
| Date    | 2026-03-07 |
| Track   | Epic       |
| Spec ID | 012        |

---

## 1. Overview

Spec 012 delivers a full-stack observability layer for the Plexica plugin
system. Today, plugin containers expose `/health` and `/ready` endpoints
(Spec 004), but there is **zero** metrics collection, distributed tracing,
log aggregation, or alerting infrastructure. The platform cannot answer
fundamental operational questions: _Which plugins are slow? Which are
error-prone? How do requests propagate across plugin boundaries? What
happened when a plugin crashed at 3 AM?_

This epic adds:

1. **Prometheus metrics scraping** from plugin containers and the core
   platform, plus the deferred `GET /api/v1/plugins/:id/metrics` proxy
   endpoint (TD-009).
2. **Distributed tracing** via OpenTelemetry SDK instrumentation and a
   Jaeger/Tempo backend for cross-service request correlation.
3. **Structured log aggregation** from plugin containers via Loki,
   centralising Pino JSON logs from all services.
4. **Alert rules** for plugin health, error rates, latency thresholds,
   and resource exhaustion.
5. **Super Admin observability dashboards** in the React frontend —
   plugin health overview, metrics time-series, trace exploration, and
   alert management.
6. **Infrastructure additions** — Prometheus, Grafana, Tempo, and Loki
   added to `docker-compose.yml` for local development.

## 2. Problem Statement

### Why now?

Plexica's plugin system is fully implemented (Spec 004, 37 tasks complete)
with lifecycle management, container isolation, and service discovery. But
operators are flying blind:

- **TD-009** (`GET /api/v1/plugins/:id/metrics`) has been deferred since
  Sprint 4. It is the last unresolved FR from Spec 004 (FR-009).
- **Architecture §7.2** declares "Prometheus endpoint at `/metrics`" and
  "OpenTelemetry with Jaeger exporter" as required, but neither exists.
  Zero Prometheus, Grafana, Jaeger, or OpenTelemetry files exist in the
  repository.
- **Constitution Art. 9.2** mandates: health checks (done), centralized
  metrics (not done), error rate alerting (not done), latency alerting
  (not done), and isolation monitoring (not done).

### Who is affected?

- **Super Admins** cannot identify poorly-performing plugins until users
  complain.
- **Plugin developers** cannot diagnose cross-service request failures
  without access to distributed traces.
- **Operations teams** lack proactive alerting for plugin degradation.
- **Tenant Admins** have no visibility into plugin reliability within
  their tenant context.

### Business impact of inaction

Without observability:

- MTTR (Mean Time To Resolution) for plugin issues is unbounded — no
  structured way to diagnose.
- SLA compliance (Art. 4.3: P95 < 200ms) cannot be measured or enforced.
- Production deployment of plugins is operationally risky — no early
  warning system.

## 3. User Stories

### US-001: Metrics Proxy Endpoint (TD-009)

**As a** Super Admin,
**I want** to retrieve Prometheus metrics from a specific plugin container
via the core API,
**so that** I can inspect per-plugin performance data without direct
container network access.

**Acceptance Criteria:**

- Given an ACTIVE plugin exposing `/metrics` in Prometheus exposition
  format, when I call `GET /api/v1/plugins/:id/metrics`, then the core
  API proxies the request to the plugin container and returns the raw
  Prometheus text.
- Given an ACTIVE plugin whose container is unreachable, when I call
  `GET /api/v1/plugins/:id/metrics`, then I receive HTTP 503 with error
  code `PLUGIN_UNREACHABLE` and a message indicating the container did
  not respond within the timeout.
- Given a plugin whose `lifecycleStatus` is not `ACTIVE`, when I call
  `GET /api/v1/plugins/:id/metrics`, then I receive HTTP 503 with error
  code `PLUGIN_NOT_ACTIVE`.
- Given a non-existent plugin ID, when I call
  `GET /api/v1/plugins/:id/metrics`, then I receive HTTP 404 with error
  code `PLUGIN_NOT_FOUND`.
- Given a request without `super_admin` credentials, when I call
  `GET /api/v1/plugins/:id/metrics`, then I receive HTTP 401 or 403.
- Given the metrics proxy response, when I inspect the HTTP headers, then
  `Content-Type` is `text/plain; version=0.0.4; charset=utf-8` (standard
  Prometheus exposition format).

### US-002: Prometheus Scraping Infrastructure

**As a** platform operator,
**I want** Prometheus to automatically discover and scrape metrics from all
ACTIVE plugin containers and the core API,
**so that** I have a centralised time-series store of all platform metrics.

**Acceptance Criteria:**

- Given a running Prometheus instance (via docker-compose), when a new
  plugin transitions to `ACTIVE`, then Prometheus discovers and begins
  scraping its `/metrics` endpoint within one scrape interval.
- Given the core API is running, when Prometheus scrapes
  `core-api:3001/metrics`, then it receives standard Node.js and Fastify
  metrics (request count, request duration histogram, active connections,
  event loop lag, heap usage).
- Given Prometheus is scraping, when I query
  `http_request_duration_seconds_bucket{plugin="crm"}`, then I receive
  time-series data for that plugin.
- Given a plugin transitions from `ACTIVE` to `DISABLED`, when the next
  scrape cycle runs, then Prometheus marks the target as `down` and
  emits an `up == 0` metric.
- Given `docker-compose up` is run from a clean state, when all services
  start, then Prometheus is available at `localhost:9090` with all
  configured scrape targets healthy.

### US-003: Distributed Tracing with OpenTelemetry

**As a** platform operator,
**I want** all HTTP requests that cross service boundaries (core → plugin,
plugin → plugin) to carry W3C `traceparent` headers and be recorded as
distributed traces,
**so that** I can visualise end-to-end request flow and identify latency
bottlenecks.

**Acceptance Criteria:**

- Given the core API is instrumented with the OpenTelemetry SDK, when an
  incoming request arrives, then a trace context is created (or
  propagated from an existing `traceparent` header) and a root span is
  emitted.
- Given the core API proxies a request to a plugin container, when the
  proxy call is made, then the `traceparent` and `tracestate` headers
  are forwarded to the plugin.
- Given a trace is recorded, when I open the trace in the Tempo/Jaeger
  UI (via Grafana), then I see the full span tree: `HTTP ingress →
core API handler → plugin proxy → plugin handler → response`.
- Given the Plugin SDK base class, when a plugin built with the SDK
  handles a request, then it automatically creates a child span linked
  to the incoming `traceparent`.
- Given the OpenTelemetry exporter is configured, when traces are
  emitted, then they are delivered to Tempo via OTLP/gRPC within 5
  seconds.
- Given a `traceparent` header is missing on an internal service call,
  when the core API makes the call, then a new trace is initiated
  (never propagate null context).

### US-004: Log Aggregation for Plugins

**As a** platform operator,
**I want** structured JSON logs from all plugin containers to be forwarded
to a centralised log store (Loki),
**so that** I can search, filter, and correlate logs across all services.

**Acceptance Criteria:**

- Given a plugin container emitting Pino JSON logs to stdout, when the
  Docker logging driver forwards the logs, then they appear in Loki
  with labels `{service="plugin-crm", tenant_id="acme-corp"}`.
- Given a log entry in Loki, when I query
  `{service="plugin-crm"} |= "error"`, then matching log lines are
  returned within 5 seconds.
- Given the Super Admin observability dashboard, when I click "View Logs"
  for a specific plugin, then I see the plugin's recent log entries
  filtered by the selected time range.
- Given a trace ID, when I search logs by `traceId`, then all log lines
  from all services participating in that trace are returned (log-trace
  correlation).
- Given a plugin container restarts, when it begins emitting logs again,
  then Loki ingests the new logs without manual intervention.
- Given Loki is configured in docker-compose, when all services start,
  then Loki is available at `localhost:3100` and Grafana can query it as
  a data source.

### US-005: Alerting Rules for Plugin Health

**As a** platform operator,
**I want** Prometheus alert rules that fire when plugins degrade — high
error rates, excessive latency, health check failures, or resource
exhaustion,
**so that** I am proactively notified before users are impacted.

**Acceptance Criteria:**

- Given the alert rule `PluginHighErrorRate`, when a plugin's HTTP 5xx
  rate exceeds 5% of total requests over a 5-minute window, then the
  alert fires with severity `warning`.
- Given the alert rule `PluginHighLatency`, when a plugin's P95 request
  duration exceeds 500ms over a 5-minute window, then the alert fires
  with severity `warning`.
- Given the alert rule `PluginHealthCheckFailing`, when a plugin's
  `/health` endpoint returns non-200 for 3 consecutive scrapes (>45
  seconds at 15s interval), then the alert fires with severity
  `critical`.
- Given the alert rule `PluginDown`, when Prometheus target `up == 0`
  for a plugin for >1 minute, then the alert fires with severity
  `critical`.
- Given the alert rule `PluginHighMemory`, when a plugin container's
  resident memory exceeds 80% of its configured limit for 5 minutes,
  then the alert fires with severity `warning`.
- Given an alert fires, when the Super Admin views the observability
  dashboard, then the alert is visible in the "Active Alerts" panel
  with severity, plugin name, description, and time of first firing.
- Given the core API alert rule `CoreHighErrorRate`, when the core API
  HTTP 5xx rate exceeds 1% over a 5-minute window (per Constitution
  Art. 9.2), then the alert fires with severity `critical`.

### US-006: Super Admin Observability Dashboard

**As a** Super Admin,
**I want** a dedicated observability section in the admin panel with
real-time plugin health, metrics charts, trace exploration, and alert
management,
**so that** I can monitor and troubleshoot the plugin ecosystem from a
single interface.

**Acceptance Criteria:**

- Given the Super Admin panel, when I navigate to "Observability", then
  I see a dashboard with four tabs: **Health**, **Metrics**, **Traces**,
  **Alerts**.
- Given the Health tab, when I view it, then I see a table of all ACTIVE
  plugins with columns: name, status (healthy/degraded/down), P95
  latency (last 5 min), error rate (last 5 min), uptime percentage
  (last 24h), and last health check timestamp.
- Given the Health tab, when a plugin's health status changes (e.g.
  healthy → degraded), then the row updates within 30 seconds via
  polling.
- Given the Metrics tab, when I select a plugin, then I see time-series
  charts for: request rate (req/s), error rate (%), P50/P95/P99 latency,
  memory usage, and CPU usage. Time range is selectable (1h, 6h, 24h,
  7d).
- Given the Traces tab, when I search by plugin name, trace ID, or time
  range, then I see a list of traces with: trace ID, root service,
  duration, span count, and status (ok/error). Clicking a trace shows
  the full span waterfall.
- Given the Alerts tab, when I view it, then I see two sections: "Active
  Alerts" (currently firing) and "Alert History" (resolved alerts from
  the last 7 days). Each alert shows: rule name, severity, plugin,
  description, first fired, and resolved time (if applicable).
- Given any dashboard page, when the page loads, then it renders within
  2 seconds (Constitution Art. 1.3) on a 3G connection.

### US-007: Core Platform Metrics Endpoint

**As a** platform operator,
**I want** the core API to expose a `/metrics` endpoint in Prometheus
exposition format,
**so that** Prometheus can scrape platform-level metrics alongside plugin
metrics.

**Acceptance Criteria:**

- Given the core API is running, when I call `GET /metrics` (or
  `GET /api/metrics`), then I receive metrics in Prometheus text
  exposition format.
- Given the metrics endpoint, when I inspect the output, then it includes
  at minimum: `http_requests_total` (counter, by method/path/status),
  `http_request_duration_seconds` (histogram, by method/path),
  `nodejs_heap_size_total_bytes`, `nodejs_eventloop_lag_seconds`,
  `process_cpu_seconds_total`, and `active_plugins_total`.
- Given a request with `super_admin` credentials, when I call
  `GET /metrics`, then I receive HTTP 200 with the metrics payload.
- Given a request without authentication, when I call `GET /metrics`,
  then I receive HTTP 401.

### US-008: Grafana Pre-configured Dashboards

**As a** platform operator,
**I want** Grafana to be available in the development docker-compose setup
with pre-configured data sources (Prometheus, Tempo, Loki) and dashboard
provisioning,
**so that** I can immediately explore metrics, traces, and logs without
manual configuration.

**Acceptance Criteria:**

- Given `docker-compose up` is run, when Grafana starts, then it is
  available at `localhost:3000` with default credentials `admin/admin`.
- Given Grafana is running, when I navigate to Data Sources, then
  Prometheus (`http://prometheus:9090`), Tempo (`http://tempo:3200`),
  and Loki (`http://loki:3100`) are pre-configured and verified.
- Given the Grafana instance, when I navigate to Dashboards, then I see
  at least two provisioned dashboards: "Plugin Overview" (health matrix,
  top-N error plugins, latency distribution) and "Core Platform"
  (request rate, error rate, latency, resource usage).
- Given the "Plugin Overview" dashboard, when I view it, then each panel
  uses a PromQL query referencing the `plugin` label to filter per-plugin
  data.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                    | Priority | Story Ref      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- |
| FR-001 | `GET /api/v1/plugins/:id/metrics` proxies to the plugin container's `/metrics` endpoint with `Content-Type: text/plain; version=0.0.4` and 5-second timeout                                                                                                                    | Must     | US-001         |
| FR-002 | Metrics proxy requires `super_admin` auth; returns 401/403 for insufficient credentials                                                                                                                                                                                        | Must     | US-001         |
| FR-003 | Metrics proxy returns 503 `PLUGIN_NOT_ACTIVE` if plugin lifecycle status ≠ ACTIVE                                                                                                                                                                                              | Must     | US-001         |
| FR-004 | Metrics proxy returns 503 `PLUGIN_UNREACHABLE` if container does not respond within timeout                                                                                                                                                                                    | Must     | US-001         |
| FR-005 | Metrics proxy returns 404 `PLUGIN_NOT_FOUND` for non-existent plugin IDs                                                                                                                                                                                                       | Must     | US-001         |
| FR-006 | Core API exposes `/metrics` endpoint in Prometheus text exposition format behind `super_admin` auth                                                                                                                                                                            | Must     | US-007         |
| FR-007 | Core API `/metrics` includes: `http_requests_total`, `http_request_duration_seconds`, `nodejs_heap_size_total_bytes`, `nodejs_eventloop_lag_seconds`, `process_cpu_seconds_total`, `active_plugins_total`                                                                      | Must     | US-007         |
| FR-008 | Prometheus service added to `docker-compose.yml` with static scrape config for core API and file-based service discovery for plugins                                                                                                                                           | Must     | US-002         |
| FR-009 | Prometheus discovers plugin scrape targets via a JSON/YAML file written by the core API when plugin lifecycle status changes                                                                                                                                                   | Must     | US-002         |
| FR-010 | Core API writes/updates Prometheus file-based service discovery targets file (`/etc/prometheus/targets/plugins.json`) on every plugin ACTIVE/DISABLED transition                                                                                                               | Must     | US-002         |
| FR-011 | OpenTelemetry SDK (`@opentelemetry/sdk-node`) instruments the core API: automatic HTTP span creation, context propagation, and OTLP export                                                                                                                                     | Must     | US-003         |
| FR-012 | W3C `traceparent` and `tracestate` headers propagated on all outbound HTTP calls from core API to plugin containers (health, ready, metrics, hook invocations)                                                                                                                 | Must     | US-003         |
| FR-013 | Existing `X-Trace-ID` header generation (in `plugin-hook.service.ts`) replaced with `traceparent`-derived trace ID for consistency                                                                                                                                             | Must     | US-003         |
| FR-014 | Plugin SDK base class auto-creates child spans from incoming `traceparent` headers                                                                                                                                                                                             | Should   | US-003         |
| FR-015 | Tempo service added to `docker-compose.yml` as the trace backend, receiving OTLP/gRPC on port 4317                                                                                                                                                                             | Must     | US-003         |
| FR-016 | Loki service added to `docker-compose.yml` for log aggregation                                                                                                                                                                                                                 | Must     | US-004         |
| FR-017 | Plugin containers configured to send Docker JSON logs to Loki via the Loki Docker logging driver or Promtail sidecar                                                                                                                                                           | Must     | US-004         |
| FR-018 | Logs indexed in Loki with labels: `service` (plugin ID or `core-api`), `level`, and `tenant_id` (extracted from Pino JSON `tenantId` field)                                                                                                                                    | Must     | US-004         |
| FR-019 | Log entries include the `traceId` field from OpenTelemetry context for log-trace correlation                                                                                                                                                                                   | Should   | US-004         |
| FR-020 | Prometheus alert rules defined in `prometheus/rules/plugin-alerts.yml` for: `PluginHighErrorRate` (5xx > 5%, 5m), `PluginHighLatency` (P95 > 500ms, 5m), `PluginHealthCheckFailing` (3 consecutive failures), `PluginDown` (up == 0, 1m), `PluginHighMemory` (> 80% limit, 5m) | Must     | US-005         |
| FR-021 | Prometheus alert rule `CoreHighErrorRate` fires when core API 5xx rate > 1% over 5 minutes (Constitution Art. 9.2)                                                                                                                                                             | Must     | US-005         |
| FR-022 | `GET /api/v1/observability/alerts` returns currently-firing Prometheus alerts by querying the Prometheus `/api/v1/alerts` endpoint                                                                                                                                             | Must     | US-005, US-006 |
| FR-023 | `GET /api/v1/observability/alerts/history` returns resolved alerts from the last 7 days, paginated (max 100 per page)                                                                                                                                                          | Should   | US-005, US-006 |
| FR-024 | Super Admin dashboard: "Observability" section with four tabs — Health, Metrics, Traces, Alerts                                                                                                                                                                                | Must     | US-006         |
| FR-025 | Health tab: table of all ACTIVE plugins with name, status, P95 latency, error rate, uptime (24h), last health check timestamp; auto-refreshes every 30 seconds                                                                                                                 | Must     | US-006         |
| FR-026 | `GET /api/v1/observability/plugins/health-summary` returns aggregated health data for all ACTIVE plugins (status, latency, error rate, uptime)                                                                                                                                 | Must     | US-006         |
| FR-027 | Metrics tab: time-series charts (request rate, error rate, P50/P95/P99 latency, memory, CPU) per plugin via Prometheus range query proxy                                                                                                                                       | Must     | US-006         |
| FR-028 | `GET /api/v1/observability/plugins/:id/query` proxies PromQL range queries to Prometheus for a specific plugin, scoped by `plugin` label                                                                                                                                       | Must     | US-006         |
| FR-029 | Traces tab: search by plugin name, trace ID, or time range; list view with trace ID, root service, duration, span count, status; click-through to span waterfall                                                                                                               | Must     | US-006         |
| FR-030 | `GET /api/v1/observability/traces` proxies trace search to Tempo HTTP API (`/api/search`), returning simplified trace metadata                                                                                                                                                 | Must     | US-006         |
| FR-031 | `GET /api/v1/observability/traces/:traceId` proxies full trace retrieval from Tempo (`/api/traces/:traceId`)                                                                                                                                                                   | Must     | US-006         |
| FR-032 | Alerts tab: "Active Alerts" section (currently firing) and "Alert History" section (resolved, last 7 days) with severity, plugin, description, timestamps                                                                                                                      | Must     | US-006         |
| FR-033 | Grafana added to `docker-compose.yml` with provisioned data sources (Prometheus, Tempo, Loki) and provisioned dashboards ("Plugin Overview", "Core Platform")                                                                                                                  | Must     | US-008         |
| FR-034 | Grafana dashboard "Plugin Overview": health matrix, top-N error plugins, latency distribution; all panels use `plugin` label for filtering                                                                                                                                     | Must     | US-008         |
| FR-035 | Grafana dashboard "Core Platform": request rate, error rate, P50/P95/P99 latency, heap usage, event loop lag, active connections                                                                                                                                               | Must     | US-008         |
| FR-036 | All observability API endpoints (`/api/v1/observability/*`) require `super_admin` auth                                                                                                                                                                                         | Must     | US-006         |
| FR-037 | All observability API responses follow Constitution Art. 6.2 error format: `{ error: { code, message, details? } }`                                                                                                                                                            | Must     | All            |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                                              | Target                                                                                                        |
| ------- | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Performance | Metrics proxy endpoint P95 latency                                       | < 200ms (Art. 4.3); proxy timeout at 5s is the ceiling, not the norm                                          |
| NFR-002 | Performance | Core `/metrics` endpoint P95 latency                                     | < 100ms (metrics are computed in-process)                                                                     |
| NFR-003 | Performance | Observability API endpoints (`/observability/*`) P95 latency             | < 500ms (these proxy to Prometheus/Tempo which have their own SLAs)                                           |
| NFR-004 | Performance | Prometheus scrape interval for plugins                                   | 15 seconds (configurable, default 15s)                                                                        |
| NFR-005 | Performance | Prometheus scrape interval for core API                                  | 15 seconds                                                                                                    |
| NFR-006 | Performance | Trace export batch interval                                              | ≤ 5 seconds from span creation to Tempo ingestion                                                             |
| NFR-007 | Performance | Log ingestion latency (container stdout → Loki queryable)                | < 10 seconds                                                                                                  |
| NFR-008 | Sampling    | OpenTelemetry trace sample rate (development)                            | 100% (all traces sampled)                                                                                     |
| NFR-009 | Sampling    | OpenTelemetry trace sample rate (production) [NEEDS CLARIFICATION]       | 10% default; configurable via `OTEL_TRACE_SAMPLE_RATE` env var                                                |
| NFR-010 | Retention   | Prometheus metrics retention (local dev)                                 | 15 days                                                                                                       |
| NFR-011 | Retention   | Tempo trace retention (local dev)                                        | 7 days                                                                                                        |
| NFR-012 | Retention   | Loki log retention (local dev)                                           | 7 days                                                                                                        |
| NFR-013 | Reliability | Observability stack failure must not crash core API or plugin containers | Fail-open: if Prometheus/Tempo/Loki are down, the platform keeps running; traces/metrics are dropped silently |
| NFR-014 | Reliability | OpenTelemetry exporter failure handling                                  | Exporter uses `BatchSpanProcessor` with drop-on-queue-full policy                                             |
| NFR-015 | Security    | All observability endpoints require `super_admin` auth                   | Per Art. 5.1: no public observability data                                                                    |
| NFR-016 | Security    | No PII in metrics labels or trace attributes                             | Per Art. 5.2 / Art. 6.3: tenant IDs allowed, user emails forbidden                                            |
| NFR-017 | Security    | Grafana accessible only on `localhost:3000` (dev mode)                   | Not exposed in production; production uses Plexica dashboards                                                 |
| NFR-018 | UX          | Dashboard page load time                                                 | < 2 seconds on 3G (Art. 1.3)                                                                                  |
| NFR-019 | UX          | Dashboard WCAG 2.1 AA compliance                                         | All charts have text alternatives; colour is not sole differentiator                                          |
| NFR-020 | Resources   | Prometheus memory usage (local dev, 20 plugins)                          | < 512 MB                                                                                                      |
| NFR-021 | Resources   | Tempo memory usage (local dev)                                           | < 256 MB                                                                                                      |
| NFR-022 | Resources   | Loki memory usage (local dev)                                            | < 256 MB                                                                                                      |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                           | Expected Behavior                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin container does not expose `/metrics` endpoint               | Metrics proxy returns 503 `PLUGIN_METRICS_UNAVAILABLE` with message "Plugin does not expose a metrics endpoint". Prometheus target shows `up=0` with `scrape_error="404"`.                                                 |
| 2   | Plugin container returns malformed Prometheus text                 | Metrics proxy passes through raw response; Prometheus logs a scrape error and sets `up=0` for that target. Alert `PluginDown` may fire after 1 minute.                                                                     |
| 3   | Prometheus is down or unreachable                                  | Observability API endpoints (`/observability/alerts`, `/observability/plugins/:id/query`) return 502 `OBSERVABILITY_BACKEND_UNAVAILABLE`. Core API and plugins are unaffected (fail-open per NFR-013).                     |
| 4   | Tempo is down or unreachable                                       | Trace search/retrieval endpoints return 502 `OBSERVABILITY_BACKEND_UNAVAILABLE`. OpenTelemetry exporter drops spans silently (NFR-014). No impact on request processing.                                                   |
| 5   | Loki is down or unreachable                                        | Log viewing returns 502 `OBSERVABILITY_BACKEND_UNAVAILABLE`. Plugin containers continue running; Docker buffers logs per its logging driver policy.                                                                        |
| 6   | More than 50 ACTIVE plugins generating metrics simultaneously      | Prometheus scrape cycle may extend beyond 15s interval. Alert rule `PrometheusScrapeSlowTarget` fires. Mitigation: increase `scrape_timeout` or stagger scrapes with `scrape_interval` offsets.                            |
| 7   | Plugin emits extremely high cardinality metrics (>10k time series) | Prometheus memory grows. Mitigation: per-plugin `sample_limit` in Prometheus scrape config (default 5000 samples). Excess samples are dropped; `prometheus_target_scrapes_exceeded_sample_limit_total` counter increments. |
| 8   | Trace ID propagation fails due to upstream proxy stripping headers | Core API creates new root trace. The span tree is broken (orphan spans in the plugin). Detectable via Tempo "rootless span" queries. No data loss, only correlation loss.                                                  |
| 9   | Core API `/metrics` endpoint response exceeds 1 MB                 | Prometheus scrape succeeds (default body limit is 50 MB) but may slow scrape cycle. Mitigation: review metric cardinality; consider metric relabeling or dropping unused metrics.                                          |
| 10  | Docker logging driver drops logs under high volume                 | Loki has gaps in log coverage. Mitigation: configure Docker `max-buffer-size` and `mode=non-blocking` for plugin containers. Accepted trade-off: completeness vs. container performance.                                   |
| 11  | Alert fires during a plugin rolling update                         | `PluginDown` alert fires as old container is removed before new one is healthy. Mitigation: `for: 1m` pending period on `PluginDown` rule allows rolling updates to complete.                                              |
| 12  | Prometheus file-based service discovery file is corrupted          | Prometheus logs an error and retains the last valid target set. Plugin metrics are scraped from stale targets until the core API rewrites the file on next lifecycle transition.                                           |
| 13  | Super Admin loads Traces tab with no trace data                    | Dashboard shows an empty state: "No traces found for the selected time range. Ensure plugins are actively processing requests."                                                                                            |
| 14  | PromQL query injection via `/observability/plugins/:id/query`      | Query parameter is validated against an allowlist of metric names and label matchers. Arbitrary PromQL is rejected with 400 `INVALID_QUERY`.                                                                               |

## 7. Data Requirements

### 7.1 No New Database Tables

This spec does **not** add new PostgreSQL tables. All observability data is
stored in purpose-built backends:

| Data Type | Storage Backend | Rationale                                           |
| --------- | --------------- | --------------------------------------------------- |
| Metrics   | Prometheus      | Time-series optimised; industry standard for scrape |
| Traces    | Tempo           | Designed for distributed trace storage and querying |
| Logs      | Loki            | Log aggregation with label-based indexing           |
| Alerts    | Prometheus AM   | Alertmanager handles dedup, grouping, routing       |

### 7.2 Prometheus Service Discovery File

The core API writes a file-based service discovery target file that
Prometheus watches:

**File path**: `/etc/prometheus/targets/plugins.json` (volume-mounted)

**Format** (Prometheus `file_sd_configs`):

```json
[
  {
    "targets": ["plugin-crm:8080"],
    "labels": {
      "plugin": "crm",
      "plugin_version": "1.2.0",
      "__metrics_path__": "/metrics"
    }
  },
  {
    "targets": ["plugin-billing:8080"],
    "labels": {
      "plugin": "billing",
      "plugin_version": "2.0.1",
      "__metrics_path__": "/metrics"
    }
  }
]
```

**Update trigger**: Core API rewrites this file on every
`PluginLifecycleStatus` transition involving `ACTIVE` or `DISABLED`.

### 7.3 Required Metric Labels

All plugin metrics scraped by Prometheus must include these labels
(injected via relabeling or target labels):

| Label            | Source                       | Example           |
| ---------------- | ---------------------------- | ----------------- |
| `plugin`         | Plugin ID from registry      | `crm`             |
| `plugin_version` | Plugin version from registry | `1.2.0`           |
| `instance`       | Container hostname:port      | `plugin-crm:8080` |
| `job`            | Prometheus job name          | `plugin-metrics`  |

### 7.4 Required Trace Attributes

All spans emitted by the core API must include:

| Attribute          | Type   | Source                          | Example                       |
| ------------------ | ------ | ------------------------------- | ----------------------------- |
| `service.name`     | string | Static config                   | `core-api`                    |
| `service.version`  | string | `package.json` version          | `0.9.0`                       |
| `tenant.id`        | string | Request context (`X-Tenant-ID`) | `acme-corp`                   |
| `plugin.id`        | string | Target plugin on proxy calls    | `crm`                         |
| `http.method`      | string | OTel HTTP instrumentation       | `GET`                         |
| `http.route`       | string | OTel HTTP instrumentation       | `/api/v1/plugins/:id/metrics` |
| `http.status_code` | int    | OTel HTTP instrumentation       | `200`                         |

**Security constraint (Art. 5.2)**: No `user.email`, `user.name`, or
other PII in trace attributes. `user.id` (UUID) is permitted.

## 8. API Requirements

### 8.1 Plugin Metrics Proxy (TD-009)

| Method | Path                          | Description                               | Auth                 | Response Content-Type                      |
| ------ | ----------------------------- | ----------------------------------------- | -------------------- | ------------------------------------------ |
| GET    | `/api/v1/plugins/:id/metrics` | Proxy plugin container Prometheus metrics | Bearer + super_admin | `text/plain; version=0.0.4; charset=utf-8` |

**Path parameters**: `id` — plugin ID (string, required)

**Response codes**:

| Code | Condition             | Error Code                   |
| ---- | --------------------- | ---------------------------- |
| 200  | Success               | —                            |
| 401  | Missing/invalid token | `AUTH_MISSING_TOKEN`         |
| 403  | Not super_admin       | `AUTH_FORBIDDEN`             |
| 404  | Plugin not found      | `PLUGIN_NOT_FOUND`           |
| 503  | Plugin not active     | `PLUGIN_NOT_ACTIVE`          |
| 503  | Container unreachable | `PLUGIN_UNREACHABLE`         |
| 503  | No metrics endpoint   | `PLUGIN_METRICS_UNAVAILABLE` |

### 8.2 Core Platform Metrics

| Method | Path       | Description                 | Auth                 | Response Content-Type                      |
| ------ | ---------- | --------------------------- | -------------------- | ------------------------------------------ |
| GET    | `/metrics` | Core API Prometheus metrics | Bearer + super_admin | `text/plain; version=0.0.4; charset=utf-8` |

### 8.3 Observability API

All endpoints are prefixed with `/api/v1/observability` and require
`super_admin` auth.

| Method | Path                                           | Description                                   | Query Parameters                                                                                                   |
| ------ | ---------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/observability/plugins/health-summary` | Aggregated health data for all ACTIVE plugins | —                                                                                                                  |
| GET    | `/api/v1/observability/plugins/:id/query`      | Proxy PromQL range query scoped to a plugin   | `query` (PromQL), `start` (RFC3339), `end` (RFC3339), `step` (duration, e.g. `15s`)                                |
| GET    | `/api/v1/observability/alerts`                 | Currently firing Prometheus alerts            | `severity` (optional filter: `critical`, `warning`)                                                                |
| GET    | `/api/v1/observability/alerts/history`         | Resolved alerts (last 7 days), paginated      | `page` (int, default 1), `per_page` (int, default 20, max 100)                                                     |
| GET    | `/api/v1/observability/traces`                 | Search traces via Tempo                       | `service` (optional), `traceId` (optional), `start` (RFC3339), `end` (RFC3339), `limit` (int, default 20, max 100) |
| GET    | `/api/v1/observability/traces/:traceId`        | Full trace retrieval from Tempo               | —                                                                                                                  |
| GET    | `/api/v1/observability/plugins/:id/logs`       | Query plugin logs from Loki                   | `start` (RFC3339), `end` (RFC3339), `query` (optional LogQL filter), `limit` (int, default 100, max 1000)          |

**Standard error response (Art. 6.2)**:

```json
{
  "error": {
    "code": "OBSERVABILITY_BACKEND_UNAVAILABLE",
    "message": "Prometheus is not reachable. Retry later.",
    "details": {
      "backend": "prometheus",
      "timeout_ms": 5000
    }
  }
}
```

**Error codes specific to this spec**:

| Error Code                          | HTTP | Condition                                        |
| ----------------------------------- | ---- | ------------------------------------------------ |
| `OBSERVABILITY_BACKEND_UNAVAILABLE` | 502  | Prometheus, Tempo, or Loki is unreachable        |
| `INVALID_QUERY`                     | 400  | PromQL or LogQL query is malformed or disallowed |
| `PLUGIN_METRICS_UNAVAILABLE`        | 503  | Plugin does not expose `/metrics`                |
| `INVALID_TIME_RANGE`                | 400  | `start` ≥ `end` or range exceeds 30 days         |

### 8.4 Pagination

List endpoints (`/alerts/history`, `/traces`, `/plugins/:id/logs`) follow
Constitution Art. 3.4 pagination requirements:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 142,
    "total_pages": 8
  }
}
```

## 9. UX/UI Notes

### 9.1 Navigation

The "Observability" section is added to the Super Admin sidebar, positioned
after "Plugins" and before "Settings":

```
Super Admin Panel
├── Dashboard (existing)
├── Tenants (existing)
├── Plugins (existing)
├── Observability ← NEW
│   ├── Health
│   ├── Metrics
│   ├── Traces
│   └── Alerts
├── System Settings (existing)
└── Audit Logs (existing)
```

### 9.2 Health Tab

**Layout**: Full-width data table with auto-refresh indicator.

| Column            | Data Source        | Format                                                      |
| ----------------- | ------------------ | ----------------------------------------------------------- |
| Plugin Name       | Plugin registry    | Text, clickable → Metrics tab                               |
| Status            | Health summary API | Badge: `Healthy` (green), `Degraded` (yellow), `Down` (red) |
| P95 Latency (5m)  | Health summary API | `123ms` — red if > 500ms                                    |
| Error Rate (5m)   | Health summary API | `0.3%` — red if > 5%                                        |
| Uptime (24h)      | Health summary API | `99.8%`                                                     |
| Last Health Check | Health summary API | Relative time (`2m ago`)                                    |
| Actions           | —                  | "View Metrics" button                                       |

**Auto-refresh**: Every 30 seconds. Visual indicator: spinning icon +
"Last updated: 12:34:56".

**Status logic**:

- `Healthy`: error rate < 1% AND P95 < 500ms AND health check passing
- `Degraded`: error rate ≥ 1% OR P95 ≥ 500ms (but health check passing)
- `Down`: health check failing OR Prometheus target `up == 0`

### 9.3 Metrics Tab

**Layout**: Plugin selector (dropdown) + time range selector + chart grid.

**Charts** (4 panels, 2×2 grid):

1. **Request Rate** — line chart, req/s, stacked by status code class
   (2xx, 4xx, 5xx).
2. **Latency Distribution** — line chart, P50/P95/P99 lines overlaid.
3. **Error Rate** — area chart, percentage of 5xx responses.
4. **Resource Usage** — dual-axis: memory (bytes, left axis), CPU
   (percentage, right axis).

**Time range options**: 1h, 6h, 24h, 7d. Default: 1h.

**Chart library**: [NEEDS CLARIFICATION] — Recommend `recharts` (React-native,
lightweight) or `@visx/xychart` (more flexible). Must be accessible:
charts should have `aria-label` descriptions and data tables as fallback
for screen readers.

### 9.4 Traces Tab

**Layout**: Search bar + results list + detail panel (slide-out or
full-page).

**Search inputs**:

- Service/plugin name (dropdown, optional)
- Trace ID (text input, optional)
- Time range (date picker, required, default last 1h)

**Results table**:

| Column       | Format                                  |
| ------------ | --------------------------------------- |
| Trace ID     | Truncated UUID, clickable → detail view |
| Root Service | `core-api` or plugin name               |
| Duration     | `234ms`                                 |
| Span Count   | `5`                                     |
| Status       | Badge: `OK` (green), `Error` (red)      |

**Detail view** (on click):

- Span waterfall — hierarchical timeline showing parent-child span
  relationships, similar to Jaeger UI.
- Each span shows: service name, operation, duration, status code,
  and any error messages.
- [NEEDS CLARIFICATION] Whether to build a custom React span waterfall
  component or embed the Grafana Tempo panel via iframe. Custom
  component provides better UX integration but is significantly more
  effort.

### 9.5 Alerts Tab

**Layout**: Two sections stacked vertically.

**Active Alerts section**:

- Card layout, sorted by severity (critical first).
- Each card: severity badge, alert name, plugin name, description,
  time since first firing, "View Plugin" link.

**Alert History section**:

- Data table with pagination.
- Columns: Alert Name, Severity, Plugin, Fired At, Resolved At, Duration.
- Filterable by severity.

### 9.6 Accessibility (Art. 1.3, WCAG 2.1 AA)

- All status badges use both colour and text labels (not colour alone).
- Charts include `aria-label` with summary text (e.g., "Request rate
  chart for CRM plugin, last 1 hour: average 12.3 req/s").
- Data tables are used as accessible alternatives for screen readers
  behind an "Accessible view" toggle.
- Focus management: tab navigation through all interactive elements.
- Colour contrast ratios ≥ 4.5:1 for all text.

### 9.7 Responsive Design

- Dashboard is designed for desktop-first (min-width 1024px).
- On screens < 1024px, chart grid stacks vertically (single column).
- Health table scrolls horizontally on mobile.
- Traces waterfall uses horizontal scroll on mobile.

## 10. Out of Scope

The following are **explicitly not included** in this spec:

1. **Billing metrics / usage metering** — tracked per-tenant for billing
   purposes. This is a separate concern requiring its own spec (likely
   integrated with the future marketplace billing system).
2. **GDPR log retention policies** — this spec defines local-dev
   retention periods (7–15 days). Production retention policies
   (right-to-erasure, data residency) require a separate compliance spec.
3. **Custom alert routing** — e.g., PagerDuty/Slack/email notification
   channels. This spec defines alert rules; notification routing is a
   deployment-time configuration concern.
4. **Tenant-scoped observability dashboards** — this spec provides
   Super Admin observability only. Tenant Admin visibility into plugin
   performance within their tenant is deferred.
5. **Plugin developer self-serve tracing UI** — plugin developers can
   use the Plugin SDK to add custom spans, but a dedicated developer
   portal for trace exploration is out of scope.
6. **APM (Application Performance Monitoring)** — deep profiling (flame
   graphs, memory leak detection). Prometheus + traces cover the
   standard observability use cases.
7. **Synthetic monitoring / uptime checks** — external probes that verify
   plugin availability from outside the cluster.
8. **Elasticsearch / ELK stack** — Loki is chosen for log aggregation
   per the lightweight approach. Elasticsearch remains commented out in
   docker-compose.yml.
9. **Alertmanager notification channels** — Alertmanager is included for
   alert deduplication/grouping but notification targets (email, Slack)
   are deployment-time config.
10. **Production Grafana deployment** — Grafana is for local dev
    observability. Production uses the React-based Super Admin dashboard
    (US-006).

## 11. Open Questions

### OQ-001: OpenTelemetry Collector vs Direct Exporter [NEEDS CLARIFICATION]

**Question**: Should the core API export traces directly to Tempo
(OTLP/gRPC to `tempo:4317`) or should an OpenTelemetry Collector sit
between the app and Tempo?

**Trade-offs**:

- **Direct export**: Simpler (fewer moving parts), less resource overhead.
  Suitable for local dev and small deployments.
- **OTel Collector**: Enables trace processing (tail sampling, attribute
  enrichment), fan-out to multiple backends, and decouples the app from
  the backend choice. Standard in production deployments.

**Recommendation**: Direct export for Phase 1 (local dev). The Collector
can be added in a future production-hardening spec. **Requires ADR.**

### OQ-002: Loki Log Ingestion Method [NEEDS CLARIFICATION]

**Question**: How should plugin container logs reach Loki?

**Options**:

- **Loki Docker logging driver**: Install the Loki plugin on the Docker
  daemon; configure per-container logging driver. Simplest but requires
  host-level Docker config and has known issues with log ordering.
- **Promtail sidecar**: Run Promtail as a Docker service that tails
  container log files from `/var/lib/docker/containers/`. More reliable;
  no host config changes needed.
- **Promtail DaemonSet** (Kubernetes): Standard in K8s; not applicable
  for docker-compose.

**Recommendation**: Promtail sidecar in docker-compose (reads container
JSON logs via volume mount). **Requires ADR.**

### OQ-003: Chart Library for Observability Dashboard [NEEDS CLARIFICATION]

**Question**: Which React chart library should be used for the Metrics
tab time-series charts?

**Options**:

- **recharts**: Most popular React chart library. Simple API, good
  defaults. ~45 KB gzipped. Adequate for line/area/bar charts.
- **@visx/xychart**: Lower-level, more flexible. Built on D3. ~25 KB
  for the xychart module. Better for custom visualisations.
- **uPlot**: Fastest (Canvas-based). ~8 KB gzipped. Best for large
  time-series datasets (>10k points). Less React-idiomatic.

**Recommendation**: `recharts` for Phase 1 (widest community, simplest
API, good accessibility support). **Requires ADR per Art. 2.2.**

### OQ-004: Custom Trace Waterfall vs Grafana Embed [NEEDS CLARIFICATION]

**Question**: For the Traces tab detail view, should we build a custom
React span waterfall component or embed Grafana Tempo's panel?

**Trade-offs**:

- **Custom component**: Better UX integration (consistent styling, no
  iframe), full control, but 2–3 weeks of implementation effort.
- **Grafana embed**: Fast to implement (iframe + URL params), but
  inconsistent UX, requires Grafana to be running, and iframe has
  accessibility concerns.

**Recommendation**: Custom React waterfall component. The observability
dashboard is a first-class Super Admin feature, not a Grafana wrapper.
**No ADR needed** (UI component choice, not a new dependency).

### OQ-005: Production Trace Sample Rate [NEEDS CLARIFICATION]

**Question**: What should the default trace sample rate be in production?

**Context**: 100% sampling in production generates enormous trace volumes.
Typical production rates are 1–10%.

**Default recommendation**: 10% (`OTEL_TRACE_SAMPLE_RATE=0.1`),
configurable via environment variable. Always sample traces that contain
errors (tail-based sampling if OTel Collector is adopted per OQ-001).

## 12. Implementation Scope

> **Note**: All paths are relative to the project root.

### New Components

| Component Type  | Path                                                                   | Description                                                                      |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Route module    | `apps/core-api/src/routes/observability-v1.ts`                         | All `/api/v1/observability/*` endpoints                                          |
| Service         | `apps/core-api/src/services/observability.service.ts`                  | Business logic: health summary aggregation, Prometheus/Tempo/Loki query proxying |
| Service         | `apps/core-api/src/services/metrics.service.ts`                        | Core API Prometheus metrics registry (`prom-client`)                             |
| Service         | `apps/core-api/src/services/plugin-targets.service.ts`                 | Writes Prometheus file-based service discovery targets file                      |
| OTel setup      | `apps/core-api/src/lib/telemetry.ts`                                   | OpenTelemetry SDK initialisation, tracer provider, OTLP exporter                 |
| Middleware      | `apps/core-api/src/middleware/trace-context.ts`                        | Enriches Pino log context with `traceId` and `spanId`                            |
| Docker config   | `infrastructure/observability/prometheus/prometheus.yml`               | Prometheus configuration (scrape configs, file_sd, alert rules)                  |
| Alert rules     | `infrastructure/observability/prometheus/rules/plugin-alerts.yml`      | Prometheus alert rules                                                           |
| Docker config   | `infrastructure/observability/tempo/tempo.yml`                         | Tempo configuration                                                              |
| Docker config   | `infrastructure/observability/loki/loki.yml`                           | Loki configuration                                                               |
| Docker config   | `infrastructure/observability/promtail/promtail.yml`                   | Promtail configuration (log forwarding)                                          |
| Docker config   | `infrastructure/observability/grafana/provisioning/`                   | Grafana data sources + dashboard provisioning                                    |
| Grafana dash    | `infrastructure/observability/grafana/dashboards/plugin-overview.json` | Pre-built "Plugin Overview" dashboard                                            |
| Grafana dash    | `infrastructure/observability/grafana/dashboards/core-platform.json`   | Pre-built "Core Platform" dashboard                                              |
| React page      | `apps/super-admin/src/routes/_layout/observability/`                   | Observability dashboard pages (Health, Metrics, Traces, Alerts)                  |
| React component | `apps/super-admin/src/components/observability/HealthTable.tsx`        | Plugin health summary table                                                      |
| React component | `apps/super-admin/src/components/observability/MetricsCharts.tsx`      | Time-series chart panels                                                         |
| React component | `apps/super-admin/src/components/observability/TraceList.tsx`          | Trace search results                                                             |
| React component | `apps/super-admin/src/components/observability/TraceWaterfall.tsx`     | Span waterfall detail view                                                       |
| React component | `apps/super-admin/src/components/observability/AlertsPanel.tsx`        | Active alerts and alert history                                                  |
| Unit tests      | `apps/core-api/src/__tests__/observability/unit/`                      | Unit tests for observability services                                            |
| Integration     | `apps/core-api/src/__tests__/observability/integration/`               | Integration tests for observability endpoints                                    |
| E2E tests       | `apps/core-api/src/__tests__/observability/e2e/`                       | E2E tests for metrics proxy + dashboard                                          |
| Contract tests  | `apps/core-api/src/__tests__/observability/contract/`                  | Contract tests for plugin metrics API surface (Art. 8.1)                         |

### Modified Components

| Path                                                      | Modification Type | Description                                                                                     |
| --------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `docker-compose.yml`                                      | Enhancement       | Add Prometheus, Grafana, Tempo, Loki, Promtail services                                         |
| `apps/core-api/src/index.ts`                              | Enhancement       | Register metrics route (uncomment + update), register observability routes, initialise OTel SDK |
| `apps/core-api/src/routes/plugin-v1.ts`                   | Enhancement       | Add `GET /api/v1/plugins/:id/metrics` endpoint (FR-001)                                         |
| `apps/core-api/src/routes/metrics.ts`                     | Enhancement       | Extend with core platform metrics (FR-006, FR-007)                                              |
| `apps/core-api/src/modules/plugin/plugin-hook.service.ts` | Enhancement       | Replace `X-Trace-ID: crypto.randomUUID()` with W3C `traceparent` from OTel context (FR-013)     |
| `apps/core-api/src/services/plugin.service.ts`            | Enhancement       | Call `PluginTargetsService` on lifecycle transitions (FR-010)                                   |
| `apps/core-api/src/lib/logger.ts`                         | Enhancement       | Add OTel trace ID to Pino log context (FR-019)                                                  |
| `apps/super-admin/src/routes/_layout/observability/`      | Enhancement       | Add "Observability" navigation item to Super Admin sidebar                                      |

### Documentation Updates

| Path                    | Section          | Update Description                                                                    |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `docs/OBSERVABILITY.md` | New file         | Developer guide for observability stack (setup, configuration, adding custom metrics) |
| `docs/PLUGIN_SDK.md`    | Tracing section  | Document how plugins opt into distributed tracing via SDK                             |
| `AGENTS.md`             | Commands section | Add `pnpm observability:up` / `pnpm observability:down` convenience scripts           |

## 13. Constitution Compliance

| Article | Status    | Notes                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | Art. 1.2 §1 (Security First): all observability endpoints require super_admin auth. Art. 1.2 §3 (API-First): all endpoints versioned under `/api/v1/`. Art. 1.3 (UX): dashboard page load < 2s, WCAG 2.1 AA.                                                                                                                                                                                                |
| Art. 2  | PARTIAL   | **New dependencies required**: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-grpc`, `prom-client`, and a chart library (recharts or visx). Each requires an ADR per Art. 2.2 (§ OQ-001, OQ-003). Prometheus, Grafana, Tempo, Loki, Promtail are infrastructure services (docker images), not npm packages — no ADR needed for docker images per Art. 2.2 policy (applies to npm packages). |
| Art. 3  | COMPLIANT | Art. 3.1 (Microservices): observability services are independent containers. Art. 3.2 (Layered): routes → service → infrastructure. Art. 3.3 (Data): no raw SQL; metrics/traces stored in dedicated backends. Art. 3.4 (API): REST conventions, pagination, standard error format.                                                                                                                          |
| Art. 4  | COMPLIANT | Art. 4.1 (Coverage): ≥80% for observability module, 100% for security-related code (auth checks). Art. 4.3 (Performance): metrics proxy < 200ms P95; observability API < 500ms P95.                                                                                                                                                                                                                         |
| Art. 5  | COMPLIANT | Art. 5.1: all endpoints auth-gated. Art. 5.2: no PII in metrics/traces/logs (tenant_id allowed, user email forbidden). Art. 5.3: Zod validation on all query parameters; PromQL injection prevention via allowlist.                                                                                                                                                                                         |
| Art. 6  | COMPLIANT | Art. 6.1: errors classified (operational vs programmer). Art. 6.2: standard error format with stable codes. Art. 6.3: Pino JSON logging with trace ID enrichment.                                                                                                                                                                                                                                           |
| Art. 7  | COMPLIANT | Art. 7.1: files in kebab-case (`observability.service.ts`), classes PascalCase (`ObservabilityService`). Art. 7.3: REST naming (`/observability/plugins/:id/query`), plural collections, no verbs in URLs.                                                                                                                                                                                                  |
| Art. 8  | COMPLIANT | Art. 8.1: unit tests for services, integration tests for endpoints, E2E for dashboard, **contract tests for plugin metrics API surface** (plugin `/metrics` response format). Art. 8.2: deterministic, independent, descriptive names.                                                                                                                                                                      |
| Art. 9  | COMPLIANT | Art. 9.1: feature flags for dashboard UI rollout; observability infrastructure is backward-compatible (additive only). Art. 9.2: health checks (existing), metrics (FR-006), error rate alerting (FR-021), latency alerting (FR-020), isolation monitoring (tenant_id in trace attributes enables cross-tenant leak detection).                                                                             |

### ADRs Required Before Implementation

| ADR Topic                                        | Blocking FRs           | Open Question |
| ------------------------------------------------ | ---------------------- | ------------- |
| OpenTelemetry SDK + direct Tempo export          | FR-011, FR-012, FR-015 | OQ-001        |
| `prom-client` for core API metrics               | FR-006, FR-007         | —             |
| Log ingestion method (Promtail vs Docker driver) | FR-017                 | OQ-002        |
| Chart library (recharts vs visx vs uPlot)        | FR-027                 | OQ-003        |

---

## Cross-References

| Document                       | Path                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| Constitution                   | `.forge/constitution.md`                                      |
| Architecture                   | `.forge/architecture/architecture.md` (§7.2 Monitoring)       |
| Plugin System Spec             | `.forge/specs/004-plugin-system/spec.md` (FR-009)             |
| Admin Interfaces Spec          | `.forge/specs/008-admin-interfaces/spec.md`                   |
| Frontend Production Readiness  | `.forge/specs/010-frontend-production-readiness/spec.md`      |
| Decision Log (TD-009)          | `.forge/knowledge/decision-log.md`                            |
| ADR-019: Container Adapter     | `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md` |
| ADR-023: SSE Notifications     | `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md` |
| Plugin Routes (existing)       | `apps/core-api/src/routes/plugin-v1.ts`                       |
| Core Metrics Routes (existing) | `apps/core-api/src/routes/metrics.ts`                         |
| Plugin Hook Service            | `apps/core-api/src/modules/plugin/plugin-hook.service.ts`     |
| Container Adapter              | `apps/core-api/src/lib/container-adapter.ts`                  |
| Docker Compose                 | `docker-compose.yml`                                          |
