# ADR-017: Plugin DB Access Restriction

**Status**: Accepted
**Date**: 2026-06-26
**Driver**: DR-18 from Spec 004 (Plugin System) — Plugin Database Access Isolation
**Extends**: ADR-006 (Plugin Tables in Tenant Schema)
**Deciders**: TBD

## Context

ADR-006 established that plugin data tables live in the tenant schema alongside
core platform tables. For tenant "acme" with a CRM plugin installed:

```
tenant_acme.workspaces          ← core table
tenant_acme.members             ← core table
tenant_acme.crm_contacts        ← plugin table
tenant_acme.crm_deals           ← plugin table
tenant_acme.analytics_reports   ← another plugin's table
```

This co-location creates a security boundary problem: a CRM plugin must be able
to query `crm_contacts`, but it must **not** be able to query `analytics_reports`
or `workspaces` directly. If a plugin can access another plugin's data or core
tables through raw SQL, tenant isolation and data confidentiality are compromised.

Two approaches for enforcing this restriction:

1. **Application-level middleware**: A Prisma middleware that inspects every
   query and rejects those targeting tables outside the plugin's declared set.
   This is bypassable — a plugin using raw SQL (`$queryRaw`) or a different
   database library can trivially circumvent the middleware.
2. **Database-level PostgreSQL permissions**: Create a dedicated PostgreSQL
   role per plugin installation with `GRANT` privileges only on the plugin's
   declared tables. PostgreSQL enforces this at the protocol level — no query,
   regardless of how it's issued, can access unauthorized tables.

The core tension: application-level restrictions are easier to implement but
provide security theater rather than security. Database-level restrictions are
harder to set up (dynamic role creation, per-install credentials) but provide
actual enforcement by the database engine itself.

## Decision

**PostgreSQL role-level access control (RLS-backed GRANT/REVOKE).**

On plugin installation, the core creates a dedicated PostgreSQL role for that
specific plugin installation. The role is granted privileges **only** on the
plugin's declared tables. Default public schema access is revoked. This is
enforced by PostgreSQL at the wire protocol level — the plugin simply cannot
read or write tables it does not own, regardless of query construction.

### Role Creation (Plugin Install)

```sql
-- 1. Create a dedicated role for this plugin installation
CREATE ROLE "plugin_{installId}" WITH LOGIN PASSWORD '{generated_password}';

-- 2. Grant schema usage (plugin tables live in the tenant schema)
GRANT USAGE ON SCHEMA "{tenant_schema}" TO "plugin_{installId}";

-- 3. Grant table-level privileges only on declared tables
GRANT SELECT, INSERT, UPDATE, DELETE ON "{tenant_schema}"."{plugin_slug}_contacts" TO "plugin_{installId}";
GRANT SELECT, INSERT, UPDATE, DELETE ON "{tenant_schema}"."{plugin_slug}_deals" TO "plugin_{installId}";
-- ... one GRANT per declaredTable in manifest.json

-- 4. Revoke default public schema access (removes implicit PUBLIC grants)
REVOKE ALL ON SCHEMA "public" FROM PUBLIC;
REVOKE ALL ON SCHEMA "{tenant_schema}" FROM PUBLIC;

-- 5. Grant only what the plugin needs
-- No access to core tables (workspaces, members, etc.)
-- No access to other plugins' tables (analytics_reports, etc.)
```

### Table Declaration (manifest.json)

Plugin developers declare which tables they need in the manifest:

```json
{
  "slug": "crm",
  "declaredTables": [
    "crm_contacts",
    "crm_deals",
    "crm_activities"
  ]
}
```

The namespace convention (`{plugin_slug}_{table_name}`) established in ADR-006
makes table ownership unambiguous. The core validates that:
- All declared tables follow the `{slug}_*` prefix convention
- No table name collides with another plugin's declared tables
- Table names do not match core table names (validated at registration, not at DB level)

### Credential Delivery

Generated credentials are injected into the plugin container as environment
variables (per ADR-013, `envOverrides` in `plugin_container_config`):

```yaml
# Injected into plugin container
DATABASE_URL: postgresql://plugin_{installId}:{password}@postgres:5432/{db}?schema={tenant_schema}
```

The password is:
- Generated using `crypto.randomBytes(32)` → base64 (43-character random string)
- Stored encrypted-at-rest in `plugin_container_config.envOverrides` (AES-256-GCM
  with a platform-wide encryption key stored in environment variables)
- Never logged, never returned in API responses
- Rotated on plugin reinstall (ADR-020) — old credentials are revoked

### Role Cleanup (Plugin Uninstall)

```sql
-- 1. Drop all objects owned by the plugin role (tables, sequences, indexes)
DROP OWNED BY "plugin_{installId}" CASCADE;

-- 2. Revoke schema access
REVOKE ALL ON SCHEMA "{tenant_schema}" FROM "plugin_{installId}";

-- 3. Drop the role itself
DROP ROLE "plugin_{installId}";
```

`DROP OWNED BY ... CASCADE` removes all plugin tables automatically. This is
consistent with ADR-006's uninstall semantics (only plugin-prefixed tables
are dropped; core tables and other plugin tables are untouched because the
role never owned them).

### Cross-Plugin Data Sharing

Plugins cannot share data through direct database access — each plugin role
can only see its own tables. For legitimate cross-plugin data sharing (e.g.,
an analytics plugin needs CRM data), the mechanism is **Kafka events**, not
direct DB access:

- CRM plugin publishes `crm.contact.created` event to Kafka
- Analytics plugin subscribes to `crm.contact.*` events
- Analytics plugin stores its own copy or aggregated view in its own tables

This maintains the security boundary while enabling data flow through the
approved asynchronous channel.

### Query Enforcement Guarantees

PostgreSQL enforces these restrictions at the protocol level:
- A `SELECT * FROM analytics_reports` issued by `plugin_{crmInstallId}`
  returns `ERROR: permission denied for table analytics_reports`
- A `SELECT * FROM workspaces` returns the same error
- `$queryRaw`, `prisma.$executeRaw`, or any raw SQL library receives
  the same PostgreSQL error — enforcement is independent of the client library
- Even `\dt` in `psql` only lists tables the role can see

## Consequences

### Positive
- **Database-native enforcement**: PostgreSQL enforces access control at the
  protocol level. No query, regardless of how it's constructed or which library
  issues it, can bypass the restrictions. This is provably more secure than
  any application-level middleware.
- **Zero-trust plugin model**: Even if a plugin is compromised or contains a
  malicious query, the blast radius is limited to the plugin's own tables.
  Core data and other plugin data are inaccessible.
- **GDPR-aligned**: Schema-per-tenant (ADR-001) + per-plugin role isolation
  means `DROP OWNED BY ... CASCADE` provides clean, complete data deletion
  with no orphaned records.
- **Auditable**: PostgreSQL logs access-denied queries. Security operations
  can monitor for plugins attempting to access unauthorized tables.
- **Prisma-compatible**: Prisma connects with the restricted role's credentials
  and generates a client that can only see the tables the role can access. This
  means `prisma.$queryRaw` is also restricted — no escape hatch.

### Negative
- **Role proliferation**: Each plugin installation creates a PostgreSQL role.
  With 100 tenants × 10 plugins each = 1,000 roles. PostgreSQL can handle this
  easily (roles are lightweight catalog entries, not connection pools), but
  role management overhead grows linearly.
- **Migration complexity**: Plugin migrations (ADR-007) run with elevated
  (core) privileges to create tables, then the restricted role is granted
  access. This two-phase approach requires the migration runner to have
  `SUPERUSER` or `CREATEROLE` privileges.
- **Connection pooling per role**: Each plugin role needs its own connection
  pool. Connection count = installations × pool size (5 connections per SDK,
  per ADR-019). Requires monitoring of total PostgreSQL connections across
  all plugin roles.
- **Generated passwords**: Storing encrypted credentials requires a platform-wide
  encryption key. Key rotation would require re-encrypting all stored plugin
  credentials.

### Neutral
- **Developer experience**: Plugin developers must declare their tables in
  `manifest.json`. This is a minor upfront cost that pays off in security
  guarantees. The CLI will validate that `declaredTables` matches actual
  Prisma schema models at build time.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Prisma middleware + query introspection** | Middleware intercepts all Prisma queries, parses the SQL, and rejects queries targeting non-declared tables | Simple to implement; no DB role management | Bypassable via `$queryRaw`, `$executeRaw`, or any non-Prisma DB library; SQL parsing is fragile and error-prone; provides an illusion of security, not actual security | Rejected — application-level enforcement is insufficient for a security boundary |
| **PostgreSQL Row-Level Security (RLS)** | Single shared role + RLS policies that filter rows by `tenant_id` and `table_owner` | Cleaner role management (one role total) | Breaks ADR-001 schema-per-tenant model; RLS policies are complex to audit; a misconfigured policy can leak data silently; `SELECT count(*)` can bypass RLS in some configurations | Rejected — adds complexity on top of schema isolation; violates ADR-001 |
| **Separate database per plugin** | Each plugin gets its own logical database | Maximum isolation | Explosion of database connections; cross-plugin JOINs impossible; operational nightmare for backups and migrations; Prisma multi-database support is limited | Rejected — excessive operational cost |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for security | **COMPLIANT** | This ADR documents the database access control model, a security infrastructure decision. |
| Security §1: Tenant Isolation | **COMPLIANT** | Per-install PostgreSQL roles add a second layer of isolation within the tenant schema — plugins cannot access other plugins' data or core tables. |
| Security §3: SQL Injection | **COMPLIANT** | While PostgreSQL role restrictions don't prevent SQL injection within a plugin's own tables, they limit the blast radius — an injected query can only affect the plugin's own data, not core tables or other plugins. |
| Security §5: Secrets | **COMPLIANT** | Plugin DB credentials are generated, encrypted at rest, never logged, and rotated on reinstall. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — plugin tables in tenant schema. This ADR adds the access control layer on top of ADR-006's data placement. |

## Related Decisions

- **ADR-001: Schema-Per-Tenant** — The tenant isolation boundary. Plugin roles
  operate within this boundary — one role per plugin per tenant.
- **ADR-006: Plugin Tables in Tenant Schema** — Defines where plugin tables
  live. This ADR defines who can access them.
- **ADR-007: Plugin Migrations Core-Executed** — The migration runner needs
  elevated privileges to create tables, then grant access to the restricted role.
- **ADR-013: Container Hosting Model** — DB credentials are delivered to the
  plugin container as environment variables (`envOverrides`).
- **ADR-019: Plugin SDK & OpenAPI Architecture** — SDK connection pooling (5
  connections per plugin instance, configurable via `PLUGIN_DB_POOL_SIZE`).
  Each pool uses the restricted role's credentials.

---

## Amendment — 2026-07-23: Production TLS Parameters for Plugin DB Roles

**Status**: Accepted (amends the accepted decision above)
**Driver**: PR #77 security remediation; Spec 004 DR-18 and AC-07

### Context

Building a restricted connection URL from only host, port, and database drops
TLS verification parameters. Conversely, copying every query parameter from the
platform `DATABASE_URL` could expose privileged client certificates or unsafe
session options to plugin containers. The generated URL needs one explicit,
fail-closed policy.

### Decision

- Production plugin database URLs must use `sslmode=verify-full` and an absolute
  CA path mounted read-only into the plugin runtime. Container orchestration
  supplies the same dedicated CA path through `PLUGIN_DB_SSL_ROOT_CERT_PATH`.
- Production startup and plugin install fail if the CA path is absent, relative,
  not mounted, or if any requested mode is weaker than `verify-full`.
- Development/test may explicitly use `sslmode=disable`; there is no production
  fallback. Modes `allow`, `prefer`, `require`, and `verify-ca` are rejected.
- Generated URLs contain only host, port, database, restricted role credentials,
  encoded `search_path`, `sslmode`, and `sslrootcert`. Platform `sslcert`,
  `sslkey`, passwords, arbitrary `options`, and unknown source URL parameters
  are never copied to a plugin.
- TLS policy is independent of table grants: both verified transport and the
  per-install PostgreSQL role are required.

Alternatives considered were copying all platform parameters (secret and option
leakage), preserving only `sslmode=require` (encryption without server identity
verification), and relying on cluster networking (no transport guarantee).
They are rejected.

### Consequences

- **Positive**: production plugin connections authenticate PostgreSQL and do
  not inherit privileged client material.
- **Negative**: production deployments must mount a CA file into every plugin
  runtime before installs or rotations can succeed.
- **Neutral**: restricted DB passwords remain reversibly encrypted at rest
  because runtime recreation needs them; ADR-024's API service secret is a
  separate credential and is hash-only.

### Migration and Rollout

Mount and verify the CA before deploying strict URL generation. Rotate/restart
each active plugin connection with the verified URL. Installations that cannot
establish verified TLS become `degraded`; the platform must not retry with an
insecure URL. Development compose explicitly sets disabled mode. Rollback may
restore the prior application image only after preventing plugin starts; it may
not weaken the production TLS mode.

### Security and GDPR

Connection URLs and DB passwords are never logged or returned. CA material is
public trust material, mounted read-only. Verified TLS prevents credential and
tenant payload interception in transit; role grants continue to limit the
compromise radius.

### Constitution Alignment

| Article | Status | Notes |
| --- | --- | --- |
| Rule 5 / ADR | Compliant | Records a production database security policy. |
| Security: tenant isolation | Improved | Protects restricted-role traffic in transit. |
| Security: secrets | Compliant | Privileged client cert/key parameters are not propagated. |
| Architecture: PostgreSQL | Compliant | Uses the prescribed database and role model. |
