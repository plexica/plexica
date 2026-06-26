# ADR-015: Plugin Action Extension in ABAC

**Status**: Accepted
**Date**: 2026-06-26
**Driver**: DR-12 from Spec 004 (Plugin System) — Plugin Action Registration & Authorization
**Extends**: ADR-003 (ABAC Tree-Walk)
**Deciders**: TBD

## Context

The ABAC engine (ADR-003) uses a tree-walk for workspace-level permissions within
a tenant. Core platform actions use 2-part action keys (e.g., `workspace:create`,
`member:invite`). These are registered in the core schema and evaluated against
`workspace_role_action` assignments during the tree-walk.

Plugins need to contribute their own authorization actions. A CRM plugin might
define `crm:contact:create`, `crm:contact:view`, `crm:deal:manage`. These plugin
actions must:

1. Integrate with the existing ABAC tree-walk without changing its core algorithm
2. Respect the same role hierarchy (Admin ≥ Member ≥ Viewer)
3. Be assignable per-workspace-role by workspace administrators
4. Be audited in the same `abac_decision_log` as core actions
5. Not collide with core actions or other plugins' actions

Two approaches considered: 2-part keys with a separate namespace (complicates
dispatch logic) or 3-part keys with structural dispatch (clean separation).

## Decision

**3-part action keys with structural dispatch for plugin actions.**

Core actions remain 2-part (`resource:verb`). Plugin actions use 3-part keys
(`plugin-slug:resource:verb`). The ABAC `evaluate()` function dispatches on
`actionKey.split(':').length`:

- **2 parts** → Core action: look up `workspace_role_action` for `(workspace_id, action_key)`
- **3 parts** → Plugin action: look up `workspace_role_action` for `(workspace_id, action_key)`; if no row exists, fall back to `defaultRole` from `action_registry`

**Role hierarchy is preserved**: Admin ≥ Member ≥ Viewer. A user with `Admin` role
on a workspace can perform all plugin actions assigned to `Admin` or lower for that
workspace. The tree-walk algorithm itself is unchanged — the dispatch is purely at
the action lookup level.

### Action Registry

Plugin actions are registered in the `action_registry` table during plugin
installation. Each row represents one action that the plugin declares:

```sql
CREATE TABLE core.action_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id   UUID NOT NULL REFERENCES core.plugins(id) ON DELETE CASCADE,
  action_key  VARCHAR(128) NOT NULL,  -- e.g., 'crm:contact:create'
  default_role VARCHAR(32) NOT NULL,   -- 'admin', 'member', 'viewer'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plugin_id, action_key)
);
```

The `defaultRole` defines the minimum role required to perform the action when
no explicit `workspace_role_action` override exists. This provides sensible
defaults for workspace administrators — they don't need to configure every
action manually.

### Workspace Role Assignment

The existing `workspace_role_action` table already stores action keys as `VARCHAR`.
A 3-part plugin action key fits in the same column without schema changes:

```sql
-- Existing table (no changes needed)
CREATE TABLE {tenant_schema}.workspace_role_action (
  workspace_role_id UUID REFERENCES {tenant_schema}.workspace_role(id),
  action_key        VARCHAR(128) NOT NULL,  -- supports both 'workspace:create' and 'crm:contact:create'
  PRIMARY KEY(workspace_role_id, action_key)
);
```

Workspace administrators can override role assignments from the Permission
Association Screen (Spec 003 DR-14). Override logic: if a row exists for
`(workspace_role_id, action_key)`, use that role requirement; otherwise fall
back to `defaultRole` from `action_registry`.

### Audit Trail

Plugin action evaluations are logged to the same `abac_decision_log` table
as core actions, with the full 3-part action key and plugin identification:

```sql
-- abac_decision_log columns (existing, no changes needed)
-- decision fields: user_id, workspace_id, action_key, resource_id,
--   result (allow/deny), reason, evaluated_at
```

The `action_key` column naturally accommodates 3-part keys. Super admins can
filter by plugin slug prefix (e.g., `action_key LIKE 'crm:%'`) for plugin-specific
audit reports.

### Naming & Collision Rules

Plugin action keys must conform to:
- **Format**: `{pluginSlug}:{resource}:{verb}` where `pluginSlug` matches regex
  `/^[a-z][a-z0-9-]{1,62}$/`
- **Uniqueness**: No two plugins may register the same action key. Enforced at
  manifest validation time via UNIQUE constraint on `(plugin_id, action_key)`.
  Cross-plugin duplicate check is performed at registration time by querying
  `action_registry` across all plugins.
- **Core collision**: Plugin actions cannot use a 2-part format (reserved for
  core). Validated at manifest validation — the core rejects any plugin action
  key with fewer than 3 colon-separated parts.

### Authorization Flow

```
HTTP Request → Core Auth Middleware
  → Extract X-Plexica-User-Id, X-Plexica-Workspace-Id
  → ABAC.evaluate(userId, workspaceId, actionKey)
    → actionKey.split(':').length
      = 2 → core action lookup
      = 3 → plugin action lookup:
        1. Query workspace_role_action for (workspace_role_id, actionKey)
        2. If found → use assigned role
        3. If not found → query action_registry.defaultRole
        4. Tree-walk up hierarchy for effective user role
        5. Compare user's effective role ≥ required role
        6. Log to abac_decision_log
  → Allow/Deny
```

## Consequences

### Positive
- **Zero schema migration**: The existing `workspace_role_action` table already
  stores action keys as `VARCHAR`. 3-part keys fit without ALTER TABLE.
- **Clean structural dispatch**: `split(':').length` is a cheap, unambiguous
  dispatch mechanism. No registry lookups needed to determine the action type.
- **Sensible defaults**: `defaultRole` in `action_registry` means workspace
  admins don't need to configure every plugin action manually. Plugins ship
  with reasonable defaults.
- **Audit parity**: Plugin action decisions appear in `abac_decision_log` with
  the same schema as core decisions. No special audit path needed.
- **Namespace collision prevention**: Plugin slug as the first segment guarantees
  uniqueness across all plugins. The `UNIQUE(plugin_id, action_key)` constraint
  catches duplicates within a plugin at the database level.

### Negative
- **Tree-walk overhead**: Each plugin action evaluation requires an additional
  `action_registry` lookup when no `workspace_role_action` override exists.
  Mitigated by caching `(action_key, defaultRole)` in Redis with event-driven
  invalidation on plugin install/uninstall.
- **Action key length**: 3-part keys are inherently longer than 2-part keys
  (up to 128 characters per the VARCHAR column). Index performance impact is
  negligible for the expected action count (hundreds, not millions).

### Neutral
- **Plugin action prefix tied to plugin slug**: If a plugin is renamed, all
  action keys change. This is acceptable because plugin slugs are immutable
  after registration (per Spec 004).

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **2-part keys with namespace prefix** | `plugin:crm:contact:create` as 4-part | Fits 2-part mental model | Ambiguous parsing — is the first segment a resource or a namespace?; requires config to define which prefixes are plugins | Rejected — parsing ambiguity |
| **Separate `plugin_action` table** | Distinct table for plugin actions, separate ABAC code path | Clean schema separation | Requires a parallel ABAC evaluation path; doubles the code and test surface; plugins get a second-class authorization model | Rejected — unnecessary code duplication |
| **Flat namespace with dot notation** | `crm.contact.create` instead of `crm:contact:create` | Single-segment action keys | Harder to parse structurally; conflicts with potential dot-separated core actions; less visually distinct | Rejected — colon separation is more parseable |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for auth | **COMPLIANT** | This ADR documents the authorization model for plugin actions, an auth infrastructure decision. |
| Security §3: SQL injection | **COMPLIANT** | All action key lookups use parameterized queries. The split-based dispatch is string manipulation, not SQL construction. |
| Security §4: Input validation | **COMPLIANT** | Plugin action keys validated against regex at manifest validation. Rejected if format is invalid. |
| Architecture: ABAC | **COMPLIANT** | Extends ADR-003 without changing the tree-walk algorithm. Consistent with constitution §83. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — plugins extend the platform. ABAC is the extension point for authorization. |

## Related Decisions

- **ADR-003: ABAC Tree-Walk** — Defines the core authorization engine. This ADR
  extends it with plugin action dispatch without modifying the tree-walk algorithm.
- **ADR-018: Two-Level Plugin Visibility** — Visibility (is the plugin shown?)
  is a separate concern from authorization (can the user perform an action?).
  Visibility gates UI rendering; ABAC gates API access.
- **ADR-006: Plugin Tables in Tenant Schema** — `workspace_role_action` lives in
  the tenant schema alongside plugin data tables. Plugin action keys are stored
  in the same table as core action keys.
