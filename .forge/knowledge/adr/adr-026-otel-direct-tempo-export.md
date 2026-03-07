# ADR-026: OpenTelemetry SDK with Direct OTLP Export to Tempo

> Architectural Decision Record documenting the distributed tracing topology
> for the Plexica platform. Resolves Spec 012 Open Question OQ-001: whether
> to use an OpenTelemetry Collector intermediary or export directly from
> the application to Tempo via OTLP/gRPC.

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted                                           |
| Author   | forge-architect                                    |
| Date     | 2026-03-07                                         |
| Deciders | FORGE orchestrator, Spec 012 architecture planning |

---

## Context

Spec 012 (Plugin Observability) introduces distributed tracing across the
Plexica platform. The core API instruments incoming HTTP requests and
outbound plugin proxy calls with OpenTelemetry spans, then exports those
spans to Grafana Tempo for storage and querying.

The key architectural question is the **export topology**: how do spans get
from the application process to Tempo?

### Current State

- **Zero** OpenTelemetry code exists in the repository (no `@opentelemetry/*`
  packages, no tracing initialisation, no span creation).
- `plugin-hook.service.ts` (line 368) generates `X-Trace-ID: crypto.randomUUID()`
  — a custom trace ID that is NOT W3C `traceparent`-compatible. This must be
  replaced with OTel-propagated trace context (FR-013).
- `docker-compose.yml` has no tracing infrastructure (no Tempo, no Jaeger,
  no OTel Collector).
- Architecture §7.2 declares "OpenTelemetry with Jaeger exporter" as required
  but was never implemented.

### Forces

1. **Simplicity**: Fewer moving parts means less to configure, monitor, and
   debug. The observability stack is itself a reliability concern.
2. **Production-readiness**: A production deployment may need trace processing
   (tail-based sampling, attribute enrichment, fan-out to multiple backends).
3. **Resource overhead**: The OTel Collector is a separate process consuming
   CPU and memory.
4. **Decoupling**: The Collector decouples the application from the backend
   choice — switching from Tempo to Jaeger requires only Collector config changes.
5. **Spec scope**: Spec 012 targets local development and initial production.
   A separate production-hardening spec will follow.

---

## Options Considered

### Option A: Direct OTLP/gRPC Export to Tempo (Chosen)

The core API's `@opentelemetry/sdk-node` exports spans directly to Tempo's
OTLP/gRPC receiver at `tempo:4317`. No intermediary process.

```
┌─────────────┐  OTLP/gRPC   ┌────────────┐
│  Core API   │──────────────▶│   Tempo    │
│  (OTel SDK) │               │  :4317     │
└─────────────┘               └────────────┘
```

- **Pros**:
  - Simplest topology — one fewer Docker service to configure, monitor, and resource-limit
  - Lower memory footprint (~0 MB vs ~50-100 MB for the Collector)
  - Fewer failure modes — no Collector crash/restart to handle
  - Direct gRPC connection: spans arrive at Tempo with minimal latency
  - `@opentelemetry/sdk-node` handles batching (`BatchSpanProcessor`), retry, and backpressure natively
  - Sufficient for local dev AND small/medium production deployments (<50 services)
  - Adding the Collector later is non-breaking — only env var `OTEL_EXPORTER_OTLP_ENDPOINT` changes

- **Cons**:
  - No trace processing pipeline (tail-based sampling, attribute enrichment)
  - Application is coupled to Tempo's endpoint — switching backends requires app redeploy (but only env var change)
  - Head-based sampling only (`TraceIdRatioBasedSampler`) — no intelligent sampling based on trace outcome
  - No fan-out to multiple backends (e.g., Tempo + Datadog) without Collector

- **Effort**: Low (SDK config only)
- **Risk**: Low — Collector can be added later as a non-breaking change

---

### Option B: OpenTelemetry Collector as Intermediary (Deferred)

Deploy the OTel Collector as a Docker service between the app and Tempo.

```
┌─────────────┐  OTLP/gRPC   ┌──────────────┐  OTLP/gRPC   ┌────────────┐
│  Core API   │──────────────▶│  OTel        │──────────────▶│   Tempo    │
│  (OTel SDK) │               │  Collector   │               │  :4317     │
└─────────────┘               └──────────────┘               └────────────┘
```

- **Pros**:
  - Tail-based sampling (sample 100% of error traces, 10% of success traces)
  - Attribute enrichment, filtering, and transformation via processors
  - Fan-out to multiple backends (Tempo + Datadog, New Relic, etc.)
  - Full decoupling: backend changes require only Collector config, not app redeploy
  - Industry standard for production Kubernetes deployments

- **Cons**:
  - Additional Docker service to configure, monitor, and resource-limit (~50-100 MB RAM)
  - Additional failure mode — Collector crash drops all in-flight spans
  - More complex docker-compose (one more service + config file)
  - Overkill for <50 services in local dev / initial production

- **Effort**: Medium (Collector config + pipeline definition + resource limits)
- **Risk**: Low, but introduces operational complexity before it's needed

**Deferred** to a future production-hardening spec. The migration path is
trivial: change `OTEL_EXPORTER_OTLP_ENDPOINT` from `http://tempo:4317` to
`http://otel-collector:4317` and add the Collector service to docker-compose.

---

### Option C: No OpenTelemetry — Custom Trace ID Propagation (Rejected)

Continue with the current `X-Trace-ID: crypto.randomUUID()` approach and
build custom trace storage.

- **Pros**:
  - No new npm dependencies
  - Full control over trace format

- **Cons**:
  - Violates Architecture §7.2 which mandates OpenTelemetry
  - No ecosystem compatibility (Grafana, Jaeger, Tempo cannot read custom format)
  - Requires building custom trace storage, querying, and visualisation
  - No automatic HTTP/gRPC instrumentation — every service call must be manually traced
  - Massive implementation effort for inferior result

- **Effort**: Very High (build custom tracing from scratch)
- **Risk**: High — reinventing the wheel

**Rejected** — OpenTelemetry is the industry standard and mandated by
Architecture §7.2.

---

## Decision

**Use `@opentelemetry/sdk-node` with direct OTLP/gRPC export to Tempo.**
No OpenTelemetry Collector in Phase 1.

### Specific Package Choices

| Package                                   | Version | Purpose                                         |
| ----------------------------------------- | ------- | ----------------------------------------------- |
| `@opentelemetry/sdk-node`                 | ^0.57   | SDK initialisation, `NodeSDK` class             |
| `@opentelemetry/exporter-trace-otlp-grpc` | ^0.57   | OTLP/gRPC span exporter to Tempo                |
| `@opentelemetry/instrumentation-http`     | ^0.57   | Auto-instrument incoming/outgoing HTTP requests |
| `@opentelemetry/instrumentation-fastify`  | ^0.43   | Fastify-specific route/handler span enrichment  |
| `@opentelemetry/resources`                | ^1.30   | Service name, version resource attributes       |
| `@opentelemetry/semantic-conventions`     | ^1.28   | Standard attribute names                        |

All packages are `dependencies` of `apps/core-api` (they run at runtime,
not dev-only). The `@opentelemetry/sdk-node` auto-configures W3C
`traceparent` propagation.

### Configuration

Initialised in `apps/core-api/src/lib/telemetry.ts` — **must be imported
before any other module** (OTel monkey-patches `http`):

```typescript
// apps/core-api/src/lib/telemetry.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sampleRate = parseFloat(process.env.OTEL_TRACE_SAMPLE_RATE ?? '1.0');

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'core-api',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://tempo:4317',
  }),
  sampler: new TraceIdRatioBasedSampler(sampleRate),
  instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
});

sdk.start();
```

### Environment Variables

| Variable                      | Default             | Description                           |
| ----------------------------- | ------------------- | ------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4317` | Tempo OTLP receiver endpoint          |
| `OTEL_TRACE_SAMPLE_RATE`      | `1.0` (100% in dev) | Head-based sampling ratio (0.0 – 1.0) |
| `OTEL_SERVICE_NAME`           | `core-api`          | Service name in trace attributes      |

### Fail-Open Guarantee (NFR-013)

The `BatchSpanProcessor` (default in `NodeSDK`) uses a bounded queue with
drop-on-full policy. If Tempo is unreachable:

1. Spans accumulate in the in-memory queue (default 2048 spans).
2. When the queue is full, new spans are dropped silently.
3. The core API continues processing requests with zero latency impact.
4. No exceptions propagate to request handlers.

This satisfies NFR-013: "Observability stack failure must not crash core API."

---

## Consequences

### Positive

- **Minimal complexity**: One fewer Docker service. `docker-compose up` starts
  Tempo directly; no Collector config to maintain.
- **Low latency**: Spans travel directly from app to Tempo — no intermediary hop.
- **Standard ecosystem**: Grafana Tempo's built-in query API, Grafana data
  source, and trace visualisation all work out of the box.
- **W3C compliance**: `@opentelemetry/sdk-node` automatically propagates
  `traceparent` and `tracestate` headers on all outbound HTTP requests,
  replacing the custom `X-Trace-ID` header (FR-013).
- **Automatic instrumentation**: HTTP and Fastify instrumentations auto-create
  spans for every request — no manual span creation needed for basic coverage.
- **Non-breaking upgrade path**: Adding the Collector later is a config change
  (`OTEL_EXPORTER_OTLP_ENDPOINT`), not a code change.

### Negative

- **No tail-based sampling**: Head-based sampling (`TraceIdRatioBasedSampler`)
  decides at trace start whether to sample. Error traces may be dropped in
  production if sampling rate is low. Mitigated by: always-sample in dev
  (`OTEL_TRACE_SAMPLE_RATE=1.0`), and revisiting when the Collector is added.
- **Single backend**: Cannot fan-out to multiple trace backends without the
  Collector. Acceptable for Phase 1.
- **Application coupling**: App process directly connects to Tempo. If Tempo
  is temporarily down, spans are lost (not buffered to disk). Acceptable:
  traces are diagnostic data, not business-critical.

### Neutral

- **Six new npm packages** added to `apps/core-api`. All are from the official
  `@opentelemetry` organisation with >100k weekly downloads. This is the
  minimum viable set for HTTP + Fastify instrumentation with OTLP export.
- **Import order matters**: `telemetry.ts` must be the first import in
  `index.ts` for monkey-patching to work. This is documented and enforced
  by an ESLint `import/order` rule.

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                                                        |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 2.1 (Approved Stack)    | ✅        | Architecture §7.2 already mandates "OpenTelemetry with Jaeger exporter". Tempo replaces Jaeger as the backend (both support OTLP).           |
| Art. 2.2 (Dependency Policy) | ✅        | This ADR IS the required approval. All 6 packages are from `@opentelemetry` org (>100k weekly downloads), TypeScript-typed, zero known CVEs. |
| Art. 3.1 (Microservices)     | ✅        | Distributed tracing is purpose-built for microservice architectures — traces cross service boundaries via `traceparent` propagation.         |
| Art. 5.2 (No PII)            | ✅        | Trace attributes include `tenant.id` (UUID) and `user.id` (UUID) but never email, name, or other PII (NFR-016).                              |
| Art. 6.3 (Logging)           | ✅        | Pino logs enriched with `traceId` and `spanId` from OTel context — enables log-trace correlation (FR-019).                                   |
| Art. 9.2 (Monitoring)        | ✅        | Distributed tracing is a core monitoring requirement. This ADR delivers the tracing infrastructure.                                          |

---

## Follow-Up Actions

- [ ] Create `apps/core-api/src/lib/telemetry.ts` with SDK initialisation (T012-12)
- [ ] Add `@opentelemetry/*` packages to `apps/core-api/package.json` (T012-17)
- [ ] Import `telemetry.ts` as first import in `apps/core-api/src/index.ts` (T012-16)
- [ ] Replace `X-Trace-ID` with `traceparent` in `plugin-hook.service.ts` (T012-15)
- [ ] Enrich Pino logger with `traceId`/`spanId` from OTel context (T012-14)
- [ ] Add Tempo service to `docker-compose.yml` (T012-03)
- [ ] Evaluate OTel Collector for production-hardening spec (deferred)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **Architecture §7.2**: Mandates "OpenTelemetry with Jaeger exporter" — this
  ADR updates the backend to Tempo (OTLP-native) while keeping OTel SDK.
- **Spec 012 OQ-001**: This ADR resolves the Open Question.
- **ADR-019**: Pluggable Container Adapter — plugin containers expose HTTP
  endpoints that will carry `traceparent` headers.
- **ADR-023**: SSE for notifications — SSE connections will carry trace context
  for the initial HTTP upgrade request.
