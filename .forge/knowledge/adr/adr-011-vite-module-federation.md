# ADR-011: Vite Module Federation for Plugin Frontend Loading

**Date**: 2026-02-11  
**Status**: Accepted  
**Deciders**: Frontend Team  
**Context**: Specific Module Federation implementation for dynamic plugin frontend loading

## Context and Problem Statement

Following the conceptual decision in ADR-004 to use Module Federation, we need to select a specific implementation. Plugins must be independently developed, built, and deployed, then dynamically loaded at runtime by the host application. The implementation must work with Vite (our approved build tool) and support TanStack Router for type-safe routing.

## Decision Drivers

- Vite-native implementation (avoid Webpack dependency)
- Zero host rebuild for plugin updates
- Independent plugin development and deployment cycle
- Shared React and router dependencies
- MinIO CDN for plugin asset hosting
- Plugin isolation (runtime boundaries)

## Considered Options

1. **Vite + @originjs/vite-plugin-federation** (chosen)
2. **Webpack Module Federation** (requires Webpack build chain)
3. **iframes** (full isolation)
4. **Monolithic bundle with code splitting**
5. **Separate routes per plugin** (full page navigation)

## Decision Outcome

**Chosen option**: Vite + @originjs/vite-plugin-federation — provides Vite-native Module Federation with independent plugin development, shared dependencies, and CDN-based asset delivery. Plugin assets hosted on MinIO.

### Positive Consequences

- Zero host rebuild for plugin updates or new plugin additions
- Independent plugin development cycle (plugins are separate Vite builds)
- Smaller initial bundle (shared dependencies loaded once)
- Plugin isolation (each plugin runs independently)
- Production-ready implementation with CDN caching
- Vite-native (no Webpack dependency)

### Negative Consequences

- Vite Module Federation is still maturing (less battle-tested than Webpack's)
- Plugin route registration limited by TanStack Router's static route tree
- Requires careful shared dependency version management
- Plugin debugging across federation boundaries can be challenging

## Implementation Notes

- Plugin frontend built as Vite federated remotes
- `remoteEntry.js` uploaded to MinIO and served via CDN
- Host app dynamically imports remotes based on plugin manifest
- Dynamic route and menu registration system (360 lines)
- 2 sample frontend plugins: CRM, Analytics
- CLI tool (`plexica-cli`) for plugin build and publish
- Completed in Milestone 2.2 (January 22, 2026) — 93% efficiency
- Performance: remoteEntry.js ~2.3 KB gzipped, plugin load < 3s

## Related Decisions

- ADR-004: Frontend Module Federation (conceptual decision this implements)
- ADR-009: TailwindCSS v4 Tokens (plugins inherit design tokens from host)
- ADR-010: @plexica/types Shared Package (shared types across federation boundary)
- ADR-008: Playwright E2E (tests validate plugin loading)
- Constitution Article 2.1: Vite as approved build tool

## References

- Source: `planning/DECISIONS.md` (ADR-011)
- `planning/ROADMAP.md` Milestone 2.2: Module Federation (completed)
- `docs/ARCHITECTURE.md`: Frontend architecture details
- [@originjs/vite-plugin-federation](https://github.com/nicknisi/vite-plugin-federation)
