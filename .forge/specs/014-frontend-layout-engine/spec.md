# Spec: 014 - Frontend Layout Engine

> Feature specification for tenant-configurable form and view layouts with
> per-role field visibility, ordering, and read-only controls.
> Created by the `forge-pm` agent via `/forge-specify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Draft      |
| Author  | forge-pm   |
| Date    | 2026-03-08 |
| Track   | Feature    |
| Spec ID | 014        |

---

## 1. Overview

The Frontend Layout Engine enables tenant administrators to customize how
forms and data views are rendered across the platform — reordering fields,
toggling field visibility per role, marking fields read-only, rearranging
form sections, and configuring list/table column visibility. Configurations
are scoped to the tenant level with optional workspace-level overrides,
and field visibility rules can target both Keycloak realm roles and
application-level team member roles (ADR-024). Plugins declare their form
schemas in the plugin manifest (JSONB), and the layout engine consumes
these declarations to know which fields are configurable.

## 2. Problem Statement

### For Tenant Admins

Form layouts are hardcoded by plugin developers. A tenant admin cannot:

- **Reorder fields** to match their workflow (e.g., move "phone" above
  "email" because their sales team prioritizes phone outreach).
- **Hide irrelevant fields** for specific roles (e.g., hide "internal
  notes" from the `VIEWER` role).
- **Set role-specific field configurations** (e.g., `ADMIN` sees and edits
  "budget", `MEMBER` sees it read-only, `VIEWER` does not see it at all).
- **Reorganize form sections** (e.g., move "Billing" section below
  "Contact Info").
- **Control table columns** in list views (e.g., remove "Created By"
  column for non-admin roles).

This forces every tenant to use identical UI layouts regardless of their
organizational structure, workflow, or industry requirements.

### For End Users

Users see cluttered interfaces with fields they never use. A viewer who
only needs contact name and phone number must scroll past 15 irrelevant
fields. This degrades productivity and increases training costs for new
employees.

### Why Now

- The plugin system (Spec 004) is core-complete (85%) and plugins are
  starting to contribute forms.
- The ABAC engine (ADR-017) provides the attribute-based authorization
  infrastructure to evaluate role-based visibility at runtime.
- The team member role system (ADR-024) provides the per-team
  organizational role granularity needed for per-role layouts.
- The workspace plugin scoping (ADR-014) establishes the two-level
  (tenant + workspace) configuration pattern this feature follows.

## 3. User Stories

### US-001: Reorder Form Fields

**As a** tenant admin,
**I want** to change the display order of fields in a plugin's form,
**so that** the form layout matches my team's workflow.

**Acceptance Criteria:**

- Given a form with fields [A, B, C, D], when the admin moves field C to
  position 1, then all users in the tenant see the form rendered as
  [C, A, B, D].
- Given a workspace-level override exists for workspace W, when a user
  opens the form in workspace W, then the workspace override order is used
  instead of the tenant default.
- Given no layout configuration exists for a form, when a user opens the
  form, then fields render in the order declared in the plugin manifest.

### US-002: Hide Fields by Role

**As a** tenant admin,
**I want** to hide specific form fields for certain roles,
**so that** users only see fields relevant to their responsibilities.

**Acceptance Criteria:**

- Given field "internal_notes" is configured as hidden for team role
  `VIEWER`, when a user with effective team role `VIEWER` opens the form,
  then the "internal_notes" field is not rendered.
- Given field "internal_notes" is configured as hidden for team role
  `VIEWER`, when a user with effective team role `ADMIN` opens the form,
  then the "internal_notes" field is visible.
- Given a user belongs to Team A as `MEMBER` (field hidden) and Team B as
  `ADMIN` (field visible), when the user opens the form, then the field is
  visible (most permissive wins).

### US-003: Set Fields as Read-Only per Role

**As a** tenant admin,
**I want** to make certain fields visible but non-editable for specific roles,
**so that** users can view information without accidentally modifying it.

**Acceptance Criteria:**

- Given field "budget" is configured as read-only for team role `MEMBER`,
  when a `MEMBER` opens the form, then the "budget" field is rendered as a
  disabled/read-only input.
- Given field "budget" is configured as read-only for team role `MEMBER`
  and editable for `ADMIN`, when an `ADMIN` opens the form, then "budget"
  is an editable input.
- Given a read-only field, when a user attempts to submit a modified value
  via API (bypassing UI), then the backend ignores the field value and
  retains the existing value.

### US-004: Reorder Form Sections

**As a** tenant admin,
**I want** to change the display order of form sections (groups of fields),
**so that** the most important section appears first.

**Acceptance Criteria:**

- Given a form with sections [Contact, Billing, Notes], when the admin
  moves "Billing" to position 1, then users see sections rendered as
  [Billing, Contact, Notes].
- Given a section is reordered, when a user opens the form, then all
  fields within each section retain their intra-section ordering.

### US-005: Configure Table/List Column Visibility

**As a** tenant admin,
**I want** to control which columns appear in data tables and list views,
**so that** users see a focused, relevant data grid.

**Acceptance Criteria:**

- Given the contacts list has columns [Name, Email, Phone, Created,
  Updated, Owner], when the admin hides "Created" and "Updated" for all
  roles, then those columns are not rendered in the table.
- Given column "Owner" is hidden for role `VIEWER`, when a `VIEWER` views
  the list, then "Owner" is not shown, but `ADMIN` still sees it.
- Given no column configuration exists, when a user views the list, then
  all columns declared in the plugin manifest are shown.

### US-006: Workspace-Level Layout Override

**As a** workspace admin,
**I want** to customize form layouts for my specific workspace,
**so that** my team's workflow is optimized without affecting other
workspaces in the tenant.

**Acceptance Criteria:**

- Given a tenant-level layout config for form F and a workspace-level
  override for workspace W on the same form F, when a user opens form F
  in workspace W, then the workspace override is used.
- Given a workspace-level override for workspace W on form F, when a user
  opens form F in workspace X (no override), then the tenant-level config
  is used.
- Given a workspace-level override exists, when the tenant admin deletes
  the tenant-level config, then the workspace override continues to
  function independently.

### US-007: Protect Required Fields

**As a** tenant admin,
**I want** the system to prevent me from breaking form functionality when
I hide fields,
**so that** hidden required fields are auto-filled with their default
values instead of causing submission failures.

**Acceptance Criteria:**

- Given field "email" is marked required in the plugin manifest and has a
  default value, when the admin hides "email" for role `VIEWER`, then
  the field is hidden from the UI but the form auto-submits with the
  default value.
- Given field "status" is marked required with no default value, when the
  admin attempts to hide it, then the API returns 400
  `REQUIRED_FIELD_NO_DEFAULT`. The admin UI shows a confirmation dialog:
  "This field is required and has no default value. Hiding it may cause
  submission errors. Proceed anyway?" If confirmed, the request is resent
  with `acknowledgeWarnings: true` and the save succeeds.
- Given a required field with a default value is hidden, when the form is
  submitted, then the backend receives the default value and validation
  passes.

### US-008: Layout Configuration Admin Panel

**As a** tenant admin,
**I want** a table-based configuration panel to manage form layouts,
**so that** I can easily view and modify field ordering, visibility, and
read-only settings per role.

**Acceptance Criteria:**

- Given the admin navigates to Settings > Layout Configuration, when the
  admin selects a form (e.g., "CRM > Contact Form"), then a table is
  displayed with columns: Field Name, Order, Visibility (per role
  toggles), Read-Only (per role toggles).
- Given the admin changes field order using up/down arrows, when the admin
  clicks "Save", then the layout configuration is persisted and the admin
  sees a success notification.
- Given the admin modifies visibility for a specific role, when the admin
  previews the form for that role, then the preview reflects the
  configured visibility.

### US-009: Layout Change Propagation

**As an** end user,
**I want** layout changes made by my tenant admin to take effect on my
next page load,
**so that** my current work is not disrupted mid-form.

**Acceptance Criteria:**

- Given the admin saves a layout change, when an end user is currently
  filling out the affected form, then the user's current session is not
  interrupted.
- Given the admin saves a layout change, when the end user navigates away
  and returns to the form (or reloads the page), then the updated layout
  is rendered.
- Given layout configs are cached on the frontend, when a layout change is
  saved, then the cache is invalidated within 60 seconds (frontend
  `staleTime`).

### US-010: Undo Last Layout Change

**As a** tenant admin,
**I want** to revert the last layout configuration change,
**so that** I can quickly recover from accidental misconfigurations.

**Acceptance Criteria:**

- Given the admin saved a layout change, when the admin clicks "Revert to
  Previous Version", then the layout config is restored to the version
  before the last save.
- Given the admin has never saved a layout config (first-time setup), when
  the admin clicks "Revert", then the button is disabled or hidden.
- Given the admin reverts, when end users next load the form, then they
  see the previous layout.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                          | Priority | Story Ref              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| FR-001 | Plugin manifest JSONB must include a `formSchema` array declaring fields with `id`, `label`, `type`, `required`, `defaultValue`, `section`, and `order` properties.                                                                                                                                                                                                                                                                                  | Must     | US-001                 |
| FR-002 | A `layout_configs` table in the tenant schema stores layout configurations keyed by `(form_id, scope_type, scope_id)` where `scope_type` is `tenant` or `workspace`.                                                                                                                                                                                                                                                                                 | Must     | US-001, US-006         |
| FR-003 | Layout config stores field-level overrides as a JSONB `fields` array: `[{ fieldId, order, visibility: Record<RoleKey, 'visible' \| 'hidden' \| 'readonly'>, globalVisibility: 'visible' \| 'hidden' \| 'readonly' }]`.                                                                                                                                                                                                                               | Must     | US-001, US-002, US-003 |
| FR-004 | Layout config stores section-level overrides as a JSONB `sections` array: `[{ sectionId, order }]`.                                                                                                                                                                                                                                                                                                                                                  | Must     | US-004                 |
| FR-005 | Layout config stores column-level overrides as a JSONB `columns` array: `[{ columnId, visibility: Record<RoleKey, 'visible' \| 'hidden'>, globalVisibility: 'visible' \| 'hidden' }]`.                                                                                                                                                                                                                                                               | Must     | US-005                 |
| FR-006 | `RoleKey` is a union of Keycloak realm roles (`SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_MEMBER`) and team member roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`). Per ADR-024, the effective role is `min(keycloakMaxRole, team_members.role)`.                                                                                                                                                                                                            | Must     | US-002                 |
| FR-007 | When resolving field visibility for a user, the engine must: (1) determine the user's effective role per ADR-024, (2) look up the field's visibility for that role, (3) if the user has multiple team memberships with different roles, use the **most permissive** visibility across all effective roles.                                                                                                                                           | Must     | US-002                 |
| FR-008 | Visibility resolution priority: role-specific visibility overrides `globalVisibility`. If no role-specific entry exists, fall back to `globalVisibility`. If no layout config exists, all fields are visible (plugin manifest default).                                                                                                                                                                                                              | Must     | US-002                 |
| FR-009 | Workspace-level layout configs override tenant-level configs entirely (full replacement, not merge). If a workspace config exists for a form, the tenant config is ignored for users in that workspace.                                                                                                                                                                                                                                              | Must     | US-006                 |
| FR-010 | Fields marked `required: true` in the plugin manifest with a non-null `defaultValue` can be hidden. When hidden, the form auto-populates the field with `defaultValue` on submission.                                                                                                                                                                                                                                                                | Must     | US-007                 |
| FR-011 | Fields marked `required: true` with no `defaultValue` (or `defaultValue: null`) cause the PUT endpoint to return `400 REQUIRED_FIELD_NO_DEFAULT`. The admin UI surfaces this as a confirmation dialog. To proceed, the client resends the request with `"acknowledgeWarnings": true` in the body. On acknowledged save, the system records the override in the audit log (ADR-025) with `action: 'layout_config.required_field_warning_overridden'`. | Should   | US-007                 |
| FR-012 | The layout configuration admin panel displays a table with: form selector, field list (name, current order, visibility toggles per role, read-only toggles per role), section list (name, current order), and column list (name, visibility toggles per role).                                                                                                                                                                                       | Must     | US-008                 |
| FR-013 | Field order changes are made via up/down arrow controls in the admin table. Drag-and-drop is out of scope for V1.                                                                                                                                                                                                                                                                                                                                    | Must     | US-008                 |
| FR-014 | The admin panel includes a "Preview as Role" dropdown that renders a read-only preview of the form as it would appear for the selected role.                                                                                                                                                                                                                                                                                                         | Should   | US-008                 |
| FR-015 | Layout configs are persisted via `PUT /api/v1/layout-configs/:formId` (tenant scope) and `PUT /api/v1/workspaces/:workspaceId/layout-configs/:formId` (workspace scope).                                                                                                                                                                                                                                                                             | Must     | US-008, US-006         |
| FR-016 | Layout configs are retrieved via `GET /api/v1/layout-configs/:formId` (tenant scope) and `GET /api/v1/workspaces/:workspaceId/layout-configs/:formId` (workspace scope).                                                                                                                                                                                                                                                                             | Must     | US-009                 |
| FR-017 | The frontend caches resolved layout configs with `staleTime: 60_000` (60 seconds). On next navigation/page load after a change, the cache is refreshed.                                                                                                                                                                                                                                                                                              | Must     | US-009                 |
| FR-018 | Each layout config save stores the current config as `previous_version` (JSONB column). Only the immediately preceding version is retained (not full history).                                                                                                                                                                                                                                                                                       | Must     | US-010                 |
| FR-019 | `POST /api/v1/layout-configs/:formId/revert` restores `previous_version` as the current config. The current config becomes the new `previous_version` (swap).                                                                                                                                                                                                                                                                                        | Must     | US-010                 |
| FR-020 | Backend API validates submitted field overrides against the plugin manifest's `formSchema`. Overrides referencing non-existent `fieldId` or `sectionId` values are rejected with `400 INVALID_FIELD_REFERENCE`.                                                                                                                                                                                                                                      | Must     | US-001                 |
| FR-021 | Backend enforces read-only fields: when a form is submitted, fields marked `readonly` for the user's effective role are stripped from the update payload before reaching the service layer.                                                                                                                                                                                                                                                          | Must     | US-003                 |
| FR-022 | Layout config changes are recorded in the audit log (per ADR-025) with `action: 'layout_config.updated'`, `tenantId`, `userId`, `formId`, `scope`, and a diff summary.                                                                                                                                                                                                                                                                               | Must     | US-008                 |
| FR-023 | A `GET /api/v1/layout-configs/forms` endpoint returns the list of configurable forms and their schemas (derived from plugin manifests), enabling the admin panel form selector.                                                                                                                                                                                                                                                                      | Must     | US-008                 |
| FR-024 | When a plugin is uninstalled from a tenant, all layout configs referencing that plugin's forms are soft-deleted (marked `deleted_at`). If the plugin is reinstalled, configs are restored.                                                                                                                                                                                                                                                           | Should   | US-001                 |
| FR-025 | The layout engine frontend component (`<LayoutAwareForm>`) wraps existing form components, applying field ordering, visibility, and read-only transformations based on the resolved layout config and the current user's effective role.                                                                                                                                                                                                             | Must     | US-001, US-002, US-003 |
| FR-026 | The layout engine table component (`<LayoutAwareTable>`) wraps existing data table components, applying column visibility transformations based on the resolved layout config and the current user's effective role.                                                                                                                                                                                                                                 | Must     | US-005                 |

## 5. Non-Functional Requirements

| ID      | Category       | Requirement                                                                                                                                                                                                                                                                                                                                 | Target                                                                                     |
| ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| NFR-001 | Performance    | Layout config resolution (backend: load config + merge manifest + resolve role visibility) must complete in                                                                                                                                                                                                                                 | < 50ms P95                                                                                 |
| NFR-002 | Performance    | Frontend layout config fetch (including cache check) must not add perceptible latency to form rendering                                                                                                                                                                                                                                     | < 100ms added to form load time                                                            |
| NFR-003 | Performance    | Layout config save (PUT endpoint) must complete in                                                                                                                                                                                                                                                                                          | < 200ms P95                                                                                |
| NFR-004 | Performance    | Plugin manifest `formSchema` parsing must handle manifests with up to 200 fields per form                                                                                                                                                                                                                                                   | < 10ms                                                                                     |
| NFR-005 | Security       | Layout configs must be tenant-isolated. A tenant's configs exist only in their schema (ADR-002). Verified by integration test: tenant A's config is not accessible from tenant B's context.                                                                                                                                                 | 0 cross-tenant access in tests                                                             |
| NFR-006 | Security       | Read-only enforcement must be server-side. Client-side read-only is cosmetic; the backend must strip readonly field values from update payloads.                                                                                                                                                                                            | 100% server-side enforcement                                                               |
| NFR-007 | Security       | Layout config API endpoints require `TENANT_ADMIN` Keycloak realm role (tenant scope) or workspace `ADMIN`+ role (workspace scope).                                                                                                                                                                                                         | RBAC enforced per Art. 5.1                                                                 |
| NFR-008 | Availability   | Layout engine must fail open: if layout config cannot be loaded (Redis down, DB error), forms render with plugin manifest defaults. No form should be unusable due to layout engine failure.                                                                                                                                                | 100% fail-open for reads                                                                   |
| NFR-009 | Scalability    | Layout config storage must support up to 500 forms × 50 workspaces = 25,000 configs per tenant.                                                                                                                                                                                                                                             | < 100MB total JSONB per tenant                                                             |
| NFR-010 | Accessibility  | Admin panel must be keyboard-navigable. Up/down reordering, visibility toggles, and role selection must be operable without a mouse. WCAG 2.1 AA per Constitution Art. 1.3.                                                                                                                                                                 | WCAG 2.1 AA compliance                                                                     |
| NFR-011 | Caching        | Resolved layout configs cached in Redis with TTL 300s ± 30s jitter. Cache key: `layout:{tenantId}:{formId}:{scope}`. Invalidated on layout config save.                                                                                                                                                                                     | Cache hit rate > 95% in steady state                                                       |
| NFR-012 | Data Integrity | Layout config JSONB validated against the plugin manifest on every save. Stale configs (referencing removed fields after a plugin update) are flagged but not auto-deleted. Validation must reject 100% of configs referencing non-existent field IDs. Stale field warnings surfaced in admin panel within 1 page load after plugin update. | 100% schema validation on save; stale field detection within 60s of plugin manifest change |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                                | Expected Behavior                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin manifest updated (field added/removed) after layout config saved | Existing layout config continues to work for known fields. New fields appear at the end of the form (manifest order). Removed fields are silently skipped (no error). Admin sees a "stale config" badge in the admin panel. |
| 2   | User has no team membership (only Keycloak realm role)                  | Field visibility resolves using Keycloak realm role only. Team role-specific visibility rules are ignored. `globalVisibility` applies.                                                                                      |
| 3   | Admin hides ALL fields in a form                                        | The form renders as an empty state with a message: "No fields are visible for your role. Contact your administrator." The form cannot be submitted.                                                                         |
| 4   | Workspace override references a form that no longer exists              | Config is retained (soft state). The admin panel marks it as "orphaned". No error is thrown at runtime — the config is simply not applied.                                                                                  |
| 5   | Two admins edit the same layout config concurrently                     | Last-write-wins with optimistic concurrency. The PUT endpoint accepts an `If-Match` ETag header (based on `updated_at`). If the ETag does not match, return `409 CONFLICT`.                                                 |
| 6   | Layout config JSONB exceeds 256 KB                                      | Backend rejects with `400 LAYOUT_CONFIG_TOO_LARGE`. Limit enforced by Zod schema validation.                                                                                                                                |
| 7   | Redis cache unavailable during layout config resolution                 | Fallback to direct database query. Log warning. If DB also fails, return plugin manifest defaults (fail-open per NFR-008).                                                                                                  |
| 8   | Plugin uninstalled while users are viewing forms                        | Forms using uninstalled plugin fields render without those fields. Layout configs are soft-deleted. No crash — graceful degradation.                                                                                        |
| 9   | Admin configures visibility for a role that no users currently hold     | Config is accepted and stored. It will take effect if/when a user is assigned that role. No validation that the role is "in use".                                                                                           |
| 10  | Workspace admin attempts to create override but lacks `ADMIN` team role | Return `403 INSUFFICIENT_WORKSPACE_ROLE`. Per ADR-024, effective role is `min(keycloakMaxRole, team_members.role)`.                                                                                                         |

## 7. Data Requirements

### 7.1 Plugin Manifest Extension

The existing plugin manifest JSONB (stored in `plugin_registry.manifest` in
the core schema) must be extended with a `formSchemas` property:

```jsonc
{
  // Existing manifest fields...
  "formSchemas": [
    {
      "formId": "crm-contact-form",
      "label": "Contact Form",
      "sections": [
        {
          "sectionId": "contact-info",
          "label": "Contact Information",
          "order": 1,
        },
        {
          "sectionId": "billing",
          "label": "Billing Details",
          "order": 2,
        },
      ],
      "fields": [
        {
          "fieldId": "first_name",
          "label": "First Name",
          "type": "text",
          "required": true,
          "defaultValue": null,
          "sectionId": "contact-info",
          "order": 1,
        },
        {
          "fieldId": "phone",
          "label": "Phone",
          "type": "phone",
          "required": false,
          "defaultValue": null,
          "sectionId": "contact-info",
          "order": 2,
        },
        {
          "fieldId": "budget",
          "label": "Budget",
          "type": "currency",
          "required": false,
          "defaultValue": 0,
          "sectionId": "billing",
          "order": 1,
        },
      ],
      "columns": [
        {
          "columnId": "name",
          "label": "Name",
          "order": 1,
        },
        {
          "columnId": "email",
          "label": "Email",
          "order": 2,
        },
        {
          "columnId": "created_at",
          "label": "Created",
          "order": 3,
        },
      ],
    },
  ],
}
```

### 7.2 Layout Config Table (Tenant Schema)

New table: `layout_configs` (per-tenant schema, per ADR-002)

| Column             | Type           | Constraints                               | Notes                                                   |
| ------------------ | -------------- | ----------------------------------------- | ------------------------------------------------------- |
| `id`               | `UUID`         | PK, DEFAULT uuid_generate_v4()            | Layout config identifier                                |
| `form_id`          | `VARCHAR(255)` | NOT NULL                                  | References `formSchemas[].formId` in manifest           |
| `plugin_id`        | `UUID`         | NOT NULL, FK → core.plugin_registry(id)   | Plugin that owns the form                               |
| `scope_type`       | `VARCHAR(20)`  | NOT NULL, CHECK IN ('tenant','workspace') | Scope level                                             |
| `scope_id`         | `UUID`         | NULLABLE                                  | NULL for tenant scope, workspace ID for workspace scope |
| `fields`           | `JSONB`        | NOT NULL, DEFAULT '[]'                    | Field-level overrides                                   |
| `sections`         | `JSONB`        | NOT NULL, DEFAULT '[]'                    | Section-level overrides                                 |
| `columns`          | `JSONB`        | NOT NULL, DEFAULT '[]'                    | Column-level overrides                                  |
| `previous_version` | `JSONB`        | NULLABLE                                  | Snapshot of prior config for undo                       |
| `created_by`       | `UUID`         | NOT NULL, FK → users(id)                  | Admin who created the config                            |
| `updated_by`       | `UUID`         | NOT NULL, FK → users(id)                  | Admin who last updated                                  |
| `deleted_at`       | `TIMESTAMPTZ`  | NULLABLE                                  | Soft delete on plugin uninstall                         |
| `created_at`       | `TIMESTAMPTZ`  | NOT NULL, DEFAULT now()                   | Record creation                                         |
| `updated_at`       | `TIMESTAMPTZ`  | NOT NULL, auto-updated                    | Last modification                                       |

**Indexes:**

| Index Name                           | Columns                                 | Type             | Notes                           |
| ------------------------------------ | --------------------------------------- | ---------------- | ------------------------------- |
| `uq_layout_configs_form_scope`       | `(form_id, scope_type, scope_id)`       | Unique           | One config per form per scope   |
| `idx_layout_configs_plugin`          | `plugin_id`                             | B-tree           | Cascade operations on uninstall |
| `idx_layout_configs_scope_workspace` | `scope_id` WHERE scope_type='workspace' | B-tree (partial) | Workspace override lookup       |

**Unique constraint note:** `scope_id` is NULL for tenant-scope rows.
PostgreSQL unique index treats NULL ≠ NULL, so a partial unique index is
required:

- `CREATE UNIQUE INDEX uq_layout_tenant ON layout_configs (form_id) WHERE scope_type = 'tenant' AND deleted_at IS NULL;`
- `CREATE UNIQUE INDEX uq_layout_workspace ON layout_configs (form_id, scope_id) WHERE scope_type = 'workspace' AND deleted_at IS NULL;`

### 7.3 JSONB Schema: Field Override

```typescript
interface FieldOverride {
  fieldId: string;
  order: number;
  globalVisibility: 'visible' | 'hidden' | 'readonly';
  visibility: Partial<Record<RoleKey, 'visible' | 'hidden' | 'readonly'>>;
}

type RoleKey =
  // Keycloak realm roles
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'TENANT_MEMBER'
  // Team member roles (ADR-024)
  | 'OWNER'
  | 'ADMIN'
  | 'MEMBER'
  | 'VIEWER';
```

### 7.4 JSONB Schema: Section Override

```typescript
interface SectionOverride {
  sectionId: string;
  order: number;
}
```

### 7.5 JSONB Schema: Column Override

```typescript
interface ColumnOverride {
  columnId: string;
  globalVisibility: 'visible' | 'hidden';
  visibility: Partial<Record<RoleKey, 'visible' | 'hidden'>>;
}
```

## 8. API Requirements

| Method | Path                                                    | Description                                          | Auth         |
| ------ | ------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| GET    | `/api/v1/layout-configs/forms`                          | List configurable forms (from plugin manifests)      | TENANT_ADMIN |
| GET    | `/api/v1/layout-configs/:formId`                        | Get tenant-level layout config for a form            | Bearer       |
| PUT    | `/api/v1/layout-configs/:formId`                        | Create/update tenant-level layout config             | TENANT_ADMIN |
| POST   | `/api/v1/layout-configs/:formId/revert`                 | Revert tenant-level config to previous version       | TENANT_ADMIN |
| DELETE | `/api/v1/layout-configs/:formId`                        | Delete tenant-level layout config (restore defaults) | TENANT_ADMIN |
| GET    | `/api/v1/workspaces/:wId/layout-configs/:formId`        | Get workspace-level layout config                    | Bearer       |
| PUT    | `/api/v1/workspaces/:wId/layout-configs/:formId`        | Create/update workspace-level layout config          | WS ADMIN+    |
| POST   | `/api/v1/workspaces/:wId/layout-configs/:formId/revert` | Revert workspace-level config to previous version    | WS ADMIN+    |
| DELETE | `/api/v1/workspaces/:wId/layout-configs/:formId`        | Delete workspace-level layout config                 | WS ADMIN+    |
| GET    | `/api/v1/layout-configs/:formId/resolved`               | Get resolved layout for current user (role-aware)    | Bearer       |

### 8.1 Resolved Layout Endpoint

`GET /api/v1/layout-configs/:formId/resolved?workspaceId=:wId`

This is the primary endpoint consumed by the frontend `<LayoutAwareForm>`
and `<LayoutAwareTable>` components. It returns the fully resolved layout
for the current user, accounting for:

1. Workspace override (if `workspaceId` provided and override exists)
2. Tenant-level config fallback
3. Plugin manifest defaults (if no config exists)
4. Role-based field visibility resolved for the current user's effective
   roles across all team memberships (most permissive wins)

**Response shape:**

```jsonc
{
  "formId": "crm-contact-form",
  "source": "workspace" | "tenant" | "manifest",
  "sections": [
    { "sectionId": "billing", "order": 1 },
    { "sectionId": "contact-info", "order": 2 }
  ],
  "fields": [
    {
      "fieldId": "phone",
      "order": 1,
      "visibility": "visible",
      "readonly": false
    },
    {
      "fieldId": "first_name",
      "order": 2,
      "visibility": "visible",
      "readonly": false
    },
    {
      "fieldId": "budget",
      "order": 3,
      "visibility": "hidden",
      "readonly": false
    }
  ],
  "columns": [
    { "columnId": "name", "visibility": "visible" },
    { "columnId": "email", "visibility": "visible" },
    { "columnId": "created_at", "visibility": "hidden" }
  ]
}
```

### 8.2 Error Codes

| Error Code                    | HTTP | Condition                                                                                                                                                                                                                         |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAYOUT_CONFIG_NOT_FOUND`     | 404  | No layout config exists for the specified form/scope                                                                                                                                                                              |
| `INVALID_FIELD_REFERENCE`     | 400  | Field/section/column ID not found in plugin manifest                                                                                                                                                                              |
| `LAYOUT_CONFIG_TOO_LARGE`     | 400  | Config JSONB exceeds 256 KB limit                                                                                                                                                                                                 |
| `LAYOUT_CONFIG_CONFLICT`      | 409  | Concurrent edit detected (ETag mismatch)                                                                                                                                                                                          |
| `INSUFFICIENT_WORKSPACE_ROLE` | 403  | User lacks ADMIN+ role for workspace scope                                                                                                                                                                                        |
| `PLUGIN_NOT_FOUND`            | 404  | Plugin referenced by formId does not exist                                                                                                                                                                                        |
| `NO_PREVIOUS_VERSION`         | 400  | Revert requested but no previous version stored                                                                                                                                                                                   |
| `REQUIRED_FIELD_NO_DEFAULT`   | 400  | A required field with no default value is being hidden. The API rejects the save with 400. To override, the client must resend with `"acknowledgeWarnings": true` in the request body (see FR-011). The override is audit-logged. |

## 9. UX/UI Notes

### 9.1 Admin Panel Location

The layout configuration panel is accessible at:
**Settings > Layout Configuration** (tenant scope) and
**Workspace Settings > Layout Configuration** (workspace scope).

### 9.2 Admin Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Layout Configuration                                         │
├─────────────────────────────────────────────────────────────┤
│ Form: [  CRM > Contact Form  ▼]   Preview as: [ MEMBER ▼]  │
├─────────────┬───────────┬───────────────────────────────────┤
│             │           │         Visibility by Role         │
│ Field Name  │  Order    │  ADMIN  MEMBER  VIEWER  (global)  │
├─────────────┼───────────┼───────────────────────────────────┤
│ First Name  │  [▲][▼] 1 │   ✓       ✓       ✓     visible  │
│ Phone       │  [▲][▼] 2 │   ✓       ✓       ✓     visible  │
│ Email       │  [▲][▼] 3 │   ✓       ✓       ○     visible  │
│ Budget ⚠    │  [▲][▼] 4 │   ✓ₑ      ✓ᵣ      ✗     visible  │
│ Int. Notes  │  [▲][▼] 5 │   ✓ₑ      ✗       ✗     hidden   │
├─────────────┴───────────┴───────────────────────────────────┤
│ Legend: ✓ visible  ✓ₑ editable  ✓ᵣ read-only  ✗ hidden     │
│         ○ inherits global  ⚠ required field                 │
├─────────────────────────────────────────────────────────────┤
│ Sections:                                                    │
│   [▲][▼] 1. Contact Information                              │
│   [▲][▼] 2. Billing Details                                  │
├─────────────────────────────────────────────────────────────┤
│              [ Revert to Previous ]  [ Save ]                │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Accessibility Requirements (Art. 1.3)

- All table controls (order arrows, visibility toggles) must be focusable
  and operable via keyboard (Tab, Space/Enter, Arrow keys).
- Visibility state (visible/hidden/readonly) must be conveyed to screen
  readers via `aria-label` on toggle buttons.
- The "Preview as Role" feature must announce role changes to screen
  readers via `aria-live="polite"` region.
- Colour must not be the sole means of conveying visibility state; icons
  (✓, ✗, ○) and text labels are required.

## 10. Out of Scope

- **Drag-and-drop reordering**: V1 uses up/down arrow controls only.
  Drag-and-drop may be added in a future iteration.
- **Custom field creation**: Admins can reorder and hide existing fields
  but cannot create new custom fields. Custom fields would require a
  separate spec.
- **Conditional visibility logic**: V1 supports static per-role visibility.
  Dynamic visibility (e.g., "show field B only if field A has value X")
  is out of scope.
- **Layout templates/presets**: Predefined layout presets (e.g., "Sales
  Optimized", "Support Optimized") are not in scope for V1.
- **Per-user layout preferences**: Only tenant/workspace admins can
  configure layouts. Individual user layout preferences are out of scope.
- **Form validation rule customization**: The layout engine controls
  presentation (visibility, order, read-only) but not validation rules.
  Validation remains as defined by the plugin.
- **Real-time layout change propagation via SSE**: Changes take effect on
  next page load per US-009. Real-time push is deferred.
- **Full version history**: Only current + previous version stored per
  FR-018. A full audit trail of all versions is out of scope.

## 11. Open Questions

> All open questions have been resolved via `/forge-clarify` on 2026-03-08.

- ✅ **OQ-001** (Resolved): The `REQUIRED_FIELD_NO_DEFAULT` scenario returns a
  **400 blocking error**. The admin UI presents a confirmation dialog, and the
  client resends with `"acknowledgeWarnings": true` in the request body to
  force the save. This follows the standard `{ error: { code, message } }`
  format (Art. 6.2) for the initial rejection, and a normal 200 for the
  acknowledged retry. The override is audit-logged per ADR-025.

- ✅ **OQ-002** (Resolved): **No rename detection.** Field renames are treated
  as "old field removed + new field added." Old `fieldId` references in layout
  configs become stale (admin sees a "stale config" badge per edge case #1).
  This is simple, predictable, and avoids false-positive matching risks.
  Plugin developers can document migration steps in their release notes.

- ✅ **OQ-003** (Resolved): **Frontend + Redis caching only — no CDN caching.**
  The resolved layout endpoint returns `Cache-Control: private, no-store`.
  Frontend React Query caching (`staleTime: 60s` per FR-017) handles client-side
  caching. Backend Redis caching (NFR-011, TTL 300s ± 30s jitter) caches the
  **pre-role-resolution** config; per-user role resolution happens in the
  service layer on every request. CDN caching is not used because the response
  varies per user role, making Vary headers impractical.

## 12. Implementation Scope

> **Note**: All paths are relative to the project root.

### New Components

| Component Type     | Path                                                           | Description                                                  |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Database migration | `packages/database/prisma/migrations/YYYYMMDD_layout_configs/` | Create `layout_configs` table in tenant schema               |
| Service            | `apps/core-api/src/services/layout-config.service.ts`          | CRUD + resolution logic for layout configs                   |
| Routes             | `apps/core-api/src/routes/layout-config.ts`                    | REST endpoints for layout config management                  |
| Zod schemas        | `apps/core-api/src/schemas/layout-config.schema.ts`            | Validation schemas for layout config JSONB payloads          |
| React component    | `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`    | Form wrapper applying layout transformations                 |
| React component    | `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`   | Table wrapper applying column visibility transformations     |
| React component    | `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`  | Admin panel for managing layout configurations               |
| React hook         | `apps/web/src/hooks/useResolvedLayout.ts`                      | React Query hook for fetching resolved layout configs        |
| SDK extension      | `packages/sdk/src/manifest.ts`                                 | TypeScript types for `formSchemas` manifest extension        |
| Types              | `packages/types/src/layout-config.ts`                          | Shared types: FieldOverride, SectionOverride, ColumnOverride |

### Modified Components

| Path                                           | Modification Type | Description                                                          |
| ---------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| `packages/sdk/src/types/manifest.ts`           | Enhancement       | Add `formSchemas` property to plugin manifest type                   |
| `apps/core-api/src/services/plugin.service.ts` | Enhancement       | Add `getFormSchemas(pluginId)` method                                |
| `apps/core-api/src/routes/plugin.ts`           | Enhancement       | Validate `formSchemas` in manifest on plugin register                |
| `apps/core-api/src/middleware/auth.ts`         | Enhancement       | Expose effective team roles in request context for layout resolution |
| `apps/web/src/routes/settings/`                | Enhancement       | Add Layout Configuration route to tenant settings                    |

### Documentation Updates

| Path                         | Section            | Update Description                                 |
| ---------------------------- | ------------------ | -------------------------------------------------- |
| `docs/SECURITY.md`           | Authorization      | Document read-only field enforcement (server-side) |
| `docs/PLUGIN_DEVELOPMENT.md` | Manifest Schema    | Document `formSchemas` manifest property           |
| `packages/sdk/README.md`     | Manifest Reference | Add `formSchemas` documentation and examples       |

## 13. Constitution Compliance

| Article | Status    | Notes                                                                                                                                                                                                                                          |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | **Security First** (1.2.1): Read-only enforcement is server-side (FR-021). **Multi-Tenancy** (1.2.2): Layout configs in tenant schema (ADR-002). **UX** (1.3): WCAG 2.1 AA for admin panel (NFR-010).                                          |
| Art. 2  | COMPLIANT | No new npm dependencies required. Uses existing React, Fastify, Prisma, Zod, Redis, ioredis stack. Plugin manifest extension is a JSONB schema change, not a new library.                                                                      |
| Art. 3  | COMPLIANT | **Layered arch** (3.2): Routes → LayoutConfigService → Prisma. **Parameterized queries** (3.3): All DB access via Prisma. **API standards** (3.4): RESTful endpoints under `/api/v1`.                                                          |
| Art. 4  | COMPLIANT | **Coverage** (4.1): Target ≥ 80% for layout engine code. Security-critical code (read-only enforcement FR-021) targets 100%. **Performance** (4.3): NFR-001 < 50ms P95 resolution.                                                             |
| Art. 5  | COMPLIANT | **Keycloak auth** (5.1): All layout config endpoints require Bearer auth. Admin endpoints require TENANT_ADMIN. **Tenant isolation** (5.2): Configs in tenant schema. **Zod validation** (5.3): All input validated.                           |
| Art. 6  | COMPLIANT | **Error format** (6.2): Standard `{ error: { code, message, details } }` for all error responses. Error codes defined in §8.2. **Logging** (6.3): Layout changes logged with tenantId, userId.                                                 |
| Art. 7  | COMPLIANT | **Files**: kebab-case (`layout-config.service.ts`). **Classes**: PascalCase (`LayoutConfigService`). **DB tables**: snake_case (`layout_configs`). **API**: kebab-case URLs (`/layout-configs`).                                               |
| Art. 8  | COMPLIANT | **Unit tests**: Service layer resolution logic, visibility merging, fail-open behavior. **Integration tests**: API endpoints, RBAC enforcement, concurrent edit conflict. **E2E tests**: Admin configures layout → end user sees updated form. |
| Art. 9  | COMPLIANT | **Feature flag** (9.1): Layout engine gated behind `layout_engine_enabled` tenant feature flag. Disabled tenants see default manifest layouts. **Backward compatible migration** (9.1.3): New table, no schema changes to existing tables.     |

---

## Cross-References

| Document                    | Path                                                           |
| --------------------------- | -------------------------------------------------------------- |
| Constitution                | `.forge/constitution.md`                                       |
| Architecture                | `.forge/architecture/architecture.md`                          |
| ADR-002 (Multi-Tenancy)     | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       |
| ADR-014 (Workspace Plugins) | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     |
| ADR-017 (ABAC Engine)       | `.forge/knowledge/adr/adr-017-abac-engine.md`                  |
| ADR-024 (Team Member Roles) | `.forge/knowledge/adr/adr-024-team-member-role-vs-keycloak.md` |
| ADR-025 (Audit Logs)        | `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`       |
| Spec 004 (Plugin System)    | `.forge/specs/004-plugin-system/spec.md`                       |
| Spec 005 (Frontend Arch)    | `.forge/specs/005-frontend-architecture/spec.md`               |
| Spec 008 (Admin Interfaces) | `.forge/specs/008-admin-interfaces/spec.md`                    |
| Spec 009 (Workspace Mgmt)   | `.forge/specs/009-workspace-management/spec.md`                |
| Plan                        | <!-- Created by /forge-plan -->                                |
| Tasks                       | <!-- Created by /forge-tasks -->                               |
