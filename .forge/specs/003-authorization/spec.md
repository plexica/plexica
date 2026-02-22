# Spec: 003 - Authorization System (RBAC + ABAC)

> Feature specification for the Plexica hybrid authorization system combining Role-Based Access Control and Attribute-Based Access Control.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Updated | 2026-02-22 |
| Track   | Feature    |
| Spec ID | 003        |

---

## 1. Overview

Plexica implements a **hybrid RBAC + ABAC** authorization system. RBAC provides simple, performant role-to-permission mappings for common access patterns. ABAC provides dynamic, attribute-based policy evaluation for fine-grained access control that can only **restrict** (never expand) the access RBAC grants — ABAC operates as a deny-only overlay. The system supports plugin-contributed permissions, tenant-scoped custom roles, and a layered policy evaluation flow: RBAC first (base decision), then ABAC to apply additional restrictions. ABAC policies can operate at two levels: endpoint-level gating (binary allow/deny) and result-set filtering (injecting row-level constraints into queries). Plexica owns role definitions in its database; Keycloak provides system roles (`tenant_admin`, `user`) via JWT claims which are mapped to Plexica system roles at authorization time.

## 2. Problem Statement

A multi-tenant plugin platform requires an authorization model that is both simple enough for common use cases (role-based) and flexible enough for complex scenarios (attribute-based). The system must support plugin-contributed permissions that integrate seamlessly with core RBAC, tenant administrators creating custom roles, and policy evaluation that considers user attributes, resource ownership, environment context, and tenant configuration — all while maintaining sub-50ms authorization latency.

## 3. User Stories

### US-001: Role-Based Permission Check

**As a** tenant user,
**I want** my access to be determined by my assigned roles,
**so that** I can perform actions appropriate to my role without manual per-resource configuration.

**Acceptance Criteria:**

- Given a user with role `tenant_admin`, when they access tenant management endpoints, then access is granted.
- Given a user with role `user` only, when they attempt to manage users, then access is denied with 403 Forbidden.
- Given a user with multiple roles, when permissions are evaluated, then permissions are additive (union of all role permissions).
- Given a user inherits permissions from team roles, when evaluated, then team permissions apply only to resources scoped to that team (not globally within the tenant).

### US-002: Attribute-Based Policy Evaluation

**As a** tenant admin,
**I want** to define policies that restrict access based on resource attributes,
**so that** users only see data relevant to their team or department.

**Acceptance Criteria:**

- Given an ABAC policy "Sales team can only view their own deals", when a Sales team member requests CRM deals, then the ABAC engine injects a row-level filter so only deals owned by the Sales team are returned.
- Given an ABAC policy with environment conditions (time-of-day), when evaluated outside allowed hours, then access is denied at the endpoint level.
- Given RBAC grants access but an ABAC DENY policy exists, when evaluated, then ABAC DENY overrides RBAC ALLOW (ABAC can only restrict, never expand RBAC decisions).

### US-003: Custom Role Management

**As a** tenant admin,
**I want** to create custom roles with specific permission sets,
**so that** I can define access patterns that match my organization's structure.

**Acceptance Criteria:**

- Given the role editor, when I create a role "Sales Manager" with permissions `crm:contacts:read`, `crm:deals:*`, then the role is saved and assignable to users.
- Given a custom role, when I assign it to a user, then the user inherits all permissions from that role.
- Given a system role (`super_admin`, `tenant_admin`, `user`), when I attempt to edit it, then modification is denied (system roles are immutable).

### US-004: Plugin Permission Registration

**As a** plugin developer,
**I want** my plugin to register its permissions with the core authorization system,
**so that** tenant admins can assign plugin permissions to roles.

**Acceptance Criteria:**

- Given a CRM plugin manifest declaring permissions `crm:contacts:read`, `crm:contacts:write`, `crm:deals:*`, when the plugin is installed, then those permissions are registered in the `permissions` table with `plugin_id = 'crm'`.
- Given registered plugin permissions, when a tenant admin opens the role editor, then plugin permissions appear grouped under the plugin name.
- Given a plugin is uninstalled, when its permissions are removed, then roles referencing those permissions are updated (permissions removed from role, not role deleted).

### US-005: Authorization Flow Execution

**As the** platform,
**I want** every request to pass through an authorization flow,
**so that** access decisions are consistent and auditable.

**Acceptance Criteria:**

- Given a request, when authorization runs, then context is extracted (user, tenant, resource, action).
- Given context extraction, when RBAC check runs, then the system checks if any of the user's roles include the required permission.
- Given RBAC grants access, when ABAC policies exist for the resource, then ABAC evaluates matching policies to apply additional restrictions (DENY overrides or result-set filters).
- Given RBAC denies access (no matching permission), when ABAC runs, then ABAC cannot override the RBAC DENY — access remains denied.
- Given the final decision, when it is DENY, then a 403 Forbidden with error code `AUTHORIZATION_DENIED` is returned.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                          | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| FR-001 | Permission format: `{resource}:{action}` (e.g., `users:read`, `crm:contacts:write`)                                                                                                                                                                                                                                                                                                                                                  | Must     | US-001    |
| FR-002 | Wildcard permissions: `crm:deals:*` grants all actions on deals                                                                                                                                                                                                                                                                                                                                                                      | Must     | US-001    |
| FR-003 | System roles: `super_admin` (global, `*:*` wildcard permission), `tenant_admin` (tenant), `team_admin` (team), `user` (tenant)                                                                                                                                                                                                                                                                                                       | Must     | US-001    |
| FR-004 | System roles are immutable and cannot be edited or deleted                                                                                                                                                                                                                                                                                                                                                                           | Must     | US-003    |
| FR-005 | Custom roles created by tenant admins are tenant-scoped; maximum 50 custom roles per tenant                                                                                                                                                                                                                                                                                                                                          | Must     | US-003    |
| FR-006 | User permissions = union of all assigned role permissions + team role permissions (team permissions scoped to team resources only)                                                                                                                                                                                                                                                                                                   | Must     | US-001    |
| FR-007 | ABAC policy engine evaluates conditions on user, resource, environment, and tenant attributes; ABAC can only restrict (DENY) or filter — never expand access beyond what RBAC grants                                                                                                                                                                                                                                                 | Must     | US-002    |
| FR-008 | ABAC policy conditions use a nested boolean tree structure supporting AND/OR/NOT operators with leaf conditions: `{attribute, operator, value}` where operators include `equals`, `contains`, `in`, `greaterThan`, `lessThan`, `notEquals`, `exists`. **Limits**: maximum nesting depth of 5 levels, maximum 20 conditions per policy, maximum JSONB payload size of 64 KB. All limits enforced via Zod validation on API input.     | Must     | US-002    |
| FR-009 | Policy sources: Core (immutable), Plugin (predefined), Super Admin (global), Tenant Admin (scoped)                                                                                                                                                                                                                                                                                                                                   | Must     | US-002    |
| FR-010 | Authorization flow: Extract Context → RBAC Check → ABAC Restriction Layer → Decision. RBAC makes the base ALLOW/DENY decision. ABAC can only add DENY constraints or result-set filters on top of RBAC ALLOW. ABAC cannot override RBAC DENY.                                                                                                                                                                                        | Must     | US-005    |
| FR-011 | Plugins register permissions via manifest `permissions` array on install                                                                                                                                                                                                                                                                                                                                                             | Must     | US-004    |
| FR-012 | Plugin permissions are namespaced by plugin ID (e.g., `crm:contacts:read`)                                                                                                                                                                                                                                                                                                                                                           | Must     | US-004    |
| FR-013 | Plugin uninstall removes associated permissions from roles                                                                                                                                                                                                                                                                                                                                                                           | Should   | US-004    |
| FR-014 | Plugins can provide default ABAC policies in their manifest                                                                                                                                                                                                                                                                                                                                                                          | Should   | US-004    |
| FR-015 | Tenant admin can override plugin default policies                                                                                                                                                                                                                                                                                                                                                                                    | Should   | US-002    |
| FR-016 | `super_admin` role has wildcard permission `*:*` resolved via standard RBAC evaluation (no hard-coded bypass); full audit trail preserved. Tenant-scoped ABAC policies do NOT apply to `super_admin` users — ABAC policy evaluation is skipped entirely for users with `super_admin` system role. This prevents tenant admins from locking out platform administrators.                                                              | Must     | US-005    |
| FR-017 | ABAC policies support two effect modes: endpoint-level gating (`DENY` blocks endpoint access) and result-set filtering (`FILTER` injects query constraints)                                                                                                                                                                                                                                                                          | Must     | US-002    |
| FR-018 | Keycloak realm roles (`tenant_admin`, `user`) are mapped to Plexica system roles during token validation; Plexica database is the source of truth for all role definitions                                                                                                                                                                                                                                                           | Must     | US-001    |
| FR-019 | Permission cache invalidation is role-scoped: when a role's permissions change, only cache entries for users assigned to that role are flushed. When a user's role assignment changes, only that user's cache entry is flushed. Full tenant-wide flush is reserved for tenant-level permission resets. Cache re-population uses jittered TTLs (base 300s ± 30s random) to prevent thundering herd. 15-minute TTL as safety fallback. | Must     | US-005    |
| FR-020 | Role editor UI groups permissions by source (Core, Plugin name) with visual sections                                                                                                                                                                                                                                                                                                                                                 | Must     | US-003    |
| FR-021 | Wildcard permission checkbox auto-selects all sub-permissions in the role editor UI                                                                                                                                                                                                                                                                                                                                                  | Must     | US-003    |
| FR-022 | ABAC policy editor provides a visual condition builder supporting nested AND/OR/NOT tree structure                                                                                                                                                                                                                                                                                                                                   | Must     | US-002    |
| FR-023 | System roles are visually distinguished in the UI (badge/icon) with all edit controls disabled                                                                                                                                                                                                                                                                                                                                       | Must     | US-003    |
| FR-024 | Users can query their own effective roles and permissions via `GET /api/v1/me/roles` and `GET /api/v1/me/permissions`. These endpoints require only Bearer authentication (no additional permission check) and return the calling user's effective roles and expanded permission list within the current tenant context.                                                                                                             | Must     | US-001    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                                    | Target                                                                                                                                                                                                                                                                                                |
| ------- | ----------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Performance | Authorization decision latency                                 | < 50ms P95 (including RBAC + ABAC)                                                                                                                                                                                                                                                                    |
| NFR-002 | Performance | Permission cache hit rate                                      | > 95% (Redis-cached role-permission mappings)                                                                                                                                                                                                                                                         |
| NFR-003 | Security    | All authorization decisions auditable                          | Logged at `info` level with decision + context                                                                                                                                                                                                                                                        |
| NFR-004 | Security    | DENY decisions do not reveal permission names in API responses | Generic 403 message to client (HTTP 403 with `AUTHORIZATION_DENIED` error code, no permission name). UI navigation-level access denied pages MAY display the required permission name to help users request access from their administrator.                                                          |
| NFR-005 | Reliability | Authorization failure defaults to DENY                         | Fail-closed, never fail-open                                                                                                                                                                                                                                                                          |
| NFR-006 | Security    | Tenant isolation in authorization                              | Policies scoped to tenant; no cross-tenant leakage                                                                                                                                                                                                                                                    |
| NFR-007 | Performance | Permission cache TTL                                           | 15-minute TTL as safety fallback; role-scoped flush on permission changes; jittered TTLs (base 300s ± 30s) for cache re-population                                                                                                                                                                    |
| NFR-008 | Performance | Cache invalidation propagation                                 | Role-scoped flush is immediate on admin action; full tenant-wide flush reserved for tenant-level resets; stale window ≤ 15 minutes in edge failure cases                                                                                                                                              |
| NFR-009 | Scalability | Maximum custom roles per tenant                                | 50 custom roles per tenant; API returns 422 when limit reached                                                                                                                                                                                                                                        |
| NFR-010 | Security    | Rate limiting on auth management write endpoints               | All role/permission/policy write endpoints (POST/PUT/DELETE) are rate-limited at 60 mutations per tenant per minute. Exceeding the limit returns HTTP 429 with `Retry-After` header. Rapid successive changes trigger a single debounced cache flush (500ms window) rather than one flush per change. |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                   | Expected Behavior                                                                                                                                                                          |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | User has no roles assigned                                 | All access denied except public endpoints                                                                                                                                                  |
| 2   | Role references a permission that no longer exists         | Permission silently skipped; role still functions with remaining perms                                                                                                                     |
| 3   | Conflicting ABAC policies (one ALLOW, one DENY)            | DENY takes precedence (explicit deny wins)                                                                                                                                                 |
| 4   | Plugin registers permission key that already exists        | Registration fails with conflict error; plugin install aborted                                                                                                                             |
| 5   | ABAC policy references an attribute not present in context | Policy condition evaluates to false (fail-closed)                                                                                                                                          |
| 6   | Super Admin accesses tenant resources                      | `super_admin` has `*:*` wildcard permission; RBAC resolves it via standard flow with full audit trail                                                                                      |
| 7   | Redis cache unavailable                                    | Fall back to database query; log warning for degraded performance                                                                                                                          |
| 8   | User's role deleted while they have an active session      | Cache entries for all users assigned to the deleted role are flushed immediately; next authorization check uses fresh DB data. If flush fails, 15-minute TTL ensures eventual consistency. |
| 9   | Tenant admin creates 51st custom role                      | API returns 422 Unprocessable Entity with error code `CUSTOM_ROLE_LIMIT_EXCEEDED`                                                                                                          |
| 10  | Team role user accesses non-team resource                  | Team role permissions do not apply; only direct user role permissions are evaluated for non-team resources                                                                                 |
| 11  | ABAC FILTER policy on endpoint with no query context       | Filter policy is skipped; only DENY policies evaluated for non-query endpoints                                                                                                             |
| 12  | ABAC condition tree exceeds depth or size limits           | API returns 422 Unprocessable Entity with error code `CONDITION_TREE_LIMIT_EXCEEDED` and details indicating which limit was exceeded (depth > 5, conditions > 20, or payload > 64 KB)      |
| 13  | Tenant exceeds 60 auth management mutations per minute     | API returns 429 Too Many Requests with `Retry-After` header. Mutations are counted per tenant per minute. Client should retry after the indicated delay.                                   |
| 14  | Tenant-scoped ABAC policy targets `super_admin` user       | ABAC evaluation is skipped entirely for `super_admin` users (per FR-016). The policy is saved but has no effect on `super_admin` access. Audit log records the skip.                       |

## 7. Data Requirements

### Core Schema (per tenant)

> Tables reside in tenant-specific schemas (schema-per-tenant isolation per
> Spec 001). An explicit `tenant_id` column is included on all tables as a
> defense-in-depth measure for cross-tenant query safety.

**roles** table:

| Column      | Type      | Description                                      |
| ----------- | --------- | ------------------------------------------------ |
| id          | UUID      | Primary key                                      |
| tenant_id   | UUID      | FK to tenants table (NOT NULL, defense-in-depth) |
| name        | VARCHAR   | Role name (unique within tenant)                 |
| description | TEXT      | Role description                                 |
| is_system   | BOOLEAN   | True for immutable system roles                  |
| created_at  | TIMESTAMP | Creation timestamp                               |
| updated_at  | TIMESTAMP | Last modification timestamp                      |

**permissions** table:

| Column      | Type      | Description                                                   |
| ----------- | --------- | ------------------------------------------------------------- |
| id          | UUID      | Primary key                                                   |
| tenant_id   | UUID      | FK to tenants table (NOT NULL, defense-in-depth)              |
| key         | VARCHAR   | Permission key (unique per tenant), e.g., `crm:contacts:read` |
| name        | VARCHAR   | Human-readable name                                           |
| description | TEXT      | Description                                                   |
| plugin_id   | VARCHAR   | FK to plugin (nullable for core perms)                        |
| created_at  | TIMESTAMP | Creation timestamp                                            |

**role_permissions** (join table): `role_id` + `permission_id` composite PK, `tenant_id` (NOT NULL)

**user_roles** (join table): `user_id` + `role_id` composite PK, `tenant_id` (NOT NULL)

**policies** table (ABAC):

| Column     | Type      | Description                                      |
| ---------- | --------- | ------------------------------------------------ |
| id         | UUID      | Primary key                                      |
| tenant_id  | UUID      | FK to tenants table (NOT NULL, defense-in-depth) |
| name       | VARCHAR   | Policy name                                      |
| resource   | VARCHAR   | Resource pattern (e.g., `crm:deals:*`)           |
| effect     | VARCHAR   | `DENY` or `FILTER` (see FR-017)                  |
| conditions | JSONB     | Nested boolean tree (see Condition Schema below) |
| priority   | INTEGER   | Evaluation order (higher = evaluated first)      |
| source     | VARCHAR   | `core`, `plugin`, `super_admin`, `tenant_admin`  |
| plugin_id  | VARCHAR   | FK to plugin (nullable)                          |
| created_at | TIMESTAMP | Creation timestamp                               |
| updated_at | TIMESTAMP | Last modification timestamp                      |

### ABAC Condition Schema (JSONB)

ABAC conditions use a nested boolean tree structure stored as JSONB:

```json
{
  "all": [
    { "attribute": "user.teamId", "operator": "equals", "value": "resource.teamId" },
    {
      "any": [
        {
          "attribute": "environment.dayOfWeek",
          "operator": "in",
          "value": ["Mon", "Tue", "Wed", "Thu", "Fri"]
        },
        { "attribute": "user.role", "operator": "equals", "value": "on-call" }
      ]
    },
    {
      "not": {
        "attribute": "resource.status",
        "operator": "equals",
        "value": "archived"
      }
    }
  ]
}
```

**Combinators**: `all` (AND), `any` (OR), `not` (NOT — wraps a single condition or combinator)

**Leaf conditions**: `{ attribute: string, operator: string, value: any }`

**Supported operators**: `equals`, `notEquals`, `contains`, `in`, `greaterThan`, `lessThan`, `exists`

**Attribute namespaces**: `user.*`, `resource.*`, `environment.*`, `tenant.*`

### Keycloak-Plexica Role Mapping

Plexica is the **source of truth** for all role definitions. Keycloak integration:

| Keycloak Realm Role | Plexica System Role | Mapping Method                                                                |
| ------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `tenant_admin`      | `tenant_admin`      | JWT claim `realm_access.roles` mapped during token validation                 |
| `user`              | `user`              | JWT claim `realm_access.roles` mapped during token validation                 |
| (master realm)      | `super_admin`       | Identified by master realm JWT; mapped to `super_admin` with `*:*` permission |
| (none)              | `team_admin`        | Application-level only (see note below)                                       |

> **`team_admin` assignment model**: The `team_admin` role is **not** represented in Keycloak. It is assigned at the application level via the Plexica `user_roles` table. Assignment rules:
>
> 1. **Automatic**: The user who creates a team is automatically assigned `team_admin` for that team.
> 2. **Manual**: A `tenant_admin` can assign or revoke `team_admin` for any user within their tenant via the user role management endpoints.
> 3. **Scope**: `team_admin` permissions apply only to resources scoped to the specific team the user administers, not globally within the tenant (consistent with FR-006).

Custom roles (e.g., "Sales Manager") exist **only in Plexica's database** and are resolved at authorization time by querying the `user_roles` + `role_permissions` tables (or Redis cache). Keycloak does not know about Plexica custom roles.

## 8. API Requirements

| Method | Path                            | Description                              | Auth                      |
| ------ | ------------------------------- | ---------------------------------------- | ------------------------- |
| GET    | /api/v1/roles                   | List roles for current tenant            | Bearer + `roles:read`     |
| POST   | /api/v1/roles                   | Create custom role                       | Bearer + `roles:write`    |
| PUT    | /api/v1/roles/:id               | Update custom role                       | Bearer + `roles:write`    |
| DELETE | /api/v1/roles/:id               | Delete custom role                       | Bearer + `roles:write`    |
| GET    | /api/v1/permissions             | List all available permissions           | Bearer + `roles:read`     |
| POST   | /api/v1/users/:id/roles         | Assign role to user                      | Bearer + `users:write`    |
| DELETE | /api/v1/users/:id/roles/:roleId | Remove role from user                    | Bearer + `users:write`    |
| GET    | /api/v1/me/roles                | Get calling user's effective roles       | Bearer (no perm required) |
| GET    | /api/v1/me/permissions          | Get calling user's effective permissions | Bearer (no perm required) |
| GET    | /api/v1/policies                | List ABAC policies                       | Bearer + `policies:read`  |
| POST   | /api/v1/policies                | Create ABAC policy                       | Bearer + `policies:write` |
| PUT    | /api/v1/policies/:id            | Update ABAC policy                       | Bearer + `policies:write` |
| DELETE | /api/v1/policies/:id            | Delete ABAC policy                       | Bearer + `policies:write` |

## 9. UX/UI Requirements

The following are formal requirements (promoted from guidance to FRs during clarification):

| Requirement                                | FR Ref | Acceptance Criteria                                                                                                                                                                              |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role editor groups permissions by source   | FR-020 | Given the role editor, when plugin permissions are registered, then permissions are displayed in collapsible sections labeled "Core" and each plugin name                                        |
| Wildcard permission auto-selection         | FR-021 | Given the role editor, when I check `crm:deals:*`, then all individual `crm:deals:{action}` checkboxes are automatically selected; unchecking any sub-permission unchecks the wildcard           |
| ABAC visual condition builder              | FR-022 | Given the policy editor, when I create a condition, then I can build nested AND/OR/NOT trees via drag-and-drop or add/remove buttons with operator dropdowns                                     |
| System role visual distinction             | FR-023 | Given the role list, when system roles are displayed, then they have a "System" badge, a lock icon, and all edit/delete controls are disabled (grayed out)                                       |
| Permission changes take effect immediately | FR-019 | Given a role permission change is saved, when the save completes, then a role-scoped cache flush is triggered and subsequent authorization checks for affected users use the updated permissions |

## 10. Out of Scope

- ABAC policy engine is Phase 3; MVP uses RBAC only with ABAC data model prepared.
- Dynamic attribute resolution from external systems (e.g., LDAP group membership).
- Permission inheritance hierarchies (e.g., `crm:*` auto-grants `crm:contacts:read`).
- ABAC result-set filtering for database-level RLS (PostgreSQL row-level security policies); ABAC FILTER policies inject application-level query constraints via the service layer, not database-level RLS.
- Delegated administration (one tenant admin granting admin to another).
- Syncing Plexica custom roles back to Keycloak (Keycloak only holds system realm roles).

> **Superseded documentation**: `docs/AUTHORIZATION.md` and `docs/security-architecture.md` describe a prior authorization model that is superseded by this specification (Spec 003). Specifically, the ABAC `ALLOW` effect and `INCONCLUSIVE` evaluation state described in those documents no longer apply. This spec defines ABAC as deny-only (effects: `DENY` and `FILTER` only). Those documents should be updated to reference Spec 003 as the authoritative source for the authorization model.

> **Workspace-level roles**: Workspace-level roles (`ADMIN`, `MEMBER`, `VIEWER` as defined by `WorkspaceRole` in the codebase) are orthogonal to the RBAC system defined here and are governed by Spec 009 (Workspace Hierarchy) / Spec 011 (Workspace Hierarchy & Templates). The workspace role permission check occurs after tenant RBAC evaluation and may further restrict access within a specific workspace.

## 11. Open Questions

No open questions. All ambiguities resolved during clarification session on 2026-02-22.

### Clarification Log (2026-02-22)

| #   | Ambiguity                          | Resolution                                                                                                            |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | RBAC-to-ABAC fallthrough semantics | ABAC can only add DENY restrictions on top of RBAC ALLOW; cannot override RBAC DENY to ALLOW                          |
| 2   | ABAC scope: gate vs filter         | ABAC supports both endpoint-level gating (DENY) and result-set filtering (FILTER via service-layer query constraints) |
| 3   | Super Admin bypass model           | `super_admin` has wildcard `*:*` permission resolved via standard RBAC flow; full audit trail preserved               |
| 4   | Cache invalidation strategy        | Role-scoped Redis cache flush on permission changes; jittered TTLs; 15-minute TTL as safety fallback                  |
| 5   | Team role scoping                  | Team role permissions apply only to resources scoped to that team, not globally within tenant                         |
| 6   | Maximum custom roles per tenant    | 50 custom roles per tenant; API returns 422 when exceeded                                                             |
| 7   | ABAC condition JSONB format        | Nested boolean tree with AND/OR/NOT combinators and leaf conditions `{attribute, operator, value}`                    |
| 8   | Keycloak-Plexica role ownership    | Plexica database is source of truth for roles; Keycloak system roles mapped during token validation                   |
| 9   | `tenant_id` on auth tables         | Added to all tables as defense-in-depth alongside schema-per-tenant isolation                                         |
| 10  | UX/UI "should" language            | Promoted to formal FRs (FR-020 through FR-023) with acceptance criteria                                               |

### Clarification Log (2026-02-22 — Adversarial Review Pass)

| #   | Issue ID | Ambiguity                                        | Resolution                                                                                                      |
| --- | -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 11  | R-001    | `team_admin` missing from Keycloak mapping table | Application-level assignment only; auto-assigned on team creation, manually assignable by `tenant_admin`        |
| 12  | R-002    | ABAC condition tree has no depth/size limits     | Added limits: max depth 5, max 20 conditions, max 64 KB JSONB payload; Zod-validated                            |
| 13  | R-003    | Existing docs contradict deny-only ABAC model    | `docs/AUTHORIZATION.md` and `security-architecture.md` superseded by Spec 003; noted in §10                     |
| 14  | R-004    | Workspace roles absent from spec                 | Workspace roles are orthogonal to tenant RBAC; governed by Spec 009/011; noted in §10                           |
| 15  | R-005    | No rate limiting on auth management endpoints    | Added NFR-010: 60 mutations/tenant/min; HTTP 429 with Retry-After; debounced cache flush (500ms)                |
| 16  | R-006    | `super_admin` ABAC exemption ambiguity           | ABAC evaluation skipped entirely for `super_admin`; updated FR-016                                              |
| 17  | R-007    | No self-service permission endpoints             | Added FR-024: `GET /api/v1/me/roles` and `GET /api/v1/me/permissions`; Bearer auth only                         |
| 18  | R-008    | No ADR for ABAC engine                           | ADR-015 required before Phase 3; documented in §12 Constitution Compliance                                      |
| 19  | R-009    | NFR-004 vs user journey 403 message conflict     | API returns generic 403; UI access-denied pages MAY show permission name to aid user self-service               |
| 20  | R-010    | Cache thundering herd risk                       | Replaced tenant-wide flush with role-scoped flush; jittered TTLs (300s ± 30s); updated FR-019, NFR-007, NFR-008 |

## 12. Constitution Compliance

> Verified: 2026-02-22 | Constitution Version: 1.0 (2026-02-13) | Status: **COMPLIANT**

| Article | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Security-first: RBAC + ABAC enforce access control; fail-closed by default (NFR-005). ABAC deny-only overlay ensures no accidental privilege escalation.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Art. 2  | ✅     | Uses approved stack: Redis/ioredis for permission caching (^5.9), Prisma for data access (^6.8), PostgreSQL JSONB for ABAC conditions. **ADR-015 required**: The ABAC condition evaluation engine introduces a significant architectural component (per Art. 2.3). ADR-015 must be created before Phase 3 implementation begins, documenting: (1) evaluation algorithm (recursive tree walk), (2) attribute resolution strategy, (3) FILTER-to-Prisma translation approach, (4) performance characteristics at max depth/condition limits. This is tracked as a prerequisite task in the implementation plan. |
| Art. 3  | ✅     | Service layer pattern (Art. 3.2): AuthorizationService → RoleRepository/PolicyRepository. Tenant context middleware enforces row-level security (Art. 3.3). Defense-in-depth `tenant_id` on all tables.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Art. 4  | ✅     | 85% coverage target for auth module (Art. 4.1); authorization logic 100% unit tested. NFR-001 < 50ms P95 within Art. 4.3 target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Art. 5  | ✅     | RBAC per Art. 5.1; tenant validation on every auth decision (Art. 5.1.5); Zod validation for all API input (Art. 5.3); `tenant_id` defense-in-depth (Art. 5.2.4).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Art. 6  | ✅     | 403 errors use standard format `{ error: { code, message, details } }` (Art. 6.2); no permission details leaked to client (NFR-004); edge case #9 uses 422 with structured error code.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Art. 7  | ✅     | Naming: `authorization.service.ts`, `RoleRepository`, `crm:contacts:read` format. DB tables: `roles`, `permissions`, `role_permissions` (snake_case, plural per Art. 7.2). API: `/api/v1/roles`, `/api/v1/policies` (Art. 7.3).                                                                                                                                                                                                                                                                                                                                                                               |
| Art. 8  | ✅     | Unit tests for policy evaluation, integration tests for role assignment, E2E for RBAC flow. Acceptance criteria in Given/When/Then (Art. 8.2.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Art. 9  | ✅     | Authorization decisions logged at `info` level (NFR-003, Art. 9.2); alert on elevated DENY rates (Art. 9.2.3). Feature flag required for ABAC rollout (Art. 9.1.1).                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## Cross-References

| Document                 | Path                                             |
| ------------------------ | ------------------------------------------------ |
| Constitution             | `.forge/constitution.md`                         |
| Authentication Spec      | `.forge/specs/002-authentication/spec.md`        |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`         |
| Plugin System Spec       | `.forge/specs/004-plugin-system/spec.md`         |
| Admin Interfaces Spec    | `.forge/specs/008-admin-interfaces/spec.md`      |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 5) |
| Source: Auth Module      | `apps/core-api/src/modules/auth/`                |
| Security Guidelines      | `docs/SECURITY.md`                               |
