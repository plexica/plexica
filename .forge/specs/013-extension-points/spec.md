# Spec: 013 - Extension Points

> Feature specification for inter-plugin UI composition, data model extension,
> and extension point discovery. Enables plugins to declare named slots where
> other plugins can contribute action buttons, info panels, interactive forms,
> toolbar items, and sidecar data extensions.
>
> Created by the `forge-pm` agent via `/forge-specify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Complete   |
| Author  | forge-pm   |
| Date    | 2026-03-08 |
| Track   | Feature    |
| Spec ID | 013        |

---

## 1. Overview

Extension Points enable cross-plugin UI composition and data model enrichment
within the Plexica platform. Today, plugins can contribute full pages, sidebar
menu items, and standalone widgets (Spec 010 FR-022), but there is no mechanism
for Plugin A to declare named injection points ("slots") in its own UI where
other plugins can contribute UI fragments or data. This forces plugin developers
to build monolithic, self-contained plugins that duplicate data and UI instead
of composing with the ecosystem.

This spec introduces three pillars:

1. **UI Extension Slots** — Plugin A declares named slots in its views (e.g.,
   `crm:contact-detail-actions`). Plugin B registers contributions (action
   buttons, info panels, interactive forms, toolbar items) that render inside
   those slots via Module Federation.

2. **Data Model Extensions** — Plugin A exposes entity types (e.g., `contacts`,
   `deals`) that other plugins can enrich with sidecar data stored in their own
   schema. A standardised resolution protocol lets Plugin A discover and fetch
   extended fields at render time.

3. **Extension Registry** — A centralised registry that tracks slot declarations,
   contribution registrations, and data extension bindings. Enforces
   permission-gated access, priority ordering, and workspace-level visibility
   control.

## 2. Problem Statement

### Current Limitations

Plexica plugins operate in isolation. The only inter-plugin composition
mechanisms are:

- **Events** (ADR-005): Async pub/sub — suitable for backend data flows but
  not for synchronous UI composition.
- **Shared Data** (SDK `SharedDataClient`): Key-value store — too low-level
  for structured UI contributions; no schema, no rendering contract.
- **Service Discovery** (SDK `ServiceClient`): REST API calls between plugin
  backends — does not address frontend UI composition.
- **Widgets** (Spec 010 FR-022): Standalone reusable components loaded via
  Module Federation — but a widget has no concept of _where_ in another
  plugin's UI it should appear.

### Impact of No Extension Points

| Problem                        | Example                                                                                          | Business Impact                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Duplicated UI                  | CRM and Billing both build their own contact detail views because neither can extend the other's | Increased development cost, inconsistent UX |
| Duplicated data                | HR plugin stores its own copy of CRM contacts to attach employee IDs                             | Data drift, sync bugs, storage waste        |
| Monolithic plugins             | A single "ERP" plugin tries to do CRM + Billing + HR because composition is impossible           | Slower iteration, higher coupling           |
| Missing cross-plugin workflows | No "Create Invoice" button inside CRM contact view; users must switch to Billing plugin          | Poor UX, wasted user time                   |
| No ecosystem incentive         | Third-party developers cannot build "enhancement" plugins that enrich existing plugins           | Weak plugin marketplace, low adoption       |

### Why Now

- The Widget System (Spec 010) provides the Module Federation infrastructure
  for loading remote components — extension slots build directly on top of this.
- Workspace plugin scoping (ADR-014) provides the two-level enablement model
  that extension visibility control inherits.
- The Plugin SDK (`@plexica/sdk`) and types package (`@plexica/types`) already
  define `PluginManifest`, `PluginWidget`, and `PluginProps` — extension slots
  are a natural evolution of this contract.

## 3. User Stories

### US-001: Declare Extension Slots in Plugin UI

**As a** plugin developer,
**I want** to declare named extension slots in my plugin's manifest,
**so that** other plugins can contribute UI fragments (action buttons, info
panels, forms, toolbar items) into my plugin's views without modifying my code.

**Acceptance Criteria:**

- Given a plugin manifest with an `extensionSlots` array containing slot
  declarations, when the plugin is installed and activated, then the slots
  are registered in the Extension Registry and discoverable by other plugins.
- Given a slot declaration with `id: "contact-detail-actions"` and
  `type: "action"`, when another plugin queries the registry for slots of
  type `"action"`, then this slot appears in the results.
- Given a slot declaration with a `contextSchema` describing the props passed
  to contributions (e.g., `{ contactId: string, tenantId: string }`), when
  the slot is rendered, then each contribution receives exactly those props.

### US-002: Contribute to Another Plugin's Extension Slot

**As a** plugin developer,
**I want** to register a UI contribution (action button, info panel, form, or
toolbar item) that targets a named slot in another plugin,
**so that** my plugin's functionality appears contextually inside the other
plugin's views.

**Acceptance Criteria:**

- Given Plugin B's manifest contains a `contributions` array with an entry
  targeting `pluginId: "crm"`, `slotId: "contact-detail-actions"`, when both
  Plugin A (CRM) and Plugin B are active, then Plugin B's contributed component
  renders inside the CRM's contact detail actions slot.
- Given the contribution specifies `priority: 10`, when multiple plugins
  contribute to the same slot, then contributions are rendered in ascending
  priority order (lowest first). Ties are resolved alphabetically by plugin ID.
- Given Plugin B is disabled for the tenant, when the CRM renders its
  contact detail view, then Plugin B's contribution does not appear.

### US-003: Control Extension Visibility at Workspace Level

**As a** workspace admin,
**I want** to enable or disable specific extension contributions within my
workspace,
**so that** I can tailor which cross-plugin features are visible to my team
without affecting other workspaces.

**Acceptance Criteria:**

- Given Plugin B contributes an "Engagement Metrics" panel to CRM's contact
  detail slot, and the workspace admin disables this contribution for their
  workspace, when a user in that workspace views a CRM contact, then the
  "Engagement Metrics" panel does not appear.
- Given the contribution is disabled at workspace level, when a user in a
  different workspace views the same CRM contact, then the panel still appears
  (if enabled in their workspace).
- Given the tenant admin disables Plugin B entirely, when the workspace admin
  views the extension configuration, then Plugin B's contributions are grayed
  out and cannot be re-enabled at workspace level (per ADR-014 cascade-disable
  semantics).

### US-004: Extend Another Plugin's Data Model with Sidecar Data

**As a** plugin developer,
**I want** to register sidecar data extensions for another plugin's entity
types (e.g., add "employee_id" to CRM contacts),
**so that** my extended fields appear alongside the original entity data
without modifying the other plugin's schema.

**Acceptance Criteria:**

- Given Plugin B (HR) registers a data extension for entity type
  `crm:contacts` with field `employeeId`, when CRM renders a contact detail
  and queries the data extension API, then the HR plugin's `employeeId` value
  is included in the response.
- Given the HR plugin stores sidecar data in its own schema
  (`hr.contact_extensions` table with `contact_id` + `employee_id`), when the
  sidecar data is fetched, then no direct access to the CRM schema occurs.
- Given the HR plugin is not installed for a tenant, when CRM queries data
  extensions for a contact, then no HR fields appear (empty response for that
  extension).

### US-005: Discover Available Extension Slots and Data Extensions

**As a** plugin developer,
**I want** to query the Extension Registry for all available slots and
extensible entity types,
**so that** I can build contributions that target specific slots and entities
without hard-coding assumptions about the plugin ecosystem.

**Acceptance Criteria:**

- Given the Extension Registry API endpoint
  `GET /api/v1/extension-registry/slots`, when a plugin queries it, then it
  receives a list of all declared slots from active plugins, including
  `pluginId`, `slotId`, `type`, and `contextSchema`.
- Given the Extension Registry API endpoint
  `GET /api/v1/extension-registry/entities`, when a plugin queries it, then
  it receives a list of all extensible entity types from active plugins,
  including `pluginId`, `entityType`, and `fieldSchema`.
- Given a plugin is deactivated, when the registry is queried, then that
  plugin's slots and entity types no longer appear in the results.

### US-006: Tenant Admin Manages Extension Permissions

**As a** tenant admin,
**I want** to control which plugins can contribute to extension slots via
permission assignments,
**so that** I can prevent untrusted or unwanted plugins from injecting UI
into other plugins' views.

**Acceptance Criteria:**

- Given Plugin A declares a slot with required permission
  `plugin.crm.extend.contact-detail`, when Plugin B attempts to contribute
  to this slot, then the contribution is only rendered if Plugin B's role has
  the `plugin.crm.extend.contact-detail` permission granted by the tenant admin.
- Given the tenant admin revokes the extension permission from Plugin B, when
  the CRM renders its contact detail, then Plugin B's contribution disappears
  without requiring a page refresh (SSE update or next navigation).
- Given a new plugin is installed, when it declares contributions targeting
  slots, then the contributions are inactive until the tenant admin grants
  the required permissions.

### US-007: Graceful Degradation When Contributing Plugin Fails

**As a** plugin user,
**I want** to continue using Plugin A's views even when a contributing
plugin's extension crashes,
**so that** a bug in one plugin does not break the entire view.

**Acceptance Criteria:**

- Given Plugin B's contributed component throws a runtime error, when
  rendering inside Plugin A's extension slot, then a React Error Boundary
  catches the error and renders a fallback UI ("Extension unavailable") in
  place of the failed contribution.
- Given the error occurs, when the user continues interacting with Plugin A's
  view, then all other contributions in the same slot and all of Plugin A's
  own UI remain functional.
- Given the error is caught, when the error boundary logs the failure, then
  the log includes `pluginId`, `slotId`, `contributionId`, `componentStack`,
  and `tenantId` (per Constitution Art. 6.3 structured logging, ADR-021).

### US-008: Extension Slot Rendering with Loading States

**As a** plugin user,
**I want** to see a loading indicator while contributed components are being
fetched via Module Federation,
**so that** I understand the slot is loading rather than empty.

**Acceptance Criteria:**

- Given a slot has registered contributions, when the host plugin renders the
  slot and the remote components are still loading, then a skeleton/loading
  placeholder is shown in the slot area.
- Given the remote component loads successfully, when it resolves, then the
  skeleton is replaced with the actual contribution.
- Given the remote component fails to load (network error, Module Federation
  failure), when the loading timeout expires (5 seconds), then the slot shows
  the error boundary fallback and logs the failure.

## 4. Functional Requirements

### Pillar 1: UI Extension Slots

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Priority | Story Ref              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| FR-001 | Plugins MUST be able to declare extension slots in their `PluginManifest` via a new `extensionSlots` array. Each slot has a unique `id`, `type` (action, panel, form, toolbar), and `contextSchema`.                                                                                                                                                                                                                                                                                                                                           | Must     | US-001                 |
| FR-002 | The Extension Registry MUST store slot declarations when a plugin is activated and remove them when the plugin is deactivated or uninstalled.                                                                                                                                                                                                                                                                                                                                                                                                  | Must     | US-001                 |
| FR-003 | Plugins MUST be able to declare contributions in their `PluginManifest` via a new `contributions` array. Each contribution targets a `pluginId` + `slotId` and references a `PluginWidget` component.                                                                                                                                                                                                                                                                                                                                          | Must     | US-002                 |
| FR-004 | The Extension Registry MUST store contribution registrations and resolve them at render time based on slot ID, plugin activation status, permissions, and workspace visibility.                                                                                                                                                                                                                                                                                                                                                                | Must     | US-002                 |
| FR-005 | Each contribution MUST specify a numeric `priority` field (integer, 0–999). Contributions are rendered in ascending priority order. Ties are resolved alphabetically by contributing plugin's ID.                                                                                                                                                                                                                                                                                                                                              | Must     | US-002                 |
| FR-006 | Each extension slot MUST define a required permission string (e.g., `plugin.crm.extend.contact-detail`). Contributions are only rendered if the contributing plugin's tenant role has that permission. This is the first tier of a two-tier access model: (1) the slot-level permission gates which plugins _can_ contribute (tenant admin controls), and (2) workspace-level visibility (FR-022) provides fine-grained per-contribution on/off control (workspace admin controls). Both tiers must be satisfied for a contribution to render. | Must     | US-006                 |
| FR-007 | The host shell MUST provide a `<ExtensionSlot>` React component that: (a) queries the registry for contributions matching the slot ID using a client-side cache (NFR-014), (b) loads each contribution via Module Federation, (c) renders them in priority order, (d) wraps each in a React Error Boundary. The component MUST use stale-while-revalidate semantics — showing cached contributions instantly while refreshing in the background.                                                                                               | Must     | US-002, US-007, US-008 |
| FR-008 | The `<ExtensionSlot>` component MUST show a skeleton/loading placeholder while contributions are being loaded and a fallback UI when a contribution fails.                                                                                                                                                                                                                                                                                                                                                                                     | Must     | US-008                 |
| FR-009 | The `<ExtensionSlot>` component MUST pass the slot's context data (as defined by `contextSchema`) as props to each contribution component, along with the standard `PluginProps` (tenantId, userId, workspaceId).                                                                                                                                                                                                                                                                                                                              | Must     | US-001                 |
| FR-010 | When a contributing plugin is disabled (tenant-level or workspace-level), its contributions MUST be removed from all extension slots without requiring a full page reload.                                                                                                                                                                                                                                                                                                                                                                     | Should   | US-003                 |
| FR-011 | The Extension Registry MUST support querying contributions by slot ID, plugin ID, contribution type, and workspace ID. The API MUST return only contributions visible to the requesting workspace.                                                                                                                                                                                                                                                                                                                                             | Must     | US-003, US-005         |

### Pillar 2: Data Model Extensions

| ID     | Requirement                                                                                                                                                                                                                                 | Priority | Story Ref      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| FR-012 | Plugins MUST be able to declare extensible entity types in their `PluginManifest` via a new `extensibleEntities` array. Each entity has a `type` name (e.g., `contacts`) and a `fieldSchema`.                                               | Must     | US-004         |
| FR-013 | Plugins MUST be able to declare data extensions in their `PluginManifest` via a new `dataExtensions` array. Each extension targets a `pluginId` + `entityType` and declares the sidecar fields.                                             | Must     | US-004         |
| FR-014 | Data extensions MUST use sidecar storage — the contributing plugin stores extended data in its own database schema, linked to the host entity's ID. No modification to the host plugin's schema.                                            | Must     | US-004         |
| FR-015 | The core API MUST provide a data extension resolution endpoint `GET /api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions` that aggregates sidecar data from all contributing plugins for a given entity instance. | Must     | US-004         |
| FR-016 | Contributing plugins MUST expose a sidecar data endpoint `GET /api/v1/plugins/:pluginId/extensions/:entityType/:entityId` that returns their extended fields for a specific entity instance.                                                | Must     | US-004         |
| FR-017 | The data extension resolution endpoint MUST respect plugin activation status and workspace visibility. Extensions from disabled plugins or invisible contributions MUST be excluded.                                                        | Must     | US-004, US-003 |
| FR-018 | The data extension resolution endpoint MUST execute sidecar data fetches in parallel with a per-plugin timeout of 3 seconds. Timed-out plugins are excluded from the response with a warning.                                               | Should   | US-004         |

### Pillar 3: Extension Registry

| ID     | Requirement                                                                                                                                                                                                                                                                                                | Priority | Story Ref              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| FR-019 | The Extension Registry MUST provide a REST API for slot discovery: `GET /api/v1/extension-registry/slots` returning all registered slots with `pluginId`, `slotId`, `type`, `contextSchema`, and `requiredPermission`.                                                                                     | Must     | US-005                 |
| FR-020 | The Extension Registry MUST provide a REST API for entity discovery: `GET /api/v1/extension-registry/entities` returning all extensible entity types with `pluginId`, `entityType`, and `fieldSchema`.                                                                                                     | Must     | US-005                 |
| FR-021 | The Extension Registry MUST provide a REST API for contribution discovery: `GET /api/v1/extension-registry/contributions?slotId=X&workspaceId=Y` returning contributions visible to the specified workspace.                                                                                               | Must     | US-005                 |
| FR-022 | Workspace admins MUST be able to toggle individual extension contributions on/off for their workspace via `PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId`.                                                                                                                    | Must     | US-003                 |
| FR-023 | The Extension Registry MUST persist slot declarations, contribution registrations, and workspace visibility settings in the database (new `extension_slots`, `extension_contributions`, `workspace_extension_visibility` tables).                                                                          | Must     | US-001, US-002, US-003 |
| FR-024 | When a plugin is deactivated, the Extension Registry MUST mark all its slots and contributions as inactive (soft-delete) rather than permanently removing them, to preserve workspace visibility settings for re-activation.                                                                               | Should   | US-001, US-002         |
| FR-025 | When a tenant admin disables a plugin, all contributions from that plugin MUST be cascade-disabled across all workspaces (per ADR-014 cascade-disable semantics). Re-enabling the plugin does NOT cascade-enable contributions.                                                                            | Must     | US-003, US-006         |
| FR-026 | The Extension Registry MUST validate contribution registrations at plugin activation time: the target slot must exist (from an active plugin), the contribution type must match the slot type, and the required permission must be resolvable. Validation failures are logged but do not block activation. | Should   | US-002                 |

### SDK & Developer Experience

| ID     | Requirement                                                                                                                                                                                                                                                                                               | Priority | Story Ref              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| FR-027 | The `PluginManifest` type in `@plexica/types` MUST be extended with `extensionSlots`, `contributions`, `extensibleEntities`, and `dataExtensions` arrays. All new fields are optional for backward compatibility.                                                                                         | Must     | US-001, US-002, US-004 |
| FR-028 | The `@plexica/sdk` MUST provide a `useExtensionSlot(slotId: string, context: Record<string, unknown>)` React hook for slot-declaring plugins to render the `<ExtensionSlot>` component with minimal boilerplate.                                                                                          | Should   | US-001                 |
| FR-029 | The `@plexica/sdk` MUST provide a `DataExtensionClient` class for contributing plugins to register and serve sidecar data via the resolution protocol.                                                                                                                                                    | Should   | US-004                 |
| FR-030 | The `@plexica/types` MUST export TypeScript interfaces for `ExtensionSlotDeclaration`, `ContributionDeclaration`, `ExtensibleEntityDeclaration`, `DataExtensionDeclaration`, and all sub-types.                                                                                                           | Must     | US-005                 |
| FR-031 | The Extension Registry MUST provide a slot dependents query: `GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents` returning the count and list of contributing plugins. This enables slot owners to assess the blast radius of contract changes before updating slot definitions.          | Should   | US-005                 |
| FR-032 | The data extension resolution endpoint SHOULD support progressive rendering: either via streaming responses (chunked transfer) or by enabling the frontend to fetch per-plugin sidecar data individually and progressively render as each resolves, rather than blocking on a single aggregated response. | Should   | US-004, US-008         |
| FR-033 | Each contribution declaration MAY include a `previewUrl` field (optional) — a static image URL served from the contributing plugin's assets that shows what the contribution looks like in-context. The workspace admin settings page SHOULD display this preview when available.                         | Could    | US-003                 |

## 5. Non-Functional Requirements

| ID      | Category      | Requirement                                                                                                                                                                                                          | Target                           |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| NFR-001 | Performance   | Extension Registry API queries (slots, contributions, entities) MUST respond within P95 latency target.                                                                                                              | < 100ms P95                      |
| NFR-002 | Performance   | `<ExtensionSlot>` component MUST render contributed components (after Module Federation load) within target latency.                                                                                                 | < 500ms P95 per contribution     |
| NFR-003 | Performance   | Data extension resolution endpoint MUST return first meaningful data within target latency. Extensions from slow plugins are progressively appended. Timed-out plugins are excluded with a warning.                  | < 2 seconds P95 (first response) |
| NFR-004 | Performance   | Extension Registry data MUST be cached in Redis with jittered TTL to avoid stampede.                                                                                                                                 | TTL 120s ± 15s jitter            |
| NFR-005 | Security      | Extension contributions MUST be permission-gated. A contribution is not rendered unless the contributing plugin's tenant role has the slot's required permission.                                                    | Zero unauthorized renders        |
| NFR-006 | Security      | Sidecar data endpoints MUST validate tenant context. A plugin MUST only return sidecar data belonging to the requesting tenant.                                                                                      | Zero cross-tenant data leaks     |
| NFR-007 | Security      | The `<ExtensionSlot>` component MUST NOT pass any data beyond the declared `contextSchema` props and standard `PluginProps` to contributed components. No host-internal state leaks.                                 | Zero prop leaks                  |
| NFR-008 | Reliability   | A contributed component crashing MUST NOT affect the host plugin's view or other contributions in the same slot. Error Boundaries provide fault isolation.                                                           | Zero cascade failures            |
| NFR-009 | Reliability   | Module Federation load failures for contributions MUST time out gracefully with a fallback UI.                                                                                                                       | 5-second timeout                 |
| NFR-010 | Scalability   | The Extension Registry MUST support up to N declared slots and M contributions per tenant without performance degradation.                                                                                           | N = 100 slots, M = 500 contribs  |
| NFR-011 | Accessibility | The `<ExtensionSlot>` component MUST render contributed components within an ARIA landmark (`role="region"`) with `aria-label` identifying the slot. Error fallback MUST be announced to screen readers.             | WCAG 2.1 AA compliance           |
| NFR-012 | Observability | Extension slot render events (load, success, error) MUST emit structured Pino log entries with `slotId`, `contributionId`, `pluginId`, `renderTimeMs`, and `tenantId`.                                               | 100% event coverage              |
| NFR-013 | Testability   | All Extension Registry operations MUST be testable without Module Federation or Docker containers (mocked adapters, in-memory registry).                                                                             | Full unit test isolation         |
| NFR-014 | Performance   | The frontend MUST cache resolved contribution lists in a client-side query cache (TanStack Query) with stale-while-revalidate semantics. Registry queries MUST NOT occur on every `<ExtensionSlot>` component mount. | staleTime ≥ 60 seconds           |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                                                                                               | Expected Behavior                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin B contributes to a slot from Plugin A, but Plugin A is not installed                                                            | Contribution is stored in the registry but remains dormant. No error. When Plugin A is later installed and activated, the contribution becomes visible.                                                                                                                                                                                                    |
| 2   | Plugin A declares a slot, then is updated to a new version that removes the slot                                                       | Existing contributions targeting the removed slot become orphaned. The registry marks them as `target_not_found`. They are excluded from rendering. A warning is logged.                                                                                                                                                                                   |
| 3   | Two plugins contribute to the same slot with the same priority                                                                         | Contributions are ordered by priority first, then alphabetically by contributing plugin ID. Deterministic and stable rendering order.                                                                                                                                                                                                                      |
| 4   | A contributed component enters an infinite render loop                                                                                 | The React Error Boundary catches the error (React triggers error boundary on too many re-renders). Fallback UI is shown. Pino log with `errorType: "render_loop"`.                                                                                                                                                                                         |
| 5   | The data extension resolution endpoint calls a plugin that is down                                                                     | The per-plugin timeout (3 seconds) expires. The timed-out plugin's extension data is excluded from the response. A `warnings` array in the response includes the failure.                                                                                                                                                                                  |
| 6   | A workspace admin disables a contribution, then the tenant admin disables the entire plugin                                            | The contribution is cascade-disabled at tenant level. The workspace-level override is preserved but superseded. If the tenant admin re-enables the plugin, the workspace admin's disabled state is still in effect.                                                                                                                                        |
| 7   | A plugin declares a contribution targeting a slot type that doesn't match (e.g., contribution type "panel" targeting an "action" slot) | Validation at activation time detects the mismatch. The contribution is registered but flagged as `type_mismatch`. It is excluded from rendering. Warning logged.                                                                                                                                                                                          |
| 8   | Plugin B's sidecar data endpoint returns invalid JSON or malformed response                                                            | The data extension resolution endpoint catches the parse error, excludes that plugin's data, and includes a warning in the `warnings` array. Other plugins' data unaffected.                                                                                                                                                                               |
| 9   | A slot's contextSchema defines required fields, but the host plugin fails to provide them at render time                               | The `<ExtensionSlot>` component validates context against schema before passing to contributions. Missing fields trigger a console warning and the slot renders without context (contributions may show empty state).                                                                                                                                      |
| 10  | Plugin B's contributed component attempts to access localStorage or make direct API calls outside the SDK                              | This is not blocked at runtime (no sandbox). The SDK documentation MUST strongly recommend against direct API calls and localStorage access. Runtime CSP sandboxing (iframe or Shadow DOM) is explicitly out of scope for this spec — see Section 10. A future spec may introduce sandboxing if the ecosystem requires it.                                 |
| 11  | The Extension Registry cache is stale (a plugin was just activated)                                                                    | The registry cache (Redis, TTL 120s) may serve stale data for up to 135s. For immediate consistency, plugin activation triggers a cache invalidation event. SSE (ADR-023) can notify connected frontends.                                                                                                                                                  |
| 12  | Over 50 contributions target a single slot                                                                                             | The `<ExtensionSlot>` component renders all contributions but paginates/virtualizes if the count exceeds a configurable threshold (default: 20). Contributions beyond the threshold are accessible via a "Show more" affordance.                                                                                                                           |
| 13  | Plugin A updates and changes a slot's `contextSchema` (breaking contract change)                                                       | The Extension Registry detects the schema change during manifest sync, logs a warning listing all affected contributions, and sets their `validation_status` to `schema_changed`. Affected contributions continue to render (with old props) but a warning is shown in the admin settings. The slot owner can see dependents via FR-031 before publishing. |
| 14  | Plugin A updates and removes a previously declared slot                                                                                | The registry performs full replacement of the plugin's slot records. Newly-orphaned contributions (previously valid) are set to `validation_status: target_not_found`. The registry emits an `extension.slot.removed` event via the event bus (ADR-005) so contributing plugins can react. Warning logged with list of affected contributions.             |

## 7. Data Requirements

### New Database Tables

#### `extension_slots`

Stores slot declarations from plugin manifests.

| Column                | Type           | Constraints                                       | Description                                    |
| --------------------- | -------------- | ------------------------------------------------- | ---------------------------------------------- |
| `id`                  | `UUID`         | PK, DEFAULT gen_random_uuid()                     | Unique slot record ID                          |
| `plugin_id`           | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Declaring plugin                               |
| `slot_id`             | `VARCHAR(128)` | NOT NULL                                          | Slot identifier (unique within plugin)         |
| `type`                | `VARCHAR(32)`  | NOT NULL, CHECK IN (action, panel, form, toolbar) | Contribution type accepted by this slot        |
| `context_schema`      | `JSONB`        | NOT NULL, DEFAULT '{}'                            | JSON Schema describing context props           |
| `required_permission` | `VARCHAR(255)` | NOT NULL                                          | Permission required to contribute to this slot |
| `label`               | `VARCHAR(255)` | NULL                                              | Human-readable slot label (for admin UI)       |
| `description`         | `TEXT`         | NULL                                              | Slot description (for developer docs)          |
| `is_active`           | `BOOLEAN`      | NOT NULL, DEFAULT true                            | False when plugin deactivated (soft-delete)    |
| `created_at`          | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                |
| `updated_at`          | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                |

**Indexes:**

- UNIQUE (`plugin_id`, `slot_id`)
- INDEX (`is_active`, `type`) — for filtered queries

#### `extension_contributions`

Stores contribution registrations from plugin manifests.

| Column                   | Type           | Constraints                                       | Description                                                     |
| ------------------------ | -------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `id`                     | `UUID`         | PK, DEFAULT gen_random_uuid()                     | Unique contribution record ID                                   |
| `contributing_plugin_id` | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Plugin providing the contribution                               |
| `target_plugin_id`       | `VARCHAR`      | FK → plugins.id, NOT NULL                         | Plugin owning the target slot                                   |
| `target_slot_id`         | `VARCHAR(128)` | NOT NULL                                          | Slot to contribute to                                           |
| `type`                   | `VARCHAR(32)`  | NOT NULL, CHECK IN (action, panel, form, toolbar) | Contribution type                                               |
| `widget_name`            | `VARCHAR(128)` | NOT NULL                                          | PluginWidget component name (from manifest)                     |
| `label`                  | `VARCHAR(255)` | NOT NULL                                          | Human-readable contribution label                               |
| `description`            | `TEXT`         | NULL                                              | Contribution description                                        |
| `icon`                   | `VARCHAR(64)`  | NULL                                              | Lucide icon name                                                |
| `preview_url`            | `VARCHAR(512)` | NULL                                              | Static image URL for admin preview (FR-033)                     |
| `priority`               | `INTEGER`      | NOT NULL, DEFAULT 100, CHECK 0..999               | Rendering priority (lower = first)                              |
| `is_active`              | `BOOLEAN`      | NOT NULL, DEFAULT true                            | False when plugin deactivated (soft-delete)                     |
| `validation_status`      | `VARCHAR(32)`  | NOT NULL, DEFAULT 'pending'                       | pending, valid, target_not_found, type_mismatch, schema_changed |
| `created_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                                 |
| `updated_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()                           |                                                                 |

**Indexes:**

- UNIQUE (`contributing_plugin_id`, `target_plugin_id`, `target_slot_id`)
- INDEX (`target_plugin_id`, `target_slot_id`, `is_active`) — for slot rendering queries
- INDEX (`contributing_plugin_id`, `is_active`) — for cascade-disable

#### `workspace_extension_visibility`

Workspace-level toggle for individual contributions.

| Column            | Type          | Constraints                                                 | Description            |
| ----------------- | ------------- | ----------------------------------------------------------- | ---------------------- |
| `workspace_id`    | `UUID`        | FK → workspaces.id ON DELETE CASCADE, NOT NULL              | Workspace              |
| `contribution_id` | `UUID`        | FK → extension_contributions.id ON DELETE CASCADE, NOT NULL | Contribution           |
| `is_visible`      | `BOOLEAN`     | NOT NULL, DEFAULT true                                      | Workspace admin toggle |
| `updated_at`      | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW()                                     |                        |

**Indexes:**

- PK (`workspace_id`, `contribution_id`) — composite primary key
- INDEX (`contribution_id`) — for cascade queries

#### `extensible_entities`

Stores entity type declarations from plugin manifests.

| Column         | Type           | Constraints                   | Description                                 |
| -------------- | -------------- | ----------------------------- | ------------------------------------------- |
| `id`           | `UUID`         | PK, DEFAULT gen_random_uuid() | Unique entity record ID                     |
| `plugin_id`    | `VARCHAR`      | FK → plugins.id, NOT NULL     | Declaring plugin                            |
| `entity_type`  | `VARCHAR(128)` | NOT NULL                      | Entity type name (e.g., `contacts`)         |
| `field_schema` | `JSONB`        | NOT NULL, DEFAULT '{}'        | JSON Schema describing base entity fields   |
| `is_active`    | `BOOLEAN`      | NOT NULL, DEFAULT true        | False when plugin deactivated (soft-delete) |
| `created_at`   | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                             |
| `updated_at`   | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                             |

**Indexes:**

- UNIQUE (`plugin_id`, `entity_type`)
- INDEX (`is_active`)

#### `data_extensions`

Stores data extension registrations from plugin manifests.

| Column                   | Type           | Constraints                   | Description                                 |
| ------------------------ | -------------- | ----------------------------- | ------------------------------------------- |
| `id`                     | `UUID`         | PK, DEFAULT gen_random_uuid() | Unique extension record ID                  |
| `contributing_plugin_id` | `VARCHAR`      | FK → plugins.id, NOT NULL     | Plugin providing the data extension         |
| `target_plugin_id`       | `VARCHAR`      | FK → plugins.id, NOT NULL     | Plugin owning the entity type               |
| `target_entity_type`     | `VARCHAR(128)` | NOT NULL                      | Entity type being extended                  |
| `field_schema`           | `JSONB`        | NOT NULL                      | JSON Schema describing the sidecar fields   |
| `resolver_endpoint`      | `VARCHAR(512)` | NOT NULL                      | URL path to the sidecar data endpoint       |
| `is_active`              | `BOOLEAN`      | NOT NULL, DEFAULT true        | False when plugin deactivated (soft-delete) |
| `created_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                             |
| `updated_at`             | `TIMESTAMPTZ`  | NOT NULL, DEFAULT NOW()       |                                             |

**Indexes:**

- UNIQUE (`contributing_plugin_id`, `target_plugin_id`, `target_entity_type`)
- INDEX (`target_plugin_id`, `target_entity_type`, `is_active`) — for resolution queries

### Schema Placement

Per ADR-002 (schema-per-tenant), these tables store cross-tenant registry data
(similar to the `plugins` table itself). They belong in the **core shared
schema**, consistent with ADR-025's bounded exception pattern. Tenant isolation
is enforced at the application layer via the tenant context middleware, and
workspace visibility is scoped via the `workspace_extension_visibility` table.

**RESOLVED**: Core shared schema placement confirmed. The `/forge-plan` phase
MUST create ADR-031 documenting this as a bounded exception to ADR-002
(schema-per-tenant), following the same pattern as ADR-025 (audit_logs).
Mandatory safeguards: single `ExtensionRegistryRepository` access path,
required `tenantId` parameter on all tenant-scoped methods, tenant context
middleware enforcement, and PostgreSQL RLS as defense-in-depth.

## 8. API Requirements

### Extension Registry APIs

| Method | Path                                                                             | Description                                   | Auth            |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------- | --------------- |
| GET    | `/api/v1/extension-registry/slots`                                               | List all active extension slots               | Required        |
| GET    | `/api/v1/extension-registry/slots/:pluginId`                                     | List slots declared by a specific plugin      | Required        |
| GET    | `/api/v1/extension-registry/contributions`                                       | List all active contributions (filterable)    | Required        |
| GET    | `/api/v1/extension-registry/contributions?slotId=X&workspaceId=Y`                | Contributions for a slot in a workspace       | Required        |
| GET    | `/api/v1/extension-registry/entities`                                            | List all extensible entity types              | Required        |
| GET    | `/api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions` | Aggregate sidecar data for an entity instance | Required        |
| PATCH  | `/api/v1/workspaces/:workspaceId/extension-visibility/:contributionId`           | Toggle contribution visibility for workspace  | Workspace Admin |
| GET    | `/api/v1/extension-registry/slots/:pluginId/:slotId/dependents`                  | List plugins contributing to a specific slot  | Required        |

### Plugin Sidecar Data Endpoint (implemented by contributing plugins)

| Method | Path                                                         | Description                                | Auth               |
| ------ | ------------------------------------------------------------ | ------------------------------------------ | ------------------ |
| GET    | `/api/v1/plugins/:pluginId/extensions/:entityType/:entityId` | Return sidecar data for an entity instance | Service-to-service |

### Error Codes

| Code                          | HTTP | Description                                   |
| ----------------------------- | ---- | --------------------------------------------- |
| `SLOT_NOT_FOUND`              | 404  | Target slot does not exist or is inactive     |
| `CONTRIBUTION_NOT_FOUND`      | 404  | Contribution ID does not exist                |
| `ENTITY_TYPE_NOT_FOUND`       | 404  | Extensible entity type does not exist         |
| `EXTENSION_PERMISSION_DENIED` | 403  | Contributing plugin lacks required permission |
| `EXTENSION_TYPE_MISMATCH`     | 400  | Contribution type doesn't match slot type     |
| `WORKSPACE_VISIBILITY_DENIED` | 403  | User is not a workspace admin                 |

## 9. UX/UI Notes

### Host Plugin View (Slot Owner)

- The `<ExtensionSlot>` component is embedded in the host plugin's React
  component tree at the location where contributions should appear.
- For `type: "action"` — renders as a horizontal row of buttons/links.
- For `type: "panel"` — renders as a vertical stack of read-only info cards.
- For `type: "form"` — renders as tabbed sections within the host view.
- For `type: "toolbar"` — renders as inline toolbar buttons alongside the
  host's existing toolbar.
- Each contribution has a subtle visual border or separator to distinguish
  it from the host's native UI.
- A small "extension" icon badge on contributed components indicates they
  come from another plugin (optional, can be disabled by slot owner).

### Workspace Admin Settings

- A new "Extensions" tab in workspace settings lists all available
  contributions grouped by host plugin and slot.
- Each contribution has a toggle (visible/hidden) and shows the
  contributing plugin name, icon, and description.
- Disabled (tenant-level) contributions appear grayed out with a
  tooltip explaining they must be enabled at tenant level first.

### Tenant Admin Settings

- A new "Extension Permissions" section in plugin management shows
  which permissions each plugin requires for contributing to slots.
- Permissions can be granted/revoked per plugin.

### Accessibility

- `<ExtensionSlot>` wraps contributions in `role="region"` with
  `aria-label="Extension: {slotLabel}"`.
- Error boundary fallback includes `role="alert"` for screen reader
  announcement.
- Loading skeletons include `aria-busy="true"` and `aria-label="Loading
extension"`.
- Contribution toggle in workspace settings uses native checkbox with
  associated `<label>`.
- All per Constitution Art. 1.3 (WCAG 2.1 AA).

## 10. Out of Scope

- **Runtime CSP sandboxing** for contributed components — contributions
  run in the same React tree as the host. Full sandbox isolation via
  iframe or Shadow DOM is deferred.
- **Bidirectional data binding** between host and contribution — contributions
  receive context props (read-only). Two-way communication must use the
  event system (ADR-005) or shared data.
- **Visual drag-and-drop reordering** of contributions by workspace admins —
  priority is set in the manifest; admin ordering is deferred.
- **Custom field UI builder** — a no-code UI for defining sidecar data fields
  is deferred. Data extensions are declared in code (manifest).
- **Cross-tenant extension marketplace** — discovering extensions from plugins
  not installed in the tenant is deferred to the marketplace spec.
- **Contribution versioning** — extension slot contracts are versioned via the
  declaring plugin's semver (per discovery Q&A). Per-slot or per-contribution
  versioning is deferred.
- **Server-side rendering (SSR)** of contributed components — all rendering
  is client-side via Module Federation.

## 11. Open Questions

- **RESOLVED**: CSP sandboxing for contributed components is deferred to a
  future spec. For this spec, contributions run in the same React tree as the
  host (no sandbox). The SDK documentation MUST strongly recommend against
  direct API calls, localStorage access, and script injection. "Runtime CSP
  sandboxing" is listed in Out of Scope (Section 10). (Edge case #10)

- **RESOLVED**: Extension Registry tables (`extension_slots`,
  `extension_contributions`, `workspace_extension_visibility`,
  `extensible_entities`, `data_extensions`) are placed in the **core shared
  schema**. This follows the ADR-025 bounded exception pattern. The
  `/forge-plan` phase MUST create ADR-031 documenting this exception with
  mandatory tenant isolation safeguards. (Section 7, Schema Placement)

- **RESOLVED**: The `<ExtensionSlot>` component renders ALL visible
  contributions (no hard cap). When the count exceeds a configurable
  `virtualizationThreshold` prop (default: 20), the component switches to
  React virtualization (virtual scrolling) with a "Show more" affordance
  to reveal additional contributions. No contributions are silently hidden.
  (Edge case #12)

- **RESOLVED (Pre-mortem #6)**: When a plugin is updated to a new version that
  changes its slot declarations, the registry performs a **full replacement**
  of the plugin's slot records with orphan detection: newly-orphaned
  contributions are set to `validation_status: target_not_found`, an
  `extension.slot.removed` event is emitted (ADR-005), and a warning is logged.
  See Edge Case #14.

## 12. Implementation Scope

> **Note**: All paths are relative to the working directory (project root).

### New Components

| Component Type    | Path                                                                            | Description                                                              |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Service           | `apps/core-api/src/modules/extension-registry/extension-registry.service.ts`    | Extension Registry — CRUD for slots, contributions, entities, visibility |
| Controller        | `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts` | REST API for Extension Registry                                          |
| Schema/Validators | `apps/core-api/src/modules/extension-registry/extension-registry.schema.ts`     | Zod schemas for all API inputs                                           |
| React Component   | `apps/web/src/components/extensions/ExtensionSlot.tsx`                          | `<ExtensionSlot>` host component with error boundaries                   |
| React Hook        | `apps/web/src/hooks/useExtensionSlot.ts`                                        | `useExtensionSlot` hook for slot rendering                               |
| React Component   | `apps/web/src/components/extensions/ExtensionContribution.tsx`                  | Individual contribution wrapper with error boundary                      |
| React Component   | `apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx`                  | Loading skeleton for extension slots                                     |
| SDK Client        | `packages/sdk/src/data-extension-client.ts`                                     | `DataExtensionClient` for sidecar data                                   |
| Types             | `packages/types/src/extension.ts`                                               | All extension point type definitions                                     |
| DB Migration      | `packages/database/prisma/migrations/xxx_extension_points/`                     | 5 new tables for extension registry                                      |
| Admin Page        | `apps/web/src/routes/settings/extensions.tsx`                                   | Workspace admin extension visibility settings                            |
| Admin Page        | `apps/super-admin/src/routes/plugins/extension-permissions.tsx`                 | Tenant admin extension permission management                             |

### Modified Components

| Path                                     | Modification Type | Description                                                                                       |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `packages/types/src/plugin.ts`           | Enhancement       | Add `extensionSlots`, `contributions`, `extensibleEntities`, `dataExtensions` to `PluginManifest` |
| `packages/types/src/index.ts`            | Enhancement       | Export new extension types                                                                        |
| `packages/sdk/src/types.ts`              | Enhancement       | Add extension-related SDK types                                                                   |
| `packages/sdk/src/index.ts`              | Enhancement       | Export `DataExtensionClient`                                                                      |
| `packages/sdk/src/plugin-base.ts`        | Enhancement       | Add `dataExtensions` client to `PlexicaPlugin` base class                                         |
| `apps/core-api/src/modules/plugin/`      | Enhancement       | Plugin activation/deactivation triggers registry sync                                             |
| `apps/web/src/routes/settings/`          | Enhancement       | Add "Extensions" tab to workspace settings                                                        |
| `packages/database/prisma/schema.prisma` | Enhancement       | Add 5 new models for extension tables                                                             |

### Documentation Updates

| Path                                   | Section          | Update Description                                    |
| -------------------------------------- | ---------------- | ----------------------------------------------------- |
| `docs/ARCHITECTURE.md`                 | Plugin System    | Document extension point architecture                 |
| `docs/PLUGIN_SDK.md` (new or existing) | Extension Points | Developer guide for declaring slots and contributions |
| `docs/SECURITY.md`                     | Plugin Security  | Document extension permission model                   |

## 13. Constitution Compliance

| Article | Status    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | **Security First** (1.2.1): Permission-gated contributions; no rendering without explicit permission grant. **Multi-tenancy** (1.2.2): Tenant isolation enforced via middleware; workspace visibility table scoped. **Plugin System Integrity** (1.2.4): Contributions do not bypass core security; error boundaries prevent cascade failures. **UX Standards** (1.3): WCAG 2.1 AA via ARIA landmarks, loading states, error announcements. |
| Art. 2  | COMPLIANT | No new npm dependencies required. Extension points use existing React, Module Federation (ADR-004/011), Redis, Prisma, and SDK infrastructure. New tables use approved PostgreSQL + Prisma stack.                                                                                                                                                                                                                                           |
| Art. 3  | COMPLIANT | **Feature modules** (3.2): New `extension-registry` module with controller → service → repository layers. **Service layer** (3.3): All DB access via Prisma; no raw SQL. **Tenant context** (3.4): Middleware enforces tenant isolation. **API Standards** (3.4): RESTful naming, versioned under `/api/v1/`.                                                                                                                               |
| Art. 4  | COMPLIANT | **Coverage** (4.1): ≥85% target for extension-registry module (security-adjacent code). **Performance** (4.3): Registry queries < 100ms P95, slot rendering < 500ms P95. **Review** (4.2): `/forge-review` required before merge.                                                                                                                                                                                                           |
| Art. 5  | COMPLIANT | **RBAC** (5.1): Extension contributions gated by permission. **Input validation** (5.3): Zod schemas for all API inputs. **Tenant isolation** (5.2): Workspace visibility scoped via tenant context.                                                                                                                                                                                                                                        |
| Art. 6  | COMPLIANT | **Error classification** (6.1): Clear operational errors (SLOT_NOT_FOUND, EXTENSION_PERMISSION_DENIED) vs programmer errors. **Error format** (6.2): Standard `{ error: { code, message, details } }`. **Logging** (6.3): Structured Pino logging with slotId, pluginId, tenantId.                                                                                                                                                          |
| Art. 7  | COMPLIANT | **Files** (7.1): `extension-registry.service.ts`, `extension-slot.tsx` (kebab-case). **DB** (7.2): `extension_slots`, `extension_contributions` (snake_case). **API** (7.3): `/api/v1/extension-registry/slots` (plural, kebab-case).                                                                                                                                                                                                       |
| Art. 8  | COMPLIANT | **Unit tests** (8.1): Service logic, Zod validation, priority ordering. **Integration tests** (8.1): API endpoints, DB operations, permission checks. **E2E tests** (8.1): Slot rendering, contribution loading, workspace visibility toggle. **Deterministic** (8.2): In-memory registry adapter for unit tests.                                                                                                                           |
| Art. 9  | COMPLIANT | **Feature flags** (9.1.1): Extension points gated behind `extension_points_enabled` tenant feature flag. **Safe migrations** (9.1.3): Additive tables only; no breaking schema changes. **Health checks** (9.2): Extension Registry health check added to `/health` endpoint dependency list.                                                                                                                                               |

---

## Cross-References

| Document     | Path                                                          |
| ------------ | ------------------------------------------------------------- |
| Constitution | `.forge/constitution.md`                                      |
| ADR-004      | `.forge/knowledge/adr/adr-004-module-federation.md`           |
| ADR-005      | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`       |
| ADR-011      | `.forge/knowledge/adr/adr-011-vite-module-federation.md`      |
| ADR-014      | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`    |
| ADR-018      | `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`     |
| ADR-019      | `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md` |
| ADR-021      | `.forge/knowledge/adr/adr-021-pino-frontend-logging.md`       |
| ADR-023      | `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md` |
| Spec 004     | `.forge/specs/004-plugin-system/spec.md`                      |
| Spec 010     | `.forge/specs/010-frontend-production-readiness/spec.md`      |
| Spec 011     | `.forge/specs/011-workspace-hierarchy-templates/spec.md`      |
| Plugin Types | `packages/types/src/plugin.ts`                                |
| Plugin SDK   | `packages/sdk/src/plugin-base.ts`                             |
| Plan         | <!-- Created by /forge-plan -->                               |
| Tasks        | <!-- Created by /forge-tasks -->                              |
