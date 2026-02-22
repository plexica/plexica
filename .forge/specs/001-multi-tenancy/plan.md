# Plan: 001 - Multi-Tenancy

> Technical implementation plan for the Multi-Tenancy feature.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Draft                                    |
| Author | forge-architect                          |
| Date   | 2026-02-22                               |
| Track  | Feature                                  |
| Spec   | `.forge/specs/001-multi-tenancy/spec.md` |

---

## 1. Overview

This plan covers the implementation of the full multi-tenancy lifecycle system
as defined in Spec 001. The existing codebase has a partial implementation —
basic tenant CRUD exists but lacks provisioning orchestration (retry/rollback),
MinIO bucket creation, admin user bootstrapping, invitation emails, soft
deletion with 30-day grace period, and a multi-step creation wizard in the
frontend.

**Approach**: 3-phase implementation over 7 weeks (~80 story points)

- **Phase 1** (Weeks 1–2): Database migrations + core backend services
- **Phase 2** (Weeks 3–4): API endpoint updates + business logic
- **Phase 3** (Weeks 5–7): Frontend components + integration + accessibility + tests

**Key Architectural Decisions**:

- ADR-015: State-machine provisioning orchestrator with 3× retry, exponential
  backoff, and reverse-order rollback
- ADR-016: useReducer + per-step React Hook Form for wizard state management
- ADR-002: Schema-per-tenant isolation (existing, unchanged)
- ADR-007: Prisma ORM for all database access (existing, unchanged)

---

## 2. Data Model

### 2.1 New Tables

No new tables are required. All changes are to existing tables.

### 2.2 Modified Tables

#### tenants

| Column                  | Change | Before       | After                                                           |
| ----------------------- | ------ | ------------ | --------------------------------------------------------------- |
| `deletion_scheduled_at` | Add    | (not exists) | `TIMESTAMP NULL` — date when 30-day grace period expires        |
| `settings` (JSONB)      | Extend | `{}`         | Adds `provisioningState` and `provisioningError` nested objects |

**Prisma Schema Change**:

```prisma
model Tenant {
  // existing fields...
  deletionScheduledAt DateTime? @map("deletion_scheduled_at")
  // existing fields...
}
```

#### tenants — settings JSONB Extensions

```typescript
// New nested types within settings JSONB
interface TenantSettings {
  // existing settings...
  provisioningState?: {
    steps: Array<{
      name: string;
      status: 'pending' | 'in-progress' | 'complete' | 'error' | 'skipped';
      retryAttempt?: number;
      errorMessage?: string;
    }>;
    startedAt: string;
    overallProgress: number;
  };
  provisioningError?: {
    failedStep: string;
    error: string;
    rollbackStatus: 'complete' | 'partial' | 'failed';
    rollbackErrors?: string[];
    timestamp: string;
  };
}
```

### 2.3 Indexes

| Table   | Index Name                          | Columns                 | Type   |
| ------- | ----------------------------------- | ----------------------- | ------ |
| tenants | `idx_tenants_deletion_scheduled_at` | `deletion_scheduled_at` | B-TREE |
| tenants | `idx_tenants_status`                | `status`                | B-TREE |

The `deletion_scheduled_at` index supports the scheduled cleanup job's query:
`WHERE status = 'PENDING_DELETION' AND deletion_scheduled_at <= NOW()`.

### 2.4 Migrations

1. **Migration 001**: Add `deletion_scheduled_at` column to `tenants` table
   (nullable timestamp, default null). Add B-TREE index.
2. **Migration 002**: Add B-TREE index on `tenants.status` (if not already
   present — verify in schema).

---

## 3. API Endpoints

### 3.1 POST /api/v1/admin/tenants (Modified)

- **Description**: Create a new tenant with full provisioning (schema, realm,
  bucket, admin user, invitation, plugins)
- **Auth**: Required (Super Admin role)
- **Rate Limit**: 10 requests/minute
- **Spec Ref**: FR-001, FR-002, FR-003, FR-004, FR-012, FR-013
- **Request**:
  ```json
  {
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "adminEmail": "admin@acme.com",
    "pluginIds": ["uuid-1", "uuid-2"],
    "theme": {
      "primaryColor": "#1a73e8",
      "logoUrl": "https://acme.com/logo.png"
    }
  }
  ```
- **Response (201)**:
  ```json
  {
    "id": "uuid",
    "slug": "acme-corp",
    "name": "Acme Corporation",
    "status": "PROVISIONING",
    "settings": {
      "provisioningState": {
        "steps": [
          { "name": "schema_created", "status": "pending" },
          { "name": "keycloak_realm", "status": "pending" },
          { "name": "keycloak_clients", "status": "pending" },
          { "name": "keycloak_roles", "status": "pending" },
          { "name": "minio_bucket", "status": "pending" },
          { "name": "admin_user", "status": "pending" },
          { "name": "invitation_sent", "status": "pending" }
        ],
        "startedAt": "2026-02-22T10:00:00Z",
        "overallProgress": 0
      }
    },
    "createdAt": "2026-02-22T10:00:00Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ---------------------- | ------------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid slug format, missing fields |
  | 409 | `SLUG_CONFLICT` | Slug already exists |
  | 401 | `UNAUTHORIZED` | Missing or invalid auth token |
  | 403 | `FORBIDDEN` | Non-Super Admin role |
  | 500 | `PROVISIONING_FAILED` | All retries exhausted + rollback done |

### 3.2 GET /api/v1/admin/tenants/check-slug (New)

- **Description**: Check if a slug is available for tenant creation
- **Auth**: Required (Super Admin role)
- **Spec Ref**: FR-004
- **Request**: Query parameter `?slug=acme-corp`
- **Response (200)**:
  ```json
  {
    "slug": "acme-corp",
    "available": true
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------ | -------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid slug format |
  | 401 | `UNAUTHORIZED` | Missing or invalid token |

### 3.3 POST /api/v1/admin/tenants/:id/resend-invite (New)

- **Description**: Re-send the admin invitation email for a tenant
- **Auth**: Required (Super Admin role)
- **Spec Ref**: FR-012, Edge Case #10
- **Request**: No body required
- **Response (200)**:
  ```json
  {
    "message": "Invitation sent to admin@acme.com",
    "sentAt": "2026-02-22T10:30:00Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------------- | ------------------------------------------ |
  | 404 | `TENANT_NOT_FOUND` | Tenant ID does not exist |
  | 400 | `NO_ADMIN_EMAIL` | Tenant has no admin email configured |
  | 400 | `INVITATION_ALREADY_ACCEPTED` | Admin has already accepted invitation |
  | 500 | `EMAIL_SEND_FAILED` | Email service unavailable |

### 3.4 PATCH /api/v1/admin/tenants/:id (Modified)

- **Description**: Update tenant settings including theme with Zod validation
- **Auth**: Required (Super Admin role)
- **Spec Ref**: FR-008
- **Change**: Add Zod schema for `theme` field validation:
  ```typescript
  const TenantThemeSchema = z.object({
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    fontFamily: z.string().max(100).optional(),
    customCss: z.string().max(10240).optional(),
  });
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------- | -------------------------------- |
  | 400 | `THEME_VALIDATION` | Invalid theme field values |
  | 404 | `TENANT_NOT_FOUND` | Tenant ID does not exist |

### 3.5 DELETE /api/v1/admin/tenants/:id (Modified)

- **Description**: Initiate soft deletion with 30-day grace period
- **Auth**: Required (Super Admin role)
- **Spec Ref**: FR-007, Edge Case #8
- **Change**: Instead of immediately setting PENDING_DELETION, now sets
  `deletion_scheduled_at = NOW() + 30 days` and status to PENDING_DELETION
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "status": "PENDING_DELETION",
    "deletionScheduledAt": "2026-03-24T10:00:00Z",
    "message": "Tenant scheduled for deletion in 30 days"
  }
  ```

### 3.6 GET /api/v1/admin/tenants (Modified)

- **Description**: List tenants with expanded filter options
- **Spec Ref**: FR-005
- **Change**: Add `PENDING_DELETION` and `DELETED` to allowed status filter
  values. Add `deletionScheduledAt` to response objects.

### 3.7 POST /api/v1/admin/tenants/:id/activate (Modified)

- **Description**: Reactivate a tenant
- **Spec Ref**: Edge Case #8
- **Change**: When reactivating a PENDING_DELETION tenant, transition to
  SUSPENDED (not ACTIVE). Clear `deletion_scheduled_at`. When activating a
  SUSPENDED tenant, transition to ACTIVE.

---

## 4. Component Design

### 4.1 ProvisioningOrchestrator

- **Purpose**: Orchestrate multi-step tenant provisioning with retry, backoff,
  and rollback (ADR-015)
- **Location**: `apps/core-api/src/services/provisioning-orchestrator.ts`
- **Responsibilities**:
  - Execute provisioning steps in sequence
  - Retry failed steps up to 3× with exponential backoff (1s, 2s, 4s)
  - Roll back completed steps in reverse order on terminal failure
  - Update tenant `settings.provisioningState` after each step
  - Enforce 90-second total timeout
  - Handle rollback failures gracefully (log + store error details)
- **Dependencies**:
  - `TenantService` (tenant record updates)
  - `KeycloakService` (realm, clients, roles, admin user)
  - `MinioService` (bucket creation)
  - `EmailService` (invitation email)
  - `PrismaClient` (schema creation + migrations)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ---------------------- | ------------------------------------ | ------------------------ | ---------------------------------------------- |
  | `provision` | `tenant: Tenant, input: CreateInput` | `Promise<Tenant>` | Run full provisioning workflow |
  | `executeStep` | `step: ProvisioningStep, ctx` | `Promise<StepResult>` | Execute single step with retry logic |
  | `rollbackAll` | `completedSteps: Step[], ctx` | `Promise<RollbackResult>`| Roll back all completed steps in reverse order |

### 4.2 ProvisioningStep Interface

- **Purpose**: Define contract for each provisioning step
- **Location**: `apps/core-api/src/services/provisioning-steps/`
- **Implementations**:
  - `SchemaStep` — Creates PostgreSQL schema + runs base migrations
  - `KeycloakRealmStep` — Creates Keycloak realm
  - `KeycloakClientsStep` — Creates Keycloak clients for the realm
  - `KeycloakRolesStep` — Creates Keycloak roles + permissions
  - `MinioBucketStep` — Creates MinIO storage bucket
  - `AdminUserStep` — Creates Keycloak admin user with tenant-admin role
  - `InvitationStep` — Sends invitation email (non-blocking per EC-10)

### 4.3 DeletionScheduler

- **Purpose**: Background job that hard-deletes tenants past their 30-day
  grace period
- **Location**: `apps/core-api/src/services/deletion-scheduler.ts`
- **Responsibilities**:
  - Run on a configurable interval (default: every 6 hours)
  - Query tenants with `status = PENDING_DELETION` and
    `deletion_scheduled_at <= NOW()`
  - For each: call `hardDeleteTenant` (existing method)
  - Log all deletions with full context
- **Dependencies**:
  - `TenantService` (hardDeleteTenant)
  - `PrismaClient` (query expired tenants)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------- | ---------- | --------------- | --------------------------------------------- |
  | `start` | none | `void` | Start the interval timer |
  | `stop` | none | `void` | Stop the interval timer |
  | `processExpired` | none | `Promise<void>` | Find and delete all expired PENDING_DELETION |

### 4.4 StepWizard Component

- **Purpose**: Reusable multi-step wizard with step indicator and navigation
- **Location**: `packages/ui/src/components/step-wizard.tsx`
- **Spec Ref**: Design spec Screen 2, Component: StepWizard
- **Responsibilities**:
  - Render step indicator (circles + connectors + labels)
  - Manage Back/Next/Skip/Cancel navigation buttons
  - Support optional steps (Skip button visible)
  - Focus trap within modal
  - WCAG 2.1 AA compliant (aria-current, progressbar role)
- **Dependencies**:
  - `@plexica/ui` Button, Dialog components
- **Key Props**:
  | Prop | Type | Description |
  | ---------------- | ------------------------------------------ | ------------------------------------- |
  | `steps` | `{ label: string, isOptional?: boolean }[]`| Step definitions |
  | `currentStep` | `number` | 0-indexed current step |
  | `onNext` | `() => void` | Next step handler |
  | `onBack` | `() => void` | Previous step handler |
  | `onSkip` | `() => void` | Skip optional step |
  | `onCancel` | `() => void` | Cancel wizard |
  | `isNextDisabled` | `boolean` | Disable Next when validation fails |
  | `children` | `ReactNode` | Current step content |

### 4.5 ProvisioningProgress Component

- **Purpose**: Display real-time provisioning step status with progress bar
- **Location**: `packages/ui/src/components/provisioning-progress.tsx`
- **Spec Ref**: Design spec Screen 2, Component: ProvisioningProgress
- **Responsibilities**:
  - Render per-step status indicators (pending, in-progress, complete, error, skipped)
  - Render overall progress bar
  - Show estimated time remaining
  - Announce step completions via aria-live
- **Dependencies**:
  - `@plexica/ui` Progress component

### 4.6 ColorPicker Component

- **Purpose**: Composite color input with swatch button + hex text field
- **Location**: `packages/ui/src/components/color-picker.tsx`
- **Spec Ref**: Design spec Component: ColorPicker
- **Responsibilities**:
  - Color swatch opens native color input or custom picker
  - Hex text input with validation (#RRGGBB format)
  - Accessible: aria-label, keyboard support
- **Dependencies**: None (self-contained)

### 4.7 DeletionCountdown Component

- **Purpose**: Display remaining time until tenant permanent deletion
- **Location**: `packages/ui/src/components/deletion-countdown.tsx`
- **Spec Ref**: Design spec Component: DeletionCountdown (FR-007)
- **Responsibilities**:
  - Calculate and display countdown from `deletionScheduledAt`
  - Two variants: `inline` (list row) and `banner` (detail modal)
  - Urgency escalation: >7d amber, ≤7d bold amber, ≤24h red pulse
  - Refresh every hour via interval
  - aria-live="polite" for updates

### 4.8 ThemePreview Component

- **Purpose**: Live miniature preview of tenant branding settings
- **Location**: `packages/ui/src/components/theme-preview.tsx`
- **Spec Ref**: Design spec Component: ThemePreview (FR-008)
- **Responsibilities**:
  - Render miniature app shell (sidebar, header, button, body text)
  - Apply provided theme values in real-time (colors, logo, font)
  - Apply custom CSS in sandboxed scope
  - Decorative only (role="img")

### 4.9 useWizardState Hook

- **Purpose**: Manage wizard step navigation and accumulated form data
  (ADR-016)
- **Location**: `apps/super-admin/src/hooks/useWizardState.ts`
- **Responsibilities**:
  - useReducer for step transitions and data accumulation
  - SessionStorage persistence for crash recovery
  - Pure reducer function (unit-testable)

---

## 5. File Map

### Files to Create

| Path                                                                     | Purpose                                                          | Est. Size |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------- |
| `apps/core-api/src/services/provisioning-orchestrator.ts`                | Provisioning state machine with retry/backoff/rollback (ADR-015) | L         |
| `apps/core-api/src/services/provisioning-steps/index.ts`                 | Step interface export + step registry                            | S         |
| `apps/core-api/src/services/provisioning-steps/schema-step.ts`           | PostgreSQL schema creation + base migration step                 | M         |
| `apps/core-api/src/services/provisioning-steps/keycloak-realm-step.ts`   | Keycloak realm creation step                                     | M         |
| `apps/core-api/src/services/provisioning-steps/keycloak-clients-step.ts` | Keycloak clients creation step                                   | M         |
| `apps/core-api/src/services/provisioning-steps/keycloak-roles-step.ts`   | Keycloak roles + permissions step                                | M         |
| `apps/core-api/src/services/provisioning-steps/minio-bucket-step.ts`     | MinIO bucket creation step                                       | S         |
| `apps/core-api/src/services/provisioning-steps/admin-user-step.ts`       | Keycloak admin user creation step                                | M         |
| `apps/core-api/src/services/provisioning-steps/invitation-step.ts`       | Admin invitation email step (non-blocking)                       | S         |
| `apps/core-api/src/services/deletion-scheduler.ts`                       | Background job for 30-day deletion cleanup                       | M         |
| `packages/ui/src/components/step-wizard.tsx`                             | Multi-step wizard navigation component                           | L         |
| `packages/ui/src/components/provisioning-progress.tsx`                   | Real-time provisioning status display                            | M         |
| `packages/ui/src/components/color-picker.tsx`                            | Hex color input with swatch                                      | M         |
| `packages/ui/src/components/deletion-countdown.tsx`                      | Countdown display (inline + banner variants)                     | M         |
| `packages/ui/src/components/theme-preview.tsx`                           | Live theme preview panel                                         | M         |
| `apps/super-admin/src/hooks/useWizardState.ts`                           | Wizard reducer + sessionStorage (ADR-016)                        | M         |
| `apps/super-admin/src/components/tenants/wizard-schemas.ts`              | Per-step Zod validation schemas                                  | S         |
| `apps/super-admin/src/components/tenants/CreateTenantWizard.tsx`         | 4-step wizard replacing CreateTenantModal                        | L         |

### Files to Modify

| Path                                                            | Section/Lines                                       | Change Description                                                                                                                 | Est. Effort |
| --------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `packages/database/prisma/schema.prisma`                        | Tenant model                                        | Add `deletionScheduledAt DateTime?` field                                                                                          | S           |
| `apps/core-api/src/services/tenant.service.ts`                  | `createTenant`, `deleteTenant`, `CreateTenantInput` | Refactor to use orchestrator; add adminEmail/pluginIds to input; add deletionScheduledAt to soft delete; fix slug validation regex | L           |
| `apps/core-api/src/routes/admin.ts`                             | POST /tenants, DELETE /tenants/:id, GET /tenants    | Update request schema; add check-slug + resend-invite routes; expand filter options; fix activate for PENDING_DELETION→SUSPENDED   | L           |
| `apps/core-api/src/middleware/tenant-context.ts`                | SUSPENDED tenant check                              | Allow Super Admin access to SUSPENDED tenants (currently blocks all)                                                               | S           |
| `apps/super-admin/src/hooks/useTenants.ts`                      | `TenantStatusFilter` type, filter options           | Add PENDING_DELETION to filter; add deletionScheduledAt to Tenant type; consolidate stats to single call                           | M           |
| `apps/super-admin/src/components/tenants/TenantDetailModal.tsx` | Entire component                                    | Add theme section, deletion countdown (banner), resend invite button, provisioning error display                                   | M           |
| `apps/core-api/src/index.ts` or startup file                    | Server initialization                               | Register DeletionScheduler on startup                                                                                              | S           |

### Files to Delete

| Path                                                            | Reason                             | Migration Notes                                               |
| --------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `apps/super-admin/src/components/tenants/CreateTenantModal.tsx` | Replaced by CreateTenantWizard.tsx | All references in parent components updated to use new wizard |

### Files to Reference (Read-only)

| Path                                                                | Purpose                           |
| ------------------------------------------------------------------- | --------------------------------- |
| `.forge/constitution.md`                                            | Validate architectural decisions  |
| `.forge/specs/001-multi-tenancy/spec.md`                            | Source requirements               |
| `.forge/specs/001-multi-tenancy/design-spec.md`                     | UX specifications and wireframes  |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`            | Schema-per-tenant pattern         |
| `.forge/knowledge/adr/adr-007-prisma-orm.md`                        | ORM constraints                   |
| `.forge/knowledge/adr/adr-015-tenant-provisioning-orchestration.md` | Provisioning pattern              |
| `.forge/knowledge/adr/adr-016-frontend-wizard-state.md`             | Wizard state management           |
| `apps/core-api/src/services/keycloak.service.ts`                    | Existing Keycloak methods to wrap |
| `apps/core-api/src/routes/tenant.ts`                                | Existing tenant routes            |

---

## 6. Dependencies

### 6.1 New Dependencies

No new npm dependencies are required. All functionality is implemented using
the existing approved stack:

- React `useReducer` (built-in) — wizard state management
- React Hook Form (existing) — per-step form validation
- Zod (existing) — schema validation
- ioredis (existing) — cache key prefix operations
- Prisma (existing) — database operations
- MinIO client (existing `@plexica/storage` or minio package) — bucket ops

### 6.2 Internal Dependencies

- `@plexica/database` — Prisma client, Tenant model, migration runner
- `@plexica/ui` — Existing Button, Dialog, Input, Badge, Progress, Toast components
- `apps/core-api/src/services/keycloak.service.ts` — Realm, client, role, user creation
- `apps/core-api/src/services/email.service.ts` — Send invitation email (if exists; may need creation)
- `apps/core-api/src/middleware/tenant-context.ts` — Tenant context extraction

---

## 7. Implementation Phases

### Phase 1: Database & Core Backend (Weeks 1–2, ~23 story points)

**Objective**: Database migration, provisioning orchestrator, deletion scheduler,
and all backend service-level changes.

**Tasks**:

---

#### T001-01: Add `deletionScheduledAt` column to Prisma schema

- **Phase**: 1
- **Story Points**: 1
- **Dependencies**: None
- **Description**: Add `deletionScheduledAt DateTime? @map("deletion_scheduled_at")`
  to the `Tenant` model in `packages/database/prisma/schema.prisma`. Create
  Prisma migration. Add B-TREE index on `deletion_scheduled_at`. Regenerate
  Prisma client.
- **Files Affected**:
  - `packages/database/prisma/schema.prisma` (modify)
  - `packages/database/prisma/migrations/YYYYMMDD_add_deletion_scheduled_at/` (create)
- **Tests Required**: Integration test verifying column exists and accepts null/timestamp values
- **Spec Ref**: FR-007, Data Requirements §7

---

#### T001-02: Fix slug validation regex

- **Phase**: 1
- **Story Points**: 1
- **Dependencies**: None
- **Description**: Update slug validation from `/^[a-z0-9-]{1,50}$/` to
  `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3–64 chars, must start with letter,
  must not end with hyphen). Update in:
  1. `TenantService` slug validation
  2. Zod schema in admin routes
  3. Any shared validation utilities
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify)
  - `apps/core-api/src/routes/admin.ts` (modify Zod schema)
- **Tests Required**: Unit tests for valid/invalid slug patterns (min 10 cases including edge cases: 3-char, 64-char, leading hyphen, trailing hyphen, uppercase, special chars)
- **Spec Ref**: FR-004

---

#### T001-03: Implement provisioning state machine

- **Phase**: 1
- **Story Points**: 8
- **Dependencies**: None
- **Description**: Implement the `ProvisioningOrchestrator` class per ADR-015.
  Define the `ProvisioningStep` interface with `execute()` and `rollback()`.
  Implement step execution with 3× retry and exponential backoff (1s, 2s, 4s).
  Implement reverse-order rollback on terminal failure. Update tenant
  `settings.provisioningState` after each step. Enforce 90-second total
  timeout via AbortController. Extract existing schema creation and Keycloak
  provisioning from `TenantService.createTenant` into separate step classes.
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/index.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/schema-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-realm-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-clients-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/keycloak-roles-step.ts` (create)
  - `apps/core-api/src/services/tenant.service.ts` (modify — refactor createTenant)
- **Tests Required**:
  - Unit: Orchestrator retry logic (3 retries, correct backoff delays)
  - Unit: Orchestrator rollback (reverse order, handles rollback failures)
  - Unit: Each step's execute() and rollback() independently
  - Unit: 90-second timeout enforcement
  - Integration: Full provisioning success flow (all steps)
  - Integration: Provisioning failure at each step (verify rollback)
- **Spec Ref**: NFR-006, Edge Cases #1, #9
- **ADR Ref**: ADR-015

---

#### T001-04: Add MinIO bucket creation step

- **Phase**: 1
- **Story Points**: 2
- **Dependencies**: T001-03
- **Description**: Implement `MinioBucketStep` provisioning step. Create a
  MinIO bucket named `tenant-{slug}` with default access policy. Implement
  rollback (delete bucket). Integrate into provisioning step array after
  Keycloak roles step.
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-steps/minio-bucket-step.ts` (create)
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (modify — add step)
- **Tests Required**:
  - Unit: Bucket creation with correct name
  - Unit: Bucket rollback (deletion)
  - Integration: Verify bucket exists after provisioning
- **Spec Ref**: FR-003

---

#### T001-05: Add admin user + invitation email steps

- **Phase**: 1
- **Story Points**: 3
- **Dependencies**: T001-03
- **Description**: Implement `AdminUserStep` — create Keycloak user with
  provided `adminEmail`, assign `tenant-admin` realm role, set required
  action to update password. Implement `InvitationStep` — send invitation
  email. Invitation is **non-blocking** per Edge Case #10: if email fails
  after 3 retries, provisioning still succeeds, warning is logged. Implement
  rollback for AdminUserStep (delete Keycloak user). InvitationStep has no
  rollback (email is fire-and-forget).
- **Files Affected**:
  - `apps/core-api/src/services/provisioning-steps/admin-user-step.ts` (create)
  - `apps/core-api/src/services/provisioning-steps/invitation-step.ts` (create)
  - `apps/core-api/src/services/provisioning-orchestrator.ts` (modify — add steps)
- **Tests Required**:
  - Unit: Admin user creation with correct role assignment
  - Unit: Invitation email sending (mock email service)
  - Unit: Non-blocking behavior (provisioning succeeds even if email fails)
  - Unit: Admin user rollback (deletion)
  - Integration: Full provisioning flow with admin user verification
- **Spec Ref**: FR-012, Edge Case #10

---

#### T001-06: Implement soft delete with 30-day scheduled cleanup

- **Phase**: 1
- **Story Points**: 3
- **Dependencies**: T001-01
- **Description**: Modify `TenantService.deleteTenant` to set
  `deletionScheduledAt = NOW() + 30 days` and status to PENDING_DELETION.
  Create `DeletionScheduler` service that runs every 6 hours, queries
  tenants where `status = 'PENDING_DELETION' AND deletion_scheduled_at <= NOW()`,
  and calls `hardDeleteTenant` for each. Register scheduler on server startup.
  Implement graceful shutdown (clear interval on SIGTERM).
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — deleteTenant)
  - `apps/core-api/src/services/deletion-scheduler.ts` (create)
  - `apps/core-api/src/index.ts` or startup file (modify — register scheduler)
- **Tests Required**:
  - Unit: deleteTenant sets correct deletionScheduledAt (30 days from now)
  - Unit: DeletionScheduler.processExpired finds correct tenants
  - Unit: DeletionScheduler handles hardDeleteTenant failures gracefully
  - Integration: End-to-end deletion lifecycle (create → delete → verify scheduled → verify hard delete after expiry)
- **Spec Ref**: FR-007, Edge Case #8

---

#### T001-07: Fix tenant context middleware for Super Admin + SUSPENDED

- **Phase**: 1
- **Story Points**: 2
- **Dependencies**: None
- **Description**: Currently `tenant-context.ts` returns 403 for ALL
  non-ACTIVE tenants. Fix to allow Super Admins full read/write access to
  SUSPENDED tenants. Keep 403 for regular tenant users on SUSPENDED tenants.
  Keep 404 for DELETED tenants for all users.
- **Files Affected**:
  - `apps/core-api/src/middleware/tenant-context.ts` (modify)
- **Tests Required**:
  - Unit: Super Admin can access SUSPENDED tenant (no 403)
  - Unit: Regular user gets 403 on SUSPENDED tenant
  - Unit: All users get 404 on DELETED tenant
  - Unit: Super Admin access to PENDING_DELETION tenant works
  - Integration: API request flow with SUSPENDED tenant + Super Admin JWT
- **Spec Ref**: FR-006, Edge Case #4

---

#### T001-08: Fix reactivation path (PENDING_DELETION → SUSPENDED)

- **Phase**: 1
- **Story Points**: 1
- **Dependencies**: T001-01
- **Description**: Update the activate endpoint logic: when reactivating a
  PENDING_DELETION tenant, transition to SUSPENDED (not ACTIVE) and clear
  `deletionScheduledAt`. When activating a SUSPENDED tenant, transition to
  ACTIVE.
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — activate logic)
  - `apps/core-api/src/routes/admin.ts` (modify — activate route handler)
- **Tests Required**:
  - Unit: PENDING_DELETION → SUSPENDED (not ACTIVE)
  - Unit: SUSPENDED → ACTIVE (unchanged behavior)
  - Unit: deletionScheduledAt cleared on reactivation
  - Integration: Reactivation API endpoint with PENDING_DELETION tenant
- **Spec Ref**: Edge Case #8

---

#### T001-09: Add adminEmail and pluginIds to CreateTenantInput

- **Phase**: 1
- **Story Points**: 2
- **Dependencies**: T001-03, T001-05
- **Description**: Extend `CreateTenantInput` interface and Zod validation
  schema to include `adminEmail` (required, email format) and `pluginIds`
  (optional, array of UUIDs). Update `TenantService.createTenant` to pass
  these through to the provisioning orchestrator. pluginIds installs selected
  plugins via existing `installPlugin` method after provisioning completes.
- **Files Affected**:
  - `apps/core-api/src/services/tenant.service.ts` (modify — CreateTenantInput)
  - `apps/core-api/src/routes/admin.ts` (modify — Zod schema for POST /tenants)
- **Tests Required**:
  - Unit: Validation rejects missing adminEmail
  - Unit: Validation accepts empty pluginIds array
  - Unit: Plugin installation called with correct IDs after provisioning
  - Integration: Create tenant with adminEmail + pluginIds
- **Spec Ref**: FR-012, FR-013

---

### Phase 2: API Endpoints & Business Logic (Weeks 3–4, ~15 story points)

**Objective**: All API route changes, new endpoints, and comprehensive
integration test coverage.

**Tasks**:

---

#### T001-10: Update POST /admin/tenants request body schema

- **Phase**: 2
- **Story Points**: 2
- **Dependencies**: T001-09
- **Description**: Update the Fastify route handler for POST /admin/tenants
  to accept the expanded body (`adminEmail`, `pluginIds`, `theme`). Update
  Zod validation schema. Return 201 with provisioning state in response.
  Update any API documentation or OpenAPI annotations.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify)
- **Tests Required**:
  - Integration: POST with full body (all fields)
  - Integration: POST with minimal body (name + adminEmail only)
  - Integration: POST with invalid fields (validation errors)
  - Integration: Verify 201 response includes provisioningState
- **Spec Ref**: FR-001, API Requirements §8

---

#### T001-11: Implement slug availability check endpoint

- **Phase**: 2
- **Story Points**: 1
- **Dependencies**: None
- **Description**: Add `GET /api/v1/admin/tenants/check-slug?slug=xxx`
  endpoint. Validate slug format with Zod. Query database for existing
  tenant with that slug. Return `{ slug, available: boolean }`.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — add route)
- **Tests Required**:
  - Integration: Available slug returns `available: true`
  - Integration: Taken slug returns `available: false`
  - Integration: Invalid slug format returns 400
- **Spec Ref**: FR-004

---

#### T001-12: Implement resend-invite endpoint

- **Phase**: 2
- **Story Points**: 2
- **Dependencies**: T001-05
- **Description**: Add `POST /api/v1/admin/tenants/:id/resend-invite`
  endpoint. Look up tenant's admin email from Keycloak realm. Verify
  invitation hasn't been accepted yet. Re-send invitation email.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — add route)
- **Tests Required**:
  - Integration: Successful resend returns 200
  - Integration: Tenant not found returns 404
  - Integration: Already accepted invitation returns 400
  - Integration: No admin email configured returns 400
- **Spec Ref**: FR-012, Edge Case #10

---

#### T001-13: Add theme validation to PATCH /admin/tenants/:id

- **Phase**: 2
- **Story Points**: 2
- **Dependencies**: None
- **Description**: Add `TenantThemeSchema` Zod validation to the PATCH
  endpoint. Validate logo URL, favicon URL, 3 hex colors, font family
  string (max 100 chars), custom CSS (max 10KB = 10,240 bytes). Return
  400 with specific field errors on validation failure.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — PATCH handler)
- **Tests Required**:
  - Integration: Valid theme update succeeds
  - Integration: Invalid hex color returns 400
  - Integration: CSS exceeding 10KB returns 400
  - Integration: Invalid URL format returns 400
  - Unit: TenantThemeSchema validates all field constraints
- **Spec Ref**: FR-008

---

#### T001-14: Update DELETE /admin/tenants/:id for soft deletion

- **Phase**: 2
- **Story Points**: 2
- **Dependencies**: T001-06
- **Description**: Update DELETE route handler to call the modified
  `deleteTenant` which now sets `deletionScheduledAt`. Return 200 with
  deletion schedule info. Require tenant to be in SUSPENDED or ACTIVE
  status (cannot re-delete PENDING_DELETION tenant).
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — DELETE handler)
- **Tests Required**:
  - Integration: DELETE sets status to PENDING_DELETION with correct date
  - Integration: DELETE on already PENDING_DELETION returns 400
  - Integration: Response includes deletionScheduledAt
- **Spec Ref**: FR-007

---

#### T001-15: Expand GET /admin/tenants filter options

- **Phase**: 2
- **Story Points**: 1
- **Dependencies**: T001-01
- **Description**: Add `PENDING_DELETION` and `DELETED` to the allowed
  status filter values in the GET /admin/tenants list endpoint query
  parameter validation. Include `deletionScheduledAt` in tenant list
  response objects.
- **Files Affected**:
  - `apps/core-api/src/routes/admin.ts` (modify — GET handler + Zod schema)
- **Tests Required**:
  - Integration: Filter by PENDING_DELETION returns correct tenants
  - Integration: Response includes deletionScheduledAt field
- **Spec Ref**: FR-005

---

#### T001-16: Integration tests for all modified/new endpoints

- **Phase**: 2
- **Story Points**: 5
- **Dependencies**: T001-10, T001-11, T001-12, T001-13, T001-14, T001-15
- **Description**: Comprehensive integration test suite covering all
  endpoint changes. Include success cases, validation errors, auth errors,
  edge cases (concurrent slug creation, PENDING_DELETION reactivation).
  Target: 85% coverage for admin routes module.
- **Files Affected**:
  - `apps/core-api/src/__tests__/tenant/integration/tenant-lifecycle.integration.test.ts` (create or extend)
  - `apps/core-api/src/__tests__/tenant/integration/tenant-provisioning.integration.test.ts` (create)
- **Tests Required**:
  - Full provisioning flow (create → PROVISIONING → ACTIVE)
  - Provisioning failure + rollback verification
  - Soft delete → scheduled deletion → hard delete lifecycle
  - Slug availability check (available + taken + invalid)
  - Resend invite (success + already accepted + not found)
  - Theme update validation (valid + all invalid cases)
  - PENDING_DELETION reactivation → SUSPENDED
  - Concurrent slug creation (409 conflict)
  - Super Admin access to SUSPENDED tenant
- **Spec Ref**: Art. 4 (85% coverage), Art. 8 (integration tests)

---

### Phase 3: Frontend Components & Integration (Weeks 5–7, ~42 story points)

**Objective**: Build all 5 new UI components, replace the creation modal with
a 4-step wizard, update existing components, add accessibility, and write
frontend tests.

**Tasks**:

---

#### T001-17: Build StepWizard component

- **Phase**: 3
- **Story Points**: 5
- **Dependencies**: None (uses existing @plexica/ui primitives)
- **Description**: Build the `StepWizard` component in `@plexica/ui` per
  design spec. Includes step indicator (circles + connectors + labels),
  navigation buttons (Back/Next/Skip/Cancel), responsive layout (labels
  hidden on mobile), and full WCAG 2.1 AA compliance (aria-current, role
  progressbar, focus trap via Dialog).
- **Files Affected**:
  - `packages/ui/src/components/step-wizard.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export StepWizard)
- **Tests Required**:
  - Unit: Renders correct number of steps
  - Unit: Active step has aria-current="step"
  - Unit: Next button disabled when isNextDisabled=true
  - Unit: Skip button only shown for optional steps
  - Unit: Navigation callbacks fire correctly
  - Unit: Keyboard: Enter on Next advances, Esc triggers cancel
- **Spec Ref**: Design spec §4, Component: StepWizard
- **ADR Ref**: ADR-016

---

#### T001-18: Build ProvisioningProgress component

- **Phase**: 3
- **Story Points**: 5
- **Dependencies**: None
- **Description**: Build the `ProvisioningProgress` component per design
  spec. Renders step list with status icons (pending, in-progress, complete,
  error, skipped). Overall progress bar. Estimated time remaining. Retry
  attempt counter. Success and failure states. aria-live announcements for
  step completions.
- **Files Affected**:
  - `packages/ui/src/components/provisioning-progress.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export)
- **Tests Required**:
  - Unit: Renders all step statuses correctly
  - Unit: Progress bar shows correct percentage
  - Unit: Error state shows error message + retry count
  - Unit: Success state shows all checkmarks
  - Unit: aria-live region announces step completions
- **Spec Ref**: Design spec §4, Component: ProvisioningProgress

---

#### T001-19: Build ColorPicker component

- **Phase**: 3
- **Story Points**: 3
- **Dependencies**: None
- **Description**: Build the `ColorPicker` composite input per design spec.
  Color swatch button (shows current color) + hex text input. Clicking
  swatch opens native `<input type="color">` or custom popover. Hex input
  validates #RRGGBB format. Keyboard accessible. Disabled state.
- **Files Affected**:
  - `packages/ui/src/components/color-picker.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export)
- **Tests Required**:
  - Unit: Displays current color in swatch
  - Unit: Hex input validates format
  - Unit: onChange fires with valid hex
  - Unit: Disabled state prevents interaction
  - Unit: Keyboard: Enter/Space opens picker, Esc closes
- **Spec Ref**: Design spec §4, Component: ColorPicker

---

#### T001-20: Build DeletionCountdown component

- **Phase**: 3
- **Story Points**: 2
- **Dependencies**: None
- **Description**: Build the `DeletionCountdown` component per design spec.
  Two variants: `inline` (compact text for list rows) and `banner` (full
  warning banner for detail modal). Urgency escalation: >7d amber, ≤7d bold,
  ≤24h red pulse. Updates every hour via setInterval. role="timer" with
  aria-live="polite".
- **Files Affected**:
  - `packages/ui/src/components/deletion-countdown.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export)
- **Tests Required**:
  - Unit: Inline variant renders compact text
  - Unit: Banner variant renders full warning
  - Unit: Urgency levels change at 7d and 24h thresholds
  - Unit: Expired date shows "Deletion imminent"
  - Unit: aria-live region present
- **Spec Ref**: Design spec §4, Component: DeletionCountdown (FR-007)

---

#### T001-21: Build ThemePreview component

- **Phase**: 3
- **Story Points**: 3
- **Dependencies**: None
- **Description**: Build the `ThemePreview` component per design spec.
  Miniature app shell (~300x400px) with sidebar, header, button, and body
  text. Applies provided colors, logo, and font in real-time. Custom CSS
  applied in sandboxed scope (scoped to preview container). role="img"
  (decorative). Logo loading/error states.
- **Files Affected**:
  - `packages/ui/src/components/theme-preview.tsx` (create)
  - `packages/ui/src/index.ts` (modify — export)
- **Tests Required**:
  - Unit: Renders with default theme
  - Unit: Applies custom primary/secondary/accent colors
  - Unit: Displays provided logo URL
  - Unit: Logo error shows placeholder
  - Unit: role="img" present
- **Spec Ref**: Design spec §4, Component: ThemePreview (FR-008)

---

#### T001-22: Replace CreateTenantModal with 4-step wizard

- **Phase**: 3
- **Story Points**: 8
- **Dependencies**: T001-17, T001-18, T001-10, T001-11
- **Description**: Build the `CreateTenantWizard` component using StepWizard,
  ProvisioningProgress, ColorPicker, and ThemePreview. 4 steps:
  1. Basics — name, auto-generated slug (debounced async check), admin email
  2. Plugins — checkbox list of available plugins (skippable)
  3. Theme — logo, colors, font, custom CSS (skippable)
  4. Review — summary with Edit links per section

  Uses `useWizardState` hook (ADR-016). Per-step Zod validation via React
  Hook Form. On "Create Tenant", transitions to ProvisioningProgress view
  with polling (2s interval). Success and failure states per design spec.
  Remove old `CreateTenantModal.tsx`. Update parent component imports.

- **Files Affected**:
  - `apps/super-admin/src/components/tenants/CreateTenantWizard.tsx` (create)
  - `apps/super-admin/src/hooks/useWizardState.ts` (create)
  - `apps/super-admin/src/components/tenants/wizard-schemas.ts` (create)
  - `apps/super-admin/src/components/tenants/CreateTenantModal.tsx` (delete)
  - Parent component that renders CreateTenantModal (modify — switch to wizard)
- **Tests Required**:
  - Unit: Reducer state transitions (all action types)
  - Unit: Per-step Zod schemas (valid + invalid inputs)
  - Unit: Step navigation (next, back, skip)
  - Unit: Provisioning polling triggers on submit
  - Unit: SessionStorage persistence and recovery
  - Unit: Cancel confirmation when data entered
- **Spec Ref**: US-001, FR-001–004, FR-008, FR-009, FR-012, FR-013
- **ADR Ref**: ADR-016

---

#### T001-23: Update TenantDetailModal

- **Phase**: 3
- **Story Points**: 3
- **Dependencies**: T001-20, T001-21, T001-12
- **Description**: Enhance TenantDetailModal per design spec Screen 3:
  - Add Theme section (colors, logo, font display)
  - Add DeletionCountdown banner for PENDING_DELETION tenants
  - Add "Resend Invitation" button for pending invitations
  - Add provisioning error display with Retry button
  - Add "Reactivate" button for PENDING_DELETION tenants
  - Update action buttons per tenant status
- **Files Affected**:
  - `apps/super-admin/src/components/tenants/TenantDetailModal.tsx` (modify)
- **Tests Required**:
  - Unit: Theme section renders colors + logo
  - Unit: Deletion countdown banner shown for PENDING_DELETION
  - Unit: Resend invite button shown when invitation pending
  - Unit: Provisioning error displayed with Retry
  - Unit: Action buttons change per status
- **Spec Ref**: Design spec Screen 3

---

#### T001-24: Update useTenants hook

- **Phase**: 3
- **Story Points**: 2
- **Dependencies**: T001-15
- **Description**: Update the `useTenants` hook and related types:
  - Add PENDING_DELETION to `TenantStatusFilter` type
  - Add `deletionScheduledAt` to `Tenant` interface
  - Consolidate 4 separate stat API calls into a single aggregated stats
    endpoint call (or compute from list response)
  - Add DELETED filter option (for audit purposes)
- **Files Affected**:
  - `apps/super-admin/src/hooks/useTenants.ts` (modify)
  - `apps/super-admin/src/types/index.ts` or shared types (modify if needed)
- **Tests Required**:
  - Unit: PENDING_DELETION filter works
  - Unit: deletionScheduledAt field present in tenant objects
  - Unit: Stats calculation correct
- **Spec Ref**: FR-005

---

#### T001-25: WCAG 2.1 AA accessibility pass

- **Phase**: 3
- **Story Points**: 3
- **Dependencies**: T001-17, T001-18, T001-19, T001-20, T001-21, T001-22, T001-23, T001-24
- **Description**: Comprehensive accessibility pass across all new and
  modified components. Verify and add:
  - aria-labels on all interactive elements per design spec
  - Focus traps on all modals/dialogs
  - Keyboard navigation (Tab order per design spec)
  - aria-live regions for dynamic content (provisioning, countdown)
  - role="alertdialog" on confirmation dialogs
  - Contrast ratios (already specified in design spec, verify implementation)
  - Screen reader flow testing
  - Focus return to trigger element on modal close
- **Files Affected**:
  - All new components created in T001-17 through T001-24 (modify as needed)
- **Tests Required**:
  - Unit: aria-labels present on all interactive elements
  - Unit: Focus trap active on wizard modal
  - Unit: aria-live regions update on state changes
  - Unit: Keyboard navigation order matches design spec
- **Spec Ref**: Art. 1.3, WCAG 2.1 AA

---

#### T001-26: E2E tests for tenant creation wizard and deletion flow

- **Phase**: 3
- **Story Points**: 5
- **Dependencies**: T001-22, T001-23
- **Description**: Playwright E2E tests covering the critical user journeys:
  1. Full wizard flow: open → fill basics → select plugins → set theme →
     review → create → provisioning progress → success
  2. Wizard with skipped steps: basics → skip plugins → skip theme → create
  3. Wizard validation: invalid slug, missing email, slug conflict
  4. Wizard crash recovery: fill data → reload page → data restored
  5. Suspension flow: create tenant → suspend → verify 403 for tenant users
  6. Deletion flow: suspend → delete → verify countdown → reactivate →
     verify SUSPENDED status
  7. Resend invitation flow
- **Files Affected**:
  - `apps/core-api/src/__tests__/tenant/e2e/tenant-wizard.e2e.test.ts` (create)
  - `apps/core-api/src/__tests__/tenant/e2e/tenant-lifecycle.e2e.test.ts` (create)
- **Tests Required**: As listed above (7 E2E scenarios)
- **Spec Ref**: Art. 8.1 (E2E tests for critical flows)

---

#### T001-27: Unit tests for new frontend components

- **Phase**: 3
- **Story Points**: 3
- **Dependencies**: T001-17, T001-18, T001-19, T001-20, T001-21
- **Description**: Dedicated unit test files for each new `@plexica/ui`
  component. Vitest + React Testing Library. Cover all states from design
  spec state inventory, all interactive element behaviors, and all
  accessibility attributes.
- **Files Affected**:
  - `packages/ui/src/components/__tests__/step-wizard.test.tsx` (create)
  - `packages/ui/src/components/__tests__/provisioning-progress.test.tsx` (create)
  - `packages/ui/src/components/__tests__/color-picker.test.tsx` (create)
  - `packages/ui/src/components/__tests__/deletion-countdown.test.tsx` (create)
  - `packages/ui/src/components/__tests__/theme-preview.test.tsx` (create)
- **Tests Required**: As listed in each component task above (T001-17 through T001-21)
- **Spec Ref**: Art. 8.1 (unit tests for all business logic)

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                      | Test Focus                                                | Est. Count |
| ------------------------------ | --------------------------------------------------------- | ---------- |
| ProvisioningOrchestrator       | Retry logic (3×), backoff timing, timeout, rollback order | 12         |
| SchemaStep                     | execute() creates schema, rollback() drops schema         | 4          |
| KeycloakRealmStep              | execute() creates realm, rollback() deletes realm         | 4          |
| KeycloakClientsStep            | execute() creates clients, rollback() deletes clients     | 4          |
| KeycloakRolesStep              | execute() creates roles, rollback() deletes roles         | 4          |
| MinioBucketStep                | execute() creates bucket, rollback() deletes bucket       | 4          |
| AdminUserStep                  | execute() creates user + role, rollback() deletes user    | 4          |
| InvitationStep                 | execute() sends email, non-blocking on failure            | 3          |
| DeletionScheduler              | processExpired finds correct tenants, handles failures    | 4          |
| Slug validation                | Valid/invalid patterns (10+ cases)                        | 10         |
| TenantThemeSchema              | All field validations (URL, hex, max length)              | 8          |
| Wizard reducer                 | All action types, state transitions                       | 10         |
| Per-step Zod schemas           | Valid/invalid inputs per step                             | 12         |
| StepWizard component           | Rendering, navigation, aria attributes                    | 8          |
| ProvisioningProgress component | Step statuses, progress bar, aria-live                    | 6          |
| ColorPicker component          | Swatch, hex input, validation, disabled                   | 6          |
| DeletionCountdown component    | Inline/banner variants, urgency levels, timer             | 5          |
| ThemePreview component         | Colors, logo, font, error states                          | 5          |
| **Total unit tests**           |                                                           | **~111**   |

### 8.2 Integration Tests

| Scenario                                        | Dependencies                  | Est. Count |
| ----------------------------------------------- | ----------------------------- | ---------- |
| POST /admin/tenants with full body              | DB, Keycloak, MinIO           | 4          |
| POST /admin/tenants validation errors           | DB                            | 3          |
| GET /admin/tenants/check-slug                   | DB                            | 3          |
| POST /admin/tenants/:id/resend-invite           | Keycloak, Email               | 4          |
| PATCH /admin/tenants/:id theme validation       | DB                            | 4          |
| DELETE /admin/tenants/:id soft delete           | DB                            | 3          |
| POST /admin/tenants/:id/activate reactivation   | DB                            | 3          |
| GET /admin/tenants with PENDING_DELETION filter | DB                            | 2          |
| Provisioning success flow                       | DB, Keycloak, MinIO           | 2          |
| Provisioning failure + rollback                 | DB, Keycloak (mocked failure) | 3          |
| Tenant context middleware + SUSPENDED           | DB, Auth                      | 3          |
| Concurrent slug creation                        | DB                            | 1          |
| **Total integration tests**                     |                               | **~35**    |

### 8.3 E2E Tests

| Scenario                        | Coverage                   | Est. Count |
| ------------------------------- | -------------------------- | ---------- |
| Full wizard creation flow       | US-001 happy path          | 1          |
| Wizard with skipped steps       | Optional step handling     | 1          |
| Wizard validation errors        | FR-004, FR-012 validation  | 1          |
| Wizard crash recovery           | SessionStorage persistence | 1          |
| Suspend + 403 verification      | FR-006                     | 1          |
| Delete + countdown + reactivate | FR-007, Edge Case #8       | 1          |
| Resend invitation               | FR-012, Edge Case #10      | 1          |
| **Total E2E tests**             |                            | **~7**     |

### 8.4 Test Totals

| Type        | Count    | Coverage Target     |
| ----------- | -------- | ------------------- |
| Unit        | ~111     | ≥85% (core module)  |
| Integration | ~35      | ≥85% (admin routes) |
| E2E         | ~7       | Critical flows      |
| **Total**   | **~153** |                     |

---

## 9. Architectural Decisions

| ADR     | Decision                                       | Status   |
| ------- | ---------------------------------------------- | -------- |
| ADR-002 | Schema-per-tenant database isolation           | Accepted |
| ADR-007 | Prisma ORM for all database access             | Accepted |
| ADR-009 | Tailwind CSS v4 tokens for design system       | Accepted |
| ADR-015 | State-machine provisioning with retry/rollback | Accepted |
| ADR-016 | useReducer + per-step RHF for wizard state     | Accepted |

---

## 10. Requirement Traceability

| Requirement | Plan Section                    | Implementation Path                                     |
| ----------- | ------------------------------- | ------------------------------------------------------- |
| FR-001      | §3.1, §4.1, T001-03             | ProvisioningOrchestrator → SchemaStep                   |
| FR-002      | §3.1, §4.1, T001-03             | ProvisioningOrchestrator → KeycloakRealmStep            |
| FR-003      | §3.1, §4.1, T001-04             | ProvisioningOrchestrator → MinioBucketStep              |
| FR-004      | §3.2, T001-02, T001-11          | Slug validation regex + check-slug endpoint             |
| FR-005      | §3.6, T001-15, T001-24          | Filter expansion in API + useTenants hook               |
| FR-006      | T001-07                         | Tenant context middleware Super Admin exception         |
| FR-007      | §3.5, T001-01, T001-06          | deletionScheduledAt column + DeletionScheduler          |
| FR-008      | §3.4, T001-13, T001-19, T001-21 | Theme Zod schema + ColorPicker + ThemePreview           |
| FR-009      | T001-09, T001-22                | pluginIds in CreateTenantInput + wizard step 2          |
| FR-010      | Deferred                        | Plugin configuration overrides (separate spec)          |
| FR-011      | T001-03                         | SchemaStep runs base migrations on new tenant schema    |
| FR-012      | T001-05, T001-12, T001-22       | AdminUserStep + InvitationStep + resend-invite endpoint |
| FR-013      | T001-09, T001-22                | pluginIds in CreateTenantInput + wizard step 2          |
| FR-014      | (existing)                      | Tenant context middleware (already implemented)         |
| FR-015      | (existing)                      | Redis key prefixing (already implemented)               |
| NFR-001     | T001-03                         | 90s total timeout + step-level progress tracking        |
| NFR-002     | (existing)                      | Tenant context extraction < 5ms (already met)           |
| NFR-003     | (existing)                      | ~10,000 tenant support (schema-per-tenant, ADR-002)     |
| NFR-004     | T001-07, (existing)             | Complete tenant isolation (schema-per-tenant)           |
| NFR-005     | (existing)                      | All queries scoped to tenant schema (middleware)        |
| NFR-006     | T001-03                         | 3× retry + exponential backoff + rollback (ADR-015)     |

---

## 11. Constitution Compliance

| Article | Status    | Notes                                                                                                 |
| ------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Art. 1  | Compliant | Security-first: complete rollback, tenant isolation. WCAG 2.1 AA: T001-25 accessibility pass.         |
| Art. 2  | Compliant | All approved stack: PostgreSQL, Keycloak, MinIO, Redis, Prisma, React, Vitest. No new deps.           |
| Art. 3  | Compliant | Layered architecture (orchestrator is service layer). Prisma for all DB access. REST conventions.     |
| Art. 4  | Targeted  | ~153 tests planned. Target ≥85% for tenant module (core module). Integration tests for all endpoints. |
| Art. 5  | Compliant | Zod validation on all inputs. Parameterized queries. RBAC (Super Admin). Tenant context per request.  |
| Art. 6  | Compliant | Standard error format with codes. No stack traces. Actionable messages. Pino structured logging.      |
| Art. 7  | Compliant | snake_case tables, kebab-case files, camelCase functions, PascalCase DTOs/components.                 |
| Art. 8  | Compliant | Unit + integration + E2E per feature. AAA pattern. Deterministic. Independent. Clean test data.       |
| Art. 9  | Compliant | Feature flags for wizard rollout. Backward-compatible migration. DeletionScheduler graceful shutdown. |

---

## 12. Risk Assessment

| #   | Risk                                                                                               | Severity | Likelihood | Mitigation                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Provisioning rollback complexity — state machine is a new pattern with cross-system side effects   | HIGH     | Medium     | ADR-015 defines clear step interface. Each step unit-testable independently. Integration test covers full flow.                                                                                    |
| 2   | MinIO/Keycloak side effects hard to rollback cleanly (partial realm creation, bucket with objects) | HIGH     | Low        | Rollback failures are logged + stored in settings. Super Admin alerted for manual cleanup. No crash on rollback failure.                                                                           |
| 3   | Real-time provisioning progress — SSE vs polling decision                                          | MEDIUM   | Low        | Plan uses polling (2s interval). SSE can be added later if performance requires. Polling is simpler and sufficient for low-frequency provisioning.                                                 |
| 4   | Spec 010 overlap on theming — risk of double implementation                                        | MEDIUM   | Medium     | Spec 010 Phase 2 covers tenant theming API. This plan's T001-13 covers theme validation only. Coordinate: if Spec 010 Phase 2 ships first, T001-13 becomes a reference rather than implementation. |
| 5   | Wizard sessionStorage persistence adds complexity                                                  | LOW      | Low        | State is ~1KB serialized JSON. SessionStorage cleared on provisioning start. Reducer is pure function, easy to test.                                                                               |
| 6   | Keycloak service coverage at 2.83% (TD-003) may cause undiscovered bugs in provisioning steps      | MEDIUM   | Medium     | Provisioning steps wrap Keycloak service calls. Steps are unit-tested with mocked Keycloak service. Integration tests verify real Keycloak interaction.                                            |
| 7   | Email service may not exist yet — InvitationStep needs email sending capability                    | LOW      | Medium     | Invitation is non-blocking (provisioning succeeds without it). Can use Keycloak's built-in email capability or create minimal email service.                                                       |

---

## 13. Sprint Allocation

| Sprint    | Phases       | Tasks                   | Story Points | Focus                                                                            |
| --------- | ------------ | ----------------------- | ------------ | -------------------------------------------------------------------------------- |
| Sprint 3  | Phase 1      | T001-01 through T001-09 | 23           | DB migration + provisioning orchestrator + deletion scheduler + middleware fixes |
| Sprint 4  | Phase 2 + 3a | T001-10 through T001-21 | 33           | API endpoints + integration tests + new UI components                            |
| Sprint 5  | Phase 3b     | T001-22 through T001-27 | 24           | Wizard integration + TenantDetail updates + accessibility + E2E tests            |
| **Total** |              |                         | **80**       |                                                                                  |

**Sprint velocity assumption**: ~25–33 points per sprint (based on Sprint 1:
23 pts / 3 days, Sprint 2: 5 pts / 1 day).

---

## Cross-References

| Document           | Path                                                                |
| ------------------ | ------------------------------------------------------------------- |
| Spec               | `.forge/specs/001-multi-tenancy/spec.md`                            |
| Design Spec        | `.forge/specs/001-multi-tenancy/design-spec.md`                     |
| User Journeys      | `.forge/specs/001-multi-tenancy/user-journey.md`                    |
| ADR-002            | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`            |
| ADR-007            | `.forge/knowledge/adr/adr-007-prisma-orm.md`                        |
| ADR-009            | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`             |
| ADR-015            | `.forge/knowledge/adr/adr-015-tenant-provisioning-orchestration.md` |
| ADR-016            | `.forge/knowledge/adr/adr-016-frontend-wizard-state.md`             |
| Constitution       | `.forge/constitution.md`                                            |
| Decision Log       | `.forge/knowledge/decision-log.md`                                  |
| Design System      | `.forge/ux/design-system.md`                                        |
| Spec 010 (overlap) | `.forge/specs/010-frontend-production-readiness/spec.md`            |
