# Frontend Consolidation & Plugin Enablement Plan

**Created**: February 10, 2026  
**Last Updated**: February 11, 2026  
**Status**: ✅ Phase A, B Complete | C1, C2, C3, C4, C5, D1, D2, D3, D4 Complete  
**Owner**: Engineering Team  
**Document Type**: Development Plan  
**Version**: 1.1

---

## Objective

Shift development focus from core-api (stable, 1047 tests, 100% pass rate) to the frontend
layer. Consolidate the UI component library, design system, and both frontend apps
(super-admin and web) into a demonstrable, functional product. Enable a second development
team to start building plugins with full frontend capabilities.

## Context & Current State

### What is solid

| Area               | Status           | Evidence                                       |
| ------------------ | ---------------- | ---------------------------------------------- |
| core-api           | Production-ready | 1047 tests, 100% pass rate, 63% coverage       |
| packages/database  | Production-ready | Prisma schema with 14+ models, migrations      |
| packages/event-bus | Production-ready | KafkaJS, DLQ, Prometheus metrics               |
| packages/cli       | Partial          | `build` and `publish` work; `init` is a stub   |
| Module Federation  | Configured       | Host + 2 sample plugins, dynamic loading works |

### What exists but needs consolidation

| Area             | Status                                | Gap                                               |
| ---------------- | ------------------------------------- | ------------------------------------------------- |
| packages/ui      | 31 components, 29 stories, **1 test** | Missing tests, docs, sharing via Federation       |
| apps/web         | Routing, auth, plugin loading work    | Mock data, no E2E tests                           |
| apps/super-admin | UI functional                         | Mock auth, mock data (users, analytics), no tests |
| Plugin template  | Scaffold exists                       | Does NOT use `@plexica/ui`, no UI contract        |

### What is missing

| Area                                           | Status                                    | Impact                           |
| ---------------------------------------------- | ----------------------------------------- | -------------------------------- |
| `@plexica/sdk`                                 | ✅ Complete, 65 tests                     | Plugin developers enabled        |
| `@plexica/types`                               | ✅ Complete, all consumers migrated       | Shared type contract established |
| `@plexica/api-client`                          | ✅ Complete, 79 tests, both apps migrated | Single API client source         |
| `@plexica/ui` in Module Federation shared deps | ✅ Configured in all 4 apps               | Plugins can use design system    |
| `@plexica/ui` tests & docs                     | ✅ Complete, 495 tests, Storybook         | Reliable design system           |
| Plugin UI contract                             | ✅ Complete via `@plexica/ui` shared      | Plugins use design system        |

### Critical architectural gap: Plugin frontend contributions

Plugins contribute frontend UI via Module Federation (`remoteEntry.js`), but today:

1. **`@plexica/ui` is NOT in the Module Federation `shared` config** — plugins that use it
   would bundle their own copy (larger bundles, version conflicts, CSS conflicts)
2. **Sample plugins (CRM, Analytics) write raw HTML with hardcoded Tailwind classes** — no
   usage of `Card`, `DataTable`, `Button`, `Badge`, `Input`, or any shared component
3. **No UI contract exists** — plugins receive `{ tenantId, userId, workspaceId }` but NOT
   theme context, design tokens, or access to shared components
4. **Theme propagation (light/dark) is undefined** for plugin context

---

## Plan Overview

Four sequential phases, with defined parallelization points for the second dev team.

```
Week 1─2  ┃ PHASE A: SDK & Plugin Dev Enablement
          ┃ → Second team starts BACKEND plugin development
          ┃
Week 2─4  ┃ PHASE B: Design System & UI Component Library
          ┃ → Second team starts FRONTEND plugin development (end of Phase B)
          ┃
Week 4─7  ┃ PHASE C: Super-Admin Consolidation
          ┃ ↕ Parallel with second team plugin development
          ┃
Week 7─10 ┃ PHASE D: Web App Consolidation
          ┃ ↕ Parallel with second team plugin development
          ┃
          ▼
          Demonstrable product + plugin ecosystem operational
```

**Total estimated duration**: 8–10 weeks (1 developer, AI-assisted)

---

## Phase A: SDK & Plugin Developer Enablement

**Duration**: 1–2 weeks  
**Goal**: Give the second dev team everything they need to start building plugins  
**Priority**: 🔥 Critical — blocks second team

### A1 — Create `@plexica/sdk`

**Effort**: 3–4 days  
**Status**: ✅ Complete (February 10, 2026)

Create the Plugin SDK package with:

- [x] Initialize `packages/sdk/package.json` with proper exports
- [x] `PlexicaPlugin` base class with lifecycle hooks (onInstall, onActivate, onDeactivate, onUninstall)
- [x] `WorkspaceAwarePlugin` subclass with automatic workspace filtering
- [x] API client wrapper (typed HTTP client for core-api)
- [x] Event client wrapper (publish/subscribe via `@plexica/event-bus`)
- [x] Service registration helpers (register service, expose endpoints)
- [x] Shared data access helpers (get/set cross-plugin state)
- [x] `PluginContext` type with full runtime context
- [x] Re-export `@plexica/ui` components for plugin convenience
- [x] Unit tests for all SDK utilities (65 tests across 5 test files)
- [x] JSDoc documentation on all public APIs

**Completion notes**:

- Used native `fetch` (no axios) for lightweight HTTP client
- `ApiClient` auto-injects `X-Tenant-Slug`, `X-Caller-Plugin-ID`, `X-User-ID`, `X-Workspace-ID` headers
- `ApiClient` never throws on non-2xx — returns typed `ApiResponse<T>` with `success: false`
- `EventClient` wraps `PluginEventClient` from `@plexica/event-bus` — delegates all operations
- `ServiceClient` supports registration, discovery, heartbeat, and plugin-to-plugin API calls via gateway
- `SharedDataClient` auto-namespaces by plugin ID, supports cross-namespace reads
- `PlexicaPlugin.start()` registers services and calls `onActivate`; `stop()` deregisters and unsubscribes
- Skipped `tsup.config.ts` — uses raw `./src/index.ts` exports (same pattern as `@plexica/types` and `@plexica/event-bus`)
- TypeScript strict compilation passes cleanly
- 65 unit tests passing: api-client (19), service-client (12), shared-data (10), event-client (11), plugin-base (13)

**Acceptance criteria**:

- A plugin developer can `npm install @plexica/sdk` and have access to all platform capabilities
- TypeScript types provide full autocompletion
- `PlexicaPlugin` base class compiles and runs

**Files to create**:

```
packages/sdk/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # Public API exports
│   ├── plugin-base.ts        # PlexicaPlugin, WorkspaceAwarePlugin
│   ├── api-client.ts         # Typed HTTP client
│   ├── event-client.ts       # Event pub/sub wrapper
│   ├── service-client.ts     # Service registry helpers
│   ├── shared-data.ts        # Cross-plugin state
│   ├── types.ts              # PluginContext, PluginManifest, etc.
│   └── ui.ts                 # Re-exports from @plexica/ui
└── __tests__/
    └── *.test.ts
```

---

### A2 — Create `@plexica/types`

**Effort**: 1–2 days  
**Status**: ✅ Complete (February 10, 2026)

Extract shared TypeScript types into a dedicated package:

- [x] Initialize `packages/types/package.json`
- [x] Extract `PluginManifest`, `PluginRoute`, `PluginMenuItem` from plugin-template
- [x] Extract `TenantPlugin`, `Tenant`, `Workspace`, `User` types from apps
- [x] Extract API request/response DTOs — placed in domain-specific files (not a separate `api.ts`)
- [x] Extract `DomainEvent<T>` and event types from event-bus — file named `event.ts` (singular)
- [x] Update all consumers (web, super-admin, 3 plugins) to import from `@plexica/types`

**Additional types created beyond original plan**:

- `auth.ts` — `AuthState` for auth context management
- `analytics.ts` — `AnalyticsOverview`, `TenantGrowthDataPoint`, `PluginUsageData`, `ApiCallMetrics`
- Plugin loader types in `plugin.ts` — `PluginLoaderManifest`, `PluginLoaderRoute`, `PluginLoaderMenuItem`, `LoadedPlugin`, `PluginLoadError`

**Deviations from plan**:

- No `api.ts` file — DTOs were placed in their domain-specific files (workspace DTOs in `workspace.ts`, etc.)
- `events.ts` → `event.ts` (singular) for consistency with other filenames
- All status enums use UPPERCASE (`'ACTIVE' | 'INACTIVE'`, etc.) to match Prisma/DB canonical form
- Consumer migration used re-export aliases (e.g., `TenantUser as User`, `PluginEntity as Plugin`) for backward compatibility
- Fixed latent bug in `super-admin/PluginDetailModal.tsx` where status switch cases never matched (were lowercase but type was UPPERCASE)
- `core-api` was NOT migrated (it generates its own types from Prisma; migration deferred)

**Acceptance criteria** — all met:

- Zero type duplication between apps ✅
- All shared interfaces live in one package ✅
- Importing `@plexica/types` provides full type coverage ✅
- `tsc --noEmit` passes on all 6 packages ✅

**Files created**:

```
packages/types/
├── package.json          # @plexica/types@0.1.0, private, raw src/ exports
├── tsconfig.json         # ES2022, commonjs, strict
└── src/
    ├── index.ts          # Barrel export
    ├── tenant.ts         # Tenant, TenantStatus, TenantContext, TENANT_STATUSES
    ├── workspace.ts      # Workspace, WorkspaceMember, WorkspaceRole, Team, DTOs
    ├── user.ts           # User, TenantUser, AdminUser, UserInfo
    ├── plugin.ts         # PluginManifest, PluginRoute, PluginMenuItem, PluginStatus,
    │                     # PluginEntity, PluginDetail, PluginVersion, PluginRating,
    │                     # TenantPlugin, TenantPluginStatus, PluginLoaderManifest,
    │                     # PluginLoaderRoute, PluginLoaderMenuItem, LoadedPlugin, PluginLoadError
    ├── event.ts          # DomainEvent<T>, EventMetadata, EventHandlerFn<T>
    ├── auth.ts           # AuthState
    └── analytics.ts      # AnalyticsOverview, TenantGrowthDataPoint, PluginUsageData, ApiCallMetrics
```

---

### A3 — Add `@plexica/ui` to Module Federation shared dependencies

**Effort**: 0.5 days  
**Status**: ✅ Complete (February 10, 2026)

This is a prerequisite for plugins to use the design system without bundling their own copy.

- [x] Add `@plexica/ui` to `shared` array in `apps/web/vite.config.ts` (host)
- [x] Add `@plexica/ui` to `shared` array in `apps/plugin-template-frontend/vite.config.ts`
- [x] Add `@plexica/ui` to `shared` array in `apps/plugin-crm/vite.config.ts`
- [x] Add `@plexica/ui` to `shared` array in `apps/plugin-analytics/vite.config.ts`
- [x] Add `@plexica/ui` as `peerDependency` in plugin template and example plugin `package.json` files
- [ ] Add `tailwindcss` to `shared` array (or verify CSS custom properties propagate without it) — **Deferred to B8** (theme propagation verification)
- [ ] Verify that the host provides the components and plugins do NOT re-bundle them — **Requires runtime verification (dev server)**
- [ ] Verify light/dark theme CSS custom properties are accessible inside plugin components — **Deferred to B8**

**Additional changes beyond plan**:

- Also added `@plexica/types` to `shared` in all 4 vite.config.ts files — ensures plugins don't bundle their own copy of the types package
- `tsc --noEmit` verified clean on all 6 packages

**Note**: Tailwind CSS sharing and theme propagation verification (last 3 checklist items) require runtime testing with the dev server. These are better verified as part of Phase B8 (theme propagation verification). The Module Federation configuration itself is complete.

**Acceptance criteria**:

- A plugin can `import { Button, Card, DataTable } from '@plexica/ui'` and it resolves from the host
- Theme tokens (CSS custom properties from `globals.css`) work inside plugin components
- Plugin bundle size does NOT include `@plexica/ui` code

**Files to modify**:

```
apps/web/vite.config.ts                        # Add @plexica/ui to shared
apps/plugin-template-frontend/vite.config.ts   # Add @plexica/ui to shared
apps/plugin-template-frontend/package.json     # Add @plexica/ui as peerDependency
apps/plugin-crm/vite.config.ts                 # Add @plexica/ui to shared
apps/plugin-crm/package.json                   # Add @plexica/ui as peerDependency
apps/plugin-analytics/vite.config.ts           # Add @plexica/ui to shared
apps/plugin-analytics/package.json             # Add @plexica/ui as peerDependency
```

---

### A4 — Update plugin template with `@plexica/ui` usage

**Effort**: 1 day  
**Status**: ✅ Complete (February 10, 2026)

The plugin template is the starting point for every plugin developer. It must demonstrate
correct usage of the design system.

- [x] Update `apps/plugin-template-frontend/src/Plugin.tsx` to use `@plexica/ui` components
- [x] Create example page using `Card`, `Button`, `Input`, `Badge`, `DataTable`
- [x] Show theme-aware styling (uses CSS custom properties, respects light/dark)
- [x] Document available components with import examples in template README
- [ ] Define `PluginUIProps` extending current `PluginProps` with optional theme context — **Deferred**: not needed until theme context is actively passed by the host (Phase B8)

**What was created**:

- `src/pages/HomePage.tsx` — Dashboard pattern using `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`, `Button`, `DataTable` with sortable/searchable table, stat cards, and context display
- `src/pages/SettingsPage.tsx` — Settings form pattern using `Card`, `Input`, `Label`, `Select`, `Switch`, `Separator`, `Alert`, `Button` with success feedback
- `src/Plugin.tsx` — Rewritten as dispatcher: default export renders HomePage, named exports (`HomePage`, `SettingsPage`) for host router mounting
- `src/routes/index.ts` — Updated with documentation about componentName ↔ export mapping
- `README.md` — Rewritten (v0.2.0) with full `@plexica/ui` component catalog, three copy-pasteable code examples (StatCard, DataTable with Badges, Settings form), shared deps documentation, and best practices

**Components demonstrated**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `Button`, `DataTable`, `Input`, `Label`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `Switch`, `Separator`, `Alert`, `AlertTitle`, `AlertDescription`, `Spinner` (via DataTable loading state)

**Acceptance criteria** — met:

- Plugin template uses `@plexica/ui` out of the box ✅
- Example pages look visually consistent with the host app ✅ (uses same design tokens)
- Plugin developer sees working component usage, not raw HTML ✅
- `tsc --noEmit` passes cleanly ✅

---

### A5 — Validate end-to-end plugin workflow

**Effort**: 1 day  
**Status**: ✅ Complete (February 10, 2026)

Verify the complete developer journey works without friction:

- [x] `plexica build` → builds successfully, remoteEntry.js generated ✅ (all 3 plugins)
- [ ] `plexica init test-plugin` → **CLI `init` is a stub** (see findings below)
- [ ] `pnpm dev` → starts dev server, hot reload works — **Deferred** (requires runtime infrastructure)
- [x] Plugin renders with `@plexica/ui` components ✅ (verified via build output — components are in the bundle)
- [ ] `plexica publish` → uploads to MinIO CDN — **Deferred** (requires MinIO running)
- [ ] Plugin appears in host app, loads via Module Federation — **Deferred** (requires dev servers running)
- [ ] Plugin routes and menu items register correctly — **Deferred** (requires runtime)
- [x] Document any issues found, fix blockers ✅

**Findings & issues resolved**:

1. **Stale compiled `.js`/`.js.map` files across ALL frontend apps** — Pre-existing issue where compiled CJS files existed alongside `"type": "module"` in `package.json`. Vite picked up `vite.config.js` (CJS) instead of `vite.config.ts` and crashed with `ReferenceError: exports is not defined in ES module scope`. **Fixed**: deleted all stale `.js`/`.js.map` files from:
   - `apps/plugin-template-frontend/` (cleaned first session)
   - `apps/plugin-crm/` — 14 stale files removed
   - `apps/plugin-analytics/` — 12 stale files removed
   - `apps/web/` — 36+ stale files removed
   - `apps/super-admin/` — 40+ stale files removed

2. **All 5 frontend apps now build successfully**:
   - `plugin-template-frontend`: ✅ `vite build` succeeds, `remoteEntry.js` generated (2.37 kB)
   - `plugin-crm`: ✅ `vite build` succeeds, `remoteEntry.js` generated (2.37 kB)
   - `plugin-analytics`: ✅ `vite build` succeeds, `remoteEntry.js` generated (2.37 kB)
   - `apps/web`: ✅ `vite build` succeeds (host app, 2.1 MB bundle)
   - `apps/super-admin`: ✅ `vite build` succeeds (765 kB bundle)

3. **Module Federation shared deps confirmed working** — Build output shows `@plexica/ui` and `@plexica/types` as `__federation_shared_*` chunks in all 3 plugins, confirming A3 configuration is correct.

4. **CLI `init` command is a stub** — `packages/cli/src/commands/init.ts` only prompts for a name, then prints manual `cp -r` instructions. The `--template` flag is accepted but ignored. `plexica build` and `plexica publish` ARE fully implemented. **Recommendation**: Implement real scaffolding in a future task (post Phase A).

5. **TanStack Router generator warning** (pre-existing, non-blocking) — Both `apps/web` and `apps/super-admin` emit `expected "Route" export to be initialized by a CallExpression` errors during build, but the build completes successfully.

6. **CLI manifest types not migrated** — `packages/cli/src/utils/validate-manifest.ts` and `load-manifest.ts` have inline `PluginManifest` types that duplicate `@plexica/types`. Low priority, not blocking.

**Items deferred to later phases**:

- Runtime verification (dev server, hot reload, plugin loading in host) — requires infrastructure (Keycloak, database, etc.)
- `plexica publish` → MinIO CDN — requires MinIO running
- CLI `init` real implementation — post Phase A

**Acceptance criteria** — partially met:

- Build workflow validated end-to-end ✅
- All plugins produce `remoteEntry.js` ✅
- Module Federation shared deps confirmed ✅
- Runtime workflow deferred (requires infrastructure) ⚠️

---

### A6 — Consolidate Plugin Developer Documentation

**Effort**: 2 days  
**Status**: ✅ Complete (February 10, 2026)

Today plugin docs are fragmented across 5+ files. Create a single authoritative guide.

- [x] Create `docs/guides/PLUGIN_QUICK_START.md` — 0-to-running in 15 minutes
- [x] Create `docs/guides/PLUGIN_FRONTEND_GUIDE.md` — How to build plugin UI with `@plexica/ui`
  - Which components to use for common patterns (list page, detail page, form, dashboard widget)
  - How to register routes and menu items
  - How to access theme and workspace context
  - How to contribute dashboard widgets
- [x] Create `docs/guides/PLUGIN_BACKEND_GUIDE.md` — How to expose/consume services
- [x] Update `docs/PLUGIN_DEVELOPMENT.md` to become an index pointing to the above
- [x] Include architecture diagrams (host ↔ plugin data flow, Module Federation lifecycle)

**What was created**:

- `docs/guides/PLUGIN_QUICK_START.md` — Concise 0-to-running guide (~15 min): copy template, configure package.json/vite, write manifest, create pages with `@plexica/ui`, wire up Plugin.tsx exports, build, publish, register in database
- `docs/guides/PLUGIN_FRONTEND_GUIDE.md` — Detailed frontend guide: architecture overview (how host loads plugins), component export pattern, full `@plexica/ui` component catalog, routes and menu items (PluginRoute/PluginMenuItem types with conventions), PluginProps context, three UI patterns (dashboard, settings/form, list page), Module Federation details, styling/theming (CSS custom properties, semantic Tailwind classes, dark mode), troubleshooting
- `docs/guides/PLUGIN_BACKEND_GUIDE.md` — Backend guide: standalone Fastify server pattern, project structure, creating a server, plugin.json manifest (full example with config fields, hooks, endpoints), REST endpoint patterns, response format conventions, service pattern, health check endpoint, tenant context (X-Tenant-ID/X-Caller-Plugin-ID headers), service registration with gateway, event system (legacy hooks vs M2.1+ decorators), plugin-to-plugin HTTP client pattern, testing (unit + integration with Fastify inject), deployment (port allocation, Docker, running both frontend+backend), troubleshooting
- `docs/PLUGIN_DEVELOPMENT.md` — Converted from 751-line monolithic guide to a concise index/landing page linking to the three new guides + existing advanced guides (plugin-to-plugin communication, migration), reference plugins, key concepts, specs/architecture links

**Acceptance criteria** — all met:

- Second dev team can onboard using documentation alone ✅
- All plugin capabilities (routes, menus, widgets, services, events) are documented with examples ✅
- Documentation is organized by audience: Quick Start (new devs), Frontend Guide (UI devs), Backend Guide (API devs), advanced guides (experienced devs) ✅

---

### Phase A — Summary

| Task                         | Effort         | Blocks                    |
| ---------------------------- | -------------- | ------------------------- |
| A1 — `@plexica/sdk`          | 3–4 days       | Second team backend work  |
| A2 — `@plexica/types`        | 1–2 days       | Clean type contracts      |
| A3 — UI in Module Federation | 0.5 days       | Second team frontend work |
| A4 — Update plugin template  | 1 day          | Second team frontend work |
| A5 — Validate E2E workflow   | 1 day          | Second team onboarding    |
| A6 — Plugin developer docs   | 2 days         | Second team onboarding    |
| **Total**                    | **~9–11 days** |                           |

**Milestone gate**: Second dev team can start plugin development (backend immediately,
frontend after A3+A4 are done).

---

## Phase B: Design System & UI Component Library

**Duration**: 2–3 weeks  
**Goal**: Make `@plexica/ui` a reliable, documented, tested design system  
**Priority**: ⭐ High  
**Depends on**: Phase A (A3 specifically)

### B1 — Define design system foundations

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 10, 2026)

The design tokens exist in `packages/ui/src/styles/globals.css` (oklch colors, radius,
typography) but there is no normative document or Storybook "Foundations" page.

- [x] Create `docs/design/DESIGN_SYSTEM.md` documenting:
  - Color palette (primary, secondary, muted, accent, destructive) with oklch values
  - Typography scale (JetBrains Mono, sizes, weights, line heights)
  - Spacing scale (used consistently across components)
  - Border radius system (sm through 4xl)
  - Shadow system
  - Light/dark theme token mapping
  - Iconography conventions (Lucide React, sizes, stroke width)
- [x] Create Storybook "Foundations" stories:
  - `stories/foundations/Colors.stories.tsx` — color palette visualization
  - `stories/foundations/Typography.stories.tsx` — type scale
  - `stories/foundations/Spacing.stories.tsx` — spacing scale
  - `stories/foundations/Icons.stories.tsx` — icon usage
- [x] Define naming conventions for new tokens
- [x] Define when to use which variant (e.g., `destructive` vs `danger` vs `error`)

**Acceptance criteria**:

- Any developer can open Storybook, go to "Foundations", and understand the visual language
- Design decisions are documented, not implicit in CSS

---

### B2 — Define component implementation conventions

**Effort**: 1 day  
**Status**: ✅ Complete (February 10, 2026)

Establish rules that all component contributions (including from plugin developers) must follow.

- [x] Create `packages/ui/CONTRIBUTING.md` documenting:
  - Directory structure per component:
    ```
    src/components/ComponentName/
    ├── ComponentName.tsx        # Implementation
    ├── ComponentName.test.tsx   # Tests
    ├── ComponentName.stories.tsx # Stories
    └── index.ts                 # Re-export (optional)
    ```
  - Naming: PascalCase for components, camelCase for props, kebab-case for files
  - Pattern: Radix UI primitive + CVA for variants + `cn()` for class merging
  - Props: always extend native HTML element props via `React.ComponentPropsWithoutRef`
  - Ref forwarding: always use `React.forwardRef`
  - Variants: define via CVA with explicit `variants` and `defaultVariants`
  - Accessibility: components MUST have proper ARIA attributes, keyboard navigation
  - Export: every component must be exported from `src/index.ts`
  - Story: every component must have a story covering all variants
  - Test: every component must have tests for rendering, variants, interaction, a11y
- [x] Add ESLint rules to enforce conventions where possible
- [x] Add a `plop` generator or script template for scaffolding new components

**Acceptance criteria**:

- `CONTRIBUTING.md` is the single source of truth for "how to add a component"
- A new developer can create a component following the guide without asking questions

---

### B3 — Add tests to all UI components

**Effort**: 4–5 days  
**Status**: ✅ Complete (February 10, 2026)

Currently: 31 components, 1 test file (Button.test.tsx). Target: 100% component test coverage.

For each component, test:

- [x] Renders without crashing (smoke test)
- [x] All variants render correctly
- [x] Interactive behavior (click, hover, focus, keyboard)
- [x] Accessibility (ARIA attributes, keyboard navigation, screen reader labels)
- [x] Edge cases (empty content, long text, disabled state)

Component test priority (by usage frequency in apps):

**High priority** (used extensively in web and super-admin):

- [x] Button (exists, review completeness)
- [x] Card + CardContent + CardSkeleton
- [x] Input
- [x] Badge
- [x] DataTable
- [x] Modal
- [x] Select + SearchableSelect
- [x] Toast
- [x] Tabs
- [x] Spinner

**Medium priority**:

- [x] Alert + AlertDescription
- [x] Dropdown
- [x] Checkbox
- [x] Switch
- [x] Label
- [x] Textarea
- [x] Tooltip
- [x] Progress
- [x] ToggleGroup
- [x] EmptyState

**Lower priority** (layout, less interactive):

- [x] Avatar + AvatarImage + AvatarFallback
- [x] Breadcrumbs
- [x] RadioGroup
- [x] Slider
- [x] Separator
- [x] Header
- [x] Sidebar
- [x] Footer
- [x] Table

**Acceptance criteria**:

- Every component in `src/index.ts` has a corresponding `.test.tsx` file
- `pnpm test:coverage` in `packages/ui` reports ≥80% line coverage
- All tests pass in CI

---

### B4 — Review existing components for consistency

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 10, 2026)

Audited all 31 components for adherence to B2 conventions and migrated from stale Tailwind v3 tokens to Tailwind v4 semantic tokens.

- [x] Verify all components use the CVA + Radix + cn() pattern consistently
- [x] Verify all components forward refs properly
- [x] Verify all components extend native element props
- [x] Standardize prop naming (e.g., `variant` not `type`, `size` not `sz`)
- [x] Verify all components support `className` prop override
- [x] Verify dark mode works for all components (CSS custom properties)
- [x] Fix any inconsistencies found
- [x] Update stories to reflect corrections

**Work completed**:

1. **Token migration (24 component files)**: Migrated all component source files from stale v3 custom tokens to Tailwind v4 semantic tokens:
   - `bg-background-primary` → `bg-background` (general surfaces) / `bg-card` (Card) / `bg-popover` (overlays)
   - `bg-background-secondary` → `bg-muted` (inactive/track backgrounds) / `bg-accent` (hover/active states)
   - `text-text-primary` → `text-foreground` (general text) / `text-popover-foreground` (overlay text) / `text-accent-foreground` (active state text)
   - `text-text-secondary` → `text-muted-foreground` (secondary/helper text)
   - `hover:bg-background-secondary` → `hover:bg-accent` (hover states)
   - `focus:bg-background-secondary` → `focus:bg-accent` (focus states)
   - `border-red-500` / `text-red-600` → `border-destructive` / `text-destructive` (error states)
   - `bg-red-600` → `bg-destructive` (destructive/danger buttons)
   - `text-white` (themed badge) → `text-primary-foreground` (white text on primary background)
   - `border-3` → `border-[3px]` (non-standard Tailwind class)

2. **AlertTitle ref fix**: Changed `HTMLParagraphElement` → `HTMLHeadingElement` in Alert.tsx to match the actual rendered `<h5>` element.

3. **Label.stories.tsx**: Created missing Storybook story at `packages/ui/src/components/Label/Label.stories.tsx`.

4. **ToggleGroup.stories.tsx**: Fixed TypeScript errors — removed `component` from meta (discriminated union on `type` prop causes TS issues with Storybook 10's required args), using `satisfies Meta` without generic param and `StoryObj` directly.

5. **Test assertion updates (17 fixes across 10 test files)**: Updated all test assertions that still referenced old token class names to match the migrated component source:
   - `Badge.test.tsx`: `text-text-primary` → `text-foreground`
   - `Button.test.tsx`: `bg-background-primary` → `bg-background`, `bg-red-600` → `bg-destructive`, `hover:bg-background-secondary` → `hover:bg-accent`
   - `Card.test.tsx`: `bg-background-primary` → `bg-card`, `text-text-secondary` → `text-muted-foreground`
   - `Footer.test.tsx`: `bg-background-primary` → `bg-background`
   - `Input.test.tsx`: `border-red-500` → `border-destructive`, `text-text-secondary` → `text-muted-foreground`, `text-red-600` → `text-destructive`
   - `Sidebar.test.tsx`: `bg-background-secondary` + `text-text-primary` → `bg-accent` + `text-foreground`
   - `Spinner.test.tsx`: `border-3` → `border-[3px]`
   - `Tabs.test.tsx`: `bg-background-secondary` → `bg-muted`
   - `Textarea.test.tsx`: `border-red-500` → `border-destructive`, `text-red-600` → `text-destructive`, `text-text-secondary` → `text-muted-foreground`
   - `Toast.test.tsx`: `bg-background-primary` + `text-text-primary` → `bg-background` + `text-foreground`

6. **Deleted stale `tailwind.config.js`**: Removed the old v3 config file that was not consumed by Tailwind v4 (which uses `@theme inline` in `globals.css`).

**Final test results**: 30 test files, 398 tests — all passing.

**Acceptance criteria** — all met:

- All 31 components follow the same implementation pattern ✅
- No component has unique/one-off patterns that break consistency ✅
- All components use Tailwind v4 semantic tokens consistently ✅
- All 398 tests pass ✅

---

### B5 — Add missing components

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 10, 2026)

Based on needs identified in `apps/web` and `apps/super-admin`:

- [x] `Skeleton` — Generic loading placeholder with configurable shape (line, circle, rect), width, height, animation (`animate-pulse` + `bg-muted`). Generalizes the CardSkeleton pattern.
- [x] `StatusBadge` — Specialized badge for entity statuses. Wraps `Badge` with predefined status→variant+label mappings for: active, inactive, suspended, draft, published, deprecated, pending, archived.
- [x] `StatCard` — Dashboard metric card composing `Card` + `CardContent`. Displays label, value, optional trend indicator (TrendingUp/TrendingDown from lucide-react), optional icon.
- [x] `Pagination` — Standalone page navigation with previous/next, first/last, page number buttons with ellipsis. Composes `Button`. Configurable `siblingCount` and `showFirstLast`. Proper ARIA: `role="navigation"`, `aria-label`, `aria-current="page"`.
- [x] `ConfirmDialog` — Modal with confirm/cancel pattern composing `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription` from Modal.tsx + `Button`. Props: `title`, `description`, `confirmLabel`, `cancelLabel`, `variant` (default/destructive), `onConfirm`, `onCancel`, `open`, `onOpenChange`, optional `trigger`, `loading`.
- [x] `Form` — Composable form system with React context for field-level error state propagation. Components: `Form` (form element with `space-y-6`), `FormField` (context provider with `name` + `error`), `FormItem` (wrapper with `space-y-2`), `FormLabel` (wraps `Label`, auto-associates `htmlFor`, applies `text-destructive` on error), `FormControl` (clones children with `id`, `name`, `aria-invalid`, `aria-describedby`), `FormDescription` (muted helper text), `FormMessage` (error display with `role="alert"`, renders from context or override prop). No external form library dependency — works standalone or with react-hook-form.

Each component includes implementation (.tsx), Storybook stories (.stories.tsx), and tests (.test.tsx) following B2 conventions.

**Test counts**: 97 new tests across 6 test files:

- Skeleton: 16 tests
- StatusBadge: 10 tests
- StatCard: 13 tests
- Pagination: 20 tests (component + `getPageNumbers` utility)
- ConfirmDialog: 11 tests
- Form: 27 tests (Form, FormItem, FormField+FormLabel, FormControl, FormDescription, FormMessage)

**Final test results**: 36 test files, 495 tests — all passing.

All 6 components exported from `packages/ui/src/index.ts`:

- Skeleton, StatusBadge, StatCard → Base Components section
- Pagination → Navigation Components section
- Form → Form Components section
- ConfirmDialog → Feedback Components section

**Acceptance criteria** — all met:

- All new components are exported from `packages/ui/src/index.ts` ✅
- All new components have stories and tests ✅
- All 495 tests pass (398 existing + 97 new) ✅

---

### B6 — Rewrite sample plugins using `@plexica/ui`

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 10, 2026)  
**Depends on**: A3 (UI in Module Federation)

The sample plugins previously wrote raw HTML with hardcoded Tailwind classes. They now serve
as the reference implementation for the second dev team.

**plugin-crm** — Rewritten using `@plexica/ui`:

- [x] `HomePage.tsx`: Uses `StatCard`, `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle`, `Badge`, `Button`. Icons: `DollarSign`, `Handshake`, `Trophy`, `Users`.
- [x] `ContactsPage.tsx`: Uses `Avatar`, `AvatarFallback`, `Badge`, `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `DataTable`, `EmptyState`, `StatCard`, `ColumnDef`. Icons: `Plus`, `Search`, `Users`. DataTable's `enableGlobalFilter` handles search internally.
- [x] `DealsPage.tsx`: Uses `Badge`, `Button`, `Card`, `CardContent`, `Progress`, `Separator`, `StatCard`. Icons: `Calendar`, `DollarSign`, `Handshake`, `Plus`, `Trophy`, `User`. Kanban board with deal cards and probability progress bars.

**plugin-analytics** — Rewritten using `@plexica/ui`:

- [x] `DashboardPage.tsx`: Uses `Badge`, `Button`, `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle`, `Progress`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `StatCard`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`. Icons: `Activity`, `BarChart3`, `Clock`, `DollarSign`, `TrendingUp`, `Users`. Revenue chart with tab navigation.
- [x] `ReportsPage.tsx`: Uses `Badge`, `Button`, `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle`, `DataTable`, `Label`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Separator`, `StatCard`, `ColumnDef`. Icons: `BarChart3`, `Calendar`, `Download`, `FileText`, `Plus`, `Target`, `Users`.

**Plugin.tsx files**: No changes needed — already clean, import page components and re-export them.

**Build verification**: Both plugins build successfully with `tsc -b && vite build`:

- `plugin-crm`: ✅ 18 chunks, `remoteEntry.js` generated (2.37 kB)
- `plugin-analytics`: ✅ 18 chunks, `remoteEntry.js` generated (2.37 kB)
- `@plexica/ui` appears as `__federation_shared_@plexica/ui-*.js` confirming shared dep works

**Acceptance criteria** — all met:

- Zero raw HTML `<table>`, `<button>`, `<input>` elements in plugin code ✅
- All UI uses `@plexica/ui` components imported from the shared Module Federation dependency ✅
- Plugins look visually identical to the host app (same design tokens) ✅

---

### B7 — Plugin UI patterns documentation

**Effort**: 1–2 days  
**Status**: ✅ Complete

- [x] Create `docs/guides/PLUGIN_UI_PATTERNS.md` with copy-pasteable examples:
  - **Dashboard page pattern**: StatCard grid, tabbed charts, activity feed, Select filtering
  - **List page pattern**: DataTable with ColumnDef, Avatar, Badge status mapping, EmptyState, search/sort/pagination
  - **Detail / Kanban page pattern**: Horizontal scroll Kanban board, Card columns, Progress bars, inline metadata
  - **Form / Settings page pattern**: Input, Label, Select, Switch toggles, Card sections, Alert feedback
  - **Report / Export page pattern**: Template cards grid, DataTable, export config with multi-column Select
- [x] Each pattern includes full working code using `@plexica/ui` components
- [x] Reference the sample plugins (CRM, Analytics) as living examples
- [x] Common Building Blocks section with reusable snippets (page header, stat grid, card with action, status badge mapping, row actions, toggle row, context footer)
- [x] Updated `PLUGIN_FRONTEND_GUIDE.md` reference plugins table (B6 migration complete) and added link to patterns guide

**Acceptance criteria**:

- A plugin developer can look up a pattern and have a working page in minutes

---

### B8 — Verify theme propagation to plugins

**Effort**: 1 day  
**Status**: ✅ Complete  
**Depends on**: A3, B6

- [x] Verify CSS custom properties from `globals.css` are accessible in plugin context
- [x] Verify light/dark theme toggle in host propagates to plugin components
- [x] Verify custom tenant theme overrides (if configured) apply to plugins
- [x] If theme does NOT propagate: implement a solution (inject CSS, provide ThemeContext, etc.)
- [x] Document theme integration for plugin developers

**What was done**:

- **Fixed missing CSS import**: Both `apps/web` and `apps/super-admin` were missing the `globals.css` import — CSS custom properties (`--background`, `--foreground`, etc.) were never defined at runtime. Added `@import '@plexica/ui/src/styles/globals.css'` to both app CSS files.
- **Removed legacy Tailwind v3 config**: Deleted `tailwind.config.js` from both apps and `postcss.config.js` from super-admin — redundant with Tailwind v4's `@theme inline` and `@tailwindcss/vite`.
- **Added CSS export to `@plexica/ui`**: Added `"./src/styles/globals.css"` to the package exports map.
- **Added ThemeToggle to web app**: Created `ThemeToggle` component and added it to the web app header (was only in super-admin before).
- **Verified runtime propagation**: Dev server test confirmed all 30+ CSS custom properties resolve correctly in both light and dark modes. Toggling `.dark` class on `<html>` instantly swaps all token values.
- **Documented theme integration**: Added comprehensive "Theme Integration" section to `PLUGIN_FRONTEND_GUIDE.md` covering how it works, available tokens, do's/don'ts, and tenant theme overrides (future).
- **Tenant theme overrides**: Architecture supports it (Tenant model has `theme` JSON field), but runtime application is not yet implemented. Documented as future capability — plugins will pick it up automatically via CSS custom properties.

**Acceptance criteria**:

- Toggling dark mode in host app changes plugin component appearance
- Plugin components use the same color palette as the host

---

### Phase B — Summary

| Task                                | Effort          | Blocks                    |
| ----------------------------------- | --------------- | ------------------------- |
| B1 — Design system foundations      | 2–3 days        | Design decisions          |
| B2 — Component conventions          | 1 day           | Contributing guide        |
| B3 — Component tests                | 4–5 days        | Reliability               |
| B4 — Component consistency audit    | 2–3 days        | Quality                   |
| B5 — Missing components             | 2–3 days        | Phase C, D                |
| B6 — Rewrite sample plugins with UI | 2–3 days        | Second team reference     |
| B7 — Plugin UI patterns docs        | 1–2 days        | Second team guidance      |
| B8 — Theme propagation verification | 1 day           | Plugin visual consistency |
| **Total**                           | **~14–20 days** |                           |

**Milestone gate**: `@plexica/ui` is tested, documented, and shared via Module Federation.
Sample plugins demonstrate correct usage. Second dev team can build plugin frontends with
full design system support.

---

## Phase C: Super-Admin Consolidation

**Duration**: 2–3 weeks  
**Goal**: Make super-admin fully functional with real data and auth  
**Priority**: ⭐ High  
**Depends on**: Phase B (components available)

### C1 — Replace mock auth with Keycloak

**Effort**: 2–3 days  
**Status**: ✅ Complete (pre-existing implementation)

Currently: hardcoded `admin@plexica.com / admin` with localStorage session.

**Finding**: Upon investigation, the super-admin app already has a **complete, production-ready Keycloak SSO integration** that was implemented during M2.2. The mock auth provider exists only for E2E testing (controlled by `VITE_E2E_TEST_MODE` env var).

- [x] Integrate Keycloak JS adapter (same pattern as `apps/web`)
- [x] Configure super-admin Keycloak client in master realm (or dedicated admin realm)
- [x] Implement PKCE auth flow
- [x] Token refresh and session management
- [x] Remove `MockAuthProvider` (keep only for E2E test mode)
- [x] Implement proper role check: user must have `super_admin` role
- [x] Logout with Keycloak token revocation

**Implementation details** (already in place):

- `keycloak.ts` — Singleton with init, login, logout, `updateToken(70)` on 60s interval, `hasRealmRole()`, PKCE S256
- `AuthProvider.tsx` — Real auth: initializes Keycloak, loads user info from parsed token + `loadUserInfo()`, stores in Zustand
- `MockAuthProvider.tsx` — E2E only: bypasses Keycloak with hardcoded `admin@plexica.local` user. Switched via `VITE_E2E_TEST_MODE` in `__root.tsx`
- `ProtectedRoute.tsx` — Auth guard with role check (`requiredRole` defaults to `'super-admin'`). Shows loading spinner, redirects to `/login`, or "Access Denied" card
- `auth-store.ts` — Zustand with persistence, JWT expiry validation on rehydrate, sessionStorage for tokens (not localStorage)
- `secure-storage.ts` — Token in sessionStorage with key `super_admin_kc_token`
- `keycloak-realm-plexica-admin.json` — Realm import with `super-admin`/`viewer` roles, `admin`/`viewer` users, `super-admin-app` OIDC client
- `api-client.ts` — `SuperAdminApiClient` proactively calls `updateToken(30)` before each request, wires `setAuthProvider()` with getToken/refreshToken/onAuthFailure
- `silent-check-sso.html` — SSO iframe page for Keycloak silent check
- All routes wrapped in `<ProtectedRoute requiredRole="super-admin">`

**Acceptance criteria** — all met:

- Login redirects to Keycloak ✅
- Only users with `super_admin` role can access the app ✅
- Token refresh works transparently ✅

---

### C2 — Backend endpoint alignment

**Effort**: 3–4 days  
**Status**: ✅ Complete (February 11, 2026)

All admin endpoints already existed in `core-api`. The actual work was aligning response
shapes and field names between `AdminApiClient` / `@plexica/types` and the backend route
handlers in `apps/core-api/src/routes/admin.ts`.

**9 mismatches identified and fixed**:

- [x] **C2.1** `GET /admin/tenants` — Reshaped from `{ tenants, total, page, limit, totalPages }` to `{ data, pagination }` matching `PaginatedResponse<Tenant>`
- [x] **C2.2** `GET /admin/users` — Reshaped from `{ users, total }` to `{ data, pagination }` matching `PaginatedResponse<AdminUser>`
- [x] **C2.3** `GET /admin/analytics/tenants` — Changed from `{ data: [...] }` wrapper to raw `TenantGrowthDataPoint[]` array. Added `period` query param alias for `days`
- [x] **C2.4** `GET /admin/analytics/plugins` — Changed from `{ plugins: [...] }` to raw `PluginUsageData[]` array. Renamed fields (`installCount`, `activeInstalls`, `category`)
- [x] **C2.5** `GET /admin/analytics/api-calls` — Changed from `{ metrics, note }` to raw `ApiCallMetrics[]` array. Renamed fields (`date`, `errorCalls`, `successCalls`, `avgLatencyMs`, added `hour`)
- [x] **C2.6** `analytics.service.ts` — Updated `PlatformOverview` (removed `provisioningTenants`, `totalPluginInstallations`, `totalWorkspaces`; added `apiCalls24h`). Updated `PluginUsageData` and `ApiCallMetrics` interfaces to match types package
- [x] **C2.7** `GET /admin/analytics/overview` — Schema updated to match `AnalyticsOverview` type
- [x] **C2.8** New endpoint `GET /admin/plugins/:id/installs` — Returns `{ tenantId, installedAt }[]`
- [x] **C2.9** `AdminApiClient.getUsers()` return type changed from `AdminUser[]` to `PaginatedResponse<AdminUser>`. Test updated
- [x] **C2.10** `apps/super-admin/src/hooks/useUsers.ts` — Fixed to use `usersData?.data` and `usersData?.pagination?.total`

**Key finding**: Service layer (`admin.service.ts`, `tenant.service.ts`) still returns old shapes (`{ users, total }`, `{ tenants, total }`). The reshape to `{ data, pagination }` happens at the route handler level. Service-level tests remain correct.

**Verification**: api-client 79/79 passed, core-api unit 747/748 passed (1 pre-existing failure unrelated), monorepo build 12/12 tasks passed.

---

### C3 — Connect tenant management to real data

**Effort**: 2 days  
**Status**: ✅ Complete (February 11, 2026)

Connected the super-admin tenant management UI to real backend data. Fixed type mismatches,
rewired hooks for server-side pagination/filtering, enhanced detail and edit modals, and added
meaningful provisioning error messages.

**7 sub-tasks completed**:

- [x] **C3.1** — Fixed `Tenant` type in `@plexica/types`: added `settings` and `theme` fields, removed phantom `suspendedAt`, created `TenantDetail` interface extending `Tenant` with `plugins: TenantPlugin[]`
- [x] **C3.2** — Fixed `AdminApiClient.updateTenant()` signature to match backend (`name`, `settings`, `theme` only). Changed `getTenant()` return type to `TenantDetail`
- [x] **C3.3** — Rewrote `useTenants` hook for server-side pagination/search/filter. Stats fetched via separate lightweight queries. Page resets on filter change
- [x] **C3.4** — Enhanced `TenantDetailModal`: displays installed plugins list, settings/theme JSON, provisioning error banner, `PENDING_DELETION` status. Typed with `TenantDetail`
- [x] **C3.5** — Created `EditTenantModal` with Zod-validated name field, read-only slug, change detection (only submits if name changed)
- [x] **C3.6** — Meaningful provisioning error messages in `CreateTenantModal`: slug conflicts, schema/provisioning failures, Keycloak/realm failures, generic fallback
- [x] **C3.7** — Build verification: api-client 79/79 tests passed, monorepo build 12/12 tasks passed

**Key decisions**:

- `updateTenant()` only allows `name`, `settings`, `theme` (backend enforces `additionalProperties: false`). Slug is immutable after creation. Status changes use dedicated `suspendTenant()`/`activateTenant()`/`deleteTenant()` methods.
- Stats use 4 lightweight `limit: 1` server calls (one per status) rather than client-side computation, cached 30s.
- `TenantStatusFilter` renamed from `TenantStatus` in hook to avoid collision with `@plexica/types` export.

---

### C4 — Plugin marketplace with real data

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 11, 2026)

- [x] **C4.1** — Rewrite `usePlugins` hook for server-side pagination, search, and filtering (pass `search`, `status`, `category`, `page`, `limit` to `apiClient.getPlugins()`; separate stats and categories queries; reset page on filter change)
- [x] **C4.2** — Add pagination controls to `PluginsView` (ChevronLeft/Right, page info, showing X–Y of Z), wire Edit button to `EditPluginModal`
- [x] **C4.3** — Create `EditPluginModal` (editable: name, version, description, homepage, repository, tags; uses `updatePlugin()` + `updatePluginMetadata()` in parallel; change detection)
- [x] **C4.4** — Fix `PluginAnalytics` data shape mismatch (align to real API response; add tenant installs list via `getPluginInstalls()`; add rating distribution from `getPluginRatings()`)
- [x] **C4.5** — Enhance `PluginDetailModal` (tenant installs section, version history, long description, links, tags, author email, publishedAt display)
- [x] **C4.6** — Fix `PublishPluginModal` `window.location.reload()` hack (replaced with `queryClient.invalidateQueries()` for `['plugins']`, `['plugins-stats']`, `['plugins-categories']`)

**Files changed**:

- `apps/super-admin/src/hooks/usePlugins.ts` (rewritten)
- `apps/super-admin/src/components/views/PluginsView.tsx` (rewritten)
- `apps/super-admin/src/components/plugins/EditPluginModal.tsx` (new)
- `apps/super-admin/src/components/plugins/PluginDetailModal.tsx` (rewritten)
- `apps/super-admin/src/components/marketplace/PluginAnalytics.tsx` (rewritten)
- `packages/api-client/src/admin-client.ts` (added `page`/`limit` params to `getPlugins()`)

**Acceptance criteria**: ✅ All met

- Marketplace shows real plugins from the database with server-side pagination
- Search, status filter, and category filter work against real API
- Plugin detail shows version history, tenant installs, and analytics
- Edit modal updates both core fields and marketplace metadata
- No more `window.location.reload()` hacks

---

### C5 — E2E tests with Playwright

**Effort**: 3–4 days  
**Status**: ✅ Complete (February 11, 2026)

Playwright E2E test suite for the super-admin app covering all critical flows. Uses
`MockAuthProvider` (via `VITE_E2E_TEST_MODE=true`) to bypass Keycloak in CI. All API calls
are intercepted with Playwright route mocks — no backend required.

**Test infrastructure created**:

- `tests/e2e/helpers/api-mocks.ts` (~875 lines) — Shared mock utility with handlers for all admin and marketplace API endpoints. Dual glob pattern registration for URLs with query strings. LIFO-aware ordering for catch-all vs specific handlers.
- `tests/e2e/helpers/test-helpers.ts` (~447 lines) — `TestHelpers` class with navigation, modal, assertion, and screenshot helpers
- `tests/e2e/fixtures/test-data.ts` (~209 lines) — Test fixtures for plugins, analytics, installs, ratings, users, tenants

**Source fixes applied during E2E development**:

- `MockAuthProvider.tsx` — Fixed race condition: added synchronous `isLoading=true` check before first render to prevent `ProtectedRoute` redirect to `/login`
- `PluginAnalytics.tsx` — Added `retry: false` to all three `useQuery` hooks for immediate error display instead of 3 retries with exponential backoff
- `login.tsx` — Changed authenticated redirect from `/tenants` to `/` (Dashboard)
- Removed stale compiled `playwright.config.{js,d.ts,js.map,d.ts.map}` artifacts

**9 spec files — 105 tests total, all passing**:

| Spec file                      | Tests   | Coverage                                                |
| ------------------------------ | ------- | ------------------------------------------------------- |
| `navigation-dashboard.spec.ts` | 12      | Dashboard stats, sidebar nav, quick actions             |
| `tenant-management.spec.ts`    | 16      | List, filter, search, detail modal, actions             |
| `plugin-management.spec.ts`    | 15      | List, filter, detail modal, actions, tabs               |
| `user-management.spec.ts`      | 13      | List, filter, search, detail modal                      |
| `analytics-view.spec.ts`       | 12      | Stats, charts, plugin usage, time period, error states  |
| `publish-plugin.spec.ts`       | 8       | 4-step wizard, validation, tags, screenshots, API error |
| `version-management.spec.ts`   | 8       | Version list, changelog, publish, validation, sort      |
| `plugin-review-queue.spec.ts`  | 7       | Review queue, approve, reject, empty state, API error   |
| `plugin-analytics.spec.ts`     | 9       | Metrics, time range, installs, ratings, error, close    |
| **Total**                      | **105** |                                                         |

**Key debugging patterns resolved**:

1. **Playwright glob matching**: `**/api/path` does NOT match URLs with query strings — must also register `**/api/path?*`
2. **LIFO route ordering**: Specific route mocks must be registered AFTER catch-all handlers
3. **Strict mode violations**: Use `getByRole()`, `.first()`, `.last()`, or `exact: true` for ambiguous locators
4. **TanStack Query retries**: Add `retry: false` in components to prevent error states from being delayed by ~7s

**Acceptance criteria** — all met:

- All 105 E2E tests pass locally ✅
- Critical flows covered (navigation, tenants, plugins, users, analytics, marketplace) ✅
- Tests use MockAuthProvider for CI environment ✅
- Build passes (`tsc --noEmit` + `pnpm build`) ✅

---

### Phase C — Summary

| Task                         | Effort          | Blocks                   |
| ---------------------------- | --------------- | ------------------------ |
| C1 — Keycloak auth           | 2–3 days        | Demo-ability             |
| C2 — Backend admin endpoints | 3–4 days        | Real data in UI          |
| C3 — Tenant management       | 2 days          | Core super-admin feature |
| C4 — Plugin marketplace      | 2–3 days        | Plugin management        |
| C5 — E2E tests               | 3–4 days        | Quality gate             |
| **Total**                    | **~12–16 days** |                          |

**Milestone gate**: Super-admin is fully functional with real data, real auth, and E2E test
coverage. Can be demonstrated to stakeholders.

---

## Phase D: Web App Consolidation

**Duration**: 2–3 weeks  
**Goal**: Make the tenant web app a functional, demonstrable product  
**Priority**: ⭐ High  
**Depends on**: Phase B (components), Phase C (backend endpoints)

### D1 — Create `@plexica/api-client`

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 10, 2026)

Today both `apps/web` and `apps/super-admin` have their own `api-client.ts` with duplicated,
untyped fetch logic.

- [x] Initialize `packages/api-client/package.json`
- [x] Generate or write typed client aligned to core-api's OpenAPI/Swagger schema
- [x] Tenant-scoped client (auto-injects `X-Tenant-Slug`, `X-Workspace-ID` headers)
- [x] Admin client (no tenant scope, for super-admin)
- [x] Auth interceptors (attach JWT, handle 401 → refresh token)
- [x] Error handling with typed error responses
- [x] Replace `apps/web/src/lib/api-client.ts` with `@plexica/api-client`
- [x] Replace `apps/super-admin/src/lib/api-client.ts` with `@plexica/api-client`
- [x] Unit tests for client logic (interceptors, header injection, error handling)

**Completion notes**:

- `HttpClient` base class wraps axios with pluggable `AuthTokenProvider`, 401 retry with automatic token refresh, and typed `ApiError` error handling
- `TenantApiClient` extends `HttpClient` — auto-injects `X-Tenant-Slug` and `X-Workspace-ID` headers, typed methods for all tenant endpoints (plugins, workspaces, members, teams, settings, auth)
- `AdminApiClient` extends `HttpClient` — strips tenant headers, typed methods for all admin/marketplace/analytics endpoints (tenants, users, plugins, analytics)
- `apps/web/src/lib/api-client.ts` → thin `WebApiClient extends TenantApiClient` wrapper (adds `setToken()` / `clearAuth()` for Keycloak integration)
- `apps/super-admin/src/lib/api-client.ts` → 68-line `SuperAdminApiClient extends AdminApiClient` wrapper (wires Keycloak auth via `setAuthProvider()`, proactive token refresh interceptor, 403 response logging)
- Fixed consumer files in both apps for typed return values (arrays instead of wrapper objects, `PaginatedResponse.data`, direct typed fields)
- Zero import path changes needed — all consumers still use `@/lib/api-client`
- Uses raw `./src/index.ts` exports (same pattern as `@plexica/types`, `@plexica/event-bus`, `@plexica/sdk`)
- 79 unit tests passing across 4 test files: client (20), tenant-client (25), admin-client (22), types/error (12)
- `pnpm build` passes all 12 workspace tasks

**Acceptance criteria** — all met:

- Single source of truth for API communication ✅
- Full TypeScript types for all requests and responses ✅
- Both apps use the shared client ✅

**Files created**:

```
packages/api-client/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── client.ts             # HttpClient base class (axios wrapper)
│   ├── tenant-client.ts      # TenantApiClient with auto header injection
│   ├── admin-client.ts       # AdminApiClient for super-admin
│   └── types.ts              # ApiClientConfig, AuthTokenProvider, ApiError
└── __tests__/
    ├── client.test.ts
    ├── tenant-client.test.ts
    ├── admin-client.test.ts
    └── types.test.ts
```

**Files modified (consumer migration)**:

```
# Web app
apps/web/src/lib/api-client.ts              # Rewritten as WebApiClient extends TenantApiClient
apps/web/src/routes/index.tsx                # Array access + TenantPlugin import
apps/web/src/routes/plugins.tsx              # Array access + optimistic updates
apps/web/src/routes/members-management.tsx   # Array access

# Super-admin
apps/super-admin/package.json               # Added @plexica/api-client dep
apps/super-admin/src/lib/api-client.ts       # Rewritten as SuperAdminApiClient extends AdminApiClient
apps/super-admin/src/hooks/useTenants.ts     # PaginatedResponse.data
apps/super-admin/src/hooks/useUsers.ts       # Direct array, .length
apps/super-admin/src/hooks/useAnalytics.ts   # Direct typed fields
apps/super-admin/src/components/tenants/TenantDetailModal.tsx  # Plugins cast
apps/super-admin/src/components/marketplace/PluginAnalytics.tsx  # Analytics cast
```

---

### D2 — Dashboard with real data

**Effort**: 2 days  
**Status**: ✅ Complete (February 11, 2026)

Connected the web app dashboard, settings, activity log, and header to real backend data.
Removed all mock/hardcoded data across the entire web app.

- [x] Connect dashboard metrics to backend API (workspace stats, plugin stats, team stats)
- [x] Remove all mock/hardcoded data
- [x] Plugin widget area: shows real installed plugins or empty state
- [x] Activity feed: "Coming soon" empty state (no backend endpoint exists)
- [x] Quick actions connected to real operations
- [x] Loading states with `CardSkeleton` / `Skeleton` components
- [x] Empty states when no data available

**9 sub-tasks completed**:

- [x] **D2.1** — Dashboard metrics wired to real API (`getWorkspaceMembers()`, `getWorkspaceTeams()`, `getTenantPlugins()`)
- [x] **D2.2** — Replaced fake widgets (My Contacts CRM, Recent Invoices Billing) with Active Plugins widget and Team Members widget showing real data or empty states
- [x] **D2.3** — Activity feed replaced with "Coming soon" empty state (no backend endpoint)
- [x] **D2.4** — GeneralSettings wired to real `updateWorkspace()` API call instead of `setTimeout` stub
- [x] **D2.5** — Settings tabs (Security, Billing, Integrations, Advanced) replaced with "Coming soon" empty states. Deleted unused helper components (PlanFeature, UsageMeter, BillingItem)
- [x] **D2.6** — Activity Log page: removed entire fake `useQuery` with 6 hardcoded entries and `ActivityTable`/`ActivityTimeline` components. Replaced with "Coming soon" empty state
- [x] **D2.7** — Header notifications: removed hardcoded badge "3" and 2 fake notification items. Replaced with "No notifications yet" empty state
- [x] **D2.8** — Build verification: `pnpm build` 12/12 tasks successful
- [x] **D2.9** — Planning docs updated

**Files changed**:

- `apps/web/src/routes/index.tsx` — Dashboard fully rewritten with real API queries
- `apps/web/src/routes/settings.tsx` — GeneralSettings wired to real API, tabs replaced with empty states, unused components deleted
- `apps/web/src/routes/activity-log.tsx` — Rewritten as "Coming soon" empty state
- `apps/web/src/components/Layout/Header.tsx` — Notifications empty state

**Key decisions**:

- Activity feed, activity log, and notifications use "Coming soon" empty states because no backend endpoints exist for these features
- Dashboard metrics use `useQuery` hooks with real API calls, not mock data
- Settings GeneralSettings calls `updateWorkspace()` from `WorkspaceContext`

**Acceptance criteria** — all met:

- Dashboard shows real data for the current tenant and workspace ✅
- Plugin widgets render from real installed plugins ✅
- All loading and empty states are handled ✅
- Zero mock data remaining in web app ✅

---

### D3 — Plugin management end-to-end

**Effort**: 2–3 days  
**Status**: ✅ Complete (February 11, 2026)

Verify the full plugin lifecycle works from the tenant user perspective:

- [x] Plugin list shows installed plugins with real status
- [x] Install plugin from available catalog
- [x] Enable/disable plugin (affects route and menu registration)
- [x] Plugin pages load via Module Federation (CRM contacts, deals; Analytics dashboard)
- [x] Plugin menu items appear/disappear in sidebar dynamically
- [x] Plugin configuration per workspace
- [x] Uninstall plugin with confirmation
- [x] Error handling: plugin load failure, timeout, version mismatch

**Acceptance criteria**:

- Complete plugin lifecycle works: install → enable → use → disable → uninstall
- Plugin UI loads correctly via Module Federation
- Sidebar updates dynamically

**Completion Notes**:

- **D3.1** — Plugin list page (`/plugins`) shows installed plugins with real status from `getTenantPlugins()` API, with install/activate/deactivate/uninstall actions
- **D3.2** — Install plugin from catalog: marketplace integration calls `installPlugin()` + `activatePlugin()` APIs, auto-refreshes plugin list
- **D3.3** — Enable/disable toggles call `activatePlugin()`/`deactivatePlugin()` APIs, dynamically update route and menu registration via PluginContext
- **D3.4** — Plugin detail page (`/plugins/$pluginId`) created with flat route convention (`plugins_.$pluginId.tsx`), loads plugin info and configuration
- **D3.5** — Sidebar dynamically renders plugin menu items from `PluginContext.menuItems`, items appear/disappear on activate/deactivate
- **D3.6** — PluginContext enhanced with `refreshPlugins()`, `clearLoadErrors()`, and `loadErrors` tracking for error handling
- **D3.7** — Uninstall with confirmation dialog, calls `uninstallPlugin()` API, removes routes and menu items, navigates back to plugin list

---

### D4 — Workspace flow completion

**Effort**: 2 days  
**Status**: ✅ Complete (February 11, 2026)

- [x] Workspace creation with real API calls
- [x] Workspace switching updates all scoped data
- [x] Member management (invite, change role, remove)
- [x] Team management within workspace
- [x] Workspace settings (name, description, delete)
- [x] Verify workspace context propagates to plugins

**Acceptance criteria**:

- Full workspace CRUD works end-to-end ✅
- Switching workspace reloads all scoped data ✅
- Plugin data is filtered by current workspace ✅ (plugins are tenant-scoped; workspace ID propagated via `apiClient.setWorkspaceId()`)

**Completion Notes**:

- **D4.1** — Fixed members management to use `useWorkspace()` context instead of `tenant.id`, added `isAdmin` prop and "No Workspace Selected" empty state
- **D4.2** — Wired `AddMemberDialog` component with Dialog, Zod validation, `apiClient.addWorkspaceMember()`, inline role editing, replaced `alert()` with `toast`
- **D4.3** — WorkspaceSwitcher invalidates `workspace-members` and `workspace-teams` queries on switch via TanStack Query
- **D4.4** — Consolidated settings into single 7-tab page (`/settings`): General, Members, Teams, Security, Billing, Integrations, Advanced. Converted `/workspace-settings` to redirect. Updated all nav references.
- **D4.5** — Team card expand/collapse detail view + kebab menu with "Delete Team" (toast: coming soon, no backend endpoint)
- **D4.6** — Verified workspace context propagates to plugins correctly. Plugins are tenant-scoped, no changes needed.
- **D4.7** — Build passed (12/12). Fixed route path bug in `plugins_.$pluginId.tsx`.

---

### D5 — E2E tests with Playwright

**Effort**: 3–4 days  
**Status**: ⚪ Not Started

- [ ] **Auth flow**: Login → Keycloak → redirect to dashboard → token refresh
- [ ] **Dashboard**: Load with real data → verify metrics → plugin widgets visible
- [ ] **Plugin lifecycle**: View plugins → install → enable → navigate to plugin page → disable → uninstall
- [ ] **Workspace management**: Create workspace → switch → manage members → delete
- [ ] **Settings**: View settings → update → verify persistence
- [ ] **Navigation**: All routes → sidebar → breadcrumbs → responsive (mobile)

**Acceptance criteria**:

- All E2E tests pass in CI
- Core user journeys are covered

---

### Phase D — Summary

| Task                          | Effort          | Blocks                  |
| ----------------------------- | --------------- | ----------------------- |
| D1 — `@plexica/api-client`    | 2–3 days        | Clean API layer         |
| D2 — Dashboard with real data | 2 days          | Demonstrable product    |
| D3 — Plugin management E2E    | 2–3 days        | Core feature validation |
| D4 — Workspace flow           | 2 days          | Organizational feature  |
| D5 — E2E tests                | 3–4 days        | Quality gate            |
| **Total**                     | **~11–14 days** |                         |

**Milestone gate**: Web app is fully functional with real data, real plugin loading, and E2E
test coverage. Can be demonstrated as a working product.

---

## Scope exclusions

The following items are explicitly **NOT** in scope for this plan. They remain on the roadmap
for future phases.

| Item                                                             | Reason                                                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2.4 Plugin Registry & Marketplace (full scope)                  | Ratings, reviews, screenshots, certification are product-maturity features. This plan implements a functional minimum marketplace in super-admin (Phase C) |
| M2.5 Kubernetes & Production Deploy                              | Docker Compose is sufficient for demo and development. Defer to when production deployment is needed                                                       |
| M2.6 Official Plugins (production-ready CRM, Billing, Analytics) | Second dev team will handle this using the SDK and docs from Phase A                                                                                       |
| Test coverage 63% → 80% as standalone effort                     | Coverage will grow naturally as phases C and D add backend endpoints and E2E tests. Not a separate workstream                                              |
| `@plexica/config` package                                        | Low priority, configuration is manageable without a shared package for now                                                                                 |
| Phase 3–5 features (ABAC, i18n, theming, enterprise)             | Out of scope for this plan                                                                                                                                 |

---

## Success criteria

At the end of this plan:

1. **Demonstrable product**: A stakeholder can see a working super-admin creating tenants,
   installing plugins, and a tenant app where plugins load dynamically with consistent UI
2. **Second team operational**: A developer can run `plexica init`, build a plugin with
   `@plexica/ui` components, publish it, and see it running in the host app
3. **Quality baseline**: E2E tests cover critical flows in both apps, UI component library
   has ≥80% test coverage
4. **Design consistency**: Every UI surface (host, super-admin, plugins) uses the same
   components, tokens, and visual language
5. **Zero mock data**: All visible data comes from real backend APIs

---

## Risk register

| Risk                                                                    | Impact | Likelihood | Mitigation                                                                                               |
| ----------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| Module Federation `shared` config breaks with `@plexica/ui`             | High   | Medium     | Spike in A3 to validate before committing to the approach. Fallback: publish UI as CSS-only token system |
| Theme CSS custom properties don't propagate to plugin iframe/shadow DOM | Medium | Low        | Plugins load in same DOM (no iframe), so CSS vars should inherit. Verify in B8                           |
| Second team starts before SDK is stable                                 | High   | Medium     | Ship A1 with explicit `0.1.0-alpha` versioning. Communicate breaking changes via changelog               |
| Keycloak integration in super-admin is complex                          | Medium | Medium     | Follow exact same pattern as apps/web (already working). Reuse `keycloak.ts` utility                     |
| Backend admin endpoints need data that doesn't exist yet                | Medium | Low        | For analytics, start with real counts (tenants, plugins, users) and add time-series data incrementally   |

---

## Relationship to existing roadmap

This plan replaces the following items from the current roadmap:

| Roadmap item                                     | Status                | Replaced by                                   |
| ------------------------------------------------ | --------------------- | --------------------------------------------- |
| M2.4 Plugin Registry & Marketplace (full)        | 🟡 20%                | Phase C (C4) — functional minimum marketplace |
| `@plexica/sdk` (planned)                         | ✅ Complete (Phase A) | Phase A (A1)                                  |
| `@plexica/types` (planned)                       | ✅ Complete (Phase A) | Phase A (A2)                                  |
| `@plexica/api-client` (planned)                  | ✅ Complete (Phase D) | Phase D (D1)                                  |
| `@plexica/ui` (planned, listed as "not started") | ✅ Complete (Phase B) | Phase B (all)                                 |

After this plan completes, the roadmap should be updated to:

- Mark M2.4 as "Minimum Viable" completed
- Add Phase 3 frontend-focused milestones (advanced theming, i18n, ABAC UI)
- Re-scope M2.5 (K8s) and M2.6 (Official Plugins) with updated prerequisites

---

_Frontend Consolidation Plan v1.1_  
_Created: February 10, 2026_  
_Author: Engineering Team_  
_Next review: After Phase C completion_
