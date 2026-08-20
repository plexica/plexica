# ADR-029: `@plexica/api-types` — Shared API Contract Package

> Architectural Decision Record for a shared package that publishes the
> platform's API response types, generated from the backend Zod schemas
> (codebase review `review/codebase-revision`, finding 03#12).

| Field | Value |
| --- | --- |
| Status | Accepted |
| Author | forge-architect |
| Date | 2026-08-18 |
| Deciders | Plexica Team |
| Spec | — (codebase review, `review/codebase-revision`) |

**Related**: ADR-019 (Plugin SDK & OpenAPI Architecture), Decision 4
(pagination unification), AGENTS.md "Un solo pattern per tipo di operazione".

## Context

The frontend apps (`apps/web`, `apps/admin`) and the backend
(`services/core-api`) share a contract: the shape of HTTP response bodies.
Today that contract is enforced by **hand-mirrored TypeScript interfaces** —
668 lines across 10 files in two apps, each carrying a comment like
*"Mirrors backend Zod schemas"*.

No tool generates these types from the backend Zod schemas that are the
actual source of truth. The result is the class of bug the review flags as
**factual discrepancy**: the Kafka status endpoint
(`/api/v1/admin/system/kafka`) has **four divergent definitions**:

1. `kafka-schemas.ts` (Zod, never wired to the route): `{ consumers, totalLag, dlqSizes, warnings }`
2. `kafka-status.service.ts` (service, never called by the route): `{ brokers, consumerLags, dlqDepth }`
3. `kafka-status.routes.ts` (the active handler): `{ consumers, totalLag, activeConsumerGroups }`
4. `admin-types.ts` (frontend): `{ brokers, consumerLags, dlqDepth }`

The frontend reads `brokers`, `consumerLags`, `dlqDepth` but the endpoint
returns `consumers`, `totalLag`, `activeConsumerGroups`. **The super-admin
Kafka page renders `undefined` for every field** — a silent runtime failure
that TypeScript cannot catch because the types are disconnected.

The same pattern (hand-mirrored types drifting from the backend) exists for
pagination (closed by Decision 4), audit log entries, tenant list items,
plugin catalog rows, and health check responses.

## Decision

Create a new `@plexica/api-types` package under `packages/api-types/` that
holds the **Zod response schemas** and their derived TypeScript types
(`z.infer<typeof Schema>`). Both frontend apps and the backend import from
this package.

### Package scope

- **Exports**: Zod schemas for API **response bodies** + their `z.infer`
  types. Example: `TenantListResponseSchema` and `TenantListResponse`.
- **Does NOT export**: request validation schemas (query params, body
  inputs) that carry backend-internal constraints (e.g. per-endpoint
  `max` limits on `pageSize`). Those stay in the backend modules.
- **Does NOT export**: Prisma types, service-internal types, error classes.
  Those are backend implementation details.

### Tier separation preserved

The package is a **third tier** — not the backend, not the apps. It depends
only on `zod`. Neither `apps/*` depends on `services/core-api` nor the
reverse: both depend on `@plexica/api-types`. The existing architectural
boundary is preserved.

### Runtime vs type-only imports

- **Backend**: imports the Zod schemas at runtime (for response validation
  where applicable) and the types for return type annotations.
- **Frontend**: imports the types via `import type` — Zod does not enter
  the client bundle unless the app explicitly wants runtime validation
  (optional, per feature).

### Kafka bug fix (immediate)

As part of this ADR, the Kafka status endpoint is aligned on a single
canonical shape, defined in `@plexica/api-types`:

```ts
{
  brokers: string[],
  consumers: Array<{ pluginSlug: string; tenantSlug: string | null; lag: number; topic: string }>,
  totalLag: number,
  dlqDepth: number,
  activeConsumerGroups: number,
}
```

The route handler calls the service (which already computes `brokers` and
`dlqDepth`), the service returns the canonical shape, the schema validates
it, and the frontend imports the type. Four definitions collapse to one.

## Alternatives Considered

| Alternative | Tradeoff | Verdict |
| --- | --- | --- |
| **Hand-written types in `@plexica/api-types`** (no Zod generation) | Simpler package, but sync is manual — the exact bug we are fixing can recur | Rejected — defeats the purpose |
| **Fix Kafka only, defer the package** | Closes the immediate bug, leaves the structural problem | Rejected — the review explicitly flags this as requiring an ADR, and the same bug class exists for every response type |
| **Generate from OpenAPI instead of Zod** | Language-agnostic, but adds a codegen step and the backend doesn't have an OpenAPI spec for admin endpoints yet | Deferred (DD-005) — OpenAPI codegen is worth evaluating post-v1.0 when the API surface is stable |

## Consequences

- **New core package**: `packages/api-types/` added to the pnpm workspace.
  Both `apps/web` and `apps/admin` declare it as a dependency. The backend
  (`core-api`) also depends on it.
- **Schema extraction**: response Zod schemas move from
  `services/core-api/src/modules/*/schemas/` to
  `packages/api-types/src/`. The backend imports them. Request schemas stay
  in the backend.
- **Frontend type cleanup**: `apps/admin/src/types/admin-types.ts` (199
  lines) and the duplicated types in `apps/web/src/types/` are replaced by
  imports from `@plexica/api-types`. ~668 lines of duplicated types
  collapse to `import type { ... } from '@plexica/api-types'`.
- **Kafka page fixed**: the super-admin Kafka status page stops rendering
  `undefined` and shows real broker list, consumer lag, and DLQ depth.
- **Rule 3 compliance**: one pattern for API response types — derived from
  the single source of truth (Zod schemas in `@plexica/api-types`).
- **Build coupling**: a change to a response schema in `@plexica/api-types`
  requires rebuilding dependents. In a pnpm workspace this is automatic
  (symlinked). No publish step needed in the monorepo.

## Constitution Compliance

| Rule | Status |
| --- | --- |
| Rule 3: One pattern per operation | **COMPLIANT** — one source of truth for API response types |
| Rule 5: ADR for core dependency | **COMPLIANT** — this ADR documents the new `@plexica/api-types` package |
