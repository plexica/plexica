# ADR-028: Automatic Prisma Client Generation Without a Database

> Architectural Decision Record for making the generated tenant Prisma client
> types always present (PR review branch `review/codebase-revision`).

| Field | Value |
| --- | --- |
| Status | Accepted |
| Author | forge-architect |
| Date | 2026-08-11 |
| Deciders | Plexica Team |

**Driver**: `lib/tenant-database.ts` imports the generated tenant client behind
`@ts-ignore` because `prisma/generated/` is gitignored. The type erasure
propagates to the entire tenant data path: 179 occurrences of `as any` /
`tenantDb: unknown`, 5 identical bridge functions, 50 `eslint-disable`
directives. No schema error on the tenant path is caught at compile time.
**Related**: ADR-027 (tenant DB client cache), AGENTS.md "TypeScript strict
mode obbligatorio".

## Context

The generated tenant Prisma client (`prisma/generated/tenant-client/`) is
gitignored — a deliberate choice, because it contains platform-specific
binaries (`libquery_engine-debian-openssl-3.0.x.so.node`,
`query_engine_bg.wasm`) that have no place in version control.

The consequence: on a fresh clone, or on any machine where
`pnpm db:generate` has not been run, the import at
`lib/tenant-database.ts:31` resolves to a missing module and `@ts-ignore`
collapses the type to `any`. Every consumer of the tenant client inherits
the erasure.

The `db:generate` script wraps the command in `dotenv -e ../../.env`,
suggesting that a reachable database is required. **Verified empirically:
it is not.** `prisma generate --schema=prisma/tenant-schema` with a fake
`DATABASE_URL` (`postgresql://x:x@localhost:0/x`) completes in 263 ms and
produces correct types — the command reads only the schema file and never
opens a connection.

## Options Considered

### A. Commit the generated types

**Rejected.** The generated directory is 22 MB and contains
platform-specific binaries (`.so.node` for `debian-openssl-3.0.x`, `.wasm`).
Committing only the `.d.ts` files would create a silent drift risk between
the stub and the real client; committing the whole directory pollutes the
repository with artifacts that are wrong on any other platform. Both are
recognised anti-patterns (build artifacts do not belong in git).

### B. Automatic generation via `prepare` script, without a database (chosen)

Make generation part of the install lifecycle:

1. `db:generate` drops the `dotenv -e ../../.env` wrapper — it is not needed
   (the command never connects)
2. A `prepare` script in `services/core-api/package.json` runs
   `pnpm db:generate` automatically after `pnpm install`

Types are then always present after install, on every machine, without any
manual step, without a database, and without committing binaries.

### C. Versioned `.d.ts` stub

**Rejected.** A hand-maintained stub can silently diverge from the real
generated client, producing false confidence — the exact failure mode this
ADR exists to eliminate.

## Decision

1. **`db:generate`** in `services/core-api/package.json` becomes:

   ```json
   "db:generate": "prisma generate && prisma generate --schema=prisma/tenant-schema"
   ```

   No `dotenv` wrapper. A placeholder `DATABASE_URL` is provided inline so
   the command works on machines without `.env`:

   ```json
   "db:generate": "DATABASE_URL=postgresql://x:x@localhost:0/x prisma generate && DATABASE_URL=postgresql://x:x@localhost:0/x prisma generate --schema=prisma/tenant-schema"
   ```

2. **`prepare`** script added to `services/core-api/package.json`:

   ```json
   "prepare": "pnpm db:generate"
   ```

   pnpm runs `prepare` automatically after `pnpm install`, so the generated
   client exists on every machine after install, with no manual step.

3. CI **no longer** runs `pnpm --filter core-api db:generate` explicitly. The
   `prepare` script covers it; keeping the explicit step would mask a breakage
   of the mechanism this ADR introduces. A verification step is in place
   instead: after `pnpm install`, CI asserts
   `test -f services/core-api/prisma/generated/tenant-client/index.d.ts`, so a
   `prepare` failure fails the pipeline exactly where a fresh clone would.

## Consequences

### Positive

- The generated types are always present after `pnpm install`, on every
  machine, on fresh clones, and in cold CI — without a database
- The `@ts-ignore` imports can be removed (follow-up): the type they hide is
  now always real, so the compiler sees it
- Eliminates the conditional type erasure documented in
  `tenant-database.ts:41-64` — the guarantee no longer depends on whether
  someone has run a manual command
- No binaries or generated artifacts in git

### Negative / Trade-offs

- `pnpm install` now takes ~1 s longer (two `prisma generate` invocations)
- The `prepare` script runs on every install, including when the schema has
  not changed (idempotent, fast enough to be negligible)

### Scope of this change

This ADR covers **both** halves of the problem, because one without the other
is useless:

1. **Types always present** (the `prepare` script above) — removes the
   precondition for type safety
2. **Eliminate the type erasure at the call sites** — removes the `as any` /
   `tenantDb: unknown` declarations that currently defeat it

Part 2 is the larger work: every repository function that receives the tenant
client must declare it as `TenantPrismaClient | Prisma.TransactionClient`
instead of `unknown`, and the 5 identical bridge functions
(`function db(x: unknown): any`) and the `eslint-disable` directives they
require are deleted. Once the generated type is always present, `tsc` can
finally check the tenant data path — and it may surface **real pre-existing
bugs** hidden by the casts. That cleanup is included in this change, not
deferred: with the types present, keeping the casts would be choosing to keep
the blindfold on.

### Validation

- `pnpm install` on a fresh clone must produce `prisma/generated/` and a
  green `tsc --noEmit` without any manual command and without a database
- CI typecheck step must pass with the same flow
- Existing unit and integration suites must pass unchanged
- `grep -rn "tenantDb: unknown\|as any" services/core-api/src/modules/`
  must return zero matches after the change (test files excluded)
