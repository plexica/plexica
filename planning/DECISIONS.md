# Plexica - Architectural Decision Records (ADR)

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Developer Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Architectural Decisions

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

## ADR-008: Playwright for Frontend E2E Testing

**Date**: 2026-02-11  
**Status**: ✅ Accepted  
**Deciders**: Frontend Team  
**Tags**: #testing #frontend #e2e

### Context

Frontend application (web and super-admin) required comprehensive E2E test coverage to ensure quality as features grew. Multiple E2E testing frameworks available (Cypress, Playwright, WebDriver).

### Decision

**Use Playwright for E2E testing** with TypeScript support and Chromium browser for development/CI, Firefox for production validation.

### Consequences

#### Positive

- Fast execution (<200ms per test)
- Excellent TypeScript support
- Cross-browser testing capability
- Rich debugging and recording features
- Native support for mocking API responses
- Better IDE integration than alternatives

#### Negative

- Learning curve for team new to Playwright
- Setup/teardown complexity for stateful tests
- Requires separate test data fixtures

### Alternatives Considered

1. **Cypress**: Better UI but slower, less flexible for complex scenarios
2. **Selenium/WebDriver**: Legacy, heavier, slower
3. **Manual testing only**: ❌ No automation, high maintenance cost

### Related Decisions

- ADR-009: TailwindCSS v4 Semantic Tokens
- ADR-010: @plexica/types Package Creation

---

## ADR-009: TailwindCSS v4 Semantic Tokens

**Date**: 2026-02-11  
**Status**: ✅ Accepted  
**Deciders**: Design System Team  
**Tags**: #design #frontend #theming

### Context

Multiple frontend apps needed consistent theming with easy customization per tenant. TailwindCSS v3 config-based approach becoming unwieldy as complexity increased.

### Decision

**Migrate to TailwindCSS v4 with CSS custom properties for semantic tokens** to enable:

- Runtime theme switching without rebuild
- Per-tenant color customization
- Dark mode support
- Consistent design language across all apps

### Consequences

#### Positive

- Runtime theme customization
- Single source of truth for tokens
- CSS cascade advantage for overrides
- Better dark mode support
- Smaller Tailwind config files

#### Negative

- Migration work from v3 to v4
- Requires CSS knowledge alongside Tailwind
- Slightly higher CSS payload

### Alternatives Considered

1. **Stick with TailwindCSS v3**: ❌ Limited runtime flexibility
2. **Use Styled Components**: ❌ Larger JS bundle, less performant
3. **Custom CSS-in-JS**: ❌ More maintenance overhead

### Related Decisions

- ADR-008: Playwright for E2E Testing
- ADR-010: @plexica/types Package Creation

---

## ADR-010: @plexica/types Shared Package

**Date**: 2026-02-11  
**Status**: ✅ Accepted  
**Deciders**: Architecture Team  
**Tags**: #packages #types #monorepo

### Context

As application grew, type definitions were duplicated across web, super-admin, SDK, and API client packages. Type drift between frontend and backend becoming problematic.

### Decision

**Create @plexica/types package** with shared TypeScript type definitions imported by all consumer packages to ensure single source of truth.

### Consequences

#### Positive

- Single definition of User, Tenant, Workspace, Plugin types
- Simplified maintenance (update once, propagate everywhere)
- Type safety across monorepo boundary
- Reduced duplicated code
- Easier to add new types (shared location)

#### Negative

- Additional package to maintain
- Circular dependency risk (requires careful management)
- Requires coordination across teams

### Alternatives Considered

1. **Define types in each app**: ❌ Leads to drift and duplicates
2. **API-driven types (OpenAPI)**: ❌ More overhead, less flexible
3. **Global .d.ts files**: ❌ Not properly scoped

### Related Decisions

- ADR-009: TailwindCSS v4 Semantic Tokens
- ADR-008: Playwright for E2E Testing

---

## ADR-011: Module Federation for Plugin Frontend Loading

**Date**: 2026-02-11  
**Status**: ✅ Accepted  
**Deciders**: Frontend Team  
**Tags**: #plugins #frontend #module-federation

### Context

Required dynamic loading of frontend plugins without rebuilding the host application. Plugins need to be:

- Independently developed and deployed
- Dynamically loaded at runtime
- Share dependencies with host (React, Router, etc.)
- Provide UI routes and menu items

### Decision

**Use Vite + @originjs/vite-plugin-federation** to implement Module Federation pattern for dynamic plugin loading from MinIO CDN.

### Consequences

#### Positive

- Zero host rebuild for plugin updates
- Independent plugin development cycle
- Smaller initial bundle (shared dependencies)
- Plugin isolation (each runs independently)
- Production-ready implementation

#### Negative

- Vite Module Federation still maturing (less battle-tested than Webpack)
- Plugin route registration limited by TanStack Router limitations
- Requires careful shared dependency management

### Alternatives Considered

1. **Webpack Module Federation**: ❌ Higher build complexity, not Vite-native
2. **iframes**: ❌ Full isolation but performance overhead
3. **Monolithic bundle with code splitting**: ❌ Requires rebuild for plugin updates
4. **Separate routes per plugin**: ❌ Less flexible, more maintenance

### Related Decisions

- ADR-008: Playwright for E2E Testing
- ADR-010: @plexica/types Package Creation

---

_Architectural Decision Records - Plexica v1.1_  
_Last Updated: February 11, 2026_
