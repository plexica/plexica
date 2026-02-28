# Spec: 005 - Frontend Architecture

> Feature specification for the Plexica frontend application shell, Module Federation, theming, and plugin UI integration.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 005        |

---

## 1. Overview

Plexica's frontend is a **React 19** single-page application built with **Vite** and **TanStack Router**, serving as a shell that dynamically loads plugin frontends via **Module Federation** (`@originjs/vite-plugin-federation`). The shell provides base layout, authentication context, tenant theming, internationalization, and route management. Plugin frontends are loaded as remote modules from CDN/S3 at runtime, enabling independent deployment and versioning of plugin UIs.

## 2. Problem Statement

A plugin-based platform needs a frontend architecture that supports dynamically loading plugin UIs without rebuilding or redeploying the shell application. The frontend must handle per-tenant branding (logo, colors, fonts), per-plugin route namespacing to avoid conflicts, shared authentication context, and a widget system that allows plugins to expose reusable components. The architecture must maintain fast page load times (< 2s on 3G) while loading remote modules on demand.

## 3. User Stories

### US-001: Dynamic Plugin Frontend Loading

**As a** tenant user _(Persona: Priya)_,
**I want** plugin pages to load seamlessly within the application,
**so that** plugins feel like native parts of the platform.

**Acceptance Criteria:**

- Given a CRM plugin is enabled for my tenant, when I navigate to `/crm/contacts`, then the CRM contacts page loads from the remote entry.
- Given a plugin's remote module is unavailable, when I navigate to a plugin route, then a graceful error boundary is shown (not a blank screen).
- Given a plugin is disabled for my tenant, when I navigate to its route, then a 404 page is shown.
- Given first navigation to a plugin page, when the remote entry loads, then a loading indicator is shown during the fetch.

### US-002: Tenant Theming

**As a** tenant admin _(Persona: Dana)_,
**I want** to customize the platform's look with my organization's branding,
**so that** the application reflects my company identity.

**Acceptance Criteria:**

- Given a tenant theme with custom logo, colors, and fonts, when a user logs in, then the shell applies the tenant's theme.
- Given theme colors `primary: "#1976d2"`, when the UI renders, then all primary-colored elements use that color.
- Given no custom theme is set, when a user logs in, then the default Plexica theme is applied.
- Given a theme is updated, when the user refreshes, then the new theme is applied.

### US-003: Route Namespace Management

**As the** frontend shell,
**I want** each plugin to have a unique route prefix,
**so that** plugin routes do not conflict with each other or with core routes.

**Acceptance Criteria:**

- Given the CRM plugin with prefix `/crm`, when routes are registered, then all CRM pages are mounted under `/crm/*`.
- Given reserved routes (`/`, `/settings`, `/admin`, `/profile`), when a plugin attempts to use a reserved prefix, then registration is rejected.
- Given multiple enabled plugins, when routes are built, then each plugin's routes are lazily loaded from its remote entry.

### US-004: Widget System

**As a** plugin developer _(Persona: Marcus)_,
**I want** to expose reusable widgets that other plugins or the shell can embed,
**so that** cross-plugin UI integration is possible.

**Acceptance Criteria:**

- Given the CRM plugin exposes `ContactCard` widget, when another plugin imports it, then `ContactCard` renders correctly with data from CRM.
- Given a widget is imported from an unavailable remote, when rendering, then a fallback placeholder is shown.
- Given a widget, when rendered, then it inherits the current tenant theme.

### US-005: Authentication Context

**As the** frontend shell,
**I want** to provide authentication context to all components and plugins,
**so that** user identity, permissions, and tenant info are available without re-fetching.

**Acceptance Criteria:**

- Given a logged-in user, when any component accesses the auth context, then `user`, `tenant`, `roles`, `permissions`, and `teams` are available.
- Given a token nearing expiry, when the shell detects it, then a silent token refresh is triggered before expiry.
- Given a session expires, when the next API call fails with 401, then the user is redirected to login with a "session expired" message.

## 4. Functional Requirements

| ID     | Requirement                                                                                                     | Priority | Story Ref  |
| ------ | --------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| FR-001 | React 19 SPA with Vite build tool and TanStack Router                                                           | Must     | US-001     |
| FR-002 | Module Federation via `@originjs/vite-plugin-federation` for plugin remote loading                              | Must     | US-001     |
| FR-003 | Plugin remote entries loaded from CDN/S3 URLs declared in plugin manifest                                       | Must     | US-001     |
| FR-004 | Lazy loading of plugin routes with `React.lazy()` and Suspense fallback                                         | Must     | US-001     |
| FR-005 | Error boundaries around remote module loading to prevent shell crashes                                          | Must     | US-001     |
| FR-006 | Shell provides: base layout (header, sidebar, navigation), routing, auth context, theme, i18n                   | Must     | US-005     |
| FR-007 | Route prefix per plugin: `/{pluginId}/*` for plugin pages                                                       | Must     | US-003     |
| FR-008 | Reserved routes: `/`, `/settings`, `/admin`, `/profile`, `/team`, `/login`, `/auth` — not assignable to plugins | Must     | US-003     |
| FR-009 | Tenant theme: logo, color palette (primary, secondary, background, surface, text), font families                | Must     | US-002     |
| FR-010 | Theme loaded from tenant settings on login; applied via CSS custom properties / TailwindCSS tokens              | Must     | US-002     |
| FR-011 | Widget system: plugins expose components via Module Federation `exposes` config                                 | Should   | US-004     |
| FR-012 | Auth context provider: user, tenant, roles, permissions, teams available via React context                      | Must     | US-005     |
| FR-013 | Silent token refresh before expiry (background interval check)                                                  | Must     | US-005     |
| FR-014 | Session expiry redirect to login with "session expired" message                                                 | Must     | US-005     |
| FR-015 | TailwindCSS v4 with semantic design tokens (per ADR-009)                                                        | Must     | US-002     |
| FR-016 | All user-facing shell changes gated behind feature flags for gradual rollout per Constitution Art. 9.1          | Must     | US-001–005 |

### Feature Flags (FR-016)

Per Constitution Article 9.1, all user-facing changes must use feature flags for gradual rollout and fast rollback. The following flags are required:

| Flag Name                    | Controls                                              | Default | Tasks Gated                        |
| ---------------------------- | ----------------------------------------------------- | ------- | ---------------------------------- |
| `ENABLE_NEW_SIDEBAR`         | New `SidebarNav` replaces legacy `Sidebar` component  | `false` | T005-01, T005-02                   |
| `ENABLE_TENANT_THEMING`      | Tenant Theme Settings page and font loading           | `false` | T005-09, T005-10, T005-11, T005-12 |
| `ENABLE_AUTH_WARNING_BANNER` | `AuthWarningBanner` component display                 | `false` | T005-17                            |
| `ENABLE_DARK_MODE`           | Dark mode token support and tenant dark-mode variants | `false` | T005-20                            |

**Naming convention**: flags use `ENABLE_` prefix + `SCREAMING_SNAKE_CASE` descriptor, evaluated client-side via a `useFeatureFlag(name)` hook. Flags are configurable per-tenant via the admin API.

**Rollout plan**: Enable progressively — internal tenant first, then beta tenants, then all tenants over a 2-week window. Disable at any time for instant rollback (Constitution Art. 9.1).
| FR-016 | All user-facing shell changes gated behind feature flags for gradual rollout per Constitution Art. 9.1 | Must | US-001–005 |

## 5. Non-Functional Requirements

| ID      | Category      | Requirement                                               | Target                                 |
| ------- | ------------- | --------------------------------------------------------- | -------------------------------------- |
| NFR-001 | Performance   | Initial shell load time (without plugins)                 | < 1.5s on 3G                           |
| NFR-002 | Performance   | Plugin remote entry load time                             | < 500ms per plugin on broadband        |
| NFR-003 | Performance   | Page load with plugin (including remote fetch)            | < 2s on 3G (per Constitution Art. 1.3) |
| NFR-004 | Accessibility | WCAG 2.1 AA compliance                                    | All core shell UI                      |
| NFR-005 | Accessibility | Mobile responsiveness                                     | Usable on mobile devices               |
| NFR-006 | UX            | Client-side form validation with real-time error feedback | All forms in shell                     |
| NFR-007 | UX            | Actionable error messages for all user-facing errors      | No generic "something went wrong"      |
| NFR-008 | Reliability   | Shell must function if a plugin remote fails to load      | Error boundary; rest of app unaffected |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                          | Expected Behavior                                                      |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Plugin remote entry URL is unreachable            | Error boundary displays "Plugin unavailable"; shell continues          |
| 2   | Plugin remote entry returns invalid JavaScript    | Error boundary catches; console error logged; fallback shown           |
| 3   | Two plugins attempt to register same route prefix | Second registration rejected; error logged during plugin enable        |
| 4   | Tenant theme has invalid color values             | Default theme applied; warning logged                                  |
| 5   | Token refresh fails (Keycloak down)               | User warned; session continues with existing token until expiry        |
| 6   | Plugin widget version mismatch (shell vs remote)  | Module Federation handles version resolution; fallback if incompatible |
| 7   | Browser with JavaScript disabled                  | Noscript fallback message displayed                                    |
| 8   | User navigates to disabled plugin route           | 404 page with "This feature is not available" message                  |

## 7. Data Requirements

### Theme Configuration (per tenant)

```json
{
  "tenant_id": "acme-corp",
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

> **Note**: This JSON represents the minimal required fields. The canonical schema (all fields, validation rules, and defaults) is defined in `packages/database/prisma/schema.prisma` (`TenantTheme` model) and validated server-side via the Zod schema in `apps/core-api/src/modules/tenant/dto/update-theme.dto.ts`. Frontend components must not assume additional fields beyond those shown here.

### Plugin Frontend Registration

```json
{
  "pluginId": "crm",
  "remoteEntry": "https://cdn.plexica.io/plugins/crm/1.2.0/remoteEntry.js",
  "routePrefix": "/crm",
  "exposes": {
    "ContactsPage": "./src/pages/Contacts",
    "DealsPage": "./src/pages/Deals",
    "ContactWidget": "./src/widgets/ContactCard"
  }
}
```

## 8. API Requirements

Frontend consumes these APIs (defined in other specs):

| Method | Path                         | Description                            | Spec Ref |
| ------ | ---------------------------- | -------------------------------------- | -------- |
| GET    | /api/v1/auth/me              | Current user + tenant context          | 002      |
| GET    | /api/v1/tenant/plugins       | Enabled plugins with manifests         | 004      |
| GET    | /api/v1/tenant/settings      | Tenant theme and configuration         | 001      |
| PUT    | /api/v1/tenant/settings      | Update tenant theme settings (admin)   | 001      |
| POST   | /api/v1/tenant/settings/logo | Upload tenant logo — multipart (admin) | 001      |
| POST   | /api/v1/auth/refresh         | Token refresh                          | 002      |

## 9. UX/UI Notes

- Shell layout: top header (logo, user menu, notifications), left sidebar (navigation with plugin entries), main content area.
- Sidebar navigation dynamically populated from enabled plugins' route prefixes.
- Responsive: sidebar collapses to hamburger menu on mobile.
- Loading states: skeleton screens for initial load, spinners for plugin remote fetches.
- Dark mode: **in scope** — implemented via TailwindCSS v4 semantic tokens with both light and dark variants (ADR-009). Dark token generation for tenant theme colours is covered by T005-20.

## 10. Out of Scope

- Offline/PWA support (future consideration).
- Server-side rendering (SSR) — client-side SPA only.
- Plugin frontend testing framework (documented separately).
- Custom CSS injection by plugins (plugins must use shared design tokens).
- Drag-and-drop dashboard customization (future Phase 3).

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications, frontend architecture docs, and ADRs.

## 12. Constitution Compliance

| Article | Status | Notes                                                                                                                                                       |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Page load < 2s on 3G (Art. 1.3); WCAG 2.1 AA; mobile responsive                                                                                             |
| Art. 2  | ✅     | React 19, Vite, TanStack Router — all approved stack (Art. 2.1)                                                                                             |
| Art. 3  | ✅     | Module Federation for plugin loading; feature module organization                                                                                           |
| Art. 4  | ✅     | Frontend test coverage via Vitest + Playwright E2E (per ADR-008)                                                                                            |
| Art. 5  | ✅     | Auth context; token validation; no PII in frontend logs                                                                                                     |
| Art. 6  | ✅     | Actionable error messages; error boundaries prevent cascading failures                                                                                      |
| Art. 7  | ✅     | Kebab-case files; PascalCase components; camelCase functions                                                                                                |
| Art. 8  | ⚠️     | Unit tests for components; E2E for plugin loading; contract tests for Module Federation widget API surface deferred to Spec 010 Phase 3 (tracked as TD-008) |
| Art. 9  | ✅     | Feature flags for gradual rollout of UI changes                                                                                                             |

---

## Cross-References

| Document                    | Path                                                     |
| --------------------------- | -------------------------------------------------------- |
| Constitution                | `.forge/constitution.md`                                 |
| Plugin System Spec          | `.forge/specs/004-plugin-system/spec.md`                 |
| Authentication Spec         | `.forge/specs/002-authentication/spec.md`                |
| i18n Spec                   | `.forge/specs/006-i18n/spec.md`                          |
| ADR-004: Module Federation  | `.forge/knowledge/adr/adr-004-module-federation.md`      |
| ADR-009: TailwindCSS Tokens | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`  |
| ADR-011: Vite Federation    | `.forge/knowledge/adr/adr-011-vite-module-federation.md` |
| ADR-020: Font Hosting       | `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`  |
| ADR-008: Playwright E2E     | `.forge/knowledge/adr/adr-008-playwright-e2e.md`         |
| Source: Functional Specs    | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 8)         |
| Source: Frontend Arch       | `docs/ARCHITECTURE.md`                                   |
| Frontend App                | `apps/web/`                                              |
