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
| T008-39 | Admin route trees + shells                                     | frontend | 3   | 5(FE) | —                                  |
| T008-40 | AdminSidebarNav component                                      | frontend | 3   | 5(FE) | T008-39                            |
| T008-41 | Auth guard hooks + API client                                  | frontend | 2   | 5(FE) | —                                  |
| T008-42 | Design tokens                                                  | frontend | 1   | 5(FE) | —                                  |
| T008-43 | Super Admin Dashboard screen                                   | frontend | 2   | 6     | T008-39, T008-41, T008-11          |
| T008-44 | Tenant List + Detail screens                                   | frontend | 3   | 6     | T008-39, T008-41, T008-11          |
| T008-45 | Tenant Create Wizard (ProvisioningWizard)                      | frontend | 5   | 6     | T008-44, T008-11                   |
| T008-46 | Plugin List + Config screens                                   | frontend | 2   | 6     | T008-39, T008-41                   |
| T008-47 | Super Admin Users screen                                       | frontend | 2   | 6     | T008-39, T008-41, T008-11          |
| T008-48 | System Config screen                                           | frontend | 2   | 6     | T008-39, T008-41, T008-11          |
| T008-49 | Global Audit Log screen                                        | frontend | 2   | 6     | T008-39, T008-41, T008-11          |
| T008-50 | System Health screen                                           | frontend | 1   | 6     | T008-39, T008-41, T008-11          |
| T008-51 | Tenant Admin Dashboard screen                                  | frontend | 1   | 7     | T008-39, T008-41, T008-18          |
| T008-52 | User List + Invite screen                                      | frontend | 3   | 7     | T008-39, T008-41, T008-18          |
| T008-53 | Team List + Team Detail screens                                | frontend | 2   | 7     | T008-39, T008-41, T008-18          |
| T008-54 | Role Editor screen                                             | frontend | 3   | 7     | T008-39, T008-41, T008-18          |
| T008-55 | Plugin Settings screen                                         | frontend | 1   | 7     | T008-39, T008-41                   |
| T008-56 | Tenant Settings screen                                         | frontend | 2   | 7     | T008-39, T008-41, T008-18          |
| T008-57 | Tenant Audit Log screen                                        | frontend | 1   | 7     | T008-39, T008-41, T008-18, T008-58 |
| T008-58 | AuditLogTable + DestructiveConfirmModal components             | frontend | 2   | 7     | T008-39                            |
| T008-59 | Accessibility hardening                                        | frontend | 3   | 8     | T008-43–T008-57                    |
| T008-60 | Frontend unit tests — components                               | test     | 3   | 8     | T008-40, T008-44–T008-58           |
| T008-61 | Frontend unit tests — hooks                                    | test     | 2   | 8     | T008-41, T008-43–T008-57           |
| T008-62 | Playwright E2E tests — critical flows                          | test     | 3   | 8     | T008-43–T008-57                    |
| T008-63 | Playwright a11y tests (ADR-022)                                | test     | 2   | 8     | T008-59, ADR-022 Accepted          |

**Total: 53 tasks · ~112 story points**

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
  - **Description**: Add `SystemConfig` model with fields: `key` (String PK), `value` (Json, NOT NULL), `category` (String, max 50), `description` (String?), `updatedBy` (String?), `updatedAt` (DateTime, `@updatedAt`), `createdAt` (DateTime, `@default(now())`). Use `@@map("system_config")`. Add `idx_system_config_category` B-TREE index on `category`. Run migration. Seed 6 default rows using idempotent upsert in the migration SQL: `maintenance_mode` (false, maintenance), `max_tenants` (1000, limits), `max_users_per_tenant` (500, limits), `feature_flag_analytics` (true, features), `registration_enabled` (true, general), `admin_interfaces_enabled` (true, features).
  - **Spec Reference**: Plan §2.1, §2.3, §2.4 Migration 002; Spec §4 FR-005; T008-39 feature flag gate
  - **Dependencies**: None (parallelizable with T008-01, T008-03, T008-04)
  - **Acceptance Criteria**:
    1. `SystemConfig` model present with `@@map("system_config")` and all 7 listed fields.
    2. `idx_system_config_category` index exists in migration SQL.
    3. After `pnpm db:migrate`, exactly 6 seed rows exist with correct keys, values, and categories — including `admin_interfaces_enabled` (true, features), which is required by the T008-39 frontend feature flag gate.
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
    5. **FR-012 plugin enable/disable integration test** (resolves Analysis LOW ISSUE-007): `POST /api/v1/tenant/plugins/:id/enable` and `POST /api/v1/tenant/plugins/:id/disable` return 200 with updated plugin status; subsequent `GET /api/v1/tenant/plugins` reflects the change; unauthorized token returns 403.

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

**Phase 5 (Documentation) estimated: 1 task · 1 story point**

---

## Phase 5 (Frontend): Frontend Foundation

> **Objective**: Set up the two admin portal shells with routing, sidebar navigation, auth guards, design
> tokens, and skeleton loading — providing the scaffold for all screen implementations in Phases 6–7.
> Phase 5 (FE) can run **in parallel** with backend Phases 2–3 since it only sets up shells, routes,
> tokens, and shared components. No backend APIs are required until Phases 6–7.

---

- [ ] **T008-39** `[⚠ HIGH]` `[L]` `[FR-001]` `[FR-008]` Admin route trees + shells
  - **FR/NFR**: FR-001 (Super Admin Portal), FR-008 (Tenant Admin Portal), NFR-005 (WCAG skip-nav)
  - **Type**: frontend · **Points**: 3
  - **Files**:
    - `apps/frontend/src/routes/super-admin/_layout.tsx` (create new, ~120 lines)
    - `apps/frontend/src/routes/super-admin/index.tsx` (create new, ~20 lines)
    - `apps/frontend/src/routes/admin/_layout.tsx` (create new, ~120 lines)
    - `apps/frontend/src/routes/admin/index.tsx` (create new, ~20 lines)
    - `apps/frontend/src/router.tsx` (modify existing — register route trees)
  - **Change type**: Create new files + Modify existing
  - **Description**: Create the two admin portal layout shells and register their route trees in TanStack Router. **(A) `super-admin/_layout.tsx`**: header bar using `--admin-header-bg` token, hamburger toggle visible at ≤768px, `<AdminSidebarNav>` with Super Admin `navItems` prop (Dashboard, Tenants, Plugins, Users, System Config, Audit Log, Health), `<Outlet>` for child routes, `<Suspense fallback={<AdminSkeleton />}>` wrapper around outlet. **(B) `super-admin/index.tsx`**: redirect to `/super-admin/dashboard` or dashboard placeholder. **(C) `admin/_layout.tsx`**: same shell pattern with Tenant Admin `navItems` (Dashboard, Users, Teams, Roles, Plugin Settings, Settings, Audit Log). **(D) `admin/index.tsx`**: redirect to `/admin/dashboard`. **(E) `router.tsx`**: register `/super-admin/*` and `/admin/*` lazy route trees. Both shells call `useRequireSuperAdmin()` / `useRequireTenantAdmin()` respectively at the layout level. **Feature flag gate**: both layout files check `admin_interfaces_enabled` feature flag from `SystemConfig` (resolved via context or API call); redirect to `/` with error toast if flag is `false`. Responsive: sidebar permanently visible ≥1024px, collapses to hamburger overlay at ≤768px. Sidebar state stored in `localStorage` for persistence.
  - **Spec Reference**: Plan §12 Phase 5; design-spec §2 (portal navigation); Analysis MEDIUM ISSUE-005 (feature flag gate)
  - **Dependencies**: None (can start in parallel with backend Phases 2–3; T008-40 for AdminSidebarNav component, T008-41 for auth hooks)
  - **Acceptance Criteria**:
    1. Navigating to `/super-admin/*` without `super_admin` role redirects to `/` — layout enforces auth guard via `useRequireSuperAdmin()`.
    2. Navigating to `/super-admin/*` when `admin_interfaces_enabled = false` in SystemConfig redirects to `/` and shows an error toast — feature flag gate is enforced at layout level (resolves Analysis MEDIUM ISSUE-005).
    3. At 1024px and above, `AdminSidebarNav` is permanently visible; at 768px and below, a hamburger button toggles the overlay sidebar, and pressing `Escape` or clicking outside closes it.
    4. `pnpm build` compiles both layout files and the updated router config without TypeScript errors.

---

- [ ] **T008-40** `[P]` `[L]` `[NFR-005]` `[NFR-006]` AdminSidebarNav component
  - **FR/NFR**: NFR-005 (WCAG 2.1 AA), NFR-006 (keyboard navigation), NFR-007 (screen reader)
  - **Type**: frontend · **Points**: 3
  - **Files**:
    - `apps/frontend/src/components/admin/AdminSidebarNav.tsx` (create new, ~250 lines)
    - `apps/frontend/src/components/admin/AdminSidebarNav.test.tsx` (create new, ~150 lines)
    - `apps/frontend/src/components/admin/index.ts` (create new, ~15 lines)
  - **Change type**: Create new files
  - **Description**: Implement the `AdminSidebarNav` React component. **Props**: `navItems: { label: string; icon: LucideIcon; path: string; badge?: number }[]`, `collapsed: boolean`, `onToggle: () => void`, `portalLabel: string` (for `aria-label`). **Rendering**: `<nav aria-label={portalLabel}>` wrapping a `<ul>` of `<li>` items. Each item renders a `<NavLink>` from TanStack Router; active item gets left border using `--admin-nav-active-border` CSS token and `aria-current="page"`. If `badge` is set, render a `<span aria-label="{badge} notifications">` badge. **Skip-nav**: render a visually-hidden-until-focus `<a href="#main-content">Skip to main content</a>` at the very top of every admin shell (inside the layout, before the nav). **Mobile overlay**: when `collapsed=false` and viewport ≤768px, render a `<div role="dialog" aria-modal="true" aria-label="Navigation menu">` overlay with a semi-transparent backdrop (`--overlay-backdrop` token). Pressing `Escape` calls `onToggle`; clicking backdrop calls `onToggle`. **Keyboard navigation**: `ArrowDown` / `ArrowUp` moves focus between nav items; `Home` / `End` jump to first/last; `Enter` / `Space` activate. Use `roving tabindex` pattern (only active/focused item has `tabIndex=0`). **Unit tests** (`AdminSidebarNav.test.tsx`): render with navItems, verify active item has `aria-current="page"`, collapse toggle fires `onToggle`, keyboard nav (ArrowDown moves focus), mobile overlay renders when `collapsed=false`, `Escape` closes overlay, skip-nav link present in DOM. All tests use React Testing Library + Vitest.
  - **Spec Reference**: Plan §12 Phase 5 T008-40; design-spec §3 AdminSidebarNav; design-spec §6 WCAG checklist
  - **Dependencies**: None (parallelizable with T008-39, T008-41, T008-42)
  - **Acceptance Criteria**:
    1. `<nav aria-label="...">` wraps all items; active `NavLink` has `aria-current="page"` and left-border style using `--admin-nav-active-border` token.
    2. `ArrowDown` moves DOM focus to the next nav item (verified by RTL `userEvent.keyboard('{ArrowDown}')` assertion on `document.activeElement`).
    3. Mobile overlay renders as `role="dialog" aria-modal="true"`; `Escape` key fires `onToggle` callback; clicking backdrop fires `onToggle`.
    4. All 6 unit test scenarios pass; `AdminSidebarNav.tsx` line coverage ≥85% per `pnpm test:unit`.

---

- [ ] **T008-41** `[P]` `[M]` `[NFR-003]` Auth guard hooks + API client
  - **FR/NFR**: NFR-003 (authentication enforcement), NFR-004 (tenant isolation)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/hooks/admin/useAdminAuth.ts` (create new, ~60 lines)
    - `apps/frontend/src/api/admin.ts` (create new, ~300 lines)
  - **Change type**: Create new files
  - **Description**: **(A) `useAdminAuth.ts`**: Implement two React hooks. `useRequireSuperAdmin()`: reads user roles from the app's existing auth context (e.g., `useAuth()` / `useUser()`); if user does not have `super_admin` role, calls TanStack Router's `navigate({ to: '/' })` and returns `null`; otherwise returns the current user. `useRequireTenantAdmin()`: same pattern, checks for `tenant_admin` or `tenant_owner` or `admin` role; redirects to tenant home page if role is absent. Both hooks are idempotent on re-render. **(B) `api/admin.ts`**: typed API client functions for all 19+ backend endpoints. Each function accepts typed parameters, injects the Bearer token from the auth context (via shared `apiClient` or direct `fetch` with Authorization header), and returns a typed response. Functions to implement: `getSuperAdminDashboard()`, `getTenants(params)`, `getTenant(id)`, `createTenant(dto)`, `updateTenant(id, dto)`, `suspendTenant(id)`, `reactivateTenant(id)`, `deleteTenant(id)`, `getSuperAdmins(params)`, `createSuperAdmin(dto)`, `deleteSuperAdmin(id)`, `getSystemConfig(category?)`, `updateSystemConfig(key, value)`, `getSystemHealth()`, `getAdminAuditLogs(params)`, `getTenantAdminDashboard()`, `getUsers(params)`, `inviteUser(dto)`, `updateUser(id, dto)`, `deactivateUser(id)`, `getTeams(params)`, `createTeam(dto)`, `updateTeam(id, dto)`, `deleteTeam(id)`, `addTeamMember(teamId, dto)`, `removeTeamMember(teamId, userId)`, `getRoles()`, `createRole(dto)`, `updateRole(id, dto)`, `deleteRole(id)`, `getPermissions()`, `getTenantSettings()`, `updateTenantSettings(dto)`, `getTenantAuditLogs(params)`. All functions are typed with TypeScript interfaces matching the backend response schemas. Network errors are re-thrown as typed `ApiError` objects with `code` and `message`.
  - **Spec Reference**: Plan §12 Phase 5 T008-41; design-spec §4 (auth guard pattern)
  - **Dependencies**: None (parallelizable with T008-39, T008-40, T008-42)
  - **Acceptance Criteria**:
    1. `useRequireSuperAdmin()` called in a component without `super_admin` role triggers `navigate({ to: '/' })` (verified by RTL test with mocked auth context).
    2. `useRequireTenantAdmin()` allows `tenant_admin`, `tenant_owner`, and `admin` roles; rejects `viewer` with redirect.
    3. `api/admin.ts` exports typed functions for all 33+ backend endpoints; TypeScript compilation succeeds with no implicit `any`.
    4. Each API function injects `Authorization: Bearer <token>` header from the auth context (verified by MSW handler assertions in unit tests for T008-61).

---

- [ ] **T008-42** `[P]` `[S]` Design tokens
  - **FR/NFR**: NFR-005 (design consistency), NFR-006 (theme tokens)
  - **Type**: frontend · **Points**: 1
  - **File**: `apps/frontend/src/styles/tokens.css` (modify existing)
  - **Change type**: Modify existing
  - **Location**: After existing token definitions, in a `/* === Spec 008: Admin Interface tokens === */` block
  - **Description**: Add 8 new CSS custom property tokens to `tokens.css` with both light-mode (`:root`) and dark-mode (`[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`) values, matching the existing token file's structure and naming convention. Tokens to add: `--admin-header-bg: #FAFAFA` / dark `#111111`; `--admin-nav-active-border: #0066CC` / dark `#3B82F6`; `--wizard-step-complete: #16A34A` / dark `#22C55E`; `--wizard-step-active: #0066CC` / dark `#3B82F6`; `--wizard-step-pending: #D4D4D8` / dark `#3F3F46`; `--wizard-step-error: #DC2626` / dark `#EF4444`; `--provisioning-bar-bg: #E5E7EB` / dark `#374151`; `--provisioning-bar-fill: #0066CC` / dark `#3B82F6`. All values must satisfy WCAG 2.1 AA contrast ratio (≥4.5:1 for text, ≥3:1 for UI components) — verify with a contrast checker before submitting.
  - **Spec Reference**: Plan §12 Phase 5 T008-42; design-spec §5 (Design Tokens table)
  - **Dependencies**: None (parallelizable with T008-39, T008-40, T008-41)
  - **Acceptance Criteria**:
    1. Exactly 8 new token entries appear in `tokens.css` under the Spec 008 comment block.
    2. Every token has both a light value (in `:root`) and a dark value, matching the exact hex values specified above.
    3. `--admin-nav-active-border` (`#0066CC` on `#FAFAFA` background) achieves ≥4.5:1 contrast ratio (WCAG 2.1 AA for normal text) — verified by automated contrast check or documented manual check.
    4. `pnpm build` compiles without errors; no existing token overridden or removed.

**Phase 5 (Frontend Foundation) estimated: 4 tasks · 9 story points**

---

## Phase 6: Super Admin Panel Screens

> **Objective**: Implement all 10 Super Admin screens from design-spec §2 (Screens 1–10), wiring them
> to the backend APIs completed in Phases 1–2. All screens live under the `/super-admin/*` route tree
> scaffolded in Phase 5.
>
> **Depends on**: Phase 5 (FE) for shells and components; Phases 1–2 (backend) for API endpoints.

---

- [ ] **T008-43** `[P]` `[M]` `[FR-001]` Super Admin Dashboard screen
  - **FR/NFR**: FR-001 (Super Admin Portal — dashboard), NFR-001 (performance), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/super-admin/index.tsx` (modify — overwrite placeholder, ~150 lines)
    - `apps/frontend/src/hooks/admin/useSuperAdminDashboard.ts` (create new, ~40 lines)
    - `apps/frontend/src/hooks/admin/useSystemHealth.ts` (create new, ~50 lines)
    - `apps/frontend/src/components/admin/SystemHealthCard.tsx` (create new, ~120 lines)
    - `apps/frontend/src/components/admin/SystemHealthCard.test.tsx` (create new, ~100 lines)
  - **Change type**: Modify existing + Create new files
  - **Description**: Implement Screen 1 (Super Admin Dashboard) per design-spec §2.1. **Screen layout**: 4 metric cards (Total Tenants, Total Users, Active Plugins, API Calls 24h) in a horizontal row at ≥1024px, 2×2 grid at 768px; each card shows a number, label, and trend indicator. Below: `SystemHealthCard` (compact variant) showing overall system status. **`useSuperAdminDashboard()` hook**: `useQuery` calling `getSuperAdminDashboard()` from `api/admin.ts`; returns `{ tenants, users, plugins, health, apiCalls24h }`; `staleTime: 30_000`. **`useSystemHealth()` hook**: `useQuery` with `refetchInterval: 30_000` calling `getSystemHealth()`; returns per-dependency statuses. **`SystemHealthCard` component**: two variants via `variant: 'compact' | 'detailed'` prop. Compact variant: single status badge (`healthy`/`degraded`/`unhealthy`) + timestamp. Detailed variant (used in T008-50): per-dependency rows with latency. A11y: `aria-live="polite"` container wrapping the health card so screen readers announce status changes. **Loading state**: skeleton cards (4 metric skeletons + 1 health skeleton). **Error state**: error banner with retry button and error message from API response. **Unit tests** (`SystemHealthCard.test.tsx`): compact variant renders badge, detailed variant renders all 4 dependencies, unhealthy state applies error styles, `aria-live="polite"` present.
  - **Spec Reference**: Plan §12 Phase 6 T008-43; design-spec §2.1; Spec §4 FR-001
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-11 (backend dashboard endpoint)
  - **Acceptance Criteria**:
    1. Dashboard renders 4 metric cards and the compact SystemHealthCard using data from `GET /api/v1/admin/dashboard`.
    2. `useSystemHealth()` auto-refetches every 30 seconds (verified by advancing fake timers in unit test).
    3. Loading state shows skeleton cards; error state shows error banner with retry button that calls `refetch()`.
    4. SystemHealthCard `aria-live="polite"` container is present in the DOM (verified by RTL `getByRole` or `axe` scan).

---

- [ ] **T008-44** `[P]` `[L]` `[FR-002]` Tenant List + Detail screens
  - **FR/NFR**: FR-002 (tenant CRUD), NFR-001 (pagination), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 3
  - **Files**:
    - `apps/frontend/src/routes/super-admin/tenants/index.tsx` (create new, ~200 lines)
    - `apps/frontend/src/routes/super-admin/tenants/$tenantId.tsx` (create new, ~200 lines)
    - `apps/frontend/src/hooks/admin/useTenants.ts` (create new, ~120 lines)
    - `apps/frontend/src/components/admin/TenantStatusBadge.tsx` (create new, ~60 lines)
    - `apps/frontend/src/components/admin/TenantStatusBadge.test.tsx` (create new, ~80 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screens 2 (Tenant List) and 4 (Tenant Detail/Edit) per design-spec §2.2–2.4. **`TenantStatusBadge` component**: renders a colored badge for 5 tenant statuses: `ACTIVE` (green), `SUSPENDED` (amber), `PROVISIONING` (blue with spinner), `PENDING_DELETION` (red), `DELETED` (grey). Each variant uses the correct Tailwind token color. A11y: `role="status"` + `aria-label="Tenant status: {status}"`. **`useTenants()` hook**: `useQuery` for list (with `page`, `limit`, `search`, `status` query params, `staleTime: 60_000`); `useMutation` hooks for `createTenant` (with `onSuccess` cache invalidation), `updateTenant`, `suspendTenant`, `reactivateTenant`, `deleteTenant`. **Tenant List screen (`index.tsx`)**: `DataTable` component with columns (Name, Slug, Status badge, Created At, Actions); search input debounced 300ms; status filter dropdown (All / Active / Suspended / Provisioning); pagination (`<nav aria-label="Tenant list pagination">`); row action `⋮` dropdown with Edit (navigate to `$tenantId`), Suspend (calls `suspendTenant` mutation + toast), Reactivate (calls `reactivateTenant` mutation), Delete (opens `DestructiveConfirmModal` typed-confirm requiring tenant slug); empty state: illustration + "No tenants found" message with "Create Tenant" button. **Tenant Detail screen (`$tenantId.tsx`)**: edit form with React Hook Form + Zod validation; fields: tenant name, theme preview, max users; Save button calls `updateTenant` mutation; Breadcrumb: Super Admin > Tenants > {tenantName}. **Unit tests** (`TenantStatusBadge.test.tsx`): render each of 5 status variants, verify correct class/color and `aria-label`.
  - **Spec Reference**: Plan §12 Phase 6 T008-44; design-spec §2.2–2.4; Spec §4 FR-002
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-11 (backend tenant endpoints)
  - **Acceptance Criteria**:
    1. Tenant List DataTable renders with search, status filter, pagination, and row action dropdown; filtering by status calls API with correct `status` query param.
    2. `TenantStatusBadge` renders all 5 status variants with correct visual styling and `aria-label="Tenant status: {status}"`.
    3. Delete row action opens `DestructiveConfirmModal` requiring the tenant slug to be typed; confirming calls `deleteTenant` mutation and invalidates the tenant list cache.
    4. Tenant Detail edit form validates with Zod; submitting calls `updateTenant` and shows a success toast.

---

- [ ] **T008-45** `[⚠ HIGH]` `[XL]` `[FR-002]` `[NFR-008]` Tenant Create Wizard (ProvisioningWizard)
  - **FR/NFR**: FR-002 (tenant creation), NFR-008 (provisioning orchestrator), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 5
  - **Files**:
    - `apps/frontend/src/routes/super-admin/tenants/new.tsx` (create new, ~350 lines)
    - `apps/frontend/src/components/admin/ProvisioningWizard.tsx` (create new, ~400 lines)
    - `apps/frontend/src/components/admin/ProvisioningWizard.test.tsx` (create new, ~250 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screen 3 (Tenant Create Wizard) per design-spec §2.3, following ADR-016 (wizard state pattern). **State management**: `useReducer` with a `WizardState` type (`{ step: 1|2|3; formData: Step1Data & Step2Data; provisioningStatus: ProvisioningStatus | null; error: string | null }`); each step uses its own `useForm` instance (React Hook Form + Zod). **`sessionStorage` persistence**: serialize `WizardState` to `sessionStorage` on every dispatch; rehydrate on mount (survives accidental page refresh, per ADR-016). **Step 1 — Details**: fields: tenant name (required), slug (auto-generated from name via slugify, editable), admin email (required, valid email). Slug uniqueness check on blur: calls `GET /api/v1/admin/tenants?slug={slug}` (or dedicated check endpoint); shows inline error "Slug already taken" if conflict (Edge Case #1). "Next" advances to Step 2. **Step 2 — Configure**: theme primary color picker, initial plugin checkboxes (from `usePlugins()` list), max users number input. "Back" returns to Step 1 (form values preserved). "Create Tenant" submits to `POST /api/v1/admin/tenants` → on success, advances to Step 3. **Step 3 — Provisioning**: connects `EventSource` to `GET /api/v1/notifications/stream` (ADR-023 SSE endpoint); listens for `provisioning:{tenantId}` events; renders animated progress bar (`--provisioning-bar-bg`/`--provisioning-bar-fill` tokens) with step labels ("Creating schema…", "Running migrations…", "Seeding data…", "Activating tenant…"). **SSE resilience** (resolves Analysis MEDIUM ISSUE-004): implement `onerror` handler that sets `EventSource` to null and starts a 30-second polling fallback (`GET /api/v1/admin/tenants/{id}` every 5s, max 6 attempts) to check provisioning status; re-subscribe to SSE if `Last-Event-ID` replay is available. **Step indicators**: use `--wizard-step-complete`, `--wizard-step-active`, `--wizard-step-pending`, `--wizard-step-error` tokens; completed steps show a checkmark icon; error steps show an X icon. **A11y**: `role="progressbar"` on progress bar with `aria-valuenow="{pct}"` and `aria-valuemin="0"` and `aria-valuemax="100"`; step labels use `aria-label`; progress updates announced via `aria-live="polite"` region. **Success**: show "Tenant created!" heading with `[View Tenant]` (navigate to `$tenantId`) and `[Create Another]` (reset wizard) buttons. **Failure**: error message card + `[Retry]` button (re-POSTs with same form data); server handles idempotency. **Unit tests** (`ProvisioningWizard.test.tsx`): step navigation (Next/Back), Step 1 Zod validation errors, slug uniqueness inline error, SSE progress renders correctly (mock `EventSource`), SSE `onerror` triggers polling fallback (mock failed EventSource), error state renders retry button, success state renders action buttons, `sessionStorage` rehydration on mount.
  - **Spec Reference**: Plan §12 Phase 6 T008-45; design-spec §2.3; ADR-016; ADR-023; Spec §4 FR-002, NFR-008; Analysis MEDIUM ISSUE-004
  - **Dependencies**: T008-44 (TenantStatusBadge, useTenants hook), T008-11 (backend create endpoint), T008-42 (wizard tokens)
  - **Acceptance Criteria**:
    1. Step 1 slug uniqueness check on blur shows inline error when slug already exists; form does not advance to Step 2 while error is active (Edge Case #1).
    2. Step 3 `EventSource` `onerror` handler fires within 1 second of a simulated connection drop; polling fallback starts at 5-second intervals (mock verified by advancing fake timers in unit test — resolves Analysis MEDIUM ISSUE-004).
    3. `role="progressbar"` has `aria-valuenow` updated as provisioning steps complete; `aria-live="polite"` region announces each step completion.
    4. Refreshing the browser on Step 2 (with `sessionStorage` data present) rehydrates the wizard at Step 2 with all previously entered values intact (per ADR-016).

---

- [ ] **T008-46** `[P]` `[M]` `[FR-003]` Plugin List + Config screens
  - **FR/NFR**: FR-003 (plugin management from Super Admin)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/super-admin/plugins/index.tsx` (create new, ~150 lines)
    - `apps/frontend/src/routes/super-admin/plugins/$pluginId/config.tsx` (create new, ~150 lines)
    - `apps/frontend/src/hooks/admin/usePlugins.ts` (create new, ~60 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screens 5 (Plugin List) and 6 (Plugin Config) per design-spec §2.5–2.6. **Plugin List (`index.tsx`)**: grid or list view of all registered plugins; each card shows plugin name, version, status badge (`INSTALLED`/`ACTIVE`/`DISABLED`/`UNINSTALLED`), description; action buttons per card: Configure (navigate to config page), Enable/Disable toggle (calls existing plugin management endpoints). Search input for filtering by name. **Plugin Config (`$pluginId/config.tsx`)**: form rendered from plugin's config schema (fetched from `GET /api/v1/plugins/:id` or equivalent); React Hook Form with Zod validation; Save calls `PATCH /api/v1/admin/plugins/:id/config`; Cancel navigates back to list. **`usePlugins()` hook**: `useQuery` for list; `useMutation` for enable, disable, config update; cache invalidation on mutation. Loading skeletons and error states per spec pattern.
  - **Spec Reference**: Plan §12 Phase 6 T008-46; design-spec §2.5–2.6; Spec §4 FR-003
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client)
  - **Acceptance Criteria**:
    1. Plugin List renders all plugins from the API with correct status badges and action buttons.
    2. Enable/Disable toggle calls the correct endpoint and invalidates the plugin list cache on success.
    3. Plugin Config form renders fields from the plugin schema; Save calls the config update endpoint and shows a success toast.
    4. `pnpm build` compiles without TypeScript errors; all imports use `.js` extension (codebase convention).

---

- [ ] **T008-47** `[P]` `[M]` `[FR-004]` Super Admin Users screen
  - **FR/NFR**: FR-004 (super admin user management)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/super-admin/users/index.tsx` (create new, ~150 lines)
  - **Change type**: Create new file
  - **Description**: Implement Screen 7 (Super Admin Users) per design-spec §2.7. **Screen layout**: DataTable of super admin accounts with columns (Name, Email, Created At, Actions). **Add Super Admin** button opens an `<Dialog>` modal with email and name fields (React Hook Form + Zod: email required/valid, name required); submit calls `createSuperAdmin` mutation from `useSuperAdmins()` inline hook (TanStack Query wrapping `createSuperAdmin()` from `api/admin.ts`); success: closes modal + toast "Super admin added"; duplicate email: inline error "An account with this email already exists". **Remove action**: `⋮` dropdown per row → "Remove" opens `DestructiveConfirmModal` (simple-confirm variant); **Edge Case #8 guard**: if `superAdmins.length <= 1`, the Remove button is disabled with a tooltip "Cannot remove the last super admin"; disabled button has `aria-disabled="true"` and `title="Cannot remove the last super admin"`. Error handling: if `deleteSuperAdmin` returns 409 `LAST_SUPER_ADMIN`, show inline error message in the confirmation modal.
  - **Spec Reference**: Plan §12 Phase 6 T008-47; design-spec §2.7; Spec §4 FR-004; Spec §6 Edge Case #8
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-11 (backend super admin endpoints)
  - **Acceptance Criteria**:
    1. DataTable renders super admins from `GET /api/v1/admin/super-admins`; Add button opens modal.
    2. Modal Zod validation shows inline errors for invalid email or empty name; valid submission calls `createSuperAdmin` and invalidates cache.
    3. Remove button is `aria-disabled="true"` when only 1 super admin exists; tooltip "Cannot remove the last super admin" is present (Edge Case #8).
    4. If `deleteSuperAdmin` API returns 409, the DestructiveConfirmModal shows the error inline rather than closing.

---

- [ ] **T008-48** `[P]` `[M]` `[FR-005]` System Config screen
  - **FR/NFR**: FR-005 (system configuration management), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/super-admin/system-config/index.tsx` (create new, ~150 lines)
    - `apps/frontend/src/hooks/admin/useSystemConfig.ts` (create new, ~50 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screen 8 (System Config) per design-spec §2.8. **Screen layout**: settings form grouped by category using `<fieldset>` + `<legend>` for each group (General, Limits, Features, Maintenance). **`useSystemConfig()` hook**: `useQuery` calling `getSystemConfig()` (no category filter); `useMutation` for `updateSystemConfig(key, value)` with per-key optimistic update and toast on success/failure. **Field rendering per config entry**: `boolean` values → `Switch` component with `role="switch"` and `aria-checked={value}`; `number` values → `Input type="number"` with min/max constraints; `string` values → `Input type="text"`. Each field shows its `description` from the API as `<p aria-describedby>` hint text. **Maintenance mode special handling**: `maintenance_mode` boolean toggle opens `DestructiveConfirmModal` (typed-confirm: user must type `"MAINTENANCE"` to confirm); on confirmation, calls `updateSystemConfig('maintenance_mode', true)` + toast "Maintenance mode enabled". **Feature flag toggles** (`feature_flag_*` keys): render as `Switch` components; label reads the key name in human-readable form (e.g., `feature_flag_analytics` → "Analytics"). Form submit button is disabled when no changes made (track dirty state).
  - **Spec Reference**: Plan §12 Phase 6 T008-48; design-spec §2.8; Spec §4 FR-005
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-11 (backend system-config endpoints)
  - **Acceptance Criteria**:
    1. All 5 seed config entries render in their correct category groups with correct input type (switch for booleans, number input for limits).
    2. Feature flag `Switch` components have `role="switch"` and `aria-checked` attribute reflecting current value.
    3. Maintenance mode toggle opens `DestructiveConfirmModal` requiring `"MAINTENANCE"` to be typed; confirming calls `updateSystemConfig('maintenance_mode', true)`.
    4. `useSystemConfig()` update mutation invalidates the cache; optimistic update reflects new value immediately before API response.

---

- [ ] **T008-49** `[P]` `[M]` `[FR-006]` `[NFR-002]` Global Audit Log screen
  - **FR/NFR**: FR-006 (global audit log), NFR-002 (query performance), US-007 (audit log browsing)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/super-admin/audit-logs/index.tsx` (create new, ~200 lines)
    - `apps/frontend/src/hooks/admin/useAuditLogs.ts` (create new, ~60 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screen 9 (Global Audit Log) per design-spec §2.9. **Screen layout**: filter bar at top (date range picker, action filter multi-select dropdown, user ID text input, tenant ID text input); `AuditLogTable` component below (from T008-58); pagination. **`useAuditLogs()` hook**: `useQuery` with `keepPreviousData: true` to avoid flash between pages; accepts params `{ page, limit, action?, userId?, tenantId?, startDate?, endDate? }`; calls `getAdminAuditLogs(params)` from API client; returns `{ data, meta: { total, page, limit } }`. **10K window cap UX**: when `meta.total > 10_000`, render a dismissible info banner: "Showing first 10,000 results. Narrow the results using the date range or action filters." Banner uses `role="alert"` (non-intrusive announcement). **Pagination**: `<nav aria-label="Audit log pagination">` with first/prev/next/last controls; current page shown as `aria-current="page"`. **Filter application**: filters are applied via URL search params (TanStack Router's `useSearch`/`useNavigate`) so filters are shareable via URL. **Loading state**: skeleton table rows while fetching.
  - **Spec Reference**: Plan §12 Phase 6 T008-49; design-spec §2.9; Spec §4 FR-006; Spec §3 US-007
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-58 (AuditLogTable component), T008-11 (backend audit log endpoint)
  - **Acceptance Criteria**:
    1. Filter bar changes are reflected in URL search params; sharing the URL pre-populates filters (URL-based filter state).
    2. When API returns `meta.total > 10_000`, the 10K cap banner with `role="alert"` appears; banner can be dismissed.
    3. `AuditLogTable` renders with correct column data from API response; pagination nav has `aria-label="Audit log pagination"`.
    4. `useAuditLogs()` uses `keepPreviousData: true` so old data remains visible while next page loads (no blank flash between pages).

---

- [ ] **T008-50** `[P]` `[S]` `[FR-007]` System Health screen
  - **FR/NFR**: FR-007 (system health monitoring), NFR-001 (real-time updates)
  - **Type**: frontend · **Points**: 1
  - **Files**:
    - `apps/frontend/src/routes/super-admin/health/index.tsx` (create new, ~120 lines)
  - **Change type**: Create new file
  - **Description**: Implement Screen 10 (System Health) per design-spec §2.10. **Screen layout**: page heading "System Health", manual Refresh button (`aria-label="Refresh health check"`), last-updated timestamp (`<time datetime="...">` element), grid of 4 `SystemHealthCard` components (detailed variant) — one each for PostgreSQL, Redis, Keycloak, MinIO. Each detailed card shows: dependency name, status badge (`healthy`/`degraded`/`unhealthy`), latency in ms, uptime, and any error message on failure. Below cards: overall system status summary card showing `status`, `uptime`, and `version` from the health API. **Auto-refresh**: `useSystemHealth()` with `refetchInterval: 30_000`; a countdown indicator shows "Next refresh in N seconds". **A11y**: `aria-live="polite"` container wrapping the status grid so screen readers announce status changes automatically; Refresh button resets countdown.
  - **Spec Reference**: Plan §12 Phase 6 T008-50; design-spec §2.10; Spec §4 FR-007
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-43 (SystemHealthCard component, useSystemHealth hook), T008-11 (backend health endpoint)
  - **Acceptance Criteria**:
    1. All 4 dependency cards render using `SystemHealthCard` (detailed variant) with correct data from `GET /api/v1/admin/system-health`.
    2. `useSystemHealth()` polling fires every 30 seconds (verified by advancing fake timers; `refetch` called after 30s).
    3. Refresh button calls `refetch()` immediately and resets the countdown; button has `aria-label="Refresh health check"`.
    4. `aria-live="polite"` container is present; status changes are announced to screen readers.

**Phase 6 (Super Admin Panel Screens) estimated: 8 tasks · 19 story points**

---

## Phase 7: Tenant Admin Interface Screens

> **Objective**: Implement all 9 Tenant Admin screens from design-spec §2 (Screens 11–19), wiring them
> to the Tenant Admin API from Phase 3. Also implements the two shared components (AuditLogTable,
> DestructiveConfirmModal) used by both portals.
>
> **Depends on**: Phase 5 (FE) for shells; Phase 3 (backend) for Tenant Admin API endpoints.

---

- [ ] **T008-51** `[P]` `[S]` `[FR-008]` Tenant Admin Dashboard screen
  - **FR/NFR**: FR-008 (Tenant Admin Portal — dashboard)
  - **Type**: frontend · **Points**: 1
  - **Files**:
    - `apps/frontend/src/routes/admin/index.tsx` (modify — overwrite placeholder, ~120 lines)
    - `apps/frontend/src/hooks/admin/useTenantAdminDashboard.ts` (create new, ~40 lines)
  - **Change type**: Modify existing + Create new file
  - **Description**: Implement Screen 11 (Tenant Admin Dashboard) per design-spec §2.11. **Screen layout**: 5 metric cards (Total Users, Teams, Workspaces, Enabled Plugins, Custom Roles) in a horizontal row at ≥1024px, 2×2 grid at 768px, vertical stack at ≤375px. Each card shows a number, label, and a subtle icon (Lucide). **`useTenantAdminDashboard()` hook**: `useQuery` calling `getTenantAdminDashboard()` from `api/admin.ts`; returns `{ users: { total, active, invited, deactivated }, teams: { total }, workspaces: { total }, plugins: { enabled, total }, roles: { system, custom } }`; `staleTime: 30_000`. Loading state: 5 skeleton metric cards. Error state: full-width error banner with retry button. No additional actions on this screen — it is read-only summary.
  - **Spec Reference**: Plan §12 Phase 7 T008-51; design-spec §2.11; Spec §4 FR-008
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-18 (backend tenant dashboard endpoint)
  - **Acceptance Criteria**:
    1. Dashboard renders 5 metric cards using data from `GET /api/v1/tenant/dashboard`.
    2. `useTenantAdminDashboard()` uses `staleTime: 30_000` (no refetch on every mount within 30s window).
    3. Error state banner has a retry button that calls `refetch()`; error message is the API error code/message.
    4. Metric cards are responsive: horizontal row ≥1024px, 2×2 grid at 768px.

---

- [ ] **T008-52** `[L]` `[FR-009]` User List + Invite screen
  - **FR/NFR**: FR-009 (user management), US-003 (user invitations)
  - **Type**: frontend · **Points**: 3
  - **Files**:
    - `apps/frontend/src/routes/admin/users/index.tsx` (create new, ~200 lines)
    - `apps/frontend/src/hooks/admin/useUsers.ts` (create new, ~100 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screen 12 (User List + Invite) per design-spec §2.12. **`useUsers()` hook**: `useQuery` for list (params: `page`, `limit`, `search`, `status`, `role`); `useMutation` hooks: `inviteUser(dto)`, `updateUser(id, dto)`, `deactivateUser(id)`; each mutation invalidates the user list cache on success. **User List screen**: DataTable with columns (Name, Email, Status badge, Role(s), Teams, Actions). Search input (debounced 300ms). Status filter dropdown (All / Active / Invited / Deactivated). Role filter dropdown populated from `useRoles()`. "Invite User" button. Row actions `⋮` dropdown: "Change Role" → opens role assignment modal, "Deactivate" → opens `DestructiveConfirmModal` (typed-confirm requiring the user's email). **Invite modal**: `Dialog` with email input and role dropdown (required); on blur of email field, perform existing-user check via `GET /api/v1/tenant/users?email={email}`; if user exists in another tenant, show info banner "This user has an existing account — they will be added to this tenant" with button label changing to "Add User" (Edge Case #4). On submit: calls `inviteUser` mutation; success: toast "Invitation sent to {email}"; closes modal. **Edge Case #7 guard**: Deactivate action is disabled (`aria-disabled="true"`) when the target user is the sole `tenant_admin` or `tenant_owner`; tooltip reads "Cannot deactivate the last tenant admin". If API returns 409 `LAST_TENANT_ADMIN`, inline error shown in confirmation modal.
  - **Spec Reference**: Plan §12 Phase 7 T008-52; design-spec §2.12; Spec §4 FR-009; Spec §3 US-003; Edge Cases #4, #7
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-18 (backend user endpoints)
  - **Acceptance Criteria**:
    1. Invite modal email blur check shows "Add User" banner when email belongs to an existing Keycloak user (Edge Case #4 — verified by MSW mock returning existing-user flag).
    2. Deactivate row action is `aria-disabled="true"` for the sole `tenant_admin`; tooltip "Cannot deactivate the last tenant admin" is present (Edge Case #7).
    3. Search, status filter, and role filter all pass correct query params to `useUsers()` hook and appear in the API request URL.
    4. Successful invite closes modal, shows toast, and refetches user list (cache invalidated).

---

- [ ] **T008-53** `[P]` `[M]` `[FR-010]` Team List + Team Detail screens
  - **FR/NFR**: FR-010 (team management), US-005 (team membership)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/admin/teams/index.tsx` (create new, ~150 lines)
    - `apps/frontend/src/routes/admin/teams/$teamId.tsx` (create new, ~180 lines)
    - `apps/frontend/src/hooks/admin/useTeams.ts` (create new, ~100 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screens 13 (Team List) and 14 (Team Detail) per design-spec §2.13–2.14. **`useTeams()` hook**: `useQuery` for list (params: `page`, `limit`, `workspace_id`); `useMutation` hooks: `createTeam`, `updateTeam`, `deleteTeam`, `addTeamMember`, `removeTeamMember`; all mutations invalidate team list and team detail caches. **Team List screen (`index.tsx`)**: card/list view of teams; each card shows team name, description, workspace badge, member count badge (from `memberCount` field), "View" button (navigate to `$teamId`). "+ Create Team" button opens `Dialog` modal with name (required), description, workspace dropdown (populated from workspaces API); submit calls `createTeam` mutation. Empty state: "No teams yet" + create button. **Team Detail screen (`$teamId.tsx`)**: header with team name, edit button (inline edit or modal); member list DataTable with columns (Name, Email, Role (MEMBER/ADMIN), Joined At, Actions); "+ Add Member" button opens modal with user search dropdown (calls user list API) and role select; submit calls `addTeamMember` mutation; 409 `MEMBER_ALREADY_EXISTS` → inline error "Already a member". Row action: "Remove" opens `DestructiveConfirmModal` (simple confirm) → calls `removeTeamMember` mutation; 404 `MEMBER_NOT_FOUND` → toast error. Delete team button (at bottom): `DestructiveConfirmModal` (typed-confirm: team name); success: navigate back to team list.
  - **Spec Reference**: Plan §12 Phase 7 T008-53; design-spec §2.13–2.14; Spec §4 FR-010; Spec §3 US-005
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-18 (backend team endpoints)
  - **Acceptance Criteria**:
    1. Team List cards display `memberCount` badge from API; "+ Create Team" modal Zod validates name as required.
    2. Team Detail "+ Add Member" for a user already on the team returns 409 inline error "Already a member" (MSW mock + RTL assertion).
    3. Remove member `DestructiveConfirmModal` (simple-confirm) calls `removeTeamMember` on confirm; navigates back on team delete.
    4. All mutations invalidate relevant TanStack Query caches; list refetches after create/delete.

---

- [ ] **T008-54** `[L]` `[FR-011]` Role Editor screen
  - **FR/NFR**: FR-011 (role management), US-004 (custom role creation), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 3
  - **Files**:
    - `apps/frontend/src/routes/admin/roles/index.tsx` (create new, ~300 lines)
    - `apps/frontend/src/routes/admin/roles/new.tsx` (create new, ~150 lines)
    - `apps/frontend/src/routes/admin/roles/$roleId.tsx` (create new, ~150 lines)
    - `apps/frontend/src/hooks/admin/useRoles.ts` (create new, ~100 lines)
    - `apps/frontend/src/components/admin/PermissionGroupAccordion.tsx` (create new, ~250 lines)
    - `apps/frontend/src/components/admin/PermissionGroupAccordion.test.tsx` (create new, ~180 lines)
  - **Change type**: Create new files
  - **Description**: Implement Screens 15–17 (Role List/Editor) per design-spec §2.15–2.17. **`useRoles()` hook**: `useQuery` for roles list (from `GET /api/v1/tenant/roles`); `useQuery` for permissions (from `GET /api/v1/tenant/permissions`); `useMutation` hooks: `createRole`, `updateRole`, `deleteRole`; all mutations invalidate roles cache. **Role List / Editor (`index.tsx`)**: two-column layout (1440px and 1024px): left column is role list, right column is editor panel. Left: `<ul>` of roles; system roles (where `isSystem=true`) show a lock icon and `aria-label="System role — read only"`; custom roles show edit + delete icons; "+ New Role" button navigates to `/admin/roles/new`. Right: when a role is selected, shows editor panel (same form as `new.tsx` but pre-populated). Responsive at 768px: two-column collapses to stacked; left column becomes a `<select>` dropdown role selector (per design-spec §8). **New/Edit Role form** (`new.tsx` / `$roleId.tsx`): role name (required), description (optional), `PermissionGroupAccordion`. For system roles, entire form is disabled with tooltip "System roles cannot be modified" (Edge Case #2). `useReducer` for permission selection state (checkboxes can be indeterminate). Submit calls `createRole` / `updateRole`; success: toast + navigate to role detail. Delete: `DestructiveConfirmModal` (simple-confirm); system role delete → 403 shows toast "System roles cannot be deleted". **`PermissionGroupAccordion` component**: props: `permissions: PermissionGroup[]` (grouped by `pluginId`), `selectedIds: string[]`, `onChange: (ids: string[]) => void`, `readOnly?: boolean`. Each `PermissionGroup` is a collapsible `<details>`/`<summary>` (or `<div role="group">`) with a group checkbox (indeterminate when partial selection) and individual permission checkboxes. A11y: `aria-expanded`, `aria-controls`, `aria-checked` (including `indeterminate` state via `ref.indeterminate = true`), `role="group"` on each group. Unit tests: render groups, expand/collapse via keyboard, toggle individual checkbox, group checkbox selects all, partial group shows indeterminate, readOnly disables all checkboxes.
  - **Spec Reference**: Plan §12 Phase 7 T008-54; design-spec §2.15–2.17, §3 PermissionGroupAccordion, §8; Spec §4 FR-011; Spec §3 US-004; Edge Case #2
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-18 (backend role/permission endpoints)
  - **Acceptance Criteria**:
    1. System roles in the left panel show a lock icon; selecting a system role renders a read-only form (all inputs `disabled`); tooltip "System roles cannot be modified" present (Edge Case #2).
    2. `PermissionGroupAccordion` group checkbox shows indeterminate state (`ref.indeterminate = true`) when some but not all permissions in the group are selected (verified by RTL assertion on `input.indeterminate`).
    3. At 768px viewport, the two-column layout collapses to a `<select>` dropdown for role selection per design-spec §8 breakpoint rule.
    4. `PermissionGroupAccordion.test.tsx`: expand/collapse, individual checkbox toggle, group select-all, indeterminate state, and `readOnly` prop disable all checkboxes — all 5 scenarios pass.

---

- [ ] **T008-55** `[P]` `[S]` `[FR-012]` Plugin Settings screen
  - **FR/NFR**: FR-012 (tenant plugin settings), NFR-005 (a11y)
  - **Type**: frontend · **Points**: 1
  - **Files**:
    - `apps/frontend/src/routes/admin/plugins/index.tsx` (create new, ~150 lines)
  - **Change type**: Create new file
  - **Description**: Implement Screen 18 (Plugin Settings) per design-spec §2.18. **Screen layout**: list of plugins available to the tenant (from `GET /api/v1/tenant-plugins` using existing `tenant-plugins-v1.ts` API endpoints); each plugin row shows: plugin name, version, description, enabled/disabled `Switch` toggle, "Configure" button (opens config form in a slide-over panel or modal). **Enable/Disable toggle**: `Switch` component with `role="switch"` and `aria-checked={enabled}` and `aria-label="Enable {pluginName}"`; calls `POST /api/v1/tenant-plugins/{id}/enable` or `/disable` on toggle; optimistic update + error rollback on API failure; success toast "{pluginName} enabled/disabled". **Configure modal**: renders plugin-specific config form (schema-driven); Save calls `PATCH /api/v1/tenant-plugins/{id}/config`; success toast. **Integration test requirement** (resolves Analysis LOW ISSUE-007): acceptance criterion 4 below requires an integration-level test verifying enable/disable flow against the actual `tenant-plugins-v1.ts` endpoints.
  - **Spec Reference**: Plan §12 Phase 7 T008-55; design-spec §2.18; Spec §4 FR-012; Analysis LOW ISSUE-007
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client); uses existing `tenant-plugins-v1.ts` backend endpoints (no dependency on Phase 3 new endpoints)
  - **Acceptance Criteria**:
    1. Plugin enable/disable toggle calls the correct `tenant-plugins-v1.ts` endpoint and shows success toast with `"{pluginName} enabled"` / `"{pluginName} disabled"`.
    2. Switch components have `role="switch"`, `aria-checked={enabled}`, and `aria-label="Enable {pluginName}"`.
    3. Optimistic update reflects toggle change immediately; on API error, toggle reverts to previous state and shows error toast.
    4. An integration-level test (Vitest + MSW or Playwright) verifies the full enable → list refetch → disable → list refetch cycle for a mocked plugin (resolves Analysis LOW ISSUE-007).

---

- [ ] **T008-56** `[P]` `[M]` `[FR-013]` Tenant Settings screen
  - **FR/NFR**: FR-013 (tenant settings), US-006 (theme customization), ADR-020 (font hosting)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/routes/admin/settings/index.tsx` (create new, ~200 lines)
  - **Change type**: Create new file
  - **Description**: Implement Screen 19 (Tenant Settings) per design-spec §2.19. **Screen layout**: two-section form: (1) Appearance, (2) General. Persistent "Save Changes" button (disabled when no dirty fields). **Appearance section**: logo upload (`<input type="file" accept="image/*">` + preview thumbnail; calls file upload API); primary color picker (`<input type="color">` with hex value text field, synced); font family selector — `<select>` populated with the curated ~25 font list from ADR-020 (self-hosted WOFF2 fonts; no arbitrary URL input). **Live theme preview panel**: a card showing the selected primary color, font, and logo rendered together; updates in real-time as form values change. **General section**: notifications toggle (`Switch`), default workspace dropdown. **React Hook Form + Zod validation**: logo max 2MB (validated client-side before upload), color must be valid hex, font must be from approved list. Submit calls `updateTenantSettings` from `api/admin.ts` (`PATCH /api/v1/tenant/settings`); success toast "Settings saved"; error shows inline API error message.
  - **Spec Reference**: Plan §12 Phase 7 T008-56; design-spec §2.19; Spec §4 FR-013; Spec §3 US-006; ADR-020
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-18 (backend settings endpoint)
  - **Acceptance Criteria**:
    1. Font selector is a `<select>` limited to the curated ADR-020 approved list; arbitrary URL/font name input is not possible.
    2. Live theme preview updates immediately when primary color or font is changed (no save required).
    3. Logo file upload rejects files > 2MB with a client-side Zod validation error "Logo must be under 2MB".
    4. Save button is disabled when no form fields are dirty; submitting calls `PATCH /api/v1/tenant/settings` and shows "Settings saved" toast.

---

- [ ] **T008-57** `[P]` `[S]` `[FR-014]` Tenant Audit Log screen
  - **FR/NFR**: FR-014 (tenant audit log), US-007 (audit log browsing), NFR-004 (tenant isolation)
  - **Type**: frontend · **Points**: 1
  - **Files**:
    - `apps/frontend/src/routes/admin/audit-logs/index.tsx` (create new, ~100 lines)
  - **Change type**: Create new file
  - **Description**: Implement Screen 20 (Tenant Audit Log) per design-spec §2.20. **Screen layout**: reuses `AuditLogTable` component (from T008-58) with date range picker, action filter dropdown, and user filter. No `tenant_id` filter exposed (unlike the Super Admin audit log screen — this screen is always scoped to the current tenant). **`useAuditLogs()` hook** (shared with T008-49, same hook with different API function): calls `getTenantAuditLogs(params)` from `api/admin.ts` (`GET /api/v1/tenant/audit-logs`). Filters and pagination use URL search params (TanStack Router `useSearch`). **10K cap banner**: same UX as T008-49. **Tenant isolation guarantee**: the `tenant_id` filter is never sent as a query param from this screen — the tenant context is injected server-side (NFR-004). If a user manually adds `?tenant_id=other-tenant` to the URL, the API silently ignores it (backend enforcement); the UI must not expose or pass the `tenant_id` query param.
  - **Spec Reference**: Plan §12 Phase 7 T008-57; design-spec §2.20; Spec §4 FR-014; Spec §3 US-007; Spec §5 NFR-004
  - **Dependencies**: T008-39 (shell), T008-41 (auth hooks + API client), T008-58 (AuditLogTable component), T008-18 (backend tenant audit log endpoint)
  - **Acceptance Criteria**:
    1. Screen renders `AuditLogTable` with date range, action filter, and user filter; `tenant_id` filter is absent from the filter bar UI.
    2. `useAuditLogs()` calls `getTenantAuditLogs()` (not `getAdminAuditLogs()`); no `tenant_id` param is appended to the API request URL (verified by MSW handler assertion).
    3. URL search params persist filters across navigation; sharing the URL pre-populates filters.
    4. 10K cap banner appears with `role="alert"` when `meta.total > 10_000`.

---

- [ ] **T008-58** `[P]` `[M]` `[FR-006]` `[FR-014]` `[NFR-005]` AuditLogTable + DestructiveConfirmModal components
  - **FR/NFR**: FR-006 and FR-014 (audit log display), NFR-005 and NFR-006 (WCAG a11y)
  - **Type**: frontend · **Points**: 2
  - **Files**:
    - `apps/frontend/src/components/admin/AuditLogTable.tsx` (create new, ~250 lines)
    - `apps/frontend/src/components/admin/AuditLogTable.test.tsx` (create new, ~150 lines)
    - `apps/frontend/src/components/admin/DestructiveConfirmModal.tsx` (create new, ~180 lines)
    - `apps/frontend/src/components/admin/DestructiveConfirmModal.test.tsx` (create new, ~120 lines)
  - **Change type**: Create new files
  - **Description**: Implement two shared components used across both portals. **(A) `AuditLogTable`**: props: `data: AuditLogEntry[]`, `meta: PageMeta`, `filters: AuditLogFilters`, `onFilterChange: (f: AuditLogFilters) => void`, `isLoading: boolean`. Renders a `<table role="grid">` with columns: Timestamp (`<time datetime="ISO">` element), Action, User, Resource, IP Address. Sortable columns show `aria-sort="ascending"|"descending"|"none"` attribute. Timestamp column sorts by `createdAt`. Pagination: `<nav aria-label="Audit log pagination">` with prev/next/page number buttons; current page button has `aria-current="page"`. 10K cap banner: if `meta.total > 10_000`, render dismissible `<div role="alert">` banner. Empty state: "No audit log entries found" message. Loading state: skeleton rows. Unit tests: column data rendering, 10K banner appears at threshold, pagination nav present, `aria-sort` toggling, empty state, loading skeleton. **(B) `DestructiveConfirmModal`**: props: `variant: 'typed-confirm' | 'simple-confirm'`, `title: string`, `message: string`, `confirmValue?: string` (for typed-confirm — value user must type), `onConfirm: () => void`, `onCancel: () => void`, `isOpen: boolean`. Renders `<div role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-body">`. **Focus trap**: on open, focus moves to input (typed) or Cancel button (simple); Tab cycles within modal; Escape calls `onCancel`. Typed-confirm variant: text `<input>` bound to local state; confirm button `disabled` until `inputValue === confirmValue` (case-sensitive); disabled button has `aria-disabled="true"`. Simple-confirm: immediate confirm button (styled danger red). Unit tests: typed-confirm button disabled until match, simple-confirm immediate enable, focus starts at input (typed) or Cancel (simple), Escape closes modal, onConfirm called on confirm, onCancel called on Escape/Cancel.
  - **Spec Reference**: Plan §12 Phase 7 T008-58; design-spec §3 (AuditLogTable, DestructiveConfirmModal); design-spec §6 WCAG checklist
  - **Dependencies**: T008-39 (shell layout context for portal use)
  - **Acceptance Criteria**:
    1. `AuditLogTable` renders timestamp cells as `<time datetime="ISO-8601">` elements; sortable columns have `aria-sort` attribute that toggles on click.
    2. `DestructiveConfirmModal` typed-confirm: confirm button remains `disabled` (and `aria-disabled="true"`) until input value exactly matches `confirmValue`; verified by RTL `userEvent.type` test.
    3. `DestructiveConfirmModal` focus trap: pressing `Tab` from the last focusable element wraps to the first; pressing `Escape` calls `onCancel` — both verified by RTL keyboard interaction tests.
    4. All unit tests pass (`AuditLogTable.test.tsx` and `DestructiveConfirmModal.test.tsx`); combined line coverage ≥85%.

**Phase 7 (Tenant Admin Interface Screens) estimated: 8 tasks · 15 story points**

---

## Phase 8: Accessibility, Responsive Polish & Frontend Tests

> **Objective**: Apply WCAG 2.1 AA compliance across all 19 admin screens, finalize responsive
> behavior at all breakpoints, and achieve ≥80% frontend test coverage with unit, E2E, and
> accessibility tests.
>
> **Depends on**: Phases 5–7 (all screens and components implemented).

---

- [ ] **T008-59** `[L]` `[NFR-005]` `[NFR-006]` `[NFR-007]` Accessibility hardening
  - **FR/NFR**: NFR-005 (WCAG 2.1 AA), NFR-006 (keyboard navigation), NFR-007 (screen reader support)
  - **Type**: frontend · **Points**: 3
  - **Files**: All 19 admin screen files (T008-43 through T008-57) + both `_layout.tsx` files (T008-39) — modify existing
  - **Change type**: Modify existing
  - **Description**: Apply the full design-spec §6 WCAG 2.1 AA checklist across all 19 admin screens and both layout shells. This is a systematic pass through every screen and component. **A11y items to verify and add**: (1) Skip-nav link `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>` in both `_layout.tsx` shells, targeting `<main id="main-content">`. (2) Modal focus management: verify `DestructiveConfirmModal`, Invite User modal, Add Team Member modal, and Plugin Config modal all trap focus; verify focus returns to trigger element on close. (3) Sidebar focus: when hamburger menu opens overlay sidebar, move focus to first sidebar item; when closed, return focus to hamburger button. (4) `aria-live="polite"` on: SSE provisioning progress (T008-45), system health card status (T008-43/T008-50), Toast notification container (global). (5) `aria-label` on all icon-only buttons: "Edit tenant", "Delete team", "Remove member", "Refresh health check", "Close dialog", hamburger "Open navigation". (6) `<time datetime="ISO-8601">` on all timestamp cells in DataTables and AuditLogTable. (7) `aria-sort` on all sortable DataTable columns — toggle ascending/descending/none. (8) `aria-current="page"` on active nav item in AdminSidebarNav (already in T008-40 spec, verify implementation). (9) Form error announcement: all React Hook Form error messages connected via `aria-describedby` on the invalid `<input id>`; verify pattern in all forms. (10) Required fields: add `aria-required="true"` to all required form inputs; add `<span aria-hidden="true"> *</span>` visual marker; `<label>` includes "(required)" in `sr-only` span. **Responsive finalization**: verify at all 3 breakpoints — 1440px: sidebar visible, full columns, stat cards horizontal; 1024px: sidebar visible, stat cards 2×2, row actions in `⋮` menu; 768px: hamburger overlay, DataTable horizontal scroll with `overflow-x: auto` wrapper, stat cards vertical stack, filter panels collapsible, Role Editor collapses to stacked per design-spec §8.
  - **Spec Reference**: Plan §12 Phase 8 T008-59; design-spec §6 (WCAG 2.1 AA Compliance Checklist); design-spec §8 (Responsive Breakpoints); Constitution Art. 1.3
  - **Dependencies**: T008-43 through T008-58 (all screens and components complete)
  - **Acceptance Criteria**:
    1. All 19 admin screens have a visible skip-nav link (focusable on first `Tab`); pressing `Enter` on skip-nav moves focus to `<main id="main-content">`.
    2. All modal open/close cycles correctly manage focus: focus moves into modal on open, returns to trigger on close — verified by RTL `document.activeElement` assertions for at least 3 modal types (Invite User, DestructiveConfirmModal, Add Team Member).
    3. All sortable DataTable columns have `aria-sort` that toggles between `"ascending"`, `"descending"`, and `"none"` on click.
    4. At 768px viewport width, DataTable containers are wrapped in `overflow-x: auto` (no horizontal page scroll); stat cards stack vertically; filter panels collapse behind a toggle — verified by snapshot or RTL with `matchMedia` mock.

---

- [ ] **T008-60** `[P]` `[L]` `[NFR-005]` Frontend unit tests — components
  - **FR/NFR**: NFR-005 (WCAG), Constitution Art. 4.1 (≥80% coverage)
  - **Type**: test · **Points**: 3
  - **Files**:
    - `apps/frontend/src/components/admin/AdminSidebarNav.test.tsx` (complete from T008-40)
    - `apps/frontend/src/components/admin/TenantStatusBadge.test.tsx` (complete from T008-44)
    - `apps/frontend/src/components/admin/ProvisioningWizard.test.tsx` (complete from T008-45)
    - `apps/frontend/src/components/admin/PermissionGroupAccordion.test.tsx` (complete from T008-54)
    - `apps/frontend/src/components/admin/AuditLogTable.test.tsx` (complete from T008-58)
    - `apps/frontend/src/components/admin/SystemHealthCard.test.tsx` (complete from T008-43)
    - `apps/frontend/src/components/admin/DestructiveConfirmModal.test.tsx` (complete from T008-58)
  - **Change type**: Modify existing (complete test files started in earlier tasks)
  - **Description**: Complete and consolidate all component unit test files to meet ≥80% line coverage targets for all 7 admin components. Each test file uses Vitest + React Testing Library. **AdminSidebarNav** (≥85% target): render, active item `aria-current="page"`, collapse toggle fires callback, `ArrowDown` moves focus (keyboard nav), mobile overlay renders/closes on Escape, skip-nav link present. **TenantStatusBadge** (≥90% target): all 5 status variants render correct classes and `aria-label`, semantic HTML tag. **ProvisioningWizard** (≥80% target): Step 1→2→3 navigation, Zod validation errors per step, slug uniqueness inline error (mock fetch), SSE progress rendering (mock `EventSource`), SSE `onerror` polling fallback (advance fake timers 30s), error state + retry button, success screen + actions, `sessionStorage` rehydration. **PermissionGroupAccordion** (≥80% target): group expand/collapse, individual checkbox toggle, group select-all, partial group indeterminate state, `readOnly` disables all. **AuditLogTable** (≥80% target): column rendering, 10K banner at threshold, pagination nav, `aria-sort` toggle, empty state, loading skeleton. **SystemHealthCard** (≥85% target): compact variant, detailed variant, healthy/unhealthy states, `aria-live="polite"`. **DestructiveConfirmModal** (≥85% target): typed-confirm enable/disable, simple-confirm, focus trap, Escape close, callbacks. All tests < 100ms (mock all async operations with `vi.fn()`, `vi.spyOn()`, MSW, or fake timers).
  - **Spec Reference**: Plan §12 Phase 8 T008-60; Plan §14.1 (Component unit tests table); Constitution Art. 4.1, Art. 8.2
  - **Dependencies**: T008-40, T008-43, T008-44, T008-45, T008-54, T008-58 (all component implementations)
  - **Acceptance Criteria**:
    1. All 7 component test files have passing tests; `pnpm test:unit` reports no failures.
    2. Per-component line coverage meets targets: AdminSidebarNav ≥85%, TenantStatusBadge ≥90%, ProvisioningWizard ≥80%, PermissionGroupAccordion ≥80%, AuditLogTable ≥80%, SystemHealthCard ≥85%, DestructiveConfirmModal ≥85%.
    3. ProvisioningWizard SSE `onerror` polling fallback test: advance fake timers 35 seconds → assert polling fetch called at least once (EventSource mock throws `onerror` immediately).
    4. No test makes real network calls — all `fetch`, `EventSource`, and TanStack Query calls are mocked.

---

- [ ] **T008-61** `[P]` `[M]` Frontend unit tests — hooks
  - **FR/NFR**: Constitution Art. 4.1 (≥80% coverage)
  - **Type**: test · **Points**: 2
  - **Files**:
    - `apps/frontend/src/__tests__/unit/hooks/admin/` (create new directory with test files, ~8 files × ~80 lines each = ~640 lines total)
  - **Change type**: Create new files
  - **Description**: Implement unit tests for all 9 TanStack Query admin hooks using Vitest + `@testing-library/react` (`renderHook`) + MSW (Mock Service Worker) for API mocking. MSW handlers mock the backend REST endpoints at the network level. **`useSuperAdminDashboard`**: loading state (`isPending=true`), success state (`data` matches mock API response), error state (MSW returns 500, `isError=true`). **`useTenants`**: list pagination (params forwarded to URL), `createTenant` mutation cache invalidation (query refetched after mutate), `updateTenant` optimistic update, `deleteTenant` mutation. **`useUsers`**: list with `search`/`status`/`role` filter params forwarded, `inviteUser` mutation + success invalidation, `deactivateUser` mutation. **`useTeams`**: list, `createTeam` mutation, `addTeamMember` mutation 409 handled as `error.code === 'MEMBER_ALREADY_EXISTS'`, `removeTeamMember`. **`useRoles`**: list includes `isSystem` field, `createRole` mutation, `updateRole` 403 `SYSTEM_ROLE_IMMUTABLE` error handling. **`useAuditLogs`**: filter params forwarded to API URL, 10K cap error (`AUDIT_LOG_RESULT_WINDOW_EXCEEDED`) exposed as `error`, pagination `keepPreviousData`. **`useSystemConfig`**: list by category (`?category=maintenance`), `updateSystemConfig` invalidates cache. **`useSystemHealth`**: polling interval 30s (advance fake timers, assert refetch count = 2 after 61s). **`useAdminAuth`**: `useRequireSuperAdmin` redirects on missing role (mock `navigate`), `useRequireTenantAdmin` allows `tenant_owner`. All tests < 100ms; use `QueryClientProvider` wrapper in `renderHook`. Total estimated: ~25 test cases.
  - **Spec Reference**: Plan §12 Phase 8 T008-61; Plan §14.2 (Hook unit tests table); Constitution Art. 4.1
  - **Dependencies**: T008-41 (auth hooks), T008-43–T008-57 (all hooks used by screens)
  - **Acceptance Criteria**:
    1. All 9 hook test files have passing tests; `pnpm test:unit` reports no failures.
    2. Cache invalidation tests: verify that after a `createTenant` mutation, `useTenants` list query is refetched (TanStack Query `queryClient.invalidateQueries` called with correct key).
    3. `useSystemHealth` polling test: advance fake timers 61 seconds → assert `refetch` was triggered at least twice (once at 30s, once at 60s).
    4. All MSW handlers are registered in test setup; no real network requests are made.

---

- [ ] **T008-62** `[L]` `[FR-002]` `[FR-009]` `[FR-011]` Playwright E2E tests — critical flows
  - **FR/NFR**: FR-002 (tenant create), FR-009 (user invite), FR-011 (role editor)
  - **Type**: test · **Points**: 3
  - **Files**:
    - `apps/frontend/src/__tests__/e2e/admin-tenant-create.e2e.test.ts` (create new, ~150 lines)
    - `apps/frontend/src/__tests__/e2e/admin-user-invite.e2e.test.ts` (create new, ~120 lines)
    - `apps/frontend/src/__tests__/e2e/admin-role-editor.e2e.test.ts` (create new, ~120 lines)
  - **Change type**: Create new files
  - **Description**: Implement 3 Playwright E2E tests covering the critical user flows from design-spec §7. All tests use a live dev server (`pnpm dev`) and full backend (via `test-infrastructure`). **Test 1 — Tenant Create Wizard** (`admin-tenant-create.e2e.test.ts`): log in as super admin → navigate to `/super-admin/tenants/new` → fill Step 1 (name "E2E Test Tenant", slug auto-generated, valid admin email) → click Next → fill Step 2 (theme color, one plugin checkbox) → click "Create Tenant" → assert Step 3 progress bar appears → wait for SSE provisioning events (or polling fallback if SSE not available in CI) → assert success screen shows "Tenant created!" → click "View Tenant" → assert redirected to tenant detail page → navigate to tenant list → assert new tenant appears with `ACTIVE` badge → navigate to audit log → assert `tenant.created` entry appears. ~15 assertions. **Test 2 — User Invite + Role Assign** (`admin-user-invite.e2e.test.ts`): log in as tenant admin → navigate to `/admin/users` → click "Invite User" → enter test email and select role → submit → assert user appears in list with `status: 'invited'` badge → click row action "Change Role" → select different role → save → assert role updated in table → verify Toast "Role updated" appears. ~12 assertions. **Test 3 — Role Editor** (`admin-role-editor.e2e.test.ts`): log in as tenant admin → navigate to `/admin/roles` → click "+ New Role" → enter name "E2E Role" → expand a permission group in PermissionGroupAccordion → check 2 permissions → save → assert role appears in role list → click role to edit → verify 2 permissions pre-checked → add 1 more permission → save → navigate to user list → change a user's role to "E2E Role" → verify role shown in user table → navigate to audit log → assert `role.created` and `user.role_changed` entries present. ~12 assertions. All tests verify Toast notifications appear with correct messages (use `page.getByRole('alert')`).
  - **Spec Reference**: Plan §12 Phase 8 T008-62; Plan §14.3 (E2E tests table); design-spec §7 (User flow diagrams)
  - **Dependencies**: T008-43–T008-57 (all screen implementations); full backend Phases 1–3 complete; test infrastructure running
  - **Acceptance Criteria**:
    1. Tenant Create Wizard E2E: full 3-step flow completes; new tenant appears in list with `ACTIVE` status badge; `tenant.created` audit log entry is present after wizard completion.
    2. User Invite E2E: invited user appears with `invited` status badge; role change is reflected in DataTable without page reload (cache invalidation + refetch).
    3. Role Editor E2E: created role appears in role list; permissions are pre-populated on edit; `role.created` and `user.role_changed` appear in the audit log.
    4. All 3 tests complete in < 120 seconds total; each individual test < 45 seconds.

---

- [ ] **T008-63** `[⚠ BLOCKED]` `[L]` `[NFR-005]` `[NFR-006]` `[NFR-007]` Playwright a11y tests (ADR-022)
  - **FR/NFR**: NFR-005 (WCAG 2.1 AA), NFR-006 (keyboard navigation), NFR-007 (screen reader compatibility)
  - **Type**: test · **Points**: 2
  - **Files**:
    - `apps/frontend/src/__tests__/e2e/admin-a11y.e2e.test.ts` (create new, ~250 lines)
  - **Change type**: Create new file
  - **⚠ BLOCKED**: This task is blocked until ADR-022 (axe-core + Playwright for a11y testing) changes status from `Proposed` to `Accepted`. Do NOT start implementation until the ADR is Accepted. Check `.forge/knowledge/adr/adr-022-*.md` for current status.
  - **Description**: Implement per-screen Playwright + `axe-playwright` (wrapping axe-core) accessibility scans for all 19 admin screens, per ADR-022. **Setup**: install `axe-playwright` (`npm install -D axe-playwright`); configure in `playwright.config.ts` with `axe.configure({ rules: [{ id: 'color-contrast', enabled: true }] })` for WCAG 2.1 AA rule set. **Test structure**: one `test()` block per screen; each test navigates to the screen, injects minimal test data (via API calls or test fixtures), then calls `const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()`; asserts `results.violations.length === 0`. **Screens to test** (19 total): SA Dashboard, Tenant List, Tenant Create Wizard (Step 1, Step 2, Step 3), Tenant Detail, Plugin List, Plugin Config, SA Users, System Config, Global Audit Log, System Health, TA Dashboard, User List, Team List, Team Detail, Role Editor, Plugin Settings, Tenant Settings, Tenant Audit Log. **Specific assertions** (in addition to zero-violations): (1) No icon-only buttons without `aria-label` (rule: `button-name`). (2) No color-only status conveyance — status badges have text (rule: `color-contrast` + manual). (3) No keyboard traps (rule: `scrollable-region-focusable`). (4) Contrast ratio ≥4.5:1 for body text, ≥3:1 for large text (rule: `color-contrast`). **CI integration**: test failures block merge (`--ci` flag in Playwright config); zero-tolerance policy per ADR-022.
  - **Spec Reference**: Plan §12 Phase 8 T008-63; Plan §14.4 (Accessibility tests); design-spec §6; ADR-022
  - **Dependencies**: T008-59 (accessibility hardening complete), ADR-022 status = Accepted (currently Proposed — **BLOCKED**)
  - **Acceptance Criteria**:
    1. **BLOCKED — do not implement until ADR-022 is Accepted.** When unblocked: `axe-playwright` is installed and configured for WCAG 2.1 AA rule set in `playwright.config.ts`.
    2. All 19 admin screens return `results.violations.length === 0` at WCAG 2.1 AA level (zero axe violations allowed — per ADR-022 zero-tolerance policy).
    3. CI pipeline configuration blocks merge when any a11y test fails (verify Playwright config `--ci` flag or GitHub Actions step `if: always()` with failure condition).
    4. Test file includes at minimum 19 `test()` blocks (one per screen) + 3 focused interaction tests (modal focus trap on `DestructiveConfirmModal`, wizard step focus management in `ProvisioningWizard`, sidebar keyboard navigation in `AdminSidebarNav`).

**Phase 8 (Accessibility, Responsive Polish & Frontend Tests) estimated: 5 tasks · 13 story points**

---

## Summary

| Metric                           | Value                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| Total tasks                      | 53 (T008-00 through T008-27, T008-39 through T008-63)          |
| Total story points               | ~112 (77 backend + 35 frontend)                                |
| Total phases                     | 9 (5 backend + 4 frontend)                                     |
| Parallelizable tasks             | 18                                                             |
| Requirements covered (FR)        | 14/14                                                          |
| Requirements covered (NFR)       | 8/8                                                            |
| HIGH risk tasks                  | 3 (T008-00, T008-03, T008-45)                                  |
| BLOCKED tasks                    | 1 (T008-63 — pending ADR-022 Accepted)                         |
| Analysis issues addressed (HIGH) | 2 (ISSUE-001, ISSUE-002)                                       |
| Analysis issues addressed (MED)  | 5 (ISSUE-003, ISSUE-004, ISSUE-005, ISSUE-006, + FE ISSUE-004) |
| Analysis issues addressed (LOW)  | 1 (ISSUE-007 — FR-012 integration test in T008-55)             |
| Estimated test count             | ~245 (150 backend + 95 frontend)                               |

### Phase Breakdown

| Phase    | Name                                              | Tasks  | Points   | Parallelizable                  |
| -------- | ------------------------------------------------- | ------ | -------- | ------------------------------- |
| 1        | Foundation                                        | 9      | 20       | T008-01, 02, 03, 04, 07, 08     |
| 2        | Super Admin Extensions                            | 5      | 18       | T008-09, 10, 12                 |
| 3        | Tenant Admin Interface                            | 8      | 35       | T008-14, 15, 20                 |
| 4        | E2E Tests and Hardening                           | 5      | 9        | —                               |
| 5 (docs) | Documentation                                     | 1      | 1        | T008-27                         |
| 5 (FE)   | Frontend Foundation                               | 4      | 9        | T008-40, 41, 42                 |
| 6        | Super Admin Panel Screens                         | 8      | 19       | T008-43, 44, 46, 47, 48, 49, 50 |
| 7        | Tenant Admin Interface Screens                    | 8      | 15       | T008-51, 53, 55, 56, 57, 58     |
| 8        | Accessibility, Responsive Polish & Frontend Tests | 5      | 13       | T008-60, 61                     |
| —        | **Total**                                         | **53** | **~112** |                                 |

> **Split guidance**: T008-16 (8 pts, user management) and T008-18 (8 pts, routes) are the two
> largest backend tasks. T008-45 (5 pts, ProvisioningWizard) is the largest frontend task.
> If T008-16 stalls, split into (getDashboard+listUsers+inviteUser) and (updateUser+deactivateUser).
> If T008-18 stalls, split into (dashboard+user routes), (team routes), and (roles+settings+audit routes).
> If T008-45 stalls, split into (Steps 1–2 form logic) and (Step 3 SSE + provisioning progress).
>
> **T008-63 is blocked**: do not start until ADR-022 status changes from Proposed to Accepted.
> Check `.forge/knowledge/adr/adr-022-*.md` before scheduling T008-63.

---

## FR/NFR Coverage Matrix

| Requirement | Task IDs                                                      | Status |
| ----------- | ------------------------------------------------------------- | ------ |
| FR-001      | T008-11, T008-43                                              | ✅     |
| FR-002      | T008-11, T008-22, T008-44, T008-45                            | ✅     |
| FR-003      | T008-46                                                       | ✅     |
| FR-004      | T008-10, T008-11, T008-47                                     | ✅     |
| FR-005      | T008-02, T008-09, T008-11, T008-12, T008-48                   | ✅     |
| FR-006      | T008-01, T008-05, T008-11, T008-22, T008-26, T008-49, T008-58 | ✅     |
| FR-007      | T008-10, T008-11, T008-50                                     | ✅     |
| FR-008      | T008-15, T008-18, T008-51                                     | ✅     |
| FR-009      | T008-16, T008-18, T008-23, T008-52                            | ✅     |
| FR-010      | T008-03, T008-17, T008-18, T008-23, T008-53                   | ✅     |
| FR-011      | T008-18, T008-24, T008-54                                     | ✅     |
| FR-012      | T008-55 (+ existing `tenant-plugins-v1.ts`)                   | ✅     |
| FR-013      | T008-18, T008-56                                              | ✅     |
| FR-014      | T008-05, T008-18, T008-21, T008-26, T008-57, T008-58          | ✅     |
| NFR-001     | T008-01 (indexes), T008-11 (pagination), T008-43, T008-44     | ✅     |
| NFR-002     | T008-01 (composite index), T008-13, T008-49                   | ✅     |
| NFR-003     | T008-11, T008-14, T008-18                                     | ✅     |
| NFR-004     | T008-05, T008-18, T008-21, T008-25, T008-57                   | ✅     |
| NFR-005     | T008-40, T008-42, T008-44, T008-54, T008-58, T008-59, T008-63 | ✅     |
| NFR-006     | T008-40, T008-54, T008-59, T008-63                            | ✅     |
| NFR-007     | T008-40, T008-43, T008-50, T008-59, T008-63                   | ✅     |
| NFR-008     | T008-45 (+ existing provisioning orchestrator)                | ✅     |

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
