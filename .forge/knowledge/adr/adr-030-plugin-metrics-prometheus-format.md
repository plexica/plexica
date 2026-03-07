# ADR-030: Plugin Metrics Prometheus Exposition Format Contract

> Architectural Decision Record documenting the contract that all Plexica
> plugins MUST expose a `/metrics` endpoint in Prometheus text exposition
> format. Resolves Spec 012 Open Question OQ-004 (custom trace waterfall
> vs Grafana embed is resolved in the plan, not as an ADR).

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted                                           |
| Author   | forge-architect                                    |
| Date     | 2026-03-07                                         |
| Deciders | FORGE orchestrator, Spec 012 architecture planning |

---

## Context

Spec 012 (Plugin Observability) establishes a Prometheus-based metrics
scraping architecture. Prometheus discovers plugin containers via file-based
service discovery (FR-009, FR-010) and scrapes their metrics endpoints.
The core API also proxies plugin metrics via `GET /api/v1/plugins/:id/metrics`
(FR-001, TD-009).

For this architecture to work, all plugins must expose metrics in a format
that Prometheus can scrape. This ADR defines that contract.

### Current State

- Plugin containers are managed by the `ContainerAdapter` (ADR-019) and
  expose HTTP endpoints (`/health`, `/ready`, `/openapi`) per Spec 004.
- There is **no** `/metrics` endpoint requirement in the current plugin
  contract (Spec 004 FR-009 was deferred as TD-009).
- The Plugin SDK base class provides lifecycle hooks but no metrics
  instrumentation.
- Plugins are Docker containers that may be written in any language
  (Architecture §3.1), though the SDK is Node.js/TypeScript.

### Forces

1. **Prometheus compatibility**: Prometheus scrapes targets over HTTP and
   expects the standard text exposition format (Content-Type:
   `text/plain; version=0.0.4; charset=utf-8`).
2. **Language agnosticism**: The contract must be achievable in any language
   that a plugin might be written in. Prometheus client libraries exist for
   all major languages.
3. **SDK assistance**: The Plexica Plugin SDK should make metrics easy for
   TypeScript plugins, but the contract itself must be language-independent.
4. **Art. 8.1**: Contract tests are required for plugin-to-core API
   interactions. The metrics format is a contract surface.

---

## Options Considered

### Option A: Prometheus Text Exposition Format at `/metrics` (Chosen)

Plugins MUST expose `GET /metrics` returning Prometheus text exposition
format. The Plugin SDK auto-configures `prom-client` with default metrics
and provides helpers for custom metrics.

- **Description**: Standard Prometheus `text/plain; version=0.0.4` format:

  ```
  # HELP http_requests_total Total HTTP requests
  # TYPE http_requests_total counter
  http_requests_total{method="GET",path="/api/data",status="200"} 1234
  http_requests_total{method="POST",path="/api/data",status="201"} 56

  # HELP http_request_duration_seconds Request duration histogram
  # TYPE http_request_duration_seconds histogram
  http_request_duration_seconds_bucket{le="0.1"} 100
  http_request_duration_seconds_bucket{le="0.5"} 150
  http_request_duration_seconds_bucket{le="+Inf"} 155
  http_request_duration_seconds_sum 45.23
  http_request_duration_seconds_count 155
  ```

- **Pros**:
  - Industry standard — Prometheus, Grafana, Datadog, New Relic all understand it
  - Client libraries available for Node.js (`prom-client`), Go (`prometheus/client_golang`),
    Python (`prometheus_client`), Java (`micrometer`), Rust (`prometheus`)
  - Self-describing format with `# HELP` and `# TYPE` metadata
  - Human-readable — can be inspected with `curl`
  - Prometheus scrapes this format natively — no adapters needed
  - Core API metrics proxy (FR-001) passes through the raw text — no serialisation

- **Cons**:
  - Text format is verbose for large metric sets (but typically <100 KB per plugin)
  - No structured format — parsing requires custom code (but Prometheus handles this)

- **Effort**: Low for SDK plugins (auto-configured); Low for non-SDK plugins
  (standard format with library support)

---

### Option B: OpenTelemetry Metrics Format (OTLP) (Rejected)

Plugins push metrics to an OTel Collector in OTLP format; the Collector
exports to Prometheus.

- **Pros**:
  - Single protocol for traces and metrics
  - Push-based — no scrape endpoint needed on plugins

- **Cons**:
  - Requires an OTel Collector (deferred by ADR-026)
  - Push-based metrics lose Prometheus's pull-based health detection (`up` metric)
  - More complex plugin implementation (SDK dependency)
  - Breaks the direct Prometheus scrape model that FR-008 and FR-009 specify

- **Effort**: High (requires Collector + push infrastructure)

**Rejected** because ADR-026 deferred the OTel Collector and the spec
explicitly requires Prometheus scraping.

---

### Option C: JSON Metrics Endpoint (Rejected)

Plugins expose `GET /metrics` returning a custom JSON format. The core API
translates to Prometheus format before scraping.

- **Pros**:
  - JSON is easier to produce in any language
  - Custom format could be simpler

- **Cons**:
  - Non-standard — requires custom translation layer in the core API
  - Prometheus cannot scrape directly — needs a sidecar exporter
  - Every language has Prometheus client libraries anyway
  - Translation layer is a maintenance burden and potential data loss point

- **Effort**: High (custom format + translation layer)

**Rejected** because it adds complexity with no benefit over the standard
Prometheus format.

---

## Decision

**All Plexica plugins MUST expose `GET /metrics` returning Prometheus text
exposition format (Content-Type: `text/plain; version=0.0.4; charset=utf-8`).
This is a mandatory part of the plugin contract.**

### Contract Specification

#### Required Endpoint

| Aspect       | Requirement                                    |
| ------------ | ---------------------------------------------- |
| Method       | `GET`                                          |
| Path         | `/metrics`                                     |
| Auth         | None (internal Docker network only)            |
| Content-Type | `text/plain; version=0.0.4; charset=utf-8`     |
| Status Codes | 200 (success), 503 (metrics collection failed) |

#### Required Metrics

Plugins MUST expose at minimum these metrics:

| Metric Name                     | Type      | Labels                     | Description                 |
| ------------------------------- | --------- | -------------------------- | --------------------------- |
| `http_requests_total`           | Counter   | `method`, `path`, `status` | Total HTTP requests handled |
| `http_request_duration_seconds` | Histogram | `method`, `path`           | Request duration in seconds |

Plugins SHOULD additionally expose:

| Metric Name                     | Type    | Labels | Description              |
| ------------------------------- | ------- | ------ | ------------------------ |
| `process_cpu_seconds_total`     | Counter | —      | CPU time consumed        |
| `process_resident_memory_bytes` | Gauge   | —      | Resident memory in bytes |

Plugins MAY expose custom metrics with a naming prefix matching their
plugin ID (e.g., `crm_contacts_total`, `billing_invoices_generated_total`).

#### Histogram Buckets

Plugins using the Plexica Plugin SDK inherit standardised buckets:

```typescript
const PLUGIN_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
```

#### Prometheus Label Injection

Prometheus injects additional labels via the file-based service discovery
target configuration (FR-009). Plugins do NOT need to add these:

- `plugin` — plugin ID (from service discovery labels)
- `plugin_version` — plugin version (from service discovery labels)
- `instance` — container hostname:port (from Prometheus target)
- `job` — `plugin-metrics` (from Prometheus scrape config)

#### Sample Limit

Prometheus enforces a per-plugin `sample_limit: 5000` in the scrape config
(Edge Case #7 in spec). Plugins exceeding this limit will have excess
samples dropped silently.

### Plugin SDK Integration

The Plexica Plugin SDK base class auto-configures `/metrics`:

```typescript
// packages/plugin-sdk/src/base-plugin.ts (conceptual)
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

export class BasePlugin {
  protected readonly metricsRegistry: Registry;
  protected readonly httpRequestsTotal: Counter;
  protected readonly httpRequestDuration: Histogram;

  constructor() {
    this.metricsRegistry = new Registry();
    collectDefaultMetrics({ register: this.metricsRegistry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.metricsRegistry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.metricsRegistry],
    });
  }

  // Auto-registered route handler
  async handleMetrics(req, reply) {
    reply.header('Content-Type', this.metricsRegistry.contentType);
    reply.send(await this.metricsRegistry.metrics());
  }
}
```

### Non-SDK Plugins

Plugins not built with the Plexica SDK (e.g., Go, Python) must implement
the contract manually. Documentation in `docs/PLUGIN_SDK.md` will include
examples for common languages.

### Contract Test Requirements (Art. 8.1)

Contract tests at `apps/core-api/src/__tests__/observability/contract/`
verify:

1. Plugin `/metrics` returns 200 with correct Content-Type.
2. Response body parses as valid Prometheus text format.
3. Required metrics (`http_requests_total`, `http_request_duration_seconds`)
   are present with correct types.
4. Metric labels match expected names.
5. Histogram buckets are present and valid.

---

## Consequences

### Positive

- **Zero translation layer**: Prometheus scrapes plugins directly — the core
  API proxies raw text without parsing or transforming.
- **Language agnostic**: Prometheus client libraries exist for every major
  language. Non-SDK plugins can implement the contract trivially.
- **SDK ease-of-use**: TypeScript plugins get metrics for free via
  `BasePlugin` — zero configuration needed.
- **Health detection**: Prometheus's `up` metric automatically detects
  unreachable plugins (target `up == 0`), feeding into `PluginDown` alert.
- **Contract testability**: Standard format makes contract tests
  straightforward — parse and validate metric names, types, labels.

### Negative

- **New requirement on existing plugins**: Any plugin deployed before this
  spec that does not expose `/metrics` will show as `up == 0` in Prometheus.
  Mitigated by: Prometheus target file only includes ACTIVE plugins, and
  plugins without `/metrics` will have a `scrape_error` but won't trigger
  false alerts (the `PluginDown` alert checks `up == 0` for >1 minute with
  the `for: 1m` clause, not scrape errors).
- **Metric cardinality risk**: Plugins can create high-cardinality metrics
  (e.g., per-user labels). Mitigated by the `sample_limit: 5000` in
  Prometheus scrape config.

### Neutral

- The `/metrics` endpoint is unauthenticated because it's only accessible
  within the Docker network. In production with external network exposure,
  this should be revisited (firewall rules or mTLS).

---

## Constitution Alignment

| Article                         | Alignment | Notes                                                                                                    |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| Art. 1.2 §4 (Plugin Integrity)  | ✅        | Metrics contract extends the plugin contract (alongside /health, /ready). Does not bypass core security. |
| Art. 3.4 §5 (API Documentation) | ✅        | Metrics format and requirements documented in `docs/PLUGIN_SDK.md`.                                      |
| Art. 8.1 (Contract Tests)       | ✅        | Contract tests verify plugin metrics API surface per constitutional requirement.                         |
| Art. 9.2 (Monitoring)           | ✅        | Plugin metrics scraping enables the centralized metrics and alerting mandated by Art. 9.2.               |

---

## Follow-Up Actions

- [ ] Update Plugin SDK `BasePlugin` with metrics auto-configuration (T012-10)
- [ ] Add `/metrics` route to Plugin SDK HTTP server (T012-10)
- [ ] Create Prometheus file-based service discovery writer in core API (T012-11)
- [ ] Write contract tests for plugin `/metrics` format (T012-18)
- [ ] Document metrics contract in `docs/PLUGIN_SDK.md` (T012-35)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **ADR-019**: Pluggable Container Adapter — defines how plugin containers
  are managed. The `/metrics` endpoint is a new contract point alongside
  `/health` and `/ready`.
- **ADR-027**: prom-client for core metrics — same library used in Plugin
  SDK for consistency.
- **Spec 004 FR-009 / TD-009**: Original deferred requirement for the
  metrics proxy endpoint. This ADR + Spec 012 FR-001 resolves TD-009.
- **Spec 012 FR-008/FR-009/FR-010**: Prometheus infrastructure that
  depends on this plugin contract.
