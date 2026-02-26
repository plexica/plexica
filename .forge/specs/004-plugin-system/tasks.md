# Tasks: 004 - Plugin System

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Spec   | `.forge/specs/004-plugin-system/spec.md` |
| Plan   | `.forge/specs/004-plugin-system/plan.md` |
| Status | Complete                                 |
| Sprint | 4–5                                      |
| Total  | 37 tasks / 92 story points               |

> **Key constraint**: The existing `PluginRegistryService`, `PluginLifecycleService`,
> `ServiceRegistryService`, `SharedDataService`, `DependencyResolutionService`,
> `plugin-hook.service.ts`, and `@plexica/event-bus` are **already implemented** — do
> not rebuild them. All tasks are additive extensions or alignments of existing code.
>
> **ADR status**: ADR-018 (lifecycle vs marketplace status) and ADR-019 (pluggable
> container adapter) are **already written** at `.forge/knowledge/adr/`. T004-15
> verifies the code reflects those decisions — it is a cross-check task, not an ADR
> authoring task.
>
> **Auth guard conventions** (from `apps/core-api/src/middleware/auth.ts`):
>
> - `requireSuperAdmin` — super admin routes
> - `requireTenantAccess` — tenant-scoped routes (use for tenant_admin guard)
> - Pattern: `preHandler: [authMiddleware, requireSuperAdmin]`
>
> **Test token helpers** (from `test-infrastructure/helpers/test-auth.helper.ts`):
>
> - `testContext.auth.createMockSuperAdminToken()` — super admin JWT
> - `testContext.auth.createMockTenantAdminToken(tenantSlug)` — tenant admin JWT
>
> **Test app**: `buildTestApp()` from `apps/core-api/src/test-app.ts`

---

## Phase 1: Lifecycle State Machine & Database Migration

**Sprint 4, Week 1 | 12 story points**

> All Phase 1 tasks are foundational. T004-01 must complete before T004-02 and
> T004-03. T004-04 and T004-05 are independent of each other and can run in
> parallel once T004-01 is complete. T004-02 can also run in parallel with T004-03.

---

### T004-01: Add `PluginLifecycleStatus` enum and `lifecycleStatus` column to Prisma schema

| Field        | Value    |
| ------------ | -------- |
| Points       | 2        |
| Phase        | 1        |
| Dependencies | None     |
| Parallel     | No       |
| Status       | complete |

**Goal**: Extend the `Plugin` Prisma model with a new `lifecycleStatus` column backed by
a new `PluginLifecycleStatus` enum, keeping the existing `status` (marketplace) column
completely untouched.

**Context**:

- Existing `Plugin` model is in `packages/database/prisma/schema.prisma` (lines ~62–106).
- Existing `PluginStatus` enum (DRAFT/PENDING_REVIEW/PUBLISHED/DEPRECATED/REJECTED) lives
  in the `core` schema around line 52. It tracks marketplace publishing state and **must
  not be changed**.
- The new `PluginLifecycleStatus` enum tracks runtime deployment state (ADR-018). These
  two concerns are orthogonal — one plugin record will have both columns simultaneously.
- All Prisma models in this file use `@@schema("core")` for the core schema.
- Migration SQL must live in a new timestamped directory under
  `packages/database/prisma/migrations/`.
- Backfill: existing `PUBLISHED` plugins should be set to `INSTALLED`
  (the closest equivalent); all other rows default to `REGISTERED`.
- Add an index on `lifecycle_status` for efficient status-based queries.

**Acceptance Criteria**:

- [ ] New `PluginLifecycleStatus` enum added to `schema.prisma` in `@@schema("core")` with
      states: `REGISTERED`, `INSTALLING`, `INSTALLED`, `ACTIVE`, `DISABLED`,
      `UNINSTALLING`, `UNINSTALLED`
- [ ] `Plugin` model has new field `lifecycleStatus PluginLifecycleStatus @default(REGISTERED) @map("lifecycle_status")`
- [ ] Migration SQL creates the enum type in `"core"` schema
- [ ] Migration SQL adds `lifecycle_status` column with `NOT NULL DEFAULT 'REGISTERED'`
- [ ] Migration SQL backfills: `UPDATE "core"."plugins" SET lifecycle_status = 'INSTALLED' WHERE status = 'PUBLISHED'`
- [ ] Migration SQL creates `idx_plugins_lifecycle_status` index
- [ ] Existing `PluginStatus` enum and `status` column are unchanged
- [ ] `pnpm build` passes in `packages/database`

**Files to create/modify**:

- `packages/database/prisma/schema.prisma` — add `PluginLifecycleStatus` enum and
  `lifecycleStatus` field to `Plugin` model
- `packages/database/prisma/migrations/<timestamp>_add_plugin_lifecycle_status/migration.sql` —
  new file with the SQL from plan.md §6 Migration 1

**Tests required**:

- None at this task level — T004-02 validates the generated client works

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes in `packages/database`
- [ ] `pnpm lint` passes

---

### T004-02: Generate Prisma client and update `@plexica/database` exports

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 1                                    |
| Phase        | 1                                    |
| Dependencies | T004-01                              |
| Parallel     | `[P]` with T004-03, T004-04, T004-05 |
| Status       | complete                             |

**Goal**: Regenerate the Prisma client after the schema change and ensure
`PluginLifecycleStatus` is exported from `@plexica/database` so all other packages can
import it without reaching into Prisma internals.

**Context**:

- `packages/database/src/index.ts` re-exports Prisma-generated types for consumers.
- After schema changes, `pnpm db:generate` must be run to regenerate the client.
- `PluginStatus` is already exported — `PluginLifecycleStatus` needs to be added
  alongside it.
- Other packages (`apps/core-api`) import from `@plexica/database`, not from
  `@prisma/client` directly.

**Acceptance Criteria**:

- [ ] `pnpm db:generate` runs successfully with the updated schema
- [ ] `PluginLifecycleStatus` is exported from `packages/database/src/index.ts`
- [ ] `import { PluginLifecycleStatus } from '@plexica/database'` resolves without error
- [ ] Existing `PluginStatus` export is not removed or changed
- [ ] `pnpm build` passes in `packages/database`

**Files to create/modify**:

- `packages/database/src/index.ts` — add `PluginLifecycleStatus` to the named exports

**Tests required**:

- Unit (smoke): verify the export resolves — this is implicitly tested when T004-03
  imports `PluginLifecycleStatus` in its implementation

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes in `packages/database` and `apps/core-api`
- [ ] `pnpm lint` passes

---

### T004-03: Update `PluginLifecycleService` with `lifecycleStatus` state machine

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 3                           |
| Phase        | 1                           |
| Dependencies | T004-01, T004-02            |
| Parallel     | `[P]` with T004-04, T004-05 |
| Status       | complete                    |

**Goal**: Teach `PluginLifecycleService` to read and write `lifecycleStatus` using a
validated state machine so invalid transitions (e.g., REGISTERED→ACTIVE directly) are
rejected with clear errors.

**Context**:

- `PluginLifecycleService` is in `apps/core-api/src/services/plugin.service.ts`
  (lines ~473–1039).
- Currently the service uses `TenantPlugin.enabled` (boolean) and `Plugin.status`
  (marketplace enum) — it has **no** concept of `lifecycleStatus`.
- The existing `installPlugin()` checks `plugin.status === PluginStatus.PUBLISHED` to
  guard against non-published plugins; this guard must remain but the lifecycle
  transition now also needs `lifecycleStatus` management.
- `runLifecycleHook()` at line ~1008 is a stub (TODO comment) — it stays a stub for now;
  T004-08 wires the real `ContainerAdapter`.
- State machine transitions (from ADR-018):
  - `installPlugin()`: REGISTERED → INSTALLING → INSTALLED (rollback to REGISTERED on failure)
  - `activatePlugin()` (enable super-admin): INSTALLED → ACTIVE
  - `deactivatePlugin()` (disable super-admin): ACTIVE → DISABLED
  - `uninstallPlugin()`: DISABLED → UNINSTALLING → UNINSTALLED (or INSTALLED → UNINSTALLING)
- Invalid transitions must throw: `Plugin '${pluginId}' cannot transition from ${current} to ${target}`
- The `Plugin` model (global record) holds `lifecycleStatus`; `TenantPlugin` keeps
  `enabled` (boolean) for per-tenant activation — these remain separate concerns.
  (Super-admin lifecycle vs. tenant-admin activation are distinct; see plan.md §3.)

**Acceptance Criteria**:

- [ ] Private `VALID_TRANSITIONS` map defined:
      `{ REGISTERED: ['INSTALLING'], INSTALLING: ['INSTALLED', 'REGISTERED'], INSTALLED: ['ACTIVE', 'UNINSTALLING'], ACTIVE: ['DISABLED'], DISABLED: ['ACTIVE', 'UNINSTALLING'], UNINSTALLING: ['UNINSTALLED'], UNINSTALLED: [] }`
- [ ] Private `transitionLifecycleStatus(pluginId, target)` helper validates transition
      and updates `Plugin.lifecycleStatus` via `db.plugin.update`
- [ ] `installPlugin()` calls `transitionLifecycleStatus(id, 'INSTALLING')` at start,
      `transitionLifecycleStatus(id, 'INSTALLED')` on success, and
      `transitionLifecycleStatus(id, 'REGISTERED')` on failure (rollback)
- [ ] `activatePlugin()` (super-admin) calls `transitionLifecycleStatus(id, 'ACTIVE')`
- [ ] `deactivatePlugin()` (super-admin) calls `transitionLifecycleStatus(id, 'DISABLED')`
- [ ] `uninstallPlugin()` (super-admin) calls `transitionLifecycleStatus(id, 'UNINSTALLING')`
      then `transitionLifecycleStatus(id, 'UNINSTALLED')`
- [ ] Invalid transition throws `Error` with message pattern: `Plugin '${id}' cannot transition from ${current} to ${target}`
- [ ] Existing `TenantPlugin.enabled` boolean logic for tenant-level on/off is unchanged
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/plugin.service.ts` — add `VALID_TRANSITIONS` map,
  `transitionLifecycleStatus()` private method, and wire transitions into
  `installPlugin()`, `activatePlugin()`, `deactivatePlugin()`, `uninstallPlugin()`

**Tests required**:

- Unit (T004-21 covers this in depth; add inline coverage here for fast feedback):
  Write a minimal smoke test in `apps/core-api/src/__tests__/plugin/unit/plugin-lifecycle.unit.test.ts`
  verifying REGISTERED→INSTALLING is accepted and REGISTERED→ACTIVE is rejected.

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Tests pass (`pnpm test:unit`)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-04: Implement `TenantMigrationService`

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 4                           |
| Phase        | 1                           |
| Dependencies | T004-01                     |
| Parallel     | `[P]` with T004-03, T004-05 |
| Status       | complete                    |

**Goal**: Implement a new `TenantMigrationService` that runs a plugin's SQL migration
files against every active tenant schema in separate per-tenant transactions, so that a
failure in one tenant does not affect any others (spec Edge Case 2, FR-005).

**Context**:

- No implementation exists yet — this is a new file.
- `tenantService` in `apps/core-api/src/services/tenant.service.ts` has
  `getSchemaName(slug)` which returns the schema name string for a tenant.
- Pattern from plan.md §4.4: `prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe('SET search_path TO "tenant_${id}"'); ... })`
- **Security requirement** (plan.md §10): Plugin migration SQL comes from trusted plugin
  packages in the registry (not user input). However, before executing, validate that
  migration SQL contains only DDL operations (CREATE TABLE, ALTER TABLE, CREATE INDEX,
  CREATE TYPE). Reject any DML (INSERT/UPDATE/DELETE/SELECT) to prevent cross-tenant
  data leaks.
- Migration idempotency: track executed migrations in a `_plugin_migrations` table
  per tenant schema. Skip already-applied migrations. Create the tracking table if
  it does not exist.
- The service reads migration SQL from the plugin's manifest `migrations.path` field
  (the path is relative to the plugin package stored in the registry).
- Expose a `runPluginMigrations(pluginId: string): Promise<MigrationResult[]>` method
  that is called from `PluginLifecycleService.installPlugin()` (wired in T004-03/T004-08).
- Also expose `rollbackPluginMigrations(pluginId: string, tenantId: string)` for per-
  tenant rollback (plan.md §4.4, Edge Case 2).
- `MigrationResult` type: `{ tenantId: string; success: boolean; migrationsRun: number; error?: string }`

**Acceptance Criteria**:

- [ ] `TenantMigrationService` class created and exported from new file
- [ ] `runPluginMigrations(pluginId)` queries all tenants with `status = ACTIVE`
- [ ] Each tenant's migrations run in an isolated `prisma.$transaction`; one failure
      does not roll back other tenants
- [ ] `SET search_path TO "tenant_${tenantId}"` is set inside the transaction before
      migration SQL runs
- [ ] Pre-execution DDL-only validation rejects SQL containing DML keywords
      (INSERT, UPDATE, DELETE, SELECT) with a clear error
- [ ] `_plugin_migrations` tracking table created per schema on first run
- [ ] Already-applied migrations are skipped (idempotent re-runs safe)
- [ ] `MigrationResult[]` returned with per-tenant success/failure detail
- [ ] On failure for a given tenant, the error is logged and that tenant's result has
      `success: false`; other tenants are not affected
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/tenant-migration.service.ts` — new file implementing
  `TenantMigrationService`

**Tests required**:

- Unit (T004-22 covers in depth; create the test file with basic stubs now):
  `apps/core-api/src/__tests__/plugin/unit/tenant-migration.unit.test.ts`
  — mock `db.$transaction`, verify per-tenant isolation (one failure doesn't propagate),
  verify DDL-only validation rejects a SELECT statement

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass (`pnpm test:unit`)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-05: Wire permission registration into `installPlugin()` flow

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 1                           |
| Dependencies | T004-01                     |
| Parallel     | `[P]` with T004-03, T004-04 |
| Status       | complete                    |

**Goal**: Ensure that when a plugin is installed, its declared permissions are
registered into the RBAC system at the **global** (super-admin install) level, not only
at the per-tenant level as the current code partially does.

**Context**:

- `permissionRegistrationService` is already imported in `plugin.service.ts` (line ~16)
  and called at line ~626 for per-tenant permission registration inside `installPlugin()`.
- The current code registers permissions only when `tenantId` is provided (tenant-scoped
  install). The spec requires permissions to be registered globally on super-admin
  install so tenants can enable the plugin without a separate permission registration
  step.
- Look at `permission-registration.service.ts` to understand
  `registerPluginPermissions(tenantId, schemaName, pluginId, permInputs)` —
  determine whether a "global" registration variant exists or needs to be called with a
  sentinel tenantId.
- Edge Case 6 (spec): if two plugins register conflicting permission keys, the second
  install must fail with a `PERMISSION_KEY_CONFLICT` error.
- The existing rollback pattern (lines ~632–644) which deletes the `tenantPlugin` row on
  conflict should be adapted for the global case.
- Permissions from `manifest.permissions` use `{ key, name, description }` (spec §7
  manifest schema) — map these directly without the `${resource}:${action}` join that
  the tenant-level code currently applies.

**Acceptance Criteria**:

- [ ] `installPlugin()` (super-admin path, operating on the global `Plugin` record)
      calls `permissionRegistrationService.registerPluginPermissions()` after the DB
      transaction succeeds
- [ ] Each permission from `manifest.permissions` is mapped to `{ key, name, description }`
- [ ] On `PERMISSION_KEY_CONFLICT`, the global `Plugin` record's `lifecycleStatus` is
      reset to `REGISTERED` and the error is rethrown
- [ ] Edge Case 6 is covered: second install with a conflicting permission key throws
      an error whose message contains `PERMISSION_KEY_CONFLICT`
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/plugin.service.ts` — extend the super-admin
  `installPlugin()` path to call `permissionRegistrationService` for global permissions

**Tests required**:

- Unit (T004-20 covers in depth; add one test now):
  Verify that installing a plugin with `manifest.permissions = [{ key: 'crm:read', ... }]`
  calls `permissionRegistrationService.registerPluginPermissions` with the correct
  arguments (mock the service)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Tests pass (`pnpm test:unit`)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

## Phase 2: Container Adapter & API Route Alignment

**Sprint 4, Week 2 | 16 story points**

> T004-06 and T004-07 can start in parallel with Phase 1 work (T004-04 and T004-05).
> T004-08 requires T004-06 and T004-07. T004-09 and T004-10 require T004-03 (state
> machine). T004-11 can be written alongside T004-09 in the same file.

---

### T004-06: Define `ContainerAdapter` interface and `NullContainerAdapter`

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 2                                    |
| Phase        | 2                                    |
| Dependencies | None (foundational)                  |
| Parallel     | `[P]` with T004-04, T004-05, T004-07 |
| Status       | complete                             |

**Goal**: Define the `ContainerAdapter` interface (ADR-019) and implement a `NullContainerAdapter`
that no-ops all operations, allowing tests and non-Docker environments to run without a
live Docker daemon.

**Context**:

- ADR-019 is already written at `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md`.
  This task implements the interface it describes.
- The interface per plan.md §4.2:
  ```typescript
  interface ContainerAdapter {
    start(pluginId: string, config: ContainerConfig): Promise<void>;
    stop(pluginId: string): Promise<void>;
    health(pluginId: string): Promise<'healthy' | 'unhealthy' | 'starting'>;
    remove(pluginId: string): Promise<void>;
  }
  ```
- `ContainerConfig` should include: `image: string`, `env?: Record<string, string>`,
  `ports?: { container: number; host: number }[]`,
  `resources?: { cpu?: string; memory?: string }` (FR-017).
- `NullContainerAdapter`: `start()` logs and resolves, `stop()` resolves, `health()`
  always returns `'healthy'`, `remove()` resolves.
- The adapter to use is selected at runtime via the `CONTAINER_ADAPTER` environment
  variable (`'docker'` | `'null'`). Export a factory function
  `createContainerAdapter(): ContainerAdapter` that reads this env var.
- No `dockerode` dependency yet — that is T004-07.

**Acceptance Criteria**:

- [ ] `ContainerAdapter` interface exported from `apps/core-api/src/lib/container-adapter.ts`
- [ ] `ContainerConfig` type exported alongside the interface
- [ ] `NullContainerAdapter` class implements `ContainerAdapter`; all methods resolve
      without side effects; `health()` returns `'healthy'`
- [ ] `createContainerAdapter()` factory function exported; returns `NullContainerAdapter`
      when `CONTAINER_ADAPTER !== 'docker'` (default)
- [ ] `CONTAINER_ADAPTER=docker` path returns a placeholder that throws
      `ContainerAdapter 'docker' requires DockerContainerAdapter — implement T004-07`
      (will be replaced by T004-07)
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/lib/container-adapter.ts` — new file with interface,
  `ContainerConfig` type, `NullContainerAdapter`, and `createContainerAdapter()` factory

**Tests required**:

- Unit (T004-23 covers adapters in depth; add one test now):
  `NullContainerAdapter.health('any-plugin')` resolves to `'healthy'`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-07: Implement `DockerContainerAdapter` using `dockerode`

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 4                           |
| Phase        | 2                           |
| Dependencies | T004-06                     |
| Parallel     | `[P]` with T004-04, T004-05 |
| Status       | complete                    |

**Goal**: Implement the Docker-based `ContainerAdapter` using the `dockerode` library,
including container image pulling, start/stop/remove operations, health-check polling,
and resource limit enforcement (FR-001, FR-017).

**Context**:

- `dockerode` must be added as a production dependency to `apps/core-api/package.json`
  and its types `@types/dockerode` as a dev dependency.
- Container naming convention: `plexica-plugin-${pluginId}` to avoid conflicts.
- `start()` flow: pull image if not present → create container with env, port bindings,
  and resource limits → start container.
- Resource limits (FR-017): `HostConfig.Memory` (in bytes), `HostConfig.CpuQuota`
  (in microseconds per 100ms period). Map `config.resources.memory` (e.g., `'512m'`)
  and `config.resources.cpu` (e.g., `'0.5'`) to Docker API values.
- `health()`: call `container.inspect()`, check `State.Health.Status`. If no health
  check is configured, return `'healthy'` if `State.Running`, else `'unhealthy'`.
- Network isolation (NFR-005, plan.md §10): create a dedicated Docker network
  `plexica-plugins` if it doesn't exist; attach plugin containers to it. Do **not**
  attach to the host network. Internal services (Redis, DB) are not reachable from the
  plugin network unless explicitly bridged.
- Update the `createContainerAdapter()` factory in `container-adapter.ts` to return a
  real `DockerContainerAdapter` when `CONTAINER_ADAPTER=docker`.
- Error handling: Docker API errors should be wrapped with context:
  `new Error('DockerContainerAdapter.start failed for plugin ${pluginId}: ${cause.message}')`.

**Acceptance Criteria**:

- [ ] `dockerode` and `@types/dockerode` added to `apps/core-api/package.json`
- [ ] `DockerContainerAdapter` class in new file implements `ContainerAdapter`
- [ ] `start()` pulls image if not local, creates container with env and port bindings,
      attaches to `plexica-plugins` network, starts container
- [ ] `start()` applies memory and CPU resource limits when present in `ContainerConfig`
- [ ] `stop()` gracefully stops container (10s timeout), catches "container not running"
      errors without throwing
- [ ] `health()` returns `'healthy' | 'unhealthy' | 'starting'` based on Docker
      container inspect state
- [ ] `remove()` removes stopped container; logs warning and resolves if not found
- [ ] `createContainerAdapter()` factory in `container-adapter.ts` updated to return
      `DockerContainerAdapter` when `CONTAINER_ADAPTER=docker`
- [ ] All Docker errors wrapped with plugin context in the message
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/lib/docker-container-adapter.ts` — new file with `DockerContainerAdapter`
- `apps/core-api/src/lib/container-adapter.ts` — update factory to return Docker adapter
- `apps/core-api/package.json` — add `dockerode` dependency and `@types/dockerode` dev
  dependency

**Tests required**:

- Unit (T004-23): mock `dockerode` with `vi.mock('dockerode')`; test `start()` calls
  `pullImage`, `createContainer`, `container.start()`; test `health()` maps Docker
  states correctly; test that CPU/memory config is passed through to `HostConfig`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass (mock Docker — no live Docker required)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-08: Wire `ContainerAdapter` into `PluginLifecycleService`

| Field        | Value                     |
| ------------ | ------------------------- |
| Points       | 3                         |
| Phase        | 2                         |
| Dependencies | T004-03, T004-06, T004-07 |
| Parallel     | No                        |
| Status       | complete                  |

**Goal**: Replace the `runLifecycleHook()` stub in `PluginLifecycleService` with real
`ContainerAdapter` calls so that enabling a plugin starts its container, disabling stops
it, and uninstalling removes it.

**Context**:

- `runLifecycleHook()` in `plugin.service.ts` (line ~1008) is a TODO stub. It is called
  during `installPlugin()`, `activatePlugin()`, and `deactivatePlugin()`. Replace these
  call sites with direct `ContainerAdapter` calls.
- The `ContainerAdapter` instance should be injected via constructor (accept optional
  `adapter?: ContainerAdapter` parameter defaulting to `createContainerAdapter()`).
  This enables tests to inject `NullContainerAdapter`.
- `activatePlugin()` (super-admin) flow per plan.md §3:
  1. `adapter.start(pluginId, containerConfig)` — start container
  2. Poll `adapter.health(pluginId)` every 500ms until `'healthy'` or 5s timeout
  3. If still not healthy after 5s, call `adapter.stop()`, reset `lifecycleStatus`
     to `INSTALLED`, throw `Error('Plugin ${id} failed health check after enable')`
  4. Register in `ServiceRegistry` (existing call)
  5. `transitionLifecycleStatus(id, 'ACTIVE')`
- `deactivatePlugin()` (super-admin) flow:
  1. `transitionLifecycleStatus(id, 'DISABLED')`
  2. `adapter.stop(pluginId)`
  3. Deregister from `ServiceRegistry` (existing)
- `uninstallPlugin()` flow:
  1. `transitionLifecycleStatus(id, 'UNINSTALLING')`
  2. `adapter.remove(pluginId)`
  3. Existing cleanup (permissions, service registry)
  4. `transitionLifecycleStatus(id, 'UNINSTALLED')`
- `buildContainerConfig(manifest)` private helper reads `manifest.runtime.image`,
  `manifest.runtime.resources`, and any `env` from plugin config to build `ContainerConfig`.
- Also wire `TenantMigrationService.runPluginMigrations(pluginId)` call into
  `installPlugin()` between the DB transaction and permission registration (replacing the
  old `runLifecycleHook` install call).

**Acceptance Criteria**:

- [ ] `PluginLifecycleService` constructor accepts optional `adapter: ContainerAdapter`
      and `migrationService: TenantMigrationService` parameters
- [ ] `activatePlugin()` calls `adapter.start()`, polls health with 5s timeout,
      and rolls back `lifecycleStatus` to `INSTALLED` if health check fails
- [ ] `deactivatePlugin()` calls `adapter.stop()` after transitioning to `DISABLED`
- [ ] `uninstallPlugin()` calls `adapter.remove()` between `UNINSTALLING` and
      `UNINSTALLED` transitions
- [ ] `installPlugin()` calls `migrationService.runPluginMigrations(pluginId)` after
      the DB transaction; if any tenant migration fails, `lifecycleStatus` rolls back
      to `REGISTERED` and the error is thrown
- [ ] `runLifecycleHook()` stub method is removed (or kept as empty private placeholder
      clearly marked as deprecated)
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/plugin.service.ts` — update `PluginLifecycleService`
  constructor, `activatePlugin()`, `deactivatePlugin()`, `uninstallPlugin()`, and
  `installPlugin()` with real `ContainerAdapter` and `TenantMigrationService` calls

**Tests required**:

- Unit (T004-21): inject `NullContainerAdapter` and a mock `TenantMigrationService`
  to verify `start()` is called on activate, `stop()` on deactivate, `remove()` on
  uninstall, and migrations are called on install; verify health-check timeout rollback

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass with `NullContainerAdapter`
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-09: Add spec-aligned super-admin v1 plugin routes

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 4                           |
| Phase        | 2                           |
| Dependencies | T004-03, T004-08            |
| Parallel     | `[P]` with T004-10, T004-11 |
| Status       | complete                    |

**Goal**: Implement the spec's super-admin API contract for plugin lifecycle management
as new v1 routes, without touching or removing the existing `plugin.ts` routes
(backward compatibility per Constitution Art. 1.2 §3).

**Context**:

- Existing routes are in `apps/core-api/src/routes/plugin.ts` — do not modify.
- New routes go in a new file `apps/core-api/src/routes/plugin-v1.ts`.
- Auth guards: `preHandler: [authMiddleware, requireSuperAdmin]` for all routes.
- Import `authMiddleware` and `requireSuperAdmin` from
  `apps/core-api/src/middleware/auth.ts`.
- Response format must follow Constitution Art. 6.2:
  `{ error: { code, message, details? } }` for errors.
- All routes return JSON; use `reply.code(200).send(result)` pattern.
- The `listPlugins` handler adds support for `lifecycleStatus` query filter in addition
  to the existing `status` filter.
- `installPlugin` handler signature: `POST /api/v1/plugins/:id/install` — calls
  `PluginLifecycleService.installPlugin(pluginId)` (global, no tenantId).
  Note: the global install is different from the existing per-tenant install.
- Route registration: the new file exports a Fastify plugin function registered in
  `apps/core-api/src/index.ts` under `app.register(pluginV1Routes, { prefix: '/api/v1' })`.
- Routes table (from plan.md §7):

  | Method | Path                        | Handler           | Service call                                  |
  | ------ | --------------------------- | ----------------- | --------------------------------------------- |
  | GET    | /api/v1/plugins             | `listPlugins`     | `PluginRegistryService.listPlugins()`         |
  | POST   | /api/v1/plugins             | `registerPlugin`  | `PluginRegistryService.registerPlugin()`      |
  | POST   | /api/v1/plugins/:id/install | `installPlugin`   | `PluginLifecycleService.installPlugin(id)`    |
  | POST   | /api/v1/plugins/:id/enable  | `enablePlugin`    | `PluginLifecycleService.activatePlugin(id)`   |
  | POST   | /api/v1/plugins/:id/disable | `disablePlugin`   | `PluginLifecycleService.deactivatePlugin(id)` |
  | POST   | /api/v1/plugins/:id/update  | `updatePlugin`    | `PluginLifecycleService.updatePlugin(id, v)`  |
  | DELETE | /api/v1/plugins/:id         | `uninstallPlugin` | `PluginLifecycleService.uninstallPlugin(id)`  |

**Acceptance Criteria**:

- [ ] New file `apps/core-api/src/routes/plugin-v1.ts` exports a Fastify plugin function
- [ ] All 7 routes listed above are implemented with `requireSuperAdmin` guard
- [ ] `listPlugins` supports query params `page`, `limit`, `status`, `lifecycleStatus`
- [ ] `registerPlugin` validates body against `PluginManifestSchema` (existing Zod schema)
- [ ] All handlers return HTTP 200 on success; errors return structured
      `{ error: { code, message } }` response via Fastify's error handler
- [ ] New routes registered in `apps/core-api/src/index.ts` under `/api/v1` prefix
- [ ] Existing routes in `plugin.ts` are untouched
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/routes/plugin-v1.ts` — new file (super-admin lifecycle routes)
- `apps/core-api/src/index.ts` — register `pluginV1Routes` under `/api/v1`

**Tests required**:

- Integration (T004-24): `POST /api/v1/plugins/:id/install` with super-admin token
  succeeds; `POST /api/v1/plugins/:id/install` with missing auth returns 401;
  `POST /api/v1/plugins/unknown/enable` returns 404

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-10: Add tenant-admin plugin management v1 routes

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 2                           |
| Dependencies | T004-03                     |
| Parallel     | `[P]` with T004-09, T004-11 |
| Status       | complete                    |

**Goal**: Implement the four tenant-admin plugin routes that allow tenant administrators
to list their enabled plugins, enable/disable them at the tenant level, and update
per-tenant configuration.

**Context**:

- New file: `apps/core-api/src/routes/tenant-plugins-v1.ts`.
- Auth guard: `preHandler: [authMiddleware, requireTenantAccess]` (existing middleware
  that extracts `tenantId` from the JWT's `tenant_slug` claim and attaches it to
  `request.tenantId`).
- Tenant-level enable/disable operates on `TenantPlugin.enabled` — it does **not**
  start/stop containers (that is super-admin only). It simply creates or updates the
  `TenantPlugin` row.
- `enableForTenant()` and `disableForTenant()` methods need to be added to
  `PluginLifecycleService` (or use existing `activatePlugin`/`deactivatePlugin` with a
  tenantId param). Check whether the plugin's `lifecycleStatus` is `ACTIVE` before
  allowing tenant enable — if not `ACTIVE`, return 409 with
  `{ error: { code: 'PLUGIN_NOT_GLOBALLY_ACTIVE', message: 'Plugin must be globally enabled first' } }`.
- Config update (`PUT /api/v1/tenant/plugins/:id/config`) validates the body against
  the plugin's manifest config schema (from `manifest.configuration.schema`) before
  storing.
- Routes table (from plan.md §7):

  | Method | Path                               | Handler               | Guard                 |
  | ------ | ---------------------------------- | --------------------- | --------------------- |
  | GET    | /api/v1/tenant/plugins             | `listTenantPlugins`   | `requireTenantAccess` |
  | POST   | /api/v1/tenant/plugins/:id/enable  | `enableTenantPlugin`  | `requireTenantAccess` |
  | POST   | /api/v1/tenant/plugins/:id/disable | `disableTenantPlugin` | `requireTenantAccess` |
  | PUT    | /api/v1/tenant/plugins/:id/config  | `configTenantPlugin`  | `requireTenantAccess` |

**Acceptance Criteria**:

- [ ] `tenant-plugins-v1.ts` exports a Fastify plugin function with all 4 routes
- [ ] All routes use `requireTenantAccess` guard
- [ ] `enableTenantPlugin` checks plugin `lifecycleStatus === 'ACTIVE'`, returns 409 if not
- [ ] `disableTenantPlugin` sets `TenantPlugin.enabled = false`; data is preserved
- [ ] `configTenantPlugin` validates body against manifest config schema; stores in
      `TenantPlugin.configuration` JSONB column
- [ ] Routes registered in `apps/core-api/src/index.ts` under `/api/v1`
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/routes/tenant-plugins-v1.ts` — new file
- `apps/core-api/src/services/plugin.service.ts` — add `enableForTenant()` and
  `disableForTenant()` methods to `PluginLifecycleService` if they do not already exist
- `apps/core-api/src/index.ts` — register `tenantPluginsV1Routes`

**Tests required**:

- Integration (T004-25): `POST /api/v1/tenant/plugins/:id/enable` with tenant admin
  token when plugin is `ACTIVE` succeeds; same request when plugin is `INSTALLED`
  returns 409; `PUT /api/v1/tenant/plugins/:id/config` with invalid schema returns 400

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-11: Implement health-check proxy endpoints

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| Points       | 1                                     |
| Phase        | 2                                     |
| Dependencies | T004-09                               |
| Parallel     | `[P]` with T004-09 (add to same file) |
| Status       | complete                              |

**Goal**: Add three read-only proxy endpoints to `plugin-v1.ts` that forward requests
to a plugin container's `/health`, `/ready`, and `/openapi.json` paths via the
`ServiceRegistry`, enabling platform monitoring tools to check plugin health without
knowing container addresses.

**Context**:

- These routes proxy to the plugin's container using the container address stored in
  `ServiceRegistry` — use `ServiceRegistryService.getServiceUrl(pluginId)` to resolve
  the container's base URL.
- Redis health caching (plan.md §9): cache the health result in Redis with TTL 10s.
  Key: `plugin:health:${pluginId}`. Bypass cache and always fetch live for `/ready`.
- If the plugin's `lifecycleStatus` is not `ACTIVE`, return 503 with
  `{ error: { code: 'PLUGIN_NOT_ACTIVE' } }`.
- If the container is unreachable, return 503 with `{ error: { code: 'PLUGIN_UNREACHABLE' } }`.
- Use `node-fetch` or the built-in `fetch` (Node ≥18) for the proxy HTTP call;
  set a 3s timeout.
- Routes:

  | Method | Path                        | Proxies to                 |
  | ------ | --------------------------- | -------------------------- |
  | GET    | /api/v1/plugins/:id/health  | `<container>/health`       |
  | GET    | /api/v1/plugins/:id/ready   | `<container>/ready`        |
  | GET    | /api/v1/plugins/:id/openapi | `<container>/openapi.json` |

**Acceptance Criteria**:

- [ ] Three proxy routes added to `apps/core-api/src/routes/plugin-v1.ts`
- [ ] All routes guarded with `requireSuperAdmin`
- [ ] Health response is cached in Redis (TTL 10s); ready is not cached
- [ ] Returns 503 when plugin is not `ACTIVE`
- [ ] Returns 503 when container fetch times out or is unreachable
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/routes/plugin-v1.ts` — add three proxy route handlers

**Tests required**:

- Unit: mock `ServiceRegistryService.getServiceUrl()` and `fetch`; verify 503 when
  plugin is not ACTIVE; verify cached response returned on second call

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

## Phase 3: Communication & Frontend Registration

**Sprint 4, Week 3 | 12 story points**

> T004-12, T004-13, and T004-14 are all independent of each other and can run
> in parallel. All three require T004-08 (ContainerAdapter wired). T004-15 is a
> cross-check/verification task with no blocking dependencies — it can run any time
> after T004-03 and T004-08 are complete.

---

### T004-12: Wire Redpanda topic configuration on plugin enable/disable

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 3                           |
| Phase        | 3                           |
| Dependencies | T004-08                     |
| Parallel     | `[P]` with T004-13, T004-14 |
| Status       | complete                    |

**Goal**: When a plugin is enabled (globally, by super-admin), create its declared
Redpanda event topics so that plugin-to-plugin event communication (FR-006) is ready
before the container starts receiving traffic.

**Context**:

- `TopicManager` is exported from `@plexica/event-bus` (already a dependency).
- `TopicManager` requires a `RedpandaClient` instance — use the existing event bus
  client from `packages/event-bus`. Check how `EventBusService` initializes
  `TopicManager` and replicate the pattern.
- Plugin topic naming convention (from `topic-manager.ts` comment):
  `plugin.${pluginId}.${eventName}` — e.g., `plugin.crm.deal.won`.
- On enable: create topics for `manifest.events.publishes` AND `manifest.events.subscribes`.
  `TopicManager.createTopic()` is idempotent (already-existing topics are skipped).
- On disable: do NOT delete topics — event history must be preserved (Redpanda topics
  are permanent; ADR-005).
- This logic should live in `PluginLifecycleService.activatePlugin()` after the
  container start, before the `ACTIVE` transition.
- If Redpanda is unavailable, log the error and continue (fail-open for topic creation —
  events will be lost but the plugin can still run in degraded mode).
- The `RedpandaClient` / `TopicManager` should be injected similarly to `ContainerAdapter`
  (optional constructor parameter defaulting to `null`; if null, skip topic creation
  with a debug log).

**Acceptance Criteria**:

- [ ] `PluginLifecycleService` accepts optional `topicManager?: TopicManager` constructor
      parameter
- [ ] `activatePlugin()` calls `topicManager.createTopic()` for each event in
      `manifest.events.publishes` and `manifest.events.subscribes` (using naming
      convention `plugin.${pluginId}.${eventName}`)
- [ ] Topic creation failure is caught, logged at `warn` level, and does not abort
      the enable operation (fail-open)
- [ ] Topics are not deleted on `deactivatePlugin()` (data preservation)
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/plugin.service.ts` — update `PluginLifecycleService`
  constructor and `activatePlugin()` with `TopicManager` integration

**Tests required**:

- Unit (T004-23 integration point; add here): mock `TopicManager.createTopic()`;
  verify it is called with `'plugin.crm.deal.won'` when manifest declares
  `events.publishes: ['deal.won']` for plugin `crm`; verify that a thrown error from
  `createTopic()` does not reject the `activatePlugin()` promise

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-13: Add `remoteEntryUrl` column and `ModuleFederationRegistryService`

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 4                           |
| Phase        | 3                           |
| Dependencies | T004-02                     |
| Parallel     | `[P]` with T004-12, T004-14 |
| Status       | complete                    |

**Goal**: Store the plugin's Module Federation `remoteEntry` URL in the database and
expose it via an API endpoint so the frontend shell can dynamically load plugin remote
modules (FR-011, ADR-011).

**Context**:

- ADR-011 (Vite + Module Federation) is already written. The frontend shell already
  supports dynamic remote loading — it just needs a source of truth for `remoteEntry`
  URLs.
- `remoteEntryUrl` comes from `manifest.frontend.remoteEntry` (the URL of the
  `remoteEntry.js` file on MinIO CDN, set by the plugin developer in their manifest).
- `frontendRoutePrefix` comes from `manifest.frontend.routePrefix`.
- Migration 2 from plan.md §6 adds two nullable columns to `core.plugins`.
- `ModuleFederationRegistryService` provides two methods:
  - `registerRemoteEntry(pluginId, remoteEntryUrl, routePrefix)` — stores the URL
  - `getActiveRemoteEntries()` — returns `{ pluginId, remoteEntryUrl, routePrefix }[]`
    for all `ACTIVE` plugins
- The `GET /api/v1/plugins/remotes` endpoint (add to `plugin-v1.ts`) returns
  `getActiveRemoteEntries()` — this endpoint is **public** (no auth guard) so the
  frontend shell can load it on startup without a super-admin token.
- `registerRemoteEntry()` is called from `installPlugin()` in `PluginLifecycleService`
  when `manifest.frontend?.remoteEntry` is defined.

**Acceptance Criteria**:

- [ ] New Prisma migration adds `remote_entry_url TEXT` and `frontend_route_prefix TEXT`
      (both nullable) to `core.plugins`
- [ ] `Plugin` model in `schema.prisma` has `remoteEntryUrl String? @map("remote_entry_url")`
      and `frontendRoutePrefix String? @map("frontend_route_prefix")`
- [ ] `ModuleFederationRegistryService` class created and exported from new file
- [ ] `registerRemoteEntry()` updates the plugin record with URL and prefix
- [ ] `getActiveRemoteEntries()` queries all `ACTIVE` (lifecycleStatus) plugins with
      non-null `remoteEntryUrl`
- [ ] `installPlugin()` in `PluginLifecycleService` calls `registerRemoteEntry()` when
      manifest has a `frontend.remoteEntry` URL
- [ ] `GET /api/v1/plugins/remotes` route added (no auth guard); returns array of
      remote entries
- [ ] `pnpm build` passes

**Files to create/modify**:

- `packages/database/prisma/schema.prisma` — add two nullable fields to `Plugin` model
- `packages/database/prisma/migrations/<timestamp>_add_plugin_remote_entry_url/migration.sql` — new migration
- `apps/core-api/src/services/module-federation-registry.service.ts` — new service file
- `apps/core-api/src/routes/plugin-v1.ts` — add `GET /api/v1/plugins/remotes` route
- `apps/core-api/src/services/plugin.service.ts` — wire `registerRemoteEntry()` into
  `installPlugin()`

**Tests required**:

- Unit (T004-23): `registerRemoteEntry()` updates the correct Prisma fields;
  `getActiveRemoteEntries()` filters to only `ACTIVE` plugins
- Integration (T004-24): `GET /api/v1/plugins/remotes` (no auth) returns an array;
  after install with `manifest.frontend.remoteEntry` set, the URL appears in the array

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm db:generate` regenerates client with new fields
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-14: Wire translation namespace loading on plugin enable

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 3                           |
| Dependencies | T004-08                     |
| Parallel     | `[P]` with T004-12, T004-13 |
| Status       | complete                    |

**Goal**: When a plugin is enabled (globally, by super-admin), load its declared
translation namespaces into the i18n service so tenant users immediately see translated
plugin UI (FR-015).

**Context**:

- `TranslationService` is in `apps/core-api/src/modules/i18n/i18n.service.ts`.
  It already has `getEnabledNamespaces(tenantId)` which reads from plugin manifests.
- The translation **files** live on disk under `translations/{locale}/{namespace}.json`.
  They are bundled with the plugin package and placed there on install.
- On plugin enable: call `TranslationService.getEnabledNamespaces()` logic — but
  specifically, ensure the namespace is accessible (i.e., the translation files for the
  plugin are on disk and can be loaded via `loadNamespaceFile()`).
- What "loading" means in this context: call `i18nService.loadNamespaceFile(locale, namespace)`
  for each `manifest.translations.namespaces` × `manifest.translations.supportedLocales`
  combination; cache the result in Redis (the existing caching logic should handle this).
- If translation files are missing (plugin deployed without translations), log a warning
  and continue — do not fail the enable operation (FR-015 is a `Should` priority).
- `PluginLifecycleService` should accept an optional `translationService?: TranslationService`
  constructor parameter; when absent, skip translation loading.

**Acceptance Criteria**:

- [ ] `PluginLifecycleService` accepts optional `translationService?: TranslationService`
- [ ] `activatePlugin()` calls translation loading for each namespace × locale combination
      from `manifest.translations` when `translationService` is provided
- [ ] Missing translation files are logged at `warn` level but do not abort enable
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/core-api/src/services/plugin.service.ts` — update `PluginLifecycleService`
  constructor and `activatePlugin()` with optional translation loading

**Tests required**:

- Unit: mock `TranslationService.loadNamespaceFile()`; verify it is called for each
  namespace × locale; verify a thrown error from `loadNamespaceFile()` does not reject
  `activatePlugin()`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-15: Verify ADR-018 and ADR-019 decisions are correctly wired in code

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 3                                    |
| Phase        | 3                                    |
| Dependencies | T004-03, T004-08                     |
| Parallel     | `[P]` with T004-12, T004-13, T004-14 |
| Status       | complete                             |

**Goal**: Cross-check that the implemented `lifecycleStatus` state machine and
`ContainerAdapter` factory precisely match the decisions documented in ADR-018 and
ADR-019, and update `plan.md` to reflect that the ADRs were completed prior to this
sprint.

**Context**:

- ADR-018 is at `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md` — already
  written. Verify: (1) the `PluginLifecycleStatus` enum states in code match ADR-018
  exactly, (2) the valid transition map in `PluginLifecycleService` matches the state
  diagram in ADR-018, (3) the `status` (marketplace) column is not touched by any
  lifecycle transition.
- ADR-019 is at `.forge/knowledge/adr/adr-019-pluggable-container-adapter.md` — already
  written. Verify: (1) `ContainerAdapter` interface signature matches ADR-019 exactly,
  (2) `CONTAINER_ADAPTER` env var selection is implemented in `createContainerAdapter()`,
  (3) `NullContainerAdapter` is used in tests (not real Docker), (4) K8s adapter is
  explicitly deferred (not stubbed).
- Update `plan.md` task T004-15 status note: change the strikethrough text to reflect
  that ADRs were completed prior to Sprint 4 and this task verified implementation.
- This task produces no new production code — only verification, one small correction
  if any mismatch is found, and a plan.md update.

**Acceptance Criteria**:

- [ ] `PluginLifecycleStatus` enum in `schema.prisma` matches ADR-018 state list exactly
- [ ] `VALID_TRANSITIONS` map in `PluginLifecycleService` matches the state diagram in ADR-018
- [ ] No lifecycle transition method modifies `Plugin.status` (marketplace column)
- [ ] `ContainerAdapter` interface signature in `container-adapter.ts` matches ADR-019
- [ ] `createContainerAdapter()` reads `CONTAINER_ADAPTER` env var per ADR-019
- [ ] `NullContainerAdapter` is the default (no Docker required when `CONTAINER_ADAPTER` unset)
- [ ] `plan.md` T004-15 row updated to note ADRs pre-completed; plan status updated to `In Progress`
- [ ] Any discrepancies found are corrected with a comment referencing the ADR

**Files to create/modify**:

- `.forge/specs/004-plugin-system/plan.md` — update T004-15 description and ADR status note
- Any of the above implementation files if a discrepancy is found

**Tests required**:

- None (verification task) — but if a correction is made, ensure related unit tests pass

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

## Phase 4: SDK Completion

**Sprint 4, Week 4 | 10 story points**

> T004-16, T004-17, and T004-18 are fully independent and can all run in
> parallel. T004-19 depends on all three (it consolidates exports and writes
> docs).

---

### T004-16: Implement `@EventHandler` and `@EventPublisher` decorators

| Field        | Value                        |
| ------------ | ---------------------------- |
| Points       | 3                            |
| Phase        | 4                            |
| Dependencies | T004-12 (event topic naming) |
| Parallel     | `[P]` with T004-17, T004-18  |
| Status       | complete                     |

**Goal**: Implement two TypeScript decorators in the `@plexica/sdk` package that
plugin developers use to declare event subscriptions and publishing capabilities,
wiring them to `EventClient` at runtime.

**Context**:

- `packages/sdk/src/decorators/` directory does not exist yet — create it.
- TypeScript experimental decorators (stage 3) should already be enabled in
  `packages/sdk/tsconfig.json` (check and add `"experimentalDecorators": true,
"emitDecoratorMetadata": true` if missing).
- `EventClient` already exists in `packages/sdk/src/event-client.ts` — decorators
  should integrate with it.
- `@EventHandler(topic: string)` is a **method decorator**. It:
  1. Stores metadata: `Reflect.defineMetadata('plexica:event-handler', topic, target, propertyKey)`
  2. Plugin base class reads this metadata at startup to register subscriptions via
     `EventClient.subscribe(topic, handler)`
- `@EventPublisher()` is a **class decorator** (applied to the plugin class). It:
  1. Stores metadata: `Reflect.defineMetadata('plexica:event-publisher', true, target)`
  2. At runtime the plugin base class uses this to initialize the publish-side of
     `EventClient`
- Topic naming convention must match the backend: `plugin.${pluginId}.${eventName}`
  (consistent with T004-12).
- Export from `packages/sdk/src/decorators/events.ts` and
  `packages/sdk/src/decorators/index.ts`.

**Acceptance Criteria**:

- [ ] `packages/sdk/tsconfig.json` has `experimentalDecorators: true` and
      `emitDecoratorMetadata: true`
- [ ] `@EventHandler(topic)` decorator stores topic metadata on the method via
      `Reflect.defineMetadata`
- [ ] `@EventPublisher()` decorator stores a marker on the class
- [ ] Both decorators exported from `packages/sdk/src/decorators/events.ts`
- [ ] `packages/sdk/src/decorators/index.ts` re-exports all decorators
- [ ] `pnpm build` passes in `packages/sdk`

**Files to create/modify**:

- `packages/sdk/src/decorators/events.ts` — new file
- `packages/sdk/src/decorators/index.ts` — new file (barrel export)
- `packages/sdk/tsconfig.json` — add decorator compiler options if missing

**Tests required**:

- Unit (T004-23): apply `@EventHandler('plugin.crm.deal.won')` to a test method;
  assert `Reflect.getMetadata('plexica:event-handler', instance, 'methodName')` equals
  `'plugin.crm.deal.won'`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass (`pnpm test` in `packages/sdk`)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-17: Implement `@Permission` decorator

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 4                           |
| Dependencies | T004-05 (permission model)  |
| Parallel     | `[P]` with T004-16, T004-18 |
| Status       | complete                    |

**Goal**: Implement a `@Permission` class decorator in the SDK that allows plugin
developers to declaratively annotate their plugin class with the permissions it
requires, which the platform reads at install time to register those permissions.

**Context**:

- `@Permission(key: string, name: string, description: string)` is a **class decorator**.
- It stores metadata: `Reflect.defineMetadata('plexica:permissions', [...existing, {key, name, description}], target)`
- Multiple `@Permission` decorators can be stacked on a single class (each call appends
  to the metadata array).
- `PlexicaPlugin` base class in `plugin-base.ts` can read this metadata to expose
  a `getPermissions()` method, which the registry uses to populate `manifest.permissions`
  if not statically declared in the JSON manifest.
- Export from `packages/sdk/src/decorators/permissions.ts`.

**Acceptance Criteria**:

- [ ] `@Permission(key, name, description)` class decorator created
- [ ] Multiple stacked `@Permission` decorators accumulate into an array (not overwrite)
- [ ] Metadata stored with key `'plexica:permissions'` on the class target
- [ ] Exported from `packages/sdk/src/decorators/permissions.ts`
- [ ] `pnpm build` passes

**Files to create/modify**:

- `packages/sdk/src/decorators/permissions.ts` — new file
- `packages/sdk/src/decorators/index.ts` — add `@Permission` export

**Tests required**:

- Unit (T004-23): apply two `@Permission` decorators to a test class; assert
  `Reflect.getMetadata('plexica:permissions', TestClass)` has both entries

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-18: Implement `@Hook` decorator

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 4                           |
| Dependencies | None (SDK only)             |
| Parallel     | `[P]` with T004-16, T004-17 |
| Status       | complete                    |

**Goal**: Implement a `@Hook` method decorator in the SDK that allows plugins to
declare workspace lifecycle hook handlers, which the platform's `plugin-hook.service.ts`
invokes at the appropriate workspace lifecycle events.

**Context**:

- `plugin-hook.service.ts` at `apps/core-api/src/modules/plugin/plugin-hook.service.ts`
  is already implemented — it calls plugin HTTP endpoints for hooks. The `@Hook`
  decorator declares which method handles which hook type.
- `@Hook(type: WorkspaceHookType)` is a **method decorator** where `WorkspaceHookType`
  is a string enum of workspace hook events (e.g., `'before_create'`, `'created'`,
  `'before_delete'`, `'deleted'`). Import or redefine this type from `plugin-hook.service.ts`.
- Stores metadata: `Reflect.defineMetadata('plexica:hook', type, target, propertyKey)`
- At plugin startup, `PlexicaPlugin` base class reads hook metadata and registers the
  method as an HTTP handler for the hook path (e.g., `POST /hooks/workspace/before_create`).
- Export from `packages/sdk/src/decorators/hooks.ts`.

**Acceptance Criteria**:

- [ ] `WorkspaceHookType` type (`'before_create' | 'created' | 'before_delete' | 'deleted'`)
      exported from the decorators file
- [ ] `@Hook(type)` method decorator stores hook type metadata via `Reflect.defineMetadata`
- [ ] Exported from `packages/sdk/src/decorators/hooks.ts`
- [ ] `pnpm build` passes

**Files to create/modify**:

- `packages/sdk/src/decorators/hooks.ts` — new file
- `packages/sdk/src/decorators/index.ts` — add `@Hook` and `WorkspaceHookType` exports

**Tests required**:

- Unit (T004-23): apply `@Hook('before_create')` to a test method; assert
  `Reflect.getMetadata('plexica:hook', instance, 'methodName')` equals `'before_create'`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Unit tests pass
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-19: Update SDK exports and write `PLUGIN_SDK.md` usage guide

| Field        | Value                     |
| ------------ | ------------------------- |
| Points       | 3                         |
| Phase        | 4                         |
| Dependencies | T004-16, T004-17, T004-18 |
| Parallel     | No                        |
| Status       | complete                  |

**Goal**: Consolidate all new SDK decorator exports into `packages/sdk/src/index.ts`
and write a developer-facing usage guide in `docs/PLUGIN_SDK.md` so plugin developers
have a single reference for building plugins with `@plexica/sdk`.

**Context**:

- `packages/sdk/src/index.ts` (74 lines) already exports core classes and types —
  add the new decorator exports without removing anything.
- `packages/sdk/src/decorators/index.ts` created in T004-16–18 — re-export from there.
- `docs/PLUGIN_SDK.md` must be created (the `docs/` directory exists). The guide must
  use the documentation template at `.github/docs/TEMPLATE_DEVELOPER_GUIDE.md`
  (AGENTS.md requirement).
- Guide sections to include:
  1. Quick Start (5-minute plugin scaffold example)
  2. Plugin Manifest reference (link to spec §7)
  3. `PlexicaPlugin` base class usage
  4. `@EventHandler` / `@EventPublisher` with example
  5. `@Permission` with example
  6. `@Hook` with example
  7. `ApiClient`, `EventClient`, `ServiceClient`, `SharedDataClient` brief reference
  8. Testing plugins locally (use `NullContainerAdapter` / `CONTAINER_ADAPTER=null`)
  9. FAQ / Troubleshooting

**Acceptance Criteria**:

- [ ] `packages/sdk/src/index.ts` exports `EventHandler`, `EventPublisher`, `Permission`,
      `Hook`, `WorkspaceHookType` from `./decorators/index.js`
- [ ] `packages/sdk/src/decorators/index.ts` exports all four decorators and
      `WorkspaceHookType`
- [ ] `docs/PLUGIN_SDK.md` created with all 9 sections listed above
- [ ] All code examples in the guide are syntactically valid TypeScript
- [ ] `pnpm build` passes in `packages/sdk`

**Files to create/modify**:

- `packages/sdk/src/index.ts` — add decorator exports
- `packages/sdk/src/decorators/index.ts` — finalize all exports
- `docs/PLUGIN_SDK.md` — new file (developer guide)

**Tests required**:

- Smoke (build-time): `import { EventHandler, Permission, Hook } from '@plexica/sdk'`
  compiles without error — verified by `pnpm build`

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm build` passes in `packages/sdk` and `apps/core-api`
- [ ] `pnpm lint` passes
- [ ] Documentation review: all code examples compile

---

## Phase 5: Test Coverage & Security Hardening

**Sprint 5, Week 1 | 12 story points**

> All Phase 5 tasks depend on Phases 1–4 being complete. T004-20 through T004-23
> (unit tests) can all run in parallel. T004-24 and T004-25 (integration) can run
> in parallel. T004-26 (E2E) depends on T004-24 passing. T004-27 (security) is
> independent but benefits from T004-24.

---

### T004-20: Unit tests — `PluginRegistryService`

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 2                                    |
| Phase        | 5                                    |
| Dependencies | T004-03, T004-05                     |
| Parallel     | `[P]` with T004-21, T004-22, T004-23 |
| Status       | complete                             |

**Goal**: Achieve ≥85% line coverage on `PluginRegistryService` with unit tests covering
happy paths, manifest validation rejections, dependency checks, and permission conflict.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/unit/plugin-registry.unit.test.ts`
  (file may exist with some tests already — augment, do not replace).
- Pattern: `vi.mock('../../../lib/db.js')` to mock Prisma; `vi.mock` for
  `ServiceRegistryService`, `DependencyResolutionService`,
  `permissionRegistrationService`.
- Use `vi.fn()` for all external dependencies.
- Target: `apps/core-api/src/services/plugin.service.ts` (PluginRegistryService class,
  lines 37–467).

**Acceptance Criteria**:

- [ ] `registerPlugin()`: valid manifest → creates plugin record → returns `Plugin`
- [ ] `registerPlugin()`: manifest with `id` not matching `[a-z0-9-]{1,64}` → throws
      `Invalid plugin manifest`
- [ ] `registerPlugin()`: duplicate plugin ID → throws `already registered`
- [ ] `registerPlugin()`: manifest with services → calls `ServiceRegistryService.registerService`
- [ ] `registerPlugin()`: manifest with permissions conflict → registers permissions and
      receives `PERMISSION_KEY_CONFLICT` → re-throws
- [ ] `listPlugins()`: with `lifecycleStatus` filter → passes filter to `db.plugin.findMany`
- [ ] `deletePlugin()`: plugin with active installations → throws
      `Cannot delete plugin '${id}': it is installed in N tenant(s)`
- [ ] Line coverage ≥85% for `PluginRegistryService` class
- [ ] All tests pass (`pnpm test:unit`)

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/unit/plugin-registry.unit.test.ts` — augment or
  create with the cases above

**Tests required**:

```typescript
describe('PluginRegistryService', () => {
  describe('registerPlugin()', () => {
    it('should register a valid plugin and return Plugin record');
    it('should throw for duplicate plugin id');
    it('should throw for invalid manifest id format');
    it('should call ServiceRegistryService.registerService for each declared service');
    it('should rollback and rethrow on PERMISSION_KEY_CONFLICT');
  });
  describe('listPlugins()', () => {
    it('should pass lifecycleStatus filter to findMany');
    it('should enforce max 500 results per page');
  });
  describe('deletePlugin()', () => {
    it('should throw when plugin has active tenant installations');
  });
});
```

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:unit` passes
- [ ] Coverage report shows ≥85% for `PluginRegistryService`

---

### T004-21: Unit tests — `PluginLifecycleService`

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 2                                    |
| Phase        | 5                                    |
| Dependencies | T004-03, T004-08                     |
| Parallel     | `[P]` with T004-20, T004-22, T004-23 |
| Status       | complete                             |

**Goal**: Achieve ≥85% line coverage on `PluginLifecycleService` with unit tests
covering the state machine, container adapter integration, health-check timeout, and
error rollback paths.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/unit/plugin-lifecycle.unit.test.ts`
- Inject `NullContainerAdapter` to avoid Docker dependency in unit tests.
- Inject a mock `TenantMigrationService` to test migration failure paths.
- Mock `db` (Prisma), `ServiceRegistryService`, `permissionRegistrationService`.
- Test the `transitionLifecycleStatus()` private method indirectly via the public API.

**Acceptance Criteria**:

- [ ] State machine: REGISTERED→INSTALLING→INSTALLED transitions succeed
- [ ] State machine: REGISTERED→ACTIVE directly throws transition error
- [ ] `installPlugin()`: migration failure resets `lifecycleStatus` to REGISTERED
- [ ] `activatePlugin()`: health-check timeout (mock `NullContainerAdapter.health` to
      return `'starting'` always) → `lifecycleStatus` reset to INSTALLED, error thrown
- [ ] `activatePlugin()`: creates Redpanda topics (mock `TopicManager.createTopic()`)
- [ ] `deactivatePlugin()`: calls `adapter.stop()`; preserves `TenantPlugin` data
- [ ] `uninstallPlugin()`: calls `adapter.remove()`; progresses through UNINSTALLING→UNINSTALLED
- [ ] Line coverage ≥85% for `PluginLifecycleService` class
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/unit/plugin-lifecycle.unit.test.ts` — create or
  augment with the above cases

**Tests required**:

```typescript
describe('PluginLifecycleService', () => {
  describe('state machine', () => {
    it('should accept valid REGISTERED → INSTALLING transition');
    it('should reject invalid REGISTERED → ACTIVE direct transition');
    it('should accept INSTALLING → REGISTERED rollback on failure');
  });
  describe('installPlugin()', () => {
    it('should transition REGISTERED → INSTALLING → INSTALLED on success');
    it('should rollback to REGISTERED when TenantMigrationService fails');
    it('should register permissions via permissionRegistrationService');
  });
  describe('activatePlugin()', () => {
    it('should call ContainerAdapter.start() and transition to ACTIVE');
    it('should reset to INSTALLED and throw when health check times out');
    it('should create Redpanda topics for manifest events');
  });
  describe('deactivatePlugin()', () => {
    it('should call ContainerAdapter.stop() and transition to DISABLED');
  });
  describe('uninstallPlugin()', () => {
    it('should call ContainerAdapter.remove() and reach UNINSTALLED');
  });
});
```

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:unit` passes
- [ ] Coverage ≥85% for `PluginLifecycleService`

---

### T004-22: Unit tests — `TenantMigrationService`

| Field        | Value                                |
| ------------ | ------------------------------------ |
| Points       | 2                                    |
| Phase        | 5                                    |
| Dependencies | T004-04                              |
| Parallel     | `[P]` with T004-20, T004-21, T004-23 |
| Status       | complete                             |

**Goal**: Achieve ≥85% line coverage on `TenantMigrationService` with unit tests
covering multi-tenant execution, per-tenant isolation, idempotency, DDL validation,
and rollback on failure.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/unit/tenant-migration.unit.test.ts`
- Mock `db.$transaction`, `db.tenant.findMany` to return two test tenants.
- To test per-tenant isolation: mock `tx.$executeRawUnsafe` to throw on the second
  tenant; assert first tenant's `MigrationResult.success = true` and second's `= false`.

**Acceptance Criteria**:

- [ ] `runPluginMigrations()`: runs migrations for all active tenants
- [ ] `runPluginMigrations()`: one tenant failure does not affect other tenants
- [ ] `runPluginMigrations()`: returns `MigrationResult[]` with per-tenant status
- [ ] `runPluginMigrations()`: idempotent — skips already-applied migrations
- [ ] `runPluginMigrations()`: DDL-only validation rejects SQL containing `SELECT`
- [ ] `runPluginMigrations()`: DDL-only validation rejects SQL containing `INSERT`
- [ ] `runPluginMigrations()`: `SET search_path` called per tenant before migration SQL
- [ ] Line coverage ≥85% for `TenantMigrationService`
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/unit/tenant-migration.unit.test.ts` — create

**Tests required**:

```typescript
describe('TenantMigrationService', () => {
  describe('runPluginMigrations()', () => {
    it('should run migrations for all active tenants');
    it('should isolate tenant failures — one failure does not affect others');
    it('should skip already-applied migrations (idempotency)');
    it('should reject migration SQL containing SELECT (DML validation)');
    it('should reject migration SQL containing INSERT (DML validation)');
    it('should set search_path before executing migration SQL');
    it('should return MigrationResult[] with per-tenant success/failure');
  });
});
```

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:unit` passes
- [ ] Coverage ≥85% for `TenantMigrationService`

---

### T004-23: Unit tests — `ContainerAdapter`, `ModuleFederationRegistryService`, SDK decorators

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| Points       | 2                                                    |
| Phase        | 5                                                    |
| Dependencies | T004-06, T004-07, T004-13, T004-16, T004-17, T004-18 |
| Parallel     | `[P]` with T004-20, T004-21, T004-22                 |
| Status       | complete                                             |

**Goal**: Unit-test `NullContainerAdapter`, `DockerContainerAdapter` (with mocked
dockerode), `ModuleFederationRegistryService`, and all SDK decorators to achieve ≥80%
coverage on each new file.

**Context**:

- Two test files: one in `apps/core-api/src/__tests__/plugin/unit/` for the adapters
  and registry service; one in `packages/sdk/src/__tests__/` for the decorators.
- `DockerContainerAdapter` tests: `vi.mock('dockerode')` to mock the Docker client.
- SDK decorator tests: `reflect-metadata` must be imported in the test setup.

**Acceptance Criteria**:

- [ ] `NullContainerAdapter`: all four methods resolve; `health()` returns `'healthy'`
- [ ] `DockerContainerAdapter.start()`: calls `pullImage`, `createContainer`,
      `container.start()` with correct config (mock dockerode)
- [ ] `DockerContainerAdapter.start()`: passes memory and CPU resource limits to
      `HostConfig`
- [ ] `DockerContainerAdapter.health()`: maps Docker `'healthy'` state correctly
- [ ] `DockerContainerAdapter.stop()`: does not throw when container is not running
- [ ] `ModuleFederationRegistryService.registerRemoteEntry()`: updates Prisma with
      correct URL and prefix
- [ ] `ModuleFederationRegistryService.getActiveRemoteEntries()`: filters to `ACTIVE`
      plugins only
- [ ] `@EventHandler('topic')`: metadata retrievable via `Reflect.getMetadata`
- [ ] `@EventPublisher()`: class-level metadata set
- [ ] `@Permission(key, name, desc)`: stacked decorators accumulate into array
- [ ] `@Hook('before_create')`: metadata retrievable via `Reflect.getMetadata`
- [ ] Coverage ≥80% per file
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/unit/container-adapter.unit.test.ts` — new file
- `packages/sdk/src/__tests__/decorators.test.ts` — new file

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:unit` passes in both `apps/core-api` and `packages/sdk`
- [ ] Coverage ≥80% for each target file

---

### T004-24: Integration tests — super-admin plugin lifecycle API

| Field        | Value                     |
| ------------ | ------------------------- |
| Points       | 3                         |
| Phase        | 5                         |
| Dependencies | T004-09, T004-11, T004-13 |
| Parallel     | `[P]` with T004-25        |
| Status       | complete                  |

**Goal**: Integration-test all super-admin v1 plugin routes (register, install, enable,
disable, uninstall, remotes) against a real test database using `buildTestApp()`.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/integration/plugin-lifecycle.integration.test.ts`
- Use `buildTestApp()` from `apps/core-api/src/test-app.ts`.
- Use `testContext.auth.createMockSuperAdminToken()` for auth headers.
- Use `testContext.auth.createMockTenantAdminToken(tenantSlug)` for tenant routes.
- Set `CONTAINER_ADAPTER=null` in test env (via `.env.test`) so no Docker is required.
- Create a minimal valid manifest fixture:
  ```typescript
  const TEST_MANIFEST = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Integration test plugin (≥10 chars)',
    category: 'utility',
    metadata: { license: 'MIT', author: { name: 'test' } },
    runtime: { type: 'typescript', image: 'plexica/test-plugin:1.0.0' },
    permissions: [{ key: 'test:read', name: 'Test Read', description: 'Read test data' }],
    events: { publishes: ['test.event'], subscribes: [] },
  };
  ```
- After each test, clean up with `db.plugin.delete({ where: { id: 'test-plugin' } })`.

**Acceptance Criteria**:

- [ ] `POST /api/v1/plugins` (register) with valid manifest → 200 + plugin record
- [ ] `POST /api/v1/plugins` without auth → 401
- [ ] `POST /api/v1/plugins` with tenant admin token → 403
- [ ] `POST /api/v1/plugins/:id/install` → 200; plugin `lifecycleStatus` becomes `INSTALLED`
- [ ] `POST /api/v1/plugins/:id/enable` → 200; plugin `lifecycleStatus` becomes `ACTIVE`
- [ ] `POST /api/v1/plugins/:id/disable` → 200; plugin `lifecycleStatus` becomes `DISABLED`
- [ ] `DELETE /api/v1/plugins/:id` → 200; plugin `lifecycleStatus` becomes `UNINSTALLED`
- [ ] `POST /api/v1/plugins/unknown-plugin/install` → 404
- [ ] `POST /api/v1/plugins/:id/install` when already INSTALLING → 409 (invalid transition)
- [ ] `GET /api/v1/plugins/remotes` (no auth) → 200 with array
- [ ] After install with `manifest.frontend.remoteEntry` set, URL appears in remotes list
- [ ] Plugin permissions registered in RBAC (query `permissionRegistrationService`)
- [ ] Second plugin with conflicting permission key → install returns error with
      `PERMISSION_KEY_CONFLICT`
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/integration/plugin-lifecycle.integration.test.ts` —
  create (new spec-aligned file, distinct from existing `plugin-install.integration.test.ts`)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:integration` passes
- [ ] Coverage on `plugin-v1.ts` ≥80%

---

### T004-25: Integration tests — tenant plugin routes

| Field        | Value              |
| ------------ | ------------------ |
| Points       | 1                  |
| Phase        | 5                  |
| Dependencies | T004-10            |
| Parallel     | `[P]` with T004-24 |
| Status       | complete           |

**Goal**: Integration-test the four tenant-admin plugin routes, verifying proper tenant
isolation and the 409 guard when a plugin is not globally `ACTIVE`.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/integration/tenant-plugins.integration.test.ts`
- Use `buildTestApp()` and `testContext.auth.createMockTenantAdminToken(tenantSlug)`.
- Prerequisite: create a tenant via `POST /api/admin/tenants` using super-admin token
  before running tenant plugin tests.
- A globally ACTIVE plugin must exist (created via the super-admin lifecycle flow in
  beforeAll or a shared fixture).

**Acceptance Criteria**:

- [ ] `GET /api/v1/tenant/plugins` → 200; returns list of plugins for the tenant
- [ ] `POST /api/v1/tenant/plugins/:id/enable` (plugin is globally ACTIVE) → 200;
      `TenantPlugin.enabled = true`
- [ ] `POST /api/v1/tenant/plugins/:id/enable` (plugin is globally INSTALLED, not ACTIVE) →
      409 with `PLUGIN_NOT_GLOBALLY_ACTIVE`
- [ ] `POST /api/v1/tenant/plugins/:id/disable` → 200; `TenantPlugin.enabled = false`;
      data preserved in `TenantPlugin.configuration`
- [ ] `PUT /api/v1/tenant/plugins/:id/config` with valid config → 200; config stored
- [ ] `PUT /api/v1/tenant/plugins/:id/config` with invalid config (fails manifest schema) →
      400
- [ ] Tenant A cannot enable/disable plugins for Tenant B (tenant isolation)
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/integration/tenant-plugins.integration.test.ts` — create

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:integration` passes
- [ ] Coverage on `tenant-plugins-v1.ts` ≥80%

---

### T004-26: E2E test — super-admin install lifecycle + tenant enable + plugin invocation

| Field        | Value            |
| ------------ | ---------------- |
| Points       | 2                |
| Phase        | 5                |
| Dependencies | T004-24, T004-25 |
| Parallel     | No               |
| Status       | complete         |

**Goal**: End-to-end test the complete plugin lifecycle: super-admin registers →
installs → enables a plugin; then a tenant admin enables the plugin for their tenant
and reads tenant plugin list, verifying the full flow works together.

**Context**:

- Test file: `apps/core-api/src/__tests__/plugin/e2e/plugin-system.e2e.test.ts`
- This is the only E2E test for the plugin system — it should cover the critical path
  (US-001, US-002, US-006) end-to-end.
- Uses `buildTestApp()`, real test database, real Keycloak (integration environment).
- `CONTAINER_ADAPTER=null` — no real containers.
- Plugin invocation test: since no real container runs, "invocation" means
  `GET /api/v1/plugins/:id/health` returns 503 (`PLUGIN_UNREACHABLE`) rather than
  200 — this confirms the proxy endpoint is wired but the container is unavailable
  (expected in null adapter mode).
- Flow: register → install → enable (super-admin) → verify ACTIVE → tenant enable →
  verify `TenantPlugin.enabled = true` → GET `/api/v1/tenant/plugins` → plugin in list
  → GET `/api/v1/plugins/:id/health` → 503 PLUGIN_UNREACHABLE.

**Acceptance Criteria**:

- [ ] Full lifecycle from register to ACTIVE completes without error
- [ ] After super-admin enable, `GET /api/v1/plugins` shows `lifecycleStatus: 'ACTIVE'`
- [ ] After tenant enable, `GET /api/v1/tenant/plugins` includes the plugin with
      `enabled: true`
- [ ] `GET /api/v1/plugins/:id/health` returns 503 (no real container — expected)
- [ ] Disabling at tenant level → plugin still `ACTIVE` globally
- [ ] Super-admin disable → plugin `DISABLED`; tenant list still shows plugin but
      `enabled: false`
- [ ] Super-admin uninstall → plugin `UNINSTALLED`; tenant list returns empty
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/e2e/plugin-system.e2e.test.ts` — create

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:e2e` passes
- [ ] Test runtime < 30s total for this file

---

### T004-27: Security hardening — container network policy, hook URL validation, header propagation

| Field        | Value                       |
| ------------ | --------------------------- |
| Points       | 2                           |
| Phase        | 5                           |
| Dependencies | T004-07, T004-09            |
| Parallel     | `[P]` with T004-24, T004-25 |
| Status       | complete                    |

**Goal**: Verify and test the three security controls identified in plan.md §10:
container network isolation, hook URL origin validation, and `X-Tenant-ID` header
propagation on all plugin-to-plugin requests (FR-010, NFR-005).

**Context**:

- Three distinct test areas, each producing targeted tests:

  **1. Container network policy** (`DockerContainerAdapter`):
  - `DockerContainerAdapter.start()` must attach containers to `plexica-plugins` network
    and NOT to the host network. Verify via unit test: assert the `createContainer()`
    call includes `HostConfig.NetworkMode = 'plexica-plugins'` and does not include
    `NetworkMode: 'host'`.

  **2. Hook URL validation** (`plugin-hook.service.ts`):
  - `PluginHookService.invokeHook()` already validates URL origin. Add tests to confirm:
    a hook URL that doesn't match `manifest.api.basePath` is rejected with a clear error.
    A hook URL pointing to an internal service (e.g., `http://localhost:5432`) is rejected.

  **3. X-Tenant-ID propagation** (plugin API gateway):
  - `PluginApiGatewayService` proxies plugin-to-plugin calls. Verify via unit test that
    `X-Tenant-ID`, `X-User-ID`, and `X-Trace-ID` headers are present on every outbound
    proxy call. Verify that a missing `X-Tenant-ID` on an inbound request returns 400.

- Tests span multiple files: add to existing test files where appropriate.
- No new production code expected — this task is test authoring + fixing any gaps found.

**Acceptance Criteria**:

- [ ] Unit test: `DockerContainerAdapter.start()` sets `HostConfig.NetworkMode = 'plexica-plugins'`
- [ ] Unit test: `DockerContainerAdapter.start()` does NOT set `NetworkMode: 'host'`
- [ ] Unit test: `PluginHookService.invokeHook()` rejects hook URL that doesn't match
      `manifest.api.basePath` origin
- [ ] Unit test: `PluginHookService.invokeHook()` rejects internal service URLs
      (e.g., `http://localhost:5432`, `http://127.0.0.1`)
- [ ] Unit test: `PluginApiGatewayService` outbound requests include `X-Tenant-ID`,
      `X-User-ID`, `X-Trace-ID`
- [ ] Integration test: request to `/api/v1/plugins/:id/enable` without `X-Tenant-ID`
      in a context where it's required returns 400
- [ ] All tests pass

**Files to create/modify**:

- `apps/core-api/src/__tests__/plugin/unit/container-adapter.unit.test.ts` — add
  network policy assertions (extend T004-23 file)
- `apps/core-api/src/__tests__/plugin/unit/plugin-api-gateway.test.ts` — add header
  propagation assertions (existing file — augment)
- `apps/core-api/src/__tests__/plugin/unit/` — add hook URL validation tests (new
  file or extend `plugin-manifest.test.ts`)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] `pnpm test:unit` and `pnpm test:integration` pass
- [ ] No new security regressions introduced

---

## Phase 6: Frontend UI Implementation

**Sprint 5, Weeks 2–3 | 20 story points**

> Phase 6 implements the five screens from `design-spec.md`. All tasks depend on
> Phases 1–4 being complete (backend APIs must exist). T004-28 through T004-32 are
> largely independent and can run in parallel; T004-32 has a soft dependency on T004-28
> for shared types/hooks but can start concurrently.
>
> **Frontend conventions** (from codebase exploration):
>
> - Routes: file-based at `apps/web/src/routes/` (TanStack Router)
> - Components: `apps/web/src/components/` for shared, co-located for route-specific
> - UI primitives: `@plexica/ui` — Badge, Card, Button, Modal, Switch, Select, Input,
>   Progress, EmptyState, ConfirmDialog, Alert, Spinner, Skeleton, StatusBadge, StatCard,
>   DataTable, Tooltip, Toast, Checkbox, Form, Table
> - Context: `apps/web/src/contexts/PluginContext.tsx` provides `usePlugins()` hook
> - Auth guards: `requireSuperAdmin`, `requireTenantAccess` (from `middleware/auth.ts`)
> - Existing plugin page: `apps/web/src/routes/plugins.tsx` (837 lines, marketplace-focused)
> - Existing detail view: `apps/web/src/routes/plugins.$pluginId.tsx`

---

### T004-28: Redesign PluginsView with Registry tab, lifecycle badges, and search/filter

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| Points       | 5                                              |
| Phase        | 6                                              |
| Dependencies | T004-09 (backend v1 routes), T004-13 (remotes) |
| Parallel     | `[P]` with T004-29, T004-30, T004-31, T004-32  |
| Status       | complete                                       |

**Goal**: Redesign the existing `PluginsView` page (`apps/web/src/routes/plugins.tsx`)
to add a lifecycle-focused "Registry" tab as the primary view for super admins, with
lifecycle status badges per ADR-018, search with 300ms debounce, lifecycle status
filter, stat summary bar, responsive grid (3→2→1 col), and proper ARIA semantics.
Preserve existing Marketplace and Review Queue tabs.

**Context**:

- The existing `plugins.tsx` (837 lines) is marketplace-focused with Installed/Marketplace
  tabs, grid/list/table view modes, and tenant-scoped display. This redesign adds a
  "Registry" tab that shows **all** plugins with their `lifecycleStatus` (from
  `GET /api/v1/plugins`) for super admin use.
- Status badge mapping from `design-spec.md` Screen 1:
  - REGISTERED → `secondary` variant, `--muted-foreground`, no icon
  - INSTALLING → `outline` variant, `--status-provisioning`, Spinner icon
  - INSTALLED → `outline` variant, `--status-info`, no icon
  - ACTIVE → `default` variant, `--status-active`, no icon
  - DISABLED → `secondary` variant, `--status-warning`, Pause icon
  - UNINSTALLING → `outline` variant, `--status-provisioning`, Spinner icon
  - UNINSTALLED → `secondary` variant, `--status-deleted`, no icon
- Plugin cards show: icon/emoji, name, status badge, version, description (truncated),
  tenant count, health indicator (for ACTIVE), and action buttons contextual to status.
- Empty states: "No plugins registered" (zero data) and "No plugins found" (filtered).
- Pagination: 20 per page, using existing Pagination component.
- Stat summary bar: "12 plugins total • 4 active • 2 installed • 3 registered • 3 other"
  with `aria-live="polite"`.

**Acceptance Criteria**:

- [ ] Registry tab added as the primary (first/default) tab alongside Marketplace and
      Review Queue
- [ ] Registry tab fetches plugins from `GET /api/v1/plugins` with `lifecycleStatus` and
      `status` query params
- [ ] Each plugin card displays lifecycle status badge using the ADR-018 badge mapping
      (correct variant, color token, and icon per status)
- [ ] Search input with `aria-label="Search plugins by name or description"` debounces
      input by 300ms before triggering API call
- [ ] Status filter dropdown (`aria-label="Filter by lifecycle status"`) allows filtering
      by any `PluginLifecycleStatus` value
- [ ] Clear filters button resets search and status filter to defaults
- [ ] Stat summary bar below filters shows counts per lifecycle status, uses
      `aria-live="polite"` to announce changes to screen readers
- [ ] Responsive grid: 3 columns at ≥1440px, 2 columns at ≥768px, 1 column below 768px
- [ ] Plugin cards use `role="article"` with
      `aria-label="[Plugin name], version [version], status [status]"`
- [ ] Tab list uses `role="tablist"` with `role="tab"` and `aria-selected` per tab;
      tab panels use `role="tabpanel"` with `aria-labelledby`
- [ ] Loading state shows 6 `CardSkeleton` placeholders
- [ ] Error state shows `Alert` (destructive) with retry button above grid
- [ ] Empty (no data) state shows `EmptyState` with puzzle icon and "Register your first
      plugin to extend the platform." CTA
- [ ] Empty (filtered) state shows `EmptyState` with search icon, "No plugins found",
      and "Clear filters" link
- [ ] Action buttons are contextual: REGISTERED→[Install][View], INSTALLED→[Enable][View],
      ACTIVE→[View][⋮ Disable/Update/Uninstall], DISABLED→[View][⋮ Enable/Uninstall]
- [ ] Actions dropdown uses `aria-haspopup="menu"` and `aria-expanded`
- [ ] Keyboard navigation: Tab between elements, Enter/Space to activate, Escape to close
      dropdowns, Arrow keys within tablist and dropdown
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/web/src/routes/plugins.tsx` — refactor to add Registry tab, lifecycle badges,
  search/filter, stat summary, responsive grid
- `apps/web/src/components/plugins/PluginStatusBadge.tsx` — new component encapsulating
  ADR-018 badge mapping logic (variant, color, icon per lifecycle status)
- `apps/web/src/components/plugins/PluginCard.tsx` — new component for the registry
  plugin card with contextual actions
- `apps/web/src/hooks/usePluginSearch.ts` — new hook for debounced search + filter state

**Dependencies**:

- `@plexica/ui`: Badge, Card, Button, Select, Input, Spinner, Skeleton, EmptyState,
  Alert, Tooltip, Pagination (all already available)
- Backend: `GET /api/v1/plugins` (T004-09)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Visual review matches `design-spec.md` Screen 1 wireframe
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-29: Implement PluginInstallProgress panel

| Field        | Value                                              |
| ------------ | -------------------------------------------------- |
| Points       | 4                                                  |
| Phase        | 6                                                  |
| Dependencies | T004-09 (install endpoint), T004-28 (card context) |
| Parallel     | `[P]` with T004-30, T004-31, T004-32               |
| Status       | complete                                           |

**Goal**: Implement the `PluginInstallProgress` component that shows a 6-step progress
panel during plugin installation, with real-time step status updates, elapsed time,
error variant with retry, cancel button, and ARIA live regions for screen readers.

**Context**:

- Design reference: `design-spec.md` Screen 2. The component displays inline (replacing
  the plugin card action area) or as a modal depending on navigation context.
- 6 installation steps (from design-spec.md):
  1. Dependency Check
  2. Image Pull
  3. Data Migrations (with per-tenant progress sub-list)
  4. Route Registration
  5. Frontend Registration
  6. Health Check
- Each step has 4 possible states: `pending` (○), `running` (◎ with spinner),
  `complete` (✓ green), `failed` (✕ red), `skipped` (○ with "skipped" text).
- Step icons map: pending → circle outline, running → Spinner, complete → CheckCircle
  (green), failed → XCircle (red), skipped → circle outline + muted text.
- Error variant: when a step fails, remaining steps show "skipped", an error panel
  expands inline with the error message and recovery suggestion, and "Retry Installation"
  - "Back to Registry" buttons appear.
- Success variant: all checkmarks green, toast notification, "Enable now?" button.
- Elapsed timer updates every second, formatted as "Elapsed: 13.1s".
- Cancel button calls `DELETE /api/v1/plugins/:id` or a cancel endpoint, reverts status
  to REGISTERED.
- The component polls `GET /api/v1/plugins/:id` every 2s to get current step status
  (or uses SSE if available — start with polling for simplicity).

**Acceptance Criteria**:

- [ ] `PluginInstallProgress` component created with props: `pluginId`, `pluginName`,
      `pluginVersion`, `onComplete`, `onCancel`, `onRetry`
- [ ] Renders 6 steps in an ordered list with step number, name, and status icon
- [ ] Each step shows elapsed duration when complete (e.g., "0.3s", "12.4s")
- [ ] Running step shows `Spinner` icon from `@plexica/ui`
- [ ] Data Migrations step (step 3) shows per-tenant sub-list with individual tenant
      progress when running
- [ ] Error variant: failed step shows `XCircle` icon + inline error panel with
      error message, recovery suggestion text, "Retry Installation" and "Back to Registry"
      buttons
- [ ] Error variant: remaining steps after failure show "skipped" state
- [ ] Success variant: shows success toast via `ToastProvider` and "Enable now?" button
- [ ] Cancel button visible during installation; calls cancel handler and reverts to
      REGISTERED
- [ ] Elapsed timer starts on mount, increments every second, displays formatted time
- [ ] ARIA: container uses `role="log"` with `aria-live="polite"`
- [ ] ARIA: each step uses `role="listitem"` with
      `aria-label="Step [N] [name], [status: pending/running/complete/failed/skipped]"`
- [ ] ARIA: Data Migrations progress bar uses `role="progressbar"` with `aria-valuenow`
      and `aria-valuemax`
- [ ] ARIA: error panel uses `role="alert"` to announce errors to screen readers
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/web/src/components/plugins/PluginInstallProgress.tsx` — new component
- `apps/web/src/components/plugins/InstallStep.tsx` — new sub-component for individual
  step rendering (icon, name, duration, status)
- `apps/web/src/hooks/useInstallProgress.ts` — new hook managing step polling, elapsed
  timer, and state transitions

**Dependencies**:

- `@plexica/ui`: Spinner, Button, Alert, Progress, Toast (all available)
- Backend: `POST /api/v1/plugins/:id/install` (T004-09),
  `GET /api/v1/plugins/:id` (T004-09)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Visual review matches `design-spec.md` Screen 2 wireframe (both success and error)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-30: Implement lifecycle confirmation dialogs (Enable / Disable / Update / Uninstall)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 4                                             |
| Phase        | 6                                             |
| Dependencies | T004-09 (lifecycle endpoints)                 |
| Parallel     | `[P]` with T004-28, T004-29, T004-31, T004-32 |
| Status       | complete                                      |

**Goal**: Implement four lifecycle confirmation dialog components using the existing
`ConfirmDialog` from `@plexica/ui`, each with context-specific information about the
action's impact, warnings, and safety guards as specified in `design-spec.md` Screen 3.

**Context**:

- Design reference: `design-spec.md` Screen 3 (3a–3d wireframes).
- All dialogs extend `ConfirmDialog` from `@plexica/ui` with custom content slots.
- **EnablePluginDialog**: shows permissions to be activated, event subscriptions,
  tenant impact ("Tenants will be able to enable this plugin after activation").
  Primary action: "Enable Plugin" button.
- **DisablePluginDialog**: shows impact warning (tenant count affected, "Active users
  will lose access... immediately"), data preservation note ("All tenant data will be
  preserved"). Action: "Disable Plugin" button (destructive variant).
- **UpdatePluginDialog**: shows version change (current → target), changelog excerpt,
  breaking changes alert (if `manifest.update.breaking === true`), "Backup taken
  automatically" note. Action: "Update Plugin" button. If breaking, requires typing
  plugin name to confirm.
- **UninstallPluginDialog**: shows strongest warnings (tenant count, data cleanup
  checkbox "Delete all plugin data from tenant schemas", name confirmation input that
  must match plugin name exactly to enable the Uninstall button). Action: "Uninstall
  Plugin" button (destructive). Blocked state: if any tenants still have the plugin
  enabled, show "Disable in all tenants first" message and disable the action button.

**Acceptance Criteria**:

- [ ] `EnablePluginDialog` renders permissions list, event count, tenant impact text;
      calls `POST /api/v1/plugins/:id/enable` on confirm
- [ ] `DisablePluginDialog` renders impact warning with tenant count (fetched from
      plugin detail), data preservation note; calls `POST /api/v1/plugins/:id/disable`
      on confirm; uses destructive button variant
- [ ] `UpdatePluginDialog` renders version change diff, changelog, breaking changes
      alert; requires name confirmation input when `breaking === true`; calls
      `POST /api/v1/plugins/:id/update` on confirm
- [ ] `UninstallPluginDialog` renders tenant count warning, "Delete all plugin data"
      checkbox, name confirmation input (must match `plugin.name` exactly to enable
      button); calls `DELETE /api/v1/plugins/:id` on confirm
- [ ] `UninstallPluginDialog` blocked state: when `activeTenantCount > 0`, action button
      is disabled with tooltip "Disable in all tenants first"
- [ ] All dialogs use focus trap (existing `ConfirmDialog` behavior)
- [ ] All dialogs close on Escape key (existing `ConfirmDialog` behavior)
- [ ] Name confirmation inputs have `aria-describedby` linking to instruction text
      ("Type the plugin name to confirm")
- [ ] All destructive actions use `variant="destructive"` button styling
- [ ] ARIA: dialog uses `role="alertdialog"` with `aria-labelledby` (title) and
      `aria-describedby` (description)
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/web/src/components/plugins/EnablePluginDialog.tsx` — new component
- `apps/web/src/components/plugins/DisablePluginDialog.tsx` — new component
- `apps/web/src/components/plugins/UpdatePluginDialog.tsx` — new component
- `apps/web/src/components/plugins/UninstallPluginDialog.tsx` — new component

**Dependencies**:

- `@plexica/ui`: ConfirmDialog, Button, Alert, Checkbox, Input, Tooltip (all available)
- Backend: lifecycle endpoints from T004-09

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Visual review matches `design-spec.md` Screen 3 wireframes (3a–3d)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-31: Implement PluginDetailModal with tabs, health, timeline

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 4                                             |
| Phase        | 6                                             |
| Dependencies | T004-09, T004-11 (health endpoints)           |
| Parallel     | `[P]` with T004-28, T004-29, T004-30, T004-32 |
| Status       | complete                                      |

**Goal**: Implement the `PluginDetailModal` for super admins showing a comprehensive
plugin detail view with lifecycle timeline, four tabs (Overview, Health, Permissions,
Events), resource usage bars, and tenant adoption list, as specified in `design-spec.md`
Screen 4.

**Context**:

- Design reference: `design-spec.md` Screen 4 wireframe.
- Existing detail view at `apps/web/src/routes/plugins.$pluginId.tsx` is
  marketplace-focused. This modal provides the lifecycle-focused detail view triggered
  from the Registry tab plugin cards.
- **Overview tab**: manifest details (name, version, description, author, license, category),
  dependencies list with resolved versions, runtime configuration (image, resources).
- **Health tab**: current health status from `GET /api/v1/plugins/:id/health` (polled
  every 10s), container resource usage (CPU, memory) displayed as progress bars with
  threshold warnings (yellow >70%, red >90%), uptime counter.
- **Permissions tab**: list of registered permissions with key, name, description.
- **Events tab**: list of published and subscribed event topics with last activity
  timestamp.
- Lifecycle timeline: vertical timeline showing state transitions with timestamps
  (e.g., "REGISTERED → INSTALLING at 2026-02-25 10:30", "INSTALLING → INSTALLED at
  2026-02-25 10:31").
- Tenant adoption list: table showing which tenants have the plugin enabled, with
  tenant name, enabled date, and configuration status.

**Acceptance Criteria**:

- [ ] `PluginDetailModal` renders as a large modal (max-width 800px) with plugin name
      and lifecycle status badge in the header
- [ ] Lifecycle timeline renders vertically with timestamps and state transition labels;
      most recent at top
- [ ] Tab list with 4 tabs: Overview, Health, Permissions, Events
- [ ] Tab list uses ARIA tablist pattern: `role="tablist"`, each tab `role="tab"` with
      `aria-selected` and `aria-controls`, each panel `role="tabpanel"` with
      `aria-labelledby`
- [ ] Overview tab displays manifest fields, dependency list, runtime config
- [ ] Health tab polls `GET /api/v1/plugins/:id/health` every 10s; displays health
      status badge (healthy/unhealthy/starting), resource usage bars for CPU and memory
- [ ] Resource usage bars use `Progress` component with color thresholds: green ≤70%,
      yellow 70–90%, red >90%
- [ ] Permissions tab lists all registered permissions with key, name, description
- [ ] Events tab lists published and subscribed topics with last activity timestamp
- [ ] Tenant adoption list shows tenants with plugin enabled, sortable by tenant name
- [ ] Keyboard: Tab/Shift-Tab to navigate, Arrow keys to switch tabs, Escape to close
      modal
- [ ] Screen reader: tab content announced on switch, health status updates announced
      via `aria-live="polite"` region
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/web/src/components/plugins/PluginDetailModal.tsx` — new component (replaces
  or supplements existing detail route for modal context)
- `apps/web/src/components/plugins/PluginTimeline.tsx` — new sub-component for lifecycle
  timeline
- `apps/web/src/components/plugins/PluginHealthTab.tsx` — new sub-component with health
  polling and resource usage bars
- `apps/web/src/hooks/usePluginHealth.ts` — new hook for health endpoint polling (10s
  interval)

**Dependencies**:

- `@plexica/ui`: Modal, Badge, Progress, Table, Tooltip, Spinner, StatusBadge (all available)
- Backend: `GET /api/v1/plugins/:id` (T004-09), `GET /api/v1/plugins/:id/health` (T004-11)

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Visual review matches `design-spec.md` Screen 4 wireframe
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

### T004-32: Implement Tenant Extensions page with config form and RBAC guard

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 3                                             |
| Phase        | 6                                             |
| Dependencies | T004-10 (tenant plugin routes)                |
| Parallel     | `[P]` with T004-28, T004-29, T004-30, T004-31 |
| Status       | complete                                      |

**Goal**: Implement the Tenant Extensions page (`/extensions`) where tenant admins can
view available plugins, enable/disable them for their tenant, and configure per-tenant
plugin settings via auto-generated forms from the manifest JSON Schema, as specified in
`design-spec.md` Screen 5.

**Context**:

- Design reference: `design-spec.md` Screen 5.
- New route file: `apps/web/src/routes/extensions.tsx` (TanStack Router file-based route).
- This page is tenant-scoped — it shows only plugins that are globally `ACTIVE`
  (from `GET /api/v1/tenant/plugins`).
- Each plugin shows: name, version, description, and a toggle switch for enable/disable.
- When enabled, a "Configure" button appears that opens `PluginConfigForm` — a form
  auto-generated from the plugin's `manifest.configuration.schema` (JSON Schema).
- The config form uses JSON Schema → React form field mapping:
  - `string` → `Input`
  - `number` / `integer` → `Input` (type="number")
  - `boolean` → `Switch`
  - `enum` → `Select`
  - `array` → repeated field group with add/remove
  - `object` → nested fieldset
  - `description` from schema → help text below field
  - `title` from schema → field label
- RBAC guard: page requires `requireTenantAccess` (tenant admin role). If user lacks
  the role, show a 403 Forbidden page with "You don't have permission to manage
  extensions" message and a "Go to Dashboard" link.
- Config validation: validate form data against the JSON Schema before submitting via
  `PUT /api/v1/tenant/plugins/:id/config`.
- Enable/disable toggle calls `POST /api/v1/tenant/plugins/:id/enable` or
  `POST /api/v1/tenant/plugins/:id/disable`.

**Acceptance Criteria**:

- [ ] `ExtensionsPage` route created at `apps/web/src/routes/extensions.tsx`
- [ ] Page fetches tenant plugins from `GET /api/v1/tenant/plugins`
- [ ] Each plugin card shows name, version, description, and enable/disable toggle
      (`Switch` from `@plexica/ui`)
- [ ] Toggle calls `POST /api/v1/tenant/plugins/:id/enable` or `.../disable`
      based on current state
- [ ] When plugin is enabled, "Configure" button appears; clicking opens
      `PluginConfigForm` component
- [ ] `PluginConfigForm` auto-generates form fields from `manifest.configuration.schema`
      (JSON Schema → React form mapping as described)
- [ ] Config form validates input against JSON Schema on submit; shows field-level
      errors for invalid values
- [ ] Config form submits via `PUT /api/v1/tenant/plugins/:id/config`
- [ ] RBAC guard: if user is not a tenant admin, renders 403 page with
      "You don't have permission to manage extensions" and "Go to Dashboard" link
- [ ] Loading state: shows skeleton cards
- [ ] Error state: shows Alert with retry
- [ ] Empty state: "No extensions available. Contact your platform administrator."
- [ ] All form fields have associated labels (`<label htmlFor>` or `aria-label`)
- [ ] `pnpm build` passes

**Files to create/modify**:

- `apps/web/src/routes/extensions.tsx` — new route file (Tenant Extensions page)
- `apps/web/src/components/plugins/PluginConfigForm.tsx` — new component for
  JSON Schema → form auto-generation
- `apps/web/src/components/plugins/PluginToggleCard.tsx` — new component for plugin
  card with enable/disable toggle
- `apps/web/src/components/plugins/ForbiddenPage.tsx` — new 403 page component

**Dependencies**:

- `@plexica/ui`: Card, Switch, Button, Input, Select, Form, Alert, Skeleton,
  EmptyState (all available)
- Backend: tenant plugin routes from T004-10

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] Visual review matches `design-spec.md` Screen 5 wireframe
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes

---

## Phase 7: Frontend Tests

**Sprint 5, Week 3 | 10 story points**

> All Phase 7 tasks depend on their corresponding Phase 6 component being complete.
> All 5 test tasks are independent and can run in parallel. Each task uses React
> Testing Library + Vitest, and every test file must include at least one `axe` audit
> assertion for WCAG 2.1 AA compliance (Constitution Art. 1.3).
>
> **Test conventions** (from codebase exploration):
>
> - Test framework: Vitest + React Testing Library
> - axe-core: use `@axe-core/react` or `vitest-axe` for accessibility assertions
> - Test location: `apps/web/src/__tests__/` or co-located with component
> - Pattern: `describe('ComponentName') → it('should ...')` with AAA pattern
> - Mock API calls: `vi.mock()` or MSW for network mocking

---

### T004-33: Tests for PluginsView (Registry tab, search, filter, ARIA)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 2                                             |
| Phase        | 7                                             |
| Dependencies | T004-28                                       |
| Parallel     | `[P]` with T004-34, T004-35, T004-36, T004-37 |
| Status       | complete                                      |

**Goal**: Write comprehensive tests for the redesigned PluginsView component covering
loading/empty/error states, search debounce, lifecycle status filter, badge mapping,
ARIA semantics, keyboard navigation, and WCAG 2.1 AA accessibility audit.

**Acceptance Criteria**:

- [ ] Loading state: renders 6 skeleton cards when data is loading
- [ ] Default state: renders plugin cards with correct lifecycle status badges
- [ ] Error state: renders Alert with error message and retry button; retry button
      re-fetches data
- [ ] Empty (no data) state: renders EmptyState with "No plugins registered" message
      and Register Plugin CTA
- [ ] Empty (filtered) state: renders EmptyState with "No plugins found" and Clear
      Filters link; clicking Clear Filters resets search and filter
- [ ] Search: typing in search input triggers debounced API call after 300ms
      (verify with `vi.useFakeTimers()`)
- [ ] Filter: selecting a lifecycle status from dropdown filters the displayed plugins
- [ ] Badge mapping: each lifecycle status renders correct badge variant and icon
      (verify all 7 statuses)
- [ ] Stat summary: correct counts displayed per lifecycle status
- [ ] ARIA: tablist has `role="tablist"`, tabs have `role="tab"`, panels have
      `role="tabpanel"`
- [ ] ARIA: plugin cards have `role="article"` with descriptive `aria-label`
- [ ] ARIA: stat summary uses `aria-live="polite"`
- [ ] Keyboard: Tab navigates between interactive elements in correct order
- [ ] Keyboard: Arrow keys navigate within tablist
- [ ] Keyboard: Escape closes dropdown menus
- [ ] Accessibility audit: `axe` reports no violations at WCAG 2.1 AA level
- [ ] All tests pass (`pnpm test`)

**Files to create/modify**:

- `apps/web/src/__tests__/plugins/PluginsView.test.tsx` — new test file

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] All tests pass
- [ ] axe audit passes with 0 violations

---

### T004-34: Tests for PluginInstallProgress (steps, error, retry, screen reader)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 2                                             |
| Phase        | 7                                             |
| Dependencies | T004-29                                       |
| Parallel     | `[P]` with T004-33, T004-35, T004-36, T004-37 |
| Status       | complete                                      |

**Goal**: Write comprehensive tests for the PluginInstallProgress component covering
step progression through all states, error variant with retry, cancel flow, elapsed
timer, screen reader announcements, and WCAG 2.1 AA accessibility audit.

**Acceptance Criteria**:

- [ ] Step progression: steps transition from pending → running → complete in order
- [ ] Step icons: correct icon rendered for each state (circle, spinner, checkmark, xcircle)
- [ ] Step duration: completed steps display elapsed time (e.g., "0.3s")
- [ ] Error variant: failed step shows XCircle icon, error panel with message, and
      "Retry Installation" + "Back to Registry" buttons
- [ ] Error variant: remaining steps after failure show "skipped" state
- [ ] Retry: clicking "Retry Installation" re-triggers install from failed step
- [ ] Cancel: clicking "Cancel Installation" calls onCancel and reverts state
- [ ] Success: all steps complete → shows success toast and "Enable now?" button
- [ ] Elapsed timer: timer starts on mount and increments (verify with fake timers)
- [ ] ARIA: container has `role="log"` with `aria-live="polite"`
- [ ] ARIA: step status changes announced to screen readers via aria-live
- [ ] ARIA: error panel has `role="alert"`
- [ ] ARIA: migrations progress bar has `role="progressbar"` with `aria-valuenow`
- [ ] Screen reader flow: step status changes are announced in correct order
- [ ] Accessibility audit: `axe` reports no violations at WCAG 2.1 AA level
- [ ] All tests pass

**Files to create/modify**:

- `apps/web/src/__tests__/plugins/PluginInstallProgress.test.tsx` — new test file

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] All tests pass
- [ ] axe audit passes with 0 violations

---

### T004-35: Tests for lifecycle dialogs (focus trap, Escape, name confirmation, blocked state)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 2                                             |
| Phase        | 7                                             |
| Dependencies | T004-30                                       |
| Parallel     | `[P]` with T004-33, T004-34, T004-36, T004-37 |
| Status       | complete                                      |

**Goal**: Write comprehensive tests for all four lifecycle confirmation dialogs
(`EnablePluginDialog`, `DisablePluginDialog`, `UpdatePluginDialog`, `UninstallPluginDialog`)
covering dialog behavior, focus management, keyboard interaction, safety guards, and
WCAG 2.1 AA accessibility audit.

**Acceptance Criteria**:

- [ ] **EnablePluginDialog**: renders permissions list, event count; confirm calls enable
      API; cancel closes dialog
- [ ] **DisablePluginDialog**: renders impact warning with tenant count; confirm calls
      disable API with destructive button; cancel closes dialog
- [ ] **UpdatePluginDialog**: renders version diff; when `breaking === true`, Confirm
      button disabled until plugin name is typed correctly in confirmation input
- [ ] **UninstallPluginDialog**: renders tenant count warning; Uninstall button disabled
      until plugin name typed correctly; "Delete all plugin data" checkbox state is passed
      to API call
- [ ] **UninstallPluginDialog blocked state**: when `activeTenantCount > 0`, action
      button is disabled with "Disable in all tenants first" tooltip
- [ ] Focus trap: focus is trapped within dialog (Tab cycles within dialog, not to
      background content)
- [ ] Focus management: on open, focus moves to first interactive element; on close,
      focus returns to trigger element
- [ ] Escape: pressing Escape closes dialog
- [ ] Name confirmation inputs: `aria-describedby` links to instruction text
- [ ] All destructive buttons use `variant="destructive"` (verify CSS class or data attr)
- [ ] ARIA: dialogs use `role="alertdialog"` with `aria-labelledby` and `aria-describedby`
- [ ] Accessibility audit: `axe` reports no violations at WCAG 2.1 AA level for each
      dialog
- [ ] All tests pass

**Files to create/modify**:

- `apps/web/src/__tests__/plugins/LifecycleDialogs.test.tsx` — new test file covering
  all four dialogs

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] All tests pass
- [ ] axe audit passes with 0 violations for all four dialogs

---

### T004-36: Tests for PluginDetailModal (tabs, health polling, ARIA tablist)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 2                                             |
| Phase        | 7                                             |
| Dependencies | T004-31                                       |
| Parallel     | `[P]` with T004-33, T004-34, T004-35, T004-37 |
| Status       | complete                                      |

**Goal**: Write comprehensive tests for the PluginDetailModal component covering tab
switching behavior, health polling, resource usage display, lifecycle timeline, tenant
adoption list, ARIA tablist pattern, and WCAG 2.1 AA accessibility audit.

**Acceptance Criteria**:

- [ ] Tab switching: clicking each tab (Overview, Health, Permissions, Events) shows
      the correct panel content and hides others
- [ ] Tab switching: keyboard Arrow keys navigate between tabs; Enter/Space activates
- [ ] Overview tab: renders manifest details (name, version, description, author,
      license, category), dependency list, runtime config
- [ ] Health tab: polls `GET /api/v1/plugins/:id/health` every 10s (verify with fake
      timers that the fetch is called at 10s intervals)
- [ ] Health tab: displays health status badge (healthy → green, unhealthy → red,
      starting → yellow)
- [ ] Health tab: resource usage bars show correct fill percentage; color changes at
      70% (yellow) and 90% (red) thresholds
- [ ] Permissions tab: renders all permission entries with key, name, description
- [ ] Events tab: renders published and subscribed topic lists with last activity
- [ ] Lifecycle timeline: renders state transitions in reverse chronological order with
      correct timestamps
- [ ] Tenant adoption list: renders tenant names, enabled dates; sortable by name
- [ ] ARIA: tab list has `role="tablist"`, each tab `role="tab"` with
      `aria-selected="true"` on active tab, `aria-controls` pointing to panel ID
- [ ] ARIA: tab panels have `role="tabpanel"` with `aria-labelledby` pointing to tab ID
- [ ] ARIA: health status updates use `aria-live="polite"` region
- [ ] Modal close: Escape key closes modal; focus returns to trigger
- [ ] Accessibility audit: `axe` reports no violations at WCAG 2.1 AA level
- [ ] All tests pass

**Files to create/modify**:

- `apps/web/src/__tests__/plugins/PluginDetailModal.test.tsx` — new test file

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] All tests pass
- [ ] axe audit passes with 0 violations

---

### T004-37: Tests for ExtensionsPage (toggle, config form validation, 403 guard)

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Points       | 2                                             |
| Phase        | 7                                             |
| Dependencies | T004-32                                       |
| Parallel     | `[P]` with T004-33, T004-34, T004-35, T004-36 |
| Status       | complete                                      |

**Goal**: Write comprehensive tests for the Tenant Extensions page covering plugin
toggle behavior, config form auto-generation and validation, RBAC 403 guard, loading/
error/empty states, and WCAG 2.1 AA accessibility audit.

**Acceptance Criteria**:

- [ ] Toggle on: clicking Switch calls `POST /api/v1/tenant/plugins/:id/enable`;
      on success, Configure button appears
- [ ] Toggle off: clicking Switch calls `POST /api/v1/tenant/plugins/:id/disable`;
      on success, Configure button disappears
- [ ] Config form: auto-generates correct field types from JSON Schema
      (`string` → Input, `number` → Input[type=number], `boolean` → Switch,
      `enum` → Select)
- [ ] Config form: `title` from schema renders as field label; `description` renders
      as help text
- [ ] Config form validation: required fields show error when empty on submit
- [ ] Config form validation: type-specific validation (e.g., number field rejects
      non-numeric input)
- [ ] Config form submit: sends validated data to
      `PUT /api/v1/tenant/plugins/:id/config`; shows success toast
- [ ] Config form error: API error shows Alert with error message
- [ ] 403 guard: when user lacks tenant admin role, page renders "You don't have
      permission to manage extensions" message with "Go to Dashboard" link
- [ ] Loading state: renders skeleton cards
- [ ] Error state: renders Alert with retry button
- [ ] Empty state: renders "No extensions available. Contact your platform administrator."
- [ ] All form fields have associated labels (`htmlFor` or `aria-label`)
- [ ] Accessibility audit: `axe` reports no violations at WCAG 2.1 AA level
- [ ] All tests pass

**Files to create/modify**:

- `apps/web/src/__tests__/plugins/ExtensionsPage.test.tsx` — new test file

**Definition of Done**:

- [ ] All acceptance criteria checked
- [ ] All tests pass
- [ ] axe audit passes with 0 violations

---

## Coverage Summary

| Target File                                                        | Current  | Target |
| ------------------------------------------------------------------ | -------- | ------ |
| `apps/core-api/src/services/plugin.service.ts`                     | ~20%     | ≥85%   |
| `apps/core-api/src/services/tenant-migration.service.ts`           | 0% (new) | ≥85%   |
| `apps/core-api/src/lib/container-adapter.ts`                       | 0% (new) | ≥80%   |
| `apps/core-api/src/lib/docker-container-adapter.ts`                | 0% (new) | ≥80%   |
| `apps/core-api/src/services/module-federation-registry.service.ts` | 0% (new) | ≥80%   |
| `apps/core-api/src/routes/plugin-v1.ts`                            | 0% (new) | ≥80%   |
| `apps/core-api/src/routes/tenant-plugins-v1.ts`                    | 0% (new) | ≥80%   |
| `packages/sdk/src/decorators/events.ts`                            | 0% (new) | ≥80%   |
| `packages/sdk/src/decorators/permissions.ts`                       | 0% (new) | ≥80%   |
| `packages/sdk/src/decorators/hooks.ts`                             | 0% (new) | ≥80%   |
| `apps/web/src/routes/plugins.tsx`                                  | 0%       | ≥80%   |
| `apps/web/src/routes/extensions.tsx`                               | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/PluginInstallProgress.tsx`        | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/PluginDetailModal.tsx`            | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/EnablePluginDialog.tsx`           | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/DisablePluginDialog.tsx`          | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/UpdatePluginDialog.tsx`           | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/UninstallPluginDialog.tsx`        | 0% (new) | ≥80%   |
| `apps/web/src/components/plugins/PluginConfigForm.tsx`             | 0% (new) | ≥80%   |

---

## Story Point Summary

| Phase                                            | Tasks             | Points     | Sprint             |
| ------------------------------------------------ | ----------------- | ---------- | ------------------ |
| Phase 1: Lifecycle State Machine & DB Migration  | T004-01 → T004-05 | 12 pts     | Sprint 4 Week 1    |
| Phase 2: Container Adapter & API Route Alignment | T004-06 → T004-11 | 16 pts     | Sprint 4 Week 2    |
| Phase 3: Communication & Frontend Registration   | T004-12 → T004-15 | 12 pts     | Sprint 4 Week 3    |
| Phase 4: SDK Completion                          | T004-16 → T004-19 | 10 pts     | Sprint 4 Week 4    |
| Phase 5: Test Coverage & Security Hardening      | T004-20 → T004-27 | 12 pts     | Sprint 5 Week 1    |
| Phase 6: Frontend UI Implementation              | T004-28 → T004-32 | 20 pts     | Sprint 5 Weeks 2–3 |
| Phase 7: Frontend Tests                          | T004-33 → T004-37 | 10 pts     | Sprint 5 Week 3    |
| **Total**                                        | **37 tasks**      | **92 pts** | **~7 weeks**       |

> 1 story point ≈ 2h focused engineering. 92 pts ≈ 184h.
> Sprint 4 (50 pts, Phases 1–4): core plugin system fully operational.
> Sprint 5 (42 pts, Phases 5–7): test coverage + security hardening + frontend UI + frontend tests.

---

## Dependency Graph

```
T004-01
  ├── T004-02 ──────────────────────────────────────────── T004-13
  ├── T004-03 ──────────────────────────────────────────── T004-09 ──── T004-28
  │     └── T004-08 ──── T004-12                                  ──── T004-29
  │           │          T004-14                                  ──── T004-30
  │           │          T004-15                                  ──── T004-31
  │           └──────────────────────────────────────────── T004-24
  ├── T004-04
  │     └── T004-08 (also depends on T004-06, T004-07)
  └── T004-05

T004-06 ──── T004-07 ──── T004-08 (see above)

T004-09 ──── T004-11 ──── T004-31
T004-10 ──── T004-25
       ──── T004-32

T004-16 ─┐
T004-17 ──┼── T004-19
T004-18 ─┘

T004-24 ──── T004-26
T004-25 ──── T004-26

T004-07, T004-09 ──── T004-27

T004-28 ──── T004-33
T004-29 ──── T004-34
T004-30 ──── T004-35
T004-31 ──── T004-36
T004-32 ──── T004-37
```

---

## Notes & Decisions Made

1. **T004-15 reframed**: The original plan describes this as "write ADR-018 and ADR-019"
   with a strikethrough noting they were already done. This tasks.md reframes T004-15 as
   a mandatory verification/cross-check task (3 pts retained) — ensuring code actually
   matches ADR decisions — plus a `plan.md` status update. This prevents silent drift
   between architecture decisions and implementation.

2. **Super-admin vs. tenant-admin `installPlugin()` distinction**: The existing
   `PluginLifecycleService.installPlugin(tenantId, pluginId)` is tenant-scoped. The
   new v1 API's `POST /api/v1/plugins/:id/install` is a global operation (no `tenantId`).
   Tasks T004-03 and T004-08 implement the global path; the existing tenant-scoped
   method is preserved for backward compatibility.

3. **Auth guard naming**: The codebase uses `requireSuperAdmin` and `requireTenantAccess`
   (not `requireRole('super_admin')` / `requireTenantAdmin()` as described in the
   plan). Tasks reference the actual middleware names.

4. **`buildTestApp()` location**: The helper is at `apps/core-api/src/test-app.ts`,
   not in `__tests__/`. Import path in tests: `import { buildTestApp } from '../../../test-app.js'`.

5. **`createMockToken` signature**: The actual helper is
   `testContext.auth.createMockSuperAdminToken()` and
   `testContext.auth.createMockTenantAdminToken(tenantSlug)` (not the generic
   `createMockToken()` variant).

6. **Phase 5 test file paths**: All test file paths match the plan.md §8 paths exactly,
   using the `unit/`, `integration/`, `e2e/` subdirectory convention already established
   in `apps/core-api/src/__tests__/plugin/`.

7. **`TranslationService.loadPluginTranslations()` doesn't exist**: Inspection of
   `i18n.service.ts` shows no `loadPluginTranslations()` method. T004-14 is specified
   to call `loadNamespaceFile()` per namespace × locale instead, which is the actual
   method present. This avoids implementing a phantom API.

8. **Frontend route structure**: The app uses TanStack Router with file-based routes at
   `apps/web/src/routes/`. The existing plugins page is at `plugins.tsx` (837 lines).
   Phase 6 tasks modify this file (T004-28) and create a new `extensions.tsx` route
   (T004-32). Components are co-located at `apps/web/src/components/plugins/`.

9. **`@plexica/ui` component library**: The UI library at `packages/ui/src/components/`
   already provides Badge, Card, Button, Modal, Switch, Select, Input, Progress,
   EmptyState, ConfirmDialog, Alert, Spinner, Skeleton, StatusBadge, StatCard,
   DataTable, Table, Checkbox, Form, Tooltip, Toast — all with existing `.test.tsx`
   files. Phase 6 tasks leverage these primitives extensively rather than creating new
   UI primitives.

10. **PluginContext**: An existing `PluginContext` at
    `apps/web/src/contexts/PluginContext.tsx` provides a `usePlugins()` hook. Phase 6
    tasks extend this context or create complementary hooks (e.g., `usePluginSearch`,
    `useInstallProgress`, `usePluginHealth`) rather than replacing the existing context.

11. **Frontend test conventions**: Phase 7 tasks use React Testing Library + Vitest with
    `@axe-core/react` or `vitest-axe` for accessibility assertions. Every test file
    must include at least one `axe` audit assertion to enforce WCAG 2.1 AA compliance
    per Constitution Art. 1.3.
