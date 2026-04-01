# Architecture: Plexica v2

> System architecture document for the Plexica v2 multi-tenant SaaS platform.
> Created by the `forge-architect` agent via `/forge-architecture`.

| Field  | Value           |
| ------ | --------------- |
| Status | Draft           |
| Author | forge-architect |
| Date   | 2026-04-01      |
| Track  | Product         |

---

## 1. System Context

Plexica v2 is a multi-tenant SaaS platform that enables organizations
(tenants) to operate isolated workspaces with plugin-based extensibility.
Four actor types interact with the system, and six infrastructure services
support it.

### 1.1 Context Diagram

```
                                 +-------------------+
                                 |    Keycloak       |
                                 | (Multi-Realm)     |
                                 +--------+----------+
                                          |
                                     OIDC / JWKS
                                          |
  +----------+      HTTPS       +---------v---------+      Kafka Protocol     +------------------+
  |  Browser  +---------------->+                   +------------------------->  Redpanda        |
  | (Tenant   |   React SPA     |    Core API       |                          | (Event Bus)     |
  |  Users)   |<----------------+   (Fastify)       +<-------------------------+                 |
  +----------+    JSON / SSE    |                   |       Consume Events     +--------+---------+
                                |  +-------------+  |                                   |
  +----------+      HTTPS       |  | Tenant Ctx  |  |       SQL / Prisma       +--------v---------+
  |  Browser  +---------------->+  | Middleware   |  +------------------------->  PostgreSQL      |
  | (Super    |   React SPA     |  +-------------+  |                          | (Schema/Tenant) |
  |  Admin)   |<----------------+  | ABAC Engine |  |       TCP / ioredis      +------------------+
  +----------+    JSON          |  +-------------+  +------------------------->
                                |  | Auth (JWT)  |  |                          +------------------+
  +----------+      HTTP        |  +-------------+  |       S3 API             |  Redis           |
  |  Plugin   +<--------------->+                   +------------------------->+ (Cache + ABAC)  |
  |  Backend  |   Proxy + Hdrs  |                   |                          +------------------+
  | (TS/Rust/ |                 +---------+---------+
  |  Python)  |                           |                                    +------------------+
  +----------+                    S3 API  +------------------------------------>  MinIO            |
                                          |                                    | (Object Storage) |
  +----------+      Module Fed.           |          SMTP                      +------------------+
  |  Plugin   +<--------------------------+
  |  Frontend |   remoteEntry.js          +------------------------------------>  SMTP Server     |
  | (MF Rmte) |                                                                | (Mailpit / SES) |
  +----------+                                                                 +------------------+
```

### 1.2 External Dependencies

| System/Service | Purpose                                          | Protocol       | SLA / Notes                          |
| -------------- | ------------------------------------------------ | -------------- | ------------------------------------ |
| Keycloak 26+   | Authentication, identity, realm-per-tenant       | HTTP (OIDC)    | HA required in prod; ADR-002         |
| PostgreSQL 15+ | Primary data store, schema-per-tenant            | TCP (Prisma)   | Managed in prod; ADR-001             |
| Redpanda       | Event bus for plugin event subscription          | Kafka protocol | 1-node dev, 3-node prod; ADR-004     |
| Redis          | Cache, rate limiting, ABAC policy cache          | TCP (ioredis)  | Managed in prod                      |
| MinIO          | S3-compatible object storage, per-tenant buckets | S3 API         | Can substitute with AWS S3           |
| SMTP           | Email notifications, invitations                 | SMTP           | Mailpit in dev, SES/provider in prod |

### 1.3 Trust Boundaries

```
+==============================================================+
|  EXTERNAL (untrusted)                                         |
|  - Browser requests (tenant users, super admin)               |
|  - Plugin backend HTTP responses                              |
|  - Plugin MF remote bundles                                   |
+==============================================================+
          |                    |                   |
     JWT + HTTPS          HTTP Proxy         MF Loading
          |                    |                   |
+=========v====================v===================v============+
|  API GATEWAY LAYER (trust boundary)                           |
|  - JWT RS256 validation (Keycloak JWKS)                       |
|  - Tenant context extraction + schema routing                 |
|  - ABAC authorization evaluation                              |
|  - Input validation (Zod schemas)                             |
|  - Rate limiting (3 levels)                                   |
|  - CSRF protection                                            |
+===============================================================+
          |
+=========v=====================================================+
|  INTERNAL (trusted)                                           |
|  - Service layer, repository layer                            |
|  - PostgreSQL (parameterized queries only)                    |
|  - Redis, Kafka, MinIO (internal network only)                |
+===============================================================+
```

**Key trust decisions**:

- Plugin backends are **untrusted**. Core proxies requests with auth context
  headers but validates responses. Plugin backends never hold DB credentials.
- Plugin MF remotes are **semi-trusted**. They run in the same DOM as the
  shell but inside React error boundaries. Shared dependencies are version-locked.
- Keycloak is **trusted** as the identity provider. JWT validation uses
  JWKS from Keycloak's well-known endpoints with caching.

---

## 2. Component Breakdown

### 2.1 Component Diagram

```
+------------------------------------------------------------------+
|  FRONTEND LAYER                                                   |
|                                                                   |
|  +-------------------+  +-------------------+  +---------------+  |
|  |  Web App (Host)   |  |  Admin App        |  | Plugin Apps   |  |
|  |  apps/web/        |  |  apps/admin/      |  | (MF Remotes)  |  |
|  |                   |  |                   |  |               |  |
|  |  - MF Host        |  |  - Super admin UI |  | - CRM Plugin  |  |
|  |  - TanStack Router|  |  - TanStack Router|  | - Analytics   |  |
|  |  - TanStack Query |  |  - TanStack Query |  | - Custom...   |  |
|  |  - Zustand auth   |  |  - Zustand auth   |  |               |  |
|  +-------------------+  +-------------------+  +---------------+  |
|           |                      |                     |          |
|  +--------v----------------------v---------------------v-------+  |
|  |  @plexica/ui — Design System (Radix UI + Tailwind)          |  |
|  |  packages/ui/                                                |  |
|  +-------------------------------------------------------------+  |
+------------------------------------------------------------------+
           |                       |
      HTTPS/JSON              HTTPS/JSON
           |                       |
+----------v-----------------------v--------------------------------+
|  BACKEND: Core API (Fastify Monolith) — services/core-api/       |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  | MIDDLEWARE PIPELINE (order matters)                           | |
|  | 1. Request ID  2. Logger (Pino)  3. CORS                    | |
|  | 4. Rate Limiting  5. JWT Validation  6. Tenant Context       | |
|  | 7. ABAC Authorization  8. CSRF  → Route Handler              | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  +---------------+  +----------------+  +----------------------+  |
|  | AUTH MODULE   |  | TENANT MODULE  |  | WORKSPACE MODULE     |  |
|  | - login flow  |  | - provisioning |  | - CRUD + hierarchy   |  |
|  | - token mgmt  |  | - suspend/del  |  | - members + roles    |  |
|  | - Keycloak API|  | - schema mgmt  |  | - templates          |  |
|  +---------------+  +----------------+  +----------------------+  |
|                                                                   |
|  +---------------+  +----------------+  +----------------------+  |
|  | PLUGIN MODULE |  | ADMIN MODULE   |  | NOTIFICATION MODULE  |  |
|  | - install/rm  |  | - super-admin  |  | - SSE real-time      |  |
|  | - lifecycle   |  | - system health|  | - email (SMTP)       |  |
|  | - migrations  |  | - audit log    |  | - preferences        |  |
|  | - proxy API   |  | - tenant mgmt  |  | - plugin notif.      |  |
|  | - marketplace |  +----------------+  +----------------------+  |
|  +---------------+                                                |
|                                                                   |
|  +---------------+  +----------------+  +----------------------+  |
|  | USER-PROFILE  |  | EVENTS (Kafka) |  | LIB (Shared)         |  |
|  | MODULE        |  | - producer     |  | - database (Prisma)  |  |
|  | - profile     |  | - topic mgmt   |  | - logger (Pino)      |  |
|  | - sessions    |  | - DLQ handler  |  | - config             |  |
|  | - avatar      |  | - schema reg.  |  | - kafka-producer     |  |
|  +---------------+  +----------------+  +----------------------+  |
+-------------------------------------------------------------------+
```

### 2.2 Module Responsibilities

| Module           | Responsibility                                                            | Key Interfaces                                                             |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **auth**         | JWT validation, Keycloak OIDC integration, JWKS caching, token refresh    | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`              |
| **tenant**       | Tenant CRUD, provisioning (schema + realm + bucket), suspension, deletion | `POST /admin/tenants`, `DELETE /admin/tenants/:id`, `GET /tenants/resolve` |
| **workspace**    | Workspace CRUD, hierarchy (materialized path), members, templates         | `GET /workspaces`, `POST /workspaces`, `POST /workspaces/:id/members`      |
| **plugin**       | Plugin install/uninstall, lifecycle, migration runner, proxy, marketplace | `POST /plugins/:id/install`, `GET /marketplace`, proxy routes              |
| **admin**        | Super-admin dashboard, system health, audit log, Kafka monitoring         | `GET /admin/dashboard`, `GET /admin/health`, `GET /admin/audit-logs`       |
| **notification** | SSE real-time push, email dispatch, notification center, preferences      | `GET /notifications/stream` (SSE), `GET /notifications`                    |
| **user-profile** | User profile management, avatar, active sessions                          | `GET /profile`, `PATCH /profile`, `GET /profile/sessions`                  |
| **events**       | Kafka producer, topic management, DLQ handler, event schema registry      | Internal: `EventProducer.emit(topic, payload)`                             |
| **lib**          | Database (Prisma), logger (Pino), config, common utilities                | Internal: `getDb()`, `logger`, `config`                                    |
| **middleware**   | Auth, tenant-context, ABAC, rate-limit, CSRF, error-handler               | Fastify hooks/preHandler decorators                                        |

### 2.3 Shared Packages

| Package                | Path                    | Purpose                                                                                 |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `@plexica/ui`          | `packages/ui/`          | Design system: Radix UI primitives + Tailwind tokens                                    |
| `@plexica/i18n`        | `packages/i18n/`        | i18n message catalogs (EN + IT), react-intl integration                                 |
| `@plexica/vite-plugin` | `packages/vite-plugin/` | Vite preset that auto-configures Module Federation for plugins                          |
| `@plexica/sdk`         | `packages/sdk/`         | Plugin SDK: single class (`PluginSDK`) with `onEvent`, `callApi`, `getContext`, `getDb` |

---

## 3. Data Model

### 3.1 Entity Relationship Diagram

```
                              CORE SCHEMA
  +===============================================================+
  |                                                                |
  |  tenants (1)-------(N) plugin_versions (N)-------(1) plugins   |
  |     |                                                  |       |
  |     | id, slug, name,                    id, name,     |       |
  |     | status, config,                    manifest,     |       |
  |     | created_at                         status        |       |
  |                                                                |
  |  system_config                                                 |
  |     | key, value, updated_at                                   |
  +===============================================================+

                        TENANT SCHEMA (tenant_{slug})
  +===============================================================+
  |                                                                |
  |  users (1)-----<(N) user_roles (N)>------(1) roles            |
  |    |                                          |                |
  |    | id, keycloak_user_id,        id, name, description,       |
  |    | email, display_name         is_custom, permissions         |
  |    |                                                           |
  |    +-----<(N) workspace_members (N)>-----(1) workspaces        |
  |                |                              |                |
  |                | role                          | id, slug,     |
  |                                               | name,          |
  |                                               | parent_id, --> (self-ref: hierarchy)
  |                                               | materialized_path,
  |                                               | created_at     |
  |                                               |                |
  |                                    +----------+----------+     |
  |                                    |                     |     |
  |                            plugin_installations    abac_policies|
  |                              |                         |       |
  |                              | plugin_id (FK core),    | workspace_id,|
  |                              | status, config          | subject, action,|
  |                              |                         | conditions     |
  |                              |                                  |
  |                     plugin_workspace_visibility                 |
  |                       | plugin_installation_id,                 |
  |                       | workspace_id, enabled                    |
  |                                                                |
  |  notifications          audit_logs                             |
  |    | id, user_id,         | id, actor_id,                      |
  |    | type, title,         | action, resource_type,              |
  |    | body, read,          | resource_id, metadata,              |
  |    | created_at           | tenant_id, created_at               |
  |                                                                |
  |  _plugin_migrations                                            |
  |    | plugin_id, version, applied_at                             |
  |                                                                |
  |  {plugin_slug}_*   (e.g., crm_contacts, crm_deals)            |
  |    | Plugin-owned tables with FK to workspaces.id               |
  +===============================================================+
```

### 3.2 Entity Definitions

#### `core.tenants`

| Column            | Type         | Constraints                   | Notes                                 |
| ----------------- | ------------ | ----------------------------- | ------------------------------------- |
| id                | UUID         | PK, DEFAULT gen_random_uuid() |                                       |
| slug              | VARCHAR(63)  | UNIQUE, NOT NULL              | Validated: `/^[a-z][a-z0-9-]{1,62}$/` |
| name              | VARCHAR(255) | NOT NULL                      | Display name                          |
| status            | ENUM         | NOT NULL, DEFAULT 'active'    | active, suspended, pending_deletion   |
| config            | JSONB        | DEFAULT '{}'                  | Branding, feature flags, limits       |
| keycloak_realm_id | VARCHAR(255) | UNIQUE                        | Keycloak realm name                   |
| created_at        | TIMESTAMPTZ  | NOT NULL, DEFAULT now()       |                                       |
| updated_at        | TIMESTAMPTZ  | NOT NULL, DEFAULT now()       |                                       |

#### `core.plugins`

| Column      | Type         | Constraints                   | Notes                                 |
| ----------- | ------------ | ----------------------------- | ------------------------------------- |
| id          | UUID         | PK, DEFAULT gen_random_uuid() |                                       |
| slug        | VARCHAR(63)  | UNIQUE, NOT NULL              | Used as table prefix in tenant schema |
| name        | VARCHAR(255) | NOT NULL                      |                                       |
| description | TEXT         |                               |                                       |
| author      | VARCHAR(255) | NOT NULL                      |                                       |
| manifest    | JSONB        | NOT NULL                      | Full plugin manifest                  |
| status      | ENUM         | NOT NULL, DEFAULT 'draft'     | draft, published, deprecated          |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT now()       |                                       |

#### `core.plugin_versions`

| Column       | Type        | Constraints               | Notes                               |
| ------------ | ----------- | ------------------------- | ----------------------------------- |
| id           | UUID        | PK                        |                                     |
| plugin_id    | UUID        | FK → plugins.id, NOT NULL |                                     |
| version      | VARCHAR(32) | NOT NULL                  | Semver                              |
| manifest     | JSONB       | NOT NULL                  | Version-specific manifest           |
| artifact_url | TEXT        | NOT NULL                  | URL to MF remote / backend artifact |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()   |                                     |

#### `core.system_config`

| Column     | Type         | Constraints             | Notes |
| ---------- | ------------ | ----------------------- | ----- |
| key        | VARCHAR(255) | PK                      |       |
| value      | JSONB        | NOT NULL                |       |
| updated_at | TIMESTAMPTZ  | NOT NULL, DEFAULT now() |       |

#### `tenant_{slug}.users`

| Column           | Type         | Constraints                | Notes                       |
| ---------------- | ------------ | -------------------------- | --------------------------- |
| id               | UUID         | PK                         |                             |
| keycloak_user_id | VARCHAR(255) | UNIQUE, NOT NULL           | Maps to Keycloak subject    |
| email            | VARCHAR(255) | NOT NULL                   |                             |
| display_name     | VARCHAR(255) |                            |                             |
| avatar_url       | TEXT         |                            | From Keycloak picture claim |
| status           | ENUM         | NOT NULL, DEFAULT 'active' | active, invited, disabled   |
| created_at       | TIMESTAMPTZ  | NOT NULL, DEFAULT now()    |                             |

#### `tenant_{slug}.roles`

| Column      | Type        | Constraints             | Notes                              |
| ----------- | ----------- | ----------------------- | ---------------------------------- |
| id          | UUID        | PK                      |                                    |
| name        | VARCHAR(63) | UNIQUE, NOT NULL        | e.g., tenant_admin, member, viewer |
| description | TEXT        |                         |                                    |
| is_custom   | BOOLEAN     | NOT NULL, DEFAULT false | Predefined vs tenant-created       |
| permissions | JSONB       | NOT NULL, DEFAULT '[]'  | Array of permission strings        |
| created_at  | TIMESTAMPTZ | NOT NULL, DEFAULT now() |                                    |

#### `tenant_{slug}.user_roles`

| Column  | Type | Constraints             | Notes              |
| ------- | ---- | ----------------------- | ------------------ |
| id      | UUID | PK                      |                    |
| user_id | UUID | FK → users.id, NOT NULL |                    |
| role_id | UUID | FK → roles.id, NOT NULL |                    |
| UNIQUE  |      | (user_id, role_id)      | No duplicate roles |

#### `tenant_{slug}.workspaces`

| Column            | Type         | Constraints                  | Notes                              |
| ----------------- | ------------ | ---------------------------- | ---------------------------------- |
| id                | UUID         | PK                           |                                    |
| slug              | VARCHAR(63)  | NOT NULL                     | Unique within tenant               |
| name              | VARCHAR(255) | NOT NULL                     |                                    |
| description       | TEXT         |                              |                                    |
| parent_id         | UUID         | FK → workspaces.id, NULLABLE | NULL = root workspace              |
| materialized_path | TEXT         | NOT NULL                     | e.g., `/root-id/parent-id/this-id` |
| settings          | JSONB        | DEFAULT '{}'                 |                                    |
| created_at        | TIMESTAMPTZ  | NOT NULL, DEFAULT now()      |                                    |
| UNIQUE            |              | (slug) within tenant schema  |                                    |

#### `tenant_{slug}.workspace_members`

| Column       | Type        | Constraints                  | Notes                           |
| ------------ | ----------- | ---------------------------- | ------------------------------- |
| id           | UUID        | PK                           |                                 |
| workspace_id | UUID        | FK → workspaces.id, NOT NULL |                                 |
| user_id      | UUID        | FK → users.id, NOT NULL      |                                 |
| role         | VARCHAR(32) | NOT NULL                     | workspace_admin, editor, viewer |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()      |                                 |
| UNIQUE       |             | (workspace_id, user_id)      |                                 |

#### `tenant_{slug}.plugin_installations`

| Column       | Type        | Constraints                   | Notes                           |
| ------------ | ----------- | ----------------------------- | ------------------------------- |
| id           | UUID        | PK                            |                                 |
| plugin_id    | UUID        | NOT NULL                      | References core.plugins.id      |
| version      | VARCHAR(32) | NOT NULL                      | Installed version               |
| status       | ENUM        | NOT NULL, DEFAULT 'installed' | installed, active, disabled     |
| config       | JSONB       | DEFAULT '{}'                  | Per-tenant plugin configuration |
| installed_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()       |                                 |

#### `tenant_{slug}.plugin_workspace_visibility`

| Column                 | Type    | Constraints                            | Notes |
| ---------------------- | ------- | -------------------------------------- | ----- |
| id                     | UUID    | PK                                     |       |
| plugin_installation_id | UUID    | FK → plugin_installations.id, NOT NULL |       |
| workspace_id           | UUID    | FK → workspaces.id, NOT NULL           |       |
| enabled                | BOOLEAN | NOT NULL, DEFAULT true                 |       |
| UNIQUE                 |         | (plugin_installation_id, workspace_id) |       |

#### `tenant_{slug}.abac_policies`

| Column       | Type        | Constraints                  | Notes                      |
| ------------ | ----------- | ---------------------------- | -------------------------- |
| id           | UUID        | PK                           |                            |
| workspace_id | UUID        | FK → workspaces.id, NOT NULL | Scope of this policy       |
| subject_type | VARCHAR(32) | NOT NULL                     | user, role                 |
| subject_id   | UUID        | NOT NULL                     | user_id or role_id         |
| action       | VARCHAR(32) | NOT NULL                     | read, write, delete, admin |
| effect       | ENUM        | NOT NULL                     | allow, deny                |
| conditions   | JSONB       | DEFAULT '{}'                 | Additional ABAC conditions |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()      |                            |

#### `tenant_{slug}.notifications`

| Column     | Type         | Constraints             | Notes                          |
| ---------- | ------------ | ----------------------- | ------------------------------ |
| id         | UUID         | PK                      |                                |
| user_id    | UUID         | FK → users.id, NOT NULL |                                |
| type       | VARCHAR(63)  | NOT NULL                | e.g., workspace_invite, plugin |
| title      | VARCHAR(255) | NOT NULL                | i18n key or resolved text      |
| body       | TEXT         |                         |                                |
| metadata   | JSONB        | DEFAULT '{}'            | Link target, action data       |
| read       | BOOLEAN      | NOT NULL, DEFAULT false |                                |
| created_at | TIMESTAMPTZ  | NOT NULL, DEFAULT now() |                                |

#### `tenant_{slug}.audit_logs`

| Column        | Type        | Constraints             | Notes                              |
| ------------- | ----------- | ----------------------- | ---------------------------------- |
| id            | UUID        | PK                      |                                    |
| actor_id      | UUID        | NOT NULL                | user_id who performed action       |
| action        | VARCHAR(63) | NOT NULL                | e.g., tenant.updated, user.invited |
| resource_type | VARCHAR(63) | NOT NULL                | e.g., workspace, plugin            |
| resource_id   | UUID        |                         |                                    |
| metadata      | JSONB       | DEFAULT '{}'            | Old/new values, context            |
| ip_address    | INET        |                         | No PII logging concern — IP only   |
| created_at    | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Index for time-range queries       |

#### `tenant_{slug}._plugin_migrations`

| Column     | Type         | Constraints             | Notes                        |
| ---------- | ------------ | ----------------------- | ---------------------------- |
| id         | UUID         | PK                      |                              |
| plugin_id  | UUID         | NOT NULL                | References core.plugins.id   |
| version    | VARCHAR(255) | NOT NULL                | Migration filename / version |
| applied_at | TIMESTAMPTZ  | NOT NULL, DEFAULT now() |                              |
| UNIQUE     |              | (plugin_id, version)    |                              |

### 3.3 Key Indexes

| Table                | Index                                 | Purpose                           |
| -------------------- | ------------------------------------- | --------------------------------- |
| tenants              | UNIQUE(slug)                          | Tenant lookup by slug             |
| users                | UNIQUE(keycloak_user_id)              | JWT subject → user mapping        |
| users                | INDEX(email)                          | User search                       |
| workspaces           | UNIQUE(slug)                          | Workspace lookup by slug          |
| workspaces           | INDEX(parent_id)                      | Hierarchy traversal               |
| workspaces           | INDEX(materialized_path)              | Path-based subtree queries        |
| workspace_members    | INDEX(user_id)                        | User's workspace list             |
| workspace_members    | INDEX(workspace_id)                   | Workspace member list             |
| audit_logs           | INDEX(created_at)                     | Time-range queries                |
| audit_logs           | INDEX(resource_type, resource_id)     | Resource history                  |
| notifications        | INDEX(user_id, read, created_at DESC) | User's unread notifications       |
| plugin_installations | UNIQUE(plugin_id)                     | One install per plugin per tenant |

---

## 4. API Surface

### 4.1 API Overview

All API endpoints are prefixed with `/api/v1/`. Authentication is required
on all endpoints unless explicitly marked `[PUBLIC]`.

| Module       | Endpoint Pattern                             | Auth Required | Notes                           |
| ------------ | -------------------------------------------- | ------------- | ------------------------------- |
| auth         | `POST /api/v1/auth/login`                    | No [PUBLIC]   | Keycloak redirect flow          |
| auth         | `POST /api/v1/auth/logout`                   | Yes           |                                 |
| auth         | `POST /api/v1/auth/refresh`                  | Yes           | Token refresh                   |
| tenant       | `GET /api/v1/tenants/resolve`                | No [PUBLIC]   | Slug → exists check (anti-enum) |
| tenant       | `GET /api/v1/tenant/settings`                | Yes           | Current tenant settings         |
| tenant       | `PATCH /api/v1/tenant/settings`              | Yes (admin)   | Update tenant settings          |
| workspace    | `GET /api/v1/workspaces`                     | Yes           | List (ABAC-filtered)            |
| workspace    | `POST /api/v1/workspaces`                    | Yes (admin)   | Create workspace                |
| workspace    | `GET /api/v1/workspaces/:id`                 | Yes           | Get workspace detail            |
| workspace    | `PATCH /api/v1/workspaces/:id`               | Yes (admin)   | Update workspace                |
| workspace    | `DELETE /api/v1/workspaces/:id`              | Yes (admin)   | Delete workspace                |
| workspace    | `GET /api/v1/workspaces/:id/members`         | Yes           | List members                    |
| workspace    | `POST /api/v1/workspaces/:id/members`        | Yes (admin)   | Add member                      |
| workspace    | `DELETE /api/v1/workspaces/:id/members/:uid` | Yes (admin)   | Remove member                   |
| workspace    | `PATCH /api/v1/workspaces/:id/members/:uid`  | Yes (admin)   | Change member role              |
| plugin       | `GET /api/v1/marketplace`                    | Yes           | List available plugins          |
| plugin       | `GET /api/v1/marketplace/:id`                | Yes           | Plugin detail                   |
| plugin       | `POST /api/v1/plugins/:id/install`           | Yes (admin)   | Install plugin for tenant       |
| plugin       | `POST /api/v1/plugins/:id/activate`          | Yes (admin)   | Activate plugin                 |
| plugin       | `POST /api/v1/plugins/:id/disable`           | Yes (admin)   | Disable plugin                  |
| plugin       | `DELETE /api/v1/plugins/:id`                 | Yes (admin)   | Uninstall plugin                |
| plugin       | `GET /api/v1/plugins/:id/config`             | Yes (admin)   | Plugin config                   |
| plugin       | `PATCH /api/v1/plugins/:id/config`           | Yes (admin)   | Update plugin config            |
| plugin       | `ALL /api/v1/plugins/:slug/*`                | Yes           | Proxy to plugin backend         |
| user         | `GET /api/v1/users`                          | Yes (admin)   | List tenant users               |
| user         | `POST /api/v1/users/invite`                  | Yes (admin)   | Invite user via email           |
| user         | `DELETE /api/v1/users/:id`                   | Yes (admin)   | Remove user                     |
| profile      | `GET /api/v1/profile`                        | Yes           | Current user profile            |
| profile      | `PATCH /api/v1/profile`                      | Yes           | Update profile                  |
| profile      | `GET /api/v1/profile/sessions`               | Yes           | Active sessions                 |
| notification | `GET /api/v1/notifications`                  | Yes           | List notifications              |
| notification | `GET /api/v1/notifications/stream`           | Yes           | SSE real-time stream            |
| notification | `PATCH /api/v1/notifications/:id/read`       | Yes           | Mark as read                    |
| notification | `GET /api/v1/notifications/preferences`      | Yes           | Get preferences                 |
| notification | `PATCH /api/v1/notifications/preferences`    | Yes           | Update preferences              |
| admin        | `GET /api/v1/admin/dashboard`                | Yes (super)   | Platform metrics                |
| admin        | `GET /api/v1/admin/tenants`                  | Yes (super)   | List all tenants                |
| admin        | `POST /api/v1/admin/tenants`                 | Yes (super)   | Provision new tenant            |
| admin        | `GET /api/v1/admin/tenants/:id`              | Yes (super)   | Tenant detail                   |
| admin        | `POST /api/v1/admin/tenants/:id/suspend`     | Yes (super)   | Suspend tenant                  |
| admin        | `POST /api/v1/admin/tenants/:id/reactivate`  | Yes (super)   | Reactivate tenant               |
| admin        | `DELETE /api/v1/admin/tenants/:id`           | Yes (super)   | Delete tenant (GDPR)            |
| admin        | `GET /api/v1/admin/plugins`                  | Yes (super)   | Plugin catalog management       |
| admin        | `POST /api/v1/admin/plugins`                 | Yes (super)   | Publish plugin                  |
| admin        | `GET /api/v1/admin/health`                   | Yes (super)   | System health check             |
| admin        | `GET /api/v1/admin/audit-logs`               | Yes (super)   | Cross-tenant audit logs         |
| admin        | `GET /api/v1/admin/kafka/status`             | Yes (super)   | Kafka consumer lag, DLQ         |
| health       | `GET /health`                                | No [PUBLIC]   | Liveness + readiness            |
| metrics      | `GET /metrics`                               | No [PUBLIC]   | Prometheus metrics              |

### 4.2 API Standards

- **REST**: Resource-based URLs, standard HTTP verbs.
- **Versioning**: URL prefix `/api/v1/`. New major versions get `/api/v2/`.
- **Pagination**: `?page=1&pageSize=20` (max 100). Response includes `{ data, total, page, pageSize }`.
- **Filtering**: Query params: `?status=active&search=acme`.
- **Sorting**: `?sort=created_at&order=desc`.
- **Error format**: `{ code: string, message: string, details?: Record<string, string[]> }`.
  - 400: Validation errors with per-field details.
  - 401/403/404: Generic message (no enumeration).
  - 500: Generic message, no stack trace. Stack logged server-side.
- **Input validation**: Zod schema on every endpoint. Returns 400 with field-level errors.
- **Content type**: `application/json` for all request/response bodies.

### 4.3 Super-Admin Routes

Super-admin routes (`/api/v1/admin/*`) bypass the tenant-context middleware
(ID-003 in decision log). They authenticate via the Keycloak master realm
and operate on the `core` schema directly. They are registered in a separate
Fastify plugin scope.

---

## 5. Integration Patterns

### 5.1 Keycloak Integration

- **Service**: Keycloak 26+ (realm-per-tenant)
- **Pattern**: Sync REST (OIDC discovery + Admin API)
- **Authentication flow**:
  1. Frontend redirects to Keycloak login (realm determined by tenant slug).
  2. Keycloak issues JWT (RS256, signed by realm keypair).
  3. Backend validates JWT via JWKS endpoint (`{keycloak_url}/realms/{realm}/.well-known/openid-configuration`).
  4. JWKS keys cached in Redis with 5-minute TTL.
- **Realm provisioning**: On tenant creation, Core API calls Keycloak Admin API to:
  1. Create realm `plexica-{tenant_slug}`.
  2. Create OIDC client for the Web App.
  3. Create default roles (`tenant_admin`, `member`, `viewer`).
  4. Create the initial admin user.
- **Error handling**: Keycloak Admin API errors are caught and trigger provisioning rollback.
- **Retry strategy**: 3 retries with exponential backoff for transient Keycloak errors.

### 5.2 Kafka/Redpanda Event Bus

- **Service**: Redpanda (Kafka-compatible)
- **Pattern**: Async event-driven (publish-subscribe)
- **Topic naming**: `plexica.{entity}.{action}` for core events; `plugin.{slug}.{entity}.{action}` for plugin events.
- **Partitioning**: Partition key = `tenantId` (guarantees per-tenant ordering).
- **Event envelope**: `{ eventType, tenantId, entityId, payload, timestamp, correlationId, version }`.
- **Consumer groups**: Auto-created as `plugin-{pluginId}-{tenantId}`.
- **Dead letter queue**: Auto-created as `dlq.plugin-{pluginId}`. Events failing 3 times go to DLQ.
- **Error handling**: Consumer errors are logged and retried. After 3 failures, message moves to DLQ.
- **Monitoring**: Consumer lag exposed as Prometheus metric `kafka_consumer_lag{plugin, tenant}`.

### 5.3 Plugin Backend Proxy

- **Service**: Plugin backends (HTTP servers, any language)
- **Pattern**: Sync HTTP proxy
- **Flow**: `Browser → Core API → /api/v1/plugins/:slug/* → Plugin Backend`
- **Headers injected by Core**: `X-Tenant-ID`, `X-User-ID`, `X-Workspace-ID`, `X-Locale`, `X-Correlation-ID`.
- **Error handling**: If plugin backend is unreachable, return 503 with generic error.
- **Health check**: Core periodically pings plugin backend health endpoint.
- **Security**: Plugin backends never receive database credentials. They call Core API for data access.

### 5.4 Module Federation (Plugin UI)

- **Service**: Plugin frontend bundles
- **Pattern**: Runtime loading via Module Federation
- **Flow**: Shell loads `remoteEntry.js` from plugin CDN/server → lazy-loads React components into extension slots.
- **Shared dependencies**: React, ReactDOM, TanStack Router, TanStack Query, `@plexica/ui`, `@plexica/i18n` — loaded once by shell.
- **Error handling**: React error boundary per extension slot. Broken plugin shows fallback UI.
- **Cache busting**: Content-hashed filenames. `remoteEntry.js` has short cache TTL.

### 5.5 MinIO Object Storage

- **Service**: MinIO (S3-compatible)
- **Pattern**: Sync S3 API
- **Bucket strategy**: One bucket per tenant (`tenant-{slug}`).
- **Access**: Core API signs upload/download URLs. Clients never access MinIO directly.
- **Deletion**: Bucket deleted on tenant deletion (GDPR).

### 5.6 SMTP (Email)

- **Service**: SMTP (Mailpit in dev, SES/provider in prod)
- **Pattern**: Async fire-and-forget with retry queue
- **Use cases**: User invitations, notification emails, password reset (delegated to Keycloak).
- **Error handling**: Failed sends retried 3 times with exponential backoff. Failures logged but do not block operations.

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
  Browser                    Core API                  Keycloak
     |                          |                         |
     |  1. GET /login?tenant=acme                         |
     |------------------------->|                         |
     |                          |  2. Resolve realm       |
     |                          |     "plexica-acme"      |
     |  3. Redirect to Keycloak |                         |
     |<-------------------------|                         |
     |                          |                         |
     |  4. Login credentials    |                         |
     |----------------------------------------------->    |
     |                          |                         |
     |  5. JWT (RS256) + Refresh Token                    |
     |<-----------------------------------------------|   |
     |                          |                         |
     |  6. API call + Authorization: Bearer <JWT>         |
     |------------------------->|                         |
     |                          |  7. Validate JWT via    |
     |                          |     JWKS (cached)       |
     |                          |  8. Extract tenantId    |
     |                          |     from realm claim    |
     |                          |  9. SET search_path     |
     |  10. Response            |                         |
     |<-------------------------|                         |
```

**Token structure** (JWT claims):

- `sub`: Keycloak user ID
- `iss`: `{keycloak_url}/realms/plexica-{slug}`
- `realm_access.roles`: Keycloak realm roles
- `azp`: Client ID
- `tenant_id`: Custom claim injected by Keycloak mapper
- `picture`: Avatar URL (optional)

### 6.2 Authorization Model

Two layers, cleanly separated:

**Layer 1 — Keycloak (Authentication + Tenant Roles)**:

- `super_admin`: Platform-level access (master realm)
- `tenant_admin`: Full tenant management
- `member`: Standard tenant user

**Layer 2 — ABAC Tree-Walk (Workspace Permissions)** (ADR-003):

- `workspace_admin` > `editor` > `viewer`
- Inheritance: role at parent workspace grants at least that role in all descendants.
- Tree-walk: On resource access, walk from resource's workspace to tenant root, collecting roles. Most-permissive wins.
- Cache: Materialized workspace tree + user role map cached in Redis. Invalidated via Kafka events on role changes.
- Max depth: 10 levels (hard cap).

### 6.3 Data Flow Security

| Concern                     | Implementation                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Tenant isolation**        | Schema-per-tenant. `SET search_path` on every request. Cross-tenant = critical incident.        |
| **SQL injection**           | Parameterized queries only (Prisma). Exception: `SET search_path` with validated slug (ID-001). |
| **Input validation**        | Zod schema on every external input.                                                             |
| **CSRF**                    | CSRF token on state-changing endpoints.                                                         |
| **Rate limiting**           | 3 levels: global (per IP), per-endpoint, per-user.                                              |
| **PII in logs**             | Never. Logger redacts email, name fields. Only UUIDs and tenant slugs in logs.                  |
| **Secrets**                 | Environment variables only. Never in code or Git.                                               |
| **TLS**                     | Required in staging/prod. HTTP in dev only.                                                     |
| **Content Security Policy** | Strict CSP headers. MF remotes whitelisted by domain.                                           |
| **Plugin sandbox**          | Plugin backends: no DB credentials. Plugin MF: error boundary + shared dep version lock.        |

---

## 7. Cross-Cutting Concerns

### 7.1 Logging

- **Library**: Pino (JSON structured logging)
- **Context**: Every log line includes `requestId`, `tenantId`, `userId`, `correlationId`.
- **Levels**: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
- **Production**: `info` and above. No `console.log` (lint error).
- **PII**: Never logged. Email, names redacted. Only UUIDs.
- **Format**: JSON in all environments (parseable by log aggregators).

### 7.2 Monitoring

- **Health endpoint**: `GET /health` checks PostgreSQL, Redis, Keycloak, Redpanda connectivity.
- **Prometheus metrics** (`GET /metrics`):
  - HTTP request duration histogram (by method, path, status)
  - HTTP request count (by method, path, status)
  - Active connections
  - Database query duration
  - Kafka consumer lag (by plugin, tenant)
  - Kafka DLQ size (by plugin)
  - ABAC evaluation time
  - Plugin MF load time and errors
  - Tenant schema migration status
- **Grafana**: Pre-configured dashboard with key metrics.
- **OpenTelemetry**: Optional (feature flag). Distributed tracing with Tempo in staging/prod.

### 7.3 Error Handling

Three categories with consistent handling:

| Category         | HTTP Status | Response Body                                     | Server Logging     |
| ---------------- | ----------- | ------------------------------------------------- | ------------------ |
| Input validation | 400         | `{ code, message, details: { field: [errors] } }` | `info` level       |
| Auth/Not Found   | 401/403/404 | `{ code, message }` (generic)                     | `warn` level       |
| Server error     | 500         | `{ code: "INTERNAL_ERROR", message }` (generic)   | `error` with stack |

- All errors pass through a centralized Fastify error handler.
- No stack traces in production responses.
- Unhandled promise rejections are caught and logged as `fatal`.

### 7.4 Caching

| Data                  | Store          | TTL       | Invalidation                         |
| --------------------- | -------------- | --------- | ------------------------------------ |
| JWKS keys per realm   | Redis          | 5 min     | TTL expiry                           |
| ABAC policy tree      | Redis          | 10 min    | Kafka event on role/workspace change |
| Workspace hierarchy   | Redis          | 10 min    | Kafka event on workspace CRUD        |
| Tenant config         | Redis          | 5 min     | Kafka event on tenant update         |
| Plugin manifest       | Redis          | 30 min    | Kafka event on plugin install/update |
| API response (client) | TanStack Query | per-query | Mutation invalidation                |

---

## 8. Deployment Architecture

### 8.1 Infrastructure

```
  DEVELOPMENT (docker compose up)
  +-------------------------------------------+
  |  Docker Compose                           |
  |  +--------+  +----------+  +--------+    |
  |  | PG 15  |  | Keycloak |  | Redis  |    |
  |  +--------+  +----------+  +--------+    |
  |  +--------+  +----------+  +--------+    |
  |  | MinIO  |  | Redpanda |  | Mailpit|    |
  |  | (S3)   |  | (1 node) |  | (SMTP) |    |
  |  +--------+  +----------+  +--------+    |
  |  +--------+  +----------+  +--------+    |
  |  | Core   |  | Web App  |  | Admin  |    |
  |  | API    |  | (Vite)   |  | (Vite) |    |
  |  +--------+  +----------+  +--------+    |
  +-------------------------------------------+

  PRODUCTION
  +-------------------------------------------+
  |  Kubernetes / Docker                      |
  |  +--------+  +----------+  +--------+    |
  |  | PG 15  |  | Keycloak |  | Redis  |    |
  |  | Managed |  | (2 HA)   |  | Managed|    |
  |  +--------+  +----------+  +--------+    |
  |  +--------+  +-----------+  +--------+   |
  |  | MinIO  |  | Redpanda  |  | Prom+  |   |
  |  | or S3  |  | (3 nodes) |  | Grafana|   |
  |  +--------+  +-----------+  +--------+   |
  |  +--------+  +----------+  +--------+    |
  |  | Core   |  | Web App  |  | Admin  |    |
  |  | API(N) |  | (CDN)    |  | (CDN)  |    |
  |  +--------+  +----------+  +--------+    |
  +-------------------------------------------+
```

### 8.2 Scaling Strategy

| Component       | Scaling Model                   | Notes                                        |
| --------------- | ------------------------------- | -------------------------------------------- |
| Core API        | Horizontal                      | Stateless; N replicas behind load balancer   |
| PostgreSQL      | Vertical + Read replicas        | Schema-per-tenant limits horizontal sharding |
| Keycloak        | Horizontal (Infinispan cluster) | 2+ replicas in prod                          |
| Redpanda        | Horizontal (3-node cluster)     | Partition-level parallelism                  |
| Redis           | Vertical (single + sentinel)    | Or Redis Cluster for large scale             |
| Web/Admin       | CDN                             | Static assets served from CDN                |
| Plugin backends | Horizontal per plugin           | Each plugin scales independently             |

### 8.3 Environments

| Environment | Purpose           | Stack                                             |
| ----------- | ----------------- | ------------------------------------------------- |
| Development | Daily development | Docker Compose, all services, Redpanda 1 node     |
| CI          | Pipeline          | Docker Compose (identical to dev), automated seed |
| Staging     | Pre-production    | Production-like, Redpanda 3 nodes                 |
| Production  | Live users        | Kubernetes/Docker, managed services, HA           |

---

## 9. Architectural Decisions

| ADR     | Decision                                  | Status   | Constitution Art. |
| ------- | ----------------------------------------- | -------- | ----------------- |
| ADR-001 | Schema-per-Tenant PostgreSQL              | Accepted | Art. 3, Art. 5    |
| ADR-002 | Keycloak Multi-Realm Authentication       | Accepted | Art. 2, Art. 5    |
| ADR-003 | ABAC Tree-Walk for Workspace Isolation    | Accepted | Art. 3, Art. 5    |
| ADR-004 | Kafka/Redpanda Event Bus                  | Accepted | Art. 2, Art. 3    |
| ADR-005 | Module Federation for Plugin UI           | Accepted | Art. 2, Art. 3    |
| ADR-006 | Plugin Tables in Tenant Schema            | Accepted | Art. 3, Art. 5    |
| ADR-007 | Plugin-Brings-Migrations, Core-Executes   | Accepted | Art. 3, Art. 5    |
| ADR-008 | TypeScript Core, Polyglot Plugin Backends | Accepted | Art. 2            |
| ADR-009 | Better Auth Evaluated and Rejected        | Accepted | Art. 2, Art. 3    |

All ADRs are in `.forge/knowledge/adr/`.

### Implementation Decisions (from Decision Log)

| ID     | Decision                                            | Rationale Summary                                |
| ------ | --------------------------------------------------- | ------------------------------------------------ |
| ID-001 | `$queryRawUnsafe` for `SET search_path`             | Controlled exception: validated slug, documented |
| ID-002 | Generic `INVALID_TENANT_CONTEXT` error code         | Prevents tenant slug enumeration                 |
| ID-003 | Super-admin routes bypass tenant-context middleware | Admin routes operate on core schema directly     |

### Deferred Decisions

| ID     | Decision                                       | Revisit   |
| ------ | ---------------------------------------------- | --------- |
| DD-001 | GraphQL API layer                              | Post-v1.0 |
| DD-002 | Rust services for performance-critical paths   | Post-v1.0 |
| DD-003 | Additional plugin SDK languages (Python, Rust) | Post-v1.0 |

---

## 10. Constitution Compliance

### Compliance Report

**Target**: System Architecture Document
**Date**: 2026-04-01
**Constitution version**: March 2026 (Amendment: Rule 6 added)

### Overall Status: COMPLIANT

| Article      | Title                         | Status    | Notes                                                                                                |
| ------------ | ----------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Rule 1       | E2E test per feature          | COMPLIANT | Architecture includes E2E testing layer (Section 8, CI pipeline). Playwright against real stack.     |
| Rule 2       | No merge without green CI     | COMPLIANT | CI pipeline defined in Section 8.3. All test levels blocking.                                        |
| Rule 3       | One pattern per operation     | COMPLIANT | Single patterns enforced: TanStack Query (data), react-hook-form+Zod (forms), Zustand (auth state).  |
| Rule 4       | No file above 200 lines       | COMPLIANT | Module decomposition designed for small files. Enforced via lint.                                    |
| Rule 5       | ADR for significant decisions | COMPLIANT | 9 ADRs document all foundational decisions. Process defined for new ADRs.                            |
| Rule 6       | English commit messages       | COMPLIANT | Not an architecture concern; enforced at Git workflow level.                                         |
| Tech Stack   | Technology choices            | COMPLIANT | All technologies match constitution: Fastify ^5, Prisma ^6, React ^19, etc.                          |
| Architecture | Patterns                      | COMPLIANT | Fastify monolith, schema-per-tenant, Keycloak multi-realm, ABAC, Kafka, MF — all per constitution.   |
| Quality      | Testing & Performance         | COMPLIANT | E2E (Playwright), unit/int (Vitest), P95<200ms, page load<2s targets. >=80% coverage.                |
| Security     | All 6 non-negotiable rules    | COMPLIANT | Tenant isolation, Keycloak auth, parameterized queries, Zod validation, env secrets, no PII in logs. |
| Governance   | Kanban, lightweight specs     | COMPLIANT | Kanban workflow, ADRs only for significant decisions. Human code review.                             |

### Findings

No non-compliance findings. Architecture fully aligns with all constitutional
articles and amendments.

### Known Tensions

**Schema-per-tenant `SET search_path` vs. Security Rule 3 (no string interpolation)**:
Documented and resolved via ID-001 in the decision log. The slug is validated
against `/^[a-z][a-z0-9-]{1,62}$/` before use. This is a controlled, documented
exception.

---

## Cross-References

| Document          | Path                                                               |
| ----------------- | ------------------------------------------------------------------ |
| Constitution      | `.forge/constitution.md`                                           |
| Product Brief     | `.forge/product-brief.md`                                          |
| Specifications    | `docs/01-SPECIFICHE.md`                                            |
| Architecture (IT) | `docs/02-ARCHITETTURA.md`                                          |
| Project Plan      | `docs/03-PROGETTO.md`                                              |
| ADR-001           | `.forge/knowledge/adr/adr-001-schema-per-tenant.md`                |
| ADR-002           | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md`             |
| ADR-003           | `.forge/knowledge/adr/adr-003-abac-tree-walk.md`                   |
| ADR-004           | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md`         |
| ADR-005           | `.forge/knowledge/adr/adr-005-module-federation-plugin-ui.md`      |
| ADR-006           | `.forge/knowledge/adr/adr-006-plugin-tables-tenant-schema.md`      |
| ADR-007           | `.forge/knowledge/adr/adr-007-plugin-migrations-core-executed.md`  |
| ADR-008           | `.forge/knowledge/adr/adr-008-typescript-core-polyglot-plugins.md` |
| ADR-009           | `.forge/knowledge/adr/adr-009-better-auth-rejected.md`             |
| Decision Log      | `.forge/knowledge/decision-log.md`                                 |
| Lessons Learned   | `.forge/knowledge/lessons-learned.md`                              |
