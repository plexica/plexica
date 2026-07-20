# ADR-022: Super Admin Infrastructure and Data Model

**Status**: Accepted
**Date**: 2026-07-10
**Driver**: Spec 005 — Super Admin Panel (Constitution Art. 5 ADR recommendation, §13)
**Extends**: ADR-001 (Schema-per-tenant), ADR-002 (Keycloak multi-realm), ADR-004 (Kafka/Redpanda Event Bus), ADR-016 (Two-Tier DLQ)
**Deciders**: TBD

## Context

Spec 005 delivers the Super Admin Panel — the platform-wide control plane
that provisions, suspends, reactivates, and deletes tenants, curates the
plugin catalog, and monitors system health. Five decisions cross the
Article 5 threshold (data-model changes, a new infrastructure service, a
concurrency-safety mechanism on an existing table, and a plugin review
queue data model) and require this ADR:

1. **GDPR tenant deletion is a multi-resource saga.** Deletion spans three
   independent resources — PostgreSQL schema drop, Keycloak realm delete,
   MinIO bucket delete (Spec 005 §7 edge cases). Each can fail independently.
   The tenant must not be marked deleted until all three succeed, and failed
   steps must be retried and surfaced to the admin UI. This needs a
   persistence table to track per-step saga state.

2. **Super-admin actions are platform-wide and cross-tenant.** Actions like
   `tenant.provision`, `tenant.suspend`, `tenant.delete`, `plugin.publish`
   are not scoped to any tenant schema. The per-tenant `audit_logs` table
   (Spec 003) lives inside each tenant schema and (a) cannot record
   platform-level actions and (b) is destroyed when the schema is dropped
   during GDPR deletion. A platform-level audit table in `core` is required.

3. **The admin panel needs filterable system logs (feature 005-10).** Logs
   must be filterable by tenant, level, and timestamp at production volume.
   PostgreSQL was rejected: high-volume ingestion adds DB pressure and does
   not scale. Loki is purpose-built for log storage; Grafana is already named
   in architecture §7.2 as the Prometheus visualization layer (not yet
   present in `docker-compose.yml`).

4. **Two super admins can act on the same tenant concurrently** (Spec 005
   §7 edge case; §13 Art. 5). Without a guard, the last write wins silently,
   potentially leaving the tenant in an inconsistent state.

5. **The plugin catalog has a review queue but no data model for review
   state** (Spec 005 feature 005-08, §7 edge case "publish plugin with
   broken manifest"). The existing `core.plugins` table has a `status`
   column (`draft`, `published`, `unpublished`) but no fields to track
   review submission, decision, notes, or reviewer. A `reviewStatus`
   field with a `draft → pending → approved/rejected → published`
   workflow is required. Additionally, the `unpublished` status is
   ambiguous — it conflates "withdrawn before any install" with
   "withdrawn after installs exist". A new `deprecated` status
   distinguishes the latter (still works for existing installs, not
   available for new installs).

## Decision

### Decision 1: `core.tenant_deletion_steps` — Forward-Only Deletion Saga

A new table in the `core` schema tracks the three-step GDPR deletion saga
per tenant. The saga is **forward-only**: there is no auto-compensation or
rollback. Failed steps retry with backoff; stuck deletions surface in the
admin UI for manual intervention.

**Rationale for no rollback**: for GDPR erasure, auto-rollback is dangerous.
If the PostgreSQL schema has been dropped and the Keycloak realm delete then
fails, restoring the dropped schema would mean restoring deleted personal
data — the opposite of the GDPR obligation. The correct response is to keep
the successful step done, retry the failed step, and never mark the tenant
`deleted` in `core.tenants` until all three steps are `done`.

```sql
CREATE TABLE core.tenant_deletion_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  step        VARCHAR(32) NOT NULL
                CHECK (step IN ('schema_drop', 'realm_delete', 'bucket_delete')),
  status      VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, step)
);

CREATE INDEX idx_tenant_deletion_steps_status
  ON core.tenant_deletion_steps(status, updated_at);
```

The tenant row in `core.tenants` is marked `status = 'deleted'` (or removed
per the deletion flow) only when all three steps for that tenant are `done`.
The admin UI lists deletions where any step is `failed` or has been
`in_progress` beyond a timeout, with a per-step "retry" action.

**Tenant status transition for deletion**: A new `pending_deletion` value is
added to the `TenantStatus` enum (`active`, `suspended`, `deleted` →
`active`, `suspended`, `pending_deletion`, `deleted`). The transition is:

```
active (or suspended) → pending_deletion   (DELETE request sets status, creates 3 saga rows, returns 202)
                     → deleted             (all 3 steps done)
```

Deletion may start from either `active` or `suspended` — a suspended tenant
can be deleted without reactivation (suspension only disables access; it
does not block erasure). The API middleware rejects all non-admin requests
for `pending_deletion` tenants (same as `suspended`). The Prisma migration
adds `pending_deletion` to the `TenantStatus` enum and updates the
`core.tenants.status` CHECK constraint.

### Decision 2: `core.platform_audit_log` — Platform-Level Audit Trail

A new table in the `core` schema records every super-admin action. It is
distinct from the per-tenant `audit_logs` table (Spec 003), which lives in
each tenant schema and is scoped to tenant-internal actions. The platform
audit log survives tenant deletion because it lives in `core`, not in the
dropped tenant schema.

```sql
CREATE TABLE core.platform_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      VARCHAR(255) NOT NULL,      -- Keycloak master realm user sub
  action        VARCHAR(64) NOT NULL,       -- 'tenant.provision', 'tenant.suspend', ...
  resource_type VARCHAR(64) NOT NULL,       -- 'tenant', 'plugin', 'plugin_version'
  resource_id   UUID,                       -- nullable: some actions are platform-wide
  tenant_id     UUID,                       -- nullable: null for platform-wide actions
  metadata      JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_audit_log_actor
  ON core.platform_audit_log(actor_id, created_at);
CREATE INDEX idx_platform_audit_log_action
  ON core.platform_audit_log(action, created_at);
CREATE INDEX idx_platform_audit_log_tenant
  ON core.platform_audit_log(tenant_id, created_at);
```

`actor_id` is a `VARCHAR(255)` holding the Keycloak `sub` claim of a user
in the Keycloak **master** realm (not a tenant realm), so there is no
foreign key to a tenant-scoped users table. This matches the existing
pattern used by `Plugin.createdByKeycloakId` (`VARCHAR(255)`) and the
plan's Prisma `PlatformAuditLog.actorId` model. Action
values include `tenant.provision`, `tenant.suspend`, `tenant.reactivate`,
`tenant.delete`, `plugin.publish`, `plugin.unpublish`, and others as the
admin module grows. The `metadata` JSONB carries action-specific detail
(e.g., provisioning parameters, deletion verification checksums) without
schema churn.

### Decision 3: Loki + Grafana for System Logs

Loki and Grafana are added to the `docker-compose.yml` infrastructure stack.
The core API ships logs to Loki via a `pino-loki` transport, and the admin
logs endpoint (feature 005-10) queries the Loki HTTP API.

- **`loki` service**: single binary, single node in dev. Purpose-built for
  log storage and querying; indexes log labels (tenant, level, module) not
  full text, keeping ingestion cheap.
- **`grafana` service**: already named in architecture §7.2 as the
  Prometheus visualization layer but not yet present in
  `docker-compose.yml`. This ADR adds it for both Prometheus metrics and
  Loki log exploration.
- **`pino-loki` transport**: the core API Pino logger (architecture §7.1)
  gains a `pino-loki` transport — buffered, async, non-blocking. In dev,
  logs also go to stdout for local debugging. No code path differs between
  dev and prod (no test-only logger); the transport is configured via env
  vars (`LOKI_URL`).
- **Admin logs query proxy**: the admin backend translates admin filters
  (tenant, level, time range) into LogQL labels and line filters and proxies
  to `GET /loki/api/v1/query_range`. The frontend never calls Loki
  directly.
- **No `core.system_logs` table**: PostgreSQL is not used for log storage.
  Loki is the single source of truth for system logs, scaling to production
  volume without database pressure.

`pino-loki` is a new runtime dependency on `services/core-api`. It is a log
transport, not a framework or core dependency, so it does not by itself
trigger Article 5 — but it is documented here alongside the infrastructure
change that motivates it.

### Decision 4: Optimistic Locking on `core.tenants`

A `version` column is added to the existing `core.tenants` table. All status
transitions (suspend, reactivate, delete) use optimistic locking: the
`UPDATE` includes `WHERE id = $id AND version = $expected` and increments
`version`. If 0 rows are affected, the API returns `409 Conflict` and the
admin client must re-read state before retrying.

```sql
ALTER TABLE core.tenants
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

This is a schema change to an existing table and requires a Prisma
migration. The `version` column is incremented on every status transition;
non-status updates (e.g., config edits by tenant admins via Spec 003) do not
need to bump version since they are not the subject of concurrent
super-admin transitions.

**Why optimistic, not pessimistic**: pessimistic locking (`SELECT ... FOR
UPDATE`) holds row locks for the duration of potentially slow operations
(provisioning, deletion saga) and can cause timeouts and connection
exhaustion. Optimistic locking holds no locks, works across distributed
requests, and gives a clear `409` conflict response the client can act on.

### Decision 5: Plugin Review Queue Fields + `deprecated` Status

The existing `core.plugins` table gains four review-tracking columns and a
new `deprecated` status value. This supports the review queue workflow
(Spec 005 feature 005-08) and disambiguates plugin withdrawal states.

**Review queue columns** (added to `core.plugins`):

```sql
ALTER TABLE core.plugins
  ADD COLUMN review_status  VARCHAR(16) NOT NULL DEFAULT 'none'
    CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN review_notes   TEXT,
  ADD COLUMN reviewed_at    TIMESTAMPTZ,
  ADD COLUMN reviewed_by    VARCHAR(255);  -- Keycloak sub of super admin
```

**Review workflow**: `draft → pending` (plugin author or admin submits for
review) → `approved`/`rejected` (super admin decision, sets `reviewedAt` +
`reviewedBy` + `reviewNotes`) → `published` (after approval, super admin
publishes). A rejected plugin stays in `draft` with `reviewStatus =
rejected` and notes visible to the author. The `reviewStatus` field is
independent of the `status` column: `status` tracks marketplace visibility
(`draft`, `published`, `deprecated`), `reviewStatus` tracks the review
process.

**`deprecated` status**: The existing `unpublished` value is split:
- `unpublished` — withdrawn before any installation (plugin never reached
  tenants, or all installs removed). Removed from marketplace.
- `deprecated` — withdrawn after installations exist. Existing installs
  keep working; the plugin disappears from marketplaces. Surface
  "installed by N tenants" warning before action.

The `core.plugins.status` CHECK constraint is updated to allow `deprecated`
alongside `draft`, `published`, `unpublished`. The existing
`admin-publish.routes.ts` `unpublish` endpoint must set `deprecated`
(instead of `unpublished`) when the plugin has existing installations, and
`unpublished` when it has none.

## Consequences

### Positive
- **GDPR-safe deletion tracking**: per-step saga state makes deletion
  failures observable and retryable without ever restoring erased data
  (Spec 005 AC 2).
- **Auditability that survives deletion**: `core.platform_audit_log` lives
  in `core`, so the record that a tenant *was* deleted persists after the
  tenant schema is dropped — essential for compliance.
- **Scalable log infra**: Loki handles high-volume ingestion without
  burdening PostgreSQL; Grafana unifies metrics + logs (architecture §7.2).
- **Concurrency safety without lock contention**: optimistic locking
  prevents silent last-write-wins and returns a clear 409, with no DB locks
  held during slow saga operations.
- **Review queue persistence**: the `reviewStatus`/`reviewNotes`/`reviewedAt`/
  `reviewedBy` columns make the plugin review process observable and
  auditable — review decisions are not lost on status changes.
- **Precise withdrawal semantics**: `deprecated` vs `unpublished`
  distinguishes "still serves existing installs" from "fully withdrawn",
  matching the spec §7 edge case for plugins installed by tenants.

### Negative
- **One Prisma migration required**: covers two new `core` tables, the
  `version` column on `core.tenants`, the `pending_deletion` enum value on
  `TenantStatus`, four review columns on `core.plugins`, and the `deprecated`
  status value in the `core.plugins.status` CHECK constraint. Must be applied
  before any Spec 005 feature that depends on it.
- **Two new infrastructure services**: Loki and Grafana added to
  `docker-compose.yml` and the prod manifest. They add memory/disk footprint
  and require retention + datasource provisioning.
- **New runtime dependency**: `pino-loki` on `services/core-api`. If Loki is
  unreachable, the transport must fail silently (buffer/drop) so logging
  never blocks request handling.
- **Manual intervention path required**: a permanently stuck deletion (e.g.,
  non-empty MinIO bucket) needs admin UI action, not automatic resolution.

### Neutral
- **Audit log growth**: admin-action volume is low by nature; no TTL
  mandated here — a retention policy can be added later if needed.
- **Loki is the single logs source of truth**: teams familiar with SQL log
  queries must learn LogQL. Mitigated by the admin backend proxy that
  translates the filter UI into LogQL — admins never write LogQL directly.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Auto-compensating deletion saga** | Roll back successful steps when a later step fails | Fully automated; no manual intervention | Restoring erased personal data violates GDPR erasure — the opposite of the goal | Rejected — dangerous for compliance |
| **Single `core.deletion_jobs` JSONB blob** | Store all step state in one JSONB column | Fewer tables; flexible schema | Harder to query per-step status; no per-step index; admin filtering awkward | Rejected — per-step row model is clearer |
| **Per-tenant audit log reuse** | Record super-admin actions in per-tenant `audit_logs` | No new table | Cannot record platform-wide actions; destroyed on tenant deletion | Rejected — fails compliance and scope |
| **PostgreSQL for system logs** | `core.system_logs` table queried by admin endpoint | Single datastore; SQL filtering | High-volume ingestion adds DB pressure; poor log-query ergonomics; does not scale | Rejected — NFR and scaling risk |
| **Elasticsearch for system logs** | ELK stack for log ingestion and search | Mature full-text search | Heavier footprint than Loki; redundant with Grafana; higher resource cost | Rejected — overkill |
| **Pessimistic locking (`FOR UPDATE`)** | `SELECT ... FOR UPDATE` on `core.tenants` | Strong immediate consistency | Holds locks during slow saga ops; risk of timeouts and connection exhaustion | Rejected — optimistic is lighter and sufficient |
| **No version column (last-write-wins)** | Rely on UI convention to prevent concurrent edits | No schema change | Silent inconsistent state on concurrent admin actions; violates §7 edge-case requirement | Rejected — unsafe |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for significant decisions | **COMPLIANT** | This ADR documents two new `core` tables (data-model change), a new infrastructure service (Loki + Grafana), a new runtime dependency (`pino-loki`), a schema change to the existing `core.tenants` table (version column + `pending_deletion` enum), and a schema change to the existing `core.plugins` table (review queue columns + `deprecated` status) — all Rule 5 triggers. |
| Security §1: Tenant isolation | **COMPLIANT** | Deletion saga enforces full schema drop; platform audit log is in `core`, not tenant schemas; optimistic locking prevents inconsistent tenant state. No cross-tenant data leakage. |
| Security §2: Authentication | **COMPLIANT** | Super-admin endpoints require Keycloak master-realm auth (Spec 005 §1). `actor_id` in audit log references master-realm users. |
| Security §3: SQL injection | **COMPLIANT** | All new tables accessed via Prisma parameterized queries. Loki queries are built via parameterized LogQL construction in the proxy, never string-interpolated user input. |
| Security §5: Secrets | **COMPLIANT** | `LOKI_URL` and Grafana credentials are env vars, not in code. |
| Security §6: PII | **COMPLIANT** | Pino logger must redact PII before shipping to Loki (existing §7.1 redaction config). Platform audit log `metadata` must not contain PII; admin action metadata carries structural data (slug, step, counts), not personal data. |
| Architecture: Event Bus | **COMPLIANT** | No change to Kafka event bus. Deletion saga and audit log are synchronous platform operations, not events. ADR-016 DLQ size metric is surfaced read-only by feature 005-11. |

## Related Decisions

- **ADR-001: Schema-per-tenant** — Defines the schema isolation boundary.
  Provisioning creates `tenant_<slug>`; deletion (Decision 1) drops it. The
  `schema_drop` step operates on this boundary.
- **ADR-002: Keycloak multi-realm** — Defines realm-per-tenant. Provisioning
  creates `plexica-<slug>` realm; suspension disables it; deletion
  (Decision 1 `realm_delete` step) removes it. Super admin authenticates
  against the master realm.
- **ADR-004: Kafka/Redpanda Event Bus** — Feature 005-11 reads consumer lag
  and DLQ metrics from the event bus. No change to the bus itself.
- **ADR-016: Two-Tier Dead Letter Queue** — Feature 005-11 surfaces DLQ size
  per plugin (read-only). The DLQ model and `core.dead_letter_queue` table
  are unchanged.
- **Spec 003 `audit_logs`** — The per-tenant audit table. Decision 2
  (`core.platform_audit_log`) is distinct and complementary: platform-level
  actions go to `core`, tenant-internal actions go to the tenant schema.
