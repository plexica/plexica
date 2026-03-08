# Plan: 014 - Frontend Layout Engine

> Technical implementation plan for tenant-configurable form and view layouts
> with per-role field visibility, ordering, and read-only controls.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                             |
| ------ | ------------------------------------------------- |
| Status | Draft                                             |
| Author | forge-architect                                   |
| Date   | 2026-03-08                                        |
| Track  | Feature                                           |
| Spec   | `.forge/specs/014-frontend-layout-engine/spec.md` |

---

## 1. Architecture Overview

### 1.1 Summary

The Frontend Layout Engine introduces a tenant-configurable presentation layer
that sits between plugin form schemas and the rendered UI. Tenant admins
configure field order, per-role visibility (visible / read-only / hidden),
section ordering, and column visibility via an admin panel. The resolved layout
is served by a backend API that merges plugin manifest defaults with tenant/
workspace overrides and evaluates per-user role visibility at request time.

### 1.2 High-Level Data Flow

```
Plugin Manifest (formSchemas)
         │
         ▼
┌─────────────────────┐
│  Layout Config DB   │  ← Admin saves via PUT /api/v1/layout-configs/:formId
│  (tenant schema)    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────┐
│  Redis Cache Layer  │────▶│  Pre-resolved │
│  TTL 300s ± 30s     │     │  config blob  │
└────────┬────────────┘     └──────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  LayoutConfigService.resolveForUser()   │
│  • Workspace override > Tenant config   │
│  • Merge with manifest defaults         │
│  • Per-user role resolution (ADR-024)   │
│  • Most permissive wins across teams    │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GET /resolved → JSON response  │
│  Cache-Control: private         │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Frontend (React Query)         │
│  useResolvedLayout() hook       │
│  staleTime: 60s                 │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  <LayoutAwareForm>              │
│  <LayoutAwareTable>             │
│  Apply transformations to UI    │
└─────────────────────────────────┘
```

### 1.3 Key Architectural Decisions

| Decision                                     | Rationale                                                       | ADR Ref     |
| -------------------------------------------- | --------------------------------------------------------------- | ----------- |
| `layout_configs` in tenant schema            | Follows ADR-002 schema-per-tenant pattern; data is tenant-owned | ADR-002     |
| Audit logs in core `audit_logs` table        | Follows ADR-025 pattern for cross-tenant audit visibility       | ADR-025     |
| Role resolution via existing ABAC engine     | Leverages ADR-017 policy evaluation; no new auth system         | ADR-017     |
| Effective role = min(Keycloak, team role)    | Follows ADR-024 hybrid role model                               | ADR-024     |
| Module Federation for layout components      | Shell-level `<LayoutAwareForm>` exposed to plugins via MF       | ADR-004/011 |
| Redis cache with jittered TTL                | Prevents thundering herd; aligns with existing Redis patterns   | —           |
| Full replacement (not merge) for WS override | Simpler mental model; avoids complex deep-merge edge cases      | —           |
| Feature flag `layout_engine_enabled`         | Zero-downtime rollout per Constitution Art. 9.1                 | —           |

---

## 2. ADR Assessment

### 2.1 Existing ADRs Referenced

| ADR     | Relevance                                                                                 | Compliance Status |
| ------- | ----------------------------------------------------------------------------------------- | ----------------- |
| ADR-002 | `layout_configs` placed in tenant schema — follows the pattern directly                   | ✅ Compliant      |
| ADR-004 | Module Federation conceptual architecture for plugin ↔ shell component sharing            | ✅ Compliant      |
| ADR-011 | Vite Module Federation implementation; `<LayoutAwareForm>` exposed as shell remote module | ✅ Compliant      |
| ADR-014 | Workspace plugin scoping; layout configs follow same tenant > workspace override pattern  | ✅ Compliant      |
| ADR-017 | ABAC engine used for role resolution in visibility computation                            | ✅ Compliant      |
| ADR-024 | Team member roles; effective role = min(Keycloak, team); most permissive across teams     | ✅ Compliant      |
| ADR-025 | Audit logs placed in core schema; layout config changes logged there                      | ✅ Compliant      |
| ADR-029 | Recharts library (not relevant to this feature)                                           | N/A               |
| ADR-031 | Extension tables in core schema (Spec 013) — layout configs are NOT extension tables      | N/A               |

### 2.2 New ADR Assessment

**No new ADRs are required for Spec 014.** Rationale:

1. **`layout_configs` in tenant schema**: This follows ADR-002 directly. Unlike
   `audit_logs` (ADR-025) and `extension_tables` (ADR-031) which needed core
   schema exceptions, layout configs are tenant-owned data that naturally belongs
   in the tenant schema. No exception or amendment needed.

2. **Plugin manifest `formSchemas` extension**: This is a JSONB schema enhancement
   to the existing `plugin_registry.manifest` column. The cross-schema reference
   from `layout_configs.form_id` (tenant schema) to manifest `formId` strings
   (core schema) is string-based, not a foreign key — this is the same pattern
   used by workspace plugin scoping (ADR-014). No new ADR needed.

3. **Module Federation exposure**: `<LayoutAwareForm>` and `<LayoutAwareTable>` are
   shell-level components in `apps/web`, exposed via the existing Module Federation
   setup (ADR-004/011). This is standard usage, not a new pattern.

4. **Redis caching strategy**: Uses the same Redis instance and key-prefix pattern
   as existing caches (i18n cache, session cache). No architectural novelty.

5. **Feature flag gating**: Follows the standard feature flag pattern already
   established for other features. No ADR needed.

---

## 3. Data Model

### 3.1 New Tables

#### `layout_configs` (Tenant Schema — per ADR-002)

| Column             | Type           | Constraints                               | Notes                                                   |
| ------------------ | -------------- | ----------------------------------------- | ------------------------------------------------------- |
| `id`               | `UUID`         | PK, DEFAULT uuid_generate_v4()            | Layout config identifier                                |
| `form_id`          | `VARCHAR(255)` | NOT NULL                                  | References `formSchemas[].formId` in plugin manifest    |
| `plugin_id`        | `UUID`         | NOT NULL                                  | Plugin that owns the form (string ref to core schema)   |
| `scope_type`       | `VARCHAR(20)`  | NOT NULL, CHECK IN ('tenant','workspace') | Scope level                                             |
| `scope_id`         | `UUID`         | NULLABLE                                  | NULL for tenant scope, workspace ID for workspace scope |
| `fields`           | `JSONB`        | NOT NULL, DEFAULT '[]'                    | `FieldOverride[]` — order, visibility per role          |
| `sections`         | `JSONB`        | NOT NULL, DEFAULT '[]'                    | `SectionOverride[]` — section order                     |
| `columns`          | `JSONB`        | NOT NULL, DEFAULT '[]'                    | `ColumnOverride[]` — column visibility per role         |
| `previous_version` | `JSONB`        | NULLABLE                                  | Snapshot of prior config for single-step undo           |
| `created_by`       | `UUID`         | NOT NULL                                  | Admin who created the config                            |
| `updated_by`       | `UUID`         | NOT NULL                                  | Admin who last updated                                  |
| `deleted_at`       | `TIMESTAMPTZ`  | NULLABLE                                  | Soft delete on plugin uninstall (FR-024)                |
| `created_at`       | `TIMESTAMPTZ`  | NOT NULL, DEFAULT now()                   | Record creation                                         |
| `updated_at`       | `TIMESTAMPTZ`  | NOT NULL, auto-updated                    | Last modification (used as ETag for optimistic locking) |

**Note**: `plugin_id` is stored as a UUID but is NOT a foreign key to
`core.plugin_registry(id)` because cross-schema FKs are not supported in the
schema-per-tenant architecture (ADR-002). The reference is validated at the
application layer by the `LayoutConfigService`.

### 3.2 Modified Tables

#### `plugin_registry` (Core Schema)

| Column     | Change    | Before            | After                                     |
| ---------- | --------- | ----------------- | ----------------------------------------- |
| `manifest` | JSONB ext | Existing manifest | Add optional `formSchemas` array property |

The `manifest` JSONB column already stores arbitrary plugin metadata. Adding
`formSchemas` is a backward-compatible extension — existing plugins without
`formSchemas` continue to work. Validation is added at the application layer
(Zod schema), not via a DB constraint.

### 3.3 Indexes

| Table            | Index Name                           | Columns                                                                   | Type             |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------- | ---------------- |
| `layout_configs` | `uq_layout_tenant`                   | `(form_id) WHERE scope_type='tenant' AND deleted_at IS NULL`              | Unique partial   |
| `layout_configs` | `uq_layout_workspace`                | `(form_id, scope_id) WHERE scope_type='workspace' AND deleted_at IS NULL` | Unique partial   |
| `layout_configs` | `idx_layout_configs_plugin`          | `plugin_id`                                                               | B-tree           |
| `layout_configs` | `idx_layout_configs_scope_workspace` | `scope_id` WHERE scope_type='workspace'                                   | B-tree (partial) |

**Rationale**: The two partial unique indexes handle the NULL `scope_id` issue
for tenant-scope rows (PostgreSQL treats NULL ≠ NULL in unique indexes). The
`deleted_at IS NULL` condition ensures soft-deleted rows don't conflict with
active configs. The `plugin_id` index supports cascade soft-delete on plugin
uninstall.

### 3.4 Migrations

1. **Migration 1: Create `layout_configs` table** — DDL in tenant migration
   template. Must be applied to all existing tenant schemas and to the tenant
   schema creation template for new tenants.
2. **Migration 2: Add partial unique indexes** — Separate migration for the
   three partial indexes and the `plugin_id` B-tree index.
3. **Migration 3: Add `formSchemas` Zod validation** — No DB migration needed;
   this is an application-layer validation change in the plugin manifest Zod
   schema.

All migrations are backward-compatible (additive only). No existing tables are
modified beyond the JSONB manifest extension which is application-validated.

### 3.5 JSONB Schemas

```typescript
// packages/types/src/layout-config.ts

type RoleKey =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'TENANT_MEMBER'
  | 'OWNER'
  | 'ADMIN'
  | 'MEMBER'
  | 'VIEWER';

interface FieldOverride {
  fieldId: string;
  order: number;
  globalVisibility: 'visible' | 'hidden' | 'readonly';
  visibility: Partial<Record<RoleKey, 'visible' | 'hidden' | 'readonly'>>;
}

interface SectionOverride {
  sectionId: string;
  order: number;
}

interface ColumnOverride {
  columnId: string;
  globalVisibility: 'visible' | 'hidden';
  visibility: Partial<Record<RoleKey, 'visible' | 'hidden'>>;
}

interface LayoutConfig {
  id: string;
  formId: string;
  pluginId: string;
  scopeType: 'tenant' | 'workspace';
  scopeId: string | null;
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
  previousVersion: LayoutConfigSnapshot | null;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LayoutConfigSnapshot {
  fields: FieldOverride[];
  sections: SectionOverride[];
  columns: ColumnOverride[];
}

// Plugin manifest extension
interface FormSchema {
  formId: string;
  label: string;
  sections: ManifestSection[];
  fields: ManifestField[];
  columns: ManifestColumn[];
}

interface ManifestField {
  fieldId: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue: unknown;
  sectionId: string;
  order: number;
}

interface ManifestSection {
  sectionId: string;
  label: string;
  order: number;
}

interface ManifestColumn {
  columnId: string;
  label: string;
  order: number;
}

// Resolved layout (API response shape)
interface ResolvedLayout {
  formId: string;
  source: 'workspace' | 'tenant' | 'manifest';
  sections: { sectionId: string; order: number }[];
  fields: {
    fieldId: string;
    order: number;
    visibility: 'visible' | 'hidden' | 'readonly';
    readonly: boolean;
  }[];
  columns: {
    columnId: string;
    visibility: 'visible' | 'hidden';
  }[];
}
```

---

## 4. API Endpoints

### 4.1 GET `/api/v1/layout-configs/forms`

- **Description**: List configurable forms derived from plugin manifests (FR-023)
- **Auth**: `TENANT_ADMIN` realm role required
- **Request**: No body. Query params: none.
- **Response (200)**:
  ```json
  {
    "forms": [
      {
        "formId": "crm-contact-form",
        "pluginId": "uuid",
        "pluginName": "CRM Plugin",
        "label": "Contact Form",
        "fieldCount": 5,
        "sectionCount": 2,
        "columnCount": 3,
        "hasConfig": true
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------- | ----------------------------- |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 403 | `FORBIDDEN` | User is not `TENANT_ADMIN` |
- **Traces**: FR-023, US-008

### 4.2 GET `/api/v1/layout-configs/:formId`

- **Description**: Get tenant-level layout config for a form (FR-016)
- **Auth**: Bearer token required (any authenticated user)
- **Request**: Path param `formId`.
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "formId": "crm-contact-form",
    "pluginId": "uuid",
    "scopeType": "tenant",
    "scopeId": null,
    "fields": [],
    "sections": [],
    "columns": [],
    "previousVersion": null,
    "updatedAt": "2026-03-08T12:00:00Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | ------------------------------- |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 404 | `LAYOUT_CONFIG_NOT_FOUND` | No config exists for this form |
- **Traces**: FR-016, US-009

### 4.3 PUT `/api/v1/layout-configs/:formId`

- **Description**: Create or update tenant-level layout config (FR-015)
- **Auth**: `TENANT_ADMIN` realm role required
- **Headers**: `If-Match: <ETag>` (optional, for optimistic concurrency — Edge Case #5)
- **Request**:
  ```json
  {
    "pluginId": "uuid",
    "fields": [
      {
        "fieldId": "phone",
        "order": 1,
        "globalVisibility": "visible",
        "visibility": { "VIEWER": "hidden" }
      }
    ],
    "sections": [{ "sectionId": "contact-info", "order": 1 }],
    "columns": [
      {
        "columnId": "name",
        "globalVisibility": "visible",
        "visibility": {}
      }
    ],
    "acknowledgeWarnings": false
  }
  ```
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "formId": "crm-contact-form",
    "updatedAt": "2026-03-08T12:01:00Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------------- | ----------------------------------------------------------- |
  | 400 | `INVALID_FIELD_REFERENCE` | fieldId/sectionId/columnId not in plugin manifest (FR-020) |
  | 400 | `LAYOUT_CONFIG_TOO_LARGE` | JSONB exceeds 256 KB (Edge Case #6) |
  | 400 | `REQUIRED_FIELD_NO_DEFAULT` | Required field hidden without default; needs ack (FR-011) |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 403 | `FORBIDDEN` | User is not `TENANT_ADMIN` |
  | 404 | `PLUGIN_NOT_FOUND` | Referenced plugin does not exist |
  | 409 | `LAYOUT_CONFIG_CONFLICT` | ETag mismatch — concurrent edit (Edge Case #5) |
- **Side effects**: Invalidates Redis cache key `layout:{tenantId}:{formId}:tenant`. Creates audit log entry per ADR-025 with `action: 'layout_config.updated'` (FR-022). Stores current config as `previous_version` before overwrite (FR-018).
- **Traces**: FR-003, FR-004, FR-005, FR-010, FR-011, FR-015, FR-018, FR-020, FR-022, US-001, US-008

### 4.4 POST `/api/v1/layout-configs/:formId/revert`

- **Description**: Revert tenant-level config to previous version (FR-019)
- **Auth**: `TENANT_ADMIN` realm role required
- **Request**: No body.
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "formId": "crm-contact-form",
    "updatedAt": "2026-03-08T12:02:00Z",
    "source": "reverted"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | ---------------------------------------- |
  | 400 | `NO_PREVIOUS_VERSION` | No previous version stored (FR-019) |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 403 | `FORBIDDEN` | User is not `TENANT_ADMIN` |
  | 404 | `LAYOUT_CONFIG_NOT_FOUND` | No config exists for this form |
- **Side effects**: Swaps current and `previous_version`. Invalidates Redis cache. Audit log with `action: 'layout_config.reverted'`.
- **Traces**: FR-019, US-010

### 4.5 DELETE `/api/v1/layout-configs/:formId`

- **Description**: Delete tenant-level layout config, restoring defaults
- **Auth**: `TENANT_ADMIN` realm role required
- **Response (204)**: No content.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | ------------------------------- |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 403 | `FORBIDDEN` | User is not `TENANT_ADMIN` |
  | 404 | `LAYOUT_CONFIG_NOT_FOUND` | No config exists for this form |
- **Side effects**: Hard-deletes the config row. Invalidates Redis cache. Audit log with `action: 'layout_config.deleted'`.
- **Traces**: US-001 (restore defaults)

### 4.6 GET `/api/v1/workspaces/:workspaceId/layout-configs/:formId`

- **Description**: Get workspace-level layout config override (FR-016)
- **Auth**: Bearer token required (any authenticated workspace member)
- **Behavior**: Identical to §4.2 but scoped to workspace.
- **Traces**: FR-016, US-006

### 4.7 PUT `/api/v1/workspaces/:workspaceId/layout-configs/:formId`

- **Description**: Create or update workspace-level layout config (FR-015)
- **Auth**: Workspace `ADMIN`+ role required (per ADR-024 effective role)
- **Behavior**: Identical to §4.3 but scoped to workspace. Validates workspace membership and role. Error `403 INSUFFICIENT_WORKSPACE_ROLE` if user lacks `ADMIN`+ role.
- **Traces**: FR-009, FR-015, US-006, NFR-007

### 4.8 POST `/api/v1/workspaces/:workspaceId/layout-configs/:formId/revert`

- **Description**: Revert workspace-level config to previous version
- **Auth**: Workspace `ADMIN`+ role required
- **Behavior**: Identical to §4.4 but scoped to workspace.
- **Traces**: FR-019, US-006

### 4.9 DELETE `/api/v1/workspaces/:workspaceId/layout-configs/:formId`

- **Description**: Delete workspace-level layout config
- **Auth**: Workspace `ADMIN`+ role required
- **Behavior**: Identical to §4.5 but scoped to workspace.
- **Traces**: US-006

### 4.10 GET `/api/v1/layout-configs/:formId/resolved`

- **Description**: Get fully resolved layout for the current user (FR-025, FR-026)
- **Auth**: Bearer token required (any authenticated user)
- **Query Params**: `workspaceId` (optional) — if provided and a workspace override exists, use it.
- **Headers**: `Cache-Control: private, no-store` (per OQ-003)
- **Response (200)**: See `ResolvedLayout` interface in §3.5
- **Resolution Algorithm**:
  1. Check workspace override (if `workspaceId` provided) → tenant config → manifest defaults
  2. Load pre-resolved config from Redis cache (key: `layout:{tenantId}:{formId}:{scope}`)
  3. If cache miss, load from DB and populate cache (TTL 300s ± 30s jitter)
  4. For each field, resolve visibility for the current user:
     a. Get user's effective roles across all team memberships (ADR-024)
     b. For each role, look up role-specific visibility; fall back to `globalVisibility`
     c. Apply "most permissive wins" across all roles (FR-007)
     d. Permissiveness order: `visible` > `readonly` > `hidden`
  5. Fields not in config use manifest defaults (visible + editable)
  6. New fields (added to manifest after config saved) appear at end in manifest order
  7. Removed fields (removed from manifest after config saved) are silently skipped
- **Fail-open (NFR-008)**: If Redis and DB both fail, return manifest defaults with `source: 'manifest'`. Log warning. No user-facing error.
- **Performance**: < 50ms P95 (NFR-001). Redis cache hit eliminates DB round-trip. Role resolution is in-memory computation.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ---------------- | ---------------------- |
  | 401 | `UNAUTHORIZED` | Missing or invalid JWT |
  | 404 | `PLUGIN_NOT_FOUND` | Plugin/form does not exist |
- **Traces**: FR-007, FR-008, FR-009, FR-010, FR-017, FR-025, FR-026, NFR-001, NFR-008, NFR-011, US-002, US-003, US-005, US-009

---

## 5. Component Design

### 5.1 LayoutConfigService (Backend)

- **Purpose**: Core service for layout config CRUD, validation, caching, and resolution
- **Location**: `apps/core-api/src/services/layout-config.service.ts`
- **Responsibilities**:
  - CRUD operations for layout configs (tenant and workspace scope)
  - Validate field/section/column overrides against plugin manifest (FR-020)
  - Detect required field violations (FR-011)
  - Resolve layout for a user (merge config + manifest + role visibility)
  - Manage Redis cache (invalidation on save, TTL with jitter)
  - Record audit log entries (FR-022, per ADR-025)
  - Optimistic concurrency via `updated_at` ETag (Edge Case #5)
  - Soft-delete configs on plugin uninstall (FR-024)
- **Dependencies**:
  - `PrismaClient` (tenant-scoped via `TenantPrisma`)
  - `RedisClient` (ioredis)
  - `PluginService` (to fetch manifest `formSchemas`)
  - `PermissionService` / ABAC engine (ADR-017, for role resolution)
  - `AuditLogService` (ADR-025, for logging config changes)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --- | --- | --- | --- |
  | `getConfig(formId, scopeType, scopeId?)` | string, ScopeType, string? | `LayoutConfig \| null` | Load config from DB |
  | `saveConfig(formId, scopeType, scopeId?, data, ack?)` | string, ScopeType, string?, SaveDTO, boolean | `LayoutConfig` | Upsert config with validation |
  | `revertConfig(formId, scopeType, scopeId?)` | string, ScopeType, string? | `LayoutConfig` | Swap current and previous_version |
  | `deleteConfig(formId, scopeType, scopeId?)` | string, ScopeType, string? | `void` | Hard-delete config |
  | `resolveForUser(formId, userId, workspaceId?)` | string, string, string? | `ResolvedLayout` | Full resolution with role visibility |
  | `listConfigurableForms()` | — | `ConfigurableForm[]` | Aggregate formSchemas from all manifests |
  | `softDeleteByPlugin(pluginId)` | string | `number` | Soft-delete all configs for a plugin |
  | `restoreByPlugin(pluginId)` | string | `number` | Restore soft-deleted configs |
  | `invalidateCache(tenantId, formId, scope)` | string, string, string | `void` | Delete Redis cache key |

### 5.2 LayoutConfigValidationService (Backend)

- **Purpose**: Validates layout config data against plugin manifest schemas
- **Location**: `apps/core-api/src/services/layout-config-validation.service.ts`
- **Responsibilities**:
  - Validate field/section/column IDs exist in plugin manifest (FR-020)
  - Detect required fields being hidden without defaults (FR-011)
  - Validate JSONB size < 256 KB (Edge Case #6)
  - Detect stale field references (Edge Case #1)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --- | --- | --- | --- |
  | `validateAgainstManifest(overrides, manifest)` | SaveDTO, FormSchema | `ValidationResult` | Full validation |
  | `detectRequiredFieldWarnings(fields, manifest)` | FieldOverride[], FormSchema | `WarningField[]` | Required fields being hidden |
  | `detectStaleReferences(overrides, manifest)` | SaveDTO, FormSchema | `StaleRef[]` | Fields no longer in manifest |
  | `validateSize(data)` | SaveDTO | `boolean` | Check 256 KB limit |

### 5.3 Layout Config Zod Schemas (Backend)

- **Purpose**: Request validation for all layout config endpoints
- **Location**: `apps/core-api/src/schemas/layout-config.schema.ts`
- **Contents**:
  - `fieldOverrideSchema` — validates individual field overrides
  - `sectionOverrideSchema` — validates section overrides
  - `columnOverrideSchema` — validates column overrides
  - `saveLayoutConfigSchema` — validates PUT request body
  - `formSchemaManifestSchema` — validates `formSchemas` in plugin manifest
  - `roleKeySchema` — validates RoleKey union type
- **Traces**: FR-003, FR-004, FR-005, NFR-005 (Zod validation per Art. 5.3)

### 5.4 Layout Config Routes (Backend)

- **Purpose**: REST route handlers for all 10 endpoints
- **Location**: `apps/core-api/src/routes/layout-config.ts`
- **Responsibilities**:
  - Route registration with Fastify
  - Request parsing and Zod validation
  - Auth middleware application (Bearer, TENANT_ADMIN, WS ADMIN+)
  - Delegation to `LayoutConfigService`
  - Response formatting per Art. 6.2
  - ETag handling for optimistic concurrency
- **Traces**: FR-015, FR-016, FR-019, FR-020, FR-023

### 5.5 LayoutConfigPanel (Frontend)

- **Purpose**: Admin page component for managing layout configurations
- **Location**: `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`
- **Responsibilities**:
  - Orchestrates sub-components (form selector, field config table, section order, column config, preview)
  - Manages unsaved changes state
  - Handles save flow including required field warning dialog
  - Handles conflict resolution dialog
  - Manages scope switching (tenant ↔ workspace)
- **Sub-components**: `FormSelector`, `FieldConfigTable`, `SectionOrderList`, `ColumnConfigTable`, `RolePreviewPanel`, `UnsavedChangesBar`
- **Traces**: FR-012, FR-013, FR-014, FR-015, FR-019, FR-022, FR-023, US-008, Design Spec Component: LayoutConfigPanel

### 5.6 FieldConfigTable (Frontend)

- **Purpose**: Grid table for field ordering and per-role visibility toggles
- **Location**: `apps/web/src/components/layout-engine/FieldConfigTable.tsx`
- **Responsibilities**:
  - Render field rows with order controls and visibility toggles
  - Handle up/down reordering (FR-013)
  - Handle visibility toggle cycling (editable → read-only → hidden)
  - Show required field indicators (⚠) and stale field badges (!)
  - WAI-ARIA grid pattern with keyboard navigation
- **Traces**: FR-003, FR-012, FR-013, Design Spec Component: FieldConfigTable

### 5.7 ColumnConfigTable (Frontend)

- **Purpose**: Grid table for column per-role visibility toggles
- **Location**: `apps/web/src/components/layout-engine/ColumnConfigTable.tsx`
- **Responsibilities**:
  - Render column rows with visibility toggles (bi-state: visible/hidden)
  - Similar to FieldConfigTable but no ordering, no read-only state
- **Traces**: FR-005, FR-012, Design Spec Component: ColumnConfigTable

### 5.8 SectionOrderList (Frontend)

- **Purpose**: Reorderable list for section ordering
- **Location**: `apps/web/src/components/layout-engine/SectionOrderList.tsx`
- **Responsibilities**:
  - Render section list with up/down arrow controls
  - Handle section reordering
- **Traces**: FR-004, FR-012, Design Spec Component: SectionOrderList

### 5.9 VisibilityToggle (Frontend)

- **Purpose**: Tri-state (or bi-state) cycling icon button for visibility control
- **Location**: `apps/web/src/components/layout-engine/VisibilityToggle.tsx`
- **Responsibilities**:
  - Cycle through visibility states on click/keyboard
  - Field mode: editable → read-only → hidden → editable
  - Column mode: visible → hidden → visible
  - ARIA label updates per cycle with screen reader announcement
- **Traces**: FR-003, FR-005, Design Spec Component: VisibilityToggle

### 5.10 RolePreviewPanel (Frontend)

- **Purpose**: Read-only form preview for a selected role
- **Location**: `apps/web/src/components/layout-engine/RolePreviewPanel.tsx`
- **Responsibilities**:
  - Compute visible fields for selected role (client-side, no API call)
  - Render read-only preview with placeholder data
  - Update reactively as config changes (live preview)
  - `aria-live="polite"` announcements on role change
- **Traces**: FR-014, Design Spec Component: RolePreviewPanel

### 5.11 RequiredFieldWarningDialog (Frontend)

- **Purpose**: Modal dialog for required field hiding confirmation
- **Location**: `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx`
- **Responsibilities**:
  - Display affected field list
  - Handle Cancel (revert toggles) and Proceed (resend with `acknowledgeWarnings`)
  - Focus trap, Esc to close
- **Traces**: FR-011, US-007, Design Spec Component: RequiredFieldWarningDialog

### 5.12 LayoutAwareForm (Frontend)

- **Purpose**: Wrapper component that applies layout transformations to plugin forms
- **Location**: `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`
- **Responsibilities**:
  - Fetch resolved layout via `useResolvedLayout` hook
  - Apply field ordering, visibility, and read-only transformations
  - Remove hidden fields from DOM
  - Auto-inject default values for hidden required fields (FR-010)
  - Fail-open: render with manifest defaults on error (NFR-008)
  - Show skeleton during loading, empty state when all fields hidden
- **Traces**: FR-025, FR-007, FR-008, FR-010, FR-017, US-001, US-002, US-003, US-009, Design Spec Component: LayoutAwareForm

### 5.13 LayoutAwareTable (Frontend)

- **Purpose**: Wrapper component that applies column visibility to data tables
- **Location**: `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`
- **Responsibilities**:
  - Fetch resolved layout via `useResolvedLayout` hook
  - Filter and reorder columns based on resolved config
  - Delegate to existing `DataTable` from `@plexica/ui`
  - Fail-open: show all columns on error
- **Traces**: FR-026, FR-005, FR-008, US-005, Design Spec Component: LayoutAwareTable

### 5.14 useResolvedLayout Hook (Frontend)

- **Purpose**: React Query hook for fetching resolved layout configs
- **Location**: `apps/web/src/hooks/useResolvedLayout.ts`
- **Responsibilities**:
  - Call `GET /api/v1/layout-configs/:formId/resolved`
  - Configure `staleTime: 60_000` (FR-017)
  - Return `{ data, isLoading, isError }` for consumers
  - Handle error silently (fail-open per NFR-008 — return null on error)
- **Traces**: FR-017, NFR-002, NFR-008, Design Spec Component: useResolvedLayout

### 5.15 Read-Only Field Enforcement Middleware (Backend)

- **Purpose**: Strip read-only field values from form submission payloads
- **Location**: `apps/core-api/src/middleware/layout-readonly-guard.ts`
- **Responsibilities**:
  - On form submission endpoints (plugin form save), resolve layout for user
  - Identify fields marked `readonly` for user's effective role
  - Strip those field values from request body before handler
  - Ensures server-side enforcement even if client sends modified values (FR-021, NFR-006)
- **Traces**: FR-021, US-003, NFR-006

---

## 6. File Map

### Files to Create

| Path                                                                        | Purpose                                                                                           | Est. Size |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| `packages/database/prisma/migrations/YYYYMMDD_layout_configs/migration.sql` | Create `layout_configs` table in tenant schema template                                           | S         |
| `packages/types/src/layout-config.ts`                                       | Shared TypeScript types (FieldOverride, SectionOverride, ColumnOverride, ResolvedLayout, RoleKey) | M         |
| `apps/core-api/src/schemas/layout-config.schema.ts`                         | Zod validation schemas for all layout config request/response shapes                              | M         |
| `apps/core-api/src/services/layout-config.service.ts`                       | Core layout config CRUD, resolution, and caching service                                          | L         |
| `apps/core-api/src/services/layout-config-validation.service.ts`            | Manifest validation, required field detection, stale field detection                              | M         |
| `apps/core-api/src/routes/layout-config.ts`                                 | 10 REST endpoint route handlers                                                                   | L         |
| `apps/core-api/src/middleware/layout-readonly-guard.ts`                     | Server-side read-only field stripping middleware                                                  | S         |
| `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`               | Admin panel orchestrator page component                                                           | L         |
| `apps/web/src/components/layout-engine/FieldConfigTable.tsx`                | Field ordering + role visibility grid table                                                       | L         |
| `apps/web/src/components/layout-engine/ColumnConfigTable.tsx`               | Column role visibility grid table                                                                 | M         |
| `apps/web/src/components/layout-engine/SectionOrderList.tsx`                | Section reorder list with up/down arrows                                                          | S         |
| `apps/web/src/components/layout-engine/VisibilityToggle.tsx`                | Tri-state/bi-state cycling icon button                                                            | S         |
| `apps/web/src/components/layout-engine/RolePreviewPanel.tsx`                | Read-only form preview for selected role                                                          | M         |
| `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx`      | Modal confirmation for hiding required fields                                                     | S         |
| `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`                 | Form wrapper applying layout transformations                                                      | M         |
| `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`                | Table wrapper applying column visibility                                                          | M         |
| `apps/web/src/hooks/useResolvedLayout.ts`                                   | React Query hook for resolved layout fetch                                                        | S         |
| `apps/web/src/routes/settings/layout-configuration.tsx`                     | TanStack Router route for admin panel                                                             | S         |
| `packages/sdk/src/types/form-schema.ts`                                     | TypeScript types for `formSchemas` manifest extension                                             | S         |

### Files to Modify

| Path                                           | Section/Change                    | Description                                                                  | Est. Effort |
| ---------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| `packages/sdk/src/types/manifest.ts`           | Add `formSchemas?` property       | Plugin manifest type extension (FR-001)                                      | S           |
| `apps/core-api/src/services/plugin.service.ts` | Add `getFormSchemas()` method     | Extract formSchemas from plugin manifest JSONB                               | S           |
| `apps/core-api/src/routes/plugin.ts`           | Add formSchemas validation        | Validate `formSchemas` in manifest on plugin register/update                 | S           |
| `apps/core-api/src/middleware/auth.ts`         | Expose effective team roles       | Add team role resolution to request context for layout middleware            | S           |
| `apps/web/src/routes/settings/index.tsx`       | Add Layout Configuration nav item | Add sidebar entry for Layout Config (reuse AdminSidebarNav pattern)          | S           |
| `packages/database/prisma/schema.prisma`       | Add `layout_configs` model        | Prisma model for tenant schema table                                         | S           |
| `apps/core-api/src/services/plugin.service.ts` | Add uninstall hook                | Call `LayoutConfigService.softDeleteByPlugin()` on plugin uninstall (FR-024) | S           |

### Files to Delete

None.

### Files to Reference (Read-only)

| Path                                                           | Purpose                                     |
| -------------------------------------------------------------- | ------------------------------------------- |
| `.forge/constitution.md`                                       | Validate all decisions against constitution |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       | Tenant schema pattern                       |
| `.forge/knowledge/adr/adr-017-abac-engine.md`                  | Role resolution engine                      |
| `.forge/knowledge/adr/adr-024-team-member-role-vs-keycloak.md` | Effective role computation                  |
| `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`       | Audit logging pattern                       |
| `.forge/knowledge/adr/adr-004-module-federation.md`            | Module Federation patterns                  |
| `.forge/knowledge/adr/adr-011-vite-module-federation.md`       | Vite MF implementation                      |
| `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     | Workspace override pattern                  |

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure (Database + Types + Schemas)

**Objective**: Establish the data layer and shared types that all other phases depend on.

**Files to Create**:

- `packages/types/src/layout-config.ts` — Shared types
- `packages/database/prisma/migrations/YYYYMMDD_layout_configs/migration.sql` — DB migration
- `apps/core-api/src/schemas/layout-config.schema.ts` — Zod schemas
- `packages/sdk/src/types/form-schema.ts` — Manifest extension types

**Files to Modify**:

- `packages/database/prisma/schema.prisma` — Add `layout_configs` model
- `packages/sdk/src/types/manifest.ts` — Add `formSchemas` optional property

**Tasks**: T014-01, T014-02, T014-03, T014-04

---

### Phase 2: Backend Service Layer

**Objective**: Implement the core layout config service with CRUD, validation, caching, and resolution logic.

**Files to Create**:

- `apps/core-api/src/services/layout-config.service.ts` — Core service
- `apps/core-api/src/services/layout-config-validation.service.ts` — Validation service

**Files to Modify**:

- `apps/core-api/src/services/plugin.service.ts` — Add `getFormSchemas()` and uninstall hook

**Tasks**: T014-05, T014-06, T014-07, T014-08, T014-09

---

### Phase 3: Backend API Routes

**Objective**: Expose all 10 REST endpoints with auth, validation, caching, and error handling.

**Files to Create**:

- `apps/core-api/src/routes/layout-config.ts` — All route handlers
- `apps/core-api/src/middleware/layout-readonly-guard.ts` — Read-only enforcement

**Files to Modify**:

- `apps/core-api/src/middleware/auth.ts` — Expose effective team roles in request context
- `apps/core-api/src/routes/plugin.ts` — Add formSchemas validation on register

**Tasks**: T014-10, T014-11, T014-12, T014-13

---

### Phase 4: Frontend — Shared Hook & Layout-Aware Components

**Objective**: Implement the end-user facing components that consume resolved layouts.

**Files to Create**:

- `apps/web/src/hooks/useResolvedLayout.ts` — React Query hook
- `apps/web/src/components/layout-engine/LayoutAwareForm.tsx` — Form wrapper
- `apps/web/src/components/layout-engine/LayoutAwareTable.tsx` — Table wrapper
- `apps/web/src/components/layout-engine/VisibilityToggle.tsx` — Shared toggle component

**Tasks**: T014-14, T014-15, T014-16, T014-17

---

### Phase 5: Frontend — Admin Panel

**Objective**: Implement the admin configuration interface.

**Files to Create**:

- `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx` — Orchestrator
- `apps/web/src/components/layout-engine/FieldConfigTable.tsx` — Field config grid
- `apps/web/src/components/layout-engine/ColumnConfigTable.tsx` — Column config grid
- `apps/web/src/components/layout-engine/SectionOrderList.tsx` — Section reorder
- `apps/web/src/components/layout-engine/RolePreviewPanel.tsx` — Role preview
- `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx` — Warning dialog
- `apps/web/src/routes/settings/layout-configuration.tsx` — Route entry

**Files to Modify**:

- `apps/web/src/routes/settings/index.tsx` — Add nav entry

**Tasks**: T014-18, T014-19, T014-20, T014-21, T014-22, T014-23

---

### Phase 6: Testing

**Objective**: Achieve ≥80% coverage with unit, integration, and E2E tests.

**Tasks**: T014-24, T014-25, T014-26, T014-27, T014-28, T014-29

---

### Phase 7: Documentation & Feature Flag

**Objective**: Update documentation and enable feature flag for rollout.

**Tasks**: T014-30, T014-31, T014-32

---

## 8. Task Breakdown

### Phase 1: Core Infrastructure

#### T014-01: Create shared TypeScript types for layout config

- **Story Points**: 2
- **Dependencies**: None
- **Files**: `packages/types/src/layout-config.ts`, `packages/sdk/src/types/form-schema.ts`
- **Description**: Define all shared types: `RoleKey`, `FieldOverride`, `SectionOverride`, `ColumnOverride`, `LayoutConfig`, `LayoutConfigSnapshot`, `ResolvedLayout`, `FormSchema`, `ManifestField`, `ManifestSection`, `ManifestColumn`. Export from package index.
- **Acceptance Criteria**:
  - All types from spec §7.3–7.5 are defined with correct signatures
  - Types are importable from `@plexica/types`
  - `RoleKey` includes all 7 roles per ADR-024
- **Traces**: FR-003, FR-004, FR-005, FR-006

#### T014-02: Extend plugin manifest type with `formSchemas`

- **Story Points**: 2
- **Dependencies**: T014-01
- **Files**: `packages/sdk/src/types/manifest.ts`
- **Description**: Add optional `formSchemas?: FormSchema[]` property to the existing plugin manifest TypeScript type. This is a backward-compatible extension.
- **Acceptance Criteria**:
  - Existing manifest types compile without changes
  - `formSchemas` is optional (no breaking change)
  - Type matches spec §7.1 JSON structure
- **Traces**: FR-001

#### T014-03: Create Prisma migration for `layout_configs` table

- **Story Points**: 3
- **Dependencies**: T014-01
- **Files**: `packages/database/prisma/migrations/YYYYMMDD_layout_configs/migration.sql`, `packages/database/prisma/schema.prisma`
- **Description**: Create the `layout_configs` table in tenant schema with all columns from spec §7.2. Create partial unique indexes for tenant-scope and workspace-scope uniqueness. Create the B-tree index on `plugin_id` and partial index on `scope_id`. Migration must be backward-compatible and run on all existing tenant schemas.
- **Acceptance Criteria**:
  - Migration runs successfully on clean DB and on existing schemas
  - Unique indexes enforce one config per form per scope
  - Soft-deleted rows don't conflict with active configs
  - `pnpm db:migrate` succeeds
- **Traces**: FR-002, NFR-005, NFR-009

#### T014-04: Create Zod validation schemas for layout config

- **Story Points**: 3
- **Dependencies**: T014-01
- **Files**: `apps/core-api/src/schemas/layout-config.schema.ts`
- **Description**: Define Zod schemas for: `fieldOverrideSchema`, `sectionOverrideSchema`, `columnOverrideSchema`, `saveLayoutConfigSchema` (PUT body), `formSchemaManifestSchema` (manifest validation), `roleKeySchema`. Include 256 KB size limit validation. Include `acknowledgeWarnings` boolean field.
- **Acceptance Criteria**:
  - All valid payloads from spec examples pass validation
  - Invalid `fieldId` patterns are rejected
  - `RoleKey` validates exactly the 7 allowed roles
  - Payloads > 256 KB are rejected
  - Schema matches spec §7.3–7.5 exactly
- **Traces**: FR-003, FR-004, FR-005, FR-006, NFR-005 (Art. 5.3)

### Phase 2: Backend Service Layer

#### T014-05: Implement LayoutConfigService CRUD operations

- **Story Points**: 5
- **Dependencies**: T014-03, T014-04
- **Files**: `apps/core-api/src/services/layout-config.service.ts`
- **Description**: Implement `getConfig()`, `saveConfig()`, `revertConfig()`, `deleteConfig()`, `listConfigurableForms()`. The `saveConfig` method must: (1) store current config as `previous_version` before overwrite (FR-018), (2) support optimistic concurrency via `updated_at` ETag, (3) call audit log service (FR-022). The `revertConfig` must swap current and `previous_version` (FR-019).
- **Acceptance Criteria**:
  - CRUD operations work for both tenant and workspace scope
  - `previous_version` is correctly stored on save and swapped on revert
  - ETag mismatch returns `409 LAYOUT_CONFIG_CONFLICT`
  - Audit log entries created for save, revert, and delete
  - `NO_PREVIOUS_VERSION` error when reverting with no previous version
- **Traces**: FR-002, FR-015, FR-016, FR-018, FR-019, FR-022, US-008, US-010

#### T014-06: Implement LayoutConfigValidationService

- **Story Points**: 5
- **Dependencies**: T014-04, T014-02
- **Files**: `apps/core-api/src/services/layout-config-validation.service.ts`
- **Description**: Implement `validateAgainstManifest()` to verify all field/section/column IDs exist in plugin manifest. Implement `detectRequiredFieldWarnings()` to identify required fields being hidden with no default (FR-011). Implement `detectStaleReferences()` for Edge Case #1. Implement `validateSize()` for 256 KB limit.
- **Acceptance Criteria**:
  - Non-existent field IDs rejected with `INVALID_FIELD_REFERENCE`
  - Required fields with no default detected and returned as warnings
  - Required fields WITH defaults pass without warning
  - Stale references detected but not rejected (warning only)
  - Configs > 256 KB rejected with `LAYOUT_CONFIG_TOO_LARGE`
- **Traces**: FR-010, FR-011, FR-020, NFR-012, Edge Case #1, Edge Case #6

#### T014-07: Implement layout config resolution engine

- **Story Points**: 8
- **Dependencies**: T014-05, T014-06
- **Files**: `apps/core-api/src/services/layout-config.service.ts` (add `resolveForUser` method)
- **Description**: Implement the full resolution algorithm: (1) select workspace or tenant config, (2) merge with manifest defaults for unconfigured fields, (3) resolve per-user role visibility using ABAC engine (ADR-017) and team member roles (ADR-024), (4) apply "most permissive wins" across multiple team memberships (FR-007), (5) handle fail-open when config unavailable (NFR-008), (6) silently skip removed fields and append new fields (Edge Case #1). Visibility resolution priority: role-specific > globalVisibility > manifest default.
- **Acceptance Criteria**:
  - Workspace override fully replaces tenant config (FR-009)
  - No config → manifest defaults (all visible, all editable)
  - Most permissive wins across team memberships
  - Users with no team membership use Keycloak realm role only (Edge Case #2)
  - Resolution completes in < 50ms P95 (NFR-001)
  - Fail-open returns manifest defaults on any error
- **Traces**: FR-007, FR-008, FR-009, FR-025, FR-026, NFR-001, NFR-008, US-002, US-003, US-005, US-006, Edge Case #2

#### T014-08: Implement Redis caching layer for layout configs

- **Story Points**: 3
- **Dependencies**: T014-05
- **Files**: `apps/core-api/src/services/layout-config.service.ts` (add caching to existing methods)
- **Description**: Add Redis caching to the resolution path. Cache key: `layout:{tenantId}:{formId}:{scope}`. TTL: 300s ± 30s jitter (randomized per entry to prevent thundering herd). Cache stores pre-role-resolution config blob. Invalidate on save, revert, and delete. Fail-open: bypass cache on Redis error (log warning, fall through to DB).
- **Acceptance Criteria**:
  - Cache hit rate > 95% in steady state (NFR-011)
  - Cache invalidated on every write operation
  - TTL has jitter (not all keys expire simultaneously)
  - Redis unavailability does not break resolution (fail-open)
  - Cache key uses correct tenant/form/scope combination
- **Traces**: NFR-011, NFR-008, Edge Case #7

#### T014-09: Implement plugin uninstall hook for layout config cleanup

- **Story Points**: 2
- **Dependencies**: T014-05
- **Files**: `apps/core-api/src/services/plugin.service.ts`, `apps/core-api/src/services/layout-config.service.ts`
- **Description**: Hook into plugin uninstall flow to soft-delete all layout configs referencing the uninstalled plugin's forms (FR-024). Hook into plugin reinstall to restore soft-deleted configs. Invalidate Redis cache for affected forms.
- **Acceptance Criteria**:
  - All layout configs for uninstalled plugin have `deleted_at` set
  - Reinstalled plugin configs are restored (`deleted_at` cleared)
  - Cache invalidated for all affected forms
  - Soft-deleted configs don't appear in `listConfigurableForms()`
- **Traces**: FR-024, Edge Case #8

### Phase 3: Backend API Routes

#### T014-10: Implement tenant-scope layout config routes

- **Story Points**: 5
- **Dependencies**: T014-05, T014-06, T014-07
- **Files**: `apps/core-api/src/routes/layout-config.ts`
- **Description**: Implement routes: `GET /forms`, `GET /:formId`, `PUT /:formId`, `POST /:formId/revert`, `DELETE /:formId`, `GET /:formId/resolved`. Apply `TENANT_ADMIN` auth guard on admin routes. Apply Bearer auth on read routes. Wire Zod validation. Return standard error format (Art. 6.2). Set `Cache-Control: private, no-store` on resolved endpoint.
- **Acceptance Criteria**:
  - All 6 tenant-scope endpoints respond correctly
  - Auth guards enforce `TENANT_ADMIN` for admin operations
  - Zod validation rejects invalid payloads with 400
  - Error responses follow `{ error: { code, message, details } }` format
  - ETag/If-Match handling works for concurrent edit detection
- **Traces**: FR-015, FR-016, FR-019, FR-023, NFR-007

#### T014-11: Implement workspace-scope layout config routes

- **Story Points**: 3
- **Dependencies**: T014-10
- **Files**: `apps/core-api/src/routes/layout-config.ts` (add workspace routes)
- **Description**: Implement routes: `GET /workspaces/:wId/layout-configs/:formId`, `PUT /workspaces/:wId/layout-configs/:formId`, `POST /workspaces/:wId/layout-configs/:formId/revert`, `DELETE /workspaces/:wId/layout-configs/:formId`. Apply workspace `ADMIN`+ role guard using ADR-024 effective role check. Return `403 INSUFFICIENT_WORKSPACE_ROLE` on insufficient permissions (Edge Case #10).
- **Acceptance Criteria**:
  - All 4 workspace-scope endpoints respond correctly
  - Workspace membership and `ADMIN`+ role validated
  - `INSUFFICIENT_WORKSPACE_ROLE` returned for unauthorized workspace access
  - Workspace routes share service layer with tenant routes (DRY)
- **Traces**: FR-009, FR-015, FR-016, NFR-007, US-006, Edge Case #10

#### T014-12: Implement read-only field enforcement middleware

- **Story Points**: 3
- **Dependencies**: T014-07
- **Files**: `apps/core-api/src/middleware/layout-readonly-guard.ts`, `apps/core-api/src/middleware/auth.ts`
- **Description**: Create middleware that, on form submission endpoints, resolves the layout for the current user and strips values of fields marked `readonly` for their effective role. Modify auth middleware to expose effective team roles in the Fastify request context. This is server-side enforcement — client-side read-only is cosmetic only (NFR-006).
- **Acceptance Criteria**:
  - Read-only fields stripped from request body before reaching handler
  - Existing field values preserved when read-only field stripped
  - Middleware is opt-in (registered on plugin form submission routes)
  - Effective team roles available in `request.effectiveRoles`
  - 100% server-side enforcement (NFR-006)
- **Traces**: FR-021, US-003, NFR-006

#### T014-13: Implement formSchemas validation on plugin register

- **Story Points**: 2
- **Dependencies**: T014-04
- **Files**: `apps/core-api/src/routes/plugin.ts`
- **Description**: Add Zod validation for `formSchemas` in the plugin manifest during plugin registration and update. Valid manifests with no `formSchemas` pass (backward compatible). Invalid `formSchemas` structures are rejected.
- **Acceptance Criteria**:
  - Plugins with valid `formSchemas` register successfully
  - Plugins without `formSchemas` register successfully (backward compatible)
  - Invalid `formSchemas` structures rejected with 400
  - Manifests with 200+ fields per form are accepted (NFR-004)
- **Traces**: FR-001, NFR-004

### Phase 4: Frontend — Shared Hook & Layout-Aware Components

#### T014-14: Implement `useResolvedLayout` React Query hook

- **Story Points**: 3
- **Dependencies**: T014-10 (backend resolved endpoint)
- **Files**: `apps/web/src/hooks/useResolvedLayout.ts`
- **Description**: Create React Query hook that calls `GET /api/v1/layout-configs/:formId/resolved?workspaceId=...`. Configure `staleTime: 60_000` (FR-017). Return `{ data: ResolvedLayout | null, isLoading, isError }`. On error, return `null` (fail-open per NFR-008) — consuming components fall back to manifest defaults.
- **Acceptance Criteria**:
  - Hook fetches resolved layout on mount
  - `staleTime: 60_000` configured (cache for 60s client-side)
  - Error state returns `null` (not throws) for fail-open
  - Loading state returns `isLoading: true`
  - Workspace ID passed as query param when provided
- **Traces**: FR-017, NFR-002, NFR-008

#### T014-15: Implement `<LayoutAwareForm>` component

- **Story Points**: 8
- **Dependencies**: T014-14, T014-01
- **Files**: `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`
- **Description**: Create wrapper component that: (1) fetches resolved layout via `useResolvedLayout`, (2) reorders fields per config, (3) removes hidden fields from DOM, (4) applies read-only treatment (disabled + visual styling) to readonly fields, (5) auto-injects default values for hidden required fields (FR-010), (6) shows skeleton during loading, (7) shows empty state when all fields hidden (Edge Case #3), (8) falls back to manifest defaults on error (NFR-008). Supports render prop pattern for flexible composition. Sections rendered in configured order with collapsible headers.
- **Acceptance Criteria**:
  - Fields rendered in configured order
  - Hidden fields completely removed from DOM
  - Read-only fields visually disabled with tooltip
  - Hidden required fields with defaults auto-populated in form state
  - Skeleton shown during loading
  - Empty state shown when all fields hidden
  - Manifest defaults used on error (fail-open)
  - WCAG 2.1 AA: tab order follows field order, aria attributes correct
- **Traces**: FR-025, FR-007, FR-008, FR-010, US-001, US-002, US-003, US-009, Edge Case #3, NFR-008, NFR-010

#### T014-16: Implement `<LayoutAwareTable>` component

- **Story Points**: 5
- **Dependencies**: T014-14, T014-01
- **Files**: `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`
- **Description**: Create wrapper component that: (1) fetches resolved layout via `useResolvedLayout`, (2) filters column definitions based on visibility, (3) reorders columns per config, (4) passes filtered columns + data to existing `DataTable` from `@plexica/ui`, (5) shows skeleton during loading, (6) shows empty state when all columns hidden, (7) falls back to all columns on error (fail-open).
- **Acceptance Criteria**:
  - Hidden columns removed from table
  - Columns rendered in configured order
  - DataTable props (sorting, pagination, filtering) pass through correctly
  - Skeleton table during loading
  - Empty state when all columns hidden for role
  - All columns shown on error (fail-open)
- **Traces**: FR-026, FR-005, FR-008, US-005, NFR-008

#### T014-17: Implement `VisibilityToggle` component

- **Story Points**: 2
- **Dependencies**: T014-01
- **Files**: `apps/web/src/components/layout-engine/VisibilityToggle.tsx`
- **Description**: Create cycling icon button with two modes: field mode (3 states: editable → read-only → hidden) and column mode (2 states: visible → hidden). Visual states: ✓ₑ green, ✓ᵣ blue, ✗ red. ARIA label updates on each cycle. Focus ring, 44×44px touch target. Keyboard: Enter/Space to cycle.
- **Acceptance Criteria**:
  - Field mode cycles through 3 states correctly
  - Column mode cycles through 2 states correctly
  - ARIA label updated on each cycle (screen reader announces change)
  - Focus ring visible on keyboard focus
  - Touch target ≥ 44×44px
  - Colors match design system tokens
- **Traces**: FR-003, FR-005, NFR-010, Design Spec: VisibilityToggle

### Phase 5: Frontend — Admin Panel

#### T014-18: Implement `LayoutConfigPanel` orchestrator

- **Story Points**: 8
- **Dependencies**: T014-14, T014-17
- **Files**: `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`
- **Description**: Create the admin panel page component that orchestrates all sub-components. Manages state: form selection, scope selection, unsaved changes tracking, save flow (including required field warning dialog and conflict dialog). Form selector populated from `GET /api/v1/layout-configs/forms`. Scope selector switches between tenant/workspace. Unsaved changes banner with `beforeunload` warning. Conflict dialog on 409. Loading skeleton. Empty state when no forms available.
- **Acceptance Criteria**:
  - Form selector populated from API
  - Scope switching works (tenant ↔ workspace)
  - Unsaved changes tracked and displayed
  - `beforeunload` warning on navigate-away with unsaved changes
  - Save flow handles 200, 400 (required field warning), 409 (conflict)
  - Loading skeleton during initial fetch
  - Empty state when no configurable forms
- **Traces**: FR-012, FR-014, FR-015, FR-023, US-008, Edge Case #5

#### T014-19: Implement `FieldConfigTable` grid component

- **Story Points**: 5
- **Dependencies**: T014-17
- **Files**: `apps/web/src/components/layout-engine/FieldConfigTable.tsx`
- **Description**: Create WAI-ARIA grid table with columns: Field Name, Order, {role visibility columns}, Global. Field name shows ⚠ indicator for required fields and (!) badge for stale fields. Order column has [▲][▼] icon buttons. Role columns use `VisibilityToggle` components. Global column uses `<Select>`. ARIA: `role="grid"`, `role="row"`, `role="rowheader"`.
- **Acceptance Criteria**:
  - All fields rendered with correct indicators
  - Up/down arrows reorder fields correctly
  - [▲] disabled on first row, [▼] disabled on last row
  - Visibility toggles cycle correctly per role
  - Global select updates `globalVisibility`
  - Required field indicator (⚠) shows for required fields
  - Stale field badge (!) shows for stale references
  - Screen reader announces position changes
  - Keyboard navigation via Tab and Enter/Space
- **Traces**: FR-003, FR-012, FR-013, NFR-010, NFR-012, Edge Case #1

#### T014-20: Implement `ColumnConfigTable` grid component

- **Story Points**: 3
- **Dependencies**: T014-17
- **Files**: `apps/web/src/components/layout-engine/ColumnConfigTable.tsx`
- **Description**: Similar to `FieldConfigTable` but for columns. No ordering controls. No read-only state (columns are only visible/hidden). Uses bi-state `VisibilityToggle`.
- **Acceptance Criteria**:
  - All columns rendered with role visibility toggles
  - Bi-state toggle (visible/hidden) works correctly
  - Global column visibility select works
  - ARIA grid pattern implemented
- **Traces**: FR-005, FR-012

#### T014-21: Implement `SectionOrderList` component

- **Story Points**: 2
- **Dependencies**: None (standalone)
- **Files**: `apps/web/src/components/layout-engine/SectionOrderList.tsx`
- **Description**: Reorderable list of sections with [▲][▼] arrow controls. Similar to field reordering but simpler (no visibility toggles). Screen reader announces position changes.
- **Acceptance Criteria**:
  - Sections listed with current order
  - Up/down arrows reorder sections
  - Boundary arrows disabled
  - Screen reader announces position changes
- **Traces**: FR-004, FR-012

#### T014-22: Implement `RolePreviewPanel` component

- **Story Points**: 3
- **Dependencies**: T014-15 (shares layout resolution logic)
- **Files**: `apps/web/src/components/layout-engine/RolePreviewPanel.tsx`
- **Description**: Read-only form preview for a selected role. Computes visible fields client-side from current (possibly unsaved) config state — no API call. Renders preview with placeholder data. Read-only fields shown with greyed background. Hidden fields omitted with annotation at bottom. `aria-live="polite"` on role change. All inputs `tabindex="-1"`.
- **Acceptance Criteria**:
  - Preview updates live as admin changes toggles (no save required)
  - Correct fields shown/hidden for selected role
  - Read-only fields visually greyed
  - Hidden fields annotated at bottom
  - `aria-live` announces role change
  - Preview is non-interactive (tabindex="-1")
- **Traces**: FR-014, US-008

#### T014-23: Implement `RequiredFieldWarningDialog` and settings route

- **Story Points**: 3
- **Dependencies**: T014-18
- **Files**: `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx`, `apps/web/src/routes/settings/layout-configuration.tsx`, `apps/web/src/routes/settings/index.tsx`
- **Description**: Create modal dialog that shows when save returns `400 REQUIRED_FIELD_NO_DEFAULT`. Lists affected fields. [Cancel] reverts toggles and closes dialog. [Proceed Anyway] resends PUT with `acknowledgeWarnings: true`. Focus trap. Esc = Cancel. Initial focus on [Cancel]. Also create the TanStack Router route for the admin panel and add "Layout Configuration" to the settings sidebar navigation.
- **Acceptance Criteria**:
  - Dialog opens on `REQUIRED_FIELD_NO_DEFAULT` error
  - Affected fields listed in dialog
  - [Cancel] closes dialog, reverts toggles
  - [Proceed Anyway] resends with acknowledgment
  - Focus trap works correctly
  - Esc closes dialog
  - Route accessible at Settings > Layout Configuration
  - Sidebar nav item added
- **Traces**: FR-011, US-007, Edge Case #9 (save regardless)

### Phase 6: Testing

#### T014-24: Unit tests — LayoutConfigService resolution engine

- **Story Points**: 5
- **Dependencies**: T014-07
- **Files**: `apps/core-api/src/__tests__/layout-config/unit/layout-config.service.test.ts`
- **Description**: Unit tests for `resolveForUser()` covering: workspace override > tenant config > manifest defaults, most permissive wins across team memberships, role-specific > globalVisibility fallback, Keycloak-only users (Edge Case #2), all fields hidden, stale fields silently skipped, new fields appended, fail-open on error. Target: 100% branch coverage on resolution logic.
- **Acceptance Criteria**:
  - ≥ 20 test cases covering all resolution branches
  - Each Edge Case (1–10) has at least one test
  - FR-007 (most permissive) tested with multi-team scenarios
  - FR-008 (visibility cascade) tested with all fallback paths
  - NFR-008 (fail-open) tested with simulated errors
  - All tests pass in < 100ms each
- **Traces**: FR-007, FR-008, FR-009, NFR-001, NFR-008, Art. 8.1, Art. 8.2

#### T014-25: Unit tests — LayoutConfigValidationService

- **Story Points**: 3
- **Dependencies**: T014-06
- **Files**: `apps/core-api/src/__tests__/layout-config/unit/layout-config-validation.service.test.ts`
- **Description**: Unit tests for manifest validation: invalid field references, required field warnings, stale references, size limits. Test with manifests containing 200 fields (NFR-004).
- **Acceptance Criteria**:
  - Invalid field/section/column IDs rejected
  - Required field warnings correctly detected
  - Size > 256 KB rejected
  - Stale references detected
  - 200-field manifest processes in < 10ms (NFR-004)
- **Traces**: FR-010, FR-011, FR-020, NFR-004, NFR-012

#### T014-26: Integration tests — Layout config API endpoints

- **Story Points**: 5
- **Dependencies**: T014-10, T014-11
- **Files**: `apps/core-api/src/__tests__/layout-config/integration/layout-config.routes.test.ts`
- **Description**: Integration tests for all 10 API endpoints with real database. Test RBAC enforcement (TENANT_ADMIN required, workspace ADMIN+ required). Test tenant isolation (tenant A cannot access tenant B's configs — NFR-005). Test optimistic concurrency (409 on ETag mismatch). Test Redis cache invalidation. Test formSchemas validation on plugin register.
- **Acceptance Criteria**:
  - All 10 endpoints tested with happy path + error cases
  - Tenant isolation verified (cross-tenant access blocked)
  - RBAC enforcement verified for all role levels
  - Concurrent edit conflict (409) verified
  - Redis cache invalidated on write operations
  - Standard error format verified (Art. 6.2)
- **Traces**: NFR-005, NFR-007, Art. 4.1, Art. 5.1, Art. 5.2, Art. 8.1

#### T014-27: Integration tests — Read-only field enforcement

- **Story Points**: 3
- **Dependencies**: T014-12
- **Files**: `apps/core-api/src/__tests__/layout-config/integration/readonly-guard.test.ts`
- **Description**: Integration tests verifying server-side read-only enforcement: (1) read-only field value stripped from form submission, (2) existing value preserved, (3) non-readonly fields pass through, (4) middleware works with both tenant and workspace configs.
- **Acceptance Criteria**:
  - Read-only field values stripped from request body
  - Existing DB values preserved for stripped fields
  - Non-readonly fields pass through unchanged
  - 100% server-side enforcement verified
- **Traces**: FR-021, US-003, NFR-006

#### T014-28: Unit tests — Frontend components (LayoutAwareForm, LayoutAwareTable, VisibilityToggle)

- **Story Points**: 5
- **Dependencies**: T014-15, T014-16, T014-17
- **Files**: `apps/web/src/__tests__/layout-engine/`
- **Description**: React Testing Library unit tests for: `<LayoutAwareForm>` (field ordering, hidden fields, read-only treatment, empty state, skeleton, fail-open), `<LayoutAwareTable>` (column filtering, empty state, fail-open), `VisibilityToggle` (cycling, ARIA labels, keyboard), `useResolvedLayout` (cache behavior, error handling).
- **Acceptance Criteria**:
  - Each component's states (loading, resolved, error, empty) tested
  - ARIA attributes verified
  - Keyboard interactions verified
  - Fail-open behavior verified
  - ≥ 80% coverage for all frontend components
- **Traces**: FR-025, FR-026, NFR-008, NFR-010, Art. 8.1

#### T014-29: E2E test — Admin configures layout, end user sees changes

- **Story Points**: 5
- **Dependencies**: T014-23 (all components complete)
- **Files**: `apps/core-api/src/__tests__/layout-config/e2e/layout-config.e2e.test.ts`
- **Description**: Full E2E test covering Journey 1 + Journey 2 from user-journey.md: (1) Admin navigates to Layout Config panel, (2) selects a form, (3) reorders a field, (4) hides a field for VIEWER role, (5) previews as VIEWER, (6) saves config, (7) end user (VIEWER) opens the form and sees the configured layout, (8) admin reverts, (9) end user sees previous layout. Also test Journey 4: required field warning flow.
- **Acceptance Criteria**:
  - Full admin → end-user flow works end-to-end
  - Reorder persists and reflects in end-user view
  - Hidden field not rendered for VIEWER
  - Revert restores previous layout
  - Required field warning dialog appears and works
  - Test completes in < 5s per test case
- **Traces**: US-001, US-002, US-007, US-008, US-009, US-010, Art. 8.1

### Phase 7: Documentation & Feature Flag

#### T014-30: Update plugin development documentation

- **Story Points**: 2
- **Dependencies**: T014-02
- **Files**: `docs/PLUGIN_DEVELOPMENT.md`, `packages/sdk/README.md`
- **Description**: Document the `formSchemas` manifest extension: structure, field types, sections, columns. Provide examples. Document how layout configs interact with plugin forms. Update SDK README with formSchemas TypeScript types and usage examples.
- **Acceptance Criteria**:
  - `formSchemas` structure documented with examples
  - Field types enumerated
  - Section and column patterns documented
  - SDK README updated
- **Traces**: FR-001

#### T014-31: Update security documentation

- **Story Points**: 1
- **Dependencies**: T014-12
- **Files**: `docs/SECURITY.md`
- **Description**: Document server-side read-only field enforcement pattern. Explain that client-side read-only is cosmetic only and the backend strips readonly field values from form submissions. Reference FR-021 and NFR-006.
- **Acceptance Criteria**:
  - Read-only enforcement pattern documented
  - Server-side vs client-side distinction clear
  - Reference to layout-readonly-guard middleware included
- **Traces**: FR-021, NFR-006

#### T014-32: Implement `layout_engine_enabled` feature flag

- **Story Points**: 2
- **Dependencies**: T014-10, T014-18
- **Files**: `apps/core-api/src/routes/layout-config.ts`, `apps/web/src/components/layout-engine/LayoutAwareForm.tsx`, `apps/web/src/components/layout-engine/LayoutAwareTable.tsx`
- **Description**: Gate the entire layout engine behind a `layout_engine_enabled` tenant feature flag. When disabled: admin panel route returns 404, resolved endpoint returns manifest defaults, `<LayoutAwareForm>` and `<LayoutAwareTable>` render with manifest defaults. This enables gradual rollout per Art. 9.1.
- **Acceptance Criteria**:
  - Feature flag `layout_engine_enabled` checked on all layout config routes
  - Disabled tenants see manifest default layouts
  - Admin panel hidden for disabled tenants
  - Flag can be toggled per-tenant by super admin
  - No user-facing error when flag is disabled
- **Traces**: Art. 9.1 (feature flags for user-facing changes)

---

## 9. Risk Register

| #     | Risk                                                                                                                                                                                                                                                                            | Impact | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                        | Owner       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| R-001 | **Resolution performance exceeds 50ms P95** — Complex role resolution with multiple team memberships and large configs may exceed NFR-001 target                                                                                                                                | HIGH   | MEDIUM     | Redis cache eliminates DB round-trip for >95% of requests. Role resolution is in-memory (no DB call). Benchmark with 200-field manifests and 5 team memberships in integration tests. Add `@Cacheable` annotation for computed role sets                                                                                                          | Backend     |
| R-002 | **Redis cache invalidation race condition** — Save writes DB then invalidates cache, but a concurrent read could repopulate cache with stale data between write and invalidation                                                                                                | MEDIUM | LOW        | Use Redis `MULTI`/`EXEC` for atomic delete-on-write. Add 1s cache grace period where the cache key is locked (write-behind pattern). Log cache miss ratio to detect anomalies                                                                                                                                                                     | Backend     |
| R-003 | **Plugin manifest backward compatibility** — Existing plugins without `formSchemas` must continue to work after the migration                                                                                                                                                   | HIGH   | LOW        | `formSchemas` is optional in the manifest type. All validation and resolution code handles `undefined` formSchemas gracefully. Zero plugins break if they don't adopt formSchemas. Integration test verifies plugins without formSchemas still register                                                                                           | Backend     |
| R-004 | **Spec 010 widget system dependency** — `<LayoutAwareForm>` and `<LayoutAwareTable>` are shell-level components, but plugin forms loaded via Module Federation need to consume them. Spec 010 Phase 3 (widget system) establishes the Module Federation remote exposure pattern | MEDIUM | MEDIUM     | Phase 4 can proceed independently — `<LayoutAwareForm>` is a shell component that wraps plugin forms already loaded via Module Federation (ADR-004/011). The widget system (Spec 010) adds _plugin-contributed_ widgets, which is a separate concern. If Spec 010 Phase 3 is delayed, layout-aware components still work for shell-rendered forms | Frontend    |
| R-005 | **Optimistic concurrency (ETag) complexity** — The `If-Match` ETag pattern using `updated_at` may cause unexpected 409 errors if two admins edit different parts of the config simultaneously                                                                                   | LOW    | MEDIUM     | V1 uses last-write-wins by default (ETag is optional). Conflict dialog offers "Reload" or "Overwrite" choices. Future V2 could implement per-field merging. Document the behavior clearly in the admin panel UX (unsaved changes banner)                                                                                                          | Full stack  |
| R-006 | **Tenant schema migration across many tenants** — Adding `layout_configs` table to all existing tenant schemas must be automated and backward-compatible                                                                                                                        | MEDIUM | LOW        | Use the existing tenant migration runner that applies DDL to all tenant schemas. Migration is additive-only (new table, no column changes). Test with a staging environment having 100+ tenant schemas before production rollout                                                                                                                  | Backend/Ops |
| R-007 | **WCAG 2.1 AA compliance for config table** — The grid-based admin panel with cycling toggles is a complex interaction pattern that may fail accessibility audits                                                                                                               | MEDIUM | MEDIUM     | Follow WAI-ARIA grid pattern. Use Playwright + axe-core (ADR-022) for automated accessibility testing. Manual screen reader testing with NVDA/VoiceOver. All contrast ratios pre-verified in design spec §5                                                                                                                                       | Frontend    |

---

## 10. Sprint Assignment

### Sprint Estimate

| Phase                               | Tasks        | Story Points | Estimated Duration |
| ----------------------------------- | ------------ | ------------ | ------------------ |
| Phase 1: Core Infrastructure        | T014-01..04  | 10 pts       | 1 week             |
| Phase 2: Backend Service Layer      | T014-05..09  | 23 pts       | 2 weeks            |
| Phase 3: Backend API Routes         | T014-10..13  | 13 pts       | 1 week             |
| Phase 4: Frontend Shared Components | T014-14..17  | 18 pts       | 1.5 weeks          |
| Phase 5: Frontend Admin Panel       | T014-18..23  | 24 pts       | 2 weeks            |
| Phase 6: Testing                    | T014-24..29  | 26 pts       | 2 weeks            |
| Phase 7: Docs & Feature Flag        | T014-30..32  | 5 pts        | 0.5 weeks          |
| **Total**                           | **32 tasks** | **119 pts**  | **~10 weeks**      |

### Recommended Sprint Layout

**Sprint A (Weeks 1–3)**: Phase 1 + Phase 2 = 33 pts

- Focus: Data layer, service layer, resolution engine
- Milestone: Backend service tests passing, Redis caching operational

**Sprint B (Weeks 4–5)**: Phase 3 = 13 pts

- Focus: API routes, auth guards, read-only middleware
- Milestone: All 10 API endpoints passing integration tests

**Sprint C (Weeks 6–8)**: Phase 4 + Phase 5 = 42 pts

- Focus: All frontend components — end-user and admin
- Milestone: Full admin panel functional, layout-aware components rendering

**Sprint D (Weeks 9–10)**: Phase 6 + Phase 7 = 31 pts

- Focus: Comprehensive testing, docs, feature flag
- Milestone: ≥80% coverage, all E2E tests passing, feature flag operational

### Dependencies Summary

```
T014-01 (types) ──┬──▶ T014-02 (manifest types)
                   ├──▶ T014-03 (migration)  ──┬──▶ T014-05 (CRUD)  ──┬──▶ T014-07 (resolution)
                   └──▶ T014-04 (Zod)  ────────┘                     │
                                                 T014-06 (validation)──┘
                                                                       │
T014-05 ──▶ T014-08 (caching)                                         │
T014-05 ──▶ T014-09 (plugin hook)                                     │
                                                                       │
T014-07 ──┬──▶ T014-10 (tenant routes) ──▶ T014-11 (ws routes)        │
          └──▶ T014-12 (readonly guard)                                │
T014-04 ──▶ T014-13 (plugin validation)                               │
                                                                       │
T014-10 ──▶ T014-14 (hook)  ──┬──▶ T014-15 (LayoutAwareForm)          │
                               └──▶ T014-16 (LayoutAwareTable)         │
T014-01 ──▶ T014-17 (VisibilityToggle)                                │
                                                                       │
T014-14 + T014-17 ──▶ T014-18 (LayoutConfigPanel)                     │
T014-17 ──▶ T014-19 (FieldConfigTable)                                │
T014-17 ──▶ T014-20 (ColumnConfigTable)                               │
(none) ──▶ T014-21 (SectionOrderList)                                 │
T014-15 ──▶ T014-22 (RolePreviewPanel)                                │
T014-18 ──▶ T014-23 (RequiredFieldWarningDialog + route)              │
                                                                       │
T014-07 ──▶ T014-24 (unit: resolution)                                │
T014-06 ──▶ T014-25 (unit: validation)                                │
T014-10/11 ──▶ T014-26 (integration: routes)                          │
T014-12 ──▶ T014-27 (integration: readonly)                           │
T014-15/16/17 ──▶ T014-28 (unit: frontend)                            │
T014-23 ──▶ T014-29 (E2E)                                             │
T014-02 ──▶ T014-30 (docs: plugin)                                    │
T014-12 ──▶ T014-31 (docs: security)                                  │
T014-10/18 ──▶ T014-32 (feature flag)                                 │
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Component                              | Test Focus                                                          | Target Coverage |
| -------------------------------------- | ------------------------------------------------------------------- | --------------- |
| `LayoutConfigService.resolveForUser()` | Role resolution, most permissive, fail-open, edge cases             | 100%            |
| `LayoutConfigValidationService`        | Field validation, required field detection, size limits, stale refs | 100%            |
| Zod schemas                            | Valid/invalid payloads, boundary values                             | 95%             |
| `<LayoutAwareForm>`                    | Rendering states, field ordering, read-only, empty state            | 85%             |
| `<LayoutAwareTable>`                   | Column filtering, empty state, fail-open                            | 85%             |
| `VisibilityToggle`                     | State cycling, ARIA, keyboard                                       | 95%             |
| `useResolvedLayout`                    | Cache behavior, error handling, staleTime                           | 90%             |

### 11.2 Integration Tests

| Scenario                                    | Dependencies              |
| ------------------------------------------- | ------------------------- |
| All 10 API endpoints (CRUD + resolve)       | PostgreSQL, Redis         |
| RBAC enforcement (TENANT_ADMIN, WS ADMIN+)  | Keycloak                  |
| Tenant isolation (cross-tenant blocked)     | PostgreSQL (multi-schema) |
| Optimistic concurrency (409 conflict)       | PostgreSQL                |
| Redis cache invalidation on write           | Redis                     |
| Read-only field enforcement middleware      | PostgreSQL, layout config |
| Plugin uninstall → soft-delete cascade      | PostgreSQL                |
| Plugin register with formSchemas validation | PostgreSQL                |

### 11.3 E2E Tests

| Scenario                                                      | Coverage               |
| ------------------------------------------------------------- | ---------------------- |
| Admin configures layout → end user sees changes (Journey 1+2) | FR-012, FR-013, FR-025 |
| Required field warning dialog flow (Journey 4)                | FR-011                 |
| Revert to previous version (US-010)                           | FR-019                 |
| Workspace-level override (US-006)                             | FR-009                 |

---

## 12. Requirement Traceability

### Functional Requirements

| Requirement | Plan Section | Implementation Path                                              | Task Ref                  |
| ----------- | ------------ | ---------------------------------------------------------------- | ------------------------- |
| FR-001      | §3.2, §4.13  | `packages/sdk/src/types/manifest.ts`, plugin register validation | T014-02, T014-13          |
| FR-002      | §3.1         | `layout_configs` table in tenant schema                          | T014-03                   |
| FR-003      | §3.5, §5.6   | `FieldOverride` type, `FieldConfigTable`                         | T014-01, T014-04, T014-19 |
| FR-004      | §3.5, §5.8   | `SectionOverride` type, `SectionOrderList`                       | T014-01, T014-21          |
| FR-005      | §3.5, §5.7   | `ColumnOverride` type, `ColumnConfigTable`                       | T014-01, T014-20          |
| FR-006      | §3.5         | `RoleKey` type definition                                        | T014-01                   |
| FR-007      | §4.10, §5.1  | `resolveForUser()` most permissive logic                         | T014-07, T014-24          |
| FR-008      | §4.10, §5.1  | Visibility cascade: role > global > manifest                     | T014-07, T014-24          |
| FR-009      | §4.7, §5.1   | Workspace override (full replacement)                            | T014-07, T014-11          |
| FR-010      | §5.12        | `<LayoutAwareForm>` default value injection                      | T014-15                   |
| FR-011      | §4.3, §5.11  | `RequiredFieldWarningDialog`, `acknowledgeWarnings`              | T014-06, T014-23          |
| FR-012      | §5.5         | `LayoutConfigPanel` admin interface                              | T014-18                   |
| FR-013      | §5.6         | `FieldConfigTable` up/down arrows                                | T014-19                   |
| FR-014      | §5.10        | `RolePreviewPanel`                                               | T014-22                   |
| FR-015      | §4.3, §4.7   | PUT endpoints (tenant + workspace)                               | T014-10, T014-11          |
| FR-016      | §4.2, §4.6   | GET endpoints (tenant + workspace)                               | T014-10, T014-11          |
| FR-017      | §5.14        | `useResolvedLayout` with `staleTime: 60_000`                     | T014-14                   |
| FR-018      | §5.1         | `saveConfig()` stores `previous_version`                         | T014-05                   |
| FR-019      | §4.4, §5.1   | `revertConfig()` swaps current/previous                          | T014-05                   |
| FR-020      | §5.2         | `validateAgainstManifest()`                                      | T014-06                   |
| FR-021      | §5.15        | `layout-readonly-guard.ts` middleware                            | T014-12                   |
| FR-022      | §5.1         | Audit log on config changes (ADR-025)                            | T014-05                   |
| FR-023      | §4.1, §5.1   | `listConfigurableForms()`, GET /forms endpoint                   | T014-05, T014-10          |
| FR-024      | §5.1         | `softDeleteByPlugin()` / `restoreByPlugin()`                     | T014-09                   |
| FR-025      | §5.12        | `<LayoutAwareForm>` wrapper                                      | T014-15                   |
| FR-026      | §5.13        | `<LayoutAwareTable>` wrapper                                     | T014-16                   |

### Non-Functional Requirements

| Requirement | Plan Section               | Implementation Path                                                | Task Ref                                    |
| ----------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| NFR-001     | §4.10, §9                  | Resolution < 50ms P95 via Redis cache + in-memory role computation | T014-07, T014-08, T014-24                   |
| NFR-002     | §5.14                      | `useResolvedLayout` hook adds < 100ms                              | T014-14                                     |
| NFR-003     | §4.3                       | PUT < 200ms P95                                                    | T014-10                                     |
| NFR-004     | §5.2                       | 200-field manifest validation < 10ms                               | T014-06, T014-25                            |
| NFR-005     | §3.1                       | Tenant schema isolation + integration test                         | T014-03, T014-26                            |
| NFR-006     | §5.15                      | Server-side read-only stripping                                    | T014-12, T014-27                            |
| NFR-007     | §4.1–§4.9                  | RBAC on all admin endpoints                                        | T014-10, T014-11, T014-26                   |
| NFR-008     | §4.10, §5.12, §5.13, §5.14 | Fail-open at every layer                                           | T014-07, T014-08, T014-14, T014-15, T014-16 |
| NFR-009     | §3.1                       | 25,000 configs per tenant supported by JSONB + indexes             | T014-03                                     |
| NFR-010     | §5.6, §5.9                 | WCAG 2.1 AA: keyboard navigation, ARIA, contrast                   | T014-17, T014-19, T014-28                   |
| NFR-011     | §5.1                       | Redis cache TTL 300s ± 30s jitter, key pattern                     | T014-08                                     |
| NFR-012     | §5.2                       | Manifest validation on save, stale detection                       | T014-06, T014-19, T014-25                   |

### User Stories

| Story  | Plan Section | Task Ref                  |
| ------ | ------------ | ------------------------- |
| US-001 | §5.6, §5.12  | T014-15, T014-19          |
| US-002 | §4.10, §5.12 | T014-07, T014-15, T014-24 |
| US-003 | §5.15        | T014-12, T014-15, T014-27 |
| US-004 | §5.8         | T014-21                   |
| US-005 | §5.7, §5.13  | T014-16, T014-20          |
| US-006 | §4.7, §5.1   | T014-07, T014-11          |
| US-007 | §5.2, §5.11  | T014-06, T014-23          |
| US-008 | §5.5         | T014-18, T014-19, T014-22 |
| US-009 | §5.14        | T014-14, T014-15          |
| US-010 | §4.4, §5.1   | T014-05                   |

### Design Spec Components

| Component                  | Plan Section | Task Ref |
| -------------------------- | ------------ | -------- |
| LayoutConfigPanel          | §5.5         | T014-18  |
| FieldConfigTable           | §5.6         | T014-19  |
| ColumnConfigTable          | §5.7         | T014-20  |
| SectionOrderList           | §5.8         | T014-21  |
| VisibilityToggle           | §5.9         | T014-17  |
| RolePreviewPanel           | §5.10        | T014-22  |
| RequiredFieldWarningDialog | §5.11        | T014-23  |
| LayoutAwareForm            | §5.12        | T014-15  |
| LayoutAwareTable           | §5.13        | T014-16  |
| useResolvedLayout          | §5.14        | T014-14  |

### Edge Cases

| Edge Case                         | Plan Section                           | Task Ref                  |
| --------------------------------- | -------------------------------------- | ------------------------- |
| #1 Plugin manifest updated        | §5.2 (`detectStaleReferences`)         | T014-06, T014-19, T014-24 |
| #2 User has no team membership    | §4.10 (resolution algorithm)           | T014-07, T014-24          |
| #3 Admin hides ALL fields         | §5.12 (empty state)                    | T014-15, T014-28          |
| #4 Orphaned workspace override    | §5.1 (`listConfigurableForms`)         | T014-05                   |
| #5 Concurrent edit conflict       | §4.3 (ETag/If-Match)                   | T014-05, T014-10, T014-26 |
| #6 Config JSONB > 256 KB          | §5.2 (`validateSize`)                  | T014-06, T014-25          |
| #7 Redis cache unavailable        | §5.1, §4.10 (fail-open)                | T014-08, T014-24          |
| #8 Plugin uninstalled mid-session | §5.1 (`softDeleteByPlugin`)            | T014-09                   |
| #9 Role with no current users     | No validation needed (accepted)        | T014-05                   |
| #10 Workspace admin lacks role    | §4.7 (403 INSUFFICIENT_WORKSPACE_ROLE) | T014-11, T014-26          |

---

## 13. Constitution Compliance

| Article | Status       | Notes                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅ COMPLIANT | **1.2.1 Security First**: Server-side read-only enforcement (FR-021, NFR-006). **1.2.2 Tenant Isolation**: `layout_configs` in tenant schema (ADR-002). **1.2.3 API-First**: All functionality via versioned REST APIs. **1.2.5 TDD**: Testing phase with ≥80% target. **1.2.6 Zero-Downtime**: Feature flag gating (T014-32). **1.3 UX**: WCAG 2.1 AA compliance for admin panel and layout-aware components. |
| Art. 2  | ✅ COMPLIANT | No new npm dependencies. Uses existing React, Fastify, Prisma, Zod, Redis, ioredis stack. Plugin manifest extension is JSONB, not a new library.                                                                                                                                                                                                                                                               |
| Art. 3  | ✅ COMPLIANT | **3.2 Layered Architecture**: Routes → LayoutConfigService → Prisma. **3.3 Parameterized Queries**: All DB via Prisma. **3.4 API Standards**: RESTful endpoints under `/api/v1`, standard error format, pagination not needed (single-config responses).                                                                                                                                                       |
| Art. 4  | ✅ COMPLIANT | **4.1 Coverage**: Target ≥80% overall, 100% for security-critical resolution logic. **4.2 Review**: Plan includes test tasks. **4.3 Performance**: NFR-001 < 50ms P95 for resolution, NFR-003 < 200ms for save.                                                                                                                                                                                                |
| Art. 5  | ✅ COMPLIANT | **5.1 Keycloak Auth**: All endpoints require Bearer auth; admin endpoints require TENANT_ADMIN. **5.2 Tenant Isolation**: Layout configs in tenant schema; cross-tenant access blocked. **5.3 Zod Validation**: All input validated with Zod schemas (T014-04).                                                                                                                                                |
| Art. 6  | ✅ COMPLIANT | **6.1 Error Classification**: Operational errors (validation, not found) return user-friendly messages. **6.2 Error Format**: Standard `{ error: { code, message, details } }`. **6.3 Logging**: Layout changes logged with tenantId, userId via Pino.                                                                                                                                                         |
| Art. 7  | ✅ COMPLIANT | **7.1 Files**: kebab-case (`layout-config.service.ts`). **7.1 Classes**: PascalCase (`LayoutConfigService`). **7.2 DB**: snake_case (`layout_configs`). **7.3 API**: `/api/v1/layout-configs/:formId`.                                                                                                                                                                                                         |
| Art. 8  | ✅ COMPLIANT | **8.1 Test Types**: Unit (T014-24, 25, 28), Integration (T014-26, 27), E2E (T014-29). **8.2 Quality**: Deterministic, independent, fast, descriptive names, AAA pattern. **8.3 Data**: Factories, no hardcoded IDs, test cleanup.                                                                                                                                                                              |
| Art. 9  | ✅ COMPLIANT | **9.1 Feature Flag**: `layout_engine_enabled` per-tenant (T014-32). **9.1 Backward-compatible migrations**: Additive only. **9.2 Monitoring**: Uses existing Pino structured logging with requestId, tenantId, userId.                                                                                                                                                                                         |

---

## 14. Dependencies

### 14.1 New Dependencies

None. All functionality built with the approved stack (Art. 2.1).

### 14.2 Internal Dependencies

| Module                    | Usage                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@plexica/database`       | Prisma client for `layout_configs` table                                                                                               |
| `@plexica/types`          | Shared TypeScript types (extended with layout config types)                                                                            |
| `@plexica/sdk`            | Manifest types (extended with `formSchemas`)                                                                                           |
| `@plexica/ui`             | Reused components: `DataTable`, `Dialog`, `Select`, `Button`, `Badge`, `Skeleton`, `EmptyState`, `Toast`, `Card`, `Tooltip`, `Spinner` |
| `PluginService`           | Fetch manifest `formSchemas`, plugin lifecycle hooks                                                                                   |
| `PermissionService`       | ABAC engine for role resolution (ADR-017)                                                                                              |
| `AuditLogService`         | Record layout config changes (ADR-025)                                                                                                 |
| `TenantContextMiddleware` | Tenant isolation, schema routing                                                                                                       |
| `AuthMiddleware`          | JWT validation, role extraction                                                                                                        |

### 14.3 External Feature Dependencies

| Feature                          | Status        | Dependency Type | Impact if Delayed                                                                                                                                                                                 |
| -------------------------------- | ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec 010 Phase 3 (Widget System) | IN PROGRESS   | Soft            | `<LayoutAwareForm>` works independently for shell-rendered forms. Widget system adds plugin-contributed widgets — layout engine would need to wrap those too, but this can be done as a follow-up |
| Spec 013 (Extension Points)      | PLAN COMPLETE | None            | Layout engine does not depend on extension points. The extension registry is a separate concern. No blocker                                                                                       |
| ABAC Engine (ADR-017)            | IMPLEMENTED   | Hard            | Role resolution depends on this. Already available                                                                                                                                                |
| Team Member Roles (ADR-024)      | IMPLEMENTED   | Hard            | Effective role computation depends on this. Already available                                                                                                                                     |
| Audit Log Service (ADR-025)      | IMPLEMENTED   | Hard            | Config change logging depends on this. Already available                                                                                                                                          |

---

## 15. Validation Summary

| Metric                             | Value                                          |
| ---------------------------------- | ---------------------------------------------- |
| Total tasks                        | 32 (T014-01 through T014-32)                   |
| Total story points                 | 119                                            |
| Functional requirements traced     | 26/26 (FR-001 through FR-026) ✅               |
| Non-functional requirements traced | 12/12 (NFR-001 through NFR-012) ✅             |
| User stories traced                | 10/10 (US-001 through US-010) ✅               |
| Edge cases traced                  | 10/10 ✅                                       |
| Design spec components traced      | 10/10 ✅                                       |
| ADRs referenced                    | 8 (ADR-002, 004, 011, 014, 017, 024, 025, 031) |
| New ADRs required                  | 0                                              |
| Estimated duration                 | ~10 weeks (4 sprints)                          |
| Constitution compliance            | 9/9 articles ✅                                |

---

## Cross-References

| Document      | Path                                                           |
| ------------- | -------------------------------------------------------------- |
| Spec          | `.forge/specs/014-frontend-layout-engine/spec.md`              |
| Design Spec   | `.forge/specs/014-frontend-layout-engine/design-spec.md`       |
| User Journeys | `.forge/specs/014-frontend-layout-engine/user-journey.md`      |
| Architecture  | `.forge/architecture/architecture.md`                          |
| Constitution  | `.forge/constitution.md`                                       |
| Tasks         | <!-- Created by /forge-tasks -->                               |
| ADR-002       | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       |
| ADR-004       | `.forge/knowledge/adr/adr-004-module-federation.md`            |
| ADR-011       | `.forge/knowledge/adr/adr-011-vite-module-federation.md`       |
| ADR-014       | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     |
| ADR-017       | `.forge/knowledge/adr/adr-017-abac-engine.md`                  |
| ADR-024       | `.forge/knowledge/adr/adr-024-team-member-role-vs-keycloak.md` |
| ADR-025       | `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`       |
| ADR-031       | `.forge/knowledge/adr/adr-031-extension-tables-core-schema.md` |
| Spec 010      | `.forge/specs/010-frontend-production-readiness/`              |
| Spec 013 Plan | `.forge/specs/013-extension-points/plan.md`                    |
