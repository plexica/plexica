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
