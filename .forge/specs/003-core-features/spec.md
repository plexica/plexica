# Spec: 003 - Core Features

> Feature specification for the Feature track.
> Created by forge-pm via `/forge-specify`. Clarified via `/forge-clarify`.

| Field   | Value      |
| ------- | ---------- |
| Status  | Clarified  |
| Author  | forge-pm   |
| Date    | 2026-03-01 |
| Track   | Feature    |
| Spec ID | 003        |

**Phase**: 2 — Core Features
**Duration**: 4-5 weeks
**Last Clarified**: 2026-04-05 (DR-12 and AC-15 moved to Spec 004; role management screens DR-13/DR-14 added)
**Dependencies**: Spec 002 (Foundations)

---

## 1. Overview

Build the primary application features on top of the authenticated, tenant-
isolated foundation: workspace management with hierarchy, user invitation and
role assignment with ABAC-based authorization, and tenant-level settings
including branding and audit logging. After this phase the platform is usable
as a multi-tenant collaboration tool — before any plugin system exists.

## 2. Problem Statement

After Spec 002 (Foundations), the platform has authentication and tenant
isolation but no application-level functionality. Users can log in but have
nothing to do — no workspaces, no collaboration, no settings. This spec
fills that gap by delivering the core feature set that makes the platform
usable: workspace management with hierarchy, team collaboration with RBAC/ABAC
authorization, tenant customization (branding, settings), and operational
visibility (audit log). Without these features, no plugin or advanced feature
can be built on top.

## 3. User Stories

### US-001: Workspace Organization

**As a** tenant admin,
**I want** to create workspaces with parent/child hierarchy,
**so that** my organization's structure is reflected in the platform.

**Acceptance Criteria:**

- Given I am a tenant admin, when I create a workspace, then it appears in my workspace list.
- Given I create a child workspace under a parent, when I navigate the sidebar, then the hierarchy is visible.
- Given I am at hierarchy depth 10, when I try to create a child, then the operation is rejected.

### US-002: Team Collaboration

**As a** tenant admin,
**I want** to invite users and assign them workspace roles,
**so that** team members have the right level of access.

**Acceptance Criteria:**

- Given I search for an existing tenant user, when I select them, then they are added to the workspace directly.
- Given I enter a new email, when I send the invite, then an email is delivered and the invite is tracked.
- Given I assign a Viewer role, when the user tries to create content, then they are denied.

### US-003: Data Isolation

**As a** user with access to workspace A only,
**I want** to be prevented from accessing workspace B,
**so that** data isolation is enforced between workspaces.

**Acceptance Criteria:**

- Given I have Member role in workspace A, when I request workspace B resources, then I receive 403/404.
- Given an ABAC check runs, when a decision is made, then the evaluation is logged for audit.

### US-004: Tenant Customization

**As a** tenant admin,
**I want** to brand my tenant with a logo and colors,
**so that** the platform reflects my organization's identity.

**Acceptance Criteria:**

- Given I upload a logo and set a primary color, when I save, then the UI updates immediately.
- Given I open the settings page, when I view the slug field, then it is read-only.

### US-005: Operational Visibility

**As a** tenant admin,
**I want** to view an audit log of all actions in my tenant,
**so that** I can monitor activity and comply with security requirements.

**Acceptance Criteria:**

- Given I open the audit log, when I filter by action type and date range, then matching events are displayed.
- Given a user changes a workspace member's role, when I check the audit log, then the event is recorded with actor, action, and before/after values.

### US-006: Auth Self-Service

**As a** tenant admin,
**I want** to configure MFA and identity providers for my tenant,
**so that** I can enforce my organization's security policies.

**Acceptance Criteria:**

- Given I enable TOTP MFA, when I save, then the Keycloak realm is updated and users must set up TOTP on next login.
- Given I try to disable all login methods, when I preview the change, then a warning prevents lockout.

### US-007: User Profile Management

**As a** user,
**I want** to manage my profile (name, avatar, timezone, language, notifications),
**so that** the platform is personalized to my preferences.

**Acceptance Criteria:**

- Given I update my display name, when I save, then the change is synced to Keycloak and reflected in the UI.
- Given I upload an avatar, when I save, then the avatar is stored in MinIO and displayed across the platform.

## 4. Functional Requirements

### 4.1 Workspace Management (2 weeks)

| ID     | Requirement                                           | Priority | Story Ref | E2E Test                                                        |
| ------ | ----------------------------------------------------- | -------- | --------- | --------------------------------------------------------------- |
| FR-001 | Workspace list                                        | Must     | US-001    | User sees workspaces they have access to                        |
| FR-002 | Create workspace                                      | Must     | US-001    | Tenant admin creates workspace, appears in list                 |
| FR-003 | Workspace detail with navigation                      | Must     | US-001    | User opens workspace, sees overview with sidebar navigation     |
| FR-004 | Workspace hierarchy (parent/child, materialized path) | Must     | US-001    | Admin creates child workspace, parent→child navigation works    |
| FR-005 | Workspace members                                     | Must     | US-002    | Admin adds member, member sees the workspace                    |
| FR-006 | Workspace settings                                    | Must     | US-001    | Admin modifies name/description, save works                     |
| FR-007 | Delete workspace (soft-delete)                        | Must     | US-001    | Admin deletes workspace, no longer in list, children archived   |
| FR-008 | Workspace templates                                   | Should   | US-001    | Admin creates workspace from pre-defined template               |
| FR-009 | Reparent workspace                                    | Should   | US-001    | Admin moves workspace to a different parent, navigation updates |

### 4.2 Users, Roles & ABAC (2 weeks)

| ID     | Requirement                      | Priority                                                                                                     | Story Ref | E2E Test                                                                                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR-010 | Tenant user list                 | Must                                                                                                         | US-002    | Tenant admin sees all users in their tenant                                                                                |
| FR-011 | Invite user via email            | Must                                                                                                         | US-002    | Admin invites user, email arrives (Mailpit), user accepts, logs in                                                         |
| FR-012 | RBAC role assignment             | Must                                                                                                         | US-002    | Admin assigns role, user has correct permissions                                                                           |
| FR-013 | ABAC workspace isolation         | Must                                                                                                         | US-003    | User with role in workspace A cannot see data in workspace B                                                               |
| FR-014 | ABAC condition tree              | Must                                                                                                         | US-003    | ABAC policy evaluated: given context X, decision is Y                                                                      |
| FR-015 | ABAC decision logging            | Must                                                                                                         | US-003    | Every ABAC evaluation logs input, rules, result (for debugging)                                                            |
| FR-016 | Remove user                      | Must                                                                                                         | US-002    | Admin removes user, resources reassigned, user can no longer access                                                        |
| FR-017 | User profile                     | Must                                                                                                         | US-007    | User views and edits profile (name, avatar, tz, lang, notif)                                                               |
| FR-018 | End-to-end permission check      | Must                                                                                                         | US-003    | Viewer can't create workspace, member can't manage users                                                                   |
| FR-023 | Plugin action role assignment UI | Must — data model + ABAC engine only in Spec 003; full UI requires Spec 004 to populate `action_registry`    | US-003    | Workspace admin opens plugin permissions panel, changes required role for a plugin action, change takes effect immediately |
| FR-024 | Plugin action ABAC enforcement   | Must — ABAC enforcement implemented in Spec 003; enforcement meaningful only after Spec 004 installs plugins | US-003    | Request carrying a plugin action key is evaluated via `workspace_role_action`; denied if user role < required role         |
| FR-025 | Role management screen           | Must                                                                                                         | US-002    | Tenant admin opens Roles & Permissions screen, sees all built-in roles with descriptions and the full action matrix        |
| FR-026 | Workspace permission association | Must                                                                                                         | US-002    | Workspace admin opens Permissions panel, views core permission matrix and changes member roles inline via role selector    |

### 4.3 Tenant Settings (1 week)

| ID     | Requirement                                      | Priority | Story Ref | E2E Test                                                               |
| ------ | ------------------------------------------------ | -------- | --------- | ---------------------------------------------------------------------- |
| FR-019 | General settings page                            | Must     | US-004    | Admin modifies tenant name; slug shown read-only                       |
| FR-020 | Branding (logo, primary color, dark mode toggle) | Must     | US-004    | Admin uploads logo, changes color, interface reflects branding         |
| FR-021 | Audit log                                        | Must     | US-005    | Admin views recent write ops + auth events, filterable                 |
| FR-022 | Auth realm configuration                         | Should   | US-006    | Admin toggles MFA, manages IdPs from Plexica UI via Keycloak Admin API |

### 4.4 Detailed Requirement Definitions

#### DR-01: Workspace Deletion Behavior

Workspace deletion uses **soft-delete** (archive) by default:

- Deleting a workspace sets its status to `archived` along with all
  descendant workspaces in the hierarchy.
- Archived workspaces are hidden from the workspace list but remain
  in the database.
- A tenant admin can **restore** an archived workspace (and its children)
  within **30 days** of archival.
- After 30 days, a background job hard-deletes archived workspaces and
  their associated data.
- The delete confirmation dialog lists all child workspaces that will
  be archived.

#### DR-02: Workspace Reparenting

- A tenant admin or workspace owner can move a workspace under a different
  parent workspace (or to root level).
- The operation recalculates the materialized path for the moved workspace
  and all its descendants.
- The entire reparent operation is wrapped in a database transaction to
  prevent materialized path corruption.
- Circular references are rejected (a workspace cannot become its own
  ancestor).
- Maximum hierarchy depth of 10 levels is enforced; reparenting that
  would exceed this depth is rejected with a clear error.

#### DR-03: Workspace Templates

A workspace template defines:

- **Name pattern**: template display name (e.g., "Engineering Team")
- **Description**: default description for workspaces created from it
- **Default member roles**: which roles are auto-assigned to the creator
- **Child workspace structure**: pre-defined child workspaces with their
  own names, descriptions, and role configurations

Template management:

- The system ships with **2-3 built-in templates** (e.g., "Team",
  "Department", "Project").
- **Tenant admins can create custom templates** from the tenant settings UI.
- Templates are versioned; when instantiating, the current template schema
  is validated. Stale templates show a warning and are updated on use.

#### DR-04: RBAC Role Definitions and Action Matrix

Four roles are available at launch: one tenant-level and three workspace-level.
The data model supports custom roles but the UI for creating them is deferred.

**Role descriptions:**

| Role             | Scope        | Description                                                                                                                                                                  |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant Admin     | Tenant-level | Full control over the tenant: creates workspaces, manages settings, branding, auth, audit log. Implicitly holds Workspace Admin rights in every workspace within the tenant. |
| Workspace Admin  | Workspace    | Full control within a workspace: manage members, roles, settings, CRUD content, delete workspace.                                                                            |
| Workspace Member | Workspace    | Create and edit content; cannot manage members, settings, or workspace structure.                                                                                            |
| Workspace Viewer | Workspace    | Read-only access to content and membership list; cannot create, edit, or delete anything.                                                                                    |

**Core action matrix:**

Actions use the format `{resource}:{verb}`. The ABAC engine evaluates every
request against this table. Tenant Admin implicitly holds Workspace Admin
rights across all workspaces; the WS Admin column covers both.

| Action               | Tenant Admin | WS Admin | WS Member | WS Viewer |
| -------------------- | :----------: | :------: | :-------: | :-------: |
| `workspace:read`     |      ✓       |    ✓     |     ✓     |     ✓     |
| `workspace:create`   |      ✓       |    —     |     —     |     —     |
| `workspace:update`   |      ✓       |    ✓     |     ✗     |     ✗     |
| `workspace:delete`   |      ✓       |    ✓     |     ✗     |     ✗     |
| `workspace:archive`  |      ✓       |    ✓     |     ✗     |     ✗     |
| `workspace:restore`  |      ✓       |    ✓     |     ✗     |     ✗     |
| `workspace:reparent` |      ✓       |    ✓     |     ✗     |     ✗     |
| `content:read`       |      ✓       |    ✓     |     ✓     |     ✓     |
| `content:create`     |      ✓       |    ✓     |     ✓     |     ✗     |
| `content:update`     |      ✓       |    ✓     |     ✓     |     ✗     |
| `content:delete`     |      ✓       |    ✓     |     ✓     |     ✗     |
| `member:list`        |      ✓       |    ✓     |     ✓     |     ✓     |
| `member:invite`      |      ✓       |    ✓     |     ✗     |     ✗     |
| `member:remove`      |      ✓       |    ✓     |     ✗     |     ✗     |
| `member:role-change` |      ✓       |    ✓     |     ✗     |     ✗     |
| `settings:read`      |      ✓       |    ✓     |     ✗     |     ✗     |
| `settings:update`    |      ✓       |    ✓     |     ✗     |     ✗     |
| `branding:update`    |      ✓       |    ✗     |     ✗     |     ✗     |
| `auth:configure`     |      ✓       |    ✗     |     ✗     |     ✗     |
| `audit:read`         |      ✓       |    ✓     |     ✗     |     ✗     |
| `invitation:list`    |      ✓       |    ✓     |     ✗     |     ✗     |
| `invitation:resend`  |      ✓       |    ✓     |     ✗     |     ✗     |

Legend: ✓ allowed, ✗ denied, — not workspace-scoped (tenant-level check only).

Additional rules:

- Roles are assigned **per user per workspace** (a user can be Admin in
  workspace A and Viewer in workspace B).
- Membership is **not inherited** down the hierarchy: a Viewer in workspace A
  has no access to workspace A's children unless explicitly added.
- The data model supports custom roles (configurable permission sets) but the
  UI for custom role creation is deferred.
- Plugin-contributed actions extend this matrix — see Spec 004, DR-12.

#### DR-05: User Invitation Flow

1. **Search first**: The invite UI shows a search/autocomplete of existing
   tenant users. Admin can add an existing user directly to a workspace
   without sending an email.
2. **Email invite for new users**: If the user does not exist in the tenant,
   the admin enters an email address. A Keycloak invitation is created in
   the tenant's realm.
3. **Invite expiry**: Invitations expire after **7 days**. Expired invites
   can be re-sent by the admin.
4. **Pending invite visibility**: The admin UI shows a list of pending
   invitations with status (pending, accepted, expired).
5. **Cross-tenant**: If the email belongs to a user in a different tenant,
   a new Keycloak user is created in the current tenant's realm (separate
   identity per tenant realm, per Keycloak multi-realm architecture).

#### DR-06: User Removal & Resource Reassignment

When a user is removed from a tenant:

1. **Resource reassignment**: The admin is prompted to choose a reassignment
   target — either the workspace admin or a specific user within each
   affected workspace. All resources (content, owned objects) created by
   the removed user are transferred to the chosen user.
2. **Profile soft-delete**: The user's profile data is soft-deleted and
   retained for **90 days** for audit trail purposes.
3. **Hard-delete**: After 90 days, a background job permanently deletes the
   user's profile data.
4. **Keycloak**: The user is disabled (not deleted) in the tenant's
   Keycloak realm to preserve audit log references. The Keycloak user can
   be hard-deleted as part of the 90-day cleanup.
5. **Access revocation**: Immediate. All active sessions are terminated via
   Keycloak backchannel logout.

#### DR-07: Tenant Slug Immutability

The tenant **slug is immutable** after creation. The general settings page
(FR-019) displays the slug as a read-only field. Only the tenant display
name is editable. This prevents cascading changes to:

- PostgreSQL schema name (`tenant_<slug>`)
- Keycloak realm name
- MinIO bucket names
- All tenant-scoped URLs

#### DR-08: Audit Log Scope

The audit log captures **all write operations and authentication events**:

| Category        | Events Audited                                                   |
| --------------- | ---------------------------------------------------------------- |
| Authentication  | Login, logout, failed login attempt, password change, MFA events |
| Workspace       | Create, update, delete, archive, restore, reparent               |
| Membership      | User added, removed, role changed                                |
| Invitation      | Invite sent, accepted, expired, re-sent                          |
| Tenant Settings | Name changed, branding updated, auth config changed              |
| User Profile    | Profile updated, avatar changed                                  |

Each audit entry includes: timestamp, actor (user ID), action type, target
resource (type + ID), before/after values (for updates), and IP address.
PII is excluded per Constitution §Security-6 — no email addresses, names,
or other personally identifiable data in audit entries.

#### DR-09: ABAC Decision Log Storage

ABAC decision logs are stored in a dedicated `abac_decision_log` table
within each tenant's schema:

- **INFO level**: Logs decision outcome, user ID (no PII per Constitution
  §Security-6), resource, and action (sampled at 10% in production for
  high-traffic tenants).
- **DEBUG level**: Logs full evaluation tree including all rules evaluated,
  conditions checked, and intermediate results. No PII in any log level.
- **TTL rotation**: 30-day retention at INFO level, 7-day retention at
  DEBUG level. A scheduled job purges expired entries.
- **Query performance**: Indexed on (timestamp, user_id, action, decision)
  to meet NFR-08 (< 500ms for 30-day filtered queries).

#### DR-10: User Profile Fields

The user profile includes:

| Field                    | Type         | Editable | Synced to Keycloak           |
| ------------------------ | ------------ | -------- | ---------------------------- |
| Display name             | string       | Yes      | Yes                          |
| Avatar                   | image upload | Yes      | No (stored in MinIO)         |
| Timezone                 | select       | Yes      | Yes (user attribute)         |
| Language preference      | select       | Yes      | Yes (user attribute)         |
| Email notification prefs | toggles      | Yes      | No (stored in tenant schema) |

- Avatar uploads are stored in MinIO in the tenant's bucket, path:
  `avatars/<user-id>.<ext>`.
- Avatar max size: 1MB, accepted formats: JPEG, PNG, WebP.
- Language preference determines the react-intl locale for the UI.
- Notification settings are per event type (invite received, workspace
  changes, role changes) with email on/off toggles.

#### DR-11: Auth Realm Configuration

Tenant admins can manage their Keycloak realm settings from the Plexica UI
via the Keycloak Admin API:

| Setting            | Capability                                               |
| ------------------ | -------------------------------------------------------- |
| MFA policy         | Toggle MFA on/off for the realm; choose TOTP or WebAuthn |
| Identity providers | Add/remove SAML and OIDC identity providers              |
| Password policy    | Set minimum length, complexity, and expiry requirements  |
| Session settings   | Configure session timeout and idle timeout               |

- All changes are applied via the Keycloak Admin API using the platform's
  service account credentials.
- Changes are audited (see DR-08).
- A validation step previews changes before applying to prevent lockout
  (e.g., warn if disabling all login methods).

#### DR-13: Role Management Screen

Defines the tenant-level screen for viewing the RBAC role model
(Tenant Settings → Roles & Permissions). Access is restricted to Tenant Admin.

**Screen sections:**

1. **Built-in Roles Overview** — card grid, one card per built-in role:

   | Card field   | Content                                                   |
   | ------------ | --------------------------------------------------------- |
   | Role name    | Display name (e.g., "Workspace Admin")                    |
   | Scope badge  | "Tenant" or "Workspace"                                   |
   | Description  | Role description from DR-04                               |
   | Member count | Number of users currently holding this role (tenant-wide) |

   All cards are read-only. The "Add custom role" action is not exposed
   (custom role creation is out of scope — see Section 10).

2. **Action Matrix** — collapsible table, collapsed by default:
   - Columns: Tenant Admin, Workspace Admin, Workspace Member, Workspace Viewer
   - Rows: all actions from DR-04, grouped by resource category
     (workspace, content, member, settings, invitation)
   - Cells: ✓ (allowed) / ✗ (denied) / — (not workspace-scoped)
   - A "Copy as CSV" button exports the matrix for compliance documentation.

3. **Role Assignment Summary** — informational read-only panel:
   - Shows total number of users per role across all workspaces.
   - Each row links to the corresponding workspace member list for drill-down.

**Navigation path:** Tenant Settings → Roles & Permissions

**Access control:** Tenant Admin only. Workspace-level roles do not have
access to this screen; direct URL navigation returns 403.

**Empty state:** If no workspace exists, the Role Assignment Summary shows
"No workspaces yet. Create a workspace to start assigning roles."

#### DR-14: Permission Association Screen

Defines the workspace-level permissions panel
(Workspace Settings → Permissions). This screen gives workspace admins a
consolidated view of who can do what in their workspace, and allows inline
role reassignment.

**Screen sections:**

1. **Core Permissions** — read-only table:
   - Mirrors the DR-04 action matrix, filtered to workspace-scoped actions only.
   - Columns: Workspace Admin, Workspace Member, Workspace Viewer.
   - Clearly labelled "Platform Defaults — Cannot Be Changed".
   - Grouped by resource category (workspace, content, member, settings,
     invitation).

2. **Member Role Overview** — interactive table:

   | Column        | Content                                                                  |
   | ------------- | ------------------------------------------------------------------------ |
   | User          | Avatar + display name (no email — PII per §Security-6)                   |
   | Current role  | Role badge (Admin / Member / Viewer)                                     |
   | Role selector | Inline dropdown to change role; triggers `member:role-change` ABAC check |
   | Joined        | Relative date (e.g., "3 days ago")                                       |
   - Role changes take effect immediately on confirm.
   - Changing one's own role requires a confirmation dialog: "You are
     changing your own role. This may remove your admin access."
   - Consistent with FR-012 (RBAC role assignment).

3. **Plugin Permissions** — conditionally shown when plugins are installed:
   - One collapsible section per plugin installed for this workspace.
   - Each section lists the plugin's declared actions with the current
     required role and a role-override dropdown (Admin / Member / Viewer).
   - A "Reset to defaults" button restores all overrides for that plugin
     to the `default_role` values from the manifest.
   - Hidden entirely when no plugins are installed (no empty placeholder).
   - Full implementation specification in Spec 004, DR-12.

**Navigation path:** Workspace Settings → Permissions

**Access control:** Workspace Admin and Tenant Admin (by inheritance).
Workspace Member and Viewer do not have access.

**Empty state (members):** "No members yet. Invite team members to get
started."

**Dependency:** The Plugin Permissions sub-section requires Spec 004 to be
implemented. It is rendered conditionally; no stub is shown when no plugins
are installed for the workspace.

## 5. Non-Functional Requirements

| ID     | Category    | Requirement                                 | Target                                  |
| ------ | ----------- | ------------------------------------------- | --------------------------------------- |
| NFR-01 | Performance | ABAC condition tree evaluation              | < 50ms (P95)                            |
| NFR-02 | Performance | Workspace list API response                 | < 200ms (P95)                           |
| NFR-03 | Performance | Audit log query (last 30 days, filtered)    | < 500ms (P95)                           |
| NFR-04 | Performance | User invitation email delivery (Mailpit)    | < 5s                                    |
| NFR-05 | Scalability | Materialized path depth support             | Up to 10 levels                         |
| NFR-06 | Performance | Concurrent ABAC evaluations (no contention) | 100 req/s                               |
| NFR-07 | Limits      | Branding asset upload (logo)                | < 2MB, < 3s                             |
| NFR-08 | Performance | ABAC decision log query (30-day window)     | < 500ms (P95)                           |
| NFR-09 | Limits      | Avatar upload (user profile)                | < 1MB, JPEG/PNG/WebP                    |
| NFR-10 | Performance | Workspace reparent path recalculation       | < 200ms (P95) for trees up to 10 levels |
| NFR-11 | Retention   | Archived workspace hard-delete retention    | 30 days                                 |
| NFR-12 | Retention   | Soft-deleted user profile retention         | 90 days                                 |
| NFR-13 | Security    | Invite expiry period                        | 7 days                                  |
| NFR-14 | A11y        | All UI screens WCAG 2.1 AA compliant        | Per Constitution                        |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                           | Expected Behavior                                                                     |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Admin deletes parent workspace with 3 levels of children           | Confirmation dialog lists all descendants; all are soft-deleted on confirm            |
| 2   | Admin reparents workspace creating a cycle (A→B→C, move A under C) | API returns 400 with error "circular reference detected"                              |
| 3   | Admin reparents workspace exceeding 10-level depth limit           | API returns 400 with error "maximum hierarchy depth exceeded"                         |
| 4   | Admin invites email already in tenant                              | Autocomplete shows existing user; no duplicate invite sent                            |
| 5   | Invited user clicks expired invite link (>7 days)                  | Shown "invite expired" page with option to request re-invite                          |
| 6   | Admin removes user who owns resources in 3 workspaces              | Reassignment dialog shown per workspace; all resources transferred before removal     |
| 7   | Admin disables all auth methods in realm config                    | Validation preview warns of lockout; save is blocked unless at least 1 method remains |
| 8   | User uploads avatar >1MB                                           | Upload rejected with "file too large" error before transfer                           |
| 9   | User uploads avatar in unsupported format (GIF, BMP)               | Upload rejected with "unsupported format" error listing accepted formats              |
| 10  | Branding logo upload >2MB                                          | Upload rejected with "file too large" error                                           |
| 11  | ABAC decision log table grows beyond TTL retention                 | Scheduled job purges entries older than 30d (INFO) / 7d (DEBUG)                       |
| 12  | Workspace template references deleted child structure              | Stale template warning shown; template validated and updated on instantiation         |
| 13  | Admin restores archived workspace after 30-day window              | Workspace is already hard-deleted; restore returns 404                                |
| 14  | Two admins concurrently edit same workspace settings               | Last-write-wins with optimistic concurrency (ETag / version field)                    |
| 15  | Admin assigns same user to workspace twice                         | API returns 409 "user already a member"; idempotent add if same role                  |

## 7. Data Requirements

### New Entities (in tenant schema)

- **workspace**: id, name, slug, description, parent_id, materialized_path,
  status (active/archived), archived_at, template_id, created_by,
  created_at, updated_at, version
- **workspace_member**: workspace_id, user_id, role (admin/member/viewer),
  created_at
- **workspace_template**: id, name, description, structure (JSONB — child
  workspace definitions), is_builtin, tenant_id, created_by, version,
  created_at, updated_at
- **invitation**: id, email, workspace_id, role, status (pending/accepted/
  expired), invited_by, expires_at, accepted_at, created_at
- **audit_log**: id, actor_id, action_type, target_type, target_id,
  before_value (JSONB), after_value (JSONB), ip_address, created_at
- **abac_decision_log**: id, user_id, resource_type, resource_id, action,
  decision (allow/deny), rules_evaluated (JSONB), log_level, created_at
- **user_profile**: user_id, display_name, avatar_path, timezone,
  language, notification_prefs (JSONB), deleted_at, created_at, updated_at
- **tenant_branding**: tenant_id, logo_path, primary_color, dark_mode,
  updated_at
- **action_registry**: id, plugin_id (FK → core plugin table), action_key
  (unique per plugin, format `{plugin-slug}:{resource}:{verb}`),
  label_i18n_key, description, default_role ('admin'|'member'|'viewer'),
  created_at
- **workspace_role_action**: workspace_id (FK → workspace), plugin_id,
  action_key, required_role ('admin'|'member'|'viewer'),
  is_overridden (bool — false = still at default_role), created_at, updated_at

## 8. Acceptance Criteria (Given/When/Then)

### AC-01: Workspace CRUD & Hierarchy

**Given** a tenant admin is logged in,
**When** they create a workspace (optionally as a child of an existing workspace),
**Then** the workspace appears in the workspace list with correct hierarchy.

**Given** a parent workspace with children exists,
**When** the admin deletes the parent workspace,
**Then** the parent and all children are soft-deleted (archived) and hidden
from the list, with a confirmation dialog listing all affected workspaces.

**Given** an archived workspace within the 30-day retention window,
**When** the admin restores the workspace,
**Then** the workspace and its children reappear in the list at their
original hierarchy position.

### AC-02: Workspace Reparenting

**Given** workspace C is a child of workspace A,
**When** the admin moves workspace C under workspace B,
**Then** the materialized path is recalculated for C and all its descendants,
and the sidebar navigation reflects the new hierarchy.

**Given** workspace A has children nested 9 levels deep,
**When** the admin attempts to move workspace A under a workspace at depth 1,
**Then** the operation is rejected because it would exceed the 10-level depth
limit.

### AC-03: Workspace Templates

**Given** a tenant admin is on the workspace creation page,
**When** they select a template (built-in or custom),
**Then** a workspace is created with the template's name, description, default
roles, and child workspace structure.

### AC-04: User Invitation

**Given** a tenant admin is in the workspace member management UI,
**When** they search for an existing tenant user by name or email,
**Then** matching users are shown in an autocomplete dropdown and can be added
directly.

**Given** the admin enters an email not belonging to any existing tenant user,
**When** they send the invitation,
**Then** an invitation email is delivered (verified via Mailpit in tests), and
the invite appears in the pending invitations list.

**Given** an invitation was sent 8 days ago,
**When** the invited user clicks the link,
**Then** the invitation is rejected as expired, and the admin can re-send it.

### AC-05: RBAC Permissions

**Given** a user with the Viewer role in workspace A,
**When** they attempt to create content in workspace A,
**Then** the API returns 403 Forbidden.

**Given** a user with the Member role in workspace A,
**When** they attempt to manage workspace members,
**Then** the API returns 403 Forbidden.

**Given** a user with the Admin role in workspace A,
**When** they manage members, edit settings, and create content,
**Then** all operations succeed.

### AC-06: ABAC Workspace Isolation

**Given** a user has the Member role in workspace A but no role in workspace B,
**When** they request resources from workspace B,
**Then** the API returns 403 or 404 (workspace B resources are invisible).

### AC-07: ABAC Decision Logging

**Given** any authorization check is evaluated,
**When** the ABAC engine makes a decision,
**Then** the decision is logged to the `abac_decision_log` table with user ID,
resource, action, rules evaluated, and decision outcome.

### AC-08: User Removal

**Given** a tenant admin removes a user who created content in workspace A,
**When** they choose to reassign resources to a specific workspace member,
**Then** all resources are reassigned, the user's sessions are terminated
immediately, and the profile is soft-deleted.

### AC-09: Tenant Settings

**Given** a tenant admin opens the general settings page,
**When** they view the settings form,
**Then** the tenant slug is displayed as read-only and the display name is
editable.

### AC-10: Branding

**Given** a tenant admin uploads a logo and changes the primary color,
**When** they save the branding settings,
**Then** the UI immediately reflects the new logo and color scheme without a
page reload.

### AC-11: Audit Log

**Given** a tenant admin opens the audit log page,
**When** they filter by action type "membership" and date range "last 7 days",
**Then** only membership-related events within that range are displayed,
ordered by most recent first.

### AC-12: Auth Realm Configuration

**Given** a tenant admin opens the auth realm settings,
**When** they enable MFA with TOTP for their realm,
**Then** the Keycloak realm is updated via the Admin API, and all tenant users
are required to set up TOTP on next login.

### AC-13: User Profile

**Given** a user opens their profile page,
**When** they update their display name, upload an avatar, and change their
timezone,
**Then** the changes are saved and reflected across the UI, with the display
name synced to Keycloak.

### AC-14: WCAG 2.1 AA Compliance

**Given** any UI screen introduced in this spec (workspace list, settings,
profile, audit log, member management, invite flow),
**Then** the screen meets WCAG 2.1 AA standards: keyboard navigable, screen-
reader compatible, color contrast ratio >= 4.5:1, focus indicators visible.

### AC-15: Role Management Screen

**Given** a tenant admin opens Tenant Settings → Roles & Permissions,
**When** the page loads,
**Then** all four built-in roles are displayed as cards with their name, scope
badge, description, and current member count.

**Given** the tenant admin expands the Action Matrix section,
**When** they view the table,
**Then** all actions from DR-04 are listed with correct ✓ / ✗ / — indicators
for each role column, grouped by resource category.

**Given** a user with the Workspace Member role navigates directly to the
Roles & Permissions URL,
**When** the request is received,
**Then** the server returns 403 Forbidden.

### AC-16: Permission Association Screen

**Given** a workspace admin opens Workspace Settings → Permissions,
**When** the page loads,
**Then** the Core Permissions table is displayed as read-only and the Member
Role Overview table lists all workspace members with their current roles.

**Given** a workspace admin changes a member's role from Member to Viewer via
the inline dropdown and confirms,
**When** the change is saved,
**Then** the role is updated immediately, the ABAC engine enforces the new role
on the next request from that user, and the change is recorded in the audit log.

**Given** no plugins are installed for the workspace,
**When** the workspace admin views the Permissions screen,
**Then** the Plugin Permissions section is not shown (no empty placeholder).

## 9. UX/UI Notes

- All screens must meet WCAG 2.1 AA (see NFR-14 and AC-14).
- Workspace hierarchy is displayed in a collapsible sidebar tree.
- Invite flow uses a search-first pattern (autocomplete for existing users,
  email input for new users) — not a simple email-only form.
- Delete and remove operations require confirmation dialogs (per AGENTS.md:
  no `window.confirm()`; use Dialog component from design system).
- Branding changes apply immediately via CSS custom properties (no reload).
- Audit log uses a filterable table with pagination.
- All forms use react-hook-form + Zod (per Constitution Rule 3).
- All strings via react-intl (per Constitution Rule 3).
- **Role Management Screen** (DR-13): card grid + collapsible action matrix
  table. Read-only; no edit actions on built-in roles.
- **Permission Association Screen** (DR-14): two-panel layout — read-only
  Core Permissions table on the left, interactive Member Role Overview on the
  right. Inline role selector uses a Radix UI Select component. Plugin
  Permissions section is conditionally rendered (requires Spec 004).

## 10. Out of Scope

- **Custom role creation UI** — the data model supports custom roles, but
  the admin UI for defining and managing custom roles (beyond the three fixed
  workspace-level roles) is deferred to a future spec. Plugin action role
  assignment UI (FR-023) is in scope; its detailed implementation contract
  (DR-12) is defined in Spec 004.
- **Plugin manifest authoring / plugin installation flow** — the plugin
  system and manifest format are specified in Spec 004. This spec defines
  the RBAC contract (DR-12) that Spec 004 must satisfy.
- **Tenant slug change** — tenant slug is immutable; no migration tooling.
- **Bulk user import** — importing users from CSV/LDAP is deferred.
- **Advanced audit log analytics** — export, dashboards, and alerting are
  deferred.
- **Cross-tenant user sharing** — users are isolated per tenant realm.

## 11. Open Questions

No open questions. All ambiguities resolved during `/forge-clarify` session
on 2026-04-03.

## 12. Risks

| ID   | Risk                                                                   | Impact | Likelihood | Mitigation                                                                                            |
| ---- | ---------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| R-01 | ABAC performance with deep workspace hierarchies                       | HIGH   | MEDIUM     | Redis caching of flattened permission sets, benchmark at 10 levels                                    |
| R-02 | Materialized path corruption on workspace reparent                     | HIGH   | LOW        | Wrap reparent in transaction, recalculate all descendant paths, validate no cycles                    |
| R-03 | Keycloak user federation sync lag                                      | MEDIUM | MEDIUM     | Webhook-based sync + periodic reconciliation job                                                      |
| R-04 | Email delivery reliability in CI (Mailpit flakiness)                   | LOW    | LOW        | Retry with polling, increase Playwright timeout for email checks                                      |
| R-05 | ABAC decision log volume in high-traffic tenants                       | MEDIUM | HIGH       | 10% sampling at INFO, full at DEBUG, TTL-based rotation (30d/7d)                                      |
| R-06 | Workspace template schema evolution (stale templates)                  | LOW    | MEDIUM     | Version templates, validate against current schema on instantiation                                   |
| R-07 | Keycloak Admin API rate limits for realm configuration                 | MEDIUM | LOW        | Cache realm config reads, debounce writes, queue concurrent changes                                   |
| R-08 | Lockout risk when admin misconfigures auth realm                       | HIGH   | LOW        | Validation preview before applying; warn if disabling all login methods                               |
| R-09 | Plugin action namespace conflict (two plugins declare same action key) | MEDIUM | LOW        | Manifest validation at install time rejects conflicting keys; registry enforces uniqueness per tenant |

## 13. Constitution Compliance

| Article           | Status    | Notes                                                                         |
| ----------------- | --------- | ----------------------------------------------------------------------------- |
| Rule 1 (E2E)      | COMPLIANT | Every FR has a defined E2E test                                               |
| Rule 2 (CI)       | COMPLIANT | All tests required green before merge                                         |
| Rule 3 (Patterns) | COMPLIANT | TanStack Query, react-hook-form + Zod, Zustand, react-intl, Lucide            |
| Rule 4 (200 LOC)  | COMPLIANT | Applies at implementation; spec does not violate                              |
| Rule 5 (ADRs)     | COMPLIANT | FR-022 (Keycloak Admin API) covered by ADR-011 (accepted April 2026)          |
| Rule 6 (English)  | COMPLIANT | Applies to commits; noted for implementation phase                            |
| Tech Stack        | COMPLIANT | All technologies from prescribed stack                                        |
| Architecture      | COMPLIANT | Schema-per-tenant, Keycloak multi-realm, ABAC tree-walk                       |
| Security          | COMPLIANT | Tenant isolation, auth on all endpoints, no PII in logs, Zod input validation |
| Quality           | COMPLIANT | NFRs have measurable targets; WCAG 2.1 AA included                            |

**Action Required**: ~~Create ADR-010 (Keycloak Admin API Integration) before
implementing FR-022. Per Constitution Rule 5, auth changes require an ADR.~~
**Resolved**: ADR-011 (Keycloak Admin API Integration for Tenant Auth Configuration)
was accepted April 2026. No further action required.

---

## Cross-References

| Document     | Path                                     |
| ------------ | ---------------------------------------- |
| Constitution | `.forge/constitution.md`                 |
| Spec 002     | `.forge/specs/002-foundations/spec.md`   |
| Spec 004     | `.forge/specs/004-plugin-system/spec.md` |
| Decision Log | `.forge/knowledge/decision-log.md`       |
| Plan         | `.forge/specs/003-core-features/plan.md` |
| Tasks        | <!-- Created by /forge-tasks -->         |
