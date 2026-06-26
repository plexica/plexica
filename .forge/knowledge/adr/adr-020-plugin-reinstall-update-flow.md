# ADR-020: Plugin Reinstall = Update Flow

**Status**: Proposed
**Date**: 2026-06-26
**Driver**: DR-19 from Spec 004 (Plugin System) — Plugin Update Mechanism
**Extends**: ADR-006 (Plugin Tables in Tenant Schema), ADR-013 (Container Hosting Model)
**Deciders**: TBD

## Context

Spec 004 Scope section explicitly states: "Plugin versioning / semver — Out of
Scope." However, a practical mechanism for updating installed plugins is
essential for any real-world plugin system. Plugin developers will ship bug
fixes, feature additions, and dependency updates. Without an update mechanism,
the only way to "update" a plugin is to uninstall and reinstall it — causing
data loss, downtime, and reconfiguration.

Options considered:
- **No updates at all**: Simple, but unrealistic. The first critical security
  fix in a plugin forces a painful uninstall-reinstall cycle with data loss.
- **Full semver versioning with upgrade paths**: Semver-tagged versions,
  side-by-side installations, canary rollouts, upgrade consent screens. The
  gold standard, but complex — multiple versions of the same plugin running
  simultaneously, migration compatibility matrices, rollback automation.
- **"Reinstall = Update"**: Super admin uploads a new package for an existing
  plugin slug. The platform detects it's a reinstall, validates the new manifest,
  and applies changes. Simple, practical, and covers the majority of update
  use cases without the complexity of full semver versioning.

The core tension: simplicity (single active version) vs. flexibility (side-by-side
versions, canary rollouts, phased upgrades). For the initial sprint, simplicity
wins — the mechanism can be evolved into full semver versioning later without
architectural changes.

## Decision

**Reinstall = Update — simple "replace current version" flow.**

When a super admin uploads a plugin package for a plugin slug that already exists
in the registry, the platform detects this as an update (reinstall) rather than
a new installation. The update replaces the current version of the plugin.

### Update Flow

1. **Super admin uploads new package** (container image + optional UI assets)
   for an existing plugin slug
2. **Core detects reinstall**: Plugin slug already exists in `core.plugins`
3. **Validation gate — must pass ALL checks before any changes are applied**:
   - `manifest.version` must differ from the current installed version
   - Cannot remove declared action keys (breaking change for existing ABAC
     configurations — would leave orphaned permissions)
   - Cannot make schema-destructive changes to `declaredTables`:
     - Adding new tables: allowed
     - Adding new columns: allowed (must be nullable or have defaults)
     - Removing tables: rejected (would cause data loss)
     - Removing columns: rejected (would cause data loss)
     - Renaming tables/columns: rejected (treated as remove + add, which is
       destructive)
     - Changing column types: checked per-column; widening types (INT → BIGINT)
       allowed; narrowing types rejected
   - Event subscriptions: cannot remove previously subscribed event types
     (would leave dangling consumer group subscriptions)
4. **Schema migration**: If `declaredTables` changed (new tables or columns),
   migrations are applied to **all tenant schemas** where the plugin is installed
5. **Atomic rollout**: If the migration fails on **any** tenant schema, all
   migrations are rolled back (savepoints per tenant, then final commit or
   rollback across all tenants)
6. **Container replacement**: Old container(s) stopped, new container(s) started
   with the updated image and updated configuration
7. **UI asset replacement**: Old UI assets in MinIO are overwritten with new
   assets at the same path (`plugins/{slug}/{version}/`)
8. **Kafka consumer rebalance**: The consumer group rebalances to the new
   container instances

### Version Validation

```typescript
interface UpdateValidation {
  versionChanged: boolean;       // Must be true — 409 Conflict if same version
  actionsRemoved: string[];     // Must be empty — validation error if non-empty
  tablesRemoved: string[];      // Must be empty — validation error if non-empty
  columnsRemoved: string[];     // Must be empty — validation error if non-empty
  eventsRemoved: string[];      // Must be empty — validation error if non-empty
  schemaChanges: {              // Only additive changes
    newTables: string[];
    newColumns: { table: string; column: string; type: string }[];
  };
}
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| **Same version tag uploaded** | 409 Conflict — "Version X is already the current version. No update applied." |
| **Action key removed in new manifest** | Validation fails — "Cannot remove action key 'crm:deal:manage'. Removing action keys breaks existing ABAC configurations." |
| **Column type narrowed (BIGINT → INT)** | Validation fails — "Column 'crm_contacts.score': narrowing BIGINT to INT may cause data loss." |
| **Migration fails on tenant #3 of 10** | All 10 tenants rolled back. Error logged to DLQ (ADR-016). Plugin stays at previous version. Super admin notified with per-tenant failure details. |
| **Container-only update (no schema diff)** | Container replaced, UI assets in MinIO swapped, consumer group rebalanced. No schema operations. Fastest update path (< 30 seconds). |
| **UI-only update (no container or schema diff)** | UI assets in MinIO swapped. No container restart, no schema operations. Instant update (< 5 seconds). |
| **Container image pull fails** | Update aborted before any schema changes. Plugin stays at previous version. Error surfaced to super admin. |
| **Plugin has 0 active installations** | Update applied to registry only (manifest, container image reference, UI assets). No tenant schemas or containers affected. |

### Data Preservation

Tenant data is preserved across updates:
- Existing tables and their data are untouched (only additive changes allowed)
- Existing `plugin_workspace_visibility` settings are preserved (ADR-018)
- Existing `workspace_role_action` assignments for plugin actions are preserved
  (ADR-015)
- Existing Kafka consumer group offsets are preserved (container restart
  reconnects the same consumer group)
- Existing MinIO assets for other versions are preserved (if the update changes
  `version`, the new assets are at a new path — old assets remain)

### Atomicity Guarantee

The update is **all-or-nothing**:
- If the migration fails on any tenant schema, **all** tenant schemas are rolled
  back. The plugin stays at the previous version.
- Rollback uses PostgreSQL savepoints: `SAVEPOINT plugin_update_{tenant}` before
  each tenant's migration, then either `RELEASE SAVEPOINT` (all succeeded) or
  `ROLLBACK TO SAVEPOINT` (any failure).
- Container replacement only occurs after all schema migrations succeed
- UI asset replacement only occurs after container replacement succeeds
- If the container fails to start, the update is rolled back: old container
  restarted, new container removed

### Future Evolution to Full Versioning

This model is designed to be a stepping stone to full semver versioning:
- The `version` field in the manifest is already required — it's the seed for
  future semver support
- MinIO paths are version-scoped (`plugins/{slug}/{version}/`) — side-by-side
  versions can coexist without path conflicts
- The update validation logic (checking for action removal, destructive schema
  changes) applies equally to semver upgrade paths
- Consumer group naming already includes version (`plugin-{installId}-{tenant}`) —
  adding a version suffix is a non-breaking change

When full versioning is implemented (future spec), the transition from
"Reinstall = Update" to "Semver with upgrade paths" requires only:
1. Allow multiple versions per plugin in `plugin_registry`
2. Add upgrade consent screen for tenant admins
3. Add canary rollout support (percentage-based traffic splitting)

## Consequences

### Positive
- **Simple implementation**: The reinstall flow reuses the existing 11-step
  installation process with a detection branch ("already installed → validation
  → apply changes"). No new infrastructure or API patterns.
- **Data safety**: Additive-only schema changes guarantee no data loss.
  Atomic rollout guarantees no partial updates.
- **Covers 90% of update use cases**: Bug fixes, feature additions, dependency
  updates are all additive — allowed under this model.
- **Preserves ABAC and visibility configuration**: Reinstall does not reset
  permission assignments or workspace visibility settings.
- **Seed for future versioning**: The `version` field, MinIO path structure,
  and validation logic are all forward-compatible with full semver versioning.

### Negative
- **No side-by-side versions**: Cannot run v1 and v2 of the same plugin
  simultaneously. All installations of a plugin are updated at once. This is
  acceptable for the initial sprint but limits canary testing and phased
  rollouts.
- **No downgrade mechanism**: Once updated, there is no built-in "roll back
  to previous version" — the super admin would need to upload the previous
  version's package and reinstall. A proper rollback mechanism is deferred
  to the full versioning implementation.
- **Destructive changes are impossible**: If a plugin legitimately needs to
  remove a column or rename a table, the validation gate blocks it. The
  workaround is to create a new plugin slug (effectively a new plugin). This
  is a deliberate trade-off for data safety.
- **All-tenant-at-once updates**: If a plugin is installed for 50 tenants, all
  50 get the update simultaneously. A migration failure on tenant #49 aborts
  the update for all 50. No per-tenant update gating.

### Neutral
- **Version field required but not semver-enforced**: The `version` field in
  the manifest is required and must change for each update, but the platform
  does not enforce semver semantics (major.minor.patch) or bump rules. This
  freedom is appropriate for the initial sprint.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Full semver versioning** | Multiple versions coexisting; upgrade consent per tenant; canary rollouts; rollback automation | Maximum flexibility; supports phased rollouts; industry-standard | 3-4x implementation complexity; requires version registry, upgrade UI, traffic splitting, compatibility matrices, and rollback orchestration; excessive for initial sprint | Deferred — out of scope per Spec 004. This ADR's model is forward-compatible. |
| **No updates — uninstall + reinstall** | No update mechanism; update = uninstall (data loss) + reinstall | Zero implementation cost | Data loss on every update; ABAC and visibility config lost; downtime during uninstall/reinstall window; untenable for any real plugin | Rejected — unacceptable operational model |
| **Hot-patching (live container swap with zero downtime)** | Kubernetes rolling update with two replicas during the transition | Zero downtime; container never unavailable | Requires 2x container resources per plugin; much more complex orchestration; overkill for single-replica plugin installations | Rejected — excessive for initial sprint. Can be added later in the Kubernetes hosting path (ADR-013). |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for data model | **COMPLIANT** | This ADR documents the update mechanism, which involves schema migration, container lifecycle, and UI asset replacement — a significant architectural decision. |
| Security §1: Tenant Isolation | **COMPLIANT** | Atomic rollout ensures no partial updates that could break tenant isolation. Tenant schemas are updated independently within the atomic transaction boundary. |
| Security §6: PII | **COMPLIANT** | Tenant data is preserved across updates. No data migration means no risk of PII exposure during the update process. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — plugin updates follow the same installation model. Additive-only schema changes maintain ADR-006's table placement. |

## Related Decisions

- **ADR-006: Plugin Tables in Tenant Schema** — The update flow iterates over
  all tenant schemas to apply schema migrations. Consistent with ADR-006's
  table placement model.
- **ADR-013: Container Hosting Model** — Container replacement during updates
  uses the same `ContainerManager` interface. `DockerContainerManager` and
  `KubernetesContainerManager` handle container lifecycle updates uniformly.
- **ADR-014: Hybrid UI Delivery Model** — UI assets in MinIO are overwritten
  at the version-scoped path. Old version assets are preserved if the version
  changed (new path).
- **ADR-015: Plugin Action Extension in ABAC** — Existing `workspace_role_action`
  assignments are preserved. Removed action keys are blocked at validation.
- **ADR-018: Two-Level Plugin Visibility** — Existing `plugin_workspace_visibility`
  settings are preserved.
- **Spec 004 Out of Scope**: "Plugin versioning / semver" — This ADR provides
  the practical update mechanism while deferring full semver versioning.
