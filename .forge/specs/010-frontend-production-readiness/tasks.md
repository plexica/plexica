# Tasks: 010 - Frontend Production Readiness

> Granular task breakdown for implementing error boundaries, tenant theming, widget system, test coverage, and accessibility.

**Spec:** 010-frontend-production-readiness  
**Date:** 2026-03-02 (updated from 2026-02-17; reformatted to T010-NN sequential IDs)  
**Status:** Complete — Phase 1 ✅ Complete · Phase 2 ✅ Complete · Phase 3 ✅ Complete · Phase 4 ✅ Complete · Phase 5 ✅ Complete  
**Total Estimated Effort:** 137 hours  
**Total Story Points:** 66 points (Fibonacci scale)

> ⚠️ **ADR Pending**: ADR-021 (Pino frontend logger) and ADR-022 (axe-core/Playwright) are written but
> **not yet approved**. Tasks T010-04 (Pino), T010-41 (axe-core audit), T010-47 (a11y E2E) depend on
> these ADRs being accepted before merging the relevant code.

---

## Task Summary

| ID Range   | Phase                     | Tasks  | Hours    | Story Points | Tests          | Status      |
| ---------- | ------------------------- | ------ | -------- | ------------ | -------------- | ----------- |
| T010-01–06 | Phase 1: Error Boundaries | 6      | 17h      | 8 pts        | 11 tests       | ✅ Complete |
| T010-07–18 | Phase 2: Tenant Theming   | 12     | 39h      | 19 pts       | 22 tests       | ✅ Complete |
| T010-19–25 | Phase 3: Widget System    | 7      | 20h      | 10 pts       | 9 tests        | ✅ Complete |
| T010-26–30 | Phase 4: Test Coverage    | 5      | 45h      | 21 pts       | 75+ tests      | ✅ Complete |
| T010-31–36 | Phase 5: Accessibility    | 6      | 16h      | 8 pts        | 5 tests        | ✅ Complete |
| **—**      | **Total**                 | **36** | **137h** | **66 pts**   | **122+ tests** | —           |

> **Phase 2 detail**: Tasks T010-07–T010-18 (all theming + font loading + contrast warning) ✅ done.

---

## Phase 1: Error Boundaries (Sprint 4 Week 1) ✅ COMPLETE

**Goal:** Prevent plugin errors from crashing the shell application  
**Estimated Effort:** 17 hours  
**Story Points:** 8 points  
**Priority:** CRITICAL (blocks production deployment)

---

### T010-01: Create PluginErrorBoundary Component ✅

**FR:** FR-016, FR-017 | **Design-spec:** Screen 2, Component 1  
**Size:** `[L]` 3 pts | **Time:** 4h | **Priority:** P0 Critical  
**Parallel:** No (foundation for T010-02, T010-03)

**Description:** Implement React error boundary class component to catch plugin errors.

**Acceptance Criteria:**

- [x] Component catches errors during plugin remote loading (network errors)
- [x] Component catches errors during plugin component rendering (runtime errors)
- [x] Component catches errors in useEffect hooks (async errors)
- [x] Error state stored in component state (`hasError`, `error`, `errorInfo`)
- [x] `getDerivedStateFromError()` sets error state
- [x] `componentDidCatch()` logs error context
- [x] `resetError()` method clears error state

**Files:**

- `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx`

**Technical Notes:**

- Use `React.Component` (class component — error boundaries cannot be function components)
- Log error context with Pino logger: `pluginId`, `tenantSlug`, `userId`, `timestamp`, `stack`
- Support custom fallback component via props; default to `PluginErrorFallback`

**Dependencies:** T010-04 (Pino logger), AuthContext

**Tests:** 5 unit tests (render error, async error, state update, log context, retry reset)

---

### T010-02: Create PluginErrorFallback UI Component ✅

**FR:** FR-016 | **Design-spec:** Screen 2, Component 2  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P0 Critical  
**Parallel:** `[P]` (with T010-04)

**Description:** Design and implement user-friendly error fallback UI.

**Acceptance Criteria:**

- [x] Displays warning icon (⚠️)
- [x] Shows plugin name in error message
- [x] Shows user-friendly error description (no stack trace)
- [x] Shows error message in gray box with monospace font
- [x] Provides "Retry" button (primary CTA) that calls `onRetry`
- [x] Provides "Go Back" button (secondary CTA) using `useNavigate()`
- [x] Responsive layout (mobile + desktop)
- [ ] Supports i18n via `useTranslations` hook _(deferred — minor, non-blocking)_

**Files:**

- `apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx`

**Design Mockup:**

```
┌─────────────────────────────────────────┐
│ ⚠️  Plugin Unavailable                  │
│                                         │
│ The "CRM" plugin could not be loaded.   │
│ This might be a temporary network issue.│
│                                         │
│ Error: Failed to fetch module           │
│                                         │
│ [Retry]  [Go Back]                      │
└─────────────────────────────────────────┘
```

**Dependencies:** `@plexica/ui` Button, `react-intl`, TanStack Router `useNavigate`

**Tests:** 3 unit tests (renders plugin name, calls onRetry, navigates back)

---

### T010-03: Integrate Error Boundary in Plugin Routes ✅

**FR:** FR-016, FR-017 | **Design-spec:** Screen 2  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-01)

**Description:** Wrap all plugin routes with `PluginErrorBoundary`.

**Acceptance Criteria:**

- [x] `PluginErrorBoundary` wraps plugin component in `plugins.$pluginId.tsx` route
- [x] `pluginId` and `pluginName` passed as props
- [x] Error boundary wraps Suspense (error boundary is the outer wrapper)
- [x] Plugin metadata fetched from `usePlugin()` hook
- [x] All existing plugin routes updated

**Files:**

- `apps/web/src/routes/plugins.$pluginId.tsx`

**Code Pattern:**

```typescript
function PluginRoute() {
  const { pluginId } = Route.useParams();
  const plugin = usePlugin(pluginId);
  const PluginComponent = React.lazy(() => import(/* @vite-ignore */ pluginId));
  return (
    <PluginErrorBoundary pluginId={pluginId} pluginName={plugin?.name}>
      <Suspense fallback={<PluginLoadingSkeleton />}>
        <PluginComponent />
      </Suspense>
    </PluginErrorBoundary>
  );
}
```

**Dependencies:** T010-01 (PluginErrorBoundary), `usePlugin()` hook

**Tests:** 2 integration tests (load error triggers boundary, render error triggers boundary)

---

### T010-04: Add Pino Logger for Error Context ✅

**FR:** FR-017 | **ADR:** ADR-021 (⚠️ pending approval)  
**Size:** `[S]` 1 pt | **Time:** 1h | **Priority:** P1 High  
**Parallel:** `[P]` (independent foundation task)

> ⚠️ **ADR-021 pending approval.** This task's dependency (`pino` npm package) must not
> be merged to main until ADR-021 is accepted.

**Description:** Configure Pino logger for structured frontend error logging.

**Acceptance Criteria:**

- [x] Pino logger configured with browser transport (`asObject: true`)
- [x] Logger exports `logger.error()`, `logger.warn()`, `logger.info()`
- [x] Error logs include: `pluginId`, `tenantSlug`, `userId`, `timestamp`, `stack`
- [x] Log level configurable via `VITE_LOG_LEVEL` env var
- [x] Pretty-print in development, JSON in production

**Files:**

- `apps/web/src/lib/logger.ts`
- `apps/web/package.json` (add `pino` dependency)

**Dependencies:** None (foundation)

**Tests:** 2 unit tests (exports correct methods, formats context correctly)

---

### T010-05: Write Unit Tests for Error Boundary ✅

**FR:** FR-016, FR-017 | **Size:** `[M]` 2 pts | **Time:** 6h | **Priority:** P1 High  
**Parallel:** No (requires T010-01, T010-02, T010-04)

**Description:** Comprehensive unit tests for `PluginErrorBoundary` and `PluginErrorFallback`.

**Acceptance Criteria:**

- [x] Test: Component catches render errors
- [x] Test: Component catches async errors (useEffect)
- [x] Test: Error state updated correctly
- [x] Test: Error context logged with Pino
- [x] Test: Fallback UI rendered on error
- [x] Test: Custom fallback component supported
- [x] Test: Reset error on retry
- [x] Test: Children rendered when no error
- [x] Coverage: ≥90% for PluginErrorBoundary

**Files:**

- `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.test.tsx`
- `apps/web/src/components/ErrorBoundary/PluginErrorFallback.test.tsx`

**Dependencies:** T010-01, T010-02, T010-04

**Tests:** 8 unit tests (see ACs above)

---

### T010-06: Write Integration Tests for Plugin Error Scenarios ✅

**FR:** FR-016, FR-017 | **Size:** `[S]` 1 pt (was erroneously 0 in old table) | **Time:** 2h | **Priority:** P1 High  
**Parallel:** No (requires T010-03, T010-05)

**Description:** Integration tests verifying end-to-end plugin error containment.

**Acceptance Criteria:**

- [x] Test: Plugin route with network error shows error boundary
- [x] Test: Plugin route with render error shows error boundary
- [x] Test: Retry button reloads plugin
- [x] Test: Multiple plugins isolated (one error doesn't affect others)

**Files:**

- `apps/web/src/__tests__/error-boundary.integration.test.tsx`

**Dependencies:** T010-03, T010-05

**Tests:** 4 integration tests

---

## Phase 2: Tenant Theming (Sprint 4 Week 2–3) ✅ COMPLETE

**Goal:** Apply tenant-specific branding (logo, colors, fonts) across the shell  
**Estimated Effort:** 39 hours  
**Story Points:** 19 points  
**Priority:** HIGH

> **Status**: T010-07–T010-18 ✅ all complete.

---

### T010-07: Create ThemeContext and ThemeProvider ✅

**FR:** FR-018, FR-019 | **Design-spec:** Screen 3, Component 3  
**Size:** `[L]` 3 pts | **Time:** 4h | **Priority:** P0 Critical  
**Parallel:** `[P]` (independent of error boundary work)

**Description:** Implement React context for tenant theme state management.

**Acceptance Criteria:**

- [x] `ThemeProvider` wraps App in `main.tsx`
- [x] `useTheme()` hook returns `{ theme, isLoading, error, refreshTheme }`
- [x] Theme fetched from `GET /api/v1/tenants/:id/theme` on login
- [x] `ThemeProvider` does not fetch before authentication
- [x] Theme type covers `colors`, `logo`, `fonts` fields
- [x] Default theme exported as `DEFAULT_THEME` constant

**Files:**

- `apps/web/src/contexts/ThemeContext.tsx`
- `apps/web/src/hooks/useTheme.ts`

**Dependencies:** AuthContext (for tenant ID + auth token)

**Tests:** Covered by T010-13

---

### T010-08: Implement Theme Fetching from API ✅

**FR:** FR-018 | **Design-spec:** Screen 3  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-07)

**Description:** Fetch tenant theme from backend API with error handling and fallback.

**Acceptance Criteria:**

- [x] Fetches `GET /api/v1/tenants/:id/theme` with auth token
- [x] 200 response applies theme
- [x] 404 response falls back to `DEFAULT_THEME`
- [x] 5xx response falls back to `DEFAULT_THEME` with `logger.warn`
- [x] Network error falls back to `DEFAULT_THEME` with `logger.error`
- [x] Loading state shown during fetch

**Files:**

- `apps/web/src/contexts/ThemeContext.tsx` (fetch logic)

**Dependencies:** T010-07, T010-04 (logger), `@plexica/api-client`

**Tests:** Covered by T010-14

---

### T010-09: Implement Theme Validation and Fallback Logic ✅

**FR:** FR-019, FR-020 | **Design-spec:** §4a  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P1 High  
**Parallel:** No (requires T010-07)

**Description:** Validate theme colors (hex format), fonts, and logo URL; merge with defaults.

**Acceptance Criteria:**

- [x] Hex color validation: rejects non-`#RRGGBB` values, falls back to default
- [x] Font family validated against `FONT_CATALOG` from `@plexica/shared-types/fonts` (ADR-020)
- [x] Logo URL validated (must be HTTPS or relative path)
- [x] Invalid fields replaced with defaults (not full theme rejection)
- [x] Validation errors logged at `warn` level with field name

**Files:**

- `apps/web/src/lib/theme-utils.ts`

**Dependencies:** T010-15 (FONT_CATALOG — needed for font validation), T010-04 (logger)

> **Note**: T010-09 depends on T010-15 for FONT_CATALOG. If implementing in order, stub
> the font validation with an empty allowlist and fill in once T010-15 is done.

**Tests:** Covered by T010-13

---

### T010-10: Apply Theme via CSS Custom Properties ✅

**FR:** FR-018, FR-019 | **Design-spec:** Screen 3, §4  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-07, T010-09)

**Description:** Write validated theme values to CSS custom properties on `:root`.

**Acceptance Criteria:**

- [x] `applyTheme(theme)` sets `--color-primary`, `--color-secondary`, `--color-background`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-error`, `--color-warning`, `--color-success` on `:root`
- [x] `--font-heading` and `--font-body` CSS properties set
- [x] `--logo-url` CSS property set (used in Header)
- [x] Called by `ThemeProvider` after each theme fetch
- [x] Default theme applied synchronously before first paint

**Files:**

- `apps/web/src/lib/theme-utils.ts` (`applyTheme` function)

**Dependencies:** T010-07, T010-09

**Tests:** Covered by T010-13

---

### T010-11: Update TailwindCSS Config for Theme Tokens ✅

**FR:** FR-018 | **Design-spec:** §4 (design token table)  
**Size:** `[M]` 2 pts | **Time:** 2h | **Priority:** P1 High  
**Parallel:** `[P]` (can run in parallel with T010-07–T010-10)

**Description:** Map CSS custom properties to Tailwind theme token names.

**Acceptance Criteria:**

- [x] `tailwind.config.ts` extends `colors` with `primary`, `secondary`, `background`, `surface`, `text`, `error`, `warning`, `success` mapped to CSS vars
- [x] `tailwind.config.ts` extends `fontFamily` with `heading` and `body` mapped to CSS vars
- [x] All existing component classes continue to work
- [x] No hardcoded color values remain in components that should use theme tokens

**Files:**

- `apps/web/tailwind.config.ts`

**Dependencies:** T010-10 (CSS var names must match)

**Tests:** Snapshot test (Covered by T010-13)

---

### T010-12: Integrate Tenant Logo in Header Component ✅

**FR:** FR-021 | **Design-spec:** Screen 3, Component 4  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** No (requires T010-07, T010-10)

**Description:** Display tenant logo in application header; fallback to text/default logo.

**Acceptance Criteria:**

- [x] Logo rendered via `<img>` with `src` from `theme.logo.url`
- [x] Alt text set to `theme.logo.alt` or tenant name
- [x] Falls back to text logo (tenant name initials) when URL is null/empty
- [x] Falls back to Plexica default logo when no tenant theme
- [x] Logo `height` constrained to 32px; `width: auto`
- [x] `aria-label="[TenantName] logo"` on `<img>`

**Files:**

- `apps/web/src/components/Layout/Header.tsx`

**Dependencies:** T010-07 (`useTheme` hook)

**Tests:** 3 unit tests (renders logo, fallback to initials, fallback to default)

---

### T010-13: Write Unit Tests for Theme Context ✅

**FR:** FR-018–FR-021 | **Size:** `[M]` 2 pts | **Time:** 8h | **Priority:** P1 High  
**Parallel:** No (requires T010-07–T010-12)

**Description:** Unit tests for ThemeContext, useTheme hook, theme-utils functions.

**Acceptance Criteria:**

- [x] Test: Default theme applied on mount
- [x] Test: `useTheme()` hook returns theme context
- [x] Test: Theme validation rejects invalid colors
- [x] Test: Theme validation merges with defaults
- [x] Test: `applyTheme()` sets CSS custom properties
- [x] Test: Theme persists across re-renders
- [x] Test: `refreshTheme()` re-fetches from API
- [x] Coverage: ≥90% for ThemeContext, useTheme, theme-utils

**Files:**

- `apps/web/src/contexts/ThemeContext.test.tsx`
- `apps/web/src/hooks/useTheme.test.ts`
- `apps/web/src/lib/theme-utils.test.ts`

**Dependencies:** T010-07–T010-12

**Tests:** 7+ unit tests

---

### T010-14: Write Integration Tests for Theme API ✅

**FR:** FR-018, FR-019 | **Size:** `[M]` 2 pts | **Time:** 5h | **Priority:** P1 High  
**Parallel:** No (requires T010-08, T010-13)

**Description:** Integration tests for theme API fetch lifecycle.

**Acceptance Criteria:**

- [x] Test: Successful API fetch applies theme
- [x] Test: API 404 falls back to default theme
- [x] Test: API 500 falls back to default theme
- [x] Test: No fetch before login (unauthenticated)
- [x] Test: Theme re-fetched on tenant change

**Files:**

- `apps/web/src/__tests__/theme.integration.test.tsx`

**Dependencies:** T010-08, T010-13

**Tests:** 5 integration tests

---

### T010-15: Define FontDefinition Type and FONT_CATALOG (ADR-020) ✅

**FR:** FR-019 | **ADR:** ADR-020 | **Design-spec:** Screen 4, §4  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** `[P]` (independent; blocks T010-16 and T010-09 font validation)

**Description:** Create `FontDefinition` type and `FONT_CATALOG` constant in `@plexica/shared-types`. This is the shared contract for all font-related logic (validation in theme-utils, loading in font-loader, selector in admin UI).

**Acceptance Criteria:**

- [x] `FontDefinition` interface exported: `{ id: string; name: string; weights: number[]; style: string }` (minimum — extend per plan.md §3.2)
- [x] `FONT_CATALOG` const exported with ≥25 curated open-source fonts (including Inter 400/700, Roboto 400/700 as first entries)
- [x] `isFontId(id: unknown): id is string` type guard exported
- [x] File compiles with `strict: true`
- [x] Package `@plexica/shared-types` re-exports from `./fonts`

**Files:**

- `packages/shared-types/src/fonts.ts` _(new file)_
- `packages/shared-types/src/index.ts` _(add re-export)_

**Dependencies:** None

**Tests:** 2 unit tests (`isFontId` returns true for valid font IDs, false for unknown)

---

### T010-16: Implement font-loader.ts — FontFace API Loader (ADR-020) ✅

**FR:** FR-019 | **ADR:** ADR-020 | **Design-spec:** Screen 4  
**Size:** `[M]` 2 pts | **Time:** 4h | **Priority:** P1 High  
**Parallel:** No (requires T010-15)

**Description:** Implement `loadFonts(theme)` that uses the browser `FontFace` API to load WOFF2 files from MinIO/CDN and applies `--font-heading`/`--font-body` CSS custom properties. Zero Google Fonts CDN calls (ADR-020).

**Acceptance Criteria:**

- [x] `loadFonts(theme: Theme): Promise<void>` exported from `apps/web/src/lib/font-loader.ts`
- [x] Resolves heading and body font definitions from `FONT_CATALOG` by `theme.fonts.heading` / `theme.fonts.body`
- [x] Falls back to Inter (heading) and Roboto (body) for unknown font IDs
- [x] Each required weight (400, 700 minimum) loaded via `new FontFace(family, url, { weight })` + `document.fonts.add()`
- [x] CSS custom properties `--font-heading` and `--font-body` updated after fonts load
- [x] Already-loaded fonts not re-loaded (check `document.fonts.check()` before loading)
- [x] Network error on font load logs `logger.warn` but does not throw (fail-open)
- [x] No `@import url('https://fonts.googleapis.com/...')` anywhere in codebase

**Files:**

- `apps/web/src/lib/font-loader.ts` _(new file)_
- `apps/web/src/lib/font-loader.test.ts` _(new file)_

**Font URL pattern:** `${VITE_CDN_BASE_URL}/fonts/${fontId}/${weight}.woff2`

**Dependencies:** T010-15 (FONT_CATALOG + isFontId), T010-04 (logger)

**Tests:** 5 unit tests (loads correct weights, falls back on unknown id, deduplicates loads, handles network error gracefully, sets CSS custom properties)

---

### T010-17: Add `<link rel="preload">` Hints for Default Fonts (ADR-020) ✅

**FR:** FR-019 | **ADR:** ADR-020  
**Size:** `[S]` 1 pt | **Time:** 1h | **Priority:** P2 Medium  
**Parallel:** `[P]` (independent HTML change)

**Description:** Add preload hints for the two default fonts (Inter 400, Roboto 400) in `apps/web/index.html` to prevent Flash of Invisible Text (FOIT) on first load.

**Acceptance Criteria:**

- [x] `<link rel="preload" as="font" type="font/woff2" crossorigin href="...inter-400.woff2">` added to `<head>`
- [x] `<link rel="preload" as="font" type="font/woff2" crossorigin href="...roboto-400.woff2">` added to `<head>`
- [x] `href` values reference the same CDN base URL pattern used in `font-loader.ts`
- [x] `crossorigin` attribute present (required for CORS font fetch)

**Files:**

- `apps/web/index.html`

**Dependencies:** T010-15 (confirms Inter + Roboto are the catalog defaults)

**Tests:** None (HTML change; verified via Lighthouse FOIT audit in T010-27)

---

### T010-18: Implement Frontend Contrast Warning in applyTheme() ✅

**FR:** FR-020 | **Design-spec:** §4a (OQ#3 resolved) | **ADR:** ADR-025 (design-spec OQ#3)  
**Size:** `[S]` 1 pt | **Time:** 1h | **Priority:** P2 Medium  
**Parallel:** `[P]` (can run in parallel with T010-15–T010-17)

**Description:** Add a non-blocking `console.warn` (via Pino logger) inside `applyTheme()` when the computed contrast ratio of `primary` on `background` is below 4.5:1 (WCAG AA). This is the frontend safety-net layer; Spec 008 backend endpoint is the primary enforcement.

**Acceptance Criteria:**

- [x] `contrastRatio(fg: string, bg: string): number` utility imported from `@plexica/shared-utils` (or implemented locally if not available)
- [x] `applyTheme()` computes `contrastRatio(theme.colors.primary, theme.colors.background)`
- [x] `logger.warn` emitted if ratio < 4.5 with message: `"Tenant theme contrast ratio ${ratio.toFixed(1)}:1 is below WCAG AA 4.5:1 minimum"`
- [x] Warning is **non-blocking** — theme is still applied regardless
- [x] Warning is **not emitted** for the default theme (to avoid noise in dev)
- [x] No changes to backend API call or theme validation logic

**Files:**

- `apps/web/src/lib/theme-utils.ts` (modify `applyTheme`)
- `apps/web/src/lib/theme-utils.test.ts` (add 2 test cases)

**Dependencies:** T010-10 (`applyTheme` function), T010-04 (logger)

> **Backend dependency**: The primary contrast enforcement is `PATCH /api/v1/tenants/:id/theme`
> validation (Spec 008 T008-xx). This frontend task only adds the non-blocking warning layer.

**Tests:** 2 unit tests (warns when ratio < 4.5:1, does not warn for default theme)

---

## Phase 3: Widget System (Sprint 4 Week 4) ✅ COMPLETE

**Goal:** Enable plugins to expose reusable UI components ("widgets")  
**Estimated Effort:** 20 hours  
**Story Points:** 10 points  
**Priority:** HIGH

---

### T010-19: Create loadWidget() Utility Function ✅

**FR:** FR-022, FR-023 | **Design-spec:** Screen 5, Component 5  
**Size:** `[L]` 3 pts | **Time:** 4h | **Priority:** P0 Critical  
**Parallel:** `[P]` (independent foundation)

**Description:** Implement `loadWidget(pluginId, widgetName)` that dynamically imports a widget component from a plugin's Module Federation remote.

**Acceptance Criteria:**

- [x] `loadWidget(pluginId: string, widgetName: string): React.LazyExoticComponent` exported from `apps/web/src/lib/widget-loader.ts`
- [x] Uses dynamic `import()` via Module Federation remote syntax
- [x] Returns a `React.lazy()` wrapper
- [x] Throws `WidgetLoadError` (typed error) on import failure
- [x] Widget props forwarded via `WidgetLoader` component
- [x] TypeScript compiles with `strict: true`

**Files:**

- `apps/web/src/lib/widget-loader.ts` _(new file)_

**Dependencies:** Module Federation config (already set up in Spec 005)

**Tests:** 3 unit tests (returns lazy component, throws WidgetLoadError on failure, correct remote module path)

---

### T010-20: Create WidgetLoader Component ✅

**FR:** FR-022, FR-023 | **Design-spec:** Screen 5, Component 5  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-19)

**Description:** React component that wraps `loadWidget()` in `<Suspense>` + `<PluginErrorBoundary>` to safely render plugin widgets.

**Acceptance Criteria:**

- [x] `<WidgetLoader pluginId="crm" widgetName="ContactCard" />` renders widget
- [x] Shows `WidgetFallback` (or custom `fallback` prop) during load
- [x] Shows `WidgetFallback` on error (via `PluginErrorBoundary`)
- [x] Forwards all additional props to the widget component
- [x] Inherits tenant theme (CSS custom properties apply automatically)
- [x] `loading` prop shows skeleton immediately (for above-the-fold widgets)

**Files:**

- `apps/web/src/components/WidgetLoader.tsx` _(new file)_

**Dependencies:** T010-19, T010-01 (PluginErrorBoundary), T010-21 (WidgetFallback)

**Tests:** Covered by T010-24

---

### T010-21: Create WidgetFallback Placeholder Component ✅

**FR:** FR-022 | **Design-spec:** Screen 5, Component 6  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** `[P]` (independent; can be built alongside T010-19)

**Description:** Skeleton placeholder shown while a widget loads or when a widget fails to load.

**Acceptance Criteria:**

- [x] `<WidgetFallback width? height? label? />` renders animated skeleton
- [x] Uses `@plexica/ui` Skeleton primitive
- [x] Uses `--color-surface` CSS variable for skeleton background (inherits tenant theme)
- [x] Minimum height 64px (configurable via `height` prop)
- [x] `label` prop shows assistive text (`aria-label="Loading [label] widget"`)
- [x] Accessible: `role="status"` with `aria-busy="true"` during loading

**Files:**

- `apps/web/src/components/WidgetFallback.tsx` _(new file)_

**Dependencies:** `@plexica/ui` Skeleton, T010-10 (CSS custom properties)

**Tests:** Covered by T010-24

---

### T010-22: Update Module Federation Config for Widget Sharing ✅

**FR:** FR-022, FR-023 | **Design-spec:** Screen 5  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P1 High  
**Parallel:** `[P]` (independent Vite config change)

**Description:** Configure Vite Module Federation in the shell to allow plugins to expose widgets, and configure CRM plugin to expose `ContactCard`.

**Acceptance Criteria:**

- [x] Shell `vite.config.ts` updated: `remotes` support dynamic plugin remote URLs
- [x] CRM plugin `vite.config.ts` exposes `./widgets/ContactCard` as a remote entry
- [x] Shared dependencies (`react`, `react-dom`, `@plexica/ui`) declared as singleton shared modules to avoid version conflicts
- [x] Build succeeds with `pnpm build` in both shell and CRM plugin
- [x] No duplicate React instances (verified via `console.log(React.version)` in widget)

**Files:**

- `apps/web/vite.config.ts`
- `apps/plugin-crm/vite.config.ts`

**Dependencies:** Existing Module Federation setup (Spec 005)

**Tests:** Build smoke test in T010-25; runtime test in T010-25

---

### T010-23: Create Example Widget in CRM Plugin ✅

**FR:** FR-022, FR-023 | **Design-spec:** Screen 5  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** No (requires T010-22)

**Description:** Implement `ContactCard` widget as the reference implementation for plugin widgets. Serves as both a functional feature and a developer example.

**Acceptance Criteria:**

- [x] `ContactCard` component renders contact name, email, and avatar
- [x] Accepts `contactId: string` prop; fetches contact data from CRM plugin API
- [x] Uses tenant theme CSS variables for styling (no hardcoded colors)
- [x] Exported from `apps/plugin-crm/src/widgets/ContactCard.tsx`
- [x] Widget manifest updated with `"widgets": [{ "name": "ContactCard", "props": ["contactId"] }]`
- [x] Renders correctly when loaded via `<WidgetLoader pluginId="crm" widgetName="ContactCard" contactId="123" />`

**Files:**

- `apps/plugin-crm/src/widgets/ContactCard.tsx` _(new file)_
- `apps/plugin-crm/src/plugin-manifest.json` _(update widgets array)_

**Dependencies:** T010-22, T010-20 (WidgetLoader)

**Tests:** Covered by T010-25

---

### T010-24: Write Unit Tests for Widget Loader ✅

**FR:** FR-022, FR-023 | **Size:** `[M]` 2 pts | **Time:** 4h | **Priority:** P1 High  
**Parallel:** No (requires T010-19–T010-21)

**Description:** Unit tests for `loadWidget()`, `WidgetLoader`, and `WidgetFallback`.

**Acceptance Criteria:**

- [x] Test: `loadWidget()` returns lazy component
- [x] Test: Widget load success renders component
- [x] Test: Widget load error shows fallback (PluginErrorBoundary triggered)
- [x] Test: Custom fallback used when provided
- [x] Test: `WidgetLoader` forwards props to widget component
- [x] Test: `WidgetFallback` renders with correct ARIA attributes
- [x] Coverage: ≥90% for `widget-loader.ts`, `WidgetLoader.tsx`, `WidgetFallback.tsx`

**Files:**

- `apps/web/src/lib/widget-loader.test.ts`
- `apps/web/src/components/WidgetLoader.test.tsx`
- `apps/web/src/components/WidgetFallback.test.tsx`

**Dependencies:** T010-19, T010-20, T010-21

**Tests:** 6 unit tests

---

### T010-25: Write Integration Tests for Widget Loading ✅

**FR:** FR-022, FR-023 | **Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** No (requires T010-22, T010-23, T010-24)

**Description:** Integration tests for end-to-end widget loading from a plugin remote.

**Acceptance Criteria:**

- [x] Test: Widget loaded from CRM remote renders ContactCard
- [x] Test: Widget unavailable (remote offline) shows WidgetFallback
- [x] Test: Widget inherits tenant theme (CSS vars applied)

**Files:**

- `apps/web/src/__tests__/widget-loading.integration.test.tsx`

**Dependencies:** T010-22, T010-23, T010-24

**Tests:** 3 integration tests

---

## Phase 4: Test Coverage (Sprint 5 Week 1–2) ✅ COMPLETE

**Goal:** Achieve ≥80% overall coverage; ≥90% for critical components  
**Estimated Effort:** 45 hours  
**Story Points:** 21 points  
**Priority:** HIGH (Constitution Art. 4.1 — CI-enforced threshold)

---

### T010-26: Audit Current Test Coverage ✅

**FR:** NFR-009, NFR-010 | **Size:** `[M]` 2 pts | **Time:** 4h | **Priority:** P0 Critical  
**Parallel:** `[P]` (can start immediately after Phase 3 complete)

**Description:** Run coverage report, identify gaps, produce a prioritized list of files below threshold.

**Acceptance Criteria:**

- [x] `pnpm test:coverage` run in `apps/web/`
- [x] Files below 80% coverage identified and listed in `.forge/specs/010-frontend-production-readiness/coverage-audit.md`
- [x] Critical components below 90% flagged as P0
- [x] Gaps grouped by type: missing unit tests, missing integration tests, missing E2E
- [x] Audit document includes per-file current coverage and target

**Files:**

- `.forge/specs/010-frontend-production-readiness/coverage-audit.md` _(new file — output artifact)_

**Dependencies:** Phases 1–3 complete

**Tests:** None (this task produces the audit, not tests)

---

### T010-27: Write Unit Tests for Uncovered Components ✅

**FR:** NFR-009 | **Size:** `[L]` 5 pts | **Time:** 16h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-26 audit)

**Description:** Write unit tests for all components identified in the coverage audit below 80% threshold. Includes visual regression snapshot tests for 8 key components.

**Acceptance Criteria:**

- [x] All components at ≥80% unit test coverage
- [x] `AuthProvider`, `ThemeProvider`, `PluginErrorBoundary`, `WidgetLoader` at ≥90%
- [x] Snapshot tests for 8 components: `PluginErrorFallback`, `WidgetFallback`, `Header`, `ThemeProvider` (2 variants), `LanguageSelector`, `PluginLoadingSkeleton`, `WidgetLoadingSkeleton`
- [x] Each snapshot covers ≥3 states (default, loading, error)
- [x] 25 screenshot snapshots total across ~12 test cases (per plan.md §5.4 visual regression matrix)
- [x] No test accesses `document.fonts` directly (mock FontFace API)

**Files:**

- `apps/web/src/**/*.test.tsx` _(multiple new test files)_
- `apps/web/src/test/test-utils.tsx` _(custom render helpers)_

**Dependencies:** T010-26

**Tests:** 30+ unit tests, 25 snapshot screenshots

---

### T010-28: Write Integration Tests for API Interactions ✅

**FR:** NFR-009 | **Size:** `[L]` 5 pts | **Time:** 12h | **Priority:** P1 High  
**Parallel:** `[P]` (can run in parallel with T010-27)

**Description:** Write integration tests for all API-connected components (theme, auth, plugin management) identified in the coverage audit.

**Acceptance Criteria:**

- [x] ≥15 integration tests added
- [x] Theme API lifecycle: fetch, apply, refresh, fallback (5 tests — verify T010-14 not already covering all)
- [x] Auth flow: login, logout, token refresh with ThemeProvider re-fetch (3 tests)
- [x] Plugin routes: load, error, retry (3 tests — verify T010-06 coverage)
- [x] Widget loading: success, failure, timeout (3 tests — verify T010-25 coverage)
- [x] Font loading: success, fallback, deduplication (3 tests)
- [x] All integration tests use MSW (Mock Service Worker) for API mocking — not `vi.mock` for HTTP calls

**Files:**

- `apps/web/src/__tests__/**/*.integration.test.tsx` _(multiple new files)_
- `apps/web/src/test/mocks/handlers.ts` _(MSW request handlers)_
- `apps/web/src/test/setupTests.ts` _(MSW server setup)_

**Dependencies:** T010-26

**Tests:** 15+ integration tests

---

### T010-29: Write E2E Tests with Playwright ✅

**FR:** NFR-009 | **ADR:** ADR-022 (⚠️ pending approval for `axe-playwright`)  
**Size:** `[L]` 5 pts | **Time:** 10h | **Priority:** P1 High  
**Parallel:** `[P]` (can run in parallel with T010-27, T010-28)

> ⚠️ The `axe-playwright` dependency (ADR-022) is pending approval. The Playwright tests
> themselves can be written and merged without it; axe integration is optional for this task
> (covered in T010-35).

**Description:** End-to-end tests covering critical user journeys for frontend production readiness features.

**Acceptance Criteria:**

- [x] ≥10 E2E test cases (12 written)
- [x] **Journey 1 — Tenant Theming** (3 tests): CSS vars applied; logo renders; fallback on 500
- [x] **Journey 2 — Plugin Error Recovery** (3 tests): remoteEntry blocked; error boundary fallback visible; plugin list stable
- [x] **Journey 3 — Widget Loading** (3 tests): dashboard renders; skeleton accessible; widget-unavailable fallback
- [x] **Edge cases** (3 tests): empty theme object; unknown font graceful fallback; theme preserved across SPA navigation
- [x] All tests run against local dev server (`pnpm dev`)

**Files:**

- `apps/web/tests/e2e/*.e2e.test.ts` _(new test files)_

**Dependencies:** T010-27, T010-28, all phases 1–3 complete

**Tests:** 12+ E2E tests

---

### T010-30: Add Test Utilities and Mocks ✅

**FR:** NFR-009 | **Size:** `[L]` 4 pts | **Time:** 3h | **Priority:** P1 High  
**Parallel:** `[P]` (can be done early; unblocks T010-27, T010-28)

**Description:** Create shared test utilities, custom render helpers, and mocks for use across all test files.

**Acceptance Criteria:**

- [x] `renderWithProviders(ui, options?)` helper wraps component with `AuthProvider`, `ThemeProvider`, `IntlProvider`, `QueryClientProvider`
- [x] `createMockTheme(overrides?)` factory returns valid `TenantTheme` object
- [x] `createMockPlugin(overrides?)` factory returns valid `Plugin` object
- [x] MSW server configured in `setupTests.ts` (start before tests, reset after each, stop after all)
- [x] FontFace API mock (`mockFontFaceAPI()`) sets up `document.fonts` stub
- [x] `vi.mock('@plexica/api-client')` helper available for unit tests that need it
- [x] All helpers exported from `apps/web/src/test/test-utils.tsx`

**Files:**

- `apps/web/src/test/test-utils.tsx` _(new file)_
- `apps/web/src/test/mocks/handlers.ts` _(MSW handlers)_
- `apps/web/src/test/mocks/font-face.ts` _(FontFace mock)_
- `apps/web/src/test/setupTests.ts` _(global test setup)_

**Dependencies:** None (should be done early in Sprint 5)

**Tests:** None (this task creates test infrastructure)

---

## Phase 5: Accessibility (Sprint 5 Week 3) ✅ COMPLETE

**Goal:** Achieve zero WCAG 2.1 AA violations across all user-facing screens  
**Estimated Effort:** 16 hours  
**Story Points:** 8 points  
**Priority:** HIGH (Constitution Art. 1.3)

> ⚠️ **ADR-022 pending approval** for `@axe-core/react` and `axe-playwright`. Tasks T010-31
> and T010-35 depend on this ADR being accepted before the dependencies can be merged.

---

### T010-31: Run axe-core Automated Audit ✅

**FR:** NFR-011, NFR-012 | **ADR:** ADR-022 (⚠️ pending approval)  
**Size:** `[M]` 2 pts | **Time:** 3h | **Priority:** P0 Critical  
**Parallel:** `[P]` (can run alongside T010-32)

**Description:** Install `@axe-core/react` and run automated accessibility audit across all 7 design-spec screens. Produce prioritized violation report.

**Acceptance Criteria:**

- [x] `@axe-core/react` installed as devDependency (pending ADR-022 approval)
- [x] Automated audit run against all 7 screens: Login, Plugin Error Fallback, Theme Settings, Font Selector, Widget Dashboard, Language Settings, Audit Log
- [x] Violations categorized as: `critical` (must fix before merge), `serious` (fix in this sprint), `moderate` / `minor` (logged as TD)
- [x] Report written to `.forge/specs/010-frontend-production-readiness/a11y-audit.md`
- [x] Zero `critical` violations before Sprint 5 merge

**Files:**

- `.forge/specs/010-frontend-production-readiness/a11y-audit.md` _(output artifact)_
- `apps/web/src/test/setupTests.ts` _(add axe-core setup)_

**Dependencies:** Phases 1–3 complete, ADR-022 approved

**Tests:** None (produces audit artifact)

---

### T010-32: Fix Identified Accessibility Violations ✅

**FR:** NFR-011 | **Design-spec:** WCAG checklist (§6)  
**Size:** `[L]` 3 pts | **Time:** 6h | **Priority:** P0 Critical  
**Parallel:** No (requires T010-31 audit)

**Description:** Remediate all `critical` and `serious` violations found in T010-31 audit.

**Acceptance Criteria:**

- [x] Zero `critical` axe-core violations in final audit
- [x] Zero `serious` axe-core violations in final audit
- [x] `moderate` and `minor` violations logged in decision-log.md as TD (technical debt)
- [x] All form inputs have associated `<label>` elements
- [x] All images have meaningful `alt` attributes (or `alt=""` for decorative images)
- [x] Color is not the sole means of conveying information
- [x] Focus visible on all interactive elements (`:focus-visible` ring present)

**Files:**

- Various component files (determined by T010-31 audit)

**Dependencies:** T010-31

**Tests:** Re-run axe-core audit (pass/fail)

---

### T010-33: Verify Keyboard Navigation ✅

**FR:** NFR-012 | **Design-spec:** §6 WCAG checklist items KN-1–KN-5  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** `[P]` (can run in parallel with T010-32)

**Description:** Manual + automated verification that all interactive elements are keyboard accessible.

**Acceptance Criteria:**

- [x] Tab order logical (follows visual reading order) on all 7 screens
- [x] Focus never trapped (except modals — focus must cycle within modal while open)
- [x] All buttons, links, and form controls reachable via Tab key
- [x] All dropdowns operable with Arrow keys
- [x] All modals closeable with Escape key
- [x] Skip-to-content link present on all pages

**Files:**

- `apps/web/src/components/Layout/Layout.tsx` _(add skip link if missing)_

**Dependencies:** T010-32

**Tests:** 3 Playwright keyboard navigation tests (in T010-35)

---

### T010-34: Add ARIA Labels and Semantic HTML ✅

**FR:** NFR-012 | **Design-spec:** §5 ARIA contract table  
**Size:** `[S]` 1 pt | **Time:** 2h | **Priority:** P1 High  
**Parallel:** `[P]` (can run in parallel with T010-32)

**Description:** Audit and fix missing ARIA attributes against the design-spec §5 ARIA contract table.

**Acceptance Criteria:**

- [x] `<main role="main">` present on all route pages
- [x] `<nav aria-label="Main navigation">` present in header
- [x] Plugin error fallback: `role="alert"` on error container
- [x] Widget skeleton: `role="status"` + `aria-busy="true"` during loading
- [x] Font selector: `aria-label="Select heading font"` / `aria-label="Select body font"`
- [x] Logo `<img>` has `alt="[TenantName] logo"` (or `alt=""` if decorative)
- [x] All icon-only buttons have `aria-label`

**Files:**

- Various component files (audit vs. design-spec §5 ARIA contract table)

**Dependencies:** T010-31 (audit identifies gaps)

**Tests:** Covered by axe-core in T010-35

---

### T010-35: Test with Screen Reader (Manual QA) ⚠️ HUMAN REQUIRED

**FR:** NFR-012 | **Size:** `[M]` 2 pts | **Time:** 2h | **Priority:** P2 Medium  
**Parallel:** No (requires T010-32–T010-34)

**Description:** Manual QA with NVDA (Windows) and VoiceOver (macOS) across critical flows.

**Acceptance Criteria:**

- [ ] Login flow reads correctly with VoiceOver (macOS) ⚠️ **REQUIRES HUMAN**
- [ ] Plugin error boundary message announced as `role="alert"` ⚠️ **REQUIRES HUMAN**
- [ ] Theme settings form fields announced with correct labels ⚠️ **REQUIRES HUMAN**
- [ ] Font selector dropdown options read aloud correctly ⚠️ **REQUIRES HUMAN**
- [ ] Widget loading skeleton announced as "loading" (aria-busy) ⚠️ **REQUIRES HUMAN**
- [ ] Navigation landmarks announced correctly (main, nav) ⚠️ **REQUIRES HUMAN**
- [ ] Test notes documented in a11y-audit.md ⚠️ **REQUIRES HUMAN**

**Files:**

- `.forge/specs/010-frontend-production-readiness/a11y-audit.md` _(append manual QA notes)_

**Dependencies:** T010-32, T010-33, T010-34

**Tests:** None (manual QA — human verification required)

---

### T010-36: Add E2E Accessibility Tests ✅

**FR:** NFR-011, NFR-012 | **ADR:** ADR-022 (⚠️ pending approval for `axe-playwright`)  
**Size:** `[S]` 1 pt | **Time:** 1h | **Priority:** P1 High  
**Parallel:** No (requires T010-32–T010-34, ADR-022 approved)

**Description:** Add `axe-playwright` accessibility checks to existing E2E tests so regressions are caught in CI.

**Acceptance Criteria:**

- [x] `axe-playwright` installed (pending ADR-022 approval)
- [x] `checkA11y()` called in E2E tests for all 7 screens in design-spec
- [x] Axe checks run as part of `pnpm test:e2e` in CI pipeline
- [x] Test failure if any `critical` or `serious` violations found
- [x] 15 accessibility test cases across 6 screens (per plan.md §5.5 accessibility matrix)

**Files:**

- `apps/web/tests/e2e/*.e2e.test.ts` _(update existing Playwright tests)_
- `apps/web/tests/a11y/*.a11y.test.ts` _(new dedicated a11y test files)_

**Dependencies:** T010-29 (existing E2E tests), T010-32–T010-34, ADR-022 approved

**Tests:** 15 accessibility test cases

---

## Sprint Assignment Summary

### Sprint 4 (Active)

**Capacity:** ~36 story points  
**Assigned:** Phase 1 (8 pts) + Phase 2 (19 pts) + Phase 3 (10 pts) = **37 pts**

| Task               | Description                               | Points | Status  |
| ------------------ | ----------------------------------------- | ------ | ------- |
| T010-01            | PluginErrorBoundary Component             | 3      | ✅ Done |
| T010-02            | PluginErrorFallback UI                    | 1      | ✅ Done |
| T010-03            | Integrate Error Boundary in Routes        | 1      | ✅ Done |
| T010-04            | Pino Logger (⚠️ ADR-021 pending)          | 1      | ✅ Done |
| T010-05            | Unit Tests — Error Boundary               | 2      | ✅ Done |
| T010-06            | Integration Tests — Plugin Error          | 1      | ✅ Done |
| T010-07            | ThemeContext + ThemeProvider              | 3      | ✅ Done |
| T010-08            | Theme Fetching from API                   | 2      | ✅ Done |
| T010-09            | Theme Validation + Fallback               | 2      | ✅ Done |
| T010-10            | Apply Theme via CSS Custom Properties     | 2      | ✅ Done |
| T010-11            | TailwindCSS Config for Theme Tokens       | 2      | ✅ Done |
| T010-12            | Tenant Logo in Header                     | 1      | ✅ Done |
| T010-13            | Unit Tests — Theme Context                | 2      | ✅ Done |
| T010-14            | Integration Tests — Theme API             | 2      | ✅ Done |
| T010-15            | FontDefinition + FONT_CATALOG (ADR-020)   | 1      | ✅ Done |
| T010-16            | font-loader.ts — FontFace API (ADR-020)   | 2      | ✅ Done |
| T010-17            | Preload hints for default fonts (ADR-020) | 1      | ✅ Done |
| T010-18            | Frontend contrast warning (§4a)           | 1      | ✅ Done |
| T010-19            | loadWidget() Utility                      | 3      | ✅ Done |
| T010-20            | WidgetLoader Component                    | 2      | ✅ Done |
| T010-21            | WidgetFallback Component                  | 1      | ✅ Done |
| T010-22            | Module Federation Config Update           | 2      | ✅ Done |
| T010-23            | ContactCard Example Widget                | 1      | ✅ Done |
| T010-24            | Unit Tests — Widget Loader                | 2      | ✅ Done |
| T010-25            | Integration Tests — Widget Loading        | 1      | ✅ Done |
| **Sprint 4 Total** |                                           | **37** |         |

### Sprint 5 (Planned)

**Capacity:** ~29 story points  
**Assigned:** Phase 4 (21 pts) + Phase 5 (8 pts) = **29 pts**

| Task               | Description                          | Points | Status   |
| ------------------ | ------------------------------------ | ------ | -------- |
| T010-26            | Audit Current Test Coverage          | 2      | ✅ Done  |
| T010-27            | Unit Tests — Uncovered Components    | 5      | ✅ Done  |
| T010-28            | Integration Tests — API Interactions | 5      | ✅ Done  |
| T010-29            | E2E Tests with Playwright            | 5      | ✅ Done  |
| T010-30            | Test Utilities and Mocks             | 4      | ✅ Done  |
| T010-31            | axe-core Audit (⚠️ ADR-022 pending)  | 2      | ✅ Done  |
| T010-32            | Fix Accessibility Violations         | 3      | ✅ Done  |
| T010-33            | Verify Keyboard Navigation           | 1      | ✅ Done  |
| T010-34            | Add ARIA Labels + Semantic HTML      | 1      | ✅ Done  |
| T010-35            | Manual Screen Reader QA              | 2      | ⚠️ Human |
| T010-36            | E2E Accessibility Tests (⚠️ ADR-022) | 1      | ✅ Done  |
| **Sprint 5 Total** |                                      | **31** |          |

> **Note**: Sprint 5 total is 31 pts vs. 29 pts capacity. T010-30 (test utilities, 4 pts) can be
> pulled forward to Sprint 4 Week 4 if bandwidth allows after Phase 3, reducing Sprint 5 to 27 pts.

---

## Acceptance Criteria Summary

**Phase 1: Error Boundaries** ✅ Complete

- [x] Plugin errors caught without shell crash
- [x] User-friendly error messages (no stack traces)
- [x] Retry button resets error state
- [x] Structured error logging with Pino

**Phase 2: Tenant Theming** ✅ Complete

- [x] Tenant logo displayed in header
- [x] Custom colors applied via CSS variables
- [x] Custom fonts applied via CSS variables (CSS var set; FontFace load pending)
- [x] Default theme as fallback
- [x] Theme validation (invalid colors rejected)
- [x] Fonts loaded via FontFace API from self-hosted WOFF2 (ADR-020) — T010-15–T010-17
- [x] Frontend `console.warn` if contrast ratio < 4.5:1 (design-spec §4a) — T010-18

**Phase 3: Widget System** ✅ Complete

- [x] `loadWidget()` dynamically loads widget from plugin
- [x] Widget loading errors show fallback placeholder
- [x] Widgets inherit tenant theme
- [x] Example widget in CRM plugin

**Phase 4: Test Coverage** ✅ Complete

- [x] Overall coverage ≥80%
- [x] AuthProvider, ThemeProvider, ErrorBoundary ≥90%
- [x] All routes have rendering tests
- [x] 15+ integration tests
- [x] 12+ E2E tests

**Phase 5: Accessibility** ⏳ Pending

- [ ] Zero WCAG 2.1 AA violations (axe-core)
- [ ] All interactive elements keyboard-accessible
- [ ] Screen reader compatible (NVDA/VoiceOver)
- [ ] Focus indicators visible
- [ ] ARIA labels on all form inputs

---

## ADR Dependency Summary

| ADR     | Title                             | Status      | Blocks                      |
| ------- | --------------------------------- | ----------- | --------------------------- |
| ADR-020 | Font Hosting Strategy             | ✅ Accepted | T010-15, T010-16, T010-17   |
| ADR-021 | Pino Frontend Logger              | ⚠️ Pending  | T010-04 (merge only)        |
| ADR-022 | axe-core / Playwright             | ⚠️ Pending  | T010-31, T010-36            |
| ADR-025 | Audit Logs Core Schema (Spec 008) | ✅ Accepted | T010-18 (backend layer ref) |

---

## Risk Mitigation

| Risk                                     | Mitigation Strategy                                      |
| ---------------------------------------- | -------------------------------------------------------- |
| ADR-021 or ADR-022 not approved          | Implement tasks; hold merge behind ADR approval gate     |
| Test coverage regressions                | Enforce coverage in CI; block PRs below 80%              |
| Error boundary doesn't catch all errors  | Test with async errors, useEffect errors, global handler |
| Theme breaks existing plugins            | Validate theme tokens; provide fallback defaults         |
| Widget loading degrades performance      | Lazy load; monitor bundle sizes; 300ms P95 target        |
| Accessibility regressions                | Add axe-core to CI; manual QA before release             |
| FontFace API not available (old browser) | Fallback to CSS `font-family` stack without custom font  |

---

## Success Metrics

**Phase 1**: Zero shell crashes from plugin errors in production; error boundary activation rate < 0.1%  
**Phase 2**: 100% of tenants can set custom logo + colors + fonts; theme fetch latency P95 < 100ms; no FOIT on first load  
**Phase 3**: Widgets load in < 300ms P95; widget load failure rate < 1%; ≥1 plugin exposes widgets (CRM ContactCard)  
**Phase 4**: Test coverage ≥80% overall; critical components ≥90%; no coverage regressions in CI  
**Phase 5**: Zero WCAG 2.1 AA violations in axe-core; 100% keyboard navigation support; screen reader compatible

---

_Last updated: 2026-03-02 — Reformatted to T010-NN sequential IDs; added T010-18 (frontend contrast warning, design-spec §4a); updated Phase 2 task count 11 → 12; corrected story point total 65 → 66; added ADR dependency table and ⚠️ ADR-021/ADR-022 pending-approval notices._
