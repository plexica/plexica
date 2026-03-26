# ADR-001: Schema-Per-Tenant PostgreSQL

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plexica v2 is a multi-tenant SaaS platform that requires a data isolation strategy for PostgreSQL. The choice affects security, compliance, operational complexity, and plugin architecture. Three options were evaluated: shared schema with row-level security (RLS), schema-per-tenant, and database-per-tenant.

GDPR compliance is a hard requirement — tenant data must be fully isolatable and deletable on demand. The plugin system (ADR-006) also needs a clear home for per-tenant plugin tables.

## Decision

Use **schema-per-tenant** isolation. Each tenant gets its own PostgreSQL schema (e.g., `tenant_acme`, `tenant_globex`). A shared `core` schema holds system-wide tables: tenant registry, global configuration, and platform metadata.

Key implementation details:

- Tenant schema is created during tenant provisioning via a migration runner
- Prisma operates against each tenant schema, with schema routing driven by tenant context extracted from the authenticated request
- Plugin tables live inside the tenant schema, collocated with tenant data (see ADR-006)
- Tenant data deletion is `DROP SCHEMA CASCADE` — complete and auditable
- PgBouncer handles connection pooling with per-schema routing

## Consequences

### Positive

- Complete data isolation between tenants with no shared-table leakage risk
- GDPR compliance is straightforward — dropping a schema removes all tenant data
- Per-tenant backup and restore is possible without affecting other tenants
- Plugin tables are naturally scoped to the tenant schema
- Proven approach — v1 used this model successfully for isolation

### Negative

- Schema creation adds overhead to tenant provisioning (typically 2-5 seconds)
- Prisma client requires schema routing logic in middleware
- Migrations must run against every tenant schema, not just once
- Connection pooling is more complex than a single-schema setup

### Risks

- **Schema count scaling**: Hundreds of schemas increase catalog size and planning time. Mitigated by PgBouncer connection pooling and periodic `ANALYZE` on system catalogs.
- **Migration rollout time**: Grows linearly with tenant count. Mitigated by parallel migration runner with configurable concurrency.
- **Schema drift**: A failed migration on one schema leaves inconsistent state. Mitigated by transactional migrations and a schema version registry in the `core` schema.

## Alternatives Considered

### Shared Schema with Row-Level Security (RLS)

- All tenants share tables; a `tenant_id` column and RLS policies enforce isolation.
- Rejected because: RLS policies are error-prone — a single missing policy leaks cross-tenant data. GDPR deletion requires row-by-row purging instead of a clean schema drop. v1 partially used this approach and experienced accidental cross-tenant query results during development.

### Database-Per-Tenant

- Each tenant gets a separate PostgreSQL database.
- Rejected because: connection management becomes a nightmare at scale (each database needs its own connection pool). Infrastructure cost is significantly higher. Cross-tenant admin queries (e.g., platform analytics) require federated queries or ETL pipelines. Overkill for the isolation guarantees needed.
