# Plan: 003 — Core Features

> Technical implementation plan for the Feature track.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Phase 3 of 3 — COMPLETE                  |
| Author | forge-architect                          |
| Date   | 2026-04-06                               |
| Track  | Feature                                  |
| Spec   | `.forge/specs/003-core-features/spec.md` |

---

## 1. Overview

This plan covers the implementation of Plexica v2 Phase 2 — Core Features,
built on top of the authenticated, tenant-isolated foundation delivered in
Spec 002. The scope includes:

- **Workspace management** with parent/child hierarchy (materialized path),
  soft-delete/restore, reparenting, and templates (FR-001 through FR-009)
- **Users, roles & ABAC** — tenant user list, email invitations, RBAC role
  assignment, ABAC workspace isolation with decision logging, user removal
  with resource reassignment (FR-010 through FR-018, FR-023 through FR-026)
- **Tenant settings** — general settings, branding (logo + colors), audit
  log, auth realm configuration via Keycloak Admin API (FR-019 through FR-022)
- **User profile** — display name, avatar (MinIO), timezone, language,
  notification preferences (FR-017, covered within FR-010–FR-018 group)

After this phase, the platform is a functional multi-tenant collaboration
tool with workspace hierarchy, team collaboration, and operational visibility.

**Dependencies**: Spec 002 (Foundations) — auth middleware, tenant context,
schema-per-tenant, Keycloak multi-realm, error handling framework.

**Key ADRs**: ADR-001 (schema-per-tenant), ADR-002 (Keycloak multi-realm),
ADR-003 (ABAC tree-walk), ADR-010 (Keycloakify), ADR-011 (Keycloak Admin
API), ADR-012 (rate limiting).

---

## 2. Requirements Summary

### 2.1 Functional Requirements

| ID     | Description                               | Priority | Story Ref | Section |
| ------ | ----------------------------------------- | -------- | --------- | ------- |
| FR-001 | Workspace list                            | Must     | US-001    | 4.1     |
| FR-002 | Create workspace                          | Must     | US-001    | 4.1     |
| FR-003 | Workspace detail with navigation          | Must     | US-001    | 4.1     |
| FR-004 | Workspace hierarchy (materialized path)   | Must     | US-001    | 4.1     |
| FR-005 | Workspace members                         | Must     | US-002    | 4.1     |
| FR-006 | Workspace settings                        | Must     | US-001    | 4.1     |
| FR-007 | Delete workspace (soft-delete)            | Must     | US-001    | 4.1     |
| FR-008 | Workspace templates                       | Should   | US-001    | 4.1     |
| FR-009 | Reparent workspace                        | Should   | US-001    | 4.1     |
| FR-010 | Tenant user list                          | Must     | US-002    | 4.2     |
| FR-011 | Invite user via email                     | Must     | US-002    | 4.2     |
| FR-012 | RBAC role assignment                      | Must     | US-002    | 4.2     |
| FR-013 | ABAC workspace isolation                  | Must     | US-003    | 4.2     |
| FR-014 | ABAC condition tree                       | Must     | US-003    | 4.2     |
| FR-015 | ABAC decision logging                     | Must     | US-003    | 4.2     |
| FR-016 | Remove user                               | Must     | US-002    | 4.2     |
| FR-017 | User profile                              | Must     | US-007    | 4.2     |
| FR-018 | End-to-end permission check               | Must     | US-003    | 4.2     |
| FR-019 | General settings page                     | Must     | US-004    | 4.3     |
| FR-020 | Branding (logo, primary color, dark mode) | Must     | US-004    | 4.3     |
| FR-021 | Audit log                                 | Must     | US-005    | 4.3     |
| FR-022 | Auth realm configuration                  | Should   | US-006    | 4.3     |
| FR-023 | Plugin action role assignment UI          | Must     | US-003    | 4.2     |
| FR-024 | Plugin action ABAC enforcement            | Must     | US-003    | 4.2     |
| FR-025 | Role management screen                    | Must     | US-002    | 4.2     |
| FR-026 | Workspace permission association          | Must     | US-002    | 4.2     |

### 2.2 Non-Functional Requirements

| ID     | Category    | Requirement                              | Target                      |
| ------ | ----------- | ---------------------------------------- | --------------------------- |
| NFR-01 | Performance | ABAC condition tree evaluation           | < 50ms (P95)                |
| NFR-02 | Performance | Workspace list API response              | < 200ms (P95)               |
| NFR-03 | Performance | Audit log query (30 days, filtered)      | < 500ms (P95)               |
| NFR-04 | Performance | User invitation email delivery           | < 5s                        |
| NFR-05 | Scalability | Materialized path depth support          | Up to 10 levels             |
| NFR-06 | Performance | Concurrent ABAC evaluations              | 100 req/s                   |
| NFR-07 | Limits      | Branding asset upload (logo)             | < 2MB, < 3s                 |
| NFR-08 | Performance | ABAC decision log query (30-day window)  | < 500ms (P95)               |
| NFR-09 | Limits      | Avatar upload (user profile)             | < 1MB, JPEG/PNG/WebP        |
| NFR-10 | Performance | Workspace reparent path recalculation    | < 200ms (P95) for 10 levels |
| NFR-11 | Retention   | Archived workspace hard-delete retention | 30 days                     |
| NFR-12 | Retention   | Soft-deleted user profile retention      | 90 days                     |
| NFR-13 | Security    | Invite expiry period                     | 7 days                      |
| NFR-14 | A11y        | All UI screens WCAG 2.1 AA               | Per Constitution            |

### 2.3 Acceptance Criteria

| ID    | Summary                                                                                 | FR Ref         |
| ----- | --------------------------------------------------------------------------------------- | -------------- |
| AC-01 | Workspace CRUD & hierarchy: create, soft-delete with children, restore within 30 days   | FR-001–FR-007  |
| AC-02 | Workspace reparenting: path recalc, cycle rejection, depth limit enforcement            | FR-009         |
| AC-03 | Workspace templates: select template on create, structure instantiated                  | FR-008         |
| AC-04 | User invitation: autocomplete existing, email for new, expired invite rejection/resend  | FR-011         |
| AC-05 | RBAC permissions: Viewer denied create, Member denied manage, Admin succeeds all        | FR-012, FR-018 |
| AC-06 | ABAC workspace isolation: no cross-workspace access without explicit role               | FR-013         |
| AC-07 | ABAC decision logging: every evaluation logged with context                             | FR-015         |
| AC-08 | User removal: resource reassignment, session termination, profile soft-delete           | FR-016         |
| AC-09 | Tenant settings: slug read-only, display name editable                                  | FR-019         |
| AC-10 | Branding: logo + color applied immediately without page reload                          | FR-020         |
| AC-11 | Audit log: filterable by action type and date range, most recent first                  | FR-021         |
| AC-12 | Auth realm configuration: MFA toggle via Keycloak Admin API                             | FR-022         |
| AC-13 | User profile: display name synced to Keycloak, avatar in MinIO, immediate UI update     | FR-017         |
| AC-14 | WCAG 2.1 AA: all screens keyboard-navigable, screen-reader compatible, contrast ≥ 4.5:1 | NFR-14         |
| AC-15 | Role management screen: built-in role cards, action matrix, 403 for non-admin           | FR-025         |
| AC-16 | Permission association: core perms read-only, member role overview with inline selector | FR-026         |

---

## 3. Data Model

### 3.1 New Tables (tenant schema)

All tables below are created in `tenant_{slug}` schema. They are applied
when a new tenant is provisioned (via `prisma migrate deploy` on the tenant
schema) and when existing tenants run the `migrateAll()` routine.

#### `workspace`

Implements: FR-001, FR-002, FR-003, FR-004, FR-006, FR-007, FR-009, DR-01, DR-02

| Column            | Type         | Nullable | Default             | Constraints                           |
| ----------------- | ------------ | -------- | ------------------- | ------------------------------------- |
| id                | UUID         | No       | `gen_random_uuid()` | PK                                    |
| name              | VARCHAR(255) | No       | —                   |                                       |
| slug              | VARCHAR(63)  | No       | —                   | UNIQUE within tenant schema           |
| description       | TEXT         | Yes      | `NULL`              |                                       |
| parent_id         | UUID         | Yes      | `NULL`              | FK → workspace(id) ON DELETE SET NULL |
| materialized_path | TEXT         | No       | `'/'`               |                                       |
| status            | VARCHAR(16)  | No       | `'active'`          | CHECK IN ('active', 'archived')       |
| archived_at       | TIMESTAMPTZ  | Yes      | `NULL`              | Set when status → 'archived'          |
| template_id       | UUID         | Yes      | `NULL`              | FK → workspace_template(id)           |
| created_by        | UUID         | No       | —                   | FK → user_profile(user_id)            |
| version           | INTEGER      | No       | `1`                 | Optimistic concurrency (ETag)         |
| created_at        | TIMESTAMPTZ  | No       | `now()`             |                                       |
| updated_at        | TIMESTAMPTZ  | No       | `now()`             |                                       |

**Indexes:**

| Name                              | Columns             | Type   | Purpose                                  |
| --------------------------------- | ------------------- | ------ | ---------------------------------------- |
| `workspace_pkey`                  | `id`                | PK     | Primary key                              |
| `workspace_slug_key`              | `slug`              | UNIQUE | Lookup by slug                           |
| `workspace_parent_id_idx`         | `parent_id`         | BTREE  | Hierarchy traversal                      |
| `workspace_materialized_path_idx` | `materialized_path` | BTREE  | Path-based subtree queries (LIKE prefix) |
| `workspace_status_idx`            | `status`            | BTREE  | Filter active vs archived                |
| `workspace_created_by_idx`        | `created_by`        | BTREE  | User's created workspaces                |

**Notes:**

- `materialized_path` format: `/<root-id>/<parent-id>/<this-id>` (trailing
  slash omitted). Max depth 10 levels enforced at application layer.
- `parent_id` uses `ON DELETE SET NULL` — parent deletion does not cascade;
  soft-delete logic archives the entire subtree in application code (DR-01).
- `version` field supports optimistic concurrency (Edge Case #14). Clients
  send `If-Match` header; API returns 409 on version mismatch.

---

#### `workspace_member`

Implements: FR-005, FR-012, FR-026, DR-04

| Column       | Type        | Nullable | Default             | Constraints                            |
| ------------ | ----------- | -------- | ------------------- | -------------------------------------- |
| id           | UUID        | No       | `gen_random_uuid()` | PK                                     |
| workspace_id | UUID        | No       | —                   | FK → workspace(id) ON DELETE CASCADE   |
| user_id      | UUID        | No       | —                   | FK → user_profile(user_id)             |
| role         | VARCHAR(32) | No       | —                   | CHECK IN ('admin', 'member', 'viewer') |
| created_at   | TIMESTAMPTZ | No       | `now()`             |                                        |

**Indexes:**

| Name                                | Columns                   | Type   | Purpose                        |
| ----------------------------------- | ------------------------- | ------ | ------------------------------ |
| `workspace_member_pkey`             | `id`                      | PK     | Primary key                    |
| `workspace_member_ws_user_key`      | `(workspace_id, user_id)` | UNIQUE | No duplicate memberships       |
| `workspace_member_user_id_idx`      | `user_id`                 | BTREE  | User's workspace list (FR-001) |
| `workspace_member_workspace_id_idx` | `workspace_id`            | BTREE  | Workspace member list (FR-005) |

---

#### `workspace_template`

Implements: FR-008, DR-03

| Column      | Type         | Nullable | Default             | Constraints          |
| ----------- | ------------ | -------- | ------------------- | -------------------- |
| id          | UUID         | No       | `gen_random_uuid()` | PK                   |
| name        | VARCHAR(255) | No       | —                   |                      |
| description | TEXT         | Yes      | `NULL`              |                      |
| structure   | JSONB        | No       | `'[]'`              | Child workspace defs |
| is_builtin  | BOOLEAN      | No       | `false`             |                      |
| created_by  | UUID         | Yes      | `NULL`              | NULL for built-in    |
| version     | INTEGER      | No       | `1`                 | Template versioning  |
| created_at  | TIMESTAMPTZ  | No       | `now()`             |                      |
| updated_at  | TIMESTAMPTZ  | No       | `now()`             |                      |

**`structure` JSONB format:**

```json
[
  {
    "name": "Frontend Team",
    "description": "Frontend development workspace",
    "defaultRoles": { "creator": "admin" }
  },
  {
    "name": "Backend Team",
    "description": "Backend development workspace",
    "defaultRoles": { "creator": "admin" }
  }
]
```

**Indexes:**

| Name                         | Columns      | Type  | Purpose         |
| ---------------------------- | ------------ | ----- | --------------- |
| `workspace_template_pkey`    | `id`         | PK    | Primary key     |
| `workspace_template_builtin` | `is_builtin` | BTREE | Filter built-in |

---

#### `invitation`

Implements: FR-011, DR-05, NFR-13

| Column       | Type         | Nullable | Default             | Constraints                                 |
| ------------ | ------------ | -------- | ------------------- | ------------------------------------------- |
| id           | UUID         | No       | `gen_random_uuid()` | PK                                          |
| email        | VARCHAR(255) | No       | —                   |                                             |
| workspace_id | UUID         | No       | —                   | FK → workspace(id) ON DELETE CASCADE        |
| role         | VARCHAR(32)  | No       | —                   | CHECK IN ('admin', 'member', 'viewer')      |
| status       | VARCHAR(16)  | No       | `'pending'`         | CHECK IN ('pending', 'accepted', 'expired') |
| invited_by   | UUID         | No       | —                   | FK → user_profile(user_id)                  |
| token        | VARCHAR(255) | No       | —                   | UNIQUE, secure random                       |
| expires_at   | TIMESTAMPTZ  | No       | —                   | `now() + interval '7 days'`                 |
| accepted_at  | TIMESTAMPTZ  | Yes      | `NULL`              |                                             |
| created_at   | TIMESTAMPTZ  | No       | `now()`             |                                             |

**Indexes:**

| Name                        | Columns                 | Type   | Purpose                       |
| --------------------------- | ----------------------- | ------ | ----------------------------- |
| `invitation_pkey`           | `id`                    | PK     | Primary key                   |
| `invitation_token_key`      | `token`                 | UNIQUE | Accept via token              |
| `invitation_workspace_idx`  | `workspace_id`          | BTREE  | Pending invites per workspace |
| `invitation_email_ws_idx`   | `(email, workspace_id)` | BTREE  | Duplicate prevention          |
| `invitation_status_idx`     | `status`                | BTREE  | Filter pending/expired        |
| `invitation_expires_at_idx` | `expires_at`            | BTREE  | Expiry cleanup job            |

**Notes:**

- `email` is stored here for invitation tracking but is **never** returned in
  API responses to non-admin users or logged (Constitution §Security-6).
- The `token` column stores a cryptographically random invite token used in
  the invitation link. It is NOT the same as the JWT auth token.

---

#### `audit_log`

Implements: FR-021, DR-08

| Column       | Type        | Nullable | Default             | Constraints |
| ------------ | ----------- | -------- | ------------------- | ----------- |
| id           | UUID        | No       | `gen_random_uuid()` | PK          |
| actor_id     | UUID        | No       | —                   |             |
| action_type  | VARCHAR(63) | No       | —                   |             |
| target_type  | VARCHAR(63) | No       | —                   |             |
| target_id    | UUID        | Yes      | `NULL`              |             |
| before_value | JSONB       | Yes      | `NULL`              |             |
| after_value  | JSONB       | Yes      | `NULL`              |             |
| ip_address   | INET        | Yes      | `NULL`              |             |
| created_at   | TIMESTAMPTZ | No       | `now()`             |             |

**Action types** (from DR-08):

| Category        | Action Types                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Authentication  | `auth.login`, `auth.logout`, `auth.failed_login`, `auth.password_change`, `auth.mfa_event`                                 |
| Workspace       | `workspace.create`, `workspace.update`, `workspace.delete`, `workspace.archive`, `workspace.restore`, `workspace.reparent` |
| Membership      | `member.add`, `member.remove`, `member.role_change`                                                                        |
| Invitation      | `invitation.send`, `invitation.accept`, `invitation.expire`, `invitation.resend`                                           |
| Tenant Settings | `settings.name_change`, `settings.branding_update`, `settings.auth_config_change`                                          |
| User Profile    | `profile.update`, `profile.avatar_change`                                                                                  |

**Indexes:**

| Name                        | Columns                     | Type  | Purpose                     |
| --------------------------- | --------------------------- | ----- | --------------------------- |
| `audit_log_pkey`            | `id`                        | PK    | Primary key                 |
| `audit_log_created_at_idx`  | `created_at`                | BTREE | Time-range queries (NFR-03) |
| `audit_log_action_type_idx` | `action_type`               | BTREE | Filter by action            |
| `audit_log_actor_id_idx`    | `actor_id`                  | BTREE | Filter by user              |
| `audit_log_target_idx`      | `(target_type, target_id)`  | BTREE | Resource history            |
| `audit_log_composite_idx`   | `(created_at, action_type)` | BTREE | Combined filter (NFR-03)    |

**Notes:**

- No PII in `before_value` / `after_value` — store only structural data
  (IDs, role names, settings values). Never email, name, or IP-to-name mappings.
- `ip_address` is stored as INET type (not considered PII per architecture
  doc § 6.3, same as existing `audit_logs` table in architecture).

---

#### `abac_decision_log`

Implements: FR-015, DR-09, NFR-08

| Column          | Type        | Nullable | Default             | Constraints                |
| --------------- | ----------- | -------- | ------------------- | -------------------------- |
| id              | UUID        | No       | `gen_random_uuid()` | PK                         |
| user_id         | UUID        | No       | —                   |                            |
| resource_type   | VARCHAR(63) | No       | —                   |                            |
| resource_id     | UUID        | Yes      | `NULL`              |                            |
| action          | VARCHAR(63) | No       | —                   |                            |
| decision        | VARCHAR(8)  | No       | —                   | CHECK IN ('allow', 'deny') |
| rules_evaluated | JSONB       | No       | `'[]'`              |                            |
| log_level       | VARCHAR(8)  | No       | `'info'`            | CHECK IN ('info', 'debug') |
| created_at      | TIMESTAMPTZ | No       | `now()`             |                            |

**Indexes:**

| Name                               | Columns                                   | Type  | Purpose                          |
| ---------------------------------- | ----------------------------------------- | ----- | -------------------------------- |
| `abac_decision_log_pkey`           | `id`                                      | PK    | Primary key                      |
| `abac_decision_log_query_idx`      | `(created_at, user_id, action, decision)` | BTREE | Filtered queries (NFR-08, DR-09) |
| `abac_decision_log_created_at_idx` | `created_at`                              | BTREE | TTL rotation purge               |

**Notes:**

- TTL rotation: scheduled job purges entries where `log_level = 'info'` AND
  `created_at < now() - interval '30 days'`, and `log_level = 'debug'` AND
  `created_at < now() - interval '7 days'` (DR-09).
- Sampling: 10% at INFO level in production for high-traffic tenants. Full
  logging at DEBUG level (DR-09).

---

#### `user_profile`

Implements: FR-017, DR-10

| Column             | Type         | Nullable | Default    | Constraints                                |
| ------------------ | ------------ | -------- | ---------- | ------------------------------------------ |
| user_id            | UUID         | No       | —          | PK                                         |
| keycloak_user_id   | VARCHAR(255) | No       | —          | UNIQUE                                     |
| email              | VARCHAR(255) | No       | —          |                                            |
| display_name       | VARCHAR(255) | Yes      | `NULL`     |                                            |
| avatar_path        | TEXT         | Yes      | `NULL`     | MinIO path: `avatars/<id>.<ext>`           |
| timezone           | VARCHAR(63)  | No       | `'UTC'`    |                                            |
| language           | VARCHAR(8)   | No       | `'en'`     |                                            |
| notification_prefs | JSONB        | No       | `'{}'`     | Per-event-type toggles                     |
| status             | VARCHAR(16)  | No       | `'active'` | CHECK IN ('active', 'invited', 'disabled') |
| deleted_at         | TIMESTAMPTZ  | Yes      | `NULL`     | Soft-delete timestamp                      |
| created_at         | TIMESTAMPTZ  | No       | `now()`    |                                            |
| updated_at         | TIMESTAMPTZ  | No       | `now()`    |                                            |

**Indexes:**

| Name                           | Columns            | Type   | Purpose                           |
| ------------------------------ | ------------------ | ------ | --------------------------------- |
| `user_profile_pkey`            | `user_id`          | PK     | Primary key                       |
| `user_profile_keycloak_id_key` | `keycloak_user_id` | UNIQUE | JWT sub → user mapping            |
| `user_profile_email_idx`       | `email`            | BTREE  | User search (invite autocomplete) |
| `user_profile_status_idx`      | `status`           | BTREE  | Filter active users               |

**Notes:**

- This replaces the `users` table from the architecture ERD with a richer
  model per DR-10. The `user_id` is the Plexica internal UUID; `keycloak_user_id`
  maps to the JWT `sub` claim.
- `notification_prefs` JSONB format:
  ```json
  {
    "invite_received": { "email": true },
    "workspace_changes": { "email": false },
    "role_changes": { "email": true }
  }
  ```
- Soft-delete: when `deleted_at` is set, the profile is considered removed.
  Retained 90 days for audit trail (NFR-12, DR-06).

---

#### `tenant_branding`

Implements: FR-020, DR-07

| Column        | Type        | Nullable | Default             | Constraints |
| ------------- | ----------- | -------- | ------------------- | ----------- |
| id            | UUID        | No       | `gen_random_uuid()` | PK          |
| logo_path     | TEXT        | Yes      | `NULL`              | MinIO path  |
| primary_color | VARCHAR(9)  | No       | `'#6366F1'`         | Hex color   |
| dark_mode     | BOOLEAN     | No       | `false`             |             |
| updated_at    | TIMESTAMPTZ | No       | `now()`             |             |

**Notes:**

- One row per tenant schema (singleton). Created during tenant provisioning.
- `logo_path` points to MinIO: `branding/logo.<ext>` within the tenant bucket.
- Logo max 2MB; accepted formats: JPEG, PNG, WebP, SVG (NFR-07).
- `primary_color` applied via CSS custom properties for instant preview (AC-10).

---

#### `action_registry`

Implements: FR-023, FR-024

| Column         | Type         | Nullable | Default             | Constraints                               |
| -------------- | ------------ | -------- | ------------------- | ----------------------------------------- |
| id             | UUID         | No       | `gen_random_uuid()` | PK                                        |
| plugin_id      | UUID         | No       | —                   | References `core.plugins.id`              |
| action_key     | VARCHAR(255) | No       | —                   | Format: `{plugin-slug}:{resource}:{verb}` |
| label_i18n_key | VARCHAR(255) | No       | —                   | react-intl message key                    |
| description    | TEXT         | Yes      | `NULL`              |                                           |
| default_role   | VARCHAR(32)  | No       | `'admin'`           | CHECK IN ('admin', 'member', 'viewer')    |
| created_at     | TIMESTAMPTZ  | No       | `now()`             |                                           |

**Indexes:**

| Name                             | Columns                   | Type   | Purpose                        |
| -------------------------------- | ------------------------- | ------ | ------------------------------ |
| `action_registry_pkey`           | `id`                      | PK     | Primary key                    |
| `action_registry_plugin_key_idx` | `(plugin_id, action_key)` | UNIQUE | No duplicate action per plugin |

---

#### `workspace_role_action`

Implements: FR-023, FR-024, FR-026

| Column        | Type         | Nullable | Default             | Constraints                            |
| ------------- | ------------ | -------- | ------------------- | -------------------------------------- |
| id            | UUID         | No       | `gen_random_uuid()` | PK                                     |
| workspace_id  | UUID         | No       | —                   | FK → workspace(id) ON DELETE CASCADE   |
| plugin_id     | UUID         | No       | —                   | References `core.plugins.id`           |
| action_key    | VARCHAR(255) | No       | —                   |                                        |
| required_role | VARCHAR(32)  | No       | —                   | CHECK IN ('admin', 'member', 'viewer') |
| is_overridden | BOOLEAN      | No       | `false`             | `false` = still at default_role        |
| created_at    | TIMESTAMPTZ  | No       | `now()`             |                                        |
| updated_at    | TIMESTAMPTZ  | No       | `now()`             |                                        |

**Indexes:**

| Name                               | Columns                                 | Type   | Purpose                       |
| ---------------------------------- | --------------------------------------- | ------ | ----------------------------- |
| `workspace_role_action_pkey`       | `id`                                    | PK     | Primary key                   |
| `workspace_role_action_lookup_idx` | `(workspace_id, plugin_id, action_key)` | UNIQUE | Lookup per workspace + action |

---

### 3.2 Modified Tables

#### `core.tenants`

No column changes. Existing `Tenant` model in `schema.prisma` is sufficient.
The tenant-level settings and branding are stored in the tenant schema
(`tenant_branding`, `tenant_settings` fields on `TenantConfig`).

#### `core.tenant_configs`

| Column   | Change     | Before | After                                                                            |
| -------- | ---------- | ------ | -------------------------------------------------------------------------------- |
| settings | Expand use | `'{}'` | Store auth realm config: MFA policy, IdP list, password policy, session settings |

The existing `settings` JSONB column on `TenantConfig` will be used to store
the auth realm configuration (FR-022). No schema migration needed — the JSONB
structure is expanded by convention.

**`settings` JSONB structure (expanded):**

```json
{
  "auth": {
    "mfa_enabled": false,
    "mfa_type": "totp",
    "password_policy": {
      "min_length": 8,
      "require_uppercase": true,
      "require_number": true,
      "expiry_days": 90
    },
    "session_timeout_minutes": 480,
    "identity_providers": []
  }
}
```

### 3.3 Migration Strategy

**Approach**: Prisma migrate for tenant schemas.

1. **New tenant provisioning**: The `provisionTenant()` function in
   `tenant-provisioning.ts` already creates a PostgreSQL schema. It will be
   extended to run `prisma migrate deploy` on the tenant schema after schema
   creation, which applies all tenant-schema migrations including the new
   tables from this spec.

2. **Existing tenants**: The `migrateAll()` function iterates over all active
   tenants and runs `prisma migrate deploy` on each tenant schema. This runs
   at application startup and can be triggered manually.

3. **Seed data**: Each new tenant schema gets:
   - 3 built-in workspace templates (Team, Department, Project) in
     `workspace_template` with `is_builtin = true`.
   - 1 `tenant_branding` row with defaults.

4. **Migration order**:
   1. `user_profile` — no FKs to other new tables
   2. `workspace_template` — no FKs to other new tables
   3. `tenant_branding` — no FKs
   4. `workspace` — FK to workspace_template, user_profile
   5. `workspace_member` — FK to workspace, user_profile
   6. `invitation` — FK to workspace, user_profile
   7. `audit_log` — no FKs (actor_id is UUID, not enforced FK for flexibility)
   8. `abac_decision_log` — no FKs
   9. `action_registry` — references core.plugins (cross-schema, not FK)
   10. `workspace_role_action` — FK to workspace, references core.plugins

### 3.4 Data Validation Rules

| Field / Entity                  | Rule                                                  | Enforced At           | Spec Ref |
| ------------------------------- | ----------------------------------------------------- | --------------------- | -------- |
| `workspace.slug`                | `/^[a-z][a-z0-9-]{1,62}$/` — auto-generated from name | Zod + DB UNIQUE       | DR-02    |
| `workspace.name`                | 1–255 characters, non-empty                           | Zod                   | FR-002   |
| `workspace.hierarchy`           | Max 10 levels deep                                    | Application (service) | NFR-05   |
| `workspace_member.role`         | Enum: `admin`, `member`, `viewer`                     | Zod + DB CHECK        | DR-04    |
| `invitation.email`              | Valid email format                                    | Zod                   | DR-05    |
| `invitation.expires_at`         | `created_at + 7 days`                                 | Application           | NFR-13   |
| `user_profile.timezone`         | Valid IANA timezone string                            | Zod                   | DR-10    |
| `user_profile.language`         | ISO 639-1 code (e.g., `en`, `it`)                     | Zod                   | DR-10    |
| `tenant_branding.primary_color` | Hex color `/^#[0-9A-Fa-f]{6}$/`                       | Zod                   | FR-020   |
| `tenant_branding.logo`          | Max 2MB, JPEG/PNG/WebP/SVG                            | Zod + multipart       | NFR-07   |
| `user_profile.avatar`           | Max 1MB, JPEG/PNG/WebP                                | Zod + multipart       | NFR-09   |
| `template.structure`            | Valid JSON array of child workspace definitions       | Zod                   | DR-03    |
| `workspace.version`             | Monotonically increasing integer                      | Application (service) | Edge #14 |
| `action_key`                    | Format `{plugin-slug}:{resource}:{verb}`              | Zod                   | Spec §7  |

---

## 4. API Design

All endpoints are prefixed with `/api/v1/`. All require authentication
unless marked `[PUBLIC]`. Tenant context is injected via the tenant-context
middleware (from Spec 002). Error responses follow the existing envelope:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

For validation errors (400), `details` may be included:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { "name": ["required"] } } }
```

### 4.1 Workspace Management Endpoints

#### `GET /api/v1/workspaces`

- **Description**: List workspaces the current user has access to (ABAC-filtered).
  Returns flat list with hierarchy info. Tenant Admins see all workspaces.
- **Auth**: Required (any authenticated tenant user)
- **ABAC**: `workspace:read` — filters results to accessible workspaces
- **Query Params**: `?status=active&search=engineering&page=1&pageSize=20&sort=name&order=asc`
- **Implements**: FR-001, AC-01
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Engineering",
        "slug": "engineering",
        "description": "...",
        "parentId": null,
        "materializedPath": "/uuid",
        "status": "active",
        "memberCount": 5,
        "createdAt": "2026-04-06T10:00:00Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
  ```
- **Error Responses**:

  | Status | Code                   | When                              |
  | ------ | ---------------------- | --------------------------------- |
  | 401    | UNAUTHORIZED           | Missing or invalid token          |
  | 400    | INVALID_TENANT_CONTEXT | Missing or unknown tenant context |

- **Performance**: NFR-02 (< 200ms P95)

---

#### `POST /api/v1/workspaces`

- **Description**: Create a new workspace. Optionally under a parent workspace
  and/or from a template.
- **Auth**: Required (Tenant Admin only — `workspace:create`)
- **ABAC**: `workspace:create` (tenant-level check)
- **Implements**: FR-002, FR-004, FR-008, AC-01, AC-03
- **Request**:
  ```json
  {
    "name": "Engineering",
    "description": "Engineering team workspace",
    "parentId": "uuid-or-null",
    "templateId": "uuid-or-null"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Engineering",
      "slug": "engineering",
      "description": "Engineering team workspace",
      "parentId": null,
      "materializedPath": "/uuid",
      "status": "active",
      "templateId": null,
      "version": 1,
      "createdAt": "2026-04-06T10:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code               | When                                         |
  | ------ | ------------------ | -------------------------------------------- |
  | 400    | VALIDATION_ERROR   | Invalid input (name too long, etc.)          |
  | 400    | MAX_DEPTH_EXCEEDED | Parent + 1 would exceed 10-level depth limit |
  | 403    | FORBIDDEN          | User lacks `workspace:create`                |
  | 404    | NOT_FOUND          | Parent workspace not found                   |
  | 409    | ALREADY_EXISTS     | Slug collision                               |

---

#### `GET /api/v1/workspaces/:id`

- **Description**: Get workspace detail including hierarchy info.
- **Auth**: Required (must have `workspace:read` on this workspace)
- **ABAC**: `workspace:read`
- **Implements**: FR-003, AC-06
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Engineering",
      "slug": "engineering",
      "description": "...",
      "parentId": null,
      "materializedPath": "/uuid",
      "status": "active",
      "children": [{ "id": "uuid", "name": "Frontend Team", "slug": "frontend-team" }],
      "memberCount": 5,
      "currentUserRole": "admin",
      "templateId": null,
      "version": 2,
      "createdAt": "2026-04-06T10:00:00Z",
      "updatedAt": "2026-04-06T11:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code         | When                            |
  | ------ | ------------ | ------------------------------- |
  | 401    | UNAUTHORIZED | Missing or invalid token        |
  | 403    | FORBIDDEN    | User lacks `workspace:read`     |
  | 404    | NOT_FOUND    | Workspace not found or archived |

---

#### `PATCH /api/v1/workspaces/:id`

- **Description**: Update workspace name, description, or settings.
  Supports optimistic concurrency via `If-Match` header.
- **Auth**: Required (`workspace:update`)
- **ABAC**: `workspace:update`
- **Implements**: FR-006, AC-01, Edge Case #14
- **Request Headers**: `If-Match: 2` (version number)
- **Request**:
  ```json
  {
    "name": "Engineering v2",
    "description": "Updated description"
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Engineering v2",
      "version": 3,
      "updatedAt": "2026-04-06T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code             | When                              |
  | ------ | ---------------- | --------------------------------- |
  | 400    | VALIDATION_ERROR | Invalid input                     |
  | 403    | FORBIDDEN        | User lacks `workspace:update`     |
  | 404    | NOT_FOUND        | Workspace not found               |
  | 409    | VERSION_CONFLICT | `If-Match` version does not match |

---

#### `DELETE /api/v1/workspaces/:id`

- **Description**: Soft-delete (archive) a workspace and all its descendants.
  Returns the list of affected workspaces.
- **Auth**: Required (`workspace:delete`)
- **ABAC**: `workspace:delete`
- **Implements**: FR-007, DR-01, AC-01, Edge Case #1
- **Response (200)**:
  ```json
  {
    "data": {
      "archivedCount": 4,
      "workspaces": [
        { "id": "uuid", "name": "Engineering" },
        { "id": "uuid", "name": "Frontend Team" },
        { "id": "uuid", "name": "Backend Team" },
        { "id": "uuid", "name": "DevOps" }
      ]
    }
  }
  ```
- **Error Responses**:

  | Status | Code      | When                          |
  | ------ | --------- | ----------------------------- |
  | 403    | FORBIDDEN | User lacks `workspace:delete` |
  | 404    | NOT_FOUND | Workspace not found           |

---

#### `POST /api/v1/workspaces/:id/restore`

- **Description**: Restore an archived workspace and its descendants within
  the 30-day retention window.
- **Auth**: Required (`workspace:restore`)
- **ABAC**: `workspace:restore`
- **Implements**: DR-01, AC-01, Edge Case #13
- **Response (200)**:
  ```json
  {
    "data": {
      "restoredCount": 4,
      "workspaces": [{ "id": "uuid", "name": "Engineering", "status": "active" }]
    }
  }
  ```
- **Error Responses**:

  | Status | Code                   | When                               |
  | ------ | ---------------------- | ---------------------------------- |
  | 403    | FORBIDDEN              | User lacks `workspace:restore`     |
  | 404    | NOT_FOUND              | Workspace not found (hard-deleted) |
  | 400    | WORKSPACE_NOT_ARCHIVED | Workspace is not archived          |

---

#### `POST /api/v1/workspaces/:id/reparent`

- **Description**: Move a workspace under a different parent (or to root level).
  Recalculates materialized path for the workspace and all descendants.
  Wrapped in a transaction.
- **Auth**: Required (`workspace:reparent`)
- **ABAC**: `workspace:reparent`
- **Implements**: FR-009, DR-02, AC-02, Edge Cases #2, #3
- **Request**:
  ```json
  {
    "newParentId": "uuid-or-null"
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "parentId": "new-parent-uuid",
      "materializedPath": "/root/new-parent/this",
      "descendantsUpdated": 3
    }
  }
  ```
- **Error Responses**:

  | Status | Code               | When                                               |
  | ------ | ------------------ | -------------------------------------------------- |
  | 400    | CIRCULAR_REFERENCE | Moving under own descendant (Edge Case #2)         |
  | 400    | MAX_DEPTH_EXCEEDED | Result depth would exceed 10 levels (Edge Case #3) |
  | 403    | FORBIDDEN          | User lacks `workspace:reparent`                    |
  | 404    | NOT_FOUND          | Workspace or new parent not found                  |

- **Performance**: NFR-10 (< 200ms P95 for 10 levels)

---

#### `GET /api/v1/workspaces/:id/members`

- **Description**: List members of a workspace with their roles.
- **Auth**: Required (`member:list`)
- **ABAC**: `member:list`
- **Implements**: FR-005, AC-05
- **Query Params**: `?page=1&pageSize=20&search=marco`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "userId": "uuid",
        "displayName": "Marco",
        "avatarPath": "avatars/uuid.jpg",
        "role": "member",
        "createdAt": "2026-04-06T10:00:00Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
  ```
- **Error Responses**:

  | Status | Code      | When                     |
  | ------ | --------- | ------------------------ |
  | 403    | FORBIDDEN | User lacks `member:list` |
  | 404    | NOT_FOUND | Workspace not found      |

**Note**: No email in response body (Constitution §Security-6).

---

#### `POST /api/v1/workspaces/:id/members`

- **Description**: Add an existing tenant user to the workspace with a role.
  For new users, use `POST /api/v1/users/invite` instead.
- **Auth**: Required (`member:invite`)
- **ABAC**: `member:invite`
- **Implements**: FR-005, FR-012, AC-04, Edge Case #15
- **Request**:
  ```json
  {
    "userId": "uuid",
    "role": "member"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "workspaceId": "uuid",
      "userId": "uuid",
      "role": "member",
      "createdAt": "2026-04-06T10:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code             | When                                  |
  | ------ | ---------------- | ------------------------------------- |
  | 400    | VALIDATION_ERROR | Invalid role value                    |
  | 403    | FORBIDDEN        | User lacks `member:invite`            |
  | 404    | NOT_FOUND        | Workspace or user not found           |
  | 409    | ALREADY_EXISTS   | User already a member (Edge Case #15) |

---

#### `DELETE /api/v1/workspaces/:id/members/:userId`

- **Description**: Remove a member from the workspace.
- **Auth**: Required (`member:remove`)
- **ABAC**: `member:remove`
- **Implements**: FR-005, AC-05
- **Response (204)**: No body.
- **Error Responses**:

  | Status | Code      | When                          |
  | ------ | --------- | ----------------------------- |
  | 403    | FORBIDDEN | User lacks `member:remove`    |
  | 404    | NOT_FOUND | Workspace or member not found |

---

#### `PATCH /api/v1/workspaces/:id/members/:userId`

- **Description**: Change a member's role within the workspace.
- **Auth**: Required (`member:role-change`)
- **ABAC**: `member:role-change`
- **Implements**: FR-012, FR-026, AC-16
- **Request**:
  ```json
  {
    "role": "viewer"
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "userId": "uuid",
      "role": "viewer",
      "updatedAt": "2026-04-06T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code             | When                            |
  | ------ | ---------------- | ------------------------------- |
  | 400    | VALIDATION_ERROR | Invalid role value              |
  | 403    | FORBIDDEN        | User lacks `member:role-change` |
  | 404    | NOT_FOUND        | Workspace or member not found   |

---

#### `GET /api/v1/workspaces/:id/hierarchy`

- **Description**: Returns the full subtree of a workspace (children,
  grandchildren, etc.) for sidebar navigation.
- **Auth**: Required (`workspace:read`)
- **ABAC**: `workspace:read`
- **Implements**: FR-004
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "name": "Engineering",
      "slug": "engineering",
      "children": [
        {
          "id": "uuid",
          "name": "Frontend Team",
          "slug": "frontend-team",
          "children": []
        }
      ]
    }
  }
  ```

---

### 4.2 User & Role Management Endpoints

#### `GET /api/v1/users`

- **Description**: List all users in the current tenant. Admin only.
- **Auth**: Required (Tenant Admin)
- **Implements**: FR-010
- **Query Params**: `?status=active&search=marco&page=1&pageSize=20`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "userId": "uuid",
        "displayName": "Marco",
        "avatarPath": "avatars/uuid.jpg",
        "status": "active",
        "workspaceCount": 3,
        "createdAt": "2026-04-06T10:00:00Z"
      }
    ],
    "total": 15,
    "page": 1,
    "pageSize": 20
  }
  ```

**Note**: No email in response body to non-admin callers. For admin callers,
email is needed for invite autocomplete (DR-05) but must be marked as PII and
not logged.

---

#### `POST /api/v1/users/invite`

- **Description**: Invite a new user to the tenant via email. Creates a
  Keycloak invitation in the tenant realm and sends an email. Also adds
  the user as a member of the specified workspace.
- **Auth**: Required (Tenant Admin or Workspace Admin with `member:invite`)
- **Implements**: FR-011, DR-05, AC-04, NFR-13
- **Request**:
  ```json
  {
    "email": "marco@company.com",
    "workspaceId": "uuid",
    "role": "member"
  }
  ```
- **Response (201)**:
  ```json
  {
    "data": {
      "invitationId": "uuid",
      "email": "marco@company.com",
      "workspaceId": "uuid",
      "role": "member",
      "status": "pending",
      "expiresAt": "2026-04-13T10:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code                   | When                                           |
  | ------ | ---------------------- | ---------------------------------------------- |
  | 400    | VALIDATION_ERROR       | Invalid email format or role                   |
  | 400    | USER_ALREADY_IN_TENANT | Email belongs to existing tenant user          |
  | 403    | FORBIDDEN              | User lacks invitation permission               |
  | 404    | NOT_FOUND              | Workspace not found                            |
  | 409    | INVITATION_EXISTS      | Active pending invite for this email+workspace |

- **Performance**: NFR-04 (email delivery < 5s)

---

#### `GET /api/v1/workspaces/:id/invitations`

- **Description**: List pending, accepted, and expired invitations for a workspace.
- **Auth**: Required (`invitation:list`)
- **ABAC**: `invitation:list`
- **Implements**: DR-05
- **Query Params**: `?status=pending&page=1&pageSize=20`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "email": "marco@company.com",
        "role": "member",
        "status": "pending",
        "invitedBy": { "userId": "uuid", "displayName": "Laura" },
        "expiresAt": "2026-04-13T10:00:00Z",
        "createdAt": "2026-04-06T10:00:00Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 20
  }
  ```

---

#### `POST /api/v1/invitations/:id/resend`

- **Description**: Resend an expired or pending invitation. Resets the
  expiry to 7 days from now.
- **Auth**: Required (`invitation:resend`)
- **ABAC**: `invitation:resend`
- **Implements**: DR-05, AC-04, Edge Case #5
- **Response (200)**:
  ```json
  {
    "data": {
      "id": "uuid",
      "status": "pending",
      "expiresAt": "2026-04-13T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code                | When                           |
  | ------ | ------------------- | ------------------------------ |
  | 400    | INVITATION_ACCEPTED | Invitation already accepted    |
  | 403    | FORBIDDEN           | User lacks `invitation:resend` |
  | 404    | NOT_FOUND           | Invitation not found           |

---

#### `POST /api/v1/invitations/:token/accept`

- **Description**: Accept an invitation via the invite token (from email link).
  Creates or links the Keycloak user and adds them to the workspace.
- **Auth**: `[PUBLIC]` — authenticated via invitation token, not JWT
- **Implements**: DR-05, AC-04, Edge Case #5
- **Response (200)**:
  ```json
  {
    "data": {
      "workspaceId": "uuid",
      "workspaceName": "Engineering",
      "role": "member"
    }
  }
  ```
- **Error Responses**:

  | Status | Code                | When                                  |
  | ------ | ------------------- | ------------------------------------- |
  | 400    | INVITATION_EXPIRED  | Token is valid but invitation expired |
  | 400    | INVITATION_ACCEPTED | Already accepted                      |
  | 404    | NOT_FOUND           | Invalid token                         |

---

#### `DELETE /api/v1/users/:id`

- **Description**: Remove a user from the tenant. Triggers resource
  reassignment flow and session termination.
- **Auth**: Required (Tenant Admin)
- **Implements**: FR-016, DR-06, AC-08, Edge Case #6
- **Request**:
  ```json
  {
    "reassignments": [
      {
        "workspaceId": "uuid",
        "reassignToUserId": "uuid"
      }
    ]
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "userId": "uuid",
      "status": "disabled",
      "resourcesReassigned": 12,
      "workspacesAffected": 3,
      "sessionsTerminated": true
    }
  }
  ```
- **Error Responses**:

  | Status | Code                 | When                                        |
  | ------ | -------------------- | ------------------------------------------- |
  | 400    | VALIDATION_ERROR     | Missing reassignment for affected workspace |
  | 403    | FORBIDDEN            | Non-Tenant Admin                            |
  | 404    | NOT_FOUND            | User not found                              |
  | 400    | SELF_REMOVAL_BLOCKED | Admin trying to remove themselves           |

---

#### `GET /api/v1/users/:id/workspaces`

- **Description**: List workspaces a specific user is a member of (for the
  user removal reassignment dialog).
- **Auth**: Required (Tenant Admin)
- **Implements**: FR-016, DR-06
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "workspaceId": "uuid",
        "workspaceName": "Engineering",
        "role": "member",
        "resourceCount": 5
      }
    ]
  }
  ```

---

#### `GET /api/v1/roles`

- **Description**: List all built-in roles with descriptions and member counts.
  For the Role Management Screen (DR-13).
- **Auth**: Required (Tenant Admin)
- **Implements**: FR-025, AC-15, DR-13
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "name": "tenant_admin",
        "displayName": "Tenant Admin",
        "scope": "tenant",
        "description": "Full control over the tenant...",
        "memberCount": 2
      },
      {
        "name": "workspace_admin",
        "displayName": "Workspace Admin",
        "scope": "workspace",
        "description": "Full control within a workspace...",
        "memberCount": 8
      },
      {
        "name": "workspace_member",
        "displayName": "Workspace Member",
        "scope": "workspace",
        "description": "Create and edit content...",
        "memberCount": 23
      },
      {
        "name": "workspace_viewer",
        "displayName": "Workspace Viewer",
        "scope": "workspace",
        "description": "Read-only access...",
        "memberCount": 5
      }
    ]
  }
  ```
- **Error Responses**:

  | Status | Code      | When                  |
  | ------ | --------- | --------------------- |
  | 403    | FORBIDDEN | Non-Tenant Admin user |

---

#### `GET /api/v1/roles/action-matrix`

- **Description**: Returns the full action permission matrix from DR-04.
  For the Role Management Screen action matrix table.
- **Auth**: Required (Tenant Admin)
- **Implements**: FR-025, AC-15, DR-04, DR-13
- **Response (200)**:
  ```json
  {
    "data": {
      "actions": [
        {
          "action": "workspace:read",
          "category": "workspace",
          "tenantAdmin": "allowed",
          "workspaceAdmin": "allowed",
          "workspaceMember": "allowed",
          "workspaceViewer": "allowed"
        },
        {
          "action": "workspace:create",
          "category": "workspace",
          "tenantAdmin": "allowed",
          "workspaceAdmin": "not_applicable",
          "workspaceMember": "not_applicable",
          "workspaceViewer": "not_applicable"
        }
      ]
    }
  }
  ```

---

### 4.3 Tenant Settings Endpoints

#### `GET /api/v1/tenant/settings`

- **Description**: Get current tenant settings (name, slug, config).
- **Auth**: Required (Tenant Admin for full settings, any user for slug/name)
- **Implements**: FR-019, AC-09, DR-07
- **Response (200)**:
  ```json
  {
    "data": {
      "name": "Acme Corp",
      "slug": "acme-corp",
      "status": "active",
      "createdAt": "2026-03-01T10:00:00Z"
    }
  }
  ```

---

#### `PATCH /api/v1/tenant/settings`

- **Description**: Update tenant display name. Slug is immutable (DR-07).
- **Auth**: Required (Tenant Admin, `settings:update`)
- **Implements**: FR-019, AC-09, DR-07
- **Request**:
  ```json
  {
    "name": "Acme Corporation"
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "name": "Acme Corporation",
      "updatedAt": "2026-04-06T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code             | When                         |
  | ------ | ---------------- | ---------------------------- |
  | 400    | VALIDATION_ERROR | Invalid name                 |
  | 400    | SLUG_IMMUTABLE   | Attempt to change slug       |
  | 403    | FORBIDDEN        | User lacks `settings:update` |

---

#### `GET /api/v1/tenant/branding`

- **Description**: Get tenant branding settings.
- **Auth**: Required (any authenticated tenant user — branding is visible to all)
- **Implements**: FR-020
- **Response (200)**:
  ```json
  {
    "data": {
      "logoUrl": "https://minio.example.com/tenant-acme/branding/logo.png",
      "primaryColor": "#6366F1",
      "darkMode": false
    }
  }
  ```

---

#### `PATCH /api/v1/tenant/branding`

- **Description**: Update tenant branding (logo, primary color, dark mode).
  Logo upload via multipart form data.
- **Auth**: Required (Tenant Admin, `branding:update`)
- **Implements**: FR-020, AC-10, NFR-07
- **Content-Type**: `multipart/form-data` (for logo upload) or `application/json`
  (for color/dark mode only)
- **Request (multipart)**:
  - `logo`: File (max 2MB, JPEG/PNG/WebP/SVG)
  - `primaryColor`: `#2D5F2D`
  - `darkMode`: `true`
- **Response (200)**:
  ```json
  {
    "data": {
      "logoUrl": "https://minio.example.com/tenant-acme/branding/logo.png",
      "primaryColor": "#2D5F2D",
      "darkMode": true,
      "updatedAt": "2026-04-06T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code              | When                             |
  | ------ | ----------------- | -------------------------------- |
  | 400    | VALIDATION_ERROR  | Invalid color format             |
  | 400    | FILE_TOO_LARGE    | Logo exceeds 2MB (Edge Case #10) |
  | 400    | INVALID_FILE_TYPE | Unsupported image format         |
  | 403    | FORBIDDEN         | User lacks `branding:update`     |

---

#### `GET /api/v1/tenant/auth-config`

- **Description**: Get current auth realm configuration (MFA, IdPs,
  password policy, session settings). Reads from Keycloak Admin API.
- **Auth**: Required (Tenant Admin, `auth:configure`)
- **Implements**: FR-022, DR-11
- **Response (200)**:
  ```json
  {
    "data": {
      "mfa": {
        "enabled": false,
        "type": "totp"
      },
      "passwordPolicy": {
        "minLength": 8,
        "requireUppercase": true,
        "requireNumber": true,
        "expiryDays": 90
      },
      "sessionSettings": {
        "timeoutMinutes": 480,
        "idleTimeoutMinutes": 30
      },
      "identityProviders": []
    }
  }
  ```

---

#### `PATCH /api/v1/tenant/auth-config`

- **Description**: Update auth realm configuration. Applied via Keycloak
  Admin API. Includes validation preview to prevent lockout.
- **Auth**: Required (Tenant Admin, `auth:configure`)
- **Implements**: FR-022, DR-11, AC-12, Edge Case #7
- **Request**:
  ```json
  {
    "mfa": { "enabled": true, "type": "totp" },
    "passwordPolicy": { "minLength": 12 }
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "mfa": { "enabled": true, "type": "totp" },
      "passwordPolicy": {
        "minLength": 12,
        "requireUppercase": true,
        "requireNumber": true,
        "expiryDays": 90
      },
      "warnings": []
    }
  }
  ```
- **Error Responses**:

  | Status | Code             | When                                       |
  | ------ | ---------------- | ------------------------------------------ |
  | 400    | VALIDATION_ERROR | Invalid configuration values               |
  | 400    | LOCKOUT_RISK     | Disabling all login methods (Edge Case #7) |
  | 403    | FORBIDDEN        | User lacks `auth:configure`                |
  | 502    | KEYCLOAK_ERROR   | Keycloak Admin API failure                 |

---

### 4.4 User Profile Endpoints

#### `GET /api/v1/profile`

- **Description**: Get the current user's profile.
- **Auth**: Required (any authenticated user)
- **Implements**: FR-017, DR-10, AC-13
- **Response (200)**:
  ```json
  {
    "data": {
      "userId": "uuid",
      "displayName": "Marco",
      "avatarUrl": "https://minio.example.com/tenant-acme/avatars/uuid.jpg",
      "timezone": "Europe/Rome",
      "language": "it",
      "notificationPrefs": {
        "invite_received": { "email": true },
        "workspace_changes": { "email": false },
        "role_changes": { "email": true }
      }
    }
  }
  ```

---

#### `PATCH /api/v1/profile`

- **Description**: Update user profile. Display name and timezone/language
  are synced to Keycloak. Avatar uploaded to MinIO.
- **Auth**: Required (any authenticated user — own profile only)
- **Implements**: FR-017, DR-10, AC-13
- **Content-Type**: `multipart/form-data` (for avatar) or `application/json`
- **Request**:
  ```json
  {
    "displayName": "Marco Rossi",
    "timezone": "Europe/Rome",
    "language": "it",
    "notificationPrefs": {
      "invite_received": { "email": true }
    }
  }
  ```
- **Response (200)**:
  ```json
  {
    "data": {
      "userId": "uuid",
      "displayName": "Marco Rossi",
      "timezone": "Europe/Rome",
      "language": "it",
      "updatedAt": "2026-04-06T12:00:00Z"
    }
  }
  ```
- **Error Responses**:

  | Status | Code              | When                              |
  | ------ | ----------------- | --------------------------------- |
  | 400    | VALIDATION_ERROR  | Invalid timezone or language      |
  | 400    | FILE_TOO_LARGE    | Avatar exceeds 1MB (Edge Case #8) |
  | 400    | INVALID_FILE_TYPE | Unsupported format (Edge Case #9) |

---

#### `POST /api/v1/profile/avatar`

- **Description**: Upload or replace user avatar. Separate endpoint for
  multipart upload.
- **Auth**: Required (any authenticated user — own profile only)
- **Implements**: FR-017, DR-10, NFR-09
- **Content-Type**: `multipart/form-data`
- **Request**: File field `avatar` (max 1MB, JPEG/PNG/WebP)
- **Response (200)**:
  ```json
  {
    "data": {
      "avatarUrl": "https://minio.example.com/tenant-acme/avatars/uuid.jpg"
    }
  }
  ```
- **Error Responses**:

  | Status | Code              | When                                |
  | ------ | ----------------- | ----------------------------------- |
  | 400    | FILE_TOO_LARGE    | Avatar exceeds 1MB                  |
  | 400    | INVALID_FILE_TYPE | Unsupported format (GIF, BMP, etc.) |

---

### 4.5 Audit Log Endpoints

#### `GET /api/v1/tenant/audit-log`

- **Description**: Query the tenant audit log. Filterable by action type,
  date range, and actor. Paginated.
- **Auth**: Required (Tenant Admin or Workspace Admin with `audit:read`)
- **ABAC**: `audit:read`
- **Implements**: FR-021, DR-08, AC-11, NFR-03
- **Query Params**: `?actionType=member.add&from=2026-03-30T00:00:00Z&to=2026-04-06T23:59:59Z&actorId=uuid&page=1&pageSize=20`
- **Response (200)**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "actorId": "uuid",
        "actorDisplayName": "Laura",
        "actionType": "member.add",
        "targetType": "workspace_member",
        "targetId": "uuid",
        "beforeValue": null,
        "afterValue": { "role": "member" },
        "ipAddress": "192.168.1.100",
        "createdAt": "2026-04-06T10:30:00Z"
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
  ```
- **Error Responses**:

  | Status | Code             | When                              |
  | ------ | ---------------- | --------------------------------- |
  | 400    | VALIDATION_ERROR | Invalid date range or action type |
  | 403    | FORBIDDEN        | User lacks `audit:read`           |

- **Performance**: NFR-03 (< 500ms P95 for 30-day window)

---

#### `GET /api/v1/tenant/audit-log/action-types`

- **Description**: Returns the list of available action types for filter
  dropdowns.
- **Auth**: Required (Tenant Admin or Workspace Admin with `audit:read`)
- **Implements**: FR-021
- **Response (200)**:
  ```json
  {
    "data": [
      { "key": "auth.login", "label": "Login", "category": "Authentication" },
      { "key": "workspace.create", "label": "Create Workspace", "category": "Workspace" },
      { "key": "member.add", "label": "Add Member", "category": "Membership" }
    ]
  }
  ```

---

### 4.6 Rate Limiting

Per ADR-012, rate limiting is applied at 3 levels via `@fastify/rate-limit`:

| Endpoint Group                           | Rate Limit  | Window | Rationale                     |
| ---------------------------------------- | ----------- | ------ | ----------------------------- |
| Global (per IP)                          | 1000 req    | 1 min  | DDoS protection               |
| `POST /api/v1/users/invite`              | 20 req/user | 1 hour | Prevent invite spam           |
| `POST /api/v1/workspaces`                | 50 req/user | 1 hour | Prevent workspace flooding    |
| `PATCH /api/v1/tenant/auth-config`       | 10 req/user | 1 hour | Protect Keycloak Admin API    |
| `POST /api/v1/profile/avatar`            | 10 req/user | 1 hour | Prevent storage abuse         |
| `PATCH /api/v1/tenant/branding`          | 10 req/user | 1 hour | Prevent storage abuse         |
| `POST /api/v1/invitations/:id/resend`    | 5 req/user  | 1 hour | Prevent email spam            |
| `POST /api/v1/invitations/:token/accept` | 10 req/IP   | 1 hour | Prevent brute-force on tokens |

Rate limit headers are included in all responses:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Exceeded rate limit response:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": "42"
  }
}
```

### 4.7 Error Response Format

Standard error envelope (consistent with Spec 002):

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

**Validation errors** (400):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "name": ["must be between 1 and 255 characters"],
      "role": ["must be one of: admin, member, viewer"]
    }
  }
}
```

**New error codes introduced in this spec:**

| Code                     | HTTP Status | Description                                      |
| ------------------------ | ----------- | ------------------------------------------------ |
| `MAX_DEPTH_EXCEEDED`     | 400         | Workspace hierarchy would exceed 10 levels       |
| `CIRCULAR_REFERENCE`     | 400         | Reparent would create a cycle                    |
| `VERSION_CONFLICT`       | 409         | Optimistic concurrency version mismatch          |
| `WORKSPACE_NOT_ARCHIVED` | 400         | Restore on a non-archived workspace              |
| `INVITATION_EXPIRED`     | 400         | Invite token valid but invitation expired        |
| `INVITATION_ACCEPTED`    | 400         | Invitation already accepted                      |
| `INVITATION_EXISTS`      | 409         | Active invite already exists for email+workspace |
| `USER_ALREADY_IN_TENANT` | 400         | Email belongs to existing tenant user            |
| `SELF_REMOVAL_BLOCKED`   | 400         | Admin cannot remove themselves                   |
| `SLUG_IMMUTABLE`         | 400         | Tenant slug cannot be changed                    |
| `FILE_TOO_LARGE`         | 400         | File exceeds size limit                          |
| `INVALID_FILE_TYPE`      | 400         | Unsupported file format                          |
| `LOCKOUT_RISK`           | 400         | Auth config change would lock out all users      |
| `KEYCLOAK_ERROR`         | 502         | Keycloak Admin API failure                       |
| `RATE_LIMITED`           | 429         | Rate limit exceeded                              |

All new error codes will be implemented as `AppError` subclasses, extending
the existing error hierarchy in `services/core-api/src/lib/app-error.ts`.

---

## Cross-References

| Document      | Path                                                             |
| ------------- | ---------------------------------------------------------------- |
| Spec 003      | `.forge/specs/003-core-features/spec.md`                         |
| User Journeys | `.forge/specs/003-core-features/user-journey.md`                 |
| Design Spec   | `.forge/specs/003-core-features/design-spec.md`                  |
| Constitution  | `.forge/constitution.md`                                         |
| Architecture  | `.forge/architecture/architecture.md`                            |
| Decision Log  | `.forge/knowledge/decision-log.md`                               |
| ADR-001       | `.forge/knowledge/adr/adr-001-schema-per-tenant.md`              |
| ADR-003       | `.forge/knowledge/adr/adr-003-abac-tree-walk.md`                 |
| ADR-011       | `.forge/knowledge/adr/adr-011-keycloak-admin-api-integration.md` |
| ADR-012       | `.forge/knowledge/adr/adr-012-fastify-rate-limit.md`             |

---

---

## 5. Component Design

### 5.1 Backend Modules

All backend modules live under `services/core-api/src/modules/`. Each module
follows the **repository → service → routes** layered pattern:

- **Schema** (`schema.ts`): Zod schemas for request/response validation
- **Types** (`types.ts`): TypeScript interfaces for internal domain objects
- **Repository** (`repository.ts`): Prisma queries, raw SQL where needed
- **Service** (`service.ts`): Business logic, orchestration, transaction boundaries
- **Routes** (`routes.ts`): Fastify route definitions, request parsing, response serialization

**Cross-cutting middleware** (auth, tenant-context, ABAC, rate-limit) lives in
`services/core-api/src/middleware/`. Shared libraries (database helpers, MinIO,
Keycloak Admin, email, Kafka) live in `services/core-api/src/lib/`.

---

#### 5.1.1 Module: `workspace`

**Path**: `services/core-api/src/modules/workspace/`

**Files**:

| File            | Purpose                                                               |
| --------------- | --------------------------------------------------------------------- |
| `routes.ts`     | Workspace CRUD, hierarchy, reparent, restore, templates, members      |
| `service.ts`    | Business logic: hierarchy management, soft-delete, path recalculation |
| `repository.ts` | Prisma queries for workspace, workspace_member, workspace_template    |
| `schema.ts`     | Zod schemas: CreateWorkspace, UpdateWorkspace, Reparent, etc.         |
| `types.ts`      | WorkspaceDto, WorkspaceMemberDto, WorkspaceTemplateDto, etc.          |

**Key function signatures**:

```typescript
// service.ts
export function listWorkspaces(
  tenantDb: PrismaClient,
  userId: string,
  filters: WorkspaceListFilters
): Promise<PaginatedResult<WorkspaceDto>>;
export function createWorkspace(
  tenantDb: PrismaClient,
  input: CreateWorkspaceInput,
  userId: string
): Promise<WorkspaceDto>;
export function getWorkspace(
  tenantDb: PrismaClient,
  id: string,
  userId: string
): Promise<WorkspaceDetailDto>;
export function updateWorkspace(
  tenantDb: PrismaClient,
  id: string,
  input: UpdateWorkspaceInput,
  version: number
): Promise<WorkspaceDto>;
export function archiveWorkspace(tenantDb: PrismaClient, id: string): Promise<ArchiveResult>;
export function restoreWorkspace(tenantDb: PrismaClient, id: string): Promise<RestoreResult>;
export function reparentWorkspace(
  tenantDb: PrismaClient,
  id: string,
  newParentId: string | null
): Promise<ReparentResult>;
export function getWorkspaceHierarchy(
  tenantDb: PrismaClient,
  id: string
): Promise<WorkspaceTreeNode>;

// repository.ts
export function findWorkspacesByUser(
  tenantDb: PrismaClient,
  userId: string,
  filters: WorkspaceListFilters
): Promise<PaginatedResult<WorkspaceRow>>;
export function findWorkspaceById(tenantDb: PrismaClient, id: string): Promise<WorkspaceRow | null>;
export function findDescendants(
  tenantDb: PrismaClient,
  materializedPath: string
): Promise<WorkspaceRow[]>;
export function updateMaterializedPaths(
  tenantDb: PrismaClient,
  workspaces: { id: string; path: string }[]
): Promise<void>;
```

**Integration points**:

- ABAC middleware (workspace-scoped actions: `workspace:read`, `workspace:create`, etc.)
- Audit log service (workspace.create, workspace.update, workspace.delete events)
- Workspace template service (template instantiation on create)

---

#### 5.1.2 Module: `workspace-member`

**Path**: `services/core-api/src/modules/workspace-member/`

**Files**:

| File            | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `routes.ts`     | Member list, add, remove, role change for a workspace      |
| `service.ts`    | Membership logic, duplicate checks, role change validation |
| `repository.ts` | Prisma queries for workspace_member table                  |
| `schema.ts`     | Zod: AddMember, ChangeMemberRole                           |
| `types.ts`      | WorkspaceMemberDto                                         |

**Key function signatures**:

```typescript
// service.ts
export function listMembers(
  tenantDb: PrismaClient,
  workspaceId: string,
  filters: MemberListFilters
): Promise<PaginatedResult<WorkspaceMemberDto>>;
export function addMember(
  tenantDb: PrismaClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberDto>;
export function removeMember(
  tenantDb: PrismaClient,
  workspaceId: string,
  userId: string
): Promise<void>;
export function changeMemberRole(
  tenantDb: PrismaClient,
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole
): Promise<WorkspaceMemberDto>;
```

**Integration points**:

- ABAC middleware (`member:list`, `member:invite`, `member:remove`, `member:role-change`)
- Audit log service (member.add, member.remove, member.role_change events)
- Invitation module (invitation creates pending membership)

---

#### 5.1.3 Module: `invitation`

**Path**: `services/core-api/src/modules/invitation/`

**Files**:

| File            | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| `routes.ts`     | Invite user, list invitations, resend, accept (public)       |
| `service.ts`    | Invitation lifecycle, expiry check, token generation, accept |
| `repository.ts` | Prisma queries for invitation table                          |
| `schema.ts`     | Zod: InviteUser, ResendInvitation, AcceptInvitation          |
| `types.ts`      | InvitationDto, InviteUserInput                               |

**Key function signatures**:

```typescript
// service.ts
export function inviteUser(
  tenantDb: PrismaClient,
  input: InviteUserInput,
  invitedBy: string,
  tenantSlug: string
): Promise<InvitationDto>;
export function listInvitations(
  tenantDb: PrismaClient,
  workspaceId: string,
  filters: InvitationListFilters
): Promise<PaginatedResult<InvitationDto>>;
export function resendInvitation(tenantDb: PrismaClient, id: string): Promise<InvitationDto>;
export function acceptInvitation(tenantDb: PrismaClient, token: string): Promise<AcceptResult>;
```

**Integration points**:

- Email service (`lib/email.ts`) — sends invitation email via SMTP
- Keycloak Admin API — creates user in tenant realm on accept
- Audit log service (invitation.send, invitation.accept, invitation.expire events)
- Workspace-member module — creates membership on accept

---

#### 5.1.4 Module: `user-management`

**Path**: `services/core-api/src/modules/user-management/`

**Files**:

| File            | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `routes.ts`     | Tenant user list, remove user, user's workspaces, roles endpoints  |
| `service.ts`    | User removal flow, resource reassignment, role listing             |
| `repository.ts` | Prisma queries for user_profile, cross-table aggregation           |
| `schema.ts`     | Zod: RemoveUser (with reassignments), UserListFilters              |
| `types.ts`      | TenantUserDto, UserWorkspaceDto, RoleDefinition, ActionMatrixEntry |

**Key function signatures**:

```typescript
// service.ts
export function listTenantUsers(
  tenantDb: PrismaClient,
  filters: UserListFilters
): Promise<PaginatedResult<TenantUserDto>>;
export function removeUser(
  tenantDb: PrismaClient,
  userId: string,
  reassignments: Reassignment[],
  tenantSlug: string
): Promise<RemoveUserResult>;
export function getUserWorkspaces(
  tenantDb: PrismaClient,
  userId: string
): Promise<UserWorkspaceDto[]>;
export function listRoles(tenantDb: PrismaClient): Promise<RoleDefinition[]>;
export function getActionMatrix(tenantDb: PrismaClient): Promise<ActionMatrixEntry[]>;
```

**Integration points**:

- Keycloak Admin API — disable user, terminate sessions on removal
- Audit log service (user removal events)
- Workspace-member repository — resource reassignment queries

---

#### 5.1.5 Module: `user-profile`

**Path**: `services/core-api/src/modules/user-profile/`

**Files**:

| File            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `routes.ts`     | GET/PATCH profile, POST avatar upload                 |
| `service.ts`    | Profile update logic, avatar upload to MinIO, KC sync |
| `repository.ts` | Prisma queries for user_profile table                 |
| `schema.ts`     | Zod: UpdateProfile, AvatarUpload                      |
| `types.ts`      | UserProfileDto, UpdateProfileInput                    |

**Key function signatures**:

```typescript
// service.ts
export function getProfile(tenantDb: PrismaClient, userId: string): Promise<UserProfileDto>;
export function updateProfile(
  tenantDb: PrismaClient,
  userId: string,
  input: UpdateProfileInput,
  tenantSlug: string
): Promise<UserProfileDto>;
export function uploadAvatar(
  tenantDb: PrismaClient,
  userId: string,
  file: MultipartFile,
  tenantSlug: string
): Promise<string>;
```

**Integration points**:

- MinIO client (`lib/minio-client.ts`) — avatar storage in `tenant-{slug}` bucket
- Keycloak Admin API — sync display name to Keycloak user attributes
- Audit log service (profile.update, profile.avatar_change events)

---

#### 5.1.6 Module: `tenant-settings`

**Path**: `services/core-api/src/modules/tenant-settings/`

**Files**:

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `routes.ts`     | General settings, branding, auth-config endpoints              |
| `service.ts`    | Settings update, branding upload, auth-config via KC Admin API |
| `repository.ts` | Prisma queries for tenant_branding, core.tenant_configs        |
| `schema.ts`     | Zod: UpdateTenantName, UpdateBranding, UpdateAuthConfig        |
| `types.ts`      | TenantSettingsDto, BrandingDto, AuthConfigDto                  |

**Key function signatures**:

```typescript
// service.ts
export function getTenantSettings(
  tenantDb: PrismaClient,
  tenantSlug: string
): Promise<TenantSettingsDto>;
export function updateTenantName(
  tenantDb: PrismaClient,
  tenantSlug: string,
  name: string
): Promise<TenantSettingsDto>;
export function getBranding(tenantDb: PrismaClient): Promise<BrandingDto>;
export function updateBranding(
  tenantDb: PrismaClient,
  input: UpdateBrandingInput,
  tenantSlug: string
): Promise<BrandingDto>;
export function getAuthConfig(tenantSlug: string): Promise<AuthConfigDto>;
export function updateAuthConfig(
  tenantSlug: string,
  input: UpdateAuthConfigInput
): Promise<AuthConfigDto>;
```

**Integration points**:

- Keycloak Admin API — realm configuration read/write (MFA, IdPs, password policy)
- MinIO client — logo upload to `tenant-{slug}` bucket (`branding/` prefix)
- Audit log service (settings.name_change, settings.branding_update, settings.auth_config_change)

---

#### 5.1.7 Module: `audit-log`

**Path**: `services/core-api/src/modules/audit-log/`

**Files**:

| File              | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `routes.ts`       | Query audit log, list action types                    |
| `service.ts`      | Audit log query with filters, action type registry    |
| `repository.ts`   | Prisma queries for audit_log table (optimized)        |
| `writer.ts`       | Audit log writer — fire-and-forget insert function    |
| `action-types.ts` | Static registry of all action types with labels       |
| `schema.ts`       | Zod: AuditLogQuery (date range, action type, page)    |
| `types.ts`        | AuditLogEntryDto, AuditLogQueryFilters, ActionTypeDef |

**Key function signatures**:

```typescript
// service.ts
export function queryAuditLog(
  tenantDb: PrismaClient,
  filters: AuditLogQueryFilters
): Promise<PaginatedResult<AuditLogEntryDto>>;
export function getActionTypes(): ActionTypeDef[];

// writer.ts — used by all modules to log audit events
export function writeAuditLog(tenantDb: PrismaClient, entry: AuditLogWriteInput): Promise<void>;
```

**Integration points**:

- Called by ALL other modules for audit logging (workspace, member, invitation, settings, profile)
- ABAC middleware (`audit:read` permission check)

**Design note**: `writer.ts` is a separate file from `service.ts` to keep the
write path (fire-and-forget, used by all modules) separate from the query path
(used only by the audit-log routes). This avoids circular dependencies since
other modules import `writer.ts` but never `service.ts`.

---

#### 5.1.8 Module: `abac`

**Path**: `services/core-api/src/modules/abac/`

**Files**:

| File                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `engine.ts`          | Core ABAC evaluation engine — the decision function                 |
| `policies.ts`        | Policy definitions mapping actions to required roles (DR-04 matrix) |
| `decision-logger.ts` | Writes ABAC decisions to abac_decision_log (sampling at INFO level) |
| `types.ts`           | AbacContext, AbacDecision, PolicyRule                               |

**Key function signatures**:

```typescript
// engine.ts
export function evaluateAbac(tenantDb: PrismaClient, context: AbacContext): Promise<AbacDecision>;
export function requireAbac(tenantDb: PrismaClient, context: AbacContext): Promise<void>; // throws ForbiddenError

// policies.ts
export function getRequiredRole(action: string): WorkspaceRole | 'tenant_admin';
export function isPluginAction(action: string): boolean;
export function resolvePluginActionRole(
  tenantDb: PrismaClient,
  workspaceId: string,
  action: string
): Promise<WorkspaceRole>;
```

**Integration points**:

- ABAC middleware (`middleware/abac.ts`) calls `evaluateAbac` on every protected route
- Plugin action enforcement uses `workspace_role_action` table
- Decision logger writes to `abac_decision_log` (with 10% sampling at INFO per DR-09)
- Redis cache for flattened permission sets (performance: NFR-01 < 50ms P95)

---

#### 5.1.9 Middleware: `abac`

**Path**: `services/core-api/src/middleware/abac.ts`

A Fastify preHandler hook that evaluates ABAC policies for workspace-scoped
routes. Injected via route config (not global — some routes are tenant-level).

```typescript
// abac.ts
export function abacMiddleware(
  action: string
): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
```

Usage in routes:

```typescript
server.get(
  '/api/v1/workspaces/:id',
  {
    preHandler: [abacMiddleware('workspace:read')],
  },
  handler
);
```

---

#### 5.1.10 Shared Libraries (New)

| File                                       | Purpose                                            |
| ------------------------------------------ | -------------------------------------------------- |
| `services/core-api/src/lib/email.ts`       | SMTP client (nodemailer), send invitation emails   |
| `services/core-api/src/lib/file-upload.ts` | Multipart upload validation (size, type), shared   |
| `services/core-api/src/lib/pagination.ts`  | Shared pagination types and helpers                |
| `services/core-api/src/lib/slug.ts`        | Slug generation from names (kebab-case, dedup)     |
| `services/core-api/src/lib/crypto.ts`      | Secure random token generation (invitation tokens) |

---

### 5.2 Frontend Components

Frontend components live in `apps/web/src/`. Organized by feature area with
shared primitives reused from `@plexica/ui`.

#### 5.2.1 Workspace Feature Area

| File Path                                                           | Purpose                                          |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/pages/workspace-list-page.tsx`                        | Workspace list with search, filters, hierarchy   |
| `apps/web/src/pages/workspace-detail-page.tsx`                      | Workspace detail: info, children, member preview |
| `apps/web/src/pages/workspace-settings-page.tsx`                    | Workspace name, description, danger zone         |
| `apps/web/src/pages/workspace-members-page.tsx`                     | Member list, add member, role management         |
| `apps/web/src/pages/workspace-templates-page.tsx`                   | Template list, create/edit template              |
| `apps/web/src/components/workspace/workspace-tree.tsx`              | Tree navigation component (hierarchy)            |
| `apps/web/src/components/workspace/workspace-selector-dropdown.tsx` | Header workspace switcher (Radix Popover + tree) |
| `apps/web/src/components/workspace/create-workspace-dialog.tsx`     | Create workspace form (name, parent, template)   |
| `apps/web/src/components/workspace/template-card.tsx`               | Template display card (built-in/custom variants) |
| `apps/web/src/components/workspace/child-workspace-editor.tsx`      | Template child workspace list editor             |
| `apps/web/src/components/workspace/create-template-dialog.tsx`      | Create/edit template dialog form                 |
| `apps/web/src/hooks/use-workspaces.ts`                              | TanStack Query hooks for workspace API           |
| `apps/web/src/hooks/use-workspace-templates.ts`                     | TanStack Query hooks for template API            |

#### 5.2.2 User Management Feature Area

| File Path                                                       | Purpose                                          |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/pages/user-list-page.tsx`                         | Tenant user list with search/filter              |
| `apps/web/src/pages/role-management-page.tsx`                   | Role cards, action matrix table (Screen 11)      |
| `apps/web/src/pages/permission-association-page.tsx`            | Workspace permission association (Screen 12)     |
| `apps/web/src/components/user/add-member-dialog.tsx`            | Add member: search existing users or invite new  |
| `apps/web/src/components/user/remove-user-dialog.tsx`           | User removal with resource reassignment flow     |
| `apps/web/src/components/user/role-card.tsx`                    | Role display card (tenant/workspace scope badge) |
| `apps/web/src/components/user/action-matrix-table.tsx`          | Collapsible action permission matrix             |
| `apps/web/src/components/user/permission-association-panel.tsx` | Core perms + member roles + plugin overrides     |
| `apps/web/src/hooks/use-users.ts`                               | TanStack Query hooks for user management API     |
| `apps/web/src/hooks/use-roles.ts`                               | TanStack Query hooks for roles/action-matrix API |
| `apps/web/src/hooks/use-invitations.ts`                         | TanStack Query hooks for invitation API          |

#### 5.2.3 Tenant Settings Feature Area

| File Path                                           | Purpose                                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `apps/web/src/pages/tenant-settings-page.tsx`       | General settings: name (editable), slug (read-only)  |
| `apps/web/src/pages/tenant-branding-page.tsx`       | Branding: logo upload, color picker, dark mode       |
| `apps/web/src/pages/tenant-auth-config-page.tsx`    | Auth realm config: MFA, password policy, IdPs        |
| `apps/web/src/components/settings/color-picker.tsx` | Color picker with hex input and swatch preview       |
| `apps/web/src/hooks/use-tenant-settings.ts`         | TanStack Query hooks for tenant settings API         |
| `apps/web/src/hooks/use-branding.ts`                | TanStack Query hooks for branding API + live preview |

#### 5.2.4 User Profile Feature Area

| File Path                             | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `apps/web/src/pages/profile-page.tsx` | User profile: display name, avatar, tz, lang, notifs |
| `apps/web/src/hooks/use-profile.ts`   | TanStack Query hooks for profile API                 |

#### 5.2.5 Audit Log Feature Area

| File Path                                          | Purpose                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/pages/audit-log-page.tsx`            | Audit log with filters (date range, action type) |
| `apps/web/src/components/audit/expandable-row.tsx` | Expandable table row for before/after diff       |
| `apps/web/src/hooks/use-audit-log.ts`              | TanStack Query hooks for audit log API           |

#### 5.2.6 Shared UI Components (New to @plexica/ui)

These are generic, reusable components that belong in the design system:

| File Path                                          | Purpose                                              |
| -------------------------------------------------- | ---------------------------------------------------- |
| `packages/ui/src/components/file-upload.tsx`       | File upload with drag-drop, preview, size/type check |
| `packages/ui/src/components/confirm-dialog.tsx`    | Confirm dialog (warning/destructive variants)        |
| `packages/ui/src/components/toggle-switch.tsx`     | Toggle switch (Radix UI Switch primitive)            |
| `packages/ui/src/components/date-range-picker.tsx` | Date range picker with calendar popover              |
| `packages/ui/src/components/inline-filter.tsx`     | Horizontal filter bar with multiple controls         |
| `packages/ui/src/components/pagination.tsx`        | Pagination controls (page size, prev/next)           |
| `packages/ui/src/components/select.tsx`            | Select dropdown (Radix UI Select)                    |
| `packages/ui/src/components/badge.tsx`             | Status/role badge component                          |
| `packages/ui/src/components/tabs.tsx`              | Tab navigation (Radix UI Tabs)                       |
| `packages/ui/src/components/textarea.tsx`          | Textarea input component                             |
| `packages/ui/src/components/popover.tsx`           | Popover (Radix UI Popover) for workspace selector    |

#### 5.2.7 TanStack Router Routes

New route files to add to the existing shell route tree:

| Route Path                             | Page Component            | Parent     |
| -------------------------------------- | ------------------------- | ---------- |
| `/workspaces`                          | WorkspaceListPage         | shellRoute |
| `/workspaces/$workspaceId`             | WorkspaceDetailPage       | shellRoute |
| `/workspaces/$workspaceId/settings`    | WorkspaceSettingsPage     | shellRoute |
| `/workspaces/$workspaceId/members`     | WorkspaceMembersPage      | shellRoute |
| `/workspaces/$workspaceId/permissions` | PermissionAssociationPage | shellRoute |
| `/settings`                            | TenantSettingsPage        | shellRoute |
| `/settings/branding`                   | TenantBrandingPage        | shellRoute |
| `/settings/auth`                       | TenantAuthConfigPage      | shellRoute |
| `/settings/templates`                  | WorkspaceTemplatesPage    | shellRoute |
| `/users`                               | UserListPage              | shellRoute |
| `/users/roles`                         | RoleManagementPage        | shellRoute |
| `/profile`                             | ProfilePage               | shellRoute |
| `/audit-log`                           | AuditLogPage              | shellRoute |

**Reused Existing Components** (from Spec 002 / @plexica/ui):
Button, Input, Dialog, Toast, Table, AppShell, Sidebar, SidebarNavItem,
Header, Avatar, UserMenu, SkeletonLoader, EmptyState, StatusBadge,
DropdownMenu.

---

### 5.3 Shared Packages

#### 5.3.1 `packages/ui/` — New Design System Components

11 new components (listed in §5.2.6). Each requires:

- Component implementation (`.tsx`)
- Storybook story (`.stories.tsx`)
- Re-export from `packages/ui/src/index.ts`

No changes to existing components except:

- **Header** (`apps/web/src/components/layout/header.tsx`) — add WorkspaceSelectorDropdown
- **Sidebar** (`apps/web/src/components/layout/sidebar.tsx`) — add workspace-related nav items

#### 5.3.2 `packages/i18n/` — Not yet extracted

The i18n package is not yet extracted (translations currently live in
`apps/web/src/i18n/messages.en.ts`). New translation keys will be added
to the existing `messages.en.ts` file. Approximate new key count: ~180 keys
covering all 14 screens defined in the design-spec.

**Key groups to add**:

| Key Prefix             | Description                      | Approx Count |
| ---------------------- | -------------------------------- | ------------ |
| `workspace.*`          | Workspace list, detail, settings | ~35          |
| `workspace.create.*`   | Create workspace dialog          | ~10          |
| `workspace.template.*` | Template management              | ~15          |
| `member.*`             | Member management, invitations   | ~25          |
| `user.*`               | Tenant user list, user removal   | ~15          |
| `role.*`               | Role management, action matrix   | ~15          |
| `permission.*`         | Permission association           | ~10          |
| `settings.*`           | Tenant settings, branding        | ~15          |
| `auth.config.*`        | Auth realm configuration         | ~15          |
| `profile.*`            | User profile page                | ~10          |
| `audit.*`              | Audit log page                   | ~10          |
| `common.filter.*`      | Shared filter labels             | ~5           |

#### 5.3.3 `packages/sdk/` — No Changes

No SDK changes in this spec. The plugin SDK is not affected by core features.

---

## 6. File Map

### 6.1 New Files to Create

#### Backend Services

| File Path                                                      | Type       | Purpose                                             |
| -------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `services/core-api/src/modules/workspace/routes.ts`            | Routes     | Workspace CRUD, hierarchy, reparent, restore        |
| `services/core-api/src/modules/workspace/service.ts`           | Service    | Workspace business logic, path recalculation        |
| `services/core-api/src/modules/workspace/repository.ts`        | Repository | Prisma queries for workspace tables                 |
| `services/core-api/src/modules/workspace/schema.ts`            | Schema     | Zod validation for workspace requests               |
| `services/core-api/src/modules/workspace/types.ts`             | Types      | Workspace domain types and DTOs                     |
| `services/core-api/src/modules/workspace-member/routes.ts`     | Routes     | Workspace member CRUD endpoints                     |
| `services/core-api/src/modules/workspace-member/service.ts`    | Service    | Membership logic, role changes, duplicate checks    |
| `services/core-api/src/modules/workspace-member/repository.ts` | Repository | Prisma queries for workspace_member table           |
| `services/core-api/src/modules/workspace-member/schema.ts`     | Schema     | Zod validation for member requests                  |
| `services/core-api/src/modules/workspace-member/types.ts`      | Types      | Member domain types and DTOs                        |
| `services/core-api/src/modules/invitation/routes.ts`           | Routes     | Invite, list, resend, accept endpoints              |
| `services/core-api/src/modules/invitation/service.ts`          | Service    | Invitation lifecycle, token generation, accept flow |
| `services/core-api/src/modules/invitation/repository.ts`       | Repository | Prisma queries for invitation table                 |
| `services/core-api/src/modules/invitation/schema.ts`           | Schema     | Zod validation for invitation requests              |
| `services/core-api/src/modules/invitation/types.ts`            | Types      | Invitation domain types and DTOs                    |
| `services/core-api/src/modules/user-management/routes.ts`      | Routes     | Tenant user list, remove, workspaces, roles         |
| `services/core-api/src/modules/user-management/service.ts`     | Service    | User removal, resource reassignment, role listing   |
| `services/core-api/src/modules/user-management/repository.ts`  | Repository | Prisma queries for user_profile + aggregation       |
| `services/core-api/src/modules/user-management/schema.ts`      | Schema     | Zod validation for user management requests         |
| `services/core-api/src/modules/user-management/types.ts`       | Types      | User management domain types and DTOs               |
| `services/core-api/src/modules/user-profile/routes.ts`         | Routes     | Profile GET/PATCH, avatar upload                    |
| `services/core-api/src/modules/user-profile/service.ts`        | Service    | Profile update, avatar MinIO upload, KC sync        |
| `services/core-api/src/modules/user-profile/repository.ts`     | Repository | Prisma queries for user_profile table               |
| `services/core-api/src/modules/user-profile/schema.ts`         | Schema     | Zod validation for profile requests                 |
| `services/core-api/src/modules/user-profile/types.ts`          | Types      | Profile domain types and DTOs                       |
| `services/core-api/src/modules/tenant-settings/routes.ts`      | Routes     | Settings, branding, auth-config endpoints           |
| `services/core-api/src/modules/tenant-settings/service.ts`     | Service    | Settings update, branding upload, KC auth config    |
| `services/core-api/src/modules/tenant-settings/repository.ts`  | Repository | Prisma queries for tenant_branding + tenant_configs |
| `services/core-api/src/modules/tenant-settings/schema.ts`      | Schema     | Zod validation for settings requests                |
| `services/core-api/src/modules/tenant-settings/types.ts`       | Types      | Settings domain types and DTOs                      |
| `services/core-api/src/modules/audit-log/routes.ts`            | Routes     | Query audit log, list action types                  |
| `services/core-api/src/modules/audit-log/service.ts`           | Service    | Audit log query with filters                        |
| `services/core-api/src/modules/audit-log/repository.ts`        | Repository | Prisma queries for audit_log table                  |
| `services/core-api/src/modules/audit-log/writer.ts`            | Library    | Fire-and-forget audit log writer (used by all mods) |
| `services/core-api/src/modules/audit-log/action-types.ts`      | Constants  | Static registry of all action types with labels     |
| `services/core-api/src/modules/audit-log/schema.ts`            | Schema     | Zod validation for audit log queries                |
| `services/core-api/src/modules/audit-log/types.ts`             | Types      | Audit log domain types and DTOs                     |
| `services/core-api/src/modules/abac/engine.ts`                 | Service    | Core ABAC evaluation engine                         |
| `services/core-api/src/modules/abac/policies.ts`               | Constants  | Policy definitions (DR-04 action matrix)            |
| `services/core-api/src/modules/abac/decision-logger.ts`        | Library    | ABAC decision log writer (with sampling)            |
| `services/core-api/src/modules/abac/types.ts`                  | Types      | AbacContext, AbacDecision, PolicyRule               |
| `services/core-api/src/middleware/abac.ts`                     | Middleware | ABAC preHandler hook for workspace-scoped routes    |
| `services/core-api/src/lib/email.ts`                           | Library    | SMTP client (nodemailer) for invitation emails      |
| `services/core-api/src/lib/file-upload.ts`                     | Library    | Multipart upload validation (size, type)            |
| `services/core-api/src/lib/pagination.ts`                      | Library    | Shared pagination types and query helpers           |
| `services/core-api/src/lib/slug.ts`                            | Library    | Slug generation from workspace names                |
| `services/core-api/src/lib/crypto.ts`                          | Library    | Secure random token generation                      |

#### Frontend (Web App)

| File Path                                                           | Type      | Purpose                                             |
| ------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| `apps/web/src/pages/workspace-list-page.tsx`                        | Page      | Workspace list with hierarchy, search, filters      |
| `apps/web/src/pages/workspace-detail-page.tsx`                      | Page      | Workspace detail: info, children, members preview   |
| `apps/web/src/pages/workspace-settings-page.tsx`                    | Page      | Workspace name, description, danger zone            |
| `apps/web/src/pages/workspace-members-page.tsx`                     | Page      | Workspace member management                         |
| `apps/web/src/pages/workspace-templates-page.tsx`                   | Page      | Template list and management                        |
| `apps/web/src/pages/user-list-page.tsx`                             | Page      | Tenant user directory                               |
| `apps/web/src/pages/role-management-page.tsx`                       | Page      | Role cards + action matrix (Screen 11)              |
| `apps/web/src/pages/permission-association-page.tsx`                | Page      | Workspace permission association (Screen 12)        |
| `apps/web/src/pages/tenant-settings-page.tsx`                       | Page      | Tenant general settings                             |
| `apps/web/src/pages/tenant-branding-page.tsx`                       | Page      | Branding: logo, color, dark mode                    |
| `apps/web/src/pages/tenant-auth-config-page.tsx`                    | Page      | Auth realm configuration                            |
| `apps/web/src/pages/profile-page.tsx`                               | Page      | User profile settings                               |
| `apps/web/src/pages/audit-log-page.tsx`                             | Page      | Audit log with filters                              |
| `apps/web/src/components/workspace/workspace-tree.tsx`              | Component | Hierarchical tree navigation                        |
| `apps/web/src/components/workspace/workspace-selector-dropdown.tsx` | Component | Header workspace switcher dropdown                  |
| `apps/web/src/components/workspace/create-workspace-dialog.tsx`     | Component | Create workspace form dialog                        |
| `apps/web/src/components/workspace/template-card.tsx`               | Component | Template display card                               |
| `apps/web/src/components/workspace/child-workspace-editor.tsx`      | Component | Template child list editor                          |
| `apps/web/src/components/workspace/create-template-dialog.tsx`      | Component | Create/edit template dialog                         |
| `apps/web/src/components/user/add-member-dialog.tsx`                | Component | Add member with search/invite                       |
| `apps/web/src/components/user/remove-user-dialog.tsx`               | Component | User removal with reassignment                      |
| `apps/web/src/components/user/role-card.tsx`                        | Component | Role display card                                   |
| `apps/web/src/components/user/action-matrix-table.tsx`              | Component | Action permission matrix table                      |
| `apps/web/src/components/user/permission-association-panel.tsx`     | Component | Composite permission management panel               |
| `apps/web/src/components/settings/color-picker.tsx`                 | Component | Color picker with hex input                         |
| `apps/web/src/components/audit/expandable-row.tsx`                  | Component | Expandable audit log table row                      |
| `apps/web/src/hooks/use-workspaces.ts`                              | Hook      | TanStack Query hooks for workspaces                 |
| `apps/web/src/hooks/use-workspace-templates.ts`                     | Hook      | TanStack Query hooks for templates                  |
| `apps/web/src/hooks/use-users.ts`                                   | Hook      | TanStack Query hooks for user management            |
| `apps/web/src/hooks/use-roles.ts`                                   | Hook      | TanStack Query hooks for roles/matrix               |
| `apps/web/src/hooks/use-invitations.ts`                             | Hook      | TanStack Query hooks for invitations                |
| `apps/web/src/hooks/use-tenant-settings.ts`                         | Hook      | TanStack Query hooks for tenant settings            |
| `apps/web/src/hooks/use-branding.ts`                                | Hook      | TanStack Query hooks for branding + live preview    |
| `apps/web/src/hooks/use-profile.ts`                                 | Hook      | TanStack Query hooks for user profile               |
| `apps/web/src/hooks/use-audit-log.ts`                               | Hook      | TanStack Query hooks for audit log                  |
| `apps/web/src/hooks/use-abac.ts`                                    | Hook      | ABAC permission check hook (UI-level gating)        |
| `apps/web/src/types/workspace.ts`                                   | Types     | Workspace-related TypeScript interfaces             |
| `apps/web/src/types/user-management.ts`                             | Types     | User management TypeScript interfaces               |
| `apps/web/src/types/settings.ts`                                    | Types     | Settings/branding/auth-config TypeScript interfaces |
| `apps/web/src/types/audit.ts`                                       | Types     | Audit log TypeScript interfaces                     |
| `apps/web/src/stores/workspace-store.ts`                            | Store     | Zustand store: current workspace context            |

#### Shared Packages

| File Path                                               | Type      | Purpose                              |
| ------------------------------------------------------- | --------- | ------------------------------------ |
| `packages/ui/src/components/file-upload.tsx`            | Component | Drag-drop file upload with preview   |
| `packages/ui/src/components/confirm-dialog.tsx`         | Component | Confirm dialog (warning/destructive) |
| `packages/ui/src/components/toggle-switch.tsx`          | Component | Toggle switch (Radix UI Switch)      |
| `packages/ui/src/components/date-range-picker.tsx`      | Component | Date range picker with calendar      |
| `packages/ui/src/components/inline-filter.tsx`          | Component | Horizontal filter bar                |
| `packages/ui/src/components/pagination.tsx`             | Component | Pagination controls                  |
| `packages/ui/src/components/select.tsx`                 | Component | Select dropdown (Radix UI Select)    |
| `packages/ui/src/components/badge.tsx`                  | Component | Status/role badge                    |
| `packages/ui/src/components/tabs.tsx`                   | Component | Tab navigation (Radix UI Tabs)       |
| `packages/ui/src/components/textarea.tsx`               | Component | Textarea input                       |
| `packages/ui/src/components/popover.tsx`                | Component | Popover (Radix UI Popover)           |
| `packages/ui/src/stories/file-upload.stories.tsx`       | Story     | Storybook story for FileUpload       |
| `packages/ui/src/stories/confirm-dialog.stories.tsx`    | Story     | Storybook story for ConfirmDialog    |
| `packages/ui/src/stories/toggle-switch.stories.tsx`     | Story     | Storybook story for ToggleSwitch     |
| `packages/ui/src/stories/date-range-picker.stories.tsx` | Story     | Storybook story for DateRangePicker  |
| `packages/ui/src/stories/inline-filter.stories.tsx`     | Story     | Storybook story for InlineFilter     |
| `packages/ui/src/stories/pagination.stories.tsx`        | Story     | Storybook story for Pagination       |
| `packages/ui/src/stories/select.stories.tsx`            | Story     | Storybook story for Select           |
| `packages/ui/src/stories/badge.stories.tsx`             | Story     | Storybook story for Badge            |
| `packages/ui/src/stories/tabs.stories.tsx`              | Story     | Storybook story for Tabs             |
| `packages/ui/src/stories/textarea.stories.tsx`          | Story     | Storybook story for Textarea         |
| `packages/ui/src/stories/popover.stories.tsx`           | Story     | Storybook story for Popover          |

#### Tests

| File Path                                                          | Type        | Purpose                                           |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------- |
| `services/core-api/src/__tests__/workspace.test.ts`                | Integration | Workspace CRUD, hierarchy, reparent, templates    |
| `services/core-api/src/__tests__/workspace-members.test.ts`        | Integration | Member add/remove/role change                     |
| `services/core-api/src/__tests__/invitation.test.ts`               | Integration | Invite, accept, resend, expiry                    |
| `services/core-api/src/__tests__/user-management.test.ts`          | Integration | User list, remove, reassignment                   |
| `services/core-api/src/__tests__/user-profile.test.ts`             | Integration | Profile CRUD, avatar upload                       |
| `services/core-api/src/__tests__/tenant-settings.test.ts`          | Integration | Settings, branding, auth config                   |
| `services/core-api/src/__tests__/audit-log.test.ts`                | Integration | Audit log query, action types                     |
| `services/core-api/src/__tests__/abac.test.ts`                     | Integration | ABAC engine, policy enforcement, decision logging |
| `services/core-api/src/__tests__/abac-workspace-isolation.test.ts` | Integration | Cross-workspace access prevention                 |
| `apps/web/e2e/workspace-crud.spec.ts`                              | E2E         | Workspace create, list, detail, update, delete    |
| `apps/web/e2e/workspace-hierarchy.spec.ts`                         | E2E         | Hierarchy, reparent, depth limit                  |
| `apps/web/e2e/workspace-members.spec.ts`                           | E2E         | Member management, role changes                   |
| `apps/web/e2e/invitation-flow.spec.ts`                             | E2E         | Full invite → accept → login flow                 |
| `apps/web/e2e/user-management.spec.ts`                             | E2E         | User list, removal, reassignment                  |
| `apps/web/e2e/rbac-permissions.spec.ts`                            | E2E         | Role-based access control across screens          |
| `apps/web/e2e/tenant-settings.spec.ts`                             | E2E         | Settings + branding + auth config                 |
| `apps/web/e2e/user-profile.spec.ts`                                | E2E         | Profile update, avatar upload                     |
| `apps/web/e2e/audit-log.spec.ts`                                   | E2E         | Audit log filtering, expandable detail            |
| `apps/web/e2e/workspace-templates.spec.ts`                         | E2E         | Template CRUD, instantiation                      |
| `apps/web/e2e/role-management.spec.ts`                             | E2E         | Role cards, action matrix, CSV export             |
| `apps/web/e2e/permission-association.spec.ts`                      | E2E         | Permission association panel, role selector       |

#### Migrations

| File Path                                                             | Type      | Purpose                                   |
| --------------------------------------------------------------------- | --------- | ----------------------------------------- |
| `services/core-api/prisma/migrations/003_core_features/migration.sql` | Migration | All new tenant-schema tables (§3.1)       |
| `services/core-api/prisma/seed/003-built-in-templates.ts`             | Seed      | 3 built-in workspace templates per tenant |
| `services/core-api/prisma/seed/003-default-branding.ts`               | Seed      | Default tenant_branding row per tenant    |

---

### 6.2 Existing Files to Modify

| File Path                                                     | Change Description                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `services/core-api/src/index.ts`                              | Register new module routes in tenant-scoped plugin scope; add admin routes |
| `services/core-api/src/lib/app-error.ts`                      | Add 14 new error classes (§4.7 error codes)                                |
| `services/core-api/src/lib/config.ts`                         | Add ABAC cache TTL, invitation expiry days, avatar/logo size limits        |
| `services/core-api/src/lib/rate-limit-config.ts`              | Add per-route rate limit configs for new endpoints (§4.6)                  |
| `services/core-api/src/lib/keycloak-admin.ts`                 | Add user management functions (create, disable, terminate sessions)        |
| `services/core-api/src/lib/minio-client.ts`                   | Add helper functions for avatar/logo upload paths                          |
| `services/core-api/src/modules/tenant/tenant-provisioning.ts` | Extend provisioning to seed templates and branding for new tenants         |
| `services/core-api/prisma/schema.prisma`                      | Add new models for tenant-schema tables                                    |
| `apps/web/src/router.tsx`                                     | Add 13 new route definitions under shellRoute                              |
| `apps/web/src/components/layout/header.tsx`                   | Add WorkspaceSelectorDropdown to header                                    |
| `apps/web/src/components/layout/sidebar.tsx`                  | Add workspace, users, settings, audit nav items                            |
| `apps/web/src/i18n/messages.en.ts`                            | Add ~180 new translation keys for all new screens                          |
| `apps/web/src/services/api-client.ts`                         | Add API functions for all new endpoints                                    |
| `apps/web/src/stores/auth-store.ts`                           | Add currentWorkspaceId to auth store (workspace context)                   |
| `apps/web/src/types/auth.ts`                                  | Extend AuthUser type with tenant role information                          |
| `packages/ui/src/index.ts`                                    | Re-export 11 new components                                                |

---

### 6.3 File Count Summary

| Category            | New Files | Modified Files |
| ------------------- | --------- | -------------- |
| Backend modules     | 46        | 7              |
| Frontend components | 41        | 6              |
| Tests               | 21        | 0              |
| Migrations / Seeds  | 3         | 1              |
| Shared packages     | 22        | 1              |
| Config / infra      | 0         | 1              |
| **Total**           | **133**   | **16**         |

---

## 7. Dependencies

### 7.1 New npm Packages Required

#### `services/core-api`

| Package              | Version | Purpose                               | Module Uses                   | ADR Required?                        |
| -------------------- | ------- | ------------------------------------- | ----------------------------- | ------------------------------------ |
| `nodemailer`         | ^6.9    | SMTP email sending for invitations    | invitation module             | No — SMTP prescribed by architecture |
| `@types/nodemailer`  | ^6.4    | TypeScript types for nodemailer       | invitation module             | No — types package                   |
| `@fastify/multipart` | ^9      | Multipart file upload for avatar/logo | user-profile, tenant-settings | No — Fastify ecosystem               |

**DECISION: `nodemailer` does not require an ADR.** It is the standard Node.js
SMTP library and implements the SMTP capability already prescribed by the
architecture (environment variable `SMTP_HOST` / `SMTP_PORT` already exists in
`config.ts`). It is not a "new core dependency" per the Constitution — it
fulfills an existing architectural requirement.

**DECISION: `@fastify/multipart` does not require an ADR.** It is the
official Fastify plugin for multipart uploads and is required by Constitution
Rule 3 (one way to handle file uploads within Fastify). No alternative was
considered because Fastify does not natively parse multipart bodies.

#### `apps/web`

| Package                   | Version | Purpose                             | Module Uses           | ADR Required?            |
| ------------------------- | ------- | ----------------------------------- | --------------------- | ------------------------ |
| `@radix-ui/react-popover` | latest  | WorkspaceSelectorDropdown popover   | workspace components  | No — Radix UI in stack   |
| `@radix-ui/react-switch`  | latest  | ToggleSwitch component              | @plexica/ui           | No — Radix UI in stack   |
| `@radix-ui/react-tabs`    | latest  | Tabs component                      | @plexica/ui           | No — Radix UI in stack   |
| `@radix-ui/react-select`  | latest  | Select dropdown component           | @plexica/ui           | No — Radix UI in stack   |
| `react-hook-form`         | latest  | Form handling (Constitution Rule 3) | all form pages        | No — in stack            |
| `@hookform/resolvers`     | latest  | Zod resolver for react-hook-form    | all form pages        | No — RHF companion       |
| `zod`                     | latest  | Frontend validation schemas         | all forms             | No — in stack            |
| `react-colorful`          | latest  | Color picker UI for branding page   | ColorPicker component | **Evaluate** (see below) |

**DECISION: `react-colorful` — ADR NOT required, but decision documented here.**
`react-colorful` is a tiny (2.4KB gzip), zero-dependency color picker. The
alternative would be building a custom color picker from scratch. This is a
leaf UI dependency with no architectural impact (no data model, auth, or
infrastructure changes). Per Constitution "ADRs: Only for significant decisions
— data model, auth, infrastructure, core dependencies", a leaf UI library is
not a core dependency. If the team prefers a native HTML `<input type="color">`
fallback, the ColorPicker component can be implemented without this dependency
(with reduced UX quality).

#### `packages/ui`

| Package                   | Version | Purpose                | ADR Required? |
| ------------------------- | ------- | ---------------------- | ------------- |
| `@radix-ui/react-switch`  | latest  | ToggleSwitch primitive | No — Radix UI |
| `@radix-ui/react-popover` | latest  | Popover primitive      | No — Radix UI |
| `@radix-ui/react-tabs`    | latest  | Tabs primitive         | No — Radix UI |
| `@radix-ui/react-select`  | latest  | Select primitive       | No — Radix UI |

**Note**: These Radix UI packages are already part of the prescribed tech stack
(Constitution: "Primitives: Radix UI"). They are added to `packages/ui` since
that is where the design system components live. They will also be peer
dependencies in `apps/web`.

---

### 7.2 Internal Module Dependencies

```
services/core-api module dependency graph:

  workspace/routes ─────→ workspace/service ─────→ workspace/repository
       │                       │                        │
       │                       ├──→ abac/engine          ├──→ tenant database (Prisma)
       │                       ├──→ audit-log/writer      │
       │                       └──→ slug (lib)           │
       │                                                  │
  workspace-member/routes ──→ workspace-member/service ──→ workspace-member/repository
       │                          │                        │
       │                          ├──→ abac/engine          ├──→ tenant database
       │                          └──→ audit-log/writer      │
       │                                                      │
  invitation/routes ────────→ invitation/service ────────→ invitation/repository
       │                          │                        │
       │                          ├──→ email (lib)          ├──→ tenant database
       │                          ├──→ keycloak-admin (lib) │
       │                          ├──→ crypto (lib)         │
       │                          ├──→ audit-log/writer      │
       │                          └──→ workspace-member/service (on accept)
       │
  user-management/routes ───→ user-management/service ───→ user-management/repository
       │                          │                        │
       │                          ├──→ keycloak-admin (lib) ├──→ tenant database
       │                          └──→ audit-log/writer      │
       │
  user-profile/routes ──────→ user-profile/service ──────→ user-profile/repository
       │                          │                        │
       │                          ├──→ minio-client (lib)   ├──→ tenant database
       │                          ├──→ keycloak-admin (lib) │
       │                          ├──→ file-upload (lib)    │
       │                          └──→ audit-log/writer      │
       │
  tenant-settings/routes ───→ tenant-settings/service ───→ tenant-settings/repository
       │                          │                        │
       │                          ├──→ keycloak-admin (lib) ├──→ tenant database
       │                          ├──→ minio-client (lib)   │    + core database (tenant_configs)
       │                          ├──→ file-upload (lib)    │
       │                          └──→ audit-log/writer      │
       │
  audit-log/routes ─────────→ audit-log/service ─────────→ audit-log/repository
                                                            │
                                                            └──→ tenant database
  abac/engine ──→ abac/policies
       │       ──→ abac/decision-logger ──→ tenant database
       │       ──→ redis (lib) ──→ Redis (permission cache)
       └──────→ workspace-member/repository (role lookup)

  Middleware chain (per request):
  auth-middleware → tenant-context → abac (per-route) → route handler
```

**Frontend dependency graph**:

```
  apps/web pages ──→ hooks (use-*.ts) ──→ api-client.ts ──→ Backend API
       │                                       │
       ├──→ @plexica/ui components              └──→ auth-store (token)
       ├──→ workspace-store (current workspace)
       └──→ i18n/messages.en.ts (react-intl)
```

---

### 7.3 External Service Dependencies

| Service        | Interaction                                          | New?     | Module Using It         |
| -------------- | ---------------------------------------------------- | -------- | ----------------------- |
| **Keycloak**   | Create user in realm (invitation accept)             | New      | invitation/service      |
| **Keycloak**   | Disable user in realm (user removal)                 | New      | user-management/service |
| **Keycloak**   | Terminate user sessions (backchannel logout)         | New      | user-management/service |
| **Keycloak**   | Sync display name to user attributes                 | New      | user-profile/service    |
| **Keycloak**   | Read/write realm config (MFA, IdPs, password policy) | New      | tenant-settings/service |
| **Redis**      | ABAC permission set cache (per user per workspace)   | New      | abac/engine             |
| **Redis**      | Rate limiting (existing, new route keys)             | Existing | rate-limit-config       |
| **PostgreSQL** | Tenant schema — new tables (§3.1)                    | New      | All modules             |
| **MinIO**      | Avatar upload (`avatars/` prefix in tenant bucket)   | New      | user-profile/service    |
| **MinIO**      | Logo upload (`branding/` prefix in tenant bucket)    | New      | tenant-settings/service |
| **SMTP**       | Invitation email delivery (Mailpit in dev)           | New      | invitation/service      |
| **Kafka**      | Audit events (deferred — not in this spec)           | No       | —                       |

**Note**: Kafka event publishing for workspace/member/settings changes is
deferred to Spec 004 (Plugin system). Audit logging in this spec writes
directly to the database. Kafka integration will be added when plugins need
to subscribe to domain events.

---

### 7.4 Configuration Changes

New environment variables and config additions to `services/core-api/src/lib/config.ts`:

| Variable / Config Key           | Type   | Default     | Purpose                                                |
| ------------------------------- | ------ | ----------- | ------------------------------------------------------ |
| `ABAC_CACHE_TTL_MS`             | number | `300_000`   | Redis TTL for ABAC permission cache (5 min default)    |
| `INVITATION_EXPIRY_DAYS`        | number | `7`         | Invitation token validity period in days               |
| `AVATAR_MAX_SIZE_BYTES`         | number | `1_048_576` | Max avatar file size (1MB per NFR-09)                  |
| `LOGO_MAX_SIZE_BYTES`           | number | `2_097_152` | Max logo file size (2MB per NFR-07)                    |
| `ABAC_SAMPLE_RATE`              | number | `0.1`       | ABAC decision log sampling rate (10% at INFO)          |
| `AUDIT_LOG_RETENTION_DAYS`      | number | `365`       | Audit log retention (1 year default)                   |
| `ABAC_LOG_INFO_RETENTION_DAYS`  | number | `30`        | ABAC decision log retention at INFO level (per DR-09)  |
| `ABAC_LOG_DEBUG_RETENTION_DAYS` | number | `7`         | ABAC decision log retention at DEBUG level (per DR-09) |

These are all application config (Zod-validated defaults, overridable by env
vars). No new Docker Compose services are required — SMTP (Mailpit) is already
in the stack.

**Frontend config** (no new env vars — all tenant-specific config fetched via API):

- Workspace context stored in Zustand `workspace-store` (sessionStorage)
- Branding CSS custom properties applied from `GET /api/v1/tenant/branding`

---

## Cross-References

| Document      | Path                                                             |
| ------------- | ---------------------------------------------------------------- |
| Spec 003      | `.forge/specs/003-core-features/spec.md`                         |
| User Journeys | `.forge/specs/003-core-features/user-journey.md`                 |
| Design Spec   | `.forge/specs/003-core-features/design-spec.md`                  |
| Constitution  | `.forge/constitution.md`                                         |
| Architecture  | `.forge/architecture/architecture.md`                            |
| Decision Log  | `.forge/knowledge/decision-log.md`                               |
| ADR-001       | `.forge/knowledge/adr/adr-001-schema-per-tenant.md`              |
| ADR-003       | `.forge/knowledge/adr/adr-003-abac-tree-walk.md`                 |
| ADR-011       | `.forge/knowledge/adr/adr-011-keycloak-admin-api-integration.md` |
| ADR-012       | `.forge/knowledge/adr/adr-012-fastify-rate-limit.md`             |

---

## 8. Testing Strategy

### 8.1 E2E Tests (Playwright)

All E2E tests run against the full production stack: browser → Vite dev server
→ Fastify API → PostgreSQL → Keycloak → MinIO → Mailpit. No mocks, no test
tokens, no separate test app (per AGENTS.md testing rules).

**Common prerequisites** for all E2E tests:

- Docker Compose stack running (PostgreSQL, Keycloak, Redis, MinIO, Mailpit)
- Seeded Keycloak realm with test tenant (`e2e-tenant`) and test users
  (admin, member, viewer)
- Seeded tenant schema with built-in workspace templates and default branding
- Playwright config with `baseURL` pointing to Vite dev server

#### E2E-01: Workspace CRUD (`apps/web/e2e/workspace-crud.spec.ts`)

| Test                                                 | Verifies               | AC Ref | Prerequisites           |
| ---------------------------------------------------- | ---------------------- | ------ | ----------------------- |
| Admin creates workspace with name, sees it in list   | FR-002, AC-01          | AC-01  | Admin logged in         |
| Admin creates child workspace under parent           | FR-004, AC-01          | AC-01  | Parent workspace exists |
| Admin views workspace detail with children listed    | FR-003                 | AC-01  | Workspace with children |
| Admin updates workspace name (PATCH)                 | FR-006                 | AC-01  | Workspace exists        |
| Admin soft-deletes workspace, children also archived | FR-007, AC-01, Edge #1 | AC-01  | Parent with 2+ children |
| Admin restores archived workspace within 30 days     | DR-01, AC-01           | AC-01  | Archived workspace      |
| Restore fails for workspace past 30-day retention    | Edge #13               | AC-01  | Hard-deleted workspace  |
| Concurrent edit shows version conflict error         | Edge #14               | AC-01  | Two browser contexts    |

#### E2E-02: Workspace Hierarchy (`apps/web/e2e/workspace-hierarchy.spec.ts`)

| Test                                              | Verifies       | AC Ref | Prerequisites         |
| ------------------------------------------------- | -------------- | ------ | --------------------- |
| Admin reparents workspace, sidebar updates        | FR-009, AC-02  | AC-02  | 3-level hierarchy     |
| Reparent creating cycle rejected with error       | Edge #2, AC-02 | AC-02  | A→B→C hierarchy       |
| Reparent exceeding 10-level depth rejected        | Edge #3, AC-02 | AC-02  | 9-level deep tree     |
| Sidebar tree reflects materialized path correctly | FR-004         | AC-02  | Multi-level hierarchy |

#### E2E-03: Workspace Members (`apps/web/e2e/workspace-members.spec.ts`)

| Test                                        | Verifies      | AC Ref | Prerequisites         |
| ------------------------------------------- | ------------- | ------ | --------------------- |
| Admin adds existing user to workspace       | FR-005, AC-04 | AC-04  | Existing tenant user  |
| Admin changes member role (member → viewer) | FR-012, AC-16 | AC-16  | Workspace with member |
| Admin removes member from workspace         | FR-005, AC-05 | AC-05  | Workspace with member |
| Adding duplicate member shows 409 error     | Edge #15      | AC-04  | Existing member       |

#### E2E-04: Invitation Flow (`apps/web/e2e/invitation-flow.spec.ts`)

| Test                                               | Verifies              | AC Ref | Prerequisites         |
| -------------------------------------------------- | --------------------- | ------ | --------------------- |
| Admin invites new user, email received in Mailpit  | FR-011, AC-04, NFR-04 | AC-04  | Mailpit running       |
| Invited user clicks link, accepts, joins workspace | DR-05, AC-04          | AC-04  | Pending invitation    |
| Expired invite (>7 days) shows rejection page      | Edge #5, NFR-13       | AC-04  | Expired invitation    |
| Admin resends expired invite, new link works       | DR-05, AC-04          | AC-04  | Expired invitation    |
| Autocomplete shows existing tenant users           | FR-011, AC-04         | AC-04  | Multiple tenant users |

#### E2E-05: User Management (`apps/web/e2e/user-management.spec.ts`)

| Test                                          | Verifies               | AC Ref | Prerequisites        |
| --------------------------------------------- | ---------------------- | ------ | -------------------- |
| Admin views tenant user list with status      | FR-010                 | —      | Multiple users       |
| Admin removes user with resource reassignment | FR-016, AC-08, Edge #6 | AC-08  | User with resources  |
| Self-removal blocked with error               | Edge — SELF_REMOVAL    | AC-08  | Admin acting on self |
| Removed user's sessions terminated            | DR-06, AC-08           | AC-08  | Active user session  |

#### E2E-06: RBAC Permissions (`apps/web/e2e/rbac-permissions.spec.ts`)

| Test                                         | Verifies      | AC Ref | Prerequisites              |
| -------------------------------------------- | ------------- | ------ | -------------------------- |
| Viewer denied workspace create action        | FR-012, AC-05 | AC-05  | Viewer role user           |
| Member denied member management actions      | FR-012, AC-05 | AC-05  | Member role user           |
| Admin succeeds all operations                | FR-012, AC-05 | AC-05  | Admin role user            |
| Cross-workspace access returns 403/404       | FR-013, AC-06 | AC-06  | User with access to A only |
| Non-admin accessing role management gets 403 | AC-15         | AC-15  | Member role user           |

#### E2E-07: Tenant Settings (`apps/web/e2e/tenant-settings.spec.ts`)

| Test                                            | Verifies         | AC Ref | Prerequisites    |
| ----------------------------------------------- | ---------------- | ------ | ---------------- |
| Slug displayed read-only, name editable         | FR-019, AC-09    | AC-09  | Tenant admin     |
| Logo upload + color change applied immediately  | FR-020, AC-10    | AC-10  | Tenant admin     |
| Logo upload >2MB rejected                       | Edge #10, NFR-07 | AC-10  | Oversized file   |
| MFA toggle updates Keycloak realm               | FR-022, AC-12    | AC-12  | Tenant admin     |
| Disabling all auth methods blocked with warning | Edge #7          | AC-12  | Auth config page |

#### E2E-08: User Profile (`apps/web/e2e/user-profile.spec.ts`)

| Test                                          | Verifies              | AC Ref | Prerequisites          |
| --------------------------------------------- | --------------------- | ------ | ---------------------- |
| User updates display name, synced to Keycloak | FR-017, AC-13         | AC-13  | Any authenticated user |
| User uploads avatar, displayed across UI      | FR-017, AC-13, NFR-09 | AC-13  | Any authenticated user |
| Avatar >1MB rejected                          | Edge #8, NFR-09       | AC-13  | Oversized file         |
| Avatar in unsupported format rejected         | Edge #9               | AC-13  | GIF/BMP file           |
| Timezone/language change persists             | FR-017, AC-13         | AC-13  | Any authenticated user |

#### E2E-09: Audit Log (`apps/web/e2e/audit-log.spec.ts`)

| Test                                   | Verifies              | AC Ref | Prerequisites                   |
| -------------------------------------- | --------------------- | ------ | ------------------------------- |
| Audit log shows recent events          | FR-021, AC-11         | AC-11  | Events generated by prior tests |
| Filter by action type narrows results  | FR-021, AC-11         | AC-11  | Multiple event types            |
| Filter by date range narrows results   | FR-021, AC-11, NFR-03 | AC-11  | Events across date range        |
| Expandable row shows before/after diff | FR-021                | AC-11  | Role change event               |

#### E2E-10: Workspace Templates (`apps/web/e2e/workspace-templates.spec.ts`)

| Test                                                   | Verifies      | AC Ref | Prerequisites            |
| ------------------------------------------------------ | ------------- | ------ | ------------------------ |
| Built-in templates visible on create                   | FR-008, AC-03 | AC-03  | Default seed data        |
| Creating workspace from template instantiates children | FR-008, AC-03 | AC-03  | Template with child defs |
| Admin creates custom template                          | FR-008        | AC-03  | Tenant admin             |

#### E2E-11: Role Management (`apps/web/e2e/role-management.spec.ts`)

| Test                                          | Verifies             | AC Ref | Prerequisites    |
| --------------------------------------------- | -------------------- | ------ | ---------------- |
| Four built-in role cards displayed            | FR-025, AC-15        | AC-15  | Tenant admin     |
| Action matrix table shows correct permissions | FR-025, AC-15, DR-04 | AC-15  | Tenant admin     |
| Non-admin gets 403 on direct URL navigation   | AC-15                | AC-15  | Member role user |

#### E2E-12: Permission Association (`apps/web/e2e/permission-association.spec.ts`)

| Test                                           | Verifies      | AC Ref | Prerequisites          |
| ---------------------------------------------- | ------------- | ------ | ---------------------- |
| Core permissions table displayed read-only     | FR-026, AC-16 | AC-16  | Workspace admin        |
| Member role overview with inline selector      | FR-026, AC-16 | AC-16  | Workspace with members |
| Role change via inline dropdown persists       | FR-026, AC-16 | AC-16  | Workspace admin        |
| Plugin permissions section hidden (no plugins) | AC-16         | AC-16  | No plugins installed   |

**Total E2E test files: 12** | **Total E2E test cases: ~54**

---

### 8.2 Integration Tests (Vitest)

Integration tests run against real PostgreSQL (tenant schema), real Keycloak
(test realm), and real Redis. No mocks for core infrastructure. The test
server is the production Fastify app started via `server.inject()`.

**What runs for real vs what is mocked**:

| Service    | Real / Mocked | Rationale                                              |
| ---------- | ------------- | ------------------------------------------------------ |
| PostgreSQL | **Real**      | Schema-per-tenant — must test actual schema isolation  |
| Keycloak   | **Real**      | RS256 tokens, realm config — no fake tokens (Rule)     |
| Redis      | **Real**      | ABAC cache, rate limiting — must test real TTL/expiry  |
| MinIO      | **Real**      | File upload/download paths — must test real presigning |
| SMTP       | **Mocked**    | Nodemailer transport stubbed; email content asserted   |
| Kafka      | N/A           | Not used in this spec (deferred to Spec 004)           |

#### INT-01: Workspace API (`services/core-api/src/__tests__/workspace.test.ts`)

| Test Case                                                | Happy/Error | Verifies        |
| -------------------------------------------------------- | ----------- | --------------- |
| GET /workspaces returns user's accessible workspaces     | Happy       | FR-001, NFR-02  |
| GET /workspaces with search filter narrows results       | Happy       | FR-001          |
| POST /workspaces creates workspace with slug             | Happy       | FR-002          |
| POST /workspaces with parentId creates child             | Happy       | FR-004          |
| POST /workspaces with templateId instantiates children   | Happy       | FR-008          |
| POST /workspaces with depth >10 returns 400 MAX_DEPTH    | Error       | NFR-05, Edge #3 |
| POST /workspaces with duplicate slug returns 409         | Error       | FR-002          |
| GET /workspaces/:id returns detail with children         | Happy       | FR-003          |
| PATCH /workspaces/:id updates name and version           | Happy       | FR-006          |
| PATCH /workspaces/:id with stale version returns 409     | Error       | Edge #14        |
| DELETE /workspaces/:id archives workspace + descendants  | Happy       | FR-007, DR-01   |
| POST /workspaces/:id/restore restores archived workspace | Happy       | DR-01           |
| POST /workspaces/:id/restore on non-archived returns 400 | Error       | Edge #13        |
| POST /workspaces/:id/reparent recalculates paths         | Happy       | FR-009, NFR-10  |
| POST /workspaces/:id/reparent cycle returns 400          | Error       | Edge #2         |
| GET /workspaces/:id/hierarchy returns subtree            | Happy       | FR-004          |
| Unauthorized request returns 401                         | Error       | Auth            |

#### INT-02: Workspace Members (`services/core-api/src/__tests__/workspace-members.test.ts`)

| Test Case                                             | Happy/Error | Verifies            |
| ----------------------------------------------------- | ----------- | ------------------- |
| GET /workspaces/:id/members returns member list       | Happy       | FR-005              |
| POST /workspaces/:id/members adds member              | Happy       | FR-005, FR-012      |
| POST /workspaces/:id/members duplicate returns 409    | Error       | Edge #15            |
| DELETE /workspaces/:id/members/:userId removes member | Happy       | FR-005              |
| PATCH /workspaces/:id/members/:userId changes role    | Happy       | FR-012, FR-026      |
| ABAC: viewer denied member:invite                     | Error       | AC-05               |
| No email in member list response body                 | Security    | Constitution §Sec-6 |

#### INT-03: Invitation (`services/core-api/src/__tests__/invitation.test.ts`)

| Test Case                                                    | Happy/Error | Verifies               |
| ------------------------------------------------------------ | ----------- | ---------------------- |
| POST /users/invite creates invitation, sends email           | Happy       | FR-011, NFR-04         |
| POST /users/invite duplicate returns 409                     | Error       | INVITATION_EXISTS      |
| POST /users/invite existing tenant user returns 400          | Error       | USER_ALREADY_IN_TENANT |
| GET /workspaces/:id/invitations lists invitations            | Happy       | DR-05                  |
| POST /invitations/:id/resend resets expiry                   | Happy       | DR-05, Edge #5         |
| POST /invitations/:token/accept creates membership           | Happy       | DR-05, AC-04           |
| POST /invitations/:token/accept expired returns 400          | Error       | NFR-13, Edge #5        |
| POST /invitations/:token/accept already accepted returns 400 | Error       | INVITATION_ACCEPTED    |
| Rate limit on invite endpoint enforced                       | Error       | ADR-012                |

#### INT-04: User Management (`services/core-api/src/__tests__/user-management.test.ts`)

| Test Case                                           | Happy/Error | Verifies             |
| --------------------------------------------------- | ----------- | -------------------- |
| GET /users returns tenant user list                 | Happy       | FR-010               |
| GET /users with search filter                       | Happy       | FR-010               |
| DELETE /users/:id with reassignment removes user    | Happy       | FR-016, AC-08        |
| DELETE /users/:id self-removal returns 400          | Error       | SELF_REMOVAL_BLOCKED |
| GET /users/:id/workspaces returns user's workspaces | Happy       | FR-016               |
| GET /roles returns built-in roles with counts       | Happy       | FR-025               |
| GET /roles/action-matrix returns permission matrix  | Happy       | FR-025, DR-04        |

#### INT-05: User Profile (`services/core-api/src/__tests__/user-profile.test.ts`)

| Test Case                                        | Happy/Error | Verifies        |
| ------------------------------------------------ | ----------- | --------------- |
| GET /profile returns current user profile        | Happy       | FR-017          |
| PATCH /profile updates display name, syncs to KC | Happy       | FR-017, AC-13   |
| PATCH /profile updates timezone and language     | Happy       | FR-017          |
| POST /profile/avatar uploads to MinIO            | Happy       | FR-017, NFR-09  |
| POST /profile/avatar >1MB returns 400            | Error       | NFR-09, Edge #8 |
| POST /profile/avatar GIF format returns 400      | Error       | Edge #9         |

#### INT-06: Tenant Settings (`services/core-api/src/__tests__/tenant-settings.test.ts`)

| Test Case                                                   | Happy/Error | Verifies       |
| ----------------------------------------------------------- | ----------- | -------------- |
| GET /tenant/settings returns settings                       | Happy       | FR-019         |
| PATCH /tenant/settings updates name                         | Happy       | FR-019, AC-09  |
| PATCH /tenant/settings with slug returns 400 SLUG_IMMUTABLE | Error       | DR-07          |
| GET /tenant/branding returns branding                       | Happy       | FR-020         |
| PATCH /tenant/branding updates color and dark mode          | Happy       | FR-020, AC-10  |
| PATCH /tenant/branding logo upload to MinIO                 | Happy       | FR-020, NFR-07 |
| PATCH /tenant/branding logo >2MB returns 400                | Error       | Edge #10       |
| GET /tenant/auth-config returns realm config                | Happy       | FR-022         |
| PATCH /tenant/auth-config enables MFA                       | Happy       | FR-022, AC-12  |
| PATCH /tenant/auth-config lockout returns 400               | Error       | Edge #7        |

#### INT-07: Audit Log (`services/core-api/src/__tests__/audit-log.test.ts`)

| Test Case                                       | Happy/Error | Verifies       |
| ----------------------------------------------- | ----------- | -------------- |
| GET /tenant/audit-log returns paginated entries | Happy       | FR-021         |
| GET /tenant/audit-log filtered by action type   | Happy       | FR-021, AC-11  |
| GET /tenant/audit-log filtered by date range    | Happy       | FR-021, NFR-03 |
| GET /tenant/audit-log/action-types returns list | Happy       | FR-021         |
| Audit entries created by workspace operations   | Happy       | DR-08          |
| Non-admin denied audit:read                     | Error       | AC-11          |

#### INT-08: ABAC Engine (`services/core-api/src/__tests__/abac.test.ts`)

| Test Case                                                     | Happy/Error | Verifies       |
| ------------------------------------------------------------- | ----------- | -------------- |
| ABAC allows admin all workspace actions                       | Happy       | FR-013, DR-04  |
| ABAC allows member workspace:read but denies workspace:delete | Happy       | DR-04          |
| ABAC denies viewer workspace:create                           | Happy       | AC-05          |
| ABAC evaluates plugin actions via workspace_role_action       | Happy       | FR-024         |
| ABAC decision logged to abac_decision_log                     | Happy       | FR-015, AC-07  |
| ABAC sampling at INFO level (10%)                             | Happy       | DR-09          |
| ABAC Redis cache hit on repeat evaluations                    | Happy       | NFR-01, NFR-06 |
| ABAC performance < 50ms P95 with cache                        | Perf        | NFR-01         |

#### INT-09: ABAC Workspace Isolation (`services/core-api/src/__tests__/abac-workspace-isolation.test.ts`)

| Test Case                                               | Happy/Error | Verifies      |
| ------------------------------------------------------- | ----------- | ------------- |
| User with access to A cannot list workspace B resources | Error       | FR-013, AC-06 |
| User with access to A cannot read workspace B detail    | Error       | AC-06         |
| Tenant admin can access all workspaces                  | Happy       | FR-013        |
| Cross-workspace member add denied                       | Error       | AC-06         |

**Total integration test files: 9** | **Total integration test cases: ~72**

---

### 8.3 Unit Tests (Vitest)

Unit tests cover pure business logic functions with no infrastructure
dependencies. All inputs and outputs are plain objects. No database, no Redis,
no Keycloak.

| Test File                                                                | Module          | Functions Tested                                            | Test Cases                                                        |
| ------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `services/core-api/src/modules/abac/__tests__/policies.test.ts`          | abac            | `getRequiredRole`, `isPluginAction`                         | 15 — role lookup for all DR-04 actions, plugin action detection   |
| `services/core-api/src/modules/abac/__tests__/engine.test.ts`            | abac            | `evaluateAbac` (pure evaluation logic)                      | 12 — role hierarchy checks, tenant admin bypass, deny/allow paths |
| `services/core-api/src/modules/workspace/__tests__/service.test.ts`      | workspace       | `calculateMaterializedPath`, `detectCycle`, `validateDepth` | 10 — path calculation, cycle detection, depth limit enforcement   |
| `services/core-api/src/lib/__tests__/slug.test.ts`                       | lib             | `generateSlug`, `deduplicateSlug`                           | 8 — kebab conversion, special chars, length limits, dedup suffix  |
| `services/core-api/src/lib/__tests__/crypto.test.ts`                     | lib             | `generateInviteToken`                                       | 5 — length, randomness, URL-safe characters                       |
| `services/core-api/src/lib/__tests__/pagination.test.ts`                 | lib             | `buildPaginationQuery`, `buildPaginatedResult`              | 6 — offset/limit calc, edge cases (page 0, negative)              |
| `services/core-api/src/lib/__tests__/file-upload.test.ts`                | lib             | `validateFileSize`, `validateMimeType`                      | 8 — size limits, MIME type allowlists, edge cases                 |
| `services/core-api/src/modules/audit-log/__tests__/action-types.test.ts` | audit-log       | `getActionTypes`, action type registry consistency          | 4 — all categories present, no duplicate keys                     |
| `services/core-api/src/modules/workspace/__tests__/schema.test.ts`       | workspace       | Zod schemas (CreateWorkspace, UpdateWorkspace, Reparent)    | 10 — valid/invalid inputs, edge cases                             |
| `services/core-api/src/modules/invitation/__tests__/schema.test.ts`      | invitation      | Zod schemas (InviteUser, AcceptInvitation)                  | 6 — email validation, role enum, token format                     |
| `services/core-api/src/modules/tenant-settings/__tests__/schema.test.ts` | tenant-settings | Zod schemas (UpdateBranding, UpdateAuthConfig)              | 6 — color format, MFA type enum                                   |

**Total unit test files: 11** | **Total unit test cases: ~90**

---

### 8.4 Test Data Requirements

#### Keycloak Realm Setup

| Realm        | Purpose                       | Users                                                                                                     |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `e2e-tenant` | E2E test tenant realm         | `e2e-admin` (admin), `e2e-member` (member), `e2e-viewer` (viewer), `e2e-other-user` (no workspace access) |
| `int-tenant` | Integration test tenant realm | `int-admin`, `int-member`, `int-viewer`                                                                   |

**Realm configuration**:

- RS256 signing (real tokens — no HS256, no test tokens)
- Password grant enabled for test automation
- Client `plexica-web` with redirect URIs for localhost

#### Database Seed Data

| Entity              | Seed Data                                                      | Used By                     |
| ------------------- | -------------------------------------------------------------- | --------------------------- |
| Tenant              | `e2e-tenant` (slug: `e2e-tenant`, schema: `tenant_e2e_tenant`) | All E2E + integration tests |
| User Profiles       | 4 user profiles matching Keycloak users                        | All tests                   |
| Workspaces          | 3-level hierarchy: Engineering → Frontend → Components         | Workspace E2E + integration |
| Workspace Members   | Admin on Engineering, Member on Frontend, Viewer on Components | RBAC/ABAC tests             |
| Workspace Templates | 3 built-in templates (Team, Department, Project)               | Template tests              |
| Tenant Branding     | Default branding (default color, no logo)                      | Branding tests              |
| Invitations         | 1 pending, 1 expired invitation                                | Invitation tests            |
| Audit Log Entries   | 20+ entries across categories                                  | Audit log tests             |

#### Redis State

- Clean state per test suite (flush before suite)
- ABAC cache warm-up not needed — tests verify cache-miss → cache-hit behavior

#### MinIO State

- Tenant bucket `tenant-e2e-tenant` created during seed
- Directories: `avatars/`, `branding/` created
- No pre-seeded files (tests upload during execution)

---

### 8.5 Coverage Targets

| Module                     | Target Line Coverage | Critical Paths (100% coverage required)                                                                     |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `abac/engine`              | 95%                  | `evaluateAbac`, `requireAbac` — every deny/allow path                                                       |
| `abac/policies`            | 100%                 | All DR-04 action → role mappings                                                                            |
| `workspace/service`        | 90%                  | `archiveWorkspace` (subtree), `reparentWorkspace` (path recalc), `createWorkspace` (template instantiation) |
| `workspace/repository`     | 85%                  | `findDescendants`, `updateMaterializedPaths`                                                                |
| `workspace-member/service` | 90%                  | `addMember` (duplicate check), `changeMemberRole`                                                           |
| `invitation/service`       | 90%                  | `inviteUser`, `acceptInvitation` (full lifecycle), `resendInvitation`                                       |
| `user-management/service`  | 85%                  | `removeUser` (reassignment + KC disable + session terminate)                                                |
| `user-profile/service`     | 85%                  | `uploadAvatar` (MinIO + validation), `updateProfile` (KC sync)                                              |
| `tenant-settings/service`  | 85%                  | `updateAuthConfig` (lockout check), `updateBranding` (logo upload)                                          |
| `audit-log/writer`         | 90%                  | `writeAuditLog` — every module depends on this                                                              |
| `audit-log/service`        | 85%                  | `queryAuditLog` (filters, pagination)                                                                       |
| `middleware/abac`          | 95%                  | Fastify preHandler — allow/deny/error paths                                                                 |
| `lib/slug`                 | 100%                 | Slug generation — deterministic                                                                             |
| `lib/crypto`               | 100%                 | Token generation — security-critical                                                                        |
| `lib/file-upload`          | 100%                 | Validation — security boundary                                                                              |
| `lib/email`                | 80%                  | SMTP send — happy path + transport error                                                                    |
| **Overall (all modules)**  | **≥ 80%**            | Per Constitution quality standards                                                                          |

---

## 9. Requirement Traceability Matrix

### 9.1 Functional Requirements

| ID     | Requirement (short)              | Plan Section                                  | Implementation Files                                                                                                     | Test Files                                                                     |
| ------ | -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| FR-001 | Workspace list                   | §4.1 `GET /workspaces`                        | `workspace/routes.ts`, `workspace/service.ts`, `workspace/repository.ts`, `workspace-list-page.tsx`, `use-workspaces.ts` | `workspace.test.ts`, `workspace-crud.spec.ts`                                  |
| FR-002 | Create workspace                 | §4.1 `POST /workspaces`                       | `workspace/routes.ts`, `workspace/service.ts`, `workspace/schema.ts`, `create-workspace-dialog.tsx`                      | `workspace.test.ts`, `workspace-crud.spec.ts`                                  |
| FR-003 | Workspace detail                 | §4.1 `GET /workspaces/:id`                    | `workspace/routes.ts`, `workspace/service.ts`, `workspace-detail-page.tsx`                                               | `workspace.test.ts`, `workspace-crud.spec.ts`                                  |
| FR-004 | Workspace hierarchy              | §4.1 `GET /workspaces/:id/hierarchy`          | `workspace/service.ts`, `workspace/repository.ts`, `workspace-tree.tsx`                                                  | `workspace.test.ts`, `workspace-hierarchy.spec.ts`                             |
| FR-005 | Workspace members                | §4.1 `GET/POST/DELETE members`                | `workspace-member/routes.ts`, `workspace-member/service.ts`, `workspace-members-page.tsx`                                | `workspace-members.test.ts`, `workspace-members.spec.ts`                       |
| FR-006 | Workspace settings               | §4.1 `PATCH /workspaces/:id`                  | `workspace/routes.ts`, `workspace/service.ts`, `workspace-settings-page.tsx`                                             | `workspace.test.ts`, `workspace-crud.spec.ts`                                  |
| FR-007 | Soft-delete workspace            | §4.1 `DELETE /workspaces/:id`                 | `workspace/service.ts`, `workspace/repository.ts`                                                                        | `workspace.test.ts`, `workspace-crud.spec.ts`                                  |
| FR-008 | Workspace templates              | §4.1 `POST /workspaces` (templateId)          | `workspace/service.ts`, `workspace/repository.ts`, `workspace-templates-page.tsx`, `template-card.tsx`                   | `workspace.test.ts`, `workspace-templates.spec.ts`                             |
| FR-009 | Reparent workspace               | §4.1 `POST /workspaces/:id/reparent`          | `workspace/service.ts`, `workspace/repository.ts`                                                                        | `workspace.test.ts`, `workspace-hierarchy.spec.ts`                             |
| FR-010 | Tenant user list                 | §4.2 `GET /users`                             | `user-management/routes.ts`, `user-management/service.ts`, `user-list-page.tsx`                                          | `user-management.test.ts`, `user-management.spec.ts`                           |
| FR-011 | Invite user via email            | §4.2 `POST /users/invite`                     | `invitation/routes.ts`, `invitation/service.ts`, `lib/email.ts`, `add-member-dialog.tsx`                                 | `invitation.test.ts`, `invitation-flow.spec.ts`                                |
| FR-012 | RBAC role assignment             | §4.1 `PATCH members/:userId`, §4.2            | `workspace-member/service.ts`, `abac/policies.ts`                                                                        | `workspace-members.test.ts`, `rbac-permissions.spec.ts`                        |
| FR-013 | ABAC workspace isolation         | §5.1.8 ABAC engine                            | `abac/engine.ts`, `middleware/abac.ts`                                                                                   | `abac.test.ts`, `abac-workspace-isolation.test.ts`, `rbac-permissions.spec.ts` |
| FR-014 | ABAC condition tree              | §5.1.8 ABAC engine                            | `abac/engine.ts`, `abac/policies.ts`                                                                                     | `abac.test.ts`, `policies.test.ts`                                             |
| FR-015 | ABAC decision logging            | §5.1.8 decision-logger                        | `abac/decision-logger.ts`                                                                                                | `abac.test.ts`, `audit-log.spec.ts`                                            |
| FR-016 | Remove user                      | §4.2 `DELETE /users/:id`                      | `user-management/service.ts`, `remove-user-dialog.tsx`                                                                   | `user-management.test.ts`, `user-management.spec.ts`                           |
| FR-017 | User profile                     | §4.4 `GET/PATCH /profile`                     | `user-profile/service.ts`, `profile-page.tsx`, `use-profile.ts`                                                          | `user-profile.test.ts`, `user-profile.spec.ts`                                 |
| FR-018 | End-to-end permission check      | §5.1.8 + §5.1.9 ABAC middleware               | `abac/engine.ts`, `middleware/abac.ts`                                                                                   | `abac.test.ts`, `rbac-permissions.spec.ts`                                     |
| FR-019 | General settings page            | §4.3 `GET/PATCH /tenant/settings`             | `tenant-settings/routes.ts`, `tenant-settings-page.tsx`                                                                  | `tenant-settings.test.ts`, `tenant-settings.spec.ts`                           |
| FR-020 | Branding                         | §4.3 `GET/PATCH /tenant/branding`             | `tenant-settings/service.ts`, `tenant-branding-page.tsx`, `color-picker.tsx`                                             | `tenant-settings.test.ts`, `tenant-settings.spec.ts`                           |
| FR-021 | Audit log                        | §4.5 `GET /tenant/audit-log`                  | `audit-log/routes.ts`, `audit-log/service.ts`, `audit-log-page.tsx`, `expandable-row.tsx`                                | `audit-log.test.ts`, `audit-log.spec.ts`                                       |
| FR-022 | Auth realm config                | §4.3 `GET/PATCH /tenant/auth-config`          | `tenant-settings/service.ts`, `tenant-auth-config-page.tsx`                                                              | `tenant-settings.test.ts`, `tenant-settings.spec.ts`                           |
| FR-023 | Plugin action role assignment UI | §3.1 `action_registry` table, §5.2.2          | `action-matrix-table.tsx`, `permission-association-panel.tsx`                                                            | `role-management.spec.ts`, `permission-association.spec.ts`                    |
| FR-024 | Plugin action ABAC enforcement   | §5.1.8 `resolvePluginActionRole`              | `abac/policies.ts`, `abac/engine.ts`                                                                                     | `abac.test.ts`                                                                 |
| FR-025 | Role management screen           | §4.2 `GET /roles`, `GET /roles/action-matrix` | `user-management/service.ts`, `role-management-page.tsx`, `role-card.tsx`, `action-matrix-table.tsx`                     | `user-management.test.ts`, `role-management.spec.ts`                           |
| FR-026 | Workspace permission association | §4.1 `PATCH members/:userId`                  | `workspace-member/service.ts`, `permission-association-page.tsx`, `permission-association-panel.tsx`                     | `workspace-members.test.ts`, `permission-association.spec.ts`                  |

### 9.2 Non-Functional Requirements

| ID     | Requirement (short)                   | Plan Section                     | Implementation Files                                        | Test Files                                           |
| ------ | ------------------------------------- | -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| NFR-01 | ABAC eval < 50ms P95                  | §5.1.8                           | `abac/engine.ts`, Redis cache                               | `abac.test.ts` (perf assertion)                      |
| NFR-02 | Workspace list < 200ms P95            | §4.1 `GET /workspaces`           | `workspace/repository.ts` (indexes), `workspace/service.ts` | `workspace.test.ts` (perf assertion)                 |
| NFR-03 | Audit log query < 500ms P95           | §4.5                             | `audit-log/repository.ts` (composite index)                 | `audit-log.test.ts` (perf assertion)                 |
| NFR-04 | Invite email < 5s                     | §4.2 `POST /users/invite`        | `invitation/service.ts`, `lib/email.ts`                     | `invitation.test.ts`, `invitation-flow.spec.ts`      |
| NFR-05 | Path depth up to 10 levels            | §3.1 workspace table, §4.1       | `workspace/service.ts` (depth validation)                   | `workspace.test.ts`, `workspace-hierarchy.spec.ts`   |
| NFR-06 | 100 concurrent ABAC req/s             | §5.1.8                           | `abac/engine.ts`, Redis cache                               | `abac.test.ts` (load test in CI)                     |
| NFR-07 | Logo < 2MB, < 3s                      | §4.3 `PATCH /tenant/branding`    | `lib/file-upload.ts`, `tenant-settings/service.ts`          | `tenant-settings.test.ts`, `tenant-settings.spec.ts` |
| NFR-08 | ABAC log query < 500ms P95            | §3.1 abac_decision_log (indexes) | `abac/decision-logger.ts`                                   | `abac.test.ts`                                       |
| NFR-09 | Avatar < 1MB, JPEG/PNG/WebP           | §4.4 `POST /profile/avatar`      | `lib/file-upload.ts`, `user-profile/service.ts`             | `user-profile.test.ts`, `user-profile.spec.ts`       |
| NFR-10 | Reparent path recalc < 200ms P95      | §4.1 `POST reparent`             | `workspace/service.ts`, `workspace/repository.ts`           | `workspace.test.ts` (perf assertion)                 |
| NFR-11 | Archived workspace 30-day retention   | §3.1 workspace table             | `workspace/service.ts` (scheduled job)                      | `workspace.test.ts`, `workspace-crud.spec.ts`        |
| NFR-12 | Soft-deleted profile 90-day retention | §3.1 user_profile table          | `user-management/service.ts`                                | `user-management.test.ts`                            |
| NFR-13 | Invite expiry 7 days                  | §3.1 invitation table            | `invitation/service.ts`, config `INVITATION_EXPIRY_DAYS`    | `invitation.test.ts`, `invitation-flow.spec.ts`      |
| NFR-14 | WCAG 2.1 AA all screens               | §5.2 all pages                   | All page components, `@plexica/ui` components               | All E2E specs (axe-core checks)                      |

### 9.3 Acceptance Criteria

| ID    | Summary (short)            | Plan Section                         | Implementation Files                                             | Test Files                                                     |
| ----- | -------------------------- | ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| AC-01 | Workspace CRUD & hierarchy | §4.1, §5.1.1                         | workspace module (all files)                                     | `workspace.test.ts`, `workspace-crud.spec.ts`                  |
| AC-02 | Workspace reparenting      | §4.1 `POST reparent`                 | `workspace/service.ts`                                           | `workspace.test.ts`, `workspace-hierarchy.spec.ts`             |
| AC-03 | Workspace templates        | §4.1 `POST /workspaces` (templateId) | `workspace/service.ts`, `workspace-templates-page.tsx`           | `workspace.test.ts`, `workspace-templates.spec.ts`             |
| AC-04 | User invitation            | §4.2, §5.1.3                         | invitation module, `add-member-dialog.tsx`                       | `invitation.test.ts`, `invitation-flow.spec.ts`                |
| AC-05 | RBAC permissions           | §5.1.8, §5.1.9                       | `abac/engine.ts`, `middleware/abac.ts`                           | `abac.test.ts`, `rbac-permissions.spec.ts`                     |
| AC-06 | ABAC workspace isolation   | §5.1.8                               | `abac/engine.ts`, `middleware/abac.ts`                           | `abac-workspace-isolation.test.ts`, `rbac-permissions.spec.ts` |
| AC-07 | ABAC decision logging      | §5.1.8                               | `abac/decision-logger.ts`                                        | `abac.test.ts`                                                 |
| AC-08 | User removal               | §4.2 `DELETE /users/:id`             | `user-management/service.ts`, `remove-user-dialog.tsx`           | `user-management.test.ts`, `user-management.spec.ts`           |
| AC-09 | Tenant settings            | §4.3 `GET/PATCH /tenant/settings`    | `tenant-settings/routes.ts`, `tenant-settings-page.tsx`          | `tenant-settings.test.ts`, `tenant-settings.spec.ts`           |
| AC-10 | Branding                   | §4.3 `PATCH /tenant/branding`        | `tenant-settings/service.ts`, `tenant-branding-page.tsx`         | `tenant-settings.test.ts`, `tenant-settings.spec.ts`           |
| AC-11 | Audit log                  | §4.5                                 | `audit-log/routes.ts`, `audit-log-page.tsx`                      | `audit-log.test.ts`, `audit-log.spec.ts`                       |
| AC-12 | Auth realm config          | §4.3 `PATCH /tenant/auth-config`     | `tenant-settings/service.ts`, `tenant-auth-config-page.tsx`      | `tenant-settings.test.ts`, `tenant-settings.spec.ts`           |
| AC-13 | User profile               | §4.4                                 | `user-profile/service.ts`, `profile-page.tsx`                    | `user-profile.test.ts`, `user-profile.spec.ts`                 |
| AC-14 | WCAG 2.1 AA compliance     | §5.2 (all pages)                     | All page components                                              | All E2E specs (axe-core)                                       |
| AC-15 | Role management screen     | §4.2 `GET /roles`, §5.2.2            | `user-management/service.ts`, `role-management-page.tsx`         | `user-management.test.ts`, `role-management.spec.ts`           |
| AC-16 | Permission association     | §4.1, §5.2.2                         | `workspace-member/service.ts`, `permission-association-page.tsx` | `workspace-members.test.ts`, `permission-association.spec.ts`  |

---

## 10. Constitution Compliance

### 10.1 The 6 Rules

| Rule | Requirement                    | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Every feature has an E2E test  | ✅ PASS  | 12 E2E test files covering all 7 user stories (§8.1): workspace-crud, workspace-hierarchy, workspace-members, invitation-flow, user-management, rbac-permissions, tenant-settings, user-profile, audit-log, workspace-templates, role-management, permission-association                                                                                                                                                                                                                                                                                        |
| 2    | No merge without green CI      | ✅ PASS  | All test suites (E2E + integration + unit) required green before merge. No `skip` flags. CI pipeline runs all 3 tiers per existing `.github/workflows/` config                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3    | One pattern per operation type | ✅ PASS  | Data fetching: TanStack Query (all `use-*.ts` hooks). Forms: react-hook-form + Zod (create-workspace-dialog, add-member-dialog, profile-page, tenant-settings). Auth state: `auth-store.ts` (Zustand, auth token + user + tenant). Workspace nav state: `workspace-store.ts` (Zustand, current workspace selection — orthogonal to auth, see ID-009 in decision-log). i18n: react-intl. Icons: Lucide. Dialogs: `ConfirmDialog` from @plexica/ui                                                                                                                |
| 4    | No file above 200 lines        | ⚠️ WATCH | File map (§6) specifies decomposition: each module has 5 files (routes, service, repository, schema, types). Audit-log has 7 files (writer + action-types separate). **At-risk file**: `workspace/service.ts` covers hierarchy + reparent + soft-delete/restore + template instantiation + optimistic concurrency (~8 exported functions, estimated ~180 lines). If it approaches the limit during implementation, extract `workspace/hierarchy-service.ts` or `workspace/template-service.ts`. All page components delegate to hooks + @plexica/ui components. |
| 5    | Significant decisions have ADR | ✅ PASS  | No new architectural decisions in this spec. All technologies from existing stack. New npm packages documented in §7.1 with ADR assessment (none required). Existing ADRs referenced: ADR-001, ADR-003, ADR-011, ADR-012                                                                                                                                                                                                                                                                                                                                        |
| 6    | All commits in English         | ✅ PASS  | Standard practice. Enforced by CI commit message lint. All spec/plan documentation in English                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 10.2 Architecture Compliance

| Architecture Decision            | Status  | Evidence                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema-per-tenant                | ✅ PASS | All 10 new tables in `tenant_{slug}` schema (§3.1). Repository layer uses tenant-scoped Prisma client. No cross-tenant data access                                                                                                                                                                                                   |
| Keycloak auth on all endpoints   | ✅ PASS | All endpoints require authentication except `POST /invitations/:token/accept` which is explicitly marked `[PUBLIC]` and uses invitation token auth instead (§4.2). Documented per Constitution §Security-2                                                                                                                           |
| ABAC tree-walk                   | ✅ PASS | ABAC middleware (`middleware/abac.ts`) on all workspace-scoped routes (§5.1.9). Engine evaluates role hierarchy per ADR-003. Decision logging per FR-015                                                                                                                                                                             |
| TanStack Query for data fetching | ✅ PASS | All 10 hook files use TanStack Query (§5.2). No raw `fetch` or `useEffect + useState` patterns                                                                                                                                                                                                                                       |
| react-hook-form + Zod for forms  | ✅ PASS | All form dialogs and form pages use react-hook-form with Zod resolvers (§5.2). Backend Zod schemas in `schema.ts` per module (§5.1)                                                                                                                                                                                                  |
| Single Zustand store             | ✅ PASS | Two Zustand stores for orthogonal concerns: `auth-store.ts` (auth token, user identity, tenant — immutable during workspace navigation) and `workspace-store.ts` (current workspace selection — UI navigation state, not auth state). `currentWorkspaceId` lives in `workspace-store`, NOT in `auth-store`. See decision-log ID-009. |
| Fastify monolith                 | ✅ PASS | All modules in `services/core-api/src/modules/`. No new services deployed                                                                                                                                                                                                                                                            |
| Module Federation                | N/A     | No plugin UI in this spec (deferred to Spec 004)                                                                                                                                                                                                                                                                                     |

### 10.3 Security Compliance

| Security Rule          | Status  | Evidence                                                                                                                                                                  |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation       | ✅ PASS | All queries scoped to `tenant_{slug}` schema via tenant-context middleware. ABAC adds workspace-level isolation within tenant                                             |
| Auth on every endpoint | ✅ PASS | Only `POST /invitations/:token/accept` is public — documented, token-authenticated, rate-limited (§4.6)                                                                   |
| No SQL injection       | ✅ PASS | All queries via Prisma parameterized queries. `$queryRawUnsafe` exception for `SET search_path` inherited from Spec 002 (documented in decision-log ID-001)               |
| Zod on all inputs      | ✅ PASS | Every module has `schema.ts` with Zod schemas (§5.1). File uploads validated via `lib/file-upload.ts`                                                                     |
| No secrets in code     | ✅ PASS | All config via environment variables (§7.4). Keycloak credentials, MinIO keys in env vars only                                                                            |
| No PII in logs/errors  | ✅ PASS | Email excluded from member list response (§4.1 note). Audit log stores no PII in before/after values (§3.1 audit_log notes). Invitation email shown only to admin callers |

---

## 11. Implementation Notes

### 11.1 Build Sequence (Dependencies)

Implementation must follow this order due to module dependencies:

1. **Shared libraries** — `lib/slug.ts`, `lib/crypto.ts`, `lib/pagination.ts`,
   `lib/file-upload.ts`, `lib/email.ts` (no inter-module dependencies)
2. **Database migration** — Prisma schema + migration file
   (`003_core_features/migration.sql`) — all other modules depend on tables
3. **ABAC engine** — `abac/engine.ts`, `abac/policies.ts`,
   `abac/decision-logger.ts`, `middleware/abac.ts` — all workspace-scoped
   routes depend on ABAC
4. **Audit log writer** — `audit-log/writer.ts`, `audit-log/action-types.ts`
   — all modules log audit events, must be available first
5. **Workspace module** — `workspace/*` — foundation for members, invitations
6. **Workspace member module** — `workspace-member/*` — needed by invitation accept flow
7. **Invitation module** — `invitation/*` — depends on workspace-member for accept
8. **User management module** — `user-management/*` — depends on workspace-member
   for reassignment
9. **User profile module** — `user-profile/*` — independent of workspace modules
10. **Tenant settings module** — `tenant-settings/*` — independent of workspace modules
11. **Audit log query routes** — `audit-log/routes.ts`, `audit-log/service.ts`
12. **UI: @plexica/ui components** — shared components used by all pages
13. **UI: Pages + hooks** — workspace pages first, then user/settings/audit pages
14. **Seed data** — built-in templates, default branding

### 11.2 Known Complexity Areas

| Area                                           | Complexity                                                                                         | Mitigation                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Materialized path recalculation** (reparent) | HIGH — must update all descendants in a transaction, detect cycles, enforce depth                  | Wrap in PostgreSQL transaction. Use `findDescendants()` by path prefix. Cycle detection via path containment check. Depth check before write |
| **ABAC engine + Redis cache**                  | HIGH — cache invalidation on role change, sampling logic, plugin action resolution                 | Cache keyed by `(userId, workspaceId)`. Invalidate on `member.add`, `member.remove`, `member.role_change`. TTL as safety net (5 min)         |
| **Invitation accept flow**                     | MEDIUM — cross-service orchestration: create KC user → create profile → add member → mark accepted | Wrap in transaction. KC user creation is non-transactional (compensating action: delete KC user on DB failure)                               |
| **User removal with reassignment**             | MEDIUM — per-workspace reassignment, KC disable, session termination, soft-delete                  | Wrap DB operations in transaction. KC operations after DB commit (best effort). Log failures for manual remediation                          |
| **Keycloak Admin API for auth config**         | MEDIUM — translating our config model to KC realm representation, lockout prevention               | Map our DTO to KC realm representation. Validate before applying (lockout check). Wrap KC calls in try/catch with KEYCLOAK_ERROR response    |

### 11.3 Integration Points Requiring Extra Care

1. **Keycloak Admin API** — 5 distinct interaction patterns (create user, disable
   user, terminate sessions, sync display name, realm config). Each requires
   error handling for KC downtime (`502 KEYCLOAK_ERROR`). ADR-011 covers the
   integration strategy.

2. **MinIO uploads** — avatar and logo uploads require: multipart parsing
   (`@fastify/multipart`), size validation before stream consumption, MIME
   type validation, and presigned URL generation for reads. Ensure tenant
   bucket isolation (`tenant-{slug}` bucket).

3. **ABAC cache invalidation** — Redis cache must be invalidated when:
   - A member is added/removed from a workspace
   - A member's role changes
   - A workspace is archived/restored
     Cache key format: `abac:{tenantSlug}:{userId}:{workspaceId}`

4. **Audit log writer** — fire-and-forget design means audit log write failures
   must NOT block the primary operation. Use `Promise.catch()` to log errors
   to Pino but never propagate.

### 11.4 Resolved Blockers from Phase 1

These ambiguities were identified during initial plan analysis and resolved:

1. **Plugin action table references** — `action_registry.plugin_id` references
   `core.plugins.id` (cross-schema). Since the plugin table doesn't exist yet
   (Spec 004), the FK is NOT enforced at the database level. The column exists
   to support FR-023/FR-024 but plugin installation (which populates it) is
   deferred. **Resolution**: Column created as UUID without FK constraint;
   FK added in Spec 004 migration.

2. **Workspace store vs auth store** — Constitution Rule 3 says "one auth store
   (Zustand)". The plan introduces `workspace-store.ts` alongside `auth-store.ts`.
   **Resolution**: These are orthogonal concerns. `auth-store` holds auth state
   (token, user, tenant). `workspace-store` holds workspace navigation context
   (current workspace selection). This is not a competing auth pattern. The
   `currentWorkspaceId` was initially considered for `auth-store` but workspace
   selection is session-scoped UI state, not auth state.
   **Note**: `currentWorkspaceId` lives exclusively in `workspace-store`, NOT
   in `auth-store`. The two stores are not redundant. Documented as ID-009
   in the decision-log.

3. **SMTP dependency ADR requirement** — `nodemailer` is a new npm package. Per
   Constitution Rule 5, new dependencies require evaluation. **Resolution**:
   `nodemailer` is NOT a core dependency — it implements the SMTP capability
   already prescribed by the architecture (`SMTP_HOST` env var). No ADR needed
   (documented in §7.1).

4. **ADR-003 workspace role naming** — ADR-003 defines roles as `workspace_admin`,
   `editor`, `viewer`. This plan uses `admin`, `member`, `viewer` in DB CHECK
   constraints, API responses, and ABAC policies. **Resolution**: The rename is
   an implementation detail that improves clarity (`editor` implies content
   creation which is plugin-level; `member` correctly expresses belonging). ADR-003
   is not amended (it describes the tree-walk mechanism, not role literals).
   Documented as ID-009 in the decision-log.

---

## 12. Plan Summary

| Metric                      | Value                                           |
| --------------------------- | ----------------------------------------------- |
| Functional Requirements     | 26                                              |
| Non-Functional Requirements | 14                                              |
| Acceptance Criteria         | 16                                              |
| API Endpoints               | 32                                              |
| New Database Tables         | 10                                              |
| New Files to Create         | 133                                             |
| Existing Files to Modify    | 16                                              |
| New npm Packages            | 8                                               |
| ADRs Required               | 0                                               |
| E2E Test Files              | 12                                              |
| Integration Test Files      | 9                                               |
| Unit Test Files             | 11                                              |
| Total Test Cases (approx)   | ~216                                            |
| Constitution Compliance     | ✅ PASS (all 6 rules + architecture + security) |

### Recommended Next Steps

1. **`/forge-analyze`** — Validate this plan against the spec and architecture
   for completeness and consistency.
2. **`/forge-tasks`** — Generate sprint task breakdown from this plan, following
   the build sequence in §11.1.
3. **`/forge-review`** — Dual-model adversarial review of the plan before
   implementation begins.
