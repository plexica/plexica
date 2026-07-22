# Spec 005: Super Admin

> Feature specification for the Super Admin Panel (Phase 4). Created by `forge-pm`.

| Field   | Value                          |
| ------- | ------------------------------ |
| Status  | Approved                        |
| Author  | Plexica Team                   |
| Date    | 2026-03-01                     |
| Track   | Feature                        |
| Spec ID | 005                            |
| Phase   | 4 — Super Admin Panel          |
| Duration | 2-3 weeks                     |

## 1. Overview

Delivers a dedicated super admin application for platform-wide management.
Super admins can provision, suspend, and delete tenants; manage the plugin
catalog; and monitor system health across all infrastructure services. This
is the operational control plane for the Plexica platform.

The super admin application is a **separate frontend app** at `apps/admin/`,
distinct from the tenant-facing `apps/web/`. It authenticates against the
Keycloak master realm (not a tenant realm) and operates on the `core` schema
directly, bypassing tenant-context middleware (per ID-003 in the decision log).

## 2. Problem Statement

A multi-tenant platform with schema-per-tenant isolation and realm-per-tenant
authentication cannot be operated from within any single tenant context.
Tenant admins are scoped to their own realm and schema by design — they have
no visibility into other tenants and no access to the `core` schema where
tenant registry, plugin catalog, and platform configuration live.

The **Super Admin** persona (product brief: "Platform Operator") performs
operational duties that span the entire platform boundary:

- **Provisioning** new tenants requires creating a PostgreSQL schema, a
  Keycloak realm, and a MinIO bucket — three independent infrastructure
  resources no tenant admin can touch.
- **GDPR deletion** requires dropping the tenant schema, deleting the
  Keycloak realm, and deleting the MinIO bucket, then verifying no data
  remnants remain. This is a legal compliance obligation, not a feature.
- **Suspension** must atomically cut off a tenant across API, Keycloak, and
  plugin proxy layers simultaneously — a cross-cutting action no tenant
  admin can trigger.
- **Plugin catalog curation** (publish/unpublish/review) controls what
  appears in every tenant marketplace — a platform-wide decision.
- **System health monitoring** (DB, Keycloak, Redis, Kafka, MinIO) requires
  infrastructure-level access that tenant admins must never have.

Without a dedicated control plane, these operations would require manual
intervention against infrastructure (SQL scripts, Keycloak Admin CLI, MinIO
client) — slow, error-prone, and unaudited. This spec automates them behind
a secured, audited, MFA-protected UI.

## 3. Dependencies

- **Spec 002 — Foundations**: Authentication (Keycloak super-admin realm/role),
  multi-tenancy infrastructure, and database schema-per-tenant model.
- **Spec 003 — Core Features**: Tenant and workspace entities must exist so
  the super admin can manage them.
- **Spec 004 — Plugin System**: Plugin registry, Kafka event system, and
  plugin lifecycle must be operational for catalog management and monitoring.

## 4. Features

### 5.1 Super Admin Panel (2-3 weeks)

| ID     | Feature                              | E2E Test                                                       |
| ------ | ------------------------------------ | -------------------------------------------------------------- |
| 005-01 | Dashboard with platform metrics      | Super admin sees tenant count, user count, active plugins      |
| 005-02 | Tenant list with search and filters  | Super admin searches tenant, filters by status                 |
| 005-03 | Tenant detail (info, users, plugins, audit) | Super admin sees all details of a tenant                |
| 005-04 | Tenant provisioning wizard           | Super admin completes wizard, tenant operational               |
| 005-05 | Tenant suspension                    | Super admin suspends tenant, users cannot access               |
| 005-06 | Tenant reactivation                  | Super admin reactivates tenant, users access again             |
| 005-07 | Tenant deletion (GDPR)               | Super admin deletes tenant: schema dropped, realm deleted, bucket deleted |
| 005-08 | Plugin catalog management            | Super admin publishes/unpublishes plugins, review queue        |
| 005-09 | System health check                  | Super admin sees status of all services (DB, Keycloak, Redis, Kafka) |
| 005-10 | Filterable system logs               | Super admin sees logs with filters for tenant, level, timestamp |
| 005-11 | Kafka status                         | Super admin sees consumer lag per plugin, DLQ size             |

## 5. User Stories

| ID     | Story                                                                                                  | Acceptance Criteria |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------- |
| 005-01 | As a Super Admin, I want a dashboard with platform-wide metrics, so that I can assess platform health at a glance. | AC 1, 5, 7 |
| 005-02 | As a Super Admin, I want to search and filter the tenant list by status, so that I can find tenants quickly at scale. | AC 1, 7 |
| 005-03 | As a Super Admin, I want to view a tenant's full detail (info, users, plugins, audit log), so that I can investigate tenant state without switching tools. | AC 1, 7 |
| 005-04 | As a Super Admin, I want a provisioning wizard that creates a fully operational tenant, so that a new organization can onboard without manual infra steps. | AC 1, 7 |
| 005-05 | As a Super Admin, I want to suspend a tenant, so that a non-paying or abusive tenant is blocked immediately across all services. | AC 1, 3, 7 |
| 005-06 | As a Super Admin, I want to reactivate a suspended tenant, so that a reinstated organization can resume work. | AC 1, 3, 7 |
| 005-07 | As a Super Admin, I want to delete a tenant with full GDPR-compliant resource cleanup, so that all tenant data is verifiably erased. | AC 1, 2, 7 |
| 005-08 | As a Super Admin, I want to manage the plugin catalog (publish, unpublish, review), so that only vetted plugins reach tenant marketplaces. | AC 1, 4, 7 |
| 005-09 | As a Super Admin, I want a system health dashboard for all infrastructure services, so that I can detect outages without exposing secrets. | AC 5, 7 |
| 005-10 | As a Super Admin, I want to query system logs filtered by tenant, level, and timestamp, so that I can investigate incidents across tenants. | AC 1, 7 |
| 005-11 | As a Super Admin, I want to view Kafka consumer lag per plugin and DLQ size, so that I can detect stuck or failing plugin consumers. | AC 6, 7 |

## 6. Acceptance Criteria

1. A super admin can manage the entire platform from the UI: create, suspend,
   reactivate, and delete tenants with full lifecycle verification.
2. Tenant deletion is complete and GDPR-compliant: PostgreSQL schema dropped,
   Keycloak realm deleted, MinIO bucket deleted — verified by E2E test that
   confirms all three resources are gone.
3. Tenant suspension is atomic: all services (API, Keycloak, plugin proxy)
   reject requests for a suspended tenant immediately after the action.
4. Plugin catalog management allows publishing, unpublishing, and review of
   plugins before they appear in tenant marketplaces.
5. System health check displays real-time status of all infrastructure
   services without exposing sensitive connection strings or credentials.
6. Kafka monitoring shows consumer lag per plugin and DLQ size, enabling
   operational visibility into the event system.
7. All 11 features have passing E2E tests.

## 7. Edge Cases & Error Scenarios

| Scenario | Expected Behavior |
| -------- | ----------------- |
| **Provisioning — schema already exists** (orphaned from a failed prior attempt) | Detect pre-existing `tenant_<slug>` schema; abort provisioning with a clear error; offer "adopt existing schema" or "force cleanup" recovery action. |
| **Provisioning — Keycloak realm already exists** | Detect `plexica-<slug>` realm; abort; do not create partial tenant record. Surface the conflict to the admin. |
| **Provisioning — MinIO bucket already exists** | Detect `tenant-<slug>` bucket; abort provisioning; rollback any schema/realm already created in this attempt (saga compensation). |
| **Deletion — schema drop fails** (active connections, permissions) | Mark deletion step `schema_drop` as failed in status table; retry with backoff; leave realm and bucket steps pending; surface stuck deletion in admin UI for manual intervention. |
| **Deletion — realm delete fails** (Keycloak unreachable) | Same saga pattern: record failed step, retry, keep schema and bucket steps in pending state until realm deletion succeeds. Never mark tenant deleted until all three steps complete. |
| **Deletion — bucket delete fails** (MinIO unreachable, non-empty bucket) | Retry; if non-empty, force-delete objects then bucket (GDPR requires full erasure); record step status. |
| **Deletion — partial saga stuck** | Deletion status table tracks per-step state (`pending`, `in_progress`, `done`, `failed`). Admin UI shows stuck deletions with per-step status and a "retry step" button. |
| **Suspension — request in flight when suspension happens** | API middleware checks tenant status on every request (cached in Redis, TTL short). A request that started before suspension but arrives after is rejected. Suspension propagation target < 5s (NFR). |
| **Suspension — concurrent suspend + reactivate by two admins** | Tenant status transitions are guarded by an optimistic-lock version column on `core.tenants`. The second action receives a 409 Conflict and must re-read state. |
| **Plugin — publish plugin with broken manifest** | Manifest validation (Zod schema) runs before publish; invalid manifest returns 400 with field-level errors; plugin stays in `draft`. |
| **Plugin — unpublish a plugin installed by tenants** | Unpublish sets status to `deprecated` (not hard delete). Existing installations keep working but the plugin disappears from marketplaces. Surface "installed by N tenants" warning before action. |
| **Plugin — unpublish a plugin with no installations** | Unpublish sets status to `unpublished` — the plugin was never installed or all installs were removed. Distinct from `deprecated` which means "still serves existing installs, not available for new installs". |
| **Health check — service degraded but not down** | Health endpoint returns a per-service status enum: `healthy`, `degraded`, `down`. Degraded = responsive but slow/failing checks (e.g., Redis responding > 1s, Kafka lag high). UI shows yellow for degraded, red for down. |
| **Kafka — consumer lag growing unbounded** | Surface lag trend in the Kafka status view; warn when lag exceeds configurable threshold (default 1000 messages). No auto-remediation in this sprint — admin investigates manually. |
| **Kafka — DLQ overflow** | Surface DLQ size per plugin; warn when DLQ exceeds threshold (default 100 messages). Admin can view DLQ message count but cannot replay in this sprint (out of scope — see Spec 004 replay flow). |
| **Concurrent admin actions on same tenant** | Optimistic locking on `core.tenants.version`. Conflicting writes return 409. Destructive actions (delete) require a typed confirmation of the tenant slug before execution. |

## 8. Data Requirements

This spec introduces two new tables in the `core` schema, reads from existing
entities across `core` and tenant schemas, uses Redis for pre-aggregated
dashboard metrics, and sources system logs from the Pino log stream. The
super admin frontend lives in a separate app (`apps/admin/`).

### New Tables in `core` Schema

| Table | Purpose | Key Columns |
| ----- | ------- | ----------- |
| `core.tenant_deletion_steps` | Tracks the GDPR deletion saga per tenant | `tenant_id`, `step` (`schema_drop`, `realm_delete`, `bucket_delete`), `status` (`pending`, `in_progress`, `done`, `failed`), `attempts`, `last_error`, `updated_at` |
| `core.platform_audit_log` | Audits all super-admin actions (provision, suspend, reactivate, delete, plugin publish/unpublish) | `id`, `actor_id`, `action`, `resource_type`, `resource_id`, `tenant_id` (nullable for platform-wide actions), `metadata` JSONB, `ip_address`, `created_at` |

> **ADR recommendation**: Adding `tenant_deletion_steps` and
> `platform_audit_log` to the `core` schema is a data-model change. Per
> Constitution Rule 5, this warrants a short ADR documenting the deletion
> saga persistence model and the platform-level audit log (distinct from the
> per-tenant `audit_logs` table in Spec 003). See Constitution Compliance
> section.

### Existing Entities Consumed (read-only or managed)

| Entity | Source | Use |
| ------ | ------ | --- |
| `core.tenants` | Architecture §3.2 | List, search, filter, provision, suspend, reactivate, delete |
| `core.plugins` / `core.plugin_versions` | Architecture §3.2 | Plugin catalog management (publish, unpublish, review) |
| `core.system_config` | Architecture §3.2 | Platform configuration (if surfaced in UI) |
| `tenant_<slug>.user_profile` | Architecture §3.2 | Count users per tenant (cross-schema aggregate for dashboard) |
| `tenant_<slug>.workspaces` | Architecture §3.2 | Count workspaces per tenant (dashboard) |
| `tenant_<slug>.plugin_installations` | Architecture §3.2 | Show installed plugins in tenant detail |
| `tenant_<slug>.audit_logs` | Architecture §3.2 | Surface tenant-scoped audit in tenant detail view |

### Pre-Aggregated Metrics (Redis)

Dashboard counts are pre-aggregated to avoid scanning every tenant schema on
each dashboard load (NFR: dashboard load < 2s).

| Redis Key | Value | Refresh |
| --------- | ----- | ------- |
| `metrics:tenant_count` | Integer | On tenant create/delete |
| `metrics:user_count:total` | Integer | Scheduled job (every 5 min) — aggregates across schemas |
| `metrics:workspace_count:total` | Integer | Scheduled job (every 5 min) |
| `metrics:active_plugins` | Integer | On plugin publish/unpublish |
| `metrics:tenant_status:<status>` | Integer | On tenant status change |

### System Logs Source

System logs (feature 005-10) are ingested into **Grafana Loki** via a Pino
Loki transport and queried through the Loki HTTP API from the admin backend.

- **Loki + Grafana** added to `docker-compose.yml` as a new infrastructure
  service (single binary: `loki` for ingestion/query, `grafana` for
  dashboards — already used for Prometheus visualization in §7.2).
- Core API Pino logger ships logs to Loki via `pino-loki` transport
  (buffered, async, non-blocking). In dev, logs also go to stdout for
  local debugging.
- The admin logs endpoint (`GET /admin/logs`) proxies queries to the Loki
  HTTP API (`/loki/api/v1/query_range`) with structured filters:
  `tenant`, `level`, `time range`. The backend translates admin filters
  into LogQL labels and line filters.
- **No `core.system_logs` table** — PostgreSQL is not used for log storage.
  Loki is the single source of truth for system logs, scaling to
  production volume without database pressure.

> **ADR covers**: the addition of Loki + Grafana to the infrastructure
> stack, the `pino-loki` transport, and the admin API → Loki query proxy
> pattern. See Constitution Compliance Art. 5.

### Frontend App Boundary

The super admin UI lives in `apps/admin/` (architecture §2.1) — a separate
Vite + React app, sharing `@plexica/ui` and `@plexica/i18n` with `apps/web/`
but with its own router, its own Zustand auth store (master realm), and no
Module Federation host role. It is served from a CDN in production.

Per accepted ADR-023, the browser uses Authorization Code + PKCE S256 through
Keycloak and public `/callback`; Plexica renders no credential form. Failed
refresh announces session expiry before re-authentication. Logout uses OIDC
RP-Initiated Logout with the persisted ID token and exact registered URI.

## 9. Non-Functional Requirements

| Metric                                    | Target           |
| ----------------------------------------- | ---------------- |
| Dashboard load time                       | < 2s             |
| Tenant list with 100+ tenants             | < 1s             |
| Tenant provisioning (schema + realm + bucket) | < 30s         |
| Tenant deletion (schema + realm + bucket) | < 30s            |
| Tenant suspension propagation             | < 5s             |
| Health check response                     | < 500ms          |
| System logs query (filtered)              | < 2s             |

## 10. Out of Scope

The following are intentionally **not** part of this sprint and belong to
later phases or separate concerns:

- **Advanced analytics / reporting** (usage trends, billing-ready metrics,
  per-tenant cost breakdowns) — belongs to a future reporting phase or
  Sprint 6 (Consolidation).
- **Billing and subscription management** — out of platform scope for v2
  rewrite; not in the product brief feature list.
- **Super admin MFA enforcement UI** — MFA is enforced at the Keycloak
  master-realm level (infrastructure/config), not via an in-app toggle. The
  spec assumes MFA is already required on the master realm (Risk mitigation).
- **Super admin audit log UI for tenant-scoped actions** — per-tenant
  `audit_logs` are surfaced in tenant detail (005-03), but a cross-tenant
  audit log search UI with advanced filtering is covered by Spec 003's audit
  module; this spec only adds `core.platform_audit_log` for super-admin
  actions.
- **Kafka DLQ message replay** — viewing DLQ size is in scope (005-11);
  replaying messages is handled by the Spec 004 plugin lifecycle flow.
- **Prometheus/Grafana dashboards** — already provided by the observability
  stack (architecture §7.2); the admin UI surfaces a summary, not a full
  Grafana replacement.
- **Tenant configuration editing** (branding, feature flags) from the super
  admin panel — tenant admins do this via Spec 003 tenant settings; super
  admin only manages lifecycle (provision/suspend/reactivate/delete).
- **Super admin self-service user management** — super admin accounts are
  managed in the Keycloak master realm directly.

## 11. Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Tenant deletion cascading failures (schema drop, realm delete, bucket delete — any can fail independently) | Tenant partially deleted, orphaned resources | Saga pattern with compensating actions; track deletion steps in status table; retry failed steps; manual cleanup UI for stuck deletions |
| Tenant suspension must be atomic across services | Suspended tenant briefly accessible via some services | Suspension flag checked at API gateway level (Fastify middleware); Keycloak realm disabled; Redis cache invalidated; plugin proxy rejects |
| Health check exposes sensitive infrastructure info | Security leak of connection strings, versions | Return only status enum (healthy/degraded/down) per service; no connection details; no version numbers |
| Dashboard metrics query performance at scale | Slow dashboard with many tenants/plugins | Pre-aggregated metrics in Redis (updated on schedule); materialized views for tenant/user counts |
| GDPR deletion must be verifiable | Audit failure if data remnants exist | Deletion audit log entry with checksums; post-deletion verification query; retention policy for audit logs themselves |
| Super admin credential compromise | Full platform access | MFA required for super admin role; session timeout 1h; IP allowlist for super admin endpoints; audit log for all super admin actions |

## Cross-References

| Reference | Path / ID | Relevance |
| --------- | --------- | --------- |
| ADR-001 | `.forge/knowledge/adr/adr-001-schema-per-tenant.md` | Schema-per-tenant model — provisioning creates the schema; deletion drops it. |
| ADR-002 | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` | Realm-per-tenant — provisioning creates the realm; suspension disables it; deletion removes it. |
| ADR-004 | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md` | Event bus — Kafka status feature (005-11) reads consumer lag and DLQ metrics. |
| ADR-023 | `.forge/knowledge/adr/adr-023-admin-pkce-auth.md` | Admin PKCE S256, callback/expiry UX, exact URIs, logout, and E2E token isolation. |
| ADR-016 | `.forge/knowledge/adr/adr-016-two-tier-dead-letter-queue.md` | DLQ model — informs the DLQ size metric surfaced in 005-11. |
| Spec 002 | `.forge/specs/002-foundations/spec.md` | Auth, multi-tenancy infra, Keycloak master realm for super admin. |
| Spec 003 | `.forge/specs/003-core-features/spec.md` | Tenant/workspace entities, per-tenant `audit_logs` consumed in 005-03. |
| Spec 004 | `.forge/specs/004-plugin-system/spec.md` | Plugin registry, Kafka events, plugin lifecycle for catalog management (005-08). |
| Constitution — Security | `.forge/constitution.md` §Security | Tenant isolation, Keycloak on every endpoint, no PII in logs (logs feature must redact). |
| Constitution — Rule 5 | `.forge/constitution.md` | Triggers the ADR recommendation in this spec. |
| Architecture §4.3 | `.forge/architecture/architecture.md` | Super-admin routes bypass tenant-context middleware (ID-003). |
| Architecture §7.1–7.2 | `.forge/architecture/architecture.md` | Pino logging and Prometheus metrics — sources for 005-09 and 005-10. |

## 13. Constitution Compliance

| Art. | Rule | Status | Notes |
| ---- | ---- | ------ | ----- |
| Art. 1 | E2E test per feature | COMPLIANT | All 11 features (005-01 … 005-11) have E2E tests defined in the Features table. Destructive operations (provision, suspend, delete) require E2E against the real stack (real Keycloak, real MinIO, real PostgreSQL) — no mocks of core services per AGENTS.md testing rules. |
| Art. 2 | No merge without green CI | COMPLIANT | Unit, integration, and E2E suites must all pass before merge of any feature in this spec. |
| Art. 3 | One pattern per operation | COMPLIANT | Data fetching: TanStack Query (only). Provisioning wizard + all forms: react-hook-form + Zod (only). Auth state: single Zustand store in `apps/admin/`. No `fetch` raw, no `useEffect+useState` data fetching, no inline form state. |
| Art. 4 | No file above 200 lines | COMPLIANT | The admin app and the `admin` backend module must decompose: provisioning saga, deletion saga, health checker, Kafka status reader, logs query, and each UI view as separate files under 200 lines. The deletion saga in particular must be split across step handlers. |
| Art. 5 | ADR for significant decisions | ADR RECOMMENDED | A single ADR covers four decisions: (a) `core.tenant_deletion_steps` table for the deletion saga persistence, (b) `core.platform_audit_log` table for super-admin action auditing, (c) addition of **Loki + Grafana** to the infrastructure stack with `pino-loki` transport for system logs (005-10), (d) optimistic locking via `version` column on `core.tenants` for concurrent admin action safety. New infrastructure service (Loki) is a significant infra change per Rule 5. |
| Art. 6 | English commit messages | COMPLIANT | All commits for this sprint written in English per Rule 6. |
