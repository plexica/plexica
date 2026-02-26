# Plan: 005 - Frontend Architecture

> Technical implementation plan for the Plexica frontend application shell,
> Module Federation plugin loading, tenant theming, widget system, auth context,
> and route management.
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                  |
| ------ | -------------------------------------- |
| Status | Draft                                  |
| Author | forge-architect                        |
| Date   | 2026-02-26                             |
| Track  | Feature                                |
| Spec   | [005-frontend-architecture](./spec.md) |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Coordination with Spec 010](#2-coordination-with-spec-010)
3. [Data Model](#3-data-model)
4. [API Endpoints](#4-api-endpoints)
5. [Component Design](#5-component-design)
6. [File Map](#6-file-map)
7. [Dependencies](#7-dependencies)
8. [Implementation Phases](#8-implementation-phases)
9. [Testing Strategy](#9-testing-strategy)
10. [Risk Register](#10-risk-register)
11. [Architectural Decisions](#11-architectural-decisions)
12. [Requirement Traceability](#12-requirement-traceability)
13. [Constitution Compliance](#13-constitution-compliance)
14. [Cross-References](#14-cross-references)

---

## 1. Overview

### 1.1 Executive Summary

This plan covers the implementation of Plexica's frontend application shell —
the React 19 SPA that serves as the host for dynamically loaded plugin
frontends via Module Federation. The shell provides navigation (sidebar, header,
breadcrumbs), authentication context, tenant theming (logo, colours, fonts),
route namespace management, a widget embedding system, and responsive layout
across desktop/tablet/mobile viewports.

The frontend app (`apps/web/`) is **~60% implemented**. Key existing pieces:
React 19 + Vite + TanStack Router, Module Federation configured, AuthProvider,
basic layout (Header + Sidebar + AppLayout), ThemeContext (light/dark only),
PluginContext, plugin-loader, plugin-registry, plugin-routes, plugin-menu,
SessionExpiredModal, and several route files.

**What remains** (unique to Spec 005, not covered by Spec 010):

- SidebarNav redesign with responsive overlay, collapsible plugins group, ARIA
- Breadcrumb system
- Route prefix management with reserved route enforcement
- Tenant Theme Settings page (`/settings/branding`) — admin UI
- ColorPickerField with WCAG AA contrast checker
- ThemePreview component (live preview)
- Font selector using ADR-020 curated fonts
- Font loader (FontFace API + self-hosted WOFF2)
- Font download/setup script for MinIO
- CSP header configuration for `font-src 'self'`
- Dark mode token support for tenant theming
- PluginNotFoundPage (404 for disabled plugins)
- AuthWarningBanner (token refresh failure warning)
- Skip-to-content link
- Noscript fallback
- Tenant logo integration in Header

### 1.2 Approach

The plan is organised into **5 phases** totalling ~42 story points across
~24 tasks. Phases are sequenced so foundational work (shell layout, sidebar,
breadcrumbs) comes first, followed by theming infrastructure, then the admin
UI, then auth UX enhancements, and finally accessibility hardening.

**Critical coordination**: Spec 010 (Frontend Production Readiness) is already
in progress in Sprint 4 and covers overlapping concerns. Section 2 documents
all overlaps and delineates ownership.

### 1.3 Current State Assessment

| Area               | Status       | Existing Code                                                         |
| ------------------ | ------------ | --------------------------------------------------------------------- |
| App Shell Layout   | ~70% done    | `AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`                          |
| Plugin Loading     | ~80% done    | `plugin-loader.ts`, `plugin-registry.ts`, `plugins.$pluginId.tsx`     |
| Error Boundaries   | **Spec 010** | Not yet implemented — owned by Spec 010 Phase 1                       |
| ThemeContext       | ~30% done    | Light/dark toggle only; no tenant theme fetch                         |
| Tenant Theming API | **Spec 010** | Not yet implemented — owned by Spec 010 Phase 2                       |
| Widget System      | **Spec 010** | Not yet implemented — owned by Spec 010 Phase 3                       |
| Auth Context       | ~90% done    | `AuthProvider.tsx`, `auth.store.ts`, `SessionExpiredModal.tsx`        |
| Sidebar Nav        | ~50% done    | Basic sidebar; no responsive overlay, no ARIA, no collapsible plugins |
| Breadcrumbs        | Not started  | —                                                                     |
| Route Management   | ~60% done    | `plugin-routes.tsx`, `plugin-menu.tsx`; no reserved route enforcement |
| Tenant Settings UI | Not started  | —                                                                     |
| Font Loading       | Not started  | —                                                                     |
| Accessibility      | ~20% done    | Skip link absent, no landmark roles, no focus management              |

---

## 2. Coordination with Spec 010

Spec 010 (Frontend Production Readiness) is **in progress** during Sprint 4
with 60 story points across 5 phases. Several areas overlap with Spec 005.
This section documents ownership to avoid duplication.

### 2.1 Overlap Matrix

| Concern                      | Spec 010 Task | Spec 005 Task | Owner    | Notes                                                                                |
| ---------------------------- | ------------- | ------------- | -------- | ------------------------------------------------------------------------------------ |
| PluginErrorBoundary          | T010-1.1      | —             | Spec 010 | Spec 005 consumes as dependency                                                      |
| PluginErrorFallback UI       | T010-1.2      | —             | Spec 010 | Design-spec Screen 3 alignment                                                       |
| Error boundary integration   | T010-1.3      | —             | Spec 010 | Wraps `plugins.$pluginId.tsx`                                                        |
| RootErrorBoundary            | T010-1.4      | —             | Spec 010 | Shell-level crash catch                                                              |
| ThemeProvider (tenant fetch) | T010-2.1      | —             | Spec 010 | Core `applyTheme()`, `validateTheme()`                                               |
| Theme CSS custom properties  | T010-2.2      | —             | Spec 010 | Runtime CSS variable injection                                                       |
| Theme validation/fallback    | T010-2.3      | —             | Spec 010 | Hex validation, default fallback                                                     |
| Header logo integration      | T010-2.4      | T005-07       | **Both** | Spec 010 wires ThemeProvider; Spec 005 adds tenant logo to Header with loading state |
| Widget loader (`loadWidget`) | T010-3.1      | —             | Spec 010 | `widget-loader.ts`                                                                   |
| WidgetLoader component       | T010-3.2      | —             | Spec 010 | `WidgetLoader.tsx`                                                                   |
| WidgetFallback component     | T010-3.3      | T005-18       | **Both** | Spec 010 builds core; Spec 005 fixes contrast (`#52525B`)                            |
| Sidebar redesign             | —             | T005-01       | Spec 005 | Responsive, ARIA, collapsible plugins group                                          |
| Breadcrumbs                  | —             | T005-02       | Spec 005 | New component                                                                        |
| Route prefix management      | —             | T005-03       | Spec 005 | Reserved routes, conflict detection                                                  |
| Tenant Theme Settings page   | —             | T005-08–13    | Spec 005 | `/settings/branding` admin UI                                                        |
| Font loading system          | —             | T005-14–16    | Spec 005 | ADR-020, FontFace API, MinIO fonts                                                   |
| AuthWarningBanner            | —             | T005-17       | Spec 005 | Token refresh failure banner                                                         |
| PluginNotFoundPage           | —             | T005-04       | Spec 005 | 404 for disabled plugins                                                             |
| Skip-to-content link         | —             | T005-19       | Spec 005 | Accessibility                                                                        |
| Dark mode for tenant theme   | —             | T005-20       | Spec 005 | Extend ThemeProvider for dark-mode tokens                                            |

### 2.2 Dependency Graph

```
Spec 010 Phase 1 (Error Boundaries)
  └── Spec 005 Phase 1 depends on: wrapping plugin routes (T005-03 uses PluginErrorBoundary)

Spec 010 Phase 2 (Tenant Theming)
  └── Spec 005 Phase 2 depends on: ThemeProvider, applyTheme(), validateTheme()
  └── Spec 005 Phase 3 depends on: ThemeContext for admin settings page

Spec 010 Phase 3 (Widget System)
  └── Spec 005 Phase 1 depends on: WidgetContainer uses PluginLoadingBoundary concept
```

### 2.3 Coordination Rules

1. **No duplicate implementations.** If Spec 010 owns it, Spec 005 imports it.
2. **Design-spec alignment.** Spec 010 implementors must align error boundary
   and widget fallback designs with the Spec 005 design-spec (Screens 3, 8, 9).
3. **Contrast fix.** Widget fallback text colour `#71717A` must be changed to
   `#52525B` on `--muted` background for 4.5:1 WCAG AA ratio. This applies to
   WidgetFallback built in Spec 010 Phase 3 — flagged as T005-18.
4. **Font loading.** Spec 010 Phase 2 sets `--font-heading` and `--font-body`
   CSS variables. Spec 005 Phase 3 (T005-14) implements the actual font file
   loading via FontFace API to make those variables resolve to real fonts.

---

## 3. Data Model

### 3.1 New Tables

No new database tables. Tenant theme configuration is stored in the existing
`tenant_settings` JSONB column (managed by Spec 001). Font metadata is stored
as a static JSON manifest file, not in the database.

### 3.2 Modified Tables

None. Spec 005 is a frontend-only feature. Backend API endpoints for
`/api/v1/tenant/settings` are defined in Spec 001 and already exist.

### 3.3 Static Data: Font Manifest

Per ADR-020, a static font manifest is maintained as a JSON file:

**File**: `apps/web/public/fonts/manifest.json`

```json
{
  "version": 1,
  "fonts": [
    {
      "family": "Inter",
      "category": "sans-serif",
      "variants": [
        { "weight": 400, "style": "normal", "file": "inter-400.woff2" },
        { "weight": 500, "style": "normal", "file": "inter-500.woff2" },
        { "weight": 600, "style": "normal", "file": "inter-600.woff2" },
        { "weight": 700, "style": "normal", "file": "inter-700.woff2" }
      ]
    },
    {
      "family": "Roboto",
      "category": "sans-serif",
      "variants": [
        { "weight": 400, "style": "normal", "file": "roboto-400.woff2" },
        { "weight": 500, "style": "normal", "file": "roboto-500.woff2" },
        { "weight": 700, "style": "normal", "file": "roboto-700.woff2" }
      ]
    }
  ]
}
```

The full manifest will contain ~25 font families (per ADR-020 §"Curated
Library"). Each font includes only WOFF2 files (best compression, >98%
browser support). Files are stored at `apps/web/public/fonts/[file]` during
development and served from MinIO/CDN in production.

---

## 4. API Endpoints

### 4.1 Consumed Endpoints (Existing — Not Owned by This Spec)

Spec 005 frontend code consumes these APIs defined in other specs:

| Method | Path                           | Description                      | Spec |
| ------ | ------------------------------ | -------------------------------- | ---- |
| GET    | `/api/v1/auth/me`              | Current user + tenant context    | 002  |
| GET    | `/api/v1/tenant/plugins`       | Enabled plugins with manifests   | 004  |
| GET    | `/api/v1/tenant/settings`      | Tenant theme and configuration   | 001  |
| PUT    | `/api/v1/tenant/settings`      | Update tenant theme (admin only) | 001  |
| POST   | `/api/v1/auth/refresh`         | Token refresh                    | 002  |
| POST   | `/api/v1/tenant/settings/logo` | Upload tenant logo (multipart)   | 001  |

### 4.2 New Endpoints

No new backend endpoints. All data consumed by the frontend is served by
existing APIs.

### 4.3 PUT `/api/v1/tenant/settings` — Theme Payload

Request body sent by the Tenant Theme Settings page (Screen 5):

```json
{
  "theme": {
    "logo": "https://storage.plexica.io/acme-corp/logo.png",
    "colors": {
      "primary": "#1976d2",
      "secondary": "#dc004e",
      "background": "#ffffff",
      "surface": "#f5f5f5",
      "text": "#212121"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Roboto"
    }
  }
}
```

Response: `200 OK` with updated settings object. Errors per Constitution
Article 6.2 format.

---

## 5. Component Design

### 5.1 SidebarNav

- **Purpose**: Main navigation sidebar with core routes, collapsible plugins
  group, responsive overlay on mobile/tablet.
- **Location**: `apps/web/src/components/Layout/SidebarNav.tsx` (replaces
  current `Sidebar.tsx`)
- **Responsibilities**:
  - Render core nav items (Dashboard, Profile, Settings) pinned at top
  - Render collapsible "Plugins" group, dynamically populated from
    `PluginContext.menuItems`
  - Highlight active route via `aria-current="page"`
  - Responsive: always-visible on desktop (≥1024px), overlay with backdrop on
    tablet/mobile (<1024px)
  - Focus trap when overlay is open
  - Keyboard: Tab navigates items, Esc closes overlay
- **Dependencies**:
  - `PluginContext` — for enabled plugin menu items
  - `useLocation()` from TanStack Router — for active route detection
  - `lucide-react` — icons
- **Key Methods/Props**:

  | Prop/Method         | Type                   | Description                          |
  | ------------------- | ---------------------- | ------------------------------------ |
  | `isOpen`            | `boolean`              | Controls overlay visibility (mobile) |
  | `onClose`           | `() => void`           | Called when overlay should close     |
  | `collapsed`         | `boolean`              | Desktop collapsed state (icon-only)  |
  | `onCollapsedChange` | `(v: boolean) => void` | Toggle desktop collapsed mode        |

- **Design Spec**: Screen 1, Component: SidebarNav (design-spec.md §4)

### 5.2 Breadcrumbs

- **Purpose**: Show hierarchical navigation path. Auto-generated from current
  route and plugin context.
- **Location**: `apps/web/src/components/Layout/Breadcrumbs.tsx`
- **Responsibilities**:
  - Parse current URL path into breadcrumb segments
  - Map plugin route prefixes to plugin display names via PluginContext
  - Render linked breadcrumb items with `>` separator
  - Last item is non-linked (current page)
  - Support custom labels via route metadata
- **Dependencies**:
  - `useLocation()`, `useMatches()` from TanStack Router
  - `PluginContext` — for plugin name resolution
- **Key Props**:

  | Prop        | Type                      | Description                     |
  | ----------- | ------------------------- | ------------------------------- |
  | `className` | `string?`                 | Additional CSS classes          |
  | `overrides` | `Record<string, string>?` | Custom labels for path segments |

- **Design Spec**: Screen 1 wireframe, breadcrumb line "Home > Dashboard"

### 5.3 PluginNotFoundPage

- **Purpose**: 404 page shown when user navigates to a disabled or non-existent
  plugin route.
- **Location**: `apps/web/src/components/PluginNotFoundPage.tsx`
- **Responsibilities**:
  - Display search icon, "Page Not Found" heading, explanation text
  - "Go to Dashboard" CTA button
  - Screen reader flow: h1 → explanation → button
- **Dependencies**: TanStack Router `useNavigate()`
- **Key Props**:

  | Prop      | Type      | Description                       |
  | --------- | --------- | --------------------------------- |
  | `message` | `string?` | Custom message (has default text) |

- **Design Spec**: Screen 4 (design-spec.md)

### 5.4 AuthWarningBanner

- **Purpose**: Yellow warning banner shown below the header when a token
  refresh fails (Keycloak unreachable), warning the user their session may
  expire.
- **Location**: `apps/web/src/components/auth/AuthWarningBanner.tsx`
- **Responsibilities**:
  - Show/hide based on auth store `refreshFailed` state
  - Dismissible via ✕ button
  - Auto-remove when subsequent refresh succeeds
  - Escalate to `SessionExpiredModal` when token actually expires
- **Dependencies**:
  - `useAuthStore()` — for `refreshFailed` state
  - `lucide-react` — `AlertTriangle`, `X` icons
- **Key Props**:

  | Prop        | Type         | Description                     |
  | ----------- | ------------ | ------------------------------- |
  | `message`   | `string`     | Warning message text            |
  | `onDismiss` | `() => void` | Called when user clicks dismiss |

- **ARIA**: `role="alert"`, `aria-live="polite"`
- **Design Spec**: Screen 7 (design-spec.md)

### 5.5 TenantThemeSettingsPage

- **Purpose**: Admin-only page at `/settings/branding` for configuring tenant
  branding (logo, colours, fonts).
- **Location**: `apps/web/src/routes/settings.branding.tsx`
- **Responsibilities**:
  - Load current tenant theme from ThemeContext
  - Render form with logo upload, 5 colour pickers, 2 font selectors
  - Live preview via ThemePreview component
  - Client-side validation: hex format, WCAG AA contrast ratios
  - Unsaved changes guard (beforeunload + route change prompt)
  - Save via `PUT /api/v1/tenant/settings`
  - Reset to defaults with confirmation dialog
  - Admin-only access check via RBAC
- **Dependencies**:
  - `ThemeContext` (from Spec 010 Phase 2)
  - `ColorPickerField` component
  - `ThemePreview` component
  - `FontSelector` component
  - `apiClient` for PUT request
  - Zod for form validation
- **Design Spec**: Screen 5 (design-spec.md), full wireframe at 4 viewports

### 5.6 ColorPickerField

- **Purpose**: Form input combining hex text input, colour swatch, and WCAG AA
  contrast ratio indicator.
- **Location**: `apps/web/src/components/theme/ColorPickerField.tsx`
- **Responsibilities**:
  - Accept hex colour value via text input
  - Show colour swatch (clickable, opens native colour picker)
  - Calculate contrast ratio against a reference colour (background or
    foreground depending on the colour role)
  - Display pass/fail indicator with ratio value
  - Validate hex format, show error state for invalid input
- **Dependencies**: `wcag-contrast` utility (custom or imported)
- **Key Props**:

  | Prop              | Type                      | Description                         |
  | ----------------- | ------------------------- | ----------------------------------- |
  | `label`           | `string`                  | Field label text                    |
  | `value`           | `string`                  | Current hex value                   |
  | `onChange`        | `(value: string) => void` | Change handler                      |
  | `contrastAgainst` | `string`                  | Hex colour for contrast calculation |
  | `id`              | `string`                  | For ARIA associations               |

- **ARIA**: `aria-label`, `aria-describedby` for contrast indicator,
  `aria-invalid` for errors
- **Design Spec**: Component: ColorPickerField (design-spec.md §4)

### 5.7 ThemePreview

- **Purpose**: Live miniature mockup of the shell layout showing how current
  theme values look, updated in real-time as the admin edits form fields.
- **Location**: `apps/web/src/components/theme/ThemePreview.tsx`
- **Responsibilities**:
  - Render a scaled-down shell mockup (header, sidebar, content card, button)
  - Apply theme colours and fonts from props (not from ThemeContext, since
    we're previewing unsaved changes)
  - `aria-hidden="true"` (decorative, visual-only)
  - On mobile (375px): hidden by default, accessible via "Preview" button
    that opens a bottom sheet
- **Dependencies**: None (self-contained)
- **Key Props**:

  | Prop     | Type                                                | Description       |
  | -------- | --------------------------------------------------- | ----------------- |
  | `logo`   | `string`                                            | Logo URL          |
  | `colors` | `{ primary, secondary, background, surface, text }` | Theme colours     |
  | `fonts`  | `{ heading, body }`                                 | Font family names |

- **Design Spec**: Screen 5 wireframe, Component: ThemePreview (design-spec.md §4)

### 5.8 FontSelector

- **Purpose**: Dropdown selector for choosing from the curated font library
  (ADR-020).
- **Location**: `apps/web/src/components/theme/FontSelector.tsx`
- **Responsibilities**:
  - Load font manifest from `/fonts/manifest.json`
  - Render select dropdown with font family names, grouped by category
  - Show font preview in each option (using the font itself via dynamic
    FontFace loading for preview)
  - Trigger font loading when selection changes (for ThemePreview)
- **Dependencies**: Font manifest, FontFace API
- **Key Props**:

  | Prop       | Type                      | Description                   |
  | ---------- | ------------------------- | ----------------------------- |
  | `label`    | `string`                  | "Heading Font" or "Body Font" |
  | `value`    | `string`                  | Current font family name      |
  | `onChange` | `(value: string) => void` | Change handler                |
  | `id`       | `string`                  | For label association         |

### 5.9 FontLoader (Library)

- **Purpose**: Utility for loading WOFF2 font files via the FontFace API at
  runtime, based on tenant theme configuration.
- **Location**: `apps/web/src/lib/font-loader.ts`
- **Responsibilities**:
  - Read font manifest (cached after first fetch)
  - Load specific font families via `FontFace` constructor
  - Add loaded fonts to `document.fonts`
  - Set CSS custom properties `--font-heading` and `--font-body`
  - Handle loading failures gracefully (fall back to system fonts)
  - Preload critical fonts via `<link rel="preload">` injection
- **Key Functions**:

  | Function       | Parameters                          | Returns                 | Description                     |
  | -------------- | ----------------------------------- | ----------------------- | ------------------------------- |
  | `loadFonts`    | `{ heading: string, body: string }` | `Promise<void>`         | Load and activate tenant fonts  |
  | `preloadFont`  | `family: string`                    | `void`                  | Inject preload link for a font  |
  | `getManifest`  | —                                   | `Promise<FontManifest>` | Fetch/cache font manifest       |
  | `isFontLoaded` | `family: string`                    | `boolean`               | Check if font is already loaded |

### 5.10 RouteGuard (Reserved Route Enforcement)

- **Purpose**: Validate plugin route prefixes against reserved routes and
  detect conflicts between plugins.
- **Location**: Enhancement to `apps/web/src/lib/plugin-routes.tsx`
- **Responsibilities**:
  - Maintain list of reserved route prefixes: `/`, `/settings`, `/admin`,
    `/profile`, `/team`, `/login`, `/auth`
  - Reject plugin route registration if prefix conflicts with reserved routes
  - Reject plugin route registration if prefix conflicts with another plugin
  - Log warnings for rejected registrations
- **Key Functions**:

  | Function          | Parameters         | Returns   | Description                       |
  | ----------------- | ------------------ | --------- | --------------------------------- |
  | `isReservedRoute` | `prefix: string`   | `boolean` | Check against reserved route list |
  | `hasConflict`     | `prefix: string`   | `boolean` | Check against registered plugins  |
  | `registerPlugin`  | `pluginId, prefix` | `boolean` | Register or reject with reason    |

### 5.11 WidgetContainer

- **Purpose**: Section wrapper for embedding cross-plugin widgets. Uses
  PluginLoadingBoundary from Spec 010 internally.
- **Location**: `apps/web/src/components/WidgetContainer.tsx`
- **Responsibilities**:
  - Render section with heading ("Related [X]")
  - Use `loadWidget()` from Spec 010 to dynamically import widget
  - Show skeleton during loading, fallback on error
  - Apply `role="region"`, `aria-label`, `aria-busy` states
- **Dependencies**: Spec 010 `loadWidget()`, `WidgetFallback`
- **Key Props**:

  | Prop            | Type                      | Description             |
  | --------------- | ------------------------- | ----------------------- |
  | `pluginId`      | `string`                  | Source plugin           |
  | `widgetName`    | `string`                  | Exposed component name  |
  | `widgetProps`   | `Record<string, unknown>` | Props to pass to widget |
  | `title`         | `string`                  | Section heading         |
  | `fallback`      | `ReactNode?`              | Custom loading fallback |
  | `errorFallback` | `ReactNode?`              | Custom error fallback   |

- **Design Spec**: Screen 8 wireframe, Component: WidgetContainer (design-spec.md §4)

---

## 6. File Map

### Files to Create

| Path                                                        | Purpose                                           | Est. Size | Phase |
| ----------------------------------------------------------- | ------------------------------------------------- | --------- | ----- |
| `apps/web/src/components/Layout/SidebarNav.tsx`             | Redesigned sidebar with responsive overlay + ARIA | L         | 1     |
| `apps/web/src/components/Layout/Breadcrumbs.tsx`            | Breadcrumb navigation component                   | M         | 1     |
| `apps/web/src/components/PluginNotFoundPage.tsx`            | 404 page for disabled/missing plugins             | S         | 1     |
| `apps/web/src/components/auth/AuthWarningBanner.tsx`        | Token refresh failure warning banner              | M         | 4     |
| `apps/web/src/routes/settings.branding.tsx`                 | Tenant Theme Settings page (admin)                | L         | 3     |
| `apps/web/src/components/theme/ColorPickerField.tsx`        | Colour picker with contrast checker               | M         | 3     |
| `apps/web/src/components/theme/ThemePreview.tsx`            | Live theme preview component                      | M         | 3     |
| `apps/web/src/components/theme/FontSelector.tsx`            | Font family dropdown selector                     | M         | 3     |
| `apps/web/src/lib/font-loader.ts`                           | FontFace API loader for self-hosted WOFF2 fonts   | M         | 2     |
| `apps/web/src/lib/contrast-utils.ts`                        | WCAG AA contrast ratio calculation utilities      | S         | 3     |
| `apps/web/src/components/WidgetContainer.tsx`               | Section wrapper for cross-plugin widget embeds    | M         | 1     |
| `apps/web/public/fonts/manifest.json`                       | Font manifest (family, weights, files)            | S         | 2     |
| `apps/web/public/fonts/*.woff2`                             | Self-hosted font files (~25 families)             | —         | 2     |
| `scripts/download-fonts.sh`                                 | Script to download curated fonts for self-hosting | S         | 2     |
| `apps/web/src/__tests__/layout/SidebarNav.test.tsx`         | SidebarNav unit tests                             | M         | 1     |
| `apps/web/src/__tests__/layout/Breadcrumbs.test.tsx`        | Breadcrumbs unit tests                            | S         | 1     |
| `apps/web/src/__tests__/theme/ColorPickerField.test.tsx`    | ColorPickerField unit tests                       | M         | 3     |
| `apps/web/src/__tests__/theme/ThemePreview.test.tsx`        | ThemePreview unit tests                           | S         | 3     |
| `apps/web/src/__tests__/theme/FontSelector.test.tsx`        | FontSelector unit tests                           | S         | 3     |
| `apps/web/src/__tests__/theme/font-loader.test.ts`          | FontLoader unit tests                             | M         | 2     |
| `apps/web/src/__tests__/theme/contrast-utils.test.ts`       | Contrast utility unit tests                       | S         | 3     |
| `apps/web/src/__tests__/auth/AuthWarningBanner.test.tsx`    | AuthWarningBanner unit tests                      | S         | 4     |
| `apps/web/src/__tests__/layout/PluginNotFoundPage.test.tsx` | PluginNotFoundPage unit tests                     | S         | 1     |
| `apps/web/src/__tests__/routes/settings-branding.test.tsx`  | Tenant Theme Settings integration tests           | L         | 3     |
| `apps/web/src/__tests__/e2e/theme-settings.e2e.test.ts`     | Theme settings E2E tests                          | M         | 3     |
| `apps/web/src/__tests__/e2e/navigation.e2e.test.ts`         | Navigation + breadcrumbs E2E tests                | M         | 5     |

### Files to Modify

| Path                                           | Change Description                                                                                                                                 | Est. Effort | Phase |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| `apps/web/src/components/Layout/AppLayout.tsx` | Replace `Sidebar` with `SidebarNav`, add `Breadcrumbs`, add `AuthWarningBanner`, add skip-to-content link, add `<main id="main-content">` landmark | M           | 1, 4  |
| `apps/web/src/components/Layout/Header.tsx`    | Add tenant logo from ThemeContext, add `role="banner"`, add logo click navigation, remove hardcoded "P" placeholder                                | M           | 2     |
| `apps/web/src/routes/plugins.$pluginId.tsx`    | Use `PluginNotFoundPage` for disabled plugins, integrate PluginErrorBoundary (from Spec 010)                                                       | S           | 1     |
| `apps/web/src/lib/plugin-routes.tsx`           | Add reserved route enforcement, conflict detection                                                                                                 | S           | 1     |
| `apps/web/src/contexts/ThemeContext.tsx`       | Extend with tenant theme (merge with Spec 010 ThemeProvider), add font loading trigger, add dark mode tenant token support                         | M           | 2     |
| `apps/web/src/main.tsx`                        | Add noscript fallback in `index.html`, ensure provider ordering                                                                                    | S           | 5     |
| `apps/web/src/routes/settings.tsx`             | Add "Branding" sub-route link in settings page navigation                                                                                          | S           | 3     |
| `apps/web/index.html`                          | Add skip-to-content link, noscript tag, CSP meta tag for `font-src 'self'`                                                                         | S           | 5     |
| `apps/web/vite.config.ts`                      | CSP headers for dev server if needed                                                                                                               | S           | 2     |

### Files to Delete

| Path                                          | Reason                           | Migration Notes                   |
| --------------------------------------------- | -------------------------------- | --------------------------------- |
| `apps/web/src/components/Layout/Sidebar.tsx`  | Replaced by `SidebarNav.tsx`     | All imports updated to SidebarNav |
| `apps/web/src/components/Layout/Sidebar.d.ts` | Type declaration for old Sidebar | Removed with source file          |

### Files to Reference (Read-Only)

| Path                                                      | Purpose                               |
| --------------------------------------------------------- | ------------------------------------- |
| `.forge/constitution.md`                                  | Validate architectural decisions      |
| `.forge/specs/005-frontend-architecture/spec.md`          | Requirements                          |
| `.forge/specs/005-frontend-architecture/design-spec.md`   | Wireframes, components, accessibility |
| `.forge/specs/005-frontend-architecture/user-journey.md`  | User flows and edge cases             |
| `.forge/specs/010-frontend-production-readiness/plan.md`  | Overlapping implementation details    |
| `.forge/specs/010-frontend-production-readiness/tasks.md` | Overlapping task breakdown            |
| `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`   | Font hosting decision                 |
| `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`   | TailwindCSS v4 semantic tokens        |
| `.forge/knowledge/adr/adr-011-vite-module-federation.md`  | Vite Module Federation                |
| `.forge/knowledge/adr/adr-004-module-federation.md`       | Module Federation concept             |
| `.forge/ux/design-system.md`                              | Design system tokens                  |

---

## 7. Dependencies

### 7.1 New Dependencies

| Package | Version | Purpose | ADR Ref |
| ------- | ------- | ------- | ------- |
| None    | —       | —       | —       |

**No new npm packages required.** All functionality is implemented using
existing dependencies (React 19, TanStack Router, TailwindCSS v4, Zod,
lucide-react) and browser APIs (FontFace, matchMedia). The contrast ratio
calculation uses a custom utility (~20 LOC) rather than a third-party package
to avoid unnecessary dependency.

### 7.2 Internal Dependencies

- **`@plexica/ui`** — Button, Alert, Select, Dialog components
- **`apps/web/src/contexts/PluginContext.tsx`** — Plugin menu items for sidebar
- **`apps/web/src/stores/auth.store.ts`** — Auth state, user, tenant, roles
- **`apps/web/src/lib/api-client.ts`** — API requests
- **`apps/web/src/contexts/ThemeContext.tsx`** — Theme state (enhanced by
  Spec 010 Phase 2, extended by this plan Phase 2)
- **Spec 010 deliverables**: `PluginErrorBoundary`, `loadWidget()`,
  `WidgetFallback`, `ThemeProvider` (tenant fetch), `applyTheme()`,
  `validateTheme()`

---

## 8. Implementation Phases

### Phase 1: Shell Layout & Navigation (Sprint 4, Week 2–3)

**Objective**: Redesign sidebar, add breadcrumbs, enforce route namespaces,
add plugin 404 page, and create the WidgetContainer wrapper.

**Story Points**: 11

**Dependencies**: Spec 010 Phase 1 (PluginErrorBoundary) should be complete
or in progress.

#### Tasks

| ID      | Task                            | Points | FR Ref         | Dependencies | Test Count |
| ------- | ------------------------------- | ------ | -------------- | ------------ | ---------- |
| T005-01 | Implement SidebarNav component  | 5      | FR-006, FR-007 | —            | 8          |
| T005-02 | Implement Breadcrumbs component | 2      | FR-006         | —            | 4          |
| T005-03 | Add reserved route enforcement  | 2      | FR-008         | —            | 3          |
| T005-04 | Implement PluginNotFoundPage    | 1      | FR-008         | —            | 2          |
| T005-05 | Implement WidgetContainer       | 1      | FR-011         | Spec 010 P3  | 3          |

**Files to Create**:

- `apps/web/src/components/Layout/SidebarNav.tsx`
  - Purpose: Full sidebar redesign
  - Dependencies: None
  - Estimated effort: 6h
- `apps/web/src/components/Layout/Breadcrumbs.tsx`
  - Purpose: Route-aware breadcrumb trail
  - Dependencies: None
  - Estimated effort: 3h
- `apps/web/src/components/PluginNotFoundPage.tsx`
  - Purpose: 404 for disabled plugins
  - Dependencies: None
  - Estimated effort: 1h
- `apps/web/src/components/WidgetContainer.tsx`
  - Purpose: Widget embed wrapper
  - Dependencies: Spec 010 Phase 3 (loadWidget)
  - Estimated effort: 2h
- `apps/web/src/__tests__/layout/SidebarNav.test.tsx` — 8 unit tests
- `apps/web/src/__tests__/layout/Breadcrumbs.test.tsx` — 4 unit tests
- `apps/web/src/__tests__/layout/PluginNotFoundPage.test.tsx` — 2 unit tests

**Files to Modify**:

- `apps/web/src/components/Layout/AppLayout.tsx`
  - Change: Replace `<Sidebar>` with `<SidebarNav>`, add `<Breadcrumbs>` above
    children, add responsive overlay logic, add `<main id="main-content">`
    with `role="main"`, add `<footer role="contentinfo">`
  - Estimated effort: 2h
- `apps/web/src/routes/plugins.$pluginId.tsx`
  - Change: Use `<PluginNotFoundPage>` instead of current `PluginNotFoundState`,
    integrate `PluginErrorBoundary` from Spec 010 around `<Suspense>`
  - Estimated effort: 1h
- `apps/web/src/lib/plugin-routes.tsx`
  - Change: Add `RESERVED_ROUTES` constant, `isReservedRoute()`,
    `hasConflict()` check in registration flow
  - Estimated effort: 1h

**Files to Delete**:

- `apps/web/src/components/Layout/Sidebar.tsx` — replaced by SidebarNav
- `apps/web/src/components/Layout/Sidebar.d.ts` — type declaration cleanup

**Acceptance Criteria**:

- [ ] SidebarNav renders core items (Dashboard, Profile, Settings) and
      dynamically populated plugin items from PluginContext
- [ ] Plugins section is collapsible with `aria-expanded` toggle
- [ ] Active route highlighted with `aria-current="page"` and primary
      background
- [ ] On viewports < 1024px: sidebar is hidden; hamburger in header opens
      overlay with backdrop + focus trap
- [ ] Esc closes sidebar overlay; backdrop click closes overlay
- [ ] Breadcrumbs render from route path: "Home > [Plugin Name] > [Page]"
- [ ] Plugin route prefixes validated against reserved routes list
- [ ] Duplicate plugin prefix registration rejected with console warning
- [ ] Navigating to disabled plugin route shows PluginNotFoundPage
- [ ] WidgetContainer renders section heading and uses `loadWidget()` from
      Spec 010

---

### Phase 2: Font & Theme Infrastructure (Sprint 5, Week 1)

**Objective**: Implement self-hosted font loading (ADR-020), integrate tenant
logo in Header, extend ThemeContext for font support, and configure CSP.

**Story Points**: 8

**Dependencies**: Spec 010 Phase 2 (ThemeProvider with tenant fetch) must be
complete.

#### Tasks

| ID      | Task                                   | Points | FR Ref         | Dependencies | Test Count |
| ------- | -------------------------------------- | ------ | -------------- | ------------ | ---------- |
| T005-06 | Implement font-loader.ts               | 3      | FR-009, FR-010 | ADR-020      | 6          |
| T005-07 | Integrate tenant logo in Header        | 2      | FR-009         | Spec 010 P2  | 3          |
| T005-14 | Create font manifest + download script | 2      | FR-009         | ADR-020      | 1          |
| T005-15 | Configure CSP `font-src 'self'`        | 1      | NFR-001        | T005-14      | 1          |

**Files to Create**:

- `apps/web/src/lib/font-loader.ts`
  - Purpose: FontFace API wrapper for loading WOFF2 fonts from manifest
  - Dependencies: Font manifest
  - Estimated effort: 4h
- `apps/web/public/fonts/manifest.json`
  - Purpose: Static font metadata (family, variants, files)
  - Dependencies: Downloaded font files
  - Estimated effort: 2h (includes curating list)
- `apps/web/public/fonts/*.woff2`
  - Purpose: Self-hosted font binary files
  - Dependencies: Download script
  - Estimated effort: included in T005-14
- `scripts/download-fonts.sh`
  - Purpose: Download ~25 curated open-source fonts in WOFF2 format
  - Dependencies: None
  - Estimated effort: 2h
- `apps/web/src/__tests__/theme/font-loader.test.ts` — 6 unit tests

**Files to Modify**:

- `apps/web/src/components/Layout/Header.tsx`
  - Change: Replace hardcoded "P" logo with `theme.logo` from ThemeContext;
    add `<img>` with `onError` fallback to default logo; add `role="banner"`
  - Estimated effort: 2h
- `apps/web/src/contexts/ThemeContext.tsx`
  - Change: After Spec 010 adds tenant theme fetch, integrate `loadFonts()`
    call when theme fonts change; export `TenantTheme` type
  - Estimated effort: 2h
- `apps/web/index.html`
  - Change: Add CSP meta tag: `<meta http-equiv="Content-Security-Policy"
content="font-src 'self'">`
  - Estimated effort: 30min
- `apps/web/vite.config.ts`
  - Change: Add CSP headers to dev server config if needed
  - Estimated effort: 30min

**Acceptance Criteria**:

- [ ] `loadFonts({ heading: "Inter", body: "Roboto" })` loads WOFF2 files via
      FontFace API and sets CSS custom properties `--font-heading` and `--font-body`
- [ ] Font manifest at `/fonts/manifest.json` lists ~25 font families with
      variants (400, 500, 600, 700 weights minimum)
- [ ] All font files served from same origin (no third-party requests)
- [ ] CSP header includes `font-src 'self'`; no GDPR-violating requests to
      Google Fonts or other third-party font CDNs
- [ ] Header shows tenant logo from theme; falls back to default Plexica logo
      on image load error
- [ ] Font loading failure falls back to system fonts gracefully (no blank text)
- [ ] Font loading completes within performance budget (< 200ms on broadband
      per ADR-020 analysis)

---

### Phase 3: Tenant Theme Settings UI (Sprint 5, Week 2–3)

**Objective**: Build the admin-only Tenant Theme Settings page
(`/settings/branding`) with colour pickers, font selectors, live preview,
and contrast checking.

**Story Points**: 13

**Dependencies**: Phase 2 (font-loader), Spec 010 Phase 2 (ThemeProvider)

#### Tasks

| ID      | Task                                     | Points | FR Ref          | Dependencies          | Test Count |
| ------- | ---------------------------------------- | ------ | --------------- | --------------------- | ---------- |
| T005-08 | Implement contrast-utils.ts              | 1      | FR-015, NFR-004 | —                     | 5          |
| T005-09 | Implement ColorPickerField               | 3      | FR-009, FR-015  | T005-08               | 6          |
| T005-10 | Implement ThemePreview                   | 2      | FR-009          | —                     | 3          |
| T005-11 | Implement FontSelector                   | 2      | FR-009          | T005-06 (font-loader) | 4          |
| T005-12 | Build settings.branding.tsx page         | 3      | FR-009, FR-010  | T005-09–11            | 8          |
| T005-13 | Add branding link to Settings navigation | 1      | FR-009          | T005-12               | 1          |
| T005-18 | Fix widget fallback contrast             | 1      | NFR-004         | Spec 010 P3           | 1          |

**Files to Create**:

- `apps/web/src/lib/contrast-utils.ts`
  - Purpose: WCAG AA contrast ratio calculation (relative luminance formula)
  - Dependencies: None
  - Estimated effort: 1h
- `apps/web/src/components/theme/ColorPickerField.tsx`
  - Purpose: Hex colour input + swatch + contrast indicator
  - Dependencies: `contrast-utils.ts`
  - Estimated effort: 4h
- `apps/web/src/components/theme/ThemePreview.tsx`
  - Purpose: Live miniature shell mockup for theme preview
  - Dependencies: None
  - Estimated effort: 3h
- `apps/web/src/components/theme/FontSelector.tsx`
  - Purpose: Font family dropdown from manifest
  - Dependencies: `font-loader.ts`
  - Estimated effort: 3h
- `apps/web/src/routes/settings.branding.tsx`
  - Purpose: Admin page for tenant branding configuration
  - Dependencies: All theme components
  - Estimated effort: 6h
- `apps/web/src/__tests__/theme/contrast-utils.test.ts` — 5 unit tests
- `apps/web/src/__tests__/theme/ColorPickerField.test.tsx` — 6 unit tests
- `apps/web/src/__tests__/theme/ThemePreview.test.tsx` — 3 unit tests
- `apps/web/src/__tests__/theme/FontSelector.test.tsx` — 4 unit tests
- `apps/web/src/__tests__/routes/settings-branding.test.tsx` — 8 integration tests
- `apps/web/src/__tests__/e2e/theme-settings.e2e.test.ts` — 4 E2E tests

**Files to Modify**:

- `apps/web/src/routes/settings.tsx`
  - Change: Add "Branding" link/tab in settings navigation, with admin-only
    visibility check
  - Estimated effort: 1h

**Acceptance Criteria**:

- [ ] Contrast ratio calculation matches WCAG 2.1 formula:
      `(L1 + 0.05) / (L2 + 0.05)` where L1 > L2
- [ ] ColorPickerField shows green "✅ 5.3:1 — Passes WCAG AA" for passing
      colours and orange "⚠️ 1.2:1 — Does not meet WCAG AA" for failing colours
- [ ] Invalid hex input shows red border + "Invalid hex color value" error
- [ ] ThemePreview updates live as form values change
- [ ] ThemePreview is `aria-hidden="true"` (decorative)
- [ ] On mobile (375px): ThemePreview hidden; "Preview" button opens bottom
      sheet
- [ ] FontSelector shows curated fonts from manifest.json
- [ ] Settings page requires admin role; non-admins see 403
- [ ] Save button calls `PUT /api/v1/tenant/settings` with theme payload
- [ ] Unsaved changes trigger browser confirmation on navigation
- [ ] "Reset to Default" shows confirmation dialog before resetting
- [ ] Save success shows toast: "Theme updated successfully."
- [ ] Widget fallback text uses `#52525B` (not `#71717A`) for 4.5:1 contrast
      ratio on `--muted` background

---

### Phase 4: Auth UX Enhancements (Sprint 5, Week 3)

**Objective**: Add the AuthWarningBanner for token refresh failures and
extend dark mode support for tenant theming.

**Story Points**: 5

**Dependencies**: Spec 010 Phase 2 (ThemeProvider)

#### Tasks

| ID      | Task                                     | Points | FR Ref         | Dependencies | Test Count |
| ------- | ---------------------------------------- | ------ | -------------- | ------------ | ---------- |
| T005-17 | Implement AuthWarningBanner              | 2      | FR-013         | —            | 4          |
| T005-20 | Extend dark mode for tenant theme tokens | 3      | FR-010, FR-015 | Spec 010 P2  | 3          |

**Files to Create**:

- `apps/web/src/components/auth/AuthWarningBanner.tsx`
  - Purpose: Warning banner for token refresh failures
  - Dependencies: `useAuthStore()`
  - Estimated effort: 2h
- `apps/web/src/__tests__/auth/AuthWarningBanner.test.tsx` — 4 unit tests

**Files to Modify**:

- `apps/web/src/components/Layout/AppLayout.tsx`
  - Change: Add `<AuthWarningBanner>` between Header and main content,
    conditionally rendered when `authStore.refreshFailed` is true
  - Estimated effort: 1h
- `apps/web/src/contexts/ThemeContext.tsx`
  - Change: Generate dark-mode variants of tenant theme colours (darken
    background, lighten text, adjust primary for dark contrast); apply via
    `.dark` class CSS variable overrides
  - Estimated effort: 3h
- `apps/web/src/stores/auth.store.ts` (or `auth-store.ts`)
  - Change: Add `refreshFailed` boolean state, set true when token refresh
    fails, reset on successful refresh
  - Estimated effort: 1h

**Acceptance Criteria**:

- [ ] AuthWarningBanner appears below header when token refresh fails
- [ ] Banner message: "Unable to refresh your session. Your current session
      will remain active until it expires."
- [ ] Banner has yellow background (`--banner-warning-bg`), warning icon,
      and dismiss button
- [ ] Dismiss button hides banner; subsequent successful refresh auto-removes
- [ ] Banner uses `role="alert"`, `aria-live="polite"`
- [ ] Tenant theme colours generate appropriate dark-mode variants
- [ ] Dark mode toggle applies both system dark tokens AND tenant-specific
      dark variants

---

### Phase 5: Accessibility & Polish (Sprint 5, Week 4)

**Objective**: Add skip-to-content link, noscript fallback, verify landmark
roles, and run accessibility audit.

**Story Points**: 5

**Dependencies**: All previous phases

#### Tasks

| ID      | Task                               | Points | FR Ref           | Dependencies | Test Count |
| ------- | ---------------------------------- | ------ | ---------------- | ------------ | ---------- |
| T005-19 | Add skip-to-content link           | 1      | NFR-004          | Phase 1      | 2          |
| T005-21 | Add noscript fallback              | 1      | —                | —            | 1          |
| T005-22 | Verify ARIA landmarks across shell | 2      | NFR-004          | All phases   | 4          |
| T005-23 | Navigation E2E tests               | 1      | NFR-004, NFR-005 | All phases   | 6          |

**Files to Modify**:

- `apps/web/index.html`
  - Change: Add skip-to-content link (`<a href="#main-content" class="sr-only
focus:not-sr-only">Skip to main content</a>`), add `<noscript>` tag with
    fallback message
  - Estimated effort: 30min
- `apps/web/src/components/Layout/AppLayout.tsx`
  - Change: Ensure `<header role="banner">`, `<nav role="navigation"
aria-label="Main navigation">`, `<main id="main-content" role="main">`,
    `<footer role="contentinfo">` are all present
  - Estimated effort: 1h

**Files to Create**:

- `apps/web/src/__tests__/e2e/navigation.e2e.test.ts` — 6 E2E tests
  (sidebar nav, breadcrumbs, responsive overlay, keyboard navigation)

**Acceptance Criteria**:

- [ ] Skip-to-content link is visually hidden; becomes visible on focus;
      moves focus to `#main-content` on activation
- [ ] Noscript tag shows: "This application requires JavaScript to run."
- [ ] All ARIA landmarks present: `banner`, `navigation`, `main`,
      `contentinfo`
- [ ] Tab order follows design-spec Screen 1 accessibility section
- [ ] E2E tests cover: sidebar navigation, breadcrumb clicks, responsive
      overlay open/close, keyboard Esc to close overlay, skip-to-content link

---

## 9. Testing Strategy

### 9.1 Unit Tests

| Component          | Test Focus                                                                                                | Count |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ----- |
| SidebarNav         | Rendering, active state, collapse toggle, plugin items, overlay open/close, keyboard Esc, ARIA attributes | 8     |
| Breadcrumbs        | Path parsing, plugin name resolution, link clicks, empty state                                            | 4     |
| PluginNotFoundPage | Rendering, dashboard button navigation                                                                    | 2     |
| ColorPickerField   | Hex validation, contrast calculation display, swatch click, invalid state, ARIA                           | 6     |
| ThemePreview       | Renders with props, updates on prop change, aria-hidden                                                   | 3     |
| FontSelector       | Manifest loading, option rendering, selection, grouped by category                                        | 4     |
| font-loader        | loadFonts(), preloadFont(), manifest cache, error fallback, isFontLoaded()                                | 6     |
| contrast-utils     | Relative luminance, contrast ratio, pass/fail threshold, edge cases                                       | 5     |
| AuthWarningBanner  | Rendering, dismiss, auto-remove on resolve, ARIA                                                          | 4     |
| WidgetContainer    | Renders with loadWidget, loading state, error state                                                       | 3     |

**Total Unit Tests**: ~72

### 9.2 Integration Tests

| Scenario                             | Dependencies                     | Count |
| ------------------------------------ | -------------------------------- | ----- |
| Theme Settings page form submission  | ThemeContext, API mock           | 3     |
| Theme Settings contrast validation   | ColorPickerField, contrast-utils | 2     |
| Theme Settings unsaved changes guard | Router, form state               | 1     |
| Theme Settings admin access control  | AuthStore roles                  | 2     |
| Reserved route rejection             | plugin-routes.tsx                | 2     |

**Total Integration Tests**: ~10

### 9.3 E2E Tests

| Scenario                                   | Prerequisites             | Count |
| ------------------------------------------ | ------------------------- | ----- |
| Sidebar navigation between plugin pages    | Test plugins enabled      | 2     |
| Sidebar responsive overlay (mobile)        | Viewport resize           | 2     |
| Breadcrumb navigation                      | Multi-level route         | 1     |
| Skip-to-content link                       | —                         | 1     |
| Theme Settings save + verify applied theme | Admin role, API available | 2     |
| Theme Settings contrast warning display    | Admin role                | 1     |
| Theme Settings font selection              | Admin role, fonts loaded  | 1     |

**Total E2E Tests**: ~10

### 9.4 Test Coverage Targets

| Module                   | Target | Rationale                     |
| ------------------------ | ------ | ----------------------------- |
| contrast-utils.ts        | ≥95%   | Critical accessibility logic  |
| font-loader.ts           | ≥85%   | Core infrastructure           |
| SidebarNav               | ≥85%   | Core shell component          |
| ColorPickerField         | ≥85%   | Form input with validation    |
| Theme Settings page      | ≥80%   | Complex form with many states |
| Overall (Spec 005 files) | ≥80%   | Constitution Article 4.1      |

#### Contract Tests (Deferred)

Constitution Art. 8.1 requires contract tests for all plugin-to-core API interactions. Module Federation's runtime resolution provides implicit contract enforcement for remote entries; explicit Pact/contract tests for the widget API surface are deferred to Spec 010 Phase 3 or a dedicated testing spec. Tracked as technical debt (see decision-log.md TD-007).

### 9.5 Total Test Count

| Type        | Count   | Estimated Time |
| ----------- | ------- | -------------- |
| Unit        | ~72     | < 30s          |
| Integration | ~10     | < 60s          |
| E2E         | ~10     | < 3min         |
| **Total**   | **~92** | **< 4min**     |

---

## Feature Flag Strategy

Per Constitution Article 9.1, all user-facing changes require feature flags for gradual rollout and fast rollback.

| Flag Name                    | Controls                                      | Default | Tasks                              |
| ---------------------------- | --------------------------------------------- | ------- | ---------------------------------- |
| `ENABLE_NEW_SIDEBAR`         | New SidebarNav replaces old Sidebar component | `false` | T005-01, T005-02                   |
| `ENABLE_TENANT_THEMING`      | Tenant Theme Settings page and ThemeProvider  | `false` | T005-09, T005-10, T005-11, T005-12 |
| `ENABLE_AUTH_WARNING_BANNER` | AuthWarningBanner component display           | `false` | T005-17                            |
| `ENABLE_DARK_MODE`           | Dark mode token support and toggle            | `false` | T005-20                            |

**Implementation**: Feature flags are evaluated client-side via the existing feature flag context (or a new `useFeatureFlag(name)` hook if not present). Flags are configurable per tenant via the admin API.

**Rollout plan**: Enable flags progressively — start with internal tenant, then beta tenants, then all tenants over 2 weeks.

---

## 10. Risk Register

| #   | Risk                                                    | Impact | Probability | Mitigation                                                                                                                          |
| --- | ------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Spec 010 Phase 2 (ThemeProvider) delays block Phase 2–3 | High   | Medium      | Phase 1 has no Spec 010 dependency; can proceed independently. If Spec 010 delays, implement minimal ThemeProvider stub in Spec 005 |
| R2  | Font files exceed performance budget (< 2s on 3G)       | Medium | Low         | ADR-020 analysed: WOFF2 ~20KB per weight, 2 fonts × 4 weights = ~160KB. Preload critical fonts. Lazy-load non-critical weights      |
| R3  | FontFace API not supported in target browsers           | Low    | Very Low    | FontFace API has 98%+ global support (caniuse). Fallback: CSS `@font-face` declarations in stylesheet                               |
| R4  | Contrast ratio calculation edge cases                   | Medium | Low         | Use the exact WCAG 2.1 relative luminance formula. Test with known colour pairs from W3C examples                                   |
| R5  | Sidebar overlay focus trap complexity                   | Medium | Medium      | Use `focus-trap-react` if native implementation is too complex. If adding new dependency, create ADR                                |
| R6  | Plugin route conflicts not caught at build time         | Low    | Medium      | Runtime validation with console warnings is sufficient for MVP. Future: build-time plugin manifest validation                       |
| R7  | Admin-only page access bypassed client-side             | High   | Low         | Client-side RBAC check + backend `PUT /tenant/settings` endpoint enforces admin role. Defence in depth per Constitution Art. 5.1    |

---

## 11. Architectural Decisions

| ADR     | Decision                             | Status   | Relevance                                             |
| ------- | ------------------------------------ | -------- | ----------------------------------------------------- |
| ADR-004 | Module Federation for plugin loading | Accepted | Plugin remote loading architecture                    |
| ADR-009 | TailwindCSS v4 semantic tokens       | Accepted | Runtime theme customisation via CSS custom properties |
| ADR-011 | Vite Module Federation               | Accepted | Vite plugin for Module Federation                     |
| ADR-020 | Self-hosted fonts via MinIO/CDN      | Proposed | Font hosting strategy — GDPR, CSP, performance        |

### 11.1 New Decisions Made in This Plan

**Decision: No new npm dependencies for contrast calculation.**

- **Context**: ColorPickerField needs WCAG AA contrast ratio calculation.
  Packages like `color-contrast-checker` (20KB) exist but are trivial to
  implement (~20 LOC for the WCAG 2.1 relative luminance formula).
- **Decision**: Implement `contrast-utils.ts` as a custom utility.
- **Rationale**: Avoid adding a dependency for trivial logic. Keeps bundle
  small. No ADR needed per Constitution Art. 2.2 (dependency policy) since
  we're not adding a dependency.

**Decision: Replace `Sidebar.tsx` with `SidebarNav.tsx` (not refactor in-place).**

- **Context**: The existing Sidebar is ~161 LOC with no ARIA, no responsive
  overlay, no collapsible groups. The design-spec requires fundamentally
  different structure (overlay with focus trap, landmark roles, collapsible
  groups).
- **Decision**: Create new `SidebarNav.tsx` and delete old `Sidebar.tsx`.
- **Rationale**: Clean implementation avoids accumulating technical debt from
  incremental patches. All callers updated in a single Phase 1 task.

**Decision: Font manifest as static JSON, not database-stored.**

- **Context**: ADR-020 defines a curated list of ~25 fonts. This list changes
  infrequently (perhaps quarterly). Storing in database adds unnecessary
  complexity.
- **Decision**: Static `manifest.json` in `apps/web/public/fonts/`.
- **Rationale**: Simple, cacheable, no API call needed. Updated by deployment
  (new font additions require redeployment). Font files already stored as
  static assets.

---

## 12. Requirement Traceability

| Requirement | Plan Section                              | Implementation Path                                                                    | Phase |
| ----------- | ----------------------------------------- | -------------------------------------------------------------------------------------- | ----- |
| FR-001      | §1.3 Current State                        | Already implemented (React 19 + Vite + TanStack Router)                                | —     |
| FR-002      | §1.3 Current State                        | Already implemented (Module Federation configured)                                     | —     |
| FR-003      | §1.3 Current State                        | Already implemented (plugin-loader.ts)                                                 | —     |
| FR-004      | §1.3 Current State                        | Already implemented (React.lazy + Suspense)                                            | —     |
| FR-005      | §2.1 Overlap Matrix                       | **Spec 010 Phase 1** — PluginErrorBoundary                                             | —     |
| FR-006      | §5.1 SidebarNav, §5.2 Breadcrumbs         | T005-01 SidebarNav, T005-02 Breadcrumbs, T005-07 Header logo                           | 1, 2  |
| FR-007      | §5.1 SidebarNav                           | T005-01 plugin nav items in collapsible group                                          | 1     |
| FR-008      | §5.3 PluginNotFoundPage, §5.10 RouteGuard | T005-03 reserved routes, T005-04 PluginNotFoundPage                                    | 1     |
| FR-009      | §5.5–5.8 Theme UI                         | T005-09 ColorPicker, T005-10 ThemePreview, T005-11 FontSelector, T005-12 Settings page | 3     |
| FR-010      | §5.5 Settings page                        | T005-12 saves theme via PUT, T005-20 dark mode tokens                                  | 3, 4  |
| FR-011      | §5.11 WidgetContainer                     | T005-05 WidgetContainer + Spec 010 Phase 3 (loadWidget)                                | 1     |
| FR-012      | §1.3 Current State                        | Already implemented (AuthProvider.tsx, auth.store.ts)                                  | —     |
| FR-013      | §5.4 AuthWarningBanner                    | T005-17 AuthWarningBanner                                                              | 4     |
| FR-014      | §1.3 Current State                        | Already implemented (SessionExpiredModal.tsx)                                          | —     |
| FR-015      | §5.6 ColorPickerField                     | T005-08 contrast-utils, T005-09 ColorPickerField                                       | 3     |
| NFR-001     | §8 Phase 2                                | T005-15 CSP config, T005-06 font preloading                                            | 2     |
| NFR-002     | §1.3 Current State                        | Already implemented (lazy loading + Suspense)                                          | —     |
| NFR-003     | §8 Phase 2, §10 R2                        | Font performance budget in ADR-020; preload critical                                   | 2     |
| NFR-004     | §8 Phase 5, §5.6                          | T005-19 skip-to-content, T005-22 ARIA landmarks, T005-08 contrast-utils                | 3, 5  |
| NFR-005     | §5.1 SidebarNav                           | T005-01 responsive overlay (mobile/tablet)                                             | 1     |
| NFR-006     | §5.5 Settings page                        | T005-12 client-side form validation with Zod                                           | 3     |
| NFR-007     | §5.3, §5.4                                | T005-04 PluginNotFoundPage, T005-17 AuthWarningBanner                                  | 1, 4  |
| NFR-008     | §2.1 Overlap Matrix                       | **Spec 010 Phase 1** — error boundaries                                                | —     |

---

## 13. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                  |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | ✅     | Page load < 2s on 3G (font preloading + WOFF2 compression per ADR-020); WCAG 2.1 AA (contrast checker, skip link, landmarks, focus management); mobile responsive (sidebar overlay); actionable error messages (PluginNotFoundPage, AuthWarningBanner) |
| Art. 2  | ✅     | React ^19.2, TanStack Router, Vite, TailwindCSS v4, TypeScript ^5.9 — all approved stack. No new dependencies added. Fonts self-hosted via MinIO (approved stack Art. 2.1)                                                                             |
| Art. 3  | ✅     | Feature module organisation (components/theme, components/Layout, components/auth). Module Federation for plugin loading. API-first (consumes existing REST endpoints). No direct database access from frontend                                        |
| Art. 4  | ✅     | ≥80% test coverage target for all new code. 92 tests planned (72 unit + 10 integration + 10 E2E). Critical modules (contrast-utils) at ≥95%. No regressions in existing tests                                                                          |
| Art. 5  | ✅     | CSP `font-src 'self'` (no third-party font requests). No PII in logs (font-loader errors logged without user data). Admin-only theme settings behind RBAC (client + server). Zod validation for theme input. No secrets in frontend code               |
| Art. 6  | ✅     | Actionable error messages: PluginNotFoundPage ("This feature is not available…"), AuthWarningBanner ("Unable to refresh your session…"), ColorPickerField validation. Standard error format for API responses                                          |
| Art. 7  | ✅     | Kebab-case files (sidebar-nav, color-picker-field, font-loader). PascalCase components (SidebarNav, ColorPickerField). camelCase functions (loadFonts, isReservedRoute). UPPER_SNAKE_CASE constants (RESERVED_ROUTES)                                  |
| Art. 8  | ✅     | Unit tests for all business logic. Integration tests for settings page form submission. E2E tests for navigation and theme configuration. AAA pattern. Descriptive test names with should/when. Independent tests with no shared state                 |
| Art. 9  | ✅     | Theme changes applied on next page load (per save success toast). Font loading uses progressive enhancement (system font fallback). No breaking schema changes. Backward compatible with existing ThemeContext API                                     |

---

## 14. Cross-References

| Document                        | Path                                                     |
| ------------------------------- | -------------------------------------------------------- |
| Spec                            | `.forge/specs/005-frontend-architecture/spec.md`         |
| Design Spec                     | `.forge/specs/005-frontend-architecture/design-spec.md`  |
| User Journeys                   | `.forge/specs/005-frontend-architecture/user-journey.md` |
| Spec 010 (overlapping)          | `.forge/specs/010-frontend-production-readiness/`        |
| Architecture                    | `.forge/architecture/architecture.md`                    |
| Constitution                    | `.forge/constitution.md`                                 |
| ADR-004: Module Federation      | `.forge/knowledge/adr/adr-004-module-federation.md`      |
| ADR-009: TailwindCSS Tokens     | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`  |
| ADR-011: Vite Module Federation | `.forge/knowledge/adr/adr-011-vite-module-federation.md` |
| ADR-020: Font Hosting Strategy  | `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`  |
| Design System                   | `.forge/ux/design-system.md`                             |
| Decision Log                    | `.forge/knowledge/decision-log.md`                       |
| Tasks                           | (Created by `/forge-tasks`)                              |
