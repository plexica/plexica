# ADR-027: LRU Cache of TenantPrismaClient per Schema

> Architectural Decision Record for the tenant database connection pooling
> fix (PR review branch `review/codebase-revision`).

| Field | Value |
| --- | --- |
| Status | Accepted |
| Author | forge-architect |
| Date | 2026-08-11 |
| Deciders | Plexica Team |

**Driver**: `withTenantDb` creates a new `PrismaClient` per call (67 call
sites, 4+ per request), each opening its own connection pool — the most
impactful runtime finding of the codebase review. Rule 5 requires an ADR for
infrastructure changes.
**Related**: ADR-003 (schema-per-tenant), ID-001 (search_path approach
abandoned), NFR-01 (P95 < 50 ms).

## Context

Every call to `withTenantDb()` in
`services/core-api/src/lib/tenant-database.ts` does this:

```ts
const tenantDb = new TenantPrismaClient({ datasources: { db: { url } } });
try { return await fn(tenantDb); } finally { await tenantDb.$disconnect(); }
```

Each `new PrismaClient()` opens its own connection pool (default
`connection_limit = num_cpus * 2 + 1`), performs a full TCP + TLS + auth
handshake with PostgreSQL, and pays full teardown on `$disconnect()`.

A single tenant-scoped request traverses **at least 4** of these:

1. `middleware/user-profile-resolver.ts` — upsert of the user profile
2. `middleware/abac.ts` — ABAC evaluation
3. `middleware/abac.ts` — decision logging
4. The route handler itself

The worst case is `modules/plugin/services/runtime-recovery.service.ts`,
which iterates `for (const tenant)` → `for (const installation)` calling
`withTenantDb` inside the loop — O(tenant × installations) connections for a
single recovery job.

With 20 concurrent requests and the default connection limit, PostgreSQL
`max_connections` is trivially exhausted.

## Options Considered

### A. LRU cache of `TenantPrismaClient` per schema (chosen)

Keep a bounded `Map<schemaName, TenantPrismaClient>` at module level, with
LRU eviction and TTL. The signature of `withTenantDb` stays identical — all
67 call sites are unaffected.

- Eliminates connect/disconnect per call (tens of ms + handshake per
  request)
- Removes the `max_connections` exhaustion risk
- Makes possible transactions currently split across separate clients
  (e.g. `visibility.routes.ts` validates ABAC on one client and writes on
  another — a real TOCTOU window)
- Bounded: eviction policy prevents unbounded growth

### B. Singleton `prisma` + `$transaction` with `SET LOCAL search_path`

**Rejected.** This is the approach the codebase already tried and abandoned
(see the architecture note in `tenant-database.ts`): the core Prisma client
only knows core-schema models and cannot access tenant-schema models
(`workspace`, `workspaceMember`, …). Every query would become
`$queryRawUnsafe`, losing Prisma's type safety and autocompletion — exactly
the regression we are eliminating elsewhere.

### C. PgBouncer in transaction mode

**Rejected.** The problem is in the code (creating a client per call), not
in the database. PgBouncer would mask the symptom without curing the cause,
adds a new operational dependency, requires careful transaction-mode
configuration (no session state, no prepared statements), and does not cover
the plugin containers, which already connect directly to PostgreSQL per
schema.

## Decision

Implement a **bounded LRU cache** of `TenantPrismaClient` instances, keyed
by `schemaName`, at module level in `tenant-database.ts`.

Policy:

- **Cap**: maximum 100 entries (configurable via `TENANT_DB_CACHE_MAX`)
- **Eviction**: least-recently-used on read access; evicted entries are
  `$disconnect()`ed
- **TTL**: entries idle for more than 10 minutes are disconnected and
  evicted (configurable via `TENANT_DB_CACHE_TTL_MS`)
- **Invalidation**: `invalidateTenantDbClient(schemaName)` exported for the
  tenant deprovisioning path — dropping a schema while a client holds
  connections to it would produce errors on next use
- **Shutdown**: `disconnectAllTenantDbClients()` called from
  `stopBackgroundServices()` so `SIGTERM` closes all pools cleanly

The `?schema=<name>` URL parameter mechanism is unchanged — each cached
client is bound to exactly one schema, so there is no `search_path` leak
between tenants.

## Consequences

### Positive

- Eliminates 3–4 full TCP + TLS + auth handshakes per request
- Removes the concrete risk of `max_connections` exhaustion in production
- Directly improves P95 latency on every tenant-scoped endpoint (NFR-01)
- Enables future single-transaction patterns (e.g. closing the TOCTOU in
  `visibility.routes.ts`)

### Negative / Trade-offs

- A bounded cache keeps N pools open: the cap and TTL are required, not
  optional, otherwise the problem moves rather than disappears
- The tenant deprovisioning path must invalidate the cache entry — covered
  by a new integration test
- The change is invasive in behaviour (67 call sites indirectly), though the
  function signature is identical

### Validation

- Existing cross-tenant isolation tests (`cross-tenant-isolation.test.ts`)
  must pass unchanged — they verify that a client for schema A never sees
  schema B's data
- New tests: eviction on cap, TTL expiry, invalidation on deprovisioning,
  concurrent access to the same schema
- Full integration suite green with the cache enabled
