# ADR-009: TailwindCSS v4 Semantic Tokens

**Date**: 2026-02-11  
**Status**: Accepted  
**Deciders**: Design System Team  
**Context**: Design system theming strategy for multi-tenant, multi-app frontend

## Context and Problem Statement

Plexica has multiple frontend apps (web, super-admin, plugin template) and supports per-tenant theming (custom colors, fonts, branding). TailwindCSS v3's config-based approach was becoming unwieldy as the design system grew, and runtime theme switching required rebuilds. We need a theming approach that supports runtime customization without rebuilds.

## Decision Drivers

- Runtime theme switching without application rebuild
- Per-tenant color customization (brand colors)
- Dark mode support
- Consistent design language across all apps and plugins
- Smaller Tailwind configuration files
- CSS cascade for easy overrides

## Considered Options

1. **TailwindCSS v4 with CSS custom properties for semantic tokens** (chosen)
2. **TailwindCSS v3 config-based approach** (status quo)
3. **Styled Components / CSS-in-JS**
4. **Custom CSS-in-JS solution**

## Decision Outcome

**Chosen option**: Migrate to TailwindCSS v4 with CSS custom properties for semantic tokens — enables runtime theme switching, per-tenant customization, and dark mode support without application rebuilds.

### Positive Consequences

- Runtime theme customization (swap CSS variables, no rebuild)
- Single source of truth for design tokens
- CSS cascade advantage for tenant-specific overrides
- Better dark mode support (CSS variable swap)
- Smaller Tailwind config files (tokens in CSS, not JS config)
- Consistent theming across web, super-admin, and plugin frontends

### Negative Consequences

- Migration work from TailwindCSS v3 to v4
- Requires CSS knowledge alongside Tailwind utility classes
- Slightly higher CSS payload (custom property definitions)

## Implementation Notes

- Semantic tokens defined as CSS custom properties (`--color-primary`, `--color-surface`, etc.)
- Tenant theme stored in database as JSON, injected as CSS variables at runtime
- Design system: `packages/ui` with 31+ components using semantic tokens
- Storybook foundation stories demonstrate color, typography, spacing, icons
- Completed as part of Frontend Consolidation Phase B (February 2026)
- Per Constitution Article 1.3: WCAG 2.1 AA compliance in all theme variants

## Related Decisions

- ADR-008: Playwright for E2E Testing (validates themed UI rendering)
- ADR-004: Module Federation (plugins inherit theme from host)
- ADR-010: @plexica/types Shared Package (theme type definitions)
- Constitution Article 1.3: User experience standards (accessibility)

## References

- Source: `planning/DECISIONS.md` (ADR-009)
- `docs/ARCHITECTURE.md`: Frontend architecture and theming
- `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 8.6: Theming
- [TailwindCSS v4 Documentation](https://tailwindcss.com/docs)
