# ADR-005: Module Federation for Plugin UI

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plugins need to contribute UI components to the main shell application — sidebar items, dashboard widgets, settings pages, and more. The mechanism must support runtime loading without rebuilding the shell whenever a plugin is installed or updated. Plexica v1 used Module Federation but exposed all configuration complexity to plugin developers, resulting in poor DX and frequent misconfiguration.

## Decision

Use Vite Module Federation for runtime plugin UI loading. Plugin frontend builds expose named modules (components, routes) via `remoteEntry.js`. The shell consumes them at runtime.

To eliminate the configuration complexity that plagued v1, three layers of tooling abstract it away:

1. **CLI scaffolding**: `npx create-plexica-plugin` generates a plugin project with Module Federation pre-configured.
2. **Vite plugin preset**: `@plexica/vite-plugin` reads the plugin manifest and auto-generates the Module Federation configuration. Plugin developers never write MF config directly.
3. **Dev server integration**: The plugin dev server auto-registers with the shell for hot reload during development.

Shared dependencies (React, the design system, router) are loaded once by the shell and shared with all plugins.

## Consequences

### Positive

- Runtime loading — no shell rebuild when plugins are installed, updated, or removed.
- Shared dependencies reduce total bundle size and ensure a single React instance across shell and plugins.
- Type safety via shared TypeScript types between shell and plugins.
- Simplified DX — plugin developers work with standard React/Vite tooling; MF complexity is hidden behind `@plexica/vite-plugin`.
- Supports the plugin marketplace model where third-party plugins are loaded without platform redeployment.

### Negative

- Module Federation version compatibility — the shell and all plugins must use compatible MF versions. Version drift can cause runtime failures.
- Runtime loading failures (network errors, broken builds) require graceful error boundaries in the shell.
- Shared dependency version conflicts if a plugin requires a different major version of a shared library.

### Risks

- **MF tooling maturity**: The Vite Module Federation ecosystem is still evolving. Mitigated by pinning versions and maintaining the `@plexica/vite-plugin` abstraction layer.
- **Production cache busting**: `remoteEntry.js` must not be aggressively cached, or plugins will serve stale code. Mitigated by content-hashed filenames and CDN cache rules.
- **Plugin loading failures**: A broken plugin must not crash the shell. Mitigated by React error boundaries, fallback UI, and plugin health checks before loading.

## Alternatives Considered

### iframes

- Full isolation but poor UX: no shared design system, double scrollbars, clunky `postMessage` communication, duplicate resource loading.
- v1 analysis confirmed iframe-based plugin UI is inadequate for a cohesive product experience.
- Rejected: unacceptable UX and performance trade-offs.

### Web Components

- Limited React interop — wrapping React components in custom elements adds boilerplate and loses React context propagation.
- No shared dependency mechanism; each plugin bundles its own copy of React.
- Styling encapsulation via Shadow DOM conflicts with shared design system tokens.
- Rejected: poor fit for a React-based shell with a shared design system.

### Server-Side Composition (ESI/SSI)

- Adds server-side complexity for composing HTML fragments.
- No support for client-side interactivity without additional hydration logic.
- Rejected: wrong abstraction for interactive SPA plugin UIs.

### npm Packages (Build-Time)

- Requires a full shell rebuild on every plugin install or update.
- Incompatible with the plugin marketplace model — operators cannot install plugins without a CI/CD pipeline.
- Rejected: eliminates the runtime extensibility requirement.
