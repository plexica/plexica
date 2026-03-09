# Plan: 013 - Extension Points

> Technical implementation plan for cross-plugin UI composition, data model
> extension, and extension point discovery. Covers database schema, backend
> services, Plugin SDK enhancements, frontend components, and testing strategy
> across 5 phases with 35 tasks (~70 story points).
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                       |
| ------ | ------------------------------------------- |
| Status | Draft                                       |
| Author | forge-architect                             |
| Date   | 2026-03-08                                  |
| Track  | Feature                                     |
| Spec   | `.forge/specs/013-extension-points/spec.md` |

---

## 1. Overview

This plan implements the Extension Points system defined in Spec 013. The
system enables cross-plugin UI composition (slots and contributions), data
model enrichment (sidecar extensions), and centralized registry discovery.

### Architecture Data Flow

```
Plugin Manifest (install)
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  ExtensionRegistryService (core-api)                │
│  ┌──────────────┐  ┌────────────────────┐           │
│  │ ManifestSync │→ │ ExtensionRegistry  │           │
│  │ (on activate │  │ Repository         │           │
│  │  /deactivate)│  │ (5 core tables)    │           │
│  └──────────────┘  └────────┬───────────┘           │
│                             │                       │
│  ┌──────────────────────────┼──────────────────┐    │
│  │ REST API (/api/v1/extension-registry/*)     │    │
│  │  - GET /slots                               │    │
│  │  - GET /contributions?slotId&workspaceId    │    │
│  │  - GET /entities                            │    │
│  │  - GET /entities/:p/:e/:id/extensions       │    │
│  │  - GET /slots/:p/:s/dependents              │    │
│  │  - PATCH /workspaces/:w/ext-visibility/:c   │    │
│  └──────────────────────────┬──────────────────┘    │
│                             │                       │
│  ┌──────────────────────────┼──────────────────┐    │
│  │ Redis Cache (TTL 120s ± 15s jitter)         │    │
│  │  - ext:slots:{tenantId}                     │    │
│  │  - ext:contributions:{tenantId}:{slotKey}   │    │
│  │  - ext:entities:{tenantId}                  │    │
│  └──────────────────────────┼──────────────────┘    │
└─────────────────────────────┼───────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────┐   ┌──────────────┐  ┌──────────────┐
      │ apps/web │   │ plugin-crm   │  │ plugin-hr    │
      │          │   │ (slot owner) │  │ (contributor) │
      │ <Extension│   │              │  │              │
      │  Slot>   │◄──┤ Declares     │  │ Contributes  │
      │  hook    │   │ slots in     │  │ to CRM slots │
      │  cache   │   │ manifest     │  │ via manifest │
      └──────────┘   └──────────────┘  └──────────────┘
```

### Key Architectural Decisions

- **ADR-031**: Extension tables in core shared schema (bounded exception to ADR-002)
- **ADR-002**: Schema-per-tenant baseline (extension tables are an exception)
- **ADR-014**: Workspace plugin scoping — cascade-disable semantics inherited
- **ADR-018**: Plugin lifecycle — activation/deactivation triggers registry sync
- **ADR-004/011**: Module Federation — contribution components loaded remotely

---

## 2. Data Model

### 2.1 New Tables

All tables placed in core shared schema per ADR-031. All accessed exclusively
through `ExtensionRegistryRepository` (ADR-031 Safeguard 1).

#### extension_slots

| Column                | Type           | Constraints                                       | Notes                                  |
| --------------------- | -------------- | ------------------------------------------------- | -------------------------------------- |
| `id`                  | `UUID`         | PK, DEFAULT gen_random_uuid()                     | Unique slot record ID                  |
| `plugin_id`           | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Declaring plugin                       |
| `slot_id`             | `VARCHAR(128)` | NOT NULL                                          | Slot identifier (unique within plugin) |
| `type`                | `VARCHAR(32)`  | NOT NULL, CHECK IN (action, panel, form, toolbar) | Contribution type accepted             |
| `context_schema`      | `JSONB`        | NOT NULL, DEFAULT '{}'                            | JSON Schema for context props          |
| `required_permission` | `VARCHAR(255)` | NOT NULL                                          | Permission required to contribute      |
| `label`               | `VARCHAR(255)` | NULL                                              | Human-readable slot label              |
| `description`         | `TEXT`         | NULL                                              | Slot description                       |
| `is_active`           | `BOOLEAN`      | NOT NULL, DEFAULT true                            | Soft-delete on plugin deactivation     |
| `created_at`          | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                        |
| `updated_at`          | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                        |

#### extension_contributions

| Column                   | Type           | Constraints                                       | Notes                                                       |
| ------------------------ | -------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `id`                     | `UUID`         | PK, DEFAULT gen_random_uuid()                     | Unique contribution record ID                               |
| `contributing_plugin_id` | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Contributing plugin                                         |
| `target_plugin_id`       | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Slot-owning plugin                                          |
| `target_slot_id`         | `VARCHAR(128)` | NOT NULL                                          | Target slot                                                 |
| `type`                   | `VARCHAR(32)`  | NOT NULL, CHECK IN (action, panel, form, toolbar) | Contribution type                                           |
| `widget_name`            | `VARCHAR(128)` | NOT NULL                                          | Module Federation widget component name                     |
| `label`                  | `VARCHAR(255)` | NOT NULL                                          | Human-readable label                                        |
| `description`            | `TEXT`         | NULL                                              |                                                             |
| `icon`                   | `VARCHAR(64)`  | NULL                                              | Lucide icon name                                            |
| `preview_url`            | `VARCHAR(512)` | NULL                                              | Static preview image (FR-033)                               |
| `priority`               | `INTEGER`      | NOT NULL, DEFAULT 100, CHECK (0..999)             | Render order (lower = first)                                |
| `is_active`              | `BOOLEAN`      | NOT NULL, DEFAULT true                            | Soft-delete on plugin deactivation                          |
| `validation_status`      | `VARCHAR(32)`  | NOT NULL, DEFAULT 'pending'                       | pending/valid/target_not_found/type_mismatch/schema_changed |
| `created_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                             |
| `updated_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                             |

#### workspace_extension_visibility

| Column            | Type          | Constraints                                                 | Notes                  |
| ----------------- | ------------- | ----------------------------------------------------------- | ---------------------- |
| `workspace_id`    | `UUID`        | FK → workspaces.id ON DELETE CASCADE, NOT NULL              | Workspace              |
| `contribution_id` | `UUID`        | FK → extension_contributions.id ON DELETE CASCADE, NOT NULL | Contribution           |
| `is_visible`      | `BOOLEAN`     | NOT NULL, DEFAULT true                                      | Workspace admin toggle |
| `updated_at`      | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW()                                     |                        |

#### extensible_entities

| Column         | Type           | Constraints                   | Notes                              |
| -------------- | -------------- | ----------------------------- | ---------------------------------- |
| `id`           | `UUID`         | PK, DEFAULT gen_random_uuid() | Unique entity record ID            |
| `plugin_id`    | `VARCHAR`      | FK → plugins.id, NOT NULL     | Declaring plugin                   |
| `entity_type`  | `VARCHAR(128)` | NOT NULL                      | Entity type name (e.g. `contacts`) |
| `field_schema` | `JSONB`        | NOT NULL, DEFAULT '{}'        | JSON Schema for base fields        |
| `is_active`    | `BOOLEAN`      | NOT NULL, DEFAULT true        | Soft-delete on deactivation        |
| `created_at`   | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                    |
| `updated_at`   | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                    |

#### data_extensions

| Column                   | Type           | Constraints                   | Notes                       |
| ------------------------ | -------------- | ----------------------------- | --------------------------- |
| `id`                     | `UUID`         | PK, DEFAULT gen_random_uuid() | Unique extension record ID  |
| `contributing_plugin_id` | `VARCHAR`      | FK → plugins.id, NOT NULL     | Contributing plugin         |
| `target_plugin_id`       | `VARCHAR`      | FK → plugins.id, NOT NULL     | Entity-owning plugin        |
| `target_entity_type`     | `VARCHAR(128)` | NOT NULL                      | Target entity type          |
| `field_schema`           | `JSONB`        | NOT NULL                      | Sidecar fields JSON Schema  |
| `resolver_endpoint`      | `VARCHAR(512)` | NOT NULL                      | Plugin sidecar data URL     |
| `is_active`              | `BOOLEAN`      | NOT NULL, DEFAULT true        | Soft-delete on deactivation |
| `created_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                             |
| `updated_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                             |

### 2.2 Modified Tables

#### plugins

| Column | Change                                                                                      | Before | After |
| ------ | ------------------------------------------------------------------------------------------- | ------ | ----- |
| N/A    | No schema changes to plugins table. Extension metadata stored in new tables, linked via FK. | —      | —     |

The `PluginManifest` TypeScript type is extended (FR-027) but the `manifest`
JSONB column in the `plugins` table already stores the full manifest — no
migration needed for this column.

### 2.3 Indexes

| Table                            | Index Name                                  | Columns                                                              | Type    |
| -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | ------- |
| `extension_slots`                | `uq_extension_slots_plugin_slot`            | (`plugin_id`, `slot_id`)                                             | UNIQUE  |
| `extension_slots`                | `idx_extension_slots_active_type`           | (`is_active`, `type`)                                                | B-TREE  |
| `extension_contributions`        | `uq_extension_contributions_plugin_slot`    | (`contributing_plugin_id`, `target_plugin_id`, `target_slot_id`)     | UNIQUE  |
| `extension_contributions`        | `idx_extension_contributions_target_active` | (`target_plugin_id`, `target_slot_id`, `is_active`)                  | B-TREE  |
| `extension_contributions`        | `idx_extension_contributions_plugin_active` | (`contributing_plugin_id`, `is_active`)                              | B-TREE  |
| `workspace_extension_visibility` | PK                                          | (`workspace_id`, `contribution_id`)                                  | PRIMARY |
| `workspace_extension_visibility` | `idx_workspace_ext_vis_contribution`        | (`contribution_id`)                                                  | B-TREE  |
| `extensible_entities`            | `uq_extensible_entities_plugin_type`        | (`plugin_id`, `entity_type`)                                         | UNIQUE  |
| `extensible_entities`            | `idx_extensible_entities_active`            | (`is_active`)                                                        | B-TREE  |
| `data_extensions`                | `uq_data_extensions_plugin_entity`          | (`contributing_plugin_id`, `target_plugin_id`, `target_entity_type`) | UNIQUE  |
| `data_extensions`                | `idx_data_extensions_target_active`         | (`target_plugin_id`, `target_entity_type`, `is_active`)              | B-TREE  |

### 2.4 Migrations

1. **Migration 1** (`YYYYMMDDHHMMSS_create_extension_tables`): Create all 5
   tables with indexes, constraints, and CHECK constraints. Additive only —
   no existing tables modified. Backward compatible (Art. 9.1.3).

2. **Migration 2** (`YYYYMMDDHHMMSS_extension_tables_rls`): Enable RLS on all
   5 tables and create tenant isolation + Super Admin bypass policies per
   ADR-031 Safeguard 4.

Both migrations are forward-only and do not modify existing data.

---

## 3. API Endpoints

### 3.1 GET `/api/v1/extension-registry/slots`

- **Description**: List all active extension slots. Filterable by plugin and type. (FR-019)
- **Auth**: Required (tenant context)
- **Request**: Query params: `?pluginId=string&type=action|panel|form|toolbar`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "pluginId": "crm",
        "slotId": "contact-detail-actions",
        "type": "action",
        "contextSchema": { "contactId": "string", "tenantId": "string" },
        "requiredPermission": "plugin.crm.extend.contact-detail",
        "label": "Contact Actions",
        "description": "Action buttons on contact detail view"
      }
    ],
    "total": 1
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | ------------------------ |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |
  | 403 | `FORBIDDEN` | Tenant context invalid |

### 3.2 GET `/api/v1/extension-registry/slots/:pluginId`

- **Description**: List slots declared by a specific plugin. (FR-019)
- **Auth**: Required
- **Response (200)**: Same shape as §3.1 filtered by `pluginId`.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | ------------------------ |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |

### 3.3 GET `/api/v1/extension-registry/contributions`

- **Description**: List active contributions. Filterable by `slotId`, `workspaceId`, `pluginId`, `type`. (FR-011, FR-021)
- **Auth**: Required
- **Request**: Query params: `?slotId=string&workspaceId=uuid&pluginId=string&type=string`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "contributingPluginId": "billing",
        "targetPluginId": "crm",
        "targetSlotId": "contact-detail-actions",
        "type": "action",
        "widgetName": "CreateInvoiceButton",
        "label": "Create Invoice",
        "description": "Create invoice for this contact",
        "icon": "receipt",
        "previewUrl": null,
        "priority": 10,
        "validationStatus": "valid",
        "isVisible": true
      }
    ],
    "total": 1
  }
  ```
  When `workspaceId` is provided, `isVisible` reflects the workspace-level
  visibility. Contributions from disabled plugins are excluded.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | ------------------------ |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |

### 3.4 GET `/api/v1/extension-registry/entities`

- **Description**: List all extensible entity types from active plugins. (FR-020)
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "pluginId": "crm",
        "entityType": "contacts",
        "fieldSchema": { "type": "object", "properties": { "name": { "type": "string" } } }
      }
    ],
    "total": 1
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | ------------------------ |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |

### 3.5 GET `/api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions`

- **Description**: Aggregate sidecar data from all contributing plugins for an entity instance. (FR-015, FR-017, FR-018)
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "entityId": "uuid",
    "entityType": "contacts",
    "extensions": [
      {
        "pluginId": "hr",
        "fields": { "employeeId": "EMP-1234", "department": "Engineering" },
        "fieldSchema": { "type": "object", "properties": { "employeeId": { "type": "string" } } }
      }
    ],
    "warnings": [
      {
        "pluginId": "analytics",
        "error": "TIMEOUT",
        "message": "Sidecar data fetch timed out after 3000ms"
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------- |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |
  | 404 | `ENTITY_TYPE_NOT_FOUND` | Entity type not registered |

### 3.6 PATCH `/api/v1/workspaces/:workspaceId/extension-visibility/:contributionId`

- **Description**: Toggle contribution visibility for a workspace. (FR-022)
- **Auth**: Required (Workspace Admin role)
- **Request**:
  ```json
  { "isVisible": false }
  ```
- **Response (200)**:
  ```json
  {
    "workspaceId": "uuid",
    "contributionId": "uuid",
    "isVisible": false,
    "updatedAt": "2026-03-08T12:00:00Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------- | ------------------------------ |
  | 400 | `INVALID_REQUEST` | Missing or invalid body |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |
  | 403 | `WORKSPACE_VISIBILITY_DENIED` | Not a workspace admin |
  | 404 | `CONTRIBUTION_NOT_FOUND` | Contribution ID does not exist |

### 3.7 GET `/api/v1/extension-registry/slots/:pluginId/:slotId/dependents`

- **Description**: List plugins contributing to a specific slot with count. (FR-031)
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "pluginId": "crm",
    "slotId": "contact-detail-actions",
    "dependentCount": 3,
    "dependents": [
      {
        "pluginId": "billing",
        "contributionId": "uuid",
        "label": "Create Invoice",
        "priority": 10
      },
      {
        "pluginId": "analytics",
        "contributionId": "uuid",
        "label": "Engagement Score",
        "priority": 20
      },
      { "pluginId": "hr", "contributionId": "uuid", "label": "Employee Card", "priority": 30 }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ---------------- | ----------------------- |
  | 401 | `UNAUTHORIZED` | Missing/invalid token |
  | 404 | `SLOT_NOT_FOUND` | Slot does not exist |

### 3.8 GET `/api/v1/extension-registry/slots/:pluginId` (subset of §3.1)

This is covered by §3.2 above.

### 3.9 GET `/api/v1/plugins/:pluginId/extensions/:entityType/:entityId` (Plugin Sidecar Endpoint)

- **Description**: Return sidecar data for a specific entity instance. Implemented by contributing plugins, not by core. (FR-016)
- **Auth**: Service-to-service (internal call from data extension resolution)
- **Response (200)**:
  ```json
  {
    "pluginId": "hr",
    "entityType": "contacts",
    "entityId": "uuid",
    "fields": { "employeeId": "EMP-1234", "department": "Engineering" }
  }
  ```
- **Timeout**: 3 seconds per-plugin (FR-018)

---

## 4. Component Design

### 4.1 ExtensionRegistryRepository

- **Purpose**: Single access path to all 5 extension tables (ADR-031 Safeguard 1)
- **Location**: `apps/core-api/src/modules/extension-registry/extension-registry.repository.ts`
- **Responsibilities**:
  - CRUD operations for slots, contributions, entities, data extensions, visibility
  - Enforce `tenantId` parameter on all tenant-scoped queries (ADR-031 Safeguard 2)
  - Contribution resolution with workspace visibility filtering
  - Cascade-disable on plugin deactivation
- **Dependencies**:
  - `PrismaClient` (via `@plexica/database`)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------------------- | ----------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
  | `upsertSlots` | `tenantId, pluginId, slots[]` | `ExtensionSlot[]` | Sync slot declarations from manifest (FR-002) |
  | `upsertContributions` | `tenantId, pluginId, contributions[]` | `ExtensionContribution[]` | Sync contribution declarations (FR-004) |
  | `upsertEntities` | `tenantId, pluginId, entities[]` | `ExtensibleEntity[]` | Sync entity declarations (FR-012) |
  | `upsertDataExtensions` | `tenantId, pluginId, extensions[]` | `DataExtension[]` | Sync data extension declarations (FR-013) |
  | `getSlots` | `tenantId, filters?` | `ExtensionSlot[]` | List active slots (FR-019) |
  | `getSlotsByPlugin` | `tenantId, pluginId` | `ExtensionSlot[]` | Slots for a specific plugin (FR-019) |
  | `getContributionsForSlot` | `tenantId, slotKey, workspaceId` | `ContributionWithVisibility[]` | Resolved contributions with visibility (FR-011)|
  | `getContributions` | `tenantId, filters?` | `ExtensionContribution[]` | List contributions with filters (FR-021) |
  | `getEntities` | `tenantId` | `ExtensibleEntity[]` | List extensible entities (FR-020) |
  | `getDataExtensions` | `tenantId, pluginId, entityType` | `DataExtension[]` | Data extensions for entity type (FR-015) |
  | `setVisibility` | `workspaceId, contributionId, isVisible` | `WorkspaceExtensionVisibility` | Toggle workspace visibility (FR-022) |
  | `getSlotDependents` | `tenantId, pluginId, slotId` | `Dependent[]` | Contributing plugins for slot (FR-031) |
  | `deactivateByPlugin` | `pluginId` | `void` | Soft-delete all records for plugin (FR-024) |
  | `reactivateByPlugin` | `pluginId` | `void` | Restore records on re-activation (FR-024) |
  | `validateContributions` | `tenantId, pluginId` | `ValidationResult[]` | Validate contributions at activation (FR-026) |

### 4.2 ExtensionRegistryService

- **Purpose**: Business logic layer — orchestrates manifest sync, contribution resolution, data extension aggregation, cache management
- **Location**: `apps/core-api/src/modules/extension-registry/extension-registry.service.ts`
- **Responsibilities**:
  - Manifest sync on plugin activation/deactivation (FR-002, FR-024)
  - Contribution resolution with permission checks (FR-006)
  - Data extension aggregation with parallel fetches and timeouts (FR-015, FR-018)
  - Redis cache management (NFR-004)
  - Contribution validation (FR-026)
  - Cache invalidation on activation/deactivation
  - Event emission for slot removal (Edge Case #14)
- **Dependencies**:
  - `ExtensionRegistryRepository`
  - `RedisService` (for caching, NFR-004)
  - `PluginService` (for activation status)
  - `AbacService` (for permission checks, ADR-017)
  - `EventBusService` (for slot removal events, ADR-005)
  - `HttpClient` (for sidecar data fetches)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------------------- | ---------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
  | `syncManifest` | `tenantId, pluginId, manifest` | `SyncResult` | Parse manifest, upsert all records (FR-002,012) |
  | `resolveContributions` | `tenantId, slotId, workspaceId, userRoles` | `ResolvedContribution[]` | Permission-checked, visibility-filtered (FR-004) |
  | `resolveDataExtensions` | `tenantId, pluginId, entityType, entityId` | `AggregatedExtensionData` | Parallel sidecar fetch with timeout (FR-015,018) |
  | `toggleVisibility` | `workspaceId, contributionId, isVisible, userRole` | `VisibilityResult` | Workspace admin toggle (FR-022) |
  | `onPluginActivated` | `tenantId, pluginId, manifest` | `void` | Sync + validate + cache invalidation (FR-002) |
  | `onPluginDeactivated` | `pluginId` | `void` | Soft-delete + cache invalidation (FR-024) |
  | `invalidateCache` | `tenantId, patterns` | `void` | Redis cache eviction (NFR-004) |
  | `getSlotDependents` | `tenantId, pluginId, slotId` | `DependentsResult` | Slot dependents query (FR-031) |

### 4.3 ExtensionRegistryController

- **Purpose**: REST API routes for the Extension Registry (8 endpoints)
- **Location**: `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts`
- **Responsibilities**:
  - Route registration with Fastify
  - Input validation via Zod schemas
  - Auth + tenant context enforcement
  - Workspace admin role check for visibility toggle
  - Feature flag check (`extension_points_enabled`)
- **Dependencies**:
  - `ExtensionRegistryService`
  - `authMiddleware`, `tenantMiddleware`
  - Zod schemas from `extension-registry.schema.ts`

### 4.4 ExtensionRegistrySchema (Zod Validators)

- **Purpose**: Input validation for all API endpoints (Art. 5.3)
- **Location**: `apps/core-api/src/modules/extension-registry/extension-registry.schema.ts`
- **Key Schemas**:
  | Schema | Fields | Used By |
  | ------------------------------ | ------------------------------------------ | ----------------- |
  | `GetSlotsQuerySchema` | `pluginId?`, `type?` | GET /slots |
  | `GetContributionsQuerySchema` | `slotId?`, `workspaceId?`, `pluginId?`, `type?` | GET /contributions |
  | `GetEntitiesQuerySchema` | (none) | GET /entities |
  | `EntityExtensionParamsSchema` | `pluginId`, `entityType`, `entityId` | GET /entities/... |
  | `VisibilityPatchSchema` | `isVisible: boolean` | PATCH visibility |
  | `SlotDependentsParamsSchema` | `pluginId`, `slotId` | GET /dependents |

### 4.5 ExtensionSlot (React Component)

- **Purpose**: Host component that queries registry and renders contributions (FR-007, FR-008, FR-009)
- **Location**: `apps/web/src/components/extensions/ExtensionSlot.tsx`
- **Responsibilities**:
  - Query TanStack Query cache for contributions (`staleTime ≥ 60s`, NFR-014)
  - Load contribution components via Module Federation (ADR-004/011)
  - Render in priority order with `<ExtensionContribution>` wrappers
  - Show `<ExtensionSlotSkeleton>` during loading (FR-008)
  - Wrap each contribution in React Error Boundary (NFR-008)
  - Pass `contextSchema` props + `PluginProps` to contributions (FR-009)
  - Switch to `<VirtualizedSlotContainer>` when count > threshold (Edge Case #12)
  - ARIA landmark `role="region"` with `aria-label` (NFR-011)
- **Props**:
  | Prop | Type | Required | Default |
  | ------------------------- | --------------------------- | -------- | ------- |
  | `slotId` | `string` | Yes | |
  | `pluginId` | `string` | Yes | |
  | `context` | `Record<string, unknown>` | Yes | |
  | `label` | `string` | No | slotId |
  | `virtualizationThreshold` | `number` | No | 20 |
  | `className` | `string` | No | |

### 4.6 ExtensionContribution (React Component)

- **Purpose**: Individual contribution wrapper with error boundary and Module Federation loading (US-007)
- **Location**: `apps/web/src/components/extensions/ExtensionContribution.tsx`
- **Responsibilities**:
  - `React.lazy` + `Suspense` for Module Federation component loading
  - Error boundary with `<ExtensionErrorFallback>`
  - 5-second load timeout (NFR-009)
  - Hover badge showing contributing plugin name
  - Structured Pino logging on error (NFR-012, ADR-021)

### 4.7 ExtensionSlotSkeleton (React Component)

- **Purpose**: Loading placeholder matching slot type dimensions (FR-008)
- **Location**: `apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx`
- **Variants**: `action-skeleton`, `panel-skeleton`, `form-skeleton`, `toolbar-skeleton`

### 4.8 ExtensionErrorFallback (React Component)

- **Purpose**: Error state for failed contributions (US-007, NFR-008)
- **Location**: `apps/web/src/components/extensions/ExtensionErrorFallback.tsx`
- **Variants**: `compact` (action/toolbar), `card` (panel/form)
- **A11y**: `role="alert"`, `aria-live="assertive"`

### 4.9 useExtensionSlot (React Hook)

- **Purpose**: Minimal-boilerplate hook for slot-declaring plugins (FR-028)
- **Location**: `apps/web/src/hooks/useExtensionSlot.ts`
- **Signature**: `useExtensionSlot(slotId: string, context: Record<string, unknown>)`
- **Returns**: `{ contributions, isLoading, error, slotProps }` — ready to spread on `<ExtensionSlot>`

### 4.10 ExtensionSettingsPanel (React Component)

- **Purpose**: Workspace admin page for toggling contribution visibility (FR-022, US-003)
- **Location**: `apps/web/src/routes/settings/extensions.tsx`
- **Structure**: Accordion groups by host plugin → slot → contribution rows with toggles
- **Dependencies**: `ContributionRow` component, TanStack Query

### 4.11 ContributionRow (React Component)

- **Purpose**: Individual contribution row in settings panel (FR-022, FR-033)
- **Location**: `apps/web/src/components/extensions/ContributionRow.tsx`
- **Variants**: `enabled`, `disabled-tenant`, `disabled-workspace`, `warning`

### 4.12 ExtensionPermissionsPage (React Component)

- **Purpose**: Tenant admin page for granting/revoking extension permissions (FR-006, US-006)
- **Location**: `apps/super-admin/src/routes/plugins/extension-permissions.tsx`
- **Structure**: Data table with plugin, target slot, permission, status, action columns

### 4.13 VirtualizedSlotContainer (React Component)

- **Purpose**: Virtual scrolling for slots with >20 contributions (Edge Case #12)
- **Location**: `apps/web/src/components/extensions/VirtualizedSlotContainer.tsx`
- **Behavior**: Show first 20 + "Show N more extensions" button → virtual scroll

### 4.14 SlotInspectorOverlay (React Component, dev-only)

- **Purpose**: Developer tool overlay for inspecting extension slots (FR-028, FR-031)
- **Location**: `apps/web/src/components/extensions/SlotInspectorOverlay.tsx`
- **Activation**: `Ctrl+Shift+E` in development mode only (tree-shaken in production)

### 4.15 DataExtensionClient (SDK)

- **Purpose**: SDK client for contributing plugins to serve sidecar data (FR-029)
- **Location**: `packages/sdk/src/data-extension-client.ts`
- **Responsibilities**:
  - Register sidecar data handler for entity types
  - Serve data via the sidecar endpoint convention
  - Validate response shape against declared `fieldSchema`

### 4.16 Extension Type Definitions

- **Purpose**: TypeScript interfaces for all extension types (FR-030)
- **Location**: `packages/types/src/extension.ts`
- **Exports**: `ExtensionSlotDeclaration`, `ContributionDeclaration`, `ExtensibleEntityDeclaration`, `DataExtensionDeclaration`, `ExtensionSlotType`, `ContributionValidationStatus`, `ResolvedContribution`, `AggregatedExtensionData`

---

## 5. File Map

### Files to Create

| Path                                                                                              | Purpose                             | Estimated Size |
| ------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------- |
| `packages/types/src/extension.ts`                                                                 | Extension type definitions (FR-030) | M              |
| `packages/database/prisma/migrations/YYYYMMDDHHMMSS_create_extension_tables/migration.sql`        | 5 new tables + indexes (FR-023)     | M              |
| `packages/database/prisma/migrations/YYYYMMDDHHMMSS_extension_tables_rls/migration.sql`           | RLS policies (ADR-031)              | S              |
| `apps/core-api/src/modules/extension-registry/extension-registry.repository.ts`                   | Repository (ADR-031 Safeguard 1)    | L              |
| `apps/core-api/src/modules/extension-registry/extension-registry.service.ts`                      | Business logic + caching            | L              |
| `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts`                   | REST API routes (8 endpoints)       | L              |
| `apps/core-api/src/modules/extension-registry/extension-registry.schema.ts`                       | Zod validators                      | M              |
| `apps/core-api/src/modules/extension-registry/index.ts`                                           | Module barrel export                | S              |
| `packages/sdk/src/data-extension-client.ts`                                                       | SDK DataExtensionClient (FR-029)    | M              |
| `apps/web/src/components/extensions/ExtensionSlot.tsx`                                            | Host slot component (FR-007)        | L              |
| `apps/web/src/components/extensions/ExtensionContribution.tsx`                                    | Contribution wrapper (US-007)       | M              |
| `apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx`                                    | Loading skeletons (FR-008)          | S              |
| `apps/web/src/components/extensions/ExtensionErrorFallback.tsx`                                   | Error boundary fallback             | S              |
| `apps/web/src/components/extensions/VirtualizedSlotContainer.tsx`                                 | Virtualized list (Edge Case #12)    | M              |
| `apps/web/src/components/extensions/ContributionRow.tsx`                                          | Settings contribution row (FR-022)  | M              |
| `apps/web/src/components/extensions/SlotInspectorOverlay.tsx`                                     | Dev inspector (FR-028)              | M              |
| `apps/web/src/components/extensions/index.ts`                                                     | Component barrel export             | S              |
| `apps/web/src/hooks/useExtensionSlot.ts`                                                          | Extension slot hook (FR-028)        | S              |
| `apps/web/src/routes/settings/extensions.tsx`                                                     | Workspace admin page (FR-022)       | L              |
| `apps/super-admin/src/routes/plugins/extension-permissions.tsx`                                   | Tenant admin page (FR-006)          | L              |
| `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.service.test.ts`          | Service unit tests                  | L              |
| `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.schema.test.ts`           | Schema validation tests             | M              |
| `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.routes.test.ts`    | API integration tests               | L              |
| `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.isolation.test.ts` | Tenant isolation tests (ADR-031)    | M              |
| `apps/core-api/src/__tests__/extension-registry/e2e/extension-registry.e2e.test.ts`               | E2E workflow tests                  | L              |

### Files to Modify

| Path                                                 | Section/Lines                         | Change Description                                                                                     | Estimated Effort |
| ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| `packages/types/src/plugin.ts`                       | `PluginManifest` interface            | Add `extensionSlots`, `contributions`, `extensibleEntities`, `dataExtensions` optional arrays (FR-027) | S                |
| `packages/types/src/index.ts`                        | Exports                               | Add `export * from './extension.js'`                                                                   | S                |
| `packages/sdk/src/types.ts`                          | SDK types                             | Add extension-related SDK type re-exports                                                              | S                |
| `packages/sdk/src/index.ts`                          | Exports                               | Export `DataExtensionClient`                                                                           | S                |
| `packages/sdk/src/plugin-base.ts`                    | `PlexicaPlugin` class                 | Add `dataExtensions` client initialization                                                             | S                |
| `packages/database/prisma/schema.prisma`             | Models section                        | Add 5 new Prisma models for extension tables                                                           | M                |
| `apps/core-api/src/modules/plugin/plugin.service.ts` | `activatePlugin` / `deactivatePlugin` | Call `ExtensionRegistryService.onPluginActivated` / `onPluginDeactivated`                              | M                |
| `apps/core-api/src/index.ts`                         | Route registration                    | Register extension-registry module routes                                                              | S                |
| `apps/web/src/routes/settings/index.tsx`             | Settings layout                       | Add "Extensions" tab linking to `/settings/extensions`                                                 | S                |

### Files to Delete

None.

### Files to Reference (Read-only)

| Path                                                           | Purpose                             |
| -------------------------------------------------------------- | ----------------------------------- |
| `.forge/constitution.md`                                       | Validate architectural decisions    |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       | Schema-per-tenant baseline          |
| `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     | Cascade-disable semantics           |
| `.forge/knowledge/adr/adr-017-abac-engine.md`                  | Permission evaluation               |
| `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`      | Lifecycle state machine             |
| `.forge/knowledge/adr/adr-025-audit-logs-core-schema.md`       | Bounded exception pattern           |
| `.forge/knowledge/adr/adr-031-extension-tables-core-schema.md` | Extension tables ADR                |
| `apps/core-api/src/modules/plugin/plugin.service.ts`           | Integration point for manifest sync |

---

## 6. Dependencies

### 6.1 New Dependencies

| Package | Version | Purpose                                                                                                                                 |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| None    | —       | Spec 013 uses only existing dependencies (React, Prisma, Redis, Module Federation, TanStack Query, Pino). No new npm packages required. |

**Note on virtualization**: The `<VirtualizedSlotContainer>` (Edge Case #12)
uses a lightweight custom virtualization implementation based on
`IntersectionObserver` + `overflow-y: auto`. If performance testing (T013-30)
reveals this is insufficient for >50 contributions, a dedicated library
(e.g., `react-window`) would require a new ADR per Art. 2.2. This is flagged
as Risk R-004 in §10.

### 6.2 Internal Dependencies

- `@plexica/database` — Prisma client and models
- `@plexica/types` — Extension type definitions (new exports)
- `@plexica/sdk` — DataExtensionClient (new export)
- `@plexica/ui` — Skeleton, Switch, Badge, Card, Button, Accordion, DataTable components
- `apps/core-api` modules: `plugin` (lifecycle hooks), `auth` (middleware), `workspace` (admin role)
- `packages/event-bus` — Event emission for slot removal (ADR-005)

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure (~20 story points)

**Objective**: Database schema, Prisma models, repository, types, and feature flag.

**Entry Criteria**: ADR-031 accepted, Spec 013 approved.
**Exit Criteria**: All 5 tables created, RLS active, repository passing unit tests, types exported.

**Tasks**:

#### T013-01: Extension Type Definitions (3 pts) — FR-027, FR-030

- **Create**: `packages/types/src/extension.ts`
  - `ExtensionSlotDeclaration`, `ContributionDeclaration`, `ExtensibleEntityDeclaration`, `DataExtensionDeclaration`
  - `ExtensionSlotType` enum: `'action' | 'panel' | 'form' | 'toolbar'`
  - `ContributionValidationStatus`: `'pending' | 'valid' | 'target_not_found' | 'type_mismatch' | 'schema_changed'`
  - `ResolvedContribution`, `AggregatedExtensionData`, `DependentsResult`
- **Modify**: `packages/types/src/plugin.ts` — add optional `extensionSlots`, `contributions`, `extensibleEntities`, `dataExtensions` to `PluginManifest`
- **Modify**: `packages/types/src/index.ts` — export new module

#### T013-02: Database Migration — Create Extension Tables (5 pts) — FR-023, ADR-031

- **Create**: `packages/database/prisma/migrations/YYYYMMDDHHMMSS_create_extension_tables/migration.sql`
  - 5 tables as specified in §2.1
  - All indexes as specified in §2.3
  - CHECK constraints for `type` and `priority`
  - All foreign keys with appropriate ON DELETE behavior
  - RLS policies per ADR-031 Safeguard 4
- **Modify**: `packages/database/prisma/schema.prisma` — add 5 Prisma models
- **Backward compatible**: Additive only, no existing tables modified (Art. 9.1.3)

#### T013-03: Extension Feature Flag (2 pts) — Art. 9.1.1

- **Modify**: Tenant settings / feature flags table — add `extension_points_enabled` flag, default `false`
- All extension-registry routes and the `<ExtensionSlot>` component check this flag
- When disabled: API returns 404, frontend renders nothing (zero overhead)

#### T013-04: Zod Validation Schemas (3 pts) — Art. 5.3, FR-019..FR-022, FR-031

- **Create**: `apps/core-api/src/modules/extension-registry/extension-registry.schema.ts`
  - All schemas from §4.4
  - Strict type validation for slot types, priority ranges, UUID formats
  - `VisibilityPatchSchema` for the PATCH endpoint

#### T013-05: Extension Registry Repository (5 pts) — ADR-031, FR-002, FR-004, FR-011, FR-012, FR-013, FR-022, FR-024

- **Create**: `apps/core-api/src/modules/extension-registry/extension-registry.repository.ts`
  - All methods from §4.1
  - ADR-031 Safeguard 1: class header comment referencing ADR-031
  - ADR-031 Safeguard 2: required `tenantId` on all tenant-scoped methods
  - ADR-031 Safeguard 3: explicit cross-tenant method naming
  - `deactivateByPlugin` / `reactivateByPlugin` for lifecycle sync (FR-024)
  - `validateContributions` for activation-time validation (FR-026)

#### T013-06: Extension Registry Service (5 pts) — FR-002, FR-006, FR-015, FR-018, FR-024, FR-026, NFR-004

- **Create**: `apps/core-api/src/modules/extension-registry/extension-registry.service.ts`
  - All methods from §4.2
  - Redis caching with jittered TTL (120s ± 15s) per NFR-004
  - Permission check integration with ABAC engine (ADR-017, FR-006)
  - Parallel sidecar data fetches with 3s timeout (FR-018)
  - Cache invalidation on activation/deactivation
  - Event emission for `extension.slot.removed` (Edge Case #14, ADR-005)

---

### Phase 2: Plugin SDK & API (~15 story points)

**Objective**: REST API endpoints, plugin lifecycle integration, SDK DataExtensionClient.

**Entry Criteria**: Phase 1 complete (repository, service, types, schema).
**Exit Criteria**: All 8 API endpoints functional, plugin activation syncs manifest, SDK client working.

**Tasks**:

#### T013-07: Extension Registry Controller — Slot & Contribution Routes (5 pts) — FR-019, FR-021, FR-031

- **Create**: `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts`
  - `GET /api/v1/extension-registry/slots` (FR-019)
  - `GET /api/v1/extension-registry/slots/:pluginId` (FR-019)
  - `GET /api/v1/extension-registry/contributions` with query filters (FR-011, FR-021)
  - `GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents` (FR-031)
  - Feature flag check on all routes
  - Auth + tenant context middleware
- **Create**: `apps/core-api/src/modules/extension-registry/index.ts` — module barrel

#### T013-08: Extension Registry Controller — Entity & Visibility Routes (5 pts) — FR-015, FR-020, FR-022

- **Modify**: `extension-registry.controller.ts` (add routes)
  - `GET /api/v1/extension-registry/entities` (FR-020)
  - `GET /api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions` (FR-015, FR-017, FR-018)
  - `PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId` (FR-022)
  - Workspace admin role validation for PATCH
  - Error codes per spec §8: `SLOT_NOT_FOUND`, `CONTRIBUTION_NOT_FOUND`, `ENTITY_TYPE_NOT_FOUND`, `EXTENSION_PERMISSION_DENIED`, `WORKSPACE_VISIBILITY_DENIED`

#### T013-09: Plugin Lifecycle Integration — Manifest Sync (3 pts) — FR-002, FR-024, FR-025

- **Modify**: `apps/core-api/src/modules/plugin/plugin.service.ts`
  - In `activatePlugin()`: call `extensionRegistryService.onPluginActivated(tenantId, pluginId, manifest)`
  - In `deactivatePlugin()`: call `extensionRegistryService.onPluginDeactivated(pluginId)`
  - In plugin force-uninstall: call `extensionRegistryService.onPluginDeactivated(pluginId)`
  - Cascade-disable semantics per ADR-014: disabling tenant plugin cascades `is_active = false` on all contributions from that plugin
- **Modify**: `apps/core-api/src/index.ts` — register extension-registry module routes

#### T013-10: SDK DataExtensionClient (3 pts) — FR-029

- **Create**: `packages/sdk/src/data-extension-client.ts`
  - `DataExtensionClient` class with `registerHandler(entityType, handler)` and `serve(req, res)` methods
  - Handler receives `(entityId, tenantId)` → returns sidecar fields
  - Response shape validation against declared `fieldSchema`
  - Tenant context validation (NFR-006)
- **Modify**: `packages/sdk/src/plugin-base.ts` — add `dataExtensions` client initialization
- **Modify**: `packages/sdk/src/index.ts` — export `DataExtensionClient`
- **Modify**: `packages/sdk/src/types.ts` — add extension SDK types

---

### Phase 3: Frontend Components (~18 story points)

**Objective**: All React components for extension slot rendering, workspace admin settings, and tenant admin permissions.

**Entry Criteria**: Phase 2 complete (API endpoints functional).
**Exit Criteria**: `<ExtensionSlot>` renders contributions, settings pages functional, a11y requirements met.

**Tasks**:

#### T013-11: ExtensionSlot Component (5 pts) — FR-007, FR-008, FR-009, NFR-008, NFR-011, NFR-014

- **Create**: `apps/web/src/components/extensions/ExtensionSlot.tsx`
  - TanStack Query integration with `staleTime ≥ 60s` (NFR-014)
  - Module Federation loading via `React.lazy` + `Suspense`
  - Priority ordering (FR-005)
  - `role="region"` + `aria-label` (NFR-011)
  - `aria-busy="true"` during loading
  - Delegates to `<VirtualizedSlotContainer>` when count > threshold

#### T013-12: ExtensionContribution Component (3 pts) — US-007, NFR-008, NFR-009, NFR-012

- **Create**: `apps/web/src/components/extensions/ExtensionContribution.tsx`
  - React Error Boundary wrapping each contribution
  - 5-second load timeout (NFR-009)
  - Structured Pino logging on error (NFR-012, ADR-021)
  - Hover badge with plugin name tooltip
  - Context prop spreading (FR-009): `contextSchema` + `PluginProps`
  - Prop isolation: MUST NOT pass host-internal state (NFR-007)

#### T013-13: ExtensionSlotSkeleton & ExtensionErrorFallback (2 pts) — FR-008, US-007

- **Create**: `apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx`
  - 4 variants matching slot types (action, panel, form, toolbar)
  - Uses `Skeleton` from `@plexica/ui`
  - `aria-busy="true"`, `aria-label="Loading extension"`
- **Create**: `apps/web/src/components/extensions/ExtensionErrorFallback.tsx`
  - `compact` variant (inline text) and `card` variant (card with dismiss)
  - `role="alert"`, `aria-live="assertive"`
  - Structured Pino logging on render

#### T013-14: useExtensionSlot Hook (2 pts) — FR-028

- **Create**: `apps/web/src/hooks/useExtensionSlot.ts`
  - Wraps TanStack Query for contribution resolution
  - Returns `{ contributions, isLoading, error, slotProps }`
  - `slotProps` is ready to spread on `<ExtensionSlot>`
  - Handles feature flag check (returns empty when disabled)

#### T013-15: VirtualizedSlotContainer (2 pts) — Edge Case #12

- **Create**: `apps/web/src/components/extensions/VirtualizedSlotContainer.tsx`
  - Custom virtualization using `IntersectionObserver` + `overflow-y: auto`
  - Shows first 20 contributions + "Show N more extensions" button
  - `aria-label="Show {N} more extensions in {slotLabel}"`
  - Virtual list: `role="list"`, items `role="listitem"`

#### T013-16: Workspace Extension Settings Page (3 pts) — FR-022, US-003, FR-025, FR-033

- **Create**: `apps/web/src/routes/settings/extensions.tsx`
  - `ExtensionSettingsPanel` component per design-spec §3.5
  - Accordion groups by host plugin → slot → `<ContributionRow>` with toggles
  - Optimistic UI on toggle with error rollback + Toast
  - Cascade-disabled contributions grayed out with tooltip (FR-025)
  - Preview thumbnails when `previewUrl` exists (FR-033)
- **Create**: `apps/web/src/components/extensions/ContributionRow.tsx`
  - 4 variants: `enabled`, `disabled-tenant`, `disabled-workspace`, `warning`
- **Modify**: `apps/web/src/routes/settings/index.tsx` — add "Extensions" tab

#### T013-17: Tenant Admin Extension Permissions Page (3 pts) — FR-006, US-006

- **Create**: `apps/super-admin/src/routes/plugins/extension-permissions.tsx`
  - `ExtensionPermissionsPage` component per design-spec §3.7
  - Data table: plugin, target slot, permission, status, action
  - Grant/Revoke with confirmation dialog
  - Newly installed plugins highlighted
  - Keyboard accessible (Tab → Enter/Space)

#### T013-18: SlotInspectorOverlay (dev-only) (1 pt) — FR-028, FR-031

- **Create**: `apps/web/src/components/extensions/SlotInspectorOverlay.tsx`
  - Activated by `Ctrl+Shift+E` in development mode
  - Tree-shaken in production via `import.meta.env.DEV` guard
  - Highlights all `<ExtensionSlot>` instances on page
  - Click to inspect: slot ID, type, context schema, contributions list

#### T013-19: Component Barrel Export (1 pt)

- **Create**: `apps/web/src/components/extensions/index.ts`
  - Export all extension components for convenient imports

---

### Phase 4: Testing (~12 story points)

**Objective**: Comprehensive test coverage for all extension-registry operations.

**Entry Criteria**: Phase 3 complete (all components built).
**Exit Criteria**: ≥85% coverage for extension-registry module, all ADR-031 isolation tests passing.

**Tasks**:

#### T013-20: Service Unit Tests (3 pts) — Art. 4.1, Art. 8.1, NFR-013

- **Create**: `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.service.test.ts`
  - Manifest sync (parse manifest → upsert slots, contributions, entities, data extensions)
  - Contribution resolution (permission checks, workspace visibility, priority ordering)
  - Data extension aggregation (parallel fetches, 3s timeout, timed-out plugins excluded)
  - Cache invalidation (activation/deactivation clears Redis)
  - Contribution validation (type_mismatch, target_not_found detection)
  - Slot removal event emission (Edge Case #14)
  - Feature flag check (disabled → empty results)
  - In-memory mocks for repository, Redis, ABAC (NFR-013)

#### T013-21: Schema Validation Unit Tests (2 pts) — Art. 5.3, Art. 8.1

- **Create**: `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.schema.test.ts`
  - All Zod schemas from §4.4
  - Valid and invalid inputs for each schema
  - Boundary values: priority 0, 999, 1000 (rejected); slot types; UUID formats
  - Null byte rejection in string fields

#### T013-22: API Integration Tests (5 pts) — Art. 4.1, Art. 8.1, FR-019..FR-022, FR-031

- **Create**: `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.routes.test.ts`
  - All 8 API endpoints: success, 400, 401, 403, 404 responses
  - GET /slots — returns active slots, filtered by pluginId/type
  - GET /contributions — returns workspace-visible contributions
  - GET /entities — returns active entity types
  - GET /entities/.../extensions — aggregates sidecar data with timeout
  - PATCH visibility — workspace admin toggle, non-admin rejection
  - GET dependents — contribution count and list
  - Feature flag gating: disabled → 404
  - Uses `buildTestApp()` + `testContext.auth.createMockToken()`

#### T013-23: Tenant Isolation Integration Tests (3 pts) — ADR-031, Art. 5.2

- **Create**: `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.isolation.test.ts`
  - **Mandatory** (ADR-031 Follow-Up):
  - 1. Tenant isolation: Insert extension data for tenant A and B. Query via repository for tenant A — assert tenant B data NOT returned.
  - 2. RLS enforcement: Set `app.current_tenant_id` to tenant A, raw `SELECT * FROM core.extension_slots` — assert only tenant A's plugin slots returned.
  - 3. Workspace visibility scoping: Contribution visible in workspace X but hidden in workspace Y.
  - 4. Missing tenant context: Query without setting `app.current_tenant_id` — assert zero rows.
  - 5. Cascade-disable: Deactivate plugin → all slots/contributions set `is_active = false`.

#### T013-24: Frontend Component Tests (3 pts) — Art. 8.1, NFR-011

- **Tests co-located or in dedicated test files for**:
  - `ExtensionSlot`: renders contributions in priority order, shows skeleton, handles error boundary, ARIA attributes
  - `ExtensionContribution`: error boundary catch, 5s timeout, prop isolation
  - `ExtensionSlotSkeleton`: correct variant rendering per slot type
  - `ExtensionErrorFallback`: compact/card variants, dismiss action, `role="alert"`
  - `ContributionRow`: 4 variants, toggle optimistic UI
  - `useExtensionSlot`: hook returns correct data, handles loading/error states
  - Accessibility: `vitest-axe` scans on all user-facing components (per ADR-022)

#### T013-25: E2E Tests (3 pts) — Art. 8.1

- **Create**: `apps/core-api/src/__tests__/extension-registry/e2e/extension-registry.e2e.test.ts`
  - Full workflow: install plugin with manifest → activate → registry populated → query slots → query contributions
  - Workspace visibility toggle → contribution disappears from resolution
  - Plugin deactivation → contributions inactive → re-activate → contributions restored
  - Data extension resolution with mock sidecar endpoint
  - Edge cases: orphaned contribution (target plugin removed), type mismatch

---

### Phase 5: Migration & Documentation (~5 story points)

**Objective**: Documentation updates, architecture docs, decision log entry.

**Entry Criteria**: Phase 4 complete (tests passing, ≥85% coverage).
**Exit Criteria**: All docs updated, decision log entry created, spec status → Complete.

**Tasks**:

#### T013-26: Architecture Documentation (2 pts)

- **Modify**: `docs/ARCHITECTURE.md` — add Extension Points section documenting slot/contribution model, registry architecture, ADR-031 exception
- **Modify**: `docs/SECURITY.md` — add section on extension permission model, sidecar data tenant isolation
- **Create or Modify**: `docs/PLUGIN_SDK.md` — developer guide for declaring slots, contributing to slots, serving sidecar data

#### T013-27: Decision Log & Cross-References (1 pt)

- **Modify**: `.forge/knowledge/decision-log.md` — add entry for ADR-031 and Spec 013 completion
- **Modify**: `.forge/specs/013-extension-points/spec.md` — update status to Complete, link plan

#### T013-28: Health Check Integration (1 pt) — Art. 9.2

- **Modify**: `apps/core-api/src/index.ts` or health check module — add Extension Registry to `/health` dependency checks
- Extension Registry health = can query `extension_slots` table (simple `SELECT 1`)

#### T013-29: Feature Flag Rollout Documentation (1 pt) — Art. 9.1

- **Create or Modify**: `docs/FEATURE_FLAGS.md` — document `extension_points_enabled` flag behavior, gradual rollout plan
- Include: how to enable per-tenant, how to verify, how to disable in emergency

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                  | Test Focus                                                | Estimated Count |
| -------------------------- | --------------------------------------------------------- | --------------- |
| `ExtensionRegistryService` | Manifest sync, contribution resolution, cache, timeouts   | 35              |
| `ExtensionRegistrySchema`  | Zod validation for all schemas, boundary values           | 20              |
| `ExtensionSlot`            | Rendering, priority order, skeleton, error boundary, ARIA | 15              |
| `ExtensionContribution`    | Error boundary, timeout, prop isolation, badge            | 10              |
| `ExtensionSlotSkeleton`    | 4 variants, correct dimensions                            | 4               |
| `ExtensionErrorFallback`   | compact/card variants, dismiss, role="alert"              | 6               |
| `ContributionRow`          | 4 variants, toggle, optimistic UI                         | 8               |
| `useExtensionSlot`         | Hook return values, loading/error states, feature flag    | 6               |
| `DataExtensionClient`      | Handler registration, response validation, tenant check   | 8               |
| **Total unit tests**       |                                                           | **~112**        |

### 8.2 Integration Tests

| Scenario                              | Dependencies                              | Estimated Count |
| ------------------------------------- | ----------------------------------------- | --------------- |
| All 8 API endpoints (success + error) | Database, auth middleware, tenant context | 30              |
| Tenant isolation (ADR-031 mandatory)  | Database, RLS policies                    | 5               |
| Workspace visibility scoping          | Database, workspace service               | 5               |
| Plugin lifecycle sync                 | Plugin service, extension registry        | 6               |
| Data extension resolution             | Mock sidecar endpoints, HTTP client       | 4               |
| **Total integration tests**           |                                           | **~50**         |

### 8.3 E2E Tests

| Scenario                           | Dependencies                | Estimated Count |
| ---------------------------------- | --------------------------- | --------------- |
| Full plugin install → slot render  | Full app, Module Federation | 3               |
| Workspace visibility toggle flow   | Full app                    | 2               |
| Plugin deactivation/reactivation   | Full app, plugin service    | 2               |
| Edge cases (orphan, type mismatch) | Full app                    | 3               |
| **Total E2E tests**                |                             | **~10**         |

### 8.4 Coverage Targets

| Module                   | Target | Rationale                                               |
| ------------------------ | ------ | ------------------------------------------------------- |
| `extension-registry`     | ≥ 85%  | Security-adjacent (permission checks, tenant isolation) |
| Frontend components      | ≥ 80%  | UI components with a11y requirements                    |
| `DataExtensionClient`    | ≥ 80%  | SDK public API                                          |
| Overall (extension code) | ≥ 85%  | Matches core module threshold (Art. 4.1)                |

### 8.5 Total Test Count

| Type        | Count    |
| ----------- | -------- |
| Unit        | ~112     |
| Integration | ~50      |
| E2E         | ~10      |
| **Total**   | **~172** |

---

## 9. Architectural Decisions

| ADR     | Decision                                             | Status   |
| ------- | ---------------------------------------------------- | -------- |
| ADR-031 | Extension Registry tables in core shared schema      | Accepted |
| ADR-002 | Schema-per-tenant baseline (exception documented)    | Accepted |
| ADR-014 | Workspace plugin scoping (cascade-disable inherited) | Accepted |
| ADR-017 | ABAC engine (permission checks for slot access)      | Accepted |
| ADR-018 | Plugin lifecycle (activation triggers manifest sync) | Accepted |
| ADR-004 | Module Federation (contribution component loading)   | Accepted |
| ADR-021 | Pino frontend logging (error boundary logging)       | Accepted |
| ADR-023 | SSE notifications (cache invalidation delivery)      | Accepted |

---

## 10. Security & Performance Analysis

### 10.1 Security Analysis

| Concern                       | Mitigation                                                            | FR/NFR Ref |
| ----------------------------- | --------------------------------------------------------------------- | ---------- |
| Cross-tenant data leak        | ADR-031 5 safeguards + RLS policies                                   | NFR-006    |
| Unauthorized contribution     | Permission-gated via ABAC engine (ADR-017)                            | NFR-005    |
| Host state prop leak          | `<ExtensionContribution>` passes only `contextSchema` + `PluginProps` | NFR-007    |
| Malicious sidecar response    | Response validated against `fieldSchema`; malformed data excluded     | FR-018     |
| XSS via contributed component | CSP headers (existing), Module Federation same-origin                 | Art. 5.3   |
| Sidecar data tenant isolation | `DataExtensionClient` validates tenant context on every request       | NFR-006    |

### 10.2 Performance Analysis

| Concern                            | Approach                                                         | Target           |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------- |
| Registry query latency             | Redis cache (TTL 120s ± 15s jitter), indexed DB queries          | < 100ms P95      |
| Slot rendering latency             | Module Federation code-split, stale-while-revalidate cache       | < 500ms P95      |
| Data extension resolution          | Parallel sidecar fetches, 3s per-plugin timeout                  | < 2s P95         |
| Cache stampede on TTL expiry       | Jittered TTL (120s ± 15s random offset per cache key)            | Zero stampede    |
| Large contribution count (>20)     | Virtualization with IntersectionObserver                         | Smooth scroll    |
| Cache invalidation on deactivation | Direct Redis `DEL` on affected keys + SSE to connected frontends | < 1s propagation |

### 10.3 Risk Register

| ID    | Risk                                                             | Impact | Probability | Mitigation                                                                                            |
| ----- | ---------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------- |
| R-001 | RLS subquery on extension tables is slow                         | Medium | Low         | Monitor query performance; add `plugin_id → tenant_id` denormalized column if needed                  |
| R-002 | Module Federation load failures in production                    | High   | Medium      | 5s timeout + error boundary fallback + retry on next navigation                                       |
| R-003 | Sidecar data endpoint returns malicious data                     | High   | Low         | Schema validation + response size limit (1MB) + JSON parse in try-catch                               |
| R-004 | Custom virtualization insufficient for >50 contributions         | Low    | Low         | If perf testing fails, add `react-window` (requires ADR per Art. 2.2)                                 |
| R-005 | Cache invalidation race condition (stale contributions rendered) | Medium | Medium      | SSE delivers invalidation events; stale-while-revalidate ensures eventual consistency within 135s max |

---

## 11. Requirement Traceability

### Functional Requirements

| Requirement | Plan Section       | Implementation Path                                                                | Task             |
| ----------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------- |
| FR-001      | §2.1, §4.1         | `PluginManifest.extensionSlots` → `ExtensionRegistryRepository.upsertSlots`        | T013-01, T013-05 |
| FR-002      | §4.1, §4.2         | `ExtensionRegistryService.onPluginActivated` → repo `upsertSlots`                  | T013-06, T013-09 |
| FR-003      | §2.1, §4.1         | `PluginManifest.contributions` → `ExtensionRegistryRepository.upsertContributions` | T013-01, T013-05 |
| FR-004      | §4.2               | `ExtensionRegistryService.resolveContributions` + permission check                 | T013-06          |
| FR-005      | §4.5               | `<ExtensionSlot>` sorts by `priority`, ties by `pluginId` alpha                    | T013-11          |
| FR-006      | §3.6, §4.12        | `ExtensionPermissionsPage` + ABAC permission grant/revoke                          | T013-17          |
| FR-007      | §4.5               | `<ExtensionSlot>` component with Module Federation loading                         | T013-11          |
| FR-008      | §4.7, §4.8         | `<ExtensionSlotSkeleton>` + `<ExtensionErrorFallback>`                             | T013-13          |
| FR-009      | §4.5, §4.6         | `contextSchema` + `PluginProps` prop spreading                                     | T013-11, T013-12 |
| FR-010      | §4.5               | Query cache invalidation via SSE on plugin disable                                 | T013-11          |
| FR-011      | §3.3               | `GET /contributions?slotId&workspaceId` endpoint                                   | T013-07          |
| FR-012      | §2.1, §4.1         | `PluginManifest.extensibleEntities` → repo `upsertEntities`                        | T013-01, T013-05 |
| FR-013      | §2.1, §4.1         | `PluginManifest.dataExtensions` → repo `upsertDataExtensions`                      | T013-01, T013-05 |
| FR-014      | §4.15              | `DataExtensionClient` — sidecar storage pattern                                    | T013-10          |
| FR-015      | §3.5               | `GET /entities/:p/:e/:id/extensions` aggregation endpoint                          | T013-08          |
| FR-016      | §3.9, §4.15        | `GET /plugins/:p/extensions/:e/:id` sidecar endpoint (plugin-implemented)          | T013-10          |
| FR-017      | §4.2               | Resolution respects activation status + workspace visibility                       | T013-06, T013-08 |
| FR-018      | §4.2               | Parallel sidecar fetches with 3s timeout                                           | T013-06          |
| FR-019      | §3.1, §3.2         | `GET /slots` and `GET /slots/:pluginId` endpoints                                  | T013-07          |
| FR-020      | §3.4               | `GET /entities` endpoint                                                           | T013-08          |
| FR-021      | §3.3               | `GET /contributions` with query filters                                            | T013-07          |
| FR-022      | §3.6, §4.10, §4.11 | `PATCH /visibility` + `ExtensionSettingsPanel` + `ContributionRow`                 | T013-08, T013-16 |
| FR-023      | §2.1, §2.4         | 5 new tables via Prisma migration                                                  | T013-02          |
| FR-024      | §4.1, §4.2         | `deactivateByPlugin` / `reactivateByPlugin` (soft-delete pattern)                  | T013-05, T013-06 |
| FR-025      | §4.10              | Cascade-disabled contributions grayed out in settings                              | T013-16          |
| FR-026      | §4.1, §4.2         | `validateContributions` at activation time                                         | T013-05, T013-06 |
| FR-027      | §4.16              | Extended `PluginManifest` type in `@plexica/types`                                 | T013-01          |
| FR-028      | §4.9, §4.14        | `useExtensionSlot` hook + `SlotInspectorOverlay`                                   | T013-14, T013-18 |
| FR-029      | §4.15              | `DataExtensionClient` in `@plexica/sdk`                                            | T013-10          |
| FR-030      | §4.16              | Extension type exports in `@plexica/types`                                         | T013-01          |
| FR-031      | §3.7, §4.1         | `GET /slots/:p/:s/dependents` endpoint + `getSlotDependents`                       | T013-07          |
| FR-032      | §4.2               | Progressive rendering via parallel sidecar fetches                                 | T013-06          |
| FR-033      | §4.11              | `ContributionRow` shows `previewUrl` thumbnail                                     | T013-16          |

### Non-Functional Requirements

| Requirement | Plan Section | Implementation Path                                           | Task             |
| ----------- | ------------ | ------------------------------------------------------------- | ---------------- |
| NFR-001     | §10.2        | Redis cache + indexed queries → < 100ms P95                   | T013-06          |
| NFR-002     | §10.2        | Module Federation code-split + cache → < 500ms P95            | T013-11          |
| NFR-003     | §10.2        | Parallel 3s-timeout sidecar fetches → < 2s P95                | T013-06          |
| NFR-004     | §4.2, §10.2  | Redis TTL 120s ± 15s jitter                                   | T013-06          |
| NFR-005     | §10.1        | ABAC permission check before rendering                        | T013-06          |
| NFR-006     | §10.1        | `DataExtensionClient` tenant validation + ADR-031 safeguards  | T013-10, T013-23 |
| NFR-007     | §10.1        | Prop isolation in `<ExtensionContribution>`                   | T013-12          |
| NFR-008     | §4.6, §4.8   | React Error Boundary per contribution                         | T013-12, T013-13 |
| NFR-009     | §4.6         | 5-second load timeout → error boundary                        | T013-12          |
| NFR-010     | §10.2        | Indexed queries + Redis cache handle 100 slots / 500 contribs | T013-02, T013-06 |
| NFR-011     | §4.5         | ARIA `role="region"`, `aria-label`, `aria-busy`               | T013-11          |
| NFR-012     | §4.6         | Structured Pino logging on error with all required fields     | T013-12          |
| NFR-013     | §8.1         | In-memory mocks for repository, Redis, ABAC in unit tests     | T013-20          |
| NFR-014     | §4.5, §4.9   | TanStack Query `staleTime ≥ 60s` + stale-while-revalidate     | T013-11, T013-14 |

---

## 12. Constitution Compliance

| Article | Status     | Notes                                                                                                                                         |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅ ⚠️      | Security: permission-gated, Error Boundaries. Multi-tenancy: ADR-031 bounded exception with 5 safeguards. UX: WCAG 2.1 AA via ARIA landmarks. |
| Art. 2  | ✅         | No new dependencies. All technology from approved stack (React, Prisma, Redis, Fastify, TanStack Query).                                      |
| Art. 3  | ✅         | Feature module (`extension-registry`). Layered: Controller → Service → Repository. All DB via Prisma.                                         |
| Art. 4  | ✅         | ≥85% coverage target for extension-registry. ~172 tests planned. `/forge-review` required before merge.                                       |
| Art. 5  | ✅ ⚠️      | RBAC via ABAC engine. Zod validation on all inputs. Tenant isolation via ADR-031 safeguards + RLS (⚠️ qualified).                             |
| Art. 6  | ✅         | Standard error codes (SLOT_NOT_FOUND, etc.). Structured Pino logging with all required fields.                                                |
| Art. 7  | ✅         | Files: kebab-case. DB: snake_case. API: `/api/v1/extension-registry/slots` (plural, kebab-case).                                              |
| Art. 8  | ⚠️ PARTIAL | Unit + Integration tests complete. E2E tests deferred — see TD-021 in decision-log.md. AAA pattern. Descriptive names.                        |
| Art. 9  | ✅         | Feature flag `extension_points_enabled`. Additive migrations only. Health check integration.                                                  |

---

## 13. Task Summary

| Task    | Title                                   | Phase | Points | FR/NFR Coverage                            |
| ------- | --------------------------------------- | ----- | ------ | ------------------------------------------ |
| T013-01 | Extension Type Definitions              | 1     | 3      | FR-027, FR-030                             |
| T013-02 | Database Migration — Extension Tables   | 1     | 5      | FR-023, ADR-031                            |
| T013-03 | Extension Feature Flag                  | 1     | 2      | Art. 9.1.1                                 |
| T013-04 | Zod Validation Schemas                  | 1     | 3      | Art. 5.3, FR-019..FR-022, FR-031           |
| T013-05 | Extension Registry Repository           | 1     | 5      | ADR-031, FR-002,004,011,012,013,022,024    |
| T013-06 | Extension Registry Service              | 1     | 5      | FR-002,006,015,018,024,026, NFR-004        |
| T013-07 | Controller — Slot & Contribution Routes | 2     | 5      | FR-019, FR-021, FR-031                     |
| T013-08 | Controller — Entity & Visibility Routes | 2     | 5      | FR-015, FR-020, FR-022                     |
| T013-09 | Plugin Lifecycle Integration            | 2     | 3      | FR-002, FR-024, FR-025                     |
| T013-10 | SDK DataExtensionClient                 | 2     | 3      | FR-029                                     |
| T013-11 | ExtensionSlot Component                 | 3     | 5      | FR-007,008,009, NFR-008,011,014            |
| T013-12 | ExtensionContribution Component         | 3     | 3      | US-007, NFR-007,008,009,012                |
| T013-13 | Skeleton & Error Fallback Components    | 3     | 2      | FR-008, US-007                             |
| T013-14 | useExtensionSlot Hook                   | 3     | 2      | FR-028                                     |
| T013-15 | VirtualizedSlotContainer                | 3     | 2      | Edge Case #12                              |
| T013-16 | Workspace Extension Settings Page       | 3     | 3      | FR-022, US-003, FR-025, FR-033             |
| T013-17 | Tenant Admin Extension Permissions Page | 3     | 3      | FR-006, US-006                             |
| T013-18 | SlotInspectorOverlay (dev-only)         | 3     | 1      | FR-028, FR-031                             |
| T013-19 | Component Barrel Export                 | 3     | 1      | —                                          |
| T013-20 | Service Unit Tests                      | 4     | 3      | Art. 4.1, Art. 8.1, NFR-013                |
| T013-21 | Schema Validation Unit Tests            | 4     | 2      | Art. 5.3, Art. 8.1                         |
| T013-22 | API Integration Tests                   | 4     | 5      | Art. 4.1, Art. 8.1, FR-019..FR-022, FR-031 |
| T013-23 | Tenant Isolation Integration Tests      | 4     | 3      | ADR-031, Art. 5.2                          |
| T013-24 | Frontend Component Tests                | 4     | 3      | Art. 8.1, NFR-011                          |
| T013-25 | E2E Tests                               | 4     | 3      | Art. 8.1                                   |
| T013-26 | Architecture Documentation              | 5     | 2      | —                                          |
| T013-27 | Decision Log & Cross-References         | 5     | 1      | —                                          |
| T013-28 | Health Check Integration                | 5     | 1      | Art. 9.2                                   |
| T013-29 | Feature Flag Rollout Documentation      | 5     | 1      | Art. 9.1                                   |

**Phase Totals:**

| Phase     | Name                | Tasks        | Story Points |
| --------- | ------------------- | ------------ | ------------ |
| 1         | Core Infrastructure | T013-01..06  | 23           |
| 2         | Plugin SDK & API    | T013-07..10  | 16           |
| 3         | Frontend Components | T013-11..19  | 22           |
| 4         | Testing             | T013-20..25  | 19           |
| 5         | Migration & Docs    | T013-26..29  | 5            |
| **Total** |                     | **29 tasks** | **85 pts**   |

---

## Cross-References

| Document     | Path                                                           |
| ------------ | -------------------------------------------------------------- |
| Spec         | `.forge/specs/013-extension-points/spec.md`                    |
| Design Spec  | `.forge/specs/013-extension-points/design-spec.md`             |
| User Journey | `.forge/specs/013-extension-points/user-journey.md`            |
| ADR-031      | `.forge/knowledge/adr/adr-031-extension-tables-core-schema.md` |
| ADR-002      | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       |
| ADR-014      | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     |
| ADR-017      | `.forge/knowledge/adr/adr-017-abac-engine.md`                  |
| ADR-018      | `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`      |
| Architecture | `.forge/architecture/architecture.md`                          |
| Constitution | `.forge/constitution.md`                                       |
| Tasks        | <!-- Created by /forge-tasks -->                               |
