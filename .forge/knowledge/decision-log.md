# Decision Log — Plexica v2

> This is the decision log for the Plexica v2 rewrite. It tracks architectural
> decisions, technical debt, deferred decisions, and open questions.
>
> For lessons learned from the v1 codebase, see
> [lessons-learned.md](./lessons-learned.md).

**Last Updated**: 2026-08-21 (ADR-031 final review revision — Keycloak request-host issuer, scoped sidecars, and dual-job runner admission for Spec 010)

---

## Active Decisions

Foundational and current ADR lifecycle states:

| ADR     | Title                                                        | Status   | Date       |
| ------- | ------------------------------------------------------------ | -------- | ---------- |
| ADR-001 | Schema-Per-Tenant PostgreSQL                                 | Accepted | March 2026 |
| ADR-002 | Keycloak Multi-Realm Authentication                          | Accepted | March 2026 |
| ADR-003 | ABAC Tree-Walk for Workspace Isolation                       | Accepted | March 2026 |
| ADR-004 | Kafka/Redpanda Event Bus                                     | Accepted | March 2026 |
| ADR-005 | Module Federation for Plugin UI                              | Accepted | March 2026 |
| ADR-006 | Plugin Tables in Tenant Schema                               | Accepted | March 2026 |
| ADR-007 | Plugin-Brings-Migrations, Core-Executes                      | Accepted | March 2026 |
| ADR-008 | TypeScript Core, Polyglot Plugin Backends                    | Accepted | March 2026 |
| ADR-009 | Better Auth Evaluated and Rejected                           | Accepted | March 2026 |
| ADR-010 | Keycloakify for Keycloak Custom Theme                        | Accepted | April 2026 |
| ADR-011 | Keycloak Admin API Integration for Tenant Auth Configuration | Accepted | April 2026 |
| ADR-012 | Rate Limiting via @fastify/rate-limit                        | Accepted | April 2026 |
| ADR-022 | Super Admin Infrastructure and Data Model                     | Accepted | July 2026  |
| ADR-023 | Admin App PKCE Authentication Migration                      | Accepted | July 2026  |
| ADR-024 | Plugin Installation Service Credentials                      | Accepted | 2026-07-23 |
| ADR-028 | Automatic Prisma Client Generation Without a Database        | Accepted | 2026-08-11 |
| ADR-029 | `@plexica/api-types` — Shared API Contract Package                     | Accepted | 2026-08-18  |
| ADR-030 | `@vitest/coverage-v8` — Coverage Provider for core-api Unit Tests       | Accepted | 2026-08-20  |
| ADR-031 | CI Runtime Contract and Gated Compose Orchestration                     | Accepted | 2026-08-21  |

### ADR Acceptance Records

| ADR | Decision Date | Status | Decision |
| --- | --- | --- | --- |
| ADR-031 | 2026-08-21 | Accepted | Final plan names Keycloak 26 request-host mode (no hostname/proxy headers), manifest-only host provisioning, bounded scoped sidecar identity, and mandatory post-checkout admission in both labelled jobs. |
| ADR-031 | 2026-08-24 | Amended | CI jobs moved to the default `self-hosted` runner per user decision; measured capacity admission retained without the dedicated class marker. |

---

## Implementation Decisions (Spec 002)

| ID     | Decision                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Spec | Date       |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------- |
| ID-001 | `$queryRawUnsafe` for `SET search_path` — controlled exception                            | PostgreSQL does not support parameterized DDL/session statements; `SET search_path` cannot use `$queryRaw` with placeholders. The schema name is derived from the tenant slug, which is validated against `/^[a-z][a-z0-9-]{1,62}$/` before reaching this call. This regex enforces PostgreSQL identifier rules and blocks injection. This is a **documented, intentional exception** to Constitution Rule §Security-3 ("no string interpolation in SQL"). Any future change to this validation must be reviewed for security impact.                                                                                                                                                                                                                                                                                                                        | 002  | April 2026 |
| ID-002 | Generic `INVALID_TENANT_CONTEXT` error code for EC-01 and EC-02                           | Using distinct error codes (`TENANT_REQUIRED` vs `UNKNOWN_TENANT`) allows an unauthenticated caller to enumerate valid tenant slugs via the error response. A single generic code prevents this. The public `GET /api/tenants/resolve` endpoint returns `{ exists: true/false }` with HTTP 200 for the same anti-enumeration reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 002  | April 2026 |
| ID-004 | `requireSuperAdmin()` enforces master realm issuer check                                  | Keycloak tokens can claim any role name. Without an issuer check, a tenant admin who creates a `super_admin` role in their own realm could call `POST /api/admin/tenants`. The fix enforces `request.user.realm === config.KEYCLOAK_MASTER_REALM`. Only tokens issued by the Keycloak master realm are accepted for admin endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 002  | April 2026 |
| ID-005 | Short access token TTL (60s) as the logout token invalidation strategy (AC-3)             | Backchannel logout revokes the refresh token immediately but cannot invalidate a stateless JWT. Three options were evaluated: (a) Redis blacklist — strongest but adds per-request latency; (b) token introspection — similar overhead; (c) short TTL — access token set to 60s, frontend refreshes silently every 55s. Option (c) was chosen: the post-logout exposure window is bounded to ≤60s with no added infrastructure.                                                                                                                                                                                                                                                                                                                                                                                                                              | 002  | April 2026 |
| ID-006 | `GET /api/tenants/resolve` returns 400 for missing or invalid slug (NEW-H-3)              | The endpoint returns 400 (Bad Request) when the `slug` query parameter is absent or fails the `SLUG_REGEX` validation, rather than returning a 200 `{ exists: false }`. This is **intentional security hardening**: a missing parameter is a programming error (the client has a bug) and should be distinguished from a valid-but-unknown slug. The SLUG_REGEX validation also prevents reaching the database with arbitrary input, removing any injection surface. Critically, a 400 vs 200 distinction for format-invalid slugs does not create a meaningful tenant enumeration side-channel — the slug format (`/^[a-z][a-z0-9-]{1,62}$/`) is public knowledge, and format-invalid slugs are trivially distinguishable by the caller without an API call. Only valid-format slugs that do not exist in the database return `{ exists: false }` with 200. | 002  | April 2026 |
| ID-007 | EC-08 "rollback on failure" = PostgreSQL transactional DDL, not application-level cleanup | `prisma migrate deploy` wraps each migration file in a PostgreSQL transaction. A migration that fails mid-way is automatically rolled back by PostgreSQL — the schema is left in the state it was in before that migration started. No application-level rollback code is needed or possible. The `migrateAll()` function's "stop on first failure" behavior (EC-08) means subsequent tenant migrations are skipped, not that any rollback of prior successful migrations is attempted. Prior successfully migrated tenants remain migrated.                                                                                                                                                                                                                                                                                                                 | 002  | April 2026 |
| ID-008 | NFR-02 cache-hit timing test uses < 20ms proxy threshold, not < 10ms spec target          | NFR-02 specifies RS256 verification < 10ms on the cache-hit path. The test in `auth-middleware.test.ts` uses a fake JWT (invalid signature) and measures the total `server.inject()` round-trip including Fastify routing overhead (~5–10ms). The measured value of < 20ms reliably proves no network I/O is occurring (any Keycloak round-trip would add 50–200ms) while giving 2× headroom over the raw jose verification cost. A true NFR-02 measurement requires a valid RS256 token from a live Keycloak instance, deferred to the integration environment (see TODO in the test).                                                                                                                                                                                                                                                                      | 002  | April 2026 |

## Implementation Decisions (Spec 003)

| ID     | Decision                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Spec | Date       |
| ------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| ID-009 | Workspace roles renamed: `workspace_admin`/`editor`/`viewer` → `admin`/`member`/`viewer`                          | ADR-003 uses `workspace_admin`, `editor`, and `viewer` as workspace role names. During Spec 003 plan authoring, these were renamed to `admin`, `member`, and `viewer` for the following reasons: (1) `workspace_admin` is redundant — the workspace context is already established by the API path; `admin` is shorter and equally unambiguous. (2) `editor` implies content editing (wiki, document, file) which is a plugin-level concern, not a core membership role. `member` correctly expresses "this user belongs to this workspace" without implying content-editing privilege. (3) `viewer` is unchanged — the meaning is clear. These three values are enforced via PostgreSQL CHECK constraint on `workspace_member.role` and in all ABAC policy evaluations. ADR-003 is not amended (the ADR describes the tree-walk mechanism, not role name literals); the naming is an implementation detail recorded here. | 003  | April 2026 |
| ID-010 | ABAC unit tests mock `engine-helpers.js` (Redis + DB) to keep tests pure and fast                                 | Importing `engine.ts` without mocking its helpers triggers Redis/DB connections at module load. `vi.mock()` on `engine-helpers.js` intercepts `getMembership` and `getPluginActionOverride`, letting the real `evaluate()` function be tested with zero infrastructure. This is the correct trade-off: integration tests (INT-08/INT-09) cover the Redis cache and DB membership paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 003  | April 2026 |
| ID-011 | Invitation unit tests do not import `invitation/service.ts`; crypto functions tested via `lib/crypto.ts` directly | `invitation/service.ts` imports `config.ts` which validates all required env vars at module load time. In a unit test environment these are not set. The pure logic (token generation, expiry) is accessible via `lib/crypto.ts` without triggering config validation. The expiry calculation is mirrored inline in the test to avoid any import side-effects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 003  | April 2026 |
| ID-012 | E2E tests use `uniqueName(prefix)` timestamp suffix to prevent cross-run fixture collisions                       | Playwright tests create real resources (workspaces, users, templates) in a shared DB. Without unique names, a second run fails with UNIQUE constraint violations. `uniqueName('ws')` appends `Date.now()` so each run generates distinct slugs without requiring DB teardown between runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 003  | April 2026 |
| ID-013 | **Superseded 2026-07-23** — E2E infrastructure failures fail the suite; no graceful skip                          | The earlier `test.skip(!hasKeycloak, ...)` pattern could report green CI without exercising the required real stack, contradicting Constitution Rules 1-2. PR #77 remediation requires infrastructure preflight to fail clearly when unavailable and prohibits conditional skips in blocking E2E.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 003  | April 2026 |
| ID-014 | pnpm overrides for security patch versions — pinned to exact fix versions on hotfix branch                       | Nine Dependabot alerts (CVE-2026-53632, CVE-2026-53571, CVE-2026-53550, CVE-2026-49356, CVE-2026-41305, CVE-2026-6322, CVE-2026-6321, CVE-2026-44665, CVE-2026-41650) addressed via `pnpm.overrides` in root `package.json`. Overrides pinned to exact security-fix versions (not caret ranges) to minimize behavioral change surface on the hotfix branch. See `hotfix/security-vulnerabilities` branch for full mapping. Code scanning alert #9 (missing regex anchor) also fixed in `apps/web/e2e/org-error.spec.ts`. | 002  | June 2026 |

---

## Technical Debt

| ID         | Description                                                                                                                                                                                                                                                                                                                                                                            | Impact                                                                             | Severity | Target                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | ------------------------- |
| TD-001     | `ErrorFallback` component has no error-reporting integration (Sentry or equivalent). Errors caught by React error boundaries are silently discarded — no stack trace is forwarded to an error tracking service. The `_error` prop is intentionally not displayed to users (avoids leaking implementation details) but must be forwarded to error tracking before production.           | All frontend exceptions invisible in production; regression detection blind.       | Medium   | Pre-production            |
| ~~TD-002~~ | ~~`POST /api/admin/tenants` has no rate limiting.~~ **Resolved**: ADR-012 accepted; implementation tracked as a follow-up task.                                                                                                                                                                                                                                                        | —                                                                                  | —        | **Resolved** (April 2026) |
| ~~TD-003~~ | ~~`as any` sprawl throughout backend modules (`tenantDb as any`, DB model casts). Type-erased by design pending `prisma generate` with tenant schema client.~~ **Resolved**: ADR-028 accepted — the `prepare` script makes the generated tenant client always present after `pnpm install` (no database required), the `@ts-ignore`/`as any`/whole-row `as unknown as` casts were replaced by typed mappers and narrowed signatures, and the redundant CI `db:generate` step was removed so the prepare mechanism is not masked. Residual casts are limited to JSON-column narrowing at the domain boundary (e.g. `manifest`/`categories`, `notificationPrefs`) — intentional and documented at each site. | — | — | **Resolved** (2026-08-18) |

---

### Plugin System ADRs (Spec 004)

| ADR | Title | Date | Status | Decision |
| --- | ----- | ---- | ------ | -------- |
| 013 | Container Hosting Model | 2026-06-26 | Accepted | Docker sidecar (dev/CI) + K8s (prod) via Strategy pattern. Dev mode bypasses containers entirely (§10.7). |
| 014 | Hybrid UI Delivery Model | 2026-06-26 | Accepted | MinIO for MF static assets in production; Vite dev server in development. |
| 015 | Plugin Action Extension in ABAC | 2026-06-26 | Accepted | 3-part action keys with structural dispatch in ABAC engine. |
| 016 | Two-Tier Dead Letter Queue | 2026-06-26 | Accepted | Kafka DLQ topic + PostgreSQL `core.dead_letter_queue` table. |
| 017 | Plugin DB Access Restriction | 2026-06-26 | Accepted | PostgreSQL role-level restrictions — GRANT only on declared tables. |
| 018 | Two-Level Plugin Visibility | 2026-06-26 | Accepted | Tenant default (`enabled`) + per-workspace override. |
| 019 | Plugin SDK & OpenAPI Architecture | 2026-06-26 | Accepted | Single `PluginSDK` class + OpenAPI 3.1 contract. |
| 020 | Plugin Reinstall = Update Flow | 2026-06-26 | Accepted | Reinstall = update with additive-only schema changes. |

---

## PR #77 Security Remediation Amendments

| ADR | Amendment Date | Status | Amendment Decision |
| --- | --- | --- | --- |
| ADR-004 | 2026-07-23 | Accepted | Canonical tenant event envelope, tenant partition/filter, transactional outbox, stable IDs/schema version, and per-tenant encrypted Kafka payloads with key destruction. |
| ADR-007 | 2026-07-23 | Accepted | `node-sql-parser` is the approved core dependency for AST migration validation/serialization; textual SQL splitting is prohibited. |
| ADR-016 | 2026-07-23 | Accepted | DLQ tenant/install ownership, source-coordinate dedupe key, targeted DB purge, and cryptographic Kafka payload erasure. |
| ADR-017 | 2026-07-23 | Accepted | Production plugin PostgreSQL URLs require `verify-full` TLS and a dedicated CA; privileged URL parameters are not propagated. |
| ADR-022 | 2026-07-23 | Accepted | Durable fail-closed suspension/reactivation reconciliation and first-step event/credential purge in tenant deletion. |
| ADR-023 | 2026-07-23 | Accepted | One `plexica-api` resource audience is required for master, tenant, and E2E user JWTs. |
| ADR-024 | 2026-07-23 | Accepted | Random, hash-only, expiring/revocable/rotatable plugin installation service credentials with namespace binding. |

Implementation order and gates are defined in
`.forge/architecture/pr-77-security-remediation-plan.md`.

---

## Session Decisions

| ID    | Decision Date | Status   | Decision                                                                                                                                                                                                                                                                                    |
| ----- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SD-01 | 2026-07-31    | Accepted | Integration test failures observed after Dependabot merges were caused by a **degraded dev stack** (PostgreSQL container crash-looping), not by test flakiness or the dependency bumps. With the stack healthy, the full integration suite passes **275/275 twice in a row** (incl. all previously skipped Keycloak/NFR tests). |
| SD-02 | 2026-07-31    | Accepted | `countPluginInstallationsBatch()` must skip tenant schemas missing the `plugin_installations` table (`filterSchemasWithTable`) — real bug found during CI verification, fixed without ADR (internal robustness).                                                                              |
| SD-03 | 2026-07-31    | Accepted | Test helper `ensureTenant()` must apply tenant migrations so freshly seeded schemas contain all DDL tables expected by the code under test — real bug found during CI verification, fixed without ADR (test fixture robustness).                                                              |

**Lesson**: before attributing integration failures to code changes, verify the
dev stack is fully healthy (`docker compose ps` — all services `healthy`, incl.
`keycloak-init` having exited 0). A crash-looping PostgreSQL produces
`PrismaClientInitializationError: FATAL: the database system is shutting down`
and unrelated 404/409 assertion mismatches in tests that otherwise pass in
isolation and in a healthy full run.

---

## Codebase Review — Fase 5 Architectural Decisions

Source: `docs/review/README.md` — Fase 5 lists 10 architectural questions that
require a decision (ADR or product clarification) before any refactor code is
written. This section tracks the resolution of each.

| # | Question | Ref | Resolution | ADR / Note | Date |
| - | -------- | --- | ---------- | ---------- | ---- |
| 1 | How are tenant Prisma clients pooled? | [01#2](../../docs/review/01-backend-moduli.md#2) | **Adopted**: per-schema `TenantPrismaClient` LRU cache with idle eviction | [ADR-027](./adr/adr-027-tenant-db-client-lru-cache.md) | 2026-08-11 |
| 2 | Should generated Prisma types be committed or generated in prebuild? | [02#12](../../docs/review/02-backend-infrastruttura.md#12) | **Adopted**: `prepare` script generates the tenant client on `pnpm install` (no DB needed); types always present | [ADR-028](./adr/adr-028-prisma-generate-without-database.md) | 2026-08-18 |
| 3 | Should `@plexica/sdk` be adopted by the CRM (dogfooding) or removed? | [04#1](../../docs/review/04-packages-condivisi.md#1) | **Implemented**: `examples/plugins/crm` migrated onto `@plexica/sdk` (getDb + onEvent/dispatchEvent). Finding 04#16 closed (getDb typed). | [ADR-019](./adr/adr-019-plugin-sdk-openapi-architecture.md) amended | 2026-08-18 |
| 4 | Unify API pagination (breaking change)? | [01#9](../../docs/review/01-backend-moduli.md#9) | **Implemented**: unify on `{ data, total, page, pageSize, totalPages }` (pageSize canonical). All paginated endpoints now use `buildPaginatedResult`. `limit`→`pageSize` in 3 tenant modules. `totalPages` added to `tenant-list` and `admin/audit-log`. `workspace-member` and `invitation` upgraded from Shape #3 (`{ data, total }`) to the full envelope. `dlq.routes.ts` workaround deleted. `apps/web` clients migrated. | See execution plan below | 2026-08-18 |
| 5 | Is a `@plexica/api-types` package needed? | [03#12](../../docs/review/03-frontend-apps.md#12) | **Implemented**: `@plexica/api-types` package created with Zod response schemas + `z.infer` types. Admin + tenant types extracted. Kafka 4-way divergence fixed (route+service+schema+frontend aligned). Both apps migrated. | [ADR-029](./adr/adr-029-api-types-package.md) | 2026-08-18 |
| 6 | Do super-admin features live in `web` or `admin`? | [03#17](../../docs/review/03-frontend-apps.md#17) | **Implemented**: super-admin features live only in `apps/admin`. Removed `admin-plugin-registry-page.tsx` and `admin-dlq-page.tsx` from `apps/web` (+ routes, hooks, API functions, i18n). Ported DLQ detail page to `apps/admin` (`/dlq` route, `DlqPage`, `DlqEntryCard`, `useDlq` hooks). ~274 LOC removed from web bundle. | See notes below | 2026-08-18 |
| 7 | Extract the whole shell or only error boundary + `useMediaQuery`? | [03#7](../../docs/review/03-frontend-apps.md#7) | **Implemented**: minimal extract — `useMediaQuery`, `SkipLink`, `RouteErrorBoundary` + `ErrorFallback` moved to `@plexica/ui`. Admin AppShell now includes SkipLink + KeyedErrorBoundary + `main id` + tabIndex. Admin sidebar: focus trap, Escape, focus restore, `role="dialog"`. Admin header: `aria-expanded`/`aria-controls` + i18n aria-label. `startsWith` active state bug fixed. Two AppShell stay separate. | See notes below | 2026-08-18 |
| 8 | Unify the auth store? | [04#2](../../docs/review/04-packages-condivisi.md#2) | **Implemented**: `createAuthStore` factory in `@plexica/auth` with DI for realm, profile, persist, logout. Web: 180→63 lines. Admin: 156→33 lines. Dead `createAuthBaseSlice` removed. `idToken` added to `AuthState`. **Corrections 2026-08-19**: restored `createRehydrationHandler()` invocation (D8 had dropped it — session state never restored from sessionStorage) and front-channel logout via `getLogoutUrl(realm, idToken, postLogoutUri)` (D8 had replaced it with a plain redirect; pre-D8 behavior per PR #77 tests + spec 002-04). | — | 2026-08-18 |
| 9 | Complete or remove the "dev-server HMR" feature? | [04#3](../../docs/review/04-packages-condivisi.md#3) | **Implemented**: removed. Deleted `plugin-dev-watcher.ts` (104 LOC) from apps/web, `dev-server-registration.ts` (78 LOC) from vite-plugin. Removed `startDevWatcher()` call from main.tsx. Removed `ws` + `@types/ws` deps. Dev plugin registration uses `registerBackend()` HTTP (already working in CLI template). | — | 2026-08-18 |
| 10 | Parallelize the 174 E2E tests? | [05#20](../../docs/review/05-build-ci-infra.md#20) | **Implemented (incremental)**: 11 read-only spec files marked `mode: 'parallel'` (8 web + 3 admin) — intra-file parallelism only. `workers` stays at 1: Playwright runs files concurrently across workers by default, so raising workers would run mutating suites in parallel against the shared tenant/DB/realm state (adversarial review 2026-08-19). Full parallelism + tenant-per-worker isolation deferred to post-v1.0 CI measurement. | — | 2026-08-19 |

## Deferred Decisions

| ID     | Decision                                       | Reason Deferred                                                                                                          | Revisit   |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| DD-001 | GraphQL API layer                              | Focus on REST first; evaluate after v1.0 when plugin API consumption patterns are clear.                                 | Post-v1.0 |
| DD-002 | Rust services for performance-critical paths   | Evaluate after the TypeScript core is stable and profiled. ADR-008 reserves the option for a hybrid TS/Rust approach.    | Post-v1.0 |
| DD-003 | Additional plugin SDK languages (Python, Rust) | TypeScript SDK is the primary target. Other languages deferred until the plugin ecosystem matures and demand is evident. | Post-v1.0 |

---

## Questions & Clarifications

_No open questions._

---

_This document is living. Update it as decisions are made or deferred.
For significant architectural decisions, create a full ADR in `adr/`._
