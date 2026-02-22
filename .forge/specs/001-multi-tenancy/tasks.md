# Tasks: 001 - Multi-Tenancy

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Complete                                 |
| Author | forge-scrum                              |
| Date   | 2026-02-22                               |
| Spec   | `.forge/specs/001-multi-tenancy/spec.md` |
| Plan   | `.forge/specs/001-multi-tenancy/plan.md` |

---

## Legend

- `[FR-NNN]` / `[NFR-NNN]` — Requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h (must be split — none present)
- Status: `[ ]` pending · `[x]` done · `[-]` skipped
- **ADR** — Architectural Decision Record governing the implementation

---

## Phase 1: Database & Core Backend (Sprint 3 — 23 pts)

**Objective**: Database migration, provisioning orchestrator, deletion scheduler,
and all backend service-level changes. These tasks are the foundation for Phases 2 & 3.

---

### T001-01: Add `deletionScheduledAt` column to Prisma schema

- **Status**: done
- **Story Points**: 1
- **Size**: `[S]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: none
- **Assignee**: unassigned
- **FR Coverage**: `[FR-007]`
- **Description**: Add `deletionScheduledAt DateTime? @map("deletion_scheduled_at")` to
  the `Tenant` model in `packages/database/prisma/schema.prisma`. Generate and apply a
  Prisma migration that adds the nullable column (default null) with a B-TREE index
  (`idx_tenants_deletion_scheduled_at`). Also verify and add B-TREE index on
  `tenants.status` (`idx_tenants_status`) if not present. Regenerate Prisma client.
- **Files Affected**:
  - `packages/database/prisma/schema.prisma` (modify)
  - `packages/database/prisma/migrations/YYYYMMDD_add_deletion_scheduled_at/` (create)
- **Tests Required**: integration — verify column exists and accepts null/timestamp values
- **Acceptance Criteria**:
  - [x] `deletionScheduledAt` field present in Prisma `Tenant` model
  - [x] Migration file created and applies cleanly
  - [x] `idx_tenants_deletion_scheduled_at` B-TREE index created
  - [x] Prisma client regenerated without errors
  - [x] Integration test: column accepts NULL and a valid timestamp

---

### T001-02: Fix slug validation regex

- **Status**: done
- **Story Points**: 1
- **Size**: `[S]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: none
- **Assignee**: unassigned
- **FR Coverage**: `[FR-004]`
- **Description**: Update slug validation from `/^[a-z0-9-]{1,50}$/` to
  `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3–64 chars, must start with a letter, must not
  end with a hyphen). Update in: (1) `TenantService` slug validation, (2) Zod schema in
  admin routes, (3) any shared validation utilities.
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify)
  - `apps/core-api/src/routes/admin.ts` (modify — Zod schema)
- **Tests Required**: unit — ≥10 slug pattern cases including edge cases (3-char, 64-char,
  leading hyphen, trailing hyphen, uppercase, special chars)
- **Acceptance Criteria**:
  - [x] Regex updated to `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` in all locations
  - [x] Unit tests cover: valid 3-char, valid 64-char, invalid leading hyphen,
        invalid trailing hyphen, invalid uppercase, invalid special chars, invalid 2-char,
        invalid 65-char, valid mixed alphanumeric, valid with hyphens mid-string
  - [x] Existing slug tests still pass

---

### T001-03: Implement provisioning state machine

- **Status**: done
- **Story Points**: 8
- **Size**: `[XL]` — large but cannot be split further; well-defined internal structure
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: none
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-002]` `[FR-011]` `[NFR-006]`
- **ADR**: ADR-015
- **Description**: Implement the `ProvisioningOrchestrator` class per ADR-015. Define the
  `ProvisioningStep` interface with `execute()` and `rollback()` methods. Implement step
  execution with 3× retry and exponential backoff (1s, 2s, 4s). Implement reverse-order
  rollback on terminal failure. Update tenant `settings.provisioningState` in the DB
  after each step. Enforce a 90-second total timeout via `AbortController`. Extract
  existing schema creation and Keycloak provisioning from `TenantService.createTenant`
  into separate step classes:
  - `SchemaStep` — creates PostgreSQL schema + runs base migrations
  - `KeycloakRealmStep` — creates Keycloak realm
  - `KeycloakClientsStep` — creates Keycloak clients for the realm
  - `KeycloakRolesStep` — creates Keycloak roles + permissions
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/index.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/schema-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-realm-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-clients-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-roles-step.ts` (create)
  - `apps/core-api/src/services/tenant.service.ts` (modify — refactor `createTenant`)
- **Tests Required**:
  - unit: orchestrator retry logic (3 retries, correct backoff delays)
  - unit: orchestrator rollback (reverse order, handles rollback failures gracefully)
  - unit: each step's `execute()` and `rollback()` independently
  - unit: 90-second timeout enforcement
  - integration: full provisioning success flow (all steps)
  - integration: provisioning failure at each step (verify rollback)
- **Acceptance Criteria**:
  - [x] `ProvisioningStep` interface defined with `execute()` and `rollback()` signatures
  - [x] `ProvisioningOrchestrator.provision()` runs all 4 steps in sequence
  - [x] Failed step retried up to 3× with 1s/2s/4s exponential backoff
  - [x] Terminal failure triggers reverse-order rollback of completed steps
  - [x] Rollback failure is logged + stored in `settings.provisioningError` (does not crash)
  - [x] `settings.provisioningState` updated after each step with correct status
  - [x] AbortController enforces 90-second total timeout
  - [x] All unit tests pass (est. 12 for orchestrator + 4 each for 4 step classes)
  - [x] Integration: full flow results in tenant status `ACTIVE`

---

### T001-04: Add MinIO bucket creation step

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: T001-03
- **Assignee**: unassigned
- **FR Coverage**: `[FR-003]`
- **Description**: Implement `MinioBucketStep` provisioning step. Create a MinIO bucket
  named `tenant-{slug}` with the default access policy. Implement `rollback()` to delete
  the bucket. Integrate into the provisioning step array in `ProvisioningOrchestrator`
  after the `KeycloakRolesStep`.
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-steps/minio-bucket-step.ts` (create)
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (modify — add step)
- **Tests Required**:
  - unit: bucket creation with correct name format (`tenant-{slug}`)
  - unit: bucket rollback (deletion)
  - integration: verify bucket exists after successful provisioning
- **Acceptance Criteria**:
  - [x] `MinioBucketStep.execute()` creates bucket `tenant-{slug}`
  - [x] `MinioBucketStep.rollback()` deletes the bucket
  - [x] Step registered in orchestrator after `KeycloakRolesStep`
  - [x] Unit tests: create + rollback (est. 4 tests)
  - [x] Integration: bucket confirmed to exist post-provisioning

---

### T001-05: Add admin user + invitation email steps

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: T001-03
- **Assignee**: unassigned
- **FR Coverage**: `[FR-012]`
- **Description**: Implement `AdminUserStep` — create a Keycloak user with the provided
  `adminEmail`, assign `tenant-admin` realm role, set required action to update password.
  Implement `InvitationStep` — send invitation email. Invitation is **non-blocking** per
  Edge Case #10: if email fails after 3 retries, provisioning still succeeds, a warning
  is logged, and `invitationStatus: 'failed'` is stored in the tenant settings.
  `AdminUserStep` implements `rollback()` (delete Keycloak user); `InvitationStep` has
  no rollback (email is fire-and-forget).
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-steps/admin-user-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/invitation-step.ts` (create)
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (modify — add steps)
- **Tests Required**:
  - unit: admin user creation with correct role assignment
  - unit: invitation email sending (mock email service)
  - unit: non-blocking behavior — provisioning succeeds even if email fails after 3 retries
  - unit: admin user rollback (deletion)
  - integration: full provisioning flow confirms admin user presence in Keycloak
- **Acceptance Criteria**:
  - [x] `AdminUserStep.execute()` creates Keycloak user + assigns `tenant-admin` role
  - [x] `AdminUserStep.rollback()` deletes the Keycloak user
  - [x] `InvitationStep.execute()` sends invitation email
  - [x] Email failure (3× retry exhausted) → provisioning continues (non-blocking)
  - [x] Email failure warning logged + stored in tenant settings
  - [x] Unit tests: est. 4 for AdminUserStep + 3 for InvitationStep

---

### T001-06: Implement soft delete with 30-day scheduled cleanup

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: T001-01
- **Assignee**: unassigned
- **FR Coverage**: `[FR-007]`
- **Description**: Modify `TenantService.deleteTenant` to set
  `deletionScheduledAt = NOW() + 30 days` and status to `PENDING_DELETION` (instead of
  any immediate hard delete). Create `DeletionScheduler` service that runs every 6 hours,
  queries tenants where `status = 'PENDING_DELETION' AND deletion_scheduled_at <= NOW()`,
  and calls `hardDeleteTenant` for each. Register the scheduler on server startup with
  graceful shutdown (clear interval on `SIGTERM`).
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — `deleteTenant`)
  - `apps/core-api/src/services/deletion-scheduler.ts` (create)
  - `apps/core-api/src/index.ts` (modify — register `DeletionScheduler` on startup)
- **Tests Required**:
  - unit: `deleteTenant` sets `deletionScheduledAt` to exactly 30 days from now
  - unit: `DeletionScheduler.processExpired()` finds and processes correct tenants
  - unit: `DeletionScheduler` handles `hardDeleteTenant` failures gracefully (logs, continues)
  - integration: end-to-end deletion lifecycle (create → soft delete → verify scheduled →
    simulate expiry → verify hard delete)
- **Acceptance Criteria**:
  - [x] `deleteTenant` sets `status = PENDING_DELETION` and `deletionScheduledAt = NOW() + 30d`
  - [x] `DeletionScheduler` runs every 6 hours (configurable)
  - [x] `processExpired()` queries by `status = PENDING_DELETION AND deletion_scheduled_at <= NOW()`
  - [x] Scheduler failure handling: logs error + continues (no crash)
  - [x] Graceful shutdown: interval cleared on `SIGTERM`
  - [x] Scheduler registered at server startup

---

### T001-07: Fix tenant context middleware for Super Admin + SUSPENDED tenants

- **Status**: done
- **Story Points**: 2
- **Size**: `[S]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: none
- **Assignee**: unassigned
- **FR Coverage**: `[FR-006]`
- **Description**: Currently `tenant-context.ts` returns 403 for ALL non-ACTIVE tenants.
  Fix to allow Super Admins full read/write access to SUSPENDED and PENDING_DELETION
  tenants. Regular tenant users continue to receive 403 on SUSPENDED tenants. All users
  receive 404 on DELETED tenants.
- **Files Affected**:
  - `apps/core-api/src/middleware/tenant-context.ts` (modify)
- **Tests Required**:
  - unit: Super Admin can access SUSPENDED tenant (200, no 403)
  - unit: regular user gets 403 on SUSPENDED tenant
  - unit: all users get 404 on DELETED tenant
  - unit: Super Admin access to PENDING_DELETION tenant works
  - integration: API request flow with SUSPENDED tenant + Super Admin JWT
- **Acceptance Criteria**:
  - [x] Super Admin JWT bypasses 403 on SUSPENDED tenants
  - [x] Regular user JWT still receives 403 on SUSPENDED tenants
  - [x] DELETED tenant returns 404 for all roles
  - [x] PENDING_DELETION tenant accessible by Super Admin
  - [x] All 5 unit tests pass

---

### T001-08: Fix reactivation path (PENDING_DELETION → SUSPENDED)

- **Status**: done
- **Story Points**: 1
- **Size**: `[S]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: T001-01
- **Assignee**: unassigned
- **FR Coverage**: `[FR-005]`
- **Description**: Update the activate endpoint logic: when reactivating a
  `PENDING_DELETION` tenant, transition to `SUSPENDED` (not `ACTIVE`) and clear
  `deletionScheduledAt`. When activating a `SUSPENDED` tenant, transition to `ACTIVE`
  (unchanged existing behaviour).
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — activate logic)
  - `apps/core-api/src/routes/admin.ts` (modify — activate route handler)
- **Tests Required**:
  - unit: `PENDING_DELETION → SUSPENDED` (not ACTIVE)
  - unit: `SUSPENDED → ACTIVE` (unchanged)
  - unit: `deletionScheduledAt` cleared on reactivation
  - integration: reactivation API endpoint with PENDING_DELETION tenant
- **Acceptance Criteria**:
  - [x] Reactivating `PENDING_DELETION` sets status to `SUSPENDED`
  - [x] `deletionScheduledAt` set to `null` on reactivation
  - [x] Reactivating `SUSPENDED` sets status to `ACTIVE` (no regression)
  - [x] Integration: POST `/activate` returns correct status + null `deletionScheduledAt`

---

### T001-09: Add `adminEmail` and `pluginIds` to `CreateTenantInput`

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 1
- **Sprint**: 3
- **Dependencies**: T001-03, T001-05
- **Assignee**: unassigned
- **FR Coverage**: `[FR-012]` `[FR-013]`
- **Description**: Extend the `CreateTenantInput` interface and Zod validation schema to
  include `adminEmail` (required, email format) and `pluginIds` (optional, array of
  UUIDs, default `[]`). Update `TenantService.createTenant` to pass these fields through
  to the provisioning orchestrator. After provisioning completes, install selected plugins
  via the existing `installPlugin` method for each UUID in `pluginIds`.
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — `CreateTenantInput` type
    - `createTenant`)
  - `apps/core-api/src/routes/admin.ts` (modify — Zod schema for POST /tenants)
- **Tests Required**:
  - unit: validation rejects missing `adminEmail`
  - unit: validation accepts empty `pluginIds` array
  - unit: `installPlugin` called with correct IDs after provisioning completes
  - integration: create tenant with `adminEmail` + `pluginIds` — verify installed
- **Acceptance Criteria**:
  - [x] `adminEmail` required field with Zod `.email()` validation
  - [x] `pluginIds` optional array of UUIDs (defaults to `[]`)
  - [x] Missing `adminEmail` returns 400 `VALIDATION_ERROR`
  - [x] `installPlugin` called once per UUID in `pluginIds` post-provisioning
  - [x] Integration test: tenant created with plugins listed as enabled

---

## Phase 2: API Endpoints & Business Logic (Sprint 4 — 15 pts)

**Objective**: All API route changes, new endpoints, and comprehensive integration test
coverage. Tasks T001-11 and T001-13 are parallelizable with each other.

---

### T001-10: Update POST /admin/tenants request body schema

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: T001-09
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]`
- **Description**: Update the Fastify route handler for `POST /api/v1/admin/tenants` to
  accept the expanded body (`adminEmail`, `pluginIds`, `theme`). Update the Zod
  validation schema. Ensure the 201 response includes `settings.provisioningState` with
  all 7 step entries at `status: 'pending'`. Update any OpenAPI/Swagger annotations.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify)
- **Tests Required**:
  - integration: POST with full body (all fields) returns 201 + provisioningState
  - integration: POST with minimal body (name + adminEmail only) succeeds
  - integration: POST with invalid fields returns 400 with field-specific errors
  - integration: 201 response body contains `provisioningState.steps` array
- **Acceptance Criteria**:
  - [x] Route accepts `adminEmail`, `pluginIds`, `theme` in request body
  - [x] 201 response includes `settings.provisioningState` with all 7 steps
  - [x] Invalid body returns 400 `VALIDATION_ERROR` with field details
  - [x] OpenAPI annotations updated

---

### T001-11: Implement slug availability check endpoint

- **Status**: done
- **Story Points**: 1
- **Size**: `[S]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-004]`
- **Description**: Add `GET /api/v1/admin/tenants/check-slug?slug=xxx` endpoint. Validate
  slug format with Zod (same regex from T001-02). Query database for existing tenant with
  that slug. Return `{ slug, available: boolean }`. Requires Super Admin auth.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — add route)
- **Tests Required**:
  - integration: available slug returns `{ available: true }`
  - integration: taken slug returns `{ available: false }`
  - integration: invalid slug format returns 400
- **Acceptance Criteria**:
  - [x] `GET /api/v1/admin/tenants/check-slug?slug=xxx` registered and reachable
  - [x] Valid, available slug returns 200 `{ slug, available: true }`
  - [x] Valid, taken slug returns 200 `{ slug, available: false }`
  - [x] Invalid format returns 400 `VALIDATION_ERROR`
  - [x] Requires Super Admin auth (401 without token, 403 without role)

---

### T001-12: Implement resend-invite endpoint

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: T001-05
- **Assignee**: unassigned
- **FR Coverage**: `[FR-012]`
- **Description**: Add `POST /api/v1/admin/tenants/:id/resend-invite` endpoint. Look up
  the tenant's admin email from Keycloak realm. Verify the invitation has not yet been
  accepted. Re-send the invitation email. Return 200 on success with `sentAt` timestamp.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — add route)
- **Tests Required**:
  - integration: successful resend returns 200 + `sentAt`
  - integration: tenant not found returns 404 `TENANT_NOT_FOUND`
  - integration: already-accepted invitation returns 400 `INVITATION_ALREADY_ACCEPTED`
  - integration: no admin email configured returns 400 `NO_ADMIN_EMAIL`
- **Acceptance Criteria**:
  - [x] `POST /api/v1/admin/tenants/:id/resend-invite` registered
  - [x] Success: 200 `{ message, sentAt }`
  - [x] Tenant not found: 404 `TENANT_NOT_FOUND`
  - [x] Already accepted: 400 `INVITATION_ALREADY_ACCEPTED`
  - [x] No email: 400 `NO_ADMIN_EMAIL`
  - [x] Email send failure: 500 `EMAIL_SEND_FAILED`

---

### T001-13: Add theme validation to PATCH /admin/tenants/:id

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-008]`
- **Description**: Add `TenantThemeSchema` Zod validation to the PATCH endpoint. Validate:
  `logoUrl` (URL), `faviconUrl` (URL), `primaryColor` / `secondaryColor` / `accentColor`
  (hex regex `/^#[0-9a-fA-F]{6}$/`), `fontFamily` (string, max 100 chars), `customCss`
  (string, max 10,240 bytes = 10KB). Return 400 with specific field errors on failure.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — PATCH handler)
- **Tests Required**:
  - integration: valid theme update succeeds (200)
  - integration: invalid hex color returns 400 `THEME_VALIDATION`
  - integration: CSS exceeding 10KB returns 400
  - integration: invalid URL format returns 400
  - unit: `TenantThemeSchema` validates all 7 field constraints independently
- **Acceptance Criteria**:
  - [x] `TenantThemeSchema` Zod schema defined with all 7 fields
  - [x] Each invalid field returns 400 with specific field path in error `details`
  - [x] Custom CSS max 10,240 bytes enforced
  - [x] Valid partial theme update (subset of fields) succeeds

---

### T001-14: Update DELETE /admin/tenants/:id for soft deletion

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: T001-06
- **Assignee**: unassigned
- **FR Coverage**: `[FR-007]`
- **Description**: Update the DELETE route handler to call the modified `deleteTenant`
  which now sets `deletionScheduledAt`. Return 200 with the deletion schedule info
  (`deletionScheduledAt`, `status: PENDING_DELETION`). Guard: if tenant is already in
  `PENDING_DELETION`, return 400. Only allow deletion from `SUSPENDED` or `ACTIVE`
  status.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — DELETE handler)
- **Tests Required**:
  - integration: DELETE sets status to `PENDING_DELETION` with correct date (+30 days)
  - integration: DELETE on already-`PENDING_DELETION` tenant returns 400
  - integration: response includes `deletionScheduledAt` timestamp
- **Acceptance Criteria**:
  - [x] DELETE returns 200 `{ id, status: 'PENDING_DELETION', deletionScheduledAt, message }`
  - [x] `deletionScheduledAt` equals approximately `NOW() + 30 days`
  - [x] DELETE on `PENDING_DELETION` tenant returns 400
  - [x] DELETE on `DELETED` tenant returns 404

---

### T001-15: Expand GET /admin/tenants filter options

- **Status**: done
- **Story Points**: 1
- **Size**: `[S]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: T001-01
- **Assignee**: unassigned
- **FR Coverage**: `[FR-005]`
- **Description**: Add `PENDING_DELETION` and `DELETED` to the allowed status filter
  values in the GET `/api/v1/admin/tenants` list endpoint query parameter Zod validation.
  Include `deletionScheduledAt` in every tenant object in the response.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — GET handler + Zod schema)
- **Tests Required**:
  - integration: `?status=PENDING_DELETION` returns only PENDING_DELETION tenants
  - integration: response objects include `deletionScheduledAt` field (null or timestamp)
- **Acceptance Criteria**:
  - [x] `PENDING_DELETION` accepted as valid status filter value
  - [x] `DELETED` accepted as valid status filter value
  - [x] All tenant objects in list response include `deletionScheduledAt`
  - [x] Invalid status value still returns 400

---

### T001-16: Integration tests for all modified/new endpoints

- **Status**: done
- **Story Points**: 5
- **Size**: `[L]`
- **Phase**: 2
- **Sprint**: 4
- **Dependencies**: T001-10, T001-11, T001-12, T001-13, T001-14, T001-15
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-002]` `[FR-003]` `[FR-004]` `[FR-005]` `[FR-007]` `[FR-008]` `[FR-012]`
- **Description**: Comprehensive integration test suite covering all endpoint changes.
  Target: **85% coverage** for the admin routes module (Art. 4.1, Art. 8.1). Uses
  `buildTestApp()` helper pattern (see decision log — workspace-resources architecture
  note). Include concurrent slug creation race condition test.
- **Files Affected**:
  - `apps/core-api/src/__tests__/tenant/integration/tenant-lifecycle.integration.test.ts`
    (create or extend)
  - `apps/core-api/src/__tests__/tenant/integration/tenant-provisioning.integration.test.ts`
    (create)
- **Tests Required** (est. ~35 integration tests total across both files):
  - Full provisioning flow (create → PROVISIONING → ACTIVE)
  - Provisioning failure + rollback verification
  - Soft delete → scheduled deletion → hard delete lifecycle
  - Slug availability check: available + taken + invalid
  - Resend invite: success + already accepted + not found
  - Theme update validation: valid + all invalid field cases
  - PENDING_DELETION reactivation → SUSPENDED (not ACTIVE)
  - Concurrent slug creation → 409 conflict
  - Super Admin access to SUSPENDED tenant → no 403
- **Acceptance Criteria**:
  - [x] All 9 scenario groups covered with at least one test each
  - [x] Admin routes module reaches ≥85% coverage
  - [x] Tests use `buildTestApp()` (not standalone Fastify)
  - [x] Tests use `testContext.auth.createMockToken()` for JWT generation
  - [x] All tests clean up after themselves (no leaked data)

---

## Phase 3: Frontend Components & Integration (Sprint 4–5 — 42 pts)

**Objective**: Build all 5 new UI components, replace the creation modal with a 4-step
wizard, update existing components, add accessibility, and write frontend tests.
Tasks T001-17 through T001-21 (component builds) are fully parallelizable.

---

### T001-17: Build StepWizard component

- **Status**: done
- **Story Points**: 5
- **Size**: `[L]`
- **Phase**: 3
- **Sprint**: 4
- **Dependencies**: none (uses existing `@plexica/ui` primitives)
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-013]`
- **ADR**: ADR-016
- **Description**: Build the `StepWizard` component in `packages/ui` per design spec
  Screen 2. Includes:
  - Step indicator: circles + connectors + labels (hidden on mobile)
  - Navigation: Back / Next / Skip (optional steps only) / Cancel buttons
  - `isNextDisabled` prop disables Next when step validation fails
  - Focus trap via Dialog component
  - WCAG 2.1 AA: `aria-current="step"` on active circle, `role="progressbar"` on
    overall indicator
- **Files Affected**:
  - `packages/ui/src/components/step-wizard.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export `StepWizard`)
- **Tests Required**: see T001-27
- **Acceptance Criteria**:
  - [x] Renders correct number of step circles from `steps` prop
  - [x] Active step circle has `aria-current="step"`
  - [x] Next button disabled when `isNextDisabled=true`
  - [x] Skip button only rendered for steps with `isOptional: true`
  - [x] `onNext`, `onBack`, `onSkip`, `onCancel` callbacks fire on button click
  - [x] Focus trap active within wizard Dialog
  - [x] Labels hidden on mobile (responsive)
  - [x] Keyboard: Enter on Next advances; Esc triggers cancel

---

### T001-18: Build ProvisioningProgress component

- **Status**: done
- **Story Points**: 5
- **Size**: `[L]`
- **Phase**: 3
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[NFR-006]`
- **Description**: Build the `ProvisioningProgress` component per design spec. Renders:
  - Per-step list with status icons: pending / in-progress / complete / error / skipped
  - Overall progress bar using `@plexica/ui` Progress component
  - Estimated time remaining (derived from step count + elapsed time)
  - Retry attempt counter (shown when `retryAttempt > 0`)
  - Success state (all checkmarks)
  - Failure state (error message + manual retry button)
  - `aria-live="polite"` region announces step completion events
- **Files Affected**:
  - `packages/ui/src/components/provisioning-progress.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export `ProvisioningProgress`)
- **Tests Required**: see T001-27
- **Acceptance Criteria**:
  - [x] All 5 step statuses render with distinct visual indicators
  - [x] Progress bar percentage matches `overallProgress` from props
  - [x] Error state shows error message + retry attempt count
  - [x] Success state shows all checkmarks
  - [x] `aria-live` region present and updates on step change

---

### T001-19: Build ColorPicker component

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-008]`
- **Description**: Build the `ColorPicker` composite input per design spec. Components:
  - Color swatch button displaying the current color
  - Clicking swatch opens native `<input type="color">` or custom popover
  - Hex text input with inline validation for `#RRGGBB` format
  - Accessible: `aria-label`, keyboard support (Enter/Space open, Esc close)
  - Disabled state prevents interaction
- **Files Affected**:
  - `packages/ui/src/components/color-picker.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export `ColorPicker`)
- **Tests Required**: see T001-27
- **Acceptance Criteria**:
  - [x] Swatch displays current color from `value` prop
  - [x] Hex input validates `/^#[0-9a-fA-F]{6}$/` format
  - [x] `onChange` fires only with valid hex values
  - [x] Disabled state: swatch + input non-interactive
  - [x] Keyboard: Enter/Space opens picker, Esc closes

---

### T001-20: Build DeletionCountdown component

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-007]`
- **Description**: Build the `DeletionCountdown` component per design spec. Two variants:
  - `inline` — compact text for list rows (e.g., "29 days")
  - `banner` — full warning banner for detail modal
    Urgency escalation: `> 7 days` → amber; `≤ 7 days` → bold amber; `≤ 24 hours` → red
    pulse animation. Refreshes every hour via `setInterval`. `role="timer"`,
    `aria-live="polite"`. Shows "Deletion imminent" when date has passed.
- **Files Affected**:
  - `packages/ui/src/components/deletion-countdown.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export `DeletionCountdown`)
- **Tests Required**: see T001-27
- **Acceptance Criteria**:
  - [x] `inline` variant renders compact countdown text
  - [x] `banner` variant renders full warning banner
  - [x] `> 7 days` → amber styling
  - [x] `≤ 7 days` → bold amber styling
  - [x] `≤ 24 hours` → red pulse styling
  - [x] Past `deletionScheduledAt` → "Deletion imminent"
  - [x] `aria-live="polite"` region present

---

### T001-21: Build ThemePreview component

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 4
- **Dependencies**: none
- **Parallelizable**: `[P]`
- **Assignee**: unassigned
- **FR Coverage**: `[FR-008]`
- **Description**: Build the `ThemePreview` component per design spec. Miniature app shell
  (~300×400 px) rendering sidebar, header, button, and body text. Applies provided theme
  values (colors, logo, font) in real-time via CSS custom properties. Custom CSS scoped to
  preview container. `role="img"` (decorative, not interactive). Logo loading error state
  shows placeholder.
- **Files Affected**:
  - `packages/ui/src/components/theme-preview.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export `ThemePreview`)
- **Tests Required**: see T001-27
- **Acceptance Criteria**:
  - [x] Renders with default (fallback) theme when no props provided
  - [x] Custom `primaryColor`, `secondaryColor`, `accentColor` applied via CSS vars
  - [x] Logo `<img>` src set from `logoUrl` prop
  - [x] Logo `onerror` → placeholder/fallback shown
  - [x] `role="img"` on root element

---

### T001-22: Replace CreateTenantModal with 4-step wizard

- **Status**: done
- **Story Points**: 8
- **Size**: `[XL]` — large; well-defined 4-step scope, cannot be split without breaking
  the feature boundary
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-17, T001-18, T001-19, T001-20, T001-21, T001-10, T001-11
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-004]` `[FR-008]` `[FR-009]` `[FR-012]` `[FR-013]`
- **ADR**: ADR-016
- **Description**: Build the `CreateTenantWizard` component using `StepWizard`,
  `ProvisioningProgress`, `ColorPicker`, and `ThemePreview`. 4 steps:
  1. **Basics** — name (auto-generates slug via slugify), slug (debounced async
     availability check with 300ms debounce), admin email
  2. **Plugins** — checkbox list of available plugins (step is skippable)
  3. **Theme** — logo URL, primary/secondary/accent colors, font, custom CSS (skippable)
  4. **Review** — summary with "Edit" links back to each step

  Uses `useWizardState` hook (ADR-016) backed by `useReducer`. Per-step Zod validation
  via React Hook Form. On "Create Tenant" submission, transitions to
  `ProvisioningProgress` view with polling at 2-second intervals. Handles success and
  failure states per design spec. Remove old `CreateTenantModal.tsx`. Update parent
  component imports. SessionStorage persistence for crash recovery.

- **Files Affected**:
  - `apps/super-admin/src/components/tenants/CreateTenantWizard.tsx` (create)
  - `apps/super-admin/src/hooks/useWizardState.ts` (create)
  - `apps/super-admin/src/components/tenants/wizard-schemas.ts` (create)
  - `apps/super-admin/src/components/tenants/CreateTenantModal.tsx` (delete)
  - Parent component rendering `CreateTenantModal` (modify — import `CreateTenantWizard`)
- **Tests Required**:
  - unit: reducer state transitions for all action types (navigate, setData, reset, restore)
  - unit: per-step Zod schemas — valid + invalid inputs for each step
  - unit: step navigation (next, back, skip, jump via Edit links)
  - unit: provisioning polling triggers on submit
  - unit: SessionStorage persistence and recovery on reload
  - unit: cancel confirmation when data has been entered
- **Acceptance Criteria**:
  - [x] 4-step wizard renders with StepWizard component
  - [x] Slug auto-generated from name with 300ms debounce + async availability check
  - [x] Plugins step skippable (Skip button visible)
  - [x] Theme step skippable (Skip button visible)
  - [x] Review step shows per-section Edit links that jump back to correct step
  - [x] Submit transitions to ProvisioningProgress with 2s polling
  - [x] Success state: confirmation with link to new tenant
  - [x] Failure state: error displayed with Retry button
  - [x] SessionStorage persists wizard state on each step advance
  - [x] SessionStorage cleared on provisioning start
  - [x] `CreateTenantModal.tsx` deleted; no dead imports

---

### T001-23: Update TenantDetailModal

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-20, T001-21, T001-12
- **Assignee**: unassigned
- **FR Coverage**: `[FR-007]` `[FR-008]` `[FR-012]`
- **Description**: Enhance `TenantDetailModal` per design spec Screen 3:
  - Add **Theme section**: display logo, colors, font currently set on tenant
  - Add **DeletionCountdown banner**: shown only for `PENDING_DELETION` status
  - Add **Resend Invitation button**: shown only when invitation is pending (not yet accepted)
  - Add **provisioning error display**: shown when `settings.provisioningError` exists,
    with a Retry button to re-trigger provisioning
  - Add **Reactivate button**: shown for `PENDING_DELETION` tenants
  - Update action buttons to reflect current tenant status
- **Files Affected**:
  - `apps/super-admin/src/components/tenants/TenantDetailModal.tsx` (modify)
- **Tests Required**:
  - unit: Theme section renders colors + logo URL from tenant settings
  - unit: DeletionCountdown banner shown only for PENDING_DELETION
  - unit: Resend Invitation button shown only when `invitationStatus === 'pending'`
  - unit: Provisioning error section rendered with correct error message
  - unit: Action buttons match expected set per status
- **Acceptance Criteria**:
  - [x] Theme section visible when tenant has theme settings
  - [x] DeletionCountdown banner visible only for `PENDING_DELETION` tenants
  - [x] Resend Invitation button visible when invitation is pending
  - [x] Provisioning error displayed with retry when `settings.provisioningError` set
  - [x] Reactivate button visible for `PENDING_DELETION` tenants
  - [x] All 5 unit tests pass

---

### T001-24: Update useTenants hook

- **Status**: done
- **Story Points**: 2
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-15
- **Assignee**: unassigned
- **FR Coverage**: `[FR-005]`
- **Description**: Update the `useTenants` hook and related types:
  - Add `PENDING_DELETION` to `TenantStatusFilter` type
  - Add `DELETED` to `TenantStatusFilter` type (for audit view)
  - Add `deletionScheduledAt: string | null` to `Tenant` interface
  - Consolidate 4 separate stats API calls into a single aggregated call
    (or compute from list response) to reduce waterfall requests
- **Files Affected**:
  - `apps/super-admin/src/hooks/useTenants.ts` (modify)
  - `apps/super-admin/src/types/index.ts` (modify — if shared Tenant type exists)
- **Tests Required**:
  - unit: `PENDING_DELETION` filter applied correctly in API call
  - unit: `deletionScheduledAt` field present on returned tenant objects
  - unit: stats calculation is correct with consolidated call
- **Acceptance Criteria**:
  - [x] `PENDING_DELETION` and `DELETED` added to `TenantStatusFilter` union type
  - [x] `deletionScheduledAt: string | null` on `Tenant` interface
  - [x] Filtering by `PENDING_DELETION` sends correct query param to API
  - [x] Stats consolidated to ≤ 2 API calls (down from 4)

---

### T001-25: WCAG 2.1 AA accessibility pass

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-17, T001-18, T001-19, T001-20, T001-21, T001-22, T001-23, T001-24
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]`
- **Description**: Comprehensive accessibility pass across all new and modified components
  (T001-17 through T001-24). Per Art. 1.3 (WCAG 2.1 AA). Verify and add:
  - `aria-label` on all interactive elements lacking visible text labels
  - Focus traps on all modals/dialogs
  - Keyboard navigation tab order matching design spec
  - `aria-live` regions for dynamic content (provisioning progress, countdown)
  - `role="alertdialog"` on confirmation dialogs (cancel wizard, delete confirmation)
  - Contrast ratios (verify implementation matches design spec tokens)
  - Focus returned to trigger element on modal close
  - Screen reader smoke test for wizard flow
- **Files Affected**:
  - All components created/modified in T001-17 through T001-24 (modify as needed)
- **Tests Required**:
  - unit: `aria-label` present on all interactive elements without visible text
  - unit: focus trap active within wizard modal
  - unit: `aria-live` regions update on provisioning state changes
  - unit: keyboard tab order matches design spec sequence
- **Acceptance Criteria**:
  - [x] All interactive elements have accessible labels (visible text or `aria-label`)
  - [x] Focus trap active in wizard Dialog and TenantDetailModal
  - [x] `aria-live="polite"` on ProvisioningProgress and DeletionCountdown
  - [x] `role="alertdialog"` on cancel confirmation
  - [x] Focus returns to trigger button on modal close
  - [x] No automated axe violations on any new component

---

### T001-26: E2E tests for tenant creation wizard and deletion flow

- **Status**: done
- **Story Points**: 5
- **Size**: `[L]`
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-22, T001-23
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-004]` `[FR-006]` `[FR-007]` `[FR-012]`
- **Description**: Playwright E2E tests covering the 7 critical user journeys. Each
  scenario is a standalone test (no shared state between tests). Per Art. 8.1 (E2E
  required for critical flows):
  1. **Full wizard flow**: open → basics → plugins → theme → review → create →
     provisioning progress → success
  2. **Wizard with skipped steps**: basics → skip plugins → skip theme → create
  3. **Wizard validation errors**: invalid slug, missing email, slug already taken
  4. **Wizard crash recovery**: fill data → reload page → data restored from SessionStorage
  5. **Suspension flow**: create tenant → suspend → verify 403 for tenant users
  6. **Deletion flow**: suspend → delete → verify countdown visible → reactivate →
     verify status is `SUSPENDED` (not ACTIVE)
  7. **Resend invitation flow**: open detail → click resend → verify success toast
- **Files Affected**:
  - `apps/core-api/src/__tests__/tenant/e2e/tenant-wizard.e2e.test.ts` (create)
  - `apps/core-api/src/__tests__/tenant/e2e/tenant-lifecycle.e2e.test.ts` (create)
- **Tests Required**: 7 E2E scenarios as listed above
- **Acceptance Criteria**:
  - [x] All 7 scenarios implemented as separate `it()` blocks
  - [x] Each test cleans up created tenants in `afterEach`
  - [x] No test depends on execution order
  - [x] All 7 tests pass in CI environment

---

### T001-27: Unit tests for new frontend components

- **Status**: done
- **Story Points**: 3
- **Size**: `[M]`
- **Phase**: 3
- **Sprint**: 5
- **Dependencies**: T001-17, T001-18, T001-19, T001-20, T001-21
- **Assignee**: unassigned
- **FR Coverage**: `[FR-001]` `[FR-007]` `[FR-008]`
- **Description**: Dedicated unit test files for each of the 5 new `@plexica/ui`
  components. Vitest + React Testing Library. Each file covers: all states from the
  design spec state inventory, all interactive element behaviours, and all accessibility
  attributes specified in T001-17 through T001-21.
- **Files Affected**:
  - `packages/ui/src/components/__tests__/step-wizard.test.tsx` (create)
  - `packages/ui/src/components/__tests__/provisioning-progress.test.tsx` (create)
  - `packages/ui/src/components/__tests__/color-picker.test.tsx` (create)
  - `packages/ui/src/components/__tests__/deletion-countdown.test.tsx` (create)
  - `packages/ui/src/components/__tests__/theme-preview.test.tsx` (create)
- **Tests Required** (est. counts):
  - StepWizard: 8 tests (rendering, navigation, aria, keyboard)
  - ProvisioningProgress: 6 tests (statuses, progress bar, aria-live)
  - ColorPicker: 6 tests (swatch, hex validation, onChange, disabled, keyboard)
  - DeletionCountdown: 5 tests (inline/banner variants, urgency, expired)
  - ThemePreview: 5 tests (default, colors, logo, error, role)
- **Acceptance Criteria**:
  - [x] All 5 test files created
  - [x] Total ≥ 30 unit tests across all 5 files
  - [x] All tests pass (no skipped tests without `// skip reason:` comment)
  - [x] Component coverage ≥ 80% for each file

---

## Summary Table

| Task    | Name                                                  | Phase | Sprint | Points | Size   | Status | Parallelizable | Dependencies                                                  |
| ------- | ----------------------------------------------------- | ----- | ------ | ------ | ------ | ------ | -------------- | ------------------------------------------------------------- |
| T001-01 | Add `deletionScheduledAt` column to Prisma schema     | 1     | 3      | 1      | `[S]`  | done   | no             | none                                                          |
| T001-02 | Fix slug validation regex                             | 1     | 3      | 1      | `[S]`  | done   | no             | none                                                          |
| T001-03 | Implement provisioning state machine                  | 1     | 3      | 8      | `[XL]` | done   | no             | none                                                          |
| T001-04 | Add MinIO bucket creation step                        | 1     | 3      | 2      | `[M]`  | done   | no             | T001-03                                                       |
| T001-05 | Add admin user + invitation email steps               | 1     | 3      | 3      | `[M]`  | done   | no             | T001-03                                                       |
| T001-06 | Implement soft delete with 30-day scheduled cleanup   | 1     | 3      | 3      | `[M]`  | done   | no             | T001-01                                                       |
| T001-07 | Fix tenant context middleware (Super Admin/SUSPENDED) | 1     | 3      | 2      | `[S]`  | done   | no             | none                                                          |
| T001-08 | Fix reactivation path (PENDING_DELETION → SUSPENDED)  | 1     | 3      | 1      | `[S]`  | done   | no             | T001-01                                                       |
| T001-09 | Add `adminEmail` and `pluginIds` to CreateTenantInput | 1     | 3      | 2      | `[M]`  | done   | no             | T001-03, T001-05                                              |
| T001-10 | Update POST /admin/tenants request body schema        | 2     | 4      | 2      | `[M]`  | done   | no             | T001-09                                                       |
| T001-11 | Implement slug availability check endpoint            | 2     | 4      | 1      | `[S]`  | done   | `[P]`          | none                                                          |
| T001-12 | Implement resend-invite endpoint                      | 2     | 4      | 2      | `[M]`  | done   | no             | T001-05                                                       |
| T001-13 | Add theme validation to PATCH /admin/tenants/:id      | 2     | 4      | 2      | `[M]`  | done   | `[P]`          | none                                                          |
| T001-14 | Update DELETE /admin/tenants/:id for soft deletion    | 2     | 4      | 2      | `[M]`  | done   | no             | T001-06                                                       |
| T001-15 | Expand GET /admin/tenants filter options              | 2     | 4      | 1      | `[S]`  | done   | no             | T001-01                                                       |
| T001-16 | Integration tests for all modified/new endpoints      | 2     | 4      | 5      | `[L]`  | done   | no             | T001-10, T001-11, T001-12, T001-13, T001-14, T001-15          |
| T001-17 | Build StepWizard component                            | 3     | 4      | 5      | `[L]`  | done   | `[P]`          | none                                                          |
| T001-18 | Build ProvisioningProgress component                  | 3     | 4      | 5      | `[L]`  | done   | `[P]`          | none                                                          |
| T001-19 | Build ColorPicker component                           | 3     | 4      | 3      | `[M]`  | done   | `[P]`          | none                                                          |
| T001-20 | Build DeletionCountdown component                     | 3     | 4      | 2      | `[M]`  | done   | `[P]`          | none                                                          |
| T001-21 | Build ThemePreview component                          | 3     | 4      | 3      | `[M]`  | done   | `[P]`          | none                                                          |
| T001-22 | Replace CreateTenantModal with 4-step wizard          | 3     | 5      | 8      | `[XL]` | done   | no             | T001-17, T001-18, T001-19, T001-20, T001-21, T001-10, T001-11 |
| T001-23 | Update TenantDetailModal                              | 3     | 5      | 3      | `[M]`  | done   | no             | T001-20, T001-21, T001-12                                     |
| T001-24 | Update useTenants hook                                | 3     | 5      | 2      | `[M]`  | done   | no             | T001-15                                                       |
| T001-25 | WCAG 2.1 AA accessibility pass                        | 3     | 5      | 3      | `[M]`  | done   | no             | T001-17–T001-24                                               |
| T001-26 | E2E tests: wizard creation + deletion flow            | 3     | 5      | 5      | `[L]`  | done   | no             | T001-22, T001-23                                              |
| T001-27 | Unit tests for new frontend components                | 3     | 5      | 3      | `[M]`  | done   | no             | T001-17–T001-21                                               |

---

## Metrics Summary

| Metric                    | Value                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| Total tasks               | 27                                                                |
| Total story points        | 80                                                                |
| Phase 1 (Sprint 3)        | 9 tasks · 23 pts                                                  |
| Phase 2 (Sprint 4)        | 7 tasks · 15 pts (+ Phase 3a: 5 tasks · 18 pts)                   |
| Phase 3b (Sprint 5)       | 6 tasks · 24 pts                                                  |
| Parallelizable tasks      | 7 (T001-11, T001-13, T001-17, T001-18, T001-19, T001-20, T001-21) |
| XL tasks (need attention) | 2 (T001-03: 8 pts, T001-22: 8 pts)                                |
| Requirements covered      | FR-001–009, FR-011–013, NFR-006 (14 FRs)                          |
| Est. test count           | ~153 (111 unit + 35 integration + 7 E2E)                          |
| Coverage target           | ≥85% tenant module / admin routes (Art. 4.1)                      |

---

## Dependency Graph

```
Sprint 3 (Phase 1)
  T001-01 ──┬── T001-06 ──── T001-14 (Phase 2)
            └── T001-08
  T001-02
  T001-03 ──┬── T001-04
            ├── T001-05 ──── T001-09 ──── T001-10 (Phase 2)
            └────────────── T001-09 ──── T001-12 (Phase 2)
  T001-07

Sprint 4 (Phase 2)
  T001-11 [P]
  T001-13 [P]
  T001-15 ──── T001-24 (Phase 3)
  T001-10, T001-11, T001-12, T001-13, T001-14, T001-15 ──── T001-16

Sprint 4 (Phase 3a — parallelizable component build)
  T001-17 [P] ──┐
  T001-18 [P] ──┤
  T001-19 [P] ──┤─── T001-22 (Sprint 5)
  T001-20 [P] ──┤─── T001-23 (Sprint 5)
  T001-21 [P] ──┘

Sprint 5 (Phase 3b)
  T001-22 ──┬── T001-25
            └── T001-26
  T001-23 ──┬── T001-25
            └── T001-26
  T001-24 ──── T001-25
  T001-17–T001-21 ──── T001-27
```

---

## Cross-References

| Document     | Path                                                                |
| ------------ | ------------------------------------------------------------------- |
| Spec         | `.forge/specs/001-multi-tenancy/spec.md`                            |
| Plan         | `.forge/specs/001-multi-tenancy/plan.md`                            |
| Design Spec  | `.forge/specs/001-multi-tenancy/design-spec.md`                     |
| User Journey | `.forge/specs/001-multi-tenancy/user-journey.md`                    |
| ADR-002      | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`            |
| ADR-007      | `.forge/knowledge/adr/adr-007-prisma-orm.md`                        |
| ADR-015      | `.forge/knowledge/adr/adr-015-tenant-provisioning-orchestration.md` |
| ADR-016      | `.forge/knowledge/adr/adr-016-frontend-wizard-state.md`             |
| Constitution | `.forge/constitution.md`                                            |
| Decision Log | `.forge/knowledge/decision-log.md`                                  |
