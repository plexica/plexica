# Plan: 003 - Authorization System (RBAC + ABAC)

> Technical implementation plan for the Plexica hybrid authorization system
> combining Role-Based Access Control and Attribute-Based Access Control.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                              |
| ------ | ---------------------------------- |
| Status | Draft                              |
| Author | forge-architect                    |
| Date   | 2026-02-22                         |
| Track  | Feature                            |
| Spec   | [spec.md](./spec.md)               |
| Design | [design-spec.md](./design-spec.md) |

---

## 1. Overview

This plan implements the Spec 003 hybrid RBAC + ABAC authorization system
for Plexica. The implementation is divided into **4 phases**:

1. **Phase 1 — Data Model & Migration** (~8 pts): Database schema migration
   from legacy JSONB-on-roles to normalised `permissions`, `role_permissions`,
   `policies` tables. Permission format migration from dot-separated
   (`users.read`) to colon-separated (`users:read`).

2. **Phase 2 — Backend RBAC Engine** (~21 pts): New `authorization` module
   with `RoleService`, `PermissionService` (new), `AuthorizationService`,
   `PermissionCacheService`. Redis permission caching with role-scoped
   invalidation and jittered TTLs. Refactored `requirePermission()` middleware
   with wildcard matching, audit logging, and NFR-004 compliance (no permission
   names in 403 responses). 14 REST API endpoints per spec §8.

3. **Phase 3 — Frontend Authorization UI** (~18 pts): 6 new screens (Role
   List, Role Editor, Role Detail, User Role Assignment, ABAC Policy List,
   ABAC Policy Editor) and 7 new components per design-spec.md. TanStack
   Router file-based routing under `access-control/` path segment.

4. **Phase 4 — ABAC Data Model & Feature Flag** (~5 pts): `policies` table
   creation, ABAC condition Zod schemas, feature flag gate for ABAC UI, and
   placeholder endpoints that return 404 when feature flag is off.

> **Critical scope note**: Per spec §10, the ABAC policy _engine_ (runtime
> evaluation) is out of scope for this plan. Only the data model, API
> endpoints, and UI are prepared. The actual ABAC evaluation engine requires
> **ADR-017** (next available number; spec references "ADR-015" which is
> already taken by Tenant Provisioning Orchestration) before Phase 3
> ABAC implementation begins.

**Total estimated effort**: ~52 story points across 4 phases.

---

## 2. Data Model

### 2.1 New Tables

All tables reside in **tenant-specific schemas** per ADR-002 (schema-per-tenant).
Every table includes a `tenant_id` column as defense-in-depth (Art. 5.2.4).

#### roles (replaces legacy `roles` table)

| Column      | Type         | Constraints                                 | Notes                                                        |
| ----------- | ------------ | ------------------------------------------- | ------------------------------------------------------------ |
| id          | UUID         | PK, DEFAULT gen_random_uuid()               |                                                              |
| tenant_id   | UUID         | NOT NULL, FK tenants(id) (defense-in-depth) | Art. 5.2.4                                                   |
| name        | VARCHAR(100) | NOT NULL                                    |                                                              |
| description | TEXT         | NULLABLE                                    |                                                              |
| is_system   | BOOLEAN      | NOT NULL, DEFAULT false                     | FR-004: true for super_admin, tenant_admin, team_admin, user |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                     |                                                              |
| updated_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                     |                                                              |

**Constraints**:

- `uq_roles_tenant_name`: UNIQUE(tenant_id, name) — role names unique within tenant (FR-005)

#### permissions

| Column      | Type         | Constraints                                 | Notes                              |
| ----------- | ------------ | ------------------------------------------- | ---------------------------------- |
| id          | UUID         | PK, DEFAULT gen_random_uuid()               |                                    |
| tenant_id   | UUID         | NOT NULL, FK tenants(id) (defense-in-depth) | Art. 5.2.4                         |
| key         | VARCHAR(200) | NOT NULL                                    | Format: `resource:action` (FR-001) |
| name        | VARCHAR(200) | NOT NULL                                    | Human-readable display name        |
| description | TEXT         | NULLABLE                                    |                                    |
| plugin_id   | VARCHAR(100) | NULLABLE, FK plugins(id)                    | NULL for core permissions (FR-012) |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                     |                                    |

**Constraints**:

- `uq_permissions_tenant_key`: UNIQUE(tenant_id, key) — permission keys unique within tenant

#### role_permissions (join table)

| Column        | Type | Constraints                                    | Notes      |
| ------------- | ---- | ---------------------------------------------- | ---------- |
| role_id       | UUID | NOT NULL, FK roles(id) ON DELETE CASCADE       |            |
| permission_id | UUID | NOT NULL, FK permissions(id) ON DELETE CASCADE |            |
| tenant_id     | UUID | NOT NULL (defense-in-depth)                    | Art. 5.2.4 |

**Constraints**:

- PK: (role_id, permission_id)

#### user_roles (replaces legacy `user_roles` table)

| Column      | Type        | Constraints                              | Notes      |
| ----------- | ----------- | ---------------------------------------- | ---------- |
| user_id     | UUID        | NOT NULL                                 |            |
| role_id     | UUID        | NOT NULL, FK roles(id) ON DELETE CASCADE |            |
| tenant_id   | UUID        | NOT NULL (defense-in-depth)              | Art. 5.2.4 |
| assigned_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                  |            |

**Constraints**:

- PK: (user_id, role_id)

#### policies (ABAC — Phase 4)

| Column     | Type         | Constraints                                                               | Notes                               |
| ---------- | ------------ | ------------------------------------------------------------------------- | ----------------------------------- |
| id         | UUID         | PK, DEFAULT gen_random_uuid()                                             |                                     |
| tenant_id  | UUID         | NOT NULL, FK tenants(id) (defense-in-depth)                               | Art. 5.2.4                          |
| name       | VARCHAR(200) | NOT NULL                                                                  |                                     |
| resource   | VARCHAR(200) | NOT NULL                                                                  | Resource pattern e.g. `crm:deals:*` |
| effect     | VARCHAR(10)  | NOT NULL, CHECK(effect IN ('DENY','FILTER'))                              | FR-017                              |
| conditions | JSONB        | NOT NULL, DEFAULT '{}'                                                    | Nested boolean tree (FR-008)        |
| priority   | INTEGER      | NOT NULL, DEFAULT 0                                                       | Higher = evaluated first            |
| source     | VARCHAR(20)  | NOT NULL, CHECK(source IN ('core','plugin','super_admin','tenant_admin')) | FR-009                              |
| plugin_id  | VARCHAR(100) | NULLABLE, FK plugins(id)                                                  |                                     |
| is_active  | BOOLEAN      | NOT NULL, DEFAULT true                                                    | Feature flag gate                   |
| created_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                                   |                                     |
| updated_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                                   |                                     |

**Constraints**:

- `uq_policies_tenant_name`: UNIQUE(tenant_id, name)
- CHECK: `jsonb_typeof(conditions) = 'object'`
- CHECK: `octet_length(conditions::text) <= 65536` (64 KB limit, FR-008)

### 2.2 Modified Tables

#### Legacy `roles` table (in tenant schemas)

| Column      | Change  | Before                     | After                                  |
| ----------- | ------- | -------------------------- | -------------------------------------- |
| permissions | REMOVED | JSONB column storing array | Moved to `role_permissions` join table |
| is_system   | ADDED   | (not present)              | BOOLEAN NOT NULL DEFAULT false         |

The legacy `roles` table will be replaced entirely by the new schema via migration.

### 2.3 Indexes

| Table            | Index Name                         | Columns               | Type   |
| ---------------- | ---------------------------------- | --------------------- | ------ |
| roles            | idx_roles_tenant_id                | (tenant_id)           | B-TREE |
| roles            | uq_roles_tenant_name               | (tenant_id, name)     | UNIQUE |
| permissions      | idx_permissions_tenant_id          | (tenant_id)           | B-TREE |
| permissions      | uq_permissions_tenant_key          | (tenant_id, key)      | UNIQUE |
| permissions      | idx_permissions_plugin_id          | (plugin_id)           | B-TREE |
| role_permissions | idx_role_permissions_permission_id | (permission_id)       | B-TREE |
| role_permissions | idx_role_permissions_tenant_id     | (tenant_id)           | B-TREE |
| user_roles       | idx_user_roles_user_id             | (user_id)             | B-TREE |
| user_roles       | idx_user_roles_tenant_id           | (tenant_id)           | B-TREE |
| policies         | idx_policies_tenant_id             | (tenant_id)           | B-TREE |
| policies         | idx_policies_resource              | (tenant_id, resource) | B-TREE |
| policies         | idx_policies_source                | (tenant_id, source)   | B-TREE |

### 2.4 Migrations

The migration must be backward-compatible (Art. 9.1: zero-downtime deployments).
It is executed as a **multi-step migration** within the tenant provisioning flow.

1. **Migration 001 — Create normalized authorization tables**: Create `permissions`,
   `role_permissions` tables in tenant schema template. Add `is_system` column
   to `roles` table. Create `user_roles` if not exists (may already exist from
   legacy provisioning).

2. **Migration 002 — Seed system roles and core permissions**: Insert system
   roles (`super_admin`, `tenant_admin`, `team_admin`, `user`) with
   `is_system = true`. Insert core permissions (`users:read`, `users:write`,
   `roles:read`, `roles:write`, `policies:read`, `policies:write`,
   `workspaces:read`, `workspaces:write`, `settings:read`, `settings:write`,
   `plugins:read`, `plugins:write`). Create `role_permissions` entries mapping
   system roles to their permissions.

3. **Migration 003 — Migrate legacy JSONB permissions**: For existing tenants,
   read the JSONB `permissions` array from legacy `roles` table, convert
   dot-separated format to colon-separated (`users.read` → `users:read`),
   create corresponding `permissions` rows if they don't exist, and insert
   `role_permissions` join entries. Then drop the `permissions` JSONB column
   from `roles`.

4. **Migration 004 — Create policies table** (Phase 4): Create `policies`
   table with ABAC condition schema. This runs as a separate migration that
   can be deployed independently.

**Rollback strategy**: Each migration has a corresponding down migration.
Migration 003 (data migration) stores the original JSONB data in a backup
column `_permissions_backup` before dropping, enabling rollback within 24h.

---

## 3. API Endpoints

### 3.1 GET /api/v1/roles

- **Description**: List all roles for the current tenant
- **Auth**: Bearer + `roles:read`
- **Rate Limit**: N/A (read endpoint)
- **FR Ref**: FR-003, FR-004, FR-005, FR-023
- **Request**: Query params:
  - `page` (integer, default 1)
  - `limit` (integer, default 20, max 100)
  - `search` (string, optional — filters by name)
  - `type` (enum: `system` | `custom`, optional)
  - `source` (string, optional — filters by plugin_id or 'core')
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Sales Manager",
        "description": "CRM access for sales team",
        "isSystem": false,
        "permissionCount": 5,
        "userCount": 8,
        "createdAt": "2026-01-15T00:00:00Z",
        "updatedAt": "2026-01-15T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 7,
      "totalPages": 1
    },
    "meta": {
      "customRoleCount": 3,
      "customRoleLimit": 50
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | ---------------------- |
  | 401 | AUTH_REQUIRED | No Bearer token |
  | 403 | AUTHORIZATION_DENIED | Missing `roles:read` |

### 3.2 POST /api/v1/roles

- **Description**: Create a custom role
- **Auth**: Bearer + `roles:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-005, FR-019
- **Request**:
  ```json
  {
    "name": "Sales Manager",
    "description": "Access to CRM contacts and deals",
    "permissionIds": ["uuid1", "uuid2", "uuid3"]
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Sales Manager",
      "description": "Access to CRM contacts and deals",
      "isSystem": false,
      "permissions": [{ "id": "uuid1", "key": "crm:contacts:read", "name": "View contacts" }],
      "createdAt": "2026-02-22T00:00:00Z",
      "updatedAt": "2026-02-22T00:00:00Z"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------------- | --------------------------------- |
  | 400 | VALIDATION_ERROR | Invalid input |
  | 401 | AUTH_REQUIRED | No Bearer token |
  | 403 | AUTHORIZATION_DENIED | Missing `roles:write` |
  | 409 | ROLE_NAME_CONFLICT | Role name already exists |
  | 422 | CUSTOM_ROLE_LIMIT_EXCEEDED | 50 custom roles already exist |
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min (NFR-010) |

### 3.3 PUT /api/v1/roles/:id

- **Description**: Update a custom role (name, description, permissions)
- **Auth**: Bearer + `roles:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-004 (system roles immutable), FR-005, FR-019
- **Request**:
  ```json
  {
    "name": "Sales Manager",
    "description": "Updated description",
    "permissionIds": ["uuid1", "uuid2"]
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Sales Manager",
      "description": "Updated description",
      "isSystem": false,
      "permissions": [],
      "updatedAt": "2026-02-22T01:00:00Z"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ---------------------- | ------------------------------ |
  | 400 | VALIDATION_ERROR | Invalid input |
  | 403 | AUTHORIZATION_DENIED | Missing `roles:write` |
  | 403 | SYSTEM_ROLE_IMMUTABLE | Attempt to edit system role |
  | 404 | ROLE_NOT_FOUND | Role does not exist |
  | 409 | ROLE_NAME_CONFLICT | Name already taken |
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min |

### 3.4 DELETE /api/v1/roles/:id

- **Description**: Delete a custom role (removes from all assigned users)
- **Auth**: Bearer + `roles:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-004 (system roles immutable), FR-019
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------- | -------------------------------- |
  | 403 | AUTHORIZATION_DENIED | Missing `roles:write` |
  | 403 | SYSTEM_ROLE_IMMUTABLE | Attempt to delete system role |
  | 404 | ROLE_NOT_FOUND | Role does not exist |
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min |

### 3.5 GET /api/v1/permissions

- **Description**: List all available permissions for the tenant
- **Auth**: Bearer + `roles:read`
- **FR Ref**: FR-001, FR-002, FR-011, FR-012, FR-020
- **Request**: Query params:
  - `source` (string, optional — `core` or plugin ID)
  - `search` (string, optional)
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "key": "users:read",
        "name": "View users",
        "description": "View user profiles in the tenant",
        "source": "core",
        "pluginId": null
      },
      {
        "id": "uuid",
        "key": "crm:contacts:read",
        "name": "View contacts",
        "description": "View CRM contacts",
        "source": "crm",
        "pluginId": "crm"
      }
    ],
    "groups": {
      "core": ["users:read", "users:write", "..."],
      "crm": ["crm:contacts:read", "crm:deals:*", "..."]
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------- | -------------------- |
  | 401 | AUTH_REQUIRED | No Bearer token |
  | 403 | AUTHORIZATION_DENIED | Missing `roles:read` |

### 3.6 POST /api/v1/users/:id/roles

- **Description**: Assign a role to a user
- **Auth**: Bearer + `users:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-006, FR-018, FR-019
- **Request**:
  ```json
  {
    "roleId": "uuid"
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "userId": "uuid",
      "roleId": "uuid",
      "roleName": "Sales Manager",
      "assignedAt": "2026-02-22T00:00:00Z"
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------- | ----------------------------- |
  | 400 | VALIDATION_ERROR | Invalid roleId |
  | 403 | AUTHORIZATION_DENIED | Missing `users:write` |
  | 404 | USER_NOT_FOUND | User not in tenant |
  | 404 | ROLE_NOT_FOUND | Role does not exist |
  | 409 | ROLE_ALREADY_ASSIGNED| User already has this role |
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min |

### 3.7 DELETE /api/v1/users/:id/roles/:roleId

- **Description**: Remove a role from a user
- **Auth**: Bearer + `users:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-006, FR-019
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------- | -------------------------- |
  | 403 | AUTHORIZATION_DENIED | Missing `users:write` |
  | 404 | USER_NOT_FOUND | User not in tenant |
  | 404 | ROLE_NOT_FOUND | Role not assigned to user |
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min |

### 3.8 GET /api/v1/me/roles

- **Description**: Get calling user's effective roles in current tenant
- **Auth**: Bearer (no permission check — FR-024)
- **FR Ref**: FR-024
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "user",
        "description": "Standard user with read access",
        "isSystem": true
      },
      {
        "id": "uuid",
        "name": "Sales Manager",
        "description": "CRM access",
        "isSystem": false
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------- | --------------- |
  | 401 | AUTH_REQUIRED | No Bearer token |

### 3.9 GET /api/v1/me/permissions

- **Description**: Get calling user's effective expanded permission list
- **Auth**: Bearer (no permission check — FR-024)
- **FR Ref**: FR-024, FR-002 (wildcards expanded)
- **Response (200)**:
  ```json
  {
    "data": [
      "users:read",
      "workspaces:read",
      "crm:contacts:read",
      "crm:contacts:write",
      "crm:deals:read",
      "crm:deals:write",
      "crm:deals:delete"
    ],
    "wildcards": ["crm:deals:*"]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------- | --------------- |
  | 401 | AUTH_REQUIRED | No Bearer token |

### 3.10 GET /api/v1/policies

- **Description**: List ABAC policies for the current tenant
- **Auth**: Bearer + `policies:read`
- **FR Ref**: FR-007, FR-009, FR-017
- **Feature Flag**: `abac_enabled` — returns empty array when disabled
- **Request**: Query params:
  - `page`, `limit`, `search`, `effect` (`DENY` | `FILTER`), `source`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Sales: own deals only",
        "resource": "crm:deals:*",
        "effect": "FILTER",
        "source": "tenant_admin",
        "priority": 5,
        "conditionCount": 3,
        "isActive": true,
        "createdAt": "2026-02-22T00:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 },
    "meta": { "featureEnabled": true }
  }
  ```

### 3.11 POST /api/v1/policies

- **Description**: Create an ABAC policy
- **Auth**: Bearer + `policies:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-007, FR-008, FR-009, FR-017
- **Feature Flag**: `abac_enabled` — returns 404 when disabled
- **Request**:
  ```json
  {
    "name": "Sales: own deals only",
    "resource": "crm:deals:*",
    "effect": "FILTER",
    "priority": 5,
    "conditions": {
      "all": [
        { "attribute": "user.teamId", "operator": "equals", "value": "resource.teamId" },
        { "attribute": "resource.status", "operator": "notEquals", "value": "archived" }
      ]
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------------- | ---------------------------------- |
  | 400 | VALIDATION_ERROR | Invalid input |
  | 403 | AUTHORIZATION_DENIED | Missing `policies:write` |
  | 404 | FEATURE_NOT_AVAILABLE | Feature flag off |
  | 422 | CONDITION_TREE_LIMIT_EXCEEDED | Depth > 5, conditions > 20, > 64KB|
  | 429 | RATE_LIMIT_EXCEEDED | > 60 mutations/min |

### 3.12 PUT /api/v1/policies/:id

- **Description**: Update an ABAC policy (tenant-owned only)
- **Auth**: Bearer + `policies:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-009, FR-015
- **Feature Flag**: `abac_enabled`
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------------- | -------------------------------- |
  | 403 | POLICY_SOURCE_IMMUTABLE | Attempt to edit core/plugin policy |
  | 404 | POLICY_NOT_FOUND | Policy does not exist |
  | 422 | CONDITION_TREE_LIMIT_EXCEEDED | Exceeds depth/count/size limits |

### 3.13 DELETE /api/v1/policies/:id

- **Description**: Delete an ABAC policy (tenant-owned only)
- **Auth**: Bearer + `policies:write`
- **Rate Limit**: 60 mutations/tenant/min (NFR-010)
- **FR Ref**: FR-009
- **Feature Flag**: `abac_enabled`
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | ---------------------------------- |
  | 403 | POLICY_SOURCE_IMMUTABLE | Attempt to delete core/plugin policy |
  | 404 | POLICY_NOT_FOUND | Policy does not exist |

---

## 4. Component Design

### 4.1 AuthorizationService

- **Purpose**: Central authorization decision point. Orchestrates RBAC check
  flow: context extraction → permission resolution → wildcard matching →
  decision → audit logging.
- **Location**: `apps/core-api/src/modules/authorization/authorization.service.ts`
- **Responsibilities**:
  - Evaluate whether a user has a required permission within a tenant context
  - Resolve wildcard permissions (`crm:deals:*` matches `crm:deals:read`)
  - Handle super_admin bypass via `*:*` wildcard (FR-016)
  - Log authorization decisions at `info` level (NFR-003)
  - Delegate to `PermissionCacheService` for cached permission lookup
  - Return fail-closed decisions on errors (NFR-005)
- **Dependencies**:
  - `PermissionCacheService` (Redis-backed permission cache)
  - `RoleService` (database role/permission queries)
  - Tenant context (`AsyncLocalStorage` from `tenant-context.ts`)
  - Logger (Pino)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------------ | ----------------------------------------------- | --------------------- | ------------------------------------------------------- |
  | `authorize` | `userId: string, tenantId: string, requiredPermissions: string[]` | `AuthorizationResult` | Main RBAC authorization check |
  | `getUserEffectivePermissions` | `userId: string, tenantId: string` | `string[]` | Returns expanded permission list (wildcards expanded) |
  | `matchesPermission` | `userPermission: string, required: string` | `boolean` | Wildcard-aware permission matching |
  | `isSuperAdmin` | `roles: string[]` | `boolean` | Check if user has super_admin role |

### 4.2 RoleService

- **Purpose**: Database operations for roles and role-permission mappings.
- **Location**: `apps/core-api/src/modules/authorization/role.service.ts`
- **Responsibilities**:
  - CRUD operations for custom roles
  - Enforce system role immutability (FR-004)
  - Enforce 50 custom role limit per tenant (FR-005)
  - Role-user assignment and removal
  - Validate role name uniqueness within tenant
  - Trigger cache invalidation on mutations (FR-019)
- **Dependencies**:
  - Prisma client (`db` from `lib/db.ts`)
  - `PermissionCacheService` (for invalidation triggers)
  - Tenant context
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------------- | -------------------------------------------------- | ------------- | ------------------------------------ |
  | `listRoles` | `tenantId: string, filters: RoleFilters` | `RolePage` | Paginated role list with counts |
  | `getRoleById` | `tenantId: string, roleId: string` | `Role` | Single role with permissions |
  | `createRole` | `tenantId: string, data: CreateRoleDto` | `Role` | Create custom role (limit check) |
  | `updateRole` | `tenantId: string, roleId: string, data: UpdateRoleDto` | `Role` | Update custom role |
  | `deleteRole` | `tenantId: string, roleId: string` | `void` | Delete custom role + cascade |
  | `assignRoleToUser` | `tenantId: string, userId: string, roleId: string` | `void` | Assign role + cache flush |
  | `removeRoleFromUser` | `tenantId: string, userId: string, roleId: string` | `void` | Remove role + cache flush |
  | `getUserRoles` | `tenantId: string, userId: string` | `Role[]` | Get user's assigned roles |
  | `getUserPermissions` | `tenantId: string, userId: string` | `string[]` | Get all permission keys from DB |
  | `getCustomRoleCount` | `tenantId: string` | `number` | Count for limit enforcement |

### 4.3 PermissionCacheService

- **Purpose**: Redis-backed permission cache with role-scoped invalidation,
  jittered TTLs, and thundering herd protection.
- **Location**: `apps/core-api/src/modules/authorization/permission-cache.service.ts`
- **Responsibilities**:
  - Cache user permission sets in Redis with jittered TTLs (FR-019, NFR-007)
  - Role-scoped invalidation: when a role's permissions change, flush cache
    entries only for users assigned to that role (FR-019)
  - User-scoped invalidation: when a user's role assignment changes, flush
    only that user's cache entry (FR-019)
  - Tenant-wide flush for tenant-level resets (FR-019)
  - Debounced cache flush (500ms window) for rapid successive changes (NFR-010)
  - Graceful fallback to database on Redis failure (Edge Case #7)
- **Dependencies**:
  - Redis client (`lib/redis.ts`)
  - Logger (Pino)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ---------------------------- | --------------------------------------------- | ----------- | --------------------------------------------- |
  | `getUserPermissions` | `userId: string, tenantId: string` | `string[] \| null` | Get cached permissions (null = cache miss) |
  | `setUserPermissions` | `userId: string, tenantId: string, perms: string[]` | `void` | Set with jittered TTL (300s ± 30s) |
  | `invalidateForRole` | `tenantId: string, roleId: string` | `void` | Flush cache for all users with this role |
  | `invalidateForUser` | `tenantId: string, userId: string` | `void` | Flush single user cache entry |
  | `invalidateForTenant` | `tenantId: string` | `void` | Full tenant cache flush |
  | `debouncedInvalidateForRole` | `tenantId: string, roleId: string` | `void` | 500ms debounced flush (NFR-010) |

  **Cache key format**: `authz:perms:{tenantId}:{userId}`
  **Role→users index**: `authz:role_users:{tenantId}:{roleId}` (SET of user IDs)
  **TTL**: base 300s + random(-30, +30) = 270-330s jitter. Safety fallback: 900s (15 min).

### 4.4 PermissionRegistrationService

- **Purpose**: Manages plugin permission registration and removal.
- **Location**: `apps/core-api/src/modules/authorization/permission-registration.service.ts`
- **Responsibilities**:
  - Register plugin permissions from manifest on install (FR-011, FR-012)
  - Detect duplicate permission key conflicts (Edge Case #4)
  - Remove plugin permissions on uninstall and clean up role_permissions (FR-013)
  - Register core permissions during tenant provisioning
- **Dependencies**:
  - Prisma client
  - `PermissionCacheService` (tenant-wide flush on plugin install/uninstall)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------------- | -------------------------------------------------- | ---------- | ---------------------------------------- |
  | `registerPluginPermissions` | `tenantId: string, pluginId: string, perms: ManifestPermission[]` | `void` | Register from plugin manifest |
  | `removePluginPermissions` | `tenantId: string, pluginId: string` | `void` | Remove on uninstall + clean role_perms |
  | `registerCorePermissions` | `tenantId: string` | `void` | Seed core permissions on provisioning |

### 4.5 PolicyService (Phase 4)

- **Purpose**: CRUD operations for ABAC policies.
- **Location**: `apps/core-api/src/modules/authorization/policy.service.ts`
- **Responsibilities**:
  - CRUD for ABAC policies with source-based immutability (FR-009)
  - Validate condition tree structure against limits (FR-008)
  - Feature flag gate for ABAC operations
  - Register plugin default policies on install (FR-014)
  - Support tenant admin overrides of plugin policies (FR-015)
- **Dependencies**:
  - Prisma client
  - `ConditionValidatorService`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --------------- | ------------------------------------------ | -------- | --------------------------------- |
  | `listPolicies` | `tenantId: string, filters: PolicyFilters` | `PolicyPage` | Paginated policy list |
  | `createPolicy` | `tenantId: string, data: CreatePolicyDto` | `Policy` | Create policy (validation + limits)|
  | `updatePolicy` | `tenantId: string, policyId: string, data` | `Policy` | Update tenant-owned policy only |
  | `deletePolicy` | `tenantId: string, policyId: string` | `void` | Delete tenant-owned policy only |

### 4.6 ConditionValidatorService (Phase 4)

- **Purpose**: Validates ABAC condition tree structure.
- **Location**: `apps/core-api/src/modules/authorization/condition-validator.service.ts`
- **Responsibilities**:
  - Validate nested boolean tree structure (FR-008)
  - Enforce max depth of 5 levels
  - Enforce max 20 conditions per policy
  - Enforce max 64 KB JSONB payload size
  - Validate operator compatibility with attribute types
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --------------------- | ----------------------------- | --------------------- | ------------------------------- |
  | `validate` | `conditions: ConditionTree` | `ValidationResult` | Full validation with all limits |
  | `countConditions` | `node: ConditionNode` | `number` | Recursive condition counter |
  | `measureDepth` | `node: ConditionNode` | `number` | Recursive depth measurement |

### 4.7 Refactored `requirePermission()` Middleware

- **Purpose**: Replaces the existing `requirePermission()` in `auth.ts`
- **Location**: `apps/core-api/src/middleware/auth.ts` (modified)
- **Changes from legacy**:
  1. Use `AuthorizationService.authorize()` instead of direct DB query
  2. Redis cache via `PermissionCacheService` (NFR-002)
  3. Wildcard permission matching (FR-002)
  4. **Fix NFR-004 violation**: Change 403 response from
     `"Required permission(s): ${permissions.join(', ')}"` to
     `"You do not have permission to perform this action"` (generic message)
  5. Audit log authorization decisions at `info` level (NFR-003)
  6. Fail-closed on errors (NFR-005)
  7. super_admin bypass via `*:*` wildcard resolution (FR-016)

### 4.8 Rate Limiter for Auth Management

- **Purpose**: Rate limiting for write endpoints on authorization management
- **Location**: `apps/core-api/src/modules/authorization/guards/rate-limiter.guard.ts`
- **FR Ref**: NFR-010
- **Implementation**: Reuses Redis INCR+EXPIRE sliding window pattern from
  existing `middleware/rate-limiter.ts`. Key: `ratelimit:authz:{tenantId}`.
  Limit: 60 mutations per minute per tenant. Returns 429 with `Retry-After` header.

---

## 5. File Map

> All paths relative to project root.

### Files to Create

| Path                                                                         | Purpose                                                                    | Est. Size | Phase |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- | ----- |
| `apps/core-api/src/modules/authorization/authorization.service.ts`           | Central authorization decision engine                                      | L         | 2     |
| `apps/core-api/src/modules/authorization/role.service.ts`                    | Role CRUD operations                                                       | L         | 2     |
| `apps/core-api/src/modules/authorization/permission-cache.service.ts`        | Redis permission cache with jittered TTL                                   | M         | 2     |
| `apps/core-api/src/modules/authorization/permission-registration.service.ts` | Plugin permission registration/removal                                     | M         | 2     |
| `apps/core-api/src/modules/authorization/policy.service.ts`                  | ABAC policy CRUD                                                           | M         | 4     |
| `apps/core-api/src/modules/authorization/condition-validator.service.ts`     | ABAC condition tree validator                                              | S         | 4     |
| `apps/core-api/src/modules/authorization/dto/create-role.dto.ts`             | Zod schema for role creation                                               | S         | 2     |
| `apps/core-api/src/modules/authorization/dto/update-role.dto.ts`             | Zod schema for role update                                                 | S         | 2     |
| `apps/core-api/src/modules/authorization/dto/assign-role.dto.ts`             | Zod schema for role assignment                                             | S         | 2     |
| `apps/core-api/src/modules/authorization/dto/create-policy.dto.ts`           | Zod schema for policy creation                                             | M         | 4     |
| `apps/core-api/src/modules/authorization/dto/update-policy.dto.ts`           | Zod schema for policy update                                               | S         | 4     |
| `apps/core-api/src/modules/authorization/dto/condition-tree.dto.ts`          | Zod schema for ABAC condition tree (FR-008)                                | M         | 4     |
| `apps/core-api/src/modules/authorization/dto/index.ts`                       | DTO barrel export                                                          | S         | 2     |
| `apps/core-api/src/modules/authorization/types/authorization.types.ts`       | TypeScript types and interfaces                                            | M         | 2     |
| `apps/core-api/src/modules/authorization/types/index.ts`                     | Types barrel export                                                        | S         | 2     |
| `apps/core-api/src/modules/authorization/guards/rate-limiter.guard.ts`       | Auth management rate limiter (NFR-010)                                     | S         | 2     |
| `apps/core-api/src/modules/authorization/guards/index.ts`                    | Guards barrel export                                                       | S         | 2     |
| `apps/core-api/src/modules/authorization/constants.ts`                       | Permission constants (colon-separated format)                              | S         | 2     |
| `apps/core-api/src/routes/authorization.ts`                                  | Fastify route plugin for /api/v1/roles, /api/v1/permissions, /api/v1/me/\* | L         | 2     |
| `apps/core-api/src/routes/policies.ts`                                       | Fastify route plugin for /api/v1/policies                                  | M         | 4     |
| `apps/web/src/routes/access-control.roles.tsx`                               | Role List screen                                                           | L         | 3     |
| `apps/web/src/routes/access-control.roles.$roleId.tsx`                       | Role Detail screen                                                         | M         | 3     |
| `apps/web/src/routes/access-control.roles.create.tsx`                        | Role Editor (create)                                                       | L         | 3     |
| `apps/web/src/routes/access-control.roles.$roleId.edit.tsx`                  | Role Editor (edit)                                                         | M         | 3     |
| `apps/web/src/routes/access-control.users.tsx`                               | User Role Assignment screen                                                | L         | 3     |
| `apps/web/src/routes/access-control.policies.tsx`                            | ABAC Policy List screen                                                    | M         | 3     |
| `apps/web/src/routes/access-control.policies.create.tsx`                     | ABAC Policy Editor (create)                                                | L         | 3     |
| `apps/web/src/routes/access-control.policies.$policyId.edit.tsx`             | ABAC Policy Editor (edit)                                                  | M         | 3     |
| `apps/web/src/components/authorization/PermissionGroupAccordion.tsx`         | Permission accordion grouped by source                                     | M         | 3     |
| `apps/web/src/components/authorization/WildcardPermissionRow.tsx`            | Wildcard checkbox with sub-permissions                                     | M         | 3     |
| `apps/web/src/components/authorization/ConditionBuilder.tsx`                 | ABAC condition tree editor                                                 | L         | 3     |
| `apps/web/src/components/authorization/ConditionRow.tsx`                     | Single condition row                                                       | M         | 3     |
| `apps/web/src/components/authorization/ConditionGroup.tsx`                   | AND/OR condition group wrapper                                             | M         | 3     |
| `apps/web/src/components/authorization/NotGroup.tsx`                         | NOT condition wrapper                                                      | S         | 3     |
| `apps/web/src/components/authorization/ConditionLimitIndicator.tsx`          | Condition/depth usage indicator                                            | S         | 3     |
| `apps/web/src/components/authorization/PolicySummary.tsx`                    | Plain-English policy summary                                               | M         | 3     |
| `apps/web/src/components/authorization/RoleAssignmentDialog.tsx`             | Role assignment modal dialog                                               | M         | 3     |
| `apps/web/src/components/authorization/EffectBadge.tsx`                      | DENY/FILTER effect badge                                                   | S         | 3     |
| `apps/web/src/components/authorization/SystemRoleBadge.tsx`                  | System role lock icon + badge                                              | S         | 3     |
| `apps/web/src/hooks/usePermissions.ts`                                       | React hook for permission queries                                          | S         | 3     |
| `apps/web/src/hooks/useRoles.ts`                                             | React hook for role queries                                                | S         | 3     |
| `apps/web/src/hooks/usePolicies.ts`                                          | React hook for policy queries                                              | S         | 3     |
| `apps/web/src/hooks/useAuthorizationApi.ts`                                  | API client functions for authorization endpoints                           | M         | 3     |

### Files to Modify

| Path                                                         | Section/Lines                                             | Change Description                                                                                                                                                    | Est. Effort | Phase |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| `apps/core-api/src/middleware/auth.ts`                       | Lines 245-296 (`requirePermission`, `getUserPermissions`) | Replace legacy permission check with `AuthorizationService.authorize()`. Fix NFR-004 leak (line ~268). Add audit logging.                                             | L           | 2     |
| `apps/core-api/src/middleware/auth.ts`                       | Lines 204-231 (`requireRole`)                             | Fix information leak: remove `Required role(s)` from 403 message. Use generic message.                                                                                | S           | 2     |
| `apps/core-api/src/services/permission.service.ts`           | Entire file                                               | **Deprecate** — retain as shim during migration. Re-export from new `authorization` module. Eventually remove.                                                        | M           | 2     |
| `packages/database/prisma/schema.prisma`                     | After line 508                                            | Not modified directly — auth tables are in tenant schemas (raw SQL migrations via provisioning). Schema templates updated instead.                                    | N/A         | 1     |
| `apps/core-api/src/services/tenant.service.ts`               | Tenant provisioning section                               | Update `createTenantSchema()` to use new normalized table DDL instead of legacy roles/user_roles DDL. Call `PermissionRegistrationService.registerCorePermissions()`. | M           | 1     |
| `apps/core-api/src/routes/` (index/app registration)         | Route registration                                        | Register new `authorization.ts` and `policies.ts` route plugins                                                                                                       | S           | 2     |
| `apps/web/src/routes/__root.tsx`                             | Lines 1-29                                                | Add sidebar navigation for "Access Control" section with Roles, Users, Policies sub-items                                                                             | S           | 3     |
| `apps/web/src/components/Layout/Sidebar.tsx` (or equivalent) | Navigation section                                        | Add "Access Control" nav group with 3 links: Roles, Users, Policies                                                                                                   | S           | 3     |
| `apps/core-api/src/modules/plugin/`                          | Plugin install/uninstall hooks                            | Call `PermissionRegistrationService.registerPluginPermissions()` on install, `removePluginPermissions()` on uninstall.                                                | M           | 2     |

### Files to Delete (if any)

| Path                                                                            | Reason                           | Migration Notes        | Phase |
| ------------------------------------------------------------------------------- | -------------------------------- | ---------------------- | ----- |
| N/A — `permission.service.ts` deprecated but not deleted until Phase 2 complete | Backward compat during migration | Re-exports new service | 2     |

### Files to Reference (Read-only)

| Path                                                     | Purpose                           |
| -------------------------------------------------------- | --------------------------------- |
| `.forge/constitution.md`                                 | Validate architectural decisions  |
| `.forge/specs/003-authorization/spec.md`                 | Source of truth for requirements  |
| `.forge/specs/003-authorization/design-spec.md`          | UI/UX specifications              |
| `.forge/specs/003-authorization/user-journey.md`         | User journey flows                |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md` | Schema-per-tenant pattern         |
| `.forge/knowledge/adr/adr-006-fastify-framework.md`      | Fastify patterns                  |
| `.forge/knowledge/adr/adr-007-prisma-orm.md`             | Prisma usage patterns             |
| `apps/core-api/src/middleware/rate-limiter.ts`           | Redis rate limit pattern to reuse |
| `apps/core-api/src/middleware/tenant-context.ts`         | Tenant context AsyncLocalStorage  |
| `apps/core-api/src/lib/redis.ts`                         | Redis singleton client            |
| `apps/core-api/src/modules/workspace/`                   | Module structure pattern          |

---

## 6. Dependencies

### 6.1 New Dependencies

No new npm dependencies required. All functionality is implemented using
the approved stack (Constitution Art. 2.1):

- `ioredis` ^5.9 — already installed for Redis caching
- `zod` — already installed for input validation
- `@prisma/client` ^6.8 — already installed for database operations
- `fastify` ^5.7 — already installed for route handling
- `lucide-react` — already installed for icons (Lock icon for SystemRoleBadge)

### 6.2 Internal Dependencies

- **`@plexica/database`**: Prisma client for database operations
- **`apps/core-api/src/lib/redis.ts`**: Redis singleton for permission cache
- **`apps/core-api/src/lib/db.ts`**: Prisma singleton
- **`apps/core-api/src/middleware/tenant-context.ts`**: Tenant context middleware
- **`apps/core-api/src/middleware/auth.ts`**: Authentication middleware (to be modified)
- **`apps/core-api/src/middleware/rate-limiter.ts`**: Rate limit pattern (to be reused)
- **`apps/core-api/src/modules/plugin/`**: Plugin install/uninstall hooks
- **`apps/core-api/src/services/tenant.service.ts`**: Tenant provisioning
- **`@plexica/ui`**: Existing UI components (Badge, DataTable, Dialog, Tabs, etc.)
- **`apps/web/src/lib/api-client.ts`**: API client for frontend

---

## 7. Implementation Phases

### Phase 1: Data Model & Migration (~8 pts, ~2 days)

**Objective**: Create normalized authorization tables and migrate legacy data.

**Files to Create**:

- `apps/core-api/src/modules/authorization/types/authorization.types.ts`
  - Purpose: TypeScript interfaces for Role, Permission, Policy, AuthorizationResult
  - Dependencies: None
  - Estimated effort: 2h
- `apps/core-api/src/modules/authorization/types/index.ts`
  - Purpose: Types barrel export
  - Dependencies: None
  - Estimated effort: 15min
- `apps/core-api/src/modules/authorization/constants.ts`
  - Purpose: Core permission constants, system role definitions, cache key templates
  - Dependencies: None
  - Estimated effort: 1h

**Files to Modify**:

- `apps/core-api/src/services/tenant.service.ts`
  - Section: `createTenantSchema()` / tenant provisioning DDL
  - Change: Replace legacy `CREATE TABLE roles (... permissions JSONB ...)` with
    new normalized DDL: `roles` (with `is_system`), `permissions`, `role_permissions`,
    `user_roles` (updated), and `policies`. Insert system roles and core
    permissions as part of provisioning.
  - Estimated effort: 4h

**Tasks**:

1. [ ] T003-01: Define TypeScript interfaces for authorization domain (Role, Permission, Policy, UserRole, AuthorizationResult, ConditionTree, ConditionNode, LeafCondition)
2. [ ] T003-02: Define core permission constants in colon-separated format (`users:read`, `roles:write`, etc.) and system role definitions
3. [ ] T003-03: Update tenant provisioning DDL in `tenant.service.ts` to create normalized tables with all indexes and constraints
4. [ ] T003-04: Write data migration script for existing tenants: read JSONB permissions → convert format → insert into normalized tables → backup and drop JSONB column
5. [ ] T003-05: Write migration rollback script that restores JSONB from backup column

---

### Phase 2: Backend RBAC Engine (~21 pts, ~5 days)

**Objective**: Implement the full RBAC authorization engine with Redis caching,
14 API endpoints, and refactored middleware.

**Dependencies**: Phase 1 completion

**Files to Create**:

- `apps/core-api/src/modules/authorization/permission-cache.service.ts`
  - Purpose: Redis-backed permission caching with jittered TTLs
  - Dependencies: `lib/redis.ts`, Phase 1 types
  - Estimated effort: 4h
- `apps/core-api/src/modules/authorization/role.service.ts`
  - Purpose: Role CRUD with limit enforcement and cache invalidation
  - Dependencies: `lib/db.ts`, `PermissionCacheService`, Phase 1 types
  - Estimated effort: 6h
- `apps/core-api/src/modules/authorization/permission-registration.service.ts`
  - Purpose: Plugin permission registration and removal
  - Dependencies: `lib/db.ts`, `PermissionCacheService`
  - Estimated effort: 3h
- `apps/core-api/src/modules/authorization/authorization.service.ts`
  - Purpose: Central authorization decision engine
  - Dependencies: `PermissionCacheService`, `RoleService`, tenant context
  - Estimated effort: 4h
- `apps/core-api/src/modules/authorization/dto/create-role.dto.ts`
  - Purpose: Zod schema: `{ name: z.string().min(1).max(100), description: z.string().optional(), permissionIds: z.array(z.string().uuid()) }`
  - Estimated effort: 30min
- `apps/core-api/src/modules/authorization/dto/update-role.dto.ts`
  - Purpose: Same as create but all fields optional
  - Estimated effort: 15min
- `apps/core-api/src/modules/authorization/dto/assign-role.dto.ts`
  - Purpose: `{ roleId: z.string().uuid() }`
  - Estimated effort: 15min
- `apps/core-api/src/modules/authorization/dto/index.ts`
  - Purpose: DTO barrel export
  - Estimated effort: 15min
- `apps/core-api/src/modules/authorization/guards/rate-limiter.guard.ts`
  - Purpose: 60 mutations/tenant/min rate limiter for write endpoints
  - Dependencies: `lib/redis.ts`
  - Estimated effort: 2h
- `apps/core-api/src/modules/authorization/guards/index.ts`
  - Purpose: Guards barrel export
  - Estimated effort: 15min
- `apps/core-api/src/routes/authorization.ts`
  - Purpose: Fastify route plugin registering 9 endpoints (GET/POST/PUT/DELETE roles, GET permissions, POST/DELETE user roles, GET me/roles, GET me/permissions)
  - Dependencies: All services, DTOs, guards
  - Estimated effort: 6h

**Files to Modify**:

- `apps/core-api/src/middleware/auth.ts`
  - Lines 245-296: Replace `requirePermission()` internals
  - Lines 264-268: Fix NFR-004 permission leak
  - Lines 204-231: Fix `requireRole()` information leak
  - Estimated effort: 3h
- `apps/core-api/src/services/permission.service.ts`
  - Change: Deprecate class. Replace `getUserPermissions()` with delegation to new `AuthorizationService`. Add deprecation comment. Keep exports for backward compat.
  - Estimated effort: 1h
- `apps/core-api/src/modules/plugin/` (plugin install/uninstall)
  - Change: Call `PermissionRegistrationService` on plugin install/uninstall
  - Estimated effort: 2h
- Route registration file (app.ts or index.ts)
  - Change: Register `authorization.ts` route plugin
  - Estimated effort: 30min

**Tasks**:

1. [ ] T003-06: Implement `PermissionCacheService` with Redis GET/SET, jittered TTL (300s ± 30s), role→users index, role-scoped invalidation, user-scoped invalidation, tenant-wide flush, debounced flush (500ms), graceful fallback on Redis failure
2. [ ] T003-07: Implement `RoleService` with CRUD operations, system role immutability guard (FR-004), 50-role limit check (FR-005), role name uniqueness validation, cache invalidation triggers
3. [ ] T003-08: Implement `PermissionRegistrationService` for plugin permission registration (FR-011, FR-012) and removal (FR-013), core permission seeding
4. [ ] T003-09: Implement `AuthorizationService` with RBAC evaluation, wildcard matching (`crm:deals:*` matches `crm:deals:read`), `*:*` super_admin bypass (FR-016), fail-closed (NFR-005), audit logging at info level (NFR-003)
5. [ ] T003-10: Create Zod DTOs for role creation, update, assignment, and policy input validation
6. [ ] T003-11: Implement rate limiter guard (NFR-010): 60 mutations/tenant/min using Redis INCR+EXPIRE, 429 with Retry-After header
7. [ ] T003-12: Implement authorization route plugin with 9 endpoints (roles CRUD, permissions list, user role assignment/removal, me/roles, me/permissions)
8. [ ] T003-13: Refactor `requirePermission()` middleware: use `AuthorizationService`, fix NFR-004 leak, add audit logging, fail-closed
9. [ ] T003-14: Refactor `requireRole()` middleware: remove role names from 403 response
10. [ ] T003-15: Deprecate legacy `permission.service.ts`: delegate to new services, add deprecation notice
11. [ ] T003-16: Integrate plugin permission registration into plugin install/uninstall hooks
12. [ ] T003-17: Register authorization routes in application bootstrap

---

### Phase 3: Frontend Authorization UI (~18 pts, ~5 days)

**Objective**: Build the 6 screens and 7 components defined in design-spec.md.

**Dependencies**: Phase 2 completion (API endpoints available)

**Files to Create**:

- `apps/web/src/hooks/useAuthorizationApi.ts`
  - Purpose: API client functions wrapping fetch calls to authorization endpoints
  - Estimated effort: 2h
- `apps/web/src/hooks/useRoles.ts`
  - Purpose: React Query hooks for role data (list, detail, create, update, delete)
  - Estimated effort: 1h
- `apps/web/src/hooks/usePermissions.ts`
  - Purpose: React Query hook for permission list with grouping
  - Estimated effort: 1h
- `apps/web/src/hooks/usePolicies.ts`
  - Purpose: React Query hooks for policy data
  - Estimated effort: 1h
- `apps/web/src/components/authorization/SystemRoleBadge.tsx`
  - Purpose: Lock icon + "System" badge (FR-023)
  - Estimated effort: 30min
- `apps/web/src/components/authorization/EffectBadge.tsx`
  - Purpose: DENY (red) / FILTER (blue) effect badge (FR-017)
  - Estimated effort: 30min
- `apps/web/src/components/authorization/PermissionGroupAccordion.tsx`
  - Purpose: Collapsible permission group by source (FR-020)
  - Estimated effort: 3h
- `apps/web/src/components/authorization/WildcardPermissionRow.tsx`
  - Purpose: Wildcard checkbox with auto-select/deselect (FR-021)
  - Estimated effort: 2h
- `apps/web/src/components/authorization/RoleAssignmentDialog.tsx`
  - Purpose: Modal dialog for role assignment with change diff
  - Estimated effort: 3h
- `apps/web/src/components/authorization/ConditionBuilder.tsx`
  - Purpose: Recursive ABAC condition tree editor (FR-022)
  - Estimated effort: 6h
- `apps/web/src/components/authorization/ConditionRow.tsx`
  - Purpose: Single condition (attribute, operator, value)
  - Estimated effort: 2h
- `apps/web/src/components/authorization/ConditionGroup.tsx`
  - Purpose: AND/OR group wrapper
  - Estimated effort: 1h
- `apps/web/src/components/authorization/NotGroup.tsx`
  - Purpose: NOT wrapper with dashed border
  - Estimated effort: 1h
- `apps/web/src/components/authorization/ConditionLimitIndicator.tsx`
  - Purpose: Condition/depth usage counter (FR-008)
  - Estimated effort: 30min
- `apps/web/src/components/authorization/PolicySummary.tsx`
  - Purpose: Plain-English auto-generated policy summary
  - Estimated effort: 2h
- `apps/web/src/routes/access-control.roles.tsx`
  - Purpose: Role List screen (DataTable, search, filters)
  - Estimated effort: 4h
- `apps/web/src/routes/access-control.roles.$roleId.tsx`
  - Purpose: Role Detail screen (tabs: Permissions, Users)
  - Estimated effort: 3h
- `apps/web/src/routes/access-control.roles.create.tsx`
  - Purpose: Role Editor — create mode
  - Estimated effort: 4h
- `apps/web/src/routes/access-control.roles.$roleId.edit.tsx`
  - Purpose: Role Editor — edit mode (pre-filled)
  - Estimated effort: 2h (reuses create components)
- `apps/web/src/routes/access-control.users.tsx`
  - Purpose: User Role Assignment list + dialog
  - Estimated effort: 4h
- `apps/web/src/routes/access-control.policies.tsx`
  - Purpose: ABAC Policy List (feature flag gated)
  - Estimated effort: 3h
- `apps/web/src/routes/access-control.policies.create.tsx`
  - Purpose: ABAC Policy Editor — create
  - Estimated effort: 4h
- `apps/web/src/routes/access-control.policies.$policyId.edit.tsx`
  - Purpose: ABAC Policy Editor — edit
  - Estimated effort: 2h (reuses create components)

**Files to Modify**:

- `apps/web/src/routes/__root.tsx` or sidebar component
  - Change: Add "Access Control" navigation section
  - Estimated effort: 1h
- `apps/web/src/components/Layout/Sidebar.tsx` (or equivalent)
  - Change: Add Roles, Users, Policies nav links under "Access Control"
  - Estimated effort: 1h

**Tasks**:

1. [ ] T003-18: Create authorization API client hooks (useAuthorizationApi, useRoles, usePermissions, usePolicies)
2. [ ] T003-19: Create SystemRoleBadge and EffectBadge components
3. [ ] T003-20: Create PermissionGroupAccordion with collapsible source groups (FR-020)
4. [ ] T003-21: Create WildcardPermissionRow with auto-select logic (FR-021)
5. [ ] T003-22: Create RoleAssignmentDialog with change diff preview (FR-006, FR-018)
6. [ ] T003-23: Implement Role List screen with DataTable, search, type/source filters, system role distinction (FR-023), custom role counter (FR-005)
7. [ ] T003-24: Implement Role Detail screen with Permissions/Users tabs, system role read-only mode
8. [ ] T003-25: Implement Role Editor (create/edit) with permission accordion, wildcard handling, summary section
9. [ ] T003-26: Implement User Role Assignment screen with user list and role assignment dialog
10. [ ] T003-27: Create ConditionBuilder, ConditionRow, ConditionGroup, NotGroup, ConditionLimitIndicator components (FR-008, FR-022)
11. [ ] T003-28: Create PolicySummary component for plain-English auto-generation
12. [ ] T003-29: Implement ABAC Policy List screen with feature flag gate
13. [ ] T003-30: Implement ABAC Policy Editor (create/edit) with condition builder
14. [ ] T003-31: Add "Access Control" navigation to sidebar with Roles, Users, Policies links

---

### Phase 4: ABAC Data Model & Feature Flag (~5 pts, ~1.5 days)

**Objective**: Create ABAC policies table, validation schemas, feature flag
gate, and placeholder API endpoints.

**Dependencies**: Phase 1 completion (for table creation pattern), Phase 2
completion (for route pattern)

**Files to Create**:

- `apps/core-api/src/modules/authorization/policy.service.ts`
  - Purpose: ABAC policy CRUD with source immutability
  - Estimated effort: 4h
- `apps/core-api/src/modules/authorization/condition-validator.service.ts`
  - Purpose: Condition tree depth/count/size validation
  - Estimated effort: 2h
- `apps/core-api/src/modules/authorization/dto/create-policy.dto.ts`
  - Purpose: Zod schema for policy creation with nested condition tree validation
  - Estimated effort: 2h
- `apps/core-api/src/modules/authorization/dto/update-policy.dto.ts`
  - Purpose: Zod schema for policy update
  - Estimated effort: 30min
- `apps/core-api/src/modules/authorization/dto/condition-tree.dto.ts`
  - Purpose: Recursive Zod schema for ABAC condition tree (FR-008)
  - Estimated effort: 2h
- `apps/core-api/src/routes/policies.ts`
  - Purpose: Fastify route plugin for /api/v1/policies CRUD
  - Estimated effort: 3h

**Files to Modify**:

- `apps/core-api/src/services/tenant.service.ts`
  - Change: Add `policies` table DDL to tenant provisioning
  - Estimated effort: 1h
- Route registration
  - Change: Register `policies.ts` route plugin
  - Estimated effort: 15min

**Tasks**:

1. [ ] T003-32: Create `policies` table DDL in tenant provisioning (Migration 004)
2. [ ] T003-33: Implement recursive Zod schema for ABAC condition tree with depth/count/size limits
3. [ ] T003-34: Implement `ConditionValidatorService` with recursive depth measurement, condition counting, payload size check
4. [ ] T003-35: Implement `PolicyService` with CRUD operations, source immutability guard, feature flag check
5. [ ] T003-36: Implement policies route plugin with feature flag gate (returns 404 when `abac_enabled` is off)
6. [ ] T003-37: Register policies routes

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                        | Test Focus                                                                                                                           | Est. Tests | Phase |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----- |
| `AuthorizationService`           | Wildcard matching, super_admin bypass, fail-closed, audit log                                                                        | 20         | 2     |
| `RoleService`                    | CRUD, immutability guard, 50-role limit, name uniqueness                                                                             | 18         | 2     |
| `PermissionCacheService`         | Jittered TTL, role-scoped flush, debounce, Redis fallback                                                                            | 15         | 2     |
| `PermissionRegistrationService`  | Plugin registration, conflict detection, uninstall cleanup                                                                           | 10         | 2     |
| `PolicyService`                  | CRUD, source immutability, feature flag gate                                                                                         | 12         | 4     |
| `ConditionValidatorService`      | Depth limits, condition counts, size limits, operator validation                                                                     | 15         | 4     |
| `requirePermission()` refactored | NFR-004 no-leak, fail-closed, audit log                                                                                              | 8          | 2     |
| Rate limiter guard               | Limit enforcement, Retry-After header, per-tenant isolation                                                                          | 6          | 2     |
| Zod DTOs                         | Valid/invalid inputs, edge cases, condition tree recursion                                                                           | 12         | 2+4   |
| Wildcard permission matching     | `*:*`, `crm:*`, `crm:deals:*`, non-matches                                                                                           | 10         | 2     |
| **Frontend components**          | PermissionGroupAccordion, WildcardPermissionRow, ConditionBuilder, PolicySummary, RoleAssignmentDialog, SystemRoleBadge, EffectBadge | 30         | 3     |

**Total unit tests**: ~156

### 8.2 Integration Tests

| Scenario                                       | Dependencies              | Est. Tests | Phase |
| ---------------------------------------------- | ------------------------- | ---------- | ----- |
| Role CRUD endpoints (all 4 HTTP methods)       | PostgreSQL, test app      | 12         | 2     |
| Permission list endpoint with grouping         | PostgreSQL, test app      | 4          | 2     |
| User role assignment/removal endpoints         | PostgreSQL, test app      | 8          | 2     |
| GET /api/v1/me/roles and /me/permissions       | PostgreSQL, test app      | 6          | 2     |
| System role immutability (edit/delete blocked) | PostgreSQL, test app      | 4          | 2     |
| Custom role limit (50) enforcement             | PostgreSQL, test app      | 3          | 2     |
| Rate limiting on write endpoints               | Redis, test app           | 4          | 2     |
| Permission cache invalidation flow             | Redis, PostgreSQL         | 6          | 2     |
| Plugin permission registration on install      | PostgreSQL, test app      | 4          | 2     |
| Plugin permission removal on uninstall         | PostgreSQL, test app      | 4          | 2     |
| Policy CRUD endpoints                          | PostgreSQL, test app      | 8          | 4     |
| Condition tree validation (API-level)          | PostgreSQL, test app      | 6          | 4     |
| Data migration (legacy→normalized)             | PostgreSQL                | 4          | 1     |
| Cross-tenant isolation                         | PostgreSQL (multi-schema) | 4          | 2     |

**Total integration tests**: ~77

### 8.3 E2E Tests

| Scenario                                                            | Dependencies            | Est. Tests | Phase |
| ------------------------------------------------------------------- | ----------------------- | ---------- | ----- |
| Full RBAC flow: assign role → check permission → access resource    | Full stack              | 3          | 2     |
| Custom role lifecycle: create → assign → verify access → delete     | Full stack              | 2          | 2     |
| Super admin wildcard access across tenants                          | Full stack              | 2          | 2     |
| Permission cache: change role perms → verify cache flush → re-check | Full stack + Redis      | 2          | 2     |
| Role UI flow: create role → select permissions → save → verify      | Playwright + full stack | 3          | 3     |
| User role assignment UI flow                                        | Playwright + full stack | 2          | 3     |
| Policy editor UI flow (feature flag gated)                          | Playwright + full stack | 2          | 3     |

**Total E2E tests**: ~16

**Total test count**: ~249 tests (156 unit + 77 integration + 16 E2E)

**Coverage targets** (per Constitution Art. 4.1):

- Authorization module overall: ≥ 85%
- Security code (AuthorizationService, requirePermission, cache invalidation): 100%
- Frontend components: ≥ 80%

---

## 9. Architectural Decisions

| ADR     | Decision                                 | Status                                                            |
| ------- | ---------------------------------------- | ----------------------------------------------------------------- |
| ADR-002 | Schema-per-tenant database isolation     | Accepted                                                          |
| ADR-006 | Fastify as backend framework             | Accepted                                                          |
| ADR-007 | Prisma ORM for data access               | Accepted                                                          |
| ADR-017 | ABAC Policy Engine Architecture (FUTURE) | **Proposed — required before Phase 3 ABAC engine implementation** |

> **Note on ADR numbering**: The spec references "ADR-015 required before
> Phase 3 ABAC implementation." However, ADR-015 already exists as "Tenant
> Provisioning Orchestration" and ADR-016 exists as "Frontend Wizard State."
> The ABAC policy engine ADR should be **ADR-017** (next available). This ADR
> must document: (1) evaluation algorithm (recursive tree walk), (2) attribute
> resolution strategy, (3) FILTER-to-Prisma query translation, (4) performance
> characteristics at max depth/condition limits. This is a prerequisite for
> implementing the runtime ABAC engine, which is out of scope for this plan.

---

## 10. Requirement Traceability

### Functional Requirements

| Requirement | Plan Section                 | Implementation Path                                              |
| ----------- | ---------------------------- | ---------------------------------------------------------------- |
| FR-001      | §2.1 permissions table, §4.1 | `authorization.types.ts` (format), `constants.ts` (colon format) |
| FR-002      | §4.1 matchesPermission()     | `authorization.service.ts` wildcard matching logic               |
| FR-003      | §3.1 GET /api/v1/roles       | `role.service.ts`, `authorization.ts` routes                     |
| FR-004      | §4.2 immutability guard      | `role.service.ts` (createRole/updateRole/deleteRole guards)      |
| FR-005      | §3.2 POST /api/v1/roles      | `role.service.ts` 50-role limit check                            |
| FR-006      | §3.6, §3.8                   | `role.service.ts` getUserPermissions (union), `authorization.ts` |
| FR-007      | §2.1 policies table, §4.5    | `policy.service.ts` (Phase 4)                                    |
| FR-008      | §4.6 ConditionValidator      | `condition-validator.service.ts`, `condition-tree.dto.ts`        |
| FR-009      | §3.11, §4.5                  | `policy.service.ts` source immutability guard                    |
| FR-010      | §4.1 authorize()             | `authorization.service.ts` RBAC→ABAC flow (ABAC engine deferred) |
| FR-011      | §4.4                         | `permission-registration.service.ts` registerPluginPermissions() |
| FR-012      | §2.1 permissions.plugin_id   | `permission-registration.service.ts` plugin_id namespacing       |
| FR-013      | §4.4                         | `permission-registration.service.ts` removePluginPermissions()   |
| FR-014      | §4.5                         | `policy.service.ts` registerPluginPolicies() (Phase 4)           |
| FR-015      | §3.12, §4.5                  | `policy.service.ts` tenant admin override (higher priority)      |
| FR-016      | §4.1 isSuperAdmin()          | `authorization.service.ts` `*:*` wildcard, ABAC skip             |
| FR-017      | §2.1 policies.effect         | `policy.service.ts`, `EffectBadge.tsx`                           |
| FR-018      | §3.6                         | `role.service.ts` assignRoleToUser, Keycloak→Plexica mapping     |
| FR-019      | §4.3                         | `permission-cache.service.ts` role-scoped flush, jittered TTL    |
| FR-020      | §5 PermissionGroupAccordion  | `PermissionGroupAccordion.tsx` grouped by source                 |
| FR-021      | §5 WildcardPermissionRow     | `WildcardPermissionRow.tsx` auto-select/deselect logic           |
| FR-022      | §5 ConditionBuilder          | `ConditionBuilder.tsx`, `ConditionRow.tsx`, `NotGroup.tsx`       |
| FR-023      | §5 SystemRoleBadge           | `SystemRoleBadge.tsx` lock + badge, edit disabled                |
| FR-024      | §3.8, §3.9                   | `authorization.ts` routes for GET /me/roles and /me/permissions  |

### Non-Functional Requirements

| Requirement | Plan Section                 | Implementation Path                                            |
| ----------- | ---------------------------- | -------------------------------------------------------------- |
| NFR-001     | §4.3 cache, §4.1 authorize() | Redis cache (< 50ms P95 via cache hit + wildcard match)        |
| NFR-002     | §4.3                         | `permission-cache.service.ts` (>95% hit rate via jittered TTL) |
| NFR-003     | §4.1 authorize()             | `authorization.service.ts` info-level audit logging            |
| NFR-004     | §4.7                         | Refactored `requirePermission()` — generic 403 message         |
| NFR-005     | §4.1, §4.7                   | `authorization.service.ts` fail-closed on all errors           |
| NFR-006     | §2.1 tenant_id, §4.1         | Schema-per-tenant + tenant_id defense-in-depth                 |
| NFR-007     | §4.3                         | Jittered TTL (300s ± 30s), 15-min safety fallback              |
| NFR-008     | §4.3                         | Role-scoped flush immediate; tenant-wide reserved              |
| NFR-009     | §4.2                         | `role.service.ts` 50-role limit, 422 on exceed                 |
| NFR-010     | §4.8                         | Rate limiter guard (60/min/tenant), debounced flush            |

### Edge Cases

| #   | Scenario                               | Implementation                                                      |
| --- | -------------------------------------- | ------------------------------------------------------------------- |
| 1   | User has no roles assigned             | `authorize()` returns DENY — no permissions in union                |
| 2   | Role refs non-existent permission      | JOIN filters out; permission silently skipped                       |
| 3   | Conflicting ABAC policies              | DENY takes precedence (deferred to ABAC engine ADR-017)             |
| 4   | Duplicate plugin permission key        | `registerPluginPermissions()` checks uniqueness, aborts on conflict |
| 5   | ABAC refs missing attribute            | Deferred to ABAC engine (ADR-017)                                   |
| 6   | Super admin tenant access              | `*:*` wildcard via standard RBAC flow + audit log                   |
| 7   | Redis cache unavailable                | `PermissionCacheService` falls back to DB, logs warning             |
| 8   | Role deleted during active session     | Role-scoped cache flush; 15-min TTL safety fallback                 |
| 9   | 51st custom role                       | `createRole()` returns 422 CUSTOM_ROLE_LIMIT_EXCEEDED               |
| 10  | Team role on non-team resource         | Team permissions scoped by resource context (Phase 2+)              |
| 11  | FILTER on non-query endpoint           | Deferred to ABAC engine (ADR-017)                                   |
| 12  | Condition tree exceeds limits          | `ConditionValidatorService` returns 422 with detail                 |
| 13  | Exceeds 60 mutations/min               | Rate limiter returns 429 with Retry-After                           |
| 14  | Tenant ABAC policy targets super_admin | ABAC evaluation skipped for super_admin (FR-016)                    |

---

## 11. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | **Security First**: Fail-closed (NFR-005), RBAC + ABAC deny-only overlay, full audit trail (NFR-003). **Multi-Tenancy Isolation**: schema-per-tenant + `tenant_id` defense-in-depth. **Zero-Downtime**: backward-compatible migrations, feature flag for ABAC (Art. 9.1.1).                                                                                                                                                                   |
| Art. 2  | ✅     | Uses only approved stack: Node.js ≥20, TypeScript ^5.9, Fastify ^5.7, Prisma ^6.8, ioredis ^5.9, Vitest ^4.0. No new dependencies. **ADR-017 required** for ABAC engine (Art. 2.3).                                                                                                                                                                                                                                                           |
| Art. 3  | ✅     | **Feature Modules** (Art. 3.2): New `modules/authorization/` with Services + DTOs + Guards. **Layered Architecture**: Routes → Services → Prisma (no direct DB from routes). **Parameterized Queries** (Art. 3.3): All queries use Prisma parameterised SQL with schema name validation. **Tenant Context** (Art. 3.4): Tenant context middleware validates on every request.                                                                 |
| Art. 4  | ✅     | **Coverage targets**: Authorization module ≥ 85% (Art. 4.1), security code 100%. ~249 planned tests (156 unit + 77 integration + 16 E2E). **Performance**: Redis cache ensures < 50ms P95 authorization latency (Art. 4.3).                                                                                                                                                                                                                   |
| Art. 5  | ✅     | **RBAC** (Art. 5.1): All endpoints authenticated by default. Role-based + permission-based access control. **Tenant validation** (Art. 5.1.5): Validated on every authorization check. **Zod validation** (Art. 5.3): All API inputs validated with Zod schemas. **No PII in logs** (Art. 5.2.2): Permission names excluded from 403 responses (NFR-004). **Tenant isolation** (Art. 5.2.4): `tenant_id` defense-in-depth on all auth tables. |
| Art. 6  | ✅     | **Error format** (Art. 6.2): All errors return `{ error: { code, message, details? } }`. No stack traces in production. Error codes are stable and documented. **Operational errors**: 400, 403, 404, 409, 422, 429 with specific codes. **Programmer errors**: 500 with generic message.                                                                                                                                                     |
| Art. 7  | ✅     | **Files**: kebab-case (`authorization.service.ts`, `role.service.ts`). **Classes**: PascalCase (`AuthorizationService`, `RoleService`). **Functions**: camelCase (`authorize`, `createRole`). **DB tables**: snake_case plural (`roles`, `permissions`, `role_permissions`). **API**: `/api/v1/roles`, `/api/v1/policies` (Art. 7.3).                                                                                                         |
| Art. 8  | ✅     | **All test types** (Art. 8.1): Unit (156), integration (77), E2E (16). **Deterministic** (Art. 8.2.1): No flaky tests; Redis mocked in unit tests. **AAA pattern** (Art. 8.2.5). **Descriptive names**: `should`/`when` pattern. **Test data**: Factories, no hardcoded IDs, cleanup via transactions.                                                                                                                                        |
| Art. 9  | ✅     | **Feature flag** (Art. 9.1.1): `abac_enabled` flag for ABAC UI and endpoints. **Backward-compatible migrations** (Art. 9.1.3): Multi-step with rollback. **Health checks** (Art. 9.2.1): No changes needed. **Logging** (Art. 9.2.2): Authorization decisions logged with `requestId`, `userId`, `tenantId`. **Monitoring** (Art. 9.2.3): DENY rate monitoring for alert thresholds.                                                          |

---

## Cross-References

| Document                  | Path                                                            |
| ------------------------- | --------------------------------------------------------------- |
| Spec                      | `.forge/specs/003-authorization/spec.md`                        |
| Design Spec               | `.forge/specs/003-authorization/design-spec.md`                 |
| User Journey              | `.forge/specs/003-authorization/user-journey.md`                |
| Constitution              | `.forge/constitution.md`                                        |
| ADR-002 Multi-Tenancy     | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`        |
| ADR-006 Fastify           | `.forge/knowledge/adr/adr-006-fastify-framework.md`             |
| ADR-007 Prisma            | `.forge/knowledge/adr/adr-007-prisma-orm.md`                    |
| ADR-017 ABAC Engine (TBD) | `.forge/knowledge/adr/adr-017-abac-engine.md` (not yet created) |
| Tasks                     | <!-- Created by /forge-tasks -->                                |
| Architecture              | `.forge/architecture/architecture.md`                           |

---

## Appendix A: Permission Format Migration

The legacy `permission.service.ts` uses dot-separated permissions (`users.read`).
Spec 003 defines colon-separated format (`users:read`, FR-001). Migration:

| Legacy Format    | New Format       |
| ---------------- | ---------------- |
| `users.read`     | `users:read`     |
| `users.write`    | `users:write`    |
| `users.delete`   | `users:delete`   |
| `roles.read`     | `roles:read`     |
| `roles.write`    | `roles:write`    |
| `roles.delete`   | `roles:delete`   |
| `settings.read`  | `settings:read`  |
| `settings.write` | `settings:write` |
| `plugins.read`   | `plugins:read`   |
| `plugins.write`  | `plugins:write`  |

The migration script in T003-04 will:

1. Read all existing roles' JSONB `permissions` arrays
2. Replace `.` with `:` in each permission string
3. Create `permissions` table rows for each unique permission key
4. Create `role_permissions` join entries
5. Verify data integrity before dropping the JSONB column

## Appendix B: Redis Cache Key Schema

```
authz:perms:{tenantId}:{userId}          → SET of permission key strings
authz:role_users:{tenantId}:{roleId}     → SET of userId strings
authz:ratelimit:{tenantId}               → INT (mutation counter)
```

**Invalidation flows**:

1. **Role permission change**: Look up `authz:role_users:{tenantId}:{roleId}` →
   for each userId, DEL `authz:perms:{tenantId}:{userId}`.
2. **User role assignment change**: DEL `authz:perms:{tenantId}:{userId}`.
   Update `authz:role_users:{tenantId}:{roleId}` (SADD or SREM).
3. **Tenant-wide flush**: SCAN `authz:perms:{tenantId}:*` → DEL all matches.
4. **Debounced flush**: For rapid changes (NFR-010), accumulate role IDs for
   500ms, then batch-flush all affected users in a single operation.

## Appendix C: Feature Flag Configuration

The ABAC feature is gated behind a feature flag. Until the flag is enabled:

- `GET /api/v1/policies` returns `{ data: [], meta: { featureEnabled: false } }`
- `POST/PUT/DELETE /api/v1/policies/*` returns 404 `FEATURE_NOT_AVAILABLE`
- Policy List UI shows info banner: "Attribute-based access policies are coming soon."
- "Create Policy" button is hidden
- Policy Editor routes redirect to Policy List

Flag name: `abac_enabled`
Storage: Tenant settings JSON (`tenants.settings.features.abac_enabled`)
Default: `false`
