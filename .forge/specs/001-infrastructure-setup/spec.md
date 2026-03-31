# Spec: 001 - Infrastructure Setup

> Feature specification for Phase 0 — Infrastructure Setup.
> Created by the `forge-pm` agent via `/forge-specify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Ready      |
| Author  | forge-pm   |
| Date    | 2026-03-26 |
| Track   | Feature    |
| Spec ID | 001        |

---

## 1. Overview

Bootstrap the entire development and CI environment from scratch. This phase
delivers a working monorepo, containerised dev stack, design system foundation,
and a green CI pipeline — everything needed before any application code is
written. Phase duration: 1-2 weeks.

## 2. Problem Statement

Plexica v2 is a clean rewrite. There is no existing infrastructure, no
monorepo, no CI pipeline, and no design system. Without a reliable, reproducible
development environment, all subsequent feature work is blocked. This phase
establishes the foundation that every other phase depends on.

The v1 codebase suffered from inconsistent local setups, unreliable CI, and
tests that ran against mocks instead of real services. Phase 0 eliminates
these problems by delivering a Docker-based stack that runs identically in
dev and CI, with real services (Keycloak, PostgreSQL, Redpanda) from day one.

## 3. User Stories

### US-001: Developer Environment Setup

**As a** developer joining the Plexica v2 project,
**I want** to run a single command (`docker compose up`) and have the entire
stack available locally,
**so that** I can start developing features without manual service configuration.

**Acceptance Criteria:**

- Given Docker is installed, when I run `docker compose up`, then PostgreSQL,
  Keycloak, Redis, MinIO, Redpanda, and Mailpit all reach `healthy` status.
- Given `.env.example` exists, when I copy it to `.env`, then all services
  start on the documented default ports.
- Given a port conflict on my machine, when I override a port in `.env`, then
  the corresponding service starts on the custom port.

### US-002: CI Pipeline Reliability

**As a** developer opening a pull request,
**I want** CI to run lint, typecheck, build, and all test suites against real
services,
**so that** I have confidence my changes work in an environment identical to
local dev.

**Acceptance Criteria:**

- Given a PR is opened, when GitHub Actions triggers, then all stages (lint,
  typecheck, build, Docker up, seed, unit, integration, E2E, teardown) run.
- Given all stages pass, when the pipeline completes, then it reports green.
- Given a test fails, when the pipeline completes, then it reports red and
  blocks merge.

### US-003: Design System Foundation

**As a** frontend developer building UI components,
**I want** a design system with base tokens and primitive components available
in Storybook,
**so that** I can build consistent, accessible UIs from the start.

**Acceptance Criteria:**

- Given the `@plexica/ui` package is built, when I start Storybook, then
  Button, Input, Dialog, Toast, and Table components render with all tokens.
- Given the token set includes semantic colors, when I use `error` or `success`
  tokens, then they resolve to the correct color values in both light and dark
  mode.

### US-004: Tenant Schema Provisioning

**As a** backend developer implementing multi-tenancy,
**I want** a utility that creates and migrates tenant schemas on demand,
**so that** I can test schema-per-tenant isolation from the first sprint.

**Acceptance Criteria:**

- Given the `core` schema exists with `tenants` and `tenant_configs` tables,
  when I invoke the utility with slug `acme`, then a `tenant_acme` schema is
  created and Prisma migrations run.
- Given a tenant schema is created, when I query `core.tenants`, then the
  new tenant record exists.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                                                  | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| FR-001 | pnpm workspace monorepo with `apps/`, `packages/`, `services/` structure, shared tsconfig, eslint, prettier                                                                                                  | Must     | US-001    |
| FR-002 | Docker Compose with PostgreSQL, Keycloak, Redis, MinIO, Redpanda (1 node), Mailpit — all with healthchecks                                                                                                   | Must     | US-001    |
| FR-003 | All Docker Compose ports configurable via `.env` with defaults in `.env.example`                                                                                                                             | Must     | US-001    |
| FR-004 | Docker Compose for CI identical to dev, runnable in GitHub Actions                                                                                                                                           | Must     | US-002    |
| FR-005 | Keycloak automated setup: test realm import with 3 users (super-admin, tenant admin, tenant member)                                                                                                          | Must     | US-001    |
| FR-006 | PostgreSQL `core` schema init with `tenants` and `tenant_configs` tables                                                                                                                                     | Must     | US-004    |
| FR-007 | Tenant schema creation/migration utility (creates `tenant_<slug>` schema, runs Prisma migrations)                                                                                                            | Must     | US-004    |
| FR-008 | Redpanda setup with allow-list of core topics (`tenant.events`, `user.events`, `plugin.events`) created on startup                                                                                           | Must     | US-001    |
| FR-009 | Design system tokens: Inter font, neutral scale (50-950), primary blue + variants, semantic colors (success/green, warning/amber, error/red, info/blue), light/dark mode, spacing scale, border-radius scale | Must     | US-003    |
| FR-010 | Storybook with 5 components: Button, Input, Dialog, Toast, Table                                                                                                                                             | Must     | US-003    |
| FR-011 | CI pipeline: lint → typecheck → build → Docker up → seed → unit tests → integration tests → E2E → teardown                                                                                                   | Must     | US-002    |
| FR-012 | Playwright smoke test: open frontend, verify login page renders                                                                                                                                              | Must     | US-002    |

## 5. Non-Functional Requirements

| ID     | Category    | Requirement                                                   | Target   |
| ------ | ----------- | ------------------------------------------------------------- | -------- |
| NFR-01 | Performance | Docker Compose startup (from `up` to all healthchecks green)  | < 60s    |
| NFR-02 | Performance | CI pipeline total duration                                    | < 10 min |
| NFR-03 | Performance | `pnpm install` from clean cache                               | < 90s    |
| NFR-04 | Performance | Storybook cold start                                          | < 15s    |
| NFR-05 | Security    | All Docker images pinned to exact digests (no `:latest` tags) | 100%     |
| NFR-06 | DX          | All service ports configurable via `.env` file                | 100%     |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                             | Expected Behavior                                                                  |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Port conflict: a default port is in use on host      | Docker Compose fails fast with clear error message; dev overrides port in `.env`   |
| 2   | Docker not installed or Docker daemon not running    | `docker compose up` fails with actionable error; README documents prerequisite     |
| 3   | Keycloak realm import fails (corrupted JSON)         | Container healthcheck fails; logs show import error; stack does not report healthy |
| 4   | Redpanda fails to start within healthcheck timeout   | Docker Compose reports unhealthy; CI pipeline fails at Docker-up stage             |
| 5   | Tenant schema already exists when utility is invoked | Utility reports "schema already exists" error; does not drop or overwrite          |
| 6   | `pnpm install` runs with Node < 20                   | `.npmrc` or `engines` field rejects the install with clear version error           |
| 7   | CI runner runs out of memory with all containers     | Container memory limits prevent OOM kill; pipeline fails gracefully                |

## 7. Data Requirements

### Core Schema (`core`)

| Table            | Columns                                                                                                             | Notes                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `tenants`        | `id` (UUID PK), `slug` (unique), `name`, `status` (enum: active/suspended/deleted), `created_at`, `updated_at`      | Central tenant registry  |
| `tenant_configs` | `id` (UUID PK), `tenant_id` (FK→tenants), `keycloak_realm` (unique), `settings` (JSONB), `created_at`, `updated_at` | Per-tenant configuration |

### Tenant Schema (`tenant_<slug>`)

Empty at Phase 0. The schema is created and Prisma migrations are verified to
run, but no application tables are defined until Phase 1+.

## 8. API Requirements

No API endpoints in Phase 0. The tenant schema utility is a CLI tool, not an
HTTP endpoint.

## 9. UX/UI Notes

### Design System Tokens

- **Font**: Inter (variable weight)
- **Neutral scale**: gray 50-950 (11 steps)
- **Primary**: blue with 50-950 variants
- **Semantic**: success (green), warning (amber), error (red), info (blue) — each with base, light, dark variants
- **Spacing**: 4px base unit scale (0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24)
- **Border radius**: sm (2px), md (4px), lg (8px), xl (12px), full (9999px)
- **Modes**: Light and dark mode support via CSS custom properties

### Components (Radix UI primitives)

All 5 components must meet WCAG 2.1 AA accessibility per the Constitution:

- **Button**: primary, secondary, destructive, ghost, outline variants; disabled state; loading state
- **Input**: text, password, email types; error state; helper text; label
- **Dialog**: modal with close, title, description, actions; focus trap; ESC to close
- **Toast**: success, error, warning, info variants; auto-dismiss; dismiss button
- **Table**: header, body, row, cell; sortable headers (visual only, no logic)

## 10. Out of Scope

The following are explicitly **not** part of Phase 0:

- **Application code**: No auth middleware, API endpoints, tenant provisioning
  UI, workspace logic, or plugin system.
- **Production deployment**: No Kubernetes manifests, Terraform, Helm charts,
  or cloud provider configuration.
- **Monitoring & observability**: No Prometheus, Grafana, Jaeger, or structured
  log aggregation. Pino logger is configured but no log shipping.
- **Load testing**: No performance benchmarks beyond the NFR startup/build metrics.
- **Plugin infrastructure**: No Module Federation setup, SDK, or plugin lifecycle.
  Deferred to Phase 2+.
- **Email templates**: Mailpit is available for dev but no email templates or
  notification logic.
- **User management UI**: No screens for managing users, tenants, or roles.

## 11. Open Questions

None. All ambiguities resolved during `/forge-clarify` session on 2026-03-26.

## 12. Implementation Scope

> **Note**: All paths are relative to the project root.

### New Components

| Component Type       | Path                               | Description                                          |
| -------------------- | ---------------------------------- | ---------------------------------------------------- |
| Monorepo config      | `pnpm-workspace.yaml`              | Workspace definition for apps/, packages/, services/ |
| TypeScript config    | `tsconfig.base.json`               | Shared TS config with strict mode                    |
| ESLint config        | `eslint.config.js`                 | Shared lint rules                                    |
| Prettier config      | `.prettierrc`                      | Formatting rules                                     |
| Docker Compose (dev) | `docker-compose.yml`               | Full dev stack with healthchecks                     |
| Docker Compose (CI)  | `docker-compose.ci.yml`            | CI variant (override or identical)                   |
| Env example          | `.env.example`                     | All env vars with default values documented          |
| Keycloak realm       | `infra/keycloak/realm-export.json` | Pre-configured test realm with 3 users               |
| Core schema init     | `services/core-api/prisma/`        | Prisma schema for core tables                        |
| Tenant utility       | `services/core-api/src/lib/`       | CLI/util for tenant schema creation                  |
| Redpanda config      | `infra/redpanda/`                  | Topic allow-list and startup configuration           |
| Design system        | `packages/ui/`                     | @plexica/ui — tokens + 5 components                  |
| Storybook            | `packages/ui/.storybook/`          | Storybook configuration                              |
| CI pipeline          | `.github/workflows/ci.yml`         | Full CI pipeline                                     |
| Playwright smoke     | `apps/web/e2e/`                    | First E2E smoke test                                 |

### Modified Components

No existing components — this is a greenfield setup.

### Documentation Updates

| Path           | Section         | Update Description                                     |
| -------------- | --------------- | ------------------------------------------------------ |
| `README.md`    | Getting Started | Setup instructions, prerequisites, `docker compose up` |
| `.env.example` | All             | Document every environment variable with defaults      |

## 13. Constitution Compliance

| Article                        | Status    | Notes                                                                                                                                       |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule 1: E2E tests              | COMPLIANT | 001-09 provides Playwright E2E for the login page (the only user-interactive surface). Infrastructure features use integration smoke tests. |
| Rule 2: Green CI               | COMPLIANT | FR-011 defines the full CI pipeline; AC-03 requires green status.                                                                           |
| Rule 3: One pattern/type       | COMPLIANT | Design system establishes the single pattern for each UI primitive.                                                                         |
| Rule 4: 200-line limit         | COMPLIANT | All files will be decomposed to stay under 200 lines.                                                                                       |
| Rule 5: ADR for arch decisions | COMPLIANT | ADR-001 through ADR-009 already accepted for all foundational decisions.                                                                    |
| Technology Stack               | COMPLIANT | All prescribed technologies at correct versions. Docker images pinned (NFR-05).                                                             |
| Architecture                   | COMPLIANT | Schema-per-tenant (FR-006/007), Keycloak multi-realm (FR-005), Redpanda (FR-008) match architecture.                                        |
| Security                       | COMPLIANT | Docker images pinned to digests. No secrets in code. `.env.example` has no real credentials.                                                |
| Quality Standards              | COMPLIANT | NFR targets defined and measurable. WCAG 2.1 AA for all UI components.                                                                      |

---

## Cross-References

| Document     | Path                               |
| ------------ | ---------------------------------- |
| Constitution | `.forge/constitution.md`           |
| Architecture | `docs/02-ARCHITETTURA.md`          |
| Decision Log | `.forge/knowledge/decision-log.md` |
| ADRs         | `.forge/knowledge/adr/`            |
| Plan         | _Created by `/forge-plan`_         |
| Tasks        | _Created by `/forge-tasks`_        |

## Testing Strategy

Infrastructure features (001-01 through 001-08) are verified via **CI build
checks and Vitest integration smoke tests** that exercise real services (DB
connections, Kafka produce/consume, Keycloak token exchange). These are not
Playwright E2E tests because they have no user-facing UI.

Feature 001-09 is the single **Playwright E2E test** for this phase: it opens
the frontend in a real browser and verifies the login page renders. This
satisfies Constitution Rule 1 ("if a user can interact with it, there is an
E2E test for it") — the login page is the only user-interactive surface in
Phase 0.

## Risks

| ID   | Risk                                                       | Impact | Likelihood | Mitigation                                                                                                |
| ---- | ---------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| R-01 | Redpanda single-node instability in CI                     | MEDIUM | MEDIUM     | Tune container resource limits, add healthcheck retries with backoff, use Redpanda dev mode               |
| R-02 | Keycloak realm import JSON format changes across versions  | LOW    | LOW        | Pin Keycloak image to exact digest, version-lock realm export JSON                                        |
| R-03 | Docker Compose resource limits exceed CI runner capacity   | HIGH   | MEDIUM     | Profile memory usage per container, set explicit memory limits, use GitHub Actions Large Runner if needed |
| R-04 | pnpm workspace hoisting conflicts with native dependencies | MEDIUM | LOW        | Use `.pnpmfile.cjs` hooks for problem packages                                                            |
