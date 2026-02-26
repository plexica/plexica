# Plan: 004 - Plugin System

> Technical implementation plan for the Plexica plugin architecture, lifecycle, communication, SDK, and frontend UI.

| Field     | Value                                    |
| --------- | ---------------------------------------- |
| Track     | Feature                                  |
| Spec      | `.forge/specs/004-plugin-system/spec.md` |
| Status    | Complete                                 |
| Date      | 2026-02-25                               |
| Architect | forge-architect                          |

---

## 1. Executive Summary

The plugin system enables container-isolated extensions that extend Plexica's core platform. A substantial foundation already exists (plugin registry, lifecycle service, SDK, event bus, service discovery, shared data service, manifest validation), but key gaps remain: the lifecycle state machine is semantically misaligned with the spec, container management is a stub, API routes don't fully match the spec's contract, plugin data migrations across tenant schemas are unimplemented, and test coverage is critically low.

This plan closes those gaps across **7 phases** (~**92 story points** total, ~184h) without rebuilding existing infrastructure. The approach is additive: extend, align, and test rather than rewrite.

**Phases 1–5** (62 pts) cover backend infrastructure: lifecycle state machine, container adapter, API routes, SDK completion, and backend test coverage. **Phase 6** (20 pts) covers frontend UI implementation for 5 screens derived from `design-spec.md` and `user-journey.md`. **Phase 7** (10 pts) covers frontend component tests with accessibility assertions.

---

## 2. Current State Analysis

### ✅ Already Implemented — DO NOT REBUILD

| Component                | Location                                                      | Notes                                                                                                                        |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Plugin DB schema         | `packages/database/prisma/schema.prisma`                      | `Plugin`, `TenantPlugin`, `PluginVersion`, `PluginService`, `PluginDependency`, `SharedPluginData`, `WorkspacePlugin` models |
| Plugin registry service  | `apps/core-api/src/services/plugin.service.ts`                | `PluginRegistryService` — register, update, list, delete, validate manifest                                                  |
| Plugin lifecycle service | `apps/core-api/src/services/plugin.service.ts`                | `PluginLifecycleService` — install, activate, deactivate, uninstall, config                                                  |
| Plugin API routes        | `apps/core-api/src/routes/plugin.ts`                          | 12 routes; structure differs from spec (see §5.1 Gap)                                                                        |
| Plugin gateway routes    | `apps/core-api/src/routes/plugin-gateway.ts`                  | Service registration, discovery, proxy, shared data                                                                          |
| Service registry service | `apps/core-api/src/services/service-registry.service.ts`      | Full implementation                                                                                                          |
| Plugin API gateway       | `apps/core-api/src/services/plugin-api-gateway.service.ts`    | Plugin-to-plugin proxying                                                                                                    |
| Shared data service      | `apps/core-api/src/services/shared-data.service.ts`           | Namespaced key-value store                                                                                                   |
| Dependency resolver      | `apps/core-api/src/services/dependency-resolution.service.ts` | Topological sort, cycle detection                                                                                            |
| Plugin manifest schema   | `apps/core-api/src/schemas/plugin-manifest.schema.ts`         | Zod validation, 301 lines                                                                                                    |
| Plugin validator         | `apps/core-api/src/lib/plugin-validator.ts`                   | Translation validation                                                                                                       |
| Plugin hook service      | `apps/core-api/src/modules/plugin/plugin-hook.service.ts`     | HTTP hooks for workspace lifecycle                                                                                           |
| In-process hook system   | `apps/core-api/src/lib/plugin-hooks.ts`                       | In-process hook registration                                                                                                 |
| @plexica/sdk             | `packages/sdk/src/`                                           | `PlexicaPlugin` base, `ApiClient`, `EventClient`, `ServiceClient`, `SharedDataClient`                                        |
| @plexica/event-bus       | `packages/event-bus/src/`                                     | Complete — `EventBusService`, DLQ, topic manager, 27+ tests                                                                  |
| Module Federation shell  | ADR-011 completed                                             | Vite + @originjs/vite-plugin-federation; remoteEntry on MinIO                                                                |
| Plugins route (frontend) | `apps/web/src/routes/plugins.tsx`                             | 837-line `PluginsPage` with installed/marketplace tabs, grid/list/table view, tenant-scoped                                  |
| Plugin detail route      | `apps/web/src/routes/plugins.$pluginId.tsx`                   | Existing detail page (tenant-scoped)                                                                                         |
| Plugin context           | `apps/web/src/contexts/PluginContext.tsx`                     | React context with `usePlugins()` hook                                                                                       |

### ❌ Gaps to Close

| Gap                                    | Severity | Spec FRs       | Notes                                                                                                            |
| -------------------------------------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Lifecycle state mismatch**           | HIGH     | FR-003         | `PluginStatus` enum is marketplace-focused (DRAFT/PUBLISHED); spec needs REGISTERED→ACTIVE state machine         |
| **Container lifecycle stub**           | HIGH     | FR-001, FR-003 | `runLifecycleHook` is a TODO; no container start/stop/health integration                                         |
| **Plugin data migrations**             | HIGH     | FR-005         | No implementation for running plugin SQL migrations across tenant schemas                                        |
| **Route contract misalignment**        | MEDIUM   | §8 API         | Current routes are tenant-scoped; spec requires super_admin lifecycle routes                                     |
| **Module Federation registration**     | MEDIUM   | FR-011         | No backend API to register/serve plugin remoteEntry URLs                                                         |
| **SDK decorators missing**             | MEDIUM   | FR-016         | `packages/sdk/src/decorators/` directory exists but `@EventHandler`, `@EventPublisher` decorators are incomplete |
| **Event routing on enable**            | MEDIUM   | FR-006         | Topic configuration on plugin enable not wired to lifecycle                                                      |
| **Permission registration on install** | MEDIUM   | FR-014         | `permissionRegistrationService` exists but not called during install                                             |
| **Translation loading on enable**      | LOW      | FR-015         | Validation exists; runtime loading on enable not wired                                                           |
| **Container resource limits**          | LOW      | FR-017         | Not implemented (Should)                                                                                         |
| **Test coverage**                      | CRITICAL | Art. 4.1       | Plugin module < 30% coverage; CI requires ≥80%; core modules ≥85%                                                |
| **Health check proxy**                 | MEDIUM   | FR-009         | No endpoint proxying plugin `/health`, `/ready`, `/openapi.json`, `/metrics`                                     |
| **Super Admin plugin registry UI**     | HIGH     | FR-001, FR-002 | `PluginsPage` is tenant-scoped; no lifecycle status badges, no install progress, no lifecycle actions            |
| **Tenant Extensions page**             | HIGH     | FR-013         | No dedicated Extensions page for tenant admins; plugin config forms not auto-generated from manifest schema      |
| **Plugin detail (super admin)**        | MEDIUM   | FR-009         | No health tab, permissions tab, events tab, or lifecycle timeline in detail view                                 |
| **UX error states**                    | MEDIUM   | user-journey   | No install progress error/retry, no dependency blocked state, no uninstall blocked state                         |

---

## 3. Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Core Platform                            │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Plugin Registry │  │ Tenant Plugin Mgr│                    │
│  │  (super_admin)   │  │  (tenant_admin)  │                    │
│  └────────┬─────────┘  └────────┬─────────┘                    │
│           │                     │                               │
│  ┌────────▼─────────────────────▼─────────┐                    │
│  │         PluginLifecycleService          │                    │
│  │  REGISTERED→INSTALLING→INSTALLED→ACTIVE │                    │
│  │          →DISABLED→UNINSTALLED          │                    │
│  └────────┬────────────┬──────────────────┘                    │
│           │            │                                        │
│  ┌────────▼───┐  ┌─────▼──────────────┐                       │
│  │ Container  │  │   ServiceRegistry   │                       │
│  │ Orchestrat.│  │  (discovery, proxy) │                       │
│  └────────────┘  └─────────────────────┘                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  EventBus    │  │  SharedDataSvc   │  │  PermissionSvc   │ │
│  │  (Redpanda)  │  │  (cross-plugin)  │  │  (RBAC reg.)     │ │
│  └──────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                      Plugin Containers                          │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────┐ │
│  │  CRM Plugin     │   │ Billing Plugin  │   │  Analytics  │ │
│  │  :8080          │   │  :8080          │   │  Plugin     │ │
│  │  /health        │   │  /health        │   │  :8080      │ │
│  │  /ready         │   │  /api/v1/...    │   │             │ │
│  │  /openapi.json  │   │                 │   │             │ │
│  └────────┬────────┘   └────────┬────────┘   └─────────────┘ │
│           │ events               │ REST call                   │
│           └──────────────────────┘                             │
│                    via Redpanda / Gateway                       │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Module Federation)                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Host Shell (apps/web)                                     │ │
│  │  - Plugin Registry (super admin) with lifecycle badges     │ │
│  │  - Plugin Install Progress panel (6-step flow)             │ │
│  │  - Lifecycle confirmation dialogs (enable/disable/etc.)    │ │
│  │  - Plugin Detail modal (health/permissions/events tabs)    │ │
│  │  - Tenant Extensions page (enable toggle + config forms)   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Plugin Remote (Vite federated build)                      │ │
│  │  - remoteEntry.js uploaded to MinIO on install             │ │
│  │  - Shares React, TailwindCSS tokens with host              │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

**Install Flow**:

```
super_admin → POST /api/v1/plugins/:id/install
  → LifecycleService.installPlugin()
  → validate dependencies (DependencyResolutionService)
  → set lifecycleStatus = INSTALLING
  → pull container image (ContainerAdapter)
  → run data migrations across all tenant schemas (TenantMigrationService)
  → register permissions (PermissionRegistrationService)
  → register frontend remoteEntry URL
  → configure Redpanda topics (EventBus)
  → set lifecycleStatus = INSTALLED
  → return plugin record
```

**Enable (Super Admin)**:

```
super_admin → POST /api/v1/plugins/:id/enable
  → start container (ContainerAdapter)
  → wait for /health → 200
  → register in ServiceRegistry
  → load translation namespaces (I18nService)
  → set lifecycleStatus = ACTIVE
```

**Tenant Enable**:

```
tenant_admin → POST /api/v1/tenant/plugins/:id/enable
  → verify plugin is ACTIVE globally
  → create/update TenantPlugin(enabled=true)
  → apply tenant-specific configuration defaults
```

---

## 4. Technical Decisions

### 4.1 Lifecycle State Machine Strategy

**Decision**: Add a `lifecycleStatus` column to the `plugins` table (new enum `PluginLifecycleStatus`) separate from the existing `status` column (marketplace status).

**Rationale**:

- `status` (DRAFT/PENDING_REVIEW/PUBLISHED/DEPRECATED/REJECTED) tracks marketplace publishing state
- `lifecycleStatus` (REGISTERED/INSTALLING/INSTALLED/ACTIVE/DISABLED/UNINSTALLING/UNINSTALLED) tracks runtime deployment state
- Two orthogonal concerns must not be conflated
- Additive migration — no existing data breaks

**New enum**:

```prisma
enum PluginLifecycleStatus {
  REGISTERED
  INSTALLING
  INSTALLED
  ACTIVE
  DISABLED
  UNINSTALLING
  UNINSTALLED
  @@schema("core")
}
```

> **ADR**: ADR-018 — Plugin Lifecycle vs Marketplace Status separation

### 4.2 Container Management Strategy

**Decision**: Introduce a `ContainerAdapter` interface with two implementations:

1. `DockerContainerAdapter` — Docker API via `dockerode` for local dev/single-host
2. `NullContainerAdapter` — No-op for testing and environments without Docker

**Rationale**:

- Container orchestration is pluggable (Docker today, K8s later via a `K8sContainerAdapter`)
- Decouples lifecycle service from infrastructure
- Allows tests to use the null adapter without Docker dependency

**Interface**:

```typescript
interface ContainerAdapter {
  start(pluginId: string, config: ContainerConfig): Promise<void>;
  stop(pluginId: string): Promise<void>;
  health(pluginId: string): Promise<'healthy' | 'unhealthy' | 'starting'>;
  remove(pluginId: string): Promise<void>;
}
```

> **ADR**: ADR-019 — Pluggable Container Adapter

### 4.3 Route Contract Alignment

**Decision**: Add new v1 routes matching the spec contract under `/api/v1/plugins` and `/api/v1/tenant/plugins` without removing existing routes (backward compatibility per Constitution Art. 1.2 §3).

**Rationale**: Existing routes at `/tenants/:id/plugins/:pluginId/install` serve different patterns (tenant-admin install) and may be used by existing clients. New routes implement the spec's super_admin lifecycle API cleanly.

### 4.4 Plugin Data Migrations

**Decision**: Implement `TenantMigrationService` that runs plugin-supplied SQL migration files against all active tenant schemas using Prisma `$executeRawUnsafe` with per-schema transactions.

**Pattern**:

```typescript
for (const tenant of activeTenants) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET search_path TO "tenant_${tenant.id}"`);
    for (const migration of plugin.migrations) {
      await tx.$executeRawUnsafe(migration.sql);
    }
  });
}
```

**Safety**: Migrations are transactional per tenant — one tenant failure does not affect others (Edge Case 2 in spec).

### 4.5 SDK Decorators

**Decision**: Complete the `packages/sdk/src/decorators/` directory with `@EventHandler`, `@EventPublisher`, `@Permission`, and `@Hook` decorators using TypeScript experimental decorators (stage 3 spec, enabled in `tsconfig.json`).

---

## 5. Implementation Phases

### Phase 1: Lifecycle State Machine & Database Migration (T004-01–T004-05)

**Estimated**: ~12 story points (~24h) | Sprint 4 Week 1

| Task    | Description                                                                                                                                     | Points | Files                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| T004-01 | Add `PluginLifecycleStatus` enum and `lifecycleStatus` column to `Plugin` model in Prisma schema                                                | 2      | `packages/database/prisma/schema.prisma`, new migration file   |
| T004-02 | Generate Prisma client, update `@plexica/database` exports                                                                                      | 1      | `packages/database/src/index.ts`                               |
| T004-03 | Update `PluginLifecycleService` to use `lifecycleStatus` for state transitions; implement state machine validation (reject invalid transitions) | 3      | `apps/core-api/src/services/plugin.service.ts`                 |
| T004-04 | Implement `TenantMigrationService` — run plugin migrations across all active tenant schemas with per-tenant transactions                        | 4      | `apps/core-api/src/services/tenant-migration.service.ts` (new) |
| T004-05 | Wire permission registration (`permissionRegistrationService`) into `installPlugin()` flow                                                      | 2      | `apps/core-api/src/services/plugin.service.ts`                 |

**Dependencies**: None (foundational)

---

### Phase 2: Container Adapter & API Route Alignment (T004-06–T004-11)

**Estimated**: ~16 story points (~32h) | Sprint 4 Week 2

| Task    | Description                                                                                                                                  | Points | Files                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| T004-06 | Define `ContainerAdapter` interface and implement `NullContainerAdapter`                                                                     | 2      | `apps/core-api/src/lib/container-adapter.ts` (new)                          |
| T004-07 | Implement `DockerContainerAdapter` using `dockerode`; add `dockerode` to dependencies                                                        | 4      | `apps/core-api/src/lib/docker-container-adapter.ts` (new)                   |
| T004-08 | Wire `ContainerAdapter` into `PluginLifecycleService.enable/disable/uninstall` replacing the `runLifecycleHook` stub                         | 3      | `apps/core-api/src/services/plugin.service.ts`                              |
| T004-09 | Add spec-aligned v1 routes: `POST /api/v1/plugins/:id/install`, `/enable`, `/disable`, `/update`, `DELETE /api/v1/plugins/:id` (super_admin) | 4      | `apps/core-api/src/routes/plugin-v1.ts` (new), `apps/core-api/src/index.ts` |
| T004-10 | Add tenant routes: `GET /api/v1/tenant/plugins`, `POST /enable`, `/disable`, `PUT /config` (tenant_admin)                                    | 2      | `apps/core-api/src/routes/tenant-plugins-v1.ts` (new)                       |
| T004-11 | Implement health-check proxy endpoints: `GET /api/v1/plugins/:id/health`, `/ready`, `/openapi.json` — proxy to plugin container              | 1      | `apps/core-api/src/routes/plugin-v1.ts`                                     |

**Dependencies**: T004-01, T004-03

---

### Phase 3: Communication & Frontend Registration (T004-12–T004-15)

**Estimated**: ~12 story points (~24h) | Sprint 4 Week 3

| Task    | Description                                                                                                                                                                               | Points | Files                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T004-12 | Wire Redpanda topic configuration on plugin enable/disable: call `TopicManager.createTopics()` with plugin's `events.publishes` and `events.subscribes` topics                            | 3      | `apps/core-api/src/services/plugin.service.ts`, `packages/event-bus/src/lib/topic-manager.ts`                                                                           |
| T004-13 | Add `remoteEntryUrl` column to `Plugin` model; implement `ModuleFederationRegistryService` — store and serve remoteEntry URLs on plugin install                                           | 4      | `packages/database/prisma/schema.prisma` (migration), `apps/core-api/src/services/module-federation-registry.service.ts` (new), `apps/core-api/src/routes/plugin-v1.ts` |
| T004-14 | Implement translation namespace loading on plugin enable: call `I18nService.loadPluginTranslations()`                                                                                     | 2      | `apps/core-api/src/services/plugin.service.ts`, `apps/core-api/src/modules/i18n/i18n.service.ts`                                                                        |
| T004-15 | ~~Write ADR-018 and ADR-019~~ ✅ ADRs authored prior to Sprint 4; T004-15 is a verification task — confirmed implementation matches both ADRs exactly (no discrepancies found 2026-02-24) | 3      | `.forge/knowledge/adr/adr-018-*.md`, `.forge/knowledge/adr/adr-019-*.md`                                                                                                |

**Dependencies**: T004-01, T004-08

---

### Phase 4: SDK Completion (T004-16–T004-19)

**Estimated**: ~10 story points (~20h) | Sprint 4 Week 4

| Task    | Description                                                                                                    | Points | Files                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| T004-16 | Implement `@EventHandler(topic)` and `@EventPublisher()` decorators in `packages/sdk/src/decorators/events.ts` | 3      | `packages/sdk/src/decorators/events.ts` (new/complete), `packages/sdk/src/decorators/index.ts`  |
| T004-17 | Implement `@Permission(key, name, description)` decorator in `packages/sdk/src/decorators/permissions.ts`      | 2      | `packages/sdk/src/decorators/permissions.ts` (new)                                              |
| T004-18 | Implement `@Hook(type)` decorator for workspace hooks in `packages/sdk/src/decorators/hooks.ts`                | 2      | `packages/sdk/src/decorators/hooks.ts` (new)                                                    |
| T004-19 | Update `packages/sdk/src/index.ts` exports; add `@plexica/sdk` usage guide to `docs/PLUGIN_SDK.md`             | 3      | `packages/sdk/src/index.ts`, `packages/sdk/src/decorators/index.ts`, `docs/PLUGIN_SDK.md` (new) |

**Dependencies**: T004-12 (event integration)

---

### Phase 5: Test Coverage & Security Hardening (T004-20–T004-27)

**Estimated**: ~12 story points (~24h) | Sprint 5 Week 1

| Task    | Description                                                                                                                                                   | Points | Files                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| T004-20 | Unit tests: `PluginRegistryService` — register, validate manifest, dependency check (target: ≥85%)                                                            | 2      | `apps/core-api/src/__tests__/plugin/unit/plugin-registry.unit.test.ts`                                                    |
| T004-21 | Unit tests: `PluginLifecycleService` — lifecycle transitions, error cases, state machine validation                                                           | 2      | `apps/core-api/src/__tests__/plugin/unit/plugin-lifecycle.unit.test.ts`                                                   |
| T004-22 | Unit tests: `TenantMigrationService` — migration execution, per-tenant isolation, rollback on failure                                                         | 2      | `apps/core-api/src/__tests__/plugin/unit/tenant-migration.unit.test.ts`                                                   |
| T004-23 | Unit tests: `ContainerAdapter` (NullAdapter), `ModuleFederationRegistryService`, SDK decorators                                                               | 2      | `apps/core-api/src/__tests__/plugin/unit/container-adapter.unit.test.ts`, `packages/sdk/src/__tests__/decorators.test.ts` |
| T004-24 | Integration tests: plugin registration, install, enable, disable API endpoints (v1 routes)                                                                    | 3      | `apps/core-api/src/__tests__/plugin/integration/plugin-lifecycle.integration.test.ts`                                     |
| T004-25 | Integration tests: tenant plugin enable/disable/config endpoints                                                                                              | 1      | `apps/core-api/src/__tests__/plugin/integration/tenant-plugins.integration.test.ts`                                       |
| T004-26 | E2E: Super admin plugin install lifecycle + tenant enable + plugin invocation                                                                                 | 2      | `apps/core-api/src/__tests__/plugin/e2e/plugin-system.e2e.test.ts`                                                        |
| T004-27 | Security hardening: verify container network policy enforcement in ContainerAdapter; add hook URL validation tests; verify X-Tenant-ID propagation in gateway | 2      | Across multiple test files                                                                                                |

**Dependencies**: T004-04 through T004-19

---

### Phase 6: Frontend UI Implementation (T004-28–T004-32)

**Estimated**: ~20 story points (~40h) | Sprint 5 Week 2–3

> Derived from `design-spec.md` screens and `user-journey.md` edge cases.
> All frontend components use `@plexica/ui` primitives (Badge, Card, Button, Modal,
> Switch, Select, Input, Progress, EmptyState, ConfirmDialog, Alert, Spinner, Skeleton,
> StatusBadge, StatCard, DataTable, Tabs/TabList).

| Task    | Description                                                                                                                 | Points | Files                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| T004-28 | Redesign `PluginsView.tsx` — add Registry tab with lifecycle status badges, search/filter, stat summary, responsive grid    | 5      | `apps/web/src/routes/plugins.tsx`, `apps/web/src/components/plugins/PluginCard.tsx` (new)                |
| T004-29 | Build `PluginInstallProgress` component — 6-step list, spinners, error state, retry button, elapsed timer, ARIA live region | 4      | `apps/web/src/components/plugins/PluginInstallProgress.tsx` (new)                                        |
| T004-30 | Build lifecycle confirmation dialogs — Enable, Disable, Update, Uninstall with impact warnings and ARIA modal/focus trap    | 4      | `apps/web/src/components/plugins/PluginLifecycleDialogs.tsx` (new)                                       |
| T004-31 | Extend `PluginDetailModal` — lifecycle timeline, tabbed content (Overview/Health/Permissions/Events), resource bars         | 4      | `apps/web/src/components/plugins/PluginDetailModal.tsx` (new)                                            |
| T004-32 | Build Tenant Extensions page — `ExtensionsPage`, plugin enable toggle, auto-generated config form, RBAC guard               | 3      | `apps/web/src/routes/extensions.tsx` (new), `apps/web/src/components/plugins/PluginConfigForm.tsx` (new) |

**Dependencies**: T004-09, T004-10, T004-11 (API endpoints must exist)

---

### Phase 7: Frontend Tests (T004-33–T004-37)

**Estimated**: ~10 story points (~20h) | Sprint 5 Week 3–4

> React Testing Library + `@testing-library/jest-dom` + `vitest-axe` for WCAG 2.1 AA
> assertions. All tests run via `pnpm test` in `apps/web`.

| Task    | Description                                                                                            | Points | Files                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------- |
| T004-33 | Tests for `PluginsView` — loading/empty/error states, filter behavior, ARIA roles, keyboard navigation | 2      | `apps/web/src/__tests__/plugins/PluginsView.test.tsx` (new)            |
| T004-34 | Tests for `PluginInstallProgress` — step progression, error state, retry, screen reader flow           | 2      | `apps/web/src/__tests__/plugins/PluginInstallProgress.test.tsx` (new)  |
| T004-35 | Tests for lifecycle dialogs — focus trap, keyboard escape, name confirmation validation, blocked state | 2      | `apps/web/src/__tests__/plugins/PluginLifecycleDialogs.test.tsx` (new) |
| T004-36 | Tests for `PluginDetailModal` — tab switching, health polling, ARIA tablist                            | 2      | `apps/web/src/__tests__/plugins/PluginDetailModal.test.tsx` (new)      |
| T004-37 | Tests for `ExtensionsPage` — toggle enable/disable, config form validation, 403 guard                  | 2      | `apps/web/src/__tests__/plugins/ExtensionsPage.test.tsx` (new)         |

**Dependencies**: T004-28 through T004-32

---

## 6. Database Migration Plan

### Migration 1: Plugin Lifecycle Status (T004-01)

```sql
-- Migration: add_plugin_lifecycle_status
-- File: packages/database/prisma/migrations/YYYYMMDDHHMMSS_add_plugin_lifecycle_status/migration.sql

CREATE TYPE "core"."PluginLifecycleStatus" AS ENUM (
  'REGISTERED',
  'INSTALLING',
  'INSTALLED',
  'ACTIVE',
  'DISABLED',
  'UNINSTALLING',
  'UNINSTALLED'
);

ALTER TABLE "core"."plugins"
  ADD COLUMN "lifecycle_status" "core"."PluginLifecycleStatus" NOT NULL DEFAULT 'REGISTERED';

-- Backfill: PUBLISHED plugins → INSTALLED (closest equivalent)
UPDATE "core"."plugins"
  SET "lifecycle_status" = 'INSTALLED'
  WHERE "status" = 'PUBLISHED';

CREATE INDEX "idx_plugins_lifecycle_status" ON "core"."plugins"("lifecycle_status");
```

**Backward Compatible**: Yes — existing `status` column unchanged; new column has a safe default.

### Migration 2: Plugin Remote Entry URL (T004-13)

```sql
-- Migration: add_plugin_remote_entry_url
ALTER TABLE "core"."plugins"
  ADD COLUMN "remote_entry_url" TEXT,
  ADD COLUMN "frontend_route_prefix" TEXT;
```

**Backward Compatible**: Yes — nullable columns.

---

## 7. API Implementation Plan

All new routes live in `apps/core-api/src/routes/plugin-v1.ts` and `tenant-plugins-v1.ts`, registered in `apps/core-api/src/index.ts` under the `/api/v1` prefix.

| Method | Path                               | Handler               | Auth Guard                   | Validation                                          | Service Call                                   |
| ------ | ---------------------------------- | --------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| GET    | /api/v1/plugins                    | `listPlugins`         | `requireRole('super_admin')` | query: `page`, `limit`, `status`, `lifecycleStatus` | `PluginRegistryService.listPlugins()`          |
| POST   | /api/v1/plugins                    | `registerPlugin`      | `requireRole('super_admin')` | body: `PluginManifestSchema`                        | `PluginRegistryService.registerPlugin()`       |
| POST   | /api/v1/plugins/:id/install        | `installPlugin`       | `requireRole('super_admin')` | param: `pluginId`                                   | `PluginLifecycleService.installPlugin()`       |
| POST   | /api/v1/plugins/:id/enable         | `enablePlugin`        | `requireRole('super_admin')` | param: `pluginId`                                   | `PluginLifecycleService.activatePlugin()`      |
| POST   | /api/v1/plugins/:id/disable        | `disablePlugin`       | `requireRole('super_admin')` | param: `pluginId`                                   | `PluginLifecycleService.deactivatePlugin()`    |
| POST   | /api/v1/plugins/:id/update         | `updatePlugin`        | `requireRole('super_admin')` | body: `{ version: string }`                         | `PluginLifecycleService.updatePlugin()`        |
| DELETE | /api/v1/plugins/:id                | `uninstallPlugin`     | `requireRole('super_admin')` | param: `pluginId`                                   | `PluginLifecycleService.uninstallPlugin()`     |
| GET    | /api/v1/tenant/plugins             | `listTenantPlugins`   | `requireTenantAdmin()`       | —                                                   | `PluginLifecycleService.getInstalledPlugins()` |
| POST   | /api/v1/tenant/plugins/:id/enable  | `enableTenantPlugin`  | `requireTenantAdmin()`       | param: `pluginId`                                   | `PluginLifecycleService.enableForTenant()`     |
| POST   | /api/v1/tenant/plugins/:id/disable | `disableTenantPlugin` | `requireTenantAdmin()`       | param: `pluginId`                                   | `PluginLifecycleService.disableForTenant()`    |
| PUT    | /api/v1/tenant/plugins/:id/config  | `configTenantPlugin`  | `requireTenantAdmin()`       | body: validated against manifest config schema      | `PluginLifecycleService.updateConfiguration()` |

**Additional proxy endpoints** (T004-11):

| Method | Path                        | Handler              | Description                               |
| ------ | --------------------------- | -------------------- | ----------------------------------------- |
| GET    | /api/v1/plugins/:id/health  | `proxyPluginHealth`  | Proxy to plugin container `/health`       |
| GET    | /api/v1/plugins/:id/ready   | `proxyPluginReady`   | Proxy to plugin container `/ready`        |
| GET    | /api/v1/plugins/:id/openapi | `proxyPluginOpenApi` | Proxy to plugin container `/openapi.json` |

---

## 8. Frontend Implementation Plan

> Derived from `design-spec.md` (5 screens, 661+ lines) and `user-journey.md` (4 journeys, 387 lines).
> All components use the `@plexica/ui` component library. WCAG 2.1 AA compliance required per Constitution Art. 1.3.

### 8.1 Screen 1: Plugin Registry (Super Admin) — T004-28

**Route**: `/plugins` (existing route, redesigned)
**FRs**: FR-001, FR-002, FR-003, FR-004, FR-009

**Current state**: `apps/web/src/routes/plugins.tsx` (837 lines) is tenant-scoped with installed/marketplace tabs. It has no lifecycle status badges, no super-admin Registry view, and no lifecycle action triggers.

**Changes**:

1. **Add Registry tab** as the primary view for `super_admin` role users:
   - Tab replaces "installed" tab for super admins (tenant admins keep existing view)
   - Registry tab queries `GET /api/v1/plugins` (super admin endpoint, returns all plugins with `lifecycleStatus`)
   - Existing marketplace tab preserved for both roles

2. **Lifecycle status badges** per ADR-018 badge mapping:
   | Status | Badge variant | CSS var | Extra |
   |----------------|---------------|--------------------------|----------------|
   | ACTIVE | `default` | `--status-active` | — |
   | INSTALLING | `outline` | `--status-provisioning` | + `<Spinner/>` |
   | UNINSTALLING | `outline` | `--status-provisioning` | + `<Spinner/>` |
   | INSTALLED | `outline` | `--status-info` | — |
   | DISABLED | `secondary` | `--status-warning` | — |
   | REGISTERED | `outline` | `--status-info` | — |
   | UNINSTALLED | `secondary` | `--status-muted` | — |

3. **Search & filter**:
   - `<Input>` with search icon, debounced 300ms (`useDeferredValue` or `setTimeout`)
   - `<Select>` for lifecycle status filter (All / Active / Installed / Disabled / Registered / Other)
   - "Clear filters" `<Button variant="ghost">` shown when filters active
   - Stat summary: `"12 plugins total • 4 active • 2 installed • 3 registered • 3 other"` in `<p aria-live="polite">`

4. **Responsive grid**:
   - 3-column at ≥1440px, 2-column at ≥768px, 1-column at <768px
   - CSS grid with Tailwind: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`

5. **Plugin cards** (extract `PluginCard` component):
   - `role="article"` on each card
   - Plugin name as `<a>` opening detail modal
   - Status badge (per mapping above)
   - Action buttons based on `lifecycleStatus`:
     - REGISTERED: "Install" primary button
     - INSTALLED: "Enable" primary button
     - ACTIVE: Actions dropdown (Disable, Update, Uninstall)
     - DISABLED: "Enable" primary, Actions dropdown (Update, Uninstall)
   - Actions dropdown uses `<DropdownMenu>` with `role="menu"`

6. **Empty states**:
   - No data: Puzzle icon + "No plugins registered" + "Register Plugin" CTA `<Button>`
   - Filtered, no results: Search icon + "No plugins found" + "Clear filters" CTA
   - Both use `<EmptyState>` from `@plexica/ui`

**File map**:

- `apps/web/src/routes/plugins.tsx` — modify: add Registry tab, conditional rendering by role, `lifecycleStatus` query
- `apps/web/src/components/plugins/PluginCard.tsx` — new: extracted card component with badge mapping and action buttons
- `apps/web/src/hooks/usePluginRegistry.ts` — new: custom hook wrapping `useQuery` for `GET /api/v1/plugins` with search/filter state

**Component interfaces**:

```typescript
// PluginCard.tsx
interface PluginCardProps {
  plugin: Plugin & { lifecycleStatus: PluginLifecycleStatus };
  onInstall: (id: string) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string) => void;
  onViewDetail: (id: string) => void;
}
```

### 8.2 Screen 2: Plugin Install Progress — T004-29

**Trigger**: After clicking "Install" on a REGISTERED plugin, inline panel replaces the card grid.
**FRs**: FR-001, FR-003, FR-005

**Component**: `PluginInstallProgress`

**Design**:

1. **6-step progress list**:
   | Step | Label | Notes |
   |------|---------------------|------------------------------------------|
   | 1 | Dependency Check | Validates all dependencies are met |
   | 2 | Image Pull | Downloads container image |
   | 3 | Data Migrations | Per-tenant sub-progress (`Progress` bar) |
   | 4 | Route Registration | Registers API routes |
   | 5 | Frontend Registration | Registers Module Federation remote |
   | 6 | Health Check | Verifies container responds |

2. **Step icons**:
   - Pending: `○` (circle outline, `text-muted-foreground`)
   - Running: `◎` + `<Spinner size="sm"/>` (animated)
   - Complete: `✓` (checkmark, `text-green-600`)
   - Failed: `✕` (cross, `text-destructive`)
   - Skipped: `—` (dash, `text-muted-foreground`, for steps after a failure)

3. **Error variant**:
   - Failed step shows inline `<Alert variant="destructive" role="alert">` with:
     - Error message (from API response `error.message`)
     - Recovery suggestion (mapped per step — see §9 UX Error Handling)
     - "Retry" `<Button variant="outline">` (retries from failed step)
   - Remaining steps show "Skipped" state
   - "Back to Registry" `<Button variant="ghost">`

4. **Elapsed timer**: `<span aria-live="off">` showing `mm:ss` since install started (via `useEffect` + `setInterval`)

5. **Cancel Installation**: `<Button variant="ghost" className="text-destructive">` — calls `DELETE /api/v1/plugins/:id` to abort

6. **Success state**: Toast notification + "Enable now?" inline `<Button variant="default">` quick action

7. **ARIA**:
   - Progress container: `role="log" aria-live="polite"` — screen readers announce each step completion
   - Migration sub-progress: `role="progressbar" aria-valuemin={0} aria-valuemax={totalTenants} aria-valuenow={completedTenants}`
   - Error panel: `role="alert"` (auto-announced)

**Data flow**: Component polls `GET /api/v1/plugins/:id` every 2s (via `useQuery` with `refetchInterval: 2000`) to update `lifecycleStatus` from INSTALLING to INSTALLED. Install progress detail (which step) comes from a new response field `installProgress?: { currentStep: number; totalSteps: 6; error?: string }` on the plugin response (backend to add in T004-09).

**File map**:

- `apps/web/src/components/plugins/PluginInstallProgress.tsx` — new component
- `apps/web/src/hooks/useInstallProgress.ts` — new: hook with polling logic and step state management

### 8.3 Screen 3: Lifecycle Confirmation Dialogs — T004-30

**Trigger**: Action buttons/dropdown on plugin cards (Enable, Disable, Update, Uninstall).
**FRs**: FR-003, FR-004

**Components**: 4 dialog variants sharing a base pattern:

1. **`EnablePluginDialog`**:
   - Lists permissions to be activated (from `manifest.permissions`)
   - Info about tenant availability: "This plugin will become available to all tenants"
   - Confirm: "Enable Plugin" `<Button variant="default">`
   - Cancel: "Cancel" `<Button variant="outline">`

2. **`DisablePluginDialog`**:
   - Impact warning: `<Alert variant="warning">` showing tenant count: "This plugin is enabled in N tenant(s). Disabling it will remove access for all tenants."
   - Data preservation note: "Plugin data will be preserved. Re-enable at any time."
   - Confirm: "Disable Plugin" `<Button variant="destructive">`

3. **`UpdatePluginDialog`**:
   - Current version → new version diff display
   - Lists: new permissions (if any), new events (if any), migration count
   - Rollback guarantee: "You can roll back to the previous version"
   - Confirm: "Update Plugin" `<Button variant="default">`

4. **`UninstallPluginDialog`** (destructive):
   - `<Alert variant="destructive">` warning: "This action cannot be undone"
   - Optional data deletion `<Checkbox>` (unchecked by default): "Also delete all plugin data across all tenants"
   - Name confirmation `<Input>`: "Type the plugin name to confirm" — Uninstall button `disabled` until typed name matches `plugin.name`
   - **Blocked state** (when dependents exist): Uninstall button permanently disabled; shows list of dependent plugins as links; message: "Remove these plugins first before uninstalling."
   - Confirm: "Uninstall Plugin" `<Button variant="destructive">` (disabled until name matches)

**All dialogs share**:

- `<Modal>` from `@plexica/ui` with `role="dialog" aria-modal="true"`
- Focus trap (use `@plexica/ui` Modal's built-in focus trap)
- `Escape` key closes dialog
- `aria-labelledby` pointing to dialog title
- `aria-describedby` pointing to dialog description

**File map**:

- `apps/web/src/components/plugins/PluginLifecycleDialogs.tsx` — new: exports `EnablePluginDialog`, `DisablePluginDialog`, `UpdatePluginDialog`, `UninstallPluginDialog`

### 8.4 Screen 4: Plugin Detail View (Super Admin) — T004-31

**Trigger**: Clicking plugin name link on a card opens modal.
**FRs**: FR-009, FR-011, FR-014, FR-016

**Component**: `PluginDetailModal`

**Design**:

1. **Lifecycle timeline** (top of modal):
   - Horizontal node display: REGISTERED → INSTALLING → INSTALLED → ACTIVE → DISABLED → UNINSTALLED
   - Current state highlighted with primary color; past states with muted; future states grayed
   - Timestamps below each reached state (from plugin record)

2. **4 tabs** using `role="tablist"`:
   - **Overview tab**: Description, 4 `<StatCard>` components (Tenants using, Health, Version, API endpoints), technical details `<Table>` (image, base path, frontend route, resources, dependencies), tenant adoption list
   - **Health tab**: Status dot + "Last checked: Xm ago" + auto-refresh 30s (`refetchInterval: 30000`). Endpoint status list: `/health`, `/ready`, `/openapi.json`, `/metrics` — each with green/red dot. CPU and memory `<Progress>` bars (from `GET /api/v1/plugins/:id/health` response). Badge: "Healthy" / "Unhealthy" / "Starting"
   - **Permissions tab**: `<Table>` with columns: Key, Name, Description — data from `manifest.permissions`
   - **Events tab**: Two lists — "Publishes" and "Subscribes" — each showing event names from `manifest.events`

3. **ARIA**:
   - Modal: `role="dialog" aria-modal="true" aria-labelledby="plugin-detail-title"`
   - Tabs: `role="tablist"`, each tab `role="tab" aria-selected="true|false"`, panels `role="tabpanel" aria-labelledby="tab-id"`
   - Health auto-refresh: status text wrapped in `aria-live="polite"` region

**Data sources**:

- Plugin record: `GET /api/v1/plugins/:id` (with lifecycle timestamps)
- Health data: `GET /api/v1/plugins/:id/health` (polled every 30s when Health tab active)
- Tenant adoption: `GET /api/v1/plugins/:id/tenants` (new endpoint — list tenants that have enabled this plugin; or derive from existing data)

**File map**:

- `apps/web/src/components/plugins/PluginDetailModal.tsx` — new: modal with tabbed content
- `apps/web/src/components/plugins/LifecycleTimeline.tsx` — new: horizontal timeline component
- `apps/web/src/hooks/usePluginHealth.ts` — new: hook for health polling

### 8.5 Screen 5: Tenant Plugin Settings (Tenant Extensions Page) — T004-32

**Route**: `/extensions` (new TanStack Router route)
**FRs**: FR-013, FR-014, FR-015

**Components**: `ExtensionsPage` + `PluginConfigForm`

**Design**:

1. **Extensions page layout**:
   - Page title: "Extensions"
   - Shows only globally `ACTIVE` plugins (queries `GET /api/v1/tenant/plugins`)
   - Each plugin: card with name, description, version, status `<Switch>` (enabled/disabled toggle)

2. **Enable flow**:
   - Toggle `<Switch>` to ON → confirmation dialog: "Enable [Plugin Name]?" with permission list
   - On confirm: `POST /api/v1/tenant/plugins/:id/enable`
   - After enable: "Configure" `<Button>` appears

3. **Plugin Config Form** (`PluginConfigForm`):
   - Auto-generated from `manifest.configuration.schema` (JSON Schema)
   - Field rendering: `type: "string"` → `<Input>`, `type: "boolean"` → `<Checkbox>`, `type: "number"` → `<Input type="number">`, `enum` → `<Select>`, `type: "object"` → nested fieldset
   - Labels from schema property `title` or key name (title-cased)
   - Help text from schema property `description`
   - Default values from schema property `default`
   - Real-time validation: required fields, pattern, min/max (from JSON Schema constraints)
   - Field-level error messages inline below each field
   - "Save Configuration" `<Button>` → `PUT /api/v1/tenant/plugins/:id/config`
   - "Reset to Defaults" `<Button variant="ghost">`

4. **Empty state**: When no plugins are globally `ACTIVE`: `<EmptyState>` with "No extensions available. Contact your platform administrator."

5. **403 guard**:
   - Non-tenant-admin users: render `<Alert variant="destructive">` with "You don't have permission to manage extensions. Contact your tenant administrator."
   - RBAC check: `useAuthStore()` → verify `role === 'tenant_admin'`; if not, show 403 page

6. **ARIA**:
   - Switch toggles: `aria-label="Enable [Plugin Name]"`
   - Config form: standard form semantics with `<label htmlFor>` on all fields

**File map**:

- `apps/web/src/routes/extensions.tsx` — new TanStack Router route file
- `apps/web/src/components/plugins/PluginConfigForm.tsx` — new: JSON Schema → React form renderer
- `apps/web/src/lib/json-schema-to-fields.ts` — new: utility to parse JSON Schema into field definitions

---

## 9. UX Error Handling Plan

> Maps all edge cases from `user-journey.md` to specific UI components, API error codes, and recovery actions.

### 9.1 Error → UI Component Mapping

| Edge Case                         | Journey | API Error Code              | HTTP Status | UI Component                    | UI State                                                                                                         | Recovery Action                                                        |
| --------------------------------- | ------- | --------------------------- | ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Image pull failure                | J1-A    | `IMAGE_PULL_FAILED`         | 500         | `PluginInstallProgress`         | Step 2 (Image Pull) shows `✕` + `<Alert role="alert">` with "Failed to pull container image: {message}"          | "Retry" button retries from step 2                                     |
| Dependency not met                | J1-B    | `DEPENDENCY_NOT_MET`        | 409         | `PluginCard` + install dialog   | Install button `disabled`; tooltip: "Requires: {depName} (not installed)"; dependency name is a link to registry | Install the dependency plugin first                                    |
| Health check failure after enable | J2-A    | `HEALTH_CHECK_FAILED`       | 500         | `EnablePluginDialog` → progress | Enable progress shows error: "Plugin failed health check after 5s"; `lifecycleStatus` reset to INSTALLED         | "Retry Health Check" button re-calls `POST /api/v1/plugins/:id/enable` |
| Uninstall blocked by dependents   | J2-B    | `HAS_DEPENDENTS`            | 409         | `UninstallPluginDialog`         | Uninstall button permanently `disabled`; dependent plugins listed as links; "Remove these plugins first"         | User must uninstall dependent plugins first                            |
| Config validation error           | J3-A    | `VALIDATION_ERROR`          | 400         | `PluginConfigForm`              | Field-level inline `<span role="alert">` below each invalid field; form submit button remains enabled            | User corrects fields and re-submits                                    |
| Plugin not available (disabled)   | J3-B    | — (no API call)             | —           | `ExtensionsPage`                | `<EmptyState>`: "No extensions available. Contact your platform administrator."                                  | Tenant admin contacts super admin                                      |
| Permission denied (non-admin)     | J3-C    | `FORBIDDEN`                 | 403         | `ExtensionsPage`                | Full-page `<Alert variant="destructive">`: "You don't have permission to manage extensions."                     | User contacts tenant admin for role upgrade                            |
| Manifest validation error         | J4      | `INVALID_MANIFEST`          | 400         | Register modal                  | Field-level errors with JSON path (e.g., "manifest.runtime.image: required")                                     | User corrects manifest JSON and re-submits                             |
| Migration failure (single tenant) | J1      | `MIGRATION_PARTIAL_FAILURE` | 207         | `PluginInstallProgress`         | Step 3 shows warning: "Migrations completed with errors for N tenant(s)"; details expandable                     | "Retry Failed Migrations" button                                       |

### 9.2 Error Response Format

All plugin API errors follow Constitution Art. 6.2:

```json
{
  "error": {
    "code": "IMAGE_PULL_FAILED",
    "message": "Failed to pull container image 'plexica/crm-plugin:2.0.0': timeout after 60s",
    "details": {
      "pluginId": "crm",
      "step": 2,
      "image": "plexica/crm-plugin:2.0.0"
    }
  }
}
```

### 9.3 Frontend Error Handling Patterns

**API error hook** (`apps/web/src/hooks/usePluginMutation.ts`):

```typescript
function usePluginMutation(action: string) {
  return useMutation({
    mutationFn: (pluginId: string) => apiClient.post(`/api/v1/plugins/${pluginId}/${action}`),
    onError: (error: ApiError) => {
      // Map error.code to user-facing message
      const message = PLUGIN_ERROR_MESSAGES[error.code] ?? error.message;
      toast.error(message);
    },
  });
}

const PLUGIN_ERROR_MESSAGES: Record<string, string> = {
  IMAGE_PULL_FAILED:
    'Failed to pull the plugin container image. Check the image name and try again.',
  DEPENDENCY_NOT_MET: 'This plugin requires other plugins to be installed first.',
  HEALTH_CHECK_FAILED: 'The plugin failed its health check. It may need more time to start.',
  HAS_DEPENDENTS: 'Other plugins depend on this one. Remove them first.',
  PLUGIN_NOT_GLOBALLY_ACTIVE: 'This plugin must be enabled by a platform administrator first.',
  VALIDATION_ERROR: 'Some configuration values are invalid. Check the highlighted fields.',
  FORBIDDEN: 'You do not have permission to perform this action.',
};
```

### 9.4 Loading States

All screens implement three-state rendering:

1. **Loading**: `<Skeleton>` placeholders matching the layout shape (cards for grid, rows for tables)
2. **Error**: `<Alert variant="destructive">` with error message + "Retry" button
3. **Empty**: `<EmptyState>` with contextual message and CTA

---

## 10. Test Plan

### 10.1 Backend Coverage Targets

| Module                                                   | Current (est.) | Target | Notes       |
| -------------------------------------------------------- | -------------- | ------ | ----------- |
| `apps/core-api/src/services/plugin.service.ts`           | ~20%           | ≥85%   | Core module |
| `apps/core-api/src/services/tenant-migration.service.ts` | 0% (new)       | ≥85%   |             |
| `apps/core-api/src/services/service-registry.service.ts` | ~30%           | ≥80%   |             |
| `apps/core-api/src/routes/plugin-v1.ts`                  | 0% (new)       | ≥80%   |             |
| `apps/core-api/src/routes/tenant-plugins-v1.ts`          | 0% (new)       | ≥80%   |             |
| `apps/core-api/src/lib/container-adapter.ts`             | 0% (new)       | ≥80%   |             |
| `packages/sdk/src/decorators/`                           | 0% (new)       | ≥80%   |             |

### 10.2 Backend Key Test Scenarios

**FR-003 Lifecycle (T004-20, T004-21)**:

- ✅ Valid transitions: REGISTERED→INSTALLING, INSTALLING→INSTALLED, INSTALLED→ACTIVE
- ✅ Invalid transitions rejected (e.g., REGISTERED→ACTIVE directly)
- ✅ Install rolls back on image pull failure (lifecycleStatus stays REGISTERED)
- ✅ Edge Case 2: migration failure on one tenant does not affect others

**FR-004 Dependencies (T004-20)**:

- ✅ Install blocked when dependency plugin is not INSTALLED/ACTIVE
- ✅ Circular dependencies detected and rejected
- ✅ Edge Case 5: when dependency is uninstalled, dependent plugin auto-disabled

**FR-005 Tenant Migrations (T004-22)**:

- ✅ Migrations run in all active tenant schemas
- ✅ Per-tenant transaction rollback on failure
- ✅ Idempotency: re-running migration does not fail

**FR-006 Events (T004-24)**:

- ✅ Topics created for plugin's `events.publishes` and `events.subscribes` on enable
- ✅ Tenant context preserved in event headers

**FR-010 Headers (T004-27)**:

- ✅ `X-Tenant-ID`, `X-User-ID`, `X-Trace-ID` present on all plugin-to-plugin calls
- ✅ Missing `X-Tenant-ID` results in 400 error

**FR-014 Permissions (T004-24)**:

- ✅ Plugin permissions registered in RBAC system on install
- ✅ Edge Case 6: conflicting permissions fail second install

**NFR-004 Isolation (T004-24)**:

- ✅ Plugin failure (unhealthy container) does not affect core API
- ✅ PluginHookService fail-open behavior verified

### 10.3 Frontend Coverage Targets

| Component                                        | Target | Test File                                                        | Notes   |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------- | ------- |
| `apps/web/src/routes/plugins.tsx` (Registry tab) | ≥80%   | `apps/web/src/__tests__/plugins/PluginsView.test.tsx`            | T004-33 |
| `PluginInstallProgress.tsx`                      | ≥80%   | `apps/web/src/__tests__/plugins/PluginInstallProgress.test.tsx`  | T004-34 |
| `PluginLifecycleDialogs.tsx`                     | ≥80%   | `apps/web/src/__tests__/plugins/PluginLifecycleDialogs.test.tsx` | T004-35 |
| `PluginDetailModal.tsx`                          | ≥80%   | `apps/web/src/__tests__/plugins/PluginDetailModal.test.tsx`      | T004-36 |
| `ExtensionsPage` (routes/extensions.tsx)         | ≥80%   | `apps/web/src/__tests__/plugins/ExtensionsPage.test.tsx`         | T004-37 |
| `PluginConfigForm.tsx`                           | ≥80%   | included in T004-37                                              |         |

### 10.4 Frontend Test Scenarios

**Screen 1 — PluginsView Registry (T004-33)**:

- ✅ Renders loading skeleton while data is fetching
- ✅ Renders empty state with "No plugins registered" when list is empty
- ✅ Renders empty state with "No plugins found" when filters return no results
- ✅ Renders plugin cards with correct lifecycle status badges
- ✅ Search input debounces at 300ms and filters results
- ✅ Status filter dropdown filters by lifecycle status
- ✅ "Clear filters" button resets all filters
- ✅ Stat summary updates with `aria-live="polite"` on filter change
- ✅ ARIA: cards have `role="article"`
- ✅ ARIA: grid container navigable via keyboard (Tab through cards)
- ✅ Accessibility: passes `axe` audit (WCAG 2.1 AA)

**Screen 2 — PluginInstallProgress (T004-34)**:

- ✅ Renders 6 steps with pending icons initially
- ✅ Updates step icon from pending → running → complete as install progresses
- ✅ Shows spinner on running step
- ✅ On error: failed step shows `✕` icon and `<Alert role="alert">` with error message
- ✅ On error: remaining steps show "Skipped" state
- ✅ Retry button re-triggers install from failed step
- ✅ Elapsed timer increments (mock `setInterval`)
- ✅ Success state: shows "Enable now?" button
- ✅ ARIA: progress container has `role="log" aria-live="polite"`
- ✅ ARIA: migration sub-progress has `role="progressbar"` with correct `aria-valuenow`
- ✅ Screen reader: step transitions are announced via live region
- ✅ Accessibility: passes `axe` audit

**Screen 3 — Lifecycle Dialogs (T004-35)**:

- ✅ EnablePluginDialog: renders permissions list; confirm button calls enable API
- ✅ DisablePluginDialog: renders tenant count warning; confirm button calls disable API
- ✅ UpdatePluginDialog: renders version diff and migration count
- ✅ UninstallPluginDialog: name confirmation input required before uninstall button enables
- ✅ UninstallPluginDialog: blocked state when dependents exist — button disabled, links shown
- ✅ UninstallPluginDialog: data deletion checkbox unchecked by default
- ✅ All dialogs: focus trap — Tab cycles within dialog, not behind it
- ✅ All dialogs: Escape key closes dialog
- ✅ All dialogs: `role="dialog" aria-modal="true"` present
- ✅ All dialogs: `aria-labelledby` points to dialog title
- ✅ Accessibility: passes `axe` audit

**Screen 4 — PluginDetailModal (T004-36)**:

- ✅ Renders lifecycle timeline with current state highlighted
- ✅ Tab switching: Overview → Health → Permissions → Events
- ✅ Overview tab: renders stat cards and technical details table
- ✅ Health tab: renders endpoint status list and resource bars
- ✅ Health tab: auto-refresh polls every 30s (mock timer)
- ✅ Permissions tab: renders permissions table from manifest
- ✅ Events tab: renders publishes and subscribes lists
- ✅ ARIA: `role="tablist"` on tab container
- ✅ ARIA: each tab has `role="tab"` and `aria-selected`
- ✅ ARIA: tab panels have `role="tabpanel" aria-labelledby`
- ✅ Accessibility: passes `axe` audit

**Screen 5 — ExtensionsPage (T004-37)**:

- ✅ Renders only globally ACTIVE plugins
- ✅ Enable toggle switches plugin on → calls `POST /api/v1/tenant/plugins/:id/enable`
- ✅ Enable toggle shows confirmation dialog with permission list before enabling
- ✅ Disable toggle calls `POST /api/v1/tenant/plugins/:id/disable`
- ✅ "Configure" button opens config form after enabling
- ✅ Config form renders fields from manifest JSON Schema (string → Input, boolean → Checkbox)
- ✅ Config form shows field-level inline errors on validation failure
- ✅ Config form "Save" calls `PUT /api/v1/tenant/plugins/:id/config`
- ✅ Empty state: "No extensions available" when no plugins globally ACTIVE
- ✅ 403 guard: non-tenant-admin users see permission denied message
- ✅ ARIA: switch toggles have `aria-label`
- ✅ Accessibility: passes `axe` audit

### 10.5 Accessibility Test Setup

All frontend tests include `vitest-axe` assertions:

```typescript
import { axe, toHaveNoViolations } from 'vitest-axe';
expect.extend(toHaveNoViolations);

it('should have no accessibility violations', async () => {
  const { container } = render(<PluginsView />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Key WCAG 2.1 AA checks:

- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for large text
- All interactive elements keyboard-accessible
- Focus indicators visible
- All images/icons have alt text or `aria-hidden="true"`
- Form fields have associated `<label>` elements
- Modal dialogs trap focus

---

## 11. Performance Analysis

| NFR                                        | Target         | Implementation Strategy                                                                   |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| NFR-001: Health check < 100ms P95          | 100ms          | Proxy health check with 3s timeout; Redis cache plugin health status (TTL: 10s)           |
| NFR-002: Plugin-to-plugin REST < 200ms P95 | 200ms          | `PluginApiGateway` already implemented; add request timing metrics                        |
| NFR-003: Event delivery < 500ms P95        | 500ms          | Redpanda 3-node HA (ADR-005); monitor via Prometheus metrics in event-bus                 |
| NFR-004: Plugin failure isolation          | Container      | `ContainerAdapter` isolates failures; `PluginHookService` fail-open confirmed             |
| NFR-005: Security controls not bypassable  | Network policy | `ContainerAdapter` enforces network namespace; hook URL validation in `PluginHookService` |
| NFR-007: ≥20 plugins                       | Scale          | Service registry supports unlimited entries; Redis caching for discovery queries          |
| NFR-008: Zero-downtime install/update      | Rolling        | Lifecycle state machine prevents traffic routing during INSTALLING state                  |

**Caching strategy**:

- Plugin health status: Redis TTL 10s (avoid hammer on unhealthy containers)
- Plugin list (super_admin): Redis TTL 60s, invalidated on status change
- Service discovery results: Redis TTL 30s (existing ServiceRegistryService)

**Frontend performance** (Constitution Art. 1.3):

- Plugin Registry page: target < 2s load on 3G via lazy-loaded route + skeleton placeholders
- Install Progress: polling at 2s interval (not real-time WebSocket) to minimize server load
- Health tab: polling at 30s interval (not continuous)
- Config form: JSON Schema parsing is synchronous and cached; no re-parse on re-render

---

## 12. Security Checklist

Per Constitution Article 5 and `docs/SECURITY.md`:

| Check                            | Status     | Implementation                                                                                 |
| -------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| Container isolation              | T004-06/07 | Each plugin in separate container; `ContainerAdapter` enforces boundaries                      |
| Network policies                 | T004-07    | `DockerContainerAdapter` sets network namespace; plugins can't call internal services directly |
| Plugin secrets via env vars only | Existing   | Manifest schema rejects secrets fields; secrets injected via Docker env                        |
| Hook URL validation              | ✅ Exists  | `PluginHookService.invokeHook()` validates URL origin matches apiBasePath                      |
| X-Tenant-ID propagation          | T004-27    | Verified in gateway + tests                                                                    |
| RBAC on all plugin routes        | T004-09/10 | `requireRole('super_admin')` / `requireTenantAdmin()` on all new routes                        |
| Input validation via Zod         | ✅ Exists  | `validatePluginManifest()` in Zod schema                                                       |
| No raw SQL in migrations         | T004-04    | `$executeRawUnsafe` only with parameterized inputs; migration SQL is from trusted plugin files |
| No PII in plugin logs            | T004-20    | Test assertions verify log sanitization                                                        |
| Dependency vulnerability scan    | CI         | `pnpm audit` in GitHub Actions pipeline                                                        |
| Frontend RBAC guard              | T004-32    | Extensions page checks role before rendering; 403 page for non-admins                          |
| Config form XSS prevention       | T004-32    | JSON Schema values rendered as text content (not `dangerouslySetInnerHTML`)                    |

> **Note on `$executeRawUnsafe` in TenantMigrationService**: Plugin migration SQL comes from trusted plugin packages stored in the registry, not from end-user input. However, implementation must validate migration SQL against an allowlist of DDL operations before execution (no DML that could leak cross-tenant data).

---

## 13. Risk Register

| #    | Risk                                                                                   | Probability | Impact | Mitigation                                                                                                |
| ---- | -------------------------------------------------------------------------------------- | ----------- | ------ | --------------------------------------------------------------------------------------------------------- |
| R001 | `dockerode` adds 2MB+ to bundle; Docker API changes break adapter                      | Medium      | Medium | Pin `dockerode` version; abstract behind interface (swap to Dockerode v4 or K8s client later via ADR-019) |
| R002 | Plugin SQL migrations are not idempotent; re-running fails                             | Medium      | High   | Implement migration state tracking table per tenant schema; check before running                          |
| R003 | `PluginLifecycleStatus` backfill migration leaves inconsistent data                    | Low         | Medium | Explicit backfill SQL; pre-migration data audit; rollback plan documented                                 |
| R004 | Module Federation remoteEntry URL changes between versions break running sessions      | Medium      | Low    | Frontend shell handles 404 remoteEntry gracefully (ADR-011 already handles this)                          |
| R005 | Test coverage target (85%) requires significant test authoring; blocks sprint velocity | High        | Medium | Phase 5 dedicated to tests; use `buildTestApp()` pattern from existing integration tests                  |
| R006 | JSON Schema → form rendering complexity exceeds estimates for nested/recursive schemas | Medium      | Medium | Limit to depth-2 nesting initially; deeply nested schemas render raw JSON editor fallback                 |
| R007 | `vitest-axe` false positives in ARIA assertions slow test velocity                     | Low         | Low    | Configure known-safe rule exclusions; document in test setup                                              |

---

## 14. Story Point Summary

| Phase                                           | Tasks             | Story Points | Sprint            |
| ----------------------------------------------- | ----------------- | ------------ | ----------------- |
| Phase 1: Lifecycle State Machine & DB Migration | T004-01 → T004-05 | 12 pts       | Sprint 4 Week 1   |
| Phase 2: Container Adapter & API Routes         | T004-06 → T004-11 | 16 pts       | Sprint 4 Week 2   |
| Phase 3: Communication & Frontend Registration  | T004-12 → T004-15 | 12 pts       | Sprint 4 Week 3   |
| Phase 4: SDK Completion                         | T004-16 → T004-19 | 10 pts       | Sprint 4 Week 4   |
| Phase 5: Testing & Security Hardening           | T004-20 → T004-27 | 12 pts       | Sprint 5 Week 1   |
| Phase 6: Frontend UI Implementation             | T004-28 → T004-32 | 20 pts       | Sprint 5 Week 2–3 |
| Phase 7: Frontend Tests                         | T004-33 → T004-37 | 10 pts       | Sprint 5 Week 3–4 |
| **Total**                                       | **37 tasks**      | **92 pts**   | **~7 weeks**      |

> 1 story point ≈ 2h focused engineering. 92 pts ≈ 184h ≈ 3 engineers × 3 weeks or 1 engineer × 9.5 weeks.

### Sprint Allocation Recommendation

- **Sprint 4** (4 weeks): Phases 1–4 (50 pts) — core plugin system fully operational
- **Sprint 5** (3–4 weeks): Phase 5 (12 pts) + Phase 6 (20 pts) + Phase 7 (10 pts) — test coverage, frontend UI, frontend tests

---

## New ADRs Required

| ADR     | Title                                  | Decision                                                                 |
| ------- | -------------------------------------- | ------------------------------------------------------------------------ |
| ADR-018 | Plugin Lifecycle vs Marketplace Status | Separate `lifecycleStatus` column (new enum) from `status` (marketplace) |
| ADR-019 | Pluggable Container Adapter            | Interface with Docker + Null implementations; K8s deferred               |

---

## Cross-References

| Document       | Path                                                          |
| -------------- | ------------------------------------------------------------- |
| Spec 004       | `.forge/specs/004-plugin-system/spec.md`                      |
| Design Spec    | `.forge/specs/004-plugin-system/design-spec.md`               |
| User Journey   | `.forge/specs/004-plugin-system/user-journey.md`              |
| Constitution   | `.forge/constitution.md`                                      |
| ADR-003        | `.forge/knowledge/adr/adr-003-plugin-language-support.md`     |
| ADR-005        | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`       |
| ADR-011        | `.forge/knowledge/adr/adr-011-vite-module-federation.md`      |
| ADR-014        | `.forge/knowledge/adr/adr-014-workspace-plugin-scoping.md`    |
| ADR-018        | `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`     |
| ADR-019        | `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md` |
| Security Guide | `docs/SECURITY.md`                                            |
| Event Bus      | `packages/event-bus/`                                         |
| SDK            | `packages/sdk/`                                               |
