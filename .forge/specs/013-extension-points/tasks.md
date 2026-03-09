# Tasks: 013 - Extension Points

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                       |
| ------ | ------------------------------------------- |
| Status | Complete                                    |
| Author | forge-scrum                                 |
| Date   | 2026-03-08                                  |
| Spec   | `.forge/specs/013-extension-points/spec.md` |
| Plan   | `.forge/specs/013-extension-points/plan.md` |

---

## Summary Table

| Task    | Title                                   | Phase | Pts    | Parallel   | Sprint |
| ------- | --------------------------------------- | ----- | ------ | ---------- | ------ |
| T013-01 | Extension Type Definitions              | 1     | 3      | No         | 010    |
| T013-02 | Database Migration — Extension Tables   | 1     | 5      | No         | 010    |
| T013-03 | Extension Feature Flag                  | 1     | 2      | [P]        | 010    |
| T013-04 | Zod Validation Schemas                  | 1     | 3      | [P]        | 010    |
| T013-05 | Extension Registry Repository           | 1     | 5      | No         | 010    |
| T013-06 | Extension Registry Service              | 1     | 5      | No         | 010    |
| T013-07 | Controller — Slot & Contribution Routes | 2     | 5      | [P]        | 010    |
| T013-08 | Controller — Entity & Visibility Routes | 2     | 5      | [P]        | 010    |
| T013-09 | Plugin Lifecycle Integration            | 2     | 3      | No         | 010    |
| T013-10 | SDK DataExtensionClient                 | 2     | 3      | [P]        | 010    |
| T013-11 | ExtensionSlot Component                 | 3     | 5      | No         | 011    |
| T013-12 | ExtensionContribution Component         | 3     | 3      | No         | 011    |
| T013-13 | Skeleton & Error Fallback Components    | 3     | 2      | [P]        | 011    |
| T013-14 | useExtensionSlot Hook                   | 3     | 2      | [P]        | 011    |
| T013-15 | VirtualizedSlotContainer                | 3     | 2      | [P]        | 011    |
| T013-16 | Workspace Extension Settings Page       | 3     | 3      | No         | 011    |
| T013-17 | Tenant Admin Extension Permissions Page | 3     | 3      | [P]        | 011    |
| T013-18 | SlotInspectorOverlay (dev-only)         | 3     | 1      | [P]        | 011    |
| T013-19 | Component Barrel Export                 | 3     | 1      | [P]        | 011    |
| T013-20 | Service Unit Tests                      | 4     | 3      | [P]        | 011    |
| T013-21 | Schema Validation Unit Tests            | 4     | 2      | [P]        | 011    |
| T013-22 | API Integration Tests                   | 4     | 5      | No         | 011    |
| T013-23 | Tenant Isolation Integration Tests      | 4     | 3      | [P]        | 011    |
| T013-24 | Frontend Component Tests                | 4     | 3      | [P]        | 011    |
| T013-25 | E2E Tests                               | 4     | 3      | No         | 011    |
| T013-26 | Architecture Documentation              | 5     | 2      | [P]        | 011    |
| T013-27 | Decision Log & Cross-References         | 5     | 1      | [P]        | 011    |
| T013-28 | Health Check Integration                | 5     | 1      | [P]        | 011    |
| T013-29 | Feature Flag Rollout Documentation      | 5     | 1      | [P]        | 011    |
| **—**   | **Total**                               | **5** | **85** | **14 [P]** | **—**  |

---

## Sprint Allocation

| Sprint | Phases      | Tasks                   | Points | Capacity |
| ------ | ----------- | ----------------------- | ------ | -------- |
| 010    | Phase 1 + 2 | T013-01 through T013-10 | 39 pts | ~45 cap  |
| 011    | Phase 3–5   | T013-11 through T013-29 | 46 pts | ~50 cap  |

> Sprint 010 starts after Sprint 009 closes. Sprint 011 follows immediately.
> At 40–50 pts/sprint velocity (observed from Sprint 006–009), both sprints
> fit within the 2-week cadence. Phase 1 foundation work (T013-01–06) must
> complete before Phase 2 work (T013-07–10) begins within Sprint 010.

---

## Legend

- `[FR-NNN]` — Requirement being implemented (traceability)
- `[NFR-NNN]` — Non-functional requirement being satisfied
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h (split)
- Status: `[ ]` pending · `[x]` done · `[-]` skipped

---

## Phase 1: Core Infrastructure (23 pts)

**Entry criteria**: ADR-031 accepted, Spec 013 approved.  
**Exit criteria**: All 5 tables created with RLS active, repository passing unit tests, types exported from `@plexica/types`.

---

- [x] **T013-01** `[L]` `[FR-027]` `[FR-030]` Extension Type Definitions
  - **Files to create**:
    - `packages/types/src/extension.ts`
  - **Files to modify**:
    - `packages/types/src/plugin.ts` — add optional `extensionSlots`, `contributions`, `extensibleEntities`, `dataExtensions` arrays to `PluginManifest`
    - `packages/types/src/index.ts` — add `export * from './extension.js'`
  - **Description**: Define all TypeScript interfaces and enums for the extension system. This is the shared type contract consumed by core-api, SDK, and all frontend components. Must be backward-compatible (all new fields optional).
  - **Key exports**: `ExtensionSlotDeclaration`, `ContributionDeclaration`, `ExtensibleEntityDeclaration`, `DataExtensionDeclaration`, `ExtensionSlotType` (`'action' | 'panel' | 'form' | 'toolbar'`), `ContributionValidationStatus` (`'pending' | 'valid' | 'target_not_found' | 'type_mismatch' | 'schema_changed'`), `ResolvedContribution`, `AggregatedExtensionData`, `DependentsResult`.
  - **Spec reference**: Plan §4.16, FR-027, FR-030
  - **Dependencies**: None
  - **Estimated**: `[L]`

---

- [x] **T013-02** `[L]` `[FR-023]` `[ADR-031]` Database Migration — Create Extension Tables
  - **Files to create**:
    - `packages/database/prisma/migrations/YYYYMMDDHHMMSS_create_extension_tables/migration.sql` — 5 tables + all indexes + CHECK constraints + FK constraints
    - `packages/database/prisma/migrations/YYYYMMDDHHMMSS_extension_tables_rls/migration.sql` — RLS policies (ADR-031 Safeguard 4)
  - **Files to modify**:
    - `packages/database/prisma/schema.prisma` — add 5 new Prisma models: `ExtensionSlot`, `ExtensionContribution`, `WorkspaceExtensionVisibility`, `ExtensibleEntity`, `DataExtension`
  - **Description**: Create the 5 extension registry tables (see plan §2.1 for full column specs) with all indexes from §2.3. Run `pnpm db:generate` after to regenerate the Prisma client. Second migration enables RLS on all 5 tables with tenant isolation and Super Admin bypass policies.
  - **Key constraints**: `extension_slots` UNIQUE `(plugin_id, slot_id)`; `extension_contributions` UNIQUE `(contributing_plugin_id, target_plugin_id, target_slot_id)`; `workspace_extension_visibility` composite PK `(workspace_id, contribution_id)`; `priority` CHECK `0..999`.
  - **Gotcha**: Migrations are additive-only. Do NOT modify existing tables. Both migrations must be forward-only (Art. 9.1.3).
  - **Spec reference**: Plan §2.1–2.4, FR-023
  - **Dependencies**: T013-01 (need type definitions before modelling Prisma models)
  - **Estimated**: `[L]`

---

- [x] **T013-03** `[M]` `[P]` `[Art.9.1]` Extension Feature Flag
  - **Files to modify**:
    - Tenant settings / feature flags table (or feature flag service) — add `extension_points_enabled` boolean, default `false`
    - `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts` — feature flag gate on all routes (when disabled, return 404)
  - **Description**: Add the `extension_points_enabled` feature flag to the tenant settings model. All extension-registry routes and the `<ExtensionSlot>` component check this flag. When disabled: API returns 404 and the frontend component renders nothing (zero overhead). Enables gradual rollout per tenant.
  - **Note**: This task can proceed in parallel with T013-04 once T013-02 schema is done.
  - **Spec reference**: Plan §T013-03, Art. 9.1.1
  - **Dependencies**: T013-02
  - **Estimated**: `[M]`

---

- [x] **T013-04** `[M]` `[P]` `[FR-019]` `[FR-020]` `[FR-021]` `[FR-022]` `[FR-031]` Zod Validation Schemas
  - **File to create**:
    - `apps/core-api/src/modules/extension-registry/extension-registry.schema.ts`
  - **Description**: Define all Zod input validation schemas for the 8 API endpoints (Art. 5.3). Strict type validation for slot types (must be `action | panel | form | toolbar`), priority ranges (0–999), UUID formats, and boolean toggles.
  - **Key schemas** (plan §4.4):
    - `GetSlotsQuerySchema` — `pluginId?`, `type?`
    - `GetContributionsQuerySchema` — `slotId?`, `workspaceId?`, `pluginId?`, `type?`
    - `EntityExtensionParamsSchema` — `pluginId`, `entityType`, `entityId`
    - `VisibilityPatchSchema` — `isVisible: boolean`
    - `SlotDependentsParamsSchema` — `pluginId`, `slotId`
  - **Gotcha**: Reject null bytes in string fields (see lessons-learned anti-pattern from i18n spec).
  - **Spec reference**: Plan §4.4, Art. 5.3
  - **Dependencies**: T013-01 (need `ExtensionSlotType` enum)
  - **Estimated**: `[M]`

---

- [x] **T013-05** `[XL]` `[FR-002]` `[FR-004]` `[FR-011]` `[FR-012]` `[FR-013]` `[FR-022]` `[FR-024]` `[ADR-031]` Extension Registry Repository
  - **File to create**:
    - `apps/core-api/src/modules/extension-registry/extension-registry.repository.ts`
  - **Description**: Single access path for all 5 extension tables (ADR-031 Safeguard 1). This class MUST include a header comment referencing ADR-031. All tenant-scoped methods MUST have a required `tenantId` parameter (ADR-031 Safeguard 2). Cross-tenant admin methods MUST have explicitly descriptive names with a role check (Safeguard 3).
  - **Key methods** (plan §4.1):
    - `upsertSlots(tenantId, pluginId, slots[])` — sync slot declarations from manifest
    - `upsertContributions(tenantId, pluginId, contributions[])` — sync contribution declarations
    - `upsertEntities(tenantId, pluginId, entities[])` — sync entity type declarations
    - `upsertDataExtensions(tenantId, pluginId, extensions[])` — sync data extension declarations
    - `getSlots(tenantId, filters?)` / `getSlotsByPlugin(tenantId, pluginId)` — list active slots
    - `getContributionsForSlot(tenantId, slotKey, workspaceId)` — resolved contributions with visibility
    - `getContributions(tenantId, filters?)` — list with filters
    - `getEntities(tenantId)` / `getDataExtensions(tenantId, pluginId, entityType)`
    - `setVisibility(workspaceId, contributionId, isVisible)` — workspace admin toggle
    - `getSlotDependents(tenantId, pluginId, slotId)` — contributing plugins list
    - `deactivateByPlugin(pluginId)` / `reactivateByPlugin(pluginId)` — soft-delete / restore
    - `validateContributions(tenantId, pluginId)` — type_mismatch / target_not_found detection
  - **Gotcha**: All queries must use parameterized Prisma — never `$queryRawUnsafe`.
  - **Spec reference**: Plan §4.1, ADR-031
  - **Dependencies**: T013-02 (Prisma models must exist), T013-01 (types)
  - **Estimated**: `[XL]` — split into upsert methods (first session) + query/resolve methods (second session) if needed

---

- [x] **T013-06** `[XL]` `[FR-002]` `[FR-006]` `[FR-015]` `[FR-018]` `[FR-024]` `[FR-026]` `[NFR-004]` Extension Registry Service
  - **File to create**:
    - `apps/core-api/src/modules/extension-registry/extension-registry.service.ts`
  - **Description**: Business logic layer orchestrating manifest sync, contribution resolution, data extension aggregation, and Redis cache management. This is the most complex file in the spec.
  - **Key methods** (plan §4.2):
    - `syncManifest(tenantId, pluginId, manifest)` — parse all 4 manifest arrays, upsert via repository
    - `resolveContributions(tenantId, slotId, workspaceId, userRoles)` — ABAC permission check (ADR-017) + workspace visibility filter + priority sort
    - `resolveDataExtensions(tenantId, pluginId, entityType, entityId)` — parallel sidecar fetches with `Promise.allSettled`, 3s timeout per plugin (FR-018), exclude timed-out with `warnings`
    - `toggleVisibility(workspaceId, contributionId, isVisible, userRole)` — workspace admin role guard
    - `onPluginActivated(tenantId, pluginId, manifest)` — syncManifest + validateContributions + cache invalidation
    - `onPluginDeactivated(pluginId)` — repository.deactivateByPlugin + cache invalidation + emit `extension.slot.removed` event (Edge Case #14)
    - `invalidateCache(tenantId, patterns)` — Redis `DEL ext:slots:{tenantId}`, `ext:contributions:{tenantId}:*`, `ext:entities:{tenantId}`
  - **Redis cache keys**: `ext:slots:{tenantId}`, `ext:contributions:{tenantId}:{slotKey}`, `ext:entities:{tenantId}`. TTL = 120s ± random(0..30)s jitter to prevent stampede (NFR-004).
  - **Gotcha**: `resolveDataExtensions` must use `Promise.allSettled` (not `Promise.all`) so one plugin timeout doesn't fail all others.
  - **Spec reference**: Plan §4.2, FR-002, FR-006, FR-015, FR-018, FR-024, FR-026, NFR-004
  - **Dependencies**: T013-05 (repository), T013-03 (feature flag), T013-04 (schemas for validation)
  - **Estimated**: `[XL]` — split into sync/lifecycle methods (session 1) + resolution/caching methods (session 2)

---

## Phase 2: Plugin SDK & API (16 pts)

**Entry criteria**: Phase 1 complete — repository, service, types, and schema all done.  
**Exit criteria**: All 8 API endpoints returning correct responses, plugin activation syncs manifest, SDK DataExtensionClient exported.

---

- [x] **T013-07** `[L]` `[P]` `[FR-019]` `[FR-021]` `[FR-031]` Controller — Slot & Contribution Routes
  - **Files to create**:
    - `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts`
    - `apps/core-api/src/modules/extension-registry/index.ts` — module barrel (`export * from './extension-registry.controller.js'`, etc.)
  - **Description**: Fastify route registration for the slot/contribution side of the API. All routes check `extension_points_enabled` feature flag (404 when disabled), apply `authMiddleware` and `tenantMiddleware`, and validate inputs via Zod schemas from T013-04.
  - **Routes**:
    - `GET /api/v1/extension-registry/slots` — list active slots, optional `?pluginId` + `?type` filters (FR-019)
    - `GET /api/v1/extension-registry/slots/:pluginId` — slots for a specific plugin (FR-019)
    - `GET /api/v1/extension-registry/contributions` — contributions with `?slotId&workspaceId&pluginId&type` filters (FR-021)
    - `GET /api/v1/extension-registry/slots/:pluginId/:slotId/dependents` — dependent plugin count + list (FR-031)
  - **Error codes**: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `SLOT_NOT_FOUND` (404)
  - **Spec reference**: Plan §3.1, §3.2, §3.3, §3.7
  - **Dependencies**: T013-05, T013-06 (service), T013-04 (schemas)
  - **Estimated**: `[L]`

---

- [x] **T013-08** `[L]` `[P]` `[FR-015]` `[FR-020]` `[FR-022]` Controller — Entity & Visibility Routes
  - **File to modify**:
    - `apps/core-api/src/modules/extension-registry/extension-registry.controller.ts` — add remaining routes
  - **Description**: Add the entity discovery and visibility toggle endpoints to the controller. The `PATCH` visibility endpoint requires Workspace Admin role validation (403 if not workspace admin).
  - **Routes**:
    - `GET /api/v1/extension-registry/entities` — list extensible entity types from active plugins (FR-020)
    - `GET /api/v1/extension-registry/entities/:pluginId/:entityType/:entityId/extensions` — aggregate sidecar data from all contributing plugins (FR-015, FR-017, FR-018)
    - `PATCH /api/v1/workspaces/:workspaceId/extension-visibility/:contributionId` — workspace admin toggle (FR-022)
  - **Error codes**: `ENTITY_TYPE_NOT_FOUND` (404), `CONTRIBUTION_NOT_FOUND` (404), `WORKSPACE_VISIBILITY_DENIED` (403), `INVALID_REQUEST` (400)
  - **Spec reference**: Plan §3.4, §3.5, §3.6, §3.8
  - **Dependencies**: T013-07 (same controller file), T013-06 (service)
  - **Estimated**: `[L]`

---

- [x] **T013-09** `[M]` `[FR-002]` `[FR-024]` `[FR-025]` Plugin Lifecycle Integration — Manifest Sync
  - **Files to modify**:
    - `apps/core-api/src/modules/plugin/plugin.service.ts` — call `extensionRegistryService.onPluginActivated()` / `onPluginDeactivated()` in lifecycle hooks
    - `apps/core-api/src/index.ts` — register extension-registry module routes
  - **Description**: Wire `ExtensionRegistryService` into the existing plugin lifecycle. In `activatePlugin()` call `onPluginActivated(tenantId, pluginId, manifest)`. In `deactivatePlugin()` and force-uninstall call `onPluginDeactivated(pluginId)`. This satisfies the cascade-disable semantics (ADR-014): disabling a tenant plugin sets `is_active = false` on all contributions from that plugin.
  - **Also addresses**: TD-020 (force-uninstall stale scrape targets) — ensure `onPluginDeactivated` is called from the force-uninstall path.
  - **Spec reference**: Plan §T013-09, FR-002, FR-024, FR-025
  - **Dependencies**: T013-06 (service must exist), T013-07 (routes must be registered)
  - **Estimated**: `[M]`

---

- [x] **T013-10** `[M]` `[P]` `[FR-029]` SDK DataExtensionClient
  - **Files to create**:
    - `packages/sdk/src/data-extension-client.ts`
  - **Files to modify**:
    - `packages/sdk/src/plugin-base.ts` — add `dataExtensions` client initialization in `PlexicaPlugin`
    - `packages/sdk/src/index.ts` — export `DataExtensionClient`
    - `packages/sdk/src/types.ts` — add extension SDK type re-exports from `@plexica/types`
  - **Description**: SDK client for contributing plugins to register sidecar data handlers and serve them via the resolution protocol. `registerHandler(entityType, handler)` stores the handler; `serve(req, res)` routes incoming sidecar requests to the correct handler and validates the response shape against the declared `fieldSchema`. Validates `tenantId` on every request (NFR-006).
  - **Handler signature**: `(entityId: string, tenantId: string) => Promise<Record<string, unknown>>`
  - **Spec reference**: Plan §4.15, FR-016, FR-029
  - **Dependencies**: T013-01 (types), T013-06 (service defines the protocol)
  - **Estimated**: `[M]`

---

## Phase 3: Frontend Components (22 pts)

**Entry criteria**: Phase 2 complete — all 8 API endpoints functional and returning correct data.  
**Exit criteria**: `<ExtensionSlot>` renders contributions end-to-end, settings pages functional, WCAG 2.1 AA requirements met.

---

- [x] **T013-11** `[XL]` `[FR-007]` `[FR-008]` `[FR-009]` `[FR-010]` `[NFR-008]` `[NFR-011]` `[NFR-014]` ExtensionSlot Component
  - **File to create**:
    - `apps/web/src/components/extensions/ExtensionSlot.tsx`
  - **Description**: The core host component for rendering contributions inside a plugin's UI. Queries TanStack Query cache with `staleTime ≥ 60s` (NFR-014) for stale-while-revalidate semantics — registry queries must NOT fire on every mount. Loads each contribution via `React.lazy` + Module Federation (ADR-004/011). Renders in ascending priority order, ties broken alphabetically by plugin ID (FR-005). Wraps each in `<ExtensionContribution>`. Delegates to `<VirtualizedSlotContainer>` when count > `virtualizationThreshold` (default 20).
  - **Props**: `slotId: string`, `pluginId: string`, `context: Record<string, unknown>`, `label?: string`, `virtualizationThreshold?: number`, `className?: string`
  - **A11y**: `role="region"` on outer container, `aria-label="Extensions: {slotLabel}"`, `aria-busy="true"` while loading (NFR-011).
  - **On plugin disabled** (FR-010): query cache invalidation via SSE removes contribution from DOM without page reload.
  - **Spec reference**: Plan §4.5, design-spec §3.1 + §4.1–4.4
  - **Dependencies**: T013-12, T013-13, T013-14, T013-15 (all sub-components needed)
  - **Estimated**: `[XL]`

---

- [x] **T013-12** `[L]` `[FR-009]` `[US-007]` `[NFR-007]` `[NFR-008]` `[NFR-009]` `[NFR-012]` ExtensionContribution Component
  - **File to create**:
    - `apps/web/src/components/extensions/ExtensionContribution.tsx`
  - **Description**: Individual contribution wrapper with React Error Boundary, 5-second load timeout (NFR-009), and structured Pino logging on failure (NFR-012). Uses `React.lazy` + `Suspense` for Module Federation component loading. Shows a hover badge (8px `Puzzle` icon, `aria-hidden`) with tooltip "[PluginName] extension". Prop isolation: MUST NOT pass any host-internal state beyond the declared `contextSchema` + `PluginProps` (NFR-007).
  - **Error log fields**: `pluginId`, `slotId`, `contributionId`, `componentStack`, `tenantId`, `renderTimeMs` (Art. 6.3, ADR-021).
  - **On 5s timeout**: treat as error, show `<ExtensionErrorFallback compact>`.
  - **Spec reference**: Plan §4.6, design-spec §3.2
  - **Dependencies**: T013-13 (needs `ExtensionErrorFallback`)
  - **Estimated**: `[L]`

---

- [x] **T013-13** `[M]` `[P]` `[FR-008]` `[US-007]` `[NFR-011]` Skeleton & Error Fallback Components
  - **Files to create**:
    - `apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx` — 4 variants: `action-skeleton` (2 pill-shaped, 80×36px), `panel-skeleton` (full-width × 120px card), `form-skeleton` (tab bar + content area), `toolbar-skeleton` (3 icon circles, 32×32px). Uses `Skeleton` from `@plexica/ui`. `aria-busy="true"`, `aria-label="Loading extension"`.
    - `apps/web/src/components/extensions/ExtensionErrorFallback.tsx` — `compact` variant (inline "Extension unavailable" with `AlertTriangle`) for action/toolbar slots; `card` variant (card with dismiss button) for panel/form slots. `role="alert"`, `aria-live="assertive"`. Dismiss button: `aria-label="Dismiss failed extension from {pluginName}"`.
  - **Description**: Loading placeholder and error state components. Skeleton dimensions must match rendered contribution dimensions to prevent layout shift.
  - **Spec reference**: Plan §4.7, §4.8, design-spec §3.3, §3.4
  - **Dependencies**: None (pure presentational components)
  - **Estimated**: `[M]`

---

- [x] **T013-14** `[S]` `[P]` `[FR-028]` `[NFR-014]` useExtensionSlot Hook
  - **File to create**:
    - `apps/web/src/hooks/useExtensionSlot.ts`
  - **Description**: Minimal-boilerplate hook for slot-declaring plugins. Wraps TanStack Query with `staleTime ≥ 60s` for contribution resolution. Returns `{ contributions, isLoading, error, slotProps }` where `slotProps` is ready to spread onto `<ExtensionSlot>`. Handles the `extension_points_enabled` feature flag check — returns empty state when disabled to avoid unnecessary API calls.
  - **Signature**: `useExtensionSlot(slotId: string, context: Record<string, unknown>)`
  - **Spec reference**: Plan §4.9, FR-028, NFR-014
  - **Dependencies**: T013-11 (uses `<ExtensionSlot>` internally)
  - **Estimated**: `[S]`

---

- [x] **T013-15** `[M]` `[P]` `[Edge Case #12]` VirtualizedSlotContainer
  - **File to create**:
    - `apps/web/src/components/extensions/VirtualizedSlotContainer.tsx`
  - **Description**: Virtualized list container for slots with more than `virtualizationThreshold` (default: 20) contributions. Uses custom `IntersectionObserver` + `overflow-y: auto` virtualization (no new npm dependency per plan §6.1). Shows first 20 contributions, then a "Show N more extensions" button. On click: expand to full virtual scroll list.
  - **A11y**: "Show more" button `aria-label="Show {N} more extensions in {slotLabel}"`. Virtual list: `role="list"`, items `role="listitem"`. Keyboard: arrow keys navigate the list.
  - **Gotcha**: If performance testing with >50 contributions is insufficient, flagged as R-004 in plan — adding `react-window` would require a new ADR per Art. 2.2.
  - **Spec reference**: Plan §4.13, design-spec §3.9
  - **Dependencies**: None (pure presentational, used by T013-11)
  - **Estimated**: `[M]`

---

- [x] **T013-16** `[L]` `[FR-022]` `[FR-025]` `[FR-033]` `[US-003]` Workspace Extension Settings Page
  - **Files to create**:
    - `apps/web/src/routes/settings/extensions.tsx` — `ExtensionSettingsPanel` page per design-spec §3.5: accordion groups by host plugin → slot → `<ContributionRow>` rows with toggles. Optimistic UI on toggle with TanStack Query mutation; revert on failure with Toast error. Empty state: "No extensions available."
    - `apps/web/src/components/extensions/ContributionRow.tsx` — 4 variants: `enabled`, `disabled-tenant` (grayed, tooltip "Disabled by tenant admin"), `disabled-workspace` (toggle off), `warning` (`AlertTriangle` badge for `type_mismatch` / `target_not_found`). Shows `previewUrl` thumbnail (80×60px) when present (FR-033).
  - **Files to modify**:
    - `apps/web/src/routes/settings/index.tsx` — add "Extensions" tab linking to `/settings/extensions`
  - **A11y**: Accordion per design-spec §4.5; toggle `<Switch>` with `aria-label="Toggle {label} visibility"`; disabled toggles `aria-disabled="true"`.
  - **Spec reference**: Plan §4.10, §4.11, design-spec §3.5, §3.6, §4.5
  - **Dependencies**: T013-11, T013-12, T013-13 (component building blocks)
  - **Estimated**: `[L]`

---

- [x] **T013-17** `[L]` `[P]` `[FR-006]` `[US-006]` Tenant Admin Extension Permissions Page
  - **File to create**:
    - `apps/super-admin/src/routes/plugins/extension-permissions.tsx` — `ExtensionPermissionsPage` component per design-spec §3.7. Data table: Contributing Plugin | Target Slot | Required Permission | Status | Action. Grant/Revoke with confirmation dialog. New plugin row animated with yellow flash (`@keyframes highlight`). Disabled plugin rows grayed out.
  - **Description**: Tenant admin view for managing which plugins can contribute to which extension slots. Confirmation dialogs explain blast radius before grant/revoke. All dialogs: `role="dialog"`, focus-trapped, Esc to dismiss.
  - **A11y**: `<DataTable>` from `@plexica/ui` with `aria-sort`; Grant/Revoke `aria-label`; confirmation dialog per design-spec §4.6.
  - **Spec reference**: Plan §4.12, design-spec §3.7, §4.6, FR-006
  - **Dependencies**: T013-08 (needs PATCH visibility API endpoint)
  - **Estimated**: `[L]`

---

- [x] **T013-18** `[S]` `[P]` `[FR-028]` `[FR-031]` SlotInspectorOverlay (dev-only)
  - **File to create**:
    - `apps/web/src/components/extensions/SlotInspectorOverlay.tsx`
  - **Description**: Developer tool overlay activated by `Ctrl+Shift+E` in development mode only (`import.meta.env.DEV` guard — tree-shaken in production builds). Highlights all `<ExtensionSlot>` components with a dashed `--primary` border and floating label (`slotId`, `type`, contribution count, host plugin). Clicking a highlighted slot opens a detail panel showing slot metadata and contributions list (via FR-031 dependents query).
  - **A11y**: `role="dialog"`, `aria-label="Extension Slot Inspector"`, Esc to dismiss, focus-trapped while open. (Reduced a11y requirements — developer tool only.)
  - **Spec reference**: Plan §4.14, design-spec §3.8, §4.7
  - **Dependencies**: T013-11 (needs `<ExtensionSlot>` to hook into)
  - **Estimated**: `[S]`

---

- [x] **T013-19** `[S]` `[P]` Component Barrel Export
  - **File to create**:
    - `apps/web/src/components/extensions/index.ts`
  - **Description**: Export all extension components from a single barrel for clean imports: `ExtensionSlot`, `ExtensionContribution`, `ExtensionSlotSkeleton`, `ExtensionErrorFallback`, `VirtualizedSlotContainer`, `ContributionRow`, `SlotInspectorOverlay`.
  - **Note**: Use named exports only — no default exports (project convention).
  - **Spec reference**: Plan §5 file map
  - **Dependencies**: T013-11–T013-18 (all components must exist)
  - **Estimated**: `[S]`

---

## Phase 4: Testing (19 pts)

**Entry criteria**: Phase 3 complete — all components and API endpoints built.  
**Exit criteria**: ≥85% coverage for `extension-registry` module, all ADR-031 isolation tests passing, all unit/integration/E2E green.

---

- [x] **T013-20** `[L]` `[P]` `[Art.4.1]` `[Art.8.1]` `[NFR-013]` Service Unit Tests
  - **File to create**:
    - `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.service.test.ts`
  - **Description**: Unit tests for `ExtensionRegistryService`. All dependencies mocked (in-memory mocks for repository, Redis, ABAC — NFR-013). Tests must run without Docker/Module Federation.
  - **Test scenarios** (~35 tests):
    - Manifest sync: valid manifest → all 4 arrays upserted; empty manifest → no-op
    - Contribution resolution: with valid permission → included; missing permission → excluded; workspace-hidden → excluded; inactive plugin → excluded; priority ordering (ascending + alpha tie-break)
    - Data extension aggregation: 2 plugins respond → merged; 1 plugin times out (>3s) → excluded with warning; plugin returns malformed JSON → excluded with warning; `Promise.allSettled` isolation
    - Cache invalidation: `onPluginActivated` clears all `ext:*:{tenantId}` keys; `onPluginDeactivated` clears same
    - Contribution validation: type mismatch → `validation_status = type_mismatch`; target slot not found → `target_not_found`; valid → `valid`
    - Slot removal event: `onPluginDeactivated` with slot that has contributions → emits `extension.slot.removed` event (Edge Case #14)
    - Feature flag disabled → `resolveContributions` returns empty array
  - **Spec reference**: Plan §8.1, T013-06
  - **Dependencies**: T013-06
  - **Estimated**: `[L]`

---

- [x] **T013-21** `[M]` `[P]` `[Art.5.3]` `[Art.8.1]` Schema Validation Unit Tests
  - **File to create**:
    - `apps/core-api/src/__tests__/extension-registry/unit/extension-registry.schema.test.ts`
  - **Description**: Unit tests for all Zod schemas in `extension-registry.schema.ts`. Each schema tested with valid inputs, invalid inputs, and boundary values. (~20 tests)
  - **Test scenarios**:
    - `GetSlotsQuerySchema`: valid `type=action`, invalid `type=menu` → rejected; missing optional fields accepted
    - `GetContributionsQuerySchema`: valid UUID `workspaceId`; invalid UUID → rejected
    - `VisibilityPatchSchema`: `isVisible: true` valid; `isVisible: "true"` (string) → rejected; missing field → rejected
    - `SlotDependentsParamsSchema`: valid plugin+slot combo; empty strings → rejected
    - Boundary: `priority=0` valid; `priority=999` valid; `priority=1000` rejected; `priority=-1` rejected
    - Null byte injection: slot type with `\u0000` → rejected
  - **Spec reference**: Plan §4.4, T013-04
  - **Dependencies**: T013-04
  - **Estimated**: `[M]`

---

- [x] **T013-22** `[XL]` `[FR-019]` `[FR-020]` `[FR-021]` `[FR-022]` `[FR-031]` `[Art.4.1]` API Integration Tests
  - **File to create**:
    - `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.routes.test.ts`
  - **Description**: Integration tests for all 8 API endpoints using `buildTestApp()` + `testContext.auth.createMockToken()`. Tests require real database (test infrastructure). (~30 tests)
  - **Test scenarios**:
    - `GET /slots`: 200 returns active slots; 401 without token; filter by `pluginId` returns subset; filter by `type` returns subset
    - `GET /slots/:pluginId`: 200 for existing plugin; 200 empty array for unknown plugin
    - `GET /contributions`: workspace-visible contributions included; workspace-hidden excluded; inactive plugin excluded
    - `GET /entities`: 200 returns entity types from active plugins
    - `GET /entities/.../extensions`: 200 aggregated result; 404 for unknown entity type; timeout handled with warning
    - `PATCH /visibility`: workspace admin 200; non-admin 403; unknown contribution 404; invalid body 400
    - `GET /dependents`: 200 with dependents list; 404 for unknown slot
    - Feature flag disabled: all routes return 404
  - **Spec reference**: Plan §3.1–3.7, §8.2
  - **Dependencies**: T013-07, T013-08, T013-09
  - **Estimated**: `[XL]`

---

- [x] **T013-23** `[L]` `[P]` `[ADR-031]` `[Art.5.2]` Tenant Isolation Integration Tests
  - **File to create**:
    - `apps/core-api/src/__tests__/extension-registry/integration/extension-registry.isolation.test.ts`
  - **Description**: **Mandatory ADR-031 follow-up tests.** These 5 scenarios directly verify the bounded exception safeguards. Require real database with RLS enabled.
  - **Test scenarios** (~5 tests, one per ADR-031 requirement):
    1. **Tenant isolation**: Insert slots for tenant A and tenant B via `upsertSlots`. Query via `getSlots(tenantIdA)` — assert zero rows from tenant B returned.
    2. **RLS enforcement**: Set `app.current_tenant_id` to tenant A via `$executeRaw`. Run raw `SELECT * FROM core.extension_slots` — assert only tenant A plugin slots returned.
    3. **Workspace visibility scoping**: Contribution visible in workspace X (default). Disable for workspace Y via `setVisibility`. Query `getContributionsForSlot` with workspace Y — assert contribution excluded.
    4. **Missing tenant context**: Call `getSlots` without setting tenant context (no `app.current_tenant_id`) — assert zero rows returned.
    5. **Cascade-disable**: Call `deactivateByPlugin(pluginId)` — assert all 5 table records for that plugin have `is_active = false`.
  - **Spec reference**: Plan §T013-23, ADR-031
  - **Dependencies**: T013-05 (repository under test)
  - **Estimated**: `[L]`

---

- [x] **T013-24** `[L]` `[P]` `[Art.8.1]` `[NFR-011]` Frontend Component Tests
  - **Description**: Unit tests for all 7 React components and the `useExtensionSlot` hook. Use Vitest + React Testing Library. All user-facing components scanned with `vitest-axe` (ADR-022).
  - **Test locations**: Co-located test files (`*.test.tsx`) or dedicated `__tests__/extension/` directory.
  - **Test scenarios** (~25 tests):
    - `ExtensionSlot`: contributions rendered in priority order; skeleton shown while loading; single contribution error shows fallback, others remain; `role="region"` and `aria-label` present; `aria-busy="true"` while loading
    - `ExtensionContribution`: error boundary catches thrown error → fallback rendered; 5s timeout mock → fallback rendered; context props spread correctly; host-internal state NOT in passed props (NFR-007)
    - `ExtensionSlotSkeleton`: renders `action-skeleton` / `panel-skeleton` / `form-skeleton` / `toolbar-skeleton` variant correctly
    - `ExtensionErrorFallback`: `compact` variant renders inline; `card` variant renders with dismiss button; `role="alert"` present; dismiss removes from DOM
    - `ContributionRow`: `enabled` variant renders toggle on; `disabled-tenant` renders grayed + tooltip; `warning` variant shows `AlertTriangle`; toggle fires `PATCH` mutation
    - `useExtensionSlot`: loading state → `isLoading: true`; success state → contributions returned; feature flag disabled → empty contributions
    - `vitest-axe` a11y scan: `ExtensionSlot`, `ExtensionErrorFallback`, `ContributionRow` — zero violations
  - **Spec reference**: Plan §8.1, T013-11–T013-16
  - **Dependencies**: T013-11–T013-16
  - **Estimated**: `[L]`

---

- [x] **T013-25** `[L]` `[Art.8.1]` E2E Tests
  - **File to create**:
    - `apps/core-api/src/__tests__/extension-registry/e2e/extension-registry.e2e.test.ts`
  - **Description**: End-to-end tests covering the full request lifecycle through the real app stack. (~10 tests)
  - **Test scenarios**:
    - Full install → activate workflow: install plugin with manifest containing slots + contributions → activate → query `/slots` → assert slots registered → query `/contributions` → assert contributions resolved
    - Workspace visibility toggle: toggle contribution off via `PATCH` → query `/contributions?workspaceId=X` → assert excluded → toggle back on → assert included
    - Plugin deactivation / reactivation: deactivate plugin → query slots → assert inactive → reactivate → query slots → assert active
    - Data extension resolution: register mock sidecar endpoint → query `/entities/.../extensions` → assert fields aggregated
    - Orphaned contribution (Edge Case #2): activate plugin A (slot owner) + plugin B (contributor) → deactivate A → query contributions → assert B's contribution has `validation_status: target_not_found`
    - Type mismatch (Edge Case #7): plugin B declares `type: panel` contribution to an `action` slot → validate → assert `type_mismatch` status
  - **Spec reference**: Plan §8.3, §6 edge cases
  - **Dependencies**: T013-07, T013-08, T013-09 (all API endpoints), T013-20–T013-23 (lower-level tests must pass first)
  - **Estimated**: `[L]`

---

## Phase 5: Migration & Documentation (5 pts)

**Entry criteria**: Phase 4 complete — all tests passing, ≥85% coverage on `extension-registry` module.  
**Exit criteria**: All docs updated, decision log reflects completion, spec status → Complete.

---

- [x] **T013-26** `[M]` `[P]` Architecture Documentation
  - **Files to modify**:
    - `docs/ARCHITECTURE.md` — add Extension Points section: slot/contribution model, registry architecture, ADR-031 bounded exception rationale, data flow diagram
    - `docs/SECURITY.md` — add section on extension permission model (two-tier: slot permission + workspace visibility), sidecar data tenant isolation guarantees
    - `docs/PLUGIN_SDK.md` (create or update) — developer guide covering: declaring slots in manifest, contributing to slots via manifest, serving sidecar data with `DataExtensionClient`, using `useExtensionSlot` hook, querying the registry API
  - **Spec reference**: Plan §T013-26
  - **Dependencies**: T013-25 (all implementation must be final)
  - **Estimated**: `[M]`

---

- [x] **T013-27** `[S]` `[P]` Decision Log & Cross-References
  - **Files to modify**:
    - `.forge/knowledge/decision-log.md` — add Spec 013 completion entry, cross-reference ADR-031, close in-progress note
    - `.forge/specs/013-extension-points/spec.md` — update `Status: Draft` → `Status: Complete`, add plan link
    - `planning/PROJECT_STATUS.md` — update milestone status per project guidelines
  - **Spec reference**: Plan §T013-27
  - **Dependencies**: T013-26 (docs must be done first)
  - **Estimated**: `[S]`

---

- [x] **T013-28** `[S]` `[P]` `[Art.9.2]` Health Check Integration
  - **File to modify**:
    - `apps/core-api/src/index.ts` (or health check module) — add Extension Registry to `/health` dependency checks
  - **Description**: Add a simple health check for the Extension Registry: `SELECT 1 FROM core.extension_slots LIMIT 1`. Report as `extension_registry: "healthy"` or `"degraded"` in the `/health` response. Follows the pattern of existing health checks (Redis, Keycloak, database).
  - **Spec reference**: Plan §T013-28, Art. 9.2
  - **Dependencies**: T013-02 (table must exist)
  - **Estimated**: `[S]`

---

- [x] **T013-29** `[S]` `[P]` `[Art.9.1]` Feature Flag Rollout Documentation
  - **File to create or modify**:
    - `docs/FEATURE_FLAGS.md` — document `extension_points_enabled` flag: purpose, how to enable per-tenant (API call or DB update), how to verify (check `/health` + query `/slots`), how to disable in an emergency, graduated rollout plan (start with 1 internal tenant, observe metrics, expand)
  - **Spec reference**: Plan §T013-29, Art. 9.1
  - **Dependencies**: T013-03 (feature flag must be implemented)
  - **Estimated**: `[S]`

---

## Final Checklist

Before marking this spec complete, verify:

- [x] All 29 tasks have `[x]` status
- [x] `pnpm test` passes in `apps/core-api` (≥85% coverage on `extension-registry`)
- [x] `pnpm test` passes in `apps/web` (≥80% coverage on extension components)
- [x] `pnpm lint` passes across all modified packages
- [x] `pnpm build` succeeds (TypeScript compilation clean)
- [x] `/forge-review` run and all HIGH-severity findings resolved
- [x] ADR-031 isolation tests (T013-23) all green
- [x] Feature flag `extension_points_enabled` defaults to `false` in production
- [x] `planning/PROJECT_STATUS.md` updated to reflect Spec 013 completion
- [x] `.forge/knowledge/decision-log.md` entry added (T013-27)

---

## Summary

| Metric                   | Value                            |
| ------------------------ | -------------------------------- |
| Total tasks              | 29                               |
| Total story points       | 85                               |
| Total phases             | 5                                |
| Parallelizable tasks [P] | 14                               |
| Sprint 010 (Phase 1+2)   | 10 tasks · 39 pts                |
| Sprint 011 (Phase 3+4+5) | 19 tasks · 46 pts                |
| Requirements covered     | FR-001–FR-033 · NFR-001–NFR-014  |
| Estimated test count     | ~172 (112 unit, 50 int, 10 E2E)  |
| Coverage target          | ≥85% extension-registry, ≥80% UI |

---

## Cross-References

| Document     | Path                                                           |
| ------------ | -------------------------------------------------------------- |
| Spec         | `.forge/specs/013-extension-points/spec.md`                    |
| Plan         | `.forge/specs/013-extension-points/plan.md`                    |
| Design Spec  | `.forge/specs/013-extension-points/design-spec.md`             |
| ADR-031      | `.forge/knowledge/adr/adr-031-extension-tables-core-schema.md` |
| ADR-002      | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`       |
| ADR-014      | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`     |
| ADR-017      | `.forge/knowledge/adr/adr-017-abac-engine.md`                  |
| ADR-018      | `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`      |
| Constitution | `.forge/constitution.md`                                       |
