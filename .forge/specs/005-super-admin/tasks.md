# Tasks: 005 — Super Admin Panel

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by `forge-scrum` via `/forge-tasks`.

| Field   | Value                                         |
| ------- | --------------------------------------------- |
| Status  | Pending                                       |
| Author  | forge-scrum                                   |
| Date    | 2026-07-10                                    |
| Spec    | `.forge/specs/005-super-admin/spec.md`        |
| Plan    | `.forge/specs/005-super-admin/plan.md`        |
| ADR     | ADR-022 — Super Admin Infra and Data Model    |
| Sprint  | `.forge/sprints/active/sprint-005.yaml`       |

---

## Legend

- `[FR-NNN]` — Requirement implemented (traceability to spec feature 005-NN)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending · `[x]` done · `[-]` skipped
- **Files**: Explicit path relative to working directory
- **Type**: backend | frontend | test | infra | integration
- **Estimate**: S (1h) | M (2-4h) | L (4-8h)
- **Depends on**: [TASK-IDs] or "none"

Task IDs use a numeric scheme:
- `S5-000` — Task 0 (security fix)
- `S5-001` — Prisma migration
- `S5-002` — Loki + Grafana infra
- `S5-100`–`S5-199` — Feature 005-09 (health check)
- `S5-200`–`S5-299` — Feature 005-02 (tenant list)
- `S5-300`–`S5-399` — Feature 005-03 (tenant detail)
- `S5-400`–`S5-499` — Feature 005-04 (provisioning)
- `S5-500`–`S5-599` — Feature 005-05 (suspension)
- `S5-600`–`S5-599` — Feature 005-06 (reactivation)
- `S5-700`–`S5-799` — Feature 005-07 (deletion)
- `S5-800`–`S5-899` — Feature 005-08 (plugin catalog)
- `S5-900`–`S5-999` — Feature 005-11 (Kafka status)
- `S5-A00`–`S5-A99` — Feature 005-10 (system logs)
- `S5-B00`–`S5-B99` — Feature 005-01 (dashboard)
- `S5-C00`–`S5-C99` — Admin app setup + CI

---

## Phase 0: Pre-Implementation Security Fix & Foundations

> These tasks are **hard prerequisites** for all Spec 005 feature work.
> Task 0 (security fix) must merge before any feature PR. The Prisma migration
> (S5-001) must be applied before any feature that touches the new tables or
> the `version` column. The admin app scaffold (S5-C00 block) is needed before
> any frontend task. Loki + Grafana infra (S5-002) is only a hard prerequisite
> for 005-10 (system logs) but should be set up early for log visibility.

---

### [S5-000] Security fix — requireSuperAdmin master realm enforcement
- **Feature**: Infrastructure (C-6 fix)
- **Type**: backend
- **Files**:
  - `services/core-api/src/middleware/require-super-admin.ts` (modify)
  - `services/core-api/src/modules/tenant/tenant-routes.ts` (modify — remove inline `requireSuperAdmin`, use shared middleware)
- **Depends on**: none
- **Acceptance**:
  - `requireSuperAdmin` middleware enforces `user.realm === config.KEYCLOAK_MASTER_REALM` AND `user.roles.includes('super_admin')`
  - Inline `requireSuperAdmin` function removed from `tenant-routes.ts`; both `POST /api/admin/tenants` and `POST /api/admin/tenants/migrate-all` use the shared `preHandler: [requireSuperAdmin]`
  - A tenant admin who creates a `super_admin` role in their own realm receives 401 (not 200)
  - Existing integration tests for super-admin routes still pass after the path move
- **Estimate**: S (1h)

---

### [S5-001] Prisma migration — new tables + version column + enum + review queue + backfill
- **Feature**: Infrastructure (ADR-022 Decisions 1, 2, 4, 5)
- **Type**: backend
- **Files**:
  - `services/core-api/prisma/schema.prisma` (modify — add `TenantDeletionStep`, `PlatformAuditLog` models; `version` column + `pending_deletion` enum value on `Tenant`; `deletionSteps` relation; review queue columns + `deprecated` status on `Plugin`)
  - `services/core-api/prisma/migrations/<timestamp>_super_admin_data_model/migration.sql` (create)
- **Depends on**: S5-000
- **Acceptance**:
  - Migration creates `core.tenant_deletion_steps` with columns + CHECK constraints + UNIQUE(tenant_id, step) + index on (status, updated_at) per ADR-022 Decision 1 SQL DDL
  - Migration creates `core.platform_audit_log` with columns + 3 indexes (actor_id, action, tenant_id) per ADR-022 Decision 2 SQL DDL
  - Migration adds `version INTEGER NOT NULL DEFAULT 1` to `core.tenants` per ADR-022 Decision 4
  - Migration adds `pending_deletion` to the `TenantStatus` native enum (ALTER TYPE)
  - Migration adds `review_status`, `review_notes`, `reviewed_at`, `reviewed_by` columns to `core.plugins` with CHECK constraint (`none`, `pending`, `approved`, `rejected`) per ADR-022 Decision 5
  - Migration updates `core.plugins.status` CHECK constraint to allow `deprecated` alongside `draft`, `published`, `unpublished`
  - **Backfill (N-2 fix)**: `UPDATE core.plugins SET review_status = 'approved' WHERE status = 'published' AND review_status = 'none';`
  - `pnpm --filter core-api prisma migrate dev` succeeds; `pnpm --filter core-api prisma generate` produces correct types
  - Prisma models match the schema additions in plan §5.3
- **Estimate**: M (2-4h)

---

### [S5-002] Loki + Grafana infrastructure in docker-compose
- **Feature**: Infrastructure (ADR-022 Decision 3)
- **Type**: infra
- **Files**:
  - `docker-compose.yml` (modify — add `loki` + `grafana` services per plan §5.1)
  - `infra/loki/local-config.yaml` (create — Loki single-node config, filesystem storage)
  - `infra/grafana/provisioning/datasources/loki.yml` (create — Loki datasource)
  - `infra/grafana/provisioning/datasources/prometheus.yml` (create — Prometheus datasource)
  - `infra/grafana/dashboards/` (create directory — dashboards optional this sprint)
- **Depends on**: none
- **Acceptance**:
  - `docker compose up loki grafana` starts both services; Loki healthcheck (`/ready`) passes; Grafana healthcheck (`/api/health`) passes
  - Grafana mapped to host port 3001 (no conflict with web app on 3000 or admin app on 3002)
  - Loki datasource auto-provisioned in Grafana (visible at `/datasources`)
  - Both services have memory limits (256M) and healthchecks per plan §5.1
  - Images pinned to digests (not `latest`)
- **Estimate**: M (2-4h)

---

### [S5-003] pino-loki transport + config env vars
- **Feature**: Infrastructure (ADR-022 Decision 3)
- **Type**: backend
- **Files**:
  - `services/core-api/src/lib/logger.ts` (modify — add `pino-loki` transport target when `LOKI_URL` is set)
  - `services/core-api/src/lib/config.ts` (modify — add `LOKI_URL`, `GRAFANA_URL` to Zod schema with empty-string defaults)
  - `services/core-api/package.json` (modify — add `pino-loki` dependency)
  - `.env.example` (modify — add `LOKI_URL`, `GRAFANA_URL`)
- **Depends on**: S5-002
- **Acceptance**:
  - When `LOKI_URL` is set, logger ships logs to Loki via `pino-loki` transport alongside stdout target
  - When `LOKI_URL` is empty, only the stdout target is active (no Loki transport) — CI environments without Loki still work
  - No code path differs between dev and prod (transport selection is config-driven, not environment-conditional logic)
  - PII redaction config preserved (existing `redact.paths`)
  - If Loki is unreachable, `pino-loki` buffers/drops — logging never blocks request handling
  - `config.ts` Zod schema validates `LOKI_URL` and `GRAFANA_URL` as strings with safe defaults
- **Estimate**: M (2-4h)

---

### [S5-004] Admin module scaffold + registration in index.ts
- **Feature**: Infrastructure (plan D-1)
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/index.ts` (create — Fastify plugin registering all route groups)
  - `services/core-api/src/index.ts` (modify — register `adminRoutes` in existing admin scope alongside `pluginAdminRoutes`)
- **Depends on**: S5-001
- **Acceptance**:
  - `admin/index.ts` exports a Fastify plugin that registers all admin route groups (initially empty/stub route files can be registered incrementally)
  - Admin scope in `index.ts` has `authMiddleware` + `rateLimitMiddleware(30, 60000)` preHandlers (existing) + `adminRoutes` registered
  - No route duplication: old `POST /api/admin/tenants` removed from `tenant-routes.ts`; new `tenant-provision.routes.ts` owns `POST /api/v1/admin/tenants`
  - `POST /api/admin/tenants/migrate-all` stays in `tenant-routes.ts` at its current path (infra tool, not Spec 005)
  - `__tests__/rate-limit.test.ts` updated to new `/api/v1/admin/tenants` path
  - Server starts without route registration errors
- **Estimate**: M (2-4h)

---

### [S5-005] tenant-context middleware — reject pending_deletion status
- **Feature**: Infrastructure (ADR-022 Decision 1, N-1 fix)
- **Type**: backend
- **Files**:
  - `services/core-api/src/middleware/tenant-context.ts` (modify — reject `pending_deletion` tenant status same as `suspended`, return 403 `TENANT_PENDING_DELETION`)
- **Depends on**: S5-001
- **Acceptance**:
  - Non-admin requests to a `pending_deletion` tenant return 403 with `TENANT_PENDING_DELETION` error code (same treatment as `suspended`)
  - Admin routes (bypassing tenant-context) are unaffected
  - Existing suspended-tenant test case pattern replicated for `pending_deletion`
- **Estimate**: S (1h)

---

### [S5-006] Optimistic lock helper
- **Feature**: Infrastructure (ADR-022 Decision 4)
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/lib/optimistic-lock.ts` (create — `UPDATE ... WHERE version = $expected`, returns 409 on 0 rows affected)
  - `services/core-api/src/__tests__/admin/optimistic-lock.test.ts` (create — unit test)
- **Depends on**: S5-001
- **Acceptance**:
  - `withOptimisticLock(prisma, tenantId, expectedVersion, mutation)` helper executes update with `WHERE id = $id AND version = $expected`
  - On 0 rows affected, throws a `ConflictError` (mapped to 409 `CONFLICT`)
  - On success, increments `version` and returns the updated row
  - Unit test covers: version match → success + increment; version mismatch → 409
- **Estimate**: S (1h)

---

### [S5-C00] Admin app scaffold — package.json, Vite, TS, Tailwind, HTML
- **Feature**: Infrastructure (plan §4.1)
- **Type**: frontend
- **Files**:
  - `apps/admin/package.json` (create — dependencies: React, TanStack Router/Query, Zustand, @plexica/ui, @plexica/i18n, react-hook-form, zod, react-intl, lucide-react, radix-ui)
  - `apps/admin/vite.config.ts` (create — Vite config, no Module Federation, dev server port 3002)
  - `apps/admin/tsconfig.json` (create)
  - `apps/admin/tailwind.config.ts` (create)
  - `apps/admin/postcss.config.js` (create)
  - `apps/admin/index.html` (create)
  - `pnpm-workspace.yaml` (modify — add `apps/admin`)
- **Depends on**: none
- **Acceptance**:
  - `pnpm install` succeeds with `apps/admin` in workspace
  - `pnpm --filter @plexica/admin build` produces a production bundle
  - `pnpm --filter @plexica/admin dev` starts dev server on port 3002
  - Tailwind config imports `@plexica/ui` tokens
  - TypeScript strict mode enabled
- **Estimate**: M (2-4h)

---

### [S5-C01] Admin app core — entry, router, shell, auth store, API client
- **Feature**: Infrastructure (plan §4.2 — patterns replicated from `apps/web/`)
- **Type**: frontend
- **Files**:
  - `apps/admin/src/main.tsx` (create — QueryClientProvider + IntlProvider + RouterProvider)
  - `apps/admin/src/router.tsx` (create — TanStack Router object-based setup)
  - `apps/admin/src/router-shell.tsx` (create — root route + shell route + auth guard, no tenant resolution)
  - `apps/admin/src/router-shell-routes.tsx` (create — all authenticated child routes, initially placeholder)
  - `apps/admin/src/app.tsx` (create — app shell re-export)
  - `apps/admin/src/styles/globals.css` (create — Tailwind globals importing @plexica/ui tokens)
  - `apps/admin/src/stores/auth-store.ts` (create — Zustand auth store, master realm, password grant, sessionStorage persist)
  - `apps/admin/src/services/api-client.ts` (create — fetch wrapper, master realm token, no X-Tenant-Slug header, 401 refresh)
  - `apps/admin/src/services/keycloak-auth.ts` (create — Keycloak master realm direct password grant, `plexica-admin` client)
  - `apps/admin/src/services/admin-api.ts` (create — admin API methods: dashboard, tenants, plugins, health, logs, kafka — stubs filled per feature)
  - `apps/admin/src/types/admin-types.ts` (create — TypeScript types for admin API responses)
- **Depends on**: S5-C00
- **Acceptance**:
  - Router shell renders a placeholder dashboard route without errors
  - Auth store persists tokens to sessionStorage (same pattern as web app)
  - API client attaches bearer token to requests; no `X-Tenant-Slug` header
  - `keycloak-auth.ts` performs password grant against master realm `plexica-admin` client
  - All files under 200 lines (Rule 4)
- **Estimate**: L (4-8h)

---

### [S5-C02] Admin app layout — shell, sidebar, auth guard, login page
- **Feature**: Infrastructure (plan §4.1)
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/layout/admin-shell.tsx` (create — sidebar nav + content area)
  - `apps/admin/src/components/layout/sidebar.tsx` (create — nav links: dashboard, tenants, plugins, health, logs, kafka — Lucide icons)
  - `apps/admin/src/components/auth/auth-guard.tsx` (create — redirect to login if not authenticated)
  - `apps/admin/src/components/auth/login-page.tsx` (create — master realm login form, react-hook-form + Zod)
  - `apps/admin/src/i18n/messages.en.ts` (create — main i18n entry)
- **Depends on**: S5-C01
- **Acceptance**:
  - Unauthenticated user visiting `/dashboard` is redirected to `/login`
  - Login form validates email + password via Zod, submits to `keycloak-auth.ts`
  - Sidebar shows 6 nav sections with Lucide icons (no emoji)
  - All strings pass through react-intl (no hardcoded UI strings)
  - All files under 200 lines (Rule 4)
- **Estimate**: M (2-4h)

---

### [S5-C03] Admin app Playwright config + E2E helpers
- **Feature**: Infrastructure (plan §4.1, §8.1)
- **Type**: test
- **Files**:
  - `apps/admin/playwright.config.ts` (create — port 3002, admin app baseURL)
  - `apps/admin/e2e/global-setup.ts` (create — seed test tenant, admin token)
  - `apps/admin/e2e/helpers/admin-login.ts` (create — super admin login helper via master realm)
  - `apps/admin/e2e/helpers/api-client.ts` (create — admin API helper for test assertions)
- **Depends on**: S5-C02
- **Acceptance**:
  - `pnpm --filter @plexica/admin e2e` runs Playwright against port 3002
  - `global-setup.ts` obtains a super-admin token from the master realm
  - `admin-login.ts` helper logs in via the login page UI and returns authenticated context
  - `api-client.ts` helper wraps admin API calls for test assertions (e.g., verify schema dropped)
- **Estimate**: M (2-4h)

---

### [S5-C04] Keycloak master realm — plexica-admin client provisioning
- **Feature**: Infrastructure (plan §5.5)
- **Type**: infra
- **Files**:
  - `infra/keycloak/admin-client-realm.json` (create — Keycloak client representation for `plexica-admin`, direct access grants enabled)
- **Depends on**: none
- **Acceptance**:
  - `plexica-admin` client created in Keycloak master realm on `docker compose up` (via `keycloak-init` or new `keycloak-admin-init` service)
  - Client supports direct access grants (password flow)
  - `super_admin` role assignable to master realm users
  - Admin app `keycloak-auth.ts` can obtain a token using test super-admin credentials
- **Estimate**: S (1h)

---

## Phase 1: Feature 005-09 — System Health Check

> Implementation order 1 per plan §7. Independent of other features.
> Depends on: S5-001 (migration), S5-004 (admin module).

---

### [S5-100] Health checker service + per-service probes
- **Feature**: 005-09
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/health-checker.service.ts` (create — orchestrates probes, returns status enum per service)
  - `services/core-api/src/modules/admin/services/health-check-postgres.ts` (create — PostgreSQL probe)
  - `services/core-api/src/modules/admin/services/health-check-redis.ts` (create — Redis probe)
  - `services/core-api/src/modules/admin/services/health-check-keycloak.ts` (create — Keycloak probe)
  - `services/core-api/src/modules/admin/services/health-check-kafka.ts` (create — Kafka/Redpanda probe)
  - `services/core-api/src/modules/admin/services/health-check-minio.ts` (create — MinIO probe)
  - `services/core-api/src/modules/admin/schemas/health-schemas.ts` (create — Zod schemas for health response)
- **Depends on**: S5-004
- **Acceptance**:
  - `health-checker.service.ts` runs all 5 probes in parallel with 200ms timeout per service
  - Each probe returns `{ name, status: 'healthy'|'degraded'|'down', latencyMs }`
  - Degraded = responsive but slow (> 1s) or failing checks; Down = unreachable
  - No connection strings, credentials, or version numbers exposed (Security §6, spec §7 edge case)
  - Response time < 500ms (NFR)
  - Each file under 200 lines (Rule 4)
- **Estimate**: M (2-4h)

---

### [S5-101] Health check route
- **Feature**: 005-09
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/health.routes.ts` (create — `GET /api/v1/admin/health`)
- **Depends on**: S5-100, S5-004
- **Acceptance**:
  - `GET /api/v1/admin/health` returns `{ services: [{ name, status, latencyMs }] }`
  - `requireSuperAdmin` preHandler enforced
  - Zod response validation via `health-schemas.ts`
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-102] Health check — unit + integration tests
- **Feature**: 005-09
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/health-checker.service.test.ts` (create — unit: status enum logic, degraded/down detection)
  - `services/core-api/src/__tests__/admin/health.routes.int.test.ts` (create — integration: all services healthy; degraded/down detection with real infra)
- **Depends on**: S5-101
- **Acceptance**:
  - Unit test: status enum logic (healthy/degraded/down based on latency + response) without real infra
  - Integration test: real DB, Keycloak, Redis, Kafka, MinIO — all return `healthy` in dev environment
  - Integration test: simulate degraded (slow response) and down (unreachable) — status enum correct
  - No mocks of core services (AGENTS.md testing rules)
- **Estimate**: M (2-4h)

---

### [S5-103] Health check — frontend page + hook
- **Feature**: 005-09
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/health/health-page.tsx` (create — service health grid)
  - `apps/admin/src/components/health/service-status-card.tsx` (create — per-service card: green/yellow/red)
  - `apps/admin/src/hooks/use-health.ts` (create — TanStack Query with polling, 10s interval)
  - `apps/admin/src/i18n/messages.en.system.ts` (create — health messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/health` route)
- **Depends on**: S5-C02, S5-101
- **Acceptance**:
  - Health page shows all 5 services as cards with status color (green/yellow/red)
  - TanStack Query polls `/admin/health` every 10s
  - Data fetched only via TanStack Query (Rule 3) — no `fetch` raw, no `useEffect+useState`
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-104] Health check — E2E test
- **Feature**: 005-09
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-09-health-check.spec.ts` (create)
- **Depends on**: S5-103, S5-C03
- **Acceptance**:
  - Super admin logs in, navigates to `/health`, sees all 5 services (DB, Keycloak, Redis, Kafka, MinIO) with status enum
  - All services show `healthy` in the dev environment
  - Status cards render with correct color coding
  - Test runs against real infrastructure (no mocks)
- **Estimate**: M (2-4h)

---

## Phase 2: Feature 005-02 — Tenant List

> Implementation order 2 per plan §7. Foundational for 005-03, 005-04, 005-05, 005-06, 005-07.
> Depends on: S5-004 (admin module).

---

### [S5-200] Tenant list service + schemas
- **Feature**: 005-02
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/tenant-list.service.ts` (create — search by name/slug, filter by status, pagination)
  - `services/core-api/src/modules/admin/schemas/tenant-schemas.ts` (create — Zod schemas for tenant list query params + response)
- **Depends on**: S5-004
- **Acceptance**:
  - `listTenants({ search?, status?, page, pageSize })` returns `{ data: Tenant[], total, page, pageSize }`
  - Search matches name OR slug (case-insensitive, parameterized)
  - Status filter accepts `active`, `suspended`, `pending_deletion`, `deleted`
  - Pagination with `page` and `pageSize` (default 20)
  - Uses `withCoreDb` (core schema, no tenant context)
  - Response time < 1s with 100+ tenants (NFR)
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-201] Tenant list route
- **Feature**: 005-02
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-list.routes.ts` (create — `GET /api/v1/admin/tenants`)
- **Depends on**: S5-200
- **Acceptance**:
  - `GET /api/v1/admin/tenants?search=&status=&page=&pageSize=` returns paginated tenant list
  - `requireSuperAdmin` preHandler enforced
  - Zod query param validation
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-202] Tenant list — integration test
- **Feature**: 005-02
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-list.routes.int.test.ts` (create — search, filter, pagination with real tenant data)
- **Depends on**: S5-201
- **Acceptance**:
  - Integration test with real DB: seed 5+ tenants, verify search by name, filter by status, pagination
  - Empty search returns all tenants paginated
  - Invalid status filter → 400 `VALIDATION_ERROR`
  - No mocks of core services
- **Estimate**: M (2-4h)

---

### [S5-203] Tenant list — frontend page + hook
- **Feature**: 005-02
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/tenant-list-page.tsx` (create — searchable, filterable tenant table)
  - `apps/admin/src/hooks/use-tenants.ts` (create — TanStack Query for tenant list)
  - `apps/admin/src/i18n/messages.en.tenants.ts` (create — tenant management messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/tenants` route)
- **Depends on**: S5-C02, S5-201
- **Acceptance**:
  - Tenant list page shows table with columns: name, slug, status, created date
  - Search input filters by name/slug (debounced)
  - Status filter dropdown
  - Pagination controls
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-204] Tenant list — E2E test
- **Feature**: 005-02
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-02-tenant-list.spec.ts` (create)
- **Depends on**: S5-203, S5-C03
- **Acceptance**:
  - Super admin logs in, navigates to `/tenants`, searches tenant by name, filters by status, pagination works
  - Test runs against real DB with seeded tenants
- **Estimate**: M (2-4h)

---

## Phase 3: Feature 005-03 — Tenant Detail

> Implementation order 3 per plan §7. Depends on 005-02 (tenant list links to detail).
> Needs cross-schema aggregates + platform audit log.

---

### [S5-300] Tenant detail service + cross-schema aggregates
- **Feature**: 005-03
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/tenant-detail.service.ts` (create — aggregates tenant info + cross-schema user/workspace/plugin counts)
- **Depends on**: S5-200, S5-001
- **Acceptance**:
  - `getTenantDetail(id)` returns `{ tenant, userCount, workspaceCount, pluginInstallations: [], recentAudit: [] }`
  - Cross-schema user count: `prisma.$queryRaw` with parameterized schema name (validated slug → `toSchemaName`)
  - Cross-schema workspace count: same parameterized approach
  - Plugin installations: reads from `tenant_<slug>.plugin_installations`
  - Recent audit: reads from `tenant_<slug>.audit_logs` (per-tenant) + `core.platform_audit_log` (platform-level, filtered by tenant_id)
  - No SQL injection — schema names validated, parameterized queries only (Security §3)
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-301] Audit log service + schemas
- **Feature**: 005-03 (cross-ref: platform audit log for all admin actions)
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/audit-log.service.ts` (create — writes + reads platform audit log entries)
  - `services/core-api/src/modules/admin/schemas/audit-schemas.ts` (create — Zod schemas for audit log query + entry)
- **Depends on**: S5-001
- **Acceptance**:
  - `writeAuditEntry({ actorId, action, resourceType, resourceId?, tenantId?, metadata, ipAddress })` inserts into `core.platform_audit_log`
  - `queryAuditLog({ action?, tenantId?, actorId?, page, pageSize })` returns paginated entries
  - `metadata` JSONB carries structural data (slug, step, counts) — NO PII (Security §6)
  - `actor_id` is Keycloak master realm sub (VARCHAR 255)
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-302] Tenant detail + audit log routes
- **Feature**: 005-03
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-detail.routes.ts` (create — `GET /api/v1/admin/tenants/:id`)
  - `services/core-api/src/modules/admin/routes/audit-log.routes.ts` (create — `GET /api/v1/admin/audit-logs`)
- **Depends on**: S5-300, S5-301
- **Acceptance**:
  - `GET /api/v1/admin/tenants/:id` returns tenant detail with cross-schema aggregates
  - `GET /api/v1/admin/audit-logs?action=&tenantId=&actorId=&page=&pageSize=` returns paginated platform audit log
  - `requireSuperAdmin` preHandler on both routes
  - Zod param + query validation
  - Route files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-303] Tenant detail — integration tests
- **Feature**: 005-03
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-detail.routes.int.test.ts` (create — cross-schema aggregate counts, audit log)
  - `services/core-api/src/__tests__/admin/audit-log.routes.int.test.ts` (create — audit log query with filters)
  - `services/core-api/src/__tests__/admin/audit-log.service.test.ts` (create — unit: audit entry creation, metadata structure, no PII)
- **Depends on**: S5-302
- **Acceptance**:
  - Integration: real DB with seeded tenant — user count, workspace count, plugin installations correct
  - Integration: audit log query filters by action, tenantId, actorId
  - Unit: audit entry creation with correct metadata structure; assert no PII in metadata
  - No mocks of core services
- **Estimate**: M (2-4h)

---

### [S5-304] Tenant detail — frontend page + tabs + hooks
- **Feature**: 005-03
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/tenant-detail-page.tsx` (create — tabs: info, users, plugins, audit)
  - `apps/admin/src/components/tenants/tenant-detail-info.ts` (create — info tab: tenant metadata, status, version)
  - `apps/admin/src/components/tenants/tenant-detail-plugins.ts` (create — plugins tab: installed plugins)
  - `apps/admin/src/components/tenants/tenant-detail-audit.ts` (create — audit tab: recent platform + tenant audit entries)
  - `apps/admin/src/hooks/use-tenants.ts` (modify — add `useTenantDetail` query)
  - `apps/admin/src/hooks/use-audit-log.ts` (create — TanStack Query for audit log)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/tenants/$tenantId` route)
- **Depends on**: S5-203, S5-302
- **Acceptance**:
  - Tenant detail page shows 4 tabs; navigating from tenant list opens detail
  - Info tab shows tenant name, slug, status, version (for optimistic lock display)
  - Users tab shows user count (from cross-schema aggregate)
  - Plugins tab lists installed plugins
  - Audit tab shows recent platform audit entries for this tenant
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: L (4-8h)

---

### [S5-305] Tenant detail — E2E test
- **Feature**: 005-03
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-03-tenant-detail.spec.ts` (create)
- **Depends on**: S5-304, S5-C03
- **Acceptance**:
  - Super admin navigates from tenant list to tenant detail, sees all 4 tabs (info, users, plugins, audit)
  - Cross-schema counts render correctly
  - Audit log entries visible
- **Estimate**: M (2-4h)

---

## Phase 4: Feature 005-04 — Tenant Provisioning Wizard

> Implementation order 4 per plan §7. Builds on existing `tenant-provisioning.ts`.
> Adds conflict detection + audit log. Must come before suspend/reactivate/delete.

---

### [S5-400] Tenant provision service — conflict detection + audit
- **Feature**: 005-04
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/tenant-provision.service.ts` (create — extends existing provisioning with conflict detection + audit log)
- **Depends on**: S5-200, S5-301, S5-001
- **Acceptance**:
  - `provisionTenant({ slug, name, adminEmail })` creates schema + realm + bucket + seed (existing logic)
  - **Conflict detection**: before provisioning, checks if `tenant_<slug>` schema exists, `plexica-<slug>` realm exists, `tenant-<slug>` bucket exists — returns 409 with `conflictType` (`schema_exists`, `realm_exists`, `bucket_exists`)
  - Writes platform audit log entry (`tenant.provision`) with metadata (slug, name, adminEmail — no PII beyond what's necessary)
  - Returns `201: { tenantId, slug, schemaName, realmName, minioBucket, tempPassword }`
  - Provisioning < 30s (NFR)
  - File under 200 lines
- **Estimate**: L (4-8h)

---

### [S5-401] Tenant provision route
- **Feature**: 005-04
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-provision.routes.ts` (create — `POST /api/v1/admin/tenants`)
- **Depends on**: S5-400, S5-004
- **Acceptance**:
  - `POST /api/v1/admin/tenants` with body `{ slug, name, adminEmail }` → 201 on success
  - 409 `CONFLICT` with `conflictType` when schema/realm/bucket already exists
  - 400 `VALIDATION_ERROR` on invalid input (Zod)
  - `requireSuperAdmin` preHandler enforced
  - Old `POST /api/admin/tenants` in `tenant-routes.ts` removed (route ownership move per plan §3.4)
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-402] Tenant provisioning — integration tests (incl. edge cases)
- **Feature**: 005-04
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-provision.routes.int.test.ts` (create — full provisioning with real Keycloak + MinIO; conflict detection edge cases)
- **Depends on**: S5-401
- **Acceptance**:
  - Happy path: provision tenant, verify schema exists, realm exists, bucket exists, tenant record in `core.tenants`
  - Edge: pre-create `tenant_<slug>` schema → 409 `{ conflictType: "schema_exists" }`
  - Edge: pre-create `plexica-<slug>` realm → 409 `{ conflictType: "realm_exists" }`
  - Edge: pre-create `tenant-<slug>` bucket → 409 `{ conflictType: "bucket_exists" }`
  - Audit log entry written on success
  - No mocks of Keycloak/MinIO/PostgreSQL
- **Estimate**: L (4-8h)

---

### [S5-403] Tenant provisioning — frontend wizard + hook
- **Feature**: 005-04
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/provision-wizard-page.tsx` (create — multi-step wizard)
  - `apps/admin/src/components/tenants/provision-wizard-step-1.ts` (create — slug + name + admin email form, react-hook-form + Zod)
  - `apps/admin/src/components/tenants/provision-wizard-step-2.ts` (create — review + confirm)
  - `apps/admin/src/components/tenants/provision-wizard-step-3.ts` (create — progress + result)
  - `apps/admin/src/hooks/use-tenants.ts` (modify — add `useProvisionTenant` mutation)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/tenants/provision` route)
- **Depends on**: S5-C02, S5-401
- **Acceptance**:
  - 3-step wizard: form → review → progress/result
  - Step 1 validates slug (kebab-case), name, admin email via Zod
  - Step 2 shows summary for confirmation
  - Step 3 shows provisioning progress (loading) then result (success with temp password / error with conflict type)
  - Form handling via react-hook-form + Zod only (Rule 3)
  - Mutation via TanStack Query
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: L (4-8h)

---

### [S5-404] Tenant provisioning — E2E test
- **Feature**: 005-04
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-04-provisioning.spec.ts` (create)
- **Depends on**: S5-403, S5-C03
- **Acceptance**:
  - Super admin completes provisioning wizard, tenant is operational
  - Verify: login as tenant admin (temp password works), schema exists, realm exists, bucket exists
  - Cleanup in `afterAll` via deletion API or direct cleanup
  - Test runs against real Keycloak, MinIO, PostgreSQL
- **Estimate**: L (4-8h)

---

## Phase 5: Feature 005-05 — Tenant Suspension

> Implementation order 5 per plan §7. Depends on 005-04 (need a provisioned tenant).
> Needs optimistic lock (version column).

---

### [S5-500] Tenant suspend service — optimistic lock + Keycloak + Redis
- **Feature**: 005-05
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/tenant-suspend.service.ts` (create — suspend saga: update status, disable Keycloak realm, invalidate Redis cache)
- **Depends on**: S5-006, S5-301, S5-001
- **Acceptance**:
  - `suspendTenant(id, expectedVersion)` uses optimistic lock: `UPDATE ... WHERE version = $expected`, increments version
  - On 0 rows affected → 409 `CONFLICT`
  - On success: sets `status = 'suspended'`, disables Keycloak realm, invalidates Redis tenant-status cache
  - Writes platform audit log entry (`tenant.suspend`)
  - Suspension propagation < 5s (NFR) — Redis cache invalidation + Keycloak realm disable
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-501] Tenant suspend route
- **Feature**: 005-05
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-suspend.routes.ts` (create — `POST /api/v1/admin/tenants/:id/suspend`)
- **Depends on**: S5-500
- **Acceptance**:
  - `POST /api/v1/admin/tenants/:id/suspend` with body `{ version }` → 200 `{ id, status: "suspended", version }`
  - 409 `CONFLICT` on version mismatch
  - 404 `NOT_FOUND` if tenant doesn't exist
  - `requireSuperAdmin` preHandler enforced
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-502] Tenant suspension — integration tests (incl. concurrency edge case)
- **Feature**: 005-05
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-suspend.routes.int.test.ts` (create — optimistic lock, 409 on version mismatch, Keycloak realm disabled, Redis cache invalidated)
- **Depends on**: S5-501
- **Acceptance**:
  - Happy path: suspend active tenant → status `suspended`, Keycloak realm disabled, Redis cache invalidated
  - Edge: concurrent suspend + reactivate with same `version` → one 200, one 409 `CONFLICT`
  - Edge: version mismatch → 409
  - Audit log entry written
  - No mocks of Keycloak/Redis
- **Estimate**: M (2-4h)

---

### [S5-503] Tenant suspension — frontend dialog + hook
- **Feature**: 005-05
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/suspend-dialog.tsx` (create — suspend confirmation dialog using Dialog component, not `window.confirm`)
  - `apps/admin/src/hooks/use-tenant-lifecycle.ts` (create — TanStack Query mutations: suspend, reactivate, delete)
  - `apps/admin/src/components/tenants/tenant-detail-page.tsx` (modify — add suspend action button)
- **Depends on**: S5-304, S5-501
- **Acceptance**:
  - Suspend dialog shows tenant name + version, confirms action
  - Uses Dialog component from design system (no `window.confirm()` — AGENTS.md)
  - On 409, shows "tenant was modified by another admin" message with retry
  - Mutation via TanStack Query; invalidates tenant detail + list queries on success
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-504] Tenant suspension — E2E test
- **Feature**: 005-05
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-05-suspend.spec.ts` (create)
- **Depends on**: S5-503, S5-C03
- **Acceptance**:
  - Super admin suspends tenant, verify users cannot access (login attempt fails)
  - Verify atomic propagation: API rejects requests for suspended tenant immediately
  - Test runs against real Keycloak, Redis, PostgreSQL
- **Estimate**: M (2-4h)

---

## Phase 6: Feature 005-06 — Tenant Reactivation

> Implementation order 6 per plan §7. Depends on 005-05 (need a suspended tenant).
> Same optimistic lock pattern.

---

### [S5-600] Tenant reactivate service
- **Feature**: 005-06
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/tenant-reactivate.service.ts` (create — reverse of suspend: enable Keycloak realm, update status, invalidate cache)
- **Depends on**: S5-006, S5-301, S5-001
- **Acceptance**:
  - `reactivateTenant(id, expectedVersion)` uses optimistic lock
  - On success: sets `status = 'active'`, enables Keycloak realm, invalidates Redis cache
  - Writes platform audit log entry (`tenant.reactivate`)
  - Only suspended tenants can be reactivated (active/pending_deletion/deleted → 409 or 400)
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-601] Tenant reactivate route
- **Feature**: 005-06
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-reactivate.routes.ts` (create — `POST /api/v1/admin/tenants/:id/reactivate`)
- **Depends on**: S5-600
- **Acceptance**:
  - `POST /api/v1/admin/tenants/:id/reactivate` with body `{ version }` → 200 `{ id, status: "active", version }`
  - 409 `CONFLICT` on version mismatch
  - 404 `NOT_FOUND` if tenant doesn't exist
  - `requireSuperAdmin` preHandler enforced
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-602] Tenant reactivation — integration tests
- **Feature**: 005-06
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-reactivate.routes.int.test.ts` (create — reverse of suspend, optimistic lock)
- **Depends on**: S5-601
- **Acceptance**:
  - Happy path: reactivate suspended tenant → status `active`, Keycloak realm enabled, Redis cache invalidated
  - Edge: version mismatch → 409
  - Edge: reactivating an already-active tenant → 400/409
  - Audit log entry written
  - No mocks of Keycloak/Redis
- **Estimate**: M (2-4h)

---

### [S5-603] Tenant reactivation — frontend dialog + hook
- **Feature**: 005-06
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/reactivate-dialog.tsx` (create — reactivate confirmation dialog)
  - `apps/admin/src/hooks/use-tenant-lifecycle.ts` (modify — add `useReactivateTenant` mutation)
  - `apps/admin/src/components/tenants/tenant-detail-page.tsx` (modify — add reactivate action button for suspended tenants)
- **Depends on**: S5-503, S5-601
- **Acceptance**:
  - Reactivate dialog shows tenant name + version, confirms action
  - Uses Dialog component (no `window.confirm()`)
  - On 409, shows conflict message with retry
  - Mutation via TanStack Query; invalidates tenant detail + list on success
  - Files under 200 lines
- **Estimate**: S (1h)

---

### [S5-604] Tenant reactivation — E2E test
- **Feature**: 005-06
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-06-reactivate.spec.ts` (create)
- **Depends on**: S5-603, S5-C03
- **Acceptance**:
  - Super admin reactivates suspended tenant, verify users can access again (login succeeds)
  - Test runs against real Keycloak, Redis, PostgreSQL
- **Estimate**: M (2-4h)

---

## Phase 7: Feature 005-07 — Tenant Deletion (GDPR Saga)

> Implementation order 7 per plan §7. Most complex feature.
> Depends on 005-04 (need a tenant to delete). Needs `tenant_deletion_steps` table.

---

### [S5-700] Deletion saga orchestrator + step handlers
- **Feature**: 005-07
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/deletion-saga.service.ts` (create — orchestrates forward-only saga: schema_drop → realm_delete → bucket_delete)
  - `services/core-api/src/modules/admin/services/deletion-step-schema-drop.ts` (create — DROP SCHEMA handler)
  - `services/core-api/src/modules/admin/services/deletion-step-realm-delete.ts` (create — delete Keycloak realm handler)
  - `services/core-api/src/modules/admin/services/deletion-step-bucket-delete.ts` (create — delete MinIO bucket handler, force-delete objects if non-empty for GDPR)
  - `services/core-api/src/modules/admin/services/deletion-retry.service.ts` (create — retry single failed step)
- **Depends on**: S5-001, S5-301
- **Acceptance**:
  - Saga is forward-only — no auto-rollback (ADR-022 Decision 1)
  - Each step: set `in_progress`, attempt, set `done` or `failed` (with `last_error`)
  - Retry with backoff (max 3 attempts); after 3 failures, step stays `failed` for manual retry
  - Completion: all 3 steps `done` → set tenant `status = 'deleted'`, write audit log
  - Background executor launched via `setImmediate` after 202 response (async, not blocking request)
  - Startup sweep: detect `in_progress` steps older than timeout, reset to `pending`
  - Bucket delete: force-delete objects then bucket (GDPR requires full erasure)
  - Each file under 200 lines (Rule 4)
- **Estimate**: L (4-8h)

---

### [S5-701] Deletion saga — unit test
- **Feature**: 005-07
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/deletion-saga.service.test.ts` (create — saga orchestration logic)
- **Depends on**: S5-700
- **Acceptance**:
  - Step ordering: schema_drop → realm_delete → bucket_delete (sequential)
  - Status transitions: pending → in_progress → done/failed
  - Never marks tenant `deleted` until all 3 steps `done`
  - Retry logic: failed step resets attempts, retries with backoff
  - Unit test (pure logic, no real infra) — tests the orchestrator state machine
- **Estimate**: M (2-4h)

---

### [S5-702] Tenant delete + deletion-status routes
- **Feature**: 005-07
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/tenant-delete.routes.ts` (create — `DELETE /api/v1/admin/tenants/:id`)
  - `services/core-api/src/modules/admin/routes/deletion-status.routes.ts` (create — `GET /api/v1/admin/tenants/:id/deletion-status` + `POST /api/v1/admin/deletions/:stepId/retry`)
- **Depends on**: S5-700
- **Acceptance**:
  - `DELETE /api/v1/admin/tenants/:id` with body `{ confirmSlug }` → 202 `{ deletionId, steps: [{ step, status }] }`
  - Type-to-confirm: `confirmSlug` must match tenant slug exactly, else 422 `CONFIRMATION_REQUIRED`
  - Sets tenant `status = 'pending_deletion'`, creates 3 saga rows, writes audit log, returns 202 (does not wait for steps)
  - `GET /api/v1/admin/tenants/:id/deletion-status` → `{ steps: [{ id, step, status, attempts, lastError, updatedAt }] }`
  - `POST /api/v1/admin/deletions/:stepId/retry` → resets failed step to `pending`, resets attempts, triggers executor → 200 `{ step, status, attempts }`
  - `requireSuperAdmin` preHandler on all routes
  - Route files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-703] Tenant deletion — integration tests (incl. retry edge case)
- **Feature**: 005-07
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/tenant-delete.routes.int.test.ts` (create — deletion saga: all 3 steps complete, tenant marked deleted; confirmation slug required)
  - `services/core-api/src/__tests__/admin/deletion-status.routes.int.test.ts` (create — stuck deletion, retry single step)
- **Depends on**: S5-702
- **Acceptance**:
  - Happy path: delete tenant with correct `confirmSlug` → 202, all 3 steps complete, tenant `status = 'deleted'`, schema dropped, realm deleted, bucket deleted
  - Edge: missing/incorrect `confirmSlug` → 422 `CONFIRMATION_REQUIRED`
  - Edge: stuck deletion (step `failed`) — `GET deletion-status` shows failed step, `POST retry` resets and retries
  - Audit log entries written for deletion start + completion
  - No mocks of Keycloak/MinIO/PostgreSQL
- **Estimate**: L (4-8h)

---

### [S5-704] Tenant deletion — frontend dialog + status panel + hook
- **Feature**: 005-07
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/tenants/delete-dialog.tsx` (create — type-to-confirm delete dialog)
  - `apps/admin/src/components/tenants/deletion-status-panel.tsx` (create — deletion saga step status view with retry button)
  - `apps/admin/src/hooks/use-deletion-status.ts` (create — TanStack Query for deletion status + retry mutation)
  - `apps/admin/src/hooks/use-tenant-lifecycle.ts` (modify — add `useDeleteTenant` mutation)
  - `apps/admin/src/components/tenants/tenant-detail-page.tsx` (modify — add delete action + deletion status panel for pending_deletion tenants)
- **Depends on**: S5-503, S5-702
- **Acceptance**:
  - Delete dialog requires typing the tenant slug exactly to confirm (type-to-confirm pattern)
  - Uses Dialog component (no `window.confirm()`)
  - Deletion status panel shows 3 steps with status (pending/in_progress/done/failed), attempts, last error
  - Retry button on failed steps calls `POST /deletions/:stepId/retry`
  - Mutations via TanStack Query; invalidates tenant detail + list on success
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-705] Tenant deletion — E2E test
- **Feature**: 005-07
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-07-deletion.spec.ts` (create)
- **Depends on**: S5-704, S5-C03
- **Acceptance**:
  - Super admin deletes tenant with type-to-confirm: schema dropped, realm deleted, bucket deleted — all three resources gone (verified via API helper)
  - Dedicated test tenant (`e2e-delete-test`) provisioned in `beforeAll`, deleted in test — no cleanup needed (test IS the deletion)
  - Test runs against real Keycloak, MinIO, PostgreSQL
  - Verifies GDPR compliance: no data remnants
- **Estimate**: L (4-8h)

---

## Phase 8: Feature 005-08 — Plugin Catalog Management

> Implementation order 8 per plan §7. Independent of tenant lifecycle.
> Extends existing plugin admin routes. Needs audit log.

---

### [S5-800] Plugin review endpoint + schema
- **Feature**: 005-08
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/plugin-catalog.routes.ts` (create — `POST /api/v1/admin/plugins/:slug/review` — only this endpoint in new file)
  - `services/core-api/src/modules/admin/schemas/plugin-catalog-schemas.ts` (create — Zod schemas for review decision)
- **Depends on**: S5-301, S5-001
- **Acceptance**:
  - `POST /api/v1/admin/plugins/:slug/review` with body `{ decision: "approve"|"reject", notes? }` → 200 `{ id, slug, reviewStatus, reviewedAt, reviewedBy }`
  - Sets `review_status` to `approved` or `rejected`, `reviewed_at`, `reviewed_by` (master realm sub)
  - Writes platform audit log entry (`plugin.review`)
  - `requireSuperAdmin` preHandler enforced
  - Only this endpoint in the new file — `publish`/`unpublish` stay in existing `admin-publish.routes.ts`
  - Route file under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-801] Update existing publish/unpublish routes — review gate + deprecated status
- **Feature**: 005-08
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/plugin/routes/admin-publish.routes.ts` (modify — `publish` requires `reviewStatus === 'approved'`; `unpublish` sets `deprecated` if installed, `unpublished` if not)
  - `services/core-api/src/modules/plugin/routes/admin-catalog.routes.ts` (modify — extend `GET /admin/plugins` response with `installedCount` + `reviewStatus`)
- **Depends on**: S5-001
- **Acceptance**:
  - `POST /admin/plugins/:slug/publish` returns 403/400 if `reviewStatus !== 'approved'` (C-2 fix)
  - `POST /admin/plugins/:slug/unpublish` with existing installations → `status: "deprecated"`, response includes `installedCount`
  - `POST /admin/plugins/:slug/unpublish` with no installations → `status: "unpublished"`
  - `GET /admin/plugins` response includes `installedCount` and `reviewStatus` columns
  - Both write platform audit log entries (`plugin.publish`, `plugin.unpublish`)
  - No route duplication (route ownership table §3.4)
- **Estimate**: M (2-4h)

---

### [S5-802] Plugin catalog — integration tests (incl. edge cases)
- **Feature**: 005-08
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/plugin-catalog.routes.int.test.ts` (create — catalog list, publish with manifest validation, unpublish with installed count, review)
- **Depends on**: S5-800, S5-801
- **Acceptance**:
  - Happy path: approve review → publish → plugin appears in marketplace; unpublish with installs → `deprecated`; unpublish without installs → `unpublished`
  - Edge: publish plugin with broken manifest → 400 `VALIDATION_ERROR` with field-level errors; plugin stays `draft`
  - Edge: publish plugin with `reviewStatus !== 'approved'` → 403/400
  - Edge: unpublish plugin installed by tenants → `deprecated` + `installedCount > 0`, plugin gone from marketplace, existing install works
  - Edge: unpublish plugin with no installs → `unpublished`
  - Audit log entries written for publish/unpublish/review
  - No mocks of core services
- **Estimate**: L (4-8h)

---

### [S5-803] Plugin catalog — frontend page + review dialog + hook
- **Feature**: 005-08
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/plugins/plugin-catalog-page.tsx` (create — plugin catalog table + review queue)
  - `apps/admin/src/components/plugins/plugin-review-dialog.tsx` (create — approve/reject dialog with notes field)
  - `apps/admin/src/hooks/use-plugin-catalog.ts` (create — TanStack Query for catalog list + publish/unpublish/review mutations)
  - `apps/admin/src/i18n/messages.en.plugins.ts` (create — plugin catalog messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/plugins` route)
- **Depends on**: S5-C02, S5-800, S5-801
- **Acceptance**:
  - Plugin catalog page shows table with columns: slug, name, status, reviewStatus, installedCount
  - Review queue section shows plugins with `reviewStatus = 'pending'`
  - Review dialog: approve/reject with notes field (react-hook-form + Zod)
  - Publish/unpublish buttons with installed count warning for deprecate
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: L (4-8h)

---

### [S5-804] Plugin catalog — E2E test
- **Feature**: 005-08
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-08-plugin-catalog.spec.ts` (create)
- **Depends on**: S5-803, S5-C03
- **Acceptance**:
  - Super admin publishes a draft plugin (after review approval), verifies it appears in marketplace
  - Unpublishes plugin with installs → `deprecated`, verifies it disappears from marketplace but existing installs work
  - Submits review (approve/reject) via review dialog
  - Test runs against real DB, real plugin system
- **Estimate**: L (4-8h)

---

## Phase 9: Feature 005-11 — Kafka Status

> Implementation order 9 per plan §7. Depends on Spec 004's Kafka infra (existing).
> Wraps existing `lag-metrics.service.ts`. Adds DLQ size per plugin.

---

### [S5-900] Kafka status service + schema
- **Feature**: 005-11
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/kafka-status.service.ts` (create — reads consumer lag + DLQ size per plugin, wraps existing lag-metrics.service)
  - `services/core-api/src/modules/admin/schemas/kafka-schemas.ts` (create — Zod schemas for Kafka status response)
- **Depends on**: S5-004
- **Acceptance**:
  - `getKafkaStatus()` returns `{ consumers: [{ pluginSlug, tenantSlug, lag, topic }], totalLag, dlqSizes: [{ pluginSlug, count }] }`
  - Wraps existing `lag-metrics.service.ts` (Spec 004) — no new Kafka client
  - DLQ size per plugin reads from `core.dead_letter_queue` (ADR-016)
  - Warns when lag exceeds threshold (default 1000) — surfaced in response, UI shows warning
  - Warns when DLQ exceeds threshold (default 100) — surfaced in response
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-901] Kafka status route
- **Feature**: 005-11
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/kafka-status.routes.ts` (create — `GET /api/v1/admin/system/kafka`)
- **Depends on**: S5-900
- **Acceptance**:
  - `GET /api/v1/admin/system/kafka` returns consumer lag + DLQ size
  - `requireSuperAdmin` preHandler enforced
  - Note: existing `plugin/routes/kafka-status.routes.ts` is extended with DLQ size (route ownership table — KEEP + extend)
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-902] Kafka status — integration test
- **Feature**: 005-11
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/kafka-status.routes.int.test.ts` (create — consumer lag, DLQ size per plugin)
- **Depends on**: S5-901
- **Acceptance**:
  - Integration test with real Kafka/Redpanda: consumer lag per plugin, DLQ size per plugin
  - Total lag calculated correctly
  - Warning thresholds surfaced when exceeded
  - No mocks of Kafka
- **Estimate**: M (2-4h)

---

### [S5-903] Kafka status — frontend page + hook
- **Feature**: 005-11
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/kafka/kafka-status-page.tsx` (create — consumer lag table + DLQ summary)
  - `apps/admin/src/hooks/use-kafka-status.ts` (create — TanStack Query for Kafka status)
  - `apps/admin/src/i18n/messages.en.system.ts` (modify — add Kafka messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/kafka` route)
- **Depends on**: S5-C02, S5-901
- **Acceptance**:
  - Kafka status page shows consumer lag table (plugin, tenant, lag, topic) + DLQ size summary
  - Warning indicators when lag > 1000 or DLQ > 100
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-904] Kafka status — E2E test
- **Feature**: 005-11
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-11-kafka-status.spec.ts` (create)
- **Depends on**: S5-903, S5-C03
- **Acceptance**:
  - Super admin views Kafka status, sees consumer lag per plugin and DLQ size
  - Warning indicators display when thresholds exceeded
  - Test runs against real Kafka/Redpanda
- **Estimate**: M (2-4h)

---

## Phase 10: Feature 005-10 — Filterable System Logs

> Implementation order 10 per plan §7. Depends on Loki infrastructure (S5-002, S5-003).
> Needs `pino-loki` transport + Loki query proxy.

---

### [S5-A00] Logs query service — LogQL builder + Loki proxy
- **Feature**: 005-10
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/logs-query.service.ts` (create — translates admin filters → LogQL labels + line filters, proxies to Loki HTTP API)
  - `services/core-api/src/modules/admin/schemas/logs-schemas.ts` (create — Zod schemas for logs query params + Loki response)
- **Depends on**: S5-003
- **Acceptance**:
  - `queryLogs({ tenant?, level?, start?, end?, limit })` translates filters to LogQL:
    - tenant → label selector `{tenant="$tenant"}`
    - level → line filter `|~ "\"level\":\"$level\""`
    - time range → `start` + `end` parameters on `query_range`
  - **Parameterized LogQL construction** — no string interpolation of user input (Security §3)
  - Proxies to `GET /loki/api/v1/query_range` with `AbortSignal.timeout(5000)` (W-6)
  - Returns `{ logs: [{ timestamp, level, tenant, message }], total }`
  - 503 `SERVICE_UNAVAILABLE` when Loki unreachable
  - 503 `LOG_QUERY_TIMEOUT` when query exceeds 5s
  - File under 200 lines
- **Estimate**: L (4-8h)

---

### [S5-A01] Logs query — unit test
- **Feature**: 005-10
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/logs-query.service.test.ts` (create — LogQL filter construction, no string interpolation)
- **Depends on**: S5-A00
- **Acceptance**:
  - Unit test: LogQL construction for tenant label, level line filter, time range — correct output
  - Unit test: no string interpolation of user input (parameterized construction)
  - Unit test: timeout handling logic
- **Estimate**: M (2-4h)

---

### [S5-A02] Logs route
- **Feature**: 005-10
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/routes/logs.routes.ts` (create — `GET /api/v1/admin/logs`)
- **Depends on**: S5-A00
- **Acceptance**:
  - `GET /api/v1/admin/logs?tenant=&level=&start=&end=&limit=100` returns filtered logs
  - 503 `SERVICE_UNAVAILABLE` when Loki not configured (`LOKI_URL` empty) or unreachable
  - 503 `LOG_QUERY_TIMEOUT` on 5s timeout
  - `requireSuperAdmin` preHandler enforced
  - Route file under 200 lines
- **Estimate**: S (1h)

---

### [S5-A03] Logs query — integration test
- **Feature**: 005-10
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/logs.routes.int.test.ts` (create — Loki proxy, filter translation, 503 when Loki unavailable)
- **Depends on**: S5-A02
- **Acceptance**:
  - Integration test with real Loki: generate logs via pino-loki, query via admin endpoint, verify filters work
  - Edge: Loki unreachable → 503 `SERVICE_UNAVAILABLE`
  - Edge: query timeout → 503 `LOG_QUERY_TIMEOUT`
  - Filter by tenant, level, time range — results match
  - No mocks of Loki
- **Estimate**: M (2-4h)

---

### [S5-A04] System logs — frontend page + filters + hook
- **Feature**: 005-10
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/logs/logs-page.tsx` (create — log viewer with filters)
  - `apps/admin/src/components/logs/log-filters.tsx` (create — filter bar: tenant, level, time range)
  - `apps/admin/src/hooks/use-logs.ts` (create — TanStack Query for logs)
  - `apps/admin/src/i18n/messages.en.system.ts` (modify — add logs messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/logs` route)
- **Depends on**: S5-C02, S5-A02
- **Acceptance**:
  - Logs page shows filter bar (tenant dropdown, level select, time range picker) + log list
  - Log entries show timestamp, level, tenant, message
  - Filters update query via TanStack Query (debounced)
  - Graceful error display on 503 (Loki unavailable / timeout)
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-A05] System logs — E2E test
- **Feature**: 005-10
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-10-logs.spec.ts` (create)
- **Depends on**: S5-A04, S5-C03
- **Acceptance**:
  - Super admin views system logs, filters by tenant + level + time range, verifies results
  - Test generates logs via API calls (pino-loki ships to Loki), then queries via admin UI
  - Test runs against real Loki
- **Estimate**: M (2-4h)

---

## Phase 11: Feature 005-01 — Dashboard

> Implementation order 11 per plan §7. Last — aggregates metrics from all other features.
> Depends on 005-02, 005-08, Prisma migration, metrics aggregator + Redis keys.

---

### [S5-B00] Metrics aggregator service — scheduled job
- **Feature**: 005-01
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/metrics-aggregator.service.ts` (create — scheduled job: aggregates user/workspace counts across schemas → Redis)
  - `services/core-api/src/index.ts` (modify — start metrics aggregator `setInterval` in bootstrap, 5-minute interval)
- **Depends on**: S5-001
- **Acceptance**:
  - `aggregateMetrics()` counts users + workspaces across all tenant schemas, writes to Redis keys:
    - `metrics:user_count:total`
    - `metrics:workspace_count:total`
  - Cross-schema counts via `prisma.$queryRaw` with parameterized schema names
  - `setInterval` started in `src/index.ts` bootstrap (same pattern as DLQ consumer)
  - Tenant count, active plugins, tenant status counts updated on respective events (not by this job)
  - File under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-B01] Metrics aggregator — unit test
- **Feature**: 005-01
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/metrics-aggregator.service.test.ts` (create — cross-schema count aggregation, Redis key updates)
- **Depends on**: S5-B00
- **Acceptance**:
  - Unit test: aggregation logic counts rows across schemas
  - Redis keys updated with correct values
  - Parameterized schema name construction (no SQL injection)
- **Estimate**: S (1h)

---

### [S5-B02] Dashboard metrics service + schema + route
- **Feature**: 005-01
- **Type**: backend
- **Files**:
  - `services/core-api/src/modules/admin/services/dashboard-metrics.service.ts` (create — reads pre-aggregated Redis metrics)
  - `services/core-api/src/modules/admin/schemas/dashboard-schemas.ts` (create — Zod schemas for dashboard response)
  - `services/core-api/src/modules/admin/routes/dashboard.routes.ts` (create — `GET /api/v1/admin/dashboard`)
- **Depends on**: S5-B00
- **Acceptance**:
  - `GET /api/v1/admin/dashboard` returns `{ tenantCount, userCount, workspaceCount, activePlugins, tenantsByStatus: { active, suspended, pending_deletion, deleted } }`
  - Reads pre-aggregated values from Redis (no schema scan) — dashboard load < 2s (NFR)
  - `tenantCount` from `core.tenants` count (fast)
  - `tenantsByStatus` from Redis keys `metrics:tenant_status:<status>` (or direct count)
  - `activePlugins` from `core.plugins` where `status = 'published'` count (or Redis)
  - `requireSuperAdmin` preHandler enforced
  - Route file under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-B03] Dashboard — integration test
- **Feature**: 005-01
- **Type**: test
- **Files**:
  - `services/core-api/src/__tests__/admin/dashboard.routes.int.test.ts` (create — metrics aggregation, Redis pre-aggregated values)
- **Depends on**: S5-B02
- **Acceptance**:
  - Integration test: seed tenants + users + workspaces, run aggregator, verify dashboard metrics correct
  - Redis pre-aggregated values match actual counts
  - `tenantsByStatus` breakdown correct
  - No mocks of Redis/PostgreSQL
- **Estimate**: M (2-4h)

---

### [S5-B04] Dashboard — frontend page + hook
- **Feature**: 005-01
- **Type**: frontend
- **Files**:
  - `apps/admin/src/components/dashboard/dashboard-page.tsx` (create — metric cards + status summary)
  - `apps/admin/src/components/dashboard/metric-card.tsx` (create — reusable metric card component)
  - `apps/admin/src/hooks/use-dashboard.ts` (create — TanStack Query for dashboard metrics)
  - `apps/admin/src/i18n/messages.en.dashboard.ts` (create — dashboard messages)
  - `apps/admin/src/router-shell-routes.tsx` (modify — add `/dashboard` route as default authenticated route)
- **Depends on**: S5-C02, S5-B02
- **Acceptance**:
  - Dashboard page shows metric cards: tenant count, user count, workspace count, active plugins
  - Status breakdown section: active, suspended, pending_deletion, deleted counts
  - Data fetched only via TanStack Query (Rule 3)
  - All UI strings via react-intl
  - Files under 200 lines
- **Estimate**: M (2-4h)

---

### [S5-B05] Dashboard — E2E test
- **Feature**: 005-01
- **Type**: test
- **Files**:
  - `apps/admin/e2e/005-01-dashboard.spec.ts` (create)
- **Depends on**: S5-B04, S5-C03
- **Acceptance**:
  - Super admin sees tenant count, user count, active plugins, status breakdown on dashboard
  - Metrics match seeded data
  - Test runs against real DB, Redis
- **Estimate**: M (2-4h)

---

## Phase 12: CI Pipeline + Final Integration

> CI workflow update and cross-feature wiring.

---

### [S5-C10] CI workflow — admin app build, unit/integration, E2E
- **Feature**: Infrastructure (W-5)
- **Type**: integration
- **Files**:
  - `.github/workflows/ci.yml` (modify — add `admin-build`, `admin-unit-int`, `admin-e2e` jobs)
- **Depends on**: S5-C00, S5-104, S5-204, S5-305, S5-404, S5-504, S5-604, S5-705, S5-804, S5-904, S5-A05, S5-B05
- **Acceptance**:
  - `admin-build` job: `pnpm --filter @plexica/admin build`
  - `admin-unit-int` job: `pnpm --filter @plexica/admin test` (Vitest)
  - `admin-e2e` job: start admin dev server (port 3002) + core API + infra; `pnpm --filter @plexica/admin e2e` (Playwright)
  - Admin E2E runs in same `docker compose up` environment as web E2E (shared Keycloak, PostgreSQL, Redis, Kafka, MinIO, Loki)
  - All 11 admin E2E spec files must pass for CI green (Rule 2)
  - CI blocks merge on any failure
- **Estimate**: M (2-4h)

---

### [S5-C11] Admin module — full route registration + i18n completion
- **Feature**: Integration
- **Type**: integration
- **Files**:
  - `services/core-api/src/modules/admin/index.ts` (modify — register all route groups: dashboard, tenant-list, tenant-detail, tenant-provision, tenant-suspend, tenant-reactivate, tenant-delete, deletion-status, plugin-catalog, health, logs, audit-log, kafka-status)
  - `apps/admin/src/router-shell-routes.tsx` (verify — all 9 routes registered: /dashboard, /tenants, /tenants/$tenantId, /tenants/provision, /plugins, /health, /logs, /kafka, /login)
  - `apps/admin/src/i18n/messages.en.ts` (verify — all message catalogs imported: dashboard, tenants, plugins, system)
- **Depends on**: S5-B04, S5-903, S5-A04, S5-803, S5-704, S5-603, S5-503, S5-403, S5-304, S5-204, S5-104
- **Acceptance**:
  - All 14 admin route files registered in `admin/index.ts`
  - All 9 frontend routes registered in `router-shell-routes.tsx`
  - All i18n message catalogs imported in `messages.en.ts`
  - No route duplication (verified against route ownership table §3.4)
  - Server starts without errors; admin app builds without errors
- **Estimate**: S (1h)

---

### [S5-C12] Full sprint review — adversarial review + human review
- **Feature**: All
- **Type**: integration
- **Files**: none (process task)
- **Depends on**: S5-C10, S5-C11
- **Acceptance**:
  - `/forge-review .forge/specs/005-super-admin/` completed — dual-model adversarial review on 7 dimensions
  - All HIGH severity findings addressed before merge
  - Human code review completed (at least 1 approval per PR)
  - All CI checks green (unit, integration, E2E)
  - Constitution compliance verified (all 6 rules)
- **Estimate**: M (2-4h)

---

## Summary

### Task Count by Feature

| Feature | Tasks | Task IDs |
| ------- | ----- | -------- |
| Infrastructure (Phase 0) | 12 | S5-000–S5-006, S5-C00–S5-C04 |
| 005-09 Health Check | 5 | S5-100–S5-104 |
| 005-02 Tenant List | 5 | S5-200–S5-204 |
| 005-03 Tenant Detail | 6 | S5-300–S5-305 |
| 005-04 Provisioning | 5 | S5-400–S5-404 |
| 005-05 Suspension | 5 | S5-500–S5-504 |
| 005-06 Reactivation | 5 | S5-600–S5-604 |
| 005-07 Deletion | 6 | S5-700–S5-705 |
| 005-08 Plugin Catalog | 5 | S5-800–S5-804 |
| 005-11 Kafka Status | 5 | S5-900–S5-904 |
| 005-10 System Logs | 6 | S5-A00–S5-A05 |
| 005-01 Dashboard | 6 | S5-B00–S5-B05 |
| CI + Integration | 3 | S5-C10, S5-C11, S5-C12 |
| **Total** | **74** | |

### Task Count by Type

| Type | Count |
| ---- | ----- |
| backend | 31 |
| frontend | 18 |
| test | 20 |
| infra | 3 |
| integration | 2 |
| **Total** | **74** (some tasks span multiple types) |

### Estimated Hours

| Estimate | Count | Hours (midpoint) |
| -------- | ----- | ---------------- |
| S (1h) | 14 | 14h |
| M (2-4h) | 47 | 141h |
| L (4-8h) | 13 | 78h |
| **Total** | **74** | **233h** |

> **Note**: Estimates are per-task effort for a single developer session. Total
> of ~233h reflects the full scope of 11 features + admin app scaffold + infra.
> With 2 developers in parallel on independent features, calendar time is
> roughly halved for the feature phases (005-09 through 005-01).

### Critical Path (Longest Dependency Chain)

```
S5-000 (security fix)
  → S5-001 (Prisma migration)
    → S5-004 (admin module scaffold)
      → S5-200 (tenant list service)
        → S5-300 (tenant detail service)
          → S5-400 (provision service)
            → S5-500 (suspend service)
              → S5-600 (reactivate service)
    → S5-006 (optimistic lock)  [parallel with feature track]
S5-C00 (admin app scaffold)
  → S5-C01 (admin app core)
    → S5-C02 (admin app layout)
      → S5-C03 (Playwright config + E2E helpers)
        → S5-104 (first E2E test — health check)
```

**Longest chain** (backend feature track):
S5-000 → S5-001 → S5-004 → S5-200 → S5-300 → S5-400 → S5-500 → S5-600 → S5-C11 → S5-C10 → S5-C12
= **11 steps** (each M or L estimate) = ~30-50h critical path effort.

**Frontend track** (parallel, converges at E2E):
S5-C00 → S5-C01 → S5-C02 → S5-C03 → (per-feature E2E) → S5-C10 → S5-C12
= **7+ steps** before feature E2E can run.

### Parallelization Opportunities

| Parallel Group | Tasks | Why |
| -------------- | ----- | --- |
| Infra track | S5-000, S5-002, S5-C00, S5-C04 | No interdependencies — security fix, Loki infra, admin app scaffold, Keycloak client can all proceed in parallel |
| Feature 005-09 + 005-02 | S5-100 block, S5-200 block | Both depend only on S5-004; independent of each other |
| Feature 005-08 + 005-11 | S5-800 block, S5-900 block | Both independent of tenant lifecycle; can run in parallel after S5-004 |
| All E2E tests | S5-104, S5-204, S5-305, S5-404, S5-504, S5-604, S5-705, S5-804, S5-904, S5-A05, S5-B05 | E2E tests for independent features can run in parallel once their frontend + backend are done |

### Concerns

1. **Deletion saga complexity (S5-700, S5-705)**: The GDPR deletion saga is the
   most complex feature — async background executor, retry with backoff, startup
   sweep for stuck steps, force-delete MinIO objects. The E2E test (S5-705)
   must verify all 3 resources are gone against real infrastructure. This is
   the highest-risk task in the sprint. Consider splitting S5-700 further if it
   exceeds 8h.

2. **Loki in CI (S5-A05)**: The logs E2E test depends on Loki being available
   in the CI `docker compose up` environment. If Loki is flaky in CI, the test
   may need a graceful degradation path (verify 503 handling). The plan §12
   notes this risk.

3. **Route ownership coordination (S5-004, S5-401, S5-801)**: Moving
   `POST /api/admin/tenants` to the new admin module and updating
   `publish`/`unpublish` routes must be coordinated in a single PR to avoid
   route duplication errors. The `rate-limit.test.ts` path update must happen
   in the same PR.

4. **Cross-schema aggregate performance (S5-300, S5-B00)**: The metrics
   aggregator scans all tenant schemas every 5 minutes. With 100+ tenants this
   is 200+ count queries. Acceptable for this sprint, but flagged as a scaling
   concern for 1000+ tenants (plan §12).

5. **Admin app is entirely new (S5-C00 block)**: 12 tasks (S5-C00 through
   S5-C04 + per-feature frontend) build a new app from scratch. The scaffold
   tasks (S5-C00, S5-C01, S5-C02) are on the critical path for all frontend
   work — they should be prioritized early and in parallel with the backend
   infra tasks.

6. **Estimate confidence**: The total estimate (~244h) is a rough midpoint.
   L tasks (deletion saga, provisioning, plugin catalog E2E) have wide
   uncertainty ranges. Buffer 20-30% for integration debugging against real
   infrastructure (Keycloak, MinIO, Loki).

---

## Cross-References

| Document | Path                                          |
| -------- | --------------------------------------------- |
| Spec     | `.forge/specs/005-super-admin/spec.md`       |
| Plan     | `.forge/specs/005-super-admin/plan.md`       |
| ADR-022  | `.forge/knowledge/adr/adr-022-super-admin-infra-and-data-model.md` |
| Sprint   | `.forge/sprints/active/sprint-005.yaml`      |
| Constitution | `.forge/constitution.md`                |
