# Tasks: 014 - Frontend Layout Engine

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                             |
| ------ | ------------------------------------------------- |
| Status | Pending                                           |
| Author | forge-scrum                                       |
| Date   | 2026-03-08                                        |
| Spec   | `.forge/specs/014-frontend-layout-engine/spec.md` |
| Plan   | `.forge/specs/014-frontend-layout-engine/plan.md` |

---

## Legend

- `[FR-NNN]` — Requirement being implemented (traceability)
- `[NFR-NNN]` — Non-functional requirement
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped
- **Size**: `[S]` < 30 min · `[M]` 30 min – 2 h · `[L]` 2–4 h · `[XL]` 4+ h (split)
- **Sprint**: Sprint 010 = 2026-04-14..2026-04-25 · Sprint 011 = 2026-04-28..2026-05-09 · Sprint 012 = 2026-05-12..2026-05-23 · Sprint 013 = 2026-05-26..2026-06-06

---

## Sprint Overview

| Sprint     | Phases       | Tasks            | Story Points | Dates                   |
| ---------- | ------------ | ---------------- | ------------ | ----------------------- |
| Sprint 010 | Phase 1 + 2  | T014-01..T014-09 | 33 pts       | 2026-04-14 – 2026-04-25 |
| Sprint 011 | Phase 3 + 4  | T014-10..T014-17 | 31 pts       | 2026-04-28 – 2026-05-09 |
| Sprint 012 | Phase 5 + 6a | T014-18..T014-25 | 32 pts       | 2026-05-12 – 2026-05-23 |
| Sprint 013 | Phase 6b + 7 | T014-26..T014-32 | 23 pts       | 2026-05-26 – 2026-06-06 |
| **Total**  | 7 phases     | **32 tasks**     | **119 pts**  | ~8 weeks                |

---

## Phase 1: Core Infrastructure (Database + Types + Schemas)

> **Sprint 010** · 10 pts · All tasks parallelizable after T014-01

**Objective**: Establish the data layer and shared types that all other phases depend on.

- [x] **T014-01** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[M]` Create shared TypeScript types for layout config
  - **File**: `packages/types/src/layout-config.ts`, `packages/sdk/src/types/form-schema.ts`
  - **Type**: Create new files
  - **Description**: Define all shared types: `RoleKey` (7 roles per ADR-024), `FieldOverride`, `SectionOverride`, `ColumnOverride`, `LayoutConfig`, `LayoutConfigSnapshot`, `ResolvedLayout`, `FormSchema`, `ManifestField`, `ManifestSection`, `ManifestColumn`. Export from package index.
  - **Spec Reference**: Plan §3.5 JSONB schemas
  - **Dependencies**: None
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - All types from plan §3.5 defined with correct signatures
    - Types importable from `@plexica/types`
    - `RoleKey` includes all 7 roles per ADR-024

- [x] **T014-02** `[FR-001]` `[P]` `[S]` Extend plugin manifest type with `formSchemas`
  - **File**: `packages/sdk/src/types/manifest.ts`
  - **Type**: Modify existing
  - **Location**: Plugin manifest interface — add optional property
  - **Description**: Add optional `formSchemas?: FormSchema[]` to the plugin manifest TypeScript type. Backward-compatible extension — existing manifests compile unchanged.
  - **Spec Reference**: Plan §3.2
  - **Dependencies**: T014-01
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - Existing manifest types compile without changes
    - `formSchemas` is optional (no breaking change)
    - Type matches plan §3.5 JSON structure

- [x] **T014-03** `[FR-002]` `[NFR-005]` `[NFR-009]` `[P]` `[L]` Create Prisma migration for `layout_configs` table
  - **File**: `packages/database/prisma/migrations/YYYYMMDD_layout_configs/migration.sql`, `packages/database/prisma/schema.prisma`
  - **Type**: Create migration file + modify schema
  - **Description**: Create `layout_configs` table in the tenant schema template with all columns from plan §3.1. Add four indexes: `uq_layout_tenant` (partial unique), `uq_layout_workspace` (partial unique), `idx_layout_configs_plugin` (B-tree), `idx_layout_configs_scope_workspace` (partial B-tree). Migration must be additive-only and applied to all existing tenant schemas.
  - **Spec Reference**: Plan §3.1–3.4
  - **Dependencies**: T014-01
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Migration runs on clean DB and existing schemas
    - Unique indexes enforce one config per form per scope
    - Soft-deleted rows don't conflict with active configs
    - `pnpm db:migrate` succeeds

- [x] **T014-04** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[NFR-005]` `[P]` `[M]` Create Zod validation schemas for layout config
  - **File**: `apps/core-api/src/schemas/layout-config.schema.ts`
  - **Type**: Create new file
  - **Description**: Define Zod schemas: `fieldOverrideSchema`, `sectionOverrideSchema`, `columnOverrideSchema`, `saveLayoutConfigSchema` (PUT body with `acknowledgeWarnings` boolean), `formSchemaManifestSchema`, `roleKeySchema`. Include 256 KB JSONB size limit validation.
  - **Spec Reference**: Plan §5.3
  - **Dependencies**: T014-01
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - All valid payloads from plan examples pass validation
    - Invalid `fieldId` patterns rejected
    - `RoleKey` validates exactly 7 allowed roles
    - Payloads > 256 KB rejected
    - Schema matches plan §3.5 exactly

---

## Phase 2: Backend Service Layer

> **Sprint 010** · 23 pts · T014-08 and T014-09 parallelizable after T014-05

**Objective**: Implement the core layout config service with CRUD, validation, caching, and resolution logic.

- [x] **T014-05** `[FR-002]` `[FR-015]` `[FR-016]` `[FR-018]` `[FR-019]` `[FR-022]` `[FR-023]` `[L]` Implement LayoutConfigService CRUD operations
  - **File**: `apps/core-api/src/services/layout-config.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `getConfig()`, `saveConfig()`, `revertConfig()`, `deleteConfig()`, `listConfigurableForms()`, `softDeleteByPlugin()`, `restoreByPlugin()`, `invalidateCache()`. `saveConfig()` must store current config as `previous_version` before overwrite (FR-018), support optimistic concurrency via `updated_at` ETag, and call audit log service (FR-022). `revertConfig()` swaps current and `previous_version` (FR-019).
  - **Spec Reference**: Plan §5.1
  - **Dependencies**: T014-03, T014-04
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - CRUD works for both tenant and workspace scope
    - `previous_version` stored on save, swapped on revert
    - ETag mismatch returns `409 LAYOUT_CONFIG_CONFLICT`
    - Audit log entries created for save, revert, delete
    - `NO_PREVIOUS_VERSION` error when reverting without previous version

- [x] **T014-06** `[FR-010]` `[FR-011]` `[FR-020]` `[NFR-012]` `[M]` Implement LayoutConfigValidationService
  - **File**: `apps/core-api/src/services/layout-config-validation.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `validateAgainstManifest()` (verify all field/section/column IDs exist in plugin manifest), `detectRequiredFieldWarnings()` (identify required fields hidden with no default — FR-011), `detectStaleReferences()` (Edge Case #1), `validateSize()` (256 KB limit).
  - **Spec Reference**: Plan §5.2
  - **Dependencies**: T014-04, T014-02
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - Non-existent field IDs rejected with `INVALID_FIELD_REFERENCE`
    - Required fields with no default detected as warnings
    - Required fields WITH defaults pass without warning
    - Stale references detected (warning only, not rejection)
    - Configs > 256 KB rejected with `LAYOUT_CONFIG_TOO_LARGE`

- [x] **T014-07** `[FR-007]` `[FR-008]` `[FR-009]` `[FR-025]` `[FR-026]` `[NFR-001]` `[NFR-008]` `[XL]` Implement layout config resolution engine
  - **File**: `apps/core-api/src/services/layout-config.service.ts` (add `resolveForUser` method)
  - **Type**: Modify existing
  - **Location**: `LayoutConfigService` class — new method `resolveForUser()`
  - **Description**: Implement full resolution algorithm: (1) select workspace or tenant config, (2) merge with manifest defaults for unconfigured fields, (3) resolve per-user role visibility using ABAC engine (ADR-017) and team member roles (ADR-024), (4) apply "most permissive wins" across multiple team memberships (FR-007) — permissiveness order: `visible` > `readonly` > `hidden`, (5) fail-open when config unavailable (NFR-008), (6) silently skip removed fields, append new fields at end.
  - **Spec Reference**: Plan §4.10, §5.1
  - **Dependencies**: T014-05, T014-06
  - **Story Points**: 8
  - **Acceptance Criteria**:
    - Workspace override fully replaces tenant config (FR-009)
    - No config → manifest defaults (all visible, all editable)
    - Most permissive wins across team memberships
    - Keycloak-only users (no team membership) use realm role only (Edge Case #2)
    - Resolution completes in < 50ms P95 (NFR-001)
    - Fail-open returns manifest defaults on any error

- [x] **T014-08** `[NFR-011]` `[NFR-008]` `[P]` `[M]` Implement Redis caching layer for layout configs
  - **File**: `apps/core-api/src/services/layout-config.service.ts` (add caching to existing methods)
  - **Type**: Modify existing
  - **Location**: `LayoutConfigService` — cache integration in `resolveForUser()`, `saveConfig()`, `revertConfig()`, `deleteConfig()`
  - **Description**: Add Redis caching to the resolution path. Cache key: `layout:{tenantId}:{formId}:{scope}`. TTL: 300s ± 30s jitter. Cache stores pre-role-resolution config blob. Invalidate on save, revert, and delete. Fail-open: bypass cache on Redis error (log warning, fall through to DB).
  - **Spec Reference**: Plan §1.2, §5.1
  - **Dependencies**: T014-05
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Cache invalidated on every write operation
    - TTL has jitter (not all keys expire simultaneously)
    - Redis unavailability does not break resolution (fail-open)
    - Cache key uses correct `layout:{tenantId}:{formId}:{scope}` format

- [x] **T014-09** `[FR-024]` `[P]` `[S]` Implement plugin uninstall hook for layout config cleanup
  - **File**: `apps/core-api/src/services/plugin.service.ts`, `apps/core-api/src/services/layout-config.service.ts`
  - **Type**: Modify existing
  - **Location**: `PluginService` — uninstall and reinstall lifecycle methods
  - **Description**: Hook into plugin uninstall flow to call `LayoutConfigService.softDeleteByPlugin()` (sets `deleted_at` on all configs for the plugin). Hook into plugin reinstall to call `restoreByPlugin()`. Invalidate Redis cache for all affected forms on both operations.
  - **Spec Reference**: Plan §5.1
  - **Dependencies**: T014-05
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - All layout configs for uninstalled plugin have `deleted_at` set
    - Reinstalled plugin configs restored (`deleted_at` cleared)
    - Cache invalidated for all affected forms
    - Soft-deleted configs absent from `listConfigurableForms()`

---

## Phase 3: Backend API Routes

> **Sprint 011** · 13 pts · T014-13 parallelizable with T014-10

**Objective**: Expose all 10 REST endpoints with auth, validation, caching, and error handling.

- [x] **T014-10** `[FR-015]` `[FR-016]` `[FR-019]` `[FR-023]` `[NFR-007]` `[L]` Implement tenant-scope layout config routes
  - **File**: `apps/core-api/src/routes/layout-config.ts`
  - **Type**: Create new file
  - **Description**: Implement 6 tenant-scope routes: `GET /api/v1/layout-configs/forms`, `GET /api/v1/layout-configs/:formId`, `PUT /api/v1/layout-configs/:formId`, `POST /api/v1/layout-configs/:formId/revert`, `DELETE /api/v1/layout-configs/:formId`, `GET /api/v1/layout-configs/:formId/resolved`. Apply `TENANT_ADMIN` auth guard on admin routes. Apply Bearer auth on read routes. Wire Zod validation. Return standard error format (Art. 6.2). Set `Cache-Control: private, no-store` on resolved endpoint. Handle ETag/If-Match for concurrent edit detection.
  - **Spec Reference**: Plan §4.1–4.5, §4.10
  - **Dependencies**: T014-05, T014-06, T014-07
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - All 6 tenant-scope endpoints respond correctly
    - `TENANT_ADMIN` enforced on admin operations
    - Zod validation rejects invalid payloads with 400
    - Error responses follow `{ error: { code, message, details } }` format
    - ETag/If-Match conflict handling works

- [x] **T014-11** `[FR-009]` `[FR-015]` `[FR-016]` `[NFR-007]` `[M]` Implement workspace-scope layout config routes
  - **File**: `apps/core-api/src/routes/layout-config.ts` (add workspace routes)
  - **Type**: Modify existing
  - **Location**: After tenant-scope route registrations
  - **Description**: Implement 4 workspace-scope routes: `GET /api/v1/workspaces/:wId/layout-configs/:formId`, `PUT /api/v1/workspaces/:wId/layout-configs/:formId`, `POST /api/v1/workspaces/:wId/layout-configs/:formId/revert`, `DELETE /api/v1/workspaces/:wId/layout-configs/:formId`. Apply workspace `ADMIN`+ role guard (ADR-024 effective role). Return `403 INSUFFICIENT_WORKSPACE_ROLE` on insufficient permissions (Edge Case #10).
  - **Spec Reference**: Plan §4.6–4.9
  - **Dependencies**: T014-10
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - All 4 workspace-scope endpoints respond correctly
    - Workspace membership and `ADMIN`+ role validated
    - `403 INSUFFICIENT_WORKSPACE_ROLE` returned for unauthorized access
    - Workspace routes share service layer with tenant routes (DRY)

- [x] **T014-12** `[FR-021]` `[NFR-006]` `[M]` Implement read-only field enforcement middleware
  - **File**: `apps/core-api/src/middleware/layout-readonly-guard.ts`, `apps/core-api/src/middleware/auth.ts`
  - **Type**: Create new file + modify existing
  - **Description**: Create middleware that, on plugin form submission endpoints, resolves the layout for the current user and strips values of fields marked `readonly` for their effective role before the handler runs. Modify auth middleware to expose effective team roles in Fastify request context as `request.effectiveRoles`. Middleware is opt-in (registered on plugin form submission routes).
  - **Spec Reference**: Plan §5.15
  - **Dependencies**: T014-07
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Read-only field values stripped from request body before handler
    - Existing DB values preserved when read-only field stripped
    - Non-readonly fields pass through unchanged
    - Effective team roles available in `request.effectiveRoles`
    - 100% server-side enforcement (NFR-006)

- [x] **T014-13** `[FR-001]` `[NFR-004]` `[P]` `[S]` Implement formSchemas validation on plugin register
  - **File**: `apps/core-api/src/routes/plugin.ts`
  - **Type**: Modify existing
  - **Location**: Plugin registration and update request handling
  - **Description**: Add Zod validation for `formSchemas` in plugin manifest during plugin registration and update. Valid manifests without `formSchemas` pass (backward compatible). Invalid `formSchemas` structures rejected with 400. Manifests with 200+ fields per form must be accepted (NFR-004).
  - **Spec Reference**: Plan §5.3, §4.13
  - **Dependencies**: T014-04
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - Plugins with valid `formSchemas` register successfully
    - Plugins without `formSchemas` register successfully
    - Invalid `formSchemas` rejected with 400
    - Manifests with 200+ fields accepted (NFR-004)

---

## Phase 4: Frontend — Shared Hook & Layout-Aware Components

> **Sprint 011** · 18 pts · T014-16 and T014-17 parallelizable with T014-15

**Objective**: Implement the end-user facing components that consume resolved layouts.

- [x] **T014-14** `[FR-017]` `[NFR-002]` `[NFR-008]` `[M]` Implement `useResolvedLayout` React Query hook
  - **File**: `apps/web/src/hooks/useResolvedLayout.ts`
  - **Type**: Create new file
  - **Description**: Create React Query hook calling `GET /api/v1/layout-configs/:formId/resolved?workspaceId=...`. Configure `staleTime: 60_000` (FR-017). Return `{ data: ResolvedLayout | null, isLoading, isError }`. On error, return `null` silently (fail-open per NFR-008) — consuming components fall back to manifest defaults.
  - **Spec Reference**: Plan §5.14
  - **Dependencies**: T014-10
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Hook fetches resolved layout on mount
    - `staleTime: 60_000` configured
    - Error state returns `null` (not throws) for fail-open
    - Loading state returns `isLoading: true`
    - Workspace ID passed as query param when provided

- [x] **T014-15** `[FR-025]` `[FR-007]` `[FR-008]` `[FR-010]` `[NFR-008]` `[NFR-010]` `[XL]` Implement `<LayoutAwareForm>` component
  - **File**: `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`
  - **Type**: Create new file
  - **Description**: Create wrapper component that: (1) fetches resolved layout via `useResolvedLayout`, (2) reorders fields per config, (3) removes hidden fields from DOM, (4) applies read-only treatment (disabled + visual styling + tooltip), (5) auto-injects default values for hidden required fields (FR-010), (6) shows skeleton during loading, (7) shows empty state when all fields hidden (Edge Case #3), (8) falls back to manifest defaults on error (NFR-008). Supports render prop pattern for flexible composition. Sections rendered in configured order with collapsible headers.
  - **Spec Reference**: Plan §5.12
  - **Dependencies**: T014-14, T014-01
  - **Story Points**: 8
  - **Acceptance Criteria**:
    - Fields rendered in configured order
    - Hidden fields completely removed from DOM
    - Read-only fields visually disabled with tooltip
    - Hidden required fields with defaults auto-populated in form state
    - Skeleton shown during loading; empty state when all fields hidden
    - Manifest defaults used on error (fail-open)
    - WCAG 2.1 AA: tab order follows field order, ARIA attributes correct

- [x] **T014-16** `[FR-026]` `[FR-005]` `[FR-008]` `[NFR-008]` `[P]` `[M]` Implement `<LayoutAwareTable>` component
  - **File**: `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`
  - **Type**: Create new file
  - **Description**: Create wrapper component that: (1) fetches resolved layout via `useResolvedLayout`, (2) filters column definitions based on visibility, (3) reorders columns per config, (4) passes filtered columns + data to existing `DataTable` from `@plexica/ui`, (5) shows skeleton during loading, (6) shows empty state when all columns hidden, (7) falls back to all columns on error (fail-open).
  - **Spec Reference**: Plan §5.13
  - **Dependencies**: T014-14, T014-01
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - Hidden columns removed from table
    - Columns rendered in configured order
    - DataTable props (sorting, pagination, filtering) pass through correctly
    - Skeleton table during loading; empty state when all columns hidden for role
    - All columns shown on error (fail-open)

- [x] **T014-17** `[FR-003]` `[FR-005]` `[NFR-010]` `[P]` `[S]` Implement `VisibilityToggle` component
  - **File**: `apps/web/src/components/layout-engine/VisibilityToggle.tsx`
  - **Type**: Create new file
  - **Description**: Create cycling icon button with two modes: field mode (3 states: editable → read-only → hidden) and column mode (2 states: visible → hidden). Visual states: ✓ₑ green, ✓ᵣ blue, ✗ red. ARIA label updates on each cycle. Focus ring visible on keyboard focus. 44×44px minimum touch target. Keyboard: Enter/Space to cycle.
  - **Spec Reference**: Plan §5.9, Design Spec Component: VisibilityToggle
  - **Dependencies**: T014-01
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - Field mode cycles through 3 states correctly
    - Column mode cycles through 2 states correctly
    - ARIA label updated on each cycle (screen reader announces change)
    - Focus ring visible on keyboard focus
    - Touch target ≥ 44×44px; colors match design system tokens

---

## Phase 5: Frontend — Admin Panel

> **Sprint 012** · 24 pts · T014-20 and T014-21 parallelizable after T014-17

**Objective**: Implement the admin configuration interface.

- [x] **T014-18** `[FR-012]` `[FR-014]` `[FR-015]` `[FR-023]` `[L]` Implement `LayoutConfigPanel` orchestrator
  - **File**: `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`
  - **Type**: Create new file
  - **Description**: Create the admin panel page component orchestrating all sub-components. Manages state: form selection (populated from `GET /forms`), scope switching (tenant ↔ workspace), unsaved changes tracking, save flow (required field warning dialog, conflict dialog). Includes loading skeleton, empty state when no forms available, and `beforeunload` warning for unsaved changes.
  - **Spec Reference**: Plan §5.5
  - **Dependencies**: T014-14, T014-17
  - **Story Points**: 8
  - **Acceptance Criteria**:
    - Form selector populated from API
    - Scope switching works (tenant ↔ workspace)
    - Unsaved changes tracked and displayed
    - `beforeunload` warning on navigate-away with unsaved changes
    - Save flow handles 200, 400 (required field warning), 409 (conflict)
    - Loading skeleton + empty state when no configurable forms

- [x] **T014-19** `[FR-003]` `[FR-012]` `[FR-013]` `[NFR-010]` `[NFR-012]` `[L]` Implement `FieldConfigTable` grid component
  - **File**: `apps/web/src/components/layout-engine/FieldConfigTable.tsx`
  - **Type**: Create new file
  - **Description**: Create WAI-ARIA grid table with columns: Field Name (shows ⚠ for required, ! for stale), Order ([▲][▼] icon buttons — boundary arrows disabled), role-specific visibility columns (using `VisibilityToggle`), Global (using `<Select>`). ARIA: `role="grid"`, `role="row"`, `role="rowheader"`. Screen reader announces position changes.
  - **Spec Reference**: Plan §5.6, Design Spec Component: FieldConfigTable
  - **Dependencies**: T014-17
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - All fields rendered with correct indicators (⚠ required, ! stale)
    - Up/down arrows reorder fields; boundary arrows disabled
    - Visibility toggles cycle correctly per role
    - Global select updates `globalVisibility`
    - WAI-ARIA grid pattern; keyboard navigation via Tab and Enter/Space

- [x] **T014-20** `[FR-005]` `[FR-012]` `[P]` `[M]` Implement `ColumnConfigTable` grid component
  - **File**: `apps/web/src/components/layout-engine/ColumnConfigTable.tsx`
  - **Type**: Create new file
  - **Description**: Similar to `FieldConfigTable` but for columns. No ordering controls. No read-only state (columns are only visible/hidden). Uses bi-state `VisibilityToggle`. ARIA grid pattern.
  - **Spec Reference**: Plan §5.7, Design Spec Component: ColumnConfigTable
  - **Dependencies**: T014-17
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - All columns rendered with role visibility toggles
    - Bi-state toggle (visible/hidden) works correctly
    - Global column visibility select works
    - ARIA grid pattern implemented

- [x] **T014-21** `[FR-004]` `[FR-012]` `[P]` `[S]` Implement `SectionOrderList` component
  - **File**: `apps/web/src/components/layout-engine/SectionOrderList.tsx`
  - **Type**: Create new file
  - **Description**: Reorderable list of sections with [▲][▼] arrow controls. Simpler than field reordering (no visibility toggles). Screen reader announces position changes on each move.
  - **Spec Reference**: Plan §5.8, Design Spec Component: SectionOrderList
  - **Dependencies**: None (standalone)
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - Sections listed with current order
    - Up/down arrows reorder sections; boundary arrows disabled
    - Screen reader announces position changes

- [x] **T014-22** `[FR-014]` `[M]` Implement `RolePreviewPanel` component
  - **File**: `apps/web/src/components/layout-engine/RolePreviewPanel.tsx`
  - **Type**: Create new file
  - **Description**: Read-only form preview for a selected role. Computes visible fields client-side from current (possibly unsaved) config state — no API call. Renders preview with placeholder data. Read-only fields shown with greyed background. Hidden fields omitted with annotation at bottom. `aria-live="polite"` on role change. All inputs `tabindex="-1"`. Updates reactively as config changes (live preview).
  - **Spec Reference**: Plan §5.10, Design Spec Component: RolePreviewPanel
  - **Dependencies**: T014-15
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Preview updates live as admin changes toggles (no save required)
    - Correct fields shown/hidden for selected role
    - Read-only fields visually greyed; hidden fields annotated at bottom
    - `aria-live` announces role change; preview non-interactive (tabindex="-1")

- [x] **T014-23** `[FR-011]` `[M]` Implement `RequiredFieldWarningDialog` and settings route
  - **File**: `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx`, `apps/web/src/routes/settings/layout-configuration.tsx`, `apps/web/src/routes/settings/index.tsx`
  - **Type**: Create new files + modify existing
  - **Description**: Create modal dialog shown when save returns `400 REQUIRED_FIELD_NO_DEFAULT`. Lists affected fields. [Cancel] reverts toggles and closes. [Proceed Anyway] resends PUT with `acknowledgeWarnings: true`. Focus trap, Esc = Cancel, initial focus on [Cancel]. Also create the TanStack Router route for the admin panel and add "Layout Configuration" entry to the settings sidebar navigation.
  - **Spec Reference**: Plan §5.11
  - **Dependencies**: T014-18
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Dialog opens on `REQUIRED_FIELD_NO_DEFAULT` error; affected fields listed
    - [Cancel] closes dialog, reverts toggles
    - [Proceed Anyway] resends with `acknowledgeWarnings: true`
    - Focus trap works; Esc closes dialog
    - Route accessible at Settings > Layout Configuration; sidebar nav item added

---

## Phase 6a: Testing — Unit Tests

> **Sprint 012** · 8 pts · Both tasks parallelizable

**Objective**: Unit test coverage for service layer and validation logic.

- [x] **T014-24** `[FR-007]` `[FR-008]` `[FR-009]` `[NFR-001]` `[NFR-008]` `[P]` `[L]` Unit tests — LayoutConfigService resolution engine
  - **File**: `apps/core-api/src/__tests__/layout-config/unit/layout-config.service.test.ts`
  - **Type**: Create new file
  - **Description**: Unit tests for `resolveForUser()` covering: workspace override > tenant config > manifest defaults, most permissive wins across team memberships, role-specific > globalVisibility fallback, Keycloak-only users (Edge Case #2), all fields hidden, stale fields silently skipped, new fields appended, fail-open on error. Target: 100% branch coverage on resolution logic. ≥ 20 test cases.
  - **Spec Reference**: Plan §11.1, T014-24 task spec
  - **Dependencies**: T014-07
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - ≥ 20 test cases covering all resolution branches
    - Each Edge Case #1–#10 has at least one test
    - FR-007 (most permissive) tested with multi-team scenarios
    - NFR-008 (fail-open) tested with simulated errors
    - All tests pass in < 100ms each

- [x] **T014-25** `[FR-010]` `[FR-011]` `[FR-020]` `[NFR-004]` `[NFR-012]` `[P]` `[M]` Unit tests — LayoutConfigValidationService
  - **File**: `apps/core-api/src/__tests__/layout-config/unit/layout-config-validation.service.test.ts`
  - **Type**: Create new file
  - **Description**: Unit tests for manifest validation: invalid field references, required field warnings, stale references, size limits. Test with manifests containing 200 fields to verify NFR-004 performance (< 10ms processing).
  - **Spec Reference**: Plan §11.1, T014-25 task spec
  - **Dependencies**: T014-06
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Invalid field/section/column IDs rejected
    - Required field warnings correctly detected
    - Size > 256 KB rejected
    - Stale references detected
    - 200-field manifest processes in < 10ms (NFR-004)

---

## Phase 6b: Testing — Integration & E2E Tests

> **Sprint 013** · 18 pts · T014-27 parallelizable with T014-26; T014-28 parallelizable

**Objective**: Integration and E2E test coverage for API, middleware, frontend, and full user flows.

- [x] **T014-26** `[NFR-005]` `[NFR-007]` `[L]` Integration tests — layout config API endpoints
  - **File**: `apps/core-api/src/__tests__/layout-config/integration/layout-config.routes.test.ts`
  - **Type**: Create new file
  - **Description**: Integration tests for all 10 API endpoints with real database. Test RBAC enforcement (TENANT_ADMIN, workspace ADMIN+). Test tenant isolation (tenant A cannot access tenant B's configs — NFR-005). Test optimistic concurrency (409 on ETag mismatch). Test Redis cache invalidation on write. Test `formSchemas` validation on plugin register.
  - **Spec Reference**: Plan §11.2, T014-26 task spec
  - **Dependencies**: T014-10, T014-11
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - All 10 endpoints tested (happy path + error cases)
    - Tenant isolation verified (cross-tenant access blocked)
    - RBAC enforcement verified for all role levels
    - Concurrent edit conflict (409) verified
    - Redis cache invalidated on write operations
    - Standard error format verified (Art. 6.2)

- [x] **T014-27** `[FR-021]` `[NFR-006]` `[P]` `[M]` Integration tests — read-only field enforcement
  - **File**: `apps/core-api/src/__tests__/layout-config/integration/readonly-guard.test.ts`
  - **Type**: Create new file
  - **Description**: Integration tests verifying server-side read-only enforcement: (1) read-only field value stripped from form submission, (2) existing value preserved after strip, (3) non-readonly fields pass through, (4) middleware works with both tenant and workspace configs.
  - **Spec Reference**: Plan §11.2, T014-27 task spec
  - **Dependencies**: T014-12
  - **Story Points**: 3
  - **Acceptance Criteria**:
    - Read-only field values stripped from request body
    - Existing DB values preserved for stripped fields
    - Non-readonly fields pass through unchanged
    - 100% server-side enforcement verified

- [x] **T014-28** `[FR-025]` `[FR-026]` `[NFR-008]` `[NFR-010]` `[P]` `[L]` Unit tests — frontend components
  - **File**: `apps/web/src/__tests__/layout-engine/` (multiple test files)
  - **Type**: Create new files
  - **Description**: React Testing Library unit tests for: `<LayoutAwareForm>` (field ordering, hidden fields, read-only treatment, empty state, skeleton, fail-open), `<LayoutAwareTable>` (column filtering, empty state, fail-open), `VisibilityToggle` (cycling, ARIA labels, keyboard), `useResolvedLayout` (cache behavior, error handling, staleTime). Target ≥ 80% coverage per component.
  - **Spec Reference**: Plan §11.1, T014-28 task spec
  - **Dependencies**: T014-15, T014-16, T014-17
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - Each component's states (loading, resolved, error, empty) tested
    - ARIA attributes verified; keyboard interactions verified
    - Fail-open behavior verified for each component
    - ≥ 80% coverage for all frontend components

- [x] **T014-29** `[US-001]` `[US-002]` `[US-007]` `[US-008]` `[US-009]` `[US-010]` `[L]` E2E test — admin configures layout, end user sees changes
  - **File**: `apps/core-api/src/__tests__/layout-config/e2e/layout-config.e2e.test.ts`
  - **Type**: Create new file
  - **Description**: Full E2E test covering Journey 1 + Journey 2: (1) Admin navigates to Layout Config panel, (2) selects a form, (3) reorders a field, (4) hides a field for VIEWER role, (5) previews as VIEWER in preview panel, (6) saves config, (7) end user (VIEWER) opens form and sees configured layout, (8) admin reverts, (9) end user sees previous layout. Also tests Journey 4: required field warning flow with acknowledge.
  - **Spec Reference**: Plan §11.3, T014-29 task spec
  - **Dependencies**: T014-23 (all components complete)
  - **Story Points**: 5
  - **Acceptance Criteria**:
    - Full admin → end-user flow works end-to-end
    - Reorder persists and reflects in end-user view
    - Hidden field not rendered for VIEWER
    - Revert restores previous layout
    - Required field warning dialog appears and works
    - Each test case completes in < 5s

---

## Phase 7: Documentation & Feature Flag

> **Sprint 013** · 5 pts · All tasks parallelizable

**Objective**: Update documentation and enable feature flag for zero-downtime rollout.

- [x] **T014-30** `[FR-001]` `[P]` `[S]` Update plugin development documentation
  - **File**: `docs/PLUGIN_DEVELOPMENT.md`, `packages/sdk/README.md`
  - **Type**: Modify existing
  - **Description**: Document the `formSchemas` manifest extension: structure, field types, sections, columns. Provide working TypeScript examples. Document how layout configs interact with plugin forms. Update SDK README with `formSchemas` types and usage examples.
  - **Spec Reference**: Plan §8 (T014-30)
  - **Dependencies**: T014-02
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - `formSchemas` structure documented with examples
    - Field types enumerated; section and column patterns documented
    - SDK README updated with TypeScript types and usage

- [x] **T014-31** `[FR-021]` `[NFR-006]` `[P]` `[S]` Update security documentation
  - **File**: `docs/SECURITY.md`
  - **Type**: Modify existing
  - **Location**: Server-side enforcement / input validation section
  - **Description**: Document the server-side read-only field enforcement pattern. Explain that client-side read-only is cosmetic only and the backend strips readonly field values from form submissions via `layout-readonly-guard.ts` middleware. Reference FR-021 and NFR-006.
  - **Spec Reference**: Plan §8 (T014-31)
  - **Dependencies**: T014-12
  - **Story Points**: 1
  - **Acceptance Criteria**:
    - Read-only enforcement pattern documented
    - Server-side vs client-side distinction clear
    - Reference to `layout-readonly-guard.ts` middleware included

- [ ] **T014-32** `[P]` `[M]` Implement `layout_engine_enabled` feature flag
  - **File**: `apps/core-api/src/routes/layout-config.ts`, `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`, `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`
  - **Type**: Modify existing
  - **Description**: Gate the entire layout engine behind `layout_engine_enabled` per-tenant feature flag. When disabled: admin panel route returns 404, resolved endpoint returns manifest defaults, `<LayoutAwareForm>` and `<LayoutAwareTable>` render with manifest defaults. Flag togglable per-tenant by super admin. No user-facing error when disabled.
  - **Spec Reference**: Plan §8 (T014-32), Constitution Art. 9.1
  - **Dependencies**: T014-10, T014-18
  - **Story Points**: 2
  - **Acceptance Criteria**:
    - Feature flag checked on all layout config routes
    - Disabled tenants see manifest default layouts
    - Admin panel hidden for disabled tenants
    - Flag togglable per-tenant by super admin
    - No user-facing error when flag is disabled

---

## Dependency Graph

```
T014-01 (types) ───┬──▶ T014-02 (manifest types)  ──────────────────────────────▶ T014-13 (plugin validation) ─ T014-30 (docs)
                   ├──▶ T014-03 (migration)  ─┬──▶ T014-05 (CRUD) ─┬──▶ T014-07 (resolution) ─┬──▶ T014-10 (tenant routes) ─┬──▶ T014-11 (ws routes) ─┬──▶ T014-26 (int: routes)
                   │                           │                     │                            │                              │                            └──▶ T014-32 (feature flag)
                   │                           │                     │                            │                              └──▶ T014-14 (hook) ──────────┬──▶ T014-15 (LayoutAwareForm) ──▶ T014-22 (RolePreviewPanel)
                   └──▶ T014-04 (Zod) ─────────┘                   │                            │                                                            └──▶ T014-16 (LayoutAwareTable)
                                               │                    ├──▶ T014-08 (caching)       │
                        T014-06 (validation) ──┘                    └──▶ T014-09 (plugin hook)   └──▶ T014-12 (readonly guard) ──▶ T014-27 (int: readonly) / T014-31 (docs)
                             │
                             └──▶ T014-25 (unit: validation)
                        T014-07 ─────────────────────────────────────────────────────────────────────▶ T014-24 (unit: resolution)
                        T014-17 (VisibilityToggle) ──┬──▶ T014-19 (FieldConfigTable)
                        [no deps]                    ├──▶ T014-20 (ColumnConfigTable)
                        T014-21 (SectionOrderList)   └──▶ T014-18 (LayoutConfigPanel) ─▶ T014-23 (dialog + route) ─▶ T014-29 (E2E)
                        T014-15/16/17 ───────────────────────────────────────────────────────────────────────────────▶ T014-28 (unit: frontend)
```

---

## Critical Path

The longest dependency chain spans all 4 sprints (11 tasks, ~119 pts total):

```
T014-01 → T014-03 → T014-05 → T014-07 → T014-10 → T014-14 → T014-15 → T014-22 → T014-18 → T014-23 → T014-29
```

| Step | Task    | Description                          | Sprint | Points |
| ---- | ------- | ------------------------------------ | ------ | ------ |
| 1    | T014-01 | Shared TypeScript types              | 010    | 2      |
| 2    | T014-03 | Prisma migration                     | 010    | 3      |
| 3    | T014-05 | LayoutConfigService CRUD             | 010    | 5      |
| 4    | T014-07 | Resolution engine                    | 010    | 8      |
| 5    | T014-10 | Tenant-scope routes                  | 011    | 5      |
| 6    | T014-14 | `useResolvedLayout` hook             | 011    | 3      |
| 7    | T014-15 | `<LayoutAwareForm>` component        | 011    | 8      |
| 8    | T014-22 | `RolePreviewPanel`                   | 012    | 3      |
| 9    | T014-18 | `LayoutConfigPanel` orchestrator     | 012    | 8      |
| 10   | T014-23 | `RequiredFieldWarningDialog` + route | 012    | 3      |
| 11   | T014-29 | E2E test — full user journey         | 013    | 5      |

**Critical path length**: 11 tasks · 53 pts · 4 sprints

---

## Definition of Done

The following checklist must be satisfied for each task and for the feature as a whole:

### Per-Task Checklist

- [ ] Code written and self-reviewed
- [ ] File paths match plan §6 File Map exactly
- [ ] No TypeScript errors (`strict: true`)
- [ ] No `any` types (except documented `@ts-expect-error`)
- [ ] Explicit file extensions in all relative imports (`.js`/`.ts`)
- [ ] Tests written (unit/integration/E2E as appropriate)
- [ ] All new tests passing locally
- [ ] Coverage ≥ 80% for new files (≥ 100% for security-critical paths)

### Feature-Level Checklist (before merge)

- [ ] All 32 tasks complete `[x]`
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes (TypeScript compilation)
- [ ] `pnpm test` passes (all 3 test types)
- [ ] Overall coverage ≥ 80% (Constitution Art. 4.1)
- [ ] `layout-config` module coverage ≥ 80%
- [ ] Resolution engine unit tests: 100% branch coverage
- [ ] Tenant isolation verified in integration tests
- [ ] WCAG 2.1 AA: axe-core passes on admin panel
- [ ] `/forge-review` run — all HIGH severity findings resolved
- [ ] `planning/PROJECT_STATUS.md` updated to reflect Spec 014 complete
- [ ] `docs/PLUGIN_DEVELOPMENT.md` updated (T014-30)
- [ ] `docs/SECURITY.md` updated (T014-31)
- [ ] Feature flag `layout_engine_enabled` operational (T014-32)
- [ ] PR description references spec 014 (`Closes spec 014`)

---

## Summary

| Metric                | Value                                                 |
| --------------------- | ----------------------------------------------------- |
| Total tasks           | 32 (T014-01 through T014-32)                          |
| Total story points    | 119 pts                                               |
| Total phases          | 7 (Phase 1–7)                                         |
| Parallelizable tasks  | 18 tasks marked `[P]`                                 |
| FRs covered           | 26 (FR-001 through FR-026)                            |
| NFRs covered          | 12 (NFR-001 through NFR-012)                          |
| User stories covered  | 10 (US-001 through US-010)                            |
| Sprints required      | 4 (Sprint 010–013)                                    |
| Sprint point totals   | 010: 33 pts · 011: 31 pts · 012: 32 pts · 013: 23 pts |
| Critical path length  | 11 tasks (T014-01 → T014-29)                          |
| New files created     | 19                                                    |
| Existing files edited | 8                                                     |

---

## Traceability Matrix

### Functional Requirements → Tasks

| FR     | Description (short)                  | Tasks                              |
| ------ | ------------------------------------ | ---------------------------------- |
| FR-001 | Plugin `formSchemas` manifest ext    | T014-02, T014-13, T014-30          |
| FR-002 | `layout_configs` table               | T014-03, T014-05                   |
| FR-003 | Field visibility per role            | T014-01, T014-04, T014-17, T014-19 |
| FR-004 | Section ordering                     | T014-01, T014-21                   |
| FR-005 | Column visibility per role           | T014-01, T014-16, T014-20          |
| FR-006 | `RoleKey` type definition            | T014-01, T014-04                   |
| FR-007 | Most permissive wins                 | T014-07, T014-24                   |
| FR-008 | Visibility cascade                   | T014-07, T014-24                   |
| FR-009 | Workspace override (full replace)    | T014-07, T014-11                   |
| FR-010 | Auto-inject hidden required defaults | T014-15                            |
| FR-011 | Required field warning               | T014-06, T014-23                   |
| FR-012 | Admin config interface               | T014-18, T014-19, T014-20, T014-21 |
| FR-013 | Field reordering                     | T014-19                            |
| FR-014 | Role preview panel                   | T014-22                            |
| FR-015 | PUT save endpoint                    | T014-05, T014-10, T014-11          |
| FR-016 | GET read endpoint                    | T014-10, T014-11                   |
| FR-017 | Client-side staleTime 60s            | T014-14                            |
| FR-018 | Store previous version on save       | T014-05                            |
| FR-019 | Revert to previous version           | T014-05, T014-10                   |
| FR-020 | Validate against manifest            | T014-06                            |
| FR-021 | Server-side read-only enforcement    | T014-12, T014-27, T014-31          |
| FR-022 | Audit log on config changes          | T014-05                            |
| FR-023 | List configurable forms              | T014-05, T014-10                   |
| FR-024 | Soft-delete on plugin uninstall      | T014-09                            |
| FR-025 | `<LayoutAwareForm>` wrapper          | T014-15                            |
| FR-026 | `<LayoutAwareTable>` wrapper         | T014-16                            |

### User Stories → Tasks

| Story  | Description (short)                   | Tasks                     |
| ------ | ------------------------------------- | ------------------------- |
| US-001 | Admin configures field layout         | T014-15, T014-19          |
| US-002 | End user sees configured layout       | T014-07, T014-15, T014-24 |
| US-003 | Read-only fields enforced server-side | T014-12, T014-15, T014-27 |
| US-004 | Admin reorders sections               | T014-21                   |
| US-005 | End user sees configured columns      | T014-16, T014-20          |
| US-006 | Workspace-level override              | T014-07, T014-11          |
| US-007 | Required field warning dialog         | T014-06, T014-23          |
| US-008 | Admin panel with form selector        | T014-18, T014-19, T014-22 |
| US-009 | useResolvedLayout hook                | T014-14, T014-15          |
| US-010 | Revert to previous version            | T014-05                   |

---

## Cross-References

| Document     | Path                                                           |
| ------------ | -------------------------------------------------------------- |
| Spec         | `.forge/specs/014-frontend-layout-engine/spec.md`              |
| Plan         | `.forge/specs/014-frontend-layout-engine/plan.md`              |
| Design Spec  | `.forge/specs/014-frontend-layout-engine/design-spec.md`       |
| User Journey | `.forge/specs/014-frontend-layout-engine/user-journey.md`      |
| Decision Log | `.forge/knowledge/decision-log.md` (Spec 014 entry)            |
| ADR-002      | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       |
| ADR-004/011  | `.forge/knowledge/adr/adr-004-module-federation.md`            |
| ADR-017      | `.forge/knowledge/adr/adr-017-abac-engine.md`                  |
| ADR-024      | `.forge/knowledge/adr/adr-024-team-member-role-vs-keycloak.md` |
| ADR-025      | `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`       |
| Constitution | `.forge/constitution.md`                                       |
