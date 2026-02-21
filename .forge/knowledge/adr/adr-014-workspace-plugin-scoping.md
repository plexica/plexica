# ADR-014: WorkspacePlugin Scoping Separate from TenantPlugin

> Architectural Decision Record documenting the decision to use a separate
> `workspace_plugins` join table for per-workspace plugin enablement, rather
> than extending the existing `tenant_plugins` table. Created by the
> `forge-architect` agent via `/forge-adr`.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-20        |
| Deciders | Architecture Team |

---

## Context

Spec 011 (Workspace Hierarchical Visibility & Templates) introduces
per-workspace plugin enablement as part of Pillar 2 (Workspace Templates).
When a workspace is created from a template, the template can specify which
plugins should be enabled for that workspace. Additionally, workspace admins
should be able to manually enable/disable plugins for their workspace.

Today, plugins are enabled at the **tenant level** via the `tenant_plugins`
table (a join between `tenants` and `plugins`). This controls which plugins
are available to a tenant's users. The new requirement is to add a
**workspace level** of plugin enablement — a workspace only activates a
subset of the tenant's installed plugins.

This creates a two-level enablement model:

```
Tenant Level:     Plugin X installed for Acme Corp  (tenant_plugins)
Workspace Level:  Plugin X activated for "Engineering" workspace  (workspace_plugins)
```

Key requirements from the spec:

- **FR-023**: Enable/disable plugins at workspace level
- **FR-024**: Tenant-level enablement is a prerequisite — cannot enable a
  plugin at workspace level unless it's enabled at tenant level
- **FR-025**: Workspace-specific plugin configuration (separate from tenant config)
- **FR-026**: When a tenant plugin is disabled, cascade disable to all
  workspace plugins for that plugin; when re-enabled, do NOT cascade re-enable

## Options Considered

### Option A: Separate workspace_plugins Table

- **Description**: Create a new `workspace_plugins` join table with
  `(workspace_id, plugin_id)` as composite primary key. Each row stores
  `enabled`, `configuration`, and timestamps. The table is independent of
  `tenant_plugins` but enforces the prerequisite via application-level
  validation (check `tenant_plugins.enabled = true` before allowing
  workspace-level enablement).
- **Pros**:
  - Clear separation of concerns — tenant-level and workspace-level
    plugin management are distinct bounded contexts (Art. 3.2)
  - Workspace-specific configuration stored independently — no risk of
    workspace config polluting tenant config or vice versa
  - Simple cascade disable: `UPDATE workspace_plugins SET enabled = false
WHERE plugin_id = ? AND workspace_id IN (SELECT id FROM workspaces
WHERE tenant_id = ?)`
  - Schema is self-documenting — the `workspace_plugins` table clearly
    indicates per-workspace plugin state
  - Foreign key on `workspace_id` with `ON DELETE CASCADE` automatically
    cleans up when a workspace is deleted
  - Template application can insert workspace plugin records directly
    within the workspace creation transaction
- **Cons**:
  - Two-level lookup required: to check if a plugin is fully active for
    a workspace, must check both `tenant_plugins.enabled` AND
    `workspace_plugins.enabled`
  - Slightly more complex plugin management UX — users must understand
    two levels of enablement
  - Additional table increases schema surface area
- **Effort**: Medium

### Option B: Extend tenant_plugins with Workspace Scope

- **Description**: Add a nullable `workspace_id` column to the existing
  `tenant_plugins` table. Tenant-level records have `workspace_id = NULL`.
  Workspace-level records have a specific `workspace_id`. The primary key
  changes to `(tenant_id, plugin_id, workspace_id)` (or `(plugin_id,
workspace_id)` with NULL handling).
- **Pros**:
  - Single table for all plugin enablement — simpler mental model
  - Existing tenant plugin queries continue to work (WHERE workspace_id IS NULL)
  - No new migration for a separate table
- **Cons**:
  - **NULL handling complexity**: PostgreSQL treats NULL ≠ NULL in unique
    constraints, requiring partial indexes (same issue as workspace slug
    uniqueness). The composite key `(tenant_id, plugin_id, workspace_id)`
    doesn't enforce uniqueness for tenant-level rows where `workspace_id`
    is NULL
  - **Blurred bounded contexts**: Tenant-level and workspace-level
    concerns are mixed in one table, violating DDD principles (Art. 3.2)
  - **Configuration collision risk**: Tenant-level and workspace-level
    `configuration` JSONB columns would coexist in the same table,
    requiring careful filtering to avoid returning the wrong config
  - **Cascade complexity**: Cascade disable requires UPDATE with WHERE
    `workspace_id IS NOT NULL AND plugin_id = ?` — more error-prone than
    a clean separate table
  - **Query complexity**: Every plugin query must filter by `workspace_id`
    (NULL for tenant, specific for workspace), adding cognitive load
  - **Breaking change**: Modifying the primary key of `tenant_plugins`
    requires dropping and recreating the table or complex ALTER operations
- **Effort**: Medium-High

### Option C: Configuration Inheritance (No Workspace Table)

- **Description**: Instead of per-workspace plugin records, use workspace
  `settings` JSONB to store plugin overrides. A workspace inherits all
  tenant plugins by default and can override individual plugin configuration
  or disable specific plugins via its settings.
- **Pros**:
  - No new table — uses existing workspace `settings` column
  - Simple inheritance model — workspace settings override tenant defaults
  - Minimal schema changes
- **Cons**:
  - **No referential integrity**: Plugin references in JSONB are not
    validated by the database. A workspace could reference a non-existent
    plugin ID without error
  - **Template application is complex**: Template items must be applied
    as JSONB patches rather than relational inserts
  - **Query complexity**: Determining which plugins are active for a
    workspace requires merging tenant plugin state with workspace JSONB
    overrides at application level
  - **No cascading**: Disabling a tenant plugin does not automatically
    update workspace JSONB settings — requires application-level sweep
  - **Audit trail lost**: No `created_at` / `updated_at` per plugin
    enablement — only the workspace `updated_at` changes
  - **Violates Art. 3.3**: Plugin enablement is relational data that should
    be modeled relationally, not as unstructured JSONB
- **Effort**: Low

## Decision

**Chosen option**: Option A — Separate `workspace_plugins` Table

**Rationale**:

A separate `workspace_plugins` table is the architecturally sound choice
for the following reasons:

1. **Bounded context integrity** (Art. 3.2): Tenant-level plugin management
   and workspace-level plugin management are distinct domains with different
   access control rules (tenant admin vs. workspace admin), different
   configuration schemas, and different lifecycle events. Mixing them in
   one table violates the DDD principle of bounded contexts.

2. **Referential integrity**: The `workspace_plugins` table has proper
   foreign keys to both `workspaces` (with `ON DELETE CASCADE`) and
   `plugins`. This ensures data consistency without application-level
   enforcement. Option C's JSONB approach loses this guarantee entirely.

3. **Clean cascade semantics**: The cascade disable rule (FR-026) maps
   directly to a single UPDATE statement on `workspace_plugins`. No NULL
   handling, no JSONB patching, no partial index workarounds.

4. **Template transactionality**: During workspace creation with a template
   (FR-015, FR-016), template items of type `'plugin'` insert rows directly
   into `workspace_plugins` within the creation transaction. This is a
   simple relational INSERT, not a JSONB merge operation.

5. **Two-level lookup is acceptable**: The requirement to check both
   tenant and workspace enablement is a domain-level business rule, not a
   schema deficiency. It's implemented as a single JOIN query:

   ```sql
   SELECT wp.* FROM workspace_plugins wp
   JOIN tenant_plugins tp ON tp.plugin_id = wp.plugin_id
     AND tp.tenant_id = ?
   WHERE wp.workspace_id = ? AND wp.enabled = true AND tp.enabled = true
   ```

6. **Option B rejected**: Extending `tenant_plugins` with a nullable
   `workspace_id` creates NULL handling complexity, blurs bounded contexts,
   and requires breaking changes to the existing primary key. The marginal
   benefit of "one table" does not justify the added complexity.

## Consequences

### Positive

- Clear separation between tenant-level and workspace-level plugin
  management. Each has its own table, foreign keys, and lifecycle.
- Workspace deletion automatically cascades to workspace plugin records
  via `ON DELETE CASCADE` — no orphan cleanup needed.
- Template application inserts workspace plugin records directly, enabling
  full transactional guarantees (FR-016).
- Cascade disable is a single, efficient UPDATE statement (FR-026).
- Workspace-specific plugin configuration is stored independently,
  preventing configuration collision with tenant-level settings.

### Negative

- Two-level lookup required for "is plugin active for this workspace?"
  checks. This adds a JOIN to plugin-related queries but is a single-query
  operation with proper indexing.
- Slightly more complex plugin management UX — the frontend must
  communicate that tenant-level enablement is a prerequisite for
  workspace-level enablement.
- Additional table increases the total schema surface area by one table.

### Neutral

- The `cascade disable without cascade re-enable` rule is an asymmetric
  business rule that must be documented clearly for developers. When a
  tenant admin disables a plugin, all workspace instances are disabled
  automatically. When the tenant admin re-enables the plugin, workspace
  admins must manually re-enable it for their workspaces. This is an
  intentional design choice to prevent unexpected workspace changes.
- The `configuration` JSONB column on `workspace_plugins` is workspace-
  specific and independent of the tenant-level configuration. Plugin
  developers must document which configuration keys are tenant-level
  vs. workspace-level.

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                            |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | COMPLIANT | Plugin system integrity maintained (Art. 1.4). Tenant isolation enforced via tenant-level prerequisite check (Art. 1.2).                         |
| Art. 2  | COMPLIANT | No new dependencies. Uses existing PostgreSQL, Prisma, and Zod stack (Art. 2.1).                                                                 |
| Art. 3  | COMPLIANT | DDD bounded context separation (Art. 3.2). Relational data modeled relationally — no JSONB for relational concerns (Art. 3.3).                   |
| Art. 4  | COMPLIANT | Plugin lookup queries meet < 50ms P95 target with composite index on `(workspace_id, plugin_id)` (Art. 4.3).                                     |
| Art. 5  | COMPLIANT | Parameterized queries prevent SQL injection (Art. 5.3). Tenant isolation enforced — workspace plugins scoped within tenant schema (Art. 5.2).    |
| Art. 6  | COMPLIANT | Clear error codes for plugin enablement failures: `PLUGIN_NOT_TENANT_ENABLED`, `WORKSPACE_PLUGIN_EXISTS`, `WORKSPACE_PLUGIN_NOT_FOUND` (Art. 6). |
| Art. 9  | COMPLIANT | New table migration is backward-compatible (Art. 9.1). Existing `tenant_plugins` table is unchanged.                                             |

## Follow-Up Actions

- [x] Document `workspace_plugins` schema in Plan 011 (Section 2.2)
- [x] Document `WorkspacePluginService` API in Plan 011 (Section 4.3)
- [x] Document cascade disable logic in Plan 011 (Section 4.3)
- [ ] Implement schema migration (Task T8) — create `workspace_plugins` table
- [ ] Implement `WorkspacePluginService` (Task T9) with cascade disable
- [ ] Implement workspace plugin endpoints (Task T11)
- [ ] Add integration tests for cascade disable on tenant plugin removal
- [ ] Document two-level enablement model in developer documentation

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-002: Database Multi-Tenancy](adr-002-database-multi-tenancy.md) —
  workspace plugins operate within tenant schema boundaries
- [ADR-007: Prisma ORM](adr-007-prisma-orm.md) — workspace plugin queries
  use `Prisma.$queryRaw` with parameterized inputs
- [ADR-013: Materialised Path](adr-013-materialised-path.md) — companion
  decision for workspace hierarchy (same spec)
- Spec 011: `.forge/specs/011-workspace-hierarchy-templates/spec.md`
  (FR-023 through FR-026)
- Plan 011: `.forge/specs/011-workspace-hierarchy-templates/plan.md`
  (Sections 2.2, 4.3, 7.2)
- Constitution Articles 1.2, 1.4, 3.2, 3.3

## References

- [Prisma Composite Keys](https://www.prisma.io/docs/orm/prisma-schema/data-model/models#defining-a-composite-primary-key)
- [PostgreSQL ON DELETE CASCADE](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
- Domain-Driven Design — Bounded Context pattern (Eric Evans, 2003)
