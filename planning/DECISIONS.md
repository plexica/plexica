# Plexica - Architectural Decision Records (ADR)

Log of important architectural decisions made during project development.

---

## ADR Template

```markdown
# ADR-XXX: Decision Title

**Date**: YYYY-MM-DD  
**Status**: Proposed | Accepted | Deprecated | Superseded  
**Deciders**: Name1, Name2  
**Tags**: tag1, tag2

## Context

Description of the problem or situation requiring a decision.

## Decision

The decision made.

## Consequences

### Positive

- Pro 1
- Pro 2

### Negative

- Con 1
- Con 2

### Neutral

- Consideration 1

## Alternatives Considered

1. **Alternative 1**: Description and reason for rejection
2. **Alternative 2**: Description and reason for rejection

## Related Decisions

- ADR-XXX: Link to related decision
```

---

## ADR-001: Monorepo vs Multi-Repo Choice

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Engineering Team  
**Tags**: #architecture #repository

### Context

We need to decide how to organize the Plexica project code, which includes core API, frontend, internal plugins, SDK, and shared packages.

### Decision

**We use a Monorepo with Turborepo + pnpm**

### Consequences

#### Positive

- End-to-end type safety between packages
- Facilitated cross-package refactoring
- Single source of truth for dependencies
- Simplified CI/CD
- Improved developer experience (single clone)
- Atomic cross-package commits

#### Negative

- Larger repository
- Requires specific tooling (Turborepo)
- Learning curve for new developers

### Alternatives Considered

1. **Multi-Repo**: 8+ separate repositories
   - ❌ Type drift between repos
   - ❌ Complex versioning
   - ❌ Difficult refactoring

2. **Lerna Monorepo**: Alternative tool
   - ❌ Less performant than Turborepo
   - ❌ Fewer modern features

---

## ADR-002: Database Multi-Tenancy Strategy

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Backend Team  
**Tags**: #database #multi-tenancy

### Context

We need to decide the data isolation strategy for multi-tenancy on PostgreSQL.

### Decision

**Schema-per-tenant on single PostgreSQL database**

### Consequences

#### Positive

- Complete logical isolation
- Optimal query performance (no tenant_id in WHERE)
- Granular backup/restore per tenant
- Efficient vertical scaling up to ~10k tenants

#### Negative

- PostgreSQL limit: ~10k schemas (sufficient for use case)
- Migration overhead (mitigated with automation)

### Alternatives Considered

1. **Database-per-tenant**
   - ❌ Too much management overhead
   - ❌ Complex connection pooling
   - ✅ Maximum isolation

2. **Shared schema with tenant_id column**
   - ❌ Data leak risk
   - ❌ Performance degradation with growth
   - ✅ Simpler

3. **Hybrid (shared for small, dedicated for enterprise)**
   - ❌ High management complexity
   - ✅ Better performance/cost

---

## ADR-003: Plugin Language Support

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Engineering Team  
**Tags**: #plugins #language

### Context

We need to decide which languages to support for plugin development.

### Decision

**TypeScript only for MVP (Phase 1-4), Python optional in Phase 5+**

### Consequences

#### Positive

- Focus on single stack for MVP
- End-to-end type safety
- Coherent developer experience
- Simpler SDK
- Faster time-to-market

#### Negative

- Limits developers who don't know TypeScript
- Some use cases (ML, data science) would prefer Python

### Alternatives Considered

1. **TypeScript + Python from start**
   - ❌ Double SDK to maintain
   - ❌ Testing complexity
   - ✅ More flexibility

2. **Polyglot from start (TS, Python, Go)**
   - ❌ Too complex for MVP
   - ❌ Limited resources
   - ✅ Maximum flexibility

---

## ADR-004: Frontend Module Federation

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Frontend Team  
**Tags**: #frontend #plugins

### Context

We need to decide how to dynamically load plugin frontends.

### Decision

**Webpack/Vite Module Federation**

### Consequences

#### Positive

- Dynamic plugin UI loading
- Automatic code splitting
- Independent plugin versioning
- No shell rebuild for new plugin

#### Negative

- Initial setup complexity
- More difficult debugging
- Dependency management needs care

### Alternatives Considered

1. **Iframe isolation**
   - ❌ Worse performance
   - ❌ Problematic styling isolation
   - ✅ Complete isolation

2. **Monolith rebuild per plugin**
   - ❌ No dynamic loading
   - ❌ Deploy coupling
   - ✅ Simpler

---

## ADR-005: Event System (Redpanda vs Kafka)

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Backend Team  
**Tags**: #events #messaging

### Context

We need to choose a message broker for event-driven communication between plugins.

### Decision

**Redpanda (Kafka-compatible)**

### Consequences

#### Positive

- Kafka-compatible API (ecosystem)
- Simpler setup (no Zookeeper)
- Better performance than Kafka
- Smaller resource footprint
- Self-balancing

#### Negative

- Less mature than Kafka
- Smaller community

### Alternatives Considered

1. **Apache Kafka**
   - ❌ Zookeeper dependency
   - ❌ Complex setup
   - ✅ Battle-tested

2. **RabbitMQ**
   - ❌ Less performant for high throughput
   - ✅ Simpler for basic use cases

3. **Redis Streams**
   - ❌ Fewer features (no partition)
   - ❌ Limited retention
   - ✅ We already have Redis

---

## ADR-006: API Framework (Fastify vs Express)

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Backend Team  
**Tags**: #backend #framework

### Context

We need to choose the web framework for Core API and plugin backend.

### Decision

**Fastify**

### Consequences

#### Positive

- Performance: 2-3x faster than Express
- Native TypeScript support
- Built-in plugin system
- Integrated schema validation (Zod)
- Modern async/await patterns

#### Negative

- Smaller ecosystem than Express
- Some Express-only libraries not compatible

### Alternatives Considered

1. **Express**
   - ❌ Lower performance
   - ❌ No native TypeScript
   - ✅ Huge ecosystem

2. **NestJS**
   - ❌ Too opinionated
   - ❌ Angular-like overhead
   - ✅ Structure out-of-box

---

## ADR-007: ORM Choice (Prisma vs TypeORM)

**Date**: 2025-01-13  
**Status**: ✅ Accepted  
**Deciders**: Backend Team  
**Tags**: #database #orm

### Context

We need to choose an ORM for PostgreSQL interaction.

### Decision

**Prisma**

### Consequences

#### Positive

- Type-safe query generation
- Excellent migration management
- Prisma Studio for debugging
- Optimal performance
- Multi-schema support (tenant isolation)

#### Negative

- Less flexible for complex raw queries
- Client generation requires build step

### Alternatives Considered

1. **TypeORM**
   - ❌ Less rigorous type safety
   - ❌ Less robust migration system
   - ✅ More flexible

2. **Knex.js + Objection.js**
   - ❌ More complex setup
   - ✅ Powerful query builder

---

## ADR Template for Future Decisions

When making a new significant architectural decision:

1. Copy template above
2. Number sequentially (ADR-008, ADR-009, etc.)
3. Fill in all sections
4. Discuss with team
5. Commit in this file

**When is an ADR needed?**

- Major technology choices
- Architectural patterns
- Trade-offs with long-term impact
- Decisions hard to revert

---

_Architectural Decision Records - Plexica v1.0_  
_Last Updated: January 2025_
