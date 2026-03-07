# ADR-027: prom-client for Core Platform Metrics

> Architectural Decision Record documenting the use of `prom-client` for
> exposing Prometheus metrics from the Plexica core API. Approves `prom-client`
> as a dependency for `apps/core-api` per Constitution Art. 2.2.

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted                                           |
| Author   | forge-architect                                    |
| Date     | 2026-03-07                                         |
| Deciders | FORGE orchestrator, Spec 012 architecture planning |

---

## Context

Spec 012 (Plugin Observability) FR-006 and FR-007 require the core API to
expose a `/metrics` endpoint in Prometheus text exposition format. This
endpoint must include standard Node.js runtime metrics (heap size, event loop
lag, CPU) and application metrics (request counters, duration histograms,
active plugin gauge).

### Current State

- `prom-client` ^15.1.3 is already a dependency of `packages/event-bus`
  (used for `plexica_events_*` metrics).
- `packages/event-bus/src/metrics/event-metrics.ts` creates a **separate
  `Registry`** instance (not the global default registry), which is the
  correct pattern for library code.
- `apps/core-api/src/routes/metrics.ts` (109 lines) exists but only exposes
  event-bus metrics. It is currently **commented out** in `index.ts` (line 216).
- There is no `prom-client` dependency in `apps/core-api/package.json` —
  it currently reaches `prom-client` only transitively through `@plexica/event-bus`.

### Forces

1. **Art. 2.2 compliance**: New npm dependencies require ADR approval.
   Although `prom-client` is already in the monorepo, using it as a **direct
   dependency** in `apps/core-api` is a new usage that requires approval.
2. **Art. 9.2**: Constitution mandates centralized metrics and error/latency
   alerting — both require a metrics endpoint.
3. **Registry isolation**: The event-bus already uses a separate registry.
   The core API needs its own registry for platform metrics, plus the ability
   to merge registries at the `/metrics` endpoint.
4. **No reinvention**: `prom-client` is the de facto standard Node.js
   Prometheus client with >2.5M weekly downloads.

---

## Options Considered

### Option A: prom-client with Merged Registries (Chosen)

Add `prom-client` as a direct dependency of `apps/core-api`. Create a
`MetricsService` that:

1. Maintains its own `Registry` for core platform metrics.
2. Collects default Node.js metrics (heap, event loop, GC, CPU) via
   `collectDefaultMetrics()`.
3. Registers application metrics (request counter, duration histogram,
   active plugins gauge).
4. At scrape time, merges metrics from all registries (core + event-bus)
   into a single Prometheus text response.

- **Pros**:
  - `prom-client` already in monorepo — pnpm deduplicates (zero additional node_modules bytes)
  - Battle-tested library (2.5M+ weekly downloads, TypeScript types included)
  - `Registry.merge()` cleanly combines metrics from multiple registries
  - `collectDefaultMetrics()` provides Node.js runtime metrics with zero code
  - Histogram buckets configurable for P50/P95/P99 SLA tracking (Art. 4.3)

- **Cons**:
  - Must coordinate metric naming across registries to avoid collisions
  - `collectDefaultMetrics()` registers on a single registry — must be called once

- **Effort**: Low (library already in monorepo)

---

### Option B: OpenTelemetry Metrics SDK (Rejected)

Use `@opentelemetry/sdk-metrics` with a Prometheus exporter
(`@opentelemetry/exporter-prometheus`) to expose metrics.

- **Pros**:
  - Single SDK for both tracing and metrics
  - OTel metrics API is vendor-neutral

- **Cons**:
  - The OTel Prometheus exporter is experimental (not GA as of 2026-03)
  - Two metric libraries in one process (`prom-client` from event-bus +
    OTel metrics) — creates confusion and potential metric duplication
  - `prom-client` is already established in the codebase; switching adds risk
  - OTel metrics API is more verbose than `prom-client` for simple counters/histograms
  - Breaking change to the existing event-bus metrics module

- **Effort**: High (migrate event-bus, more verbose API)
- **Risk**: Medium — experimental exporter status

**Rejected** because `prom-client` is already established in the monorepo and
the OTel Prometheus exporter is not yet GA.

---

### Option C: Custom Metrics Without Library (Rejected)

Build a minimal metrics endpoint that manually formats Prometheus text.

- **Pros**:
  - Zero dependencies

- **Cons**:
  - Must implement Prometheus exposition format, histogram bucketing, counter
    reset semantics, and `# HELP`/`# TYPE` metadata manually
  - No `collectDefaultMetrics()` — must implement Node.js runtime metrics
  - Fragile and error-prone
  - Reinventing a solved problem

- **Effort**: High
- **Risk**: High — subtle format errors cause Prometheus scrape failures

**Rejected** — reinventing the wheel.

---

## Decision

**Add `prom-client` ^15.1.3 as a direct dependency of `apps/core-api` and
create a `MetricsService` with a dedicated registry for core platform metrics.**

### Metric Definitions

| Metric Name                     | Type      | Labels                     | Description                                   |
| ------------------------------- | --------- | -------------------------- | --------------------------------------------- |
| `http_requests_total`           | Counter   | `method`, `path`, `status` | Total HTTP requests processed                 |
| `http_request_duration_seconds` | Histogram | `method`, `path`           | Request duration in seconds                   |
| `active_plugins_total`          | Gauge     | —                          | Number of ACTIVE plugins                      |
| `nodejs_heap_size_total_bytes`  | Gauge     | —                          | V8 heap total (from `collectDefaultMetrics`)  |
| `nodejs_eventloop_lag_seconds`  | Gauge     | —                          | Event loop lag (from `collectDefaultMetrics`) |
| `process_cpu_seconds_total`     | Counter   | —                          | CPU time (from `collectDefaultMetrics`)       |

### Histogram Buckets

```typescript
// Aligned with Art. 4.3 SLAs: P95 < 200ms for standard endpoints
const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
```

### Registry Architecture

```
┌─────────────────────┐   ┌──────────────────────┐
│  MetricsService     │   │  EventMetrics        │
│  (core-api)         │   │  (event-bus)         │
│  coreRegistry       │   │  eventRegistry       │
│  - http_requests_*  │   │  - plexica_events_*  │
│  - active_plugins_* │   │                      │
│  - nodejs_*         │   │                      │
└─────────┬───────────┘   └──────────┬───────────┘
          │                          │
          └──────────┬───────────────┘
                     │ Registry.merge()
              ┌──────▼──────┐
              │  GET /metrics│
              │  Merged text │
              └─────────────┘
```

### Auth Requirement

The `/metrics` endpoint requires `super_admin` auth (FR-006, Art. 5.1).
Prometheus authenticates via a static Bearer token configured in
`prometheus.yml` and the core API's auth middleware.

---

## Consequences

### Positive

- **Zero additional bundle size**: pnpm deduplicates `prom-client` already
  present in `packages/event-bus`.
- **Consistent metrics format**: Both core and event-bus metrics use
  `prom-client` — same exposition format, same registry merge API.
- **Rich runtime metrics**: `collectDefaultMetrics()` provides 15+ Node.js
  metrics (heap, GC, event loop, active handles/requests) with zero code.
- **SLA enforcement**: `http_request_duration_seconds` histogram enables
  P50/P95/P99 computation for Art. 4.3 alerting.

### Negative

- **Metric naming coordination**: Core and event-bus registries must not
  define metrics with the same name. Enforced by naming convention:
  `http_*` for core, `plexica_events_*` for event-bus.
- **Single-process assumption**: `prom-client` metrics are in-process. In a
  multi-instance deployment, Prometheus scrapes each instance separately
  and aggregates. This is standard Prometheus architecture.

### Neutral

- `collectDefaultMetrics()` adds ~500μs to the first `/metrics` scrape for
  metric collection. Subsequent scrapes are <100ms (NFR-002).

---

## Constitution Alignment

| Article                         | Alignment | Notes                                                                                                           |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Art. 2.2 (Dependency Policy)    | ✅        | This ADR IS the required approval. `prom-client` has >2.5M weekly downloads, TypeScript types, zero known CVEs. |
| Art. 3.2 (Layered Architecture) | ✅        | `MetricsService` (service layer) → `/metrics` route (controller layer). No layer bypasses.                      |
| Art. 4.3 (Performance Targets)  | ✅        | Histogram buckets aligned with P95 < 200ms SLA. Enables Prometheus alerting on latency violations.              |
| Art. 5.1 (Auth)                 | ✅        | `/metrics` endpoint requires `super_admin` Bearer token.                                                        |
| Art. 9.2 (Monitoring)           | ✅        | Delivers centralized metrics, error rate alerting, and latency alerting requirements.                           |

---

## Follow-Up Actions

- [ ] Add `prom-client` to `apps/core-api/package.json` (T012-06)
- [ ] Create `MetricsService` with core registry + `collectDefaultMetrics` (T012-06)
- [ ] Update `metrics.ts` route to merge core + event-bus registries (T012-07)
- [ ] Uncomment metrics route registration in `index.ts` (T012-07)
- [ ] Add Fastify `onResponse` hook for request duration + counter (T012-07)
- [ ] Configure Prometheus scrape with Bearer token auth (T012-02)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **ADR-005**: Event System (Redpanda) — `prom-client` was first introduced
  for event-bus metrics. This ADR extends its usage to the core API.
- **Spec 012 FR-006/FR-007**: Core API `/metrics` endpoint requirement.
- **Architecture §7.2**: Mandates "Prometheus endpoint at `/metrics`" —
  this ADR delivers that endpoint.
