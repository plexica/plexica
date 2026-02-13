# ADR-004: Frontend Module Federation

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Frontend Team  
**Context**: Dynamic loading strategy for plugin frontends

## Context and Problem Statement

Plexica plugins can contribute frontend UI (pages, widgets, routes). We need a mechanism to dynamically load plugin frontend code at runtime without rebuilding the host application, while sharing common dependencies (React, Router, etc.) to minimize bundle size.

## Decision Drivers

- Dynamic plugin UI loading without host rebuild
- Independent plugin development and deployment cycles
- Shared dependency management (avoid duplicate React bundles)
- Plugin isolation (plugin crashes should not break the host)
- Performance (code splitting, lazy loading)

## Considered Options

1. **Webpack/Vite Module Federation** (chosen)
2. **Iframe isolation**
3. **Monolithic bundle with code splitting**

## Decision Outcome

**Chosen option**: Module Federation via Vite — enables dynamic plugin UI loading with automatic code splitting, independent plugin versioning, and shared dependencies, all without requiring a host rebuild when plugins change.

### Positive Consequences

- Dynamic plugin UI loading at runtime
- Automatic code splitting per plugin
- Independent plugin versioning and deployment
- No shell/host rebuild when plugins are added or updated
- Shared dependencies reduce total bundle size

### Negative Consequences

- Initial setup complexity for Module Federation configuration
- More difficult debugging across federated module boundaries
- Shared dependency version management requires care
- Vite Module Federation is less mature than Webpack's implementation

## Implementation Notes

- Implemented via `@originjs/vite-plugin-federation` (see ADR-011)
- Plugin frontends served from MinIO CDN as `remoteEntry.js`
- Host app (`apps/web`) dynamically loads remotes based on enabled plugins
- Each plugin has a unique route prefix (`/crm`, `/billing`, `/analytics`)
- Per Constitution Article 2.1: Vite is the approved frontend build tool

## Related Decisions

- ADR-011: Vite Module Federation implementation details
- ADR-009: TailwindCSS v4 Semantic Tokens (shared design system)
- Constitution Article 2.1: Approved technology stack (React, Vite)

## References

- Source: `planning/DECISIONS.md` (ADR-004)
- `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 8: Frontend Architecture
- `docs/ARCHITECTURE.md`: Frontend architecture details
