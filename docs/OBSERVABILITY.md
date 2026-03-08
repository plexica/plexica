# Plexica Observability Developer Guide

**Date**: March 2026  
**Status**: Active  
**Spec**: [Spec 012 — Plugin Observability](../.forge/specs/012-plugin-observability/spec.md)  
**Last Updated**: Sprint 009 completion

---

## Table of Contents

1. [Overview](#1-overview)
2. [Local Setup](#2-local-setup)
3. [Environment Variables](#3-environment-variables)
4. [Core API Metrics](#4-core-api-metrics)
5. [Distributed Tracing](#5-distributed-tracing)
6. [Plugin Metrics Contract](#6-plugin-metrics-contract)
7. [Grafana Access](#7-grafana-access)
8. [Troubleshooting](#8-troubleshooting)
9. [Security Notes](#9-security-notes)

---

## 1. Overview

Plexica uses a fully open-source observability stack based on the
[Grafana LGTM](https://grafana.com/oss/) suite. The stack provides:

- **Distributed Tracing** — end-to-end request traces via OpenTelemetry SDK
  exporting to Grafana Tempo (ADR-026)
- **Platform Metrics** — Prometheus-format metrics from the core API and all
  active plugins via `prom-client` (ADR-027)
- **Log Aggregation** — structured Pino JSON logs collected by Promtail and
  stored in Grafana Loki (ADR-028)
- **Dashboards** — pre-built Grafana dashboards for platform health and per-plugin
  metrics (ADR-029)
- **Alerts** — Prometheus alert rules with in-app delivery via Server-Sent Events
  (ADR-023)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Plexica Observability Stack                     │
│                                                                          │
│  ┌─────────────┐    OTLP/gRPC    ┌─────────────┐   HTTP API  ┌────────┐ │
│  │  core-api   │ ─────────────► │    Tempo    │ ──────────► │Grafana │ │
│  │  (OTel SDK) │                 │  (traces)   │             │        │ │
│  └──────┬──────┘                 └─────────────┘   HTTP API  │  UI &  │ │
│         │ GET /metrics           ┌─────────────┐ ──────────► │dashbrd │ │
│         │◄──────────────────────  │ Prometheus  │             │        │ │
│         │                        │  (metrics)  │   HTTP API  │        │ │
│  ┌──────┴──────┐  file SD targets └──────┬──────┘ ──────────► │        │ │
│  │   plugins   │ ────────────────►      │             ┌──────┤        │ │
│  │ GET /metrics│◄── scrape ─────────────┘             │ Loki │        │ │
│  └─────────────┘                                      │(logs)│        │ │
│                                                       └──────┴────────┘ │
│  ┌─────────────┐  container logs  ┌─────────────┐                       │
│  │   Docker    │ ────────────────► │   Promtail  │ ──► Loki              │
│  │  (stdout)   │                  └─────────────┘                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component  | Port | Role                                                                      |
| ---------- | ---- | ------------------------------------------------------------------------- |
| Prometheus | 9090 | Scrapes `/metrics` from core-api and all ACTIVE plugins; evaluates alerts |
| Grafana    | 3000 | Visualises metrics (Prometheus), traces (Tempo), logs (Loki)              |
| Tempo      | 3200 | Stores and queries distributed traces (OTLP/gRPC on port 4317)            |
| Loki       | 3100 | Stores and queries structured logs                                        |
| Promtail   | —    | Tails Docker container stdout/stderr and ships JSON logs to Loki          |

---

## 2. Local Setup

### Prerequisites

- Docker Desktop with Docker Compose v2
- The Plexica monorepo cloned and `pnpm install` run

### Start the observability stack

```bash
# Start just the observability services (Prometheus, Grafana, Tempo, Loki, Promtail)
docker compose --profile observability up -d prometheus grafana tempo loki promtail

# Or start the full platform including observability
docker compose --profile observability up -d
```

### Verify all services are healthy

| Service    | Health check URL                 | Expected response               |
| ---------- | -------------------------------- | ------------------------------- |
| Prometheus | http://localhost:9090/-/healthy  | `Prometheus Server is Healthy.` |
| Grafana    | http://localhost:3000/api/health | `{"database":"ok"}`             |
| Tempo      | http://localhost:3200/ready      | `ready`                         |
| Loki       | http://localhost:3100/ready      | `ready`                         |

```bash
# Quick health check for all four services
curl -sf http://localhost:9090/-/healthy && echo "Prometheus OK"
curl -sf http://localhost:3000/api/health | grep -q '"database":"ok"' && echo "Grafana OK"
curl -sf http://localhost:3200/ready && echo "Tempo OK"
curl -sf http://localhost:3100/ready && echo "Loki OK"
```

### Grafana login (development only)

- **URL**: http://localhost:3000
- **Username**: `admin`
- **Password**: `admin` (change on first login is optional in dev)

> **Production note**: Grafana is never exposed publicly. In production it is
> only accessible via an internal network or VPN-protected bastion (NFR-017,
> Art. 5.1). The default `admin/admin` credentials must be changed before
> any network-reachable deployment.

### Prometheus targets

- **All targets**: http://localhost:9090/targets
- Core API should show as `UP` immediately after `core-api` container starts.
- Plugin targets appear in `infrastructure/observability/prometheus/targets/plugins.json`
  (written by `PluginTargetsService` whenever a plugin becomes `ACTIVE`).

### Verify traces are flowing

```bash
# Check the core-api metrics endpoint
curl http://localhost:3001/metrics

# Trigger a traced request
curl -H "Authorization: Bearer <admin-token>" http://localhost:3001/api/v1/tenants

# Search for the trace in Tempo via Grafana Explore
# Select Tempo data source → TraceQL → `{}`
```

---

## 3. Environment Variables

All observability-related environment variables for `apps/core-api`. Set them
in `.env` (development) or the deployment environment (production).

| Variable                          | Default                  | Description                                                                                                                                                              |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OTEL_SERVICE_NAME`               | `plexica-core-api`       | Service name label attached to all traces and spans.                                                                                                                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT`     | `http://tempo:4317`      | OTLP/gRPC endpoint where the OTel SDK exports spans. In Docker Compose, the Tempo service name resolves to its container. In production, set to your Tempo ingress URL.  |
| `PROMETHEUS_URL`                  | `http://prometheus:9090` | Prometheus HTTP API base URL. Used by `ObservabilityService` to query metrics for the dashboard API.                                                                     |
| `LOKI_URL`                        | `http://loki:3100`       | Loki HTTP API base URL. Used by `ObservabilityService` to query structured logs for the dashboard API.                                                                   |
| `TEMPO_URL`                       | `http://tempo:3200`      | Tempo HTTP API base URL. Used by `ObservabilityService` to query traces for the dashboard API.                                                                           |
| `PROMETHEUS_BEARER_TOKEN`         | _(none)_                 | Bearer token Prometheus uses when scraping `GET /metrics` on the core API. Set to a long random string. Must match the token expected by the `/metrics` auth middleware. |
| `OBSERVABILITY_DASHBOARD_ENABLED` | `true`                   | Feature flag (Constitution Art. 9.1). Set to `false` to hide the Observability nav item and redirect `/observability` to the dashboard root in the Super Admin UI.       |
| `CONTAINER_PROXY_TIMEOUT_MS`      | `5000`                   | Maximum milliseconds to wait when proxying a plugin container's `/metrics` endpoint. Requests exceeding this threshold return 503 `PLUGIN_UNREACHABLE`.                  |

### Example `.env` snippet

```bash
# File: apps/core-api/.env

# Distributed tracing (ADR-026)
OTEL_SERVICE_NAME=plexica-core-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Observability backends (ADR-027, ADR-028)
PROMETHEUS_URL=http://localhost:9090
LOKI_URL=http://localhost:3100
TEMPO_URL=http://localhost:3200

# Prometheus scrape auth
PROMETHEUS_BEARER_TOKEN=change-me-in-production

# Feature flags
OBSERVABILITY_DASHBOARD_ENABLED=true
```

---

## 4. Core API Metrics

### MetricsService

The core API exposes metrics at `GET /metrics` (Prometheus text format). The
endpoint is authenticated: Prometheus supplies the `PROMETHEUS_BEARER_TOKEN`
in the `Authorization: Bearer <token>` header (see `prometheus.yml`).

Metrics are managed via `MetricsService` (ADR-027, ADR-027 §Plugin SDK):

```typescript
// File: apps/core-api/src/services/metrics.service.ts
import { metricsService } from './metrics.service.js';

// metricsService exposes:
//   .registry          — prom-client Registry
//   .httpRequestsTotal — Counter: request counts by method/path/status
//   .httpRequestDurationSeconds — Histogram: request latency
//   .getMetrics()      — async string: Prometheus text exposition format
//   .contentType       — string: 'text/plain; version=0.0.4; charset=utf-8'
```

### Adding a new metric

1. **Choose the right type** — see the decision guide below.
2. **Register with MetricsService** — add your metric to the `MetricsService`
   class, not as a standalone `new Counter(...)`.
3. **Name with the `plexica_` prefix** — for all custom platform metrics.
4. **Add a HELP string** — describe what the metric counts.

```typescript
// File: apps/core-api/src/services/metrics.service.ts
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Inside the MetricsService constructor (or getInstance factory):
const activeTenantsGauge = new Gauge({
  name: 'plexica_active_tenants',
  help: 'Number of tenants with ACTIVE status',
  registers: [this.registry],
});

// Update it in TenantService:
metricsService.activeTenantsGauge.set(count);
```

### Metric type decision guide

| Use case                                       | Type          | Example                               |
| ---------------------------------------------- | ------------- | ------------------------------------- |
| Something that always increases                | **Counter**   | `http_requests_total`, `errors_total` |
| Something that goes up and down                | **Gauge**     | `active_connections`, `queue_depth`   |
| Distribution of values (latency, payload size) | **Histogram** | `http_request_duration_seconds`       |
| Statistical distribution (fewer buckets)       | **Summary**   | Avoid — prefer Histogram in Plexica   |

### Histogram bucket selection

Use the standard SDK buckets from ADR-030 for any request latency histogram.
They are calibrated to the Constitution Art. 4.3 P95 < 200ms SLA:

```typescript
// File: apps/core-api/src/services/metrics.service.ts (reference)
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
// Units: seconds
// 0.005s = 5ms (fast DB query), 0.2s = 200ms (P95 SLA), 0.5s = 500ms (alert threshold)
```

For non-latency histograms (e.g., payload sizes in bytes), define custom
buckets appropriate to the expected distribution.

### Event-bus metrics

The `@plexica/event-bus` package maintains its own `Registry` with metrics
prefixed `plexica_events_`. These are automatically merged into the `/metrics`
response by the `MetricsService.getMetrics()` method, which calls
`Registry.merge([metricsRegistry, eventBusRegistry])`.

---

## 5. Distributed Tracing

### How it works

The core API initialises the OpenTelemetry SDK in `src/lib/telemetry.ts` on
startup. Every incoming HTTP request receives a trace context (trace ID + span
ID) via the `trace-context` middleware (`src/middleware/trace-context.ts`).

Trace context is automatically enriched into Pino log fields (`traceId`,
`spanId`) so that log entries and trace spans can be correlated in Grafana.

### Creating a manual span

Use `getTracer()` to instrument a specific code path:

```typescript
// File: apps/core-api/src/modules/tenant/tenant.service.ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('plexica-core-api');

async function provisionTenant(tenantId: string): Promise<void> {
  // Start a child span — it automatically becomes a child of the current
  // HTTP request span via AsyncLocalStorage context propagation.
  return tracer.startActiveSpan('tenant.provision', async (span) => {
    try {
      span.setAttribute('tenant.id', tenantId);
      span.setAttribute('tenant.operation', 'provision');

      await runDatabaseMigrations(tenantId);
      span.setAttribute('tenant.migration_status', 'complete');
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end(); // Always end the span
    }
  });
}
```

### Span attribute naming conventions

| Attribute key  | Value example         | Purpose                               |
| -------------- | --------------------- | ------------------------------------- |
| `tenant.id`    | `tenant-uuid-...`     | Multi-tenant isolation correlation    |
| `plugin.id`    | `crm-plugin-v2`       | Plugin-scoped traces                  |
| `db.operation` | `SELECT`, `INSERT`    | Database operation type               |
| `db.statement` | _omit in production_  | Never log raw SQL (Art. 5.2)          |
| `http.route`   | `/api/v1/tenants/:id` | Auto-set by OTel HTTP instrumentation |
| `error.type`   | `ValidationError`     | Error classification                  |

### What NOT to put in spans (Constitution Art. 5.2)

Span attributes are stored in Tempo and may appear in Grafana. The following
must **never** appear as span attribute values:

- Passwords, API keys, tokens, session IDs
- Email addresses, phone numbers, IP addresses (PII)
- Raw SQL query strings (risk of injecting user data)
- Credit card numbers or financial data

### Sampling configuration

- **Development**: 100% sampling (every request traced)
- **Production**: 10% head-based sampling (`OTEL_TRACES_SAMPLER_ARG=0.1`)

Override with the standard OTel environment variable:

```bash
OTEL_TRACES_SAMPLER_ARG=0.5  # 50% sampling
```

---

## 6. Plugin Metrics Contract

All Plexica plugins **MUST** expose `GET /metrics` returning Prometheus text
exposition format. This is a mandatory part of the plugin contract (ADR-030,
Constitution Art. 1.2 §4).

### Required endpoint

| Aspect         | Requirement                                        |
| -------------- | -------------------------------------------------- |
| Method         | `GET`                                              |
| Path           | `/metrics`                                         |
| Authentication | None (Docker internal network only)                |
| Content-Type   | `text/plain; version=0.0.4; charset=utf-8`         |
| Status codes   | `200` (success), `503` (metrics collection failed) |

### Required metrics

Plugins MUST expose at minimum:

| Metric                          | Type      | Labels                     | Description                 |
| ------------------------------- | --------- | -------------------------- | --------------------------- |
| `http_requests_total`           | Counter   | `method`, `path`, `status` | Total HTTP requests handled |
| `http_request_duration_seconds` | Histogram | `method`, `path`           | Request duration in seconds |

Plugins SHOULD also expose:

| Metric                          | Type    | Description              |
| ------------------------------- | ------- | ------------------------ |
| `process_cpu_seconds_total`     | Counter | CPU time consumed        |
| `process_resident_memory_bytes` | Gauge   | Resident memory in bytes |

Plugins MAY expose custom metrics with a naming prefix matching their plugin
ID (e.g., `crm_contacts_total`, `billing_invoices_generated_total`).

### Implementing with the Plexica Plugin SDK (TypeScript)

The `BasePlugin` class in `packages/plugin-sdk` auto-configures `/metrics`
with all required metrics and default Node.js process metrics:

```typescript
// File: packages/plugin-sdk/src/base-plugin.ts (conceptual usage)
import { BasePlugin } from '@plexica/plugin-sdk';

export class MyCrmPlugin extends BasePlugin {
  // /metrics is automatically registered — no extra code needed.

  // Optionally add custom metrics:
  private readonly contactsTotal = new this.Gauge({
    name: 'crm_contacts_total',
    help: 'Total number of CRM contacts',
    labelNames: ['tenant'],
  });

  async handleContactCreated(tenantId: string): Promise<void> {
    const count = await this.countContacts(tenantId);
    this.contactsTotal.set({ tenant: tenantId }, count);
  }
}
```

### Implementing without the SDK (any language)

Any language that has a Prometheus client library can satisfy the contract.
Example using `prom-client` directly in a standalone Node.js plugin:

```typescript
// File: my-plugin/src/metrics.ts
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import Fastify from 'fastify';

const registry = new Registry();

// Default Node.js metrics (process_cpu_seconds_total, process_resident_memory_bytes, etc.)
collectDefaultMetrics({ register: registry });

// Required: request counter
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
});

// Required: request duration histogram
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Expose /metrics
const app = Fastify();
app.get('/metrics', async (_req, reply) => {
  reply.type(registry.contentType).send(await registry.metrics());
});
```

### Sample limit

Prometheus enforces `sample_limit: 5000` per plugin scrape target. Plugins
producing more than 5000 samples will have excess samples silently dropped.
Avoid high-cardinality label combinations (e.g., per-user-ID labels).

### Accessing plugin metrics via the proxy

The core API proxies plugin metrics for Super Admin inspection:

```bash
# Requires Super Admin authentication
curl -H "Authorization: Bearer <super-admin-token>" \
  http://localhost:3001/api/v1/plugins/<plugin-id>/metrics
```

Returns the raw Prometheus text from the plugin container, or:

- `503 PLUGIN_NOT_ACTIVE` — plugin is not currently in `ACTIVE` lifecycle state
- `503 PLUGIN_UNREACHABLE` — plugin container did not respond within 5 seconds
- `404 PLUGIN_NOT_FOUND` — no plugin with this ID exists

---

## 7. Grafana Access

### Dashboard URLs (development)

| Dashboard       | URL                                     | UID               |
| --------------- | --------------------------------------- | ----------------- |
| Plugin Overview | http://localhost:3000/d/plugin-overview | `plugin-overview` |
| Core Platform   | http://localhost:3000/d/core-platform   | `core-platform`   |

Both dashboards auto-provision from
`infrastructure/observability/grafana/dashboards/` via the Grafana provisioning
config at `infrastructure/observability/grafana/provisioning/dashboards/dashboards.yml`.

### Plugin Overview dashboard

Panels:

- **Active Plugins** / **Down Plugins** — stat panels (green/red)
- **Total Request Rate** — req/s across all plugins
- **P95 Latency (all plugins)** — SLA indicator
- **Plugin Health Matrix** — table: one row per plugin, UP/DOWN colour badge
- **Request Rate by Plugin** — time series, `$plugin` variable filter
- **Error Rate by Plugin (5xx %)** — threshold line at 5% (alert boundary)
- **Latency Percentiles (P50/P95/P99)** — per plugin
- **Latency Distribution Heatmap** — request duration distribution over time
- **Top 10 Plugins by Error Rate** — instant table, sorted by worst first

### Core Platform dashboard

Panels:

- **Request Rate** / **Error Rate (5xx %)** / **P95 Latency** / **Heap Used** / **Active Connections** — stat row
- **Request Rate by Route** — time series breakdown
- **Error Rate (5xx %) — alert threshold at 1%** — includes a `vector(0.01)` threshold line
- **Latency Percentiles (P50 / P95 / P99)** — includes P95 SLA threshold at 200ms
- **Heap Usage** — heap total vs heap used over time
- **Event Loop Lag** — yellow >50ms, red >100ms
- **Active Connections** — connection count over time
- **Active Tenants** / **Job Queue Depth** — platform context stats

### Creating a custom dashboard

1. Open Grafana at http://localhost:3000
2. Navigate to **Dashboards → New → New Dashboard**
3. Add a panel, select the **Prometheus** data source
4. Use the PromQL queries from the existing dashboards as starting points
5. Save the dashboard to the **Plexica** folder

To make a custom dashboard permanent (survive container restarts), export the
JSON via **Dashboard → Share → Export → Save to file** and place it in
`infrastructure/observability/grafana/dashboards/`. It will be auto-provisioned
on next Grafana startup.

### Explore tab (ad-hoc queries)

- **Prometheus** — ad-hoc PromQL queries, useful for debugging alert conditions
- **Loki** — LogQL log search; filter by tenant: `{job="plexica"} | json | tenantId="<id>"`
- **Tempo** — TraceQL trace search; example: `{.http.route="/api/v1/tenants"}`

---

## 8. Troubleshooting

### Promtail is not collecting logs

**Symptoms**: Loki has no log entries; Grafana Explore → Loki shows no results.

**Check**:

1. Promtail container is running: `docker compose ps promtail`
2. Promtail config path: `infrastructure/observability/promtail/config.yml`
3. Docker socket is mounted: `docker exec plexica-promtail ls /var/run/docker.sock`
4. Container labels match the Promtail scrape config job selector

**Fix**: If Promtail loses the Docker socket, restart it:

```bash
docker compose restart promtail
```

### Tempo traces are missing

**Symptoms**: Grafana Explore → Tempo returns no results for recent requests.

**Check**:

1. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is reachable from `core-api` container:
   ```bash
   docker exec plexica-core-api curl -sf http://tempo:4317 || echo "unreachable"
   ```
2. Check OTel SDK startup logs in `core-api` for `sdk-node` initialisation messages.
3. Look at Tempo's ingester: http://localhost:3200/status

**Fix**: Restart core-api after ensuring Tempo is healthy:

```bash
docker compose restart core-api
```

### Prometheus targets are down

**Symptoms**: http://localhost:9090/targets shows `core-api` or a plugin as `DOWN`.

**For core-api**:

1. Verify `PROMETHEUS_BEARER_TOKEN` matches between `prometheus.yml` and `core-api/.env`.
2. Check that `core-api` port 3001 is reachable from Prometheus container:
   ```bash
   docker exec plexica-prometheus wget -qO- --header="Authorization: Bearer $TOKEN" http://core-api:3001/metrics | head -5
   ```

**For a plugin target**:

1. Verify the plugin is in `ACTIVE` lifecycle state (not just `INSTALLED`).
2. Check `infrastructure/observability/prometheus/targets/plugins.json` — the plugin
   must appear here (written by `PluginTargetsService` on plugin activation).
3. Verify the plugin container is running and `/metrics` responds:
   ```bash
   docker exec plexica-core-api curl http://plugin-<id>:8080/metrics | head -5
   ```

### GET /metrics returns 403

**Symptoms**: `curl http://localhost:3001/metrics` returns 403 Forbidden.

**Cause**: `PROMETHEUS_BEARER_TOKEN` mismatch or missing `Authorization` header.

**Fix**:

```bash
# Use the bearer token
curl -H "Authorization: Bearer $PROMETHEUS_BEARER_TOKEN" http://localhost:3001/metrics
```

The `/metrics` endpoint is **Super Admin only** — it requires the Prometheus
bearer token, not a regular user JWT.

### Plugin metrics proxy returns 503 PLUGIN_UNREACHABLE

**Symptoms**: `GET /api/v1/plugins/<id>/metrics` returns `503 PLUGIN_UNREACHABLE`.

**Check**:

1. Plugin lifecycle status is `ACTIVE` (not `DISABLED` or `INSTALLING`).
2. Plugin container is running and its `/metrics` endpoint responds within
   `CONTAINER_PROXY_TIMEOUT_MS` (default 5000ms).
3. Core API can reach the plugin on the Docker internal network:
   ```bash
   docker exec plexica-core-api curl http://plugin-<id>:8080/metrics
   ```

### Dashboard shows "No data" panels

**Cause**: The Prometheus data source may not be provisioned yet, or no metrics
have been emitted yet (e.g., no requests have been made since startup).

**Fix**:

1. Verify Prometheus data source in Grafana: **Administration → Data Sources → Prometheus**.
2. Make some requests to generate metric samples.
3. Set the Grafana time range to the last 15 minutes.

---

## 9. Security Notes

### Grafana is not publicly accessible

Grafana binds to `localhost:3000` in Docker Compose. It is not exposed on any
public interface. In production, access is restricted to internal networks or
a VPN-protected bastion host (NFR-017, Constitution Art. 5.1).

The default `admin/admin` credentials **must be changed** before any
network-accessible deployment.

### No PII in metrics, traces, or logs

Constitution Art. 5.2 prohibits PII in logs. The same rule applies to all
observability signals:

- **Metrics**: use tenant IDs (UUIDs), never email addresses or names
- **Traces**: do not add user PII as span attributes (see §5 above)
- **Logs**: Pino's `redact` config removes `password`, `token`, `authorization`,
  and `cookie` fields — do not log raw request/response bodies

### Super Admin authentication on all observability endpoints

All observability API endpoints (`/api/v1/observability/*`) require:

1. A valid Keycloak JWT (`authMiddleware`)
2. The `super_admin` realm role (`requireSuperAdmin`)

This is enforced at the route level in `apps/core-api/src/routes/observability-v1.ts`.

The plugin metrics proxy (`GET /api/v1/plugins/:id/metrics`) carries the same
guards. Plugin `/metrics` endpoints are only reachable on the Docker internal
network — they are never exposed to the public internet.

### Prometheus scrape authentication

Prometheus authenticates to the core API `/metrics` endpoint using a bearer
token (`PROMETHEUS_BEARER_TOKEN`). Use a cryptographically random value of at
least 32 characters. Rotate it by updating both `prometheus.yml` and the
`core-api` environment variables, then restarting both services.

```bash
# Generate a secure token
openssl rand -hex 32
```

---

_For architectural decisions behind this stack, see:_

- _[ADR-026](../.forge/knowledge/adr/adr-026-otel-direct-tempo-export.md) — OTel SDK + direct Tempo export_
- _[ADR-027](../.forge/knowledge/adr/adr-027-prom-client-core-metrics.md) — prom-client for core metrics_
- _[ADR-028](../.forge/knowledge/adr/adr-028-log-ingestion-promtail-loki.md) — Promtail → Loki log ingestion_
- _[ADR-029](../.forge/knowledge/adr/adr-029-chart-library-recharts.md) — recharts for dashboards_
- _[ADR-030](../.forge/knowledge/adr/adr-030-plugin-metrics-prometheus-format.md) — Plugin metrics Prometheus contract_
