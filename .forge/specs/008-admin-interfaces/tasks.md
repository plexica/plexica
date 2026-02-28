# Tasks: 008 - Admin Interfaces

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Pending                                  |
| Author | forge-scrum                              |
| Date   | 2026-02-28                               |
| Spec   | [008 - Admin Interfaces](./spec.md)      |
| Plan   | [008 - Admin Interfaces Plan](./plan.md) |

---

## Legend

- `[FR-NNN]` / `[NFR-NNN]` — Requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h
- `⚠ HIGH RISK` — Flagged as high risk in analysis
- Status: `[ ]` pending · `[x]` done · `[-]` skipped

---

## Summary Table

| ID       | Title                                                      | Type     | Pts | Dependencies              |
| -------- | ---------------------------------------------------------- | -------- | --- | ------------------------- |
| T008-00  | Normalize existing admin.ts error responses to Art. 6.2    | refactor | 3   | —                         |
| T008-01  | Add AuditLog model to Prisma schema and run migration      | schema   | 2   | —                         |
| T008-02  | Add SystemConfig model, migration, and seed defaults       | schema   | 2   | —                         |
| T008-03  | Add team_members table to schema-step + backfill script    | schema   | 3   | —                         |
| T008-04  | Implement AuditLogService                                  | service  | 3   | T008-01                   |
| T008-05  | Implement AuditLogMiddleware Fastify hook                  | service  | 2   | T008-04                   |
| T008-06  | Add AUDIT_ACTIONS constants                                | config   | 1   | —                         |
| T008-07  | Unit tests — AuditLogService (≥85% coverage)               | test     | 3   | T008-04                   |
| T008-07b | Unit tests — admin.ts error format compliance (Art. 6.2)   | test     | 2   | T008-00                   |
| T008-08  | Implement SystemConfigService                              | service  | 3   | T008-02                   |
| T008-09  | Extend AdminService — super admin CRUD methods             | service  | 3   | —                         |
| T008-10  | Extend AdminService — getSystemHealth() aggregation        | service  | 2   | —                         |
| T008-11  | Add GET /api/v1/admin/dashboard route                      | api      | 2   | T008-09, T008-10          |
| T008-12  | Add GET/POST/DELETE /api/v1/admin/super-admins routes      | api      | 3   | T008-09                   |
| T008-13  | Add GET/PATCH /api/v1/admin/system-config routes           | api      | 2   | T008-08                   |
| T008-14  | Add GET /api/v1/admin/system-health route                  | api      | 1   | T008-10                   |
| T008-15  | Add GET /api/v1/admin/audit-logs route                     | api      | 2   | T008-04, T008-05          |
| T008-16  | Add POST /api/v1/admin/tenants/:id/reactivate alias route  | api      | 1   | T008-00                   |
| T008-17  | Wire audit logging into Super Admin mutation routes        | api      | 2   | T008-05, T008-06          |
| T008-18  | Unit tests — SystemConfigService (≥85% coverage)           | test     | 2   | T008-08                   |
| T008-19  | Integration tests — new Super Admin endpoints              | test     | 5   | T008-11–T008-17           |
| T008-20  | Add requireTenantAdmin middleware to auth.ts               | service  | 1   | —                         |
| T008-21  | Implement TenantAdminService.getDashboard()                | service  | 2   | T008-03, T008-04          |
| T008-22  | Implement TenantAdminService — user management methods     | service  | 5   | T008-03, T008-04          |
| T008-23  | Implement TenantAdminService — team CRUD methods           | service  | 3   | T008-03, T008-04          |
| T008-24  | Implement TenantAdminService — team member methods         | service  | 2   | T008-23                   |
| T008-25  | Implement TenantAdminRoutes — dashboard + user routes (5)  | api      | 5   | T008-21, T008-22, T008-20 |
| T008-26  | Implement TenantAdminRoutes — team management routes (6)   | api      | 3   | T008-23, T008-24, T008-20 |
| T008-27  | Implement TenantAdminRoutes — role editor routes (4)       | api      | 3   | T008-20                   |
| T008-28  | Implement TenantAdminRoutes — permissions listing route    | api      | 1   | T008-20                   |
| T008-29  | Implement TenantAdminRoutes — tenant settings GET/PATCH    | api      | 2   | T008-20                   |
| T008-30  | Implement TenantAdminRoutes — tenant audit log route       | api      | 2   | T008-04, T008-20          |
| T008-31  | Register tenantAdminRoutes in index.ts                     | config   | 1   | T008-25–T008-30           |
| T008-32  | Unit tests — TenantAdminService (≥85% coverage)            | test     | 5   | T008-21–T008-24           |
| T008-33  | Integration tests — Tenant Admin endpoints                 | test     | 8   | T008-25–T008-31           |
| T008-34  | E2E — Super Admin tenant lifecycle with audit trail        | test     | 2   | T008-15, T008-17          |
| T008-35  | E2E — Tenant Admin user and team lifecycle                 | test     | 2   | T008-25, T008-26          |
| T008-36  | E2E — Role editor: create role, assign permissions, verify | test     | 2   | T008-27                   |
| T008-37  | E2E — Edge cases: last admin, system role, cross-tenant    | test     | 2   | T008-25–T008-30           |
| T008-38  | E2E — Audit log query with date range and action filters   | test     | 2   | T008-15, T008-30          |

**Total: 39 tasks · 101 story points**

---

## Phase 1: Foundation

> **Objective**: Establish the audit log infrastructure, data models, and error-format remediation that all later phases depend on. Remediates ISSUE-001 (HIGH) and ISSUE-002 (HIGH) from analysis.

> ⚠ **HIGH RISK** — T008-00 touches 17 existing error responses in `admin.ts`. Test coverage (T008-07b) must be written first (or in parallel) to ensure no regressions. T008-03 introduces a backfill script for existing tenant schemas — must be tested against a copy of production data before deployment.

### T008-00 ⚠ HIGH RISK `[L]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-007]`

Normalize existing `admin.ts` error responses to Art. 6.2 format

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: Lines ~640, 655, 1157, 1163, 1358, 1364, 1426, 1439, 1492, 1521, 1527, 1720, 1726, 1774, 1835, 1883, 1949 (17 error responses)
- **Description**: Replace every `{ error: 'Not Found', message: '...' }` and similar non-standard shapes with the constitutionally mandated `{ error: { code: string, message: string, details?: object } }` format. Use SCREAMING_SNAKE_CASE codes (e.g., `TENANT_NOT_FOUND`, `PLUGIN_NOT_FOUND`, `VALIDATION_ERROR`). Add `details` object where contextual information is available (e.g., `{ tenantId }`, `{ pluginId }`). This must complete before new routes are added to the same file.
- **Spec Reference**: Spec §12 Art. 6 compliance; Constitution Art. 6.2; Analysis ISSUE-001
- **Acceptance Criteria**:
  - All 17 identified error responses in `admin.ts` return `{ error: { code, message } }` shape
  - No existing test failures after normalization
  - Error codes documented in a comment block at top of file
  - `admin-error-format.test.ts` (T008-07b) passes 100% for all error paths
- **Dependencies**: None
- **Estimated**: `[L]` ~3h code + 2h tests

---

### T008-01 `[M]` `[P]` `[FR-006]` `[FR-014]`

Add AuditLog model to Prisma schema and run migration

- **File**: `packages/database/prisma/schema.prisma`
- **Type**: Modify existing
- **Location**: End of file (after existing models)
- **Description**: Add the `AuditLog` model to `schema.prisma` with all columns from plan §2.1: `id` (UUID PK), `tenant_id` (String?, indexed), `user_id` (String?), `action` (String, max 100), `resource_type` (String?), `resource_id` (String?), `details` (Json, default `{}`), `ip_address` (String?), `user_agent` (String?), `created_at` (DateTime, default now). Use `String?` for `ip_address` (Prisma does not support PostgreSQL `INET` — plan §2.1). Add all 5 indexes from plan §2.3: `idx_audit_logs_tenant_id`, `idx_audit_logs_created_at`, `idx_audit_logs_action`, `idx_audit_logs_tenant_created` (composite), `idx_audit_logs_user_id`. Run `pnpm db:generate && pnpm db:migrate`.
- **Spec Reference**: Spec §7; Plan §2.1, §2.3, §2.4 Migration 001
- **Acceptance Criteria**:
  - `AuditLog` model present in `schema.prisma`
  - Migration runs cleanly on a fresh database
  - All 5 indexes created and present in `psql \d audit_logs`
  - `pnpm db:generate` completes without errors
- **Dependencies**: None (parallelizable with T008-02, T008-03, T008-06)
- **Estimated**: `[M]` ~1h

---

### T008-02 `[M]` `[P]` `[FR-005]`

Add SystemConfig model, migration, and seed defaults

- **File**: `packages/database/prisma/schema.prisma`
- **Type**: Modify existing
- **Location**: After AuditLog model (or end of file if T008-01 not yet merged)
- **Description**: Add `SystemConfig` model with columns: `key` (String, PK, unique), `value` (Json, NOT NULL), `category` (String, max 50), `description` (String?), `updated_by` (String?), `updated_at` (DateTime, @updatedAt), `created_at` (DateTime, @default(now)). Add `idx_system_config_category` B-TREE index on `category`. Run migration. Seed 5 default config entries from plan §2.1: `maintenance_mode` (false), `max_tenants` (1000), `max_users_per_tenant` (500), `feature_flag_analytics` (true), `registration_enabled` (true). Seed script should use `upsert` (idempotent).
- **Spec Reference**: Plan §2.1, §2.3, §2.4 Migration 002
- **Acceptance Criteria**:
  - `SystemConfig` model present in schema.prisma
  - Migration runs cleanly on a fresh database
  - `idx_system_config_category` index present
  - Running seed script twice produces no errors (idempotent upsert)
  - All 5 default keys present after seed
- **Dependencies**: None (parallelizable with T008-01, T008-03, T008-06)
- **Estimated**: `[M]` ~1h

---

### T008-03 ⚠ HIGH RISK `[L]` `[P]` `[FR-010]`

Add team_members table to schema-step and write backfill migration script

- **File (primary)**: `apps/core-api/src/services/provisioning-steps/schema-step.ts`
- **File (new — backfill)**: `apps/core-api/scripts/migrate-team-members.ts`
- **Type**: Modify existing + Create new file
- **Location (schema-step)**: After line ~274 (after teams table CREATE statement)
- **Description**: **Part A — schema-step**: Add `CREATE TABLE IF NOT EXISTS "{schema}".team_members` with columns from plan §2.1: `team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE`, `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `role TEXT NOT NULL CHECK (role IN ('MEMBER','ADMIN'))`, `joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`, primary key `(team_id, user_id)`. Add indexes `idx_team_members_user_id` and `idx_team_members_team_id`. **Part B — backfill script**: Create `apps/core-api/scripts/migrate-team-members.ts` that queries all existing tenant schemas from `core.tenants`, connects to each schema, and executes the same `CREATE TABLE IF NOT EXISTS` DDL. Script must be idempotent (IF NOT EXISTS). Rollback: wrap in a transaction per schema; log success/failure per tenant. Add integration test that verifies the backfill script runs successfully against a test tenant schema. Addresses ISSUE-006 from analysis.
- **Spec Reference**: Plan §2.1, §2.4 Migration 003; Analysis ISSUE-006
- **Acceptance Criteria**:
  - New tenants provisioned after this change get `team_members` table automatically
  - Backfill script `migrate-team-members.ts` runs without error on an existing tenant schema
  - Running backfill script twice is idempotent (no errors on second run)
  - Indexes `idx_team_members_user_id` and `idx_team_members_team_id` present after migration
  - Foreign key cascades tested: deleting a team removes its `team_members` rows
- **Dependencies**: None (parallelizable with T008-01, T008-02, T008-06)
- **Estimated**: `[L]` ~2.5h

---

### T008-04 `[L]` `[FR-006]` `[FR-014]`

Implement AuditLogService

- **File**: `apps/core-api/src/services/audit-log.service.ts`
- **Type**: Create new file
- **Description**: Implement the `AuditLogService` class with three methods per plan §4.1: `log(entry: AuditLogEntry): Promise<void>` (append-only write via Prisma — no UPDATE/DELETE), `query(filters: AuditLogFilters): Promise<AuditLogPage>` (global query for Super Admin), `queryForTenant(tenantId: string, filters: AuditLogFilters): Promise<AuditLogPage>` (tenant-scoped, enforces `WHERE tenant_id = $tenantId` at service layer — NFR-004). Both query methods must implement the Zod-validated 10K result-window cap (plan §9 Inline Decision: `(page - 1) * limit < 10000` or throw `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`). `ip_address` must be validated with `z.string().ip()` (handles IPv4 + IPv6 — addresses Analysis ISSUE-010). All filter fields are optional; default page=1, limit=50, max limit=100. `log()` errors are caught, logged via Pino, and swallowed (non-blocking). Export TypeScript interfaces `AuditLogEntry`, `AuditLogFilters`, `AuditLogPage` from plan §4.1.
- **Spec Reference**: Spec §7, §8; Plan §4.1, §9; Analysis ISSUE-002, ISSUE-010
- **Acceptance Criteria**:
  - `log()` writes an entry to the database; verified by querying after insert
  - `queryForTenant()` never returns entries from a different tenant (tested with two tenants)
  - Result-window cap: `page=101, limit=100` returns `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` error
  - IPv6 addresses (e.g., `::1`, `2001:db8::1`) accepted by `log()`
  - `log()` failure does not throw or crash the caller (swallowed, logged)
- **Dependencies**: T008-01 (AuditLog Prisma model must exist)
- **Estimated**: `[L]` ~3h

---

### T008-05 `[M]` `[FR-006]` `[FR-014]` `[NFR-003]`

Implement AuditLogMiddleware Fastify hook

- **File**: `apps/core-api/src/middleware/audit-log.ts`
- **Type**: Create new file
- **Description**: Implement a Fastify `onResponse` hook that reads `request.routeOptions.config.audit` (pattern: `{ action: string, resourceType?: string }`). If present and response status is 2xx/3xx, calls `auditLogService.log()` with `tenantId` from request context, `userId` from `request.user.id`, `ipAddress` from `request.ip`, `userAgent` from `request.headers['user-agent']`, `resourceId` derived from route params (e.g., `request.params.id`). Errors in the hook must be caught and logged but must NOT fail the request (non-blocking pattern per plan §4.2). Export as `auditLogMiddleware` for global registration in `index.ts`.
- **Spec Reference**: Plan §4.2; Spec §7 (Events to Audit)
- **Acceptance Criteria**:
  - Routes without `config.audit` produce no audit entries
  - Routes with `config.audit` produce an entry on 200/201/204 responses
  - Routes with `config.audit` do NOT produce entries on 4xx/5xx responses
  - If `auditLogService.log()` throws, the HTTP response is still sent (non-blocking)
  - No PII (no raw request bodies) included in logged `details`
- **Dependencies**: T008-04 (AuditLogService)
- **Estimated**: `[M]` ~1.5h

---

### T008-06 `[S]` `[P]` `[FR-006]` `[FR-014]`

Add AUDIT_ACTIONS constants

- **File**: `apps/core-api/src/constants/index.ts`
- **Type**: Modify existing
- **Location**: After existing `CACHE_TTL` constants
- **Description**: Add an `AUDIT_ACTIONS` constant object (UPPER_SNAKE_CASE per Art. 7.1) with string literals for all auditable events from spec §7 table: authentication events (`LOGIN`, `LOGOUT`, `FAILED_LOGIN`), user management (`USER_INVITED`, `USER_DEACTIVATED`, `USER_ROLE_CHANGED`), team management (`TEAM_CREATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`), role management (`ROLE_CREATED`, `PERMISSIONS_CHANGED`), plugin management (`PLUGIN_INSTALLED`, `PLUGIN_ENABLED`, `PLUGIN_DISABLED`, `PLUGIN_CONFIGURED`), tenant management (`TENANT_CREATED`, `TENANT_SUSPENDED`, `TENANT_DELETED`), settings (`THEME_CHANGED`, `CONFIG_UPDATED`). Use dot-notation string values (e.g., `AUDIT_ACTIONS.USER_INVITED = 'user.invited'`) for API output consistency.
- **Spec Reference**: Spec §7 (Events to Audit table); Plan §5 Files to Modify
- **Acceptance Criteria**:
  - All auditable events from spec §7 have a constant entry
  - String values use dot-notation (e.g., `'tenant.created'`, `'user.invited'`)
  - TypeScript type of the object is `Record<string, string>` or narrower
  - No compilation errors
- **Dependencies**: None (parallelizable with T008-01, T008-02, T008-03)
- **Estimated**: `[S]` ~20min

---

### T008-07 `[L]` `[P]` `[FR-006]` `[FR-014]`

Unit tests — AuditLogService (≥85% coverage)

- **File**: `apps/core-api/src/__tests__/unit/audit-log.service.test.ts`
- **Type**: Create new file
- **Description**: Vitest unit tests for `AuditLogService` covering: `log()` happy path (entry written to DB), `log()` swallows errors without throwing, `query()` pagination (page/limit/meta.total), `query()` all filter combinations (tenant_id, user_id, action, resource_type, start_date, end_date), `queryForTenant()` tenant isolation (never returns cross-tenant data), result-window cap enforcement (AUDIT_LOG_RESULT_WINDOW_EXCEEDED at ≥10K offset), IPv4 and IPv6 acceptance, max limit=100 enforcement. Use Vitest `vi.mock` for Prisma. Follow AAA pattern; all tests < 100ms. Estimated ~30 test cases.
- **Spec Reference**: Spec §7; Plan §8.1; Constitution Art. 8
- **Acceptance Criteria**:
  - All test cases pass
  - AuditLogService line coverage ≥85%
  - Tenant isolation test: `queryForTenant('tenant-A')` returns 0 rows when all data belongs to `tenant-B`
  - Result-window cap test: `query({ page: 101, limit: 100 })` throws `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`
  - `log()` error-swallowing test: injected Prisma error does not propagate to caller
- **Dependencies**: T008-04 (AuditLogService implemented)
- **Estimated**: `[L]` ~3h

---

### T008-07b `[M]` `[P]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]`

Unit tests — admin.ts error format compliance (Art. 6.2)

- **File**: `apps/core-api/src/__tests__/unit/admin-error-format.test.ts`
- **Type**: Create new file
- **Description**: Vitest unit tests asserting that ALL existing error paths in `admin.ts` return the Art. 6.2 format `{ error: { code: string, message: string } }`. Test every error status code (400, 403, 404, 409, 422, 500) across each existing route group: tenant CRUD, plugin management, analytics, super admin user listing. These tests should be written to capture the pre-T008-00 failures and then pass after T008-00 is applied. 100% coverage of all error response shapes required per plan §8.1. Estimated ~25 test cases.
- **Spec Reference**: Constitution Art. 6.2; Plan §7 Phase 1; Analysis ISSUE-001
- **Acceptance Criteria**:
  - Every error response in `admin.ts` returns `{ error: { code, message } }` shape (no `{ error: 'string', message: '...' }` shapes)
  - All 17 remediated error paths covered by at least one test
  - All tests pass after T008-00 is applied
  - Zero false positives (no test passes before T008-00 if error was non-compliant)
- **Dependencies**: T008-00 (error remediation applied)
- **Estimated**: `[M]` ~2h

**Phase 1 Estimated Story Points: 21**

---

## Phase 2: Super Admin Extensions

> **Objective**: Fill remaining gaps in the Super Admin Panel — dashboard, super admin CRUD, system configuration, system health monitoring, global audit log endpoint, and reactivate alias route. Depends on Phase 1 foundations.

---

### T008-08 `[L]` `[P]` `[FR-005]`

Implement SystemConfigService

- **File**: `apps/core-api/src/services/system-config.service.ts`
- **Type**: Create new file
- **Description**: Implement `SystemConfigService` with four methods per plan §4.4: `getAll(category?: string): Promise<SystemConfigEntry[]>` (list all config, optionally filtered by category), `get(key: string): Promise<SystemConfigEntry>` (throws `CONFIG_KEY_NOT_FOUND` if missing), `update(key: string, value: Json, userId: string): Promise<SystemConfigEntry>` (persists value + updatedBy, invalidates Redis cache, writes audit log entry via `auditLogService`), `isMaintenanceMode(): Promise<boolean>` (cached in Redis with 5-minute TTL key `sys_config:maintenance_mode`). All Prisma queries use parameterized inputs. Redis cache miss falls back to DB gracefully (no throw on cache failure).
- **Spec Reference**: Spec §5 FR-005; Plan §4.4, §3.1.12, §3.1.13
- **Acceptance Criteria**:
  - `get('nonexistent')` throws error with code `CONFIG_KEY_NOT_FOUND`
  - `update()` persists new value and sets `updated_by` to provided userId
  - `isMaintenanceMode()` returns cached value on second call (Redis hit)
  - Redis failure in `isMaintenanceMode()` falls back to DB (no unhandled rejection)
  - `update()` writes an audit log entry (verified via AuditLogService mock)
- **Dependencies**: T008-02 (SystemConfig model), T008-04 (AuditLogService)
- **Estimated**: `[L]` ~3h

---

### T008-09 `[L]` `[P]` `[FR-004]`

Extend AdminService with super admin CRUD methods

- **File**: `apps/core-api/src/services/admin.service.ts`
- **Type**: Modify existing
- **Location**: End of existing `AdminService` class
- **Description**: Add four methods to the existing `AdminService` class per plan §4.5: `listSuperAdmins(page: number, limit: number): Promise<SuperAdminPage>` (paginates `super_admins` table — note: `SuperAdmin` model already exists in schema.prisma per Analysis ISSUE-007), `createSuperAdmin(dto: CreateSuperAdminDto): Promise<SuperAdmin>` (create DB record + create user in Keycloak master realm; throws `SUPER_ADMIN_EXISTS` on duplicate email), `deleteSuperAdmin(id: string): Promise<void>` (guard: count remaining admins first; throws `LAST_SUPER_ADMIN` if this is the last one; then delete DB record + revoke Keycloak role — Edge Case #8), `getSystemHealth(): Promise<SystemHealthStatus>` (probe database, Redis, Keycloak, MinIO; measure latency per dependency; aggregate overall status: `healthy` if all ok, `degraded` if any non-critical dependency degraded, `unhealthy` if DB or Keycloak down).
- **Spec Reference**: Spec §8 FR-004; Plan §4.5, §3.1.9, §3.1.10, §3.1.11; Analysis ISSUE-007
- **Acceptance Criteria**:
  - `listSuperAdmins()` returns paginated results with correct `meta.total`
  - `createSuperAdmin()` with duplicate email throws `SUPER_ADMIN_EXISTS`
  - `deleteSuperAdmin()` with only 1 admin throws `LAST_SUPER_ADMIN` (Edge Case #8)
  - `getSystemHealth()` returns `unhealthy` when database probe fails
  - No new Prisma model created for super_admins (model already exists)
- **Dependencies**: None (super_admins table already exists)
- **Estimated**: `[L]` ~4h

---

### T008-10 `[S]` `[P]` `[FR-007]`

_(Merged into T008-09)_ — `getSystemHealth()` is included in T008-09 above. This task is retained as a marker for dependency tracking.

- **Note**: `getSystemHealth()` implementation is part of T008-09. T008-14 depends on T008-09.
- **Estimated**: `[S]` ~0 (included in T008-09)

---

### T008-11 `[M]` `[FR-001]`

Add GET /api/v1/admin/dashboard route

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After existing route registrations, before route export
- **Description**: Add `GET /api/v1/admin/dashboard` route (plan §3.1.1). Auth: `requireSuperAdmin`. Rate limit: 60 req/min. Response shape: `{ data: { tenants: { total, active, suspended, provisioning }, users: { total }, plugins: { total, active, installed }, health: { status, database, redis, keycloak }, apiCalls24h: 0 } }`. Delegates to `analyticsService.getOverview()` (existing) extended with health data from `adminService.getSystemHealth()`. The `apiCalls24h` field returns `0` (acknowledged placeholder — TD-009). Set `config.audit` = false (dashboard read — no audit entry). Add Zod response schema for type safety.
- **Spec Reference**: Spec §8 FR-001, §4 FR-001; Plan §3.1.1
- **Acceptance Criteria**:
  - Returns 200 with all required fields (`tenants`, `users`, `plugins`, `health`, `apiCalls24h`)
  - Returns 401 with `AUTH_MISSING_TOKEN` when no Bearer token
  - Returns 403 with `AUTH_INSUFFICIENT_ROLE` for non-super_admin user
  - `apiCalls24h` field is present (value 0 acceptable per TD-009)
  - Response matches Art. 6.2 error format on error paths
- **Dependencies**: T008-09 (AdminService health method), T008-00 (error format remediation)
- **Estimated**: `[M]` ~1.5h

---

### T008-12 `[L]` `[FR-004]`

Add GET/POST/DELETE /api/v1/admin/super-admins routes

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After T008-11 route block
- **Description**: Add three Super Admin user management routes per plan §3.1.9–3.1.11. **GET /api/v1/admin/super-admins**: auth `requireSuperAdmin`, query params `page`/`limit` (Zod validation), delegates to `adminService.listSuperAdmins()`. **POST /api/v1/admin/super-admins**: auth `requireSuperAdmin`, body `{ email: z.string().email(), name: z.string().min(1) }`, delegates to `adminService.createSuperAdmin()`, set `config.audit = { action: AUDIT_ACTIONS.SUPER_ADMIN_CREATED }`. **DELETE /api/v1/admin/super-admins/:id**: auth `requireSuperAdmin`, delegates to `adminService.deleteSuperAdmin()`, returns 204, set `config.audit = { action: AUDIT_ACTIONS.SUPER_ADMIN_DELETED }`. Handle 409 `LAST_SUPER_ADMIN` and 409 `SUPER_ADMIN_EXISTS` error codes.
- **Spec Reference**: Spec §8 FR-004; Plan §3.1.9, §3.1.10, §3.1.11; Spec Edge Case #8
- **Acceptance Criteria**:
  - GET returns paginated list with `meta.total`
  - POST returns 201 with new super admin; POST with duplicate email returns 409 `SUPER_ADMIN_EXISTS`
  - DELETE returns 204; DELETE of last admin returns 409 `LAST_SUPER_ADMIN`
  - Audit log entry created for POST and DELETE
  - All error responses follow Art. 6.2 format
- **Dependencies**: T008-09 (AdminService), T008-05 (AuditLogMiddleware), T008-06 (AUDIT_ACTIONS), T008-00 (error format)
- **Estimated**: `[L]` ~2.5h

---

### T008-13 `[M]` `[FR-005]`

Add GET/PATCH /api/v1/admin/system-config routes

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After T008-12 route block
- **Description**: Add two system configuration routes per plan §3.1.12–3.1.13. **GET /api/v1/admin/system-config**: auth `requireSuperAdmin`, optional query param `category` (Zod string), delegates to `systemConfigService.getAll()`. **PATCH /api/v1/admin/system-config/:key**: auth `requireSuperAdmin`, body `{ value: z.unknown() }` (accepts any JSON-serializable value), delegates to `systemConfigService.update(key, value, request.user.id)`, set `config.audit = { action: AUDIT_ACTIONS.CONFIG_UPDATED, resourceType: 'system_config', resourceId: key }`. Return 404 `CONFIG_KEY_NOT_FOUND` if key does not exist.
- **Spec Reference**: Spec §5 FR-005; Plan §3.1.12, §3.1.13
- **Acceptance Criteria**:
  - GET returns all config entries; GET with `?category=maintenance` returns only maintenance entries
  - PATCH updates value and returns updated entry with `updatedAt` timestamp
  - PATCH with unknown key returns 404 `CONFIG_KEY_NOT_FOUND`
  - PATCH creates audit log entry (Config Updated)
  - All error responses follow Art. 6.2 format
- **Dependencies**: T008-08 (SystemConfigService), T008-05 (AuditLogMiddleware), T008-06 (AUDIT_ACTIONS), T008-00 (error format)
- **Estimated**: `[M]` ~1.5h

---

### T008-14 `[S]` `[FR-007]`

Add GET /api/v1/admin/system-health route

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After T008-13 route block
- **Description**: Add `GET /api/v1/admin/system-health` route per plan §3.1.14. Auth: `requireSuperAdmin`. No rate limit (lightweight relative to dashboard). Response: `{ data: { status, uptime, version, dependencies: { database, redis, keycloak, minio }, metrics: { memoryUsageMb, cpuUsagePercent, activeConnections } } }`. Delegates to `adminService.getSystemHealth()`. No audit log (read-only health probe).
- **Spec Reference**: Spec §5 FR-007; Plan §3.1.14
- **Acceptance Criteria**:
  - Returns 200 with all dependency statuses and metrics fields
  - Returns correct `status: 'degraded'` when a non-critical dependency is slow
  - Returns 401/403 for unauthenticated/unauthorized access
  - Response follows Art. 6.2 error format on error paths
- **Dependencies**: T008-09 (AdminService.getSystemHealth()), T008-00 (error format)
- **Estimated**: `[S]` ~45min

---

### T008-15 `[M]` `[FR-006]`

Add GET /api/v1/admin/audit-logs route

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After T008-14 route block
- **Description**: Add `GET /api/v1/admin/audit-logs` route per plan §3.1.8. Auth: `requireSuperAdmin`. Rate limit: 30 req/min (heavy query endpoint). Zod query-param schema `AuditLogQuerySchema` per plan §9 (validates `page`, `limit` max 100, `tenant_id`, `user_id`, `action`, `resource_type`, `start_date`, `end_date` as ISO 8601, and the `.refine()` that enforces `(page - 1) * limit < 10000`). Delegates to `auditLogService.query(filters)`. On validation failure of the result-window, return 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` per plan §9 inline decision. Response includes `meta.total` (true count, may exceed 10K).
- **Spec Reference**: Spec §8 FR-006, §6 Edge Case #6; Plan §3.1.8, §9; Analysis ISSUE-002
- **Acceptance Criteria**:
  - Returns paginated audit log with all filter params functional
  - `page=101&limit=100` returns 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`
  - `meta.total` reflects true count (may be > 10K)
  - Returns 401/403 for unauthenticated/unauthorized
  - All error responses follow Art. 6.2 format
- **Dependencies**: T008-04 (AuditLogService), T008-05 (AuditLogMiddleware), T008-00 (error format)
- **Estimated**: `[M]` ~1.5h

---

### T008-16 `[S]` `[FR-002]`

Add POST /api/v1/admin/tenants/:id/reactivate alias route

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: After existing `/activate` route (for proximity)
- **Description**: Add `POST /api/v1/admin/tenants/:id/reactivate` as a spec-compliant alias for the existing `/activate` route per plan §3.1.6. Auth: `requireSuperAdmin`. Delegates to the same handler as `/activate` (or calls `tenantService.activateTenant(id)` directly). Returns 200 with `{ data: { id, slug, status: 'ACTIVE', name } }`. Error cases: 404 `TENANT_NOT_FOUND`, 409 `TENANT_NOT_SUSPENDED`. The existing `/activate` route should be kept (backward compatibility — Art. 1.2.6 zero-downtime). Set `config.audit = { action: AUDIT_ACTIONS.TENANT_REACTIVATED, resourceType: 'tenant' }`.
- **Spec Reference**: Spec §8 FR-002, §3 US-001; Plan §3.1.6; Constitution Art. 1.2.6
- **Acceptance Criteria**:
  - `POST /reactivate` on ACTIVE tenant returns 409 `TENANT_NOT_SUSPENDED`
  - `POST /reactivate` on non-existent tenant returns 404 `TENANT_NOT_FOUND`
  - `POST /reactivate` on SUSPENDED tenant returns 200 with `status: 'ACTIVE'`
  - Existing `/activate` route still works (backward compat)
  - Audit log entry created on success
- **Dependencies**: T008-00 (error format), T008-05 (AuditLogMiddleware), T008-06 (AUDIT_ACTIONS)
- **Estimated**: `[S]` ~45min

---

### T008-17 `[M]` `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]`

Wire audit logging into existing Super Admin mutation routes

- **File**: `apps/core-api/src/routes/admin.ts`
- **Type**: Modify existing
- **Location**: Existing mutation route definitions (tenant create/suspend/delete, plugin install/enable/disable)
- **Description**: Add `config.audit` declarations to existing Super Admin mutation routes that should generate audit entries per spec §7 (Events to Audit table). Routes to update: `POST /admin/tenants` → `{ action: AUDIT_ACTIONS.TENANT_CREATED }`, `POST /admin/tenants/:id/suspend` → `{ action: AUDIT_ACTIONS.TENANT_SUSPENDED }`, `DELETE /admin/tenants/:id` → `{ action: AUDIT_ACTIONS.TENANT_DELETED }`, plugin install/enable/disable routes → corresponding `PLUGIN_*` actions. The `AuditLogMiddleware` hook reads `config.audit` and fires automatically — no handler-level changes needed.
- **Spec Reference**: Spec §7 (Events to Audit); Plan §4.2, §4.8
- **Acceptance Criteria**:
  - `POST /admin/tenants` creates an audit log entry with `action: 'tenant.created'`
  - `POST /admin/tenants/:id/suspend` creates entry with `action: 'tenant.suspended'`
  - `DELETE /admin/tenants/:id` creates entry with `action: 'tenant.deleted'`
  - Audit entries include `resourceId` = tenant/plugin ID
  - No audit entries created for failed operations (4xx responses)
- **Dependencies**: T008-05 (AuditLogMiddleware), T008-06 (AUDIT_ACTIONS)
- **Estimated**: `[M]` ~1h

---

### T008-18 `[M]` `[P]` `[FR-005]`

Unit tests — SystemConfigService (≥85% coverage)

- **File**: `apps/core-api/src/__tests__/unit/system-config.service.test.ts`
- **Type**: Create new file
- **Description**: Vitest unit tests for `SystemConfigService` covering: `getAll()` with and without category filter, `get()` happy path, `get()` with unknown key throws `CONFIG_KEY_NOT_FOUND`, `update()` persists value and sets `updated_by`, `update()` invalidates Redis cache after write, `isMaintenanceMode()` returns cached value on second call, `isMaintenanceMode()` falls back to DB on Redis failure. Use `vi.mock` for Prisma and ioredis. Estimated ~20 test cases.
- **Spec Reference**: Plan §4.4, §8.1
- **Acceptance Criteria**:
  - All test cases pass
  - SystemConfigService line coverage ≥85%
  - Redis fallback test: mock Redis to throw → `isMaintenanceMode()` still returns correct value from DB
  - Cache invalidation test: verify Redis `del()` called after `update()`
- **Dependencies**: T008-08 (SystemConfigService implemented)
- **Estimated**: `[M]` ~2h

---

### T008-19 `[XL]` `[FR-001]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-007]` `[NFR-002]` `[NFR-003]`

Integration tests — new Super Admin endpoints

- **File**: `apps/core-api/src/__tests__/integration/audit-log-api.integration.test.ts`
- **Type**: Create new file
- **Description**: Vitest integration tests using `buildTestApp()` and real PostgreSQL/Redis (test infrastructure). Test scenarios per plan §8.2: Super Admin dashboard returns correct tenant/user/plugin counts, super admin user CRUD with duplicate-email and last-admin guards, system config GET/PATCH with Redis cache verification, global audit log query with all filter combinations (tenant_id, user_id, action, date range), result-window 10K cap enforcement returning 400, audit log entries created by mutation routes (tenant suspend, etc.), system health endpoint probes all dependencies. Cross-tenant isolation: Super Admin CAN filter by any tenant_id; response `meta.total` reflects true count. NFR-002: audit log query on 30-day range with composite index completes in <500ms. Estimated ~40 integration test cases.
- **Spec Reference**: Plan §8.2; Spec §5 NFR-002, NFR-003; Analysis review
- **Acceptance Criteria**:
  - All test cases pass with real PostgreSQL and Redis
  - 30-day audit log range query completes in < 500ms (NFR-002)
  - Rate limits tested (mock rate limit middleware if needed)
  - Audit middleware integration: mutations produce audit entries
  - Auth enforcement: all endpoints return 403 for non-super_admin tokens
- **Dependencies**: T008-11, T008-12, T008-13, T008-14, T008-15, T008-16, T008-17
- **Estimated**: `[XL]` ~5h

**Phase 2 Estimated Story Points: 24**

---

## Phase 3: Tenant Admin Interface

> **Objective**: Build the complete Tenant Admin API from scratch — `requireTenantAdmin` middleware, `TenantAdminService`, `TenantAdminRoutes` (15 endpoints across dashboard, users, teams, roles, settings, audit log), and route registration.

---

### T008-20 `[S]` `[NFR-003]` `[NFR-004]`

Add requireTenantAdmin middleware to auth.ts

- **File**: `apps/core-api/src/middleware/auth.ts`
- **Type**: Modify existing
- **Location**: After `requireSuperAdmin` export
- **Description**: Export `requireTenantAdmin` as a named constant reusing the existing `requireRole()` utility (addresses Analysis ISSUE-003 and ISSUE-005): `export const requireTenantAdmin = requireRole('tenant_admin', 'tenant_owner', 'admin');`. This is the established pattern used in `tenant-plugins-v1.ts` line 33. Do NOT create a custom implementation with `request.token?.realm_access?.roles` fallback — that is dead code and diverges from `requireRole()`. Error response for unauthorized access: 403 with `AUTH_INSUFFICIENT_ROLE` code (handled by `requireRole()` internally).
- **Spec Reference**: Spec §5 NFR-003, NFR-004; Plan §4.6; Analysis ISSUE-003, ISSUE-005
- **Acceptance Criteria**:
  - `requireTenantAdmin` is exported from `auth.ts`
  - Users with `tenant_admin` role pass the middleware
  - Users with `tenant_owner` role pass the middleware
  - Users with `admin` role pass the middleware
  - Users with only `viewer` role receive 403 `AUTH_INSUFFICIENT_ROLE`
  - Implementation uses `requireRole()` (not a custom implementation)
- **Dependencies**: None (requires `requireRole()` to already exist — confirmed in codebase)
- **Estimated**: `[S]` ~15min

---

### T008-21 `[M]` `[FR-008]`

Implement TenantAdminService.getDashboard()

- **File**: `apps/core-api/src/services/tenant-admin.service.ts`
- **Type**: Create new file (first method; full file created here)
- **Description**: Create `TenantAdminService` class file. Implement `getDashboard(tenantId: string, schemaName: string): Promise<TenantDashboard>` per plan §4.3 and §3.2.1. Executes parallel queries against the tenant schema using parameterized raw SQL (via `db.$queryRaw` with validated schema name from `validateSchemaName()`): user counts by status (`active`, `invited`, `deactivated`), team count, workspace count. Queries core schema via Prisma for: enabled plugin count (`tenant_plugins` where `tenant_id = $1 AND enabled = true`), total plugin count, role counts (system vs custom). Returns `TenantDashboard` typed object. All queries use `Promise.all()` for parallelism.
- **Spec Reference**: Spec §4 FR-008; Plan §4.3, §3.2.1
- **Acceptance Criteria**:
  - `getDashboard()` returns all required fields: users (total/active/invited/deactivated), teams.total, workspaces.total, plugins (enabled/total), roles (system/custom)
  - User counts sum correctly for a tenant with mixed statuses
  - Plugin count matches enabled vs total in `tenant_plugins`
  - All SQL uses `validateSchemaName()` before interpolation (no SQL injection risk)
- **Dependencies**: T008-03 (team_members table — needed by later methods; getDashboard itself uses teams table which already exists), T008-04 (AuditLogService for later methods)
- **Estimated**: `[M]` ~2h

---

### T008-22 `[XL]` `[FR-009]` `[NFR-004]`

Implement TenantAdminService — user management methods

- **File**: `apps/core-api/src/services/tenant-admin.service.ts`
- **Type**: Modify existing (add methods to class started in T008-21)
- **Description**: Implement four user management methods per plan §4.3 and §3.2.2–3.2.5: **`listUsers(tenantId, schemaName, filters)`**: paginated query of tenant schema `users` table, enriched with roles (from core `user_roles` → `roles`) and team memberships (from `team_members` join). Supports search by name/email (ILIKE), filter by status, filter by role name. **`inviteUser(tenantId, schemaName, dto)`**: validate `roleId` exists in tenant, call `keycloakService.inviteUser()` (handles existing Keycloak user — Edge Case #4 per plan §3.2.3), insert user record with `status: 'invited'`, write audit log `user.invited`. **`updateUser(tenantId, schemaName, userId, dto)`**: update name and/or role assignments; write audit log `user.role_changed` if roles change. **`deactivateUser(tenantId, schemaName, userId)`**: count users with `tenant_admin`/`tenant_owner` roles; throw `LAST_TENANT_ADMIN` (409) if this is the last one (Edge Case #7); call `keycloakService.deactivateUser()`; set `status: 'deactivated'`; write audit log `user.deactivated`.
- **Spec Reference**: Spec §3 US-003, §4 FR-009, §6 Edge Cases #4 #7; Plan §4.3, §3.2.2–3.2.5
- **Acceptance Criteria**:
  - `listUsers()` returns enriched users with `roles` and `teams` arrays
  - `listUsers()` with `search='jane'` returns only users whose name or email contains 'jane' (case-insensitive)
  - `inviteUser()` with email of existing Keycloak user adds them to tenant without creating duplicate
  - `deactivateUser()` on last `tenant_admin` throws `LAST_TENANT_ADMIN` (Edge Case #7)
  - All methods enforce tenant isolation (never access other tenant's data)
- **Dependencies**: T008-21 (TenantAdminService class file), T008-03 (team_members table), T008-04 (AuditLogService)
- **Estimated**: `[XL]` ~5h

---

### T008-23 `[L]` `[P]` `[FR-010]`

Implement TenantAdminService — team CRUD methods

- **File**: `apps/core-api/src/services/tenant-admin.service.ts`
- **Type**: Modify existing (add methods)
- **Description**: Implement four team management methods per plan §4.3 and §3.2.6–3.2.9: **`listTeams(tenantId, schemaName, filters)`**: paginated query of tenant schema `teams` table with member count aggregation (`COUNT(tm.user_id)` from `team_members`). Supports optional `workspace_id` filter. **`createTeam(tenantId, schemaName, dto)`**: validate `workspaceId` exists in tenant, insert into `teams`, set `owner_id = request.user.id`, write audit log `team.created`. **`updateTeam(tenantId, schemaName, teamId, dto)`**: update name/description, verify team belongs to this tenant, write audit log. **`deleteTeam(tenantId, schemaName, teamId)`**: verify team exists in tenant (throw `TEAM_NOT_FOUND` if not), delete team (cascades to `team_members` via FK), write audit log.
- **Spec Reference**: Spec §3 US-005, §4 FR-010; Plan §4.3, §3.2.6–3.2.9
- **Acceptance Criteria**:
  - `listTeams()` returns `memberCount` field computed from `team_members` table
  - `createTeam()` with non-existent `workspaceId` throws `WORKSPACE_NOT_FOUND`
  - `deleteTeam()` cascades to remove all `team_members` rows
  - All methods verify team belongs to the current tenant (no cross-tenant access)
- **Dependencies**: T008-21 (class file), T008-03 (team_members table), T008-04 (AuditLogService)
- **Estimated**: `[L]` ~3h

---

### T008-24 `[M]` `[FR-010]`

Implement TenantAdminService — team member methods

- **File**: `apps/core-api/src/services/tenant-admin.service.ts`
- **Type**: Modify existing (add methods)
- **Description**: Implement two team member management methods per plan §4.3 and §3.2.10–3.2.11: **`addTeamMember(tenantId, schemaName, teamId, dto)`**: validate team exists in tenant (throw `TEAM_NOT_FOUND`), validate user exists in tenant (throw `USER_NOT_FOUND`), insert into `team_members` with `role` (`MEMBER` or `ADMIN`), throw `MEMBER_ALREADY_EXISTS` (409) if composite key conflict. Write audit log `member.added`. **`removeTeamMember(tenantId, schemaName, teamId, userId)`**: verify `team_members` row exists (throw `MEMBER_NOT_FOUND`), delete row. Write audit log `member.removed`.
- **Spec Reference**: Spec §3 US-005, §4 FR-010; Plan §4.3, §3.2.10, §3.2.11
- **Acceptance Criteria**:
  - `addTeamMember()` with already-member userId throws `MEMBER_ALREADY_EXISTS`
  - `addTeamMember()` with userId not in tenant throws `USER_NOT_FOUND`
  - `removeTeamMember()` with userId not in team throws `MEMBER_NOT_FOUND`
  - Both methods write audit log entries
- **Dependencies**: T008-23 (team CRUD methods), T008-03 (team_members table)
- **Estimated**: `[M]` ~1.5h

---

### T008-25 `[XL]` `[FR-008]` `[FR-009]` `[NFR-003]` `[NFR-004]`

Implement TenantAdminRoutes — dashboard and user management routes (5 routes)

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Create new file
- **Description**: Create `TenantAdminRoutes` Fastify route plugin. Apply `authMiddleware`, `tenantContextMiddleware`, and `requireTenantAdmin` to all routes (plugin-level preHandler). Add rate limits for all routes per Analysis ISSUE-004: mutations (invite, deactivate, update) at 30 req/min, reads (dashboard, user list) at 120 req/min. Implement 5 routes per plan §3.2.1–3.2.5: **GET /tenant/dashboard** → `tenantAdminService.getDashboard()`, **GET /tenant/users** (with query params: page, limit, search, status, role — Zod validated) → `tenantAdminService.listUsers()`, **POST /tenant/users/invite** (body: email, roleId — Zod validated) → `tenantAdminService.inviteUser()`, set `config.audit`, **PATCH /tenant/users/:id** (body: name?, roleIds? — Zod validated) → `tenantAdminService.updateUser()`, set `config.audit`, **POST /tenant/users/:id/deactivate** → `tenantAdminService.deactivateUser()`, set `config.audit`. All error responses in Art. 6.2 format.
- **Spec Reference**: Spec §8 FR-008, FR-009; Plan §4.7, §3.2.1–3.2.5; Analysis ISSUE-004
- **Acceptance Criteria**:
  - All 5 routes return correct 2xx responses with documented response shapes
  - Rate limiting applied: mutation routes at 30/min, read routes at 120/min
  - `requireTenantAdmin` blocks users without admin role (403)
  - `tenantContextMiddleware` blocks requests to non-existent or SUSPENDED tenants
  - Audit entries created for invite, update, deactivate
- **Dependencies**: T008-21, T008-22 (TenantAdminService methods), T008-20 (requireTenantAdmin)
- **Estimated**: `[XL]` ~5h

---

### T008-26 `[L]` `[FR-010]` `[NFR-003]` `[NFR-004]`

Implement TenantAdminRoutes — team management routes (6 routes)

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Modify existing (add route group to file started in T008-25)
- **Description**: Add 6 team management routes per plan §3.2.6–3.2.11 to the `TenantAdminRoutes` plugin. Rate limits: read routes (GET teams) at 120 req/min; mutation routes (POST, PATCH, DELETE) at 30 req/min. **GET /tenant/teams** (query: page, limit, workspace_id) → `tenantAdminService.listTeams()`, **POST /tenant/teams** (body: name, description?, workspaceId) → `tenantAdminService.createTeam()` + audit, **PATCH /tenant/teams/:id** (body: name?, description?) → `tenantAdminService.updateTeam()` + audit, **DELETE /tenant/teams/:id** → `tenantAdminService.deleteTeam()` + audit (204), **POST /tenant/teams/:id/members** (body: userId, role) → `tenantAdminService.addTeamMember()` + audit, **DELETE /tenant/teams/:id/members/:userId** → `tenantAdminService.removeTeamMember()` + audit (204). Error codes: `TEAM_NOT_FOUND`, `WORKSPACE_NOT_FOUND`, `USER_NOT_FOUND`, `MEMBER_ALREADY_EXISTS`, `MEMBER_NOT_FOUND`.
- **Spec Reference**: Spec §8 FR-010; Plan §3.2.6–3.2.11; Analysis ISSUE-004
- **Acceptance Criteria**:
  - All 6 routes return correct status codes (201/200/204)
  - `POST /teams` with non-existent workspaceId returns 404 `WORKSPACE_NOT_FOUND`
  - `DELETE /teams/:id` returns 404 `TEAM_NOT_FOUND` for team in another tenant
  - `POST /teams/:id/members` with duplicate userId returns 409 `MEMBER_ALREADY_EXISTS`
  - All mutation routes produce audit log entries
- **Dependencies**: T008-23, T008-24 (team service methods), T008-25 (file and plugin structure)
- **Estimated**: `[L]` ~3h

---

### T008-27 `[L]` `[FR-011]` `[NFR-003]`

Implement TenantAdminRoutes — role editor routes (4 routes)

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Modify existing (add route group)
- **Description**: Add 4 role editor routes per plan §3.2.12–3.2.15. All routes wrap the existing `roleService` — no new service logic. **GET /tenant/roles** (query: page, limit) → `roleService.listRoles(tenantId)`, enriched with `isSystem` flag and permissions. **POST /tenant/roles** (body: name, description?, permissionIds[]) → `roleService.createRole()` + audit `role.created`; throw 409 `ROLE_NAME_CONFLICT`, 422 `CUSTOM_ROLE_LIMIT_EXCEEDED`. **PATCH /tenant/roles/:id** (body: name?, description?, permissionIds?) → `roleService.updateRole()`; throw 403 `SYSTEM_ROLE_IMMUTABLE` for system roles (Edge Case #2) + audit `permissions.changed`. **DELETE /tenant/roles/:id** → `roleService.deleteRole()`; throw 403 `SYSTEM_ROLE_IMMUTABLE` for system roles + audit `role.deleted` (204). Rate: reads 120/min, mutations 30/min.
- **Spec Reference**: Spec §3 US-004, §4 FR-011, §6 Edge Case #2; Plan §3.2.12–3.2.15
- **Acceptance Criteria**:
  - `PATCH /roles/:id` for system role returns 403 `SYSTEM_ROLE_IMMUTABLE` (Edge Case #2)
  - `DELETE /roles/:id` for system role returns 403 `SYSTEM_ROLE_IMMUTABLE`
  - `POST /roles` with duplicate name returns 409 `ROLE_NAME_CONFLICT`
  - `GET /roles` response includes `isSystem` boolean on each role
  - All mutation routes produce audit log entries
- **Dependencies**: T008-25 (plugin structure), T008-20 (requireTenantAdmin)
- **Estimated**: `[L]` ~2.5h

---

### T008-28 `[S]` `[FR-011]`

Implement TenantAdminRoutes — permissions listing route

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Modify existing (add single route)
- **Description**: Add `GET /tenant/permissions` route per plan §3.2.16. Delegates to `permissionRegistrationService.listPermissions(tenantId)` (existing service). Groups permissions by source: `pluginId === null` → `core[]`, else grouped by pluginId under `plugins.{pluginId}[]`. Each permission entry: `{ id, key, name, description }`. This directly supports the role editor UI grouped checkbox pattern from US-004. Rate limit: 120 req/min.
- **Spec Reference**: Spec §3 US-004, §4 FR-011; Plan §3.2.16
- **Acceptance Criteria**:
  - Response groups permissions as `{ data: { core: [...], plugins: { 'crm-plugin': [...] } } }`
  - Core permissions (`pluginId = null`) appear under `data.core`
  - Plugin permissions appear under `data.plugins[pluginId]`
  - Returns 401/403 for unauthenticated/unauthorized
- **Dependencies**: T008-25 (plugin structure), T008-27 (adjacent in same route group)
- **Estimated**: `[S]` ~45min

---

### T008-29 `[M]` `[FR-013]`

Implement TenantAdminRoutes — tenant settings GET/PATCH

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Modify existing (add route pair)
- **Description**: Add two tenant settings routes per plan §3.2.17–3.2.18. **GET /tenant/settings**: reads `settings` (Json) and `theme` (Json) from `core.tenants` via `tenantService` (or Prisma directly). Response: `{ data: { settings: {...}, theme: { logoUrl, primaryColor, fontFamily } } }`. **PATCH /tenant/settings**: body `{ settings?: TenantSettingsSchema, theme?: TenantThemeSchema }` validated with existing Zod schemas. Updates via Prisma `tenants.update()`. Writes audit log `settings.changed` (or `theme.changed` if theme was updated). Rate: GET at 120/min, PATCH at 30/min. NFR-005/006/007 are frontend scope; backend provides validation errors with field details.
- **Spec Reference**: Spec §3 US-006, §4 FR-013, §6 US-006; Plan §3.2.17, §3.2.18
- **Acceptance Criteria**:
  - GET returns both `settings` and `theme` fields for the current tenant
  - PATCH with invalid theme color (not hex) returns 400 `VALIDATION_ERROR` with field detail
  - PATCH updates are saved and reflected in subsequent GET
  - Audit entry created on PATCH
  - Cross-tenant isolation: cannot GET/PATCH settings of another tenant
- **Dependencies**: T008-25 (plugin structure), T008-20 (requireTenantAdmin)
- **Estimated**: `[M]` ~1.5h

---

### T008-30 `[M]` `[FR-014]` `[NFR-002]` `[NFR-004]`

Implement TenantAdminRoutes — tenant audit log route

- **File**: `apps/core-api/src/routes/tenant-admin.ts`
- **Type**: Modify existing (add single route)
- **Description**: Add `GET /tenant/audit-logs` route per plan §3.2.19. Auth: `requireTenantAdmin`. Rate limit: 30 req/min (heavy query). Zod query-param schema: same as `AuditLogQuerySchema` from T008-15 but WITHOUT `tenant_id` param (the tenant is auto-scoped from request context). Delegates to `auditLogService.queryForTenant(request.tenantId, filters)`. The service-layer enforcement of `WHERE tenant_id = $currentTenantId` means no `tenant_id` override is possible from query params (NFR-004). Result-window 10K cap applies (same Zod `.refine()` as T008-15). Response shape identical to Super Admin audit log.
- **Spec Reference**: Spec §4 FR-014, §3 US-007, §5 NFR-004; Plan §3.2.19; Spec §6 Edge Case #6
- **Acceptance Criteria**:
  - Returns only audit entries for the current tenant (NFR-004)
  - A `tenant_id` query param is ignored (not accepted as filter override)
  - Result-window cap enforced: 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` at offset ≥10K
  - 30-day range query completes in <500ms (NFR-002)
  - Super Admin audit entries (null tenant_id) do NOT appear in tenant audit log
- **Dependencies**: T008-04 (AuditLogService.queryForTenant()), T008-25 (plugin structure), T008-20 (requireTenantAdmin)
- **Estimated**: `[M]` ~1h

---

### T008-31 `[S]` `[NFR-003]`

Register tenantAdminRoutes and audit log middleware in index.ts

- **File**: `apps/core-api/src/index.ts`
- **Type**: Modify existing
- **Location**: `registerRoutes()` function (register with prefix `/api/v1`)
- **Description**: Two changes to `index.ts`: **1.** Register `tenantAdminRoutes` plugin with prefix `/api/v1` alongside existing route registrations. **2.** Register `auditLogMiddleware` as a global Fastify `onResponse` hook (Phase 1 T008-05). The middleware is a no-op for routes without `config.audit`, so global registration is safe. Ensure import paths use `.js` extension per codebase convention.
- **Spec Reference**: Plan §5 Files to Modify (index.ts); Plan §4.7
- **Acceptance Criteria**:
  - All `/api/v1/tenant/*` routes are reachable after registration
  - `auditLogMiddleware` fires on response for routes with `config.audit`
  - `pnpm build` compiles without errors after changes
  - Existing routes are not affected (no route prefix collision)
- **Dependencies**: T008-25–T008-30 (all tenant admin routes defined), T008-05 (audit middleware)
- **Estimated**: `[S]` ~30min

---

### T008-32 `[XL]` `[FR-008]` `[FR-009]` `[FR-010]` `[NFR-004]`

Unit tests — TenantAdminService (≥85% coverage)

- **File**: `apps/core-api/src/__tests__/unit/tenant-admin.service.test.ts`
- **Type**: Create new file
- **Description**: Vitest unit tests for all `TenantAdminService` methods with mocked Prisma, db, KeycloakService, RoleService, and AuditLogService. Key test scenarios per plan §8.1: `getDashboard()` aggregates all metric fields, `listUsers()` with all filter combinations, `listUsers()` returns enriched roles and teams, `inviteUser()` with existing Keycloak user (Edge Case #4), `deactivateUser()` on last tenant_admin throws `LAST_TENANT_ADMIN` (Edge Case #7), `createTeam()` with non-existent workspace throws `WORKSPACE_NOT_FOUND`, `deleteTeam()` triggers cascade verification, `addTeamMember()` duplicate throws `MEMBER_ALREADY_EXISTS`, all methods write correct audit log entries. Estimated ~50 test cases targeting ≥85% coverage.
- **Spec Reference**: Plan §8.1; Spec §3, §6; Constitution Art. 8
- **Acceptance Criteria**:
  - All test cases pass
  - TenantAdminService line coverage ≥85%
  - Edge Case #4 test: `inviteUser()` with pre-existing email calls `keycloakService.addUserToTenant()` (not `createUser()`)
  - Edge Case #7 test: `deactivateUser()` for last admin throws `LAST_TENANT_ADMIN`
  - Tenant isolation test: service methods called with tenant A's schemaName only access tenant A's tables
- **Dependencies**: T008-21, T008-22, T008-23, T008-24 (all service methods implemented)
- **Estimated**: `[XL]` ~5h

---

### T008-33 `[XL]` `[FR-008]` `[FR-009]` `[FR-010]` `[FR-011]` `[FR-012]` `[FR-013]` `[FR-014]` `[NFR-001]` `[NFR-002]` `[NFR-004]`

Integration tests — Tenant Admin endpoints

- **File**: `apps/core-api/src/__tests__/integration/tenant-admin-api.integration.test.ts`
- **Type**: Create new file
- **Description**: Vitest integration tests using `buildTestApp()` and real PostgreSQL/Keycloak/Redis per plan §8.2. Test scenarios: tenant dashboard metrics accuracy, user listing with role/team enrichment, user invite flow (including existing-user path), user deactivate with last-admin guard, team CRUD with member management, role editor (list/create/update/delete custom roles), system role immutability (403), permissions listing grouped by source, tenant settings GET/PATCH with theme validation, tenant-scoped audit log isolation (only own tenant's entries), cross-tenant isolation test (two tenants' JWT tokens cannot see each other's data — NFR-004), audit log result-window cap, NFR-001 pagination for user list with 1000 users under 1s. Rate limiting: tenant audit log limited at 30/min. Estimated ~45 integration test cases.
- **Spec Reference**: Plan §8.2; Spec §5 NFR-001, NFR-002, NFR-004
- **Acceptance Criteria**:
  - All test cases pass with real infrastructure
  - NFR-001: user list endpoint with 1000 users responds in < 1s (paginated)
  - NFR-004: Tenant A's JWT cannot retrieve Tenant B's users, teams, audit logs
  - Edge Case #7: last-admin deactivation blocked (409) in integration context
  - Audit entries verified in DB after each mutation operation
- **Dependencies**: T008-25, T008-26, T008-27, T008-28, T008-29, T008-30, T008-31
- **Estimated**: `[XL]` ~7h

**Phase 3 Estimated Story Points: 48**

---

## Phase 4: E2E Tests and Hardening

> **Objective**: End-to-end tests for critical admin workflows, full audit trail verification, and edge case coverage. Verifies the entire admin system top-to-bottom.

---

### T008-34 `[M]` `[P]` `[FR-001]` `[FR-002]` `[FR-006]`

E2E test — Super Admin tenant lifecycle with audit trail

- **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
- **Type**: Create new file (first E2E in file)
- **Description**: Full E2E test covering US-001 and US-007: authenticate as Super Admin → GET `/admin/dashboard` (baseline counts) → POST `/admin/tenants` (create tenant) → GET `/admin/tenants` (verify appears) → POST `/admin/tenants/:id/suspend` (suspend) → POST `/admin/tenants/:id/reactivate` (reactivate via new alias route) → DELETE `/admin/tenants/:id` (enter PENDING_DELETION) → GET `/admin/audit-logs?action=tenant.created` (verify full audit trail). Each step asserts correct response shape and HTTP status. Verify `meta.total` on audit log reflects all tenant lifecycle actions.
- **Spec Reference**: Spec §3 US-001, §3 US-007; Plan §7 Phase 4 T008-34
- **Acceptance Criteria**:
  - Full lifecycle completes without errors
  - `/reactivate` alias works (not just `/activate`)
  - Audit log query returns entries for all 4 actions (created, suspended, reactivated, deleted)
  - Dashboard counts change correctly after tenant creation
- **Dependencies**: T008-15, T008-16, T008-17 (Super Admin routes)
- **Estimated**: `[M]` ~2h

---

### T008-35 `[M]` `[P]` `[FR-009]` `[FR-010]`

E2E test — Tenant Admin user and team lifecycle

- **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
- **Type**: Modify existing (add test to file)
- **Description**: Full E2E test covering US-003 and US-005: authenticate as Tenant Admin → POST `/tenant/users/invite` → GET `/tenant/users` (verify invited status) → PATCH `/tenant/users/:id` (assign role) → POST `/tenant/teams` (create team) → POST `/tenant/teams/:id/members` (add invited user) → GET `/tenant/teams` (verify member count) → DELETE `/tenant/teams/:id/members/:userId` → GET `/tenant/users/:id` (verify team removed) → POST `/tenant/users/:id/deactivate` → GET `/tenant/users` (verify deactivated status).
- **Spec Reference**: Spec §3 US-003, US-005; Plan §7 Phase 4 T008-35
- **Acceptance Criteria**:
  - Full lifecycle completes without errors
  - Team member count decrements after member removal
  - Deactivated user status is `deactivated` in subsequent list
  - Entire flow produces audit trail entries verifiable via GET `/tenant/audit-logs`
- **Dependencies**: T008-25, T008-26 (Tenant Admin user + team routes)
- **Estimated**: `[M]` ~2h

---

### T008-36 `[M]` `[P]` `[FR-011]`

E2E test — Role editor: create custom role, assign permissions, assign to user

- **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
- **Type**: Modify existing (add test to file)
- **Description**: Full E2E test covering US-004: GET `/tenant/permissions` (list available permissions grouped) → POST `/tenant/roles` (create "Sales Manager" with 2 permission IDs from permissions list) → GET `/tenant/roles` (verify role appears with permissions) → PATCH `/tenant/roles/:id` (add 1 more permission) → PATCH `/tenant/users/:id` (assign "Sales Manager" role to user) → GET `/tenant/users/:id` (verify role assigned). Also test system-role immutability: attempt PATCH on a system role → verify 403 `SYSTEM_ROLE_IMMUTABLE`.
- **Spec Reference**: Spec §3 US-004, §6 Edge Case #2; Plan §7 Phase 4 T008-36
- **Acceptance Criteria**:
  - Custom role created with correct permissions
  - PATCH on system role returns 403 `SYSTEM_ROLE_IMMUTABLE`
  - User with assigned custom role reflects it in GET `/tenant/users/:id`
  - Permissions grouped correctly in GET `/tenant/permissions` response
- **Dependencies**: T008-27, T008-28 (role + permissions routes)
- **Estimated**: `[M]` ~2h

---

### T008-37 `[M]` `[P]` `[FR-009]` `[FR-011]` `[NFR-003]` `[NFR-004]`

E2E test — Edge cases: last admin guard, system role immutability, cross-tenant isolation

- **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
- **Type**: Modify existing (add tests)
- **Description**: E2E tests for critical edge cases and security properties: **Edge Case #7**: deactivate the only remaining `tenant_admin` → expect 409 `LAST_TENANT_ADMIN`. **Edge Case #8**: delete last super admin → expect 409 `LAST_SUPER_ADMIN`. **Edge Case #2**: PATCH system role → expect 403 `SYSTEM_ROLE_IMMUTABLE`. **NFR-004 cross-tenant**: authenticate as Tenant-A admin → attempt GET `/tenant/users` with Tenant-B's `X-Tenant-Slug` → expect 403 (tenant context mismatch). **NFR-003**: attempt all tenant admin routes without `tenant_admin` role → expect 403 `AUTH_INSUFFICIENT_ROLE`.
- **Spec Reference**: Spec §6 Edge Cases #2 #7 #8; Spec §5 NFR-003 NFR-004; Plan §7 Phase 4 T008-37
- **Acceptance Criteria**:
  - Edge Case #7: 409 `LAST_TENANT_ADMIN` returned correctly
  - Edge Case #8: 409 `LAST_SUPER_ADMIN` returned correctly
  - Edge Case #2: 403 `SYSTEM_ROLE_IMMUTABLE` returned correctly
  - NFR-004: cross-tenant access attempt returns 403 (not data from wrong tenant)
  - NFR-003: non-admin role returns 403 on all tenant admin routes
- **Dependencies**: T008-25, T008-26, T008-27, T008-12 (admin CRUD)
- **Estimated**: `[M]` ~2h

---

### T008-38 `[M]` `[P]` `[FR-006]` `[FR-014]` `[NFR-002]`

E2E test — Audit log query with date range and action filters

- **File**: `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
- **Type**: Modify existing (add tests)
- **Description**: E2E tests for audit log query capabilities: seed known audit entries across two tenants → **Super Admin global log**: query with `action=tenant.created` → verify only `tenant.created` entries returned; query with `tenant_id=X` → verify scoped results; query with 30-day date range → verify performance < 500ms (NFR-002); query with `page=101&limit=100` → verify 400 `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`. **Tenant audit log**: query as Tenant-A admin → verify only Tenant-A's entries returned (no cross-tenant bleed — NFR-004).
- **Spec Reference**: Spec §3 US-007, §5 NFR-002, NFR-004, §6 Edge Case #6; Plan §7 Phase 4 T008-38
- **Acceptance Criteria**:
  - Action filter returns only matching entries
  - 30-day range query completes in <500ms with composite index (NFR-002)
  - Result-window cap returns 400 at offset ≥10K
  - Tenant audit log returns zero entries from other tenants
- **Dependencies**: T008-15, T008-30 (both audit log endpoints)
- **Estimated**: `[M]` ~2h

**Phase 4 Estimated Story Points: 8**

---

## FR/NFR Coverage Matrix

| Requirement | Tasks                                                         | Status              |
| ----------- | ------------------------------------------------------------- | ------------------- |
| FR-001      | T008-11, T008-34                                              | ✅ Covered          |
| FR-002      | T008-00, T008-16, T008-07b, T008-34                           | ✅ Covered          |
| FR-003      | T008-00, T008-17, T008-07b                                    | ✅ Covered          |
| FR-004      | T008-09, T008-12, T008-34, T008-37                            | ✅ Covered          |
| FR-005      | T008-02, T008-08, T008-13, T008-18                            | ✅ Covered          |
| FR-006      | T008-01, T008-04, T008-05, T008-07, T008-15, T008-34, T008-38 | ✅ Covered          |
| FR-007      | T008-09, T008-14                                              | ✅ Covered          |
| FR-008      | T008-21, T008-25, T008-32, T008-33, T008-35                   | ✅ Covered          |
| FR-009      | T008-22, T008-25, T008-32, T008-33, T008-35, T008-37          | ✅ Covered          |
| FR-010      | T008-03, T008-23, T008-24, T008-26, T008-32, T008-33, T008-35 | ✅ Covered          |
| FR-011      | T008-27, T008-28, T008-32, T008-33, T008-36, T008-37          | ✅ Covered          |
| FR-012      | (existing `tenant-plugins-v1.ts` routes)                      | ✅ Delegated        |
| FR-013      | T008-29, T008-33                                              | ✅ Covered          |
| FR-014      | T008-04, T008-07, T008-30, T008-33, T008-38                   | ✅ Covered          |
| NFR-001     | T008-01, T008-25, T008-33 (perf test)                         | ✅ Covered          |
| NFR-002     | T008-01, T008-04, T008-33, T008-38                            | ✅ Covered          |
| NFR-003     | T008-20, T008-25–T008-30, T008-33, T008-37                    | ✅ Covered          |
| NFR-004     | T008-04, T008-22, T008-30, T008-33, T008-37, T008-38          | ✅ Covered          |
| NFR-005     | (frontend scope — backend provides 400 errors)                | ✅ Backend complete |
| NFR-006     | (frontend scope)                                              | ✅ Backend N/A      |
| NFR-007     | (frontend scope)                                              | ✅ Backend N/A      |
| NFR-008     | (delegated to existing provisioning orchestrator)             | ✅ Delegated        |

**FR coverage: 14/14 · NFR coverage: 8/8 (backend-applicable)**

---

## Analysis Issue Resolution

| Issue     | Severity | Resolution                                                                | Task(s)                   |
| --------- | -------- | ------------------------------------------------------------------------- | ------------------------- |
| ISSUE-001 | HIGH     | Added T008-00 (error remediation) in Phase 1 as first task                | T008-00, T008-07b         |
| ISSUE-002 | HIGH     | 10K cap formalized as Inline Decision in plan §9; enforced via Zod refine | T008-04, T008-15, T008-30 |
| ISSUE-003 | MEDIUM   | `requireTenantAdmin` uses `requireRole()` pattern (one-liner)             | T008-20                   |
| ISSUE-004 | MEDIUM   | Rate limits added to all Tenant Admin route tasks                         | T008-25–T008-30           |
| ISSUE-005 | MEDIUM   | Same as ISSUE-003 — custom impl replaced by `requireRole()`               | T008-20                   |
| ISSUE-006 | MEDIUM   | Explicit backfill script file added to T008-03                            | T008-03                   |
| ISSUE-007 | MEDIUM   | T008-09 notes super_admins table already exists                           | T008-09                   |
| ISSUE-008 | LOW      | Tracked; spec update deferred to post-implementation                      | —                         |
| ISSUE-009 | LOW      | Tracked; DELETE roles included in T008-27                                 | T008-27                   |
| ISSUE-010 | LOW      | `z.string().ip()` specified in T008-04 AuditLogService                    | T008-04                   |

---

## Story Points by Phase

| Phase                           | Tasks  | Points  | % Total  |
| ------------------------------- | ------ | ------- | -------- |
| Phase 1: Foundation             | 9      | 21      | 21%      |
| Phase 2: Super Admin Extensions | 11     | 24      | 24%      |
| Phase 3: Tenant Admin Interface | 14     | 48      | 47%      |
| Phase 4: E2E Tests & Hardening  | 5      | 8       | 8%       |
| **Total**                       | **39** | **101** | **100%** |

> Note: T008-10 is a no-op marker (merged into T008-09) and counted as 0 points.

---

## Risk Register

| Risk                                                                            | Level  | Mitigation                                                                               |
| ------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| T008-00 regresses existing admin routes                                         | HIGH   | Write T008-07b tests before/alongside T008-00; run full test suite after each error fix  |
| T008-03 backfill fails for large tenant count                                   | HIGH   | Use per-schema transactions; log success/failure per tenant; dry-run mode in script      |
| T008-22 KeycloakService.inviteUser() behavior for existing users (Edge Case #4) | MEDIUM | Review `keycloak.service.ts` implementation before coding; add explicit integration test |
| T008-33 integration test flakiness (real Keycloak)                              | MEDIUM | Use retry logic; ensure test infrastructure teardown cleans Keycloak users               |
| Phase 3 scope (48 pts) may span multiple sprints                                | MEDIUM | T008-21/22 (dashboard+users) can ship before T008-23/24/26 (teams)                       |

---

## Cross-References

| Document         | Path                                                           |
| ---------------- | -------------------------------------------------------------- |
| Spec             | `.forge/specs/008-admin-interfaces/spec.md`                    |
| Plan             | `.forge/specs/008-admin-interfaces/plan.md`                    |
| Analysis         | `.forge/specs/008-admin-interfaces/analysis.md`                |
| Constitution     | `.forge/constitution.md`                                       |
| Role Service     | `apps/core-api/src/modules/authorization/role.service.ts`      |
| Existing Admin   | `apps/core-api/src/routes/admin.ts`                            |
| Schema Step      | `apps/core-api/src/services/provisioning-steps/schema-step.ts` |
| Auth Middleware  | `apps/core-api/src/middleware/auth.ts`                         |
| Keycloak Service | `apps/core-api/src/services/keycloak.service.ts`               |
