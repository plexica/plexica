# ADR-018: Two-Level Plugin Visibility

**Status**: Accepted
**Date**: 2026-06-26
**Driver**: DR-16 from Spec 004 (Plugin System) — Per-Workspace Plugin Visibility
**Extends**: ADR-006 (Plugin Tables in Tenant Schema)
**Deciders**: TBD

## Context

When a plugin is installed for a tenant, it is available across all workspaces
within that tenant by default. However, different workspaces within the same
tenant may have different plugin needs:

- An "Engineering" workspace needs the CI/CD plugin and a Wiki plugin
- A "Sales" workspace needs the CRM plugin but not the CI/CD plugin
- A "Finance" workspace may need none of the above, only the core platform

Granularity options considered:

1. **Global on/off**: Plugin is either active for all workspaces or none. Too
   coarse — a tenant with 20 workspaces cannot selectively show plugins.
2. **Per-workspace only**: Each workspace admin individually enables/disables
   plugins. No sensible default — a newly created workspace shows nothing until
   configured, creating a dead-end UX for members joining new workspaces.
3. **Two-level (tenant default + per-workspace override)**: Tenant admin sets
   a default visibility. Workspace admins can override for their workspace.
   New workspaces inherit the tenant default.

The core tension: frictionless onboarding (plugins are available immediately
in new workspaces) vs. administrative control (workspace admins can hide
irrelevant plugins).

## Decision

**Two-level visibility model — tenant default with per-workspace override.**

### Level 1: Tenant Default

When a plugin is installed, the tenant default visibility is `enabled` — all
workspaces see the plugin. The tenant admin can change this default to `disabled`,
hiding the plugin from all workspaces that don't have an explicit override.

This default is stored in the plugin registry (core schema) as a boolean column
on an existing table (to be defined at implementation time), or as part of a
new `plugin_default_visibility` table:

```sql
CREATE TABLE core.plugin_default_visibility (
  plugin_id   UUID PRIMARY KEY REFERENCES core.plugins(id),
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID  -- user_id of tenant admin who changed it
);
```

### Level 2: Per-Workspace Override

Workspace admins can override visibility for specific workspaces:

```sql
CREATE TABLE {tenant_schema}.plugin_workspace_visibility (
  install_id    UUID NOT NULL REFERENCES {tenant_schema}.plugin_installations(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES {tenant_schema}.workspaces(id) ON DELETE CASCADE,
  is_enabled    BOOLEAN NOT NULL,
  is_override   BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID,  -- user_id of workspace admin who set it
  PRIMARY KEY (install_id, workspace_id)
);
```

`is_override = true` means the workspace admin explicitly set this value.
`is_override = false` would indicate a tenant-default-derived value (for
auditability).

### Resolution Logic

```
function isPluginVisible(plugin, workspaceId):
  row = SELECT * FROM plugin_workspace_visibility
        WHERE install_id = plugin.installId AND workspace_id = workspaceId

  if row exists AND row.is_override:
    return row.is_enabled

  else:
    return plugin_tenant_default.is_enabled
```

If no override row exists and the tenant default is `enabled`, the plugin
is visible. If no override row exists and the tenant default is `disabled`,
the plugin is hidden.

### Lifecycle Interactions

**Plugin deactivation**: When a tenant admin deactivates a plugin (soft-disable
without uninstalling), all visibility entries are set to `is_enabled = false`.
This is a bulk update, not row-by-row deletion — the override structure is
preserved for reactivation.

**Plugin reactivation**: When a deactivated plugin is reactivated, previous
visibility settings are restored. This means:
1. If the tenant default was `enabled` before deactivation, it becomes `enabled` again
2. If a workspace had an override to `disabled`, that override still applies
3. If a workspace had an override to `enabled`, that override still applies

This requires storing the pre-deactivation state:
```sql
ALTER TABLE core.plugin_default_visibility ADD COLUMN pre_deactivation_is_enabled BOOLEAN;
ALTER TABLE {tenant_schema}.plugin_workspace_visibility ADD COLUMN pre_deactivation_is_enabled BOOLEAN;
```

**Plugin uninstall**: All visibility entries in `plugin_workspace_visibility`
are cascade-deleted via the foreign key on `install_id`. The tenant default in
`core.plugin_default_visibility` is deleted via foreign key on `plugin_id`.

### Admin UI

**Tenant admin view**: Plugin management screen shows all installed plugins with
a toggle for tenant-wide default visibility. Changing the default affects all
workspaces that don't have overrides.

**Workspace admin view**: Workspace settings shows installed plugins with their
effective visibility (`visible`, `hidden-by-default`, `visible-by-override`,
`hidden-by-override`). Workspace admins can toggle overrides. A visual indicator
shows whether the current state is from the tenant default or a workspace override.

**User view**: Users only see plugins that are visible for their current workspace.
Hidden plugins do not appear in the sidebar, plugin menu, or any UI surface.

### Consistency with ABAC

Visibility (this ADR) is a UI concern — "should the plugin appear in the sidebar?"
Authorization (ADR-015) is an API concern — "can the user perform this action?"
The two layers are independent:

1. **Visibility gates UI rendering**: If a plugin is hidden, its sidebar items
   and routes are not rendered. No UI entry point exists.
2. **ABAC gates API access**: Even if a user somehow crafts a direct API request
   to a hidden plugin's proxy endpoint, ABAC evaluation determines whether the
   action is permitted. A hidden plugin doesn't mean "no authorization" — it
   means "no UI."

This separation prevents a hidden plugin from being discoverable via API
enumeration while maintaining ABAC as the authoritative access control layer.

## Consequences

### Positive
- **Frictionless onboarding**: New workspaces automatically inherit the tenant
  default (`enabled`), so members joining a new workspace see all relevant
  plugins immediately without workspace admin configuration.
- **Administrative control**: Workspace admins can declutter the UI for their
  team by hiding irrelevant plugins. The finance workspace doesn't need to
  see CI/CD pipeline widgets.
- **Override persistence**: Override settings survive plugin deactivation
  and reactivation. Workspace admins don't lose their configuration.
- **Clean separation from authorization**: Visibility is a UX layer; ABAC
  (ADR-015) is the security layer. Neither compromises the other.

### Negative
- **Two-tier model adds complexity**: Developers must check both levels
  when determining plugin visibility. Mitigated by a single helper function
  (`isPluginVisible()`) that encapsulates the resolution logic.
- **Pre-deactivation state storage**: Plugin deactivation/reactivation
  requires preserving previous visibility settings. Adds two columns
  (`pre_deactivation_is_enabled`) that are only used during the deactivation
  window.
- **Cross-schema queries**: Tenant default lives in `core` schema; workspace
  overrides live in `{tenant_schema}`. Visibility resolution requires a
  cross-schema query or two separate queries.

### Neutral
- **No performance impact**: Visibility checks are cheap key-value lookups
  (indexed by PK). Cacheable in Redis with event-driven invalidation on
  visibility changes.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Global on/off only** | Plugin is visible in all workspaces or none | Simplest model; one boolean per plugin | No per-workspace granularity; 20 workspaces all show the same plugins; Sales sees CI/CD plugins | Rejected — too coarse for multi-workspace tenants |
| **Per-workspace only (no default)** | Each workspace admin must explicitly enable every plugin | Maximum control | New workspaces show zero plugins — empty sidebar, dead UX; onboarding friction; every workspace admin repeats the same configuration | Rejected — violates NFR-01 (user experience must not degrade with tenant scale) |
| **Plugin categories with workspace subscriptions** | Plugins belong to categories; workspaces subscribe to categories | Batch visibility management | Over-engineered for the current scope; category management adds an entity and UI surface; most tenants have < 10 plugins — categories are unnecessary | Rejected — premature abstraction |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for data model | **COMPLIANT** | This ADR documents the visibility model, which introduces new database tables (`plugin_default_visibility`, `plugin_workspace_visibility`) — a significant data model change. |
| Rule 4: File size | **N/A** | Data model decision, not code. |
| Security §1: Tenant Isolation | **COMPLIANT** | `plugin_workspace_visibility` lives in the tenant schema. Cross-tenant visibility is impossible by construction. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — plugin extensibility. Visibility is an administrative control on top of the plugin installation model. |

## Related Decisions

- **ADR-006: Plugin Tables in Tenant Schema** — `plugin_workspace_visibility`
  is a tenant-schema table, consistent with ADR-006's plugin table placement.
- **ADR-015: Plugin Action Extension in ABAC** — Visibility (UI gating) and
  ABAC (API gating) are independent layers. Visibility hides the UI; ABAC
  enforces access.
- **ADR-003: ABAC Tree-Walk** — The workspace hierarchy already exists. Visibility
  ties into the workspace model without requiring tree-walk for visibility
  resolution (workspace-level only, no inheritance).
