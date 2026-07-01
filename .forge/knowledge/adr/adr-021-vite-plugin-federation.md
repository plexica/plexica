# ADR-021: Module Federation Plugin for Vite

**Status**: Accepted
**Date**: 2026-06-26
**Driver**: Spec 004 (Plugin System) — UI Module Federation via Vite
**Deciders**: Product Owner (decision during Spec 004 Phase 3 implementation)
**Extends**: ADR-005 (Module Federation for Plugin UI)

## Context

Plugin UI is delivered via Module Federation (per ADR-005). The shell uses Vite as its build tool. To integrate Module Federation into the Vite build pipeline, a Vite-specific Module Federation plugin is needed.

Three options were evaluated:

- `@originjs/vite-plugin-federation` — Most mature Vite MF plugin, 3k+ GitHub stars, active maintenance
- `@module-federation/vite` — Newer entrant from the Module Federation team, less proven in production
- Native Vite shared modules + dynamic imports — No MF runtime support (no remote sharing)

## Decision

Use `@originjs/vite-plugin-federation` version `^1.3.5`. This was chosen for:

1. **Proven reliability**: 2+ years of production use, covers the core MF use case (remote exposes + shared deps)
2. **Shell-hosted model**: The plugin MF remote exposes components; the shell host consumes them. This is the exact use case `@originjs/vite-plugin-federation` was designed for
3. **Hot reload support**: Works with Vite's dev server for the plugin development workflow
4. **Future-proofing**: Can be upgraded to `@module-federation/vite` later without architectural changes (same shared deps contract)

## Consequences

### Positive
- Plugin developers write standard React components with no MF configuration
- The Vite preset (`@plexica/vite-plugin`) auto-generates the MF configuration from `manifest.json`
- Shared dependencies (React, TanStack Query, @plexica/ui) are version-locked via the shell

### Negative
- MF remote scripts are loaded via `<script>` tag injection at runtime (not dynamic import). Requires explicit URL allowlisting and SRI
- `@originjs/vite-plugin-federation` is deprecated in favor of `@module-federation/vite` — future migration may be needed

### Neutral
- Shell Vite config does not declare MF remotes directly — remotes are loaded dynamically at runtime via the plugin loader

## Alternatives Considered

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| `@originjs/vite-plugin-federation` | Stable, documented, supports shared deps | Deprecated upstream | **Chosen** |
| `@module-federation/vite` | Actively maintained, from official team | Less proven, API changes still occurring | Deferred |
| Native Vite dynamic import | No external dependency | No MF runtime (no shared dep enforcement, no remote versioning) | Rejected |

## Related Decisions

- ADR-005: Module Federation for Plugin UI (architecture foundation)
- ADR-014: Hybrid UI Delivery Model (MinIO for production assets)
