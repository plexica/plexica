# Plan: 001 - Infrastructure Setup

> Technical implementation plan for Phase 0 — Infrastructure Setup.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field   | Value                                              |
| ------- | -------------------------------------------------- |
| Status  | Draft                                              |
| Author  | forge-architect                                    |
| Date    | 2026-03-26                                         |
| Track   | Feature                                            |
| Spec    | `.forge/specs/001-infrastructure-setup/spec.md`    |

---

## 1. Overview

This plan bootstraps the entire Plexica v2 development environment from an
empty repository. It delivers seven major components in a dependency-ordered
sequence: monorepo scaffolding, Docker Compose dev stack, Keycloak realm
provisioning, Redpanda topic setup, PostgreSQL core schema + tenant utility,
design system foundation, and CI pipeline.

**Technical approach**: Build bottom-up — tooling and infrastructure first,
then services, then frontend primitives, then CI that validates everything.
Each component is independently testable via integration smoke tests, with a
single Playwright E2E test for the login page as the capstone.

**New ADRs required**: None. All foundational decisions (ADR-001 through
ADR-009) are already accepted and cover every technology and pattern used in
this spec. No new core dependencies, data model changes, or infrastructure
additions beyond what the ADRs prescribe.

---

## 2. Data Model

### 2.1 New Tables

All tables live in the `core` schema. Created via Prisma migration.

#### core.tenants

| Column       | Type                     | Constraints                          | Notes                              |
| ------------ | ------------------------ | ------------------------------------ | ---------------------------------- |
| `id`         | `UUID`                   | PK, DEFAULT `gen_random_uuid()`      | Immutable tenant identifier        |
| `slug`       | `VARCHAR(63)`            | UNIQUE, NOT NULL                     | DNS-safe, used for schema naming   |
| `name`       | `VARCHAR(255)`           | NOT NULL                             | Human-readable display name        |
| `status`     | `tenant_status` (enum)   | NOT NULL, DEFAULT `'active'`         | Enum: `active`, `suspended`, `deleted` |
| `created_at` | `TIMESTAMPTZ`            | NOT NULL, DEFAULT `now()`            | Immutable                          |
| `updated_at` | `TIMESTAMPTZ`            | NOT NULL, DEFAULT `now()`            | Updated via trigger or Prisma      |

**Enum definition**: `CREATE TYPE core.tenant_status AS ENUM ('active', 'suspended', 'deleted');`

**Slug validation**: `CHECK (slug ~ '^[a-z][a-z0-9-]{1,61}[a-z0-9]$')` — lowercase alphanumeric + hyphens, 3-63 chars, must start with letter. This ensures `tenant_<slug>` is a valid PostgreSQL schema name.

#### core.tenant_configs

| Column           | Type            | Constraints                              | Notes                              |
| ---------------- | --------------- | ---------------------------------------- | ---------------------------------- |
| `id`             | `UUID`          | PK, DEFAULT `gen_random_uuid()`          | Config record identifier           |
| `tenant_id`      | `UUID`          | FK → `core.tenants(id)`, UNIQUE, NOT NULL | One config per tenant              |
| `keycloak_realm` | `VARCHAR(255)`  | UNIQUE, NOT NULL                         | e.g. `plexica-acme`               |
| `settings`       | `JSONB`         | NOT NULL, DEFAULT `'{}'::jsonb`          | Extensible tenant settings         |
| `created_at`     | `TIMESTAMPTZ`   | NOT NULL, DEFAULT `now()`                | Immutable                          |
| `updated_at`     | `TIMESTAMPTZ`   | NOT NULL, DEFAULT `now()`                | Updated via trigger or Prisma      |

### 2.2 Modified Tables

None — greenfield setup.

### 2.3 Indexes

| Table            | Index Name                          | Columns              | Type    |
| ---------------- | ----------------------------------- | -------------------- | ------- |
| `tenants`        | `tenants_pkey`                      | `id`                 | PK      |
| `tenants`        | `tenants_slug_key`                  | `slug`               | UNIQUE  |
| `tenants`        | `tenants_status_idx`                | `status`             | BTREE   |
| `tenant_configs` | `tenant_configs_pkey`               | `id`                 | PK      |
| `tenant_configs` | `tenant_configs_tenant_id_key`      | `tenant_id`          | UNIQUE  |
| `tenant_configs` | `tenant_configs_keycloak_realm_key` | `keycloak_realm`     | UNIQUE  |

### 2.4 Migrations

1. **`001_init_core_schema`**: Create `core` schema, `tenant_status` enum, `tenants` table, `tenant_configs` table, all indexes and constraints.

This is a single atomic migration. Prisma's `@@schema("core")` directive
and multi-schema support (`previewFeatures = ["multiSchema"]`) handle
schema qualification.

---

## 3. API Endpoints

No API endpoints in Phase 0 (per spec §8). The tenant schema utility is a
CLI tool invoked via `pnpm` script, not an HTTP endpoint.

### 3.1 CLI: Tenant Schema Utility

- **Command**: `pnpm --filter core-api tenant:create -- --slug <slug>`
- **Behavior**:
  1. Validate slug format (regex: `^[a-z][a-z0-9-]{1,61}[a-z0-9]$`)
  2. Check `core.tenants` — if slug exists, exit with error code 1 and message `"Schema tenant_<slug> already exists"`
  3. Begin transaction:
     a. `INSERT INTO core.tenants (slug, name, status)` with name defaulting to slug
     b. `CREATE SCHEMA tenant_<slug>`
     c. Run Prisma tenant migrations against the new schema
     d. `INSERT INTO core.tenant_configs (tenant_id, keycloak_realm)` with realm `plexica-<slug>`
  4. Commit transaction
  5. Exit with code 0 and message `"Tenant <slug> created successfully"`
- **Error cases**:
  | Condition | Exit Code | Message |
  | --------- | --------- | ------- |
  | Invalid slug format | 1 | `"Invalid slug: must be 3-63 chars, lowercase alphanumeric + hyphens, start with letter"` |
  | Schema already exists | 1 | `"Schema tenant_<slug> already exists"` |
  | DB connection failure | 1 | `"Database connection failed: <error>"` |
  | Migration failure | 1 | Transaction rolled back, `"Migration failed: <error>"` |

---

## 4. Component Design

### 4.1 Monorepo Root Configuration

- **Purpose**: Establish the pnpm workspace, shared TypeScript config, linting, and formatting.
- **Location**: Project root
- **Responsibilities**:
  - Define workspace packages (apps, packages, services)
  - Shared strict TypeScript configuration inherited by all packages
  - Unified ESLint flat config with TypeScript rules
  - Prettier formatting rules
  - Node.js engine enforcement (>= 20)
- **Key decisions**:
  - `tsconfig.base.json` sets `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
  - ESLint flat config (`eslint.config.js`) — no `.eslintrc`, per modern ESLint convention
  - `.npmrc` sets `engine-strict=true` to enforce Node >= 20 (edge case #6)

### 4.2 Docker Compose Dev Stack

- **Purpose**: One-command local development environment with all infrastructure services.
- **Location**: `docker-compose.yml`, `docker-compose.ci.yml`
- **Responsibilities**:
  - Run PostgreSQL, Keycloak, Redis, MinIO, Redpanda (single node), Mailhog
  - All services have healthchecks (NFR-01: < 60s to all green)
  - All ports configurable via `.env` with defaults in `.env.example`
- **Key configuration**:
  - All images pinned to exact digests (NFR-05)
  - Memory limits per container to prevent OOM (edge case #7):
    - PostgreSQL: 512MB
    - Keycloak: 768MB
    - Redis: 128MB
    - MinIO: 256MB
    - Redpanda: 512MB (dev mode)
    - Mailhog: 64MB
  - Healthchecks use `test`, `interval`, `timeout`, `retries`, `start_period`
  - `docker-compose.ci.yml` extends dev compose with CI-specific overrides (no port bindings to host, tighter memory limits)
  - Named volumes for data persistence across restarts

### 4.3 Keycloak Realm Provisioning

- **Purpose**: Pre-configured test realm with users for development and CI.
- **Location**: `infra/keycloak/realm-export.json`
- **Responsibilities**:
  - Import a `plexica-test` realm on Keycloak startup
  - Create 3 test users: `super-admin@plexica.test`, `admin@acme.test`, `member@acme.test`
  - Configure `plexica-web` client (public OIDC client for the SPA)
  - Define default roles: `super_admin`, `tenant_admin`, `member`
- **Key configuration**:
  - Realm export JSON mounted as volume and imported via `--import-realm` startup argument
  - Users have pre-set passwords (`test1234` for all test users — only in dev/CI)
  - Client configured with `http://localhost:3000/*` as valid redirect URI
  - Keycloak admin credentials from `.env` (`KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`)
- **Integration points**: Docker Compose healthcheck verifies realm is loaded via Keycloak REST API

### 4.4 Redpanda Setup

- **Purpose**: Event bus with pre-created core topics.
- **Location**: `infra/redpanda/`
- **Responsibilities**:
  - Single-node Redpanda in dev mode (no JVM, <100MB RAM per ADR-004)
  - Create core topics on startup: `tenant.events`, `user.events`, `plugin.events`
  - Topic naming follows ADR-004 convention
- **Key configuration**:
  - Init container or entrypoint script uses `rpk` CLI to create topics
  - Topic configs: 1 partition in dev (sufficient for single-node), retention 7 days
  - Healthcheck via Redpanda admin API (`/v1/status/ready`)
- **Integration points**: Docker Compose dependency chain ensures Redpanda is healthy before topic creation

### 4.5 PostgreSQL Core Schema & Tenant Utility

- **Purpose**: Core database schema and CLI for tenant provisioning.
- **Location**: `services/core-api/prisma/`, `services/core-api/src/lib/`
- **Responsibilities**:
  - Prisma schema defining `core.tenants` and `core.tenant_configs`
  - Migration for initial schema creation
  - CLI utility for creating tenant schemas on demand
- **Key decisions**:
  - Prisma multi-schema support via `previewFeatures = ["multiSchema"]`
  - Tenant schema migrations are separate Prisma schema files (empty at Phase 0)
  - The utility uses raw SQL for `CREATE SCHEMA` since Prisma doesn't support DDL for schema creation
  - Transaction wraps the entire tenant creation flow (insert + schema creation + migrations)
- **Dependencies**: Docker Compose PostgreSQL must be healthy

### 4.6 Design System (`@plexica/ui`)

- **Purpose**: Shared design tokens and 5 primitive UI components.
- **Location**: `packages/ui/`
- **Responsibilities**:
  - Design tokens (colors, spacing, radius, typography) as CSS custom properties
  - Tailwind CSS preset consuming the tokens
  - 5 Radix UI-based components: Button, Input, Dialog, Toast, Table
  - Storybook for component documentation and visual testing
  - WCAG 2.1 AA compliance on all components
- **Key decisions**:
  - Tokens defined as CSS custom properties with light/dark mode via `[data-theme]` attribute
  - Each component is a separate file (constitution: no file > 200 lines)
  - Tailwind preset in `packages/ui/tailwind-preset.ts` — consumed by all apps
  - Storybook uses Vite builder for fast startup (NFR-04: < 15s)
  - Components export from `packages/ui/src/index.ts` barrel file
- **Component specifications** (from spec §9):

  | Component | Variants | States | A11y |
  | --------- | -------- | ------ | ---- |
  | Button | primary, secondary, destructive, ghost, outline | disabled, loading | `aria-disabled`, `aria-busy`, focus ring |
  | Input | text, password, email | error, disabled | `aria-invalid`, `aria-describedby` for error/helper |
  | Dialog | — | open/closed | focus trap, ESC to close, `aria-modal`, `aria-labelledby` |
  | Toast | success, error, warning, info | auto-dismiss, manual dismiss | `role="alert"`, `aria-live="polite"` |
  | Table | — | sortable headers (visual only) | `role="table"`, proper `th`/`td` semantics |

### 4.7 CI Pipeline

- **Purpose**: Automated quality gate for all pull requests.
- **Location**: `.github/workflows/ci.yml`
- **Responsibilities**:
  - Run on PR open/update to main
  - Stages: lint → typecheck → build → Docker up → seed → unit tests → integration tests → E2E → teardown
  - Block merge on failure (Constitution Rule 2)
- **Key configuration**:
  - GitHub Actions with `ubuntu-latest` runner
  - pnpm cache via `actions/setup-node` with pnpm cache
  - Docker Compose CI variant for services
  - Playwright installed via `npx playwright install --with-deps chromium`
  - Artifact upload for Playwright reports on failure
  - Total pipeline target: < 10 min (NFR-02)

### 4.8 Playwright E2E Smoke Test

- **Purpose**: Verify the login page renders — the only user-interactive surface in Phase 0.
- **Location**: `apps/web/e2e/`
- **Responsibilities**:
  - Navigate to `http://localhost:3000`
  - Verify the login page renders (Keycloak login form or redirect)
  - Assert key elements are visible (login form, email input, password input, submit button)
- **Dependencies**: Docker Compose stack running, `apps/web` dev server running

---

## 5. File Map

> All paths relative to project root.

### Files to Create

| Path | Purpose | Complexity |
| ---- | ------- | ---------- |
| **Monorepo Root** | | |
| `package.json` | Root package.json with workspace scripts, engines field | S |
| `pnpm-workspace.yaml` | Workspace definition: `apps/*`, `packages/*`, `services/*` | S |
| `tsconfig.base.json` | Shared strict TypeScript config | S |
| `eslint.config.js` | Flat ESLint config with TypeScript rules | S |
| `.prettierrc` | Prettier formatting rules | S |
| `.npmrc` | `engine-strict=true`, `auto-install-peers=true` | S |
| `.gitignore` | Node, build artifacts, env files, IDE files | S |
| `.env.example` | All env vars with documented defaults | S |
| `README.md` | Getting started, prerequisites, `docker compose up` | M |
| **Docker Compose** | | |
| `docker-compose.yml` | Full dev stack with 6 services + healthchecks | L |
| `docker-compose.ci.yml` | CI override (no host ports, memory limits) | M |
| **Infrastructure Config** | | |
| `infra/keycloak/realm-export.json` | Test realm with 3 users, client config, roles | L |
| `infra/redpanda/create-topics.sh` | Entrypoint script to create core topics via `rpk` | S |
| **Core API Service** | | |
| `services/core-api/package.json` | Service package with Prisma, Fastify, Vitest deps | S |
| `services/core-api/tsconfig.json` | Extends `tsconfig.base.json` | S |
| `services/core-api/prisma/schema.prisma` | Core schema: tenants, tenant_configs | M |
| `services/core-api/prisma/migrations/001_init_core_schema/migration.sql` | Initial migration SQL | M |
| `services/core-api/src/lib/database.ts` | Prisma client singleton with connection management | S |
| `services/core-api/src/lib/config.ts` | Environment variable loader with Zod validation | S |
| `services/core-api/src/lib/logger.ts` | Pino logger configuration | S |
| `services/core-api/src/lib/tenant-schema.ts` | Tenant schema creation utility (core logic) | M |
| `services/core-api/src/cli/create-tenant.ts` | CLI entrypoint for `tenant:create` command | S |
| `services/core-api/vitest.config.ts` | Vitest configuration for integration tests | S |
| **Tenant Prisma Schema** | | |
| `services/core-api/prisma/tenant-schema.prisma` | Empty tenant schema template (validates migrations run) | S |
| **Design System** | | |
| `packages/ui/package.json` | Package with React, Radix UI, Tailwind deps | S |
| `packages/ui/tsconfig.json` | Extends `tsconfig.base.json`, JSX support | S |
| `packages/ui/tailwind-preset.ts` | Tailwind preset with design tokens | M |
| `packages/ui/src/tokens/colors.css` | CSS custom properties: neutral, primary, semantic scales | M |
| `packages/ui/src/tokens/spacing.css` | CSS custom properties: spacing scale | S |
| `packages/ui/src/tokens/radius.css` | CSS custom properties: border-radius scale | S |
| `packages/ui/src/tokens/typography.css` | Inter font, font sizes, line heights | S |
| `packages/ui/src/tokens/index.css` | Token barrel — imports all token files | S |
| `packages/ui/src/components/button.tsx` | Button component (Radix Slot-based) | M |
| `packages/ui/src/components/input.tsx` | Input component with error/helper states | M |
| `packages/ui/src/components/dialog.tsx` | Dialog component (Radix Dialog primitive) | M |
| `packages/ui/src/components/toast.tsx` | Toast component (Radix Toast primitive) | M |
| `packages/ui/src/components/table.tsx` | Table component with sortable header visuals | M |
| `packages/ui/src/index.ts` | Barrel export for all components and tokens | S |
| `packages/ui/.storybook/main.ts` | Storybook config with Vite builder | S |
| `packages/ui/.storybook/preview.ts` | Storybook preview with token imports, dark mode toggle | S |
| `packages/ui/src/stories/button.stories.tsx` | Button stories — all variants and states | S |
| `packages/ui/src/stories/input.stories.tsx` | Input stories — all types and states | S |
| `packages/ui/src/stories/dialog.stories.tsx` | Dialog stories — open/close, focus trap | S |
| `packages/ui/src/stories/toast.stories.tsx` | Toast stories — all variants, auto-dismiss | S |
| `packages/ui/src/stories/table.stories.tsx` | Table stories — sortable headers | S |
| **Frontend App (Shell)** | | |
| `apps/web/package.json` | Web app with React, Vite, TanStack Router | S |
| `apps/web/tsconfig.json` | Extends `tsconfig.base.json` | S |
| `apps/web/vite.config.ts` | Vite config with React plugin | S |
| `apps/web/index.html` | HTML entry point | S |
| `apps/web/src/main.tsx` | React app entry — renders login redirect placeholder | S |
| `apps/web/src/app.tsx` | Root App component (minimal — routes to login) | S |
| `apps/web/playwright.config.ts` | Playwright config for E2E tests | S |
| `apps/web/e2e/smoke.spec.ts` | E2E smoke test: login page renders | S |
| **CI** | | |
| `.github/workflows/ci.yml` | Full CI pipeline with all stages | L |
| **Integration Tests** | | |
| `services/core-api/src/__tests__/smoke-db.test.ts` | PostgreSQL connection + core schema exists | S |
| `services/core-api/src/__tests__/smoke-keycloak.test.ts` | Keycloak realm accessible, token exchange works | S |
| `services/core-api/src/__tests__/smoke-redis.test.ts` | Redis connection, set/get round-trip | S |
| `services/core-api/src/__tests__/smoke-redpanda.test.ts` | Redpanda produce/consume round-trip on `tenant.events` | M |
| `services/core-api/src/__tests__/smoke-minio.test.ts` | MinIO connection, bucket create/list | S |
| `services/core-api/src/__tests__/tenant-schema.test.ts` | Tenant creation utility — happy path + duplicate error | M |

### Files to Modify

None — greenfield setup.

### Files to Delete

None — greenfield setup.

### Files to Reference (Read-only)

| Path | Purpose |
| ---- | ------- |
| `.forge/constitution.md` | Validate architectural decisions |
| `.forge/knowledge/adr/adr-001-schema-per-tenant.md` | Schema-per-tenant pattern |
| `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` | Keycloak realm-per-tenant |
| `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md` | Redpanda topic conventions |
| `docs/02-ARCHITETTURA.md` | Architecture reference |

---

## 6. Dependencies

### 6.1 New Dependencies (Root)

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `typescript` | ^5.9 | Language (Constitution) |
| `eslint` | latest | Linting (Constitution) |
| `prettier` | latest | Formatting (Constitution) |
| `@typescript-eslint/eslint-plugin` | latest | TS ESLint rules |
| `@typescript-eslint/parser` | latest | TS ESLint parser |

### 6.2 New Dependencies (`services/core-api`)

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `fastify` | ^5 | HTTP framework (Constitution) |
| `prisma` | ^6 | ORM / migrations (Constitution) |
| `@prisma/client` | ^6 | Prisma client runtime |
| `pino` | latest | Structured logging |
| `zod` | latest | Input validation |
| `vitest` | ^4 | Test runner (Constitution) |
| `ioredis` | ^5 | Redis client (Constitution) |
| `kafkajs` | ^2 | Kafka client for Redpanda (Constitution) |
| `minio` | ^8 | MinIO client (Constitution) |

### 6.3 New Dependencies (`packages/ui`)

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `react` | ^19 | UI framework (Constitution) |
| `react-dom` | ^19 | React DOM renderer |
| `@radix-ui/react-dialog` | latest | Dialog primitive (Constitution) |
| `@radix-ui/react-toast` | latest | Toast primitive |
| `@radix-ui/react-slot` | latest | Button composition |
| `tailwindcss` | latest | Styling (Constitution) |
| `class-variance-authority` | latest | Variant management for components |
| `clsx` | latest | Class name utility |
| `tailwind-merge` | latest | Tailwind class deduplication |
| `storybook` | latest | Component documentation |
| `@storybook/react-vite` | latest | Storybook Vite builder |
| `lucide-react` | latest | Icons (Constitution) |

### 6.4 New Dependencies (`apps/web`)

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `react` | ^19 | UI framework (Constitution) |
| `react-dom` | ^19 | React DOM renderer |
| `vite` | latest | Build tool (Constitution) |
| `@vitejs/plugin-react` | latest | Vite React plugin |
| `@tanstack/react-router` | latest | Routing (Constitution) |
| `@playwright/test` | latest | E2E testing (Constitution) |

### 6.5 Internal Dependencies

- `apps/web` → `packages/ui` (design system)
- `packages/ui` → none (leaf package)
- `services/core-api` → none (leaf package)

---

## 7. Implementation Phases

### Phase 1: Monorepo Scaffolding (Parallel-safe: standalone)

**Objective**: Establish workspace structure, tooling, and shared configs.

**Files to Create**:
- `package.json` — Root with `engines: { "node": ">=20" }`, workspace scripts
- `pnpm-workspace.yaml` — `packages: ['apps/*', 'packages/*', 'services/*']`
- `tsconfig.base.json` — Strict mode, path aliases
- `eslint.config.js` — Flat config with TypeScript plugin
- `.prettierrc` — Consistent formatting
- `.npmrc` — `engine-strict=true`
- `.gitignore` — Comprehensive ignore list
- `.env.example` — All environment variables with defaults

**Verification**: `pnpm install` succeeds, `pnpm tsc --noEmit` succeeds on
empty workspace.

**Estimated effort**: 2-3 hours

### Phase 2: Docker Compose Stack (Depends on Phase 1 for `.env.example`)

**Objective**: All 6 infrastructure services running with healthchecks.

**Files to Create**:
- `docker-compose.yml` — Full stack definition
- `docker-compose.ci.yml` — CI override
- `infra/keycloak/realm-export.json` — Test realm with 3 users
- `infra/redpanda/create-topics.sh` — Topic creation script

**Tasks**:
1. [ ] Pin all Docker images to exact SHA digests (NFR-05)
2. [ ] Configure healthchecks for all 6 services
3. [ ] Set memory limits for CI stability (edge case #7)
4. [ ] Configure Keycloak `--import-realm` with volume mount
5. [ ] Configure Redpanda dev mode with topic init
6. [ ] Make all ports configurable via `${VAR:-default}` in compose
7. [ ] Verify `docker compose up` → all healthy < 60s (NFR-01)

**Verification**: `docker compose up -d --wait` completes with all services healthy.

**Estimated effort**: 4-6 hours

### Phase 3: Core API + Database (Depends on Phase 1, Phase 2)

**Objective**: Prisma schema, core migration, and tenant creation utility.

**Files to Create**:
- `services/core-api/package.json`
- `services/core-api/tsconfig.json`
- `services/core-api/prisma/schema.prisma`
- `services/core-api/prisma/migrations/001_init_core_schema/migration.sql`
- `services/core-api/prisma/tenant-schema.prisma`
- `services/core-api/src/lib/database.ts`
- `services/core-api/src/lib/config.ts`
- `services/core-api/src/lib/logger.ts`
- `services/core-api/src/lib/tenant-schema.ts`
- `services/core-api/src/cli/create-tenant.ts`
- `services/core-api/vitest.config.ts`

**Tasks**:
1. [ ] Define Prisma schema with multi-schema support (`core` schema)
2. [ ] Generate and verify migration SQL
3. [ ] Implement `tenant-schema.ts` with validation, transaction, and error handling
4. [ ] Implement `create-tenant.ts` CLI wrapper
5. [ ] Add `tenant:create` and `db:migrate` scripts to `package.json`
6. [ ] Run migration against Docker PostgreSQL, verify tables exist

**Verification**: `pnpm --filter core-api db:migrate` succeeds; `pnpm --filter core-api tenant:create -- --slug acme` creates `tenant_acme` schema.

**Estimated effort**: 4-6 hours

### Phase 4: Design System (Parallel with Phase 3 — no dependency)

**Objective**: Design tokens + 5 Radix UI components + Storybook.

**Files to Create**:
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/tailwind-preset.ts`
- `packages/ui/src/tokens/colors.css`
- `packages/ui/src/tokens/spacing.css`
- `packages/ui/src/tokens/radius.css`
- `packages/ui/src/tokens/typography.css`
- `packages/ui/src/tokens/index.css`
- `packages/ui/src/components/button.tsx`
- `packages/ui/src/components/input.tsx`
- `packages/ui/src/components/dialog.tsx`
- `packages/ui/src/components/toast.tsx`
- `packages/ui/src/components/table.tsx`
- `packages/ui/src/index.ts`
- `packages/ui/.storybook/main.ts`
- `packages/ui/.storybook/preview.ts`
- `packages/ui/src/stories/button.stories.tsx`
- `packages/ui/src/stories/input.stories.tsx`
- `packages/ui/src/stories/dialog.stories.tsx`
- `packages/ui/src/stories/toast.stories.tsx`
- `packages/ui/src/stories/table.stories.tsx`

**Tasks**:
1. [ ] Define color tokens (neutral 50-950, primary blue 50-950, semantic colors) as CSS custom properties
2. [ ] Implement light/dark mode via `[data-theme="dark"]` selector
3. [ ] Create Tailwind preset consuming CSS custom properties
4. [ ] Implement 5 components using Radix UI primitives + Tailwind
5. [ ] Ensure all components pass WCAG 2.1 AA (focus management, aria attributes, contrast)
6. [ ] Write Storybook stories for each component
7. [ ] Verify Storybook cold start < 15s (NFR-04)

**Verification**: `pnpm --filter ui storybook` starts and all 5 components render with correct tokens.

**Estimated effort**: 8-12 hours

### Phase 5: Frontend Shell (Depends on Phase 4 for design system)

**Objective**: Minimal web app that shows a login page (or Keycloak redirect placeholder).

**Files to Create**:
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/app.tsx`

**Tasks**:
1. [ ] Configure Vite with React plugin and `@plexica/ui` consumption
2. [ ] Create minimal App component that renders a login page placeholder
3. [ ] Verify `pnpm --filter web dev` starts and page renders

**Verification**: `http://localhost:3000` shows a page with login UI elements.

**Estimated effort**: 2-3 hours

### Phase 6: Integration Smoke Tests (Depends on Phase 2, Phase 3)

**Objective**: Vitest integration tests proving every infrastructure service is reachable and functional.

**Files to Create**:
- `services/core-api/src/__tests__/smoke-db.test.ts`
- `services/core-api/src/__tests__/smoke-keycloak.test.ts`
- `services/core-api/src/__tests__/smoke-redis.test.ts`
- `services/core-api/src/__tests__/smoke-redpanda.test.ts`
- `services/core-api/src/__tests__/smoke-minio.test.ts`
- `services/core-api/src/__tests__/tenant-schema.test.ts`

**Tasks**:
1. [ ] DB smoke: connect, verify `core` schema and tables exist
2. [ ] Keycloak smoke: call OIDC discovery endpoint, exchange client credentials for token
3. [ ] Redis smoke: SET, GET, DEL round-trip
4. [ ] Redpanda smoke: produce to `tenant.events`, consume back, verify payload
5. [ ] MinIO smoke: create bucket, put object, list objects, delete
6. [ ] Tenant schema test: create tenant `test-slug`, verify schema + tables, attempt duplicate (expect error)

**Verification**: `pnpm --filter core-api test` — all 6 test files pass.

**Estimated effort**: 4-6 hours

### Phase 7: E2E Test + CI Pipeline (Depends on all previous phases)

**Objective**: Playwright smoke test and full CI pipeline configuration.

**Files to Create**:
- `apps/web/playwright.config.ts`
- `apps/web/e2e/smoke.spec.ts`
- `.github/workflows/ci.yml`

**Tasks**:
1. [ ] Configure Playwright for Chromium-only, base URL `http://localhost:3000`
2. [ ] Write smoke test: navigate to `/`, assert login page elements visible
3. [ ] Configure CI pipeline with all stages (lint → typecheck → build → Docker up → seed → unit → integration → E2E → teardown)
4. [ ] Configure pnpm caching in CI
5. [ ] Add Playwright report upload on failure
6. [ ] Verify pipeline runs < 10 min (NFR-02)

**Verification**: Full CI pipeline passes on a test PR.

**Estimated effort**: 4-6 hours

### Implementation Order Summary

```
Phase 1 (Monorepo)
    ├── Phase 2 (Docker Compose) ─── Phase 3 (Core API + DB) ─── Phase 6 (Smoke Tests)
    │                                                                      │
    └── Phase 4 (Design System) ─── Phase 5 (Frontend Shell) ─────────────┤
                                                                           │
                                                              Phase 7 (E2E + CI)
```

**Critical path**: Phase 1 → Phase 2 → Phase 3 → Phase 6 → Phase 7

**Parallel tracks**:
- Track A: Phases 1 → 2 → 3 → 6 (backend/infra)
- Track B: Phases 1 → 4 → 5 (frontend/design system)
- Merge: Phase 7 (depends on both tracks)

---

## 8. Testing Strategy

### 8.1 Integration Smoke Tests (Vitest)

These tests run against real Docker services — no mocks (Constitution: "tests that ran against mocks instead of real services" was a v1 failure).

| Test File | Service | What It Proves | FR Ref |
| --------- | ------- | -------------- | ------ |
| `smoke-db.test.ts` | PostgreSQL | Connection works, `core` schema exists, `tenants` + `tenant_configs` tables exist | FR-006 |
| `smoke-keycloak.test.ts` | Keycloak | `plexica-test` realm accessible, OIDC discovery works, token exchange succeeds | FR-005 |
| `smoke-redis.test.ts` | Redis | Connection works, SET/GET/DEL round-trip | FR-002 |
| `smoke-redpanda.test.ts` | Redpanda | Connection works, produce/consume on `tenant.events`, all 3 topics exist | FR-008 |
| `smoke-minio.test.ts` | MinIO | Connection works, bucket CRUD operations | FR-002 |
| `tenant-schema.test.ts` | PostgreSQL | Tenant creation happy path, duplicate slug rejection, schema exists in PG | FR-007 |

### 8.2 E2E Test (Playwright)

| Test File | What It Proves | FR Ref |
| --------- | -------------- | ------ |
| `smoke.spec.ts` | Login page renders in a real browser, key form elements visible | FR-012 |

### 8.3 What "Green CI" Means for This Spec

All of the following must pass:

1. **Lint**: `pnpm lint` exits 0 (no ESLint errors)
2. **Typecheck**: `pnpm tsc --noEmit` exits 0 (no TypeScript errors)
3. **Build**: `pnpm build` exits 0 (all packages compile)
4. **Docker up**: `docker compose -f docker-compose.ci.yml up -d --wait` — all healthchecks green
5. **Seed**: `pnpm --filter core-api db:migrate` — migrations applied
6. **Unit tests**: `pnpm --filter core-api test` — all Vitest tests pass
7. **Integration tests**: included in the Vitest test suite (smoke tests run against real services)
8. **E2E tests**: `pnpm --filter web test:e2e` — Playwright smoke test passes
9. **Teardown**: `docker compose down -v` — clean shutdown

---

## 9. Architectural Decisions

| ADR | Decision | Relevance to This Spec |
| --- | -------- | ---------------------- |
| ADR-001 | Schema-per-tenant PostgreSQL | Core schema + tenant utility directly implement this |
| ADR-002 | Keycloak multi-realm | Realm export and test users establish the pattern |
| ADR-004 | Redpanda for event bus | Topic creation and single-node dev setup |
| ADR-006 | Plugin tables in tenant schema | Tenant schema structure prepared for future plugin tables |
| ADR-007 | Plugin-brings-migrations, core-executes | Tenant utility establishes the migration runner pattern |
| ADR-008 | TypeScript core | Core API service uses TypeScript exclusively |

**New ADRs needed**: None.

---

## 10. Requirement Traceability

| Requirement | Plan Section | Implementation Component | Acceptance Test |
| ----------- | ------------ | ------------------------ | --------------- |
| FR-001 | §7 Phase 1 | Monorepo root files | Lint + typecheck in CI |
| FR-002 | §7 Phase 2 | `docker-compose.yml` | `smoke-db`, `smoke-redis`, `smoke-minio` |
| FR-003 | §7 Phase 2 | `.env.example` + compose `${VAR:-default}` | Manual: override port in `.env`, verify |
| FR-004 | §7 Phase 7 | `docker-compose.ci.yml` + `.github/workflows/ci.yml` | CI pipeline runs Docker up stage |
| FR-005 | §7 Phase 2 | `infra/keycloak/realm-export.json` | `smoke-keycloak.test.ts` |
| FR-006 | §7 Phase 3 | Prisma schema + migration | `smoke-db.test.ts` |
| FR-007 | §7 Phase 3 | `tenant-schema.ts` + `create-tenant.ts` | `tenant-schema.test.ts` |
| FR-008 | §7 Phase 2 | `infra/redpanda/create-topics.sh` | `smoke-redpanda.test.ts` |
| FR-009 | §7 Phase 4 | `packages/ui/src/tokens/` | Storybook visual verification |
| FR-010 | §7 Phase 4 | `packages/ui/src/components/` + stories | Storybook renders all 5 |
| FR-011 | §7 Phase 7 | `.github/workflows/ci.yml` | CI pipeline completes all stages |
| FR-012 | §7 Phase 7 | `apps/web/e2e/smoke.spec.ts` | Playwright test passes |
| NFR-01 | §4.2 | Docker Compose healthchecks + resource config | Timed: `docker compose up --wait` < 60s |
| NFR-02 | §7 Phase 7 | CI pipeline optimization | CI run duration < 10 min |
| NFR-03 | §7 Phase 1 | pnpm workspace + `.npmrc` | Timed: `pnpm install` from clean < 90s |
| NFR-04 | §7 Phase 4 | Storybook Vite builder config | Timed: Storybook cold start < 15s |
| NFR-05 | §7 Phase 2 | Docker image digest pins | Audit: all images use `@sha256:` |
| NFR-06 | §7 Phase 2 | `.env.example` + compose variables | Test: override port, verify service binds |

---

## 11. Risk Register

| ID | Risk | Impact | Likelihood | Mitigation |
| -- | ---- | ------ | ---------- | ---------- |
| R-01 | **Redpanda single-node instability in CI** — Redpanda may fail health checks under resource pressure in CI runners | MEDIUM | MEDIUM | Use Redpanda dev mode (`--set redpanda.developer_mode=true`), increase healthcheck retries to 10 with 5s interval, set 512MB memory limit |
| R-02 | **Docker Compose resource limits exceed CI runner capacity** — 6 services + test runner may OOM on standard GitHub Actions runner (7GB RAM) | HIGH | MEDIUM | Profile total memory usage; set explicit memory limits per container (total < 2.5GB for services); use `docker-compose.ci.yml` with reduced limits; monitor with `docker stats`; escalate to Large Runner if needed |
| R-03 | **Keycloak realm import failure** — Corrupted or version-incompatible realm JSON | LOW | LOW | Pin Keycloak to exact image digest; export realm from the same version; healthcheck verifies realm endpoint responds; CI fails fast at Docker-up stage |
| R-04 | **Port conflict on developer machines** — Default ports (5432, 8080, 6379, etc.) already in use | LOW | MEDIUM | All ports configurable via `.env`; `.env.example` documents defaults; Docker Compose fails fast with clear error; README documents the override procedure |
| R-05 | **Storybook cold start exceeds NFR-04 (15s)** — Heavy Radix + Tailwind dependencies may slow Storybook | LOW | LOW | Use Vite builder (not Webpack); lazy-load stories; monitor startup time; optimize imports if needed |

### Edge Case Coverage

| Edge Case (from spec §6) | Handled By |
| ------------------------- | ---------- |
| Port conflict | `.env` overrides (FR-003), clear error from Docker Compose |
| Docker not installed | README prerequisites section, Docker Compose error message |
| Keycloak realm import fails | Container healthcheck fails, stack reports unhealthy |
| Redpanda fails to start | Healthcheck + retries, CI fails at Docker-up stage |
| Tenant schema already exists | `tenant-schema.ts` checks before creation, returns error |
| Node < 20 | `.npmrc` `engine-strict=true` + `package.json` `engines` field |
| CI runner OOM | Per-container memory limits in `docker-compose.ci.yml` |

---

## 12. Constitution Compliance

| Article | Status | Notes |
| ------- | ------ | ----- |
| Rule 1: E2E tests | COMPLIANT | Playwright smoke test covers the login page — the only user-interactive surface. Infrastructure features use integration smoke tests against real services. |
| Rule 2: Green CI | COMPLIANT | Full CI pipeline defined in Phase 7 with all stages. Merge is blocked on failure. |
| Rule 3: One pattern per type | COMPLIANT | Design system establishes the single component library (Radix + Tailwind). No competing patterns. |
| Rule 4: 200-line limit | COMPLIANT | All files designed to stay under 200 lines. Components are individual files. Tokens split across multiple CSS files. |
| Rule 5: ADR for arch decisions | COMPLIANT | No new architectural decisions needed — ADR-001 through ADR-009 cover all choices. |
| Technology Stack | COMPLIANT | All technologies match the constitution: Fastify ^5, Prisma ^6, React ^19, Vite, TanStack Router, Tailwind, Radix UI, Playwright, Vitest ^4, pnpm. |
| Architecture | COMPLIANT | Schema-per-tenant (FR-006/007), Keycloak multi-realm (FR-005), Redpanda (FR-008) all match prescribed architecture. |
| Security | COMPLIANT | Docker images pinned to digests (NFR-05). No secrets in code. `.env.example` has placeholder values only. Zod validation on CLI inputs. |
| Quality: WCAG 2.1 AA | COMPLIANT | All 5 UI components built on Radix primitives with proper ARIA attributes, focus management, and keyboard support. |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec | `.forge/specs/001-infrastructure-setup/spec.md` |
| Constitution | `.forge/constitution.md` |
| ADR-001 | `.forge/knowledge/adr/adr-001-schema-per-tenant.md` |
| ADR-002 | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` |
| ADR-004 | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md` |
| Architecture ref | `docs/02-ARCHITETTURA.md` |
| Decision Log | `.forge/knowledge/decision-log.md` |
| Tasks | _Created by `/forge-tasks`_ |
