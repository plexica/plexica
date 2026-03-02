# Tasks: 008 - Admin Interfaces

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                                  |
| ------ | ------------------------------------------------------ |
| Status | Pending                                                |
| Author | forge-scrum                                            |
| Date   | 2026-02-28                                             |
| Spec   | [.forge/specs/008-admin-interfaces/spec.md](./spec.md) |
| Plan   | [.forge/specs/008-admin-interfaces/plan.md](./plan.md) |

---

## Legend

- `[FR-NNN]` / `[NFR-NNN]` — Requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- `[⚠ HIGH]` — High-risk task flagged in analysis.md
- Status: `[ ]` pending · `[x]` done · `[-]` skipped
- Size: `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h (split if needed)
- **Path**: Explicit file path relative to repository root

---

## Quick Reference Table

| ID      | Title                                                          | Type     | Pts | Phase | Deps                               |
| ------- | -------------------------------------------------------------- | -------- | --- | ----- | ---------------------------------- |
| T008-00 | Normalize admin.ts error responses to Art. 6.2 format          | refactor | 3   | 1     | —                                  |
| T008-01 | Add AuditLog Prisma model + migration                          | schema   | 2   | 1     | —                                  |
| T008-02 | Add SystemConfig Prisma model + migration + seed               | schema   | 2   | 1     | —                                  |
| T008-03 | Add team_members to schema-step + backfill script              | schema   | 3   | 1     | —                                  |
| T008-04 | Add AUDIT_ACTIONS constants                                    | config   | 1   | 1     | —                                  |
| T008-05 | Implement AuditLogService                                      | service  | 3   | 1     | T008-01, T008-04                   |
| T008-06 | Implement AuditLogMiddleware Fastify hook                      | service  | 2   | 1     | T008-05                            |
| T008-07 | Unit tests — AuditLogService (≥85% coverage)                   | test     | 2   | 1     | T008-05                            |
| T008-08 | Unit tests — admin.ts error format compliance (Art. 6.2)       | test     | 2   | 1     | T008-00                            |
| T008-09 | Implement SystemConfigService                                  | service  | 3   | 2     | T008-02, T008-05                   |
| T008-10 | Extend AdminService — super admin CRUD + getSystemHealth()     | service  | 5   | 2     | T008-05                            |
| T008-11 | Add Super Admin extension routes to admin.ts (8 routes)        | api      | 5   | 2     | T008-00, T008-06, T008-09, T008-10 |
| T008-12 | Unit tests — SystemConfigService (≥85% coverage)               | test     | 2   | 2     | T008-09                            |
| T008-13 | Integration tests — new Super Admin endpoints                  | test     | 3   | 2     | T008-11                            |
| T008-14 | Add requireTenantAdmin middleware to auth.ts                   | api      | 1   | 3     | —                                  |
| T008-15 | Implement TenantAdminService — getDashboard()                  | service  | 2   | 3     | T008-03, T008-05                   |
| T008-16 | Implement TenantAdminService — user management methods         | service  | 8   | 3     | T008-15                            |
| T008-17 | Implement TenantAdminService — team CRUD + member methods      | service  | 5   | 3     | T008-15, T008-03                   |
| T008-18 | Implement TenantAdminRoutes — all 15+ Tenant Admin endpoints   | api      | 8   | 3     | T008-14, T008-16, T008-17, T008-06 |
| T008-19 | Register tenantAdminRoutes + auditLogMiddleware in index.ts    | config   | 1   | 3     | T008-06, T008-18                   |
| T008-20 | Unit tests — TenantAdminService (≥85% coverage)                | test     | 5   | 3     | T008-16, T008-17                   |
| T008-21 | Integration tests — Tenant Admin endpoints + NFR-004 isolation | test     | 5   | 3     | T008-18, T008-19                   |
| T008-22 | E2E — Super Admin tenant lifecycle with full audit trail       | test     | 2   | 4     | T008-11, T008-13                   |
| T008-23 | E2E — Tenant Admin user and team lifecycle                     | test     | 2   | 4     | T008-21                            |
| T008-24 | E2E — Custom role creation, permissions, user assignment       | test     | 2   | 4     | T008-21                            |
| T008-25 | E2E — Edge case guards and cross-tenant isolation              | test     | 2   | 4     | T008-22, T008-23                   |
| T008-26 | E2E — Audit log query: date range and action filters           | test     | 1   | 4     | T008-22                            |
| T008-27 | Update project status documentation                            | docs     | 1   | 5     | T008-26                            |

**Total: 28 tasks · 77 story points**

---

## Phase 1: Foundation

> **Objective**: Normalize the existing Art. 6.2 error violation (ISSUE-001 HIGH), create the three
> new database tables, implement the audit log service + middleware, and add constants. Everything in
> Phases 2 and 3 depends on this phase completing first.
>
> ⚠ T008-00 is the highest-risk task — it touches 17 existing error responses in a 2000-line file.
> T008-03 requires a backfill script for existing tenant schemas.

---

- [ ] **T008-00** `[⚠ HIGH]` `[L]` Normalize existing `admin.ts` error responses to Art. 6.2 format
  - **FR/NFR**: Resolves Art. 6.2 violation; impacts FR-002 through FR-007 indirectly
  - **Type**: refactor · **Points**: 3
  - **File**: `apps/core-api/src/routes/admin.ts`
  - **Change type**: Modify existing
  - **Location**: Lines ~640, 655, 1157, 1163, 1358, 1364, 1426, 1439, 1492, 1521, 1527, 1720, 1726, 1774, 1835, 1883, 1949 (17 error responses)
  - **Description**: Replace every `{ error: 'Not Found', message: '...' }` and equivalent non-standard shapes with the constitutionally mandated format `{ error: { code: 'SCREAMING_SNAKE_CASE', message: '...', details?: {} } }`. Use specific error codes: `TENANT_NOT_FOUND`, `PLUGIN_NOT_FOUND`, `VALIDATION_ERROR`, `TENANT_SUSPENDED`, etc. Add `details` object where contextual data exists (e.g., `{ tenantId }`, `{ pluginId }`). **This task MUST complete before any new routes are added to `admin.ts`** (T008-11 depends on it).
  - **Spec Reference**: Constitution Art. 6.2; Analysis ISSUE-001 (HIGH)
  - **Dependencies**: None
  - **Acceptance Criteria**:
    1. All 17 identified error sites in `admin.ts` emit `{ error: { code, message } }` — zero `{ error: string }` shapes remain in the file.
    2. Every error code is `SCREAMING_SNAKE_CASE` and semantically accurate (e.g., `TENANT_NOT_FOUND` not generic `NOT_FOUND`).
    3. `pnpm lint && pnpm build` pass without TypeScript errors or ESLint violations after the change.
    4. Existing integration tests asserting 4xx/5xx status codes continue to pass (no behavioral regressions).

---

- [ ] **T008-01** `[P]` `[M]` `[FR-006]` `[FR-014]` Add `AuditLog` Prisma model + run migration
  - **Type**: schema · **Points**: 2
  - **File**: `packages/database/prisma/schema.prisma`
  - **Change type**: Modify existing
  - **Location**: End of file (after last existing model)
  - **Description**: Add the `AuditLog` model with all columns from plan §2.1: `id` (UUID PK `@default(uuid())`), `tenantId` (String?, indexed), `userId` (String?), `action` (String, max 100), `resourceType` (String?), `resourceId` (String?), `details` (Json, `@default("{}")`), `ipAddress` (String? — Prisma does not support PostgreSQL `INET`, validated at service layer), `userAgent` (String?), `createdAt` (DateTime, `@default(now())`). Use `@@map("audit_logs")`. Add all 5 indexes from plan §2.3: `idx_audit_logs_tenant_id`, `idx_audit_logs_created_at`, `idx_audit_logs_action`, `idx_audit_logs_tenant_created` (composite `(tenantId, createdAt)`), `idx_audit_logs_user_id`. Run `pnpm db:generate && pnpm db:migrate`. Table is **append-only** — no UPDATE/DELETE anywhere in the codebase.
  - **Spec Reference**: Spec §7; Plan §2.1, §2.3, §2.4 Migration 001
  - **Dependencies**: None (parallelizable with T008-02, T008-03, T008-04)
  - **Acceptance Criteria**:
    1. `AuditLog` model present in `schema.prisma` with `@@map("audit_logs")` and all 10 listed fields.
    2. All 5 indexes from plan §2.3 appear in the generated migration SQL (`\d audit_logs` shows them).
    3. `pnpm db:migrate` runs to completion on a clean database without errors.
    4. `pnpm db:generate` regenerates the Prisma client; `AuditLog` TypeScript type available in `@plexica/database`.

---

- [ ] **T008-02** `[P]` `[M]` `[FR-005]` Add `SystemConfig` Prisma model + migration + seed defaults
  - **Type**: schema · **Points**: 2
  - **File**: `packages/database/prisma/schema.prisma`
  - **Change type**: Modify existing
  - **Location**: After `AuditLog` model
  - **Description**: Add `SystemConfig` model with fields: `key` (String PK), `value` (Json, NOT NULL), `category` (String, max 50), `description` (String?), `updatedBy` (String?), `updatedAt` (DateTime, `@updatedAt`), `createdAt` (DateTime, `@default(now())`). Use `@@map("system_config")`. Add `idx_system_config_category` B-TREE index on `category`. Run migration. Seed 5 default rows using idempotent upsert in the migration SQL: `maintenance_mode` (false, maintenance), `max_tenants` (1000, limits), `max_users_per_tenant` (500, limits), `feature_flag_analytics` (true, features), `registration_enabled` (true, general).
  - **Spec Reference**: Plan §2.1, §2.3, §2.4 Migration 002; Spec §4 FR-005
  - **Dependencies**: None (parallelizable with T008-01, T008-03, T008-04)
  - **Acceptance Criteria**:
    1. `SystemConfig` model present with `@@map("system_config")` and all 7 listed fields.
    2. `idx_system_config_category` index exists in migration SQL.
    3. After `pnpm db:migrate`, exactly 5 seed rows exist with correct keys, values, and categories.
    4. Running the migration a second time (on a database that already has the seed rows) is idempotent (upsert, no error).

---

- [ ] **T008-03** `[P]` `[⚠ HIGH]` `[L]` `[FR-010]` Add `team_members` table to `schema-step.ts` + backfill script
  - **Type**: schema · **Points**: 3
  - **Files**:
    - `apps/core-api/src/services/provisioning-steps/schema-step.ts` (modify)
    - `apps/core-api/scripts/migrate-team-members.ts` (create new)
  - **Change type**: Modify existing + Create new file
  - **Location**: `schema-step.ts` — after teams table CREATE statement (~line 274)
  - **Description**: **(A) schema-step.ts**: Insert `CREATE TABLE IF NOT EXISTS "{schema}".team_members (team_id TEXT NOT NULL REFERENCES "{schema}".teams(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES "{schema}".users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('MEMBER','ADMIN')), joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (team_id, user_id))` plus indexes `idx_team_members_user_id` (on `user_id`) and `idx_team_members_team_id` (on `team_id`). Use `IF NOT EXISTS` for idempotency. **(B) migrate-team-members.ts**: Standalone script that queries all existing tenant records from `core.tenants`, derives each schema name via `validateSchemaName()`, and runs the same DDL for each. Supports `--dry-run` flag (prints SQL only, no execution). Wraps each schema's migration in a transaction. Logs per-tenant success/failure. Addresses Analysis ISSUE-006 (MEDIUM).
  - **Spec Reference**: Plan §2.1, §2.4 Migration 003; Analysis ISSUE-006
  - **Dependencies**: None (parallelizable with T008-01, T008-02, T008-04)
  - **Acceptance Criteria**:
    1. New tenants provisioned after this change automatically get a `team_members` table with PK `(team_id, user_id)` and both FK constraints with `ON DELETE CASCADE`.
    2. `npx ts-node scripts/migrate-team-members.ts --dry-run` prints SQL for each existing tenant without executing it.
    3. `npx ts-node scripts/migrate-team-members.ts` (without flag) creates `team_members` in each existing tenant schema; running it twice produces no errors (idempotent).
    4. Deleting a team removes its `team_members` rows automatically (FK cascade verified by test).

---

- [ ] **T008-04** `[P]` `[S]` `[FR-006]` `[FR-014]` Add `AUDIT_ACTIONS` constants
  - **Type**: config · **Points**: 1
  - **File**: `apps/core-api/src/constants/index.ts`
  - **Change type**: Modify existing
  - **Location**: After existing `CACHE_TTL` constants
  - **Description**: Export an `AUDIT_ACTIONS` constant object (`as const`) with string literals for all auditable events from spec §7: authentication (`'auth.login'`, `'auth.logout'`, `'auth.failed_login'`), user management (`'user.invited'`, `'user.deactivated'`, `'user.role_changed'`), team management (`'team.created'`, `'team.member_added'`, `'team.member_removed'`), role management (`'role.created'`, `'role.permissions_changed'`), plugin management (`'plugin.installed'`, `'plugin.enabled'`, `'plugin.disabled'`, `'plugin.configured'`), tenant management (`'tenant.created'`, `'tenant.suspended'`, `'tenant.deleted'`), settings (`'settings.theme_changed'`, `'settings.config_updated'`). Dot-notation string values for API output consistency.
  - **Spec Reference**: Spec §7 (Events to Audit table); Plan §5 Files to Modify
  - **Dependencies**: None (parallelizable with T008-01, T008-02, T008-03)
  - **Acceptance Criteria**:
    1. `AUDIT_ACTIONS` is exported from `constants/index.ts` and covers all 19 event types listed in spec §7.
    2. String values use dot-notation (e.g., `'tenant.created'`, `'user.invited'`).
    3. TypeScript produces a union of string literals for `typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS]` (not `string`).
    4. `pnpm build` passes without TypeScript errors.

---

- [ ] **T008-05** `[L]` `[FR-006]` `[FR-014]` Implement `AuditLogService`
  - **Type**: service · **Points**: 3
  - **File**: `apps/core-api/src/services/audit-log.service.ts`
  - **Change type**: Create new file (~200 lines)
  - **Description**: Implement `AuditLogService` class with three methods per plan §4.1: **(1) `log(entry: AuditLogEntry): Promise<void>`** — appends a single row via Prisma; validates `ipAddress` with `z.string().ip()` before insertion (handles both IPv4 and IPv6 — fixes Analysis ISSUE-010); swallows all errors silently (Pino `warn` log, no re-throw). **(2) `query(filters: AuditLogFilters): Promise<AuditLogPage>`** — paginated global query for Super Admin; enforces 10K result-window cap `(page - 1) * limit < 10_000` via Zod `.refine()` per plan §9 Inline Decision; throws error with code `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` on overflow; `meta.total` reflects true count. **(3) `queryForTenant(tenantId: string, filters: AuditLogFilters): Promise<AuditLogPage>`** — same as `query` but always appends `WHERE tenant_id = $tenantId` and ignores any `tenantId` in `filters` (NFR-004 enforcement). Export TypeScript interfaces `AuditLogEntry`, `AuditLogFilters`, `AuditLogPage`. Export as singleton.
  - **Spec Reference**: Plan §4.1, §9 Inline Decision; Spec §7; Analysis ISSUE-002, ISSUE-010
  - **Dependencies**: T008-01 (AuditLog Prisma model), T008-04 (AUDIT_ACTIONS constants)
  - **Acceptance Criteria**:
    1. `log()` writes an `AuditLog` row; does not throw on Prisma error (error is `warn`-logged only).
    2. `queryForTenant('tenant-A')` never returns rows where `tenant_id` = `'tenant-B'` (verified with two-tenant dataset).
    3. `query({ page: 101, limit: 100 })` throws error with code `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`.
    4. `log()` accepts IPv6 address `::1` — stored as-is; invalid IP `'not-an-ip'` is stored as `null`.

---

- [ ] **T008-06** `[M]` `[FR-006]` `[FR-014]` Implement `AuditLogMiddleware` Fastify hook
  - **Type**: service · **Points**: 2
  - **File**: `apps/core-api/src/middleware/audit-log.ts`
  - **Change type**: Create new file (~80 lines)
  - **Description**: Implement a Fastify `onResponse` hook exported as `auditLogMiddleware`. Reads `request.routeOptions.config.audit` (typed as `{ action: string; resourceType?: string }`). If present and response status is 2xx/3xx, calls `auditLogService.log()` with: `userId` from `request.user?.id`, `tenantId` from `request.tenantContext?.tenantId`, `ipAddress` from `request.ip`, `userAgent` from `request.headers['user-agent']`, `resourceId` from `request.params.id ?? null`. Errors in the hook are caught, Pino `warn`-logged, and do **not** fail the HTTP response (non-blocking). Do not include raw request bodies in `details` (no PII per Art. 5.2).
  - **Spec Reference**: Plan §4.2; Spec §7 Events to Audit
  - **Dependencies**: T008-05 (AuditLogService)
  - **Acceptance Criteria**:
    1. A route with `config: { audit: { action: 'tenant.created' } }` produces an `audit_logs` row after a 200 response.
    2. A route without `config.audit` produces no `audit_logs` rows.
    3. A 4xx or 5xx response does not produce an `audit_logs` row.
    4. If `auditLogService.log()` throws, the HTTP response is still sent without error.

---

- [ ] **T008-07** `[P]` `[L]` `[FR-006]` `[FR-014]` Unit tests — `AuditLogService` (≥85% coverage)
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/unit/audit-log.service.test.ts`
  - **Change type**: Create new file (~300 lines)
  - **Description**: Vitest unit tests for `AuditLogService`. Scenarios: `log()` happy path (Prisma called with correct args), `log()` error resilience (Prisma throws → no re-throw), `query()` pagination (page/limit/meta.total), `query()` all filter combinations (action, userId, tenantId, resourceType, startDate, endDate), `queryForTenant()` tenant isolation (returns zero rows for other tenant's data), result-window cap enforcement at ≥10K offset, IPv4 and IPv6 acceptance by `log()`, invalid IP stored as null. Mock Prisma with `vi.mock`. Follow AAA pattern; all tests < 100ms.
  - **Spec Reference**: Plan §8.1; Constitution Art. 8
  - **Dependencies**: T008-05
  - **Acceptance Criteria**:
    1. All 10 scenarios have passing `it()` blocks.
    2. `audit-log.service.ts` line coverage ≥85% per `pnpm test:unit`.
    3. Tenant isolation test: `queryForTenant('tenant-A')` returns 0 rows when all mock data has `tenantId = 'tenant-B'`.
    4. No test makes real network or database calls (all Prisma calls are `vi.mock`ed).

---

- [ ] **T008-08** `[P]` `[M]` Normalize unit tests — `admin.ts` Art. 6.2 error format compliance
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/unit/admin-error-format.test.ts`
  - **Change type**: Create new file (~200 lines)
  - **Description**: Vitest tests asserting every error path in `admin.ts` returns the Art. 6.2 format `{ error: { code: string, message: string } }`. One test per logical error code across all existing route groups (tenant CRUD, plugin management, analytics, user listing). Use `buildTestApp()` with mock JWTs. These tests validate T008-00's remediation — they should be written to capture failures in the pre-T008-00 state and pass 100% after T008-00.
  - **Spec Reference**: Constitution Art. 6.2; Plan §7 Phase 1; Analysis ISSUE-001 (HIGH)
  - **Dependencies**: T008-00 (error remediation applied)
  - **Acceptance Criteria**:
    1. One `it()` per error code emitted by existing `admin.ts` routes; all pass after T008-00.
    2. No test finds a `{ error: string }` response shape — any such finding is a test failure.
    3. Test file covers 100% of Art. 6.2 error shapes across existing `admin.ts` error paths.
    4. Tests are independent (no shared state between `it()` blocks).

**Phase 1 estimated: 9 tasks · 20 story points**

---

## Phase 2: Super Admin Extensions

> **Objective**: Fill remaining Super Admin Panel gaps — `SystemConfigService`, `AdminService` extensions
> (super admin CRUD + system health), 8 new routes in `admin.ts`, and tests. Requires Phase 1 complete.

---

- [ ] **T008-09** `[P]` `[L]` `[FR-005]` Implement `SystemConfigService`
  - **Type**: service · **Points**: 3
  - **File**: `apps/core-api/src/services/system-config.service.ts`
  - **Change type**: Create new file (~150 lines)
  - **Description**: Implement `SystemConfigService` with four methods per plan §4.4: **(1) `getAll(category?: string): Promise<SystemConfigEntry[]>`** — Prisma query, optionally filtered by category. **(2) `get(key: string): Promise<SystemConfigEntry>`** — single lookup; throws error with code `CONFIG_KEY_NOT_FOUND` (mapped to 404) if key is not in the table. **(3) `update(key: string, value: Json, userId: string): Promise<SystemConfigEntry>`** — Prisma upsert setting `updatedBy = userId`; throws `CONFIG_KEY_NOT_FOUND` for keys not in the table (no auto-creation of arbitrary keys); calls `auditLogService.log({ action: AUDIT_ACTIONS['settings.config_updated'], resourceId: key })`; invalidates Redis cache key `sys_config:${key}`. **(4) `isMaintenanceMode(): Promise<boolean>`** — Redis cache with 5-minute TTL (`sys_config:maintenance_mode`); falls back to Prisma `get('maintenance_mode')` on cache miss; Redis failure falls back gracefully without throwing. Export as singleton.
  - **Spec Reference**: Plan §4.4, §3.1.12–3.1.13; Spec §4 FR-005
  - **Dependencies**: T008-02 (SystemConfig Prisma model), T008-05 (AuditLogService)
  - **Acceptance Criteria**:
    1. `get('nonexistent_key')` throws error with code `CONFIG_KEY_NOT_FOUND`.
    2. `update()` persists new value, sets `updated_by`, and emits an audit log entry (verified via AuditLogService mock).
    3. `isMaintenanceMode()` returns a cached value on the second call within the TTL (Prisma called exactly once for two consecutive calls).
    4. Redis failure in `isMaintenanceMode()` falls back to Prisma (no unhandled rejection).

---

- [ ] **T008-10** `[P]` `[L]` `[FR-004]` `[FR-007]` Extend `AdminService` with super admin CRUD + `getSystemHealth()`
  - **Type**: service · **Points**: 5
  - **File**: `apps/core-api/src/services/admin.service.ts`
  - **Change type**: Modify existing
  - **Location**: End of existing `AdminService` class
  - **Description**: Add four methods to the existing class per plan §4.5. **Note from Analysis ISSUE-007**: the `SuperAdmin` Prisma model already exists in `schema.prisma` (line 213) — do NOT create a new migration. Methods: **(1) `listSuperAdmins(page, limit): Promise<SuperAdminPage>`** — paginated Prisma query. **(2) `createSuperAdmin(dto): Promise<SuperAdmin>`** — insert DB record + assign `super_admin` role in Keycloak master realm; throw `SUPER_ADMIN_EXISTS` (409) on duplicate email. **(3) `deleteSuperAdmin(id): Promise<void>`** — guard: count remaining super admins; throw `LAST_SUPER_ADMIN` (409) if count === 1 (Edge Case #8); then delete DB record + revoke Keycloak role. **(4) `getSystemHealth(): Promise<SystemHealthStatus>`** — probe database (`SELECT 1`), Redis (`PING`), Keycloak (HTTP GET `/health`), MinIO (HTTP GET health) in parallel via `Promise.allSettled`; measure latency per probe; aggregate `status: 'healthy'` if all ok, `'degraded'` if any non-critical dependency has issues; include `uptime` (`process.uptime()`), `version` (from package.json), `metrics` (memory MB, CPU %, active connections).
  - **Spec Reference**: Plan §4.5, §3.1.9–3.1.11, §3.1.14; Spec §4 FR-004, FR-007; Edge Case #8; Analysis ISSUE-007
  - **Dependencies**: T008-05 (AuditLogService for logging)
  - **Acceptance Criteria**:
    1. `createSuperAdmin()` with duplicate email throws `SUPER_ADMIN_EXISTS` (409).
    2. `deleteSuperAdmin()` when only 1 super admin exists throws `LAST_SUPER_ADMIN` (409) — Edge Case #8.
    3. `getSystemHealth()` runs all 4 dependency probes in parallel (not sequentially).
    4. No new Prisma migration is generated for `super_admins` (model already exists in schema.prisma).

---

- [ ] **T008-11** `[FR-001]` `[FR-002]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-007]` Add Super Admin extension routes to `admin.ts`
  - **Type**: api · **Points**: 5
  - **File**: `apps/core-api/src/routes/admin.ts`
  - **Change type**: Modify existing
  - **Location**: After all existing route registrations (end of plugin registration block)
  - **Description**: Add 8 new routes, all gated by existing `requireSuperAdmin` middleware. Apply `config.audit` on all mutations. All error responses in Art. 6.2 format. Routes: **(1) `GET /api/v1/admin/dashboard`** — rate 60/min; calls `analyticsService.getOverview()` + `adminService.getSystemHealth()`; response per plan §3.1.1 (`tenants`, `users`, `plugins`, `health`, `apiCalls24h: 0`). **(2) `POST /api/v1/admin/tenants/:id/reactivate`** — alias for existing `/activate` handler; returns 409 `TENANT_NOT_SUSPENDED` if not suspended; keep existing `/activate` route for backward compat. **(3) `GET /api/v1/admin/super-admins`** — calls `adminService.listSuperAdmins()`. **(4) `POST /api/v1/admin/super-admins`** — Zod `{email, name}`; calls `adminService.createSuperAdmin()`. **(5) `DELETE /api/v1/admin/super-admins/:id`** — calls `adminService.deleteSuperAdmin()`; returns 204. **(6) `GET /api/v1/admin/system-config`** — optional `?category=`; calls `systemConfigService.getAll()`. **(7) `PATCH /api/v1/admin/system-config/:key`** — Zod `{value}`; calls `systemConfigService.update()`. **(8) `GET /api/v1/admin/system-health`** — calls `adminService.getSystemHealth()`. **(9) `GET /api/v1/admin/audit-logs`** — rate 30/min; validates with `AuditLogQuerySchema` including 10K-cap `.refine()`; calls `auditLogService.query()`. Also add `config.audit` to existing mutation routes for tenant CRUD and plugin management (wires `AuditLogMiddleware` into existing routes).
  - **Spec Reference**: Plan §3.1.1–3.1.14, §4.8; Spec §8 Super Admin APIs; Analysis ISSUE-002 (10K cap)
  - **Dependencies**: T008-00 (error format), T008-06 (middleware), T008-09 (SystemConfigService), T008-10 (AdminService extensions), T008-05 (AuditLogService)
  - **Acceptance Criteria**:
    1. All 9 routes return 401 for unauthenticated requests and 403 for non-`super_admin` tokens.
    2. `GET /api/v1/admin/dashboard` response includes `tenants`, `users`, `plugins`, `health`, `apiCalls24h` fields.
    3. `GET /api/v1/admin/audit-logs?page=101&limit=100` returns 400 with code `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`.
    4. `DELETE /api/v1/admin/super-admins/:id` with only one super admin returns 409 with code `LAST_SUPER_ADMIN`.

---

- [ ] **T008-12** `[P]` `[M]` `[FR-005]` Unit tests — `SystemConfigService` (≥85% coverage)
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/unit/system-config.service.test.ts`
  - **Change type**: Create new file (~200 lines)
  - **Description**: Vitest unit tests for `SystemConfigService`. Scenarios: `getAll()` returns all 5 seed entries, `getAll('maintenance')` returns only maintenance category entries, `get('maintenance_mode')` happy path, `get('unknown')` throws `CONFIG_KEY_NOT_FOUND`, `update()` persists + calls `auditLogService.log()` + calls Redis `del()`, `isMaintenanceMode()` returns cached value on second call, `isMaintenanceMode()` fallback to DB on Redis `get()` throw. Mock Prisma and ioredis with `vi.mock`.
  - **Spec Reference**: Plan §8.1; Spec §4 FR-005
  - **Dependencies**: T008-09
  - **Acceptance Criteria**:
    1. All 7 scenarios pass.
    2. `system-config.service.ts` line coverage ≥85%.
    3. Redis fallback test: mock Redis to throw on `get()` → `isMaintenanceMode()` returns correct DB value.
    4. Cache invalidation test: verify Redis `del()` is called after `update()`.

---

- [ ] **T008-13** `[FR-001]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-007]` `[NFR-002]` Integration tests — new Super Admin endpoints
  - **Type**: test · **Points**: 3
  - **File**: `apps/core-api/src/__tests__/integration/audit-log-api.integration.test.ts`
  - **Change type**: Create new file (~300 lines)
  - **Description**: Vitest integration tests using `buildTestApp()` with real PostgreSQL and Redis (test infrastructure). Scenarios per plan §8.2: dashboard returns correct counts; super admin CRUD (create, duplicate 409, delete last 409); system config GET/PATCH + Redis cache verification; global audit log query with action/date/tenantId filters; 10K window cap returns 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` with `meta.total` still set; system health returns all 4 dependency statuses; mutation routes produce audit entries; all routes enforce 401/403. Performance: 30-day audit log query with composite index completes in < 500ms (NFR-002 smoke check).
  - **Spec Reference**: Plan §8.2; Spec §5 NFR-002, NFR-003
  - **Dependencies**: T008-11
  - **Acceptance Criteria**:
    1. All test scenarios pass with test infrastructure running.
    2. 30-day range audit log query completes in < 500ms (NFR-002 smoke check).
    3. All error responses on 4xx/5xx paths return `{ error: { code, message } }` shape.
    4. Tests are isolated — transaction rollback or explicit teardown prevents state leakage.

**Phase 2 estimated: 5 tasks · 18 story points**

---

## Phase 3: Tenant Admin Interface

> **Objective**: Build the complete Tenant Admin API from scratch — `requireTenantAdmin` middleware,
> `TenantAdminService` (all methods), `TenantAdminRoutes` (15 endpoints), route registration, and tests.
> T008-14 and T008-15 can start as soon as Phase 1 is done. T008-16 onward require T008-15.

---

- [ ] **T008-14** `[P]` `[S]` `[NFR-003]` `[NFR-004]` Add `requireTenantAdmin` middleware to `auth.ts`
  - **Type**: api · **Points**: 1
  - **File**: `apps/core-api/src/middleware/auth.ts`
  - **Change type**: Modify existing
  - **Location**: After `requireSuperAdmin` export
  - **Description**: Add one line: `export const requireTenantAdmin = requireRole('tenant_admin', 'tenant_owner', 'admin');`. This reuses the existing battle-tested `requireRole()` function — the same pattern already used in `tenant-plugins-v1.ts` line 33. Do **NOT** write a custom implementation with `request.token?.realm_access?.roles` fallback (that is dead code and diverges from the established auth pattern — Analysis ISSUE-003 and ISSUE-005). The error response (403 `AUTH_INSUFFICIENT_ROLE`) is handled internally by `requireRole()`.
  - **Spec Reference**: Plan §4.6; Analysis ISSUE-003, ISSUE-005 (MEDIUM)
  - **Dependencies**: None (parallelizable with T008-15; requires `requireRole()` to exist — confirmed)
  - **Acceptance Criteria**:
    1. `requireTenantAdmin` is exported from `middleware/auth.ts` and callable as a Fastify preHandler.
    2. Implementation is exactly `requireRole('tenant_admin', 'tenant_owner', 'admin')` — not a custom function.
    3. Request with `roles: ['tenant_admin']` passes; request with `roles: ['viewer']` receives 403 `AUTH_INSUFFICIENT_ROLE`.
    4. `pnpm build` passes without TypeScript errors.

---

- [ ] **T008-15** `[P]` `[M]` `[FR-008]` Implement `TenantAdminService.getDashboard()`
  - **Type**: service · **Points**: 2
  - **File**: `apps/core-api/src/services/tenant-admin.service.ts`
  - **Change type**: Create new file (first method; class scaffold established here)
  - **Description**: Create the `TenantAdminService` class file. Implement `getDashboard(tenantId: string, schemaName: string): Promise<TenantDashboard>` per plan §4.3 and §3.2.1. Uses `Promise.all()` to run parallel queries: user counts by status from tenant schema `users` table via parameterized raw SQL; team count from `teams`; workspace count from `workspaces`; enabled plugin count and total from `tenant_plugins` in core schema (Prisma); role counts (system vs custom) from core schema. Always use `validateSchemaName()` before interpolating `schemaName` into raw SQL. Returns `TenantDashboard` with shape: `{ users: { total, active, invited, deactivated }, teams: { total }, workspaces: { total }, plugins: { enabled, total }, roles: { system, custom } }`.
  - **Spec Reference**: Plan §4.3, §3.2.1; Spec §4 FR-008
  - **Dependencies**: T008-03 (team_members table needed for later methods), T008-05 (AuditLogService for later methods)
  - **Acceptance Criteria**:
    1. `getDashboard()` returns all required fields with correct counts from test data.
    2. Plugin counts match enabled vs total in `tenant_plugins` for the given `tenantId`.
    3. All raw SQL uses `validateSchemaName()` — no direct string interpolation of schema name.
    4. All queries execute in parallel (not sequentially via chained `await`).

---

- [ ] **T008-16** `[XL]` `[FR-009]` `[NFR-004]` Implement `TenantAdminService` — user management methods
  - **Type**: service · **Points**: 8
  - **File**: `apps/core-api/src/services/tenant-admin.service.ts`
  - **Change type**: Modify existing (add methods to class from T008-15)
  - **Description**: Implement four user management methods per plan §4.3 and §3.2.2–3.2.5: **(1) `listUsers(tenantId, schemaName, filters)`** — paginated query of tenant schema `users` table enriched with role assignments (from core `user_roles` → `roles` join) and team memberships (from `team_members` join with role); supports `search` (ILIKE on name and email), `status` filter, `role` filter. **(2) `inviteUser(tenantId, schemaName, dto: { email, roleId })`** — validate `roleId` exists in tenant; call `keycloakService.inviteUser()` which handles existing-Keycloak-user case (adds to tenant realm, no duplicate — Edge Case #4); insert user row with `status: 'invited'`; emit audit `user.invited`. **(3) `updateUser(tenantId, schemaName, userId, dto: { name?, roleIds? })`** — update name and/or role assignments; emit audit `user.role_changed` if roles changed. **(4) `deactivateUser(tenantId, schemaName, userId)`** — count users with `tenant_admin` or `tenant_owner` role; throw `LAST_TENANT_ADMIN` (409) if this user is the only one (Edge Case #7); call `keycloakService.deactivateUser()`; set `status: 'deactivated'`; emit audit `user.deactivated`.
  - **Spec Reference**: Plan §4.3, §3.2.2–3.2.5; Spec §3 US-003, §4 FR-009; Edge Cases #4, #7
  - **Dependencies**: T008-15 (class file established)
  - **Acceptance Criteria**:
    1. `deactivateUser()` throws `LAST_TENANT_ADMIN` (409) when the target user is the sole member with `tenant_admin` or `tenant_owner` role.
    2. `inviteUser()` with an email that already exists in Keycloak does not create a duplicate account — adds existing user to tenant realm.
    3. `listUsers()` with `search='jane'` returns only users whose name or email contains 'jane' (case-insensitive).
    4. All methods enforce tenant isolation (never query other tenant's schema).

---

- [ ] **T008-17** `[L]` `[FR-010]` Implement `TenantAdminService` — team CRUD + member methods
  - **Type**: service · **Points**: 5
  - **File**: `apps/core-api/src/services/tenant-admin.service.ts`
  - **Change type**: Modify existing (add methods)
  - **Description**: Implement six team management methods per plan §4.3 and §3.2.6–3.2.11: **(1) `listTeams(tenantId, schemaName, filters)`** — paginated query of `teams` table with `COUNT(tm.user_id)` aggregation from `team_members`; optional `workspace_id` filter. **(2) `createTeam(tenantId, schemaName, dto: { name, description?, workspaceId })`** — validate `workspaceId` exists in tenant (throw `WORKSPACE_NOT_FOUND` 404); insert team; emit audit `team.created`. **(3) `updateTeam(tenantId, schemaName, teamId, dto)`** — verify team belongs to tenant (throw `TEAM_NOT_FOUND` 404 if not); update; emit audit. **(4) `deleteTeam(tenantId, schemaName, teamId)`** — verify ownership; delete (cascades `team_members` via FK); emit audit. **(5) `addTeamMember(tenantId, schemaName, teamId, dto: { userId, role })`** — verify team + user in tenant; insert into `team_members`; throw `MEMBER_ALREADY_EXISTS` (409) on PK conflict; emit audit `team.member_added`. **(6) `removeTeamMember(tenantId, schemaName, teamId, userId)`** — verify row exists (throw `MEMBER_NOT_FOUND` 404); delete row; emit audit `team.member_removed`.
  - **Spec Reference**: Plan §4.3, §3.2.6–3.2.11; Spec §3 US-005, §4 FR-010
  - **Dependencies**: T008-15 (class file), T008-03 (team_members table)
  - **Acceptance Criteria**:
    1. `listTeams()` returns `memberCount` field computed from `team_members` table join.
    2. `addTeamMember()` with an already-member userId throws `MEMBER_ALREADY_EXISTS` (409).
    3. `deleteTeam()` cascades to remove all `team_members` rows (no FK constraint violation).
    4. All methods verify team belongs to current tenant (cross-tenant access returns `TEAM_NOT_FOUND`).

---

- [ ] **T008-18** `[XL]` `[FR-008]` `[FR-009]` `[FR-010]` `[FR-011]` `[FR-013]` `[FR-014]` `[NFR-003]` `[NFR-004]` Implement `TenantAdminRoutes` — all 15+ Tenant Admin endpoints
  - **Type**: api · **Points**: 8
  - **File**: `apps/core-api/src/routes/tenant-admin.ts`
  - **Change type**: Create new file (~800 lines)
  - **Description**: Implement all Tenant Admin endpoints as a Fastify plugin. Apply `authMiddleware + tenantContextMiddleware + requireTenantAdmin` to all routes (plugin-level preHandler). Apply rate limits per Analysis ISSUE-004: read endpoints 120/min, mutation endpoints 30/min, audit log 30/min. Apply `config.audit` to all mutation routes. All errors in Art. 6.2 format. **Dashboard**: `GET /tenant/dashboard` (calls `TenantAdminService.getDashboard()`). **Users (4 routes)**: `GET /tenant/users` (Zod: page, limit, search, status, role), `POST /tenant/users/invite` (Zod: `{email, roleId}`), `PATCH /tenant/users/:id` (Zod: `{name?, roleIds?}`), `POST /tenant/users/:id/deactivate`. **Teams (6 routes)**: `GET /tenant/teams` (Zod: page, limit, workspace_id), `POST /tenant/teams` (Zod: `{name, description?, workspaceId}`), `PATCH /tenant/teams/:id`, `DELETE /tenant/teams/:id` (204), `POST /tenant/teams/:id/members` (Zod: `{userId, role}`), `DELETE /tenant/teams/:id/members/:userId` (204). **Roles (4 routes)**: `GET /tenant/roles` → `roleService.listRoles()`; `POST /tenant/roles` (Zod: `{name, description?, permissionIds[]}`) → `roleService.createRole()` (throw 422 `CUSTOM_ROLE_LIMIT_EXCEEDED` at >50 custom roles); `PATCH /tenant/roles/:id` → `roleService.updateRole()` (throw 403 `SYSTEM_ROLE_IMMUTABLE` for system roles — Edge Case #2); `DELETE /tenant/roles/:id` → `roleService.deleteRole()` (throw 403 `SYSTEM_ROLE_IMMUTABLE`) (204). **Permissions**: `GET /tenant/permissions` → `permissionRegistrationService.listPermissions()` grouped by `pluginId`. **Settings (2 routes)**: `GET /tenant/settings`, `PATCH /tenant/settings` (Zod via `TenantThemeSchema` + new `TenantSettingsSchema`). **Audit log**: `GET /tenant/audit-logs` — `AuditLogQuerySchema` with 10K cap; calls `auditLogService.queryForTenant()` with `tenantId` from context (never from query params — NFR-004).
  - **Spec Reference**: Plan §3.2, §4.7; Spec §8 Tenant Admin APIs; Analysis ISSUE-004 (MEDIUM)
  - **Dependencies**: T008-14 (middleware), T008-16 (user methods), T008-17 (team methods), T008-06 (audit middleware), T008-05 (AuditLogService)
  - **Acceptance Criteria**:
    1. All 15+ routes return 401 for unauthenticated and 403 for non-`tenant_admin` tokens.
    2. `GET /tenant/audit-logs?tenant_id=other-tenant` — the `tenant_id` query param is silently ignored; results are always scoped to the requesting tenant's context ID (NFR-004).
    3. `PATCH /tenant/roles/:id` for a system role returns 403 `SYSTEM_ROLE_IMMUTABLE` (Edge Case #2).
    4. `POST /tenant/teams/:id/members` for a duplicate userId returns 409 `MEMBER_ALREADY_EXISTS`.

---

- [ ] **T008-19** `[S]` `[FR-008]` `[FR-009]` `[FR-010]` Register `tenantAdminRoutes` + `auditLogMiddleware` in `index.ts`
  - **Type**: config · **Points**: 1
  - **File**: `apps/core-api/src/index.ts`
  - **Change type**: Modify existing
  - **Location**: `registerRoutes()` function
  - **Description**: (1) Register `tenantAdminRoutes` as a Fastify plugin with prefix `/api/v1`. (2) Register `auditLogMiddleware` as a global `onResponse` hook (fires for all routes). Follow the existing pattern for other route plugins. Use `.js` extension in import paths (codebase convention per AGENTS.md).
  - **Spec Reference**: Plan §5 Files to Modify — index.ts
  - **Dependencies**: T008-06 (middleware), T008-18 (routes)
  - **Acceptance Criteria**:
    1. `pnpm build` compiles without errors after this change.
    2. `GET /api/v1/tenant/dashboard` returns 401 for unauthenticated requests (not 404 — route is registered).
    3. Audit log middleware fires for routes that have `config.audit` set.
    4. Import paths use `.js` extension (e.g., `'../routes/tenant-admin.js'`).

---

- [ ] **T008-20** `[P]` `[XL]` `[FR-008]` `[FR-009]` `[FR-010]` `[FR-011]` Unit tests — `TenantAdminService` (≥85% coverage)
  - **Type**: test · **Points**: 5
  - **File**: `apps/core-api/src/__tests__/unit/tenant-admin.service.test.ts`
  - **Change type**: Create new file (~500 lines)
  - **Description**: Vitest unit tests for `TenantAdminService`. Scenarios: `getDashboard()` returns correct counts structure, `listUsers()` applies search/status/role filters correctly, `inviteUser()` calls `keycloakService.inviteUser()`, `inviteUser()` handles existing-Keycloak-user (Edge Case #4), `deactivateUser()` throws `LAST_TENANT_ADMIN` when last admin (Edge Case #7), `deactivateUser()` succeeds when not last admin, `createTeam()` happy path, `addTeamMember()` throws `MEMBER_ALREADY_EXISTS` on PK conflict, `removeTeamMember()` happy path, all mutations call `auditLogService.log()`. Mock Prisma, raw `db`, `keycloakService`, `roleService`, `auditLogService` with `vi.mock`. Follow AAA pattern.
  - **Spec Reference**: Plan §8.1; Spec §4; Edge Cases #4, #7
  - **Dependencies**: T008-16, T008-17
  - **Acceptance Criteria**:
    1. All 10 scenarios have passing `it()` blocks.
    2. `tenant-admin.service.ts` line coverage ≥85%.
    3. `deactivateUser()` last-admin guard test explicitly verifies error code `LAST_TENANT_ADMIN`.
    4. All external services (Keycloak, RoleService, AuditLogService, Prisma, db) are mocked.

---

- [ ] **T008-21** `[FR-008]` `[FR-009]` `[FR-010]` `[FR-011]` `[FR-013]` `[FR-014]` `[NFR-004]` Integration tests — Tenant Admin endpoints + cross-tenant isolation
  - **Type**: test · **Points**: 5
  - **File**: `apps/core-api/src/__tests__/integration/tenant-admin-api.integration.test.ts`
  - **Change type**: Create new file (~600 lines)
  - **Description**: Vitest integration tests using `buildTestApp()` with real PostgreSQL and Keycloak. Scenarios: dashboard returns correct counts; invite user + existing-email case adds to tenant; last-admin deactivation guard → 409; create team → add member → add duplicate → 409; remove member; list roles with `isSystem` flag; `PATCH` system role → 403 `SYSTEM_ROLE_IMMUTABLE`; get/update settings; audit log scoped to current tenant (insert logs for tenant B, verify tenant A's endpoint returns empty). **NFR-004 cross-tenant isolation test**: tenant B admin token cannot access tenant A's data. Auth enforcement: 401/403 on all routes. Cleanup via transaction rollback.
  - **Spec Reference**: Plan §8.2; Spec §5 NFR-004; Edge Cases #4, #7
  - **Dependencies**: T008-18, T008-19
  - **Acceptance Criteria**:
    1. Cross-tenant isolation test (NFR-004): tenant B admin receives 0 audit log entries when only tenant A's logs exist.
    2. Last-admin guard integration test passes without mocks (real database state).
    3. All error responses on 4xx paths return `{ error: { code, message } }` shape.
    4. Tests are isolated via transaction rollback — no state leaks between tests.

**Phase 3 estimated: 8 tasks · 35 story points**

---

## Phase 4: E2E Tests and Hardening

> **Objective**: End-to-end tests covering critical admin workflows, audit trail verification, and all
> edge case protections documented in spec §6. Requires Phases 1–3 fully complete.
> All E2E tests live in one file with separate `describe` blocks.

---

- [ ] **T008-22** `[FR-002]` `[FR-006]` E2E — Super Admin tenant lifecycle with full audit trail
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - **Change type**: Create new file (first `describe` block)
  - **Description**: Super Admin authenticates → creates tenant → verifies in list → suspends → verifies `SUSPENDED` → reactivates via `/reactivate` → verifies `ACTIVE` → deletes → verifies `PENDING_DELETION`. After each mutation, query `GET /admin/audit-logs` and verify a matching audit entry (`tenant.created`, `tenant.suspended`, `tenant.deleted`). Reactivate of ACTIVE tenant returns 409 `TENANT_NOT_SUSPENDED`. Full test infrastructure required.
  - **Spec Reference**: Plan §8.3; Spec §3 US-001; Spec §7 Events to Audit
  - **Dependencies**: T008-11, T008-13
  - **Acceptance Criteria**:
    1. Full create→suspend→reactivate→delete lifecycle completes without errors.
    2. Audit entries exist for `tenant.created`, `tenant.suspended`, `tenant.deleted` after each step.
    3. `/reactivate` on ACTIVE tenant returns 409 `TENANT_NOT_SUSPENDED`.
    4. Test runtime < 30 seconds.

---

- [ ] **T008-23** `[FR-009]` `[FR-010]` E2E — Tenant Admin user and team lifecycle
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - **Change type**: Modify existing (add second `describe` block)
  - **Description**: Tenant Admin invites user → user appears with `status: 'invited'` → creates team → adds user to team as `MEMBER` → verifies membership → removes member → verifies removal → deactivates invited user → verifies `status: 'deactivated'`. Last-admin guard: attempt to deactivate the sole `tenant_admin` → verify 409 `LAST_TENANT_ADMIN`.
  - **Spec Reference**: Plan §8.3; Spec §3 US-003, US-005; Edge Case #7
  - **Dependencies**: T008-21
  - **Acceptance Criteria**:
    1. Full invite→add-to-team→remove-from-team→deactivate lifecycle completes.
    2. Last-admin deactivation returns 409 with code `LAST_TENANT_ADMIN`.
    3. Team membership changes reflected in `GET /tenant/teams` response.
    4. Test runtime < 30 seconds.

---

- [ ] **T008-24** `[FR-011]` E2E — Custom role creation, permission assignment, and user access
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - **Change type**: Modify existing (add third `describe` block)
  - **Description**: Fetch permissions via `GET /tenant/permissions` → create custom role "Sales Manager" with 2 permissions → verify role in `GET /tenant/roles` → update with third permission → assign role to user → verify user's roles include "Sales Manager" → attempt to update system role `tenant_admin` → verify 403 `SYSTEM_ROLE_IMMUTABLE` → delete custom role → verify deletion.
  - **Spec Reference**: Plan §8.3; Spec §3 US-004; Edge Case #2
  - **Dependencies**: T008-21
  - **Acceptance Criteria**:
    1. Full create→update→assign→delete role lifecycle completes.
    2. `PATCH` on system role returns 403 `SYSTEM_ROLE_IMMUTABLE`.
    3. Permissions endpoint response groups by `core` and plugin namespaces.
    4. Test runtime < 30 seconds.

---

- [ ] **T008-25** `[NFR-004]` `[FR-006]` `[FR-014]` E2E — Edge case guards and cross-tenant isolation
  - **Type**: test · **Points**: 2
  - **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - **Change type**: Modify existing (add fourth `describe` block)
  - **Description**: Five edge case scenarios: (1) Last super_admin guard: `DELETE /admin/super-admins/:id` with one admin → 409 `LAST_SUPER_ADMIN`. (2) Cross-tenant isolation (NFR-004): tenant B admin queries `/tenant/audit-logs` — zero entries from tenant A returned. (3) Audit log 10K cap: `GET /admin/audit-logs?page=101&limit=100` → 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`; `meta.total` field still present with true count. (4) Duplicate team member: `POST /teams/:id/members` twice → second call returns 409 `MEMBER_ALREADY_EXISTS`. (5) Config key not found: `PATCH /admin/system-config/nonexistent_key` → 404 `CONFIG_KEY_NOT_FOUND`.
  - **Spec Reference**: Plan §8.3; Spec §6 Edge Cases #6, #7, #8; Spec §5 NFR-004
  - **Dependencies**: T008-22, T008-23
  - **Acceptance Criteria**:
    1. Cross-tenant isolation test confirms zero audit log leakage between tenants (NFR-004).
    2. All 5 edge cases return exact error codes documented in the plan.
    3. 10K cap test verifies `meta.total` still reflects true count even when 400 is returned.
    4. Test runtime < 30 seconds.

---

- [ ] **T008-26** `[FR-006]` `[FR-014]` `[NFR-002]` E2E — Audit log queries: date range, action filter, tenant scope
  - **Type**: test · **Points**: 1
  - **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - **Change type**: Modify existing (add fifth `describe` block)
  - **Description**: Insert known audit entries via direct `auditLogService.log()` calls → query `GET /admin/audit-logs?action=tenant.created` → verify only matching action returned → query with `start_date`/`end_date` range → verify only in-range entries → query tenant-scoped `GET /tenant/audit-logs?action=user.invited` → verify tenant scoping. Measure query duration (NFR-002 smoke: must be < 500ms on composite index path).
  - **Spec Reference**: Plan §8.3; Spec §3 US-007; Spec §5 NFR-002
  - **Dependencies**: T008-22
  - **Acceptance Criteria**:
    1. Action-filter query returns only entries with exact matching `action` string.
    2. Date-range query returns only entries where `created_at` is within `[start_date, end_date]`.
    3. Tenant-scoped audit log returns only entries for the requesting tenant.
    4. Each query completes in < 500ms (NFR-002 smoke check on composite index).

**Phase 4 estimated: 5 tasks · 9 story points**

---

## Phase 5: Documentation

---

- [ ] **T008-27** `[P]` `[S]` Update project status documentation
  - **Type**: docs · **Points**: 1
  - **Files**: `planning/PROJECT_STATUS.md`
  - **Change type**: Modify existing
  - **Description**: Update `planning/PROJECT_STATUS.md` to reflect Spec 008 implementation status (per AGENTS.md ⭐ Project Status Update Directive): change milestone status to completed, update completion date, update phase progress percentage, update "Last Updated" date. Verify consistency with `README.md` (run `grep "Last Updated\|Version\|Current Phase\|Current Milestone" planning/PROJECT_STATUS.md README.md`).
  - **Spec Reference**: AGENTS.md §⭐ Project Status Update Directive
  - **Dependencies**: T008-26 (all implementation complete)
  - **Acceptance Criteria**:
    1. `planning/PROJECT_STATUS.md` marks Spec 008 as completed with correct date.
    2. Grep consistency check shows matching values between `PROJECT_STATUS.md` and `README.md`.
    3. No "🟡 In Progress" entries remain for Spec 008 tasks.
    4. Docs-only commit (no code changes bundled).

**Phase 5 estimated: 1 task · 1 story point**

---

## Summary

| Metric                           | Value                                          |
| -------------------------------- | ---------------------------------------------- |
| Total tasks                      | 28 (T008-00 through T008-27)                   |
| Total story points               | 77                                             |
| Total phases                     | 5                                              |
| Parallelizable tasks             | 8                                              |
| Requirements covered (FR)        | 14/14                                          |
| Requirements covered (NFR)       | 8/8 (5 backend + 3 frontend N/A)               |
| HIGH risk tasks                  | 2 (T008-00, T008-03)                           |
| Analysis issues addressed (HIGH) | 2 (ISSUE-001, ISSUE-002)                       |
| Analysis issues addressed (MED)  | 4 (ISSUE-003, ISSUE-004, ISSUE-005, ISSUE-006) |
| Estimated test count             | ~150 (95 unit + 40 int + 15 E2E)               |

### Phase Breakdown

| Phase | Name                    | Tasks  | Points | Parallelizable              |
| ----- | ----------------------- | ------ | ------ | --------------------------- |
| 1     | Foundation              | 9      | 20     | T008-01, 02, 03, 04, 07, 08 |
| 2     | Super Admin Extensions  | 5      | 18     | T008-09, 10, 12             |
| 3     | Tenant Admin Interface  | 8      | 35     | T008-14, 15, 20             |
| 4     | E2E Tests and Hardening | 5      | 9      | —                           |
| 5     | Documentation           | 1      | 1      | T008-27                     |
| —     | **Total**               | **28** | **77** |                             |

> **Split guidance**: T008-16 (8 pts, user management) and T008-18 (8 pts, routes) are the two
> largest tasks. If either stalls, split T008-16 into (getDashboard+listUsers+inviteUser) and
> (updateUser+deactivateUser) at the method boundary; split T008-18 into (dashboard+user routes),
> (team routes), and (roles+settings+audit routes) at the route group boundary.

---

## FR/NFR Coverage Matrix

| Requirement | Task IDs                                    | Status      |
| ----------- | ------------------------------------------- | ----------- |
| FR-001      | T008-11                                     | ✅          |
| FR-002      | T008-11, T008-22                            | ✅          |
| FR-003      | Existing (not in scope)                     | ✅ (exists) |
| FR-004      | T008-10, T008-11                            | ✅          |
| FR-005      | T008-02, T008-09, T008-11, T008-12          | ✅          |
| FR-006      | T008-01, T008-05, T008-11, T008-22, T008-26 | ✅          |
| FR-007      | T008-10, T008-11                            | ✅          |
| FR-008      | T008-15, T008-18                            | ✅          |
| FR-009      | T008-16, T008-18, T008-23                   | ✅          |
| FR-010      | T008-03, T008-17, T008-18, T008-23          | ✅          |
| FR-011      | T008-18, T008-24                            | ✅          |
| FR-012      | Existing `tenant-plugins-v1.ts`             | ✅ (exists) |
| FR-013      | T008-18                                     | ✅          |
| FR-014      | T008-05, T008-18, T008-21, T008-26          | ✅          |
| NFR-001     | T008-01 (indexes), T008-11 (pagination)     | ✅          |
| NFR-002     | T008-01 (composite index)                   | ✅          |
| NFR-003     | T008-11, T008-14                            | ✅          |
| NFR-004     | T008-05, T008-18, T008-21, T008-25          | ✅          |
| NFR-005     | Frontend scope — out of plan                | N/A         |
| NFR-006     | Frontend scope — out of plan                | N/A         |
| NFR-007     | Frontend scope — out of plan                | N/A         |
| NFR-008     | Existing provisioning orchestrator          | ✅ (exists) |

---

## Cross-References

| Document               | Path                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| Spec                   | `.forge/specs/008-admin-interfaces/spec.md`                                  |
| Plan                   | `.forge/specs/008-admin-interfaces/plan.md`                                  |
| Analysis               | `.forge/specs/008-admin-interfaces/analysis.md`                              |
| Constitution           | `.forge/constitution.md`                                                     |
| Decision Log           | `.forge/knowledge/decision-log.md`                                           |
| Architecture           | `.forge/architecture/architecture.md`                                        |
| Role Service           | `apps/core-api/src/modules/authorization/role.service.ts`                    |
| Permission Service     | `apps/core-api/src/modules/authorization/permission-registration.service.ts` |
| Existing Admin Routes  | `apps/core-api/src/routes/admin.ts`                                          |
| Existing Admin Service | `apps/core-api/src/services/admin.service.ts`                                |
| Schema Step            | `apps/core-api/src/services/provisioning-steps/schema-step.ts`               |
| Auth Middleware        | `apps/core-api/src/middleware/auth.ts`                                       |
| Tenant Plugins Routes  | `apps/core-api/src/routes/tenant-plugins-v1.ts`                              |
