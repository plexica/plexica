# Plan 004: Plugin System

> Implementation plan for Spec 004 — Plugin System (5-6 weeks, 30 features).
> Created by `forge-architect` for the `/forge-plan` phase.
> Base branch: `feat/004-plugin-system`

| Field        | Value                               |
| ------------ | ----------------------------------- |
| Spec         | 004 — Plugin System                 |
| Status       | Planned                             |
| Author       | forge-architect                     |
| Date         | 2026-06-26                          |
| Phases       | 8 (listed below)                    |
| Est. Total   | 5-6 weeks (25-30 working days)      |

---

## 1. Architecture Overview

### 1.1 End-to-End Data Flow

```
  ┌────────────────────────────────────────────────────────────────────┐
  │                       PLUGIN ECOSYSTEM                             │
  │                                                                    │
  │  SUPER ADMIN               PLUGIN DEV              TENANT ADMIN    │
  │    │                           │                       │           │
  │    ▼                           ▼                       ▼           │
  │  Registry UI    create-plexica-plugin CLI          Marketplace      │
  │  (apps/admin)      (packages/cli)                 (apps/web)       │
  │    │                           │                       │           │
  │    │                    ┌──────┴──────┐                │           │
  │    │                    │  Plugin Pkg  │               │           │
  │    │                    │  manifest.json│              │           │
  │    │                    │  Dockerfile   │             │           │
  │    │                    │  remoteEntry.js            │           │
  │    │                    │  migrations/    │           │           │
  │    │                    └──────┬──────┘              │           │
  │    │                           │                     │           │
  │    ▼                           ▼                     ▼           │
  │  ┌────────────────────────────────────────────────────────┐      │
  │  │              CORE API (Fastify)                        │      │
  │  │                                                        │      │
  │  │  ┌──────────────────┐   ┌─────────────────────────┐    │      │
  │  │  │ Plugin Module    │   │ Kafka Events Module     │    │      │
  │  │  │                  │   │                         │    │      │
  │  │  │ Registry Service  │   │ Event Emitter          │    │      │
  │  │  │ Manifest Val.    │   │ Consumer Manager       │    │      │
  │  │  │ Lifecycle Service│   │ DLQ Consumer           │    │      │
  │  │  │ Container Mgr    │   │ Lag Monitoring         │    │      │
  │  │  │ Migration Runner │   │                         │    │      │
  │  │  │ Proxy Service     │   └─────────────────────────┘    │      │
  │  │  │ Health Check     │                                   │      │
  │  │  │ Visibility Srv   │   ┌─────────────────────────┐    │      │
  │  │  └──────────────────┘   │ Events (lib)            │    │      │
  │  │                         │ KafkaJS producer        │    │      │
  │  │                         │ Topic definitions       │    │      │
  │  │                         └─────────────────────────┘    │      │
  │  └────────────────────────────────────────────────────────┘      │
  │                    │              │              │                │
  │      ┌─────────────┘              │              └──────────┐    │
  │      ▼                            ▼                        ▼    │
  │  ┌────────┐               ┌────────────┐           ┌─────────┐  │
  │  │MinIO   │               │PostgreSQL  │           │Redpanda │  │
  │  │plugins/│               │core +      │           │topics   │  │
  │  │{slug}/ │               │tenant_N    │           │         │  │
  │  │v{x}/   │               │            │           │DLQ      │  │
  │  └────────┘               └────────────┘           └─────────┘  │
  │       │                        │                       │        │
  │       │                        ▼                       │        │
  │       │               ┌──────────────────┐             │        │
  │       │               │ Plugin Backend   │◄────────────┘        │
  │       │               │ (Docker Sidecar  │  Kafka consumer      │
  │       │               │  or K8s Pod)     │                      │
  │       │               │                  │                      │
  │  UI loading            │ CRUD via proxy   │  Event handlers      │
  │  (remoteEntry.js)      └──────────────────┘                      │
  └──────────────────────────────────────────────────────────────────┘
```

### 1.2 System Context & Boundaries

| Layer              | In Scope (Spec 004)                                         | Out of Scope                         |
| ------------------ | ------------------------------------------------------------ | ------------------------------------ |
| **Core Registry**  | Plugin CRUD, manifest validation, version tracking           | Monetization, billing                |
| **Lifecycle**      | Install, activate, deactivate, uninstall per tenant          | Multi-version side-by-side           |
| **Container**      | Docker sidecar (dev), K8s API (prod), health check           | Lambda/function runtimes             |
| **UI Integration** | MF shell loads remoteEntry.js from MinIO                     | URL routing, deep linking            |
| **Events**         | Core event emission, plugin subscriptions, DLQ, lag metrics  | Per-plugin rate limiting             |
| **SDK**            | TypeScript SDK + OpenAPI contract                            | Python/Rust SDKs (deferred to DD-003)|
| **CLI**            | `create-plexica-plugin`, generator templates                 | CI/CD integration                    |
| **Marketplace**    | Search, categories, install UI                               | Private registries, ratings/reviews  |

### 1.3 Trust Boundaries & Security Model

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  EXTERNAL (untrusted)                                             │
  │  - Browser requests to proxy                                     │
  │  - Plugin backend HTTP responses (validated for format)           │
  │  - Plugin MF remote bundles (sandboxed via error boundaries)      │
  └──────────────┬───────────────────────────────────────────────────┘
                 │
  ┌──────────────▼───────────────────────────────────────────────────┐
  │  CORE API GATEWAY (trust boundary)                               │
  │  - JWT validation (Keycloak JWKS)                                │
  │  - Tenant context resolution + realm match (H-2)                 │
  │  - ABAC evaluation for plugin actions                            │
  │  - Input validation (Zod) on all plugin endpoints                │
  │  - Proxy: injects auth headers, validates responses              │
  │  - Migration execution (trusted, sandboxed SQL)                  │
  └──────────────┬───────────────────────────────────────────────────┘
                 │
  ┌──────────────▼───────────────────────────────────────────────────┐
  │  INTERNAL (trusted)                                               │
  │  - PostgreSQL schema-per-tenant                                  │
  │  - Redpanda/Kafka internal                                       │
  │  - Redis cache (session, ABAC, JWKS)                             │
  │  - MinIO (plugin static assets)                                  │
  │  - Plugin backends (receive only validated, auth-scoped data)    │
  └──────────────────────────────────────────────────────────────────┘
```

**Plugin backends are untrusted**: They never receive DB credentials. All DB access
goes through core-proxied API calls. Plugin backends get context via HTTP headers
(`X-Plexica-Tenant-Id`, `X-Plexica-User-Id`, `X-Plexica-Workspace-Id`,
`X-Plexica-User-Role`) on every proxied request.

**Plugin MF bundles are semi-trusted**: Run in same DOM as shell, but isolated
by React error boundaries per slot. Shared deps version-locked. Shell's React
instance enforced via MF shared config.

---

## 2. Implementation Phases

| Phase | Area                          | Features                                                | Depends On                | Est. Days |
| ----- | ----------------------------- | ------------------------------------------------------- | ------------------------- | --------- |
| 1     | Core Infrastructure           | 004-01, 004-02, 004-03 (registry + manifest + install)  | — (Spec 002/003 infras.)  | 5         |
| 2     | Container Lifecycle           | 004-20, 004-22 (proxy + health check)                   | Phase 1                  | 3         |
| 3     | MF Vite Preset + Shell        | 004-07, 004-08, 004-09, 004-10, 004-11, 004-12, 004-13 | —                        | 7         |
| 4     | Kafka Events                  | 004-14, 004-15, 004-16, 004-17, 004-18, 004-19         | Phase 1                  | 5         |
| 5     | Proxy + Visibility            | 004-04, 004-05, 004-06, 004-21                          | Phase 2, Phase 4         | 3         |
| 6     | CLI + SDK                     | 004-29, 004-30                                          | Phase 3, Phase 4         | 3         |
| 7     | CRM Example Plugin            | 004-23, 004-24, 004-25, 004-26, 004-27                  | All previous phases      | 5         |
| 8     | Marketplace UI                | 004-28                                                  | Phase 1, Phase 3         | 2         |
|       | **Buffer / Integration**      | E2E tests, integration testing, polish                  | All                     | 3         |
|       | **Total**                     | 30 features                                             | —                         | **36**    |

### Phase Dependency Graph

```
Phase 1 ──► Phase 2 ──► Phase 5 ──► Phase 7
   │                       ▲             │
   │                       │             │
   └──► Phase 4 ───────────┘             │
        │                                │
        └────► Phase 6 ──────────────────┘
                           
Phase 3 ──────────────────────────────► Phase 7
   │                                      │
   │                                      │
   └──► Phase 8                           │
```

---

## 3. Module Architecture

### 3.1 Plugin Core Infrastructure (Phase 1)

**Backend Module**: `services/core-api/src/modules/plugin/`

```
services/core-api/src/modules/plugin/
├── index.ts                          # Fastify plugin: registers routes, decorators
├── errors.ts                         # Plugin-specific AppError subclasses
├── schema/
│   ├── manifest.ts                   # Zod schema for full manifest (DR-15)
│   ├── api.ts                        # Zod schemas for all plugin API endpoints
│   └── migrations.ts                 # Zod schema for migration file validation
├── services/
│   ├── registry.service.ts           # CRUD for core.plugins + core.plugin_versions
│   ├── manifest-validator.service.ts # Full manifest validation (004-02)
│   └── lifecycle.service.ts          # Install flow orchestrator (004-03)
├── routes/
│   ├── admin-catalog.routes.ts       # GET/POST /api/v1/admin/plugins
│   ├── admin-publish.routes.ts       # POST /api/v1/admin/plugins/:slug/publish
│   └── admin-versions.routes.ts      # GET /api/v1/admin/plugins/:slug/versions
└── lib/
    └── slug-prefix.ts                # Plugin table name construction helpers
```

**New files created**: ~12 files (each < 200 lines)
**Key logic**:

- `registry.service.ts`: Create/read/list plugins. On create, validates manifest
  via `manifest-validator.service.ts`. Stores full manifest in `plugins.manifest` (JSONB).
- `manifest-validator.service.ts`: Implements DR-15 schema. Validates:
  - Required fields present
  - Slug matches `/^[a-z][a-z0-9-]{1,62}$/`
  - Actions use 3-part keys (prevents core key collision per EC-05)
  - `declaredTables` have valid name, description, migrationFile
  - `hosting.type` is `sidecar` or `kubernetes`
- `lifecycle.service.ts` (004-03 skeleton): Orchestrates the install flow but
  container management, migrations, and consumer group creation are delegated
  to their respective services (built in Phases 2, 4).

### 3.2 Module Federation & Vite Preset (Phase 3)

**Package**: `packages/vite-plugin/`

```
packages/vite-plugin/
├── package.json                     # @plexica/vite-plugin
├── src/
│   ├── index.ts                     # Main Vite plugin entry point
│   ├── mf-config-generator.ts       # Reads manifest.json → MF config
│   ├── shared-deps.ts               # Shared dependency map (React, Query, UI, i18n)
│   ├── dev-server-registration.ts   # Hot reload registration with shell
│   └── types.ts                     # Plugin manifest types
├── __tests__/
│   ├── mf-config-generator.test.ts
│   └── shared-deps.test.ts
└── README.md
```

**Shell Integration**: `apps/web/src/`

```
apps/web/src/
├── mf-host/
│   ├── index.tsx                    # MF host init, remote loading
│   ├── plugin-loader.tsx            # Dynamic remote loading from MinIO
│   ├── shared-deps.ts               # Shared dependency config for shell
│   └── types.ts                     # Remote component types
├── components/plugins/
│   ├── extension-slots/
│   │   ├── sidebar-slot.tsx         # Renders plugins at sidebar:admin
│   │   ├── workspace-panel-slot.tsx # Renders plugins at workspace-panel:main
│   │   └── dashboard-widget-slot.tsx# Renders plugins at dashboard-widget:grid
│   ├── error-boundary.tsx           # Per-slot error boundary (004-12)
│   ├── plugin-unavailable.tsx       # Fallback UI for failed plugins
│   └── plugin-degraded.tsx          # Degraded state indicator
└── hooks/
    ├── use-plugin-context.ts        # Access tenant/user/workspace context
    └── use-plugin-visibility.ts     # Determine if plugin is visible in current workspace
```

**Key Architecture**:

- The Vite preset (`@plexica/vite-plugin`) reads the plugin's `manifest.json`
  and auto-generates the Module Federation configuration using
  `@originjs/vite-plugin-federation`. Plugin developers never write MF config.
- Plugin UI assets (including `remoteEntry.js`) are uploaded to MinIO at
  `plugins/{slug}/{version}/` during CI/registration.
- The shell's MF host fetches `remoteEntry.js` from MinIO via the core API
  (which signs URLs). The shell does NOT connect directly to MinIO.
- Extension points are rendered lazily. Each slot has its own ErrorBoundary.
- Context propagation: Shell provides a React context with `{ tenantId, userId,
  workspaceId, role, theme }` to all loaded plugin remotes via MF shared
  `PluginContext` module.

**Shared dependencies** (loaded once by shell, shared with all plugins):

```typescript
// packages/vite-plugin/src/shared-deps.ts
const sharedDependencies = {
  react: { singleton: true, requiredVersion: '^19.0.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
  '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
  '@plexica/ui': { singleton: true, requiredVersion: '^1.0.0' },
  '@plexica/i18n': { singleton: true, requiredVersion: '^1.0.0' },
  '@plexica/sdk': { singleton: true, requiredVersion: '^1.0.0' },
};
```

**Error boundary flow per slot**:

```
Plugin crashes → ErrorBoundary catches → logs error
  → renders <PluginUnavailable plugin={name} onRetry={reload} />
  → shell's other plugins + core UI remain functional
  → after 3 consecutive failures → marks slot degraded (localStorage)
  → degraded indicator shows "Reload required" link
  → user reload triggers fresh load
```

**Hot reload dev flow** (004-13):

1. Plugin dev server starts on port 4001 (configurable).
2. Dev server sends registration message to shell via dev-mode WebSocket:
   `{ type: 'plugin-register', slug, remoteEntry: 'http://localhost:4001/remoteEntry.js' }`
3. Shell's dev mode listener receives registration, imports the remote.
4. On file change, Vite HMR triggers rebuild → new remoteEntry.js compiled.
5. Shell's plugin dev watcher detects change → re-imports remote.

### 3.3 Kafka Events (Phase 4)

**Backend Module**: `services/core-api/src/events/`

```
services/core-api/src/events/
├── emitter.ts                      # Core event emission (004-14)
├── topics.ts                       # Topic constants & definitions
├── producer.ts                     # KafkaJS producer singleton
├── consumer-manager.service.ts     # Auto-create/delete consumer groups (004-17)
├── event-dispatcher.ts             # Routes events to plugin containers via HTTP POST
├── dlq/
│   ├── dlq-consumer.ts             # Reads from Kafka DLQ topic, writes to DB (004-18)
│   ├── dlq-manager.service.ts      # View, retry, dismiss DLQ entries
│   └── dlq.routes.ts               # GET/POST /api/v1/admin/system/dlq
└── metrics.ts                      # Prometheus consumer lag metrics (004-19)
```

**Topic naming convention**:

| Pattern                              | Example                                  | Scope         |
| ------------------------------------ | ---------------------------------------- | ------------- |
| `plexica.{entity}.{action}`          | `plexica.workspace.created`              | Core events   |
| `plexica.plugin.{action}`            | `plexica.plugin.installed`               | Plugin events |
| `plugin.{slug}.{entity}.{action}`    | `plugin.crm.contact.created`             | Plugin custom |
| `plexica.plugin.dlq`                | (single DLQ topic)                       | DLQ           |

**Consumer group naming**: `plugin-{installId}-{tenant_slug}`

**Core event emission points** (004-14) — insert into existing service modules:

| Entity      | Actions                      | Location (service)                       |
| ----------- | ---------------------------- | ---------------------------------------- |
| workspace   | created, updated, deleted    | `modules/workspace/service.ts`           |
| user        | invited, joined, removed     | `modules/user-management/`               |
| tenant      | created, suspended, deleted  | `modules/tenant/`                        |
| plugin      | installed, activated, deact. | `modules/plugin/services/lifecycle.ts`   |

**Consumer manager flow**:

1. **Install**: `consumer-manager.service.ts` creates consumer group
   `plugin-{installId}-{tenant_slug}` subscribed to manifest-declared
   `events.subscribes` patterns.
2. **Message delivery**: Core reads events from Kafka, forwards them to the
   plugin container via HTTP POST `/_plexica/event`.
3. **Failure handling**: 3 retries with exponential backoff (100ms, 500ms, 2s).
   After 3 failures → moves to DLQ.
4. **Deactivation**: Pauses consumer (commits current offset, stops polling).
5. **Reactivate**: Resumes from last committed offset.
6. **Uninstall**: Deletes consumer group. In-flight events may be lost
   (at-most-once guarantee on uninstall per EC-27).

**DLQ two-tier architecture** (004-18):

```
Plugin event handler fails
  → retry × 3 with exponential backoff
  → failed event published to Kafka topic `plexica.plugin.dlq`
    → dlq-consumer.ts reads from topic, inserts into `core.dead_letter_queue`
      → Super admin UI displays with retry/dismiss actions
        → Retry: re-publishes event to original topic
        → Dismiss: marks status='dismissed' in DB
```

**Lag monitoring** (004-19):

```typescript
// Exported as Prometheus Gauge metric
const pluginConsumerLag = new promClient.Gauge({
  name: 'plexica_plugin_consumer_lag',
  help: 'Kafka consumer lag per plugin installation',
  labelNames: ['plugin_slug', 'tenant_slug', 'install_id'],
});
// Updated every 30s via KafkaJS consumer.describeGroup()
```

### 3.4 Proxy & Container Hosting (Phases 2 + 5)

**Backend Module**: `services/core-api/src/modules/plugin/`

```
services/core-api/src/modules/plugin/
├── services/
│   ├── container-manager.service.ts  # Docker/K8s abstraction (Phase 2)
│   ├── health-check.service.ts       # Circuit breaker + periodic check (004-22)
│   └── proxy.service.ts              # HTTP proxy to plugin backend (004-20)
├── routes/
│   ├── lifecycle.routes.ts           # POST install/deactivate/reactivate/uninstall
│   ├── visibility.routes.ts          # GET/PUT workspace visibility
│   ├── proxy.routes.ts               # ALL /api/v1/plugins/:installId/proxy/*
│   └── dev.routes.ts                 # Dev mode: POST register/unregister (§10.7, gated NODE_ENV=development)
```

**Container Manager** — Strategy pattern:

```typescript
// container-manager.service.ts
interface ContainerManager {
  startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo>;
  stopContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  restartContainer(installId: string): Promise<void>;
}

class DockerContainerManager implements ContainerManager {
  // Uses dockerode for local dev / single-node CI
  // docker run --name plexica-plugin-{installId} -p {port}:{containerPort} {image}
  // Network: host network for simplicity (dev); bridge with port mapping in CI
}

class KubernetesContainerManager implements ContainerManager {
  // Uses @kubernetes/client-node for production
  // Creates Deployment + Service per plugin installation
  // Namespace: plexica-plugins
  // Labels: plugin-install-id, tenant-slug
}
```

**Proxy Service** (004-20):

```typescript
// proxy.service.ts — uses @fastify/http-proxy
// Routes: ALL /api/v1/plugins/:installId/proxy/*
//   → http://localhost:{mappedPort}/*  (sidecar)
//   → http://plugin-{installId}:{svcPort}/*  (K8s)
// Injects headers:
//   X-Plexica-Tenant-Id: {tenantId}
//   X-Plexica-User-Id: {userId}
//   X-Plexica-Workspace-Id: {workspaceId}
//   X-Plexica-User-Role: {role}
```

**Circuit Breaker** (004-22) — States: `closed` → `open` → `half-open` → `closed`

```
Health check result:
  - Success 3 consecutive times → closed
  - Failure 3 consecutive times → open (degraded)
  - After 30s → half-open (allow one probe)
  - If half-open succeeds → closed
  - If half-open fails → open (reset timer)
```

**Auth context propagation** (004-21):

The proxy receives requests that have already passed through:
1. `tenant-context` middleware (resolves tenant, schema, realm)
2. `auth-middleware` (validates JWT, extracts user)
3. `abac` middleware (evaluates workspace-level permissions for plugin actions)

Headers injected into proxied request:
- `X-Plexica-Tenant-Id` — tenant UUID (not slug, prevents enumeration)
- `X-Plexica-User-Id` — user UUID
- `X-Plexica-Workspace-Id` — workspace UUID
- `X-Plexica-User-Role` — role name (admin/member/viewer)

### 3.5 CRM Example Plugin (Phase 7)

```
examples/plugins/crm/
├── package.json                    # Plugin package
├── manifest.json                   # Full DR-15 manifest
├── vite.config.ts                  # Uses @plexica/vite-plugin
├── Dockerfile                      # Container image build
├── src/
│   ├── index.ts                    # Plugin backend entry
│   ├── app.ts                      # Fastify app for plugin backend
│   ├── routes/
│   │   ├── contacts.ts             # CRUD contacts
│   │   ├── deals.ts                # CRUD deals
│   │   └── events.ts               # _plexica/event handler
│   └── health.ts                   # _plexica/health endpoint
├── ui/
│   ├── ContactList.tsx             # MF remote component (workspace-panel)
│   ├── ContactForm.tsx             # react-hook-form + Zod
│   ├── DealList.tsx                # Sidebar item
│   └── index.ts                    # Remote entry exports
├── migrations/
│   ├── 001_create_contacts.sql     # CREATE TABLE crm_contacts
│   └── 002_create_deals.sql        # CREATE TABLE crm_deals
└── __tests__/
    ├── contacts.test.ts
    └── e2e.spec.ts                 # Playwright E2E: full lifecycle
```

**manifest.json** (reference for plugin devs):

```json
{
  "slug": "crm",
  "name": "CRM",
  "version": "1.0.0",
  "description": "Customer relationship management",
  "author": "Plexica",
  "icon": "Contact2",
  "categories": ["sales", "productivity"],
  "hosting": {
    "type": "sidecar",
    "image": "plexica/crm-plugin:1.0.0",
    "port": 3000,
    "resources": { "cpu": "0.25", "memory": "128Mi" },
    "env": []
  },
  "ui": {
    "remoteEntry": "remoteEntry.js",
    "extensionPoints": ["sidebar:admin", "workspace-panel:main"]
  },
  "events": {
    "subscribes": ["plexica.workspace.created"]
  },
  "actions": [
    { "key": "crm:contact:create", "label": "Create Contact", "defaultRole": "member" },
    { "key": "crm:contact:read",   "label": "View Contacts",  "defaultRole": "viewer" },
    { "key": "crm:contact:delete", "label": "Delete Contact", "defaultRole": "admin" }
  ],
  "declaredTables": [
    { "name": "crm_contacts", "description": "Contact records", "migrationFile": "migrations/001_create_contacts.sql" },
    { "name": "crm_deals",   "description": "Deal pipeline",   "migrationFile": "migrations/002_create_deals.sql" }
  ]
}
```

**Cross-workspace isolation** (004-27): All CRM tables have a `workspace_id`
column with FK to `workspaces.id`. The SDK `getDb()` automatically injects
`WHERE workspace_id = {currentWorkspaceId}` via Prisma middleware or a
wrapped Prisma client that enforces the filter.

### 3.6 Marketplace & CLI/SDK (Phases 6 + 8)

**Marketplace UI** (004-28) — `apps/web/src/pages/marketplace/`:

```
apps/web/src/pages/marketplace/
├── MarketplacePage.tsx             # Main grid layout
├── PluginCard.tsx                  # Card with icon, name, description, categories
├── PluginDetailSheet.tsx           # Full detail modal/sheet
├── InstallButton.tsx               # Install flow with progress
├── search-bar.tsx                  # Search + category filter
├── EmptyState.tsx                  # "No plugins available"
├── hooks/
│   └── use-marketplace.ts          # TanStack Query hooks
└── InstalledPluginsPage.tsx        # List of installed + status
```

**Installed Plugins Screen** — `apps/web/src/pages/installed-plugins/`:

```
apps/web/src/pages/installed-plugins/
├── InstalledPluginsPage.tsx        # List with status badges
├── PluginActions.tsx               # Activate/Deactivate/Uninstall buttons
├── UninstallDialog.tsx             # Confirmation with data loss warning
├── WorkspaceVisibilityEditor.tsx   # Per-workspace toggle list
└── PluginPermissionsSection.tsx    # ABAC action/role overrides
```

**CLI** (004-29) — `packages/cli/`:

```
packages/cli/
├── package.json                    # create-plexica-plugin
├── bin/
│   └── create-plexica-plugin.js   # CLI entry point
├── src/
│   ├── index.ts                   # Main generator
│   ├── template-files.ts          # File generation logic
│   └── utils.ts                   # slug validation, directory checks
├── templates/
│   ├── manifest.json.hbs           # Handlebars template
│   ├── vite.config.ts.hbs
│   ├── Dockerfile.hbs              # Production only — not needed for dev
│   ├── dev-entry.ts.hbs            # Dev mode orchestrator (NEW — §10.7)
│   ├── dev-register.ts.hbs         # Dev registration HTTP client (NEW — §10.7)
│   ├── .env.development.hbs        # Dev env vars: CORE_API_URL, KAFKA_BROKERS (NEW)
│   ├── package.json.hbs            # Scripts: dev, dev:backend, migration:apply (UPDATED)
│   ├── src/
│   │   ├── index.ts.hbs
│   │   ├── app.ts.hbs
│   │   └── health.ts.hbs
│   ├── ui/
│   │   ├── index.ts.hbs
│   │   └── PluginComponent.tsx.hbs
│   └── migrations/
│       └── 001_create_tables.sql.hbs
└── __tests__/
    └── generator.test.ts
```

**SDK** (004-30) — `packages/sdk/`:

```
packages/sdk/
├── package.json                    # @plexica/sdk
├── src/
│   ├── index.ts                   # PluginSDK class (single export)
│   ├── types.ts                   # PluginContext, Event, etc.
│   └── errors.ts                  # SDK-specific errors
├── openapi.yaml                   # OpenAPI 3.1 contract (polyglot backends)
├── dev/
│   ├── index.ts                   # Dev mode module (exported as @plexica/sdk/dev)
│   ├── register.ts                # registerBackend() — calls POST /api/v1/dev/plugins/register
│   └── migration.ts               # migration:apply logic (dev table setup)
├── __tests__/
│   ├── sdk.test.ts
│   ├── dev-mode.test.ts           # Dev mode registration lifecycle tests
│   └── openapi-contract.test.ts
└── README.md
```

**SDK single class** (from v2's Lesson #9):

```typescript
class PluginSDK {
  constructor(config: {
    pluginId: string;
    tenantId: string;
    workspaceId?: string;
    kafkaBrokers: string;
    apiUrl: string;
  });

  // Subscribe to events matching glob pattern
  onEvent(pattern: string, handler: (event: Event) => Promise<void>): void;

  // Make API call to another service (proxied through core)
  callApi(method: string, path: string, body?: unknown): Promise<Response>;

  // Get current context
  getContext(): PluginContext; // { tenantId, userId, workspaceId, role }

  // Get DB client scoped to declared tables
  getDb(): PrismaClient; // restricted via PostgreSQL role

  // Emit custom event (prefix: plugin.{slug}.{type})
  emitEvent(type: string, payload: unknown): Promise<void>;
}
```

**OpenAPI 3.1 contract** (`openapi.yaml`) — defines endpoints
that EVERY plugin backend must implement:

| Endpoint            | Method | Purpose                          | Called By      |
| ------------------- | ------ | -------------------------------- | -------------- |
| `/_plexica/health`  | GET    | Liveness + readiness             | Health Check   |
| `/_plexica/ready`   | GET    | Readiness probe                  | Health Check   |
| `/_plexica/event`   | POST   | Event delivery from core         | Event Dispatcher |

Plus headers that core injects on every proxied API call:
- `X-Plexica-Tenant-Id`
- `X-Plexica-User-Id`
- `X-Plexica-Workspace-Id`
- `X-Plexica-User-Role`
- `X-Plexica-Correlation-Id`

---

## 4. Database Migrations

### 4.1 Core Schema — Add to `prisma/schema.prisma`

**Table: `core.plugins`**

```prisma
model Plugin {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug            String   @unique @db.VarChar(63)
  name            String   @db.VarChar(255)
  description     String?  @db.Text
  version         String   @db.VarChar(32)
  author          String   @db.VarChar(255)
  iconUrl         String?  @map("icon_url") @db.VarChar(512)
  categories      Json     @default("[]") @db.JsonB
  manifest        Json     @db.JsonB
  registryUrl     String   @map("registry_url") @db.VarChar(512)
  imageName       String   @map("image_name") @db.VarChar(255)
  imageTag        String   @map("image_tag") @db.VarChar(64)
  imageDigest     String?  @map("image_digest") @db.VarChar(255)
  pullPolicy      String   @default("IfNotPresent") @map("pull_policy") @db.VarChar(16)
  status          String   @default("draft") @db.VarChar(16)
  createdBy       String   @map("created_by") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@index([status])
  @@map("plugins")
  @@schema("core")
}
```

**Table: `core.plugin_versions`**

```prisma
model PluginVersion {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pluginId   String   @map("plugin_id") @db.Uuid
  version    String   @db.VarChar(32)
  manifest   Json     @db.JsonB
  imageDigest String? @map("image_digest") @db.VarChar(255)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@unique([pluginId, version])
  @@index([pluginId])
  @@map("plugin_versions")
  @@schema("core")
}
```

**Table: `core.dead_letter_queue`**

```prisma
model DeadLetterEntry {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventType    String   @map("event_type") @db.VarChar(255)
  payload      Json     @db.JsonB
  pluginId     String?  @map("plugin_id") @db.Uuid
  errorMessage Json?    @map("error_message")
  retryCount   Int      @default(0) @map("retry_count")
  failedAt     DateTime @default(now()) @map("failed_at") @db.Timestamptz
  status       String   @default("pending") @db.VarChar(16)
  resolvedAt   DateTime? @map("resolved_at") @db.Timestamptz

  @@index([status, createdAt])
  @@index([pluginId])
  @@map("dead_letter_queue")
  @@schema("core")
}
```

### 4.2 Tenant Schema — Add to `prisma/tenant-schema.prisma`

**Table: `tenant_{slug}.plugin_installations`**

```prisma
model PluginInstallation {
  id                      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pluginId                String   @map("plugin_id") @db.Uuid
  version                 String   @db.VarChar(32)
  status                  String   @default("installed") @db.VarChar(16)
  hostingType             String   @map("hosting_type") @db.VarChar(16)
  tenantDefaultVisibility String   @default("enabled") @map("tenant_default_visibility") @db.VarChar(8)
  installedBy             String   @map("installed_by") @db.Uuid
  installedAt             DateTime @default(now()) @map("installed_at") @db.Timestamptz
  updatedAt               DateTime @updatedAt @map("updated_at") @db.Timestamptz

  workspaceVisibility PluginWorkspaceVisibility[]
  migrationStatuses   PluginMigrationStatus[]
  containerConfig     PluginContainerConfig?

  @@index([pluginId])
  @@map("plugin_installations")
}
```

**Table: `tenant_{slug}.plugin_migration_status`**

```prisma
model PluginMigrationStatus {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  installId      String    @map("install_id") @db.Uuid
  migrationName  String    @map("migration_name") @db.VarChar(255)
  status         String    @default("pending") @db.VarChar(16)
  errorMessage   String?   @map("error_message") @db.Text
  appliedAt      DateTime? @map("applied_at") @db.Timestamptz

  installation PluginInstallation @relation(fields: [installId], references: [id], onDelete: Cascade)

  @@unique([installId, migrationName])
  @@map("plugin_migration_status")
}
```

**Table: `tenant_{slug}.plugin_workspace_visibility`**

```prisma
model PluginWorkspaceVisibility {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  installId     String   @map("install_id") @db.Uuid
  workspaceId   String   @map("workspace_id") @db.Uuid
  isEnabled     Boolean  @default(true) @map("is_enabled")
  isOverride    Boolean  @default(false) @map("is_override")
  updatedBy     String?  @map("updated_by") @db.Uuid
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz

  installation PluginInstallation @relation(fields: [installId], references: [id], onDelete: Cascade)

  @@unique([installId, workspaceId])
  @@map("plugin_workspace_visibility")
}
```

**Table: `tenant_{slug}.plugin_container_config`**

```prisma
model PluginContainerConfig {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  installId       String    @unique @map("install_id") @db.Uuid
  type            String    @db.VarChar(16)
  image           String    @db.VarChar(511)
  resourceLimits  Json      @default("{}") @map("resource_limits")
  envOverrides    Json      @default("{}") @map("env_overrides")
  healthStatus    String    @default("healthy") @map("health_status") @db.VarChar(16)
  lastHealthCheck DateTime? @map("last_health_check_at") @db.Timestamptz

  installation PluginInstallation @relation(fields: [installId], references: [id], onDelete: Cascade)

  @@map("plugin_container_config")
}
```

### 4.3 Migration Strategy

- **Core migrations**: Standard Prisma migrations (`prisma migrate dev`).
  New models added to `prisma/schema.prisma`.
- **Tenant migrations**: Add new models to `prisma/tenant-schema.prisma`, run
  `prisma migrate dev` against one tenant schema, manually apply SQL for
  existing tenant schemas (or run per-tenant migration script).
- **Plugin migrations** (per DR-19): Executed by `migration-runner.service.ts`
  using raw SQL executed within a transaction in the target tenant schema.
  Each migration file is run sequentially; on failure, the transaction rolls back.

### 4.4 Migration Order

```
1. Core: create plugins, plugin_versions, dead_letter_queue
2. Per-tenant: plugin_installations, plugin_migration_status,
   plugin_workspace_visibility, plugin_container_config
3. Per-tenant: ALTER action_registry — add plugin_id FK constraint (verify)
```

---

## 5. API Surface

### 5.1 Endpoint Maturity Map

| Method | Path                                                    | Phase | Auth              | Ref                 |
| ------ | ------------------------------------------------------- | ----- | ----------------- | ------------------- |
| GET    | `/api/v1/plugins`                                       | 8     | Tenant admin      | 004-28 Marketplace  |
| GET    | `/api/v1/plugins/:slug`                                 | 8     | Tenant admin      | 004-28 Detail       |
| POST   | `/api/v1/plugins/:slug/install`                         | 1,2,4 | Tenant admin      | 004-03 Install      |
| POST   | `/api/v1/plugins/:installId/deactivate`                 | 5     | Tenant admin      | 004-04 Deactivate   |
| POST   | `/api/v1/plugins/:installId/reactivate`                 | 5     | Tenant admin      | 004-04 Reactivate   |
| POST   | `/api/v1/plugins/:installId/uninstall`                  | 5     | Tenant admin      | 004-05 Uninstall    |
| GET    | `/api/v1/plugins/:installId/visibility`                 | 5     | Workspace admin   | 004-06 Visibility   |
| PUT    | `/api/v1/plugins/:installId/visibility`                 | 5     | Workspace admin   | 004-06 Visibility   |
| ALL    | `/api/v1/plugins/:installId/proxy/*`                    | 2,5   | Authenticated     | 004-20 Proxy        |
| GET    | `/api/v1/admin/plugins`                                 | 1     | Super admin       | 004-01 Catalog      |
| POST   | `/api/v1/admin/plugins/register`                        | 1     | Super admin       | 004-01 Register     |
| POST   | `/api/v1/admin/plugins/:slug/publish`                   | 1     | Super admin       | 004-01 Publish      |
| POST   | `/api/v1/admin/plugins/:slug/unpublish`                 | 1     | Super admin       | 004-01 Unpublish    |
| GET    | `/api/v1/admin/plugins/:slug/versions`                  | 1     | Super admin       | 004-01 Versions     |
| GET    | `/api/v1/admin/system/kafka`                            | 4     | Super admin       | 004-19 Lag metrics  |
| GET    | `/api/v1/admin/system/dlq`                              | 4     | Super admin       | 004-18 DLQ list     |
| POST   | `/api/v1/admin/system/dlq/:id/retry`                    | 4     | Super admin       | 004-18 DLQ retry    |
| POST   | `/api/v1/admin/system/dlq/:id/dismiss`                  | 4     | Super admin       | 004-18 DLQ dismiss  |
| POST   | `/api/v1/dev/plugins/register`                          | 2     | Dev only (localhost)| §10.7 Dev mode    |
| POST   | `/api/v1/dev/plugins/unregister`                        | 2     | Dev only (localhost)| §10.7 Dev mode    |

### 5.2 Key Request/Response Schemas

**POST `/api/v1/admin/plugins/register`**:

```json
// Request
{
  "slug": "crm",
  "manifest": { /* full DR-15 manifest object */ },
  "registryUrl": "docker.io/plexica/crm-plugin",
  "imageName": "plexica/crm-plugin",
  "imageTag": "1.0.0",
  "imageDigest": "sha256:abc123...",
  "pullPolicy": "IfNotPresent"
}
// Response 201
{ "id": "uuid", "slug": "crm", "status": "draft", "createdAt": "..." }
```

**POST `/api/v1/plugins/:slug/install`**:

```json
// Response 202 (Accepted — async with status polling)
{
  "installId": "uuid",
  "status": "installing",
  "steps": [
    { "name": "pull_container", "status": "in_progress" },
    { "name": "run_migrations", "status": "pending" },
    { "name": "start_container", "status": "pending" },
    { "name": "create_consumer_group", "status": "pending" }
  ]
}
// On completion → status = "active"
// On failure → status = "failed", error message, rollback steps
```

**GET `/api/v1/plugins` (marketplace)**:

```json
// Response
{
  "data": [
    {
      "id": "uuid",
      "slug": "crm",
      "name": "CRM",
      "description": "Customer relationship management",
      "iconUrl": null,
      "categories": ["sales", "productivity"],
      "version": "1.0.0",
      "author": "Plexica",
      "isInstalled": false,
      "installCount": 5
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

**ALL `/api/v1/plugins/:installId/proxy/*`**:

```
→ Proxy to plugin container at port mapped for installId
→ Injects headers: X-Plexica-Tenant-Id, X-Plexica-User-Id,
                   X-Plexica-Workspace-Id, X-Plexica-User-Role
→ On container unreachable: 503 { code: "PLUGIN_UNAVAILABLE", message: "..." }
→ On circuit breaker open: 503 { code: "PLUGIN_DEGRADED", message: "..." }
```

---

## 6. ADR Requirements

### 6.1 Required New ADRs

The spec's clarification resolved 13 ambiguities as DRs.
Per Constitution Rule 5, the following DRs require formal ADRs:

| #   | Title                                   | DR Ref | Rationale                                            |
| --- | --------------------------------------- | ------ | ---------------------------------------------------- |
| 013 | **Container Hosting Model**             | DR-13  | Changes infrastructure: Docker sidecar + K8s API. Dev mode (§10.7) uses local process, NOT containers. ADR must document dev/prod split |
| 014 | **Hybrid UI Delivery Model**            | DR-14  | New integration pattern: MinIO for MF static assets   |
| 015 | **Plugin Action Extension in ABAC**     | DR-12  | Extends ADR-003: 3-part action keys for plugins       |
| 016 | **Two-Tier Dead Letter Queue**          | DR-17  | Extends ADR-004: Kafka topic + DB table for DLQ      |
| 017 | **Plugin DB Access Restriction**        | DR-18  | Security model: PostgreSQL role-based restrictions    |
| 018 | **Two-Level Plugin Visibility**         | DR-16  | Data model decision: tenant default + workspace override|
| 019 | **Plugin SDK & OpenAPI Architecture**   | DR-20  | SDK design: single class, TypeScript + OpenAPI 3.1   |
| 020 | **Plugin Reinstall = Update Flow**      | DR-19  | Lifecycle policy: automated update with migration     |

### 6.2 ADR Lifecycle

All new ADRs start as **Proposed** during this plan phase. Accept after team review.
Existing ADRs that need extension notes:

- **ADR-004** (Kafka Event Bus): Extended by ADR-016 (DLQ architecture).
- **ADR-003** (ABAC Tree-Walk): Extended by ADR-015 (3-part action keys).

---

## 7. Risk Mitigation

### 7.1 Risk Mapping from Spec §14

| ID   | Risk                      | Mitigation Strategy                                        | Phase Applied   | Monitoring                               |
| ---- | ------------------------- | ---------------------------------------------------------- | --------------- | ---------------------------------------- |
| R-01 | MF cache busting          | Content-hash chunk names. `remoteEntry.js` → `Cache-Control: no-cache, must-revalidate`. Versioned MinIO paths (`plugins/{slug}/{version}/`)| 3 | E2E test verifies fresh remoteEntry.js loads after publish |
| R-02 | Kafka rebalancing         | Graceful consumer shutdown: commit offset before close. Configurable `session.timeout.ms` (default 30s). Consumer group rebalance on install/uninstall processed async| 4 | Lag metric should stay flat during rebalance |
| R-03 | Migration failures        | Wrap each migration in DB transaction. Rollback on failure. Store per-tenant migration status in `plugin_migration_status`. All-tenants rollback on any failure (DR-19)| 1,7 | E2E: install with broken migration fails cleanly |
| R-04 | MF version compatibility  | Pin shared dep versions in `@plexica/vite-plugin`. CI check: verify plugin MF config against shell's allowed version range. Runtime version mismatch → fallback to shell's version with console warning| 3 | Bundle analyzer CI step (NFR-02) |
| R-05 | Plugin backend unavail.   | Circuit breaker: 3 failures → open → 30s → half-open → probe → closed/open. Degraded UI in shell. Auto-retry every 30s in background| 2,5 | Health status in `plugin_container_config`. Prometheus alert on degraded > 5min |
| R-06 | Kafka partition exhaustion| One partition per plugin consumer group. Topics created with `--partitions 3` (configurable). Monitor partition count in CI| 4 | Lag metric per consumer group. Alert on partition count > 100 |
| R-07 | Slow image pull           | Image caching on host node. Pull-through registry cache in CI. CLI generates `.dockerignore` and multi-stage Dockerfile for minimal layers| 2,6 | Install time metric (NFR-05) |
| R-08 | Cross-plugin DB access    | PostgreSQL role: `GRANT SELECT, INSERT, UPDATE, DELETE ON {plugin_tables} TO {role}`. Role created per plugin installation with table-scoped permissions. E2E isolation test (AC-07)| 1,7 | Per-table permission audit script |
| R-09 | DLQ unbounded growth      | TTL cleanup: `dead_letter_queue` rows deleted after 30 days (cron job or pg_cron). Paginated UI with 50 per page. Kafka DLQ topic retention: 7 days| 4 | DLQ table size Prometheus metric |
| R-10 | Registry credential leak  | Encrypt at rest in DB (`pgcrypto`). Reference via env vars or Kubernetes secrets. Audit access to `registry_credentials_secret`| 1 | Secret access audit log |

### 7.2 Additional Risks Identified

| ID   | Risk                      | Impact  | Likelihood | Mitigation                                                |
| ---- | ------------------------- | ------- | ---------- | --------------------------------------------------------- |
| R-11 | Plugin SDK version drift  | HIGH    | MEDIUM     | SDK uses semver. Shell verifies compat at load via MF requiredVersion. CI matrix tests SDK against multiple core versions |
| R-12 | Consumer group leak on failed uninstall | MEDIUM | LOW | Uninstall runs cleanup steps idempotently. Stale consumer groups detected via lag=0 + no active install → cleaned by GC job (weekly) |
| R-13 | Docker socket exposure    | CRITICAL| LOW        | Sidecar manager connects to Docker socket over TCP with TLS in CI. In prod, only K8s API is used (no Docker socket) |
| R-14 | Plugin container port conflicts | MEDIUM | MEDIUM | Port allocation via OS-assigned random port (`0` port → `docker run -p 0:3000`). Port stored in `plugin_container_config` on container start |

---

## 8. Dependency Graph

```
Phase 1: Core Infrastructure
 ├─ Create core DB migrations (plugins, plugin_versions)
 ├─ Manifest validation Zod schema
 ├─ Registry CRUD service (register, list, version tracking)
 ├─ DB migration for action_registry.plugin_id extension
 └─ Admin catalog routes (GET/POST /api/v1/admin/plugins)
 dependencies: Spec 002 (DB connection, tenant context, auth middleware)
 
Phase 2: Container Lifecycle
 ├─ Container manager abstraction (interface + Docker implementation)
 ├─ Install flow: pull image → start container → store port mapping
 ├─ Health check service with circuit breaker
 └─ Proxy route skeleton
 dependencies: Phase 1 (registry, plugin record exists)
 
Phase 3: MF Vite Preset + Shell
 ├─ @plexica/vite-plugin package (MF config generator)
 ├─ Shell extension point components (slots with error boundaries)
 ├─ Plugin loader (remoteEntry.js fetch from MinIO)
 ├─ Shared dep configuration (shell + preset)
 ├─ React context propagation (tenant, user, workspace, theme)
 └─ Hot reload dev flow
 dependencies: AGENTS.md (existing shell architecture), MinIO client (lib/minio-client.ts)
 
Phase 4: Kafka Events
 ├─ Core event producer (emit on workspace/user/tenant CRUD)
 ├─ Consumer group auto-management (create on install, delete on uninstall)
 ├─ Event dispatcher (Kafka → HTTP POST to plugin container)
 ├─ DLQ: Kafka topic + DB consumer + management routes
 └─ Prometheus lag metrics
 dependencies: Phase 1 (plugin records exist), existing Kafka infra (ADR-004)
 
Phase 5: Proxy + Visibility
 ├─ Full lifecycle routes (activate/deactivate/uninstall)
 ├─ Workspace visibility service (tenant default + per-workspace)
 ├─ Full proxy implementation (fastify-reply-from or custom)
 ├─ Auth header propagation
 └─ Deactivation/reactivation flow
 dependencies: Phase 2 (container running), Phase 4 (consumer groups)
 
Phase 6: CLI + SDK + Dev Mode
 ├─ @plexica/sdk package (single PluginSDK class)
 ├─ @plexica/sdk/dev module (dev registration, migration helper)
 ├─ CLI create-plexica-plugin (project scaffolding with dev files)
 ├─ OpenAPI 3.1 contract
 ├─ Dev mode E2E test: dev registration → HMR → backend restart → unregister
 └─ SDK tests + CLI tests + dev-mode tests
 dependencies: Phase 2 (dev registration endpoint), Phase 3 (MF types), Phase 4 (event patterns)
 
Phase 7: CRM Example Plugin
 ├─ Plugin manifest + package structure
 ├─ Backend: Fastify app with CRUD + health + event handler
 ├─ Frontend: MF remote components (ContactList, ContactForm)
 ├─ Migrations: crm_contacts, crm_deals
 └─ E2E tests: full lifecycle + cross-workspace isolation
 dependencies: ALL previous phases (must work end-to-end)
 
Phase 8: Marketplace UI
 ├─ Marketplace page (grid, search, categories)
 ├─ Plugin detail sheet/modal
 ├─ Install flow with progress indicator
 ├─ Installed plugins list with status
 ├─ Uninstall confirmation dialog
 └─ Workspace visibility editor
 dependencies: Phase 1 (API exists), Phase 3 (shell integration)
```

### Critical Path

The **critical path** for the complete plugin system is:

```
Phase 1 → Phase 2 → Phase 5 → Phase 7
                                 Phase 3 → Phase 7
                                 Phase 4 → Phase 7
                                 Phase 6 → Phase 7
                                 Phase 8 (parallel)
```

Phase 7 (CRM Example) validates all previous phases. No phase after Phase 6 can
be marked complete until CRM E2E tests pass.

---

## 9. Integration Points

### 9.1 Schema-per-tenant (Spec 002/ADR-001)

- **Plugin tables**: Added to each tenant schema via `prisma/tenant-schema.prisma`.
  Tables `plugin_installations`, `plugin_migration_status`,
  `plugin_workspace_visibility`, `plugin_container_config` are new tenant-schema
  models.
- **Tenant isolation**: Plugin data in tenant schemas inherits existing isolation.
  `withTenantDb()` picks the correct schema via tenant context.
- **Plugin migrations plugin-owned tables**: Executed by `migration-runner.service.ts`
  using raw SQL within a `SET search_path = tenant_{slug}` context, wrapped in
  a transaction. Each migration file is validated for allowed SQL statements.

### 9.2 ABAC Engine (Spec 003/ADR-003)

- **Action key extension**: The `action_registry` table already has a `plugin_id`
  column. Plugin actions are registered during installation with 3-part keys
  (`{slug}:{resource}:{verb}`), while core actions use 2-part keys.
- **ABAC evaluation**: The existing `evaluate()` function in `middleware/abac.ts`
  dispatches on key part count:
  - 2-part key → core action evaluation (unchanged)
  - 3-part key → plugin action evaluation (resolve `plugin_id` from first segment,
    check `action_registry.defaultRole`, check `workspace_role_action` overrides)
- **Plugin action overrides**: `workspace_role_action` already supports 3-part
  keys. No schema change needed.
- **Plugin permissions UI**: New subsection in Workspace Settings showing
  plugin actions with role selector.

### 9.3 Existing UI Shell (Spec 003)

- **Extension points**: Three new slot components added to shell layouts:
  - `apps/web/src/components/layout/Sidebar.tsx` — renders `sidebar-slot` below
    main nav items
  - `apps/web/src/pages/WorkspacePage.tsx` — renders `workspace-panel-slot` in
    main content area
  - `apps/web/src/pages/DashboardPage.tsx` — renders `dashboard-widget-slot` in
    widget grid
- **Data fetching**: All plugin marketplace/visibility data uses TanStack Query
  hooks (`useMarketplace`, `useInstalledPlugins`, `usePluginVisibility`).
- **Forms**: Install/visibility/actions use react-hook-form + Zod.
- **Auth state**: Plugin visibility and install actions use Zustand auth store.
- **i18n**: All UI strings pass through react-intl. Plugin-provided labels are
  also wrapped in `FormattedMessage` with fallback to raw string.

### 9.4 Keycloak (Spec 002/ADR-002)

- **Plugin endpoints require authentication**: All plugin API routes go through
  the existing `auth-middleware.ts` pipeline.
- **Tenant context propagation**: Proxy injects `X-Plexica-Tenant-Id` header
  (tenant UUID, not slug) for plugin backends.
- **Super admin authorization**: Admin plugin routes use existing
  `requireSuperAdmin()` check (ID-004 — master realm issuer).
- **No Keycloak changes needed**: Plugin system does not require new Keycloak
  realms, clients, or roles. Plugin actions are managed in application-layer ABAC.

### 9.5 MinIO (Spec 002)

- **New bucket/path pattern**: Plugin UI assets stored at path
  `plugins/{slug}/{version}/remoteEntry.js` in the core MinIO bucket
  (or per-tenant bucket for tenant-specific assets).
- **Access pattern**: Core API signs download URLs. Shell fetches
  `remoteEntry.js` via signed URL. Plugin backends cannot access MinIO directly.
- **New env vars** (to add to `config.ts`):
  - `MINIO_PLUGIN_BUCKET` — bucket name for plugin assets (default `plexica-plugins`)

### 9.6 Kafka / Redpanda (Spec 002/ADR-004)

- **Existing topics**: `plexica.tenant.events`, `plexica.user.events`,
  `plexica.plugin.events` already created in `redpanda-init` in docker-compose.yml.
- **New topics needed**: `plexica.plugin.dlq` — add to `redpanda-init` entrypoint.
- **Partition count**: Default 3 partitions for each plugin event topic
  (configurable via env var, e.g., `KAFKA_PLUGIN_TOPIC_PARTITIONS=3`).
- **Consumer groups**: Dynamically created/deleted by `consumer-manager.service.ts`.
  No manual topic configuration needed per plugin.
- **Event format**:

```json
{
  "eventType": "plexica.workspace.created",
  "tenantId": "uuid",
  "entityId": "uuid",
  "payload": { "workspace": { "id": "...", "name": "...", "slug": "..." } },
  "timestamp": "2026-06-26T12:00:00Z",
  "correlationId": "uuid",
  "version": "1.0"
}
```

### 9.7 Docker Compose (Dev Environment)

**New services to add to `docker-compose.yml`**:

- No new core services needed (plugin containers start dynamically on demand).
- Port range `40000-40100` reserved for plugin sidecar containers.
- Environment variable `PLUGIN_PORT_RANGE=40000-40100` added to core-api service.

**Changes to `redpanda-init`**:

```bash
# Add DLQ topic
rpk topic create \
  plexica.plugin.dlq \
  --partitions 3 \
  --replicas 1 \
  --topic-config "retention.ms=604800000,cleanup.policy=delete"
```

### 9.8 Config Changes (`services/core-api/src/lib/config.ts`)

New env vars:

```typescript
PLUGIN_CONTAINER_NETWORK: z.string().default('plexica-dev_default'),
PLUGIN_PORT_RANGE_START: z.coerce.number().default(40000),
PLUGIN_PORT_RANGE_END: z.coerce.number().default(40100),
PLUGIN_MAX_CONTAINERS_PER_HOST: z.coerce.number().default(50),
KAFKA_PLUGIN_TOPIC_PARTITIONS: z.coerce.number().default(3),
MINIO_PLUGIN_BUCKET: z.string().default('plexica-plugins'),
PLUGIN_HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(30000),
PLUGIN_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(3),
PLUGIN_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().default(30000),
```

### 9.9 Prometheus Metrics

New metrics to expose at `GET /metrics`:

| Metric                               | Type    | Labels                                        | Description                      |
| ------------------------------------ | ------- | --------------------------------------------- | -------------------------------- |
| `plexica_plugins_active_total`       | Gauge   | —                                             | Active plugin installations       |
| `plexica_plugin_consumer_lag`        | Gauge   | `plugin_slug`, `tenant_slug`, `install_id`   | Kafka consumer lag                |
| `plexica_plugin_dlq_entries_total`   | Gauge   | `status` (pending/retried/dismissed)          | DLQ entry count                   |
| `plexica_plugin_proxy_duration_ms`   | Histogram | `plugin_slug`, `status_code`               | Proxy request duration            |
| `plexica_plugin_health_status`       | Gauge   | `plugin_slug`, `tenant_slug`                 | 1=healthy, 0=degraded, -1=down   |
| `plexica_plugin_install_duration_ms` | Histogram | —                                           | End-to-end install time           |

---

## 10. Key Technical Decisions

### 10.1 Container Lifecycle Manager Strategy

**Decision**: Use Strategy pattern with two implementations:

| Environment | Strategy     | Library                 | How it works                                                  |
| ----------- | ------------ | ----------------------- | ------------------------------------------------------------- |
| Dev / CI    | Sidecar      | `dockerode`             | `docker run --network plexica-dev_default -p 0:3000 {image}`  |
| Production  | Kubernetes   | `@kubernetes/client-node` | Create `Deployment` + `Service` in `plexica-plugins` namespace |

**Port allocation**: Use OS-assigned random port by passing `0` for host port
(`docker run -p 0:3000`). Port stored in `plugin_container_config` on start.

**Container naming**: `plexica-plugin-{installId}` (enforces uniqueness, no
collisions even if two tenants run the same plugin).

**Container lifecycle**:
```
Start: docker run -d --name plexica-plugin-{id} --restart unless-stopped ...
Stop: docker stop plexica-plugin-{id}
Remove: docker rm -f plexica-plugin-{id}
Status: docker inspect plexica-plugin-{id} — exit code & health
```

**Kubernetes production path**: For production, a separate `ContainerManager`
implementation creates:
- `Deployment` with image, resource limits, probes, env vars
- `Service` of type `ClusterIP` (internal to K8s cluster)
- Core API proxy routes to `http://plugin-{installId}:{port}/`

### 10.2 MF Vite Preset Architecture

**Decision**: `@plexica/vite-plugin` reads `manifest.json` from the plugin
project root and generates Module Federation configuration using
`@originjs/vite-plugin-federation`.

**Architecture**:

```typescript
// packages/vite-plugin/src/index.ts
import federation from '@originjs/vite-plugin-federation';
import { readManifest } from './mf-config-generator';
import { SHARED_DEPS } from './shared-deps';

export default function plexicaPluginVite(options?: PluginOptions) {
  const manifest = readManifest(options?.manifestPath ?? './manifest.json');
  const pluginId = manifest.slug;
  
  return {
    name: '@plexica/vite-plugin',
    config() {
      return {
        build: {
          target: 'es2020',
          rollupOptions: {
            // Preserve manifest in output for CI upload
          },
        },
        plugins: [
          federation({
            name: pluginId,
            filename: 'remoteEntry.js',
            exposes: {
              // Auto-generated from manifest.ui.extensionPoints
              './sidebar:admin': './ui/sidebar-entry.tsx',
              './workspace-panel:main': './ui/workspace-entry.tsx',
            },
            shared: SHARED_DEPS,
          }),
        ],
      };
    },
  };
}
```

**CI integration**: After `vite build`, plugin CI uploads `dist/` contents to
MinIO at `plugins/{slug}/{version}/`. The `remoteEntry.js` path is stored in
the plugin version manifest.

### 10.3 Plugin Database Access Pattern

**Decision**: PostgreSQL role-level restrictions per DR-18.

**Implementation**:

1. On plugin install for a tenant:
   - Core creates a PostgreSQL role: `CREATE ROLE plugin_{installId}`
   - Core grants access to declared tables:
     `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_{slug}
     TO plugin_{installId}`
   - Core revokes default public schema access:
     `REVOKE ALL ON SCHEMA tenant_{slug} FROM plugin_{installId}`
   - Core grants access to specific tables only:
     `GRANT USAGE ON SCHEMA tenant_{slug} TO plugin_{installId}`
     `GRANT ALL PRIVILEGES ON crm_contacts, crm_deals TO plugin_{installId}`

2. The SDK's `getDb()` method receives a `DATABASE_URL` with the plugin role
   credentials (stored encrypted in `plugin_container_config.envOverrides`).

3. On uninstall: `DROP OWNED BY plugin_{installId} CASCADE; DROP ROLE plugin_{installId};`

**Alternative considered**: Row-Level Security with `app.current_workspace_id`
session variable. Rejected because table-level restrictions (preventing access
to non-declared tables) is the primary concern. Row-level filtering for
workspace isolation is handled by application-level WHERE clauses.

### 10.4 SDK Code Structure

**Decision**: Single `PluginSDK` class with constructor injection, per
Lesson #9 from v1.

```typescript
class PluginSDK {
  // Internal
  private config: PluginConfig;
  private kafkaConsumer: KafkaConsumer | null = null;
  private dbClient: PrismaClient | null = null;
  private subscriptions: Map<string, EventHandler> = new Map();

  constructor(config: PluginConfig) {
    // Validate at construction
    this.config = {
      ...config,
      kafkaBrokers: config.kafkaBrokers ?? process.env['KAFKA_BROKERS'],
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'],
    };
  }

  async initialize(): Promise<void> {
    // Connect to Kafka, init DB client
  }

  async destroy(): Promise<void> {
    // Clean disconnect
  }

  // ... methods per DR-20
}
```

**Connection pooling for SDK**: Each plugin instance gets a single Prisma client
with 5 connection pool. Not shared across plugins. Pool size configurable via
env var `PLUGIN_DB_POOL_SIZE`.

### 10.5 Hot Reload Dev Flow (Frontend UI)

**Decision**: WebSocket-based registration between plugin dev server and shell.
This covers the **frontend UI only**. For the full rapid dev mode (backend +
UI + DB + Kafka), see §10.7.

**Flow**:

1. Plugin dev starts: `npx plexica dev` (or `vite dev` with `@plexica/vite-plugin`)
2. Vite preset's `dev-server-registration.ts` sends a registration message to
   the shell's WebSocket endpoint:
   ```json
   {
     "type": "plugin-register",
     "slug": "my-plugin",
     "remoteEntry": "http://localhost:4001/remoteEntry.js",
     "extensionPoints": ["sidebar:admin", "workspace-panel:main"]
   }
   ```
3. **Production path**: The dev server registration is gated behind `NODE_ENV=development`.
   In production, the shell loads plugins only from MinIO.
4. Shell's `plugin-dev-watcher.ts` (loaded only in dev mode) receives the
   registration, dynamically adds the remote to the MF container.
5. On file change: Vite HMR triggers, plugin dev server compiles new bundle.
   Shell's remote import picks up changes automatically (MF handles this).
6. On plugin dev server stop: Shell removes the remote entries and cleans up.

**Security**: In dev, the WebSocket accepts connections from `localhost` only.
In CI, plugins are loaded from MinIO only (no dev mode).

**Note**: For a complete dev experience including backend hot reload, Kafka
consumer setup, and DB migration, see §10.7 — Plugin Rapid Development Mode.
The CLI's `pnpm dev` (described in §10.7) orchestrates both the UI HMR flow
(§10.5) and the backend registration flow.

### 10.6 Plugin Install Flow (Complete)

```
POST /api/v1/plugins/:slug/install
  │
  ├─ 1. Validate: tenant admin, plugin exists and published, not already installed
  │
  ├─ 2. Create installation record (status: "installing")
  │
  ├─ 3. PULL CONTAINER (phase 2):
  │     ├─ Docker: docker pull {image}:{tag}
  │     └─ K8s: Image exists in registry (pulled by kubelet on pod start)
  │
  ├─ 4. RUN MIGRATIONS (phase 1):
  │     ├─ Execute each migration file in order
  │     ├─ Within tenant schema in a transaction
  │     ├─ Record status in plugin_migration_status
  │     └─ Fail → rollback transaction, mark install failed
  │
  ├─ 5. CREATE CONTAINER (phase 2):
  │     ├─ Docker: docker run -d --name plexica-plugin-{id} ...
  │     ├─ K8s: Create Deployment + Service
  │     └─ Store container config (port, health status)
  │
  ├─ 6. CONFIGURE DATABASE ACCESS (phase 6):
  │     ├─ Create PostgreSQL role: CREATE ROLE plugin_{installId}
  │     ├─ Grant on declared tables
  │     └─ Store encrypted credentials in plugin_container_config
  │
  ├─ 7. CREATE CONSUMER GROUP (phase 4):
  │     ├─ Create Kafka consumer group: plugin-{installId}-{tenant_slug}
  │     ├─ Subscribe to manifest-declared event patterns
  │     └─ Start consuming (consumer runs as part of core process)
  │
  ├─ 8. REGISTER ACTIONS (phase 5):
  │     ├─ Insert into action_registry for this tenant
  │     └─ Set default roles from manifest
  │
  ├─ 9. SET VISIBILITY (phase 5):
  │     ├─ Set tenant_default_visibility = "enabled"
  │     └─ (Workspace-specific visibility configured separately)
  │
  ├─ 10. EMIT EVENT (phase 4):
  │      └─ Emit plexica.plugin.installed
  │
  └─ 11. Mark installation status = "active"
```

### 10.7 Plugin Rapid Development Mode

**Decision**: In `NODE_ENV=development`, plugin backend runs as a local process
(not a container). Frontend uses Vite HMR (as in 10.5). This eliminates the
container build → push → pull → start cycle, reducing feedback loop from
minutes to < 1 second.

**Why not use containers in dev?**: The full install flow (11 steps) assumes
a built container image in a registry. During active development, a plugin
developer changes code every 30-60 seconds. Building a Docker image per change
is impractical. The dev mode bypasses container orchestration entirely.

**Flow: `pnpm dev` (generated by CLI)**:

```
┌─ Plugin Project Root ────────────────────────────────────────┐
│                                                               │
│  pnpm dev                                                     │
│    │                                                          │
│    ├─ 1. Start Vite dev server (UI) ← hot reload per 10.5    │
│    │   Port 4001 (default)                                    │
│    │                                                          │
│    ├─ 2. Start backend as local process                       │
│    │   tsx watch backend/src/index.ts                         │
│    │   Port 4002 (default)                                    │
│    │   Auto-restart on file change (< 500ms)                  │
│    │                                                          │
│    └─ 3. Register with Core API via HTTP POST                 │
│        POST /api/v1/dev/plugins/register                     │
│        {                                                      │
│          slug: "my-plugin",                                   │
│          backendUrl: "http://localhost:4002",                 │
│          uiUrl: "http://localhost:4001/remoteEntry.js",       │
│          extensionPoints: ["sidebar:admin"],                  │
│          actions: [{ action: "crm:contact:create", ... }],    │
│          events: { subscribes: ["plexica.workspace.*"] },     │
│          declaredTables: ["crm_contacts", "crm_deals"]        │
│        }                                                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Core API receives the registration**:

```
POST /api/v1/dev/plugins/register (dev-only, gated by NODE_ENV)
  │
  ├─ 1. Validate: plugin slug not conflicting with installed plugins
  ├─ 2. OPTIONAL: Apply migrations to dev tenant schema
  │     (pnpm migration:apply --tenant=dev, skipped if tables exist)
  ├─ 3. Register backend proxy route:
  │     /api/v1/plugins/{slug}/proxy/* → http://localhost:4002
  ├─ 4. Register MF remote:
  │     Shell's dev watcher (10.5) adds http://localhost:4001/remoteEntry.js
  ├─ 5. Register plugin actions (temporary, for dev ABAC evaluation)
  ├─ 6. Create dev Kafka consumer group (if events declared)
  │     Consumer group: plugin-{slug}-dev
  └─ 7. Return { status: "ok", pluginUrl: "/api/v1/plugins/{slug}/proxy" }
```

**Teardown on Ctrl+C**:

1. Plugin CLI sends `POST /api/v1/dev/plugins/unregister { slug }`
2. Core removes proxy route and MF remote
3. Core deletes dev Kafka consumer group
4. Core cleans up temporary action registrations
5. **Dev data tables are preserved** (no data loss on stop/restart)
6. Backend process and Vite server terminate

**Key differences from production install**:

| Aspect | Dev Mode | Production Install |
| ------ | -------- | ------------------ |
| **Backend** | Local process (`tsx watch`) | Docker container |
| **UI delivery** | Vite dev server (HMR) | MinIO static assets |
| **Proxy target** | `localhost:4002` | Container IP/port |
| **DB setup** | Manual (`pnpm migration:apply`) | Automatic (11-step flow) |
| **DB credentials** | Developer's local env | Encrypted per-plugin role |
| **Kafka consumer** | `plugin-{slug}-dev` (shared) | `plugin-{installId}-{tenant}` (isolated) |
| **Container build** | **Never** | Required |
| **Feedback loop** | **< 500ms** (file change → restart) | **minutes** (build → push → pull → start) |
| **State persistence** | Tables survive stop/restart | Managed by lifecycle |

**Security model (dev mode)**:

- Dev registration endpoint gated by `NODE_ENV=development`. Returns 404 in production.
- Only accepts connections from `localhost` (enforced via Fastify `loopback` only host).
- Dev Kafka consumer group uses a dedicated `plexica-dev-` prefix to avoid collisions.
- No persistent secrets created (no encrypted DB credentials, no registry credentials stored).
- Plugin data tables use the developer's own DB credentials (not a restricted role).
- **Not suitable for multi-tenant dev**: Dev mode assumes a single developer on localhost.

**What the CLI generates for dev mode**:

| File | Purpose |
| ---- | ------- |
| `package.json` scripts | `"dev"`, `"dev:backend"`, `"dev:ui"`, `"migration:apply"` |
| `dev-entry.ts` | Orchestrates dev mode: starts Vite + backend, registers with core |
| `dev-register.ts` | HTTP client for `/api/v1/dev/plugins/register` |
| `.env.development` | Default env vars: `CORE_API_URL=http://localhost:3001`, `KAFKA_BROKERS=localhost:9092` |
| `tsconfig.dev.json` | Dev-specific TS config (source maps, less strict) |

**Dev mode migration management**:

```
pnpm migration:apply --tenant=dev
  ├─ Reads migration files from plugins/migrations/
  ├─ Connects to dev tenant schema (tenant_dev)
  ├─ Applies each migration in order (tracked in plugin_migration_status)
  ├─ Idempotent: skips already-applied migrations
  └─ On change: developer runs manually, or dev-entry.ts checks for pending migrations on start
```

**Integration with existing plan phases**:

The dev mode is built incrementally across existing phases:

| Phase | Dev Mode Component | Delivered With |
| ----- | ------------------ | -------------- |
| Phase 2 | Core dev registration endpoint (`POST /api/v1/dev/plugins/register`) | Container Lifecycle (adds dev-only route alongside production routes) |
| Phase 3 | Dev mode registration in `@plexica/vite-plugin` + shell dev watcher | MF Vite Preset + Shell (extends hot reload to include backend URL) |
| Phase 4 | Dev Kafka consumer group creation (prefix `plexica-dev-`) | Kafka Events (same consumer manager, different naming) |
| Phase 6 | `dev-entry.ts`, `dev-register.ts` in CLI template, `@plexica/sdk/dev` module | CLI + SDK |
| Phase 7 | CRM plugin dev mode verification | CRM Example Plugin (E2E: dev mode → changes → HMR → verify) |

**Dev Mode E2E Test**:

A dedicated E2E test verifies the dev mode flow:

```
Scenario: Plugin developer uses rapid dev mode
  Given a plugin project generated by create-plexica-plugin
  When the developer runs "pnpm dev"
  Then the plugin registers with the core API
  And the plugin UI appears in the shell
  And plugin API calls can be made via the proxy
  When the developer modifies a backend file
  Then the backend restarts automatically
  And the new code is active on the next API call
  When the developer presses Ctrl+C
  Then the plugin is unregistered from the core
  And the proxy routes are removed
  And plugin data tables in the dev schema are preserved
```

**NFR for dev mode**:

| ID | Category | Requirement | Target | Measurement |
| -- | -------- | ----------- | ------ | ----------- |
| NFR-16 | DX | Dev mode backend restart on file change | < 1s P95 | From file save to process restart + proxy ready |
| NFR-17 | DX | Dev mode registration | < 2s P95 | From `pnpm dev` to plugin visible in shell |
| NFR-18 | DX | Dev mode unregistration | < 1s P95 | From Ctrl+C to proxy routes removed |

---



## References

| Document              | Path / Reference                                            |
| --------------------- | ----------------------------------------------------------- |
| Spec 004              | `.forge/specs/004-plugin-system/spec.md`                    |
| Constitution          | `.forge/constitution.md`                                    |
| Architecture          | `.forge/architecture/architecture.md`                       |
| ADR-005               | `.forge/knowledge/adr/adr-005-module-federation-plugin-ui.md`|
| ADR-006               | `.forge/knowledge/adr/adr-006-plugin-tables-tenant-schema.md`|
| ADR-007               | `.forge/knowledge/adr/adr-007-plugin-migrations-core-executed.md`|
| ADR-008               | `.forge/knowledge/adr/adr-008-typescript-core-polyglot-plugins.md`|
| Decision Log          | `.forge/knowledge/decision-log.md`                          |
| Lessons Learned       | `.forge/knowledge/lessons-learned.md`                       |
| Docker Compose        | `docker-compose.yml`                                        |
| Core Prisma Schema    | `services/core-api/prisma/schema.prisma`                    |
| Tenant Prisma Schema  | `services/core-api/prisma/tenant-schema.prisma`             |

---

## FR/NFR Traceability

| FR-ID | Feature                              | Phase | Key Files                               | E2E Test Ref        |
| ----- | ------------------------------------ | ----- | --------------------------------------- | ------------------- |
| 004-01| Plugin registry CRUD                 | 1     | `services/registry.service.ts`          | AC-01               |
| 004-02| Manifest validation                  | 1     | `schema/manifest.ts`                    | AC-01 (invalid)     |
| 004-03| Plugin installation                  | 1,2,4 | `services/lifecycle.service.ts`         | AC-01               |
| 004-04| Activation/deactivation              | 5     | `routes/lifecycle.routes.ts`            | AC-01 (deactivate)  |
| 004-05| Uninstallation                       | 5     | `services/lifecycle.service.ts`         | AC-01 (uninstall)   |
| 004-06| Workspace visibility                 | 5     | `services/visibility.service.ts`        | AC-03               |
| 004-07| Vite Plugin Preset                   | 3     | `packages/vite-plugin/src/index.ts`     | AC-05 (CLI output)  |
| 004-08| Shell loads plugin remotes           | 3     | `apps/web/src/mf-host/plugin-loader.tsx` | AC-04              |
| 004-09| Shared dependencies                  | 3     | `packages/vite-plugin/src/shared-deps.ts`| NFR-02 bundle check|
| 004-10| React context propagation            | 3     | `use-plugin-context.ts`                 | AC-04               |
| 004-11| Extension points                     | 3     | `extension-slots/*.tsx`                 | AC-04               |
| 004-12| Error boundary per slot              | 3     | `error-boundary.tsx`                    | EC-15               |
| 004-13| Hot reload dev                       | 3     | `dev-server-registration.ts`            | EC-15 (dev only)    |
| 004-14| Core event emission                  | 4     | `events/emitter.ts`                     | EC-20               |
| 004-15| SDK event subscription               | 4,6   | `packages/sdk/src/index.ts`             | AC-06               |
| 004-16| Plugin custom events                 | 4     | `events/producer.ts`                    | EC-24               |
| 004-17| Consumer group auto-management       | 4     | `events/consumer-manager.service.ts`    | EC-22               |
| 004-18| Dead letter queue                    | 4     | `events/dlq/*`                          | AC-06               |
| 004-19| Consumer lag monitoring              | 4     | `events/metrics.ts`                     | NFR-03              |
| 004-20| API proxy                            | 2,5   | `services/proxy.service.ts`             | AC-04               |
| 004-21| Auth + tenant context headers        | 5     | `services/proxy.service.ts`             | EC-30               |
| 004-22| Health check + circuit breaker       | 2     | `services/health-check.service.ts`      | EC-15               |
| 004-23| CRM plugin MF UI                     | 7     | `examples/plugins/crm/ui/`             | AC-04               |
| 004-24| CRM plugin backend CRUD              | 7     | `examples/plugins/crm/src/routes/`     | AC-04               |
| 004-25| CRM plugin data tables               | 7     | `examples/plugins/crm/migrations/`     | AC-07               |
| 004-26| CRM plugin events                    | 7     | `examples/plugins/crm/src/routes/events.ts` | AC-04          |
| 004-27| CRM cross-workspace isolation        | 7     | `examples/plugins/crm/src/routes/`     | AC-04 (workspace B) |
| 004-28| Marketplace UI                       | 8     | `apps/web/src/pages/marketplace/`       | AC-05               |
| 004-29| CLI create-plexica-plugin            | 6     | `packages/cli/`                         | AC-05               |
| 004-30| Plugin SDK + OpenAPI                 | 6     | `packages/sdk/`                         | AC-05 (SDK usage)   |
| DM-01 | **Dev mode: rapid backend dev**      | 2,3,6 | `dev-entry.ts`, `dev-register.ts`, `packages/sdk/dev/` | NFR-16, NFR-17, NFR-18 |
| DM-02 | **Dev mode: backend hot restart**    | 2,6   | `tsx watch`, `packages/sdk/dev/register.ts` | NFR-16              |
| DM-03 | **Dev mode: registration endpoint**  | 2     | `services/core-api/src/modules/plugin/routes/dev.routes.ts` | NFR-17 |
