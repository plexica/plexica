# ADR-018: Plugin Lifecycle Status vs Marketplace Status (Separate Columns)

> Architectural Decision Record documenting the decision to maintain two
> orthogonal status columns on the `plugins` table: the existing `status`
> column for marketplace publishing state, and a new `lifecycle_status`
> column for runtime deployment state. Created for Spec 004 Plugin System,
> Plan 004 §4.1.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-24        |
| Deciders | Architecture Team |

---

## Context

The `plugins` table has an existing `PluginStatus` enum with values
`DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `DEPRECATED`, `REJECTED`. This
enum models the **marketplace publishing workflow** — whether a plugin has
been submitted, reviewed, approved, and made available to tenants.

Spec 004 (FR-003) defines a separate **lifecycle state machine** for
runtime deployment:

```
REGISTERED → INSTALLING → INSTALLED → ACTIVE → DISABLED → UNINSTALLING → UNINSTALLED
```

These two concerns are orthogonal:

- A plugin can be `PUBLISHED` (marketplace-approved) but `INSTALLING`
  (not yet deployed to the platform).
- A plugin can be `DEPRECATED` (marketplace-flagged) but `ACTIVE`
  (still running for existing tenants while they migrate).
- A plugin can be `DRAFT` (still being developed) but `INSTALLED` (in
  a staging environment for testing).

The current codebase conflates these by setting `status = PUBLISHED` in
`PluginRegistryService.registerPlugin()` — a marketplace approval action
triggered by a registration call. This makes the lifecycle state
impossible to track independently.

### Requirements Driving This Decision

| Req    | Summary                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------ |
| FR-003 | Lifecycle states: REGISTERED → INSTALLING → INSTALLED → ACTIVE → DISABLED → UNINSTALLING → UNINSTALLED |
| FR-001 | Each plugin runs in a separate container — container state must be tracked                             |
| FR-008 | Zero-downtime install/update — INSTALLING state must block traffic routing                             |
| §8 API | `GET /api/v1/plugins` must be filterable by both marketplace and lifecycle status                      |

---

## Options Considered

### Option A: Separate `lifecycleStatus` column with new enum (chosen)

Add a new column `lifecycle_status` of type `PluginLifecycleStatus` (new
enum) to the `plugins` table alongside the existing `status` column.

- **Pros**:
  - Clean separation of concerns — neither column bleeds into the other's
    domain
  - Both statuses independently queryable and indexable
  - No breaking change to existing marketplace workflows or API consumers
    that filter by `status`
  - Additive migration — safe default value (`REGISTERED`) prevents
    breakage for existing rows
  - Reflects domain reality: a plugin has a publishing lifecycle AND a
    deployment lifecycle
- **Cons**:
  - Two status columns may confuse developers unfamiliar with the
    distinction; requires clear documentation
  - Slightly wider row; negligible at scale

### Option B: Repurpose the existing `status` enum with lifecycle values

Replace the existing `PluginStatus` enum values with the lifecycle states,
or combine both sets into a single enum (e.g., `DRAFT | PUBLISHED | REGISTERED | INSTALLING | INSTALLED | ACTIVE | ...`).

- **Pros**:
  - Single column, simpler schema surface
- **Cons**:
  - **Breaks existing code and API**: All code that checks `status ===
'PUBLISHED'` would need migration. API consumers filtering by
    `status=PUBLISHED` would receive no results post-migration.
  - **Semantically incorrect**: `PUBLISHED` (marketplace) and `ACTIVE`
    (runtime) overlap in meaning but are not the same event. A plugin can
    be re-published (new version) without changing its runtime state.
  - The combined enum would become a state machine with two disconnected
    subgraphs — confusing and error-prone.
  - Requires a data migration that must handle all existing `status`
    values, with no reversible default.

### Option C: Separate `deployments` table (plugin deployment tracking)

Track lifecycle state in a separate `plugin_deployments` table with one
row per deployment event.

- **Pros**:
  - Full audit trail of all lifecycle transitions with timestamps
  - Allows multiple deployment histories (version A deployed, then B)
- **Cons**:
  - **Overengineered for current scope**: Spec 004 requires current state,
    not transition history. Transition history can be added later.
  - Requires a JOIN on every plugin query to get current state.
  - Makes lifecycle state updates multi-step (insert row + update
    current-state denormalized field or query MAX timestamp).
  - Constitution Art. 3.3: prefer Prisma ORM patterns; complex JOIN
    queries add friction without benefit at current scale.

---

## Decision

**Chosen option**: Option A — add a separate `lifecycle_status` column
with a new `PluginLifecycleStatus` enum.

### New Enum

```prisma
enum PluginLifecycleStatus {
  REGISTERED    // Manifest submitted, not yet installed
  INSTALLING    // Container image pull + tenant migrations in progress
  INSTALLED     // Container ready, not yet started
  ACTIVE        // Container running, health check passing, traffic routed
  DISABLED      // Container stopped, data preserved, routes deregistered
  UNINSTALLING  // Container removal + cleanup in progress
  UNINSTALLED   // Fully removed; record retained for audit

  @@schema("core")
}
```

### Schema Change

```prisma
model Plugin {
  // ... existing fields ...
  status          PluginStatus          @default(DRAFT)
  lifecycleStatus PluginLifecycleStatus @default(REGISTERED) @map("lifecycle_status")
  // ...
  @@index([lifecycleStatus])
}
```

### State Machine Rules

Valid transitions (enforced by `PluginLifecycleService`):

| From         | To           | Trigger                      |
| ------------ | ------------ | ---------------------------- |
| REGISTERED   | INSTALLING   | `installPlugin()` called     |
| INSTALLING   | INSTALLED    | Image pull + migrations done |
| INSTALLING   | REGISTERED   | Install failed (rollback)    |
| INSTALLED    | ACTIVE       | `enablePlugin()` + health OK |
| ACTIVE       | DISABLED     | `disablePlugin()` called     |
| DISABLED     | ACTIVE       | `enablePlugin()` called      |
| DISABLED     | UNINSTALLING | `uninstallPlugin()` called   |
| INSTALLED    | UNINSTALLING | `uninstallPlugin()` called   |
| UNINSTALLING | UNINSTALLED  | Cleanup complete             |

Invalid transitions are rejected with a `400 Bad Request` and error code
`INVALID_LIFECYCLE_TRANSITION`.

### API Filter Support

`GET /api/v1/plugins` accepts both `status` and `lifecycleStatus` query
parameters as independent filters:

```
GET /api/v1/plugins?lifecycleStatus=ACTIVE          → all running plugins
GET /api/v1/plugins?status=PUBLISHED                → all marketplace-approved plugins
GET /api/v1/plugins?status=PUBLISHED&lifecycleStatus=INSTALLED → approved but not yet enabled
```

### Migration

```sql
-- Safe backfill: existing PUBLISHED plugins → INSTALLED (closest equivalent)
-- (They exist in the registry and may be deployable, but runtime state is unknown)
UPDATE "core"."plugins"
  SET "lifecycle_status" = 'INSTALLED'
  WHERE "status" = 'PUBLISHED';

-- All other existing rows default to 'REGISTERED' (new column default)
```

---

## Consequences

### Positive

- **No breaking changes**: Existing marketplace API consumers (`status`
  filter) continue to work unchanged.
- **Clear domain model**: Developers and operators can independently query
  "which plugins are marketplace-approved" and "which plugins are currently
  running" — two distinct operational concerns.
- **Traffic routing safety**: The `INSTALLING` state can be checked by
  the API gateway to block traffic routing before a plugin is healthy.
  This is impossible when a single `status` field serves dual purpose.
- **Operational clarity**: Monitoring dashboards can display marketplace
  health (PUBLISHED count) and runtime health (ACTIVE count) as separate
  metrics.

### Negative

- **Developer onboarding friction**: Two status fields require
  documentation and code comments to clarify intent. Mitigated by adding
  JSDoc comments to both fields in the Prisma schema.
- **Migration complexity**: The backfill heuristic (`PUBLISHED → INSTALLED`)
  is imprecise — some `PUBLISHED` plugins may not be deployed. Operators
  must verify runtime state after migration. Mitigated by defaulting to
  `INSTALLED` (safe: traffic won't route until `ACTIVE`).

### Neutral

- **`UNINSTALLED` records are retained**: The `UNINSTALLED` state is the
  terminal state — the plugin row is NOT deleted from the database. This
  preserves the audit trail and allows re-installation without losing
  the plugin's `download_count`, `install_count`, and `ratings`. A
  separate cleanup job can archive or delete old `UNINSTALLED` records
  after a retention period.

---

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                                                               |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | **Security First**: `INSTALLING` state blocks traffic routing (NFR-008). **Zero-downtime** (Art. 1.2.6): lifecycle states enable rolling updates.                                   |
| Art. 3  | COMPLIANT | **Prisma ORM** (Art. 3.3): additive migration, no raw SQL in application code. **Database naming** (Art. 7.2): `lifecycle_status` snake_case, index `idx_plugins_lifecycle_status`. |
| Art. 4  | COMPLIANT | **API backward compat** (Art. 1.2.3): existing `status` API unchanged.                                                                                                              |
| Art. 6  | COMPLIANT | **Error format** (Art. 6.2): invalid transition returns `{ error: { code: "INVALID_LIFECYCLE_TRANSITION", message: "..." } }`.                                                      |
| Art. 9  | COMPLIANT | **Safe migrations** (Art. 9.1.3): additive column with safe default; backfill is non-destructive.                                                                                   |

---

## Follow-Up Actions

- [ ] Add `PluginLifecycleStatus` enum to `packages/database/prisma/schema.prisma` (T004-01)
- [ ] Generate and apply migration with backfill SQL (T004-01)
- [ ] Update `@plexica/database` exports to include `PluginLifecycleStatus` (T004-02)
- [ ] Implement state machine validation in `PluginLifecycleService` (T004-03)
- [ ] Update ADR README index with ADR-018 entry
- [ ] Add JSDoc comments to `Plugin` model fields in schema clarifying the two-status distinction

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-003: Plugin Language Support](adr-003-plugin-language-support.md) —
  TypeScript only for plugins; plugin SDK integrates with lifecycle events
- [ADR-007: Prisma ORM](adr-007-prisma-orm.md) — additive migration
  pattern; parameterized queries for lifecycle state updates
- [ADR-019: Pluggable Container Adapter](adr-019-pluggable-container-adapter.md) —
  container start/stop operations are the primary triggers for INSTALLED→ACTIVE
  and ACTIVE→DISABLED transitions
- Spec 004 FR-003: `.forge/specs/004-plugin-system/spec.md`
- Plan 004 §4.1: `.forge/specs/004-plugin-system/plan.md`
- Constitution Articles 1.2, 3.3, 7.2, 9.1

## References

- `packages/database/prisma/schema.prisma` — existing `PluginStatus` enum and `Plugin` model
- `apps/core-api/src/services/plugin.service.ts` — `PluginLifecycleService` (stub `runLifecycleHook`)
- [Prisma Enum Migration Guide](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
- [State Machine Pattern](https://refactoring.guru/design-patterns/state) — reference for lifecycle transition enforcement
