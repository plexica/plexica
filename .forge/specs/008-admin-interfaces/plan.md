# Plan: 008 - Admin Interfaces

> Technical implementation plan for the Super Admin Panel and Tenant Admin Interface APIs.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                               |
| ------ | ----------------------------------- |
| Status | Draft                               |
| Author | forge-architect                     |
| Date   | 2026-02-28                          |
| Track  | Feature                             |
| Spec   | [008 - Admin Interfaces](./spec.md) |

---

## 1. Overview

This plan covers the backend implementation of Spec 008 — two administrative interfaces for the Plexica platform:

1. **Super Admin Panel** (`/api/v1/admin/*`): Platform-wide management of tenants, plugins, system configuration, Super Admin users, and global audit logs. Requires `super_admin` role in the Keycloak master realm.
2. **Tenant Admin Interface** (`/api/v1/tenant/*`): Tenant-scoped management of users, teams, roles, plugins, settings, and tenant audit logs. Requires `tenant_admin` (or `tenant_owner`) role within the tenant's realm.

### Approach

The Super Admin Panel is ~70% implemented (tenant CRUD, plugin management, analytics, user listing all exist in `admin.ts`). This plan focuses on filling the remaining gaps and building the entirely new Tenant Admin API from scratch.

Key architectural decisions:

- **Audit logs** are stored in the core schema (not per-tenant) with a `tenant_id` column for scoping. This enables Super Admins to query across tenants while Tenant Admins see only their own.
- **Team members** require a new `team_members` join table in each tenant schema (gap identified in brownfield analysis — the `teams` table exists but has no member relationship).
- **System configuration** is stored in a new `system_config` table in the core schema for feature flags, maintenance mode, and global settings.
- All new endpoints follow existing patterns: Zod validation, parameterized queries, Constitution Art. 6.2 error format, standard pagination.

### What Already Exists (Leveraged, Not Rebuilt)

| Capability                | Existing Code                            | Status      |
| ------------------------- | ---------------------------------------- | ----------- |
| Tenant CRUD               | `admin.ts` routes + `tenantService`      | ✅ Complete |
| Plugin management         | `admin.ts` routes + `marketplaceService` | ✅ Complete |
| Platform analytics        | `admin.ts` + `analyticsService`          | ✅ Partial  |
| Cross-tenant user listing | `admin.ts` + `adminService`              | ✅ Complete |
| Role CRUD (service layer) | `role.service.ts` in authorization mod   | ✅ Complete |
| Permission registration   | `permission-registration.service.ts`     | ✅ Complete |
| Auth middleware           | `requireSuperAdmin` in `auth.ts`         | ✅ Complete |
| Tenant plugin management  | `tenant-plugins-v1.ts`                   | ✅ Partial  |

### What This Plan Adds

| Capability                      | Components                              | FR Reference  |
| ------------------------------- | --------------------------------------- | ------------- |
| Audit log system                | Table, service, middleware, 2 endpoints | FR-006/FR-014 |
| Super Admin dashboard           | Dedicated endpoint (extends analytics)  | FR-001        |
| Super Admin user management     | CRUD for `super_admins` table           | FR-004        |
| System configuration            | Table, service, endpoints               | FR-005        |
| System health monitoring        | Health aggregation endpoint             | FR-007        |
| Tenant Admin dashboard          | Tenant-scoped metrics endpoint          | FR-008        |
| Tenant user management          | Full user lifecycle routes              | FR-009        |
| Team management                 | `team_members` table, CRUD routes       | FR-010        |
| Role editor routes              | Routes wrapping existing `roleService`  | FR-011        |
| Tenant plugin settings          | Per-tenant plugin config endpoint       | FR-012        |
| Tenant settings                 | Theme/preferences endpoint              | FR-013        |
| `requireTenantAdmin` middleware | Named middleware export                 | NFR-003/004   |

---

## 2. Data Model

### 2.1 New Tables

#### `core.audit_logs` (Core Schema — Prisma-managed)

| Column        | Type          | Constraints            | Notes                                    |
| ------------- | ------------- | ---------------------- | ---------------------------------------- |
| id            | String (UUID) | PK, `@default(uuid())` | Primary key                              |
| tenant_id     | String?       | Nullable, indexed      | NULL for platform-level events           |
| user_id       | String?       | Nullable               | NULL for system-generated events         |
| action        | String        | NOT NULL, max 100      | e.g., `user.invited`, `tenant.suspended` |
| resource_type | String?       | max 100                | e.g., `tenant`, `user`, `team`, `role`   |
| resource_id   | String?       | max 255                | ID of affected resource                  |
| details       | Json          | `@default("{}")`       | Additional context (JSONB)               |
| ip_address    | String?       |                        | Request IP (stored as text, not INET)    |
| user_agent    | String?       |                        | Request User-Agent for forensics         |
| created_at    | DateTime      | `@default(now())`      | Immutable timestamp                      |

**Design decision**: Using `String?` for `ip_address` instead of PostgreSQL `INET` type because Prisma does not natively support `INET`. The value is validated via Zod before insertion. This table is append-only — no UPDATE or DELETE operations.

**Retention**: Audit logs are retained indefinitely. A future archival policy (e.g., move to cold storage after 1 year) can be added via a separate spec.

#### `core.system_config` (Core Schema — Prisma-managed)

| Column      | Type     | Constraints       | Notes                                                    |
| ----------- | -------- | ----------------- | -------------------------------------------------------- |
| key         | String   | PK, unique        | e.g., `maintenance_mode`, `max_tenants`                  |
| value       | Json     | NOT NULL          | JSONB value (string, number, boolean)                    |
| category    | String   | NOT NULL, max 50  | Grouping: `general`, `limits`, `features`, `maintenance` |
| description | String?  |                   | Human-readable description                               |
| updated_by  | String?  |                   | User ID of last updater                                  |
| updated_at  | DateTime | `@updatedAt`      | Last modification timestamp                              |
| created_at  | DateTime | `@default(now())` | Creation timestamp                                       |

**Seed data** (created by migration):

| Key                      | Category    | Default Value | Description                        |
| ------------------------ | ----------- | ------------- | ---------------------------------- |
| `maintenance_mode`       | maintenance | `false`       | Global maintenance mode flag       |
| `max_tenants`            | limits      | `1000`        | Maximum tenants allowed            |
| `max_users_per_tenant`   | limits      | `500`         | Default user limit per tenant      |
| `feature_flag_analytics` | features    | `true`        | Enable/disable analytics dashboard |
| `registration_enabled`   | general     | `true`        | Allow new tenant registration      |

#### `{tenant_schema}.team_members` (Tenant Schema — Raw SQL via schema-step)

| Column    | Type      | Constraints                                  | Notes                 |
| --------- | --------- | -------------------------------------------- | --------------------- |
| team_id   | TEXT      | NOT NULL, FK → teams(id) ON DELETE CASCADE   | Team reference        |
| user_id   | TEXT      | NOT NULL, FK → users(id) ON DELETE CASCADE   | User reference        |
| role      | TEXT      | NOT NULL, CHECK (role IN ('MEMBER','ADMIN')) | Team-level role       |
| joined_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP          | When user joined team |

**Primary Key**: `(team_id, user_id)` — a user can be in a team only once.

### 2.2 Modified Tables

#### `core.tenants` (No Schema Change)

No column changes needed. The existing `settings` (Json) and `theme` (Json) columns already support FR-012 and FR-013. The `theme` column uses `TenantThemeSchema` Zod validation already defined in `admin.ts`.

#### `{tenant_schema}.teams` (No Schema Change)

The existing `teams` table already has `id`, `workspace_id`, `name`, `description`, `owner_id`, `created_at`, `updated_at`. No column additions needed — the new `team_members` join table provides the member relationship.

### 2.3 Indexes

| Table                   | Index Name                      | Columns                   | Type   |
| ----------------------- | ------------------------------- | ------------------------- | ------ |
| `core.audit_logs`       | `idx_audit_logs_tenant_id`      | `tenant_id`               | B-TREE |
| `core.audit_logs`       | `idx_audit_logs_created_at`     | `created_at`              | B-TREE |
| `core.audit_logs`       | `idx_audit_logs_action`         | `action`                  | B-TREE |
| `core.audit_logs`       | `idx_audit_logs_tenant_created` | `(tenant_id, created_at)` | B-TREE |
| `core.audit_logs`       | `idx_audit_logs_user_id`        | `user_id`                 | B-TREE |
| `core.system_config`    | `idx_system_config_category`    | `category`                | B-TREE |
| `{schema}.team_members` | `idx_team_members_user_id`      | `user_id`                 | B-TREE |
| `{schema}.team_members` | `idx_team_members_team_id`      | `team_id`                 | B-TREE |

**Performance note for NFR-002**: The composite index `idx_audit_logs_tenant_created` enables efficient 30-day range queries scoped to a tenant: `WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`. With B-TREE on `(tenant_id, created_at)`, this is a single index range scan — well under the 500ms target for typical volumes (<100K rows per tenant per 30 days).

### 2.4 Migrations

1. **Migration 001**: Add `audit_logs` table to core schema via Prisma migration
   - Add `AuditLog` model to `schema.prisma`
   - Run `pnpm db:generate && pnpm db:migrate`
   - Create all indexes listed above for `audit_logs`

2. **Migration 002**: Add `system_config` table to core schema via Prisma migration
   - Add `SystemConfig` model to `schema.prisma`
   - Run migration
   - Seed default configuration values

3. **Migration 003**: Add `team_members` table to tenant schemas via `schema-step.ts`
   - Add `CREATE TABLE` statement to `SchemaStep.execute()`
   - Add indexes for `team_id` and `user_id`
   - Existing tenants: run a one-time migration script to add `team_members` to all existing tenant schemas

---

## 3. API Endpoints

### 3.1 Super Admin APIs

#### 3.1.1 GET `/api/v1/admin/dashboard`

- **Description**: System dashboard metrics (tenant count, user count, plugin count, system health)
- **Auth**: Bearer + `super_admin` role
- **Rate Limit**: 60 req/min
- **Implements**: FR-001
- **Request**: No body. No query parameters.
- **Response (200)**:
  ```json
  {
    "data": {
      "tenants": { "total": 42, "active": 38, "suspended": 3, "provisioning": 1 },
      "users": { "total": 1250 },
      "plugins": { "total": 15, "active": 12, "installed": 14 },
      "health": { "status": "healthy", "database": "ok", "redis": "ok", "keycloak": "ok" },
      "apiCalls24h": 0
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 401 | `AUTH_MISSING_TOKEN` | No or invalid Bearer token |
  | 403 | `AUTH_INSUFFICIENT_ROLE`| User is not super_admin |

- **Implementation note**: Extends existing `analyticsService.getOverview()` with health check aggregation from the `/health` endpoint. The `apiCalls24h` field currently returns 0 (placeholder per existing `analyticsService` — tracked as TD-009).

#### 3.1.2 GET `/api/v1/admin/tenants` _(EXISTS)_

Already implemented in `admin.ts` lines 60–150. Supports pagination (`page`, `limit`), search, and status filter. **No changes needed.**

#### 3.1.3 POST `/api/v1/admin/tenants` _(EXISTS)_

Already implemented in `admin.ts`. Creates tenant via `tenantService.createTenant()` with full provisioning orchestration (ADR-015). **No changes needed.**

#### 3.1.4 PATCH `/api/v1/admin/tenants/:id`

- **Description**: Update tenant (name, settings, theme). Uses PATCH (not PUT per spec) to align with existing codebase pattern.
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-002
- **Status**: _(EXISTS)_ — Already implemented in `admin.ts` as `PATCH /admin/tenants/:id`. **No changes needed.**

#### 3.1.5 POST `/api/v1/admin/tenants/:id/suspend` _(EXISTS)_

Already implemented. **No changes needed.**

#### 3.1.6 POST `/api/v1/admin/tenants/:id/reactivate`

- **Description**: Reactivate a suspended tenant
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-002
- **Status**: _(EXISTS)_ as `POST /admin/tenants/:id/activate` — path uses "activate" not "reactivate". The plan will add a `/reactivate` alias route for spec compliance while keeping the existing `/activate` route.
- **Request**: No body.
- **Response (200)**:
  ```json
  {
    "data": { "id": "uuid", "slug": "acme", "status": "ACTIVE", "name": "Acme Corp" }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------- | ---------------------------------- |
  | 404 | `TENANT_NOT_FOUND` | Tenant ID does not exist |
  | 409 | `TENANT_NOT_SUSPENDED`| Tenant is not in SUSPENDED status |

#### 3.1.7 DELETE `/api/v1/admin/tenants/:id` _(EXISTS)_

Already implemented. **No changes needed.**

#### 3.1.8 GET `/api/v1/admin/audit-logs`

- **Description**: Global audit log with cross-tenant visibility
- **Auth**: Bearer + `super_admin` role
- **Rate Limit**: 30 req/min (heavy queries)
- **Implements**: FR-006, US-007
- **Request** (Query params):
  | Param | Type | Required | Default | Notes |
  | ----------- | -------- | -------- | ------- | ------------------------------------ |
  | page | number | No | 1 | 1-indexed |
  | limit | number | No | 50 | Max 100 |
  | tenant_id | string | No | | Filter by tenant |
  | user_id | string | No | | Filter by user |
  | action | string | No | | Filter by action (exact match) |
  | resource_type| string | No | | Filter by resource type |
  | start_date | string | No | | ISO 8601 datetime |
  | end_date | string | No | | ISO 8601 datetime |
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "tenantId": null,
        "userId": "user-uuid",
        "action": "tenant.created",
        "resourceType": "tenant",
        "resourceId": "tenant-uuid",
        "details": { "slug": "acme-corp" },
        "ipAddress": "192.168.1.1",
        "createdAt": "2026-02-28T12:00:00Z"
      }
    ],
    "meta": { "total": 1500, "page": 1, "limit": 50 }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid query parameters |
  | 400 | `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` | `(page - 1) * limit >= 10,000` (Edge Case #6) |
  | 401 | `AUTH_MISSING_TOKEN` | No Bearer token |
  | 403 | `AUTH_INSUFFICIENT_ROLE`| Not super_admin |

- **Edge Case #6**: Result window capped at 10,000 entries per spec §6, Edge Case #6 (see **Inline Decision: Audit Log 10K Cap** in §9). If `(page - 1) * limit >= 10,000`, the endpoint returns 400 with code `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`. The `meta.total` reflects true count; clients must narrow queries with `start_date`/`end_date` or `action` filters to access data beyond the window. The B-TREE composite index on `(tenant_id, created_at)` keeps filtered queries under 500ms (NFR-002).

#### 3.1.9 GET `/api/v1/admin/super-admins`

- **Description**: List all Super Admin users
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-004
- **Request** (Query params):
  | Param | Type | Required | Default |
  | ------ | ------ | -------- | ------- |
  | page | number | No | 1 |
  | limit | number | No | 50 |
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "email": "admin@plexica.io",
        "name": "Platform Admin",
        "createdAt": "2026-01-01T00:00:00Z"
      }
    ],
    "meta": { "total": 3, "page": 1, "limit": 50 }
  }
  ```

#### 3.1.10 POST `/api/v1/admin/super-admins`

- **Description**: Create a new Super Admin user
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-004
- **Request**:
  ```json
  {
    "email": "new-admin@plexica.io",
    "name": "New Admin"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": { "id": "uuid", "email": "new-admin@plexica.io", "name": "New Admin" }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------ | -------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid email format |
  | 409 | `SUPER_ADMIN_EXISTS` | Email already registered |

#### 3.1.11 DELETE `/api/v1/admin/super-admins/:id`

- **Description**: Remove a Super Admin
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-004, Edge Case #8
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | -------------------------------- |
  | 404 | `SUPER_ADMIN_NOT_FOUND` | ID does not exist |
  | 409 | `LAST_SUPER_ADMIN` | Cannot remove the last super_admin |

#### 3.1.12 GET `/api/v1/admin/system-config`

- **Description**: Get all system configuration settings
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-005
- **Request** (Query params):
  | Param | Type | Required | Default |
  | -------- | ------ | -------- | ------- |
  | category | string | No | |
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "key": "maintenance_mode",
        "value": false,
        "category": "maintenance",
        "description": "Global maintenance mode flag",
        "updatedAt": "2026-02-28T12:00:00Z"
      }
    ]
  }
  ```

#### 3.1.13 PATCH `/api/v1/admin/system-config/:key`

- **Description**: Update a single system configuration value
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-005
- **Request**:
  ```json
  {
    "value": true
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "key": "maintenance_mode",
      "value": true,
      "category": "maintenance",
      "updatedBy": "user-uuid",
      "updatedAt": "2026-02-28T12:01:00Z"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 404 | `CONFIG_KEY_NOT_FOUND` | Unknown configuration key |

#### 3.1.14 GET `/api/v1/admin/system-health`

- **Description**: System health monitoring with dependency status
- **Auth**: Bearer + `super_admin` role
- **Implements**: FR-007
- **Response (200)**:
  ```json
  {
    "data": {
      "status": "healthy",
      "uptime": 86400,
      "version": "1.0.0",
      "dependencies": {
        "database": { "status": "ok", "latencyMs": 5 },
        "redis": { "status": "ok", "latencyMs": 2 },
        "keycloak": { "status": "ok", "latencyMs": 15 },
        "minio": { "status": "ok", "latencyMs": 8 }
      },
      "metrics": {
        "memoryUsageMb": 256,
        "cpuUsagePercent": 15,
        "activeConnections": 42
      }
    }
  }
  ```

### 3.2 Tenant Admin APIs

All Tenant Admin endpoints require:

- Bearer token with `tenant_admin`, `tenant_owner`, or `admin` role
- `X-Tenant-Slug` header identifying the tenant
- Tenant context middleware validation (tenant exists, is ACTIVE)

#### 3.2.1 GET `/api/v1/tenant/dashboard`

- **Description**: Tenant-scoped dashboard metrics
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-008
- **Response (200)**:
  ```json
  {
    "data": {
      "users": { "total": 85, "active": 78, "invited": 5, "deactivated": 2 },
      "teams": { "total": 12 },
      "workspaces": { "total": 8 },
      "plugins": { "enabled": 5, "total": 15 },
      "roles": { "system": 4, "custom": 3 }
    }
  }
  ```

#### 3.2.2 GET `/api/v1/tenant/users`

- **Description**: List all users in the tenant
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-009, US-003
- **Request** (Query params):
  | Param | Type | Required | Default | Notes |
  | ------ | ------ | -------- | ------- | -------------------------------- |
  | page | number | No | 1 | |
  | limit | number | No | 50 | Max 100 |
  | search | string | No | | Search by name or email |
  | status | string | No | | `active`, `invited`, `deactivated` |
  | role | string | No | | Filter by role name |
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "user-uuid",
        "email": "user@acme.com",
        "name": "Jane Doe",
        "status": "active",
        "roles": [{ "id": "role-uuid", "name": "tenant_admin", "isSystem": true }],
        "teams": [{ "id": "team-uuid", "name": "Engineering", "role": "ADMIN" }],
        "createdAt": "2026-01-15T10:00:00Z"
      }
    ],
    "meta": { "total": 85, "page": 1, "limit": 50 }
  }
  ```

#### 3.2.3 POST `/api/v1/tenant/users/invite`

- **Description**: Invite a user to the tenant
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-009, US-003, Edge Case #4
- **Request**:
  ```json
  {
    "email": "newuser@acme.com",
    "roleId": "role-uuid"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "user-uuid",
      "email": "newuser@acme.com",
      "status": "invited",
      "roleId": "role-uuid"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------ | --------------------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid email |
  | 404 | `ROLE_NOT_FOUND` | Role ID does not exist in tenant |

- **Edge Case #4**: If the email belongs to an existing user in Keycloak, the user is added to the tenant realm (no duplicate account). The Keycloak service handles this via `keycloakService.inviteUser()`.

#### 3.2.4 PATCH `/api/v1/tenant/users/:id`

- **Description**: Update user (name, role assignment). Uses PATCH for partial update.
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-009, US-003
- **Request**:
  ```json
  {
    "name": "Jane Smith",
    "roleIds": ["role-uuid-1", "role-uuid-2"]
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "user-uuid",
      "name": "Jane Smith",
      "roles": [{ "id": "role-uuid-1", "name": "user" }]
    }
  }
  ```

#### 3.2.5 POST `/api/v1/tenant/users/:id/deactivate`

- **Description**: Deactivate a user (revoke access)
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-009, US-003, Edge Case #7
- **Response (200)**:
  ```json
  {
    "data": { "id": "user-uuid", "status": "deactivated" }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------------- | ------------------------------------- |
  | 404 | `USER_NOT_FOUND` | User not in this tenant |
  | 409 | `LAST_TENANT_ADMIN` | Cannot deactivate last tenant_admin |

- **Edge Case #7**: Before deactivation, check if user is the last `tenant_admin`. If so, return 409 with code `LAST_TENANT_ADMIN`.

#### 3.2.6 GET `/api/v1/tenant/teams`

- **Description**: List all teams in the tenant
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010, US-005
- **Request** (Query params):
  | Param | Type | Required | Default |
  | ------------ | ------ | -------- | ------- |
  | page | number | No | 1 |
  | limit | number | No | 50 |
  | workspace_id | string | No | |
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "team-uuid",
        "name": "Engineering",
        "description": "Core engineering team",
        "workspaceId": "ws-uuid",
        "ownerId": "user-uuid",
        "memberCount": 8,
        "createdAt": "2026-02-01T10:00:00Z"
      }
    ],
    "meta": { "total": 12, "page": 1, "limit": 50 }
  }
  ```

#### 3.2.7 POST `/api/v1/tenant/teams`

- **Description**: Create a new team
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010, US-005
- **Request**:
  ```json
  {
    "name": "Design",
    "description": "Design team",
    "workspaceId": "ws-uuid"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "team-uuid",
      "name": "Design",
      "workspaceId": "ws-uuid",
      "ownerId": "current-user-uuid"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 400 | `VALIDATION_ERROR` | Missing required fields |
  | 404 | `WORKSPACE_NOT_FOUND` | Workspace ID not in this tenant |

#### 3.2.8 PATCH `/api/v1/tenant/teams/:id`

- **Description**: Update team name/description
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010
- **Request**:
  ```json
  {
    "name": "Design & UX",
    "description": "Updated description"
  }
  ```
- **Response (200)**: Updated team object

#### 3.2.9 DELETE `/api/v1/tenant/teams/:id`

- **Description**: Delete a team (cascades to team_members)
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------- | ------------------------- |
  | 404 | `TEAM_NOT_FOUND` | Team not in this tenant |

#### 3.2.10 POST `/api/v1/tenant/teams/:id/members`

- **Description**: Add a member to a team with role
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010, US-005
- **Request**:
  ```json
  {
    "userId": "user-uuid",
    "role": "MEMBER"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "teamId": "team-uuid",
      "userId": "user-uuid",
      "role": "MEMBER",
      "joinedAt": "2026-02-28T12:00:00Z"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 404 | `USER_NOT_FOUND` | User not in this tenant |
  | 404 | `TEAM_NOT_FOUND` | Team not in this tenant |
  | 409 | `MEMBER_ALREADY_EXISTS` | User already in team |

#### 3.2.11 DELETE `/api/v1/tenant/teams/:id/members/:userId`

- **Description**: Remove a member from a team
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-010, US-005
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | --------------------------------- |
  | 404 | `MEMBER_NOT_FOUND` | User not in this team |

#### 3.2.12 GET `/api/v1/tenant/roles`

- **Description**: List all roles (system + custom) with permissions
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-011, US-004
- **Note**: Wraps existing `roleService.listRoles()`. No new service logic needed.
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "role-uuid",
        "name": "tenant_admin",
        "isSystem": true,
        "permissions": [
          { "id": "perm-uuid", "key": "users:read", "name": "Read Users", "pluginId": null }
        ]
      }
    ],
    "meta": { "total": 7, "page": 1, "limit": 50, "customRoleCount": 3 }
  }
  ```

#### 3.2.13 POST `/api/v1/tenant/roles`

- **Description**: Create a custom role with permissions
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-011, US-004
- **Note**: Wraps existing `roleService.createRole()`.
- **Request**:
  ```json
  {
    "name": "Sales Manager",
    "description": "Access to CRM contacts and deals",
    "permissionIds": ["perm-uuid-1", "perm-uuid-2"]
  }
  ```
- **Response (201)**: RoleWithPermissions object
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------------- | ------------------------------------- |
  | 409 | `ROLE_NAME_CONFLICT` | Role name already exists in tenant |
  | 422 | `CUSTOM_ROLE_LIMIT_EXCEEDED`| Max 50 custom roles reached |

#### 3.2.14 PATCH `/api/v1/tenant/roles/:id`

- **Description**: Update a custom role (name, description, permissions)
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-011, US-004, Edge Case #2
- **Note**: Wraps existing `roleService.updateRole()`. System roles return 403.
- **Request**:
  ```json
  {
    "name": "Senior Sales Manager",
    "permissionIds": ["perm-uuid-1", "perm-uuid-2", "perm-uuid-3"]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------------- | ------------------------------------- |
  | 403 | `SYSTEM_ROLE_IMMUTABLE` | Cannot modify system roles |
  | 404 | `ROLE_NOT_FOUND` | Role not in this tenant |
  | 409 | `ROLE_NAME_CONFLICT` | New name conflicts |

#### 3.2.15 DELETE `/api/v1/tenant/roles/:id`

- **Description**: Delete a custom role
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-011
- **Note**: Wraps existing `roleService.deleteRole()`. System roles return 403.
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------ | ------------------------------ |
  | 403 | `SYSTEM_ROLE_IMMUTABLE` | Cannot delete system roles |
  | 404 | `ROLE_NOT_FOUND` | Role not in this tenant |

#### 3.2.16 GET `/api/v1/tenant/permissions`

- **Description**: List all available permissions (core + plugin) for the role editor UI
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-011, US-004 (grouped permission checkboxes)
- **Response (200)**:
  ```json
  {
    "data": {
      "core": [
        { "id": "perm-uuid", "key": "users:read", "name": "Read Users", "description": "..." }
      ],
      "plugins": {
        "crm-plugin": [{ "id": "perm-uuid", "key": "crm:contacts:read", "name": "Read Contacts" }]
      }
    }
  }
  ```
- **Note**: Groups permissions by source (`pluginId = null` → core, else grouped by plugin). This directly supports the role editor UI with grouped checkboxes per US-004.

#### 3.2.17 GET `/api/v1/tenant/settings`

- **Description**: Get tenant settings and theme
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-013, US-006
- **Response (200)**:
  ```json
  {
    "data": {
      "settings": { "defaultWorkspace": "main", "notificationsEnabled": true },
      "theme": {
        "logoUrl": "https://...",
        "primaryColor": "#3B82F6",
        "fontFamily": "Inter"
      }
    }
  }
  ```

#### 3.2.18 PATCH `/api/v1/tenant/settings`

- **Description**: Update tenant settings and/or theme
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-013, US-006
- **Request**:
  ```json
  {
    "settings": { "notificationsEnabled": false },
    "theme": { "primaryColor": "#EF4444" }
  }
  ```
- **Response (200)**: Updated settings/theme object
- **Validation**: Theme values validated via existing `TenantThemeSchema` (Zod). Settings validated with a `TenantSettingsSchema`.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------ | --------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid theme/settings values |

#### 3.2.19 GET `/api/v1/tenant/audit-logs`

- **Description**: Tenant-scoped audit log
- **Auth**: Bearer + `tenant_admin`/`tenant_owner`
- **Implements**: FR-014, US-007
- **Request** (Query params): Same as 3.1.8 except no `tenant_id` param (auto-scoped). Same 10K result-window cap applies (see §9 Inline Decision).
- **Response (200)**: Same shape as 3.1.8 but filtered to current tenant
- **Security (NFR-004)**: The query always includes `WHERE tenant_id = $currentTenantId`. This is enforced at the service layer — no tenant_id override is accepted from query params.

---

## 4. Component Design

### 4.1 AuditLogService

- **Purpose**: Central service for writing and querying audit log entries
- **Location**: `apps/core-api/src/services/audit-log.service.ts`
- **Responsibilities**:
  - Write audit log entries (append-only)
  - Query audit logs with filtering and pagination
  - Enforce tenant scoping for Tenant Admin queries
- **Dependencies**:
  - `@plexica/database` (Prisma client)
  - `logger` from `lib/logger.js`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- |
  | `log` | `entry: AuditLogEntry` | `Promise<void>` | Write a single audit entry |
  | `query` | `filters: AuditLogFilters` | `Promise<AuditLogPage>` | Query with pagination and filters |
  | `queryForTenant` | `tenantId: string, filters: AuditLogFilters` | `Promise<AuditLogPage>` | Query scoped to a specific tenant |

- **Types**:

  ```typescript
  interface AuditLogEntry {
    tenantId?: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }

  interface AuditLogFilters {
    tenantId?: string;
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }

  interface AuditLogPage {
    data: AuditLogRecord[];
    meta: { total: number; page: number; limit: number };
  }
  ```

### 4.2 AuditLogMiddleware

- **Purpose**: Fastify hook that automatically captures audit events after route handlers execute
- **Location**: `apps/core-api/src/middleware/audit-log.ts`
- **Responsibilities**:
  - Extract user ID, tenant ID, IP address, user agent from request
  - Determine action from route metadata (via Fastify route config)
  - Call `auditLogService.log()` on successful responses (2xx/3xx)
  - Non-blocking: errors in audit logging are logged but do not fail the request
- **Dependencies**:
  - `AuditLogService`
  - Fastify request/reply types
- **Pattern**: Routes opt-in to auditing by setting `config.audit` in the route definition:
  ```typescript
  fastify.post('/admin/tenants', {
    config: { audit: { action: 'tenant.created', resourceType: 'tenant' } },
    preHandler: [requireSuperAdmin],
    handler: async (request, reply) => { ... }
  });
  ```

### 4.3 TenantAdminService

- **Purpose**: Service layer for tenant-scoped admin operations (user management, team management, dashboard metrics)
- **Location**: `apps/core-api/src/services/tenant-admin.service.ts`
- **Responsibilities**:
  - Tenant user listing with enrichment (roles, teams, status)
  - User invitation via Keycloak
  - User deactivation with last-admin guard
  - Team CRUD and member management
  - Tenant dashboard metrics aggregation
- **Dependencies**:
  - `@plexica/database` (Prisma client for core queries)
  - `db` from `lib/db.js` (raw queries for tenant schema)
  - `keycloakService` for user operations
  - `roleService` for role lookups
  - `auditLogService` for audit trail
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --------------------- | ----------------------------------------------------------------------- | -------------------------- | ------------------------------------ |
  | `getDashboard` | `tenantId: string, schemaName: string` | `Promise<TenantDashboard>` | Aggregate tenant metrics |
  | `listUsers` | `tenantId: string, schemaName: string, filters: UserFilters` | `Promise<UserPage>` | Paginated user list with roles/teams |
  | `inviteUser` | `tenantId: string, schemaName: string, dto: InviteUserDto` | `Promise<User>` | Invite user via Keycloak |
  | `updateUser` | `tenantId: string, schemaName: string, userId: string, dto: UpdateUserDto` | `Promise<User>` | Update user info and roles |
  | `deactivateUser` | `tenantId: string, schemaName: string, userId: string` | `Promise<User>` | Deactivate with last-admin guard |
  | `listTeams` | `tenantId: string, schemaName: string, filters: TeamFilters` | `Promise<TeamPage>` | Paginated team list with member count|
  | `createTeam` | `tenantId: string, schemaName: string, dto: CreateTeamDto` | `Promise<Team>` | Create team in tenant |
  | `updateTeam` | `tenantId: string, schemaName: string, teamId: string, dto: UpdateTeamDto` | `Promise<Team>` | Update team |
  | `deleteTeam` | `tenantId: string, schemaName: string, teamId: string` | `Promise<void>` | Delete team (cascades members) |
  | `addTeamMember` | `tenantId: string, schemaName: string, teamId: string, dto: AddTeamMemberDto` | `Promise<TeamMember>` | Add member with role |
  | `removeTeamMember` | `tenantId: string, schemaName: string, teamId: string, userId: string` | `Promise<void>` | Remove member |

### 4.4 SystemConfigService

- **Purpose**: Manage platform-wide system configuration (feature flags, limits, maintenance mode)
- **Location**: `apps/core-api/src/services/system-config.service.ts`
- **Responsibilities**:
  - Get all config values (optionally filtered by category)
  - Get single config value by key
  - Update config value with audit trail
  - Cache config values in Redis (5-minute TTL) for hot-path reads
- **Dependencies**:
  - `@plexica/database` (Prisma client)
  - `redis` from `lib/redis.js`
  - `auditLogService`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------------- | --------------------------------------------- | ---------------------------- | ------------------------------ |
  | `getAll` | `category?: string` | `Promise<SystemConfigEntry[]>`| List all config entries |
  | `get` | `key: string` | `Promise<SystemConfigEntry>` | Get single config value |
  | `update` | `key: string, value: Json, userId: string` | `Promise<SystemConfigEntry>` | Update config value |
  | `isMaintenanceMode` | | `Promise<boolean>` | Check maintenance mode (cached)|

### 4.5 SuperAdminService (Extension)

- **Purpose**: Extend existing `AdminService` with Super Admin user CRUD and system health
- **Location**: `apps/core-api/src/services/admin.service.ts` (modify existing)
- **Responsibilities**:
  - CRUD operations on `super_admins` table
  - Last-super-admin guard
  - System health aggregation
- **New Methods** (added to existing `AdminService`):
  | Method | Parameters | Returns | Description |
  | ----------------------- | -------------------------------- | ---------------------------- | -------------------------------- |
  | `listSuperAdmins` | `page: number, limit: number` | `Promise<SuperAdminPage>` | List all super admin records |
  | `createSuperAdmin` | `dto: CreateSuperAdminDto` | `Promise<SuperAdmin>` | Create super admin + Keycloak |
  | `deleteSuperAdmin` | `id: string` | `Promise<void>` | Delete with last-admin guard |
  | `getSystemHealth` | | `Promise<SystemHealthStatus>`| Aggregate dependency health |

### 4.6 `requireTenantAdmin` Middleware

- **Purpose**: Named middleware export for tenant admin authorization
- **Location**: `apps/core-api/src/middleware/auth.ts` (add to existing file)
- **Behavior**: Validates that the authenticated user has one of: `tenant_admin`, `tenant_owner`, or `admin` role within the current tenant context.
- **Implementation**:
  ```typescript
  export async function requireTenantAdmin(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const roles = request.user?.roles ?? request.token?.realm_access?.roles ?? [];
    const hasTenantAdmin = roles.some(
      (r: string) => r === 'tenant_admin' || r === 'tenant_owner' || r === 'admin'
    );
    if (!hasTenantAdmin) {
      return reply.code(403).send({
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: 'This action requires tenant administrator privileges',
        },
      });
    }
  }
  ```

### 4.7 TenantAdminRoutes

- **Purpose**: Fastify route plugin for all Tenant Admin endpoints
- **Location**: `apps/core-api/src/routes/tenant-admin.ts`
- **Responsibilities**:
  - Register all `/api/v1/tenant/*` routes
  - Apply `authMiddleware` + `tenantContextMiddleware` + `requireTenantAdmin` to all routes
  - Zod validation for all request bodies
  - Delegate to `TenantAdminService`, `roleService`, `auditLogService`
  - Return responses in Constitution Art. 6.2 error format

### 4.8 SuperAdminExtensionRoutes

- **Purpose**: New Super Admin routes for dashboard, super admin users, system config, system health, and audit logs
- **Location**: `apps/core-api/src/routes/admin.ts` (extend existing file)
- **Responsibilities**:
  - Add routes for FR-001, FR-004, FR-005, FR-006, FR-007
  - All routes use existing `requireSuperAdmin` middleware
  - Add audit logging via `AuditLogMiddleware` to existing mutation routes

---

## 5. File Map

### Files to Create

| Path                                                                           | Purpose                                         | Estimated Size |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | -------------- |
| `apps/core-api/src/services/audit-log.service.ts`                              | Audit log service (write + query)               | M (~200 lines) |
| `apps/core-api/src/middleware/audit-log.ts`                                    | Audit log middleware (Fastify hook)             | S (~80 lines)  |
| `apps/core-api/src/services/tenant-admin.service.ts`                           | Tenant admin service (users, teams, dashboard)  | L (~500 lines) |
| `apps/core-api/src/services/system-config.service.ts`                          | System configuration service                    | M (~150 lines) |
| `apps/core-api/src/routes/tenant-admin.ts`                                     | Tenant admin routes (15 endpoints)              | L (~800 lines) |
| `apps/core-api/src/__tests__/unit/audit-log.service.test.ts`                   | Unit tests for AuditLogService                  | M (~300 lines) |
| `apps/core-api/src/__tests__/unit/tenant-admin.service.test.ts`                | Unit tests for TenantAdminService               | L (~500 lines) |
| `apps/core-api/src/__tests__/unit/system-config.service.test.ts`               | Unit tests for SystemConfigService              | M (~200 lines) |
| `apps/core-api/src/__tests__/integration/tenant-admin-api.integration.test.ts` | Integration tests for Tenant Admin API          | L (~600 lines) |
| `apps/core-api/src/__tests__/integration/audit-log-api.integration.test.ts`    | Integration tests for audit log endpoints       | M (~300 lines) |
| `apps/core-api/src/__tests__/unit/admin-error-format.test.ts`                  | Unit tests for Art. 6.2 error format compliance | M (~200 lines) |
| `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`                  | E2E tests for critical admin workflows          | M (~300 lines) |

### Files to Modify

| Path                                                           | Section/Lines                                             | Change Description                                                                                                                                                                    | Estimated Effort |
| -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/database/prisma/schema.prisma`                       | End of file                                               | Add `AuditLog` and `SystemConfig` models                                                                                                                                              | S                |
| `apps/core-api/src/services/provisioning-steps/schema-step.ts` | After teams table (~L274)                                 | Add `team_members` CREATE TABLE + indexes                                                                                                                                             | S                |
| `apps/core-api/src/routes/admin.ts`                            | Throughout (error remediation) + end of file (new routes) | Normalize 17 existing non-compliant error responses to Art. 6.2 format (T008-00); then add dashboard, super admin CRUD, system config, health, audit log, and reactivate alias routes | M                |
| `apps/core-api/src/services/admin.service.ts`                  | End of class                                              | Add `listSuperAdmins`, `createSuperAdmin`, `deleteSuperAdmin`, `getSystemHealth` methods                                                                                              | M                |
| `apps/core-api/src/middleware/auth.ts`                         | After `requireSuperAdmin`                                 | Add `requireTenantAdmin` export                                                                                                                                                       | S                |
| `apps/core-api/src/index.ts`                                   | `registerRoutes()`                                        | Register `tenantAdminRoutes` and audit log middleware                                                                                                                                 | S                |
| `apps/core-api/src/constants/index.ts`                         | After CACHE_TTL                                           | Add `AUDIT_ACTIONS` constants                                                                                                                                                         | S                |

### Files to Delete

None.

### Files to Reference (Read-only)

| Path                                                                         | Purpose                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| `.forge/constitution.md`                                                     | Validate architectural decisions           |
| `.forge/specs/008-admin-interfaces/spec.md`                                  | Source requirements                        |
| `.forge/architecture/architecture.md`                                        | System architecture reference              |
| `apps/core-api/src/modules/authorization/role.service.ts`                    | Existing role CRUD to wrap (not modify)    |
| `apps/core-api/src/modules/authorization/constants.ts`                       | Permission keys, system roles, cache keys  |
| `apps/core-api/src/modules/authorization/permission-registration.service.ts` | Permission listing for role editor         |
| `apps/core-api/src/services/keycloak.service.ts`                             | User invite/deactivate operations          |
| `apps/core-api/src/services/tenant.service.ts`                               | Tenant lookup, schema name derivation      |
| `apps/core-api/src/services/analytics.service.ts`                            | Existing analytics to extend for dashboard |

---

## 6. Dependencies

### 6.1 New Dependencies

None. All required packages are already in the approved stack:

- `@plexica/database` (Prisma) — for `AuditLog` and `SystemConfig` models
- `zod` — already used for request validation
- `ioredis` — already used for caching (system config cache)

### 6.2 Internal Dependencies

- **AuditLogService** → Prisma client, logger
- **AuditLogMiddleware** → AuditLogService, Fastify request types
- **TenantAdminService** → Prisma client, db (raw queries), KeycloakService, RoleService, AuditLogService
- **SystemConfigService** → Prisma client, Redis, AuditLogService
- **TenantAdminRoutes** → TenantAdminService, RoleService, AuditLogService, `requireTenantAdmin` middleware
- **SuperAdmin extensions** → AdminService (existing), AuditLogService, SystemConfigService

### 6.3 Dependency Graph

```
TenantAdminRoutes
  ├── requireTenantAdmin (middleware/auth.ts)
  ├── tenantContextMiddleware (existing)
  ├── TenantAdminService
  │   ├── db (raw queries for tenant schema)
  │   ├── KeycloakService (user invite/deactivate)
  │   ├── RoleService (role assignment)
  │   └── AuditLogService
  └── RoleService (role CRUD — direct delegation)

admin.ts (extended)
  ├── requireSuperAdmin (existing)
  ├── AdminService (extended with super admin CRUD, health)
  ├── SystemConfigService
  ├── AuditLogService
  └── AnalyticsService (existing, for dashboard)
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Audit Logs + Data Model + Error Format Remediation)

**Objective**: Create the audit log infrastructure, data model changes, and normalize existing error responses — all of which later phases depend on.

**Files to Create**:

- `apps/core-api/src/services/audit-log.service.ts`
  - Purpose: Core audit log service
  - Dependencies: None (uses Prisma)
  - Estimated effort: 4h
- `apps/core-api/src/middleware/audit-log.ts`
  - Purpose: Fastify audit hook
  - Dependencies: AuditLogService
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/unit/audit-log.service.test.ts`
  - Purpose: Unit tests
  - Dependencies: AuditLogService
  - Estimated effort: 3h
- `apps/core-api/src/__tests__/unit/admin-error-format.test.ts`
  - Purpose: Unit tests asserting all existing `admin.ts` error responses comply with Art. 6.2 format
  - Dependencies: T008-00 (error remediation)
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/routes/admin.ts`
  - Section: All existing error responses (lines ~640, 655, 1157, 1163, 1358, 1364, 1426, 1439, 1492, 1521, 1527, 1720, 1726, 1774, 1835, 1883, 1949)
  - Change: Normalize 17 existing error responses from `{ error: 'Not Found', message: '...' }` to Constitution Art. 6.2 format: `{ error: { code: string, message: string, details?: object } }`
  - Estimated effort: 3h
- `packages/database/prisma/schema.prisma`
  - Change: Add `AuditLog` and `SystemConfig` models
  - Estimated effort: 1h
- `apps/core-api/src/services/provisioning-steps/schema-step.ts`
  - Section: After line 274 (teams table)
  - Change: Add `team_members` table + indexes
  - Estimated effort: 1h
- `apps/core-api/src/constants/index.ts`
  - Change: Add `AUDIT_ACTIONS` constant map
  - Estimated effort: 0.5h

**Tasks**:

1. [ ] **T008-00: Normalize existing `admin.ts` error responses to Art. 6.2 format** _(must complete before T008-11 adds new routes)_
   - Audit all 17 non-compliant error responses in `admin.ts` (lines ~640, 655, 1157, 1163, 1358, 1364, 1426, 1439, 1492, 1521, 1527, 1720, 1726, 1774, 1835, 1883, 1949)
   - Replace each `{ error: '<ErrorName>', message: '...' }` with `{ error: { code: '<ERROR_CODE>', message: '...' } }`
   - Use SCREAMING_SNAKE_CASE error codes consistent with new route conventions (e.g., `TENANT_NOT_FOUND`, `PLUGIN_NOT_FOUND`, `VALIDATION_ERROR`)
   - Add `details` object where contextual information exists (e.g., `{ tenantId }`, `{ pluginId }`)
   - Write unit tests (`admin-error-format.test.ts`) asserting every existing endpoint returns the `{ error: { code, message } }` shape on error paths
   - Estimated effort: 3h code + 2h tests = 5h
2. [ ] T008-01: Add `AuditLog` model to Prisma schema + run migration
3. [ ] T008-02: Add `SystemConfig` model to Prisma schema + run migration + seed defaults
4. [ ] T008-03: Add `team_members` table to `schema-step.ts` + write migration script for existing tenants
5. [ ] T008-04: Implement `AuditLogService` with `log()`, `query()`, `queryForTenant()`
6. [ ] T008-05: Implement `AuditLogMiddleware` Fastify hook
7. [ ] T008-06: Add `AUDIT_ACTIONS` constants
8. [ ] T008-07: Unit tests for `AuditLogService` (≥85% coverage)
9. [ ] T008-07b: Unit tests for existing `admin.ts` error format compliance (Art. 6.2)

**Estimated Story Points**: 16

### Phase 2: Super Admin Extensions

**Objective**: Fill remaining gaps in the Super Admin Panel: dashboard endpoint, super admin user management, system configuration, system health, global audit log endpoint.

**Files to Create**:

- `apps/core-api/src/services/system-config.service.ts`
  - Purpose: System configuration CRUD + Redis cache
  - Dependencies: Phase 1 (Prisma models)
  - Estimated effort: 3h
- `apps/core-api/src/__tests__/unit/system-config.service.test.ts`
  - Purpose: Unit tests
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/integration/audit-log-api.integration.test.ts`
  - Purpose: Integration tests for audit + system config endpoints
  - Estimated effort: 4h

**Files to Modify**:

- `apps/core-api/src/services/admin.service.ts`
  - Change: Add `listSuperAdmins`, `createSuperAdmin`, `deleteSuperAdmin`, `getSystemHealth`
  - Estimated effort: 4h
- `apps/core-api/src/routes/admin.ts`
  - Change: Add 7 new routes (dashboard, super admin CRUD, system config, health, audit logs, reactivate alias)
  - Estimated effort: 6h
- `apps/core-api/src/index.ts`
  - Change: Register audit log middleware globally
  - Estimated effort: 0.5h

**Tasks**:

1. [ ] T008-08: Implement `SystemConfigService` with `getAll`, `get`, `update`, `isMaintenanceMode`
2. [ ] T008-09: Extend `AdminService` with super admin CRUD methods
3. [ ] T008-10: Extend `AdminService` with `getSystemHealth()` aggregation
4. [ ] T008-11: Add `GET /api/v1/admin/dashboard` route
5. [ ] T008-12: Add `GET/POST/DELETE /api/v1/admin/super-admins` routes
6. [ ] T008-13: Add `GET/PATCH /api/v1/admin/system-config` routes
7. [ ] T008-14: Add `GET /api/v1/admin/system-health` route
8. [ ] T008-15: Add `GET /api/v1/admin/audit-logs` route
9. [ ] T008-16: Add `POST /api/v1/admin/tenants/:id/reactivate` alias route
10. [ ] T008-17: Wire audit logging into existing Super Admin mutation routes
11. [ ] T008-18: Unit tests for `SystemConfigService` (≥85% coverage)
12. [ ] T008-19: Integration tests for new Super Admin endpoints

**Estimated Story Points**: 21

### Phase 3: Tenant Admin Interface

**Objective**: Build the complete Tenant Admin API from scratch: user management, team management, role editor routes, tenant settings, tenant dashboard, tenant audit log.

**Files to Create**:

- `apps/core-api/src/services/tenant-admin.service.ts`
  - Purpose: Tenant admin service layer
  - Dependencies: Phase 1 (team_members table, AuditLogService)
  - Estimated effort: 8h
- `apps/core-api/src/routes/tenant-admin.ts`
  - Purpose: 15 Tenant Admin endpoints
  - Dependencies: TenantAdminService, requireTenantAdmin
  - Estimated effort: 10h
- `apps/core-api/src/__tests__/unit/tenant-admin.service.test.ts`
  - Purpose: Unit tests
  - Estimated effort: 6h
- `apps/core-api/src/__tests__/integration/tenant-admin-api.integration.test.ts`
  - Purpose: Integration tests
  - Estimated effort: 8h

**Files to Modify**:

- `apps/core-api/src/middleware/auth.ts`
  - Change: Add `requireTenantAdmin` export
  - Estimated effort: 0.5h
- `apps/core-api/src/index.ts`
  - Change: Register `tenantAdminRoutes` with prefix `/api/v1`
  - Estimated effort: 0.5h

**Tasks**:

1. [ ] T008-20: Add `requireTenantAdmin` middleware to `auth.ts`
2. [ ] T008-21: Implement `TenantAdminService.getDashboard()`
3. [ ] T008-22: Implement `TenantAdminService.listUsers()`, `inviteUser()`, `updateUser()`, `deactivateUser()`
4. [ ] T008-23: Implement `TenantAdminService.listTeams()`, `createTeam()`, `updateTeam()`, `deleteTeam()`
5. [ ] T008-24: Implement `TenantAdminService.addTeamMember()`, `removeTeamMember()`
6. [ ] T008-25: Implement `TenantAdminRoutes` — dashboard and user management routes (5 routes)
7. [ ] T008-26: Implement `TenantAdminRoutes` — team management routes (6 routes)
8. [ ] T008-27: Implement `TenantAdminRoutes` — role editor routes (4 routes, wrapping roleService)
9. [ ] T008-28: Implement `TenantAdminRoutes` — permissions listing route
10. [ ] T008-29: Implement `TenantAdminRoutes` — tenant settings GET/PATCH routes
11. [ ] T008-30: Implement `TenantAdminRoutes` — tenant audit log route
12. [ ] T008-31: Register `tenantAdminRoutes` in `index.ts`
13. [ ] T008-32: Unit tests for `TenantAdminService` (≥85% coverage)
14. [ ] T008-33: Integration tests for Tenant Admin endpoints

**Estimated Story Points**: 26

### Phase 4: E2E Tests & Hardening

**Objective**: End-to-end tests for critical admin workflows, audit log verification, edge case coverage.

**Files to Create**:

- `apps/core-api/src/__tests__/e2e/admin-workflows.e2e.test.ts`
  - Purpose: E2E tests for full admin workflows
  - Dependencies: Phases 1-3
  - Estimated effort: 6h

**Tasks**:

1. [ ] T008-34: E2E test — Super Admin creates tenant → suspends → reactivates → deletes (audit trail verified)
2. [ ] T008-35: E2E test — Tenant Admin invites user → assigns role → creates team → adds member → deactivates user
3. [ ] T008-36: E2E test — Role editor: create custom role → assign permissions → assign to user → verify access
4. [ ] T008-37: E2E test — Edge cases: last admin guard, system role immutability, duplicate slug, cross-tenant isolation
5. [ ] T008-38: E2E test — Audit log query with date range and action filters

**Estimated Story Points**: 8

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                 | Test Focus                                                                    | Target Coverage |
| ------------------------- | ----------------------------------------------------------------------------- | --------------- |
| `AuditLogService`         | Entry creation, query building, tenant scoping, input validation              | ≥85%            |
| `TenantAdminService`      | User CRUD, team CRUD, member management, last-admin guard, dashboard metrics  | ≥85%            |
| `SystemConfigService`     | Get/update config, maintenance mode check, Redis cache                        | ≥85%            |
| `AdminService` (extended) | Super admin CRUD, last-super-admin guard, health aggregation                  | ≥85%            |
| `requireTenantAdmin`      | Role checking, error responses                                                | ≥90%            |
| `AuditLogMiddleware`      | Hook invocation, error resilience, config parsing                             | ≥80%            |
| `admin.ts` error format   | All existing error paths return Art. 6.2 `{ error: { code, message } }` shape | 100%            |

### 8.2 Integration Tests

| Scenario                                            | Dependencies                                   |
| --------------------------------------------------- | ---------------------------------------------- |
| Super Admin dashboard returns correct metrics       | PostgreSQL, existing tenant/plugin data        |
| Super Admin CRUD for super_admins                   | PostgreSQL, Keycloak                           |
| System config get/update with Redis caching         | PostgreSQL, Redis                              |
| Global audit log query with filters                 | PostgreSQL (audit_logs populated)              |
| Tenant Admin user listing with role/team enrichment | PostgreSQL (tenant schema), Keycloak           |
| Tenant Admin user invite flow                       | PostgreSQL, Keycloak                           |
| Tenant Admin team CRUD + member management          | PostgreSQL (tenant schema with team_members)   |
| Tenant Admin role editor (wrapping roleService)     | PostgreSQL (tenant schema roles/permissions)   |
| Tenant Admin settings get/update                    | PostgreSQL                                     |
| Tenant-scoped audit log isolation                   | PostgreSQL (audit_logs with multiple tenants)  |
| Cross-tenant isolation (NFR-004)                    | PostgreSQL, JWT with different tenant contexts |

### 8.3 E2E Tests

| Scenario                                   | Critical Path                                              |
| ------------------------------------------ | ---------------------------------------------------------- |
| Complete tenant lifecycle with audit trail | Create → Suspend → Reactivate → Delete                     |
| Complete user lifecycle in tenant          | Invite → Assign Role → Deactivate                          |
| Team lifecycle with members                | Create Team → Add Members → Remove Member → Delete Team    |
| Custom role with permissions               | Create Role → Assign Permissions → Assign to User → Verify |
| Edge case: last admin protection           | Attempt deactivation of last tenant_admin                  |

### 8.4 Test Counts (Estimated)

| Type        | Estimated Count | Coverage Target |
| ----------- | --------------- | --------------- |
| Unit tests  | ~95             | ≥85%            |
| Integration | ~40             | ≥80%            |
| E2E         | ~15             | Critical paths  |
| **Total**   | **~150**        |                 |

---

## 9. Architectural Decisions

| ADR     | Decision                                         | Status   |
| ------- | ------------------------------------------------ | -------- |
| ADR-002 | Schema-per-tenant (existing)                     | Accepted |
| ADR-015 | Tenant provisioning orchestration (existing)     | Accepted |
| ADR-017 | ABAC engine with deny-only overlay (existing)    | Accepted |
| —       | Audit logs in core schema with tenant_id scoping | Inline   |
| —       | System config as key-value with categories       | Inline   |
| —       | team_members as join table in tenant schema      | Inline   |
| —       | PATCH (not PUT) for update endpoints             | Inline   |
| —       | Audit log 10K result-window cap (spec Edge #6)   | Inline   |

### Inline Decision: Audit Logs in Core Schema

**Context**: The spec proposes an `audit_logs` table. The question is whether it belongs in the core schema (shared) or in each tenant schema (isolated).

**Decision**: Core schema with `tenant_id` column.

**Rationale**:

- Super Admins need cross-tenant audit log queries (FR-006). If logs were per-tenant-schema, cross-tenant queries would require querying every schema.
- Tenant Admin queries filter by `tenant_id` — the composite index `(tenant_id, created_at)` makes this efficient.
- Prisma can manage the model in the core schema; no raw SQL needed for CRUD.
- Retention policies and archival are simpler with a single table.

**Alternative considered**: Per-tenant-schema `audit_logs` table — rejected because cross-tenant queries would be extremely expensive and violate NFR-002.

### Inline Decision: PATCH vs PUT

**Context**: The spec uses `PUT` for update endpoints. The existing codebase uses `PATCH` for partial updates.

**Decision**: Use `PATCH` consistently for all update endpoints.

**Rationale**: `PATCH` is more appropriate for partial updates (sending only changed fields). All existing endpoints (`/admin/tenants/:id`) use `PATCH`. Consistency with codebase takes precedence over spec wording. This deviation is documented here.

### Inline Decision: Audit Log 10K Cap (Spec Deviation)

**Context**: The spec (§6, Edge Case #6) states "max 10,000 entries per query" for large audit log date ranges. The plan must decide how to handle this constraint.

**Spec constraint**: `max 10,000 entries per query`

**Decision**: Enforce the cap as a server-side result-window limit. The `page * limit` product (i.e., the maximum offset + page size) is capped at 10,000. If a client requests `page=101&limit=100` (offset 10,000), the server returns a 400 error with code `AUDIT_LOG_RESULT_WINDOW_EXCEEDED`. The Zod validation schema for both audit log endpoints enforces:

```typescript
const AuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    // ... other filters
  })
  .refine((data) => (data.page - 1) * data.limit < 10_000, {
    message:
      'Result window exceeds 10,000 entries. Narrow your query with date range or action filters.',
  });
```

The `meta.total` field still returns the true count (which may exceed 10,000) so clients know results exist beyond the window and can narrow their query with `start_date`/`end_date` or `action` filters.

**Rationale**:

- **Respects the spec constraint**: The 10K cap is enforced, not dropped.
- **Protects against deep pagination**: PostgreSQL `OFFSET`-based pagination degrades beyond ~10K rows because the DB must scan and discard all preceding rows. Capping the result window avoids this.
- **Does not limit total results**: Clients can still access all audit data by narrowing with date range and action filters — the indexes `(tenant_id, created_at)` and `(action)` make filtered queries efficient.
- **Precedent**: This pattern matches Elasticsearch's `index.max_result_window` (default 10,000) and is a well-understood API constraint.

**Alternative considered**: No cap, rely on pagination + indexes only — rejected because (a) it deviates from the spec without justification, and (b) deep pagination (e.g., page 5,000 of 100-row pages) causes real performance degradation with OFFSET-based queries regardless of indexes.

---

## 10. Requirement Traceability

| Requirement | Plan Section                                    | Implementation Path                                                                               |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| FR-001      | §3.1.1                                          | `GET /api/v1/admin/dashboard` → AdminService + AnalyticsService                                   |
| FR-002      | §3.1.2–3.1.7                                    | Existing routes (tenant CRUD) + reactivate alias                                                  |
| FR-003      | §3.1 (note)                                     | Existing routes (plugin management in `admin.ts`)                                                 |
| FR-004      | §3.1.9–3.1.11                                   | `GET/POST/DELETE /api/v1/admin/super-admins` → AdminService                                       |
| FR-005      | §3.1.12–3.1.13                                  | `GET/PATCH /api/v1/admin/system-config` → SystemConfigService                                     |
| FR-006      | §3.1.8                                          | `GET /api/v1/admin/audit-logs` → AuditLogService                                                  |
| FR-007      | §3.1.14                                         | `GET /api/v1/admin/system-health` → AdminService.getSystemHealth()                                |
| FR-008      | §3.2.1                                          | `GET /api/v1/tenant/dashboard` → TenantAdminService.getDashboard()                                |
| FR-009      | §3.2.2–3.2.5                                    | `GET/POST/PATCH/POST /api/v1/tenant/users/*` → TenantAdminService                                 |
| FR-010      | §3.2.6–3.2.11                                   | `GET/POST/PATCH/DELETE /api/v1/tenant/teams/*` → TenantAdminService                               |
| FR-011      | §3.2.12–3.2.16                                  | `GET/POST/PATCH/DELETE /api/v1/tenant/roles/*` + permissions → RoleService                        |
| FR-012      | §3.2.17–3.2.18 (note)                           | Tenant plugin settings via existing `tenant-plugins-v1.ts` routes                                 |
| FR-013      | §3.2.17–3.2.18                                  | `GET/PATCH /api/v1/tenant/settings` → TenantService (existing)                                    |
| FR-014      | §3.2.19                                         | `GET /api/v1/tenant/audit-logs` → AuditLogService.queryForTenant()                                |
| NFR-001     | §2.3 (indexes)                                  | B-TREE indexes; paginated queries; max 100 items/page                                             |
| NFR-002     | §2.3 (indexes)                                  | Composite index `(tenant_id, created_at)` for efficient 30-day queries                            |
| NFR-003     | §4.6, §3.1 (all)                                | `requireSuperAdmin` (existing) + `requireTenantAdmin` (new)                                       |
| NFR-004     | §3.2.19, §4.3                                   | Tenant ID enforced at service layer; no override via query params                                 |
| NFR-005     | Out of scope (frontend)                         | Backend provides validation error responses; frontend handles display                             |
| NFR-006     | Out of scope (frontend)                         | Backend APIs are responsive-agnostic; frontend handles layout                                     |
| NFR-007     | Out of scope (frontend)                         | Backend APIs return semantic data; frontend handles accessibility                                 |
| NFR-008     | Phase 2 (note)                                  | Existing provisioning orchestrator already provides step-by-step status                           |
| US-001      | FR-001, FR-002                                  | Dashboard + tenant CRUD                                                                           |
| US-002      | FR-003                                          | Plugin management (existing)                                                                      |
| US-003      | FR-009                                          | User management routes                                                                            |
| US-004      | FR-011                                          | Role editor routes + permissions endpoint                                                         |
| US-005      | FR-010                                          | Team management routes                                                                            |
| US-006      | FR-012, FR-013                                  | Tenant settings routes                                                                            |
| US-007      | FR-006, FR-014                                  | Audit log endpoints (global + tenant-scoped)                                                      |
| Edge #1     | §3.1.3 (existing)                               | Existing tenant creation returns 409 on duplicate slug                                            |
| Edge #2     | §3.2.14                                         | Role update returns 403 `SYSTEM_ROLE_IMMUTABLE` for system roles                                  |
| Edge #3     | §3.1.7 (existing)                               | Existing delete sets PENDING_DELETION with grace period                                           |
| Edge #4     | §3.2.3                                          | Keycloak handles existing user → adds to tenant realm                                             |
| Edge #5     | §3.1 (existing)                                 | Plugin lifecycle (ADR-018) handles install failure → revert                                       |
| Edge #6     | §3.1.8, §9 (Inline Decision: Audit Log 10K Cap) | Result window capped at 10,000 via Zod validation; `AUDIT_LOG_RESULT_WINDOW_EXCEEDED` on overflow |
| Edge #7     | §3.2.5                                          | `deactivateUser()` checks last tenant_admin → 409 `LAST_TENANT_ADMIN`                             |
| Edge #8     | §3.1.11                                         | `deleteSuperAdmin()` checks last super_admin → 409 `LAST_SUPER_ADMIN`                             |
| Art. 6.2    | §7 Phase 1 (T008-00)                            | Normalize 17 existing `admin.ts` error responses + unit tests (`admin-error-format.test.ts`)      |

---

## 11. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | **1.1**: Admin interfaces serve platform management mission. **1.2**: Security-first (all endpoints auth-gated), tenant isolation (NFR-004 enforced at service layer), API-first (REST endpoints), TDD (~150 tests planned). **1.3**: Error format provides actionable messages; validation errors return field-level details.                                                  |
| Art. 2  | ✅     | All components use approved stack: Fastify routes, Prisma models, Zod validation, ioredis caching, Vitest tests. No new dependencies introduced.                                                                                                                                                                                                                                |
| Art. 3  | ✅     | **3.1**: Feature module organization (services, routes, middleware). **3.2**: Controller → Service → Data access layering. **3.3**: All DB access via Prisma or parameterized raw queries with `validateSchemaName()`. **3.4**: REST conventions, API v1 versioning, pagination (max 100), standard error format.                                                               |
| Art. 4  | ✅     | **4.1**: Target ≥85% coverage for admin services, ≥80% overall. **4.2**: Plan includes unit, integration, and E2E tests. **4.3**: P95 <200ms for standard endpoints; audit log queries <500ms via composite index.                                                                                                                                                              |
| Art. 5  | ✅     | **5.1**: `requireSuperAdmin` for Super Admin routes, `requireTenantAdmin` for Tenant Admin routes, tenant context validation on every request. **5.2**: No PII in logs, audit log `details` field sanitized. **5.3**: Zod validation on all inputs, parameterized queries throughout.                                                                                           |
| Art. 6  | ✅     | **6.1**: Operational errors (validation, not found) return specific codes; programmer errors return generic 500. **6.2**: All new errors follow `{ error: { code, message, details? } }` format; T008-00 remediates 17 existing non-compliant error responses in `admin.ts` to the same format. **6.3**: Structured Pino logging with `tenantId`, `userId`, `requestId` fields. |
| Art. 7  | ✅     | **7.1**: kebab-case files (`audit-log.service.ts`), PascalCase classes (`AuditLogService`), camelCase functions. **7.2**: snake_case tables (`audit_logs`, `team_members`, `system_config`), snake_case columns. **7.3**: REST naming (`/api/v1/tenant/teams`), plural nouns, no URL verbs.                                                                                     |
| Art. 8  | ✅     | **8.1**: Unit + integration + E2E tests for all features. **8.2**: Deterministic, independent, fast tests following AAA pattern. **8.3**: Test factories for audit log entries; transaction-based cleanup.                                                                                                                                                                      |
| Art. 9  | ✅     | **9.1**: System config supports feature flags and maintenance mode. **9.2**: Health check aggregation endpoint; structured logging. **9.3**: Audit log provides investigation trail for incidents.                                                                                                                                                                              |

---

## Cross-References

| Document                    | Path                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| Spec                        | `.forge/specs/008-admin-interfaces/spec.md`                         |
| Architecture                | `.forge/architecture/architecture.md`                               |
| Constitution                | `.forge/constitution.md`                                            |
| ADR-002 (Multi-tenancy)     | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`            |
| ADR-015 (Provisioning)      | `.forge/knowledge/adr/adr-015-tenant-provisioning-orchestration.md` |
| ADR-017 (ABAC Engine)       | `.forge/knowledge/adr/adr-017-abac-engine.md`                       |
| ADR-018 (Plugin Lifecycle)  | `.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md`           |
| Role Service                | `apps/core-api/src/modules/authorization/role.service.ts`           |
| Authorization Constants     | `apps/core-api/src/modules/authorization/constants.ts`              |
| Existing Admin Routes       | `apps/core-api/src/routes/admin.ts`                                 |
| Existing Admin Service      | `apps/core-api/src/services/admin.service.ts`                       |
| Schema Step (Tenant Tables) | `apps/core-api/src/services/provisioning-steps/schema-step.ts`      |
| Tasks                       | <!-- Created by /forge-tasks -->                                    |
| ADRs                        | `.forge/knowledge/adr/`                                             |
