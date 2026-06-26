# ADR-019: Plugin SDK & OpenAPI Architecture

**Status**: Proposed
**Date**: 2026-06-26
**Driver**: DR-20 from Spec 004 (Plugin System) — Plugin Developer SDK Design
**Extends**: ADR-008 (TypeScript Core + Polyglot Plugins)
**Deciders**: TBD

## Context

Plugin developers need a straightforward SDK to build plugin backends that
integrate with the Plexica platform. The SDK must handle:

1. **Event subscription**: Listening to platform domain events from Kafka
2. **API proxying**: Receiving proxied HTTP requests from the core API
3. **Context access**: Reading tenant, user, and workspace context from headers
4. **Database access**: Querying plugin-specific tables in the tenant schema
5. **Event emission**: Publishing custom events back to the platform

ADR-008 established that plugin backends are polyglot (TypeScript, Rust, Python,
Go, etc.), communicating via HTTP contract. The SDK strategy must support this
polyglot reality without imposing a maintenance burden proportional to the
number of languages.

v1's SDK had 6 classes requiring deep knowledge of internal patterns. The v2
design consolidates to a single `PluginSDK` class with constructor injection
(per v1 Lesson #9: "constructor injection over hidden dependencies").

Options considered:
- **TypeScript-only SDK**: One SDK, best DX for TypeScript developers, but
  locks out Rust/Python/Go plugin developers
- **SDK per language**: TypeScript SDK, Python SDK, Rust SDK, Go SDK — best
  DX for each language, but 4x maintenance burden
- **TypeScript SDK + OpenAPI contract**: Primary SDK in TypeScript with an
  OpenAPI 3.1 contract defining the HTTP interface that all backends must
  implement, regardless of language

## Decision

**TypeScript SDK (`@plexica/sdk`) as primary SDK + OpenAPI 3.1 contract for
polyglot backends.**

### TypeScript SDK: `@plexica/sdk`

A single `PluginSDK` class with constructor injection:

```typescript
import { PluginSDK } from '@plexica/sdk';

const sdk = new PluginSDK({
  db: prisma,               // PrismaClient instance (tenant-scoped)
  kafka: kafkaClient,       // KafkaJS client
  pluginId: 'crm',          // Plugin slug
  installId: 'uuid-...',    // Installation ID
});

// Event subscription
sdk.onEvent('plexica.workspace.created', async (event) => {
  // event.payload has full type safety
});

// API call to core
const user = await sdk.callApi('GET', '/api/v1/users/123');

// Context access (from injected headers)
const ctx = sdk.getContext();
// → { tenantId, userId, workspaceId, userRole, correlationId }

// Database access via injected PrismaClient
const contacts = await sdk.getDb().crm_contacts.findMany();

// Event emission
await sdk.emitEvent('crm.contact.created', { contactId: '123' });
```

Key design principles:
- **Constructor injection**: All dependencies are passed in at construction
  time. No hidden imports, no global state, no environment variable reads inside
  the SDK. Fully testable — pass mock `db` and `kafkaClient` in tests.
- **Type-safe event payloads**: Event type definitions are generated from the
  platform's event schema. `onEvent('plexica.workspace.created', handler)` has
  full TypeScript type safety for the handler's `event` parameter.
- **Automatic header propagation**: `callApi()` automatically injects
  `X-Plexica-Tenant-Id`, `X-Plexica-User-Id`, `X-Plexica-Workspace-Id`,
  `X-Plexica-User-Role`, and `X-Plexica-Correlation-Id` headers from the
  current request context.
- **Connection pooling**: 5 database connections per plugin instance, configurable
  via `PLUGIN_DB_POOL_SIZE` environment variable in the plugin container.

### OpenAPI 3.1 Contract: `plexica-plugin-contract.yaml`

Every plugin backend (TypeScript, Rust, Python, Go, etc.) must implement three
standard endpoints. The OpenAPI contract defines these as the minimum interface:

```yaml
openapi: 3.1.0
info:
  title: Plexica Plugin Backend Contract
  version: 1.0.0

paths:
  /_plexica/health:
    get:
      summary: Liveness + readiness probe
      responses:
        '200':
          description: Plugin is alive and ready
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [healthy, degraded]
                  uptime:
                    type: number
                    description: Seconds since startup
                  dbConnected:
                    type: boolean
                  kafkaConnected:
                    type: boolean
        '503':
          description: Plugin is alive but not ready (e.g., DB/Kafka disconnected)

  /_plexica/ready:
    get:
      summary: Readiness probe (lighter than /health)
      responses:
        '200':
          description: Ready to receive traffic
        '503':
          description: Not ready

  /_plexica/event:
    post:
      summary: Receive a platform event
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                eventType:
                  type: string
                  example: plexica.workspace.created
                eventId:
                  type: string
                  format: uuid
                timestamp:
                  type: string
                  format: date-time
                payload:
                  type: object
      responses:
        '200':
          description: Event processed successfully (ACK — offset committed)
        '500':
          description: Processing failed (NACK — event will be retried)
```

### Standard Request Headers

Every proxied API call (core → plugin) injects these headers:

| Header | Type | Description | Example |
|---|---|---|---|
| `X-Plexica-Tenant-Id` | UUID | Tenant identifier | `550e8400-e29b-...` |
| `X-Plexica-User-Id` | UUID | Authenticated user | `6ba7b810-9dad-...` |
| `X-Plexica-Workspace-Id` | UUID | Current workspace (nullable for tenant-level ops) | `3fa85f64-5717-...` |
| `X-Plexica-User-Role` | string | Effective role in current workspace | `admin`, `member`, `viewer` |
| `X-Plexica-Correlation-Id` | UUID | Request trace for distributed logging | `a1b2c3d4-e5f6-...` |

These are the same headers defined in ADR-008 and ADR-013. The SDK reads them
via `getContext()` and the OpenAPI contract documents them as required incoming
headers.

### SDK Package Structure

```
packages/sdk/
  src/
    index.ts              # Public API surface
    PluginSDK.ts          # Main class (< 200 lines per Rule 4)
    context.ts            # Context extraction from headers
    events.ts             # Event subscription + emission
    api.ts                # callApi() with auth propagation
    types.ts              # Generated event payload types
    errors.ts             # SDK-specific error types
  package.json
  tsconfig.json
  README.md
```

### Polyglot Backend Guidance

Non-TypeScript plugin backends do not use `@plexica/sdk`. Instead, they:

1. **Implement the three OpenAPI contract endpoints** (`/_plexica/health`,
   `/_plexica/ready`, `/_plexica/event`)
2. **Consume Kafka events** using a language-native Kafka client (rdkafka for
   Rust, confluent-kafka-python for Python, sarama for Go)
3. **Read standard headers** from incoming proxied requests
4. **Connect to PostgreSQL** using a language-native driver with the injected
   `DATABASE_URL` environment variable (per ADR-017)

The OpenAPI contract serves as the "SDK" for non-TypeScript languages — it's a
machine-readable specification that can generate client stubs via OpenAPI
Generator for any language.

### Event Type Schema Generation

Event payload types for the TypeScript SDK are generated from the platform's
event schema definitions. The generation pipeline:

```
services/core-api/src/events/*.ts  (event definitions)
  → CLI: pnpm generate-event-types
    → packages/sdk/src/types.ts    (generated, never hand-edited)
```

This ensures the SDK's type definitions never drift from the platform's actual
event schemas. Plugin developers get compile-time errors if they access
non-existent event payload fields.

## Consequences

### Positive
- **Single source of truth for TypeScript plugins**: `@plexica/sdk` is the
  one and only way to build TypeScript plugin backends. No competing patterns
  (consistent with Constitution Rule 3: one pattern per operation type).
- **Polyglot support without SDK fragmentation**: The OpenAPI contract is
  language-agnostic. Every language ecosystem has OpenAPI code generators.
  The platform maintains one contract, not N SDKs.
- **Constructor injection for testability**: Dependencies are explicit. Plugin
  code can be tested with mock `db` and `kafkaClient` instances. No mocking
  of hidden globals or environment variables.
- **Generated type safety**: Event types are generated from platform schemas.
  SDK users get autocomplete and compile-time type checking for all event
  payloads.
- **Standard health contract**: Every plugin backend exposes the same health
  endpoints, enabling uniform monitoring, circuit breaking, and readiness
  gating from the core platform (per ADR-013).

### Negative
- **TypeScript SDK is TypeScript-only**: Rust/Python/Go developers get an
  OpenAPI contract, not a library. They must implement Kafka consumption,
  header parsing, and database connectivity themselves. An OpenAPI-generated
  client can handle the HTTP contract, but Kafka and DB integration require
  manual implementation.
- **SDK version coupling**: The SDK must stay compatible with the platform's
  event schemas and API contract. A platform upgrade that changes event payloads
  requires an SDK version bump. Mitigated by semantic versioning of event
  schemas (per ADR-004) and the SDK's version compatibility matrix.
- **Generated file maintenance**: `types.ts` is generated. If the generation
  CLI is not run after event schema changes, the SDK will have stale types.
  Mitigated by CI validation that checks for type drift.

### Neutral
- **OpenAPI contract is a separate artifact**: The `plexica-plugin-contract.yaml`
  lives in the repository alongside the SDK. It must be updated when the plugin
  contract changes. This is a small documentation maintenance cost.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **SDK per language** | TypeScript SDK + Python SDK + Rust SDK + Go SDK | Best DX for each language; language-idiomatic APIs | 4x maintenance; feature drift between SDKs; each SDK needs its own event type generation; test suite multiplied by number of languages | Rejected — unsustainable maintenance burden for a small team (5-7 month total budget) |
| **TypeScript-only SDK** | `@plexica/sdk` as the only integration path | Simplest maintenance; best TypeScript DX | Locks out Rust/Python/Go developers; contradicts ADR-008 polyglot plugin decision; limits plugin ecosystem growth | Rejected — violates ADR-008's polyglot commitment |
| **gRPC contract instead of OpenAPI** | gRPC service definition for plugin contract | Type-safe contract; efficient binary serialization | gRPC ecosystem is smaller than REST/OpenAPI; tooling less mature in some languages; HTTP/2 requirement adds infrastructure complexity; harder to inspect/debug than JSON-over-HTTP | Rejected — REST/JSON with OpenAPI is more accessible for plugin developers |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 3: One pattern per operation | **COMPLIANT** | `@plexica/sdk` is the single way to build TypeScript plugin backends. The OpenAPI contract is the single interface for polyglot backends. |
| Rule 4: File size | **COMPLIANT** | SDK files are designed to stay under 200 lines each (PluginSDK.ts, context.ts, events.ts, api.ts, types.ts, errors.ts). |
| Rule 5: ADR for core dependency | **COMPLIANT** | `@plexica/sdk` is a new core package. This ADR documents its architecture. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — HTTP contract for plugin communication. The SDK is the TypeScript implementation of this contract. |
| Technology Stack | **COMPLIANT** | Uses existing stack technologies: TypeScript, Fastify (health endpoints), KafkaJS (event consumption), Prisma (DB access). No new dependencies. |

## Related Decisions

- **ADR-008: TypeScript Core + Polyglot Plugins** — Establishes the polyglot
  plugin model. This ADR defines the SDK and contract that enables it.
- **ADR-013: Container Hosting Model** — The SDK's connection pooling (5 per
  instance) and environment variable injection (`DATABASE_URL`) are consumed
  by the container hosting model.
- **ADR-017: Plugin DB Access Restriction** — The SDK's `getDb()` method uses
  the Prisma client connected with the restricted PostgreSQL role from ADR-017.
  The SDK does not need to know about role restrictions — PostgreSQL enforces them.
- **ADR-004: Kafka/Redpanda Event Bus** — The SDK's `onEvent()` and `emitEvent()`
  are wrappers around Kafka consumer/producer APIs.
