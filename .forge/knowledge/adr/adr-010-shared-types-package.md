# ADR-010: @plexica/types Shared Package

**Date**: 2026-02-11  
**Status**: Accepted  
**Deciders**: Architecture Team  
**Context**: Shared type definitions strategy across monorepo packages

## Context and Problem Statement

As Plexica grew, type definitions (User, Tenant, Workspace, Plugin, etc.) were duplicated across web app, super-admin, SDK, and API client packages. Type drift between frontend and backend became a recurring source of bugs. We need a single source of truth for shared TypeScript types.

## Decision Drivers

- Eliminate type drift between packages
- Single definition per domain entity (User, Tenant, Plugin, Workspace)
- Simplified maintenance (update once, propagate everywhere)
- Type safety across monorepo boundaries
- Avoid circular dependencies between packages

## Considered Options

1. **@plexica/types shared package** (chosen)
2. **Define types in each app** (status quo)
3. **API-driven types via OpenAPI code generation**
4. **Global `.d.ts` files**

## Decision Outcome

**Chosen option**: Create `@plexica/types` package in `packages/types/` as a shared TypeScript type definitions package imported by all consumer packages. This ensures a single source of truth for all domain types.

### Positive Consequences

- Single definition of User, Tenant, Workspace, Plugin types
- Simplified maintenance (update once, propagate to all consumers)
- Type safety across monorepo boundary (compile-time checks)
- Reduced duplicated code
- Easier to add new types (single known location)
- Leverages monorepo structure (ADR-001)

### Negative Consequences

- Additional package to maintain in the monorepo
- Circular dependency risk (requires careful management — types should not import from other packages)
- Requires coordination across teams when types change (breaking changes affect all consumers)

## Implementation Notes

- Package location: `packages/types/`
- Published as `@plexica/types` within the monorepo
- Consumed by: `apps/web`, `apps/super-admin`, `packages/sdk`, `packages/api-client`
- Types are pure interfaces/types (no runtime code, no side effects)
- Created as part of Frontend Consolidation Phase A (February 2026)
- Per Constitution Article 2.1: TypeScript ^5.9 for type definitions

## Related Decisions

- ADR-001: Monorepo Strategy (enables shared packages)
- ADR-003: Plugin Language Support (TypeScript types for SDK)
- ADR-009: TailwindCSS v4 Tokens (theme type definitions in @plexica/types)
- Constitution Article 7.1: Naming conventions (PascalCase for interfaces)

## References

- Source: `planning/DECISIONS.md` (ADR-010)
- `specs/PROJECT_STRUCTURE.md`: Repository structure
