# Tasks: 012 - Plugin Observability

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                           |
| ------ | ----------------------------------------------- |
| Status | Pending                                         |
| Author | forge-scrum                                     |
| Date   | 2026-03-07                                      |
| Spec   | `.forge/specs/012-plugin-observability/spec.md` |
| Plan   | `.forge/specs/012-plugin-observability/plan.md` |

---

## Legend

- `[FR-NNN]` — Requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped
- **Path**: Explicit file path relative to project root

---

## Phase 1: Infrastructure & Core Metrics

> **Objective**: Stand up the five observability infrastructure services and
> expose the core API `/metrics` endpoint. No application code depends on
> Phase 2–5 completing; Phase 1 work is fully self-contained and can be
> validated in isolation by running `docker compose up prometheus tempo loki
promtail grafana` and checking health endpoints.

---

- [ ] **T012-01** `[NFR-017]` `[NFR-020]` `[NFR-021]` `[NFR-022]`
      Add five observability services to `docker-compose.yml`
  - **File**: `docker-compose.yml`
  - **Type**: Modify existing
  - **Location**: After the `minio` service block (~line 251)
  - **Description**: Add `prometheus` (image `prom/prometheus:v3.3`, port `9090`,
    memory limit `512m`, bind-mount `./infrastructure/observability/prometheus:/etc/prometheus`
    and a named volume `prometheus_data:/prometheus`, health-check `GET /healthy`),
    `tempo` (image `grafana/tempo:2.7`, port `4317` gRPC + `3200` HTTP, memory
    limit `256m`, bind-mount `./infrastructure/observability/tempo:/etc/tempo`,
    named volume `tempo_data:/var/tempo`, health-check `GET :3200/ready`),
    `loki` (image `grafana/loki:3.4`, port `3100`, memory limit `256m`, bind-mount
    `./infrastructure/observability/loki:/etc/loki`, named volume
    `loki_data:/loki`, health-check `GET :3100/ready`),
    `promtail` (image `grafana/promtail:3.4`, memory limit `128m`, bind-mounts
    `./infrastructure/observability/promtail:/etc/promtail`,
    `/var/lib/docker/containers:/var/lib/docker/containers:ro`,
    `/var/run/docker.sock:/var/run/docker.sock:ro`, depends-on `loki`),
    `grafana` (image `grafana/grafana:11.6`, port `3000` exposed on
    `127.0.0.1:3000` only per NFR-017, memory limit `256m`, bind-mount
    `./infrastructure/observability/grafana:/etc/grafana/provisioning`,
    named volume `grafana_data:/var/lib/grafana`, depends-on `prometheus tempo loki`).
    Declare all five named volumes in the top-level `volumes:` block.
  - **Spec Reference**: Spec §7.1 (infrastructure), plan.md §7 Phase 1 T012-01
  - **Dependencies**: None
  - **Estimated**: 4h

- [ ] **T012-02** `[FR-008]` `[NFR-004]` `[NFR-005]` `[NFR-010]`
      Create Prometheus configuration and Prometheus targets directory
  - **File**: `infrastructure/observability/prometheus/prometheus.yml` _(create)_
  - **Type**: Create new file
  - **Description**: Configure Prometheus with `global.scrape_interval: 15s` and
    `evaluation_interval: 15s`. Add two scrape jobs: `core-api` with static target
    `core-api:3001` (path `/metrics`, bearer token auth via
    `authorization: { credentials: "<super_admin_token>" }` scrape config) and `plugins` with
    `file_sd_configs: [{files: ["/etc/prometheus/targets/plugins.json"],
refresh_interval: "30s"}]` and `sample_limit: 5000` per target. Configure
    `rule_files: ["rules/*.yml"]`. Set `storage.tsdb.retention.time: 15d` (NFR-010).
    Also create the directory `infrastructure/observability/prometheus/targets/` with
    a `.gitkeep` so the Docker volume mount path exists.
  - **Spec Reference**: Spec §7.2 (service discovery), plan.md §7 Phase 1 T012-02
  - **Dependencies**: T012-01
  - **Estimated**: 3h

- [ ] **T012-03** `[FR-015]` `[NFR-011]`
      Create Tempo configuration
  - **File**: `infrastructure/observability/tempo/tempo.yml` _(create)_
  - **Type**: Create new file
  - **Description**: Configure Grafana Tempo with OTLP/gRPC receiver on `:4317`
    and OTLP/HTTP receiver on `:4318`. Set `storage.trace.backend: local` with
    `path: /var/tempo/blocks`. Set `compactor.compaction.block_retention: 168h`
    (7 days, NFR-011). Enable `query_frontend.search.default_result_limit: 20`.
    Configure `server.http_listen_port: 3200`.
  - **Spec Reference**: Spec §7.3, plan.md §7 Phase 1 T012-03
  - **Dependencies**: T012-01
  - **Estimated**: 1h

- [ ] **T012-04** `[FR-016]` `[NFR-012]`
      Create Loki configuration
  - **File**: `infrastructure/observability/loki/loki.yml` _(create)_
  - **Type**: Create new file
  - **Description**: Configure Grafana Loki in `single-process` mode with filesystem
    storage (`/loki/chunks`, `/loki/boltdb-shipper`, `/loki/wal`). Set
    `ingester.chunk_idle_period: 1m`, `ingester.max_chunk_age: 1h`.
    Set `compactor.retention_enabled: true` and `limits_config.retention_period: 168h`
    (7 days, NFR-012). Set `server.http_listen_port: 3100`. Configure
    `schema_config` with `boltdb-shipper` index.
  - **Spec Reference**: Spec §7.3, plan.md §7 Phase 1 T012-04
  - **Dependencies**: T012-01
  - **Estimated**: 1h

- [ ] **T012-05** `[FR-017]` `[NFR-007]`
      Create Promtail configuration for Docker log scraping
  - **File**: `infrastructure/observability/promtail/promtail.yml` _(create)_
  - **Type**: Create new file
  - **Description**: Configure Promtail with `server.http_listen_port: 9080`.
    Set `clients: [{url: "http://loki:3100/loki/api/v1/push"}]`.
    Use `scrape_configs` with `docker_sd_configs: [{host: "unix:///var/run/docker.sock",
refresh_interval: "5s"}]` for automatic container discovery (ADR-028).
    Add pipeline stages: (1) `json` stage to extract `level`, `msg`, `tenantId`,
    `traceId`, `spanId`, `pluginId` from Pino JSON log lines; (2) `labels` stage
    to promote `level`, `tenantId`, `pluginId` as Loki stream labels; (3) `output`
    stage to set the log line to `msg`. Add `relabeling_configs` to set
    `container_name` from Docker metadata. Requires read-only Docker socket mount
    (`/var/run/docker.sock:ro`).
  - **Spec Reference**: Spec §7.3, ADR-028, plan.md §7 Phase 1 T012-05
  - **Dependencies**: T012-01, T012-04
  - **Estimated**: 2h

- [ ] **T012-06** `[FR-033]` `[P]`
      Create Grafana provisioning configuration (data sources + dashboard provider)
  - **Files**:
    - `infrastructure/observability/grafana/provisioning/datasources/datasources.yml` _(create)_
    - `infrastructure/observability/grafana/provisioning/dashboards/dashboards.yml` _(create)_
  - **Type**: Create new files
  - **Description**: In `datasources.yml`, provision three data sources:
    `Prometheus` (type `prometheus`, url `http://prometheus:9090`, default: true),
    `Tempo` (type `tempo`, url `http://tempo:3200`, trace-to-logs link via Loki),
    `Loki` (type `loki`, url `http://loki:3100`). Set `editable: false` and
    `version: 1`. In `dashboards.yml`, configure a dashboard provider pointing at
    `/etc/grafana/provisioning/dashboards` with `disableDeletion: true` and
    `updateIntervalSeconds: 30`. Create the directory
    `infrastructure/observability/grafana/dashboards/` for Phase 5 JSON files.
  - **Spec Reference**: Spec §7.4, plan.md §7 Phase 1 T012-06
  - **Dependencies**: T012-01
  - **Estimated**: 1.5h

- [ ] **T012-07** `[FR-006]` `[FR-007]` `[NFR-002]` `[P]`
      Create `MetricsService` with prom-client registry and Fastify hooks
  - **File**: `apps/core-api/src/services/metrics.service.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Create `MetricsService` class with a dedicated `Registry`
    instance (not the global default registry, per ADR-027). Call
    `collectDefaultMetrics({ register: this.registry })` to collect Node.js
    process metrics. Register three metrics on this registry:
    `http_requests_total` counter (labels: `method`, `route`, `status_code`),
    `http_request_duration_seconds` histogram (labels: `method`, `route`,
    buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]` per ADR-027 —
    aligned with the Art. 4.3 P95 < 200ms SLA), and `active_plugins_total` gauge.
    Implement `recordRequest(method, route, statusCode, durationS)` incrementing
    the counter and observing the histogram. Implement `setActivePluginsCount(n)`.
    Implement `getMetrics()` returning `Registry.merge([this.registry,
eventMetrics.getRegistry()]).metrics()` for merged Prometheus text output.
    Implement `getContentType()` returning
    `"text/plain; version=0.0.4; charset=utf-8"`. Export Fastify `onRequest` /
    `onResponse` hooks that call `recordRequest()`. Export a singleton instance.
  - **Spec Reference**: Spec §6.1 (metrics), ADR-027, plan.md §4.3
  - **Dependencies**: None
  - **Estimated**: 4h

- [ ] **T012-08** `[FR-006]` `[NFR-002]`
      Extend `/metrics` endpoint to serve merged Prometheus text with auth
  - **File**: `apps/core-api/src/routes/metrics.ts`
  - **Type**: Modify existing
  - **Location**: Lines 11–48 (full file replacement)
  - **Description**: Rewrite `metrics.ts` to import the `MetricsService` singleton
    and serve `GET /metrics` using `metricsService.getMetrics()` with
    `Content-Type: metricsService.getContentType()`. Add `preHandler:
[authMiddleware, requireSuperAdmin]` — authentication is **always required**
    (Art. 5.1; no env var toggle). Prometheus authenticates via Bearer token
    configured in `prometheus.yml` `authorization.credentials`. Remove the old
    event-bus-only implementation. The route must respond in < 100ms P95 (NFR-002)
    — the in-process registry scrape has negligible overhead. Register this route
    at the **root** path `/metrics` (not `/api/metrics`), matching Prometheus
    scrape config in T012-02.
  - **Spec Reference**: Spec §3.2 (plan.md), ADR-027, plan.md §7 Phase 1 T012-08
  - **Dependencies**: T012-07
  - **Estimated**: 2h

- [ ] **T012-09** `[FR-009]` `[P]`
      Create `PluginTargetsService` for Prometheus file-based service discovery
  - **File**: `apps/core-api/src/services/plugin-targets.service.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Create `PluginTargetsService` class. Implement
    `refreshTargets()`: query `@plexica/database` for all plugins where
    `lifecycleStatus = ACTIVE`, map each to
    `{ targets: ["<containerHost>:<metricsPort>"], labels: { plugin: id,
plugin_version: version, __metrics_path__: "/metrics" } }`, write the resulting
    JSON array to a `.tmp` file at `getTargetsFilePath() + ".tmp"`, then atomically
    rename to `getTargetsFilePath()` using `fs/promises.rename()` (atomic on POSIX —
    prevents Prometheus reading a partial file). Implement `getTargetsFilePath()`
    returning `process.env.PROMETHEUS_TARGETS_PATH ??
"/etc/prometheus/targets/plugins.json"`. If no ACTIVE plugins exist, write an
    empty array `[]` (valid Prometheus file_sd format). Export singleton instance.
  - **Spec Reference**: Spec §7.2, plan.md §4.4, plan.md §7 Phase 1 T012-09
  - **Dependencies**: None
  - **Estimated**: 3h

- [ ] **T012-10** `[FR-010]`
      Wire `PluginTargetsService` into `plugin.service.ts` lifecycle hooks
  - **File**: `apps/core-api/src/services/plugin.service.ts`
  - **Type**: Modify existing
  - **Location**: Line 894 (`activatePlugin`) and line 1004 (`deactivatePlugin`)
  - **Description**: Import `pluginTargetsService` singleton and call
    `await pluginTargetsService.refreshTargets()` at the end of both
    `activatePlugin()` (line ~894, after setting lifecycle status to ACTIVE) and
    `deactivatePlugin()` (line ~1004, after setting lifecycle status to
    DISABLED/UNINSTALLED). Use fire-and-forget with error logging if `refreshTargets`
    throws — a failed targets refresh must not block the lifecycle transition
    (fail-open per ADR-026 philosophy). Log a `warn` entry if `refreshTargets`
    fails, including the plugin ID and error message.
  - **Spec Reference**: Spec §7.2, plan.md §7 Phase 1 T012-10
  - **Dependencies**: T012-09
  - **Estimated**: 1h

- [ ] **T012-11** `[FR-020]` `[FR-021]`
      Create Prometheus alert rules for plugins and core platform
  - **File**: `infrastructure/observability/prometheus/rules/plugin-alerts.yml` _(create)_
  - **Type**: Create new file
  - **Description**: Define six alert rules in a `groups: [{name: "plugin_alerts",
rules: [...]}]` structure:
    (1) `PluginHighErrorRate` — `rate(http_requests_total{status_code=~"5.."}[5m]) /
rate(http_requests_total[5m]) > 0.05`, `for: 5m`, severity `warning`.
    (2) `PluginHighLatency` — `histogram_quantile(0.95,
rate(http_request_duration_seconds_bucket[5m])) > 0.5`, `for: 5m`,
    severity `warning`.
    (3) `PluginHealthCheckFailing` — alert when the plugin health endpoint
    returns non-2xx for > 2m, severity `warning`.
    (4) `PluginDown` — `up{job="plugins"} == 0`, `for: 1m`, severity `critical`.
    (5) `PluginHighMemory` — `process_resident_memory_bytes > 512*1024*1024`,
    `for: 10m`, severity `warning`.
    (6) `CoreHighErrorRate` — same error rate formula filtered to `job="core-api"`,
    threshold 1%, `for: 5m`, severity `critical` (FR-021).
    Each rule must include `annotations.description` with a human-readable message
    and `labels.plugin_id: "{{ $labels.plugin }}"` for routing.
  - **Spec Reference**: Spec §6.4 (alerting), plan.md §7 Phase 1 T012-11
  - **Dependencies**: T012-02
  - **Estimated**: 2h

---

**Phase 1 Total**: 11 tasks · 33 story points · ~25h

---

## Phase 2: Distributed Tracing

> **Objective**: Instrument the core API with OpenTelemetry SDK, propagate W3C
> `traceparent` headers to plugin containers, and enrich Pino logs with
> `traceId`/`spanId`. **Critical ordering constraint**: `telemetry.ts` must be
> imported and `initTelemetry()` called **before** Fastify is instantiated in
> `index.ts` so the OTel `http` module monkey-patch takes effect.

---

- [ ] **T012-12** `[FR-011]` `[FR-012]` `[NFR-006]` `[NFR-008]` `[NFR-009]` `[NFR-013]` `[NFR-014]` `[P]`
      Create `telemetry.ts` — OpenTelemetry SDK initialisation
  - **File**: `apps/core-api/src/lib/telemetry.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Import `NodeSDK` from `@opentelemetry/sdk-node`,
    `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-grpc`,
    `HttpInstrumentation` from `@opentelemetry/instrumentation-http`,
    `FastifyInstrumentation` from `@opentelemetry/instrumentation-fastify`,
    `Resource` from `@opentelemetry/resources`,
    `SEMRESATTRS_SERVICE_NAME`, `SEMRESATTRS_SERVICE_VERSION` from
    `@opentelemetry/semantic-conventions`, and `trace` from `@opentelemetry/api`.
    Export `initTelemetry()`: construct `Resource` with `service.name =
process.env.OTEL_SERVICE_NAME ?? "core-api"` and `service.version` from
    `package.json`. Instantiate `OTLPTraceExporter` with `url:
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://tempo:4317"`. Use
    `BatchSpanProcessor` with `maxQueueSize: 2048` and `scheduledDelayMillis: 5000`
    (NFR-006). Configure `TraceIdRatioBasedSampler` with ratio
    `parseFloat(process.env.OTEL_TRACE_SAMPLE_RATE ?? "1.0")` (NFR-008/009).
    Set `BatchSpanProcessor` to **drop** spans when the queue is full (fail-open
    per NFR-013/014 — observability must never block the application).
    Start the SDK synchronously. Export `getTracer(name?: string): Tracer` helper.
    Export `shutdown(): Promise<void>` that calls `sdk.shutdown()`.
  - **Spec Reference**: Spec §6.2 (tracing), ADR-026, plan.md §4.1
  - **Dependencies**: None (install T012-17 first)
  - **Estimated**: 5h

- [ ] **T012-13** `[FR-019]` `[P]`
      Create `trace-context.ts` — Fastify middleware for Pino log enrichment
  - **File**: `apps/core-api/src/middleware/trace-context.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Export a Fastify `preHandler` hook `traceContextMiddleware`.
    On each request, extract the active OTel span with
    `trace.getSpan(context.active())`. If a span exists, create a Pino child
    logger on `request.log` with `{ traceId: span.spanContext().traceId,
spanId: span.spanContext().spanId }`. If no active span (e.g., during testing
    with OTel disabled), pass through without modification — must not throw.
    Also set `span.setAttribute("tenant.id", request.tenantId ?? "unknown")` and
    `span.setAttribute("plugin.id", request.params?.id ?? "none")` for trace
    enrichment. Import `context`, `trace` from `@opentelemetry/api`.
  - **Spec Reference**: Spec §6.2 (log correlation), plan.md §4.2
  - **Dependencies**: T012-12
  - **Estimated**: 2h

- [ ] **T012-14** `[FR-019]` `[P]`
      Update `logger.ts` — add OTel trace context Pino mixin
  - **File**: `apps/core-api/src/lib/logger.ts`
  - **Type**: Modify existing
  - **Location**: Pino logger options (mixin field)
  - **Description**: Add a `mixin()` function to the Pino logger configuration
    that calls `trace.getSpan(context.active())` on each log invocation. If an
    active span exists, return `{ traceId: span.spanContext().traceId, spanId:
span.spanContext().spanId }` merged into every log record. If no active span,
    return `{}`. This ensures all Pino log lines (not just those in request
    handlers) automatically include the current OTel trace context. Import
    `context`, `trace` from `@opentelemetry/api`. This satisfies Constitution
    Art. 6.3 requirement for `traceId` in all log entries.
  - **Spec Reference**: Spec §6.3, plan.md §7 Phase 2 T012-14
  - **Dependencies**: T012-12
  - **Estimated**: 1h

- [ ] **T012-15** `[FR-013]` `[P]`
      Replace `X-Trace-ID: crypto.randomUUID()` with W3C `traceparent` in `plugin-hook.service.ts`
  - **File**: `apps/core-api/src/modules/plugin/plugin-hook.service.ts`
  - **Type**: Modify existing
  - **Location**: Line 368 (header construction in plugin HTTP call)
  - **Description**: Remove `'X-Trace-ID': crypto.randomUUID()`. Replace with
    W3C `traceparent` header using OTel context propagation:
    instantiate a `W3CTraceContextPropagator` from `@opentelemetry/core`,
    call `propagator.inject(context.active(), headers, defaultTextMapSetter)`
    to inject the `traceparent` (and optionally `tracestate`) header into the
    outgoing plugin request headers object. This ensures plugin containers
    receive the correct distributed trace context and can participate in the
    same trace as the core API request (FR-013). If no active span exists, the
    propagator injects nothing — safe fallback.
  - **Spec Reference**: Spec §6.2, plan.md §7 Phase 2 T012-15
  - **Dependencies**: T012-12
  - **Estimated**: 1h

- [ ] **T012-16** `[FR-011]` `[NFR-006]`
      Wire telemetry into `index.ts` — startup, middleware, shutdown
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Location**: Lines 18–19 (imports), `start()` function, `registerMiddleware()`
  - **Description**: Add `import './lib/telemetry.js'` as the **very first import**
    in `index.ts` (before all other imports including Fastify) so OTel
    monkey-patches the `http` module before Fastify loads. Call `initTelemetry()`
    at the top of `start()` before `const app = Fastify(...)`. Register
    `traceContextMiddleware` as a global `addHook('preHandler', ...)` after auth
    middleware. In the graceful shutdown handler (SIGTERM/SIGINT block), add
    `await telemetry.shutdown()` **before** closing the Fastify server to flush
    pending spans. Also uncomment the existing `/metrics` route registration at
    line 220 (or add the import if it was removed). Register the
    MetricsService Fastify hooks (`onRequest`, `onResponse`) globally.
  - **Spec Reference**: ADR-026, plan.md §7 Phase 2 T012-16
  - **Dependencies**: T012-12, T012-13
  - **Estimated**: 1h

- [ ] **T012-17** `[NFR-006]`
      Install `@opentelemetry/*` packages in `apps/core-api/package.json`
  - **File**: `apps/core-api/package.json`
  - **Type**: Modify existing
  - **Location**: `dependencies` section
  - **Description**: Add the seven OTel packages approved by ADR-026 to the
    `dependencies` block: `"@opentelemetry/sdk-node": "^0.57"`,
    `"@opentelemetry/exporter-trace-otlp-grpc": "^0.57"`,
    `"@opentelemetry/instrumentation-http": "^0.57"`,
    `"@opentelemetry/instrumentation-fastify": "^0.43"`,
    `"@opentelemetry/resources": "^1.30"`,
    `"@opentelemetry/semantic-conventions": "^1.30"`,
    `"@opentelemetry/api": "^1.9"`.
    Also add `"prom-client": "^15.1.3"` (ADR-027). Run `pnpm install` at the
    monorepo root to update `pnpm-lock.yaml`. Verify that `pnpm` deduplicates
    `prom-client` with the existing copy in `packages/event-bus`.
  - **Spec Reference**: ADR-026, ADR-027, plan.md §6.1
  - **Dependencies**: None
  - **Estimated**: 15m

---

**Phase 2 Total**: 6 tasks · 15 story points · ~10h

---

## Phase 3: API Endpoints — Metrics Proxy & Observability

> **Objective**: Implement all nine backend observability API endpoints.
> Phases 1 and 2 must be complete before starting Phase 3 (services and OTel
> SDK are required). T012-19 (Zod schemas) can be started in parallel with
> T012-18 (plugin metrics proxy).

---

- [ ] **T012-18** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]`
      Plugin metrics proxy: `GET /api/v1/plugins/:id/metrics` — resolves TD-009
  - **File**: `apps/core-api/src/routes/plugin-v1.ts`
  - **Type**: Modify existing
  - **Location**: After the stats route (line ~474), before the remotes route
  - **Description**: Add `GET /plugins/:id/metrics` endpoint following the exact
    same pattern as the existing `GET /plugins/:id/health` proxy. Apply
    `preHandler: [authMiddleware, requireSuperAdmin]` (FR-002, NFR-015).
    Look up the plugin by ID; return `404 PLUGIN_NOT_FOUND` if not found (FR-005).
    Check `plugin.lifecycleStatus === 'ACTIVE'`; return
    `503 PLUGIN_NOT_ACTIVE` if not (FR-003).
    Fetch `http://<containerHost>:<metricsPort>/metrics` with a 5-second timeout
    using the existing `ContainerAdapter` pattern (FR-004); return
    `503 PLUGIN_UNREACHABLE` on timeout or connection error.
    Return `503 PLUGIN_METRICS_UNAVAILABLE` if the container responds with
    non-2xx on `/metrics`. On success, pipe the response body as-is with
    `Content-Type: text/plain; version=0.0.4; charset=utf-8` (ADR-030).
    All error responses use the `{ error: { code, message, details? } }` format
    (Art. 6.2). This resolves TD-009 tracked in the decision log.
  - **Spec Reference**: Spec §3.1, ADR-030, plan.md §3.1
  - **Dependencies**: T012-07
  - **Estimated**: 3h

- [ ] **T012-19** `[FR-036]` `[FR-037]` `[P]`
      Create Zod schemas for all observability query parameters
  - **File**: `apps/core-api/src/schemas/observability.schema.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Define and export Zod schemas for each observability
    endpoint's query parameters. `HealthSummaryQuerySchema` (no params, placeholder
    for future filtering). `PluginMetricsQuerySchema`: `query` (string, required,
    validated against an **allowlist** of permitted metric name prefixes:
    `http_requests_total`, `http_request_duration_seconds`, `process_*`,
    `nodejs_*`, `plugin_*` — rejects arbitrary PromQL to prevent injection per
    spec edge case #14 and Art. 5.3), `start` (RFC3339 datetime string),
    `end` (RFC3339 datetime string, must be after `start`, range ≤ 30 days),
    `step` (duration string regex `^\d+[smhd]$`). `AlertsQuerySchema`: `severity`
    (optional enum `["critical", "warning"]`). `AlertHistoryQuerySchema`:
    `page` (int ≥ 1, default 1), `per_page` (int 1–100, default 20).
    `TracesQuerySchema`: `service` (optional string), `traceId` (optional string),
    `start`, `end`, `limit` (int 1–100, default 20). `TraceDetailParamSchema`:
    `traceId` (string, required). `PluginLogsQuerySchema`: `start`, `end`,
    `query` (optional LogQL filter string, validated to prevent injection — must
    start with `|= ` or `|~ ` or `!= ` prefixes only), `limit` (int 1–1000,
    default 100). Export TypeScript types inferred from each schema.
  - **Spec Reference**: Spec §5.3 (validation), Art. 5.3, plan.md §7 Phase 3 T012-19
  - **Dependencies**: None
  - **Estimated**: 2h

- [ ] **T012-20** `[FR-026]`
      Implement `ObservabilityService.getHealthSummary()`
  - **File**: `apps/core-api/src/services/observability.service.ts` _(create, section 1 of 5)_
  - **Type**: Create new file (initial skeleton + this method)
  - **Description**: Create the `ObservabilityService` class skeleton: constructor
    reads `PROMETHEUS_URL`, `TEMPO_URL`, `LOKI_URL` from env with defaults.
    Implement `getHealthSummary(): Promise<HealthEntry[]>`: query Prometheus
    instant API (`GET /api/v1/query`) with three PromQL expressions:
    `rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])`
    for error rate, `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
    for P95 latency, and `avg_over_time(up[24h])` for uptime. Correlate results
    by `plugin` label against the plugin registry. Map each active plugin to
    `HealthEntry { pluginId, pluginName, status: "healthy"|"degraded"|"unhealthy",
p95LatencyMs, errorRatePercent, uptimePercent24h, lastHealthCheck }`. Status
    thresholds: `healthy` if error rate < 1% and P95 < 200ms; `degraded` if
    error rate < 5% or P95 < 500ms; `unhealthy` otherwise. On Prometheus
    unreachable, throw `ObservabilityBackendError` (code
    `OBSERVABILITY_BACKEND_UNAVAILABLE`) which routes to 502.
  - **Spec Reference**: Spec §3.3 (plan.md), plan.md §4.5
  - **Dependencies**: T012-02
  - **Estimated**: 4h

- [ ] **T012-21** `[FR-028]` `[P]`
      Implement `ObservabilityService.queryPluginMetrics()`
  - **File**: `apps/core-api/src/services/observability.service.ts`
  - **Type**: Modify existing (add method)
  - **Description**: Implement `queryPluginMetrics(pluginId, query, start, end,
step): Promise<PromQueryResult>`. Validate `query` against the metric name
    allowlist from T012-19 (throw `InvalidQueryError` on rejection — routes to
    400 `INVALID_QUERY`). Automatically inject `{plugin="<pluginId>"}` label
    selector into the PromQL expression to scope the query to the target plugin
    (prevents cross-plugin data leakage). Validate `start < end` and that the
    range is ≤ 30 days (throw `InvalidTimeRangeError` — 400 `INVALID_TIME_RANGE`).
    Call Prometheus range query API:
    `GET /api/v1/query_range?query=...&start=...&end=...&step=...`. Return the
    `data` field verbatim as `PromQueryResult`. On Prometheus unreachable, throw
    `ObservabilityBackendError`.
  - **Spec Reference**: Spec §3.4 (plan.md), plan.md §4.5
  - **Dependencies**: T012-02
  - **Estimated**: 3h

- [ ] **T012-22** `[FR-022]` `[FR-023]` `[P]`
      Implement `ObservabilityService.getActiveAlerts()` and `getAlertHistory()`
  - **File**: `apps/core-api/src/services/observability.service.ts`
  - **Type**: Modify existing (add two methods)
  - **Description**: Implement `getActiveAlerts(severity?: string): Promise<Alert[]>`:
    query `GET /api/v1/alerts` on Prometheus, filter to `state: "firing"`,
    optionally filter by `labels.severity` if provided. Map to
    `Alert { alertName, severity, pluginId, description, state, activeAt, value }`.
    Implement `getAlertHistory(page, perPage): Promise<PaginatedAlerts>`: query
    Prometheus alerts with `state: "inactive"` (resolved), filter to those resolved
    within the last 7 days, sort by `firedAt` desc, apply pagination (`skip =
(page-1) * perPage`, `limit = perPage`). Return
    `{ data: Alert[], pagination: { page, per_page, total, total_pages } }`.
    On Prometheus unreachable, throw `ObservabilityBackendError`.
  - **Spec Reference**: Spec §3.5, §3.6 (plan.md), plan.md §4.5
  - **Dependencies**: T012-11
  - **Estimated**: 2h

- [ ] **T012-23** `[FR-030]` `[FR-031]` `[P]`
      Implement `ObservabilityService.searchTraces()` and `getTrace()`
  - **File**: `apps/core-api/src/services/observability.service.ts`
  - **Type**: Modify existing (add two methods)
  - **Description**: Implement `searchTraces(service?, traceId?, start, end, limit):
Promise<PaginatedTraces>`: call Tempo HTTP search API `GET /api/search?...`.
    Build query params: `tags=service.name=<service>` if provided,
    `minDuration=0`, `limit`, RFC3339 start/end. Validate time range (throw
    `InvalidTimeRangeError` on invalid). Map Tempo response to
    `TraceResult { traceId, rootService, durationMs, spanCount, status, startTime }`.
    Apply pagination math.
    Implement `getTrace(traceId): Promise<TraceDetail>`: call
    `GET /api/traces/:traceId` on Tempo. If 404 from Tempo, throw
    `TraceNotFoundError` (routes to 404). Transform Tempo's flat span list to a
    nested `TraceDetail` with `spans` array where each span has a `children`
    array (recursive tree build by `parentSpanId`). On Tempo unreachable, throw
    `ObservabilityBackendError`.
  - **Spec Reference**: Spec §3.7, §3.8 (plan.md), plan.md §4.5
  - **Dependencies**: T012-03
  - **Estimated**: 4h

- [ ] **T012-24** `[FR-018]` `[P]`
      Implement `ObservabilityService.getPluginLogs()`
  - **File**: `apps/core-api/src/services/observability.service.ts`
  - **Type**: Modify existing (add method)
  - **Description**: Implement `getPluginLogs(pluginId, start, end, query?, limit):
Promise<PaginatedLogs>`: validate `start < end` and range ≤ 24 hours
    (Loki query range limit). Validate optional `query` against the LogQL filter
    allowlist from T012-19 (prefix check: must begin with `|= `, `|~ `, `!= `,
    or `!~ `). Build LogQL stream selector: `{pluginId="<pluginId>"}` plus the
    optional filter. Call Loki range query API:
    `GET /loki/api/v1/query_range?query=...&start=...&end=...&limit=...`.
    Map Loki log stream results to
    `LogEntry { timestamp, level, message, traceId, tenantId, service }`.
    Apply pagination. On Loki unreachable, throw `ObservabilityBackendError`.
  - **Spec Reference**: Spec §3.9 (plan.md), plan.md §4.5
  - **Dependencies**: T012-04
  - **Estimated**: 2h

- [ ] **T012-25** `[FR-024]` `[FR-036]` `[FR-037]`
      Create `observability-v1.ts` — route registration for all 7 observability endpoints
  - **File**: `apps/core-api/src/routes/observability-v1.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Register all seven observability routes on the Fastify
    instance under prefix `/api/v1/observability`. Every route must have
    `preHandler: [authMiddleware, requireSuperAdmin]` (FR-036, NFR-015).
    Use Zod schemas from T012-19 to validate query params via `fastify-type-provider-zod`
    (or manual `.parse()` in route handler). Map `ObservabilityService` errors
    to HTTP responses per Art. 6.2 format:
    `ObservabilityBackendError` → 502, `InvalidQueryError` → 400 `INVALID_QUERY`,
    `InvalidTimeRangeError` → 400 `INVALID_TIME_RANGE`,
    `TraceNotFoundError` → 404 `TRACE_NOT_FOUND`.
    All success responses return `{ data: ... }` wrapper (or `{ data: ..., pagination: ... }`).
    Routes: `GET /plugins/health-summary` (T012-20),
    `GET /plugins/:id/query` (T012-21),
    `GET /alerts` (T012-22 active),
    `GET /alerts/history` (T012-22 history),
    `GET /traces` (T012-23 search),
    `GET /traces/:traceId` (T012-23 detail),
    `GET /plugins/:id/logs` (T012-24).
    Export an `observabilityRoutes` async plugin function.
  - **Spec Reference**: Spec §3.3–§3.9 (plan.md), plan.md §4.6
  - **Dependencies**: T012-19, T012-20, T012-21, T012-22, T012-23, T012-24
  - **Estimated**: 5h

- [ ] **T012-26** `[FR-024]`
      Register observability routes in `index.ts`
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Location**: `registerRoutes()` function (after existing v1 route registration)
  - **Description**: Import `observabilityRoutes` from
    `./routes/observability-v1.js` and register with
    `app.register(observabilityRoutes)` (the plugin itself includes the
    `/api/v1/observability` prefix). Ensure the registration order places
    observability routes after auth middleware is wired but before the 404
    catch-all handler.
  - **Spec Reference**: Plan.md §7 Phase 3 T012-26
  - **Dependencies**: T012-25
  - **Estimated**: 30m

- [ ] **T012-46** `[Art. 3.4.5]`
      Create OpenAPI schema definitions for all 8 new endpoints
  - **File**: `apps/core-api/src/schemas/observability.schema.ts` _(extend)_ and route files
  - **Type**: Modify existing
  - **Description**: Add OpenAPI/Swagger schema definitions for all 8 new
    endpoints (`GET /metrics` + 7 `/api/v1/observability/*` endpoints) using
    the Fastify JSON Schema registration pattern already established in
    `plugin-v1.ts` (lines 200+). For each endpoint, define `schema: { querystring,
params, response: { 200, 400, 401, 403, 502 } }` using Zod-to-JSON-schema
    conversion. This satisfies Constitution Art. 3.4.5 ("All endpoints documented
    with OpenAPI/Swagger"). Include `description`, `tags: ["Observability"]`, and
    example values for all query parameters.
  - **Spec Reference**: Constitution Art. 3.4.5, plan.md §7 Phase 3 T012-46
  - **Dependencies**: T012-25
  - **Estimated**: 2h

---

**Phase 3 Total**: 10 tasks · 37 story points · ~28h

---

## Phase 4: Frontend Dashboard

> **Objective**: Build the Super Admin observability dashboard with Health,
> Metrics, Traces, and Alerts tabs inside `apps/super-admin`.
> `recharts` goes into `apps/super-admin/package.json`.
> Backend Phase 3 must be complete before integrating hooks (T012-28).

---

- [ ] **T012-27** `[FR-024]` `[NFR-018]`
      Install recharts, create observability layout page, add sidebar nav item
  - **Files**:
    - `apps/super-admin/package.json` _(modify — add `"recharts": "^2.15"`)_
    - `apps/super-admin/src/pages/observability/index.tsx` _(create — ObservabilityPage)_
    - `apps/super-admin/src/components/AdminSidebarNav.tsx` _(modify — add Observability item)_
  - **Type**: Create + modify
  - **Description**: (1) Add `"recharts": "^2.15"` to `apps/super-admin/package.json`
    dependencies; run `pnpm install`. (2) Create `ObservabilityPage` component:
    tab navigation bar (Health | Metrics | Traces | Alerts) using TanStack Router
    query params (`?tab=health|metrics|traces|alerts`). Default tab: `health`.
    Each tab renders the corresponding page component (lazy-loaded for code
    splitting per NFR-018). Include `AutoRefreshIndicator` and `TimeRangeSelector`
    in the tab bar area. (3) In `AdminSidebarNav.tsx`, add an "Observability" nav
    item between "Users" and "System Config" (per design-spec.md §3.1). Icon:
    `BarChart3` from `lucide-react`. Include a `NavItem.badge` prop showing the
    count of active alerts (sourced from a lightweight `useActiveAlertsCount` hook
    with 60s polling). Route: `/observability`.
  - **Spec Reference**: Design-spec §3.1, spec §9.1, ADR-029, plan.md §7 Phase 4 T012-27
  - **Dependencies**: None
  - **Estimated**: 3h

- [ ] **T012-28** `[FR-024]`
      Create `useObservability.ts` — React Query hooks for all observability API calls
  - **File**: `apps/super-admin/src/hooks/useObservability.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Export eight React Query hooks using TanStack Query (`useQuery`
    / `useInfiniteQuery`):
    `useHealthSummary()` — queries `/api/v1/observability/plugins/health-summary`,
    `staleTime: 30_000`, `refetchInterval: 30_000`.
    `usePluginMetrics(pluginId, query, start, end, step)` — queries
    `/api/v1/observability/plugins/:id/query`.
    `useActiveAlerts(severity?)` — queries `/api/v1/observability/alerts`,
    `staleTime: 60_000`, `refetchInterval: 60_000`.
    `useAlertHistory(page, perPage)` — queries `/api/v1/observability/alerts/history`.
    `useTraces(params)` — queries `/api/v1/observability/traces`.
    `useTraceDetail(traceId)` — queries `/api/v1/observability/traces/:traceId`.
    `usePluginLogs(pluginId, start, end, query?, limit)` — queries
    `/api/v1/observability/plugins/:id/logs`.
    `useActiveAlertsCount()` — lightweight hook returning just the count of firing
    alerts for the sidebar badge, `refetchInterval: 60_000`.
    All hooks use the existing `apiClient` from `@plexica/api-client`.
  - **Spec Reference**: Design-spec §6 (hooks), plan.md §7 Phase 4 T012-28
  - **Dependencies**: T012-25
  - **Estimated**: 3h

- [ ] **T012-29** `[FR-025]` `[NFR-019]`
      Create `HealthSummaryTable` and `HealthStatusBadge` components
  - **Files**:
    - `apps/super-admin/src/components/observability/HealthStatusBadge.tsx` _(create)_
    - `apps/super-admin/src/components/observability/HealthSummaryTable.tsx` _(create)_
  - **Type**: Create new files
  - **Description**: `HealthStatusBadge`: renders a coloured pill with status text
    for `"healthy"` (green), `"degraded"` (yellow), `"unhealthy"` (red). Uses both
    colour AND text/icon to distinguish states (WCAG 1.4.1 — no colour-only
    information). Includes `role="status"` and `aria-label="Plugin status: healthy"`.
    `HealthSummaryTable`: renders a sortable table of all plugins with columns:
    Plugin Name, Status (`HealthStatusBadge`), P95 Latency (ms), Error Rate (%),
    24h Uptime (%), Last Check (relative time). Clicking a row navigates to the
    Metrics tab pre-filtered to that plugin. Displays a loading skeleton while
    data is loading. Shows `AutoRefreshIndicator` with 30s countdown. Uses
    `useHealthSummary()` from T012-28. On error, shows actionable error state with
    retry button. Empty state when no active plugins. Table must be keyboard
    navigable (`tabIndex`, `aria-sort` on sortable headers).
  - **Spec Reference**: Design-spec §4.1, §4.2, plan.md §7 Phase 4 T012-29
  - **Dependencies**: T012-28
  - **Estimated**: 4h

- [ ] **T012-30** `[FR-027]` `[NFR-018]` `[NFR-019]`
      Create `MetricsChartPanel` and supporting components (`TimeRangeSelector`, `AutoRefreshIndicator`, `AccessibleChartToggle`)
  - **Files**:
    - `apps/super-admin/src/components/observability/TimeRangeSelector.tsx` _(create)_
    - `apps/super-admin/src/components/observability/AutoRefreshIndicator.tsx` _(create)_
    - `apps/super-admin/src/components/observability/AccessibleChartToggle.tsx` _(create)_
    - `apps/super-admin/src/components/observability/MetricsChartPanel.tsx` _(create)_
  - **Type**: Create new files
  - **Description**: `TimeRangeSelector`: dropdown with presets (Last 15m, 1h, 3h,
    6h, 12h, 24h, 7d) plus custom range picker. Outputs `{ start: Date, end: Date }`.
    `AutoRefreshIndicator`: shows "Auto-refresh in Ns" countdown with a circular
    progress ring; accessible via `aria-live="polite"`.
    `AccessibleChartToggle`: button labelled "Switch to data table" / "Switch to
    chart"; toggles between `recharts` visual and an HTML `<table>` fallback (ADR-029
    WCAG requirement — screen reader accessible data).
    `MetricsChartPanel`: 4-panel grid layout using `recharts` `LineChart`/`AreaChart`.
    Panel 1: Request rate (req/s) — `LineChart` with `Line` for `p50`, `p95`, `p99`.
    Panel 2: Latency P50/P95/P99 (ms) — `LineChart` with three lines using distinct
    dash patterns (not just colours) for WCAG 1.4.1.
    Panel 3: Error rate (%) — `AreaChart` with fill.
    Panel 4: Resource usage (CPU %, heap MB) — dual-axis `LineChart`.
    Each chart: `aria-label` describing the metric, `<title>` SVG element, and
    `AccessibleChartToggle` to show the data table fallback. Plugin selector
    dropdown. Uses `TimeRangeSelector` and `usePluginMetrics()`.
    Code-split via `React.lazy` (NFR-018).
  - **Spec Reference**: Design-spec §4.3, ADR-029, plan.md §7 Phase 4 T012-30
  - **Dependencies**: T012-28
  - **Estimated**: 6h

- [ ] **T012-31** `[FR-029]` `[FR-030]`
      Create `TraceSearchForm` and `TraceResultsTable` components
  - **Files**:
    - `apps/super-admin/src/components/observability/TraceSearchForm.tsx` _(create)_
    - `apps/super-admin/src/components/observability/TraceResultsTable.tsx` _(create)_
  - **Type**: Create new files
  - **Description**: `TraceSearchForm`: search form with fields: Service dropdown
    (populated from active plugins + "core-api"), Trace ID text input, Time Range
    (reuses `TimeRangeSelector`), Limit (1–100, default 20). Submit triggers
    `useTraces()` query. Accessible: all inputs have associated `<label>` elements,
    form has `aria-label="Search traces"`.
    `TraceResultsTable`: paginated table with columns: Trace ID (truncated, click
    to open `SpanWaterfall`), Root Service, Duration (ms), Span Count, Status badge
    (ok / error), Start Time. Pagination controls with `aria-label="Traces pagination"`.
    Shows loading state, empty state, and error state with retry. Status badge uses
    colour + icon (WCAG 1.4.1). Selected trace opens `SpanWaterfall` in an adjacent
    panel or slide-over.
  - **Spec Reference**: Design-spec §4.4, plan.md §7 Phase 4 T012-31
  - **Dependencies**: T012-28
  - **Estimated**: 4h

- [ ] **T012-32** `[FR-029]` `[FR-031]` `[NFR-019]`
      Create `SpanWaterfall` and `SpanDetailPanel` components
  - **Files**:
    - `apps/super-admin/src/components/observability/SpanWaterfall.tsx` _(create)_
    - `apps/super-admin/src/components/observability/SpanDetailPanel.tsx` _(create)_
  - **Type**: Create new files
  - **Description**: `SpanWaterfall`: custom React component (no Grafana embed —
    OQ-004 resolved). Renders a hierarchical timeline of spans using absolute
    CSS positioning. Each span row shows: indentation level (parent-child depth),
    service name chip, operation name, duration bar (proportional to total trace
    duration), duration label (ms), status icon. Error spans highlighted in red
    with `aria-label="Error span"`. Horizontal scroll on mobile (NFR-018 breakpoints).
    Click a row to populate `SpanDetailPanel`. Keyboard navigable (arrow keys to
    move between rows, Enter to select). The waterfall uses `useTraceDetail(traceId)`
    and renders the nested span tree from T012-23's transform.
    `SpanDetailPanel`: right-side panel (or below on mobile) showing selected span
    details: span ID, trace ID, operation, service, duration, status, start time,
    and all `attributes` as a key-value list. Copyable span ID / trace ID via
    clipboard button. Accessible: `role="complementary"`, `aria-label="Span details"`.
  - **Spec Reference**: Design-spec §4.4, plan.md §7 Phase 4 T012-32
  - **Dependencies**: T012-31
  - **Estimated**: 8h

- [ ] **T012-33** `[FR-032]`
      Create `ActiveAlertCard` and `AlertHistoryTable` components
  - **Files**:
    - `apps/super-admin/src/components/observability/ActiveAlertCard.tsx` _(create)_
    - `apps/super-admin/src/components/observability/AlertHistoryTable.tsx` _(create)_
  - **Type**: Create new files
  - **Description**: `ActiveAlertCard`: card component for a single firing alert.
    Shows: alert name, severity badge (critical=red, warning=orange — colour + text
    for WCAG 1.4.1), plugin ID as a link to the Metrics tab filtered to that plugin,
    description, time since firing (`activeAt`). `role="alert"` on critical severity.
    Cards sorted by severity (critical first) then `activeAt` (oldest first).
    Empty state shows a green "All systems operational" message.
    `AlertHistoryTable`: paginated table of resolved alerts. Columns: Alert Name,
    Severity, Plugin, Fired At, Resolved At, Duration. Severity filter dropdown
    above the table. Uses `useAlertHistory(page, perPage)` from T012-28.
    Pagination with `aria-label="Alert history pagination"`. "View Plugin" link
    in each row navigates to the plugin detail page.
    Both components use `useActiveAlerts()` and `useAlertHistory()` from T012-28.
  - **Spec Reference**: Design-spec §4.5, plan.md §7 Phase 4 T012-33
  - **Dependencies**: T012-28
  - **Estimated**: 4h

- [ ] **T012-47** `[Art. 9.1]`
      Add `observability_dashboard_enabled` feature flag gate
  - **Files**:
    - `apps/super-admin/src/routes/_layout/observability/index.tsx` _(modify)_
    - `apps/super-admin/src/components/AdminSidebarNav.tsx` _(modify)_
  - **Type**: Modify existing
  - **Description**: Add an `observability_dashboard_enabled` feature flag
    (following the existing `admin_interfaces_enabled` pattern in `_layout.tsx`).
    Gate the "Observability" sidebar nav item on this flag — if disabled, the nav
    item is hidden. Gate the `/observability` route — if disabled, redirect to
    the dashboard root. This satisfies Constitution Art. 9.1 ("Feature flags
    required for all user-facing changes") and allows gradual rollout or quick
    disable without code deployment. Default: `true` in development, configurable
    via environment variable `OBSERVABILITY_DASHBOARD_ENABLED`.
  - **Spec Reference**: Constitution Art. 9.1, plan.md §7 Phase 4 T012-47
  - **Dependencies**: T012-27
  - **Estimated**: 1h

---

**Phase 4 Total**: 8 tasks · 38 story points · ~33h

---

## Phase 5: Testing, Grafana Dashboards & Documentation

> **Objective**: Achieve the test targets specified in plan.md §8 (80 tests total:
> 40 unit, 25 integration, 10 E2E, 5 contract), deliver two pre-built Grafana
> dashboards, and write the developer observability guide. Test tasks may be
> started as soon as their implementation dependency completes — they are listed
> last for clarity but should be tracked individually, not as a single batch.

---

- [ ] **T012-34** `[NFR-001]` `[NFR-002]`
      Unit tests: `MetricsService`
  - **File**: `apps/core-api/src/__tests__/observability/unit/metrics.service.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 10 unit tests for `MetricsService`. Cover: (1) registry
    is distinct from Prometheus global default; (2) `http_requests_total` increments
    on `recordRequest()`; (3) `http_request_duration_seconds` observes correct
    bucket; (4) `active_plugins_total` updates via `setActivePluginsCount()`;
    (5) `getMetrics()` output includes both core and event-bus metrics (mock
    `eventMetrics.getRegistry()`); (6) `getContentType()` returns correct MIME type;
    (7) Fastify `onRequest` hook starts timer; (8) Fastify `onResponse` hook calls
    `recordRequest()` with correct method/route/statusCode/duration;
    (9) histogram buckets include `0.05` and `0.2` (SLA-aligned per ADR-027);
    (10) `mergeRegistries()` does not throw when event-bus registry is empty.
    All tests use `vi.mock` to isolate prom-client from real Prometheus.
  - **Spec Reference**: Plan.md §8.1, plan.md §7 Phase 5 T012-34
  - **Dependencies**: T012-07
  - **Estimated**: 3h

- [ ] **T012-35** `[FR-018]` `[FR-022]` `[FR-023]` `[FR-026]` `[FR-028]` `[FR-030]` `[FR-031]`
      Unit tests: `ObservabilityService`
  - **File**: `apps/core-api/src/__tests__/observability/unit/observability.service.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 15 unit tests for `ObservabilityService`. Mock all
    outbound `fetch` calls (use `vi.mock` or `undici` mock interceptors). Cover:
    (1) `getHealthSummary()` maps Prometheus instant results to `HealthEntry[]`;
    (2) `getHealthSummary()` classifies status correctly (healthy/degraded/unhealthy
    thresholds); (3) `getHealthSummary()` throws `ObservabilityBackendError` on
    network failure; (4) `queryPluginMetrics()` injects `plugin` label selector;
    (5) `queryPluginMetrics()` rejects disallowed PromQL (injection prevention);
    (6) `queryPluginMetrics()` rejects time range > 30 days; (7) `getActiveAlerts()`
    filters by severity; (8) `getAlertHistory()` paginates correctly;
    (9) `searchTraces()` passes correct params to Tempo; (10) `getTrace()` builds
    nested span tree from flat Tempo response; (11) `getTrace()` throws
    `TraceNotFoundError` on Tempo 404; (12) `getPluginLogs()` validates LogQL
    filter prefix allowlist; (13) `getPluginLogs()` throws on range > 24h;
    (14) all methods throw `ObservabilityBackendError` on backend unavailable;
    (15) `queryPluginMetrics()` with a valid allowlisted query succeeds.
  - **Spec Reference**: Plan.md §8.1, plan.md §7 Phase 5 T012-35
  - **Dependencies**: T012-20, T012-21, T012-22, T012-23, T012-24
  - **Estimated**: 5h

- [ ] **T012-36** `[FR-009]` `[FR-010]`
      Unit tests: `PluginTargetsService`
  - **File**: `apps/core-api/src/__tests__/observability/unit/plugin-targets.service.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 8 unit tests for `PluginTargetsService`. Mock
    `fs/promises.writeFile` and `fs/promises.rename` with `vi.mock`. Cover:
    (1) `refreshTargets()` queries only ACTIVE lifecycle plugins from the database;
    (2) output JSON format matches Prometheus `file_sd_configs` schema;
    (3) write goes to `.tmp` path first, then renamed to final path (atomic);
    (4) empty ACTIVE plugin list produces `[]` in targets file (not null/undefined);
    (5) `getTargetsFilePath()` returns `PROMETHEUS_TARGETS_PATH` env var when set;
    (6) `getTargetsFilePath()` returns default path when env var absent;
    (7) rename failure does not leave a dangling `.tmp` file;
    (8) plugin labels include `plugin`, `plugin_version`, `__metrics_path__`.
  - **Spec Reference**: Plan.md §8.1, plan.md §7 Phase 5 T012-36
  - **Dependencies**: T012-09
  - **Estimated**: 2h

- [ ] **T012-37** `[FR-011]` `[FR-019]` `[NFR-006]` `[NFR-008]` `[NFR-013]` `[NFR-014]`
      Unit tests: `telemetry.ts` AND `trace-context.ts`
  - **Files**:
    - `apps/core-api/src/__tests__/observability/unit/telemetry.test.ts` _(create)_
    - `apps/core-api/src/__tests__/observability/unit/trace-context.test.ts` _(create)_
  - **Type**: Create new files
  - **Description**: Write ≥ 6 unit tests for `telemetry.ts`. Mock the
    `@opentelemetry/sdk-node` `NodeSDK` and `@opentelemetry/api` `trace` module
    with `vi.mock`. Cover: (1) `initTelemetry()` reads `OTEL_SERVICE_NAME` from
    env; (2) `initTelemetry()` reads `OTEL_EXPORTER_OTLP_ENDPOINT` from env;
    (3) `getTracer()` returns a named tracer from the OTel tracer provider;
    (4) `shutdown()` calls `sdk.shutdown()` and resolves; (5) sampler is configured
    with `OTEL_TRACE_SAMPLE_RATE` env var ratio; (6) SDK starts without throwing
    when env vars use default values.
    Additionally, write ≥ 4 unit tests for `trace-context.ts` middleware. Cover:
    (7) `traceContextMiddleware` enriches `request.log` with `traceId` and `spanId`
    when an active OTel span exists; (8) middleware passes through without throwing
    when no active span exists (OTel disabled); (9) `traceId` format matches
    expected 32-char hex string; (10) concurrent requests get isolated trace
    context (no cross-request leakage).
  - **Spec Reference**: Plan.md §8.1, plan.md §7 Phase 5 T012-37
  - **Dependencies**: T012-12, T012-13
  - **Estimated**: 2h

- [ ] **T012-38** `[FR-024]` `[FR-036]` `[FR-037]`
      Integration tests: all 7 observability endpoints
  - **File**: `apps/core-api/src/__tests__/observability/integration/observability-routes.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 14 integration tests using `buildTestApp()` helper
    and mock Prometheus/Tempo/Loki HTTP servers (use `nock` or `msw`). Cover:
    (1) `GET /api/v1/observability/plugins/health-summary` — 200 with valid data;
    (2) 401 when no auth token; (3) 403 when authenticated as non-super_admin;
    (4) 502 when Prometheus is unreachable (mock connection refused);
    (5) `GET /api/v1/observability/plugins/:id/query` — 200 with valid PromQL;
    (6) 400 `INVALID_QUERY` for disallowed PromQL expression;
    (7) 400 `INVALID_TIME_RANGE` when `start >= end`;
    (8) `GET /api/v1/observability/alerts` — 200 with severity filter;
    (9) `GET /api/v1/observability/alerts/history` — 200 with pagination;
    (10) `GET /api/v1/observability/traces` — 200 with search results;
    (11) `GET /api/v1/observability/traces/:traceId` — 200 with nested span tree;
    (12) 404 `TRACE_NOT_FOUND` when Tempo returns 404;
    (13) `GET /api/v1/observability/plugins/:id/logs` — 200 with log entries;
    (14) 400 `INVALID_QUERY` for disallowed LogQL filter.
    All responses must conform to Art. 6.2 error format.
  - **Spec Reference**: Plan.md §8.2, plan.md §7 Phase 5 T012-38
  - **Dependencies**: T012-25
  - **Estimated**: 6h

- [ ] **T012-39** `[FR-006]` `[NFR-002]`
      Integration tests: `/metrics` endpoint
  - **File**: `apps/core-api/src/__tests__/observability/integration/metrics-endpoint.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 5 integration tests using `buildTestApp()`. Cover:
    (1) `GET /metrics` returns 200 with `Content-Type: text/plain; version=0.0.4`;
    (2) response body contains `# HELP http_requests_total`;
    (3) response body contains `# HELP active_plugins_total`;
    (4) 401 without auth token; (5) 403 with non-super*admin token; (6) response
    time P95 < 100ms under simulated load (NFR-002 — assert via `Date.now()` diff
    over 10 sequential calls in the test). Response must include merged event-bus
    metrics (assert `plexica_events*` prefix is present in output).
  - **Spec Reference**: Plan.md §8.2, plan.md §7 Phase 5 T012-39
  - **Dependencies**: T012-08
  - **Estimated**: 2h

- [ ] **T012-40** `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]`
      Integration tests: plugin metrics proxy
  - **File**: `apps/core-api/src/__tests__/observability/integration/metrics-proxy.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 8 integration tests using `buildTestApp()` and mock
    container HTTP server (use `nock` or a test HTTP server). Cover: (1) 200 with
    Prometheus text body proxied verbatim; (2) `Content-Type` header is
    `text/plain; version=0.0.4`; (3) 404 `PLUGIN_NOT_FOUND` for unknown plugin ID;
    (4) 503 `PLUGIN_NOT_ACTIVE` when plugin lifecycleStatus ≠ ACTIVE; (5) 503
    `PLUGIN_UNREACHABLE` when container does not respond within 5s (mock timeout);
    (6) 503 `PLUGIN_METRICS_UNAVAILABLE` when container returns 404 on `/metrics`;
    (7) 401 without auth token; (8) 403 with non-super_admin token.
    All error responses use Art. 6.2 format.
  - **Spec Reference**: Plan.md §8.2, plan.md §7 Phase 5 T012-40
  - **Dependencies**: T012-18
  - **Estimated**: 3h

- [ ] **T012-41** `[FR-024]` `[FR-025]` `[FR-027]` `[FR-029]` `[FR-032]` `[NFR-018]` `[NFR-019]`
      E2E tests: observability dashboard
  - **File**: `apps/core-api/src/__tests__/observability/e2e/observability-dashboard.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 10 Playwright E2E tests against the full stack (core
    API + super-admin app + mock observability backends). Cover: (1) page loads
    within 2 seconds on throttled 3G (NFR-018 — use Playwright `throttle`);
    (2) Health tab renders plugin health table with data rows;
    (3) Health tab auto-refreshes after 30s (advance fake timers, assert reload);
    (4) Clicking a health row navigates to Metrics tab filtered to that plugin;
    (5) Metrics tab renders all four recharts chart panels;
    (6) `AccessibleChartToggle` switches to data table view and back;
    (7) Traces tab: search form submits and results table renders;
    (8) Clicking a trace row opens `SpanWaterfall` with nested spans;
    (9) Alerts tab shows active alert cards and history table;
    (10) WCAG 2.1 AA compliance: run `@axe-core/playwright` scan on each tab,
    assert zero `critical` or `serious` violations (ADR-022, NFR-019).
  - **Spec Reference**: Plan.md §8.3, plan.md §7 Phase 5 T012-41
  - **Dependencies**: T012-27, T012-28, T012-29, T012-30, T012-31, T012-32, T012-33
  - **Estimated**: 4h

- [ ] **T012-42** `[FR-001]`
      Contract tests: plugin `/metrics` response format per ADR-030
  - **File**: `apps/core-api/src/__tests__/observability/contract/plugin-metrics-format.test.ts` _(create)_
  - **Type**: Create new file
  - **Description**: Write ≥ 5 in-process contract tests (following the pattern
    established in `workspace-plugins.contract.test.ts`) that verify the plugin
    metrics contract defined in ADR-030. Use a mock HTTP server simulating a plugin
    container's `GET /metrics` endpoint. Cover: (1) response MIME type is
    `text/plain; version=0.0.4; charset=utf-8`; (2) response body contains
    `# TYPE http_requests_total counter` (required metric per ADR-030);
    (3) response body contains `# TYPE http_request_duration_seconds histogram`
    (required metric per ADR-030); (4) metric line count does not exceed 5000
    (Prometheus `sample_limit` enforcement per ADR-030); (5) a response exceeding
    5000 samples triggers a `PLUGIN_METRICS_UNAVAILABLE` 503 from the proxy
    (validates that the core API enforces the limit, not just Prometheus).
  - **Spec Reference**: ADR-030, plan.md §8.4, plan.md §7 Phase 5 T012-42
  - **Dependencies**: T012-18
  - **Estimated**: 2h

- [ ] **T012-43** `[FR-034]`
      Grafana dashboard: "Plugin Overview"
  - **File**: `infrastructure/observability/grafana/dashboards/plugin-overview.json` _(create)_
  - **Type**: Create new file
  - **Description**: Create a Grafana dashboard JSON (exported from Grafana or
    hand-authored) for "Plugin Overview" (FR-034). Include panels:
    (1) Plugin Health Matrix — stat panel showing healthy/degraded/unhealthy
    count per plugin using `up{job="plugins"}` and alert rules;
    (2) Top-N Plugins by Error Rate — table panel ranked by
    `rate(http_requests_total{status_code=~"5.."}[5m])`;
    (3) Latency Distribution — heatmap using
    `sum(rate(http_request_duration_seconds_bucket[5m])) by (le, plugin)`;
    (4) Per-Plugin Panels (repeated panel) — request rate + error rate + P95
    latency time series with `plugin` label variable (`$plugin` dropdown).
    Set `refresh: "30s"`, `time: { from: "now-1h", to: "now" }`.
    Dashboard title: "Plugin Overview". UID: `plugin-overview`.
  - **Spec Reference**: Spec §6.5 (FR-034), plan.md §7 Phase 5 T012-43
  - **Dependencies**: T012-06
  - **Estimated**: 4h

- [ ] **T012-44** `[FR-035]`
      Grafana dashboard: "Core Platform"
  - **File**: `infrastructure/observability/grafana/dashboards/core-platform.json` _(create)_
  - **Type**: Create new file
  - **Description**: Create a Grafana dashboard JSON for "Core Platform" (FR-035).
    Include panels:
    (1) Request Rate — `rate(http_requests_total{job="core-api"}[1m])` time series;
    (2) Error Rate — `rate(http_requests_total{job="core-api", status_code=~"5.."}[1m]) /
rate(http_requests_total{job="core-api"}[1m])` with alert threshold at 1%;
    (3) Latency P50/P95/P99 — `histogram_quantile(0.50|0.95|0.99,
rate(http_request_duration_seconds_bucket{job="core-api"}[5m]))` three lines;
    (4) Heap Usage — `nodejs_heap_size_used_bytes` area chart;
    (5) Event Loop Lag — `nodejs_eventloop_lag_seconds`;
    (6) Active Connections — `nodejs_active_handles_total`.
    Set `refresh: "30s"`. Dashboard title: "Core Platform". UID: `core-platform`.
  - **Spec Reference**: Spec §6.5 (FR-035), plan.md §7 Phase 5 T012-44
  - **Dependencies**: T012-06
  - **Estimated**: 3h

- [ ] **T012-45** `[NFR-016]`
      Create `docs/OBSERVABILITY.md` — developer guide
  - **File**: `docs/OBSERVABILITY.md` _(create)_
  - **Type**: Create new file
  - **Description**: Write a comprehensive developer guide for the Plexica
    observability stack. Sections must include:
    (1) **Overview** — architecture diagram (ASCII), what each backend does;
    (2) **Local Setup** — `docker compose up prometheus tempo loki promtail grafana`,
    health check URLs, Grafana login;
    (3) **Environment Variables** — full reference table for all 8 env vars with
    defaults and description;
    (4) **Core API Metrics** — how to add new metrics using `MetricsService`,
    bucket selection guidance, counter vs gauge vs histogram decision guide;
    (5) **Distributed Tracing** — how to create manual spans with `getTracer()`,
    adding span attributes, what NOT to add (PII, credentials — per Art. 5.2);
    (6) **Plugin Metrics Contract** — ADR-030 summary, required metrics, how to
    implement `/metrics` in a plugin (code example with `prom-client`);
    (7) **Grafana Access** — `http://localhost:3000` (dev only), dashboard list,
    creating custom dashboards;
    (8) **Troubleshooting** — common issues: Promtail not collecting logs, Tempo
    traces missing, Prometheus targets down, `/metrics` returning 403;
    (9) **Security Notes** — `localhost:3000` binding (NFR-017), no PII in metrics,
    `super_admin` auth on all endpoints.
    Format per `AGENTS.md` documentation standards: English, Markdown, code blocks
    with language identifiers and file path comments, Table of Contents.
  - **Spec Reference**: Plan.md §7 Phase 5 T012-45, AGENTS.md documentation standards
  - **Dependencies**: All previous tasks complete
  - **Estimated**: 3h

---

**Phase 5 Total**: 12 tasks · 39 story points · ~39h

---

## Summary

| Metric                 | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Total tasks            | 47                                                     |
| Total phases           | 5                                                      |
| Total story points     | 162                                                    |
| Total estimated effort | ~135h                                                  |
| Parallelizable tasks   | 11 (marked `[P]` within phases)                        |
| Requirements covered   | 37 FRs + 22 NFRs (full coverage per plan.md §10)       |
| Test targets           | 80 tests (40 unit, 25 integration, 10 E2E, 5 contract) |
| Coverage target        | ≥85% on observability module, ≥80% overall             |

---

## Cross-References

| Document                         | Path                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| Spec                             | `.forge/specs/012-plugin-observability/spec.md`                    |
| Plan                             | `.forge/specs/012-plugin-observability/plan.md`                    |
| Design Spec                      | `.forge/specs/012-plugin-observability/design-spec.md`             |
| User Journey                     | `.forge/specs/012-plugin-observability/user-journey.md`            |
| ADR-026: OTel Direct Export      | `.forge/knowledge/adr/adr-026-otel-direct-tempo-export.md`         |
| ADR-027: prom-client Metrics     | `.forge/knowledge/adr/adr-027-prom-client-core-metrics.md`         |
| ADR-028: Promtail Log Ingestion  | `.forge/knowledge/adr/adr-028-log-ingestion-promtail-loki.md`      |
| ADR-029: recharts Charts         | `.forge/knowledge/adr/adr-029-chart-library-recharts.md`           |
| ADR-030: Plugin Metrics Contract | `.forge/knowledge/adr/adr-030-plugin-metrics-prometheus-format.md` |
| ADR-023: SSE Notifications       | `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md`      |
| Constitution                     | `.forge/constitution.md`                                           |
| Decision Log                     | `.forge/knowledge/decision-log.md`                                 |
