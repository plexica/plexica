# ADR-036: Prometheus Metrics via `prom-client`

> Architectural Decision Record documenting the adoption of `prom-client` as the
> new core dependency powering the `/metrics` endpoint in `services/core-api`.
> Created by `forge-architect` via `/forge-adr` (flagged as REQUIRED by
> `.forge/specs/006-cross-cutting-features/plan.md` §3.3 / §8.1).

| Field    | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Status   | Accepted                                                     |
| Author   | forge-architect                                              |
| Date     | 2026-09-17                                                   |
| Deciders | Plexica Team + user                                          |
| Spec     | `.forge/specs/006-cross-cutting-features/spec.md` (006-17, 006-18, 006-20) |
| Plan     | `.forge/specs/006-cross-cutting-features/plan.md` (§5.6, §6.2, §7.6, §8.1, §9 Phase 4) |
| Related  | ADR-012 (rate limiting), ADR-022 (Loki + Grafana infra), ADR-004 (Kafka/Redpanda event bus) |

---

## Context

Spec 006 feature **006-17** requires a Prometheus-compatible `/metrics` endpoint
exporting HTTP latency, error rate, and Kafka consumer lag; features **006-18**
and **006-20** require a base Grafana dashboard and a Kafka monitoring dashboard
respectively. The NFR is explicit: **Prometheus scrape duration < 100 ms**.

Forces at play:

- **No metrics today.** The service exposes a liveness-only `GET /health`
  (`modules/health/basic-health-routes.ts`) and no operational metrics exist
  anywhere in `services/core-api`.
- **Infra gap with a dangling datasource.** Grafana datasources are already
  provisioned pointing at `prometheus:9090`
  (`infra/grafana/provisioning/datasources/prometheus.yml`), but **no Prometheus
  service exists** in the compose stack and `/metrics` does not exist (plan §1.1
  constraint). Any solution must make that datasource real.
- **Constitution Rule 5 / AGENTS.md** ("Nuove dipendenze richiedono un ADR"):
  adding `prom-client` to `services/core-api/package.json` is a **new core
  dependency**. Per plan §3.3 there is **no fallback** — this ADR is mandatory
  before Phase 4 (observability) implementation starts.
- **NFR feasibility.** The < 100 ms scrape NFR forces an architecture where the
  scrape request only *serializes* a pre-aggregated registry; all gauges are
  refreshed on a 30 s interval out-of-band (plan §2.2, risk table). The chosen
  library must support this pattern cleanly.
- **Minimal-dependency principle vs. the standard tool.** `prom-client` is the
  de-facto standard Node.js Prometheus client, but it is still one more runtime
  dependency; the alternative of hand-rolling the exposition format was weighed
  against maintenance and correctness risk.

Explicitly **out of scope** for this ADR (decided elsewhere):

- **`eslint-plugin-formatjs`** (006-06) is an `apps/web` devDependency, flagged
  separately in plan §8.1 — no core ADR.
- **OpenTelemetry** (006-19) is deferred to Sprint 7 (`sprint-006.yaml`, plan
  §3.2 D-13); only an `OTEL_TRACING_ENABLED` config stub (feature-flagged off)
  lands this sprint. OTel is not a contender for the *current* metrics path.

---

## Options Considered

### Option A: `prom-client` as a direct core dependency

- **Description**: Add `prom-client@15.1.3` (exact pin) to `services/core-api`. A single
  `modules/observability/metrics-registry.ts` holds the `Registry` and typed
  metrics; Fastify `onRequest`/`onResponse` hooks record the HTTP histogram and
  counters; a 30 s poller feeds the Kafka/outbox/email gauges; `GET /metrics`
  serializes the registry (`registry.metrics()`) in Prometheus text format.
  Default process metrics via `collectDefaultMetrics` (30 s interval).
- **Pros**: Standard, battle-tested client with first-class TypeScript types;
  text exposition format handled by the library (no format bugs possible);
  process metrics for free; framework-agnostic — works with the Fastify hook
  model and a hand-rolled route; registry-level control keeps label cardinality
  bounded; matches plan §8.1 exactly.
- **Cons**: Adds one new core runtime dependency (Rule 5 → this ADR); metrics
  require explicit wiring (hooks + pollers); histogram bucket tuning is our
  responsibility; a second metric library must never be introduced (Rule 3).
- **Effort**: Medium

### Option B: `@fastify/prometheus` / `fastify-metrics` wrapper plugin

- **Description**: A community Fastify plugin that wraps `prom-client` and
  auto-registers HTTP metrics plus a `/metrics` route.
- **Pros**: Least boilerplate; automatic route + hook registration; fastest
  initial integration.
- **Cons**: **Not an official Fastify plugin** — plan §8.2 explicitly rejects it
  ("Not an official plugin; hand-rolled registry in `metrics-registry.ts` keeps
  cardinality bounded"); adds a *second* dependency layer on top of
  `prom-client`; less control over metric naming, label sets, and cardinality;
  another package to audit and update; slower to adopt `prom-client` features.
- **Effort**: Low (rejected)

### Option C: Hand-rolled metrics endpoint (no dependency)

- **Description**: A custom middleware + endpoint emitting a Prometheus-text-
  compatible payload from in-process counters (request durations, error counts,
  lag gauges) implemented from scratch.
- **Pros**: Zero new dependencies; total control over the output.
- **Cons**: Re-implements the exposition format, histogram bucketing, label
  escaping, and process metrics — a large correctness surface where subtle
  format incompatibilities silently break scraping; violates the one-pattern
  principle (Rule 3) by inventing a bespoke mechanism instead of the standard
  library; high ongoing maintenance; risks missing the < 100 ms NFR under
  lock-contention on a naive counter implementation.
- **Effort**: High (rejected)

### Option D: OpenTelemetry metrics SDK (`@opentelemetry/sdk-metrics` + Prometheus exporter)

- **Description**: Use the OTel Metrics API with a Prometheus exporter, aligning
  the metrics path with the future 006-19 tracing story.
- **Pros**: Vendor-neutral single telemetry layer; forward-compatible with the
  Sprint 7 OTel tracing work; observability industry direction.
- **Cons**: 006-19 is explicitly **deferred to Sprint 7** (plan §3.2 D-13) —
  this ADR would pull in two new core deps (`sdk-metrics` + exporter) *now*,
  expanding Rule 5 surface; heavier runtime and a bridge layer between OTel
  views and the Prometheus registry; the < 100 ms scrape NFR is harder to hit
  through a serialization bridge; over-engineering for the current scope, which
  has no tracing requirement this sprint.
- **Effort**: High (out of scope this sprint)

---

## Decision

**Chosen option**: Option A — **`prom-client@15.1.3` (exact pin)** added to
`services/core-api`. The range `^15` resolves to the now-deprecated `15.1.3`;
pinning exactly freezes the last-known-good version and keeps the registry
lockfile deterministic (deprecation note below; no range kept).

**Rationale**:

- The plan (spec 006) specifies `prom-client` as the sole new observability
  dependency (§8.1) and explicitly rules out `@fastify/prometheus` (§8.2). This
  ADR is the Rule 5 record that makes that choice legally valid.
- `prom-client` is the ecosystem standard: correct text exposition, histogram
  bucketing, and default process metrics out of the box — eliminating the
  correctness risk of Option C.
- The hand-rolled registry pattern (`metrics-registry.ts` as the **only**
  importer) delivers the cardinality control that motivated rejecting
  Option B, without the wrapper-plugin dependency.
- The 30 s pre-aggregation + serialization-only scrape pattern required by the
  < 100 ms NFR maps directly onto `prom-client`'s registry model (gauges set by
  pollers, scrape = `registry.metrics()`).

**Endpoint contract** (from plan §5.6, not re-derived):

- `GET /metrics` **[PUBLIC]**, registered on the root instance (like `/health`),
  Prometheus text format (`content-type: text/plain; version=0.0.4`).
- **Auth**: none by default (opt-in public); **optional `METRICS_TOKEN`** env
  guard returns 401/403 when set — default open for scrape. No application rate
  limit (scrape traffic is low-frequency and serialization-only; consistent with
  `/health` being exempt under ADR-012).
- **NFR**: scrape < 100 ms — gauges refreshed on a 30 s interval; scrape only
  serializes the registry.

**Metrics exported** (plan §5.6):

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `http_request_duration_seconds` | Histogram | method, route, status |
| `http_requests_total` | Counter | method, route, status |
| `kafka_consumer_lag` | Gauge | plugin, tenant |
| `kafka_dlq_size` | Gauge | plugin |
| `outbox_pending_events` | Gauge | — |
| `sse_active_connections` | Gauge | tenant |
| `notifications_emitted_total` | Counter | — |
| `notifications_rate_limited_total` | Counter | — |
| `email_queue_depth` / `email_queue_dead_total` | Gauge / Gauge | — |
| Node process metrics (`collectDefaultMetrics`) | `prom-client` defaults | — |

**Wiring** (plan §6.2): `kafka_consumer_lag` wraps the existing
`modules/admin/services/lag-metrics.service` via the `kafka-metrics.ts` 30 s
poller (no duplicate lag computation). Bootstrap lifecycle adds
`startKafkaMetricsPoller()` mirroring the documented start/stop pattern
(`src/bootstrap.ts`).

**Infra implication**: Prometheus must finally exist — plan §7.6 adds
`infra/prometheus/prometheus.yml` (scrape config: `core-api:3001/metrics`) and
plan §7.8 adds a `prometheus` service to
`infra/compose/docker-compose.observability.yml`, materializing the already-
provisioned Grafana `prometheus:9090` datasource (ADR-022 Decision 3 context).

---

## Consequences

### Positive

- 006-17/006-18/006-20 are implementable: `/metrics`, base Grafana dashboard,
  and Kafka monitoring dashboard share one registry and one scrape target.
- NFR-compliant by construction: pre-aggregated 30 s gauges mean the scrape path
  is O(registry size), keeping wall time well under 100 ms.
- Process metrics (event-loop lag, memory, GC) ship for free — useful for
  capacity planning with no extra code.
- Single pattern preserved (Rule 3): `prom-client` becomes *the* metrics
  library; no competing metric library may be introduced.
- Bounded cardinality: histogram labels are restricted to the (bounded) route
  set and status codes; gauges carry plugin/tenant keys already bounded by the
  platform (unit-tested in `metrics-registry.test.ts`).
- The dangling Grafana Prometheus datasource (ADR-022) becomes functional.

### Negative

- Adds a new core runtime dependency to `services/core-api` (the Rule 5 trigger
  this ADR satisfies); it joins the audit/update surface of the dependency set.
- Kafka consumer lag metric requires wiring into the existing consumer / lag
  service — an integration point that must not regress under the no-core-mocks
  testing rule (integration test asserts `kafka_consumer_lag` presence against
  the real stack).
- `/metrics` is public by default, exposing operational telemetry; mitigated by
  the optional `METRICS_TOKEN` guard and by the absence of PII in metric labels
  (labels are method/route/status/tenant/plugin — no user identifiers).
- Histogram bucket and label choices are now a maintained contract; drifting
  route sets can grow cardinality (guarded by the unit test).

### Neutral

- Prometheus joins the compose stack as a new dev infrastructure service;
  Grafana dashboard provisioning moves from datasources-only to
  datasources + dashboards.
- No OpenTelemetry coupling: the metric model stays Prometheus-native this
  sprint; the Sprint 7 OTel story (006-19) will need an exporter/bridge rather
  than a rewrite — deferred, not blocked.
- `METRICS_TOKEN` is optional config: environments may run fully open (dev/CI)
  or guarded (shared/staging) with no code change.

> **Deprecation note (2026-09-17)**: at install time the npm registry marked
> `prom-client@15.1.3` as deprecated — *"prom-client has been replaced by
> @prometheus-io/client"*. Pinned to `15.1.3` exactly (no `^`) to freeze the
> last-known-good version and keep the registry lockfile deterministic.
> A follow-up ADR for migrating to `@prometheus-io/client` is scheduled before
> Phase 6 (`metrics-registry.ts` lands in Phase 4; the migration decision must
> precede any deeper metrics-registry coupling).

## Constitution Alignment

| Article | Alignment | Notes |
| ------- | --------- | ----- |
| Rule 5: ADR for significant decisions | **COMPLIANT** | New core dependency documented *before* implementation — this ADR is the Rule 5 record required by plan §3.3/§8.1. |
| Rule 3: One pattern per operation | **COMPLIANT** | `prom-client` is the sole metrics mechanism; `@fastify/prometheus` and hand-rolled formats are explicitly excluded (plan §8.2). |
| Rule 1 / Rule 2: E2E + green CI | **COMPLIANT** | E2E `observability-metrics.spec.ts` (006-17/18/20) + integration `metrics.routes.int.test.ts` (scrape < 100 ms) + unit `metrics-registry.test.ts` (cardinality). |
| Rule 4: No file above 200 lines | **COMPLIANT** | Observability module decomposed: `metrics-registry`, `http-metrics`, `kafka-metrics`, `metrics.routes`, `index` (plan §6.2). |
| Tech Stack | **COMPLIANT** | Fastify ^5 hook model drives HTTP metrics; TypeScript ^5.9 with `prom-client`'s bundled types; version pinned to `15.1.3` exact per this ADR (range `^15` resolves to the deprecated 15.1.3). |
| Architecture (monolith, public opt-ins) | **COMPLIANT** | `/metrics` registered on the root instance as an explicitly documented public opt-in; module internal to the Fastify monolith. |
| Security §2 (Authentication) | **COMPLIANT** | Public endpoint explicitly opted in and documented; optional `METRICS_TOKEN` guard; /metrics contains no tenant/user PII in labels. |
| Security §5 (Secrets) | **COMPLIANT** | `METRICS_TOKEN` and `PROMETHEUS_*` config come from environment variables only; no default secret value (plan §13). |

## Follow-Up Actions

- [ ] Install `prom-client@15.1.3` (exact pin, no `^`) in `services/core-api` (`pnpm --filter services/core-api add prom-client@15.1.3`).
- [ ] Implement `modules/observability/metrics-registry.ts` — the **sole** `prom-client` importer; typed registry + histogram/counters/gauges + `collectDefaultMetrics` (30 s).
- [ ] Implement `modules/observability/http-metrics.ts` — Fastify `onRequest`/`onResponse` hooks for `http_request_duration_seconds` + `http_requests_total`.
- [ ] Implement `modules/observability/metrics.routes.ts` — `GET /metrics` serialization; optional `METRICS_TOKEN` guard.
- [ ] Implement `modules/observability/kafka-metrics.ts` — 30 s poller: `kafka_consumer_lag` (wraps `lag-metrics.service`), `kafka_dlq_size`, `outbox_pending_events`.
- [ ] Wire bootstrap lifecycle: `startKafkaMetricsPoller()` (start/stop mirror in `src/bootstrap.ts`).
- [ ] Add `PROMETHEUS_*` / optional `METRICS_TOKEN` config to `lib/config.ts` + `.env.example`.
- [ ] Add `prometheus` service to `infra/compose/docker-compose.observability.yml` + `infra/prometheus/prometheus.yml` scrape config (`core-api:3001/metrics`).
- [ ] Grafana: import `plexica-overview.json` (006-18) + `kafka-monitoring.json` (006-20); add `provisioning/dashboards.yml` provider.
- [ ] Tests: `metrics.routes.int.test.ts` (scrape < 100 ms, series presence), `metrics-registry.test.ts` (label cardinality bounds), E2E `observability-metrics.spec.ts` (006-17/18/20).
- [ ] Orchestrator: record this decision in `.forge/knowledge/decision-log.md` (orchestrator-owned; not updated here).
- [ ] Do **not** introduce OTel this sprint (006-19 deferred to Sprint 7).

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

Status: **Accepted** (user sign-off, 2026-09-17). Open points confirmed: `prom-client@15.1.3` pinned exactly (range `^15` resolves to the deprecated 15.1.3 — no range kept); `/metrics` public by default with optional `METRICS_TOKEN`; no rate limit (aligned with `/health` ADR-012 exemption). Implementation of plan §9 Phase 4 task 3 (006-17) may start.
Supersession note: none (no prior metrics ADR exists).
