# Spec: 003 - Authorization System (RBAC + ABAC)

> Feature specification for the Plexica hybrid authorization system combining Role-Based Access Control and Attribute-Based Access Control.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 003        |

---

## 1. Overview

Plexica implements a **hybrid RBAC + ABAC** authorization system. RBAC provides simple, performant role-to-permission mappings for common access patterns. ABAC provides dynamic, attribute-based policy evaluation for fine-grained access control when RBAC alone is insufficient. The system supports plugin-contributed permissions, tenant-scoped custom roles, and a cascading policy evaluation flow: RBAC first, then ABAC if needed.

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
- Given a user inherits permissions from team roles, when evaluated, then team permissions are combined with direct user roles.

### US-002: Attribute-Based Policy Evaluation

**As a** tenant admin,
**I want** to define policies that restrict access based on resource attributes,
**so that** users only see data relevant to their team or department.

**Acceptance Criteria:**

- Given an ABAC policy "Sales team can only view their own deals", when a Sales team member requests CRM deals, then only deals owned by the Sales team are returned.
- Given an ABAC policy with environment conditions (time-of-day), when evaluated outside allowed hours, then access is denied.
- Given RBAC grants access but an ABAC DENY policy exists, when evaluated, then ABAC DENY overrides RBAC ALLOW.

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
- Given RBAC is inconclusive or denied, when ABAC runs, then all matching policies are evaluated.
- Given the final decision, when it is DENY, then a 403 Forbidden with error code `AUTHORIZATION_DENIED` is returned.

## 4. Functional Requirements

| ID     | Requirement                                                                                         | Priority | Story Ref |
| ------ | --------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Permission format: `{resource}:{action}` (e.g., `users:read`, `crm:contacts:write`)                 | Must     | US-001    |
| FR-002 | Wildcard permissions: `crm:deals:*` grants all actions on deals                                     | Must     | US-001    |
| FR-003 | System roles: `super_admin` (global), `tenant_admin` (tenant), `team_admin` (team), `user` (tenant) | Must     | US-001    |
| FR-004 | System roles are immutable and cannot be edited or deleted                                          | Must     | US-003    |
| FR-005 | Custom roles created by tenant admins are tenant-scoped                                             | Must     | US-003    |
| FR-006 | User permissions = union of all assigned role permissions + team role permissions                   | Must     | US-001    |
| FR-007 | ABAC policy engine evaluates conditions on user, resource, environment, and tenant attributes       | Must     | US-002    |
| FR-008 | ABAC policy conditions support operators: `equals`, `contains`, `in`, `greaterThan`, `lessThan`     | Must     | US-002    |
| FR-009 | Policy sources: Core (immutable), Plugin (predefined), Super Admin (global), Tenant Admin (scoped)  | Must     | US-002    |
| FR-010 | Authorization flow: Extract Context → RBAC Check → ABAC Check → Decision                            | Must     | US-005    |
| FR-011 | Plugins register permissions via manifest `permissions` array on install                            | Must     | US-004    |
| FR-012 | Plugin permissions are namespaced by plugin ID (e.g., `crm:contacts:read`)                          | Must     | US-004    |
| FR-013 | Plugin uninstall removes associated permissions from roles                                          | Should   | US-004    |
| FR-014 | Plugins can provide default ABAC policies in their manifest                                         | Should   | US-004    |
| FR-015 | Tenant admin can override plugin default policies                                                   | Should   | US-002    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                             | Target                                             |
| ------- | ----------- | ------------------------------------------------------- | -------------------------------------------------- |
| NFR-001 | Performance | Authorization decision latency                          | < 50ms P95 (including RBAC + ABAC)                 |
| NFR-002 | Performance | Permission cache hit rate                               | > 95% (Redis-cached role-permission mappings)      |
| NFR-003 | Security    | All authorization decisions auditable                   | Logged at `info` level with decision + context     |
| NFR-004 | Security    | DENY decisions never reveal what permission was missing | Generic 403 message to client                      |
| NFR-005 | Reliability | Authorization failure defaults to DENY                  | Fail-closed, never fail-open                       |
| NFR-006 | Security    | Tenant isolation in authorization                       | Policies scoped to tenant; no cross-tenant leakage |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                   | Expected Behavior                                                      |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | User has no roles assigned                                 | All access denied except public endpoints                              |
| 2   | Role references a permission that no longer exists         | Permission silently skipped; role still functions with remaining perms |
| 3   | Conflicting ABAC policies (one ALLOW, one DENY)            | DENY takes precedence (explicit deny wins)                             |
| 4   | Plugin registers permission key that already exists        | Registration fails with conflict error; plugin install aborted         |
| 5   | ABAC policy references an attribute not present in context | Policy condition evaluates to false (fail-closed)                      |
| 6   | Super Admin accesses tenant resources                      | Bypass — Super Admin has global access                                 |
| 7   | Redis cache unavailable                                    | Fall back to database query; log warning for degraded performance      |
| 8   | User's role deleted while they have an active session      | Next authorization check reflects deletion; cached permissions expire  |

## 7. Data Requirements

### Core Schema (per tenant)

**roles** table:

| Column      | Type      | Description                      |
| ----------- | --------- | -------------------------------- |
| id          | UUID      | Primary key                      |
| name        | VARCHAR   | Role name (unique within tenant) |
| description | TEXT      | Role description                 |
| is_system   | BOOLEAN   | True for immutable system roles  |
| created_at  | TIMESTAMP | Creation timestamp               |

**permissions** table:

| Column      | Type      | Description                                        |
| ----------- | --------- | -------------------------------------------------- |
| id          | UUID      | Primary key                                        |
| key         | VARCHAR   | Permission key (unique), e.g., `crm:contacts:read` |
| name        | VARCHAR   | Human-readable name                                |
| description | TEXT      | Description                                        |
| plugin_id   | VARCHAR   | FK to plugin (nullable for core perms)             |
| created_at  | TIMESTAMP | Creation timestamp                                 |

**role_permissions** (join table): `role_id` + `permission_id` composite PK

**user_roles** (join table): `user_id` + `role_id` composite PK

**policies** table (ABAC):

| Column     | Type    | Description                                     |
| ---------- | ------- | ----------------------------------------------- |
| id         | UUID    | Primary key                                     |
| name       | VARCHAR | Policy name                                     |
| resource   | VARCHAR | Resource pattern (e.g., `crm:deals:*`)          |
| effect     | VARCHAR | `ALLOW` or `DENY`                               |
| conditions | JSONB   | Condition tree with operators                   |
| priority   | INTEGER | Evaluation order (higher = evaluated first)     |
| source     | VARCHAR | `core`, `plugin`, `super_admin`, `tenant_admin` |
| plugin_id  | VARCHAR | FK to plugin (nullable)                         |

## 8. API Requirements

| Method | Path                            | Description                    | Auth                      |
| ------ | ------------------------------- | ------------------------------ | ------------------------- |
| GET    | /api/v1/roles                   | List roles for current tenant  | Bearer + `roles:read`     |
| POST   | /api/v1/roles                   | Create custom role             | Bearer + `roles:write`    |
| PUT    | /api/v1/roles/:id               | Update custom role             | Bearer + `roles:write`    |
| DELETE | /api/v1/roles/:id               | Delete custom role             | Bearer + `roles:write`    |
| GET    | /api/v1/permissions             | List all available permissions | Bearer + `roles:read`     |
| POST   | /api/v1/users/:id/roles         | Assign role to user            | Bearer + `users:write`    |
| DELETE | /api/v1/users/:id/roles/:roleId | Remove role from user          | Bearer + `users:write`    |
| GET    | /api/v1/policies                | List ABAC policies             | Bearer + `policies:read`  |
| POST   | /api/v1/policies                | Create ABAC policy             | Bearer + `policies:write` |
| PUT    | /api/v1/policies/:id            | Update ABAC policy             | Bearer + `policies:write` |
| DELETE | /api/v1/policies/:id            | Delete ABAC policy             | Bearer + `policies:write` |

## 9. UX/UI Notes

- Role editor UI must group permissions by source (Core, Plugin name).
- Permission checkboxes should support wildcard toggling (checking `crm:deals:*` auto-checks all deal sub-permissions).
- ABAC policy editor should provide a visual condition builder (tree structure).
- System roles must be visually distinguished and non-editable in the UI.
- Permission changes must take effect immediately (cache invalidation on save).

## 10. Out of Scope

- ABAC policy engine is Phase 3; MVP uses RBAC only with ABAC data model prepared.
- Dynamic attribute resolution from external systems (e.g., LDAP group membership).
- Permission inheritance hierarchies (e.g., `crm:*` auto-grants `crm:contacts:read`).
- Row-level security policies defined via ABAC (use tenant/workspace filtering instead).
- Delegated administration (one tenant admin granting admin to another).

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications and constitution.

## 12. Constitution Compliance

| Article | Status | Notes                                                                                      |
| ------- | ------ | ------------------------------------------------------------------------------------------ |
| Art. 1  | ✅     | Security-first: RBAC + ABAC enforce access control; fail-closed by default                 |
| Art. 2  | ✅     | Uses approved stack: Redis for permission caching, Prisma for data access                  |
| Art. 3  | ✅     | Service layer pattern: AuthorizationService → RoleRepository/PolicyRepository              |
| Art. 4  | ✅     | 85% coverage target for auth module; authorization logic 100% unit tested                  |
| Art. 5  | ✅     | RBAC per Art. 5.1; tenant validation on every auth decision per Art. 5.1                   |
| Art. 6  | ✅     | 403 errors use standard format; no permission details leaked to client                     |
| Art. 7  | ✅     | Naming: `authorization.service.ts`, `RoleRepository`, `crm:contacts:read` format           |
| Art. 8  | ✅     | Unit tests for policy evaluation, integration tests for role assignment, E2E for RBAC flow |
| Art. 9  | ✅     | Authorization decisions logged; alert on elevated DENY rates                               |

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
