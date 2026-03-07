# Plan: 012 - Plugin Observability

> Technical implementation plan for the Plexica plugin observability epic.
> Covers Prometheus metrics, OpenTelemetry distributed tracing, Loki log
> aggregation, Prometheus alerting, Grafana dashboards, and a React-based
> Super Admin observability UI.
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                           |
| ------ | ----------------------------------------------- |
| Status | Draft                                           |
| Author | forge-architect                                 |
| Date   | 2026-03-07                                      |
| Track  | Epic                                            |
| Spec   | `.forge/specs/012-plugin-observability/spec.md` |

---

## 1. Overview

This plan implements a full-stack observability layer for Plexica's plugin
system — the last major infrastructure gap before production readiness. The
current platform has zero metrics collection, zero distributed tracing, zero
log aggregation, and zero alerting. This plan addresses all 37 functional
requirements and 22 non-functional requirements from Spec 012 across 5
implementation phases with 45 tasks totalling ~158 story points (~131 hours).

### 1.1 Current State

```
┌─────────────┐     HTTP      ┌─────────────────┐
│   Browser    │ ──────────── │   Core API       │
│  (React SPA) │              │  Fastify :3001   │
└─────────────┘              │                   │
                              │  /health ✅       │
                              │  /metrics ❌ (*)  │
                              │  /api/v1/plugins  │
                              │    /:id/health ✅ │
                              │    /:id/metrics ❌│
                              └────────┬──────────┘
                                       │ HTTP proxy
                              ┌────────▼──────────┐
                              │  Plugin Containers │
                              │  :8080             │
                              │  /health ✅        │
                              │  /ready ✅         │
                              │  /metrics ❌       │
                              └───────────────────┘

  (*) metrics.ts exists but is COMMENTED OUT in index.ts line 220.
      It only exposes event-bus metrics, not platform metrics.

  Observability infrastructure: NONE
  - No Prometheus, Grafana, Tempo, Loki, or Promtail
  - No OpenTelemetry SDK
  - No prom-client in core-api (only in packages/event-bus)
  - X-Trace-ID uses crypto.randomUUID() — not W3C traceparent
```

### 1.2 Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Super Admin → Observability                                 │   │
│  │  ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐              │   │
│  │  │ Health │ │ Metrics │ │ Traces │ │ Alerts │   (recharts)  │   │
│  │  └────┬───┘ └────┬────┘ └───┬────┘ └───┬────┘              │   │
│  └───────┼──────────┼──────────┼──────────┼────────────────────┘   │
└──────────┼──────────┼──────────┼──────────┼────────────────────────┘
           │          │          │          │
     ──────┼──────────┼──────────┼──────────┼──── /api/v1/observability/*
           │          │          │          │
┌──────────▼──────────▼──────────▼──────────▼────────────────────────┐
│                    Core API (Fastify :3001)                         │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ telemetry.ts│  │ MetricsSvc   │  │ ObservabilitySvc           │ │
│  │ (OTel SDK)  │  │ (prom-client)│  │ (Prom/Tempo/Loki proxy)   │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────────┘ │
│         │                │                        │                 │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌────────────┴───────────────┐ │
│  │ trace-ctx   │  │ /metrics     │  │ /api/v1/observability/*    │ │
│  │ middleware   │  │ endpoint     │  │ health-summary, query,     │ │
│  └─────────────┘  └──────────────┘  │ alerts, traces, logs       │ │
│                                      └────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ PluginTargetsService — writes /etc/prometheus/targets/plugins.json│
│  └─────────────────────────────────────────────────────────────────┘│
└────────────┬─────────────────┬──────────────────┬──────────────────┘
             │ OTLP/gRPC       │ Scrape :3001     │ Query APIs
             │                 │                   │
┌────────────▼─────┐ ┌────────▼──────┐ ┌─────────▼──────────────────┐
│      Tempo       │ │  Prometheus   │ │    Loki                     │
│   :4317 (OTLP)   │ │  :9090        │ │    :3100                    │
│   :3200 (HTTP)   │ │  file_sd →    │ │    ← Promtail              │
└──────────────────┘ │  plugin targets│ │       (container logs)      │
                     │  alert rules   │ └────────────────────────────┘
                     └───────┬────────┘
                             │ Scrape :8080/metrics
                    ┌────────▼────────┐
                    │ Plugin Containers│
                    │ /metrics ✅ (new)│
                    │ /health  ✅      │
                    └─────────────────┘
                    ┌─────────────────┐
                    │    Grafana      │
                    │   :3000 (dev)   │
                    │  Prom + Tempo   │
                    │  + Loki sources │
                    └─────────────────┘
```

## 2. Data Model

### 2.1 New Tables

No new PostgreSQL tables. All observability data is stored in purpose-built
backends per spec §7.1:

| Data Type | Storage Backend | Access Pattern                                               |
| --------- | --------------- | ------------------------------------------------------------ |
| Metrics   | Prometheus      | PromQL queries via `/api/v1/observability/plugins/:id/query` |
| Traces    | Tempo           | TraceQL via `/api/v1/observability/traces`                   |
| Logs      | Loki            | LogQL via `/api/v1/observability/plugins/:id/logs`           |
| Alerts    | Prometheus AM   | Alert API via `/api/v1/observability/alerts`                 |

### 2.2 Modified Tables

No table modifications.

### 2.3 Indexes

No index changes.

### 2.4 Migrations

No database migrations required.

### 2.5 Prometheus File-Based Service Discovery

The core API writes a JSON file consumed by Prometheus (spec §7.2):

**File path**: `/etc/prometheus/targets/plugins.json` (Docker volume-mounted)

```json
[
  {
    "targets": ["plugin-crm:8080"],
    "labels": {
      "plugin": "crm",
      "plugin_version": "1.2.0",
      "__metrics_path__": "/metrics"
    }
  }
]
```

**Update triggers**: `activatePlugin()` and `deactivatePlugin()` in
`plugin.service.ts` (lines 894, 1004).

## 3. API Endpoints

### 3.1 GET /api/v1/plugins/:id/metrics

- **Description**: Proxy Prometheus metrics from a plugin container (TD-009 / FR-001)
- **Auth**: Bearer + `super_admin`
- **Rate Limit**: Default (100/min prod, 1000/min dev)
- **Request**: No body. Path param `id` = plugin ID.
- **Response (200)**:
  ```
  # HELP http_requests_total Total HTTP requests
  # TYPE http_requests_total counter
  http_requests_total{method="GET",path="/api/data",status="200"} 1234
  ```
  Content-Type: `text/plain; version=0.0.4; charset=utf-8`
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------------- | ---------------------------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No auth token |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 404 | `PLUGIN_NOT_FOUND` | Plugin ID not in registry |
  | 503 | `PLUGIN_NOT_ACTIVE` | Plugin lifecycle ≠ ACTIVE |
  | 503 | `PLUGIN_UNREACHABLE` | Container timeout (5s) |
  | 503 | `PLUGIN_METRICS_UNAVAILABLE`| Plugin does not expose /metrics |

### 3.2 GET /metrics

- **Description**: Core platform Prometheus metrics (FR-006)
- **Auth**: Bearer + `super_admin`
- **Response (200)**:
  ```
  # HELP http_requests_total Total HTTP requests to core API
  # TYPE http_requests_total counter
  http_requests_total{method="GET",route="/api/v1/plugins",status_code="200"} 5678
  # HELP http_request_duration_seconds HTTP request duration
  # TYPE http_request_duration_seconds histogram
  http_request_duration_seconds_bucket{method="GET",route="/api/v1/plugins",le="0.05"} 4500
  ...
  # HELP active_plugins_total Number of ACTIVE plugins
  # TYPE active_plugins_total gauge
  active_plugins_total 12
  # (plus default nodejs_* and process_* metrics from prom-client)
  # (plus plexica_events_* metrics merged from event-bus registry)
  ```
  Content-Type: `text/plain; version=0.0.4; charset=utf-8`
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------- | ------------ |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not admin |

### 3.3 GET /api/v1/observability/plugins/health-summary

- **Description**: Aggregated health data for all ACTIVE plugins (FR-026)
- **Auth**: Bearer + `super_admin`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "pluginId": "crm",
        "pluginName": "CRM Plugin",
        "status": "healthy",
        "p95LatencyMs": 45,
        "errorRatePercent": 0.2,
        "uptimePercent24h": 99.9,
        "lastHealthCheck": "2026-03-07T10:30:00Z"
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ----------------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Prometheus unreachable |

### 3.4 GET /api/v1/observability/plugins/:id/query

- **Description**: Proxy PromQL range query scoped to a plugin (FR-028)
- **Auth**: Bearer + `super_admin`
- **Query Parameters**:
  - `query` (string, required) — PromQL expression. Validated against metric name allowlist.
  - `start` (RFC3339, required)
  - `end` (RFC3339, required)
  - `step` (duration string, required, e.g. `15s`)
- **Response (200)**:
  ```json
  {
    "data": {
      "resultType": "matrix",
      "result": [
        {
          "metric": { "__name__": "http_requests_total", "method": "GET" },
          "values": [
            [1709798400, "123"],
            [1709798415, "125"]
          ]
        }
      ]
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ------------------------ |
  | 400 | `INVALID_QUERY` | Malformed/disallowed PromQL |
  | 400 | `INVALID_TIME_RANGE` | start ≥ end or > 30 days |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Prometheus unreachable |

### 3.5 GET /api/v1/observability/alerts

- **Description**: Currently-firing Prometheus alerts (FR-022)
- **Auth**: Bearer + `super_admin`
- **Query Parameters**:
  - `severity` (optional, enum: `critical`, `warning`)
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "alertName": "PluginHighErrorRate",
        "severity": "warning",
        "pluginId": "crm",
        "description": "CRM plugin 5xx rate > 5% for 5 minutes",
        "state": "firing",
        "activeAt": "2026-03-07T10:25:00Z",
        "value": "7.2"
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ---------------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Prometheus unreachable |

### 3.6 GET /api/v1/observability/alerts/history

- **Description**: Resolved alerts from last 7 days, paginated (FR-023)
- **Auth**: Bearer + `super_admin`
- **Query Parameters**:
  - `page` (int, default 1)
  - `per_page` (int, default 20, max 100)
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "alertName": "PluginDown",
        "severity": "critical",
        "pluginId": "billing",
        "firedAt": "2026-03-06T08:00:00Z",
        "resolvedAt": "2026-03-06T08:05:00Z",
        "duration": "5m"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 42,
      "total_pages": 3
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ---------------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Prometheus unreachable |

### 3.7 GET /api/v1/observability/traces

- **Description**: Search traces via Tempo HTTP API (FR-030)
- **Auth**: Bearer + `super_admin`
- **Query Parameters**:
  - `service` (optional, string)
  - `traceId` (optional, string)
  - `start` (RFC3339, required)
  - `end` (RFC3339, required)
  - `limit` (int, default 20, max 100)
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "traceId": "abc123def456",
        "rootService": "core-api",
        "durationMs": 234,
        "spanCount": 5,
        "status": "ok",
        "startTime": "2026-03-07T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 89,
      "total_pages": 5
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ------------------- |
  | 400 | `INVALID_TIME_RANGE` | Invalid time range |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Tempo unreachable |

### 3.8 GET /api/v1/observability/traces/:traceId

- **Description**: Full trace retrieval from Tempo (FR-031)
- **Auth**: Bearer + `super_admin`
- **Response (200)**:
  ```json
  {
    "data": {
      "traceId": "abc123def456",
      "rootService": "core-api",
      "durationMs": 234,
      "spans": [
        {
          "spanId": "span-001",
          "parentSpanId": null,
          "operationName": "GET /api/v1/plugins/:id/health",
          "serviceName": "core-api",
          "durationMs": 234,
          "statusCode": 200,
          "startTime": "2026-03-07T10:30:00.000Z",
          "attributes": { "plugin.id": "crm", "tenant.id": "acme" },
          "children": [
            {
              "spanId": "span-002",
              "parentSpanId": "span-001",
              "operationName": "GET /health",
              "serviceName": "plugin-crm",
              "durationMs": 12,
              "statusCode": 200,
              "startTime": "2026-03-07T10:30:00.050Z",
              "attributes": {},
              "children": []
            }
          ]
        }
      ]
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ----------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 404 | `TRACE_NOT_FOUND` | No trace in Tempo |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Tempo unreachable |

### 3.9 GET /api/v1/observability/plugins/:id/logs

- **Description**: Query plugin logs from Loki (FR-018)
- **Auth**: Bearer + `super_admin`
- **Query Parameters**:
  - `start` (RFC3339, required)
  - `end` (RFC3339, required)
  - `query` (optional, LogQL filter, e.g. `|= "error"`)
  - `limit` (int, default 100, max 1000)
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "timestamp": "2026-03-07T10:30:01.234Z",
        "level": "error",
        "message": "Database connection timeout",
        "traceId": "abc123def456",
        "tenantId": "acme-corp",
        "service": "plugin-crm"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 100,
      "total": 523,
      "total_pages": 6
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------------- | ------------------- |
  | 400 | `INVALID_QUERY` | Malformed LogQL |
  | 400 | `INVALID_TIME_RANGE` | Invalid time range |
  | 401 | `AUTH_MISSING_TOKEN` | No auth |
  | 403 | `AUTH_FORBIDDEN` | Not super_admin |
  | 502 | `OBSERVABILITY_BACKEND_UNAVAILABLE` | Loki unreachable |

## 4. Component Design

### 4.1 TelemetrySetup (`telemetry.ts`)

- **Purpose**: Initialise OpenTelemetry SDK at process startup (before Fastify)
- **Location**: `apps/core-api/src/lib/telemetry.ts`
- **Responsibilities**:
  - Create `NodeSDK` with `OTLPTraceExporter` (gRPC to `OTEL_EXPORTER_OTLP_ENDPOINT`)
  - Register `HttpInstrumentation` for automatic span creation
  - Configure `BatchSpanProcessor` with fail-open drop policy (NFR-014)
  - Set `TraceIdRatioBasedSampler` from `OTEL_TRACE_SAMPLE_RATE` env (NFR-008/009)
  - Export `getTracer()` helper for manual span creation
  - Set `service.name` = `core-api`, `service.version` from `package.json`
- **Dependencies**: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-grpc`,
  `@opentelemetry/instrumentation-http`, `@opentelemetry/resources`,
  `@opentelemetry/semantic-conventions`, `@opentelemetry/api`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------- | ----------------------------- | ------- | -------------------------------------------------- |
  | `initTelemetry()` | — | `void` | Start OTel SDK (must be called before app init) |
  | `getTracer()` | `name?: string` | `Tracer`| Get a named tracer for manual instrumentation |
  | `shutdown()` | — | `Promise<void>` | Flush pending spans and shut down SDK |

### 4.2 TraceContextMiddleware (`trace-context.ts`)

- **Purpose**: Enrich Pino logger with `traceId` and `spanId` from OTel context
- **Location**: `apps/core-api/src/middleware/trace-context.ts`
- **Responsibilities**:
  - Extract active span from OTel context on each request
  - Add `traceId` and `spanId` to Pino child logger (FR-019)
  - Add `tenant.id` and `plugin.id` span attributes from request context
- **Dependencies**: `@opentelemetry/api`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------------------ | ---------------------------------- | ------- | ------------------------------------ |
  | `traceContextMiddleware` | `(request, reply, done)` | `void` | Fastify preHandler hook |

### 4.3 MetricsService (`metrics.service.ts`)

- **Purpose**: Core API Prometheus metrics registry (FR-006, FR-007)
- **Location**: `apps/core-api/src/services/metrics.service.ts`
- **Responsibilities**:
  - Create dedicated `Registry` with default Node.js metrics (`collectDefaultMetrics`)
  - Register `http_requests_total` counter (method, route, status_code labels)
  - Register `http_request_duration_seconds` histogram (method, route labels)
    - Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]` (aligned with P95 < 200ms SLA)
  - Register `active_plugins_total` gauge
  - Provide `mergeRegistries()` to combine with event-bus registry at scrape time
  - Provide Fastify `onRequest`/`onResponse` hooks for automatic HTTP metric recording
- **Dependencies**: `prom-client`, `@plexica/event-bus` (for `eventMetrics.getRegistry()`)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ---------------------------- | -------------- | ----------------- | ----------------------------------------- |
  | `getMetrics()` | — | `Promise<string>` | Merged Prometheus text from both registries |
  | `recordRequest()` | `method, route, statusCode, durationS` | `void` | Increment counter + observe histogram |
  | `setActivePluginsCount()` | `count: number`| `void` | Update gauge |
  | `getContentType()` | — | `string` | `text/plain; version=0.0.4; charset=utf-8`|

### 4.4 PluginTargetsService (`plugin-targets.service.ts`)

- **Purpose**: Write Prometheus file-based service discovery targets (FR-009, FR-010)
- **Location**: `apps/core-api/src/services/plugin-targets.service.ts`
- **Responsibilities**:
  - Query all ACTIVE plugins from database
  - Generate `plugins.json` in Prometheus `file_sd_configs` format
  - Write atomically (write to `.tmp` then `rename`) to avoid corrupted reads
  - Called from `plugin.service.ts` on lifecycle transitions
- **Dependencies**: `fs/promises`, `@plexica/database`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------------- | ---------- | ---------------- | ------------------------------------------- |
  | `refreshTargets()` | — | `Promise<void>` | Query ACTIVE plugins, write targets file |
  | `getTargetsFilePath()` | — | `string` | Return configured targets file path |

### 4.5 ObservabilityService (`observability.service.ts`)

- **Purpose**: Business logic for all `/api/v1/observability/*` endpoints (FR-022..FR-031)
- **Location**: `apps/core-api/src/services/observability.service.ts`
- **Responsibilities**:
  - `getHealthSummary()`: Query Prometheus for per-plugin P95, error rate, uptime, health status
  - `queryPluginMetrics()`: Proxy PromQL range query with plugin label injection and validation
  - `getActiveAlerts()`: Query Prometheus `/api/v1/alerts`, filter by severity
  - `getAlertHistory()`: Query Prometheus alert history, paginate
  - `searchTraces()`: Proxy to Tempo HTTP API `/api/search`
  - `getTrace()`: Proxy to Tempo `/api/traces/:traceId`, transform to nested span tree
  - `getPluginLogs()`: Proxy LogQL query to Loki `/loki/api/v1/query_range`
  - Validate all PromQL/LogQL input against injection (edge case #14)
- **Dependencies**: Native `fetch` (Node 20), `zod` for query validation
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------------- | ------------------------------------------------ | ------------------------ | ------------------------------ |
  | `getHealthSummary()` | — | `Promise<HealthEntry[]>` | Aggregated plugin health |
  | `queryPluginMetrics()` | `pluginId, query, start, end, step` | `Promise<PromQueryResult>` | Validated PromQL proxy |
  | `getActiveAlerts()` | `severity?: string` | `Promise<Alert[]>` | Firing alerts from Prometheus |
  | `getAlertHistory()` | `page, perPage` | `Promise<PaginatedAlerts>` | Resolved alerts (7 days) |
  | `searchTraces()` | `service?, traceId?, start, end, limit` | `Promise<PaginatedTraces>` | Tempo trace search |
  | `getTrace()` | `traceId` | `Promise<TraceDetail>` | Full span tree from Tempo |
  | `getPluginLogs()` | `pluginId, start, end, query?, limit` | `Promise<PaginatedLogs>` | Loki log query |

### 4.6 ObservabilityRoutes (`observability-v1.ts`)

- **Purpose**: Register all `/api/v1/observability/*` endpoints (FR-024..FR-037)
- **Location**: `apps/core-api/src/routes/observability-v1.ts`
- **Responsibilities**:
  - Route registration with Zod-validated query params (Art. 5.3)
  - `super_admin` auth guard on all routes (FR-036)
  - Standard error format (Art. 6.2)
  - Delegation to `ObservabilityService` methods
- **Dependencies**: `ObservabilityService`, auth middleware, Zod

### 4.7 Frontend Components

#### 4.7.1 ObservabilityLayout

- **Location**: `apps/super-admin/src/routes/_layout/observability/index.tsx`
- **Responsibilities**: Tab navigation (Health/Metrics/Traces/Alerts), route management

#### 4.7.2 HealthTable

- **Location**: `apps/super-admin/src/components/observability/HealthTable.tsx`
- **Responsibilities**: Plugin health summary table, auto-refresh (30s), status badges
  with color + text (WCAG 2.1 AA), click-through to Metrics tab

#### 4.7.3 MetricsCharts

- **Location**: `apps/super-admin/src/components/observability/MetricsCharts.tsx`
- **Responsibilities**: 4-panel chart grid (request rate, latency, error rate, resources),
  plugin selector, time range selector, `recharts` line/area charts,
  `aria-label` descriptions, data table fallback for screen readers

#### 4.7.4 TraceList / TraceWaterfall

- **Location**: `apps/super-admin/src/components/observability/TraceList.tsx`
  and `apps/super-admin/src/components/observability/TraceWaterfall.tsx`
- **Responsibilities**: Trace search, results table, span waterfall (custom React component,
  not Grafana embed per OQ-004 resolution). Hierarchical timeline with parent-child
  span relationships, service name, operation, duration, error highlighting.

#### 4.7.5 AlertsPanel

- **Location**: `apps/super-admin/src/components/observability/AlertsPanel.tsx`
- **Responsibilities**: Active alerts (card layout, severity sorted), alert history
  (paginated table), severity filtering, "View Plugin" links

## 5. File Map

> **Note**: All paths are relative to the project root.

### Files to Create

| Path                                                                                 | Purpose                                                             | Estimated Size |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------- |
| `apps/core-api/src/lib/telemetry.ts`                                                 | OpenTelemetry SDK init, tracer provider (ADR-026)                   | M              |
| `apps/core-api/src/middleware/trace-context.ts`                                      | Pino log enrichment with traceId/spanId (FR-019)                    | S              |
| `apps/core-api/src/services/metrics.service.ts`                                      | Core API prom-client registry (ADR-027, FR-006/007)                 | M              |
| `apps/core-api/src/services/plugin-targets.service.ts`                               | Prometheus file_sd targets writer (FR-009/010)                      | S              |
| `apps/core-api/src/services/observability.service.ts`                                | Observability business logic — Prom/Tempo/Loki proxy (FR-022..031)  | L              |
| `apps/core-api/src/routes/observability-v1.ts`                                       | Observability API route registration (FR-024..037)                  | L              |
| `apps/core-api/src/schemas/observability.schema.ts`                                  | Zod schemas for observability query params (Art. 5.3)               | M              |
| `infrastructure/observability/prometheus/prometheus.yml`                             | Prometheus config: scrape targets, file_sd, rules (FR-008)          | M              |
| `infrastructure/observability/prometheus/rules/plugin-alerts.yml`                    | Alert rules: error rate, latency, health, down, memory (FR-020/021) | M              |
| `infrastructure/observability/tempo/tempo.yml`                                       | Tempo config: OTLP receiver, local storage (FR-015)                 | S              |
| `infrastructure/observability/loki/loki.yml`                                         | Loki config: ingester, storage, retention (FR-016)                  | S              |
| `infrastructure/observability/promtail/promtail.yml`                                 | Promtail config: Docker log scraping, pipeline stages (ADR-028)     | M              |
| `infrastructure/observability/grafana/provisioning/datasources/datasources.yml`      | Grafana data source provisioning (FR-033)                           | S              |
| `infrastructure/observability/grafana/provisioning/dashboards/dashboards.yml`        | Grafana dashboard provisioning config                               | S              |
| `infrastructure/observability/grafana/dashboards/plugin-overview.json`               | Pre-built Plugin Overview dashboard (FR-034)                        | L              |
| `infrastructure/observability/grafana/dashboards/core-platform.json`                 | Pre-built Core Platform dashboard (FR-035)                          | L              |
| `apps/super-admin/src/routes/_layout/observability/index.tsx`                        | Observability layout with tab nav (FR-024)                          | M              |
| `apps/super-admin/src/routes/_layout/observability/health.tsx`                       | Health tab page                                                     | S              |
| `apps/super-admin/src/routes/_layout/observability/metrics.tsx`                      | Metrics tab page                                                    | S              |
| `apps/super-admin/src/routes/_layout/observability/traces.tsx`                       | Traces tab page                                                     | S              |
| `apps/super-admin/src/routes/_layout/observability/alerts.tsx`                       | Alerts tab page                                                     | S              |
| `apps/super-admin/src/components/observability/HealthTable.tsx`                      | Plugin health table component (FR-025)                              | M              |
| `apps/super-admin/src/components/observability/MetricsCharts.tsx`                    | Time-series chart panels with recharts (FR-027)                     | L              |
| `apps/super-admin/src/components/observability/TraceList.tsx`                        | Trace search and results list (FR-029)                              | M              |
| `apps/super-admin/src/components/observability/TraceWaterfall.tsx`                   | Span waterfall visualization (FR-029)                               | L              |
| `apps/super-admin/src/components/observability/AlertsPanel.tsx`                      | Alerts display component (FR-032)                                   | M              |
| `apps/super-admin/src/hooks/useObservability.ts`                                     | React Query hooks for observability API calls                       | M              |
| `apps/core-api/src/__tests__/observability/unit/metrics.service.test.ts`             | Unit tests for MetricsService                                       | M              |
| `apps/core-api/src/__tests__/observability/unit/observability.service.test.ts`       | Unit tests for ObservabilityService                                 | L              |
| `apps/core-api/src/__tests__/observability/unit/plugin-targets.service.test.ts`      | Unit tests for PluginTargetsService                                 | M              |
| `apps/core-api/src/__tests__/observability/unit/telemetry.test.ts`                   | Unit tests for telemetry init                                       | S              |
| `apps/core-api/src/__tests__/observability/integration/observability-routes.test.ts` | Integration tests for observability endpoints                       | L              |
| `apps/core-api/src/__tests__/observability/integration/metrics-endpoint.test.ts`     | Integration tests for /metrics endpoint                             | M              |
| `apps/core-api/src/__tests__/observability/integration/metrics-proxy.test.ts`        | Integration tests for plugin metrics proxy                          | M              |
| `apps/core-api/src/__tests__/observability/e2e/observability-dashboard.test.ts`      | E2E tests for dashboard rendering                                   | L              |
| `apps/core-api/src/__tests__/observability/contract/plugin-metrics-format.test.ts`   | Contract tests for plugin /metrics response (Art. 8.1)              | M              |
| `docs/OBSERVABILITY.md`                                                              | Developer guide for observability stack                             | L              |

### Files to Modify

| Path                                                      | Section/Lines                                                       | Change Description                                                                             | Estimated Effort |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `docker-compose.yml`                                      | After minio service (~line 251)                                     | Add Prometheus, Tempo, Loki, Promtail, Grafana services + volumes                              | L                |
| `apps/core-api/src/index.ts`                              | Lines 18-19 (imports), 220 (metrics), 238 (routes), 325-330 (start) | Import telemetry, uncomment metrics route, register observability routes, init OTel in start() | M                |
| `apps/core-api/src/routes/plugin-v1.ts`                   | After line 474 (before remotes route)                               | Add `GET /plugins/:id/metrics` endpoint (FR-001)                                               | M                |
| `apps/core-api/src/routes/metrics.ts`                     | Lines 11-48                                                         | Extend to merge core platform metrics + event-bus metrics at `/metrics`                        | M                |
| `apps/core-api/src/modules/plugin/plugin-hook.service.ts` | Line 368                                                            | Replace `'X-Trace-ID': crypto.randomUUID()` with `traceparent` from OTel (FR-013)              | S                |
| `apps/core-api/src/services/plugin.service.ts`            | Lines 894, 1004 (activate/deactivate)                               | Call `pluginTargetsService.refreshTargets()` on lifecycle transitions (FR-010)                 | S                |
| `apps/core-api/src/lib/logger.ts`                         | Full file                                                           | Add OTel trace context mixin for traceId/spanId in logs (FR-019)                               | S                |
| `apps/core-api/package.json`                              | dependencies                                                        | Add `@opentelemetry/*` (7 packages per ADR-026), `prom-client`                                 | S                |
| `apps/super-admin/package.json`                           | dependencies                                                        | Add `recharts`                                                                                 | S                |
| `apps/super-admin/src/routes/_layout/` (sidebar config)   | Navigation array                                                    | Add "Observability" nav item after "Plugins"                                                   | S                |

### Files to Delete (if any)

None.

### Files to Reference (Read-only)

| Path                                                               | Purpose                              |
| ------------------------------------------------------------------ | ------------------------------------ |
| `.forge/constitution.md`                                           | Validate all architectural decisions |
| `.forge/specs/012-plugin-observability/spec.md`                    | Requirement source (37 FRs, 22 NFRs) |
| `.forge/knowledge/adr/adr-026-otel-direct-tempo-export.md`         | OTel SDK architecture                |
| `.forge/knowledge/adr/adr-027-prom-client-core-metrics.md`         | prom-client registry pattern         |
| `.forge/knowledge/adr/adr-028-log-ingestion-promtail-loki.md`      | Promtail configuration               |
| `.forge/knowledge/adr/adr-029-chart-library-recharts.md`           | Frontend chart library               |
| `.forge/knowledge/adr/adr-030-plugin-metrics-prometheus-format.md` | Plugin metrics contract              |
| `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md`      | SSE pattern for in-app alerts        |
| `packages/event-bus/src/metrics/event-metrics.ts`                  | Existing prom-client pattern         |
| `apps/core-api/src/lib/container-adapter.ts`                       | Container adapter for plugin proxy   |

## 6. Dependencies

### 6.1 New Dependencies

| Package                                   | Version | Purpose                                                | ADR     |
| ----------------------------------------- | ------- | ------------------------------------------------------ | ------- |
| `@opentelemetry/sdk-node`                 | ^0.57   | OTel SDK for Node.js auto-instrumentation              | ADR-026 |
| `@opentelemetry/exporter-trace-otlp-grpc` | ^0.57   | OTLP/gRPC span exporter to Tempo                       | ADR-026 |
| `@opentelemetry/instrumentation-http`     | ^0.57   | Automatic HTTP span creation                           | ADR-026 |
| `@opentelemetry/instrumentation-fastify`  | ^0.43   | Fastify route/handler span enrichment                  | ADR-026 |
| `@opentelemetry/resources`                | ^1.30   | Resource attributes (service.name, version)            | ADR-026 |
| `@opentelemetry/semantic-conventions`     | ^1.30   | Standard attribute names                               | ADR-026 |
| `@opentelemetry/api`                      | ^1.9    | Context propagation, tracer API                        | ADR-026 |
| `prom-client`                             | ^15.1.3 | Prometheus metrics for core-api (reuse from event-bus) | ADR-027 |
| `recharts`                                | ^2.15   | React chart library for metrics dashboard              | ADR-029 |

**Docker images (infrastructure, no ADR required)**:

- `prom/prometheus:v3.3`
- `grafana/tempo:2.7`
- `grafana/loki:3.4`
- `grafana/promtail:3.4`
- `grafana/grafana:11.6`

### 6.2 Internal Dependencies

- `@plexica/event-bus` — `eventMetrics.getRegistry()` for merged `/metrics` output
- `@plexica/database` — Plugin table queries for ACTIVE status, lifecycle transitions
- `apps/core-api/src/middleware/auth.ts` — `requireSuperAdmin` guard
- `apps/core-api/src/lib/redis.ts` — Optional caching for health summary
- `apps/core-api/src/services/plugin.service.ts` — Lifecycle hooks for targets refresh

## 7. Implementation Phases

### Phase 1: Infrastructure & Core Metrics (Sprint N, Weeks 1-2)

**Objective**: Stand up observability infrastructure and expose core API `/metrics`.

**Files to Create**:

- `infrastructure/observability/prometheus/prometheus.yml`
  - Purpose: Prometheus scrape config (core-api static target, file_sd for plugins)
  - Dependencies: None
  - Estimated effort: 3h
- `infrastructure/observability/tempo/tempo.yml`
  - Purpose: Tempo configuration (OTLP receiver, local storage, 7-day retention)
  - Dependencies: None
  - Estimated effort: 1h
- `infrastructure/observability/loki/loki.yml`
  - Purpose: Loki config (ingester, compactor, 7-day retention)
  - Dependencies: None
  - Estimated effort: 1h
- `infrastructure/observability/promtail/promtail.yml`
  - Purpose: Promtail Docker log scraping config (ADR-028)
  - Dependencies: None
  - Estimated effort: 2h
- `infrastructure/observability/grafana/provisioning/datasources/datasources.yml`
  - Purpose: Grafana auto-provisioned data sources
  - Dependencies: Prometheus, Tempo, Loki configs
  - Estimated effort: 1h
- `infrastructure/observability/grafana/provisioning/dashboards/dashboards.yml`
  - Purpose: Grafana dashboard provisioning config
  - Dependencies: None
  - Estimated effort: 30m
- `apps/core-api/src/services/metrics.service.ts`
  - Purpose: Core API prom-client registry
  - Dependencies: prom-client package
  - Estimated effort: 4h
- `apps/core-api/src/services/plugin-targets.service.ts`
  - Purpose: Prometheus file_sd target writer
  - Dependencies: None
  - Estimated effort: 3h

**Files to Modify**:

- `docker-compose.yml`
  - Section: After minio service
  - Change: Add 5 services (Prometheus, Tempo, Loki, Promtail, Grafana) + volumes
  - Estimated effort: 3h
- `apps/core-api/src/routes/metrics.ts`
  - Section: Full file
  - Change: Extend to use MetricsService, merge registries, add `/metrics` root endpoint
  - Estimated effort: 2h
- `apps/core-api/src/index.ts`
  - Section: Lines 19, 220
  - Change: Uncomment metrics import, register at `/metrics` path (not `/api/metrics`)
  - Estimated effort: 1h
- `apps/core-api/src/services/plugin.service.ts`
  - Section: Lines 894, 1004
  - Change: Call `pluginTargetsService.refreshTargets()` on lifecycle transitions
  - Estimated effort: 1h
- `apps/core-api/package.json`
  - Section: dependencies
  - Change: Add `prom-client` ^15.1.3
  - Estimated effort: 15m

**Tasks**:

| ID      | Task                                                                                                                                                                                 | Points | Effort | Phase Deps       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ---------------- |
| T012-01 | Docker-compose: add Prometheus, Tempo, Loki, Promtail, Grafana services with health checks, volumes, network                                                                         | 5      | 4h     | None             |
| T012-02 | Prometheus config: static scrape for core-api, `file_sd_configs` for plugins, scrape interval 15s                                                                                    | 3      | 3h     | T012-01          |
| T012-03 | Tempo config: OTLP/gRPC receiver on :4317, local storage, 7-day retention                                                                                                            | 2      | 1h     | T012-01          |
| T012-04 | Loki config: ingester, compactor, local filesystem storage, 7-day retention, label limits                                                                                            | 2      | 1h     | T012-01          |
| T012-05 | Promtail config: Docker log scraping via volume mount, pipeline stages for Pino JSON extraction (service, level, tenantId, traceId labels)                                           | 3      | 2h     | T012-01, T012-04 |
| T012-06 | Grafana provisioning: data sources (Prometheus, Tempo, Loki) + dashboard provider config                                                                                             | 2      | 1.5h   | T012-01          |
| T012-07 | MetricsService: prom-client registry, http_requests_total counter, http_request_duration_seconds histogram, active_plugins_total gauge, Fastify hooks, merge with event-bus registry | 5      | 4h     | None             |
| T012-08 | `/metrics` endpoint: extend metrics.ts to serve merged Prometheus text, move to root path, super_admin auth                                                                          | 3      | 2h     | T012-07          |
| T012-09 | PluginTargetsService: query ACTIVE plugins, write plugins.json atomically, configure targets path via env var                                                                        | 3      | 3h     | None             |
| T012-10 | Wire PluginTargetsService into plugin.service.ts: call refreshTargets() on activate/deactivate                                                                                       | 2      | 1h     | T012-09          |
| T012-11 | Prometheus alert rules: PluginHighErrorRate, PluginHighLatency, PluginHealthCheckFailing, PluginDown, PluginHighMemory, CoreHighErrorRate                                            | 3      | 2h     | T012-02          |

**Phase 1 Total**: ~33 pts, ~25h

---

### Phase 2: Distributed Tracing (Sprint N, Week 2-3)

**Objective**: Instrument core API with OpenTelemetry, propagate W3C traceparent.

**Files to Create**:

- `apps/core-api/src/lib/telemetry.ts`
  - Purpose: OTel SDK init
  - Dependencies: @opentelemetry/\* packages
  - Estimated effort: 5h
- `apps/core-api/src/middleware/trace-context.ts`
  - Purpose: Pino log enrichment middleware
  - Dependencies: telemetry.ts
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/index.ts`
  - Section: Top of file (import), start() function
  - Change: Import and call `initTelemetry()` BEFORE Fastify init, register trace-context hook
  - Estimated effort: 1h
- `apps/core-api/src/modules/plugin/plugin-hook.service.ts`
  - Section: Line 368
  - Change: Replace `'X-Trace-ID': crypto.randomUUID()` with `traceparent` from OTel context propagation
  - Estimated effort: 1h
- `apps/core-api/src/lib/logger.ts`
  - Section: Full file
  - Change: Add Pino mixin using OTel `trace.getSpan(context.active())` to inject traceId/spanId
  - Estimated effort: 1h
- `apps/core-api/package.json`
  - Section: dependencies
  - Change: Add 7 @opentelemetry/\* packages (including instrumentation-fastify per ADR-026)
  - Estimated effort: 15m

**Tasks**:

| ID      | Task                                                                                                                                                | Points | Effort | Phase Deps       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---------------- |
| T012-12 | telemetry.ts: NodeSDK init with OTLPTraceExporter (gRPC), BatchSpanProcessor, TraceIdRatioBasedSampler, HttpInstrumentation, FastifyInstrumentation | 5      | 5h     | None             |
| T012-13 | trace-context.ts: Fastify preHandler middleware extracting traceId/spanId from OTel context into Pino child logger                                  | 3      | 2h     | T012-12          |
| T012-14 | logger.ts: Add Pino mixin for automatic traceId/spanId injection (FR-019)                                                                           | 2      | 1h     | T012-12          |
| T012-15 | plugin-hook.service.ts: Replace X-Trace-ID with W3C traceparent from OTel context propagation (FR-013)                                              | 2      | 1h     | T012-12          |
| T012-16 | index.ts: Wire telemetry init (must run BEFORE Fastify), register trace-context middleware, add shutdown() to graceful shutdown                     | 2      | 1h     | T012-12, T012-13 |
| T012-17 | Install @opentelemetry/\* packages in apps/core-api/package.json (7 packages per ADR-026)                                                           | 1      | 15m    | None             |

**Phase 2 Total**: ~15 pts, ~10h

---

### Phase 3: API Endpoints — Metrics Proxy & Observability (Sprint N, Week 3-4)

**Objective**: Implement all backend observability API endpoints.

**Files to Create**:

- `apps/core-api/src/routes/observability-v1.ts`
  - Purpose: All /api/v1/observability/\* route registration
  - Dependencies: ObservabilityService, auth middleware
  - Estimated effort: 5h
- `apps/core-api/src/services/observability.service.ts`
  - Purpose: Business logic for health summary, PromQL proxy, trace search, log query
  - Dependencies: Native fetch, Zod schemas
  - Estimated effort: 8h
- `apps/core-api/src/schemas/observability.schema.ts`
  - Purpose: Zod validation for all observability query params
  - Dependencies: Zod
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/routes/plugin-v1.ts`
  - Section: After stats route (line 474)
  - Change: Add `GET /plugins/:id/metrics` endpoint (TD-009 / FR-001)
  - Estimated effort: 3h
- `apps/core-api/src/index.ts`
  - Section: registerRoutes() function
  - Change: Register observability-v1 routes under `/api/v1`
  - Estimated effort: 30m

**Tasks**:

| ID      | Task                                                                                                                                                                                        | Points | Effort | Phase Deps  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------- |
| T012-18 | Plugin metrics proxy: `GET /api/v1/plugins/:id/metrics` in plugin-v1.ts — proxy to container /metrics with 5s timeout, text/plain response, all error codes (FR-001..005). Resolves TD-009. | 5      | 3h     | T012-07     |
| T012-19 | observability.schema.ts: Zod schemas for query params (PromQL allowlist, time range validation, pagination)                                                                                 | 3      | 2h     | None        |
| T012-20 | ObservabilityService.getHealthSummary(): Query Prometheus instant queries for per-plugin error rate, P95 latency, uptime; combine with plugin registry data (FR-026)                        | 5      | 4h     | T012-02     |
| T012-21 | ObservabilityService.queryPluginMetrics(): Validate PromQL against metric name allowlist, inject plugin label, proxy to Prometheus range_query API (FR-028)                                 | 5      | 3h     | T012-02     |
| T012-22 | ObservabilityService.getActiveAlerts() + getAlertHistory(): Proxy Prometheus /api/v1/alerts, filter/paginate (FR-022, FR-023)                                                               | 3      | 2h     | T012-11     |
| T012-23 | ObservabilityService.searchTraces() + getTrace(): Proxy to Tempo HTTP API /api/search and /api/traces/:id, transform to nested span tree (FR-030, FR-031)                                   | 5      | 4h     | T012-03     |
| T012-24 | ObservabilityService.getPluginLogs(): Proxy LogQL to Loki /loki/api/v1/query_range, validate input, paginate (FR-018, spec §8.3)                                                            | 3      | 2h     | T012-04     |
| T012-25 | observability-v1.ts: Route registration for all 7 endpoints, super_admin auth, Zod validation, error format (FR-036, FR-037)                                                                | 5      | 5h     | T012-19..24 |
| T012-26 | index.ts: Register observability routes under /api/v1 prefix                                                                                                                                | 1      | 30m    | T012-25     |
| T012-46 | OpenAPI schema definitions for all 8 new endpoints (/metrics + 7 /api/v1/observability/\*), following existing pattern in plugin-v1.ts (Art. 3.4.5)                                         | 2      | 2h     | T012-25     |

**Phase 3 Total**: ~37 pts, ~28h

---

### Phase 4: Frontend Dashboard (Sprint N+1, Week 1-3)

**Objective**: Build Super Admin observability dashboard with Health, Metrics, Traces, Alerts tabs.

**Files to Create**:

- `apps/super-admin/src/routes/_layout/observability/index.tsx`
  - Purpose: Observability layout with tab nav
  - Estimated effort: 2h
- `apps/super-admin/src/routes/_layout/observability/health.tsx`
  - Purpose: Health tab page
  - Estimated effort: 1h
- `apps/super-admin/src/routes/_layout/observability/metrics.tsx`
  - Purpose: Metrics tab page
  - Estimated effort: 1h
- `apps/super-admin/src/routes/_layout/observability/traces.tsx`
  - Purpose: Traces tab page
  - Estimated effort: 1h
- `apps/super-admin/src/routes/_layout/observability/alerts.tsx`
  - Purpose: Alerts tab page
  - Estimated effort: 1h
- `apps/super-admin/src/hooks/useObservability.ts`
  - Purpose: React Query hooks for observability API
  - Estimated effort: 3h
- `apps/super-admin/src/components/observability/HealthTable.tsx`
  - Purpose: Plugin health table with auto-refresh
  - Estimated effort: 4h
- `apps/super-admin/src/components/observability/MetricsCharts.tsx`
  - Purpose: Time-series charts with recharts
  - Estimated effort: 6h
- `apps/super-admin/src/components/observability/TraceList.tsx`
  - Purpose: Trace search + results
  - Estimated effort: 4h
- `apps/super-admin/src/components/observability/TraceWaterfall.tsx`
  - Purpose: Span waterfall visualization
  - Estimated effort: 8h
- `apps/super-admin/src/components/observability/AlertsPanel.tsx`
  - Purpose: Active alerts + history
  - Estimated effort: 4h

**Files to Modify**:

- `apps/super-admin/package.json`
  - Change: Add `recharts` ^2.15
  - Estimated effort: 15m
- `apps/super-admin/src/routes/_layout/` (sidebar)
  - Change: Add Observability nav item
  - Estimated effort: 1h

**Tasks**:

| ID      | Task                                                                                                                                                                                                            | Points | Effort | Phase Deps |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---------- |
| T012-27 | Install recharts, create observability layout page with 4-tab navigation (Health/Metrics/Traces/Alerts), add to admin sidebar nav                                                                               | 3      | 3h     | None       |
| T012-28 | useObservability.ts: React Query hooks (useHealthSummary, usePluginMetrics, useActiveAlerts, useAlertHistory, useTraces, useTraceDetail, usePluginLogs) with staleTime/refetchInterval config                   | 3      | 3h     | T012-25    |
| T012-29 | HealthTable.tsx: Plugin health table, status badges (color + text), P95/error rate formatting, 30s auto-refresh with visual indicator, click-through to Metrics (FR-025)                                        | 5      | 4h     | T012-28    |
| T012-30 | MetricsCharts.tsx: 4-panel recharts grid (request rate, latency P50/P95/P99, error rate, resource usage), plugin selector, time range selector, aria-labels, data table fallback (FR-027)                       | 8      | 6h     | T012-28    |
| T012-31 | TraceList.tsx: Trace search form (service dropdown, trace ID input, time range picker), results table (trace ID, root service, duration, span count, status badge), pagination                                  | 5      | 4h     | T012-28    |
| T012-32 | TraceWaterfall.tsx: Custom React span waterfall component — hierarchical timeline, parent-child relationships, service name/operation/duration/status per span, error highlighting, horizontal scroll on mobile | 8      | 8h     | T012-31    |
| T012-33 | AlertsPanel.tsx: Active alerts (card layout sorted by severity), alert history (paginated table with severity filter), "View Plugin" links (FR-032)                                                             | 5      | 4h     | T012-28    |
| T012-47 | Feature flag gate: Add `observability_dashboard_enabled` flag, gate sidebar nav item + observability route on it (Art. 9.1)                                                                                     | 1      | 1h     | T012-27    |

**Phase 4 Total**: ~38 pts, ~33h

---

### Phase 5: Testing, Grafana Dashboards & Documentation (Sprint N+1, Week 3-4)

**Objective**: Comprehensive testing, Grafana pre-built dashboards, developer docs.

**Files to Create**:

- `apps/core-api/src/__tests__/observability/unit/metrics.service.test.ts`
  - Purpose: Unit tests for MetricsService
  - Estimated effort: 3h
- `apps/core-api/src/__tests__/observability/unit/observability.service.test.ts`
  - Purpose: Unit tests for ObservabilityService
  - Estimated effort: 5h
- `apps/core-api/src/__tests__/observability/unit/plugin-targets.service.test.ts`
  - Purpose: Unit tests for PluginTargetsService
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/observability/unit/telemetry.test.ts`
  - Purpose: Unit tests for telemetry init
  - Estimated effort: 1h
- `apps/core-api/src/__tests__/observability/integration/observability-routes.test.ts`
  - Purpose: Integration tests for all 7 observability endpoints
  - Estimated effort: 6h
- `apps/core-api/src/__tests__/observability/integration/metrics-endpoint.test.ts`
  - Purpose: Integration tests for /metrics endpoint
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/observability/integration/metrics-proxy.test.ts`
  - Purpose: Integration tests for plugin metrics proxy (TD-009)
  - Estimated effort: 3h
- `apps/core-api/src/__tests__/observability/e2e/observability-dashboard.test.ts`
  - Purpose: E2E tests for dashboard rendering and data flow
  - Estimated effort: 4h
- `apps/core-api/src/__tests__/observability/contract/plugin-metrics-format.test.ts`
  - Purpose: Contract tests for plugin /metrics response per ADR-030
  - Estimated effort: 2h
- `infrastructure/observability/grafana/dashboards/plugin-overview.json`
  - Purpose: Plugin Overview Grafana dashboard (FR-034)
  - Estimated effort: 4h
- `infrastructure/observability/grafana/dashboards/core-platform.json`
  - Purpose: Core Platform Grafana dashboard (FR-035)
  - Estimated effort: 3h
- `docs/OBSERVABILITY.md`
  - Purpose: Developer guide for observability stack
  - Estimated effort: 3h

**Tasks**:

| ID      | Task                                                                                                                                                                | Points | Effort | Phase Deps  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------- |
| T012-34 | Unit tests: MetricsService (registry creation, metric recording, merge, content type)                                                                               | 3      | 3h     | T012-07     |
| T012-35 | Unit tests: ObservabilityService (all 7 methods, mock Prometheus/Tempo/Loki responses, error handling, validation rejection)                                        | 5      | 5h     | T012-20..24 |
| T012-36 | Unit tests: PluginTargetsService (file write, atomic rename, ACTIVE filter, empty plugin list)                                                                      | 2      | 2h     | T012-09     |
| T012-37 | Unit tests: telemetry.ts (SDK init, getTracer, shutdown, env var config) AND trace-context.ts (Pino child logger enrichment, missing span handling, traceId format) | 2      | 2h     | T012-12     |
| T012-38 | Integration tests: 7 observability endpoints (auth, validation, proxy, pagination, error responses, 502 on backend down)                                            | 5      | 6h     | T012-25     |
| T012-39 | Integration tests: /metrics endpoint (auth, Prometheus format, merged registries, NFR-002 latency)                                                                  | 3      | 2h     | T012-08     |
| T012-40 | Integration tests: plugin metrics proxy (auth, 404/503 errors, timeout, content-type, proxy success)                                                                | 3      | 3h     | T012-18     |
| T012-41 | E2E tests: observability dashboard (page load, tab navigation, health table rendering, chart rendering, trace detail, alert display, WCAG a11y audit via axe-core)  | 5      | 4h     | T012-27..33 |
| T012-42 | Contract tests: plugin /metrics response format (Prometheus text exposition, required metrics per ADR-030, sample_limit validation)                                 | 2      | 2h     | T012-18     |
| T012-43 | Grafana dashboards: "Plugin Overview" (health matrix, top-N error plugins, latency distribution, per-plugin panels with plugin label filter)                        | 3      | 4h     | T012-06     |
| T012-44 | Grafana dashboards: "Core Platform" (request rate, error rate, P50/P95/P99 latency, heap usage, event loop lag, active connections)                                 | 3      | 3h     | T012-06     |
| T012-45 | docs/OBSERVABILITY.md: setup guide, docker-compose usage, adding custom metrics, tracing guide, Grafana access, env var reference                                   | 3      | 3h     | All         |

**Phase 5 Total**: ~38 pts, ~38h

---

### Summary: All Phases

| Phase     | Name                          | Tasks        | Points  | Effort    | Sprint       |
| --------- | ----------------------------- | ------------ | ------- | --------- | ------------ |
| 1         | Infrastructure & Core Metrics | T012-01..11  | 33      | 25h       | N W1-2       |
| 2         | Distributed Tracing           | T012-12..17  | 15      | 10h       | N W2-3       |
| 3         | API Endpoints                 | T012-18..26  | 35      | 26h       | N W3-4       |
| 4         | Frontend Dashboard            | T012-27..33  | 37      | 32h       | N+1 W1-3     |
| 5         | Testing, Grafana & Docs       | T012-34..45  | 38      | 38h       | N+1 W3-4     |
| **Total** |                               | **45 tasks** | **158** | **~131h** | **~8 weeks** |

## 8. Testing Strategy

### 8.1 Unit Tests

| Component              | Test Focus                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MetricsService`       | Registry creation, metric recording (counter inc, histogram observe), merged output, content type header, Fastify hook wiring                                        |
| `ObservabilityService` | Each of 7 methods: mock HTTP responses from Prometheus/Tempo/Loki, validate PromQL/LogQL injection prevention, error handling (502 on backend down), pagination math |
| `PluginTargetsService` | Atomic file write, ACTIVE filter, JSON format correctness, empty plugin list → empty array, file path from env var                                                   |
| `telemetry.ts`         | SDK init with env vars, getTracer returns named tracer, shutdown flushes, sampler configuration                                                                      |
| `trace-context.ts`     | Pino child logger enrichment, missing span handling (no crash), traceId format                                                                                       |

**Target**: 40 unit tests, ≥85% coverage on observability module

### 8.2 Integration Tests

| Scenario                                                     | Dependencies                        |
| ------------------------------------------------------------ | ----------------------------------- |
| `GET /metrics` returns merged Prometheus text with auth      | Fastify, MetricsService             |
| `GET /api/v1/plugins/:id/metrics` proxies to container       | Fastify, mock container             |
| `GET /api/v1/plugins/:id/metrics` returns 503 for non-ACTIVE | Fastify, database                   |
| 7 observability endpoints: auth, validation, success, error  | Fastify, mock Prometheus/Tempo/Loki |
| PromQL injection rejected with 400                           | Fastify, ObservabilityService       |
| Pagination correctness on alerts/history and traces          | Fastify, mock responses             |
| 502 when backend is unreachable                              | Fastify, connection timeout         |

**Target**: 25 integration tests

### 8.3 E2E Tests

| Scenario                                          | Dependencies           |
| ------------------------------------------------- | ---------------------- |
| Dashboard loads within 2 seconds                  | Full stack             |
| Health tab displays plugin data with auto-refresh | Full stack             |
| Metrics tab renders charts for selected plugin    | Full stack, recharts   |
| Trace detail shows span waterfall                 | Full stack, Tempo      |
| Alerts tab displays active and historical alerts  | Full stack, Prometheus |
| WCAG 2.1 AA compliance (axe-core audit)           | Full stack, axe-core   |

**Target**: 10 E2E tests

### 8.4 Contract Tests

| Scenario                                                                          | Dependencies      |
| --------------------------------------------------------------------------------- | ----------------- |
| Plugin `/metrics` response in Prometheus text format                              | Plugin container  |
| Required metrics present (`http_requests_total`, `http_request_duration_seconds`) | Plugin container  |
| `sample_limit` enforcement (5000 samples max)                                     | Prometheus config |

**Target**: 5 contract tests

### 8.5 Test Totals

| Type        | Count  | Coverage Target |
| ----------- | ------ | --------------- |
| Unit        | 40     | ≥85%            |
| Integration | 25     | All endpoints   |
| E2E         | 10     | Critical flows  |
| Contract    | 5      | Plugin API      |
| **Total**   | **80** | ≥80% module     |

## 9. Architectural Decisions

| ADR     | Decision                                                                                    | Status   |
| ------- | ------------------------------------------------------------------------------------------- | -------- |
| ADR-026 | OpenTelemetry SDK with direct OTLP/gRPC export to Tempo (no Collector sidecar)              | Accepted |
| ADR-027 | `prom-client` ^15.1.3 for core API Prometheus metrics with dedicated Registry               | Accepted |
| ADR-028 | Promtail sidecar for log ingestion to Loki (not Docker logging driver)                      | Accepted |
| ADR-029 | `recharts` ^2.15 for frontend dashboard charts (WCAG 2.1 AA, tree-shakeable)                | Accepted |
| ADR-030 | Plugin metrics format contract: Prometheus text exposition with required metrics            | Accepted |
| —       | OQ-005 (alert delivery): MVP uses in-app alerts via SSE (ADR-023); PagerDuty/Slack deferred | Non-ADR  |

## 10. Requirement Traceability

| Requirement | Plan Section             | Implementation Path                             |
| ----------- | ------------------------ | ----------------------------------------------- |
| FR-001      | §3.1, §7 Phase 3 T012-18 | `plugin-v1.ts` GET /plugins/:id/metrics         |
| FR-002      | §3.1                     | `plugin-v1.ts` preHandler: requireSuperAdmin    |
| FR-003      | §3.1                     | `plugin-v1.ts` lifecycle status guard           |
| FR-004      | §3.1                     | `plugin-v1.ts` 5s timeout, PLUGIN_UNREACHABLE   |
| FR-005      | §3.1                     | `plugin-v1.ts` PLUGIN_NOT_FOUND                 |
| FR-006      | §3.2, §7 Phase 1 T012-08 | `metrics.ts` /metrics endpoint                  |
| FR-007      | §3.2, §4.3               | `metrics.service.ts` metric definitions         |
| FR-008      | §7 Phase 1 T012-02       | `prometheus.yml` scrape config                  |
| FR-009      | §7 Phase 1 T012-09       | `plugin-targets.service.ts` file_sd             |
| FR-010      | §7 Phase 1 T012-10       | `plugin.service.ts` lifecycle hooks             |
| FR-011      | §7 Phase 2 T012-12       | `telemetry.ts` OTel SDK                         |
| FR-012      | §7 Phase 2 T012-12       | OTel HttpInstrumentation auto-propagation       |
| FR-013      | §7 Phase 2 T012-15       | `plugin-hook.service.ts` traceparent            |
| FR-014      | §4.1                     | Plugin SDK (future — Should priority)           |
| FR-015      | §7 Phase 1 T012-03       | `tempo.yml` OTLP receiver                       |
| FR-016      | §7 Phase 1 T012-04       | `loki.yml` config                               |
| FR-017      | §7 Phase 1 T012-05       | `promtail.yml` Docker log scraping              |
| FR-018      | §3.9, §7 Phase 3 T012-24 | `observability.service.ts` getPluginLogs()      |
| FR-019      | §7 Phase 2 T012-14       | `logger.ts` Pino mixin                          |
| FR-020      | §7 Phase 1 T012-11       | `plugin-alerts.yml` rules                       |
| FR-021      | §7 Phase 1 T012-11       | `plugin-alerts.yml` CoreHighErrorRate           |
| FR-022      | §3.5, §7 Phase 3 T012-22 | `observability.service.ts` getActiveAlerts()    |
| FR-023      | §3.6, §7 Phase 3 T012-22 | `observability.service.ts` getAlertHistory()    |
| FR-024      | §7 Phase 4 T012-27       | Observability layout page                       |
| FR-025      | §7 Phase 4 T012-29       | `HealthTable.tsx`                               |
| FR-026      | §3.3, §7 Phase 3 T012-20 | `observability.service.ts` getHealthSummary()   |
| FR-027      | §7 Phase 4 T012-30       | `MetricsCharts.tsx`                             |
| FR-028      | §3.4, §7 Phase 3 T012-21 | `observability.service.ts` queryPluginMetrics() |
| FR-029      | §7 Phase 4 T012-31/32    | `TraceList.tsx` + `TraceWaterfall.tsx`          |
| FR-030      | §3.7, §7 Phase 3 T012-23 | `observability.service.ts` searchTraces()       |
| FR-031      | §3.8, §7 Phase 3 T012-23 | `observability.service.ts` getTrace()           |
| FR-032      | §7 Phase 4 T012-33       | `AlertsPanel.tsx`                               |
| FR-033      | §7 Phase 1 T012-06       | Grafana provisioning                            |
| FR-034      | §7 Phase 5 T012-43       | `plugin-overview.json`                          |
| FR-035      | §7 Phase 5 T012-44       | `core-platform.json`                            |
| FR-036      | §3.3..§3.9               | All observability routes: requireSuperAdmin     |
| FR-037      | §3.3..§3.9               | All error responses: Art. 6.2 format            |
| NFR-001     | §3.1                     | 5s proxy timeout, target < 200ms P95            |
| NFR-002     | §3.2, §4.3               | In-process registry, target < 100ms             |
| NFR-003     | §3.3..§3.9               | Proxy + validation overhead, target < 500ms     |
| NFR-004     | §7 Phase 1 T012-02       | Prometheus scrape_interval: 15s                 |
| NFR-005     | §7 Phase 1 T012-02       | Prometheus scrape_interval: 15s                 |
| NFR-006     | §7 Phase 2 T012-12       | BatchSpanProcessor scheduleDelayMillis: 5000    |
| NFR-007     | §7 Phase 1 T012-05       | Promtail scrape interval                        |
| NFR-008     | §4.1                     | Development: sampleRate = 1.0                   |
| NFR-009     | §4.1                     | Production: OTEL_TRACE_SAMPLE_RATE env          |
| NFR-010     | §7 Phase 1 T012-02       | Prometheus retention: 15d                       |
| NFR-011     | §7 Phase 1 T012-03       | Tempo retention: 7d                             |
| NFR-012     | §7 Phase 1 T012-04       | Loki retention: 7d                              |
| NFR-013     | §4.1, ADR-026            | BatchSpanProcessor drop-on-queue-full           |
| NFR-014     | §4.1, ADR-026            | Exporter fail-open policy                       |
| NFR-015     | §3.1..§3.9               | All endpoints: requireSuperAdmin                |
| NFR-016     | §7.4 (spec)              | No PII in span attributes                       |
| NFR-017     | §7 Phase 1 T012-01       | Grafana ports: localhost:3000 only              |
| NFR-018     | §7 Phase 4 T012-27..33   | Code-split, lazy load, < 2s load                |
| NFR-019     | §7 Phase 4 T012-30..32   | WCAG 2.1 AA: aria-labels, data tables           |
| NFR-020     | §7 Phase 1 T012-01       | Prometheus memory limit: 512MB                  |
| NFR-021     | §7 Phase 1 T012-01       | Tempo memory limit: 256MB                       |
| NFR-022     | §7 Phase 1 T012-01       | Loki memory limit: 256MB                        |

## 11. Constitution Compliance

| Article | Status       | Notes                                                                                                                                                                                                                                                                          |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | ✅ COMPLIANT | §1.2.1: Security-first — all endpoints require super_admin auth (FR-036). §1.2.3: API-first — versioned REST under `/api/v1/`. §1.3: UX — dashboard < 2s load, WCAG 2.1 AA, actionable errors.                                                                                 |
| Art. 2  | ✅ COMPLIANT | All 8 new npm packages approved via ADR-026 (6 OTel), ADR-027 (prom-client), ADR-029 (recharts). Docker images are infrastructure (no ADR per Art. 2.2 policy).                                                                                                                |
| Art. 3  | ✅ COMPLIANT | §3.1: Observability services are independent containers (microservices). §3.2: Layered — routes → services → infrastructure. §3.3: No raw SQL; metrics in Prometheus, traces in Tempo, logs in Loki. §3.4: REST conventions, pagination (max 100/page), standard error format. |
| Art. 4  | ✅ COMPLIANT | §4.1: 80 tests planned (40 unit, 25 integration, 10 E2E, 5 contract) targeting ≥80% module coverage. §4.3: /metrics < 100ms, proxy < 200ms, observability API < 500ms.                                                                                                         |
| Art. 5  | ✅ COMPLIANT | §5.1: All endpoints super_admin gated. §5.2: No PII in metrics/traces/logs (tenant_id only). §5.3: Zod validation on all query params; PromQL/LogQL injection prevention via allowlist.                                                                                        |
| Art. 6  | ✅ COMPLIANT | §6.1: Errors classified (operational: 502 backend down; validation: 400 invalid query). §6.2: Standard `{ error: { code, message, details? } }` format. §6.3: Pino JSON logging with traceId/spanId enrichment.                                                                |
| Art. 7  | ✅ COMPLIANT | §7.1: Files kebab-case (`observability.service.ts`), classes PascalCase (`ObservabilityService`). §7.3: REST naming (`/observability/plugins/:id/query`), plural collections, no URL verbs.                                                                                    |
| Art. 8  | ✅ COMPLIANT | §8.1: Unit + integration + E2E + contract tests. §8.2: Deterministic (mock backends), independent, AAA pattern, descriptive names. §8.3: Factory test data, no hardcoded IDs.                                                                                                  |
| Art. 9  | ✅ COMPLIANT | §9.1: Feature flags for dashboard UI (additive, no breaking changes). §9.2: Health checks (existing), metrics (FR-006), error alerts (FR-021), latency alerts (FR-020), isolation monitoring (tenant_id in traces).                                                            |

## 12. Environment Variables

| Variable                      | Default                                | Description                       | Phase |
| ----------------------------- | -------------------------------------- | --------------------------------- | ----- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4317`                    | OTel OTLP/gRPC endpoint           | 2     |
| `OTEL_TRACE_SAMPLE_RATE`      | `1.0` (dev), `0.1` (prod)              | Trace sampling ratio              | 2     |
| `OTEL_SERVICE_NAME`           | `core-api`                             | OTel service name                 | 2     |
| `PROMETHEUS_URL`              | `http://prometheus:9090`               | Prometheus query endpoint         | 3     |
| `TEMPO_URL`                   | `http://tempo:3200`                    | Tempo HTTP query endpoint         | 3     |
| `LOKI_URL`                    | `http://loki:3100`                     | Loki query endpoint               | 3     |
| `PROMETHEUS_TARGETS_PATH`     | `/etc/prometheus/targets/plugins.json` | File-based service discovery path | 1     |

> **Note**: There is no `METRICS_AUTH_REQUIRED` toggle. The `/metrics` endpoint
> **always** requires `super_admin` Bearer token authentication (Art. 5.1).
> Prometheus scrapes `/metrics` using a Bearer token configured in
> `prometheus.yml` via the `authorization.credentials` scrape config field
> (see T012-02).

## 13. Performance Impact Analysis

### 13.1 Core API Overhead

- **prom-client HTTP hooks**: ~0.1ms per request (counter inc + histogram observe). Negligible
  vs 200ms P95 SLA budget.
- **OTel tracing**: ~0.2ms per request (span creation + context propagation). BatchSpanProcessor
  exports asynchronously, no blocking on span export.
- **Pino mixin (traceId)**: ~0.01ms per log line. Single `trace.getSpan()` call.
- **Total per-request overhead**: ~0.3ms — well within SLA headroom.

### 13.2 Infrastructure Resources (Local Dev)

| Service    | Memory Limit | CPU             | Disk Estimate (15 days, 20 plugins) |
| ---------- | ------------ | --------------- | ----------------------------------- |
| Prometheus | 512 MB       | 0.5 core        | ~2 GB                               |
| Tempo      | 256 MB       | 0.25 core       | ~500 MB                             |
| Loki       | 256 MB       | 0.25 core       | ~1 GB                               |
| Promtail   | 128 MB       | 0.1 core        | Negligible (stateless)              |
| Grafana    | 256 MB       | 0.25 core       | ~100 MB (config only)               |
| **Total**  | **~1.4 GB**  | **~1.35 cores** | **~3.6 GB**                         |

### 13.3 Plugin Metrics Proxy Latency

- Network: core-api → plugin container (Docker bridge) ≈ 1ms RTT
- Plugin /metrics scrape: 5-50ms depending on metric count
- Total: <100ms P95 (well within 200ms SLA)
- Timeout ceiling: 5000ms (edge case, not the norm)

### 13.4 Frontend Bundle Impact

- `recharts` ≈ 45 KB gzipped, code-split into admin route (lazy loaded)
- Observability pages loaded only when Super Admin navigates to Observability tab
- Zero impact on regular user page load times

---

## Cross-References

| Document                         | Path                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| Spec                             | `.forge/specs/012-plugin-observability/spec.md`                    |
| Design Spec                      | `.forge/specs/012-plugin-observability/design-spec.md`             |
| User Journey                     | `.forge/specs/012-plugin-observability/user-journey.md`            |
| Architecture                     | `.forge/architecture/architecture.md`                              |
| Constitution                     | `.forge/constitution.md`                                           |
| ADR-026: OTel Direct Export      | `.forge/knowledge/adr/adr-026-otel-direct-tempo-export.md`         |
| ADR-027: prom-client Metrics     | `.forge/knowledge/adr/adr-027-prom-client-core-metrics.md`         |
| ADR-028: Promtail Log Ingestion  | `.forge/knowledge/adr/adr-028-log-ingestion-promtail-loki.md`      |
| ADR-029: recharts Charts         | `.forge/knowledge/adr/adr-029-chart-library-recharts.md`           |
| ADR-030: Plugin Metrics Contract | `.forge/knowledge/adr/adr-030-plugin-metrics-prometheus-format.md` |
| ADR-023: SSE Notifications       | `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md`      |
| Tasks                            | <!-- Created by /forge-tasks -->                                   |
