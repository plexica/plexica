# ADR-008: TypeScript Core, Polyglot Plugin Backends

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

What language(s) should the core platform and plugin backends use? The project has a 5-7 month budget with a small team. Plugin developers may want to use different languages depending on their expertise and workload characteristics.

## Decision

- **Core platform**: TypeScript on Node.js. The entire core backend — API server, services, migration runner, plugin orchestration — is TypeScript.
- **Plugin backends**: Polyglot. Plugin backends can be written in any language (TypeScript, Rust, Python, Go, etc.) as long as they implement the plugin HTTP contract.

### Plugin Backend Contract

- Plugin backend is a standalone HTTP server.
- Receives requests from core via proxy with standard headers: `X-Tenant-ID`, `X-User-ID`, `X-Workspace-ID`, `X-Locale`.
- Exposes an OpenAPI spec for its endpoints.
- Subscribes to platform events via standard Kafka consumer libraries (ADR-004).
- Core proxies tenant-app requests to the plugin backend: `/api/plugins/{slug}/*` routes to the plugin's HTTP server.

### Why TypeScript for Core

- I/O-bound workload (HTTP, DB, Redis, Kafka) — Node.js async model is a natural fit.
- Key libraries are TypeScript-first: Prisma ORM, Keycloak Admin SDK, KafkaJS, Fastify.
- Same language as the frontend — shared types and Zod validation schemas across the stack.
- 5-7 month budget does not accommodate the learning curve or development velocity cost of a systems language for CRUD-heavy core logic.

### Why Polyglot for Plugins

- Plugin developers should not be forced into TypeScript.
- Performance-critical plugins (data processing, ML inference) benefit from Rust or Python.
- The HTTP contract is language-agnostic by design.
- Kafka client libraries exist for every major language.
- Enterprise customers may have existing services in other languages to wrap as plugins.

## Consequences

### Positive

- Fast core development with a mature, well-known ecosystem.
- Shared types between backend and frontend reduce integration bugs.
- Polyglot plugin support maximizes the potential developer ecosystem.
- Standard HTTP contract makes plugin development accessible and testable.

### Negative

- Plugin SDK must be maintained per language (start with TypeScript; add Python and Rust SDKs later).
- HTTP overhead for core-to-plugin communication vs. in-process calls.
- Different testing and debugging approaches per plugin language.

### Risks

- **Plugin SDK divergence across languages**: Mitigate with contract tests generated from the OpenAPI spec. The TypeScript SDK is the reference implementation; other SDKs are validated against the same contract test suite.
- **Performance ceiling for TypeScript core**: Mitigate by extracting hot paths to dedicated Rust or Go services later if profiling identifies bottlenecks. The HTTP-based architecture makes this a non-breaking change.

## Alternatives Considered

### Rust for Core

- Higher performance ceiling for CPU-bound work.
- Rejected: 5-7x longer development time for typical web/CRUD logic, smaller ecosystem for SaaS tooling (ORM, auth SDKs, admin libraries), steep learning curve for the current team.

### Go for Core

- Good concurrency model and performance.
- Rejected: no Prisma equivalent, weaker Keycloak SDK support, no shared types with the React frontend.

### TypeScript-Only Plugins

- Simpler SDK story — one language, one SDK.
- Rejected: limits the plugin developer pool, prevents using the best tool for each job (e.g., Python for ML, Rust for data pipelines). The HTTP contract adds minimal complexity compared to the ecosystem benefit.
