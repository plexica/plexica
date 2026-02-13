# ADR-003: Plugin Language Support

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Engineering Team  
**Context**: Language support strategy for plugin development

## Context and Problem Statement

Plexica's plugin system needs to support external developers building plugins. We must decide which programming languages to support for plugin development, balancing ecosystem richness against SDK maintenance overhead and time-to-market.

## Decision Drivers

- Time-to-market for MVP (Phase 1-4)
- SDK maintenance cost (each language = separate SDK)
- End-to-end type safety with the core platform
- Developer experience consistency
- Testing complexity per supported language

## Considered Options

1. **TypeScript only for MVP** (chosen), Python optional in Phase 5+
2. **TypeScript + Python from start**
3. **Polyglot from start** (TypeScript, Python, Go)

## Decision Outcome

**Chosen option**: TypeScript only for MVP (Phases 1-4), with Python support deferred to Phase 5+ if demand warrants it. This focuses resources on a single, high-quality SDK with end-to-end type safety.

### Positive Consequences

- Single SDK to maintain (lower maintenance burden)
- End-to-end type safety between plugin and core platform
- Coherent developer experience across all plugins
- Faster time-to-market for MVP
- Simpler testing infrastructure (one language runtime)

### Negative Consequences

- Limits adoption by developers who prefer Python, Go, or other languages
- Some use cases (ML, data science) naturally fit Python better
- May reduce plugin ecosystem growth if TypeScript-only is a barrier

## Implementation Notes

- Plugin SDK: `@plexica/sdk` package in monorepo
- Plugins extend `PlexicaPlugin` base class with TypeScript decorators
- Plugin manifest schema validates runtime type as `typescript`
- Per Constitution Article 2.1: TypeScript ^5.9 is the approved language

## Related Decisions

- ADR-006: Fastify Framework (TypeScript-native backend)
- ADR-010: @plexica/types Shared Package (type definitions for plugins)
- Constitution Article 2.1: Approved technology stack

## References

- Source: `planning/DECISIONS.md` (ADR-003)
- `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 7.6: Plugin SDK
- `planning/ROADMAP.md` Phase 5: Ecosystem Expansion (Python consideration)
