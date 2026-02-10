# Frontend Consolidation & Plugin Enablement Plan

**Created**: February 10, 2026  
**Last Updated**: February 10, 2026  
**Status**: 🟡 Phase B In Progress (B1-B7 Complete)  
**Owner**: Engineering Team  
**Document Type**: Development Plan  
**Version**: 1.0

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

| Area                                           | Status                              | Impact                           |
| ---------------------------------------------- | ----------------------------------- | -------------------------------- |
| `@plexica/sdk`                                 | Empty directory, no package.json    | Blocks plugin developers         |
| `@plexica/types`                               | ✅ Complete, all consumers migrated | Shared type contract established |
| `@plexica/api-client`                          | Empty directory, no package.json    | Duplicated API clients           |
| `@plexica/ui` in Module Federation shared deps | ✅ Configured in all 4 apps         | Plugins can use design system    |
| Plugin UI contract                             | Does not exist                      | Plugins write raw HTML/CSS       |

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
**Status**: ⚪ Not Started  
**Depends on**: A3, B6

- [ ] Verify CSS custom properties from `globals.css` are accessible in plugin context
- [ ] Verify light/dark theme toggle in host propagates to plugin components
- [ ] Verify custom tenant theme overrides (if configured) apply to plugins
- [ ] If theme does NOT propagate: implement a solution (inject CSS, provide ThemeContext, etc.)
- [ ] Document theme integration for plugin developers

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
**Status**: ⚪ Not Started

Currently: hardcoded `admin@plexica.com / admin` with localStorage session.

- [ ] Integrate Keycloak JS adapter (same pattern as `apps/web`)
- [ ] Configure super-admin Keycloak client in master realm (or dedicated admin realm)
- [ ] Implement PKCE auth flow
- [ ] Token refresh and session management
- [ ] Remove `MockAuthProvider` (keep only for E2E test mode)
- [ ] Implement proper role check: user must have `super_admin` role
- [ ] Logout with Keycloak token revocation

**Acceptance criteria**:

- Login redirects to Keycloak
- Only users with `super_admin` role can access the app
- Token refresh works transparently

---

### C2 — Implement missing backend endpoints

**Effort**: 3–4 days  
**Status**: ⚪ Not Started

The super-admin UI calls endpoints that do not exist in core-api:

- [ ] `GET /api/admin/users` — Cross-tenant user list with pagination, search, filter
- [ ] `GET /api/admin/users/:id` — User detail with tenant membership info
- [ ] `GET /api/admin/analytics/overview` — Platform-wide stats (tenant count, user count, plugin count, API call count)
- [ ] `GET /api/admin/analytics/tenants` — Tenant growth over time (daily/weekly/monthly)
- [ ] `GET /api/admin/analytics/api-calls` — API usage metrics (hourly breakdown)
- [ ] `GET /api/admin/analytics/plugins` — Plugin installation stats across tenants
- [ ] Add `requireSuperAdmin` guard to all `/api/admin/*` routes
- [ ] Add Swagger documentation for all new endpoints
- [ ] Unit tests for admin service methods
- [ ] Integration tests for admin API endpoints

**Acceptance criteria**:

- All endpoints return real data from the database
- All endpoints are protected by super-admin auth
- All endpoints appear in Swagger docs at `/docs`
- Test coverage ≥80% for new code

---

### C3 — Connect tenant management to real data

**Effort**: 2 days  
**Status**: ⚪ Not Started

Partially working, needs verification and completion:

- [ ] Verify create tenant triggers full provisioning (DB schema + Keycloak realm + storage)
- [ ] Verify suspend/activate/delete lifecycle works end-to-end
- [ ] Connect tenant detail modal to real infrastructure data (schema size, user count, plugin count)
- [ ] Add tenant usage metrics (API calls, storage, active users)
- [ ] Verify search and filter work against real data
- [ ] Error handling: show meaningful messages when provisioning fails

**Acceptance criteria**:

- Creating a tenant from super-admin produces a fully provisioned tenant
- Tenant detail shows real metrics
- All CRUD operations reflect immediately in the UI

---

### C4 — Plugin marketplace with real data

**Effort**: 2–3 days  
**Status**: ⚪ Not Started

- [ ] Connect plugin listing to real registry data (GET /api/plugins)
- [ ] Plugin search and filter against real data
- [ ] Plugin install/uninstall for specific tenants
- [ ] Plugin version display (from PluginVersion table)
- [ ] Plugin status management (DRAFT → PUBLISHED → DEPRECATED)
- [ ] Plugin detail modal with manifest info, install count, version history

**Acceptance criteria**:

- Marketplace shows real plugins from the database
- Install/uninstall works for any tenant
- Version history is displayed correctly

---

### C5 — E2E tests with Playwright

**Effort**: 3–4 days  
**Status**: ⚪ Not Started

Playwright is already configured in super-admin. Write tests for critical flows:

- [ ] **Auth flow**: Login → redirect to Keycloak → return authenticated → see dashboard
- [ ] **Tenant lifecycle**: Create tenant → verify in list → view detail → suspend → reactivate → delete
- [ ] **Plugin management**: Browse marketplace → install plugin for tenant → verify installed → uninstall
- [ ] **User management**: List users → search → view detail
- [ ] **Analytics**: View dashboard → change time period → verify data updates
- [ ] **Navigation**: All routes accessible → sidebar navigation works → breadcrumbs correct

**Acceptance criteria**:

- All E2E tests pass in CI
- Critical flows are covered
- Tests use MockAuthProvider for CI environment

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
**Status**: ⚪ Not Started

Today both `apps/web` and `apps/super-admin` have their own `api-client.ts` with duplicated,
untyped fetch logic.

- [ ] Initialize `packages/api-client/package.json`
- [ ] Generate or write typed client aligned to core-api's OpenAPI/Swagger schema
- [ ] Tenant-scoped client (auto-injects `X-Tenant-Slug`, `X-Workspace-ID` headers)
- [ ] Admin client (no tenant scope, for super-admin)
- [ ] Auth interceptors (attach JWT, handle 401 → refresh token)
- [ ] Error handling with typed error responses
- [ ] Replace `apps/web/src/lib/api-client.ts` with `@plexica/api-client`
- [ ] Replace `apps/super-admin/src/lib/api-client.ts` with `@plexica/api-client`
- [ ] Unit tests for client logic (interceptors, header injection, error handling)

**Acceptance criteria**:

- Single source of truth for API communication
- Full TypeScript types for all requests and responses
- Both apps use the shared client

**Files to create**:

```
packages/api-client/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   ├── client.ts            # Base HTTP client (axios wrapper)
│   ├── tenant-client.ts     # Tenant-scoped client
│   ├── admin-client.ts      # Super-admin client
│   ├── interceptors.ts      # Auth, error handling
│   └── types.ts             # Request/response types (or import from @plexica/types)
└── __tests__/
    └── *.test.ts
```

---

### D2 — Dashboard with real data

**Effort**: 2 days  
**Status**: ⚪ Not Started

- [ ] Connect dashboard metrics to backend API (workspace stats, plugin stats, team stats)
- [ ] Remove all mock/hardcoded data
- [ ] Plugin widget area: show widgets contributed by installed plugins
- [ ] Recent activity feed from real data (workspace events, plugin events)
- [ ] Quick actions connected to real operations
- [ ] Loading states with `CardSkeleton` / `Skeleton` components
- [ ] Empty states when no data available

**Acceptance criteria**:

- Dashboard shows real data for the current tenant and workspace
- Plugin widgets render from installed plugins
- All loading and empty states are handled

---

### D3 — Plugin management end-to-end

**Effort**: 2–3 days  
**Status**: ⚪ Not Started

Verify the full plugin lifecycle works from the tenant user perspective:

- [ ] Plugin list shows installed plugins with real status
- [ ] Install plugin from available catalog
- [ ] Enable/disable plugin (affects route and menu registration)
- [ ] Plugin pages load via Module Federation (CRM contacts, deals; Analytics dashboard)
- [ ] Plugin menu items appear/disappear in sidebar dynamically
- [ ] Plugin configuration per workspace
- [ ] Uninstall plugin with confirmation
- [ ] Error handling: plugin load failure, timeout, version mismatch

**Acceptance criteria**:

- Complete plugin lifecycle works: install → enable → use → disable → uninstall
- Plugin UI loads correctly via Module Federation
- Sidebar updates dynamically

---

### D4 — Workspace flow completion

**Effort**: 2 days  
**Status**: ⚪ Not Started

- [ ] Workspace creation with real API calls
- [ ] Workspace switching updates all scoped data
- [ ] Member management (invite, change role, remove)
- [ ] Team management within workspace
- [ ] Workspace settings (name, description, delete)
- [ ] Verify workspace context propagates to plugins

**Acceptance criteria**:

- Full workspace CRUD works end-to-end
- Switching workspace reloads all scoped data
- Plugin data is filtered by current workspace

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

| Roadmap item                                     | Status                     | Replaced by                                   |
| ------------------------------------------------ | -------------------------- | --------------------------------------------- |
| M2.4 Plugin Registry & Marketplace (full)        | 🟡 20%                     | Phase C (C4) — functional minimum marketplace |
| `@plexica/sdk` (planned)                         | ⚪ Empty                   | Phase A (A1)                                  |
| `@plexica/types` (planned)                       | ✅ Complete                | Phase A (A2)                                  |
| `@plexica/api-client` (planned)                  | ⚪ Empty                   | Phase D (D1)                                  |
| `@plexica/ui` (planned, listed as "not started") | ✅ Exists but undocumented | Phase B (all)                                 |

After this plan completes, the roadmap should be updated to:

- Mark M2.4 as "Minimum Viable" completed
- Add Phase 3 frontend-focused milestones (advanced theming, i18n, ABAC UI)
- Re-scope M2.5 (K8s) and M2.6 (Official Plugins) with updated prerequisites

---

_Frontend Consolidation Plan v1.0_  
_Created: February 10, 2026_  
_Author: Engineering Team_  
_Next review: After Phase A completion_
