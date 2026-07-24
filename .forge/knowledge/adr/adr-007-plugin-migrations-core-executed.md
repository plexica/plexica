# ADR-007: Plugin-Brings-Migrations, Core-Executes

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plugins can define their own database tables inside tenant schemas (ADR-006). We need a mechanism for plugins to create and update their tables when installed or upgraded. The plugin developer knows what tables they need, but must not have direct database access to tenant schemas.

## Decision

The plugin ships its own migration files (SQL or Prisma migration format) as part of its artifact/package. When a plugin is installed or upgraded for a tenant, the core platform's migration runner executes the plugin's migrations within the target tenant schema. The core acts as a trusted executor — only the core holds database credentials.

### Migration Flow

1. Plugin package includes a `migrations/` directory with ordered, versioned migration files.
2. **Install**: Core sets `search_path = tenant_x` and runs all plugin migrations in order.
3. **Upgrade**: Core runs only new migrations. Execution state is tracked in a `_plugin_migrations` table within each tenant schema.
4. **Uninstall**: Core drops plugin-prefixed tables (`DROP TABLE IF EXISTS crm_contacts, crm_deals CASCADE`).

### Why This Approach

- Plugin developers can design their own schema without core team involvement.
- Core maintains the security perimeter — plugins never see database credentials.
- Migrations are versioned and ordered, following a well-understood pattern.
- SQL migrations are language-agnostic, supporting polyglot plugin backends (ADR-008).

## Consequences

### Positive

- Full plugin autonomy for data model design and evolution.
- Core retains exclusive database access — no credential leakage to plugins.
- Versioned, ordered migrations are a proven, well-tooled pattern.
- Language-agnostic — works regardless of what language the plugin backend uses.

### Negative

- Core must validate and sandbox plugin migrations (disallow `DROP SCHEMA`, cross-schema references, privilege escalation statements).
- Migration runner adds complexity to the plugin install/upgrade flow.
- Rollback on partial migration failure must be handled (transaction wrapping per migration file).

### Risks

- **Malicious plugin migrations**: Mitigate with migration validation — whitelist allowed SQL statements, require migration review before marketplace approval.
- **Migration timeout on large tenants**: Mitigate with per-migration timeout, async execution with status tracking, and progress reporting to the admin UI.

## Alternatives Considered

### Core Defines All Tables (Plugin Requests Schema via Config)

- Plugin declares its data model in a config file; core generates and runs the actual migrations.
- Rejected: kills plugin autonomy. The core team becomes a bottleneck for every plugin's data model changes. Complex or evolving schemas become impractical to express declaratively.

### Plugins Run Their Own Migrations (Direct DB Access)

- Each plugin backend connects to the database and runs its own migrations.
- Rejected: security disqualifier. Plugins would need database credentials and could access other tenant schemas. Violates the core security perimeter.

### ORM-Level Auto-Migration (Prisma Migrate)

- Use Prisma's built-in migration system for plugin schemas.
- Rejected: Prisma's migration system assumes a single schema. Multi-schema execution with plugin-prefixed tables in per-tenant schemas requires custom handling regardless. Raw SQL migrations give plugins more control with less framework coupling.

---

## Amendment — 2026-07-23: Parsed SQL Allowlist and `node-sql-parser`

**Status**: Accepted (amends the accepted decision above)
**Driver**: PR #77 security remediation; Spec 004 DR-18, AC-07
**New core dependency**: `node-sql-parser` `^5.4.0`

### Context

Prefix checks and textual semicolon splitting are not a security boundary.
Comments, quoted values, CTEs, cross-schema references, and multi-statement SQL
can bypass or break string-based handling. PostgreSQL role restrictions remain
the authoritative boundary, but the migration runner also needs deterministic
pre-execution validation and one-statement-at-a-time execution.

### Decision

- Adopt `node-sql-parser` as the single parser for PostgreSQL plugin migration
  SQL. Parse the complete file into an AST array before executing anything.
- Allow only `CREATE TABLE`, `CREATE INDEX`, and additive `ALTER TABLE` against
  unqualified `{pluginSlug}_*` tables. Reject CTEs, `CREATE ... AS SELECT`,
  cross-schema references, DML, functions, extensions, grants, role/session
  changes, destructive DDL, and AST nodes the validator does not recognize.
- Execute each already-approved AST statement separately using parser
  serialization; do not split SQL with `String.split(';')`.
- Keep execution inside one PostgreSQL transaction under the installation's
  temporary restricted migration role. Parser validation is defense in depth,
  never a replacement for ADR-017 database grants.

Alternatives considered were retaining prefix/string checks (bypassable) and
relying only on PostgreSQL permissions (insufficient error quality and allows
more DDL than the plugin contract). Both are rejected.

### Consequences

- **Positive**: comments and semicolons are handled structurally; the dependency
  closes the missing ADR for a core package; validation and execution share one
  statement model.
- **Negative**: supported SQL is intentionally narrower than PostgreSQL, and
  parser upgrades require regression tests before adoption.
- **Neutral**: migration authors still provide ordered `.sql` files.

### Migration and Rollout

Pin the dependency through the lockfile, add parser corpus tests, and validate
all bundled plugin migrations before enabling installs. Existing applied
migrations are not replayed. A parser failure blocks the install transaction
without changing schema state. Rollback removes the application release but
must not restore textual allowlists.

### Security and GDPR

Migration content is untrusted input and is validated before database access.
Errors expose statement category and file only, not SQL containing tenant data.
No migration, parser diagnostic, or connection string is logged verbatim.

### Constitution Alignment

| Article | Status | Notes |
| --- | --- | --- |
| Rule 5 / dependencies | Compliant | This amendment records the new core dependency before remediation build. |
| Security: SQL injection | Improved | AST allowlist plus restricted PostgreSQL role is defense in depth. |
| Security: input validation | Compliant | Complete migration files are parsed before execution. |
