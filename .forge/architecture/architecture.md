# Architecture: Plexica Platform

> Platform-level architecture document for the Plexica multi-tenant SaaS
> platform. Covers system context, component design, data model, API surface,
> integration patterns, security architecture, cross-cutting concerns, and
> constitution compliance.
>
> This is the **master architecture document**. For deeper dives, see the
> companion documents listed in [§11 Cross-References](#11-cross-references).
>
> Created by the `forge-architect` agent via `/forge-architecture`.

| Field  | Value           |
| ------ | --------------- |
| Status | Active          |
| Author | forge-architect |
| Date   | 2026-02-22      |
| Track  | Product         |

---

## 1. System Context

Plexica is a cloud-native multi-tenant SaaS platform that provides a
foundation for enterprise applications through a modular plugin system. The
platform manages multi-tenancy (schema-per-tenant), authentication
(realm-per-tenant via Keycloak), granular permissions (RBAC + ABAC), and
plugin orchestration — all exposed through versioned REST APIs.

### 1.1 Context Diagram

```
                            ┌──────────────────────────────┐
                            │        External Users        │
                            │  (Tenant Users, Admins,      │
                            │   Super Admins, Plugin Devs) │
                            └──────────────┬───────────────┘
                                           │ HTTPS
                            ┌──────────────▼───────────────┐
                            │     Frontend Shell (React)    │
                            │  Module Federation + Plugins  │
                            └──────────────┬───────────────┘
                                           │ REST /api/v1/*
                            ┌──────────────▼───────────────┐
                            │   API Gateway (Kong/Traefik)  │
                            │  JWT validation, rate limit,  │
                            │  tenant routing, CORS, TLS    │
                            └──────┬────────┬──────────────┘
                                   │        │
                    ┌──────────────▼──┐  ┌──▼──────────────┐
                    │   Core API      │  │ Plugin Services  │
                    │  (Fastify)      │  │ (Containers)     │
                    │  Auth, Tenant,  │  │ CRM, Billing,    │
                    │  Workspace,     │  │ Custom plugins   │
                    │  Plugin Mgmt,   │  │                  │
                    │  i18n, Admin    │  │                  │
                    └──┬──┬──┬──┬──┬─┘  └──┬──┬──┬────────┘
                       │  │  │  │  │       │  │  │
          ┌────────────▼──│──│──│──│───────▼──│──│───────────┐
          │  PostgreSQL   │  │  │  │          │  │           │
          │  (Schema-per- │  │  │  │          │  │           │
          │   tenant)     │  │  │  │          │  │           │
          └───────────────┘  │  │  │          │  │           │
          ┌──────────────────▼──│──│──────────▼──│───────────┐
          │  Redis (ioredis)    │  │             │           │
          │  Cache, Sessions,   │  │             │           │
          │  Rate Limiting      │  │             │           │
          └─────────────────────┘  │             │           │
          ┌────────────────────────▼─────────────▼───────────┐
          │  Redpanda (Kafka-compatible)                     │
          │  Event bus: user sync, plugin events, DLQ        │
          └──────────────────────────────────────────────────┘
          ┌──────────────────────────────────────────────────┐
          │  Keycloak 26+ (Realm-per-tenant)                 │
          │  OAuth 2.0, JWKS, SSO, MFA, Identity Mgmt       │
          └──────────────────────────────────────────────────┘
          ┌──────────────────────────────────────────────────┐
          │  MinIO / S3 (Bucket-per-tenant)                  │
          │  Plugin assets, tenant file storage              │
          └──────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System/Service  | Purpose                           | Protocol          | SLA / Notes                            |
| --------------- | --------------------------------- | ----------------- | -------------------------------------- |
| Keycloak 26+    | Identity provider, OAuth 2.0, SSO | HTTPS (REST)      | Realm-per-tenant; raw slug naming      |
| PostgreSQL 15+  | Primary data store                | TCP (libpq)       | Schema-per-tenant isolation (ADR-002)  |
| Redis / ioredis | Cache, sessions, rate limiting    | TCP (RESP)        | Tenant-prefixed keys                   |
| Redpanda        | Event bus (Kafka-compatible)      | TCP (Kafka proto) | Topic naming: `{slug}.{event_type}`    |
| MinIO / S3      | Object storage for plugin assets  | HTTPS (S3 API)    | Bucket-per-tenant                      |
| Kong / Traefik  | API Gateway                       | HTTPS             | JWT validation, rate limiting, routing |
| AWS SSM         | Secrets management (production)   | HTTPS             | Parameter Store for credentials        |

---

## 2. Component Breakdown

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Core API (Fastify)                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Presentation Layer                        │   │
│  │  routes/auth.ts    routes/tenant.ts   routes/workspace.ts   │   │
│  │  routes/plugin.ts  routes/admin.ts    routes/health.ts      │   │
│  │  routes/marketplace.ts  routes/dlq.ts  routes/metrics.ts    │   │
│  │  modules/i18n/i18n.controller.ts                            │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                     │
│  ┌────────────────────────────▼────────────────────────────────┐   │
│  │                    Middleware Layer                          │   │
│  │  AuthMiddleware        TenantContextMiddleware              │   │
│  │  AuthRateLimiter       ErrorHandler                        │   │
│  │  CsrfProtection        AdvancedRateLimit                   │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                     │
│  ┌────────────────────────────▼────────────────────────────────┐   │
│  │                    Service Layer                             │   │
│  │  AuthService           KeycloakService                      │   │
│  │  TenantService         PermissionService                    │   │
│  │  PluginService         MarketplaceService                   │   │
│  │  AdminService          AnalyticsService                     │   │
│  │  SharedDataService     ServiceRegistryService               │   │
│  │  DependencyResolutionService   PluginApiGatewayService      │   │
│  │  i18nService           i18nCacheService                     │   │
│  │  WorkspaceService                                           │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                     │
│  ┌────────────────────────────▼────────────────────────────────┐   │
│  │                    Infrastructure Layer                      │   │
│  │  Prisma Client (db.ts)        Redis Client (redis.ts)       │   │
│  │  JwtService (jwt.ts)          Logger (logger.ts)            │   │
│  │  TenantPrisma (tenant-prisma) MinioClient (minio-client)   │   │
│  │  CryptoUtils (crypto.ts)      SecretsManager               │   │
│  │  PluginValidator              PluginHooks                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Event Consumers                           │   │
│  │  UserSyncConsumer (Redpanda → user lifecycle events)        │   │
│  │  DLQ Consumer (dead letter queue management)                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Responsibilities

| Module / Component     | Responsibility                                     | Key Interfaces                              |
| ---------------------- | -------------------------------------------------- | ------------------------------------------- |
| **Auth Module**        | OAuth 2.0 flow, JWT validation, rate limiting      | `AuthRoutes`, `AuthService`, `JwtService`   |
| **Tenant Module**      | Tenant CRUD, provisioning orchestration, lifecycle | `TenantService`, `KeycloakService`          |
| **Workspace Module**   | Workspace CRUD, membership, role guards            | `WorkspaceService`, `WorkspaceMemberGuards` |
| **Plugin Module**      | Plugin registry, lifecycle, dependency resolution  | `PluginService`, `ServiceRegistryService`   |
| **Marketplace Module** | Plugin discovery, search, installation             | `MarketplaceService`                        |
| **i18n Module**        | Translation loading, overrides, locale switching   | `i18nService`, `i18nCacheService`           |
| **Admin Module**       | Super admin operations, system configuration       | `AdminService`                              |
| **Permission Engine**  | RBAC + ABAC policy evaluation                      | `PermissionService`, `PolicyEngine`         |
| **Event System**       | Async event publishing and consumption             | `UserSyncConsumer`, `@plexica/event-bus`    |
| **API Gateway Proxy**  | Plugin API proxying and request transformation     | `PluginApiGatewayService`                   |

### 2.3 Authentication Subsystem (Spec 002 — Deep Dive)

The authentication subsystem is fully implemented and approved (44/44 tasks
complete). It consists of 10 components organized across 4 architectural layers.

#### 2.3.1 Component Map

| Component                 | Layer          | File Path                                           | Responsibility                                     |
| ------------------------- | -------------- | --------------------------------------------------- | -------------------------------------------------- |
| `AuthRoutes`              | Presentation   | `apps/core-api/src/routes/auth.ts`                  | 6 route handlers, Zod validation, delegation       |
| `AuthMiddleware`          | Middleware     | `apps/core-api/src/middleware/auth.ts`              | Fastify preHandler JWT validation hook             |
| `TenantContextMiddleware` | Middleware     | `apps/core-api/src/middleware/tenant-context.ts`    | Extracts tenant context from JWT, sets search_path |
| `AuthRateLimiter`         | Middleware     | `apps/core-api/src/middleware/auth-rate-limit.ts`   | Redis-backed login rate limiting (10 req/IP/min)   |
| `ErrorHandler`            | Middleware     | `apps/core-api/src/middleware/error-handler.ts`     | Global Fastify error handler, Art. 6.2 format      |
| `AuthService`             | Service        | `apps/core-api/src/services/auth.service.ts`        | OAuth flow orchestration (login, callback, etc.)   |
| `KeycloakService`         | Service        | `apps/core-api/src/services/keycloak.service.ts`    | Keycloak Admin API wrapper (realm, client, roles)  |
| `UserSyncConsumer`        | Service        | `apps/core-api/src/services/user-sync.consumer.ts`  | Redpanda consumer for user lifecycle events        |
| `JwtService`              | Infrastructure | `apps/core-api/src/lib/jwt.ts`                      | JWT validation, JWKS caching (10min TTL)           |
| `UserRepository`          | Infrastructure | `apps/core-api/src/repositories/user.repository.ts` | Tenant-scoped user data access                     |

#### 2.3.2 Authentication Flow (OAuth 2.0 Authorization Code)

```
  ┌──────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │Browser│     │Core API  │     │Keycloak  │     │Redpanda  │     │PostgreSQL│
  └──┬───┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │              │                │                │                │
     │ 1. GET /auth/login?tenant=acme-corp&redirect_uri=...           │
     │─────────────▶│                │                │                │
     │              │ 2. Validate tenant exists, not suspended        │
     │              │────────────────────────────────────────────────▶│
     │              │◀───────────────────────────────────────────────│
     │              │ 3. Build Keycloak auth URL for realm acme-corp │
     │ 4. 302 Redirect to Keycloak login page                       │
     │◀─────────────│                │                │                │
     │              │                │                │                │
     │ 5. User enters credentials on Keycloak page                   │
     │──────────────────────────────▶│                │                │
     │              │                │ 6. Keycloak validates          │
     │ 7. 302 Redirect to /auth/callback?code=xxx&state=yyy          │
     │◀──────────────────────────────│                │                │
     │              │                │                │                │
     │ 8. GET /auth/callback?code=xxx&state=yyy      │                │
     │─────────────▶│                │                │                │
     │              │ 9. Exchange code for tokens     │                │
     │              │───────────────▶│                │                │
     │              │◀──────────────│                │                │
     │              │ 10. Return access_token + refresh_token         │
     │◀─────────────│                │                │                │
     │              │                │                │                │
     │              │                │ 11. Keycloak emits user event  │
     │              │                │───────────────▶│                │
     │              │                │                │                │
     │              │ 12. UserSyncConsumer reads event│                │
     │              │◀───────────────────────────────│                │
     │              │ 13. Upsert user in tenant schema                │
     │              │────────────────────────────────────────────────▶│
     │              │                │                │                │
```

**Step-by-step**:

1. Frontend calls `GET /api/v1/auth/login?tenant=acme-corp&redirect_uri=https://app.plexica.io/callback`
2. `AuthService.initiateLogin()` validates tenant exists and is not suspended (FR-012)
3. Builds Keycloak authorization URL for realm `acme-corp` (raw slug, FR-001)
4. Returns HTTP 302 redirect to Keycloak's hosted login page
5. User enters credentials on Keycloak's page (credentials never touch Plexica)
6. Keycloak validates credentials and issues authorization code
7. Keycloak redirects back to `/api/v1/auth/callback?code=xxx&state=yyy`
8. `AuthService.handleCallback()` receives the authorization code
9. Exchanges code for JWT tokens via Keycloak's token endpoint
10. Returns `access_token`, `refresh_token`, user profile to frontend
11. Keycloak publishes user lifecycle event to Redpanda topic `plexica.auth.user.lifecycle` (FR-007)
12. `UserSyncConsumer` consumes the event asynchronously
13. Upserts user record in tenant's `users` table (< 5s P95, NFR-002)

#### 2.3.3 JWT Token Structure

Per FR-003, JWTs contain the following claims:

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.plexica.io/realms/acme-corp",
  "realm": "acme-corp",
  "tenant_id": "acme-corp",
  "roles": ["tenant_admin"],
  "teams": ["team-sales", "team-marketing"],
  "exp": 1699999999
}
```

#### 2.3.4 Rate Limiting Architecture

```
  Request → AuthRateLimiter
              │
              ├─ Key: auth:ratelimit:{ip}
              ├─ Backend: Redis INCR + EXPIRE
              ├─ Limit: 10 requests per minute
              ├─ TTL: 60 seconds
              │
              ├─ Under limit → Proceed
              ├─ Over limit → HTTP 429 AUTH_RATE_LIMITED
              └─ Redis unavailable → DENY (fail-closed, HIGH #4 fix)
```

Rate limiting applies to: `/auth/login`, `/auth/callback`, `/auth/refresh`,
`/auth/logout`, `/auth/jwks` (FR-013, HIGH #5 fix).

#### 2.3.5 Error Codes

All auth endpoints return errors in Constitution Art. 6.2 format:
`{ error: { code, message, details? } }` (FR-015).

| Error Code                  | HTTP | Condition                                     |
| --------------------------- | ---- | --------------------------------------------- |
| `AUTH_INVALID_REQUEST`      | 400  | Missing or malformed parameters               |
| `AUTH_INVALID_CREDENTIALS`  | 401  | Token exchange failed                         |
| `AUTH_TOKEN_EXPIRED`        | 401  | JWT past `exp` claim                          |
| `AUTH_TOKEN_INVALID`        | 401  | JWT signature/format invalid                  |
| `AUTH_MISSING_TOKEN`        | 401  | No Authorization header on protected endpoint |
| `AUTH_CODE_EXPIRED`         | 401  | OAuth authorization code expired              |
| `AUTH_REFRESH_TOKEN_REUSED` | 401  | Rotation detected reuse; chain revoked        |
| `AUTH_CROSS_TENANT`         | 403  | JWT realm ≠ target tenant (FR-011)            |
| `AUTH_TENANT_SUSPENDED`     | 403  | Tenant suspended, all auth blocked (FR-012)   |
| `AUTH_TENANT_NOT_FOUND`     | 404  | Tenant/realm does not exist                   |
| `AUTH_USER_NOT_FOUND`       | 404  | User not yet synced to internal DB            |
| `AUTH_RATE_LIMITED`         | 429  | Exceeded 10 req/IP/min (FR-013)               |
| `AUTH_KEYCLOAK_ERROR`       | 500  | Keycloak unreachable                          |

#### 2.3.6 Security Review Summary

The authentication subsystem passed a full security review (Task 7.2):

- **Issues found**: 11 (2 CRITICAL, 4 HIGH, 3 MEDIUM, 2 LOW)
- **Issues fixed**: 9 (2 CRITICAL, 4 HIGH, 2 MEDIUM, 1 LOW)
- **Issues deferred**: 2 (1 MEDIUM, 1 LOW — documented in decision log)
- **Critical fixes**: Algorithm confusion attack guard, open redirect allowlist
- **High fixes**: JWT error leakage, fail-closed rate limiting, expanded rate limits, URL parsing
- **Verdict**: ✅ Approved for completion

---

## 3. Data Model

### 3.1 Entity Relationship Diagram

```
  core schema:
  ┌──────────────────┐     ┌───────────────────────┐
  │     tenants       │     │     super_admins       │
  │──────────────────│     │───────────────────────│
  │ id (PK)          │     │ id (PK)               │
  │ name             │     │ keycloak_id (UNIQUE)   │
  │ slug (UNIQUE)    │     │ email (UNIQUE)         │
  │ status           │     │ created_at             │
  │ created_at       │     └───────────────────────┘
  │ updated_at       │
  └──────┬───────────┘     ┌───────────────────────┐
         │                 │   plugin_registry      │
         │                 │───────────────────────│
         │                 │ id (PK)               │
         │                 │ name, slug, version    │
         │                 │ manifest (JSONB)       │
         │                 │ status                 │
         │                 └───────────────────────┘

  tenant schema (e.g., tenant_acme_corp):
  ┌──────────────────┐     ┌───────────────────────┐
  │      users        │     │      teams             │
  │──────────────────│     │───────────────────────│
  │ id (PK)          │     │ id (PK)               │
  │ keycloak_id (UQ) │◀─── │ owner_id (FK→users)   │
  │ email (UQ)       │     │ name, slug            │
  │ first_name       │     │ created_at            │
  │ last_name        │     └───────────────────────┘
  │ display_name     │
  │ avatar_url       │     ┌───────────────────────┐
  │ locale           │     │    workspaces          │
  │ preferences (J)  │     │───────────────────────│
  │ status           │     │ id (PK)               │
  │ created_at       │     │ name, slug, path      │
  │ updated_at       │     │ parent_id (FK→self)   │
  └──────┬───────────┘     │ description           │
         │                 │ settings (JSONB)       │
         │                 │ created_at             │
         │                 └───────────┬───────────┘
         │                             │
         │  ┌──────────────────────────┤
         │  │                          │
  ┌──────▼──▼────────────┐   ┌────────▼──────────────┐
  │ workspace_members     │   │ workspace_plugins      │
  │──────────────────────│   │────────────────────────│
  │ id (PK)              │   │ id (PK)                │
  │ workspace_id (FK)    │   │ workspace_id (FK)      │
  │ user_id (FK→users)   │   │ plugin_id (FK)         │
  │ role (enum)          │   │ enabled                │
  │ invited_by (FK)      │   │ config (JSONB)         │
  │ created_at           │   │ created_at             │
  └──────────────────────┘   └────────────────────────┘
```

### 3.2 Entity Definitions

#### `users` (tenant schema — Spec 002)

| Column         | Type            | Constraints                    | Notes                                |
| -------------- | --------------- | ------------------------------ | ------------------------------------ |
| `id`           | `UUID`          | PK, DEFAULT uuid_generate_v4() | Internal user identifier             |
| `keycloak_id`  | `VARCHAR(255)`  | UNIQUE, NOT NULL               | FK to Keycloak user UUID             |
| `email`        | `VARCHAR(255)`  | UNIQUE, NOT NULL               | Synced from Keycloak                 |
| `first_name`   | `VARCHAR(255)`  | NULLABLE                       | Synced from Keycloak                 |
| `last_name`    | `VARCHAR(255)`  | NULLABLE                       | Synced from Keycloak                 |
| `display_name` | `VARCHAR(255)`  | NULLABLE                       | User-editable (FR-008)               |
| `avatar_url`   | `VARCHAR(2048)` | NULLABLE                       | Profile avatar (renamed from avatar) |
| `locale`       | `VARCHAR(10)`   | NOT NULL, DEFAULT 'en'         | User's preferred locale              |
| `preferences`  | `JSONB`         | NOT NULL, DEFAULT '{}'         | Application settings (FR-008)        |
| `status`       | `VARCHAR(20)`   | NOT NULL, DEFAULT 'active'     | active \| deactivated (FR-008)       |
| `created_at`   | `TIMESTAMPTZ`   | NOT NULL, DEFAULT now()        | Record creation timestamp            |
| `updated_at`   | `TIMESTAMPTZ`   | NOT NULL, auto-updated         | Last update timestamp                |

**Indexes**:

| Index Name         | Columns       | Type   | Notes                        |
| ------------------ | ------------- | ------ | ---------------------------- |
| `idx_users_status` | `status`      | B-tree | Filter active/deactivated    |
| (Prisma default)   | `keycloak_id` | Unique | Fast lookup by Keycloak UUID |
| (Prisma default)   | `email`       | Unique | Fast lookup by email         |

#### `tenants` (core schema)

| Column       | Type           | Constraints                | Notes                           |
| ------------ | -------------- | -------------------------- | ------------------------------- |
| `id`         | `UUID`         | PK                         | Tenant identifier               |
| `name`       | `VARCHAR(255)` | NOT NULL                   | Human-readable tenant name      |
| `slug`       | `VARCHAR(100)` | UNIQUE, NOT NULL           | URL-safe identifier, realm name |
| `status`     | `VARCHAR(20)`  | NOT NULL, DEFAULT 'ACTIVE' | ACTIVE, PROVISIONING, SUSPENDED |
| `settings`   | `JSONB`        | DEFAULT '{}'               | Tenant-level configuration      |
| `created_at` | `TIMESTAMPTZ`  | NOT NULL, DEFAULT now()    | Tenant creation timestamp       |
| `updated_at` | `TIMESTAMPTZ`  | NOT NULL, auto-updated     | Last update timestamp           |

---

## 4. API Surface

### 4.1 API Overview

All endpoints are versioned under `/api/v1`. Per Constitution Art. 5.1, all
endpoints require authentication unless explicitly marked Public.

| Module      | Endpoint Pattern                        | Auth        | Spec |
| ----------- | --------------------------------------- | ----------- | ---- |
| Auth        | `GET  /api/v1/auth/login`               | Public      | 002  |
| Auth        | `GET  /api/v1/auth/callback`            | Public      | 002  |
| Auth        | `POST /api/v1/auth/refresh`             | Public      | 002  |
| Auth        | `POST /api/v1/auth/logout`              | Bearer      | 002  |
| Auth        | `GET  /api/v1/auth/me`                  | Bearer      | 002  |
| Auth        | `GET  /api/v1/auth/jwks`                | Public      | 002  |
| Tenant      | `POST /api/v1/admin/tenants`            | Super Admin | 001  |
| Tenant      | `GET  /api/v1/admin/tenants`            | Super Admin | 001  |
| Tenant      | `GET  /api/v1/admin/tenants/:id`        | Super Admin | 001  |
| Tenant      | `PUT  /api/v1/admin/tenants/:id`        | Super Admin | 001  |
| Tenant      | `DELETE /api/v1/admin/tenants/:id`      | Super Admin | 001  |
| Workspace   | `POST /api/v1/workspaces`               | Bearer      | 009  |
| Workspace   | `GET  /api/v1/workspaces`               | Bearer      | 009  |
| Workspace   | `GET  /api/v1/workspaces/:id`           | Bearer      | 009  |
| Workspace   | `PUT  /api/v1/workspaces/:id`           | Bearer      | 009  |
| Workspace   | `DELETE /api/v1/workspaces/:id`         | Bearer      | 009  |
| Workspace   | `POST /api/v1/workspaces/:id/members`   | Bearer      | 009  |
| Workspace   | `GET  /api/v1/workspaces/:id/members`   | Bearer      | 009  |
| Plugin      | `POST /api/v1/plugins`                  | Bearer      | 004  |
| Plugin      | `GET  /api/v1/plugins`                  | Bearer      | 004  |
| Plugin      | `GET  /api/v1/plugins/:id`              | Bearer      | 004  |
| Plugin      | `PUT  /api/v1/plugins/:id`              | Bearer      | 004  |
| Marketplace | `GET  /api/v1/marketplace`              | Bearer      | 004  |
| Marketplace | `POST /api/v1/marketplace/:id/install`  | Bearer      | 004  |
| i18n        | `GET  /api/v1/translations/:locale/:ns` | Public      | 006  |
| i18n        | `GET  /api/v1/i18n/overrides`           | Bearer      | 006  |
| i18n        | `PUT  /api/v1/i18n/overrides`           | Bearer      | 006  |
| i18n        | `DELETE /api/v1/i18n/overrides/:id`     | Bearer      | 006  |
| Admin       | `GET  /api/v1/admin/analytics`          | Super Admin | 008  |
| Admin       | `GET  /api/v1/admin/system`             | Super Admin | 008  |
| Health      | `GET  /health`                          | Public      | —    |
| Health      | `GET  /ready`                           | Public      | —    |
| Metrics     | `GET  /metrics`                         | Internal    | —    |
| DLQ         | `GET  /api/v1/admin/dlq`                | Super Admin | —    |

### 4.2 API Standards

Per Constitution Article 3.4:

1. **REST conventions**: RESTful resource naming with plural nouns
2. **API versioning**: All endpoints under `/api/v1`; breaking changes require `/api/v2`
3. **Pagination**: List endpoints support `?page=1&limit=50` (max 100 per page)
4. **Error format**: `{ error: { code: string, message: string, details?: object } }` (Art. 6.2)
5. **Content-Type**: `application/json` for all request/response bodies
6. **Status codes**: Standard HTTP status codes (200, 201, 204, 400, 401, 403, 404, 429, 500)

---

## 5. Integration Patterns

### 5.1 Keycloak Integration

- **Service**: Keycloak 26+ (realm-per-tenant)
- **Pattern**: Synchronous REST for auth operations, async events for user sync
- **Key operations**:
  - Realm CRUD (create/disable on tenant lifecycle)
  - Client registration (`plexica-web`, `plexica-api` per realm)
  - Role provisioning (`tenant_admin`, `user` per realm)
  - Token exchange (OAuth 2.0 Authorization Code flow)
  - JWKS retrieval (cached 10 minutes)
- **Error handling**: Graceful degradation when Keycloak unavailable (NFR-005);
  tenant stays in PROVISIONING state with exponential backoff retry
- **Retry strategy**: Exponential backoff (1s, 2s, 4s, 8s, max 60s) via
  ProvisioningOrchestrator state machine (ADR-015)
- **Related ADR**: ADR-015 (Tenant Provisioning Orchestration)

### 5.2 Redpanda Event System

- **Service**: Redpanda (Kafka-compatible)
- **Pattern**: Event-driven async communication
- **Topics**:
  - `plexica.auth.user.lifecycle` — User create/update/delete events from Keycloak
  - `{tenant_slug}.core.tenant.created` — Tenant provisioning events
  - `{tenant_slug}.core.workspace.{event}` — Workspace lifecycle events
  - `{tenant_slug}.{plugin}.{event}` — Plugin-specific events
  - `dead-letter-queue` — Failed event processing
- **Consumer groups**: `plexica-core-user-sync`, `plexica-core-plugin-events`
- **Error handling**: Failed events go to DLQ with original topic, partition,
  offset, error message, and payload
- **Retry strategy**: Consumer offset replay for transient failures; DLQ for
  permanent failures
- **Related ADR**: ADR-005 (Event System — Redpanda)

### 5.3 Tenant Provisioning Orchestration

- **Pattern**: State machine with compensation (ADR-015)
- **States**: `PENDING → PROVISIONING → ACTIVE` (happy path)
- **Compensation**: On failure, provisioning steps are rolled back in reverse
  order (drop schema, delete realm, remove Redis keys)
- **Steps**:
  1. Create PostgreSQL schema (`tenant_{slug}`)
  2. Run Prisma migrations in tenant schema
  3. Create Keycloak realm (raw slug)
  4. Register clients and roles in realm
  5. Seed default data
  6. Transition to ACTIVE
- **Timeout**: 30 seconds total provisioning time target

### 5.4 MinIO / S3 Object Storage

- **Service**: MinIO (S3-compatible)
- **Pattern**: Sync REST (S3 API)
- **Isolation**: Bucket-per-tenant (e.g., bucket `acme-corp`)
- **Use cases**: Plugin asset storage, tenant file uploads
- **Error handling**: Retry with exponential backoff on transient S3 errors

---

## 6. Security Architecture

> Full details: [security-architecture.md](./security-architecture.md)

### 6.1 Authentication Flow

Per Spec 002 and Constitution Art. 5.1:

- **Provider**: Keycloak 26+ with OAuth 2.0 Authorization Code flow (FR-016)
- **Realm model**: One realm per tenant, named by raw tenant slug (FR-001)
- **Master realm**: Super Admin authentication (FR-002)
- **Token format**: JWT with `sub`, `iss`, `realm`, `tenant_id`, `roles`, `teams`, `exp` (FR-003)
- **Token validation**: JWKS-based, cache TTL 10 minutes (NFR-001, NFR-007)
- **Session expiry**: 24 hours of inactivity (Art. 5.1)
- **Refresh tokens**: Rotation enabled — each refresh issues new refresh token (FR-014)
- **Suspended tenants**: ALL auth blocked — realm disabled, JWTs rejected (FR-012)

### 6.2 Authorization Model

Per Spec 003 and Constitution Art. 5.1:

**RBAC (Active)**:

| Role           | Scope     | Source                           |
| -------------- | --------- | -------------------------------- |
| `super_admin`  | Global    | Keycloak master realm            |
| `tenant_admin` | Tenant    | Keycloak tenant realm            |
| `user`         | Tenant    | Keycloak tenant realm            |
| `ADMIN`        | Workspace | Application DB (`WorkspaceRole`) |
| `MEMBER`       | Workspace | Application DB (`WorkspaceRole`) |
| `VIEWER`       | Workspace | Application DB (`WorkspaceRole`) |

**ABAC (Phase 3 — Planned)**: Attribute-based policies extending RBAC with
conditional access rules (ADR-017).

**Permission format**: `resource:action` (e.g., `crm:contacts:read`,
`workspace:members:write`). Plugins register permissions during installation.

### 6.3 Data Flow Security

- **TLS 1.2+**: All data in transit (Art. 5.2)
- **No PII in logs**: Enforced by log sanitization (Art. 5.2, 6.3)
- **No secrets in Git**: AWS SSM Parameter Store in production (Art. 5.2)
- **Parameterized queries**: All SQL via Prisma ORM or tagged template literals (Art. 5.3)
- **Zod validation**: All external input validated (Art. 5.3)
- **CSRF protection**: State parameter in OAuth flow + CSRF tokens on state-changing endpoints (Art. 5.3)
- **XSS prevention**: DOMPurify output sanitization for user-generated content (Art. 5.3)

### 6.4 Multi-Tenant Isolation Matrix

| Layer          | Isolation Method                     | Enforcement Point           |
| -------------- | ------------------------------------ | --------------------------- |
| Database       | Schema-per-tenant (ADR-002)          | TenantContextMiddleware     |
| Cache          | Key prefix `tenant:{slug}:*`         | Cache service wrapper       |
| Authentication | Realm-per-tenant (raw slug)          | Keycloak realm routing      |
| Object Storage | Bucket-per-tenant                    | Storage service wrapper     |
| Events         | Topic prefix `{tenant_slug}.*`       | Event bus service wrapper   |
| Workspaces     | Logical isolation via `workspace_id` | Workspace membership guards |

**Critical invariant**: Cross-tenant data access is a critical security
violation that blocks all releases (Constitution Art. 1.2).

---

## 7. Cross-Cutting Concerns

### 7.1 Logging

Per Constitution Art. 6.3:

- **Library**: Pino (structured JSON logging)
- **Required fields**: `timestamp`, `level`, `message`, `requestId`, `userId`, `tenantId`
- **Tenant enrichment**: Logger auto-enriches from AsyncLocalStorage context
- **Log levels**: `error` (alerts), `warn` (investigation), `info` (audit), `debug` (dev only)
- **Forbidden**: No PII, passwords, tokens, API keys, credit cards, or session IDs

### 7.2 Monitoring

Per Constitution Art. 9.2:

- **Health checks**: `GET /health` (full: DB, Redis, Kafka, Keycloak), `GET /ready` (DB only)
- **Metrics**: Prometheus endpoint at `/metrics` (request counts, durations, active tenants)
- **Distributed tracing**: OpenTelemetry with Jaeger exporter; `X-Trace-ID` propagation
- **Alerting**: Error rate > 1% triggers alert; P95 latency > 500ms triggers alert
- **Isolation monitoring**: Alert on potential cross-tenant data leaks

> Full details: [deployment-architecture.md](./deployment-architecture.md) §Monitoring

### 7.3 Error Handling

Per Constitution Art. 6:

- **Operational errors**: Handle gracefully, return user-friendly messages (400, 404, etc.)
- **Programmer errors**: Log full context, return generic 500
- **Validation errors**: Return 400 with specific field errors
- **Tenant isolation errors**: Return 403 when cross-tenant access attempted
- **Response format**: `{ error: { code: string, message: string, details?: object } }`
- **No stack traces**: In production responses
- **Error codes**: Stable, documented, per-module (13 auth codes, see §2.3.5)

### 7.4 Caching

Multi-level caching strategy with tenant-prefixed Redis keys:

| Resource             | Key Pattern                              | TTL    | Layer |
| -------------------- | ---------------------------------------- | ------ | ----- |
| Tenant config        | `tenant:{slug}:config`                   | 5 min  | Redis |
| User session         | `tenant:{slug}:session:{userId}`         | 24 hr  | Redis |
| Permissions          | `tenant:{slug}:permissions:{userId}`     | 5 min  | Redis |
| Plugin config        | `tenant:{slug}:plugin:{pluginId}:config` | 10 min | Redis |
| Workspace membership | `workspace:{id}:member:{userId}`         | 5 min  | Redis |
| JWKS keys            | In-memory (JwtService)                   | 10 min | L1    |
| Rate limit counter   | `auth:ratelimit:{ip}`                    | 60 sec | Redis |
| Translation bundles  | `i18n:{locale}:{namespace}`              | 5 min  | Redis |
| Workspace aggregates | `workspace:{id}:agg_counts`              | 5 min  | Redis |

**Cache invalidation**: TTL-based expiry. No explicit invalidation except on
user logout (session purge) and i18n override changes.

---

## 8. Deployment Architecture

> Full details: [deployment-architecture.md](./deployment-architecture.md)

### 8.1 Infrastructure

| Environment | Infrastructure   | Purpose                   |
| ----------- | ---------------- | ------------------------- |
| Local Dev   | Docker Compose   | Developer workstations    |
| CI          | GitHub Actions   | Automated testing & build |
| Staging     | Kubernetes       | Pre-production validation |
| Production  | Kubernetes (EKS) | Live multi-tenant SaaS    |

**Key services**: Core API (3 replicas), Frontend (2 replicas + CDN), Keycloak
(2 replicas), PostgreSQL (StatefulSet), Redis (3-node cluster), Redpanda (3
brokers), MinIO (1 node), API Gateway (2 replicas).

### 8.2 Scaling Strategy

- **Horizontal scaling**: Core API and plugin containers scale horizontally
  (stateless, per Constitution Art. 1.2)
- **Database**: Vertical scaling initially; read replicas for read-heavy
  workloads
- **Redis**: Cluster mode with 3 nodes for HA
- **Redpanda**: 3 brokers with replication factor 3
- **Feature flags**: Required for all user-facing changes (Art. 9.1)
- **Rollback**: < 5 minutes via Kubernetes rollback (Art. 9.1)
- **Migrations**: Backward compatible (Art. 9.1)

---

## 9. Architectural Decisions

All ADRs are stored in `.forge/knowledge/adr/`.

| ADR     | Decision                                          | Status   | Date       | Constitution Ref          |
| ------- | ------------------------------------------------- | -------- | ---------- | ------------------------- |
| ADR-001 | Monorepo Strategy (Turborepo + pnpm)              | Accepted | 2025-01-13 | Art. 2.1                  |
| ADR-002 | Database Multi-Tenancy (Schema-per-Tenant)        | Accepted | 2025-01-13 | Art. 1.2, 5.2             |
| ADR-003 | Plugin Language Support (TypeScript Only)         | Accepted | 2025-01-13 | Art. 2.1                  |
| ADR-004 | Frontend Module Federation                        | Accepted | 2025-01-13 | Art. 2.1                  |
| ADR-005 | Event System (Redpanda)                           | Accepted | 2025-01-13 | Art. 2.1                  |
| ADR-006 | API Framework (Fastify)                           | Accepted | 2025-01-13 | Art. 2.1, 3.4             |
| ADR-007 | ORM Choice (Prisma)                               | Accepted | 2025-01-13 | Art. 3.3                  |
| ADR-008 | Playwright for Frontend E2E Testing               | Accepted | 2026-02-11 | Art. 4.1, 8.1             |
| ADR-009 | TailwindCSS v4 Semantic Tokens                    | Accepted | 2026-02-11 | Art. 1.3                  |
| ADR-010 | @plexica/types Shared Package                     | Accepted | 2026-02-11 | Art. 7.1                  |
| ADR-011 | Vite Module Federation for Plugins                | Accepted | 2026-02-11 | ADR-004, ADR-009, ADR-010 |
| ADR-012 | ICU MessageFormat Library (FormatJS)              | Accepted | 2026-02-13 | Art. 2                    |
| ADR-013 | Materialised Path for Workspace Hierarchy         | Accepted | 2026-02-20 | ADR-002                   |
| ADR-014 | WorkspacePlugin Scoping (Separate Table)          | Accepted | 2026-02-20 | Art. 3.2, ADR-002         |
| ADR-015 | Tenant Provisioning Orchestration (State Machine) | Accepted | 2026-02-16 | Art. 1.2, 9.1             |
| ADR-016 | _(reserved — see ADR index)_                      | —        | —          | —                         |
| ADR-017 | ABAC Policy Engine                                | Accepted | 2026-02-16 | Art. 5.1                  |

**Auth-relevant ADRs**: ADR-002 (schema-per-tenant isolation), ADR-005
(Redpanda for user sync events), ADR-006 (Fastify framework), ADR-015 (tenant
provisioning state machine).

---

## 10. Constitution Compliance

| Article                              | Status | Notes                                                                                                                                                                                                                                      |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Art. 1: Core Principles**          | ✅     | Security-first (security review completed for auth), API-first (REST /api/v1/\*), zero-downtime (feature flags, backward-compatible migrations), multi-tenancy isolation (schema-per-tenant + realm-per-tenant)                            |
| **Art. 2: Technology Stack**         | ✅     | All components use approved stack: Keycloak 26+, Fastify ^5.7, PostgreSQL 15+, Redis/ioredis ^5.9, Redpanda, Prisma ^6.8, Vitest ^4.0, React ^19.2, TanStack Router, Vite                                                                  |
| **Art. 3: Architecture Patterns**    | ✅     | Layered architecture (Routes → Services → Repositories), feature modules for newer subsystems, parameterized queries, tenant context middleware, REST conventions with /api/v1 versioning                                                  |
| **Art. 4: Quality Standards**        | ⚠️     | Overall coverage at 76.5% (target 80%, tracked as TD-001). Auth module coverage strong (91.96% middleware, 532 total tests) except `keycloak.service.ts` at 2.83% (TD-003, deferred to Sprint 5). Core modules need 85% (TD-002)           |
| **Art. 5: Security**                 | ✅     | Keycloak auth, RBAC enforced, tenant validation on every request, TLS 1.2+, no PII in logs, no secrets in Git (AWS SSM), Zod validation, parameterized queries, CSRF protection, XSS prevention. 9/11 security issues fixed in auth review |
| **Art. 6: Error Handling**           | ✅     | Constitution-compliant error format on all endpoints (13 auth error codes, stable and documented), Pino structured logging with required fields, no stack traces in production, no sensitive data in logs                                  |
| **Art. 7: Naming & Conventions**     | ✅     | kebab-case files, PascalCase classes, camelCase functions, UPPER_SNAKE constants, snake_case DB tables/columns, REST plural nouns, /api/v1 versioning                                                                                      |
| **Art. 8: Testing Standards**        | ✅     | Unit + integration + E2E tests across all modules. Auth: 385 unit + 76 integration + 71 E2E = 532 tests. AAA pattern, deterministic, independent, descriptive names. 100% pass rate                                                        |
| **Art. 9: Operational Requirements** | ✅     | Feature flags for ROPC→OAuth migration, < 5min rollback (K8s), backward-compatible schema migrations, health checks at /health and /ready, structured logging to centralized platform                                                      |

### Compliance Gaps

| Gap    | Article | Description                                      | Severity | Tracking |
| ------ | ------- | ------------------------------------------------ | -------- | -------- |
| TD-001 | Art. 4  | Overall coverage 76.5%, target 80%               | MEDIUM   | Sprint 5 |
| TD-002 | Art. 4  | Core modules (auth, tenant, workspace) need ≥85% | HIGH     | Q1 2026  |
| TD-003 | Art. 4  | `keycloak.service.ts` at 2.83% coverage          | HIGH     | Sprint 5 |

---

## 11. Cross-References

### Architecture Documents

| Document                | Path                                             | Scope                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------- |
| **This Document**       | `.forge/architecture/architecture.md`            | Platform-level master architecture |
| System Architecture     | `.forge/architecture/system-architecture.md`     | Components, layers, event system   |
| Security Architecture   | `.forge/architecture/security-architecture.md`   | Auth, authz, isolation, secrets    |
| Deployment Architecture | `.forge/architecture/deployment-architecture.md` | Infra, CI/CD, K8s, scaling         |

### Governance

| Document      | Path                               |
| ------------- | ---------------------------------- |
| Constitution  | `.forge/constitution.md`           |
| Product Brief | `.forge/product/product-brief.md`  |
| Roadmap       | `.forge/product/roadmap.md`        |
| Decision Log  | `.forge/knowledge/decision-log.md` |
| ADR Index     | `.forge/knowledge/adr/README.md`   |

### Specifications

| Spec | Title                           | Path                                              | Status      |
| ---- | ------------------------------- | ------------------------------------------------- | ----------- |
| 001  | Multi-Tenancy                   | `.forge/specs/001-multi-tenancy/`                 | Approved    |
| 002  | Authentication System           | `.forge/specs/002-authentication/`                | Approved    |
| 003  | Authorization & RBAC            | `.forge/specs/003-authorization/`                 | Approved    |
| 004  | Plugin System                   | `.forge/specs/004-plugin-system/`                 | Approved    |
| 005  | Frontend Architecture           | `.forge/specs/005-frontend-architecture/`         | Approved    |
| 006  | Internationalization (i18n)     | `.forge/specs/006-i18n/`                          | Approved    |
| 007  | Core Services                   | `.forge/specs/007-core-services/`                 | Approved    |
| 008  | Admin Interfaces                | `.forge/specs/008-admin-interfaces/`              | Approved    |
| 009  | Workspace Management            | `.forge/specs/009-workspace-management/`          | Approved    |
| 010  | Frontend Production Readiness   | `.forge/specs/010-frontend-production-readiness/` | In Progress |
| 011  | Workspace Hierarchy & Templates | `.forge/specs/011-workspace-hierarchy-templates/` | Planned     |

---

_Created by forge-architect on 2026-02-22. This document should be updated when
significant architectural changes occur. For day-to-day decisions, use the
[Decision Log](../knowledge/decision-log.md). For significant choices, create
an [ADR](../knowledge/adr/README.md) via `/forge-adr`._
