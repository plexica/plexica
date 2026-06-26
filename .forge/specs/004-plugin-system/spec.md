# Spec: 004 — Plugin System

> Feature specification for the Plugin System phase. Created by `forge-pm` via `/forge-specify`. Clarified via `/forge-clarify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Clarified  |
| Author  | forge-pm   |
| Date    | 2026-06-26 |
| Track   | Feature    |
| Spec ID | 004        |

**Phase**: 3 — Plugin System
**Duration**: 5-6 weeks
**Last Clarified**: 2026-06-26 (via `/forge-clarify` — 13 ambiguities resolved)

---

## 1. Overview

Plexica v2's core value proposition is extensibility via plugins. After Spec 003 (Core Features), the platform has workspaces, teams, and ABAC — but no way for third-party developers to extend it. Without a plugin system, every feature must be built into the core monolith, limiting the platform's flexibility and third-party ecosystem.

Building a plugin system is the most architecturally complex phase: it must support isolated backend runtimes, Module Federation UI integration, Kafka event subscriptions, RBAC extension, and a developer-friendly SDK — all while preserving the tenant isolation guarantees from Specs 001-003.

After this phase, third-party developers can build, install, and run full-featured plugins inside the platform. The CRM example plugin serves as both a reference implementation and a validation that the architecture works end-to-end.

## 2. Problem Statement

After Spec 003 (Core Features), the platform has workspaces, teams, ABAC, and tenant settings — but no way for third-party developers to extend it. Every feature must be built into the core monolith, which limits the platform's flexibility and third-party ecosystem. The plugin system solves this by providing a complete lifecycle (registry, install, activate, deactivate, uninstall), Module Federation UI integration, Kafka-based event system, backend API proxy with container hosting, RBAC extension for plugin actions, and a developer-friendly SDK with CLI scaffolding.

Without the plugin system, the platform cannot fulfill its core mission of being an extensible multi-tenant SaaS platform. This phase is the architectural centerpiece of Plexica v2.

## 3. User Stories

### US-001: Platform Extensibility

**As a** platform operator (super admin),
**I want** to manage a plugin catalog with lifecycle control,
**so that** I can curate which plugins are available to tenants.

**Acceptance Criteria:**

- Given I am a super admin, when I open the plugin catalog, then I see all registered plugins with status (published/unpublished).
- Given a plugin package is uploaded, when I review and publish it, then it appears in all tenant marketplaces.
- Given I unpublish a plugin, when a tenant admin views the marketplace, then the plugin is no longer listed.

### US-002: Plugin Installation & Workspace Use

**As a** tenant admin,
**I want** to install plugins from the marketplace and enable them for my workspaces,
**so that** my team gets the features they need.

**Acceptance Criteria:**

- Given I am a tenant admin, when I install a plugin from the marketplace, then the plugin's tables are created in my tenant schema and it appears in my installed plugins list.
- Given a plugin is installed, when I enable it for a workspace, then workspace members see the plugin's UI in the shell.
- Given I deactivate a plugin, when I view the workspace, then the plugin's UI is hidden.

### US-003: Workspace Data Isolation

**As a** workspace member,
**I want** plugin data to be isolated per workspace,
**so that** I only see data from workspaces I belong to.

**Acceptance Criteria:**

- Given I have access to workspace A but not workspace B, when the CRM plugin is enabled in both, then I can see contacts in workspace A but workspace B contacts return 404.

### US-004: Plugin Developer Onboarding

**As a** third-party developer,
**I want** a CLI tool and SDK to build plugins quickly,
**so that** I can create and test a plugin without deep platform knowledge.

**Acceptance Criteria:**

- Given I run `create-plexica-plugin my-plugin`, when the command completes, then a project with MF preset, manifest, backend template, and Dockerfile is generated.
- Given I build the generated project, when I push the image to a registry and register it, then the plugin installs in the platform.

### US-005: Event-Driven Plugin Logic

**As a** plugin developer,
**I want** my plugin to subscribe to core and custom events,
**so that** I can react to platform actions (e.g., create CRM pipeline when a workspace is created).

**Acceptance Criteria:**

- Given a plugin subscribes to `plexica.workspace.created`, when a workspace is created, then the plugin's event handler is called within 1s.
- Given a plugin emits a custom event, when another plugin subscribes to it, then the event is delivered with at-least-once semantics.

## 4. Functional Requirements

### 3.1 Plugin Core Infrastructure (1.5 weeks)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-01 | Plugin registry (core schema, CRUD API) | Must | US-001 | Super admin sees list of available plugins |
| 004-02 | Manifest validation (Zod schema — full schema per DR-15) | Must | US-004 | Plugin with invalid manifest fails to install |
| 004-03 | Plugin installation for tenant (container pull, migrations, DB tables) | Must | US-002 | Tenant admin installs plugin, plugin tables created in tenant schema, container running |
| 004-04 | Plugin activation/deactivation | Must | US-002 | Deactivated plugin does not appear in interface; data preserved |
| 004-05 | Plugin uninstallation (table cleanup, container stop, consumer group delete) | Must | US-001 | Plugin removed, tables dropped, container stopped, consumer group deleted |
| 004-06 | Plugin workspace visibility (tenant default + per-workspace override) | Must | US-002 | Admin sets tenant default enabled, disables for specific workspace |

### 3.2 Plugin UI — Module Federation (1.5 weeks)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-07 | Vite Plugin Preset (`@plexica/vite-plugin`) | Must | US-004 | Plugin with preset generates MF remote automatically |
| 004-08 | Shell MF host loads plugin remotes (UI from MinIO, API proxied to container) | Must | US-002 | Active plugin shows its UI in the shell |
| 004-09 | Shared dependencies (React, Query, UI lib, i18n) | Must | US-004 | Plugin uses deps from shell, not duplicated |
| 004-10 | React Context propagation (tenant, user, workspace, theme) | Must | US-002 | Plugin accesses context from shell |
| 004-11 | Extension points (sidebar, workspace-panel, dashboard-widget) | Must | US-002 | Plugin declares slot, appears in correct location |
| 004-12 | Error boundary per plugin slot | Must | US-002 | Plugin crashes, shell shows fallback, rest of app works |
| 004-13 | Hot reload in development (UI + backend rapid dev mode) | Must | US-004 | Plugin dev server registers with local shell; backend runs as local process (no container); changes visible live via HMR (UI) and tsx watch (backend). See §10.7 in plan.md |

### 3.3 Plugin Events — Kafka (1 week)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-14 | Automatic core event emission (CRUD on main entities) | Must | US-005 | Create workspace emits `plexica.workspace.created` on Kafka |
| 004-15 | SDK event subscription (`sdk.onEvent()`) for core + plugin events | Must | US-005 | Plugin subscribes to `plexica.workspace.created` and core + plugin custom events |
| 004-16 | Plugin custom events | Must | US-005 | CRM plugin emits `plugin.crm.contact.created`, another plugin receives it |
| 004-17 | Consumer group auto-management (`plugin-{installId}-{tenant_slug}`) | Must | US-005 | Consumer group created/deleted with plugin lifecycle |
| 004-18 | Dead letter queue (Kafka topic + DB table for management UI) | Must | US-001 | Event that fails 3 times goes to DLQ; super admin can view, retry, dismiss via UI |
| 004-19 | Consumer lag monitoring (Prometheus metrics) | Must | US-001 | Metrics exported; lag threshold alert configurable (default 1000) |

### 3.4 Plugin Backend — Proxy & Hosting (0.5 weeks)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-20 | API proxy: `/api/v1/plugins/:installId/*` to plugin container | Must | US-002 | Call to plugin API reaches container backend |
| 004-21 | Auth + tenant context propagated (headers: X-Tenant-Id, X-User-Id, X-User-Role) | Must | US-003 | Plugin backend receives tenant ID, user ID, and role |
| 004-22 | Plugin backend health check (circuit breaker, degraded state UI) | Must | US-002 | Core verifies container is reachable; after 3 failures, marks degraded |

### 3.5 CRM Example Plugin — Real (1 week)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-23 | CRM plugin with MF UI (contact list, form) | Must | US-004 | User installs CRM, opens contacts view in shell |
| 004-24 | CRM plugin backend (CRUD contacts via proxy) | Must | US-004 | User creates contact, contact persisted in DB |
| 004-25 | CRM plugin data (`crm_contacts`, `crm_deals` in tenant schema) | Must | US-003 | Data persistent, survives restart, isolated per workspace |
| 004-26 | CRM plugin events (creates pipeline on `plexica.workspace.created`) | Must | US-005 | New workspace triggers CRM pipeline creation automatically |
| 004-27 | CRM plugin cross-workspace isolation | Must | US-003 | Contacts in workspace A not visible from workspace B |

### 3.6 Marketplace & CLI (0.5 weeks)

| ID | Feature | Priority | Story Ref | E2E Test |
| -- | ------- | -------- | --------- | -------- |
| 004-28 | Marketplace UI (search, categories, rating, install button) | Must | US-002 | Tenant admin searches plugin, sees details, installs |
| 004-29 | CLI `create-plexica-plugin` | Must | US-004 | Command generates complete project with MF preset, manifest, backend template, Dockerfile |
| 004-30 | Consolidated Plugin SDK (1 class) + OpenAPI contract for polyglot backends | Must | US-004 | SDK with `onEvent`, `callApi`, `getContext`, `getDb`; OpenAPI spec published for Rust/Python |

### 4.7 Detailed Requirements

### DR-12: Plugin Action Extension (from Spec 003)

See Spec 004 §DR-12 — Plugin actions use three-part keys `{plugin-slug}:{resource}:{verb}`. Core actions use two-part keys. The ABAC engine dispatches on part count.

### DR-13: Plugin Packaging & Hosting Model

**Package format**: Docker container image. Plugin is distributed as a Docker image hosted in a container registry.

**Manifest declaration** (`manifest.json`):

```json
{
  "hosting": {
    "type": "sidecar" | "kubernetes",
    // If sidecar:
    "image": "registry.example.com/plugin-slug:1.0.0",
    "imagePullSecret": "optional-registry-credentials-secret",
    "resources": {
      "cpu": "0.5",
      "memory": "256Mi"
    },
    "port": 3000,
    "env": [
      { "key": "DATABASE_URL", "valueFrom": "tenant_connection_string" }
    ]
    // If kubernetes:
    "k8s": {
      "image": "registry.example.com/plugin-slug:1.0.0",
      "imagePullSecrets": ["optional-secret-name"],
      "replicas": 1,
      "resources": { "limits": { "cpu": "1", "memory": "512Mi" } },
      "probes": {
        "liveness": { "path": "/health", "port": 3000, "initialDelaySeconds": 10 },
        "readiness": { "path": "/ready", "port": 3000, "initialDelaySeconds": 5 }
      },
      "volumes": [],
      "initContainers": []
    }
  }
}
```

**Consumer group naming**: `plugin-{installId}-{tenant_slug}` where `installId` is the UUID of the plugin installation record in the tenant's scope.

**Additional registry config** (stored in plugin registry metadata):

| Field | Type | Description |
| ----- | ---- | ----------- |
| `registry_url` | string | Full URL of the container registry |
| `image_name` | string | Image name (e.g., `plexica/crm-plugin`) |
| `image_tag` | string | Image tag/version (e.g., `1.0.0`) |
| `image_digest` | string (optional) | Pin to exact digest for immutable deploys |
| `registry_credentials_secret` | string (optional) | Reference to a Kubernetes secret or env var for private registry auth |
| `pull_policy` | `"Always"` \| `"IfNotPresent"` \| `"Never"` | Image pull policy |

**Sidecar vs K8s determination**:

- Local dev and single-node CI: sidecar (managed directly by core via Docker SDK or child_process).
- Production multi-node: Kubernetes pods managed via K8s API.
- The `hosting.type` field in manifest.json determines which strategy is used.

### DR-14: Plugin UI Delivery Model (Hybrid)

Plugin frontend assets are **not** served from the plugin container. Instead:

1. **At build/CI time**: The plugin builder (via the Vite preset) generates the `remoteEntry.js` and chunk files.
2. **At registration time**: The UI assets are uploaded to MinIO (tenant's bucket or a shared plugin-assets bucket) by the super admin or CI pipeline.
3. **At load time**: The shell's MF host fetches `remoteEntry.js` from MinIO as a static asset.
4. **At runtime**: API calls are proxied to the plugin container via `/api/v1/plugins/:installId/*`.

**Benefits**: Fast UI loading (CDN-cacheable static assets), no container dependency for UI rendering, container restarts don't affect UI availability.

**MinIO asset path**: `plugins/{plugin-slug}/{version}/remoteEntry.js`

### DR-15: Manifest.json Full Schema

Each plugin's `manifest.json` must include:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `slug` | string (regex: `/^[a-z][a-z0-9-]{1,62}$/`) | Yes | Unique plugin identifier |
| `name` | string | Yes | Display name |
| `version` | string (semver) | Yes | Plugin version |
| `description` | string | Yes | Short description |
| `author` | string | Yes | Author/organization name |
| `icon` | string | Yes | Icon URL (relative to package) or Lucide icon name |
| `categories` | string[] | Yes | Categories for marketplace filtering |
| `hosting` | object (see DR-13) | Yes | Container hosting configuration |
| `ui` | object | Yes | UI configuration |
| `ui.remoteEntry` | string | Yes | Path to `remoteEntry.js` in the uploaded assets (e.g., `remoteEntry.js`) |
| `ui.extensionPoints` | string[] | Yes | Array of slot identifiers: `sidebar:admin`, `workspace-panel:main`, `dashboard-widget:grid` |
| `events.subscribes` | string[] | Yes | Event patterns this plugin subscribes to (e.g., `["plexica.workspace.*", "plugin.*"]`) |
| `actions` | array (see DR-12) | No | RBAC actions contributed by this plugin |
| `declaredTables` | array | Yes | Database tables this plugin creates |
| `declaredTables[].name` | string | Yes | Table name (prefixed with plugin slug, e.g., `crm_contacts`) |
| `declaredTables[].description` | string | Yes | Purpose of the table |
| `declaredTables[].migrationFile` | string | Yes | Path to the SQL/Prisma migration file within the plugin package |

### DR-16: Plugin Workspace Visibility Model

**Two-level visibility**:

1. **Tenant default**: When a plugin is installed for a tenant, a default visibility setting is applied:
   - Default is `enabled` (all existing workspaces see the plugin).
   - Tenant admin can change the default for new workspaces via Tenant Settings → Plugins.
2. **Per-workspace override**: Workspace admin can override the visibility for their specific workspace:
   - From Workspace Settings → Plugins, toggle on/off.
   - Override persists even if tenant default changes.

**Database model** (in tenant schema):

- `plugin_workspace_visibility`: install_id (FK), workspace_id (FK), is_enabled (boolean), override (boolean — true if workspace admin explicitly set this).

If no row exists in `plugin_workspace_visibility` for a given workspace, the tenant default applies.

### DR-17: Dead Letter Queue Architecture

**Two-tier DLQ**:

1. **Kafka DLQ topic**: `plexica.plugin.dlq` — stores the raw failed event with headers (original topic, partition, offset, failure reason, retry count). Standard Kafka topic with configurable retention (default 30 days).
2. **DB DLQ table**: `dead_letter_queue` in the core schema — stores deserialized events for the management UI. Columns: id (UUID), event_type, payload (JSONB), plugin_id, error_message, retry_count, failed_at, status (pending/retried/dismissed).

**Flow**:
1. Event processing fails → 3 retries with exponential backoff → moves to Kafka DLQ topic.
2. A system consumer reads from Kafka DLQ and inserts into the DB table.
3. Super admin UI (005-11) shows DLQ with retry/dismiss/inspect actions.
4. Retry: re-publishes event to the original topic. Dismiss: marks as dismissed in DB.

### DR-18: Plugin Database Access Model

**Scope restriction**: Plugin database queries are restricted to plugin-declared tables only. The plugin cannot read or write core tables or other plugins' tables.

**Implementation**:

- The `getDb()` method in the SDK returns a Prisma client (or SQL connection) that is scoped to the tenant schema with row-level access filters.
- Plugin migrations create tables in the tenant schema using a namespace convention: `{plugin_slug}_{table_name}` (e.g., `crm_contacts`, `crm_deals`).
- At instantiation, the platform creates PostgreSQL schema-level permissions: the plugin's database user/role is GRANTed access only to tables matching `{plugin_slug}_*` in the tenant schema.
- Cross-plugin data sharing is possible only through Kafka events (not direct DB access).

### DR-19: Plugin Automated Update Flow (Reinstall = Update)

Despite "versioning is out of scope" for the initial sprint, a **reinstall = update** mechanism is supported:

1. Super admin uploads a new package (container image tag + optional UI assets) for an existing plugin slug.
2. The `version` field in the new manifest must be different from the current version.
3. Core validates the new manifest against installed plugin actions (no breaking action key changes allowed — adding keys is fine, removing requires uninstall first).
4. If schema changes are detected (new/modified `declaredTables`):
   - A new migration is applied to tenant schemas where the plugin is installed.
   - If migration fails on any tenant, the update is rolled back for all tenants.
   - Schema-destructive changes (table drops) are rejected; these require uninstall.
5. If only container/UI changes (no schema diff):
   - Container is replaced (new image pulled, old container stopped, new started).
   - UI assets in MinIO are replaced.
   - Kafka consumer group is rebalanced (brief pause, no data loss with at-least-once).
6. Tenant data is preserved across updates.

### DR-20: Plugin SDK & OpenAPI Contract

**TypeScript SDK** (`@plexica/sdk`):

```typescript
class PluginSDK {
  onEvent(pattern: string, handler: (event: Event) => Promise<void>): void;
  callApi(method: string, path: string, body?: unknown): Promise<Response>;
  getContext(): PluginContext; // { tenantId, userId, workspaceId, role }
  getDb(): PrismaClient | DatabaseConnection; // scoped to declared tables only
  emitEvent(type: string, payload: unknown): Promise<void>;
}
```

**OpenAPI contract for polyglot backends (Rust/Python)**:

The platform publishes an OpenAPI 3.1 specification that defines:

1. **Event subscription endpoint** (called by core to deliver events to the plugin backend):
   - `POST /_plexica/event` — body: `{ type, payload, timestamp, correlationId }`
   - Response: `200 OK` (acknowledged), `500` (will be retried)
2. **Context injection**: Headers `X-Plexica-Tenant-Id`, `X-Plexica-User-Id`, `X-Plexica-Workspace-Id`, `X-Plexica-User-Role` on every proxied API call.
3. **Health check**: GET `/_plexica/health` — must return 200.
4. **Database connection**: Core injects `DATABASE_URL` environment variable scoped to the tenant schema with restricted permissions (DR-18).

## 5. Non-Functional Requirements

| ID | Category | Requirement | Target | Measurement |
| -- | -------- | ----------- | ------ | ----------- |
| NFR-01 | Performance | Plugin UI load (MF remote) | < 2s P95 cold, < 500ms P50 warm | Playwright timing, cold = first load no cache, warm = cached |
| NFR-02 | Performance | MF shared deps duplication | Zero | Webpack bundle analyzer check in CI |
| NFR-03 | Performance | Kafka event delivery latency | < 1s P95 | Event envelope timestamp comparison |
| NFR-04 | Performance | Plugin API proxy overhead | < 100ms P95, < 30ms P50 | Direct vs proxied request timing diff |
| NFR-05 | Performance | Plugin install time | < 10s P95 | Install request to active status |
| NFR-06 | Performance | Plugin uninstall time | < 5s P95 | Uninstall request to cleanup complete |
| NFR-07 | Performance | Manifest validation | < 50ms P95 | Zod validation timing, 20 actions + 10 tables |
| NFR-08 | Security | Tenant isolation | Zero leaks | Cross-tenant E2E test |
| NFR-09 | Reliability | Container restart | < 10s container stop to healthy | Health check after restart |
| NFR-10 | Reliability | Circuit breaker recovery | < 30s auto-recovery | Open → half-open → closed transition |
| NFR-11 | Limits | Plugin table count per tenant | < 50 tables total | DB schema limit enforcement |
| NFR-12 | Limits | Plugin backend container resources | As declared in manifest, capped at 2 CPU / 2GB RAM | Admission control in container runtime |
| NFR-13 | Limits | Kafka events per plugin per minute | < 1000 (soft), < 5000 (hard throttle) | Rate limiting in event emission path |
| NFR-14 | A11y | Plugin UI WCAG 2.1 AA | All plugin UI screens | axe-core audit in CI |
| NFR-15 | DX | CLI project generation | < 5s | From invocation to project ready |

## 6. Edge Cases & Error Scenarios

### 6.1 Installation & Migration

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 1 | Plugin container image pull fails (registry auth, network) | Install fails with clear error: "Failed to pull image from registry. Check credentials and network." Plugin not registered. |
| 2 | Plugin backend is unreachable after container starts | Install succeeds (core + DB tables). Plugin marked as `backend_unreachable`. Health check retries every 10s. UI shows degraded state. |
| 3 | Plugin migration fails mid-way (duplicate table name, FK conflict) | Entire migration rolled back (DB transaction). Plugin installation fails with error. `plugin_install_log` stores the failure reason. No partial schema state. |
| 4 | Plugin slug collides with an existing installed plugin | Install rejected with `409 Conflict`. Error message includes the conflicting slug. |
| 5 | Plugin slug collides with a core action key format | Manifest validation rejects: plugin actions must be 3-part, core actions are 2-part. Structural collision impossible by format rule. |
| 6 | Same plugin installed on two tenants simultaneously | No conflict. Each tenant has its own schema with isolated tables. Consumer groups are tenant-scoped (`plugin-{installId}-{tenant_slug}`). |
| 7 | Plugin declares duplicate action keys in manifest | Manifest validation fails with list of duplicate keys. No partial registration. |
| 8 | Plugin install on a tenant that already has it | Rejected with `409 Conflict`. User must uninstall first. |
| 9 | Plugin declares a table but migration file is missing or invalid | Manifest validation fails. List of missing/invalid migration files returned. |

### 6.2 Activation / Deactivation

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 10 | Plugin with no UI (backend-only) is activated | Activation succeeds. No extension point slots registered. UI simply shows no entries in sidebar/panels. |
| 11 | Plugin with no backend (UI-only) is activated | Activation succeeds. Proxy routes are not registered. Actions requiring backend calls return 501. |
| 12 | Plugin deactivated while it has active workspace visibility entries | All workspace visibility entries set to `inactive` (soft-disable). On reactivation, previous visibility restored. |
| 13 | Deactivated plugin still has data tables in tenant schema | Data preserved. Tables not dropped on deactivation — only on uninstall. |
| 14 | Plugin deactivated while Kafka consumer is processing an event | Consumer paused gracefully (commit current offset, stop polling). On reactivation, consumer resumes from last committed offset. |

### 6.3 Module Federation & UI

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 15 | MF remote from MinIO takes > 5s to load | Error boundary triggers fallback skeleton with retry button. Rest of shell remains fully interactive. After 3 consecutive timeouts, slot permanently degraded (user must reload). |
| 16 | MF remote returns 404 (asset not uploaded to MinIO) | Shell shows "Plugin unavailable" fallback. Health check invoked; if container is healthy, retry MinIO fetch every 30s. |
| 17 | Two plugins register the same extension point slot | Both rendered in the slot, ordered by install date (oldest first). If one crashes, the other continues (isolated error boundaries). |
| 18 | Plugin MF bundle has a mismatched React version | MF shared config enforces shell's React version. If plugin bundles own React, shell detects duplicate and uses shell's version. Console warning emitted. |
| 19 | Plugin unmount (navigation away) while async operation in-flight | React Query cancellation via AbortController. No memory leaks or "setState on unmounted component" warnings. |

### 6.4 Kafka Events

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 20 | Kafka broker unavailable during core event emission | 3 retries with exponential backoff. If still failing, event logged to DLQ (Kafka topic + DB). Core operation completes (fire-and-forget with retry). |
| 21 | Plugin consumer fails to process event (handler throws) | 3 retries with exponential backoff. After 3 failures, event moved to DLQ. Consumer continues with next events. |
| 22 | Consumer group in rebalance when new plugin installed | Installation completes (tables + container). Consumer group updated asynchronously after rebalance completes. At-least-once semantics: some events may be delivered twice during rebalance. |
| 23 | High event throughput causes consumer lag | Prometheus metrics exported (004-19). Alert triggered when lag exceeds threshold (default 1000). Plugin developer responsible for scaling consumer. |
| 24 | Plugin emits custom event that no other plugin subscribes to | Event delivered to topic. With zero matching consumers, retained per topic retention policy (default 7 days) then expired. No error raised. |
| 25 | Plugin tries to subscribe to events it didn't declare in manifest | Subscription rejected by core. Only manifest-declared event patterns are allowed. |

### 6.5 Uninstall & Cleanup

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 26 | Uninstall while plugin data exists (e.g., CRM has contacts) | Confirmation dialog warns about data loss showing record counts per table. On confirm: tables dropped, container stopped, consumer group deleted. |
| 27 | Uninstall while Kafka consumer mid-processing | Consumer stopped gracefully (commit current offset). Consumer group deleted. In-flight events consumed but not processed are lost (at-most-once guarantee on uninstall). |
| 28 | Uninstall fails because table drop conflicts with FK constraint | Uninstall rolls back. Error message lists conflicting tables. Should not happen if tables are properly namespaced and declared in manifest. |
| 29 | Re-install of a previously uninstalled plugin | Fresh install: new tables created, new container started, new consumer group created. Previous data is not recovered. |

### 6.6 Security & Access Control

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 30 | User without tenant admin role attempts to install/uninstall | ABAC middleware returns 403. |
| 31 | Plugin workspace visibility toggled for non-existent workspace | API returns 404. |
| 32 | Plugin manifest.json is valid JSON but missing required fields | Zod validation fails with list of missing fields and expected types. |
| 33 | CLI generates project with name conflicting with existing directory | CLI prompts for confirmation before overwriting. With `--force`, overwrites. |
| 34 | Plugin attempts to access DB table not declared in manifest | DB driver returns permission denied. Access is blocked at PostgreSQL role level. |
| 35 | Plugin container attempts to access MinIO bucket of a different tenant | MinIO bucket policy restricts access to tenant's own bucket. Request rejected with 403. |

### 6.7 Update Flow

| # | Scenario | Expected Behavior |
| -- | -------- | ----------------- |
| 36 | Update with same version tag as currently installed | Rejected with `409 Conflict`: "Use a different version tag to update." |
| 37 | Update removes an action key that existing workspaces have overrides for | Rejected: "Cannot remove action keys in an update. Uninstall and reinstall to change the action set." |
| 38 | Update with new action keys | Allowed. New keys registered. Existing workspaces get default_role. No disruption to existing overrides. |
| 39 | Update migration fails on one tenant out of 50 | All tenants rolled back to pre-update state. Update marked as failed. Super admin can retry after fixing the issue. |
| 40 | Update with only container/UI changes (no schema) | Fast path: container replaced, UI assets swapped, consumer group rebalanced. Tenant data untouched. |

## 7. Data Requirements

### 7.1 Core Schema (new tables)

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `plugins` | id (UUID PK), slug (unique), name, description, version, author, icon_url, categories (JSONB), manifest (JSONB — full manifest), registry_url, image_name, image_tag, image_digest (optional), registry_credentials_secret (optional, encrypted), pull_policy, status (draft/published/unpublished), created_by (FK → super_admin), created_at, updated_at | Global plugin registry |
| `plugin_versions` | id (UUID PK), plugin_id (FK → plugins), version (semver), manifest (JSONB — version-specific), image_digest, created_at | Version history for update tracking |
| `dead_letter_queue` | id (UUID PK), event_type, payload (JSONB), plugin_id, error_message (JSONB), retry_count, failed_at, status (pending/retried/dismissed), resolved_at | DLQ entries for super admin management UI |

### 7.2 Tenant Schema (new tables)

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `plugin_installations` | id (UUID PK), plugin_id (FK → core.plugins), tenant_slug, status (installed/active/deactivated/uninstalled), hosting_type (sidecar/kubernetes), container_id (sidecar only), k8s_pod_name (kubernetes only), tenant_default_visibility (enabled/disabled), installed_by, installed_at, updated_at | Tracks plugin installation per tenant |
| `plugin_migration_status` | id (UUID PK), install_id (FK), migration_name, status (pending/applied/failed), applied_at, error_message | Migration tracking per tenant |
| `plugin_workspace_visibility` | id (UUID PK), install_id (FK → plugin_installations), workspace_id (FK), is_enabled (boolean), is_override (boolean — true if workspace admin explicitly set), updated_by, updated_at | Per-workspace visibility |
| `plugin_container_config` | id (UUID PK), install_id (FK → plugin_installations), type (sidecar/kubernetes), image, image_pull_secret (encrypted), resource_limits (JSONB), env_overrides (JSONB), health_status (healthy/degraded/unreachable), last_health_check_at | Container runtime state |

### 7.3 Existing Spec 003 tables extended

- `action_registry`: New `plugin_id` FK referencing `core.plugins` (was previously local to tenant schema). Actions are inserted per tenant during install.
- `workspace_role_action`: No schema change — already supports 3-part `action_key` values.

## 8. API Requirements

The plugin system does not introduce standalone API endpoints. Instead, it extends existing API surfaces:

| Method | Path | Description | Auth |
| ------ | ---- | ----------- | ---- |
| GET | `/api/v1/plugins` | List available plugins (marketplace) | Tenant admin |
| POST | `/api/v1/plugins/:slug/install` | Install plugin for tenant | Tenant admin |
| POST | `/api/v1/plugins/:installId/deactivate` | Deactivate plugin | Tenant admin |
| POST | `/api/v1/plugins/:installId/reactivate` | Reactivate plugin | Tenant admin |
| POST | `/api/v1/plugins/:installId/uninstall` | Uninstall plugin | Tenant admin |
| GET/PUT | `/api/v1/plugins/:installId/visibility` | Workspace visibility settings | Workspace admin |
| ALL | `/api/v1/plugins/:installId/proxy/*` | Proxy to plugin backend | Authenticated user (ABAC enforced by plugin action) |
| GET | `/api/v1/admin/plugins` | Plugin catalog (super admin) | Super admin |
| POST | `/api/v1/admin/plugins/register` | Register new plugin | Super admin |
| POST | `/api/v1/admin/plugins/:slug/publish` | Publish/unpublish plugin | Super admin |
| GET | `/api/v1/admin/plugins/:slug/versions` | Plugin version history | Super admin |
| GET | `/api/v1/admin/system/kafka` | Kafka consumer lag + DLQ status | Super admin |
| GET/POST | `/api/v1/admin/system/dlq` | View/retry/dismiss DLQ entries | Super admin |

Plugin backend endpoints are not defined in this spec. They follow the OpenAPI contract (DR-20) and are specific to each plugin.

## 9. UX/UI Notes

### Marketplace Screen

- Grid layout with plugin cards showing: icon, name, description, categories, rating stars, install count.
- Search bar with autocomplete filtering by name and category.
- Detail modal/sheet showing: full description, version, author, screenshots carousel (future), permissions summary (actions declared).
- "Install" button → confirmation dialog → progress indicator during install (container pull + migrations).
- Empty state: "No plugins available in the marketplace yet. Check back later."

### Installed Plugins Screen

- List of installed plugins with status badge (Active / Deactivated / Unreachable).
- Per-plugin controls: Activate/Deactivate, Workspace Visibility, Uninstall.
- Uninstall triggers confirmation dialog with data loss warning (table names + estimated record counts).
- Plugin with `backend_unreachable` shows degraded state with warning icon and "Retry connection" button.

### Plugin Permissions UI

- Extended from Spec 003 DR-14 Permission Association Screen.
- "Plugin Permissions" subsection appears per installed plugin.
- Collapsible section for each plugin showing: plugin name, icon, declared actions with role selector dropdown.

### Shell Extension Points

| Slot ID | Location | Behavior |
| ------- | -------- | -------- |
| `sidebar:admin` | Left sidebar, below main nav items | Admin-only plugin links |
| `workspace-panel:main` | Main content area of workspace | Primary plugin UI (e.g., CRM contact list) |
| `dashboard-widget:grid` | Dashboard widget grid | Small info widgets |

- Error boundary per slot: fallback component "Plugin unavailable" with retry button.
- Slots with no active plugins are invisible (no empty placeholder).

### Accessibility

- All plugin-contributed UI must meet WCAG 2.1 AA (enforced via axe-core in CI).
- Plugin devs must provide ARIA labels, keyboard navigation, and focus management in their MF components.
- Shell error boundaries include focus management (focus moves to error fallback on crash).
- Per Constitution: no `window.confirm()` — all confirmation dialogs use the Dialog component.

### Design System Integration

- Plugins consume the `@plexica/ui` design system via shared MF dependencies.
- Plugin UI automatically inherits: Inter font, brand colors (via CSS custom properties), dark mode, and spacing scale.
- Plugins must not define their own global CSS or override shell styles.

## 10. Acceptance Criteria (Given/When/Then)

### AC-01: Plugin Lifecycle

**Given** a super admin is logged in,
**When** they register a plugin with a valid manifest and container image,
**Then** the plugin appears in the registry with status "draft".

**Given** a registered plugin with status "published",
**When** a tenant admin installs it,
**Then** the plugin's tables are created in the tenant schema, the container starts, the consumer group is created, and the plugin appears enabled for all workspaces.

**Given** an installed plugin,
**When** a tenant admin deactivates it,
**Then** the plugin's UI is hidden, the container remains running, data tables are preserved, and events accumulate until reactivation.

**Given** an installed plugin,
**When** a tenant admin uninstalls it after confirming data loss,
**Then** all plugin tables are dropped, the container is stopped, the consumer group is deleted, and the plugin no longer appears in the tenant's installed list.

### AC-02: Plugin Action Authorization

**Given** a plugin is installed with action `crm:contact:create` and `default_role = "member"`,
**When** a user with the Viewer role in that workspace attempts to perform the action,
**Then** the API returns 403 Forbidden and the decision is logged to `abac_decision_log`.

**Given** a workspace admin overrides `crm:contact:create` to require `"admin"`,
**When** a user with the Member role attempts the same action,
**Then** the API returns 403, reflecting the workspace-specific override.

**Given** the plugin is uninstalled from the tenant,
**When** any request references the plugin's action keys,
**Then** the ABAC engine returns 403 (action unknown / plugin not installed), and all `action_registry` and `workspace_role_action` entries are gone.

### AC-03: Plugin Workspace Visibility

**Given** a plugin is installed with tenant default visibility = enabled,
**When** a workspace admin opens Workspace Settings → Plugins,
**Then** the plugin is shown as enabled, and the admin can toggle it off for their workspace only.

**Given** a plugin is disabled for a workspace,
**When** a member of that workspace loads the shell,
**Then** the plugin's UI extension points are not rendered.

**Given** a plugin is disabled for a workspace via per-workspace override,
**When** the tenant admin changes the default to disabled,
**Then** the per-workspace override is preserved (does not reset to default).

### AC-04: CRM Example End-to-End

**Given** a CRM plugin installed and enabled for a workspace,
**When** a workspace member navigates to the workspace,
**Then** a "Contacts" entry appears in the workspace panel.

**Given** the workspace member clicks "Add Contact",
**When** they fill in name, email, and phone and submit,
**Then** the contact is created via the proxy, persisted in `crm_contacts`, and appears in the contact list.

**Given** a new workspace is created,
**When** the CRM plugin has subscribed to `plexica.workspace.created`,
**Then** a CRM pipeline is automatically created for the new workspace (verified within 2s of workspace creation).

**Given** contacts exist in workspace A,
**When** a user with access only to workspace B opens the CRM,
**Then** no contacts are visible (workspace B has its own independent contact set).

### AC-05: Marketplace & CLI

**Given** a tenant admin opens the marketplace,
**When** they search for a plugin by name or category,
**Then** matching published plugins are displayed with name, description, icon, rating, and install button.

**Given** a developer runs `create-plexica-plugin my-crm`,
**When** the command completes,
**Then** a project directory `my-crm` exists with: `manifest.json`, `vite.config.ts` (with MF preset), `src/` (backend), `ui/` (frontend), `Dockerfile`, and `migrations/`.

**Given** the generated project is built and the Docker image is pushed,
**When** the super admin registers it with the image reference,
**Then** the plugin can be installed and renders UI in the shell.

### AC-06: Dead Letter Queue

**Given** an event handler fails 3 times,
**When** the event is moved to the DLQ,
**Then** the event appears in both the Kafka DLQ topic and the `dead_letter_queue` DB table.

**Given** a failed event is in the DLQ,
**When** a super admin clicks "Retry",
**Then** the event is re-published to the original topic.

**Given** a failed event is in the DLQ,
**When** a super admin clicks "Dismiss",
**Then** the event is marked as dismissed and ignored.

### AC-07: Database Isolation

**Given** a plugin declares `crm_contacts` and `crm_deals` in its manifest,
**When** the plugin backend calls `getDb()`,
**Then** it can read/write `crm_contacts` and `crm_deals` only; access to core tables or other plugin tables returns permission denied.

### AC-08: Plugin Automated Update

**Given** a plugin is installed at version 1.0.0,
**When** a super admin registers version 1.1.0 with the same slug and updated container image,
**Then** the container is replaced, UI assets updated, data preserved, and plugin still works at version 1.1.0.

**Given** version 1.1.0 introduces a new table `crm_reports`,
**When** the update is applied,
**Then** the migration runs on all tenant schemas where the plugin is installed.

**Given** version 1.1.0 removes the `crm:deal:close` action key,
**When** the update is attempted,
**Then** it is rejected with: "Cannot remove action keys in an update."

## 11. Out of Scope

| Item | Rationale |
| ---- | --------- |
| **Plugin versioning / semver upgrades with data migration** | A single version per install. Update flow (DR-19) handles bugfix/UI changes without data loss. Full version upgrade path with rollback is deferred. |
| **Plugin monetization / billing** | No payment integration, subscription tiers, or usage metering. Marketplace lists plugins as free. |
| **Plugin hotfix mechanism** | The update flow (DR-19) covers hotfixes. No in-place hotpatch capability. |
| **Multi-version side-by-side** | A single version of each plugin per tenant. No parallel versions. |
| **Plugin-specific audit trail** | Core audit log covers plugin actions with `plugin:{slug}:{action}` prefix. No separate plugin audit UI. |
| **Plugin backup / restore** | No export/import of plugin data independently of tenant. Tenant-level backup covers plugin data. |
| **Plugin-specific rate limiting** | Rate limiting at core API proxy level (global). Per-plugin rate limits not implemented. |
| **Plugin CORS configuration** | Plugin backends same-origin or configured via proxy. No per-plugin CORS policy. |
| **Plugin staging environment** | No isolated "test mode" before production activation. |
| **Plugin analytics / usage stats** | No per-plugin usage dashboards. Core observability covers system-level metrics only. |
| **Private / whitelabel plugin registry** | Registry is global (super admin managed). No tenant-specific catalog filtering beyond workspace visibility. |
| **Plugin deep linking / URL routing** | Plugins use shell's routing; no custom URL patterns or parameter forwarding to plugin routes. |
| **Non-Container-based plugins** | All plugins must be packaged as Docker containers. No Lambda/function-based plugin runtime. |
| **Plugin-initiated network access beyond proxy** | Plugin backend can only be reached via the core proxy. No direct external exposure. |

## 12. Open Questions

All ambiguities resolved during `/forge-clarify` session on 2026-06-26.

**Resolved (13 items):**
1. Plugin package format → Docker container image
2. Backend hosting → Sidecar (dev) + Kubernetes (prod), `hosting.type` in manifest
3. Plugin submission → Container registry reference (registry_url, image, tag, credentials)
4. UI delivery → Hybrid: MinIO for static assets, container for API
5. DB access scope → Restricted to plugin-declared tables only
6. NFR measurement → Both P50 warm and P95 cold
7. Manifest schema → Full (name, version, description, actions, hosting, UI entry, events, permissions, author, icon, categories, declaredTables)
8. Workspace visibility → Tenant default + per-workspace override
9. DLQ implementation → Kafka topic + DB table for management UI
10. Plugin updates → Reinstall = update flow (automated, non-destructive)
11. Event subscription scope → Core events + plugin events (full mesh)
12. Spec sections → Add Problem Statement, User Stories, Data Requirements, Constitution Compliance
13. Plugin SDK → TypeScript SDK + OpenAPI contract for polyglot backends

## 13. Implementation Scope

> All paths are relative to the project root.

### New Components

| Component Type | Path | Description |
| -------------- | ---- | ----------- |
| Plugin registry service | `services/core-api/src/modules/plugin/registry.ts` | CRUD for plugin catalog, manifest validation |
| Plugin lifecycle service | `services/core-api/src/modules/plugin/lifecycle.ts` | Install, activate, deactivate, uninstall |
| Plugin container manager | `services/core-api/src/modules/plugin/container-manager.ts` | Sidecar (Docker SDK) / K8s pod management |
| Plugin proxy route | `services/core-api/src/modules/plugin/proxy.ts` | Fastify proxy to plugin backend containers |
| Plugin DB scoping | `services/core-api/src/modules/plugin/db-scope.ts` | Restricted `getDb()` with table-level permissions |
| Marketplace API | `services/core-api/src/modules/plugin/marketplace.ts` | Search, categories, install flow |
| Super admin DLQ API | `services/core-api/src/modules/plugin/dlq.ts` | View, retry, dismiss DLQ entries |
| Core event emitter | `services/core-api/src/events/emitter.ts` | Automatic event emission on CRUD operations |
| Plugin Vite Preset | `packages/vite-plugin/src/index.ts` | `@plexica/vite-plugin` — MF preset |
| Plugin SDK | `packages/sdk/src/index.ts` | `@plexica/sdk` — single class with onEvent, callApi, getContext, getDb |
| OpenAPI contract | `packages/sdk/openapi.yaml` | OpenAPI 3.1 spec for polyglot plugin backends |
| CLI tool | `packages/cli/` | `create-plexica-plugin` — project scaffolding |
| CRM example plugin | `examples/plugins/crm/` | Complete reference implementation |
| Kafka consumer manager | `services/core-api/src/modules/plugin/consumer-manager.ts` | Auto-create/delete consumer groups |
| DLQ consumer | `services/core-api/src/modules/plugin/dlq-consumer.ts` | Kafka DLQ → DB table sync |
| Visibility service | `services/core-api/src/modules/plugin/visibility.ts` | Tenant default + workspace override resolution |

### Modified Components

| Path | Modification | Description |
| ---- | ------------ | ----------- |
| `services/core-api/src/modules/auth/middleware.ts` | Enhancement | Plugin context propagation (X-Tenant-Id, X-User-Id headers) |
| `services/core-api/prisma/schema.prisma` | Enhancement | Add core schema tables (plugins, plugin_versions, dead_letter_queue) |
| `services/core-api/src/modules/workspace/routes.ts` | Enhancement | Add plugin visibility endpoints to workspace settings routes |

### Documentation Updates

| Path | Section | Update Description |
| ---- | ------- | ----------------- |
| `docs/01-SPECIFICHE.md` | §6 Plugin System | Update with container-based hosting model |
| `docs/02-ARCHITETTURA.md` | §Plugin Architecture | Add sidecar/K8s hosting, MinIO UI delivery, DLQ architecture |
| `docs/PLUGIN-DEVELOPMENT.md` | All | New developer guide: SDK, CLI, manifest, OpenAPI contract |

## 14. Risks

| ID | Risk | Impact | Likelihood | Mitigation |
| -- | ---- | ------ | ---------- | ---------- |
| R-01 | Module Federation production cache busting for `remoteEntry.js` | HIGH | MEDIUM | Content-hash filenames, cache headers with `no-cache` for entry point, versioned MinIO paths |
| R-02 | Kafka consumer rebalancing during plugin install/uninstall | MEDIUM | MEDIUM | Graceful shutdown with commit-before-close, configurable rebalance timeout |
| R-03 | Plugin migration failures blocking tenant schema | HIGH | LOW | Wrap migrations in transaction, rollback on failure, store migration status per tenant |
| R-04 | MF version compatibility between shell and plugins | HIGH | MEDIUM | Strict version ranges in MF config, version negotiation at load time, CI check |
| R-05 | Plugin backend unavailability | MEDIUM | MEDIUM | Health check with circuit breaker, graceful degradation in UI, auto-retry |
| R-06 | Kafka partition exhaustion with many plugins | MEDIUM | LOW | Auto-scaling consumer groups, partition count per topic based on plugin count |
| R-07 | Container image pull takes too long on install | MEDIUM | MEDIUM | Image caching on node, pull-through registry cache, layer optimization guidelines in CLI |
| R-08 | Plugin DB permission misconfiguration allowing cross-plugin access | HIGH | LOW | PostgreSQL role-based permissions at schema level, enforced in migration utility, E2E isolation test |
| R-09 | DLQ DB table grows unbounded | LOW | MEDIUM | TTL-based cleanup (30 days), pagination in management UI |
| R-10 | Registry credential secret exposure | HIGH | LOW | Encrypt at rest, reference via Kubernetes secrets / environment variables, audit access |

## 15. Constitution Compliance

| Article | Status | Notes |
| ------- | ------ | ----- |
| Rule 1: E2E Tests | COMPLIANT | All 30 features have defined E2E tests. Each story has Given/When/Then acceptance criteria. CRM plugin end-to-end test covers the full lifecycle. |
| Rule 2: Green CI | COMPLIANT | All tests must pass before merge. No exceptions. |
| Rule 3: One Pattern/Type | COMPLIANT | Module Federation (single MF pattern), TanStack Query (single data fetching), react-hook-form + Zod (single form pattern), Zustand (single auth store). Plugin SDK enforces single API pattern. |
| Rule 4: 200-line Limit | COMPLIANT | All implementation files will be decomposed. No file exceeds 200 lines. |
| Rule 5: ADR for Arch Decisions | COMPLIANT | Plugin architecture decisions covered by ADR-005 (Module Federation), ADR-004 (Kafka Event Bus), ADR-006 (Plugin Tables in Tenant Schema). New DR-13 (Container Hosting) documented in ADR-013. |
| Rule 6: English Commits | COMPLIANT | Noted for implementation phase. |
| Technology Stack | COMPLIANT | All prescribed technologies used: Fastify, Kafka/Redpanda, React, Vite, Module Federation, MinIO, PostgreSQL. Docker containers are the plugin packaging format (consistent with infrastructure). |
| Architecture | COMPLIANT | Schema-per-tenant (plugin tables in tenant schema), Keycloak multi-realm (tenant auth), Kafka event bus (plugin events), Module Federation (plugin UI). ABAC extended for plugin actions. All confirmed patterns. |
| Security §1 (Tenant Isolation) | COMPLIANT | Plugin data in tenant schema. Cross-tenant E2E test verifies isolation. |
| Security §2 (Authentication) | COMPLIANT | All plugin API endpoints require auth. Tenant context propagated as headers. |
| Security §3 (SQL Injection) | COMPLIANT | Prisma migrations for plugin tables. Parameterized queries via SDK `getDb()`. |
| Security §4 (Input Validation) | COMPLIANT | Manifest validated via Zod schema. All plugin API input validated by proxy. |
| Security §5 (Secrets) | COMPLIANT | Registry credentials stored encrypted. No secrets in plugin code. |
| Security §6 (PII) | COMPLIANT | No PII in events, DLQ entries, or audit logs. Plugin developers responsible for their own tables. |
| Quality Standards | COMPLIANT | NFRs have measurable targets with defined methodologies. WCAG 2.1 AA for plugin UI. E2E test coverage for all critical flows. |

**Action Required**: ADR recommended for DR-13 (Container Hosting Model) — this adds Docker container orchestration to the architecture, which is an infrastructure change per Constitution Rule 5. Create ADR before implementing container lifecycle management.

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec 002 — Foundations | `.forge/specs/002-foundations/spec.md` |
| Spec 003 — Core Features | `.forge/specs/003-core-features/spec.md` |
| Spec 005 — Super Admin | `.forge/specs/005-super-admin/spec.md` |
| Constitution | `.forge/constitution.md` |
| Decision Log | `.forge/knowledge/decision-log.md` |
| ADRs | `.forge/knowledge/adr/` (ADR-004, ADR-005, ADR-006, ADR-013—ADR-020) |
| Architecture | `docs/02-ARCHITETTURA.md` §Plugin Architecture |
| Original Spec | `docs/01-SPECIFICHE.md` §6 Plugin System |

---

## Testing Strategy

### E2E Tests (Playwright)

| Test | Features Covered | Critical |
| ---- | ---------------- | -------- |
| Plugin lifecycle (install → activate → deactivate → uninstall) | 004-01, 004-03, 004-04, 004-05 | Yes |
| CRM end-to-end (install → UI render → CRUD → events → isolation) | 004-23, 004-24, 004-25, 004-26, 004-27 | Yes |
| Plugin action authorization (permissions matrix) | 004-02, DR-12, AC-02 | Yes |
| Workspace visibility (tenant default + per-workspace override) | 004-06, DR-16 | Yes |
| Marketplace search and install | 004-28 | Yes |
| Dead letter queue (failed event → DLQ → retry → dismiss) | 004-18, DR-17 | No |
| CLI project generation | 004-29 | No |
| Plugin automated update (reinstall = update) | DR-19 | No |
| Cross-tenant isolation (same plugin, two tenants) | NFR-08 | Yes |
| MF error boundary (plugin crash isolation) | 004-12 | Yes |

### Integration Tests (Vitest)

| Test | Scope |
| ---- | ----- |
| Manifest validation (valid/invalid manifests) | Zod schema, 30+ test cases |
| Proxy routing and header propagation | Request/response assertions |
| Kafka event emission and subscription | Produce → consume → verify |
| ABAC engine for 3-part action keys | All role combos for plugin actions |
| Database isolation (scoped getDb) | Cross-table access denial |

### Unit Tests (Vitest)

- SDK method contracts (onEvent, callApi, getContext, getDb)
- Consumer group naming logic
- Manifest → action_registry mapping
- DLQ entry creation and status transitions
- Visibility resolution (tenant default + workspace override priority)
