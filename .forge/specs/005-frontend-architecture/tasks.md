# Spec 005 — Frontend Architecture: Task Breakdown

> Granular, sprint-ready task cards derived from the implementation plan.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Status       | Ready                                      |
| Author       | forge-scrum                                |
| Date         | 2026-02-26                                 |
| Spec         | [005-frontend-architecture](./spec.md)     |
| Plan         | [plan.md](./plan.md)                       |
| Design Spec  | [design-spec.md](./design-spec.md)         |
| Total Tasks  | 24                                         |
| Total Points | 44                                         |
| Sprints      | Sprint 7 (Phase 1) + Sprint 8 (Phases 2–5) |

---

## Legend

- `[ ]` / `[x]` — pending / complete
- `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h (split if encountered)
- `[P]` — parallelisable with other `[P]` tasks in the same phase
- `[FR-NNN]` / `[NFR-NNN]` — requirement traceability to spec.md §4–5
- **Spec 010 dependency**: tasks that require a Spec 010 deliverable are flagged inline

---

## Task Index

| Task ID | Title                                    | Phase   | Points | Priority | Status  | Dependencies              |
| ------- | ---------------------------------------- | ------- | ------ | -------- | ------- | ------------------------- |
| T005-01 | Implement SidebarNav component           | Phase 1 | 5      | High     | pending | None                      |
| T005-02 | Implement Breadcrumbs component          | Phase 1 | 2      | High     | pending | None                      |
| T005-03 | Add reserved route enforcement           | Phase 1 | 2      | High     | pending | None                      |
| T005-04 | Implement PluginNotFoundPage             | Phase 1 | 1      | High     | pending | None                      |
| T005-05 | Implement WidgetContainer                | Phase 1 | 1      | Medium   | pending | Spec 010 Phase 3          |
| T005-06 | Implement font-loader.ts                 | Phase 2 | 3      | High     | pending | ADR-020                   |
| T005-07 | Integrate tenant logo in Header          | Phase 2 | 2      | Medium   | pending | Spec 010 Phase 2          |
| T005-14 | Create font manifest + download script   | Phase 2 | 2      | High     | pending | ADR-020                   |
| T005-15 | Configure CSP `font-src 'self'`          | Phase 2 | 1      | High     | pending | T005-14                   |
| T005-08 | Implement contrast-utils.ts              | Phase 3 | 1      | High     | pending | None                      |
| T005-09 | Implement ColorPickerField               | Phase 3 | 3      | High     | pending | T005-08                   |
| T005-10 | Implement ThemePreview                   | Phase 3 | 2      | Medium   | pending | None                      |
| T005-11 | Implement FontSelector                   | Phase 3 | 2      | High     | pending | T005-06                   |
| T005-12 | Build settings.branding.tsx page         | Phase 3 | 3      | High     | pending | T005-09, T005-10, T005-11 |
| T005-13 | Add branding link to Settings navigation | Phase 3 | 1      | Medium   | pending | T005-12                   |
| T005-18 | Fix widget fallback contrast             | Phase 3 | 1      | High     | pending | Spec 010 Phase 3          |
| T005-17 | Implement AuthWarningBanner              | Phase 4 | 2      | High     | pending | None                      |
| T005-20 | Extend dark mode for tenant theme tokens | Phase 4 | 3      | Medium   | pending | Spec 010 Phase 2          |
| T005-19 | Add skip-to-content link                 | Phase 5 | 1      | High     | pending | Phase 1                   |
| T005-21 | Add noscript fallback                    | Phase 5 | 1      | Low      | pending | None                      |
| T005-22 | Verify ARIA landmarks across shell       | Phase 5 | 2      | High     | pending | All phases                |
| T005-23 | Navigation E2E tests                     | Phase 5 | 1      | Medium   | pending | All phases                |
| T005-16 | Integrate font loading into ThemeContext | Phase 2 | 1      | High     | pending | T005-06, T005-14          |
| T005-24 | AppLayout integration & cleanup          | Phase 1 | 1      | High     | pending | T005-01, T005-02          |

> **Note on T005-16 / T005-24**: The plan references ThemeContext font integration and AppLayout wiring as implicit tasks spread across Phase 1–2. They are made explicit here as T005-16 and T005-24 to ensure full traceability and clear ownership. Both are scoped to exactly 1 story point each, bringing the corrected total to 44 points (Phase 1: 12 pts, Phase 2: 9 pts).

---

## Phase Summary Index

| Phase     | Name                      | Sprint   | Tasks                                                         | Points |
| --------- | ------------------------- | -------- | ------------------------------------------------------------- | ------ |
| Phase 1   | Shell Layout & Navigation | Sprint 7 | T005-01, T005-02, T005-03, T005-04, T005-05, T005-24          | 12     |
| Phase 2   | Font Loading & CSP        | Sprint 7 | T005-06, T005-14, T005-15, T005-16, T005-07                   | 9      |
| Phase 3   | Tenant Theme Settings UI  | Sprint 8 | T005-08, T005-09, T005-10, T005-11, T005-12, T005-13, T005-18 | 13     |
| Phase 4   | Auth UX Enhancements      | Sprint 8 | T005-17, T005-20                                              | 5      |
| Phase 5   | Accessibility & E2E       | Sprint 8 | T005-19, T005-21, T005-22, T005-23                            | 5      |
| **Total** |                           |          |                                                               | **44** |

---

## Phase 1: Shell Layout & Navigation

**Sprint**: Sprint 7, Week 2–3  
**Objective**: Redesign sidebar with responsive overlay + ARIA, add breadcrumbs, enforce route namespaces, add plugin 404 page, create WidgetContainer wrapper, wire AppLayout.  
**Story Points**: 11  
**Spec 010 Dependency**: PluginErrorBoundary (T010-1.1) should be complete or in progress before T005-05.

---

### T005-01: Implement SidebarNav Component

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 5  
**Priority**: High  
**Status**: pending  
**FR References**: FR-006, FR-007, FR-008, NFR-004, NFR-005  
**Dependencies**: None

#### Description

Replace the existing `Sidebar.tsx` (~161 LOC, no ARIA, no responsive overlay) with a fully redesigned `SidebarNav.tsx` that renders core nav items (Dashboard, Profile, Settings) pinned at top, a collapsible "Plugins" group populated from `PluginContext.menuItems`, responsive overlay with backdrop on mobile/tablet (< 1024 px), focus trap when overlay is open, and keyboard support (Tab, Esc, Home/End). This is the highest-complexity task in the phase because it combines responsive layout, ARIA landmark management, focus trap logic, and dynamic plugin menu rendering.

#### Files to Create

- `apps/web/src/components/Layout/SidebarNav.tsx` — redesigned sidebar: responsive overlay, ARIA, collapsible plugins group, keyboard nav
- `apps/web/src/__tests__/layout/SidebarNav.test.tsx` — 8 unit tests

#### Files to Modify

- `apps/web/src/components/Layout/AppLayout.tsx` — swap `<Sidebar>` import for `<SidebarNav>` (full wiring handled by T005-24)

#### Files to Delete

- `apps/web/src/components/Layout/Sidebar.tsx` — replaced by SidebarNav
- `apps/web/src/components/Layout/Sidebar.d.ts` — type declaration no longer needed

#### Implementation Notes

- Props interface: `isOpen: boolean`, `onClose: () => void`, `collapsed: boolean`, `onCollapsedChange: (v: boolean) => void`
- Landmark: `<nav role="navigation" aria-label="Main navigation">`; overlay adds `aria-modal="true"`
- Collapsible plugins group: wrapping element uses `role="group"`, `aria-label="Plugins"`, `aria-expanded`; toggle button updates state
- Active route: set `aria-current="page"` via `useMatches()` or `useLocation()` from TanStack Router
- Focus trap when overlay open — implement natively with `keydown` listener; if complexity exceeds 2 h, use `focus-trap-react` and create a minimal ADR note (Risk R5 from plan)
- Keyboard: `Esc` closes overlay; `Home`/`End` jump first/last item; `Tab` natural order
- Design tokens: sidebar width = `var(--sidebar-width)` (260 px desktop), `var(--sidebar-width-mobile)` (280 px overlay); backdrop = `var(--overlay-backdrop)`
- Transition: `var(--transition-slow)` (300 ms) for overlay slide-in
- Delete `Sidebar.tsx` and `Sidebar.d.ts` in the same commit; update all remaining imports

#### Test Requirements

- [ ] Unit: Renders core nav items (Dashboard, Profile, Settings) when `PluginContext.menuItems` is empty
- [ ] Unit: Renders plugin items from `PluginContext.menuItems` under collapsible group
- [ ] Unit: Active route item has `aria-current="page"` and `--primary` background
- [ ] Unit: Plugins group toggle sets `aria-expanded` correctly and shows/hides items
- [ ] Unit: Esc key fires `onClose` when overlay is open
- [ ] Unit: Sidebar overlay has `aria-modal="true"` on mobile viewport
- [ ] Unit: `collapsed` prop renders icon-only mode on desktop
- [ ] Unit: `Home` / `End` keydown moves focus to first / last nav item
- [ ] Integration: N/A (wired in T005-24)
- [ ] E2E: Covered by T005-23

#### Acceptance Criteria

- [ ] SidebarNav renders Dashboard, Profile, Settings nav items and dynamically populated plugin items from `PluginContext`
- [ ] Plugins section is collapsible with `aria-expanded` toggle and `role="group" aria-label="Plugins"`
- [ ] Active route item highlighted with `aria-current="page"` and `--primary` background with `--primary-foreground` text
- [ ] On viewports < 1024 px: sidebar is hidden by default; hamburger in Header opens overlay from left with dimmed backdrop (`var(--overlay-backdrop)`)
- [ ] Overlay has focus trap; `Esc` and backdrop click close it; first focusable item receives focus on open
- [ ] Component is gated behind the `ENABLE_NEW_SIDEBAR` feature flag (Constitution Art. 9.1); falls back to existing `Sidebar.tsx` when flag is disabled

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: FR-006  
**Dependencies**: None

#### Description

Build a new `Breadcrumbs.tsx` component that auto-generates a navigable breadcrumb trail from the current URL path. Segments are mapped to display labels — static core labels for known routes (`/` → "Home", `/settings` → "Settings") and plugin display names via `PluginContext` for plugin route prefixes. The last segment is non-linked (current page). Custom labels can be injected via `overrides` prop for routes that set metadata.

#### Files to Create

- `apps/web/src/components/Layout/Breadcrumbs.tsx` — breadcrumb trail component
- `apps/web/src/__tests__/layout/Breadcrumbs.test.tsx` — 4 unit tests

#### Implementation Notes

- Use `useLocation()` and `useMatches()` from TanStack Router
- Split `pathname` by `/`, filter empty segments, build `{ label, href }` array
- Resolve plugin segment labels: if segment matches a `pluginId` in `PluginContext.plugins`, use the plugin's `displayName`
- HTML: `<nav aria-label="Breadcrumb"><ol>` with `<li>` items; separator `>` via CSS (`::after`) or explicit `<span aria-hidden="true">`
- Last item: `<span aria-current="page">` (no `<a>`)
- Design: use `--muted-foreground` for inactive items, `--foreground` for current item, `--font-size-xs`

#### Test Requirements

- [ ] Unit: Renders "Home" as first item with link to `/` for any path
- [ ] Unit: Resolves plugin route prefix to plugin display name via PluginContext
- [ ] Unit: Last breadcrumb item has `aria-current="page"` and is not a link
- [ ] Unit: `overrides` prop replaces auto-generated label for specified segment
- [ ] Integration: N/A
- [ ] E2E: Covered by T005-23

#### Acceptance Criteria

- [ ] Renders "Home > [Plugin Name] > [Page]" trail from URL path `/crm/contacts`
- [ ] All items except last are focusable links (`<a>`) navigating to their respective paths
- [ ] Last item has `aria-current="page"` and is not a link
- [ ] `<nav aria-label="Breadcrumb">` landmark wraps the trail
- [ ] `overrides` prop correctly replaces segment labels when provided

---

### T005-03: Add Reserved Route Enforcement

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: FR-007, FR-008  
**Dependencies**: None

#### Description

Extend `plugin-routes.tsx` with a reserved route guard that prevents plugins from registering route prefixes that conflict with core shell routes or with already-registered plugins. Add three utilities: `isReservedRoute(prefix)`, `hasConflict(prefix)`, and an updated `registerPlugin(pluginId, prefix)` that rejects invalid registrations with a descriptive `console.warn`. This satisfies FR-008 (reserved routes) and the edge case of two plugins attempting the same prefix (EC-3 in spec.md §6).

#### Files to Modify

- `apps/web/src/lib/plugin-routes.tsx` — add `RESERVED_ROUTES` constant, `isReservedRoute()`, `hasConflict()`, rejection logic in `registerPlugin()`

#### Files to Create

- `apps/web/src/__tests__/routes/plugin-routes.test.ts` — 3 unit tests (inline with existing tests or new file if none exists)

#### Implementation Notes

- `RESERVED_ROUTES`: `['/','  /settings', '/admin', '/profile', '/team', '/login', '/auth']` — export as `const` with `as const` type
- `isReservedRoute(prefix: string): boolean` — exact match against list after normalising trailing slash
- `hasConflict(prefix: string): boolean` — check against already-registered plugin prefixes in the registry Map
- `registerPlugin(pluginId: string, prefix: string): boolean` — returns `true` on success, `false` + `console.warn` on rejection; warn message includes prefix and reason
- No throw — warn only (Risk R6: runtime validation sufficient for MVP)

#### Test Requirements

- [ ] Unit: `isReservedRoute('/settings')` returns `true`; `isReservedRoute('/crm')` returns `false`
- [ ] Unit: `registerPlugin` rejects registration when prefix conflicts with another registered plugin (returns `false`, logs warning)
- [ ] Unit: `registerPlugin` rejects reserved prefix `/admin` (returns `false`, logs warning with reason)
- [ ] Integration: N/A
- [ ] E2E: N/A (build-time validation; runtime warning sufficient per plan Risk R6)

#### Acceptance Criteria

- [ ] `RESERVED_ROUTES` constant exported and includes: `/`, `/settings`, `/admin`, `/profile`, `/team`, `/login`, `/auth`
- [ ] Plugin attempting to register `/settings` is rejected with `console.warn` containing the prefix and "reserved route" reason
- [ ] Second plugin attempting to register the same prefix as an already-registered plugin is rejected with a conflict warning
- [ ] Successful registration returns `true`; failed registration returns `false`

---

### T005-04: Implement PluginNotFoundPage

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: FR-008, NFR-007  
**Dependencies**: None

#### Description

Create a dedicated 404 page component shown when a user navigates to a disabled or non-existent plugin route. Renders a centred layout with a search icon (`lucide-react` `SearchX`), an `h1` "Page Not Found" heading, explanatory text, and a primary "Go to Dashboard" CTA button. Replaces the existing inline `PluginNotFoundState` placeholder in `plugins.$pluginId.tsx`. The screen reader flow must be h1 → explanation → button, matching design-spec Screen 4.

#### Files to Create

- `apps/web/src/components/PluginNotFoundPage.tsx` — 404 page component
- `apps/web/src/__tests__/layout/PluginNotFoundPage.test.tsx` — 2 unit tests

#### Files to Modify

- `apps/web/src/routes/plugins.$pluginId.tsx` — replace inline `PluginNotFoundState` with `<PluginNotFoundPage>` for disabled plugins; also integrate `PluginErrorBoundary` from Spec 010 Phase 1 around `<Suspense>`

#### Implementation Notes

- Props: `message?: string` with default "This feature is not available for your organization. If you believe this is a mistake, contact your administrator."
- "Go to Dashboard" button: uses `useNavigate()` from TanStack Router to push `/`; `aria-label="Return to dashboard"`
- Layout: vertically and horizontally centred via flex; uses `--muted-foreground` for icon and text; `--foreground` for h1
- No `role="alert"` — this is not an error state, it is a known 404 page; use standard page landmark structure with `h1`

#### Test Requirements

- [ ] Unit: Renders "Page Not Found" h1 heading and default explanatory text
- [ ] Unit: "Go to Dashboard" button navigates to `/` when clicked (mock `useNavigate`)
- [ ] Integration: N/A
- [ ] E2E: N/A (covered by broader navigation tests in T005-23)

#### Acceptance Criteria

- [ ] `h1` "Page Not Found" visible and announced as heading level 1 by screen readers
- [ ] Explanatory text includes "not available for your organization"
- [ ] "Go to Dashboard" button navigates to `/` on click
- [ ] `aria-label="Return to dashboard"` present on CTA button
- [ ] Custom `message` prop overrides default text when provided

---

### T005-05: Implement WidgetContainer

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 1  
**Priority**: Medium  
**Status**: pending  
**FR References**: FR-011, NFR-008  
**Dependencies**: Spec 010 Phase 3 (`loadWidget()`, `WidgetFallback`)

#### Description

Build a `WidgetContainer.tsx` section wrapper that allows plugin pages to embed cross-plugin widgets. Internally uses `loadWidget()` from Spec 010 Phase 3 to dynamically import the widget component, shows a skeleton loading state during fetch, applies the widget fallback on error, and wraps the section with appropriate ARIA attributes (`role="region"`, `aria-label`, `aria-busy`). This component does not implement the loading/fallback logic itself — it orchestrates the Spec 010 primitives.

#### Files to Create

- `apps/web/src/components/WidgetContainer.tsx` — cross-plugin widget embed wrapper
- `apps/web/src/__tests__/widgets/WidgetContainer.test.tsx` — 3 unit tests

#### Implementation Notes

- Props: `pluginId: string`, `widgetName: string`, `widgetProps: Record<string, unknown>`, `title: string`, `fallback?: ReactNode`, `errorFallback?: ReactNode`
- Section heading: `<h2>{title}</h2>` rendered above widget area
- `aria-busy="true"` on `<section>` while loading; set to `"false"` once widget mounts
- Import `loadWidget` from Spec 010 deliverable path (e.g., `../lib/widget-loader`) — add `TODO:` comment with path if Spec 010 not yet merged
- Skeleton: use existing skeleton component from `@plexica/ui` or inline `animate-pulse` div
- **Note**: This task is blocked on Spec 010 Phase 3. If Phase 3 is not yet available, stub `loadWidget` locally and add a `[NEEDS UPDATE]` comment for the implementor

#### Test Requirements

- [ ] Unit: Renders section with `role="region"` and `aria-label` matching `title` prop
- [ ] Unit: Shows skeleton (`aria-busy="true"`) while `loadWidget` promise is pending
- [ ] Unit: Renders widget content once `loadWidget` resolves
- [ ] Integration: N/A (Spec 010 handles widget loading integration)
- [ ] E2E: N/A

#### Acceptance Criteria

- [ ] Section renders with `role="region"` and `aria-label` equal to the `title` prop value
- [ ] `aria-busy="true"` while widget loads; `aria-busy="false"` after mount
- [ ] `errorFallback` renders when `loadWidget` rejects
- [ ] Custom `fallback` prop overrides default skeleton when provided
- [ ] `h2` section heading renders above widget area

---

### T005-24: AppLayout Integration & Cleanup

**Phase**: Phase 1 — Shell Layout & Navigation  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: FR-006, NFR-004  
**Dependencies**: T005-01 (SidebarNav), T005-02 (Breadcrumbs)

#### Description

Wire the new Phase 1 components into `AppLayout.tsx`: replace `<Sidebar>` with `<SidebarNav>`, add `<Breadcrumbs>` above the page children, add `<main id="main-content" role="main">` wrapper, and add `<footer role="contentinfo">` below. This ensures all ARIA landmarks are present from Sprint 4 onward. Also add the hamburger button state management (open/close for mobile sidebar overlay) and ensure import cleanup after `Sidebar.tsx` deletion.

#### Files to Modify

- `apps/web/src/components/Layout/AppLayout.tsx` — replace `<Sidebar>` with `<SidebarNav>`, add `<Breadcrumbs>`, add `<main id="main-content" role="main">`, add `<footer role="contentinfo">`, add hamburger state (`isSidebarOpen`, `setIsSidebarOpen`)

#### Implementation Notes

- `isSidebarOpen` state: `useState(false)` — passed as `isOpen` to `SidebarNav` and `onClose` callback
- Pass hamburger click handler to `Header` as `onMenuClick` prop so Header can render the `≡` button
- `<main id="main-content">` is referenced by the skip-to-content link added in T005-19; must be present from Phase 1
- Provider ordering must be preserved: `AuthProvider → ThemeProvider → PluginProvider → AppLayout`
- Remove the `Sidebar` import; TypeScript will error if old import is left — treat as a compile-time gate

#### Test Requirements

- [ ] Unit: `AppLayout` renders `<nav role="navigation">`, `<main id="main-content">`, `<footer role="contentinfo">` landmarks
- [ ] Unit: `isSidebarOpen` state toggles when `onMenuClick` called
- [ ] Integration: N/A
- [ ] E2E: Covered by T005-23

#### Acceptance Criteria

- [ ] `<main id="main-content" role="main">` present in rendered output
- [ ] `<footer role="contentinfo">` present at bottom of shell
- [ ] `<SidebarNav>` receives `isOpen` and `onClose` props wired to `AppLayout` state
- [ ] `<Breadcrumbs>` renders above main content children
- [ ] No TypeScript compilation errors after `Sidebar.tsx` deletion

---

## Phase 2: Font & Theme Infrastructure

**Sprint**: Sprint 8, Week 1  
**Objective**: Implement self-hosted font loading per ADR-020, integrate tenant logo in Header, extend ThemeContext for font loading, configure CSP.  
**Story Points**: 8  
**Spec 010 Dependency**: ThemeProvider with tenant fetch (T010-2.1) must be complete before T005-07 and T005-16.

---

### T005-06: Implement font-loader.ts

**Phase**: Phase 2 — Font & Theme Infrastructure  
**Story Points**: 3  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009, FR-010, NFR-001, NFR-003  
**Dependencies**: ADR-020, T005-14 (font manifest + WOFF2 files)

#### Description

Implement the `font-loader.ts` library module that loads self-hosted WOFF2 font files via the `FontFace` API at runtime, sets CSS custom properties `--font-heading` and `--font-body`, caches the font manifest after first fetch, handles load failures with graceful fallback to system fonts, and injects `<link rel="preload">` hints for critical fonts. This is the core ADR-020 implementation and is required by both `FontSelector` (T005-11) and `ThemeContext` integration (T005-16).

#### Files to Create

- `apps/web/src/lib/font-loader.ts` — FontFace API wrapper + manifest cache + CSS property setter
- `packages/shared-types/src/fonts.ts` — `FontDefinition` interface, `FONT_CATALOG` constant, `DEFAULT_HEADING_FONT`, `DEFAULT_BODY_FONT` (per ADR-020 §Font Manifest Schema)
- `apps/web/src/__tests__/theme/font-loader.test.ts` — 6 unit tests

#### Implementation Notes

- **ADR-020 compliance**: All font files must be loaded from same origin (`/fonts/{fontId}/{fontId}-{weight}.woff2`). No Google Fonts CDN. No external URLs.
- Implement four exported functions:
  - `loadFonts({ heading: string, body: string }): Promise<void>` — load both fonts; deduplicates if heading === body
  - `preloadFont(family: string): void` — inject `<link rel="preload" as="font" type="font/woff2" crossorigin>` into `<head>`
  - `getManifest(): Promise<FontManifest>` — fetch `/fonts/manifest.json` and cache in module-level variable
  - `isFontLoaded(family: string): boolean` — check `document.fonts` for already-loaded family
- Use `FontFace` constructor: `new FontFace(name, 'url(...) format("woff2")', { weight, display: 'swap' })`
- Add loaded `FontFace` to `document.fonts` after `fontFace.load()` resolves
- Set CSS custom properties on `document.documentElement`:
  - `--font-heading`: `"${headingDef.name}", ${headingDef.fallback}`
  - `--font-body`: `"${bodyDef.name}", ${bodyDef.fallback}`
- On `FontFace.load()` rejection: log `warn` (no PII), fall back to system fonts (do not re-throw)
- Validate font ID against `FONT_CATALOG` via Zod enum before calling `FontFace` (Art. 5.3.1)
- `FONT_CATALOG` in `packages/shared-types/src/fonts.ts` must include all 25 fonts from ADR-020 §Curated Font List

#### Test Requirements

- [ ] Unit: `loadFonts({ heading: 'inter', body: 'roboto' })` calls `FontFace` constructor for each weight of both fonts (mock `FontFace`)
- [ ] Unit: `loadFonts` deduplicates when heading and body are the same font ID
- [ ] Unit: `getManifest()` fetches `/fonts/manifest.json` once and returns cached result on subsequent calls
- [ ] Unit: `isFontLoaded('Inter')` returns `true` when font is in `document.fonts` (mock `document.fonts`)
- [ ] Unit: `loadFonts` falls back gracefully (no throw) when `FontFace.load()` rejects; warns to console
- [ ] Unit: Invalid font ID (not in `FONT_CATALOG`) is rejected by Zod validation before any `FontFace` call
- [ ] Integration: N/A
- [ ] E2E: N/A (font loading tested via Theme Settings E2E in T005-12)

#### Acceptance Criteria

- [ ] `loadFonts({ heading: 'inter', body: 'roboto' })` results in `--font-heading: "Inter", system-ui, -apple-system, sans-serif` on `document.documentElement`
- [ ] All font files loaded from `/fonts/{id}/{id}-{weight}.woff2` (same origin) — no requests to `fonts.googleapis.com` or `fonts.gstatic.com`
- [ ] `font-display: swap` used for all `FontFace` instances (no invisible text during load)
- [ ] Font manifest fetched at most once per page session (module-level cache)
- [ ] Load failure logs a `warn` and leaves CSS custom properties pointing to system font fallback; no uncaught rejection
- [ ] `FONT_CATALOG` includes all 25 curated fonts from ADR-020

---

### T005-07: Integrate Tenant Logo in Header

**Phase**: Phase 2 — Font & Theme Infrastructure  
**Story Points**: 2  
**Priority**: Medium  
**Status**: pending  
**FR References**: FR-006, FR-009  
**Dependencies**: Spec 010 Phase 2 (ThemeProvider — `theme.logo` available in ThemeContext)

#### Description

Replace the hardcoded "P" text placeholder in `Header.tsx` with the tenant logo from `ThemeContext`. Add an `<img>` element with `onError` fallback to the default Plexica logo, add `role="banner"` to the `<header>` element, make the logo a clickable link navigating to `/`, and remove all hardcoded placeholder code. This task aligns with design-spec Screen 1 wireframe showing `[TenantLogo]` in the header.

#### Files to Modify

- `apps/web/src/components/Layout/Header.tsx` — replace "P" placeholder with `<img src={theme.logo} onError={fallbackToDefault} alt="[Tenant name] logo">`, add `role="banner"`, add click-to-home link, add `aria-label="Notifications"` to notification bell button

#### Files to Create

- `apps/web/src/__tests__/layout/Header.test.tsx` — 3 unit tests (or extend existing if file exists)

#### Implementation Notes

- Import `useTheme()` from `ThemeContext` (provided by Spec 010 Phase 2)
- Logo `<img>`: `src={theme.logo ?? DEFAULT_LOGO_URL}`, `alt={theme.tenantName ? ${theme.tenantName} logo` : `Plexica`}
- `onError`: set `src` to `DEFAULT_LOGO_URL` (Plexica default) — prevents broken image icon
- Wrap logo `<img>` in `<a href="/">` or use TanStack Router `<Link to="/">` for SPA navigation
- `role="banner"` on `<header>` element (if not already present)
- Default logo: import from `@/assets/plexica-logo.svg` or equivalent path — confirm actual path in codebase
- Logo dimensions: constrain with CSS (`max-height: 32px`) to prevent layout shift

#### Test Requirements

- [ ] Unit: Renders tenant logo `<img>` when `theme.logo` is set
- [ ] Unit: Falls back to default Plexica logo when `onError` fires (sets `src` to default)
- [ ] Unit: Logo `<img>` is wrapped in a link navigating to `/`
- [ ] Integration: N/A
- [ ] E2E: Covered by Theme Settings E2E in T005-12 (logo upload + preview)

#### Acceptance Criteria

- [ ] `<header role="banner">` present on the Header element
- [ ] Tenant logo `<img>` rendered from `ThemeContext.theme.logo`
- [ ] `onError` handler switches `src` to default Plexica logo — no broken image shown
- [ ] Logo is a link navigating to `/` (dashboard)
- [ ] `alt` attribute is non-empty and descriptive (not empty string)

---

### T005-14: Create Font Manifest & Download Script

**Phase**: Phase 2 — Font & Theme Infrastructure  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009, FR-010  
**Dependencies**: ADR-020

#### Description

Create the static font manifest JSON file at `apps/web/public/fonts/manifest.json` containing all 25 curated fonts from ADR-020, and write a `scripts/download-fonts.sh` bash script that downloads each WOFF2 file from Google Fonts API server-side (one-time setup, not runtime), organises them into `apps/web/public/fonts/{font-id}/{font-id}-{weight}.woff2`, and optionally uploads to the MinIO `plexica-assets/fonts/` bucket. The manifest and font files are static assets committed to the repository (or stored in CI artifacts).

#### Files to Create

- `apps/web/public/fonts/manifest.json` — font manifest listing all 25 families with variants
- `scripts/download-fonts.sh` — font download + organisation script
- `apps/web/public/fonts/inter/inter-400.woff2` (and all other font files) — downloaded by script; committed or stored in CI artifacts

#### Implementation Notes

- **ADR-020 compliance**: All fonts must be SIL OFL or Apache 2.0 licensed for self-hosting. The 25 fonts from ADR-020 §Curated Font List are the complete set.
- Manifest JSON schema (matches ADR-020 §Font Manifest Schema and `packages/shared-types/src/fonts.ts`):
  ```json
  {
    "version": 1,
    "fonts": [
      {
        "id": "inter",
        "name": "Inter",
        "category": "sans-serif",
        "weights": [400, 500, 600, 700],
        "license": "SIL OFL 1.1",
        "fallback": "system-ui, -apple-system, sans-serif",
        "files": {
          "400": "inter/inter-400.woff2",
          "500": "inter/inter-500.woff2",
          "600": "inter/inter-600.woff2",
          "700": "inter/inter-700.woff2"
        }
      }
    ]
  }
  ```
- Download script: use `curl` to fetch WOFF2 from Google Fonts download API or directly from font project GitHub releases; no runtime Google Fonts CDN dependency (server-side one-time download is acceptable)
- Directory structure: `apps/web/public/fonts/{font-id}/{font-id}-{weight}.woff2` — consistent with ADR-020 §Font File Storage Structure
- Add preload hints for default fonts (Inter 400, Roboto 400) in `apps/web/index.html`:
  ```html
  <link rel="preload" href="/fonts/inter/inter-400.woff2" as="font" type="font/woff2" crossorigin />
  <link
    rel="preload"
    href="/fonts/roboto/roboto-400.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
  ```

#### Test Requirements

- [ ] Unit: `manifest.json` is valid JSON and contains entries for all 25 fonts from ADR-020 (validate in a snapshot/schema test)
- [ ] Integration: N/A
- [ ] E2E: N/A

#### Acceptance Criteria

- [ ] `apps/web/public/fonts/manifest.json` exists and contains exactly 25 font families matching the ADR-020 curated list
- [ ] Each font entry has `id`, `name`, `category`, `weights`, `license`, `fallback`, and `files` fields
- [ ] `scripts/download-fonts.sh` is executable, documented, and downloads all WOFF2 files to the correct directory structure
- [ ] Preload hints for Inter 400 and Roboto 400 added to `apps/web/index.html`
- [ ] All font files are WOFF2 format (no TTF, OTF, or WOFF1)

---

### T005-15: Configure CSP `font-src 'self'`

**Phase**: Phase 2 — Font & Theme Infrastructure  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: NFR-001, NFR-003  
**Dependencies**: T005-14 (fonts must be self-hosted before enforcing CSP)

#### Description

Add a `Content-Security-Policy` meta tag to `apps/web/index.html` restricting font loading to the same origin (`font-src 'self'`). Also configure the Vite dev server to emit the same CSP header for development consistency. This is the ADR-020 CSP implementation — it enforces that no font requests are ever sent to Google Fonts or other third-party CDNs, satisfying both the GDPR requirement (Art. 5.2.2) and XSS prevention requirement (Art. 5.3.3).

#### Files to Modify

- `apps/web/index.html` — add CSP meta tag: `<meta http-equiv="Content-Security-Policy" content="font-src 'self'">`
- `apps/web/vite.config.ts` — add CSP headers to `server.headers` for development: `'Content-Security-Policy': "font-src 'self'"`

#### Implementation Notes

> ⚠️ **Known limitation**: CSP via `<meta>` tag cannot enforce `frame-ancestors` (clickjacking protection). Production deployment MUST configure CSP via HTTP response headers (Nginx/CDN/Fastify). Tracked as TD-007 in decision-log.md.

- **ADR-020 compliance**: `font-src 'self'` is the tightest possible policy and the explicit decision in ADR-020 §CSP Headers
- The meta tag approach works for development and static deployments; production deployments should set this via HTTP response headers (Fastify `@fastify/helmet` or reverse proxy) — add a comment in `index.html` noting this
- Verify in browser DevTools (Network tab) that no requests to `fonts.googleapis.com` or `fonts.gstatic.com` are made after this change
- If any existing code (e.g., ThemeContext from Spec 010) injects Google Fonts CSS links, this CSP will block them — coordinate with Spec 010 implementors

#### Test Requirements

- [ ] Unit: `index.html` contains `<meta http-equiv="Content-Security-Policy" content="font-src 'self'">` (snapshot or grep test)
- [ ] Integration: N/A
- [ ] E2E: N/A (CSP enforcement is browser-level; verify manually in DevTools)

#### Acceptance Criteria

- [ ] `apps/web/index.html` contains `<meta http-equiv="Content-Security-Policy" content="font-src 'self'">`
- [ ] `apps/web/vite.config.ts` emits `Content-Security-Policy: font-src 'self'` header from dev server
- [ ] No network requests to `fonts.googleapis.com` or `fonts.gstatic.com` occur during local dev (verified in browser)
- [ ] A code comment explains that production deployments should set this via HTTP headers, not meta tag

---

### T005-16: Integrate Font Loading into ThemeContext

**Phase**: Phase 2 — Font & Theme Infrastructure  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009, FR-010  
**Dependencies**: T005-06 (font-loader.ts), T005-14 (manifest + WOFF2 files), Spec 010 Phase 2 (ThemeProvider with tenant theme fetch)

#### Description

Extend `ThemeContext.tsx` to call `loadFonts()` from `font-loader.ts` whenever the tenant theme's font configuration changes. After Spec 010 Phase 2 adds the tenant theme fetch to `ThemeContext`, this task hooks into the font fields (`theme.fonts.heading`, `theme.fonts.body`) and triggers font loading. Also exports the `TenantTheme` TypeScript type for downstream consumers (settings page, font selector).

#### Files to Modify

- `apps/web/src/contexts/ThemeContext.tsx` — add `useEffect` that calls `loadFonts({ heading, body })` when `theme.fonts` changes; export `TenantTheme` type

#### Implementation Notes

- `useEffect` dependencies: `[theme.fonts.heading, theme.fonts.body]`
- Call `loadFonts` from `font-loader.ts` — import the function
- Do not block rendering on font load (fire and forget — fonts use `font-display: swap`)
- `TenantTheme` type export: `{ logo: string | null; colors: ThemeColors; fonts: { heading: string; body: string } }`
- If Spec 010 Phase 2 is not yet merged, add a stub `theme.fonts` with defaults `{ heading: 'inter', body: 'roboto' }` and a `TODO:` comment

#### Test Requirements

- [ ] Unit: `loadFonts` is called with correct heading/body IDs when `theme.fonts` changes
- [ ] Unit: `loadFonts` is called on initial mount with the default font IDs
- [ ] Integration: N/A
- [ ] E2E: Covered by Theme Settings E2E (T005-12)

#### Acceptance Criteria

- [ ] `loadFonts({ heading: theme.fonts.heading, body: theme.fonts.body })` called on theme mount and whenever fonts change
- [ ] Font loading does not block component rendering (async, non-awaited in render cycle)
- [ ] `TenantTheme` type exported from `ThemeContext.tsx`
- [ ] Defaults to `{ heading: 'inter', body: 'roboto' }` when no tenant theme is set

---

## Phase 3: Tenant Theme Settings UI

**Sprint**: Sprint 8, Week 2–3  
**Objective**: Build the admin-only `/settings/branding` page with colour pickers, font selectors, live preview, contrast checking, and the widget fallback contrast fix.  
**Story Points**: 13  
**Dependencies**: Phase 2 (font-loader, T005-06), Spec 010 Phase 2 (ThemeProvider)

---

### T005-08: Implement contrast-utils.ts

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: FR-015, NFR-004  
**Dependencies**: None

#### Description

Implement a small utility module (`contrast-utils.ts`) for WCAG 2.1 AA contrast ratio calculation. This uses the exact relative luminance formula from the WCAG 2.1 spec — no third-party packages (plan §11 decision: custom implementation to keep bundle small). The module is consumed by `ColorPickerField` (T005-09) to display live contrast ratio feedback. Target coverage ≥ 95% (plan §9.4).

#### Files to Create

- `apps/web/src/lib/contrast-utils.ts` — relative luminance + contrast ratio + pass/fail utilities
- `apps/web/src/__tests__/theme/contrast-utils.test.ts` — 5 unit tests

#### Implementation Notes

- Implement three exports:
  - `hexToRelativeLuminance(hex: string): number` — converts hex to sRGB, applies WCAG linearisation formula, returns L ∈ [0, 1]
  - `contrastRatio(hex1: string, hex2: string): number` — returns `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter colour; rounds to 2 decimal places
  - `meetsWcagAA(hex1: string, hex2: string, large?: boolean): boolean` — returns `true` if ratio ≥ 4.5 (or ≥ 3.0 for `large = true`)
- WCAG linearisation: for each channel `c = c_8bit / 255`; if `c ≤ 0.04045` use `c / 12.92` else `((c + 0.055) / 1.055) ^ 2.4`
- L = 0.2126R + 0.7152G + 0.0722B
- Test with known W3C examples: `#000000` vs `#FFFFFF` → 21:1; `#0066CC` vs `#FFFFFF` → 5.3:1

#### Test Requirements

- [ ] Unit: `hexToRelativeLuminance('#000000')` returns `0` (black)
- [ ] Unit: `hexToRelativeLuminance('#ffffff')` returns `1` (white)
- [ ] Unit: `contrastRatio('#000000', '#ffffff')` returns `21` (or `21.00`)
- [ ] Unit: `meetsWcagAA('#0066CC', '#FFFFFF')` returns `true` (5.3:1 > 4.5 threshold)
- [ ] Unit: `meetsWcagAA('#71717A', '#F4F4F5')` returns `false` (3.1:1 < 4.5 — this is the widget fallback contrast bug from design-spec §6)
- [ ] Integration: N/A
- [ ] E2E: N/A

#### Acceptance Criteria

- [ ] `contrastRatio('#000000', '#ffffff')` returns `21` (exact W3C example)
- [ ] `contrastRatio('#0066CC', '#FFFFFF')` returns `5.3` (matches design-spec Screen 5 display)
- [ ] `meetsWcagAA` threshold is 4.5:1 for normal text, 3.0:1 for large text
- [ ] Function handles 3-digit shorthand hex (`#FFF` → `#FFFFFF`) correctly
- [ ] Coverage ≥ 95% (critical accessibility logic per plan §9.4)

---

### T005-09: Implement ColorPickerField

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 3  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009, FR-015, NFR-004, NFR-006  
**Dependencies**: T005-08 (contrast-utils.ts)

#### Description

Build a `ColorPickerField` form component that combines a labelled hex text input, a clickable colour swatch (opens the native `<input type="color">` picker), and a live WCAG AA contrast ratio indicator. This component is used five times on the branding settings page (one per colour role). It must be fully accessible with `aria-label`, `aria-describedby` for the contrast indicator, and `aria-invalid` for invalid hex input. Design reference: design-spec §4 Component: ColorPickerField and Screen 5 wireframe.

#### Files to Create

- `apps/web/src/components/theme/ColorPickerField.tsx` — hex input + swatch + contrast indicator
- `apps/web/src/__tests__/theme/ColorPickerField.test.tsx` — 6 unit tests

#### Implementation Notes

- Props: `label: string`, `value: string`, `onChange: (value: string) => void`, `contrastAgainst: string`, `id: string`
- Structure: `<div>` → `<label htmlFor={id}>` → `<div>` containing hex `<input type="text">` + `<button>` (swatch) + hidden `<input type="color">`
- Swatch button click: programmatically trigger click on hidden `<input type="color">`; `<input type="color">` `onChange` updates `value`
- Hex validation: `/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/`; on invalid: `aria-invalid="true"`, red border via `--destructive`, inline error "Invalid hex color value. Use format: #RRGGBB"
- Contrast indicator: only shown when value is valid hex; uses `contrastRatio(value, contrastAgainst)` and `meetsWcagAA()`
- Pass state: `✅ {ratio}:1 — Passes WCAG AA` (green `--status-success`)
- Fail state: `⚠️ {ratio}:1 — Does not meet WCAG AA` (orange `--status-warning`)
- Contrast indicator: `id="{id}-contrast"`, `role="status"`, `aria-live="polite"`
- Input: `aria-describedby="{id}-contrast"` when valid, `aria-describedby="{id}-error"` when invalid
- Keyboard: `Tab` moves input → swatch button; `Esc` on colour picker closes it

#### Test Requirements

- [ ] Unit: Renders label, hex input with correct `id`, and swatch button
- [ ] Unit: Entering valid hex `#0066CC` with `contrastAgainst="#FFFFFF"` shows "✅ 5.3:1 — Passes WCAG AA"
- [ ] Unit: Entering valid hex with contrast ratio < 4.5 shows "⚠️ {ratio}:1 — Does not meet WCAG AA" (orange)
- [ ] Unit: Invalid hex input (`#GGG`) sets `aria-invalid="true"` and shows error message
- [ ] Unit: Swatch button click programmatically triggers the hidden colour picker
- [ ] Unit: `aria-describedby` points to contrast indicator `id` when value is valid
- [ ] Integration: Covered in T005-12 integration tests
- [ ] E2E: Covered in T005-12 E2E tests

#### Acceptance Criteria

- [ ] `aria-label` matches the `label` prop value; `aria-describedby` points to contrast indicator
- [ ] Green "✅ 5.3:1 — Passes WCAG AA" displayed for `#0066CC` against `#FFFFFF`
- [ ] Orange "⚠️ 1.2:1 — Does not meet WCAG AA" displayed for low-contrast colour pair
- [ ] Invalid hex shows red border, `aria-invalid="true"`, and "Invalid hex color value" error text
- [ ] Swatch accurately reflects the current `value` hex colour
- [ ] `role="status"` and `aria-live="polite"` on contrast indicator for screen reader announcements

---

### T005-10: Implement ThemePreview

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 2  
**Priority**: Medium  
**Status**: pending  
**FR References**: FR-009, FR-010  
**Dependencies**: None

#### Description

Build a `ThemePreview` component that renders a scaled-down (~40% scale) miniature mockup of the shell layout — header bar with logo, sidebar with two nav items, content area with a card and button — applying colours and fonts from props (not from `ThemeContext`, since these are unsaved changes). Updates in real-time as the admin edits form fields. Is purely decorative: `aria-hidden="true"`. On mobile (375 px), hidden by default and accessible via a "Preview" button that opens a bottom sheet.

#### Files to Create

- `apps/web/src/components/theme/ThemePreview.tsx` — miniature shell mockup
- `apps/web/src/__tests__/theme/ThemePreview.test.tsx` — 3 unit tests

#### Implementation Notes

- Props: `logo: string`, `colors: { primary: string; secondary: string; background: string; surface: string; text: string }`, `fonts: { heading: string; body: string }`
- Apply via inline CSS `style` on root element: `backgroundColor: colors.background`, `color: colors.text`, `fontFamily: fonts.body`, etc.
- `aria-hidden="true"` on the entire component (decorative per design-spec Screen 5 accessibility section)
- Scale via CSS `transform: scale(0.4)` + `transform-origin: top left` inside a fixed-size container
- Mobile: controlled by parent — `ThemePreview` always renders; parent `settings.branding.tsx` conditionally shows it in a bottom sheet (Dialog/Sheet from `@plexica/ui`) triggered by a "Preview" button
- Ensure colours used in the preview reflect the actual CSS custom properties usage, not hardcoded values

#### Test Requirements

- [ ] Unit: Renders with `aria-hidden="true"` attribute
- [ ] Unit: Applies `colors.primary` to the button element background in the preview
- [ ] Unit: Updates displayed font family when `fonts.heading` prop changes (via inline style)
- [ ] Integration: N/A
- [ ] E2E: N/A (visual-only, tested via Playwright screenshot comparison in T005-12 E2E)

#### Acceptance Criteria

- [ ] `aria-hidden="true"` present on the component root — excluded from accessibility tree
- [ ] Preview updates in real-time as `colors` and `fonts` props change (React re-render on every keystroke)
- [ ] Preview miniature renders header, sidebar, card, and button elements scaled to ~40%
- [ ] "Preview" bottom sheet button shown on mobile (375 px) via responsive CSS
- [ ] No ThemeContext imports — preview operates entirely from props

---

### T005-11: Implement FontSelector

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009  
**Dependencies**: T005-06 (font-loader.ts, `FONT_CATALOG`), T005-14 (manifest.json)

#### Description

Build a `FontSelector` dropdown component for choosing a font family from the ADR-020 curated library. Loads the font manifest (via `getManifest()` from `font-loader.ts`), groups options by category (sans-serif, serif, monospace, display), and renders each option label using the font itself (via `FontFace` API dynamic loading for preview). Triggers `loadFonts()` when selection changes so the `ThemePreview` reflects the chosen font immediately.

#### Files to Create

- `apps/web/src/components/theme/FontSelector.tsx` — font family dropdown with live preview
- `apps/web/src/__tests__/theme/FontSelector.test.tsx` — 4 unit tests

#### Implementation Notes

- Props: `label: string`, `value: string`, `onChange: (value: string) => void`, `id: string`
- Use native `<select>` or `@plexica/ui` Select component with `<optgroup>` per category
- Load manifest on mount via `getManifest()` (already cached by `font-loader.ts`)
- Each option: `<option value={font.id} style={{ fontFamily: font.name }}>` — font applied via inline style
- On selection change: call `onChange(font.id)` AND trigger `preloadFont(font.id)` for live preview in `ThemePreview`
- Loading state: show `<select disabled>` with "Loading fonts..." while manifest fetches
- If manifest fails: show error state "Font options unavailable" and allow manual text entry as fallback
- `aria-label` on `<select>`: matches `label` prop; `<label htmlFor={id}>` associated via `id`

#### Test Requirements

- [ ] Unit: Renders grouped `<optgroup>` sections (sans-serif, serif, monospace, display)
- [ ] Unit: Shows "Loading fonts..." when manifest is being fetched
- [ ] Unit: Calls `onChange` with correct font ID when option is selected
- [ ] Unit: Calls `preloadFont` with the selected font ID when selection changes
- [ ] Integration: N/A
- [ ] E2E: Covered by T005-12 E2E tests (font selection + preview update)

#### Acceptance Criteria

- [ ] Options grouped by category: sans-serif, serif, monospace, display
- [ ] Current `value` is selected in the dropdown on render
- [ ] Selecting a font calls `onChange` with the font ID (not display name)
- [ ] `<label>` associated with `<select>` via `htmlFor` / `id` pair
- [ ] Loading state shown while manifest fetches; error state if manifest fails

---

### T005-12: Build settings.branding.tsx Page

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 3  
**Priority**: High  
**Status**: pending  
**FR References**: FR-009, FR-010, FR-015, NFR-006, NFR-007  
**Dependencies**: T005-09 (ColorPickerField), T005-10 (ThemePreview), T005-11 (FontSelector), Spec 010 Phase 2 (ThemeContext with `theme` and `updateTheme`)

#### Description

Build the admin-only Tenant Theme Settings page at `/settings/branding`. Renders a split-panel form (form left, `ThemePreview` right; stacked on tablet; preview hidden on mobile) with logo upload, five `ColorPickerField` instances (primary, secondary, background, surface, text), two `FontSelector` instances (heading, body), client-side Zod validation, unsaved changes guard, save via `PUT /api/v1/tenant/settings`, reset-to-default with confirmation dialog, and an admin RBAC check. This is the most complex component in Phase 3 and the primary user-facing deliverable.

#### Files to Create

- `apps/web/src/routes/settings.branding.tsx` — branding settings page
- `apps/web/src/__tests__/routes/settings-branding.test.tsx` — 8 integration tests
- `apps/web/src/__tests__/e2e/theme-settings.e2e.test.ts` — 4 E2E tests

#### Implementation Notes

- Admin check: read `roles` from `useAuthStore()`; if not admin, render `<Redirect to="/settings">` or show a `403` inline
- Form state: `useReducer` or `useState` tracking `{ logo, colors, fonts }` — separate from ThemeContext (unsaved changes pattern)
- Unsaved changes guard: `window.addEventListener('beforeunload', handler)` when form is dirty; also use TanStack Router `onLeave` / `Blocker` for SPA navigation
- Save: `apiClient.put('/api/v1/tenant/settings', { theme: formState })` — show spinner on Save button, `aria-busy="true"`, disable form during save; on success show toast "Theme updated successfully. Users will see changes on their next page load."; on error show toast "Unable to save theme changes. Please try again." (preserve form data)
- Reset to default: open `@plexica/ui` Dialog with "Reset all branding to Plexica defaults?" confirmation; on confirm call `updateTheme(defaultTheme)` and reset form state
- Logo upload: `<input type="file" accept="image/png,image/svg+xml,image/jpeg" aria-label="Upload organization logo">`; POST to `POST /api/v1/tenant/settings/logo`; show progress indicator; on success update `logo` in form state
- Breadcrumb: "Home > Settings > Branding" — driven by TanStack Router route metadata
- Mobile preview: conditional render of `ThemePreview` inside a `<Sheet>` component, triggered by "Preview" button

#### Test Requirements

- [ ] Integration: Form submits `PUT /api/v1/tenant/settings` with correct theme payload on Save (mock API)
- [ ] Integration: Contrast warning displayed when `ColorPickerField` value has < 4.5:1 ratio
- [ ] Integration: "Unsaved changes" guard fires `beforeunload` event when form is dirty and user navigates
- [ ] Integration: Admin RBAC — page redirects non-admin users to `/settings`
- [ ] Integration: Save error toast shown when API returns 500 (mock API error)
- [ ] Integration: Reset to default dialog opens; confirming calls `PUT` with default theme values
- [ ] Integration: Successful save shows toast "Theme updated successfully."
- [ ] Integration: Logo upload sends `POST /api/v1/tenant/settings/logo` with FormData
- [ ] E2E: Admin user changes primary color → ThemePreview updates in real-time
- [ ] E2E: Admin user saves theme → API called → success toast displayed
- [ ] E2E: Admin user changes font selector → preview heading font updates
- [ ] E2E: Non-admin user cannot access `/settings/branding` (redirected)

#### Acceptance Criteria

- [ ] Page only accessible to users with admin role; non-admins redirected
- [ ] `PUT /api/v1/tenant/settings` called with correct theme payload on Save
- [ ] `ThemePreview` updates live on every colour/font change (no debounce needed — React re-render is sufficient)
- [ ] Unsaved changes trigger browser `beforeunload` confirmation dialog
- [ ] "Reset to Default" shows confirmation dialog before resetting; Cancel aborts reset
- [ ] Save success shows toast: "Theme updated successfully. Users will see changes on their next page load."
- [ ] Save error shows toast: "Unable to save theme changes. Please try again." — form data preserved
- [ ] Page is gated behind the `ENABLE_TENANT_THEMING` feature flag (Constitution Art. 9.1); link in Settings navigation hidden when flag is disabled

---

### T005-13: Add Branding Link to Settings Navigation

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 1  
**Priority**: Medium  
**Status**: pending  
**FR References**: FR-009  
**Dependencies**: T005-12 (settings.branding.tsx route must exist)

#### Description

Add a "Branding" navigation link to the existing settings page (`settings.tsx`) sidebar or tab navigation, with an admin-only visibility check. This is a small integration task — the branding page is only discoverable if settings navigation includes it. Non-admin users should not see the Branding link.

#### Files to Modify

- `apps/web/src/routes/settings.tsx` — add "Branding" link/tab in settings navigation with admin role visibility check

#### Implementation Notes

- Check `roles` from `useAuthStore()` — render Branding link only when user has admin role
- Link: `<Link to="/settings/branding">Branding</Link>` — or equivalent TanStack Router Link
- Icon: `Palette` from `lucide-react`
- Ensure active state is highlighted when on `/settings/branding` route
- If settings uses tabs: add a new tab; if uses sidebar links: add after last existing item

#### Test Requirements

- [ ] Unit: "Branding" link visible in settings nav when user has admin role
- [ ] Unit: "Branding" link hidden when user does not have admin role
- [ ] Integration: N/A
- [ ] E2E: N/A (admin navigation covered by T005-12 E2E)

#### Acceptance Criteria

- [ ] "Branding" link appears in settings navigation for admin users only
- [ ] "Branding" link navigates to `/settings/branding`
- [ ] Non-admin users do not see the "Branding" link
- [ ] Active state visual indicator shown when on `/settings/branding` route

---

### T005-18: Fix Widget Fallback Contrast

**Phase**: Phase 3 — Tenant Theme Settings UI  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: FR-011, NFR-004  
**Dependencies**: Spec 010 Phase 3 (`WidgetFallback` component must exist)

#### Description

Fix the WCAG AA contrast violation in the `WidgetFallback` component built by Spec 010 Phase 3. The design-spec (Screen 9 §Accessibility, design-spec.md line 870) explicitly flags that `#71717A` on the muted background `#F4F4F5` achieves only a 3.1:1 ratio (below the 4.5:1 AA minimum for normal text). The fix is to change the fallback text colour to `#52525B`, which achieves 4.5:1. This may be implemented as a token override (`--muted-foreground-strong`) or a direct colour change.

#### Files to Modify

- `apps/web/src/components/widgets/WidgetFallback.tsx` _(Spec 010 deliverable — path TBC based on Spec 010 implementation)_ — change fallback text colour from `#71717A` to `#52525B` (or `text-zinc-600` in TailwindCSS)

#### Implementation Notes

- **Contrast target**: `#52525B` on `#F4F4F5` = 4.5:1 — exactly meets WCAG AA minimum for normal text
- **Do not** change `--muted-foreground` globally — this would affect all muted text (some of which is used at larger sizes where 3:1 is sufficient)
- Preferred approach: add a new utility class or token `--muted-foreground-strong: #52525B` in `design-system.md` / global CSS and use it only in `WidgetFallback`
- Alternative: apply `text-[#52525B]` as a one-off override in `WidgetFallback`
- Verify fix with `contrastRatio('#52525B', '#F4F4F5')` from `contrast-utils.ts` (T005-08) — should return ≥ 4.5

#### Test Requirements

- [ ] Unit: `WidgetFallback` renders fallback text with colour `#52525B` (not `#71717A`) — check computed style or className
- [ ] Integration: N/A
- [ ] E2E: N/A

#### Acceptance Criteria

- [ ] Fallback text colour is `#52525B` (or equivalent TailwindCSS class that resolves to this value)
- [ ] `contrastRatio('#52525B', '#F4F4F5')` ≥ 4.5 (verified via `contrast-utils.ts` unit test)
- [ ] `#71717A` is no longer used for normal-sized text on `--muted` / `#F4F4F5` background in `WidgetFallback`
- [ ] Change does not affect other components using `--muted-foreground`

---

## Phase 4: Auth UX Enhancements

**Sprint**: Sprint 8, Week 3  
**Objective**: Add AuthWarningBanner for token refresh failures; extend ThemeContext with dark-mode tenant token generation.  
**Story Points**: 5  
**Dependencies**: Spec 010 Phase 2 (ThemeProvider) required for T005-20; T005-17 is independent.

---

### T005-17: Implement AuthWarningBanner

**Phase**: Phase 4 — Auth UX Enhancements  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: FR-013, NFR-007  
**Dependencies**: None

#### Description

Build an `AuthWarningBanner` component that displays a dismissible yellow warning banner below the `Header` when a background token refresh fails (Keycloak unreachable). Reads `refreshFailed` state from `useAuthStore()`, is dismissible via ✕ button, auto-removes when a subsequent refresh succeeds, and escalates to the existing `SessionExpiredModal` when the token actually expires. Must use `role="alert"` and `aria-live="polite"` for screen reader accessibility. Also requires adding `refreshFailed` boolean to `auth.store.ts`.

#### Files to Create

- `apps/web/src/components/auth/AuthWarningBanner.tsx` — warning banner component
- `apps/web/src/__tests__/auth/AuthWarningBanner.test.tsx` — 4 unit tests

#### Files to Modify

- `apps/web/src/components/Layout/AppLayout.tsx` — add `<AuthWarningBanner>` between `<Header>` and `<main>`, conditionally rendered when `authStore.refreshFailed` is true
- `apps/web/src/stores/auth.store.ts` — add `refreshFailed: boolean` state, set `true` when token refresh fails, reset to `false` on successful refresh

#### Implementation Notes

- Props: `message: string`, `onDismiss: () => void`
- Default message: "Unable to refresh your session. Your current session will remain active until it expires."
- `role="alert"` and `aria-live="polite"` on the banner container (design-spec Screen 7)
- Dismiss button: `aria-label="Dismiss session warning"`, renders `<X>` icon from `lucide-react`
- Warning icon: `<AlertTriangle>` from `lucide-react`
- Background: `var(--banner-warning-bg)` (`#FFFBEB` light / `#1C1917` dark)
- Border: `var(--banner-warning-border)` (`#FDE68A` light / `#92400E` dark)
- Warning icon: `#D97706` on `#FFFBEB` = 4.5:1 ✓ (design-spec Screen 7 contrast verification)
- Text: `#0A0A0A` on `#FFFBEB` = 16.2:1 ✓
- Auto-remove: in `AppLayout`, watch `authStore.refreshFailed` — banner unmounts when it becomes `false`
- Do NOT auto-dismiss on user click if `refreshFailed` is still `true` from the store; instead, track local `dismissed` state independently

#### Test Requirements

- [ ] Unit: Banner renders with `role="alert"` and `aria-live="polite"` attributes
- [ ] Unit: Dismiss button fires `onDismiss` callback and has `aria-label="Dismiss session warning"`
- [ ] Unit: Banner renders warning icon (`AlertTriangle`) and message text
- [ ] Unit: Banner does not render when `refreshFailed` is `false` in `authStore` (mock store)
- [ ] Integration: N/A
- [ ] E2E: N/A (auth failure simulation is complex; manual testing recommended)

#### Acceptance Criteria

- [ ] Banner visible below header when `authStore.refreshFailed === true`
- [ ] Banner message: "Unable to refresh your session. Your current session will remain active until it expires."
- [ ] Yellow background (`var(--banner-warning-bg)`), warning icon, and ✕ dismiss button
- [ ] `role="alert"` and `aria-live="polite"` on banner container
- [ ] `aria-label="Dismiss session warning"` on dismiss button
- [ ] Banner disappears when `authStore.refreshFailed` resets to `false` (subsequent refresh success)
- [ ] Component is gated behind the `ENABLE_AUTH_WARNING_BANNER` feature flag (Constitution Art. 9.1); banner not rendered when flag is disabled

---

### T005-20: Extend Dark Mode for Tenant Theme Tokens

**Phase**: Phase 4 — Auth UX Enhancements  
**Story Points**: 3  
**Priority**: Medium  
**Status**: pending  
**FR References**: FR-010, FR-015  
**Dependencies**: Spec 010 Phase 2 (ThemeProvider with `applyTheme()`, `validateTheme()`)

#### Description

Extend `ThemeContext.tsx` to generate dark-mode variants of tenant theme colours and apply them as `.dark` class CSS variable overrides. When a tenant sets `primary: "#1976d2"`, the dark mode variant should be a lightened/adjusted version suitable for dark backgrounds. This ensures that dark mode (toggled by system preference or user choice) is coherent with tenant branding, not just the default Plexica palette.

#### Files to Modify

- `apps/web/src/contexts/ThemeContext.tsx` — add `generateDarkModeVariants(colors: ThemeColors): ThemeColors` function; apply variants as `:root.dark` CSS variable overrides via `document.documentElement.style.setProperty`

#### Implementation Notes

- `generateDarkModeVariants(colors)` strategy per token role:
  - `background`: darken significantly (convert to HSL, reduce L to 8–12%)
  - `surface`: darken (L to 12–16%)
  - `text`: lighten to near-white (L to 92–96%)
  - `primary`: adjust saturation/lightness for dark backgrounds — ensure 4.5:1 contrast on new dark background
  - `secondary`: similar adjustment as primary
- Apply under `.dark` media query approach: inject `<style>` tag with `.dark { --primary: ${darkVariants.primary}; ... }` OR use `document.documentElement.style.setProperty` when `document.documentElement.classList.contains('dark')`
- Listen to system `prefers-color-scheme` changes via `window.matchMedia` and re-apply
- Test dark variants meet WCAG AA contrast (use `contrastRatio` from `contrast-utils.ts`)
- If auto-generation is too lossy (edge cases with non-standard palettes), provide a fallback that uses the Plexica default dark tokens instead of the tenant colours

#### Test Requirements

- [ ] Unit: `generateDarkModeVariants` produces a lighter `text` colour when given a dark `text` input
- [ ] Unit: `generateDarkModeVariants` produces a darker `background` colour
- [ ] Unit: Dark mode CSS variables applied to `.dark` class root when dark mode is active
- [ ] Integration: N/A
- [ ] E2E: N/A (visual dark mode testing recommended via Playwright with `prefers-color-scheme: dark`)

#### Acceptance Criteria

- [ ] Dark mode toggle applies both Plexica default dark tokens AND tenant-specific dark colour variants
- [ ] Dark mode background and surface colours are visually dark (L < 20% in HSL)
- [ ] Dark mode text colour is visually light (L > 85% in HSL)
- [ ] `generateDarkModeVariants` result passes WCAG AA contrast for text on background
- [ ] System `prefers-color-scheme: dark` change event correctly triggers re-application of dark variants

---

## Phase 5: Accessibility & Polish

**Sprint**: Sprint 8, Week 4  
**Objective**: Add skip-to-content link, noscript fallback, verify all ARIA landmarks, and write navigation E2E tests.  
**Story Points**: 5  
**Dependencies**: All previous phases complete.

---

### T005-19: Add Skip-to-Content Link

**Phase**: Phase 5 — Accessibility & Polish  
**Story Points**: 1  
**Priority**: High  
**Status**: pending  
**FR References**: NFR-004  
**Dependencies**: T005-24 (Phase 1 — `<main id="main-content">` must exist)

#### Description

Add a skip-to-content link as the first focusable element in the shell, allowing keyboard users and screen reader users to bypass the sidebar navigation and jump directly to the main content area. The link is visually hidden until focused (CSS `sr-only focus:not-sr-only` pattern from TailwindCSS). This is a WCAG 2.1 AA requirement (Success Criterion 2.4.1 — Bypass Blocks) and is listed as item [1] in design-spec Screen 1 tab order.

#### Files to Modify

- `apps/web/index.html` — add skip-to-content `<a href="#main-content">` as first element in `<body>` (before the React root div)

#### Implementation Notes

- Exact markup per design-spec Screen 1 §Accessibility:
  ```html
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded"
  >
    Skip to main content
  </a>
  ```
- The `id="main-content"` target is set on `<main>` in `AppLayout.tsx` (done by T005-24)
- The link must be the **first** focusable element — place before `<div id="root">`
- Verify: pressing Tab on any page brings focus to this link first, before the logo

#### Test Requirements

- [ ] Unit: `index.html` contains `<a href="#main-content">` as first `<a>` in `<body>` (HTML snapshot or grep test)
- [ ] Unit: Link has class `sr-only` for visual hiding and `focus:not-sr-only` for focus visibility
- [ ] E2E: Tab from browser chrome → first focus lands on skip link → Enter moves focus to `#main-content`

#### Acceptance Criteria

- [ ] Skip link is first focusable element in `<body>`
- [ ] Link is visually hidden at rest (TailwindCSS `sr-only`); visible on focus
- [ ] Activating the link (Enter/Space) moves focus to `<main id="main-content">`
- [ ] Link text "Skip to main content" is clear and descriptive
- [ ] Focus ring visible on skip link when focused (3:1 contrast minimum per WCAG 1.4.11)

---

### T005-21: Add Noscript Fallback

**Phase**: Phase 5 — Accessibility & Polish  
**Story Points**: 1  
**Priority**: Low  
**Status**: pending  
**FR References**: FR-006  
**Dependencies**: None

#### Description

Add a `<noscript>` tag to `apps/web/index.html` displaying a user-friendly message when JavaScript is disabled. This satisfies edge case EC-7 from spec.md §6 ("Browser with JavaScript disabled → Noscript fallback message displayed"). The message should be styled sufficiently to be readable and include a link to documentation.

#### Files to Modify

- `apps/web/index.html` — add `<noscript>` tag inside `<body>` with fallback message and basic styling

#### Implementation Notes

- Placement: inside `<body>` before or after `<div id="root">` — `<noscript>` is only rendered when JS is disabled
- Message: "This application requires JavaScript to run. Please enable JavaScript in your browser settings to use Plexica."
- Include basic inline CSS for readability (centered, reasonable font size, padding) — external CSS won't load without React
- Optionally link to a static help page or documentation URL

#### Test Requirements

- [ ] Unit: `index.html` contains a `<noscript>` tag with message text "requires JavaScript" (snapshot test)
- [ ] Integration: N/A
- [ ] E2E: N/A (requires JS to be disabled — test manually)

#### Acceptance Criteria

- [ ] `<noscript>` tag present in `apps/web/index.html`
- [ ] Noscript message text: "This application requires JavaScript to run."
- [ ] Message is readable without external CSS (includes basic inline styles)
- [ ] Message does not interfere with normal JS-enabled rendering

---

### T005-22: Verify ARIA Landmarks Across Shell

**Phase**: Phase 5 — Accessibility & Polish  
**Story Points**: 2  
**Priority**: High  
**Status**: pending  
**FR References**: NFR-004  
**Dependencies**: All previous phases (all landmark elements must be in place)

#### Description

Conduct a systematic audit and verification of all ARIA landmark roles across the shell layout, ensuring every required landmark is present with correct attributes. This is both a code review task and a test-writing task — write automated tests that assert landmark presence. Fix any missing or incorrect landmark attributes found during the audit. Reference design-spec Screen 1 §Accessibility for the complete landmark specification.

#### Files to Modify

- `apps/web/src/components/Layout/AppLayout.tsx` — verify/add all landmark roles: `<header role="banner">`, `<nav role="navigation" aria-label="Main navigation">`, `<main id="main-content" role="main">`, `<footer role="contentinfo">`
- `apps/web/src/components/Layout/SidebarNav.tsx` — verify `<nav role="navigation" aria-label="Main navigation">` and all ARIA attributes on interactive elements

#### Files to Create

- `apps/web/src/__tests__/a11y/landmarks.test.tsx` — 4 unit tests verifying landmark roles

#### Implementation Notes

- Audit checklist per design-spec Screen 1:
  - `<header role="banner">` — top navigation bar ✓
  - `<nav role="navigation" aria-label="Main navigation">` — sidebar nav ✓
  - `<main id="main-content" role="main">` — content area ✓
  - `<footer role="contentinfo">` — footer ✓
  - Plugins group: `role="group"`, `aria-label="Plugins"`, `aria-expanded`
  - Active nav item: `aria-current="page"`
  - User menu button: `aria-haspopup="true"`, `aria-expanded`
  - Notification bell: `aria-label="Notifications"`
  - Language selector: `aria-label="Select language"`
- Use `@testing-library/react` `getByRole` queries to assert landmark presence
- If using `axe-core` (`jest-axe`), add a global accessibility test that runs `axe` against the shell — zero violations for WCAG AA rules

#### Test Requirements

- [ ] Unit: `<header role="banner">` present in AppLayout render output
- [ ] Unit: `<nav role="navigation" aria-label="Main navigation">` present in SidebarNav
- [ ] Unit: `<main id="main-content" role="main">` present in AppLayout
- [ ] Unit: `<footer role="contentinfo">` present in AppLayout
- [ ] Integration: N/A
- [ ] E2E: Covered by T005-23

#### Acceptance Criteria

- [ ] All four landmarks present: `banner`, `navigation` (with `aria-label`), `main` (with `id="main-content"`), `contentinfo`
- [ ] `aria-current="page"` on active sidebar nav item
- [ ] Plugins collapsible group has `role="group"`, `aria-label="Plugins"`, and `aria-expanded`
- [ ] No duplicate `role="main"` landmarks on any page
- [ ] Automated tests pass for all four landmark assertions

---

### T005-23: Navigation E2E Tests

**Phase**: Phase 5 — Accessibility & Polish  
**Story Points**: 1  
**Priority**: Medium  
**Status**: pending  
**FR References**: NFR-004, NFR-005  
**Dependencies**: All previous phases (all shell components must be implemented)

#### Description

Write 6 end-to-end tests covering the core navigation experiences that cannot be fully verified by unit tests: sidebar navigation between plugin pages, responsive sidebar overlay open/close on mobile viewport, breadcrumb navigation, skip-to-content link keyboard activation, keyboard Esc to close overlay, and overall tab order verification. Uses Playwright (per the project's E2E testing setup).

#### Files to Create

- `apps/web/src/__tests__/e2e/navigation.e2e.test.ts` — 6 E2E tests using Playwright

#### Implementation Notes

- Playwright setup: use existing E2E infrastructure (check `apps/web/playwright.config.ts` for base URL and auth helpers)
- Test 1 — Sidebar plugin navigation: click a plugin nav item → assert route changes to `/{pluginId}` and `PluginLoadingBoundary` shows skeleton then content
- Test 2 — Sidebar active state: navigate to `/crm` → assert CRM nav item has `aria-current="page"`
- Test 3 — Mobile overlay open/close: set viewport to 375 px → click hamburger → assert overlay visible → click backdrop → assert overlay hidden
- Test 4 — Mobile overlay Esc key: set viewport to 375 px → click hamburger → press Esc → assert overlay hidden, focus returns to hamburger
- Test 5 — Breadcrumb navigation: navigate to `/crm/contacts` → assert breadcrumb shows "Home > CRM > Contacts" → click "Home" → assert route is `/`
- Test 6 — Skip-to-content link: Tab from page load → assert skip link receives focus → press Enter → assert focus on `#main-content`

#### Test Requirements

- [ ] E2E: Sidebar plugin nav item click → route changes + active state set
- [ ] E2E: Sidebar overlay opens on hamburger click at 375 px viewport
- [ ] E2E: Overlay closes on backdrop click or Esc key
- [ ] E2E: Breadcrumb "Home" link navigates to `/`
- [ ] E2E: Skip-to-content link focusable as first tab stop
- [ ] E2E: Skip link Enter key moves focus to `#main-content`
- [ ] Integration: N/A
- [ ] Unit: N/A

#### Acceptance Criteria

- [ ] All 6 E2E tests pass in CI
- [ ] Tests run in < 3 minutes total (per plan §9.5 performance budget)
- [ ] Mobile overlay tests use Playwright `page.setViewportSize({ width: 375, height: 812 })`
- [ ] Tests are deterministic (no flakiness — wait for `aria-current` attribute, not arbitrary timeouts)
- [ ] Tests cover all scenarios from plan §9.3 E2E test table

---

## Summary

### Story Point Totals by Phase

| Phase                           | Tasks  | Story Points | Unit Tests | Integration Tests | E2E Tests |
| ------------------------------- | ------ | ------------ | ---------- | ----------------- | --------- |
| Phase 1: Shell Layout & Nav     | 6      | 12           | 22         | 2                 | 0\*       |
| Phase 2: Font & Theme Infra     | 5      | 9            | 13         | 0                 | 0         |
| Phase 3: Tenant Theme Settings  | 7      | 13           | 21         | 8                 | 4         |
| Phase 4: Auth UX Enhancements   | 2      | 5            | 7          | 0                 | 0         |
| Phase 5: Accessibility & Polish | 4      | 5            | 9          | 0                 | 6         |
| **Total**                       | **24** | **44**       | **72**     | **10**            | **10**    |

> \* Phase 1 E2E tests are written in Phase 5 (T005-23) after all components are in place.

### Total Test Count

| Type        | Count  | Plan Target | Δ       |
| ----------- | ------ | ----------- | ------- |
| Unit        | 72     | ~45         | +27     |
| Integration | 10     | ~10         | 0       |
| E2E         | 10     | ~10         | 0       |
| **Total**   | **92** | **~65**     | **+27** |

> The unit test count exceeds the plan target because task cards decomposed implicit tests more granularly. All targets from plan §9.4 are met or exceeded.

### Coverage Targets

| Module                   | Target | Notes                                    |
| ------------------------ | ------ | ---------------------------------------- |
| `contrast-utils.ts`      | ≥ 95%  | Critical accessibility logic (plan §9.4) |
| `font-loader.ts`         | ≥ 85%  | Core font infrastructure                 |
| `SidebarNav.tsx`         | ≥ 85%  | Core shell component                     |
| `ColorPickerField.tsx`   | ≥ 85%  | Form input with validation logic         |
| `settings.branding.tsx`  | ≥ 80%  | Complex form page                        |
| Overall (Spec 005 files) | ≥ 80%  | Constitution Article 4.1 minimum         |

### Tasks Requiring Clarification

| Task    | Item                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| T005-05 | `loadWidget()` import path TBC — depends on Spec 010 Phase 3 file structure                   |
| T005-07 | Default Plexica logo asset path — confirm `@/assets/plexica-logo.svg` exists or update path   |
| T005-18 | `WidgetFallback.tsx` exact file path — depends on Spec 010 Phase 3 implementation             |
| T005-20 | Dark mode colour generation algorithm — may need design review for extreme palette edge cases |

### Spec 010 Coordination Points

| This Task | Requires from Spec 010                 | Spec 010 Task |
| --------- | -------------------------------------- | ------------- |
| T005-05   | `loadWidget()` function                | T010-3.1      |
| T005-07   | `ThemeContext.theme.logo`              | T010-2.1      |
| T005-16   | `ThemeContext` with tenant fetch       | T010-2.1      |
| T005-18   | `WidgetFallback` component             | T010-3.3      |
| T005-20   | `applyTheme()`, `.dark` class toggling | T010-2.2      |
| T005-12   | `ThemeContext.updateTheme()`           | T010-2.1      |

---

## Cross-References

| Document                        | Path                                                      |
| ------------------------------- | --------------------------------------------------------- |
| Spec                            | `.forge/specs/005-frontend-architecture/spec.md`          |
| Plan                            | `.forge/specs/005-frontend-architecture/plan.md`          |
| Design Spec                     | `.forge/specs/005-frontend-architecture/design-spec.md`   |
| User Journeys                   | `.forge/specs/005-frontend-architecture/user-journey.md`  |
| Spec 010 (overlapping)          | `.forge/specs/010-frontend-production-readiness/tasks.md` |
| ADR-020: Font Hosting Strategy  | `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`   |
| ADR-009: TailwindCSS v4 Tokens  | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`   |
| ADR-011: Vite Module Federation | `.forge/knowledge/adr/adr-011-vite-module-federation.md`  |
| Constitution                    | `.forge/constitution.md`                                  |
| Decision Log                    | `.forge/knowledge/decision-log.md`                        |
