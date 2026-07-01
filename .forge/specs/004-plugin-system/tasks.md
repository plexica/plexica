# Tasks: 004 — Plugin System

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created from the plan, spec, ADRs 013-020, and design-spec.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Planned                                  |
| Author | forge-scrum                              |
| Date   | 2026-06-26                               |
| Spec   | `.forge/specs/004-plugin-system/spec.md` |
| Plan   | `.forge/specs/004-plugin-system/plan.md` |

---

## Legend

- `[004-NN]` — Feature being implemented
- `[DM-NN]` — Dev Mode feature
- `[NFR-NN]` — Non-functional requirement
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped

> **Build sequence**: Phase 1 → Phase 2 → Phase 5 → Phase 7
>                                            Phase 3 → Phase 7
>                                            Phase 4 → Phase 7
>                                            Phase 6 → Phase 7
>                                            Phase 8 (parallel)

---

## Phase 1 — Core Infrastructure (5 days)

> Prerequisites: Spec 002/003 infrastructure. Backend-only phase.

### 1.1 Database Migrations — Core Schema

- [ ] **1.1.1** `[004-01]` `[P]` Create `core.plugins` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/001_core_plugins.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for core schema: `plugins` table with id (UUID PK), slug (UNIQUE), name, description, version, author, icon_url, categories (JSONB), manifest (JSONB), registry_url, image_name, image_tag, image_digest, registry_credentials_secret (encrypted), pull_policy, status (draft/published/unpublished), created_by, created_at, updated_at.
  - **Spec Reference**: Plan §4, DR-15
  - **Dependencies**: None

- [ ] **1.1.2** `[004-01]` `[P]` Create `core.plugin_versions` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/002_core_plugin_versions.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for `plugin_versions` table: id (UUID PK), plugin_id (FK), version (semver), manifest (JSONB), image_digest, created_at.
  - **Dependencies**: 1.1.1

- [ ] **1.1.3** `[004-18]` `[P]` Create `core.dead_letter_queue` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/003_core_dlq.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for `dead_letter_queue` table: id (UUID PK), event_type, payload (JSONB), plugin_id, error_message (JSONB), retry_count, failed_at, status (pending/retried/dismissed), resolved_at.
  - **Dependencies**: None

### 1.2 Database Migrations — Tenant Schema

- [ ] **1.2.1** `[004-03]` `[P]` Create `tenant.plugin_installations` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/004_tenant_plugin_installations.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for tenant schema: `plugin_installations` with id (UUID PK), plugin_id, tenant_slug, status (installed/active/deactivated/uninstalled), hosting_type (sidecar/kubernetes), container_id, k8s_pod_name, tenant_default_visibility (enabled/disabled), installed_by, installed_at, updated_at.
  - **Dependencies**: None

- [ ] **1.2.2** `[004-03]` `[P]` Create `tenant.plugin_migration_status` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/005_tenant_plugin_migration_status.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for `plugin_migration_status` table: id (UUID PK), install_id (FK), migration_name, status (pending/applied/failed), applied_at, error_message.
  - **Dependencies**: 1.2.1

- [ ] **1.2.3** `[004-06]` `[P]` Create `tenant.plugin_workspace_visibility` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/006_tenant_plugin_workspace_visibility.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for `plugin_workspace_visibility` table: id (UUID PK), install_id (FK), workspace_id (FK), is_enabled (boolean), is_override (boolean), updated_by, updated_at.
  - **Dependencies**: 1.2.1

- [ ] **1.2.4** `[004-20]` `[P]` Create `tenant.plugin_container_config` table migration
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/007_tenant_plugin_container_config.sql`
  - **Type**: Create new file
  - **Description**: SQL migration for `plugin_container_config` table: id (UUID PK), install_id (FK), type (sidecar/kubernetes), image, image_pull_secret (encrypted), resource_limits (JSONB), env_overrides (JSONB), health_status (healthy/degraded/unreachable), last_health_check_at.
  - **Dependencies**: 1.2.1

- [ ] **1.2.5** `[004-03]` `[P]` Extend `tenant.action_registry` with plugin_id FK
  - **File**: `services/core-api/prisma/migrations/004_plugin_system/008_tenant_extend_action_registry.sql`
  - **Type**: Create new file
  - **Description**: ALTER TABLE `action_registry` ADD COLUMN `plugin_id` UUID NULL REFERENCES `core.plugins(id)`. The column is nullable — NULL = core action, non-NULL = plugin action.
  - **Dependencies**: 1.1.1

### 1.3 Backend Module — Plugin Registry

- [ ] **1.3.1** `[004-01]` `[P]` Create plugin module entry point
  - **File**: `services/core-api/src/modules/plugin/index.ts`
  - **Type**: Create new file
  - **Description**: Fastify plugin registration: register decorators, register routes (admin + lifecycle + proxy + dev). Export plugin module for app entry. Must follow existing module pattern (see workspace module).
  - **Dependencies**: None
  - **Estimated**: `[S]` ~15 min

- [ ] **1.3.2** `[004-01]` `[P]` Create plugin error classes
  - **File**: `services/core-api/src/modules/plugin/errors.ts`
  - **Type**: Create new file
  - **Description**: Plugin-specific AppError subclasses: `PluginNotFoundError`, `PluginConflictError` (slug collision, already installed), `PluginValidationError` (manifest invalid), `PluginInstallError` (migration/container failure), `PluginBackendUnreachableError`. Each extends AppError with HTTP status code.
  - **Dependencies**: None
  - **Estimated**: `[S]` ~15 min

- [ ] **1.3.3** `[004-02]` `[P]` Create manifest Zod schema
  - **File**: `services/core-api/src/modules/plugin/schema/manifest.ts`
  - **Type**: Create new file
  - **Description**: Full Zod schema for manifest.json per DR-15: slug (regex), name, version (semver), description, author, icon, categories (string[]), hosting (type + image + resources), ui (remoteEntry + extensionPoints), events.subscribes (string[]), actions (optional array), declaredTables (array with name + description + migrationFile). Validation < 50ms P95.
  - **Dependencies**: None

- [ ] **1.3.4** `[004-01]` `[P]` Create API Zod schemas
  - **File**: `services/core-api/src/modules/plugin/schema/api.ts`
  - **Type**: Create new file
  - **Description**: Zod schemas for all plugin API endpoints: RegisterPluginSchema (registry_url, image_name, image_tag, manifest), InstallPluginSchema, UpdateVisibilitySchema, etc.
  - **Dependencies**: 1.3.3

- [ ] **1.3.5** `[004-03]` `[P]` Create migration validation Zod schema
  - **File**: `services/core-api/src/modules/plugin/schema/migrations.ts`
  - **Type**: Create new file
  - **Description**: Zod schema for validating migration SQL files. Validates allowed SQL statements (CREATE TABLE, ALTER TABLE, CREATE INDEX — no DROP, no GRANT). Rejects dangerous statements.
  - **Dependencies**: None

- [ ] **1.3.6** `[004-01]` Create registry service
  - **File**: `services/core-api/src/modules/plugin/services/registry.service.ts`
  - **Type**: Create new file
  - **Description**: CRUD service for `core.plugins` and `core.plugin_versions`. Methods: `create(data)`, `findBySlug(slug)`, `list(filters)`, `getVersions(pluginId)`, `updateStatus(id, status)`. All queries use parameterized SQL via Prisma. Must be < 200 lines.
  - **Dependencies**: 1.1.1, 1.1.2

- [ ] **1.3.7** `[004-02]` `[P]` Create manifest validator service
  - **File**: `services/core-api/src/modules/plugin/services/manifest-validator.service.ts`
  - **Type**: Create new file
  - **Description**: Full manifest validation: Zod parse (DR-15) + business rules (slug uniqueness across registry, action key namespace check against core + installed plugins, declared tables naming convention `{slug}_*`, no conflicting action keys). Returns typed `ValidationResult` with error list. Validation < 50ms P95.
  - **Dependencies**: 1.3.3

- [ ] **1.3.8** `[004-01]` `[P]` Create slug prefix utility
  - **File**: `services/core-api/src/modules/plugin/lib/slug-prefix.ts`
  - **Type**: Create new file
  - **Description**: Helpers for plugin table naming: `tableName(slug, table)` → `{slug}_{table}`, `validateTableName(name)` → regex check against `/^{slug}_[a-z][a-z0-9_]{1,62}$/`.
  - **Dependencies**: None

- [ ] **1.3.9** `[004-01]` Create admin catalog routes
  - **File**: `services/core-api/src/modules/plugin/routes/admin-catalog.routes.ts`
  - **Type**: Create new file
  - **Description**: `GET /api/v1/admin/plugins` (list with search/filter/pagination), `POST /api/v1/admin/plugins/register` (validate manifest + create record). Super admin auth via `requireSuperAdmin()` middleware. Response format matches existing API pattern.
  - **Dependencies**: 1.3.6, 1.3.7

- [ ] **1.3.10** `[004-01]` Create admin publish routes
  - **File**: `services/core-api/src/modules/plugin/routes/admin-publish.routes.ts`
  - **Type**: Create new file
  - **Description**: `POST /api/v1/admin/plugins/:slug/publish`, `POST /api/v1/admin/plugins/:slug/unpublish`. Changes status in registry. Super admin only. Returns updated plugin record.
  - **Dependencies**: 1.3.9

- [ ] **1.3.11** `[004-01]` Create admin version routes
  - **File**: `services/core-api/src/modules/plugin/routes/admin-versions.routes.ts`
  - **Type**: Create new file
  - **Description**: `GET /api/v1/admin/plugins/:slug/versions` (list version history). `POST /api/v1/admin/plugins/:slug/versions` (register new version for update flow per DR-19/ADR-020).
  - **Dependencies**: 1.3.6

### 1.4 Install Flow Orchestrator

- [ ] **1.4.1** `[004-03]` Create lifecycle service (part 1: install)
  - **File**: `services/core-api/src/modules/plugin/services/lifecycle.service.ts`
  - **Type**: Create new file
  - **Description**: Install flow orchestrator — 11-step idempotent pipeline per Plan §10.6: validate tenant admin → create installation record → pull container image → run migrations (transaction per migration, rollback on failure) → create container → configure DB access (PostgreSQL role) → create Kafka consumer group → register actions → set tenant default visibility → emit event → mark active. Each step has status tracking in a `steps` array returned via polling endpoint.
  - **Dependencies**: 1.3.6, 1.3.7, 1.2.1, 1.2.2

---

## Phase 2 — Container Lifecycle (3 days)

> Prerequisites: Phase 1. Introduces container management and dev registration.

### 2.1 Container Manager

- [ ] **2.1.1** `[004-22]` `[P]` Create ContainerManager interface
  - **File**: `services/core-api/src/modules/plugin/services/container-manager.service.ts`
  - **Type**: Create new file
  - **Description**: Define `ContainerManager` interface: `startContainer(installId, manifest): Promise<ContainerInfo>`, `stopContainer(installId): Promise<void>`, `getContainerStatus(installId): Promise<ContainerStatus>`, `restartContainer(installId): Promise<void>`. `ContainerInfo` includes `port`, `containerId`. `ContainerStatus` includes `state`, `health`, `startedAt`. See Plan §10.1.
  - **Dependencies**: None

- [ ] **2.1.2** `[004-22]` Implement DockerContainerManager
  - **File**: `services/core-api/src/modules/plugin/services/container-manager.service.ts`
  - **Type**: Add implementation
  - **Description**: Implement `DockerContainerManager` using `dockerode`. Start: `docker run -d --name plexica-plugin-{id} --restart unless-stopped -p 0:3000 {image}`. Uses OS-assigned random port (pass `0` for host port). Stop: `docker stop {name}`. Remove: `docker rm -f {name}`. Status: `docker inspect {name}`. Network: `plexica-dev_default` for dev, bridge with port mapping in CI. New dependency: `dockerode` (requires ADR-013 already created).
  - **Dependencies**: 2.1.1

- [ ] **2.1.3** `[004-22]` `[P]` Implement placeholder KubernetesContainerManager
  - **File**: `services/core-api/src/modules/plugin/services/container-manager.service.ts`
  - **Type**: Add implementation
  - **Description**: Placeholder `KubernetesContainerManager` that throws `NotImplementedError` with message "Kubernetes support requires production deployment. Use sidecar for dev/CI." Full K8s implementation deferred to production setup. Structure matches interface: creates Deployment + Service in `plexica-plugins` namespace.
  - **Dependencies**: 2.1.1

### 2.2 Health Check & Circuit Breaker

- [ ] **2.2.1** `[004-22]` Create health check service
  - **File**: `services/core-api/src/modules/plugin/services/health-check.service.ts`
  - **Type**: Create new file
  - **Description**: Periodic health checker. Polls plugin's `/_plexica/health` endpoint every 30s. Circuit breaker states: closed (healthy) → 3 failures → open (degraded) → 30s timer → half-open (allow one probe) → success→closed / failure→open. Stores status in `plugin_container_config.health_status`. Emits health change events. < 100ms overhead per check.
  - **Dependencies**: 2.1.2

### 2.3 Dev Mode Registration

- [ ] **2.3.1** `[DM-03]` Create dev mode registration endpoint
  - **File**: `services/core-api/src/modules/plugin/routes/dev.routes.ts`
  - **Type**: Create new file
  - **Description**: `POST /api/v1/dev/plugins/register` — gated by `NODE_ENV=development` (returns 404 in production). Accepts: `slug`, `backendUrl`, `uiUrl`, `extensionPoints`, `actions`, `events.subscribes`, `declaredTables`. Registers proxy route `{slug}/proxy/*` → `backendUrl`, adds MF remote to shell's dev watcher, creates dev Kafka consumer group (`plugin-{slug}-dev`), registers temporary actions. `POST /api/v1/dev/plugins/unregister` — cleans up proxy, MF remote, consumer group, actions. Only accepts connections from `localhost`.
  - **Dependencies**: None

---

## Phase 3 — MF Vite Preset + Shell (7 days)

> Prerequisites: None (independent of Phase 1). Frontend + packages.

### 3.1 Vite Plugin Preset

- [ ] **3.1.1** `[004-07]` `[P]` Create @plexica/vite-plugin package
  - **File**: `packages/vite-plugin/package.json`
  - **Type**: Create new file
  - **Description**: New package `@plexica/vite-plugin`. Depends on `@originjs/vite-plugin-federation`. Scripts: build, test, lint. Add to pnpm workspace.
  - **Dependencies**: None

- [ ] **3.1.2** `[004-07]` Create MF config generator
  - **File**: `packages/vite-plugin/src/mf-config-generator.ts`
  - **Type**: Create new file
  - **Description**: Reads `manifest.json` from plugin project root. Extracts `slug` as MF name, `ui.extensionPoints` to generate `exposes` map (e.g., `./sidebar:admin` → `./ui/sidebar-entry.tsx`). Generates `@originjs/vite-plugin-federation` config object. See Plan §10.2.
  - **Dependencies**: 3.1.1

- [ ] **3.1.3** `[004-09]` Define shared dependencies
  - **File**: `packages/vite-plugin/src/shared-deps.ts`
  - **Type**: Create new file
  - **Description**: Shared MF dependencies: react, react-dom (^19), @tanstack/react-query, @plexica/ui, @plexica/i18n. Exact version ranges pinned. CI bundle analyzer check confirms zero duplication (NFR-02).
  - **Dependencies**: 3.1.1

- [ ] **3.1.4** `[004-07]` `[P]` Create vite-plugin entry point
  - **File**: `packages/vite-plugin/src/index.ts`
  - **Type**: Create new file
  - **Description**: Vite plugin entry. Reads manifest.json (or custom path), generates federation config using mf-config-generator, merges shared deps. Exports default function `plexicaPluginVite(options?)`. Integrates dev-server-registration in development mode. See Plan §10.2.
  - **Dependencies**: 3.1.2, 3.1.3

- [ ] **3.1.5** `[004-13]` `[P]` Create dev server registration module
  - **File**: `packages/vite-plugin/src/dev-server-registration.ts`
  - **Type**: Create new file
  - **Description**: WebSocket-based registration with shell. On Vite dev server start: sends `{ type: "plugin-register", slug, remoteEntry, extensionPoints }` to shell's WebSocket at `ws://localhost:3000/_plexica/dev-ws`. On stop: sends `{ type: "plugin-unregister", slug }`. See Plan §10.5.
  - **Dependencies**: 3.1.1

- [ ] **3.1.6** `[004-07]` `[P]` Write @plexica/vite-plugin tests
  - **File**: `packages/vite-plugin/__tests__/`
  - **Type**: Create directory + files
  - **Description**: Unit tests: mf-config-generator produces correct exposes from manifest, shared-deps version ranges match shell. Integration: mock manifest → build config → verify federation output.
  - **Dependencies**: 3.1.4

### 3.2 Shell MF Host

- [ ] **3.2.1** `[004-08]` Create plugin loader component
  - **File**: `apps/web/src/mf-host/plugin-loader.tsx`
  - **Type**: Create new file
  - **Description**: Dynamic remote loading from MinIO. Fetches `remoteEntry.js` from MinIO URL `plugins/{slug}/{version}/remoteEntry.js`. Imports the module, extracts exposed components. Caches loaded remotes in a Map. Retries on failure with exponential backoff (3 attempts). Returns `{ Component, error }`.
  - **Dependencies**: None

- [ ] **3.2.2** `[004-10]` `[P]` Create plugin context hook
  - **File**: `apps/web/src/mf-host/use-plugin-context.ts`
  - **Type**: Create new file
  - **Description**: React context propagation hook. Provides `PluginContext` (tenant, user, workspace, theme) to all plugin MF components. Uses existing Zustand store values. Wraps in React context that plugins consume via SDK's `getContext()`. See Plan §3.2.
  - **Dependencies**: None

- [ ] **3.2.3** `[004-11]` `[P]` Create sidebar extension slot
  - **File**: `apps/web/src/mf-host/extension-slots/sidebar-slot.tsx`
  - **Type**: Create new file
  - **Description**: Renders plugins at `sidebar:admin` slot. Reads active plugin list, filters by `sidebar:admin` extension point. Renders each plugin's exposed component inside an error boundary. Slots with no plugins are invisible. Integrates into `Sidebar.tsx` below main nav items.
  - **Dependencies**: 3.2.1

- [ ] **3.2.4** `[004-11]` `[P]` Create workspace panel extension slot
  - **File**: `apps/web/src/mf-host/extension-slots/workspace-panel-slot.tsx`
  - **Type**: Create new file
  - **Description**: Renders plugins at `workspace-panel:main` slot. Workspace-scoped. Loaded only when user is in a workspace context. Integrates into `WorkspacePage.tsx`.
  - **Dependencies**: 3.2.1

- [ ] **3.2.5** `[004-11]` `[P]` Create dashboard widget extension slot
  - **File**: `apps/web/src/mf-host/extension-slots/dashboard-widget-slot.tsx`
  - **Type**: Create new file
  - **Description**: Renders plugins at `dashboard-widget:grid` slot. Grid of small widgets. Integrates into `DashboardPage.tsx`.
  - **Dependencies**: 3.2.1

- [ ] **3.2.6** `[004-12]` Create error boundary component
  - **File**: `apps/web/src/mf-host/error-boundary.tsx`
  - **Type**: Create new file
  - **Description**: React error boundary per slot. Catches plugin component crashes. Shows fallback: "Plugin unavailable" with retry button. Focus management: on crash, focus moves to error fallback. After 3 consecutive crashes, marks slot as permanently degraded (user must reload). See spec §9 and design-spec.
  - **Dependencies**: None

- [ ] **3.2.7** `[004-08]` `[P]` Create plugin unavailable fallback
  - **File**: `apps/web/src/mf-host/plugin-unavailable.tsx`
  - **Type**: Create new file
  - **Description**: Fallback UI components: `PluginUnavailable` (404 remote, with retry button), `PluginDegraded` (warning icon + status message). Use existing @plexica/ui components. WCAG 2.1 AA.
  - **Dependencies**: None

- [ ] **3.2.8** `[004-13]` `[P]` Create shell dev watcher
  - **File**: `apps/web/src/mf-host/plugin-dev-watcher.ts`
  - **Type**: Create new file
  - **Description**: Dev-mode only WebSocket listener. Loaded only when `NODE_ENV=development`. Listens on `ws://localhost:3000/_plexica/dev-ws`. On plugin-register message: adds remote to MF container. On plugin-unregister: removes remote. Also listens for backend registration (Plan §10.5, §10.7).
  - **Dependencies**: 3.2.1

- [ ] **3.2.9** `[004-08]` Integrate MF host into shell layout
  - **File**: `apps/web/src/components/layout/Sidebar.tsx` (MODIFY) + `apps/web/src/pages/WorkspacePage.tsx` (MODIFY) + `apps/web/src/pages/DashboardPage.tsx` (MODIFY)
  - **Type**: Modify existing files
  - **Description**: Integrate sidebar-slot into Sidebar.tsx below main nav. Integrate workspace-panel-slot into WorkspacePage.tsx content area. Integrate dashboard-widget-slot into DashboardPage.tsx widget grid. Slots are invisible when no active plugins exist. Each slot wrapped in error boundary. See spec §9 and design-spec.
  - **Dependencies**: 3.2.3, 3.2.4, 3.2.5, 3.2.6

---

## Phase 4 — Kafka Events (5 days)

> Prerequisites: Phase 1. Extends existing Kafka infrastructure (ADR-004).

### 4.1 Core Event Emission

- [ ] **4.1.1** `[004-14]` `[P]` Create Kafka event producer utility
  - **File**: `services/core-api/src/lib/kafka-producer.ts` (or extend existing)
  - **Type**: Create new file
  - **Description**: Wrapper around KafkaJS producer. Methods: `emit(entity, action, payload)`, `emitPluginEvent(slug, type, payload)`. Auto-creates topics on first use (`plexica.{entity}.{action}`). Retry with exponential backoff (3 attempts). Fire-and-forget: core operation completes even if Kafka is down (event goes to DLQ). See Plan §3.3.
  - **Dependencies**: None

- [ ] **4.1.2** `[004-14]` Integrate event emission into workspace service
  - **File**: `services/core-api/src/modules/workspace/services/workspace.service.ts` (MODIFY)
  - **Type**: Modify existing file
  - **Description**: Emit `plexica.workspace.created`, `plexica.workspace.updated`, `plexica.workspace.deleted` on corresponding service operations. Fire-and-forget: emit after DB commit. Must not block or break the workspace operation if Kafka is unavailable.
  - **Dependencies**: 4.1.1

- [ ] **4.1.3** `[004-14]` Integrate event emission into user management service
  - **File**: `services/core-api/src/modules/user-management/services/user-management.service.ts` (MODIFY)
  - **Type**: Modify existing file
  - **Description**: Emit `plexica.user.invited`, `plexica.user.joined`, `plexica.user.removed` on corresponding operations. Same fire-and-forget pattern.
  - **Dependencies**: 4.1.1

- [ ] **4.1.4** `[004-14]` Integrate event emission into tenant service
  - **File**: `services/core-api/src/modules/tenant/services/tenant.service.ts` (MODIFY)
  - **Type**: Modify existing file
  - **Description**: Emit `plexica.tenant.created`, `plexica.tenant.suspended`, `plexica.tenant.deleted` on corresponding operations.
  - **Dependencies**: 4.1.1

### 4.2 Consumer & Event Dispatch

- [ ] **4.2.1** `[004-15]` `[004-17]` Create consumer manager service
  - **File**: `services/core-api/src/modules/plugin/services/consumer-manager.service.ts`
  - **Type**: Create new file
  - **Description**: Kafka consumer group lifecycle management. `createConsumerGroup(installId, tenantSlug, eventPatterns)` → creates consumer group `plugin-{installId}-{tenant_slug}` subscribed to manifest-declared patterns. `deleteConsumerGroup(installId)`. `pauseConsumer(installId)`. `resumeConsumer(installId)`. Consumer groups use glob pattern matching (e.g., `plexica.workspace.*`). See Plan §3.3.
  - **Dependencies**: None

- [ ] **4.2.2** `[004-15]` Create event dispatcher
  - **File**: `services/core-api/src/modules/plugin/services/event-dispatcher.service.ts`
  - **Type**: Create new file
  - **Description**: Receives Kafka messages, forwards them to plugin backend via HTTP POST `/_plexica/event`. Injects headers: X-Plexica-Tenant-Id, X-Plexica-Correlation-Id. Retry with exponential backoff (100ms, 500ms, 2s). After 3 failures → moves to DLQ. Per ADR-016/DR-17. Must complete in < 1s P95.
  - **Dependencies**: 4.2.1

### 4.3 Dead Letter Queue

- [ ] **4.3.1** `[004-18]` `[P]` Create DLQ Kafka topic consumer
  - **File**: `services/core-api/src/modules/plugin/services/dlq-consumer.service.ts`
  - **Type**: Create new file
  - **Description**: Consumes from Kafka DLQ topic `plexica.plugin.dlq`. Reads raw event + headers (original topic, partition, offset, failure reason, retry count). Inserts into `core.dead_letter_queue` DB table. Handles deserialization. Per ADR-016.
  - **Dependencies**: 1.1.3

- [ ] **4.3.2** `[004-18]` Create DLQ management routes
  - **File**: `services/core-api/src/modules/plugin/routes/dlq.routes.ts`
  - **Type**: Create new file
  - **Description**: `GET /api/v1/admin/system/dlq` (paginated, filterable by status/plugin/date), `POST /api/v1/admin/system/dlq/:id/retry` (re-publishes event to original topic), `POST /api/v1/admin/system/dlq/:id/dismiss` (marks dismissed). Super admin auth. Response format matches existing paginated pattern.
  - **Dependencies**: 4.3.1

- [ ] **4.3.3** `[004-18]` `[P]` Create DLQ TTL cleanup job
  - **File**: `services/core-api/src/modules/plugin/services/dlq-cleanup.service.ts`
  - **Type**: Create new file
  - **Description**: Cron job (runs daily): deletes `dead_letter_queue` rows older than 30 days. Prevents unbounded growth. Configurable via env var `DLQ_RETENTION_DAYS`. Logs cleanup count.
  - **Dependencies**: 4.3.2

### 4.4 Monitoring

- [ ] **4.4.1** `[004-19]` Create consumer lag metrics
  - **File**: `services/core-api/src/modules/plugin/services/lag-metrics.service.ts`
  - **Type**: Create new file
  - **Description**: Prometheus Gauge metric `plexica_plugin_consumer_lag` with labels `plugin_slug`, `tenant_slug`, `install_id`. Updated every 30s via KafkaJS `consumer.describeGroup()`. Alert threshold: default 1000 lag (configurable). Exported via existing `/metrics` endpoint.
  - **Dependencies**: 4.2.1

---

## Phase 5 — Proxy + Visibility (3 days)

> Prerequisites: Phase 2 (container running) + Phase 4 (consumer groups).

- [ ] **5.1** `[004-20]` Create proxy service
  - **File**: `services/core-api/src/modules/plugin/services/proxy.service.ts`
  - **Type**: Create new file
  - **Description**: HTTP proxy to plugin backend using `@fastify/http-proxy` or custom `undici` fetch. Routes ALL `/api/v1/plugins/:installId/proxy/*` to plugin container at mapped port (sidecar) or K8s service URL. Injects auth/tenant headers: X-Plexica-Tenant-Id, X-Plexica-User-Id, X-Plexica-Workspace-Id, X-Plexica-User-Role. On container unreachable: returns 503. On circuit breaker open: returns 503 with degraded code. Overhead < 100ms P95. New dep: `@fastify/http-proxy` (requires ADR note).
  - **Dependencies**: 2.1.2

- [ ] **5.2** `[004-21]` Add auth header injection to proxy
  - **File**: `services/core-api/src/modules/plugin/services/proxy.service.ts`
  - **Type**: Modify
  - **Description**: Extract tenant ID, user ID, workspace ID, and role from Fastify request context (already resolved by tenant-context, auth, and ABAC middleware). Inject as headers on proxied request. See DR-20 for exact header names.
  - **Dependencies**: 5.1

- [ ] **5.3** `[004-20]` Create proxy routes
  - **File**: `services/core-api/src/modules/plugin/routes/proxy.routes.ts`
  - **Type**: Create new file
  - **Description**: `ALL /api/v1/plugins/:installId/proxy/*` — wildcard route matching any method/path. Resolves `installId` to container URL via `plugin_container_config`. Passes request to proxy service. Returns 404 for unknown installId, 503 for unreachable backend.
  - **Dependencies**: 5.1

- [ ] **5.4** `[004-04]` Create lifecycle routes
  - **File**: `services/core-api/src/modules/plugin/routes/lifecycle.routes.ts`
  - **Type**: Create new file
  - **Description**: `POST /api/v1/plugins/:installId/deactivate` (stops container, pauses consumer, sets visibility inactive), `POST /api/v1/plugins/:installId/reactivate` (starts container, resumes consumer, restores visibility), `POST /api/v1/plugins/:installId/uninstall` (stops container, drops tables, deletes consumer group, removes actions, deletes install record — with data loss confirmation). ABAC: requires tenant admin role.
  - **Dependencies**: 1.4.1, 4.2.1

- [ ] **5.5** `[004-06]` Create workspace visibility routes
  - **File**: `services/core-api/src/modules/plugin/routes/visibility.routes.ts`
  - **Type**: Create new file
  - **Description**: `GET /api/v1/plugins/:installId/visibility` (list workspace visibility with overrides), `PUT /api/v1/plugins/:installId/visibility` (set workspace-level visibility). ABAC: requires workspace admin. Data model per DR-16/ADR-018: two-level (tenant default + workspace override).
  - **Dependencies**: 5.4

- [ ] **5.6** `[004-05]` Create workspace visibility service
  - **File**: `services/core-api/src/modules/plugin/services/visibility.service.ts`
  - **Type**: Create new file
  - **Description**: Service for visibility operations: `getTenantDefault(installId)`, `setTenantDefault(installId, enabled)`, `getWorkspaceVisibility(installId, workspaceId)`, `setWorkspaceVisibility(installId, workspaceId, enabled)`. Resolves tenant default vs workspace override logic (DR-16). Clears override when workspace setting matches tenant default.
  - **Dependencies**: 1.2.3

- [ ] **5.7** `[004-03]` `[DM-01]` Install flow: configure DB access
  - **File**: `services/core-api/src/modules/plugin/services/lifecycle.service.ts` (extend)
  - **Type**: Modify
  - **Description**: Step 6 of install flow: create PostgreSQL role `CREATE ROLE plugin_{installId}` with LOGIN PASSWORD. Grant USAGE on schema + ALL PRIVILEGES on declared tables. Revoke default public schema access. Store encrypted credentials in `plugin_container_config.envOverrides`. Per ADR-017. Dev mode skips this — uses developer's local credentials.
  - **Dependencies**: 1.2.4

- [ ] **5.8** `[004-04]` `[DM-02]` Install flow: register plugin actions
  - **File**: `services/core-api/src/modules/plugin/services/lifecycle.service.ts` (extend)
  - **Type**: Modify
  - **Description**: Step 8 of install flow: insert plugin-declared actions into `action_registry` with `default_role`. On deactivation: set actions as inactive. On uninstall: cascade delete via FK. Per DR-12/ADR-015.
  - **Dependencies**: 1.2.5

---

## Phase 6 — CLI + SDK + Dev Mode (3 days)

> Prerequisites: Phase 3 (MF types), Phase 4 (event patterns). Packages phase.

### 6.1 Plugin SDK

- [ ] **6.1.1** `[004-30]` `[P]` Create @plexica/sdk package
  - **File**: `packages/sdk/package.json`
  - **Type**: Create new file
  - **Description**: New package `@plexica/sdk`. Depends on kafkajs, @prisma/client. Scripts: build, test, lint. Add to pnpm workspace.
  - **Dependencies**: None

- [ ] **6.1.2** `[004-30]` Create PluginSDK class
  - **File**: `packages/sdk/src/index.ts`
  - **Type**: Create new file
  - **Description**: Single `PluginSDK` class with constructor injection per DR-20/ADR-019. Methods: `onEvent(pattern, handler)` — subscribe to events with glob pattern matching; `callApi(method, path, body)` — proxy API call through core; `getContext()` — returns tenant/user/workspace context; `getDb()` — returns Prisma client scoped to declared tables (PostgreSQL role per ADR-017); `emitEvent(type, payload)` — emit custom event prefixed `plugin.{slug}.{type}`. See Plan §10.4 for full interface.
  - **Dependencies**: 6.1.1

- [ ] **6.1.3** `[004-30]` Create SDK types
  - **File**: `packages/sdk/src/types.ts`
  - **Type**: Create new file
  - **Description**: TypeScript types: `PluginContext` (tenantId, userId, workspaceId, role), `PluginEvent` (type, payload, timestamp, correlationId), `PluginConfig` (pluginId, tenantId, kafkaBrokers, apiUrl).
  - **Dependencies**: 6.1.2

- [ ] **6.1.4** `[004-30]` Create SDK errors
  - **File**: `packages/sdk/src/errors.ts`
  - **Type**: Create new file
  - **Description**: SDK-specific error classes: `SdkNotInitializedError`, `EventSubscriptionError`, `ApiCallError`, `DbAccessError`.
  - **Dependencies**: 6.1.2

- [ ] **6.1.5** `[004-30]` Create OpenAPI 3.1 contract
  - **File**: `packages/sdk/openapi.yaml`
  - **Type**: Create new file
  - **Description**: OpenAPI 3.1 spec defining three endpoints every plugin backend MUST implement: `GET /_plexica/health` (liveness), `GET /_plexica/ready` (readiness), `POST /_plexica/event` (event delivery). Defines X-Plexica-* header injection contract. Per DR-20/ADR-019.
  - **Dependencies**: None

- [ ] **6.1.6** `[004-30]` Write SDK unit tests
  - **File**: `packages/sdk/__tests__/`
  - **Type**: Create directory + files
  - **Description**: Test PluginSDK class: `onEvent` subscribes correctly, `callApi` formats proxy request, `getContext` returns correct shape, `emitEvent` calls Kafka producer. Mock Kafka and HTTP internally. Also test OpenAPI contract against example plugin backend.
  - **Dependencies**: 6.1.2, 6.1.5

### 6.2 SDK Dev Mode Module

- [ ] **6.2.1** `[DM-01]` Create @plexica/sdk/dev module
  - **File**: `packages/sdk/dev/index.ts`
  - **Type**: Create new file
  - **Description**: `@plexica/sdk/dev` module. Exports `registerBackend(config)` — calls `POST /api/v1/dev/plugins/register` with plugin slug, backend URL, manifest info. Exports `unregisterBackend(slug)` — calls `POST /api/v1/dev/plugins/unregister`. Dev-only import path.
  - **Dependencies**: 6.1.2

- [ ] **6.2.2** `[DM-01]` Create dev migration helper
  - **File**: `packages/sdk/dev/migration.ts`
  - **Type**: Create new file
  - **Description**: `applyMigrations(tenant, migrationsDir)` — reads migration SQL files, connects to tenant schema, applies each, tracks status in `plugin_migration_status`. Idempotent: skips already-applied migrations. For use with `pnpm migration:apply --tenant=dev`.
  - **Dependencies**: None

- [ ] **6.2.3** `[DM-01]` Write dev mode tests
  - **File**: `packages/sdk/__tests__/dev-mode.test.ts`
  - **Type**: Create new file
  - **Description**: Test dev mode flow: registerBackend → unregisterBackend. Test migration helper: apply → re-apply (idempotent). Mock HTTP endpoints.
  - **Dependencies**: 6.2.1, 6.2.2

### 6.3 CLI

- [ ] **6.3.1** `[004-29]` `[P]` Create @plexica/create-plugin package
  - **File**: `packages/cli/package.json`
  - **Type**: Create new file
  - **Description**: New package `create-plexica-plugin`. Binary: `bin/create-plexica-plugin.js`. Add to pnpm workspace. Depends on handlebars, prompts (for interactive prompts).
  - **Dependencies**: None

- [ ] **6.3.2** `[004-29]` Create CLI entry point
  - **File**: `packages/cli/bin/create-plexica-plugin.js`
  - **Type**: Create new file
  - **Description**: CLI entry: reads plugin name from args (or prompts), validates slug format, calls generator. Options: `--force` (overwrite existing dir), `--template` (select template).
  - **Dependencies**: 6.3.1

- [ ] **6.3.3** `[004-29]` Create project generator
  - **File**: `packages/cli/src/index.ts`
  - **Type**: Create new file
  - **Description**: Main generator: parses template files with Handlebars, creates project directory structure, writes files. Variables: plugin slug, name, version. Generates: manifest.json, vite.config.ts, Dockerfile, package.json (with dev scripts), src/ (index.ts, app.ts, health.ts), ui/ (PluginComponent.tsx), migrations/ (001_create_tables.sql), dev-entry.ts, dev-register.ts, .env.development, tsconfig.dev.json. See Plan §3.6 and §10.7 for file list.
  - **Dependencies**: 6.3.1

- [ ] **6.3.4** `[004-29]` Create Handlebars templates
  - **File**: `packages/cli/templates/`
  - **Type**: Create directory + files
  - **Description**: All template files (.hbs): manifest.json.hbs, vite.config.ts.hbs, Dockerfile.hbs, dev-entry.ts.hbs, dev-register.ts.hbs, .env.development.hbs, package.json.hbs, src/index.ts.hbs, src/app.ts.hbs, src/health.ts.hbs, ui/index.ts.hbs, ui/PluginComponent.tsx.hbs, migrations/001_create_tables.sql.hbs. Each uses Handlebars variables {{slug}}, {{name}}, {{version}}.
  - **Dependencies**: 6.3.3

- [ ] **6.3.5** `[004-29]` Write CLI tests
  - **File**: `packages/cli/__tests__/generator.test.ts`
  - **Type**: Create new file
  - **Description**: Test: CLI generates project with correct structure, validates slug, --force overwrites, packages.dev scripts exist, manifest.json has correct fields. Generation < 5s P95.
  - **Dependencies**: 6.3.4

---

## Phase 7 — CRM Example Plugin (5 days)

> Prerequisites: All previous phases. Validates the full plugin system end-to-end.

- [ ] **7.1** `[004-23]` Create CRM plugin project structure
  - **File**: `examples/plugins/crm/` (entire directory)
  - **Type**: Create directory + all files
  - **Description**: Complete CRM plugin project matching what CLI generates. manifest.json (slug: crm, hosting.type: sidecar, actions: crm:contact:create/read/update/delete, events.subscribes: plexica.workspace.created, declaredTables: crm_contacts, crm_deals). vite.config.ts using @plexica/vite-plugin. Dockerfile. package.json with dev scripts. See Plan §3.5.
  - **Dependencies**: All Phase 1-6

- [ ] **7.2** `[004-24]` Create CRM plugin backend
  - **File**: `examples/plugins/crm/src/`
  - **Type**: Create directory + files
  - **Description**: Fastify backend: `index.ts` (entry, registers routes), `app.ts` (Fastify app setup), `routes/contacts.ts` (CRUD: GET/POST/PUT/DELETE /contacts), `routes/deals.ts` (CRUD: GET/POST/PUT/DELETE /deals), `routes/events.ts` (POST /_plexica/event handler — creates pipeline on workspace.created). `health.ts` (GET /_plexica/health, GET /_plexica/ready). Each file < 200 lines.
  - **Dependencies**: 7.1

- [ ] **7.3** `[004-25]` Create CRM plugin migrations
  - **File**: `examples/plugins/crm/migrations/001_create_tables.sql`
  - **Type**: Create new file
  - **Description**: SQL migration: `crm_contacts` (id UUID PK, workspace_id UUID, name, email, phone, notes, created_at, updated_at), `crm_deals` (id UUID PK, workspace_id UUID, contact_id FK, title, value, stage, created_at, updated_at). Uses DR-17 naming convention: tables must be namespaced with plugin slug prefix.
  - **Dependencies**: 7.1

- [ ] **7.4** `[004-23]` Create CRM plugin frontend
  - **File**: `examples/plugins/crm/ui/`
  - **Type**: Create directory + files
  - **Description**: React MF remote components: `ContactList.tsx` (table with name, email, phone; search/filter), `ContactForm.tsx` (react-hook-form + Zod for create/edit), `DealList.tsx` (sidebar item showing deal count), `index.ts` (exports exposed components). Uses @plexica/ui shared components. WCAG 2.1 AA. Each file < 200 lines.
  - **Dependencies**: 7.1

- [ ] **7.5** `[004-26]` Implement CRM event handler
  - **File**: `examples/plugins/crm/src/routes/events.ts` (extend)
  - **Type**: Modify
  - **Description**: On `plexica.workspace.created` event: creates a default pipeline (crm_deal row with stage = "new") in the new workspace. Uses SDK's `callApi` and `getContext`. Verify at-least-once delivery.
  - **Dependencies**: 7.2

- [ ] **7.6** `[004-27]` Verify cross-workspace isolation
  - **File**: `examples/plugins/crm/src/routes/contacts.ts` (extend)
  - **Type**: Modify
  - **Description**: All contact/deal queries scoped to workspace_id from X-Plexica-Workspace-Id header. No cross-workspace data leakage. Test in E2E: create contacts in workspace A → workspace B returns empty list.
  - **Dependencies**: 7.2

---

## Phase 8 — Marketplace UI (2 days)

> Prerequisites: Phase 1 (API exists), Phase 3 (shell integration).

- [ ] **8.1** `[004-28]` `[P]` Create marketplace page
  - **File**: `apps/web/src/pages/marketplace/MarketplacePage.tsx`
  - **Type**: Create new file
  - **Description**: Main marketplace grid. TanStack Query hook `useMarketplace()` fetches from `GET /api/v1/plugins`. Grid of PluginCard components. Search bar with autocomplete filtering by name/category. Category filter chips: [All] [Sales] [Productivity] [Analytics] [Dev Tools]. Pagination. Empty state: "No plugins available". Loading: 6 skeleton cards. See design-spec §1.1 for wireframe.
  - **Dependencies**: None

- [ ] **8.2** `[004-28]` `[P]` Create PluginCard component
  - **File**: `apps/web/src/pages/marketplace/PluginCard.tsx`
  - **Type**: Create new file
  - **Description**: Card with: plugin icon, name, description (truncated), categories as Badge components, rating stars, install count, Install button. States: default, hover (subtle elevation), disabled (if already installed). Uses @plexica/ui Card, Badge, Button components. See design-spec.
  - **Dependencies**: None

- [ ] **8.3** `[004-28]` `[P]` Create plugin detail sheet
  - **File**: `apps/web/src/pages/marketplace/PluginDetailSheet.tsx`
  - **Type**: Create new file
  - **Description**: Dialog/sheet showing: icon, name, author, version, rating, full description, categories, permissions summary (actions declared), data tables declared, events subscribed, install button. Uses @plexica/ui Dialog component. Per design-spec.
  - **Dependencies**: None

- [ ] **8.4** `[004-28]` `[P]` Create InstallButton with progress
  - **File**: `apps/web/src/pages/marketplace/InstallButton.tsx`
  - **Type**: Create new file
  - **Description**: Install button with states: default (`Install`), installing (progress overlay with step list), installed (`Installed`), failed (error with retry). Progress polls install status endpoint. Steps: validate → pull container → run migrations → start container → create consumer group. Uses @plexica/ui Toast for success/failure notification.
  - **Dependencies**: None

- [ ] **8.5** `[004-28]` Create installed plugins page
  - **File**: `apps/web/src/pages/installed-plugins/InstalledPluginsPage.tsx`
  - **Type**: Create new file
  - **Description**: List of installed plugins with: icon, name, description, version, install date, StatusBadge (Active/Deactivated/Unreachable), action buttons (Activate/Deactivate/Uninstall). TanStack Query: `useInstalledPlugins()`. Loading: skeleton list. Empty: "No plugins installed yet. Browse the Marketplace.". See design-spec §1.2.
  - **Dependencies**: None

- [ ] **8.6** `[004-28]` Create PluginActions component
  - **File**: `apps/web/src/pages/installed-plugins/PluginActions.tsx`
  - **Type**: Create new file
  - **Description**: Action buttons per installed plugin: Activate/Deactivate toggle, Uninstall (destructive). Uses @plexica/ui Button with destructive variant. Confirmation for deactivate/uninstall via Dialog.
  - **Dependencies**: None

- [ ] **8.7** `[004-28]` Create UninstallDialog
  - **File**: `apps/web/src/pages/installed-plugins/UninstallDialog.tsx`
  - **Type**: Create new file
  - **Description**: Warning dialog showing data loss details: table names + estimated record counts. Destructive confirm button. Per Constitution: no window.confirm — use @plexica/ui Dialog with warning variant. Focus on Cancel button (safe default). Per design-spec §1.2.
  - **Dependencies**: None

- [ ] **8.8** `[004-28]` `[P]` Create WorkspaceVisibilityEditor
  - **File**: `apps/web/src/pages/installed-plugins/WorkspaceVisibilityEditor.tsx`
  - **Type**: Create new file
  - **Description**: Tenant default toggle + per-workspace override list. Each workspace: name + toggle switch. Shows override status (override or default). Save button. TanStack Query: `usePluginVisibility(installId)`, `useUpdateVisibility()`. Per design-spec §1.2 and ADR-018.
  - **Dependencies**: None

- [ ] **8.9** `[004-28]` Create PluginPermissionsSection
  - **File**: `apps/web/src/pages/installed-plugins/PluginPermissionsSection.tsx`
  - **Type**: Create new file
  - **Description**: Extends Permission Association Screen (Spec 003, DR-14). Collapsible section per installed plugin showing: plugin name, icon, declared actions with role selector dropdown (admin/member/viewer). Save per-action override. TanStack Query: `usePluginActions(installId)`, `useUpdateActionOverride()`.
  - **Dependencies**: None

- [ ] **8.10** `[004-28]` Add marketplace TanStack Query hooks
  - **File**: `apps/web/src/pages/marketplace/hooks/use-marketplace.ts`
  - **Type**: Create new file
  - **Description**: Hooks: `useMarketplace()` (list plugins with filters/pagination), `useInstalledPlugins()` (list installed), `usePluginVisibility(installId)`, `useUpdateVisibility()`, `usePluginActions(installId)`, `useUpdateActionOverride()`. All use TanStack Query with proper stale times, error handling, loading states.
  - **Dependencies**: 8.1, 8.5

---

## Buffer: Integration + E2E Tests (3 days)

### E2E Tests

- [ ] **E2E-01** `[004-01]` Super admin plugin lifecycle E2E
  - **File**: `apps/web/e2e/plugin-admin-lifecycle.spec.ts`
  - **Type**: Create new file
  - **Description**: Login as super admin → navigate to admin plugin registry → register new plugin → verify appears in list → publish → verify published.

- [ ] **E2E-02** `[004-02]` Manifest validation E2E
  - **File**: `apps/web/e2e/plugin-manifest-validation.spec.ts`
  - **Type**: Create new file
  - **Description**: Register plugin with invalid manifest (missing required fields, conflicting action keys) → verify error messages.

- [ ] **E2E-03** `[004-03]` Plugin install flow E2E
  - **File**: `apps/web/e2e/plugin-install.spec.ts`
  - **Type**: Create new file
  - **Description**: Login as tenant admin → browse marketplace → install plugin → verify progress steps complete → plugin appears in installed list with Active badge → verify tables created in tenant schema.

- [ ] **E2E-04** `[004-04]` Plugin activate/deactivate E2E
  - **File**: `apps/web/e2e/plugin-activate-deactivate.spec.ts`
  - **Type**: Create new file
  - **Description**: Deactivate active plugin → verify badge changes to Deactivated → plugin UI hidden from workspace → reactivate → UI visible again.

- [ ] **E2E-05** `[004-05]` Plugin uninstall E2E
  - **File**: `apps/web/e2e/plugin-uninstall.spec.ts`
  - **Type**: Create new file
  - **Description**: Uninstall plugin with data → verify confirmation dialog shows table names → confirm → verify tables dropped, plugin removed from installed list.

- [ ] **E2E-06** `[004-06]` Workspace visibility E2E
  - **File**: `apps/web/e2e/plugin-workspace-visibility.spec.ts`
  - **Type**: Create new file
  - **Description**: Install plugin → disable for specific workspace → verify plugin UI hidden in that workspace → enable → visible again. Verify tenant default applies to new workspaces.

- [ ] **E2E-07** `[004-08]` Shell MF loading E2E
  - **File**: `apps/web/e2e/plugin-mf-loading.spec.ts`
  - **Type**: Create new file
  - **Description**: Install CRM plugin → navigate to workspace → verify plugin UI renders in workspace panel → verify error boundary shows fallback if remote is unavailable.

- [ ] **E2E-08** `[004-18]` DLQ management E2E
  - **File**: `apps/web/e2e/plugin-dlq.spec.ts`
  - **Type**: Create new file
  - **Description**: Login as super admin → navigate to DLQ management → view failed events → inspect event detail → retry → verify retried status → dismiss → verify dismissed.

- [ ] **E2E-09** `[004-14]` Core event emission E2E
  - **File**: `apps/web/e2e/plugin-events.spec.ts`
  - **Type**: Create new file
  - **Description**: Create workspace → verify `plexica.workspace.created` emitted to Kafka → CRM plugin consumer receives event → pipeline deal created.

- [ ] **E2E-10** `[004-20]` Plugin proxy E2E
  - **File**: `apps/web/e2e/plugin-proxy.spec.ts`
  - **Type**: Create new file
  - **Description**: Call plugin API through proxy `/api/v1/plugins/:installId/proxy/contacts` → verify response contains expected data → verify auth headers present → unauthenticated request returns 401.

- [ ] **E2E-11** `[004-21]` Auth context propagation E2E
  - **File**: `apps/web/e2e/plugin-auth-context.spec.ts`
  - **Type**: Create new file
  - **Description**: Call plugin API through proxy → verify X-Plexica-* headers contain correct tenant ID, user ID, workspace ID, role.

- [ ] **E2E-12** `[004-23]` CRM plugin full workflow E2E
  - **File**: `apps/web/e2e/plugin-crm-workflow.spec.ts`
  - **Type**: Create new file
  - **Description**: Install CRM plugin → open contacts view in workspace → create contact → verify contact persisted → edit contact → delete contact → verify data isolated per workspace (workspace B sees no contacts).

- [ ] **E2E-13** `[004-26]` Plugin custom events E2E
  - **File**: `apps/web/e2e/plugin-custom-events.spec.ts`
  - **Type**: Create new file
  - **Description**: CRM plugin emits `plugin.crm.contact.created` → another plugin receives the event → verify handler called.

- [ ] **E2E-14** `[004-28]` Marketplace UI E2E
  - **File**: `apps/web/e2e/plugin-marketplace.spec.ts`
  - **Type**: Create new file
  - **Description**: Navigate to marketplace → verify plugin cards displayed → search by name → filter by category → click card → detail sheet opens → Install button visible → empty state when no plugins.

- [ ] **E2E-15** `[DM-01]` Dev mode registration E2E
  - **File**: `apps/web/e2e/plugin-dev-mode.spec.ts`
  - **Type**: Create new file
  - **Description**: Start plugin in dev mode → verify registration with core API → verify UI appears in shell → verify proxy calls reach local backend → Ctrl+C → unregistered → cleanup.

### Integration Tests

- [ ] **INT-01** `[004-01]` Registry integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/registry.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test registry CRUD against real DB: create plugin, find by slug, list with filters, version tracking, duplicate slug rejection.

- [ ] **INT-02** `[004-02]` Manifest validation integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/manifest-validator.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test manifest validation with real DB: valid manifest passes, missing fields rejected, duplicate action keys rejected, conflicting slug rejected, semver validation, hosting.type validation.

- [ ] **INT-03** `[004-03]` Install flow integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/lifecycle.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test install flow orchestration with real DB + Docker (sidecar): create installation record, pull image, run migrations, start container, configure DB access, create consumer group, register actions, set visibility, emit event.

- [ ] **INT-04** `[004-20]` Proxy integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/proxy.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test proxy routing: route to correct container, inject auth headers, return 503 for unreachable backend, timeout handling.

- [ ] **INT-05** `[004-22]` Health check integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/health-check.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test circuit breaker: closed → 3 failures → open → 30s → half-open → success → closed. Timing assertions.

- [ ] **INT-06** `[004-14]` Event emission integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/events.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test core event emission with real Kafka: create workspace → event emitted on topic, verify event payload structure, fire-and-forget behavior when Kafka unavailable.

- [ ] **INT-07** `[004-18]` DLQ integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/dlq.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test DLQ flow: 3 retries → Kafka DLQ topic → DB insert → retry from UI → dismiss. Verify DB entries, verify re-publish to original topic.

- [ ] **INT-08** `[004-27]` Cross-workspace isolation integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/isolation.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test cross-workspace data isolation: plugin A creates data in workspace A → workspace B cannot access it → verify 403/404.

- [ ] **INT-09** `[DM-01]` Dev mode registration integration tests
  - **File**: `services/core-api/src/modules/plugin/__tests__/dev-mode.int.test.ts`
  - **Type**: Create new file
  - **Description**: Test dev mode: POST register with valid payload → verify proxy route registered → POST unregister → route removed. Verify 404 in production mode.

### Polish & Quality

- [ ] **PQ-01** `[NFR-14]` WCAG 2.1 AA accessibility audit
  - **File**: `apps/web/e2e/plugin-a11y.spec.ts`
  - **Type**: Create new file
  - **Description**: axe-core audit on all plugin UI screens (marketplace, installed plugins, DLQ management, admin registry). 0 violations target.

- [ ] **PQ-02** Performance baseline measurement
  - **File**: `services/core-api/src/modules/plugin/__tests__/perf.int.test.ts`
  - **Type**: Create new file
  - **Description**: Measure: manifest validation < 50ms P95, proxy overhead < 100ms P95, event delivery < 1s P95, install time < 10s P95. Report results.

- [ ] **PQ-03** Run /forge-review adversarial review
  - **Action**: Run /forge-review on the complete implementation before merge
  - **Description**: Dual-model adversarial review (forge-reviewer + forge-reviewer-peer) across all 7 dimensions. Address all HIGH findings before merge.

- [ ] **PQ-04** Update decision log with Spec 004 implementation decisions
  - **File**: `.forge/knowledge/decision-log.md`
  - **Description**: Document implementation decisions made during Spec 004, including any deviations from plan or spec.

---

## Summary

| Phase | Tasks | Est. Days | Priority |
|-------|-------|-----------|----------|
| Phase 1 — Core Infrastructure | 19 | 5 | Must |
| Phase 2 — Container Lifecycle | 5 | 3 | Must |
| Phase 3 — MF Vite Preset + Shell | 14 | 7 | Must |
| Phase 4 — Kafka Events | 9 | 5 | Must |
| Phase 5 — Proxy + Visibility | 8 | 3 | Must |
| Phase 6 — CLI + SDK + Dev Mode | 10 | 3 | Must |
| Phase 7 — CRM Example Plugin | 6 | 5 | Must |
| Phase 8 — Marketplace UI | 10 | 2 | Must |
| Buffer — E2E + Integration + Polish | 20 | 3 | Must |
| **Total** | **101** | **36** | |

### Critical Path
```
Phase 1 → Phase 2 → Phase 5 → Phase 7
                                 Phase 3 → Phase 7
                                 Phase 4 → Phase 7
                                 Phase 6 → Phase 7
                                 Phase 8 (parallel with 7)
```

Phase 7 (CRM Example) validates all previous phases and cannot be marked complete until all E2E tests pass.
