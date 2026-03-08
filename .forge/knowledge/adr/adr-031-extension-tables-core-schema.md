# ADR-031: Extension Registry Tables Placement in Core Schema

> Architectural Decision Record documenting a deliberate, justified exception
> to the schema-per-tenant pattern (ADR-002) for the five Extension Registry
> tables. Extension tables are placed in the core (shared) schema with
> mandatory safeguards to preserve tenant isolation while enabling cross-plugin
> slot resolution and registry discovery.

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Status   | Accepted                                                         |
| Author   | forge-architect                                                  |
| Date     | 2026-03-08                                                       |
| Deciders | FORGE orchestrator, Spec 013 `/forge-plan` architecture analysis |

---

## Context

ADR-002 established **schema-per-tenant** as Plexica's database multi-tenancy
strategy. Under this pattern every tenant's data lives in an isolated
PostgreSQL schema (`tenant_{slug}`), so a missing `WHERE tenant_id = ...`
clause is _structurally impossible_ — the search path simply does not include
other tenants' schemas. This is a core security guarantee (Constitution
Article 1.2 §2, Article 5.2 §4).

ADR-025 introduced the first bounded exception to ADR-002: the `audit_logs`
table was placed in the core shared schema because Super Admin cross-tenant
compliance queries (Spec 008 FR-006) make per-tenant placement architecturally
infeasible. That ADR established the pattern of **mandatory safeguards** for
any table that deviates from schema-per-tenant.

Spec 013 (Extension Points) introduces five new tables for the Extension
Registry:

1. **`extension_slots`** — slot declarations from plugin manifests
2. **`extension_contributions`** — contribution registrations from plugin manifests
3. **`workspace_extension_visibility`** — workspace-level contribution toggles
4. **`extensible_entities`** — entity type declarations from plugin manifests
5. **`data_extensions`** — data extension registrations from plugin manifests

These tables share a critical characteristic with the `plugins` table
(already in core schema): they store **platform infrastructure metadata**
that must be resolved across the entire plugin ecosystem, not within a
single tenant's schema boundary.

### Why Extension Tables Cannot Be Per-Tenant

1. **Cross-plugin slot resolution**: When Plugin A renders an `<ExtensionSlot>`,
   the registry must resolve which contributions from other plugins target
   that slot. If extension data were in tenant schemas, the resolution query
   would need the slot owner's plugin ID (core data) joined with contribution
   records (tenant data) — but plugins are registered in the core schema, and
   the `plugins` table FK relationships cannot span schema boundaries in Prisma.

2. **Plugin activation sync**: When a plugin is activated or deactivated
   (ADR-018), the Extension Registry must update `is_active` flags on all
   slots and contributions for that plugin. With schema-per-tenant placement,
   this operation would require propagating the change across every tenant
   schema — O(n) in tenant count, same problem that disqualified tenant-schema
   placement for audit logs.

3. **Manifest sync at install time**: Plugin manifests declare slots,
   contributions, entities, and data extensions. These declarations are
   parsed once at install time and stored in the registry. The manifest is
   the same across all tenants (plugins are not tenant-specific); duplicating
   registry records into every tenant schema would be redundant and create
   data drift risk.

4. **Foreign key integrity**: `extension_slots.plugin_id`,
   `extension_contributions.contributing_plugin_id`, and
   `extension_contributions.target_plugin_id` reference `plugins.id` in the
   core schema. PostgreSQL foreign keys cannot span schemas when using
   Prisma's schema isolation model. Placing these tables in tenant schemas
   would require either (a) removing FK constraints (weakening data integrity)
   or (b) duplicating the `plugins` table per tenant (unacceptable complexity).

---

## Options Considered

### Option A: Core Schema with Mandatory Safeguards (Chosen)

Place all five extension tables in the `core` schema as a **documented
exception** to ADR-002, with explicit safeguards to enforce tenant isolation
at the application and database level. Follows the ADR-025 pattern exactly.

- **Pros**:
  - Foreign key integrity with `plugins` table maintained naturally
  - Plugin activation/deactivation updates are O(1) — single table updates
  - Manifest sync is simple — one set of records per plugin
  - Workspace visibility joins are straightforward (core → core)
  - Follows the established ADR-025 precedent with proven safeguard pattern
  - PostgreSQL RLS provides defense-in-depth isolation

- **Cons**:
  - Breaks schema-level isolation guarantee for five additional tables
  - Tenant isolation relies on application logic + RLS rather than schema boundary
  - Requires ongoing discipline: every new query path must include tenant context
  - Expands the set of core-schema exceptions (now `audit_logs` + 5 extension tables)

- **Effort**: Low (standard tables in core schema)
- **Risk**: Medium — mitigated by the 5 mandatory safeguards below

### Option B: Tenant Schema Placement (Rejected)

Place all five extension tables in each `tenant_{slug}` schema, consistent
with ADR-002.

- **Pros**:
  - Full schema-level isolation — impossible to leak across tenants
  - Consistent with every other tenant data table

- **Cons**:
  - **FK integrity impossible**: `plugin_id` references core `plugins` table;
    cross-schema FKs not supported in Prisma schema isolation model
  - **Plugin activation sync is O(n)**: Deactivating a plugin requires updating
    `is_active` across all tenant schemas — same problem as ADR-025 Option B
  - **Manifest sync duplication**: Same slot declarations duplicated into every
    tenant schema — data drift risk, migration complexity
  - **Workspace visibility joins break**: `workspace_extension_visibility`
    references `extension_contributions.id` — if in different schemas, join
    requires cross-schema query

- **Effort**: High (cross-schema FK workarounds, O(n) sync operations)
- **Risk**: High — FK integrity loss, O(n) operations at scale

**Rejected** because foreign key integrity cannot be maintained and O(n)
operations at plugin activation time violate the P95 < 200ms API response
SLA (Constitution Art. 4.3).

### Option C: Hybrid — Registry in Core, Visibility in Tenant (Rejected)

Place `extension_slots`, `extension_contributions`, `extensible_entities`,
and `data_extensions` in core schema. Place only
`workspace_extension_visibility` in tenant schemas (since it's workspace-scoped).

- **Pros**:
  - Workspace visibility data stays in tenant schema (stronger isolation)
  - Registry metadata (slots, contributions) in core where FKs work

- **Cons**:
  - `workspace_extension_visibility` references `extension_contributions.id`
    (core schema) — cross-schema FK required
  - Querying "which contributions are visible in workspace X?" requires a
    cross-schema join — Prisma cannot express this without raw SQL
  - Split placement adds migration complexity (two schemas per tenant)
  - Marginal isolation benefit: visibility toggles are boolean flags, not
    sensitive data; RLS provides equivalent protection

- **Effort**: Medium (cross-schema join complexity)
- **Risk**: Medium — cross-schema joins complicate queries and break Prisma model

**Rejected** because the cross-schema FK problem persists and the isolation
benefit is marginal (boolean visibility flags vs. RLS protection).

---

## Decision

**Place all five Extension Registry tables (`extension_slots`,
`extension_contributions`, `workspace_extension_visibility`,
`extensible_entities`, `data_extensions`) in the core (shared) schema as a
deliberate, documented exception to ADR-002 (schema-per-tenant).**

This is the **second** set of tables with this exception (after `audit_logs`
per ADR-025). Any additional exceptions require a new ADR with equivalent
safeguards.

This decision is contingent on full implementation of the 5 mandatory
safeguards below. If any safeguard cannot be implemented, this decision must
be revisited.

### Mandatory Safeguards

These safeguards are **non-negotiable** — they are conditions of this ADR,
not suggestions:

#### 1. Single Access Path: `ExtensionRegistryRepository`

All access to the five extension tables MUST go through the
`ExtensionRegistryRepository` class (or sub-repositories it delegates to).
No raw queries, no direct Prisma model access outside this class.

```typescript
// File: apps/core-api/src/modules/extension-registry/extension-registry.repository.ts
export class ExtensionRegistryRepository {
  // ALL extension table queries are here — no exceptions
}
```

Any module that needs extension data MUST depend on
`ExtensionRegistryRepository` or the `ExtensionRegistryService` that wraps
it. Direct `prisma.extensionSlots.findMany()` calls from outside this module
are a security violation.

#### 2. Required `tenantId` Parameter for Tenant-Scoped Queries

Every `ExtensionRegistryRepository` method that serves tenant or workspace
requests MUST accept `tenantId` as a **required** parameter (not optional,
not nullable). Tenant filtering is enforced by joining on `plugins.tenant_id`
or by filtering on the tenant context.

```typescript
// ✅ CORRECT: tenantId is required — cannot be forgotten
async getContributionsForSlot(
  tenantId: string,
  slotId: string,
  workspaceId: string
): Promise<ContributionWithVisibility[]> {
  // JOIN extension_contributions ON plugins WHERE plugins.tenant_id = tenantId
}

// ❌ FORBIDDEN: optional tenantId — allows accidental cross-tenant access
async getContributions(filters: { tenantId?: string; ... }): Promise<...> { ... }
```

#### 3. Explicit Super Admin Cross-Tenant Methods

Methods that query across tenants MUST be:

- Named explicitly to indicate cross-tenant scope (e.g.,
  `findAllSlotsAcrossTenants`, `searchCrossTenant`)
- Gated by a Super Admin role check at the service layer
- Never callable from tenant-scoped controller routes

```typescript
// Only called by SuperAdminExtensionController, which validates SUPER_ADMIN role
async findAllSlotsAcrossTenants(filters: CrossTenantSlotFilters): Promise<ExtensionSlot[]> {
  // No tenantId filter — intentional, for Super Admin only
}
```

#### 4. PostgreSQL Row-Level Security (Defense-in-Depth)

Add RLS policies on all five extension tables as a database-level backstop:

```sql
-- Enable RLS on extension tables
ALTER TABLE core.extension_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.extension_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.workspace_extension_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.extensible_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.data_extensions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation via plugin ownership (slots, contributions, entities, extensions)
-- Join to plugins table for tenant_id — RLS policy uses subquery
CREATE POLICY tenant_isolation ON core.extension_slots
  USING (plugin_id IN (
    SELECT id FROM core.plugins
    WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
  ));

-- Similar policies for other tables...

-- Super Admin bypass
CREATE POLICY super_admin_access ON core.extension_slots
  USING (current_setting('app.is_super_admin', true)::boolean = true);
```

The tenant context middleware already sets `app.current_tenant_id` via
`SET LOCAL` on each request. RLS is defense-in-depth — even if a bug
bypasses the `ExtensionRegistryRepository` abstraction, PostgreSQL will
enforce tenant filtering at the database level.

#### 5. Code Review Gate

Any new method added to `ExtensionRegistryRepository` MUST be reviewed for
tenant isolation compliance. The review checklist:

- [ ] Does the method include tenant context filtering (via `plugins.tenant_id`
      join or `WHERE` clause) if it serves tenant/workspace requests?
- [ ] If it's a cross-tenant method, is it explicitly named and gated by
      Super Admin role check?
- [ ] Does the method avoid exposing raw query builders or Prisma model
      access to callers?
- [ ] Does the method respect workspace visibility when returning contributions?

This requirement MUST be documented in the `ExtensionRegistryRepository`
class header comment and enforced during code review (Constitution Art. 4.2).

---

## Consequences

### Positive

- **Foreign key integrity maintained**: All five tables reference `plugins.id`
  in the same schema — standard PostgreSQL FK constraints enforced
- **O(1) plugin activation sync**: Deactivating a plugin updates `is_active`
  in a single UPDATE per table, not per-tenant
- **Single manifest sync**: Plugin manifests parsed once, stored once — no
  data drift across tenant schemas
- **Proven pattern**: Follows the ADR-025 safeguard model that was successfully
  implemented for audit logs
- **Query simplicity**: All extension registry queries are single-schema,
  Prisma-expressible, no raw SQL needed

### Negative

- **Weakened isolation for five tables**: Tenant isolation for extension tables
  depends on application logic + RLS rather than the schema boundary. This is
  a strictly weaker guarantee than schema-per-tenant.
- **Expanded exception set**: Two ADRs now document core-schema exceptions
  (ADR-025 + ADR-031). The precedent must be managed carefully.
- **RLS complexity**: Five additional tables with RLS policies, all requiring
  subquery joins to `plugins.tenant_id`. Performance impact of RLS subqueries
  must be monitored.
- **Requires ongoing discipline**: Every new query path must be reviewed for
  tenant isolation. A single missed tenant filter is a potential data leak.

### Neutral

- The `ExtensionRegistryRepository` abstraction makes future migration to a
  different storage pattern (e.g., per-tenant extension data) possible without
  changing callers.
- If extension table row counts grow large (>1M rows), table partitioning by
  `plugin_id` or `tenant_id` (via the plugins join) can be added as an
  operational optimization.

---

## Constitution Alignment

| Article                          | Alignment | Notes                                                                                                                                                                              |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1.2 §2 (Multi-Tenancy)      | ⚠️        | **Deliberate exception**: Schema-level isolation weakened for 5 tables. Mitigated by RLS + repository pattern. This is the second approved exception (after ADR-025).              |
| Art. 3.2 (Layered Architecture)  | ✅        | All access via `ExtensionRegistryRepository` → `ExtensionRegistryService` → `ExtensionRegistryController`. No layer bypasses.                                                      |
| Art. 3.3 (Prisma ORM)            | ✅        | All queries via Prisma through the repository. No raw SQL except RLS policy DDL (applied via migration).                                                                           |
| Art. 3.3 §4 (Tenant Context)     | ✅        | Tenant context middleware sets `app.current_tenant_id` for RLS. Repository methods enforce `tenantId` parameter.                                                                   |
| Art. 3.3 §5 (Repository Pattern) | ✅        | `ExtensionRegistryRepository` encapsulates all extension data access.                                                                                                              |
| Art. 4.2 (Code Review)           | ✅        | Safeguard 5 mandates tenant isolation review for all repository changes.                                                                                                           |
| Art. 5.1 §3 (RBAC)               | ✅        | Cross-tenant methods gated by Super Admin role check at service layer.                                                                                                             |
| Art. 5.2 §4 (Tenant Isolation)   | ⚠️        | RLS provides database-level enforcement, but it is defense-in-depth, not the primary guarantee. Primary guarantee is repository pattern + required `tenantId` parameter.           |
| Art. 5.3 §1 (Input Validation)   | ✅        | `tenantId` validated as UUID by Zod schema at controller layer before reaching repository.                                                                                         |
| Art. 8.1 (Required Test Types)   | ✅        | Integration tests must verify: (a) tenant-scoped queries never return other tenants' data, (b) RLS blocks direct queries without tenant context, (c) workspace visibility scoping. |

**Constitution compliance summary**: Two articles (1.2 §2, 5.2 §4) have
**qualified compliance** (⚠️) — this ADR documents a deliberate exception
with mitigations. All other articles are fully satisfied.

---

## Follow-Up Actions

- [ ] Implement `ExtensionRegistryRepository` with tenant-scoped and cross-tenant methods (Spec 013 T013-05)
- [ ] Add RLS policies via Prisma migration (Spec 013 T013-02)
- [ ] Write mandatory integration tests for tenant isolation (Spec 013 T013-28)
- [ ] Document this exception in architecture docs (`.forge/architecture/architecture.md`)
- [ ] Add `ExtensionRegistryRepository` class header comment referencing ADR-031

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **ADR-002**: Database Multi-Tenancy Strategy (schema-per-tenant) — this ADR
  documents the second bounded exception to ADR-002.
- **ADR-025**: Audit Logs Placement in Core Schema — established the bounded
  exception pattern and mandatory safeguard model that this ADR follows.
- **ADR-014**: Workspace Plugin Scoping — cascade-disable semantics inherited
  by `workspace_extension_visibility`.
- **ADR-018**: Plugin Lifecycle Status — activation/deactivation triggers
  `is_active` updates in extension tables.
- **Spec 013**: Extension Points — FR-023 requires persistent storage for
  slots, contributions, entities, and visibility settings.
- **Constitution Art. 1.2 §2**: Multi-tenancy isolation principle — qualified
  compliance documented above.
- **Constitution Art. 5.2 §4**: Tenant data isolation — RLS provides
  database-level enforcement as defense-in-depth.
