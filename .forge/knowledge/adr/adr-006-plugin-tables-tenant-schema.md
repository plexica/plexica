# ADR-006: Plugin Tables in Tenant Schema

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plugins that need persistent data (e.g., a CRM plugin storing contacts, an analytics plugin storing events) require database tables. These tables must maintain the strict tenant isolation guarantees established in ADR-001 (schema-per-tenant). The design must also support clean data deletion for GDPR compliance and allow plugins to query core entity data when needed.

## Decision

Plugin tables live inside the tenant schema, prefixed with the plugin slug.

When a plugin is installed for a tenant, its migrations create tables in that tenant's existing schema. For example, when the CRM plugin is installed for tenant "acme":

- Table `tenant_acme.crm_contacts` is created inside the `tenant_acme` schema.
- Table `tenant_acme.crm_deals` is created in the same schema.

Naming rules:

- All plugin tables must be prefixed with the plugin slug: `{plugin_slug}_{table_name}`.
- Plugin slugs are unique and validated at plugin registration time.
- Core platform tables in the tenant schema have no prefix (e.g., `tenant_acme.workspaces`).

Plugin migrations run inside a transaction. On failure, the transaction is rolled back and the plugin installation is marked as failed.

## Consequences

### Positive

- Tenant isolation by construction — plugin data inherits the schema-per-tenant boundary from ADR-001 with zero additional configuration.
- GDPR deletion is trivial: `DROP SCHEMA tenant_acme CASCADE` removes all core and plugin data in one operation.
- Plugins can JOIN with core tenant tables directly (same schema, same `search_path`), enabling queries like `SELECT * FROM crm_contacts JOIN workspaces ON ...`.
- No additional schema management — plugin tables are just tables in an existing schema.

### Negative

- Plugin uninstall must selectively drop only plugin-prefixed tables, not the entire schema. Requires a `DROP TABLE` loop filtered by prefix.
- Table name collisions are possible if two plugins choose the same slug. Mitigated by enforcing unique plugin slugs at registration.
- Schema migrations grow in complexity — both core and plugin migrations operate on the same schema, requiring careful ordering.

### Risks

- **Migration failures**: A broken plugin migration could leave the tenant schema in an inconsistent state. Mitigated by running plugin migrations in transactions with automatic rollback on failure, and supporting dry-run mode.
- **Table count growth**: A tenant with many plugins could accumulate a large number of tables. Mitigated by monitoring table counts per schema and grouping by prefix in admin tooling.
- **Plugin upgrade migrations**: Altering plugin tables across all tenant schemas requires iterating over every tenant. Mitigated by a migration runner that applies plugin migrations per-tenant with progress tracking and failure isolation.

## Alternatives Considered

### Separate Plugin Schema per Tenant

- Creates a dedicated schema per plugin per tenant (e.g., `plugin_crm_acme.contacts`).
- Results in schema explosion: N tenants x M plugins schemas. Managing hundreds or thousands of schemas is operationally painful.
- Rejected: unacceptable operational complexity.

### Shared Plugin Schema with RLS

- A single shared schema per plugin (e.g., `plugin_crm.contacts`) with a `tenant_id` column and PostgreSQL Row-Level Security policies.
- Breaks the schema-per-tenant principle from ADR-001. Re-introduces the risk of cross-tenant data leaks through misconfigured RLS policies.
- `DROP SCHEMA CASCADE` no longer removes plugin data — GDPR deletion requires per-table `DELETE WHERE tenant_id = ...`.
- Rejected: undermines the tenant isolation model.

### NoSQL/Document Store for Plugin Data

- Plugins store data in a document database (e.g., MongoDB) instead of PostgreSQL.
- Adds a second database infrastructure dependency. Loses SQL JOINs with core relational data. Prisma has no MongoDB migration support.
- Rejected: added complexity with no compensating benefit for the common case.
