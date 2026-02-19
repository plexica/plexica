# ADR-002: Database Multi-Tenancy Strategy

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Backend Team  
**Context**: Data isolation strategy for multi-tenancy on PostgreSQL

## Context and Problem Statement

Plexica requires complete data isolation between tenants for security, compliance, and performance. We need to choose a PostgreSQL multi-tenancy pattern that balances isolation strength, query performance, operational overhead, and scalability up to ~10,000 tenants.

## Decision Drivers

- Complete data isolation between tenants (security requirement per Constitution Article 5.2)
- Query performance without tenant_id filtering overhead
- Per-tenant backup/restore capability
- Scalability to thousands of tenants
- Migration management complexity

## Considered Options

1. **Schema-per-tenant on single database** (chosen)
2. **Database-per-tenant** (separate PostgreSQL databases)
3. **Shared schema with tenant_id column** (row-level filtering)
4. **Hybrid** (shared for small, dedicated for enterprise)

## Decision Outcome

**Chosen option**: Schema-per-tenant — provides complete logical isolation with optimal query performance, granular backup/restore, and efficient scaling up to ~10,000 tenants.

### Positive Consequences

- Complete logical isolation (no cross-tenant data leakage risk from missing WHERE clauses)
- Optimal query performance (no `tenant_id` in every WHERE clause)
- Granular backup/restore per tenant
- Efficient vertical scaling up to ~10,000 tenants
- Per-tenant plugin data schemas (`tenant_{slug}_plugin_{name}`)

### Negative Consequences

- PostgreSQL limit of ~10,000 schemas (sufficient for projected use case)
- Migration overhead when schema changes must propagate to all tenants (mitigated with automation)
- Connection pooling complexity (mitigated with PgBouncer)

## Implementation Notes

- Schema naming: `core` (global), `tenant_{slug}` (tenant data), `tenant_{slug}_plugin_{name}` (plugin data)
- Prisma ORM with `multiSchema` preview feature
- Tenant context middleware automatically sets schema search path per request
- Migration runner service applies migrations to all tenant schemas
- Per Constitution Article 3.3: All database access via Prisma with parameterized queries

## Related Decisions

- ADR-007: Prisma ORM (implements the schema-per-tenant pattern)
- ADR-001: Monorepo Strategy (database package in `packages/database`)
- Constitution Article 1.2: Multi-tenancy isolation principle
- Constitution Article 5.2: Data protection standards

## References

- Source: `planning/DECISIONS.md` (ADR-002)
- `specs/TECHNICAL_SPECIFICATIONS.md` Section 2: Database Architecture
- `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 3: Multi-Tenancy
