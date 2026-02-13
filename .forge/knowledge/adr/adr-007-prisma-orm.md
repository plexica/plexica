# ADR-007: ORM Choice (Prisma)

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Backend Team  
**Context**: ORM selection for PostgreSQL interaction

## Context and Problem Statement

Plexica needs an ORM that supports PostgreSQL multi-schema architecture (schema-per-tenant), provides type-safe query generation, and offers robust migration management. The ORM must handle dynamic schema switching per request and generate efficient queries.

## Decision Drivers

- Type-safe query generation (compile-time error detection)
- Multi-schema support (critical for schema-per-tenant pattern)
- Migration management (automated, versioned, reversible)
- Developer experience (tooling, debugging, documentation)
- Performance (query optimization, connection pooling)

## Considered Options

1. **Prisma** (chosen)
2. **TypeORM**
3. **Knex.js + Objection.js**

## Decision Outcome

**Chosen option**: Prisma — provides the strongest type safety with generated client types, excellent migration management, multi-schema support via the `multiSchema` preview feature, and Prisma Studio for debugging.

### Positive Consequences

- Type-safe query generation (auto-generated TypeScript types from schema)
- Excellent migration management (versioned, reproducible, auditable)
- Prisma Studio for database debugging and exploration
- Optimal query performance with query engine
- Multi-schema support via `multiSchema` preview feature
- Strong ecosystem and documentation

### Negative Consequences

- Less flexible for complex raw SQL queries (mitigated with `$queryRaw`)
- Client generation requires a build step (`prisma generate`)
- `multiSchema` is a preview feature (may have edge cases)

## Implementation Notes

- Prisma schema: `packages/database/prisma/schema.prisma`
- Client generated to `@plexica/database` package
- Tenant context middleware sets Prisma schema search path per request
- All queries parameterized (SQL injection prevention per Constitution Article 5.3)
- No raw SQL except via `$queryRaw` with parameterized inputs
- Per Constitution Article 2.1: Prisma ^6.8 is the approved ORM
- Per Constitution Article 3.3: All database access via Prisma

## Related Decisions

- ADR-002: Database Multi-Tenancy (schema-per-tenant pattern Prisma implements)
- ADR-001: Monorepo Strategy (`@plexica/database` shared package)
- Constitution Article 3.3: Data patterns (Prisma ORM, parameterized queries)
- Constitution Article 5.3: Input validation (SQL injection prevention)

## References

- Source: `planning/DECISIONS.md` (ADR-007)
- `specs/TECHNICAL_SPECIFICATIONS.md` Section 2: Database Architecture
- [Prisma Documentation](https://www.prisma.io/docs)
