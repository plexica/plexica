# ADR-006: API Framework (Fastify)

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Backend Team  
**Context**: Web framework selection for Core API and plugin backends

## Context and Problem Statement

Plexica's Core API needs a high-performance web framework that supports TypeScript natively, provides a plugin architecture (aligning with Plexica's own plugin system), and offers built-in schema validation. The framework must handle multi-tenant request routing, authentication hooks, and permission middleware efficiently.

## Decision Drivers

- Performance (high request throughput for multi-tenant SaaS)
- Native TypeScript support (type safety across the stack)
- Built-in plugin system (aligns with Plexica's architecture)
- Schema validation integration (Zod compatibility)
- Modern async/await patterns

## Considered Options

1. **Fastify** (chosen)
2. **Express**
3. **NestJS**

## Decision Outcome

**Chosen option**: Fastify — provides 2-3x better performance than Express, native TypeScript support, a built-in plugin system that mirrors Plexica's own architecture, and integrated schema validation.

### Positive Consequences

- Performance: 2-3x faster than Express in benchmarks
- Native TypeScript support with excellent type inference
- Built-in plugin system (encapsulation, lifecycle hooks)
- Integrated schema validation (compatible with Zod via fastify-type-provider-zod)
- Modern async/await patterns throughout
- Fastify hooks for middleware (auth guards, tenant context)

### Negative Consequences

- Smaller ecosystem than Express (some Express-only middleware unavailable)
- Some Express-compatible libraries require adapters
- Fewer community examples and tutorials compared to Express

## Implementation Notes

- Core API: `apps/core-api` uses Fastify ^5.7
- Authentication: Fastify hooks for JWT validation and tenant context
- Route registration: Feature modules register routes as Fastify plugins
- Validation: Zod schemas integrated via Fastify type provider
- Per Constitution Article 2.1: Fastify ^5.7 is the approved framework
- Per Constitution Article 4.3: P95 API response time < 200ms target

## Related Decisions

- ADR-007: Prisma ORM (data access within Fastify services)
- ADR-005: Event System (async event handling in Fastify lifecycle)
- Constitution Article 2.1: Approved technology stack
- Constitution Article 3.4: API standards (REST, versioning, error format)

## References

- Source: `planning/DECISIONS.md` (ADR-006)
- `specs/TECHNICAL_SPECIFICATIONS.md` Section 1.3: Core API Service Architecture
- [Fastify Documentation](https://fastify.dev/)
