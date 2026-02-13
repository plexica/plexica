# Spec: 008 - Admin Interfaces

> Feature specification for the Plexica Super Admin Panel and Tenant Admin Interface.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 008        |

---

## 1. Overview

Plexica provides two administrative interfaces: the **Super Admin Panel** for platform-wide management (tenants, plugins, system configuration, audit logs) and the **Tenant Admin Interface** for tenant-scoped management (users, teams, roles, plugin configuration, settings, audit logs). The Super Admin operates in the Keycloak master realm and is independent of any tenant. The Tenant Admin operates within a tenant's realm and manages only that tenant's resources.

## 2. Problem Statement

A multi-tenant platform requires two levels of administration: platform operators who manage the overall system (create tenants, install plugins, monitor health) and tenant administrators who manage their own organization (invite users, create teams, assign roles, configure plugins). These two admin scopes must be clearly separated in both UI and authorization, with the Super Admin having cross-tenant capabilities and the Tenant Admin strictly scoped to their tenant.

## 3. User Stories

### US-001: Tenant CRUD (Super Admin)

**As a** Super Admin,
**I want** to create, view, update, suspend, and delete tenants,
**so that** I can manage the platform's customer base.

**Acceptance Criteria:**

- Given the tenant list page, when I view it, then I see all tenants with name, status, user count, plugin count, creation date, and action buttons.
- Given the "New Tenant" form, when I submit valid data (name, slug), then a new tenant is provisioned (schema, realm, bucket).
- Given an active tenant, when I click "Suspend", then the tenant status changes to SUSPENDED and all user access is blocked.
- Given a suspended tenant, when I click "Reactivate", then the tenant becomes ACTIVE again.
- Given a suspended tenant, when I click "Delete", then the tenant enters PENDING_DELETION with a grace period.

### US-002: Plugin Management (Super Admin)

**As a** Super Admin,
**I want** to manage the plugin registry (install, update, configure globally),
**so that** I can control which plugins are available to tenants.

**Acceptance Criteria:**

- Given the plugin list page, when I view it, then I see all plugins with name, version, status, tenant adoption count, and action buttons.
- Given an available plugin, when I click "Install", then the plugin installation process begins (image pull, migrations, route registration).
- Given an installed plugin with an update, when I click "Update", then the new version is deployed (migration, hot-swap if possible).
- Given an installed plugin, when I click "Config", then I can edit global plugin configuration.

### US-003: User Management (Tenant Admin)

**As a** tenant admin,
**I want** to manage users within my tenant (invite, deactivate, assign roles),
**so that** I can control who has access to my organization's data.

**Acceptance Criteria:**

- Given the user list page, when I view it, then I see all tenant users with name, email, teams, role, and status.
- Given the "Invite" button, when I submit an email, then an invitation is sent and the user appears with status "Invited".
- Given an active user, when I click "Deactivate", then the user's access is revoked and status changes to "Deactivated".
- Given a user, when I assign a role, then the user's permissions update immediately.

### US-004: Role Editor (Tenant Admin)

**As a** tenant admin,
**I want** to create and edit custom roles with specific permissions,
**so that** I can define access patterns matching my organization's needs.

**Acceptance Criteria:**

- Given the role editor, when I create a role "Sales Manager", then I can select permissions grouped by source (Core, CRM, Billing, etc.).
- Given the permission list, when I check `crm:contacts:read` and `crm:deals:*`, then the role is saved with those permissions.
- Given a system role (e.g., `tenant_admin`), when I open it in the editor, then all fields are read-only (system roles are immutable).
- Given a saved role, when I assign it to a user, then the user inherits all role permissions.

### US-005: Team Management (Tenant Admin)

**As a** tenant admin,
**I want** to create teams, add members, and assign team roles,
**so that** I can organize users into functional groups.

**Acceptance Criteria:**

- Given the team list, when I view it, then I see all teams with name, member count, and workspace.
- Given a new team, when I create it with name and workspace, then the team appears in the team list.
- Given a team, when I add a user as a member with role "MEMBER" or "ADMIN", then the user appears in the team's member list.
- Given a team member, when I remove them, then their team-specific permissions are revoked.

### US-006: Tenant Settings (Tenant Admin)

**As a** tenant admin,
**I want** to configure tenant settings (theme, preferences, plugin config),
**so that** I can customize the platform for my organization.

**Acceptance Criteria:**

- Given the settings page, when I update the theme (logo, colors, fonts), then the changes are saved and applied on next page load.
- Given the plugin settings, when I enable/disable a plugin for my tenant, then the plugin availability updates immediately.
- Given plugin configuration, when I change settings (e.g., CRM deal stages), then the changes are stored per-tenant.

### US-007: Audit Log (Both Admins)

**As an** admin (Super or Tenant),
**I want** to view audit logs of user actions,
**so that** I can track and investigate security-relevant events.

**Acceptance Criteria:**

- Given the audit log page, when I view it, then I see entries with timestamp, user, action, resource type, resource ID, and IP address.
- Given the audit log, when I filter by action type or date range, then only matching entries are shown.
- Given I am a Tenant Admin, when I view audit logs, then I only see logs for my tenant.
- Given I am a Super Admin, when I view audit logs, then I can view logs across all tenants.

## 4. Functional Requirements

### Super Admin Panel

| ID     | Requirement                                                                     | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Dashboard: system overview with tenant count, user count, plugin count, health  | Must     | US-001    |
| FR-002 | Tenant management: list, create, edit, suspend, reactivate, delete              | Must     | US-001    |
| FR-003 | Plugin management: list, install, enable, disable, update, configure, uninstall | Must     | US-002    |
| FR-004 | Super Admin user management: manage other Super Admins                          | Must     | US-001    |
| FR-005 | System configuration: global settings, feature flags, maintenance mode          | Should   | US-001    |
| FR-006 | Global audit log: cross-tenant activity logging                                 | Must     | US-007    |
| FR-007 | System metrics and health monitoring dashboard                                  | Should   | US-001    |

### Tenant Admin Interface

| ID     | Requirement                                                              | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------ | -------- | --------- |
| FR-008 | Dashboard: tenant overview with user count, usage metrics                | Must     | US-003    |
| FR-009 | User management: list, invite, deactivate, role assignment               | Must     | US-003    |
| FR-010 | Team management: CRUD teams, member management, role assignment          | Must     | US-005    |
| FR-011 | Role editor: create/edit custom roles with grouped permission checkboxes | Must     | US-004    |
| FR-012 | Plugin settings: enable/disable, per-tenant configuration                | Must     | US-006    |
| FR-013 | Tenant settings: theme, preferences, integrations                        | Must     | US-006    |
| FR-014 | Tenant audit log: scoped to current tenant only                          | Must     | US-007    |

## 5. Non-Functional Requirements

| ID      | Category      | Requirement                                   | Target                                       |
| ------- | ------------- | --------------------------------------------- | -------------------------------------------- |
| NFR-001 | Performance   | Admin list pages load time                    | < 1s for ≤1000 items (paginated)             |
| NFR-002 | Performance   | Audit log query performance                   | < 500ms for 30-day range                     |
| NFR-003 | Security      | Super Admin panel requires `super_admin` role | Enforced at API and UI level                 |
| NFR-004 | Security      | Tenant Admin scoped to own tenant only        | No cross-tenant data visible                 |
| NFR-005 | UX            | All admin forms have client-side validation   | Real-time feedback (per Art. 1.3)            |
| NFR-006 | UX            | Admin interfaces are responsive on tablet+    | Usable on 768px+ width                       |
| NFR-007 | Accessibility | WCAG 2.1 AA compliance for admin interfaces   | All admin pages                              |
| NFR-008 | Performance   | Tenant provisioning feedback                  | Real-time status updates during provisioning |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                | Expected Behavior                                                   |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Super Admin creates tenant with duplicate slug          | 409 Conflict with clear error message                               |
| 2   | Tenant Admin tries to edit a system role                | Edit controls disabled; tooltip explains system roles are immutable |
| 3   | Super Admin deletes tenant with active users            | Tenant enters PENDING_DELETION; users notified; grace period starts |
| 4   | Tenant Admin invites user with already-registered email | Existing user added to tenant; no duplicate account created         |
| 5   | Plugin install fails mid-process                        | Status reverts; error shown with retry option                       |
| 6   | Audit log query for very large date range               | Paginated response; max 10,000 entries per query                    |
| 7   | Last Tenant Admin removed from tenant                   | Prevented: at least one tenant_admin must exist                     |
| 8   | Super Admin downgrades own role                         | Prevented if this is the last super_admin                           |

## 7. Data Requirements

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Events to Audit

| Category       | Events                                           |
| -------------- | ------------------------------------------------ |
| Authentication | Login, logout, failed login attempt              |
| User Mgmt      | User invited, deactivated, role changed          |
| Team Mgmt      | Team created, member added/removed               |
| Role Mgmt      | Role created, permissions changed                |
| Plugin Mgmt    | Plugin installed, enabled, disabled, configured  |
| Tenant Mgmt    | Tenant created, suspended, deleted (Super Admin) |
| Settings       | Theme changed, configuration updated             |

## 8. API Requirements

### Super Admin APIs

| Method | Path                                 | Description              | Auth                 |
| ------ | ------------------------------------ | ------------------------ | -------------------- |
| GET    | /api/v1/admin/dashboard              | System dashboard metrics | Bearer + super_admin |
| GET    | /api/v1/admin/tenants                | List all tenants         | Bearer + super_admin |
| POST   | /api/v1/admin/tenants                | Create tenant            | Bearer + super_admin |
| PUT    | /api/v1/admin/tenants/:id            | Update tenant            | Bearer + super_admin |
| POST   | /api/v1/admin/tenants/:id/suspend    | Suspend tenant           | Bearer + super_admin |
| POST   | /api/v1/admin/tenants/:id/reactivate | Reactivate tenant        | Bearer + super_admin |
| DELETE | /api/v1/admin/tenants/:id            | Delete tenant            | Bearer + super_admin |
| GET    | /api/v1/admin/audit-logs             | Global audit logs        | Bearer + super_admin |

### Tenant Admin APIs

| Method | Path                                  | Description              | Auth                  |
| ------ | ------------------------------------- | ------------------------ | --------------------- |
| GET    | /api/v1/tenant/dashboard              | Tenant dashboard metrics | Bearer + tenant_admin |
| GET    | /api/v1/tenant/users                  | List tenant users        | Bearer + tenant_admin |
| POST   | /api/v1/tenant/users/invite           | Invite user              | Bearer + tenant_admin |
| PUT    | /api/v1/tenant/users/:id              | Update user              | Bearer + tenant_admin |
| POST   | /api/v1/tenant/users/:id/deactivate   | Deactivate user          | Bearer + tenant_admin |
| GET    | /api/v1/tenant/teams                  | List teams               | Bearer + tenant_admin |
| POST   | /api/v1/tenant/teams                  | Create team              | Bearer + tenant_admin |
| PUT    | /api/v1/tenant/teams/:id              | Update team              | Bearer + tenant_admin |
| DELETE | /api/v1/tenant/teams/:id              | Delete team              | Bearer + tenant_admin |
| POST   | /api/v1/tenant/teams/:id/members      | Add team member          | Bearer + tenant_admin |
| DELETE | /api/v1/tenant/teams/:id/members/:uid | Remove team member       | Bearer + tenant_admin |
| GET    | /api/v1/tenant/settings               | Get tenant settings      | Bearer + tenant_admin |
| PUT    | /api/v1/tenant/settings               | Update tenant settings   | Bearer + tenant_admin |
| GET    | /api/v1/tenant/audit-logs             | Tenant audit logs        | Bearer + tenant_admin |

## 9. UX/UI Notes

### Super Admin Panel

- Independent of tenant context; accessed via `/super-admin` route.
- Dashboard with metric cards: total tenants, total users, active plugins, system health.
- Tenant list: data table with sortable columns, search, status filter, pagination.
- Plugin list: grid or table view with status badges and version info.
- Tenant creation: wizard-style form with progress indicator for provisioning steps.

### Tenant Admin Interface

- Accessed via `/admin` route within tenant context.
- Dashboard with tenant-specific metrics: user count, storage usage, active plugins.
- User list: data table with role badges, team tags, invite status.
- Role editor: grouped permission checkboxes with plugin sections; system roles shown as read-only.
- Team management: card or list view with member avatars and role tags.

## 10. Out of Scope

- Self-service tenant provisioning (user signs up and creates own tenant) — Phase 4.
- Billing and subscription management interfaces — separate billing plugin.
- White-label admin interfaces (custom branding for admin panels) — future consideration.
- Mobile-specific admin app — responsive web only for MVP.
- Advanced analytics dashboards with charts and graphs — Phase 4.

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications.

## 12. Constitution Compliance

| Article | Status | Notes                                                                                       |
| ------- | ------ | ------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Admin UIs follow UX standards: fast loads, actionable errors, form validation               |
| Art. 2  | ✅     | React 19 + Vite frontend; Fastify backend APIs; all approved stack                          |
| Art. 3  | ✅     | REST API conventions for admin endpoints; standard error format                             |
| Art. 4  | ✅     | Admin API endpoints require integration + E2E tests                                         |
| Art. 5  | ✅     | Super Admin: master realm auth; Tenant Admin: scoped to own tenant; audit logging           |
| Art. 6  | ✅     | Standard error format; no stack traces; actionable admin error messages                     |
| Art. 7  | ✅     | REST naming: `/api/v1/admin/tenants`; kebab-case; plural nouns                              |
| Art. 8  | ✅     | Unit tests for admin services; integration tests for admin APIs; E2E for critical workflows |
| Art. 9  | ✅     | Health checks; audit logging for all admin actions; feature flags for new admin features    |

---

## Cross-References

| Document                 | Path                                                  |
| ------------------------ | ----------------------------------------------------- |
| Constitution             | `.forge/constitution.md`                              |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`              |
| Authentication Spec      | `.forge/specs/002-authentication/spec.md`             |
| Authorization Spec       | `.forge/specs/003-authorization/spec.md`              |
| Plugin System Spec       | `.forge/specs/004-plugin-system/spec.md`              |
| Frontend Architecture    | `.forge/specs/005-frontend-architecture/spec.md`      |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Sections 11-12) |
