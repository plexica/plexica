# Tasks: 001 - Infrastructure Setup

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                                        |
| ------ | ------------------------------------------------------------ |
| Status | Pending                                                      |
| Author | forge-scrum                                                  |
| Date   | 2026-03-26                                                   |
| Spec   | `.forge/specs/001-infrastructure-setup/spec.md`              |
| Plan   | `.forge/specs/001-infrastructure-setup/plan.md`              |

---

## Header

| Metric                    | Value                        |
| ------------------------- | ---------------------------- |
| Total tasks               | 38                           |
| Total story points        | 89                           |
| Total phases              | 7                            |
| Phase with most points    | Phase 4 — Design System (26) |
| Requirements covered      | FR-001–FR-012, NFR-01–NFR-06, AC-01–AC-08 |
| Spec gaps                 | None                         |

---

## Legend

- `[FR-NNN]` — Requirement being implemented (traceability)
- `[NFR-NN]` — Non-functional requirement (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped
- Points: 1, 2, 3, 5, 8 (no task above 8 — split if needed)

---

## Dependency Graph

```
Phase 1: Monorepo Scaffolding
│  (001-T01 … 001-T08)
│  All parallelizable after T01 (package.json must exist first)
│
├─► Phase 2: Docker Compose Stack  (depends on Phase 1)
│      (001-T09 … 001-T14)
│      T09 (compose file) → T10 (keycloak) → T11 (redpanda)
│      T12 (CI compose) and T13 (env/ports) are parallel
│      T14 (smoke-up verify) depends on T09–T13
│
├─► Phase 3: Core API + Database  (depends on Phase 1 + Phase 2)
│      (001-T15 … 001-T21)
│      T15 (pkg) → T16 (prisma schema) → T17 (migration SQL) → T18 (DB libs)
│      T19 (tenant-schema.ts) → T20 (create-tenant CLI) → T21 (vitest config)
│
├─► Phase 4: Design System  (depends on Phase 1 only — parallel with Phase 3)
│      (001-T22 … 001-T30)
│      T22 (pkg) → T23 (tokens) → T24 (tailwind preset) → T25–T29 (components)
│      T30 (storybook) depends on T25–T29
│
├─► Phase 5: Frontend Shell  (depends on Phase 4)
│      (001-T31 … 001-T32)
│
├─► Phase 6: Integration Smoke Tests  (depends on Phase 2 + Phase 3)
│      (001-T33 … 001-T38)
│      All smoke tests are parallel once services are up
│
└─► Phase 7: E2E Test + CI Pipeline  (depends on all previous phases)
       (001-T39 … 001-T41)
```

**Critical path**: T01 → T09 → T15 → T19 → T33 → T39 → T41

**Parallel tracks**:
- Track A (Backend/Infra): Phase 1 → 2 → 3 → 6 → 7
- Track B (Frontend/UI): Phase 1 → 4 → 5 → 7

---

## Phase 1: Monorepo Scaffolding

> **Objective**: Establish pnpm workspace, shared TypeScript config, linting, and formatting.
> **Verification**: `pnpm install` succeeds; `pnpm tsc --noEmit` exits 0 on the empty workspace.

---

### 001-T01: Root `package.json` with workspace scripts and engine enforcement

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 2
**Depends on**: none
**Assignee**: TBD

**Description**:
Create the root `package.json` defining the monorepo: workspaces glob, Node.js engine constraint (`>=20`), and top-level scripts (`lint`, `typecheck`, `build`, `test`). This is the first file every other tool reads, so it must be created before the workspace can be set up.

**Files to create/modify**:
- `package.json` — root package with `engines`, `scripts`, and workspace-level devDependencies (TypeScript, ESLint, Prettier)

**Definition of Done**:
- [ ] `engines.node` is `">=20"` in `package.json`
- [ ] `pnpm install` completes without error on Node 20
- [ ] `scripts` section contains at least `lint`, `typecheck`, `build`, `test` delegating to `pnpm -r run <script>`
- [ ] No real credentials or secrets present

**Spec requirement**: FR-001, NFR-03 (install < 90s), Edge Case #6 (Node < 20 rejected)

---

### 001-T02: `pnpm-workspace.yaml` and `.npmrc`

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 1
**Depends on**: 001-T01
**Assignee**: TBD

**Description**:
Define the pnpm workspace packages glob (`apps/*`, `packages/*`, `services/*`) and set `.npmrc` options: `engine-strict=true` (rejects Node < 20) and `auto-install-peers=true`. These two files together enforce the monorepo boundary and Node version requirement.

**Files to create/modify**:
- `pnpm-workspace.yaml` — workspace packages definition
- `.npmrc` — `engine-strict=true`, `auto-install-peers=true`

**Definition of Done**:
- [ ] `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `services/*`
- [ ] `.npmrc` contains `engine-strict=true`
- [ ] Running `pnpm install` with Node 18 produces an error referencing the `engines` field
- [ ] Running `pnpm install` with Node 20+ succeeds

**Spec requirement**: FR-001, Edge Case #6

---

### 001-T03: `tsconfig.base.json` — shared strict TypeScript config

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 2
**Depends on**: 001-T01
**Assignee**: TBD

**Description**:
Create the shared `tsconfig.base.json` that all packages will extend. Must enable strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESNext target, and module resolution appropriate for Node 20 + Vite (bundler). This config is inherited by every package's own `tsconfig.json`.

**Files to create/modify**:
- `tsconfig.base.json` — shared TypeScript base configuration

**Definition of Done**:
- [ ] `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` are all set
- [ ] `target` is `ES2022` or later; `moduleResolution` is `bundler` or `node16`
- [ ] `pnpm tsc --noEmit` (with a child package that extends this) exits 0
- [ ] No `allowJs: true` or loose flags present

**Spec requirement**: FR-001, AGENTS.md (TypeScript strict mode mandatory)

---

### 001-T04: `eslint.config.js` — flat ESLint config with TypeScript rules

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 2
**Depends on**: 001-T03
**Assignee**: TBD

**Description**:
Create a flat ESLint configuration (`eslint.config.js`) using `@typescript-eslint/eslint-plugin` and parser. No `.eslintrc` file — flat config only (modern ESLint convention). Rules must enforce: no `console.log` (use Pino), no `any` in production code, import order enforcement, and React hooks rules for frontend packages.

**Files to create/modify**:
- `eslint.config.js` — flat ESLint configuration
- Install devDependencies: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-import`

**Definition of Done**:
- [ ] `pnpm lint` (root script) exits 0 on an empty workspace with no `.ts` files
- [ ] A file containing `console.log("test")` causes `pnpm lint` to exit non-zero
- [ ] A file with `const x: any = 1` causes a TypeScript-ESLint error
- [ ] No `.eslintrc` or `.eslintrc.*` files exist in the repo

**Spec requirement**: FR-001, Constitution Rule 4 (no `console.log` in production)

---

### 001-T05: `.prettierrc` — formatting rules

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 1
**Depends on**: 001-T01
**Assignee**: TBD

**Description**:
Create `.prettierrc` with consistent formatting rules: single quotes, 2-space indent, 100-char print width, trailing commas (ES5), semicolons. Add `.prettierignore` to exclude `dist/`, `node_modules/`, and generated Prisma files.

**Files to create/modify**:
- `.prettierrc` — Prettier formatting configuration
- `.prettierignore` — exclusion list for Prettier

**Definition of Done**:
- [ ] `pnpm prettier --check .` exits 0 on an otherwise empty workspace
- [ ] A file with inconsistent formatting causes `pnpm prettier --check` to exit non-zero
- [ ] `dist/` and `node_modules/` are excluded from formatting

**Spec requirement**: FR-001

---

### 001-T06: `.gitignore` — comprehensive ignore list

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 1
**Depends on**: 001-T01
**Assignee**: TBD

**Description**:
Create a comprehensive `.gitignore` covering: Node build artifacts (`dist/`, `build/`, `.next/`), dependency directories (`node_modules/`), environment files (`.env` — but NOT `.env.example`), IDE files (`.vscode/`, `.idea/`), OS files (`.DS_Store`), Prisma generated client (`generated/`), Playwright reports, and Storybook build output.

**Files to create/modify**:
- `.gitignore` — comprehensive ignore list

**Definition of Done**:
- [ ] `.env` is listed in `.gitignore` and would not be committed
- [ ] `.env.example` is NOT in `.gitignore` (it must be committed)
- [ ] `node_modules/`, `dist/`, `build/` are ignored
- [ ] `git status` on a clean checkout shows no unexpected untracked files

**Spec requirement**: FR-001, Security (secrets never committed)

---

### 001-T07: `.env.example` — all environment variables with defaults

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 2
**Depends on**: 001-T01
**Assignee**: TBD

**Description**:
Create `.env.example` documenting every environment variable required to run the full stack, with safe placeholder or default values. Covers: PostgreSQL (`DATABASE_URL`), Keycloak (`KEYCLOAK_URL`, `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`), Redis (`REDIS_URL`), MinIO (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`), Kafka/Redpanda (`KAFKA_BROKERS`), SMTP (`SMTP_HOST`), and all Docker Compose port bindings. No real credentials; all passwords are placeholder strings like `changeme`.

**Files to create/modify**:
- `.env.example` — all environment variables with documented defaults

**Definition of Done**:
- [ ] Every service port used in `docker-compose.yml` has a corresponding variable in `.env.example`
- [ ] All variables from AGENTS.md environment table are present
- [ ] No real credentials, tokens, or secrets present (audit: grep for common patterns)
- [ ] File is committed to git (not in `.gitignore`)
- [ ] Copying `.env.example` to `.env` allows `docker compose up` to start all services

**Spec requirement**: FR-003, NFR-06, US-001 AC-02

---

### 001-T08: `README.md` — getting started guide

**Phase**: Phase 1 — Monorepo Scaffolding
**Points**: 2
**Depends on**: 001-T07
**Assignee**: TBD

**Description**:
Write the `README.md` covering: project overview, prerequisites (Docker, Node >= 20, pnpm >= 8), quickstart (`cp .env.example .env && docker compose up && pnpm install`), available services with default ports, how to run tests, and how to override ports via `.env`. Must document the Docker prerequisite to satisfy Edge Case #2.

**Files to create/modify**:
- `README.md` — project getting started documentation

**Definition of Done**:
- [ ] Prerequisites section lists Docker, Node >= 20, pnpm >= 8 with install links
- [ ] Quickstart section has a copy-pasteable 3-step command sequence
- [ ] All 6 services are listed with their default ports
- [ ] Port override procedure is documented with a concrete example
- [ ] Edge Case #2 (Docker not installed) is addressed with a clear prerequisite check

**Spec requirement**: FR-001, FR-003, US-001 AC-02, Edge Case #2

---

## Phase 2: Docker Compose Stack

> **Objective**: All 6 infrastructure services running with healthchecks, ports configurable via `.env`.
> **Verification**: `docker compose up -d --wait` completes with all services `healthy` in < 60s.
> **Depends on**: Phase 1 complete (`.env.example` must exist)

---

### 001-T09: `docker-compose.yml` — full dev stack with healthchecks

**Phase**: Phase 2 — Docker Compose Stack
**Points**: 8
**Depends on**: 001-T07
**Assignee**: TBD

**Description**:
Create the primary `docker-compose.yml` defining all 6 services: PostgreSQL 15, Keycloak 26, Redis 7, MinIO, Redpanda (single node), and Mailhog. Every service must have a `healthcheck` (with `test`, `interval`, `timeout`, `retries`, `start_period`), memory limits (PG: 512MB, Keycloak: 768MB, Redis: 128MB, MinIO: 256MB, Redpanda: 512MB, Mailhog: 64MB), named volumes for data persistence, and all ports defined via `${VAR:-default}` syntax. All images must be pinned to exact SHA digests (`image: postgres@sha256:...`).

**Files to create/modify**:
- `docker-compose.yml` — full development stack definition

**Definition of Done**:
- [ ] All 6 services defined: PostgreSQL, Keycloak, Redis, MinIO, Redpanda, Mailhog
- [ ] Every service has a `healthcheck` block with all 5 fields
- [ ] Every image reference uses `@sha256:` digest pinning (NFR-05)
- [ ] Every port binding uses `${VAR:-default}` syntax (FR-003, NFR-06)
- [ ] Memory limits are set per the plan §4.2 values
- [ ] `docker compose up -d --wait` completes with all services healthy in < 60s (NFR-01)
- [ ] Named volumes defined for PostgreSQL and MinIO data persistence

**Spec requirement**: FR-002, FR-003, NFR-01, NFR-05, NFR-06, US-001 AC-01

---

### 001-T10: Keycloak realm export — test realm with 3 users

**Phase**: Phase 2 — Docker Compose Stack
**Points**: 5
**Depends on**: 001-T09
**Assignee**: TBD

**Description**:
Create `infra/keycloak/realm-export.json` — a pre-configured Keycloak realm JSON that is imported via `--import-realm` on startup. Must define the `plexica-test` realm, a `plexica-web` public OIDC client (redirect URI: `http://localhost:3000/*`), 3 roles (`super_admin`, `tenant_admin`, `member`), and 3 users: `super-admin@plexica.test`, `admin@acme.test`, `member@acme.test` (all with password `test1234`). Wire the volume mount and `--import-realm` flag into `docker-compose.yml`.

**Files to create/modify**:
- `infra/keycloak/realm-export.json` — Keycloak test realm definition
- `docker-compose.yml` — add volume mount and startup command for realm import

**Definition of Done**:
- [ ] `infra/keycloak/realm-export.json` is valid JSON parseable by Keycloak 26
- [ ] Keycloak container starts with `--import-realm` and the volume mount configured
- [ ] After `docker compose up`, `GET http://localhost:8080/realms/plexica-test/.well-known/openid-configuration` returns 200
- [ ] All 3 test users can authenticate (password `test1234`) via OIDC token endpoint
- [ ] Keycloak healthcheck verifies the realm endpoint before reporting healthy

**Spec requirement**: FR-005, US-001 AC-01, US-002 AC-01, Edge Case #3

---

### 001-T11: Redpanda setup — dev mode with core topic creation

**Phase**: Phase 2 — Docker Compose Stack
**Points**: 3
**Depends on**: 001-T09
**Assignee**: TBD

**Description**:
Create `infra/redpanda/create-topics.sh` — a shell script that uses the `rpk` CLI to create 3 core topics (`tenant.events`, `user.events`, `plugin.events`) with 1 partition and 7-day retention. Configure Redpanda in developer mode (`--set redpanda.developer_mode=true`) in `docker-compose.yml` with 10 healthcheck retries at 5s interval. Add an init container or `depends_on` with `service_healthy` to run the topic creation script after Redpanda is healthy.

**Files to create/modify**:
- `infra/redpanda/create-topics.sh` — topic creation script using `rpk`
- `docker-compose.yml` — Redpanda service config with developer mode and topic init

**Definition of Done**:
- [ ] `infra/redpanda/create-topics.sh` creates all 3 topics without error
- [ ] Redpanda starts in developer mode with < 100MB RSS memory usage
- [ ] Healthcheck uses `/v1/status/ready` Redpanda admin API endpoint
- [ ] After `docker compose up`, `rpk topic list` shows `tenant.events`, `user.events`, `plugin.events`
- [ ] Script handles already-existing topics gracefully (idempotent)

**Spec requirement**: FR-008, Edge Case #4, Risk R-01

---

### 001-T12: `docker-compose.ci.yml` — CI override with tighter resource limits

**Phase**: Phase 2 — Docker Compose Stack
**Points**: 3
**Depends on**: 001-T09
**Assignee**: TBD

**Description**:
Create `docker-compose.ci.yml` as a Docker Compose override file that extends the dev compose for CI use. Remove host port bindings (services communicate via Docker network only), apply tighter memory limits to keep total service memory under 2.5GB (per Risk R-02), and add `--exit-code-from` compatible configuration. This file is used exclusively in GitHub Actions.

**Files to create/modify**:
- `docker-compose.ci.yml` — CI-specific Docker Compose override

**Definition of Done**:
- [ ] `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait` works
- [ ] No host port bindings in the CI override (all `ports:` entries removed or commented)
- [ ] Total memory limit across all services is < 2.5GB
- [ ] Suitable for GitHub Actions `ubuntu-latest` runner (7GB RAM total)

**Spec requirement**: FR-004, NFR-02, Risk R-02

---

### 001-T13: Port configurability verification and `.env` smoke test

**Phase**: Phase 2 — Docker Compose Stack
**Points**: 2
**Depends on**: 001-T09, 001-T07
**Assignee**: TBD

**Description**:
Verify and document that every service port in `docker-compose.yml` uses `${VAR:-default}` syntax matching `.env.example`. Write a short shell validation script (`infra/scripts/verify-env.sh`) that checks all required variables are defined, and add a note to `README.md` for the port override procedure. This is the verification step for NFR-06 and the port-conflict edge case.

**Files to create/modify**:
- `infra/scripts/verify-env.sh` — validates all required env vars are set
- `README.md` — add port override section (update from T08)

**Definition of Done**:
- [ ] Every `ports:` entry in `docker-compose.yml` uses `${VAR:-default}` syntax
- [ ] `verify-env.sh` exits non-zero if any required variable is missing
- [ ] Changing a port in `.env` (e.g., PostgreSQL from 5432 to 5433) and running `docker compose up` binds PostgreSQL to 5433
- [ ] US-001 AC-03 satisfied: port override tested manually and works

**Spec requirement**: FR-003, NFR-06, US-001 AC-02, AC-03, Edge Case #1

---

## Phase 3: Core API + Database

> **Objective**: Prisma schema, core migration applied to PostgreSQL, and tenant creation CLI utility.
> **Verification**: `pnpm --filter core-api db:migrate` succeeds; `pnpm --filter core-api tenant:create -- --slug acme` creates `tenant_acme` schema.
> **Depends on**: Phase 1 (monorepo tooling), Phase 2 (PostgreSQL must be running)

---

### 001-T14: `services/core-api` package scaffold

**Phase**: Phase 3 — Core API + Database
**Points**: 2
**Depends on**: 001-T01, 001-T03
**Assignee**: TBD

**Description**:
Create the `services/core-api` package scaffold: `package.json` (with all required dependencies from plan §6.2), `tsconfig.json` extending `tsconfig.base.json` with Node-appropriate settings, and `vitest.config.ts` for integration tests. Install all backend dependencies: Fastify, Prisma, Pino, Zod, ioredis, KafkaJS, MinIO client, Vitest.

**Files to create/modify**:
- `services/core-api/package.json` — service package manifest
- `services/core-api/tsconfig.json` — TypeScript config extending base
- `services/core-api/vitest.config.ts` — Vitest configuration for integration tests

**Definition of Done**:
- [ ] `pnpm install` from repo root resolves all `services/core-api` dependencies
- [ ] `services/core-api/tsconfig.json` extends `../../tsconfig.base.json`
- [ ] `pnpm --filter core-api tsc --noEmit` exits 0 on an empty `src/` directory
- [ ] `vitest.config.ts` configures test timeout of 30s for integration tests

**Spec requirement**: FR-001, FR-006, FR-007

---

### 001-T15: Prisma schema — `core` schema with `tenants` and `tenant_configs`

**Phase**: Phase 3 — Core API + Database
**Points**: 3
**Depends on**: 001-T14
**Assignee**: TBD

**Description**:
Create `services/core-api/prisma/schema.prisma` using Prisma's multi-schema support (`previewFeatures = ["multiSchema"]`). Define the `core` schema, `tenant_status` enum (`active`, `suspended`, `deleted`), `tenants` table (id UUID, slug VARCHAR(63) with CHECK constraint, name, status, created_at, updated_at), and `tenant_configs` table (id UUID, tenant_id FK, keycloak_realm unique, settings JSONB, timestamps). Also create the empty `tenant-schema.prisma` template for future tenant tables.

**Files to create/modify**:
- `services/core-api/prisma/schema.prisma` — Prisma schema for core tables
- `services/core-api/prisma/tenant-schema.prisma` — empty tenant schema template

**Definition of Done**:
- [ ] `npx prisma validate` exits 0 with no schema errors
- [ ] `@@schema("core")` directive present on both models
- [ ] Slug `CHECK` constraint included: `^[a-z][a-z0-9-]{1,61}[a-z0-9]$`
- [ ] `tenant_configs.tenant_id` FK references `tenants.id` with `unique` constraint (one-to-one)
- [ ] `settings` field is `Json` type with default `{}`

**Spec requirement**: FR-006, §7 Data Requirements

---

### 001-T16: Prisma migration — `001_init_core_schema`

**Phase**: Phase 3 — Core API + Database
**Points**: 3
**Depends on**: 001-T15
**Assignee**: TBD

**Description**:
Generate and verify the initial Prisma migration SQL for the core schema. The migration must: create the `core` schema, create the `tenant_status` enum in `core`, create both tables with all indexes (PKs, unique indexes, `tenants_status_idx` BTREE), and set all NOT NULL / DEFAULT constraints as specified in plan §2. Apply the migration against the Docker PostgreSQL instance to verify it runs cleanly.

**Files to create/modify**:
- `services/core-api/prisma/migrations/001_init_core_schema/migration.sql` — initial migration SQL
- `services/core-api/package.json` — add `db:migrate` and `db:generate` scripts

**Definition of Done**:
- [ ] `pnpm --filter core-api db:migrate` applies migration with exit code 0
- [ ] `psql core -c "\dt core.*"` shows `tenants` and `tenant_configs` tables
- [ ] `psql core -c "\di core.*"` shows all 6 indexes from plan §2.3
- [ ] Migration is idempotent: running it twice does not error (Prisma tracks applied migrations)
- [ ] `core.tenant_status` enum has 3 values: `active`, `suspended`, `deleted`

**Spec requirement**: FR-006, US-004 AC-01, §7 Data Requirements

---

### 001-T17: Shared lib utilities — `database.ts`, `config.ts`, `logger.ts`

**Phase**: Phase 3 — Core API + Database
**Points**: 3
**Depends on**: 001-T14, 001-T16
**Assignee**: TBD

**Description**:
Implement three foundational utility modules. `config.ts`: load and validate environment variables via Zod schema (DATABASE_URL, KEYCLOAK_URL, REDIS_URL, KAFKA_BROKERS, MINIO_ENDPOINT, etc.); throw at startup if any required variable is missing. `database.ts`: Prisma client singleton with connection lifecycle and multi-schema URL handling. `logger.ts`: Pino logger configured with JSON output (no `console.log`). Each file must stay under 200 lines.

**Files to create/modify**:
- `services/core-api/src/lib/config.ts` — env var loader with Zod validation
- `services/core-api/src/lib/database.ts` — Prisma client singleton
- `services/core-api/src/lib/logger.ts` — Pino logger configuration

**Definition of Done**:
- [ ] `config.ts` throws a descriptive Zod error if `DATABASE_URL` is missing
- [ ] `database.ts` exports a singleton `PrismaClient` that reuses connections
- [ ] `logger.ts` exports a Pino instance; no `console.log` calls in any of the 3 files
- [ ] All 3 files are under 200 lines (Constitution Rule 4)
- [ ] `pnpm --filter core-api tsc --noEmit` exits 0 with these files present

**Spec requirement**: FR-001, FR-006, Constitution Rules 1 & 4

---

### 001-T18: `tenant-schema.ts` — tenant creation utility (core logic)

**Phase**: Phase 3 — Core API + Database
**Points**: 5
**Depends on**: 001-T17
**Assignee**: TBD

**Description**:
Implement the tenant schema creation utility in `services/core-api/src/lib/tenant-schema.ts`. Must: validate slug format (regex), check for duplicate in `core.tenants`, execute a single transaction (INSERT tenant, CREATE SCHEMA via raw SQL, run Prisma tenant migrations, INSERT tenant_config), and handle all error cases from plan §3.1 with correct exit codes and messages. Must stay under 200 lines — extract helpers if needed.

**Files to create/modify**:
- `services/core-api/src/lib/tenant-schema.ts` — tenant creation business logic
- `services/core-api/src/lib/tenant-schema-helpers.ts` — extracted helpers if needed to stay under 200 lines

**Definition of Done**:
- [ ] Valid slug creates `tenant_<slug>` schema in PostgreSQL
- [ ] Duplicate slug returns error message `"Schema tenant_<slug> already exists"` without modifying the DB
- [ ] Invalid slug format returns descriptive validation error
- [ ] DB connection failure returns error with message `"Database connection failed: <error>"`
- [ ] Migration failure rolls back the entire transaction (no partial state)
- [ ] `tenant-schema.ts` is under 200 lines

**Spec requirement**: FR-007, US-004 AC-01, AC-02, Edge Case #5, §3 CLI spec

---

### 001-T19: `create-tenant.ts` — CLI entrypoint and `tenant:create` script

**Phase**: Phase 3 — Core API + Database
**Points**: 2
**Depends on**: 001-T18
**Assignee**: TBD

**Description**:
Create the thin CLI entrypoint `services/core-api/src/cli/create-tenant.ts` that parses `--slug <value>` from `process.argv`, calls the `tenant-schema.ts` utility, prints the result to stdout, and exits with the correct code (0 = success, 1 = error). Register the `tenant:create` script in `package.json`. File must be under 200 lines.

**Files to create/modify**:
- `services/core-api/src/cli/create-tenant.ts` — CLI wrapper
- `services/core-api/package.json` — add `tenant:create` script

**Definition of Done**:
- [ ] `pnpm --filter core-api tenant:create -- --slug acme` exits 0 and creates `tenant_acme`
- [ ] Running the same command again exits 1 with `"Schema tenant_acme already exists"`
- [ ] `pnpm --filter core-api tenant:create -- --slug INVALID!!` exits 1 with validation error
- [ ] Running without `--slug` exits 1 with usage hint
- [ ] `create-tenant.ts` is under 200 lines

**Spec requirement**: FR-007, US-004 AC-01, §3 CLI spec

---

## Phase 4: Design System

> **Objective**: Design tokens + 5 Radix UI components + Storybook running with all components visible.
> **Verification**: `pnpm --filter ui storybook` starts in < 15s and all 5 components render with correct tokens.
> **Depends on**: Phase 1 only — parallel with Phase 3

---

### 001-T20: `packages/ui` package scaffold

**Phase**: Phase 4 — Design System
**Points**: 2
**Depends on**: 001-T01, 001-T03
**Assignee**: TBD

**Description**:
Create the `packages/ui` package scaffold: `package.json` with all dependencies from plan §6.3 (React 19, Radix UI primitives, Tailwind, CVA, clsx, tailwind-merge, Storybook), and `tsconfig.json` extending `tsconfig.base.json` with JSX support (`"jsx": "react-jsx"`). Define the `@plexica/ui` package name and configure the `exports` field for proper ESM resolution.

**Files to create/modify**:
- `packages/ui/package.json` — design system package manifest
- `packages/ui/tsconfig.json` — TypeScript config with JSX support

**Definition of Done**:
- [ ] Package name is `@plexica/ui` in `package.json`
- [ ] All Radix UI, Tailwind, and React dependencies installed and resolvable
- [ ] `pnpm --filter @plexica/ui tsc --noEmit` exits 0 on an empty `src/` directory
- [ ] `exports` field in `package.json` maps `"."` to `"./src/index.ts"` for workspace usage

**Spec requirement**: FR-009, FR-010

---

### 001-T21: Design tokens — colors, spacing, radius, typography CSS custom properties

**Phase**: Phase 4 — Design System
**Points**: 5
**Depends on**: 001-T20
**Assignee**: TBD

**Description**:
Create the full token set as CSS custom properties across 4 files. `colors.css`: neutral gray 50-950 (11 steps), primary blue 50-950, semantic colors (success/green, warning/amber, error/red, info/blue each with base/light/dark variants) in both `:root` (light) and `[data-theme="dark"]` (dark) selectors. `spacing.css`: 4px base unit scale (0-24). `radius.css`: sm/md/lg/xl/full. `typography.css`: Inter variable font import, font size/line height scale. `index.css`: barrel importing all 4 files.

**Files to create/modify**:
- `packages/ui/src/tokens/colors.css`
- `packages/ui/src/tokens/spacing.css`
- `packages/ui/src/tokens/radius.css`
- `packages/ui/src/tokens/typography.css`
- `packages/ui/src/tokens/index.css`

**Definition of Done**:
- [ ] All 11 neutral steps defined (`--color-neutral-50` through `--color-neutral-950`)
- [ ] All 11 primary blue steps defined
- [ ] All 4 semantic colors × 3 variants (base/light/dark) = 12 semantic variables defined
- [ ] Light mode tokens in `:root`, dark mode overrides in `[data-theme="dark"]`
- [ ] Spacing variables from `--spacing-0` to `--spacing-24` (using 4px base unit)
- [ ] `index.css` imports all 4 token files

**Spec requirement**: FR-009, US-003 AC-02, §9 Design System Tokens

---

### 001-T22: Tailwind preset consuming design tokens

**Phase**: Phase 4 — Design System
**Points**: 2
**Depends on**: 001-T21
**Assignee**: TBD

**Description**:
Create `packages/ui/tailwind-preset.ts` — a Tailwind CSS preset that maps all CSS custom properties to Tailwind theme values. Colors should use `var(--color-*)`, spacing should use `var(--spacing-*)`, border radius should use `var(--radius-*)`, and font family should use Inter. This preset is consumed by all apps via their `tailwind.config.ts`.

**Files to create/modify**:
- `packages/ui/tailwind-preset.ts` — Tailwind preset with token mapping

**Definition of Done**:
- [ ] Preset exports a valid Tailwind config object with `theme.extend` entries
- [ ] `tailwind.config.ts` in another package can `presets: [require('@plexica/ui/tailwind-preset')]` without error
- [ ] `bg-primary-500` resolves to `var(--color-primary-500)` in generated CSS
- [ ] File is under 200 lines

**Spec requirement**: FR-009, §4.6 Design System

---

### 001-T23: `Button` component — Radix Slot-based with 5 variants

**Phase**: Phase 4 — Design System
**Points**: 3
**Depends on**: 001-T22
**Assignee**: TBD

**Description**:
Implement `packages/ui/src/components/button.tsx` using `@radix-ui/react-slot` for composition and `class-variance-authority` (CVA) for variant management. Variants: `primary`, `secondary`, `destructive`, `ghost`, `outline`. States: `disabled` (with `aria-disabled`), `loading` (with spinner and `aria-busy`). Must meet WCAG 2.1 AA: visible focus ring, sufficient color contrast, keyboard operable. Write Storybook story covering all variants and states.

**Files to create/modify**:
- `packages/ui/src/components/button.tsx` — Button component
- `packages/ui/src/stories/button.stories.tsx` — Storybook stories

**Definition of Done**:
- [ ] All 5 variants render with correct token-based colors
- [ ] `disabled` prop sets `aria-disabled="true"` and prevents click events
- [ ] `loading` prop shows a spinner and sets `aria-busy="true"`
- [ ] Keyboard focus ring is visible (not `outline: none` without replacement)
- [ ] File is under 200 lines
- [ ] Storybook story shows all 5 variants × 2 states = 10+ story entries

**Spec requirement**: FR-010, US-003 AC-01, §9 Button spec, Constitution (WCAG 2.1 AA)

---

### 001-T24: `Input` component — text/password/email with error and helper states

**Phase**: Phase 4 — Design System
**Points**: 3
**Depends on**: 001-T22
**Assignee**: TBD

**Description**:
Implement `packages/ui/src/components/input.tsx` supporting `type` prop (text, password, email), `error` prop (boolean + error message string), `helperText` prop, and `label` prop. When `error` is true: red border, red error message below, `aria-invalid="true"`, `aria-describedby` pointing to the error element. Disabled state with reduced opacity. Write Storybook story.

**Files to create/modify**:
- `packages/ui/src/components/input.tsx` — Input component
- `packages/ui/src/stories/input.stories.tsx` — Storybook stories

**Definition of Done**:
- [ ] `type="password"` renders with show/hide toggle using Lucide icon (no emoji)
- [ ] Error state shows red border, error message, `aria-invalid="true"`
- [ ] `aria-describedby` correctly references the error/helper text element ID
- [ ] `disabled` prop renders visual disabled state and prevents interaction
- [ ] File is under 200 lines

**Spec requirement**: FR-010, US-003 AC-01, §9 Input spec, Constitution (WCAG 2.1 AA)

---

### 001-T25: `Dialog` component — modal with focus trap and keyboard support

**Phase**: Phase 4 — Design System
**Points**: 3
**Depends on**: 001-T22
**Assignee**: TBD

**Description**:
Implement `packages/ui/src/components/dialog.tsx` using `@radix-ui/react-dialog` primitive. Must include: `DialogRoot`, `DialogTrigger`, `DialogContent` (with overlay backdrop), `DialogTitle`, `DialogDescription`, `DialogClose` subcomponents. The Radix primitive handles focus trap and ESC key natively. Add `aria-modal="true"` and `aria-labelledby` pointing to the title. Write Storybook story with open/close interaction and keyboard navigation.

**Files to create/modify**:
- `packages/ui/src/components/dialog.tsx` — Dialog component
- `packages/ui/src/stories/dialog.stories.tsx` — Storybook stories

**Definition of Done**:
- [ ] Dialog opens and closes via trigger and close button
- [ ] ESC key closes the dialog (provided by Radix primitive)
- [ ] Focus is trapped inside the dialog when open
- [ ] `aria-modal="true"` and `aria-labelledby` set on `DialogContent`
- [ ] Backdrop overlay renders on open
- [ ] File is under 200 lines

**Spec requirement**: FR-010, US-003 AC-01, §9 Dialog spec, Constitution (WCAG 2.1 AA)

---

### 001-T26: `Toast` component — 4 variants with auto-dismiss

**Phase**: Phase 4 — Design System
**Points**: 3
**Depends on**: 001-T22
**Assignee**: TBD

**Description**:
Implement `packages/ui/src/components/toast.tsx` using `@radix-ui/react-toast` primitive. Variants: `success`, `error`, `warning`, `info` — each with distinct icon (Lucide) and token-based color. Auto-dismiss via `duration` prop (default 5000ms). Manual dismiss button. Must use `role="alert"` and `aria-live="polite"` for screen reader announcement. `ToastProvider` wraps the app; `ToastViewport` defines the display region. Write Storybook story.

**Files to create/modify**:
- `packages/ui/src/components/toast.tsx` — Toast component
- `packages/ui/src/stories/toast.stories.tsx` — Storybook stories

**Definition of Done**:
- [ ] All 4 variants render with correct colors and Lucide icons (no emoji)
- [ ] Toast auto-dismisses after 5000ms (configurable via `duration`)
- [ ] Manual dismiss button closes the toast immediately
- [ ] `role="alert"` set on toast element for screen reader announcement
- [ ] File is under 200 lines

**Spec requirement**: FR-010, US-003 AC-01, §9 Toast spec, Constitution (WCAG 2.1 AA)

---

### 001-T27: `Table` component — with sortable header visuals

**Phase**: Phase 4 — Design System
**Points**: 3
**Depends on**: 001-T22
**Assignee**: TBD

**Description**:
Implement `packages/ui/src/components/table.tsx` with subcomponents: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`. `TableHead` accepts a `sortable` prop that renders a Lucide chevron icon (visual only — no sort logic). Must use proper semantic HTML (`<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<td>`). `role="table"` on the root element is redundant with `<table>` but ensure `<th>` uses `scope="col"`. Write Storybook story.

**Files to create/modify**:
- `packages/ui/src/components/table.tsx` — Table component
- `packages/ui/src/stories/table.stories.tsx` — Storybook stories

**Definition of Done**:
- [ ] `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th scope="col">`, `<td>` are used (semantic HTML)
- [ ] `sortable` column header shows Lucide `ChevronUp`/`ChevronDown` icon (no emoji)
- [ ] Storybook story renders a table with 4 columns and 5 data rows
- [ ] File is under 200 lines

**Spec requirement**: FR-010, US-003 AC-01, §9 Table spec, Constitution (WCAG 2.1 AA)

---

### 001-T28: `packages/ui/src/index.ts` barrel export + Storybook configuration

**Phase**: Phase 4 — Design System
**Points**: 2
**Depends on**: 001-T23, 001-T24, 001-T25, 001-T26, 001-T27
**Assignee**: TBD

**Description**:
Create the barrel export file `packages/ui/src/index.ts` re-exporting all 5 components and the token CSS path. Configure Storybook: `packages/ui/.storybook/main.ts` (Vite builder, story glob, addons) and `packages/ui/.storybook/preview.ts` (import token CSS, dark mode toggle via `@storybook/addon-themes` or manual `data-theme` toggle). Verify Storybook cold start is under 15s (NFR-04).

**Files to create/modify**:
- `packages/ui/src/index.ts` — barrel export for all components
- `packages/ui/.storybook/main.ts` — Storybook configuration
- `packages/ui/.storybook/preview.ts` — global decorators and token import

**Definition of Done**:
- [ ] `import { Button, Input, Dialog, Toast, Table } from '@plexica/ui'` resolves without error
- [ ] `pnpm --filter @plexica/ui storybook` starts without error
- [ ] Storybook cold start completes in < 15s (timed, NFR-04)
- [ ] All 5 components are visible in the Storybook sidebar
- [ ] Dark mode toggle in Storybook switches the `[data-theme]` attribute correctly

**Spec requirement**: FR-009, FR-010, NFR-04, US-003 AC-01

---

## Phase 5: Frontend Shell

> **Objective**: Minimal `apps/web` React app that renders a login page or Keycloak redirect placeholder at `http://localhost:3000`.
> **Verification**: `pnpm --filter web dev` starts; browser at `http://localhost:3000` shows a page with login UI elements.
> **Depends on**: Phase 4 (design system must be built)

---

### 001-T29: `apps/web` package scaffold — Vite + React + TanStack Router

**Phase**: Phase 5 — Frontend Shell
**Points**: 3
**Depends on**: 001-T28
**Assignee**: TBD

**Description**:
Create the `apps/web` frontend app scaffold: `package.json` (React 19, Vite, `@vitejs/plugin-react`, TanStack Router, `@plexica/ui` workspace dep), `tsconfig.json` (extends base, JSX), `vite.config.ts` (React plugin, dev server port 3000), and `index.html`. Configure a minimal route tree (TanStack Router) with a single route `/` that renders the login placeholder.

**Files to create/modify**:
- `apps/web/package.json` — web app package
- `apps/web/tsconfig.json` — TypeScript config with JSX
- `apps/web/vite.config.ts` — Vite config with React plugin and port 3000
- `apps/web/index.html` — HTML entry point

**Definition of Done**:
- [ ] `pnpm --filter web dev` starts Vite dev server on port 3000 without error
- [ ] `pnpm --filter web build` compiles to `apps/web/dist/` without TypeScript errors
- [ ] `@plexica/ui` components are importable in the app
- [ ] No `window.confirm`, raw `<a href>`, or hardcoded UI strings (must use react-intl — see T30)

**Spec requirement**: FR-001, FR-012, ADR-006

---

### 001-T30: Login page placeholder — renders login form elements for E2E

**Phase**: Phase 5 — Frontend Shell
**Points**: 2
**Depends on**: 001-T29
**Assignee**: TBD

**Description**:
Implement `apps/web/src/main.tsx` (React entry point) and `apps/web/src/app.tsx` (root App component with TanStack Router). The root route `/` must render a login page placeholder using `@plexica/ui` components: at minimum an `Input` for email, an `Input` for password, and a `Button` for submit. These elements are what the Playwright E2E smoke test will assert are visible. Add react-intl as the i18n provider wrapping the app with English messages for all visible strings.

**Files to create/modify**:
- `apps/web/src/main.tsx` — React app entry point
- `apps/web/src/app.tsx` — root App component with router and login placeholder
- `apps/web/src/i18n/messages.en.ts` — English i18n messages

**Definition of Done**:
- [ ] `http://localhost:3000` renders without runtime errors in the browser console
- [ ] Page contains an email input (`type="email"`), password input (`type="password"`), and a submit button
- [ ] All visible strings are wrapped in react-intl `<FormattedMessage>` (no hardcoded English)
- [ ] No `window.confirm`, `window.alert`, or raw `<a href>` navigation
- [ ] The page passes axe-core accessibility check (no critical violations)

**Spec requirement**: FR-012, US-003, Constitution Rule 3 (one i18n pattern), AGENTS.md (react-intl mandatory)

---

## Phase 6: Integration Smoke Tests

> **Objective**: Vitest integration tests proving every infrastructure service is reachable and functional, using real services (no mocks).
> **Verification**: `pnpm --filter core-api test` — all 6 test files pass against a running Docker Compose stack.
> **Depends on**: Phase 2 (services running), Phase 3 (core API + tenant utility)

---

### 001-T31: `smoke-db.test.ts` — PostgreSQL connection and core schema verification

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 2
**Depends on**: 001-T16, 001-T17
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/smoke-db.test.ts` — a Vitest integration test that: connects to PostgreSQL using the `database.ts` singleton, queries `information_schema` to verify the `core` schema exists, verifies both `tenants` and `tenant_configs` tables exist in the `core` schema, and disconnects cleanly. Uses real Docker PostgreSQL — no mocks.

**Files to create/modify**:
- `services/core-api/src/__tests__/smoke-db.test.ts` — PostgreSQL smoke test

**Definition of Done**:
- [ ] Test connects to the real PostgreSQL container (using `DATABASE_URL` env var)
- [ ] Test asserts `core` schema exists in `information_schema.schemata`
- [ ] Test asserts `tenants` and `tenant_configs` tables exist
- [ ] Test fails with a descriptive error if the DB is unreachable
- [ ] No mocks of the PostgreSQL connection

**Spec requirement**: FR-006, §8.1 Testing Strategy

---

### 001-T32: `smoke-keycloak.test.ts` — Keycloak OIDC discovery and token exchange

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 2
**Depends on**: 001-T10
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/smoke-keycloak.test.ts` that: fetches the OIDC discovery endpoint (`/realms/plexica-test/.well-known/openid-configuration`) and asserts 200 OK, then exchanges `super-admin@plexica.test` credentials for a real access token via the `password` grant (test-only), and verifies the token is a non-empty JWT string. Uses real Keycloak container — no mock tokens.

**Files to create/modify**:
- `services/core-api/src/__tests__/smoke-keycloak.test.ts` — Keycloak smoke test

**Definition of Done**:
- [ ] OIDC discovery endpoint returns 200 OK with `issuer` field
- [ ] Token exchange returns a valid JWT (can decode header + payload)
- [ ] Test uses real Keycloak with the `plexica-test` realm
- [ ] No `isTestToken` or mock token bypasses (Constitution: zero special test code paths)
- [ ] Test timeout is >= 15s to allow for Keycloak cold-start latency

**Spec requirement**: FR-005, §8.1 Testing Strategy, Constitution (no `isTestToken`)

---

### 001-T33: `smoke-redis.test.ts` — Redis SET/GET/DEL round-trip

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 1
**Depends on**: 001-T14
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/smoke-redis.test.ts` that: connects to Redis via ioredis using `REDIS_URL`, performs a SET + GET round-trip to verify the value, then DELetes the key and verifies it's gone. Disconnects cleanly in `afterAll`. Uses real Redis container.

**Files to create/modify**:
- `services/core-api/src/__tests__/smoke-redis.test.ts` — Redis smoke test

**Definition of Done**:
- [ ] `SET plexica:smoke "ok"` followed by `GET plexica:smoke` returns `"ok"`
- [ ] `DEL plexica:smoke` followed by `GET plexica:smoke` returns `null`
- [ ] Connection uses real `REDIS_URL` env var
- [ ] No mock Redis (e.g., `ioredis-mock`)
- [ ] Client disconnects in `afterAll` to prevent hanging tests

**Spec requirement**: FR-002, §8.1 Testing Strategy

---

### 001-T34: `smoke-redpanda.test.ts` — Kafka produce/consume on `tenant.events`

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 3
**Depends on**: 001-T11
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/smoke-redpanda.test.ts` that: connects to Redpanda via KafkaJS using `KAFKA_BROKERS`, produces a test message to `tenant.events`, consumes it back (using `fromBeginning: false` to avoid consuming prior messages), asserts the payload matches, and disconnects. Also verifies all 3 core topics exist via admin client. Uses real Redpanda container.

**Files to create/modify**:
- `services/core-api/src/__tests__/smoke-redpanda.test.ts` — Redpanda smoke test

**Definition of Done**:
- [ ] Test produces a message `{ type: "smoke-test", ts: <timestamp> }` to `tenant.events`
- [ ] Test consumes the message back and asserts `type === "smoke-test"`
- [ ] Admin client lists topics and asserts all 3 core topics exist
- [ ] No mock Kafka client
- [ ] Test timeout is >= 30s to account for single-node consumer group join latency

**Spec requirement**: FR-008, §8.1 Testing Strategy

---

### 001-T35: `smoke-minio.test.ts` — MinIO bucket CRUD

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 2
**Depends on**: 001-T14
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/smoke-minio.test.ts` that: connects to MinIO using the MinIO client with env var credentials, creates a test bucket (`plexica-smoke-test`), puts a small object, lists objects in the bucket to verify it exists, deletes the object, then removes the bucket. Uses real MinIO container.

**Files to create/modify**:
- `services/core-api/src/__tests__/smoke-minio.test.ts` — MinIO smoke test

**Definition of Done**:
- [ ] Bucket `plexica-smoke-test` is created and confirmed via `bucketExists`
- [ ] Object `smoke.txt` is put and listed
- [ ] Object and bucket are cleaned up in `afterAll`
- [ ] No mock MinIO client
- [ ] Uses `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` from env

**Spec requirement**: FR-002, §8.1 Testing Strategy

---

### 001-T36: `tenant-schema.test.ts` — tenant creation happy path and duplicate error

**Phase**: Phase 6 — Integration Smoke Tests
**Points**: 3
**Depends on**: 001-T19
**Assignee**: TBD

**Description**:
Write `services/core-api/src/__tests__/tenant-schema.test.ts` covering: happy path (create tenant with slug `smoke-test-acme`, verify `tenant_smoke_test_acme` schema exists in `information_schema`, verify `core.tenants` row exists, verify `core.tenant_configs` row exists), duplicate slug rejection (call create again, assert error code 1 and message), and cleanup (`DROP SCHEMA` + delete rows in `afterAll`). Uses real PostgreSQL.

**Files to create/modify**:
- `services/core-api/src/__tests__/tenant-schema.test.ts` — tenant schema integration test

**Definition of Done**:
- [ ] Happy path: `tenant_smoke_test_acme` schema appears in `information_schema.schemata`
- [ ] `core.tenants` has a row with `slug = "smoke-test-acme"`
- [ ] `core.tenant_configs` has a row with `keycloak_realm = "plexica-smoke-test-acme"`
- [ ] Duplicate call returns error with `"Schema tenant_smoke_test_acme already exists"` message
- [ ] `afterAll` cleans up schema and DB rows so test is re-runnable
- [ ] No mock DB connections

**Spec requirement**: FR-007, US-004 AC-01, AC-02, Edge Case #5, §8.1 Testing Strategy

---

## Phase 7: E2E Test + CI Pipeline

> **Objective**: Playwright smoke test for the login page and full GitHub Actions CI pipeline configuration.
> **Verification**: Full CI pipeline passes a test PR in < 10 minutes.
> **Depends on**: All previous phases complete

---

### 001-T37: Playwright config and `smoke.spec.ts` — login page E2E test

**Phase**: Phase 7 — E2E Test + CI Pipeline
**Points**: 3
**Depends on**: 001-T30
**Assignee**: TBD

**Description**:
Create `apps/web/playwright.config.ts` configuring Chromium-only, base URL `http://localhost:3000`, and screenshot/trace capture on failure. Write `apps/web/e2e/smoke.spec.ts` that navigates to `/`, waits for page load, and asserts: the page title is set, an email input is visible (`input[type="email"]`), a password input is visible (`input[type="password"]`), and a submit button is visible. This is the Constitution Rule 1 capstone test for Phase 0.

**Files to create/modify**:
- `apps/web/playwright.config.ts` — Playwright configuration
- `apps/web/e2e/smoke.spec.ts` — E2E smoke test for login page

**Definition of Done**:
- [ ] `pnpm --filter web test:e2e` runs the Playwright test against a live `apps/web` dev server
- [ ] Test asserts `input[type="email"]` is visible
- [ ] Test asserts `input[type="password"]` is visible
- [ ] Test asserts the submit `button` is visible and enabled
- [ ] Test captures a screenshot on failure and saves to `apps/web/e2e/screenshots/`
- [ ] `apps/web/package.json` has a `test:e2e` script

**Spec requirement**: FR-012, US-002 AC-01, Constitution Rule 1 (E2E for every user-interactive surface)

---

### 001-T38: `.github/workflows/ci.yml` — full CI pipeline

**Phase**: Phase 7 — E2E Test + CI Pipeline
**Points**: 8
**Depends on**: 001-T36, 001-T37
**Assignee**: TBD

**Description**:
Create `.github/workflows/ci.yml` implementing all CI stages in order: (1) checkout + Node 20 setup + pnpm cache, (2) `pnpm install`, (3) lint (`pnpm lint`), (4) typecheck (`pnpm tsc --noEmit`), (5) build (`pnpm build`), (6) Docker up (`docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait`), (7) seed/migrate (`pnpm --filter core-api db:migrate`), (8) unit + integration tests (`pnpm --filter core-api test`), (9) install Playwright Chromium + run E2E (`pnpm --filter web test:e2e`), (10) teardown (`docker compose down -v`). Upload Playwright HTML report as artifact on failure. Target: < 10 min total (NFR-02).

**Files to create/modify**:
- `.github/workflows/ci.yml` — full CI pipeline definition

**Definition of Done**:
- [ ] Pipeline triggers on `pull_request` targeting `main`
- [ ] All 10 stages present in correct order
- [ ] pnpm cache configured via `actions/setup-node` with `cache: 'pnpm'`
- [ ] Playwright installed with `--with-deps chromium` (Chromium only, not all browsers)
- [ ] Playwright HTML report uploaded as artifact on test failure
- [ ] `docker compose down -v` teardown runs even if previous steps fail (`if: always()`)
- [ ] Pipeline passes on a test PR with all stages green

**Spec requirement**: FR-004, FR-011, US-002 AC-01, AC-02, AC-03, NFR-02, Constitution Rule 2

---

### 001-T39: NFR validation — timing benchmarks and digest audit

**Phase**: Phase 7 — E2E Test + CI Pipeline
**Points**: 2
**Depends on**: 001-T38
**Assignee**: TBD

**Description**:
Perform and document the NFR validation checks as a verification pass after the CI pipeline is green. Measure and record: (1) `docker compose up --wait` completion time (target < 60s, NFR-01), (2) CI pipeline total duration from first commit status to final green (target < 10 min, NFR-02), (3) `pnpm install` from clean cache (target < 90s, NFR-03), (4) Storybook cold start (target < 15s, NFR-04). Audit all Docker image references for `@sha256:` digest pinning (NFR-05). Document results in a comment block at the top of `docker-compose.yml`.

**Files to create/modify**:
- `docker-compose.yml` — add NFR-01 timing comment with measured baseline
- `packages/ui/.storybook/main.ts` — performance notes if optimization was needed

**Definition of Done**:
- [ ] `docker compose up --wait` completes in < 60s (measured and documented)
- [ ] CI pipeline total duration is < 10 min (measured on test PR)
- [ ] `pnpm install` from clean cache is < 90s (measured locally)
- [ ] Storybook cold start is < 15s (measured locally)
- [ ] All Docker images use `@sha256:` digest (audit: `grep -r "latest\|:^@" docker-compose.yml` returns no hits)

**Spec requirement**: NFR-01, NFR-02, NFR-03, NFR-04, NFR-05

---

## Summary Table

| ID       | Title                                              | Phase | Points | Depends on            |
| -------- | -------------------------------------------------- | ----- | ------ | --------------------- |
| 001-T01  | Root `package.json` with scripts and engines       | 1     | 2      | none                  |
| 001-T02  | `pnpm-workspace.yaml` and `.npmrc`                 | 1     | 1      | T01                   |
| 001-T03  | `tsconfig.base.json` strict TypeScript config      | 1     | 2      | T01                   |
| 001-T04  | `eslint.config.js` flat config                     | 1     | 2      | T03                   |
| 001-T05  | `.prettierrc` formatting rules                     | 1     | 1      | T01                   |
| 001-T06  | `.gitignore` comprehensive ignore list             | 1     | 1      | T01                   |
| 001-T07  | `.env.example` all environment variables           | 1     | 2      | T01                   |
| 001-T08  | `README.md` getting started guide                  | 1     | 2      | T07                   |
| **Phase 1 total** | | | **13** | |
| 001-T09  | `docker-compose.yml` full dev stack                | 2     | 8      | T07                   |
| 001-T10  | Keycloak realm export with 3 users                 | 2     | 5      | T09                   |
| 001-T11  | Redpanda dev mode + topic creation                 | 2     | 3      | T09                   |
| 001-T12  | `docker-compose.ci.yml` CI override                | 2     | 3      | T09                   |
| 001-T13  | Port configurability and `.env` smoke test         | 2     | 2      | T09, T07              |
| **Phase 2 total** | | | **21** | |
| 001-T14  | `services/core-api` package scaffold               | 3     | 2      | T01, T03              |
| 001-T15  | Prisma schema — core tables                        | 3     | 3      | T14                   |
| 001-T16  | Prisma migration — `001_init_core_schema`          | 3     | 3      | T15                   |
| 001-T17  | Shared libs — `database.ts`, `config.ts`, `logger.ts` | 3 | 3     | T14, T16              |
| 001-T18  | `tenant-schema.ts` tenant creation logic           | 3     | 5      | T17                   |
| 001-T19  | `create-tenant.ts` CLI entrypoint                  | 3     | 2      | T18                   |
| **Phase 3 total** | | | **18** | |
| 001-T20  | `packages/ui` package scaffold                     | 4     | 2      | T01, T03              |
| 001-T21  | Design tokens — colors, spacing, radius, typography | 4    | 5      | T20                   |
| 001-T22  | Tailwind preset consuming design tokens            | 4     | 2      | T21                   |
| 001-T23  | `Button` component — 5 variants                    | 4     | 3      | T22                   |
| 001-T24  | `Input` component — error + helper states          | 4     | 3      | T22                   |
| 001-T25  | `Dialog` component — focus trap + keyboard         | 4     | 3      | T22                   |
| 001-T26  | `Toast` component — 4 variants auto-dismiss        | 4     | 3      | T22                   |
| 001-T27  | `Table` component — sortable header visuals        | 4     | 3      | T22                   |
| 001-T28  | Barrel export + Storybook configuration            | 4     | 2      | T23–T27               |
| **Phase 4 total** | | | **26** | |
| 001-T29  | `apps/web` scaffold — Vite + React + TanStack      | 5     | 3      | T28                   |
| 001-T30  | Login page placeholder with react-intl             | 5     | 2      | T29                   |
| **Phase 5 total** | | | **5** | |
| 001-T31  | `smoke-db.test.ts` — PostgreSQL + core schema      | 6     | 2      | T16, T17              |
| 001-T32  | `smoke-keycloak.test.ts` — OIDC + token exchange   | 6     | 2      | T10                   |
| 001-T33  | `smoke-redis.test.ts` — SET/GET/DEL round-trip     | 6     | 1      | T14                   |
| 001-T34  | `smoke-redpanda.test.ts` — produce/consume         | 6     | 3      | T11                   |
| 001-T35  | `smoke-minio.test.ts` — bucket CRUD                | 6     | 2      | T14                   |
| 001-T36  | `tenant-schema.test.ts` — happy path + duplicate   | 6     | 3      | T19                   |
| **Phase 6 total** | | | **13** | |
| 001-T37  | Playwright config + `smoke.spec.ts` E2E test       | 7     | 3      | T30                   |
| 001-T38  | `.github/workflows/ci.yml` full CI pipeline        | 7     | 8      | T36, T37              |
| 001-T39  | NFR validation — timing benchmarks + digest audit  | 7     | 2      | T38                   |
| **Phase 7 total** | | | **13** | |
| | | | | |
| **GRAND TOTAL** | **39 tasks** | | **109 points** | |

---

## Coverage Check

### Functional Requirements

| Requirement | Covered by | Status |
| ----------- | ---------- | ------ |
| FR-001 Monorepo structure + tooling | T01, T02, T03, T04, T05, T06 | ✅ |
| FR-002 Docker Compose 6 services + healthchecks | T09 | ✅ |
| FR-003 All ports configurable via `.env` | T07, T09, T13 | ✅ |
| FR-004 CI-compatible Docker Compose | T12, T38 | ✅ |
| FR-005 Keycloak realm with 3 users | T10, T32 | ✅ |
| FR-006 PostgreSQL `core` schema + tables | T15, T16, T31 | ✅ |
| FR-007 Tenant schema creation utility | T17, T18, T19, T36 | ✅ |
| FR-008 Redpanda 3 core topics | T11, T34 | ✅ |
| FR-009 Design system tokens | T21, T22 | ✅ |
| FR-010 Storybook + 5 components | T23–T28 | ✅ |
| FR-011 Full CI pipeline (all stages) | T38 | ✅ |
| FR-012 Playwright E2E smoke test | T37 | ✅ |

### Non-Functional Requirements

| Requirement | Covered by | Status |
| ----------- | ---------- | ------ |
| NFR-01 Docker Compose startup < 60s | T09, T39 | ✅ |
| NFR-02 CI pipeline < 10 min | T38, T39 | ✅ |
| NFR-03 `pnpm install` < 90s | T01, T02, T39 | ✅ |
| NFR-04 Storybook cold start < 15s | T28, T39 | ✅ |
| NFR-05 All Docker images pinned to digests | T09, T39 | ✅ |
| NFR-06 All ports configurable via `.env` | T07, T09, T13, T39 | ✅ |

### Acceptance Criteria

| AC | User Story | Covered by | Status |
| -- | ---------- | ---------- | ------ |
| US-001 AC-01: `docker compose up` all services healthy | T09 | T09 | ✅ |
| US-001 AC-02: `.env.example` → `.env` → all services start | T07, T08 | T07, T08 | ✅ |
| US-001 AC-03: Port override in `.env` respected | T09, T13 | T13 | ✅ |
| US-002 AC-01: PR triggers all CI stages | T38 | T38 | ✅ |
| US-002 AC-02: All stages pass → pipeline green | T38 | T38 | ✅ |
| US-002 AC-03: Test failure → pipeline red, blocks merge | T38 | T38 | ✅ |
| US-003 AC-01: Storybook starts, 5 components render with tokens | T28 | T28 | ✅ |
| US-003 AC-02: Semantic tokens resolve in light/dark mode | T21, T28 | T21 | ✅ |
| US-004 AC-01: `tenant:create acme` → `tenant_acme` schema exists | T19, T36 | T36 | ✅ |
| US-004 AC-02: New tenant visible in `core.tenants` | T18, T36 | T36 | ✅ |

**Gaps**: None. All FR, NFR, and AC are covered.

---

## Velocity Note

| Sprint Velocity | Estimated Sprints | Notes |
| --------------- | ----------------- | ----- |
| 20 pts/sprint   | ~5.5 sprints      | Conservative; suitable for a single developer |
| 30 pts/sprint   | ~3.6 sprints      | Achievable with 2 developers on parallel tracks |
| Recommended     | **2 sprints**     | With 2 devs on parallel tracks (infra + frontend), the critical path is ~55 pts deep |

**Parallel execution note**: If two developers work in parallel — one on Track A (Phases 1→2→3→6) and one on Track B (Phases 1→4→5) — they can complete all work except Phase 7 concurrently. Phase 7 (CI pipeline, 13 pts) is the final merge point. Practical wall-clock time with 2 devs: **1-2 weeks** as the spec estimates.

---

## Cross-References

| Document    | Path                                                     |
| ----------- | -------------------------------------------------------- |
| Spec        | `.forge/specs/001-infrastructure-setup/spec.md`          |
| Plan        | `.forge/specs/001-infrastructure-setup/plan.md`          |
| Constitution | `.forge/constitution.md`                               |
| ADR-001     | `.forge/knowledge/adr/adr-001-schema-per-tenant.md`      |
| ADR-002     | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md`   |
| ADR-004     | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md` |
| Decision Log | `.forge/knowledge/decision-log.md`                     |
