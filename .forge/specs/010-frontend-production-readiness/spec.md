# Spec: 010 - Frontend Production Readiness

> Feature specification for closing critical implementation gaps in the Plexica frontend application to achieve production readiness.

| Field   | Value      |
| ------- | ---------- |
| Status  | Draft      |
| Author  | forge-pm   |
| Date    | 2026-02-17 |
| Track   | Feature    |
| Spec ID | 010        |

---

## 1. Overview

This specification addresses **3 critical gaps** identified in the brownfield analysis of `apps/web` that block production deployment:

1. **Missing React Error Boundaries** - Plugin crashes cascade to shell crash
2. **Incomplete Tenant Theming System** - No mechanism for tenant logo/colors/fonts
3. **Widget System Not Implemented** - Plugins cannot expose reusable UI components

Additionally, this spec tackles **test coverage** (currently 2.4%, target 80%) and **accessibility compliance** (WCAG 2.1 AA).

## 2. Problem Statement

The frontend shell (`apps/web`) is ~60% implemented per Spec 005-Frontend Architecture, with React 19, Vite, TanStack Router, and Module Federation configured. However, three architectural features required for production are missing or incomplete:

- **Error Isolation:** No error boundaries around plugin remotes; a single plugin error crashes the entire application
- **Tenant Customization:** No theming API to apply tenant-specific branding (logo, colors, fonts)
- **Cross-Plugin UI Sharing:** Widget system (FR-011 from Spec 005) not implemented; plugins cannot expose reusable components

Without these features, the platform cannot:

- Safely load third-party plugins (risk of shell crashes)
- Offer white-label multi-tenancy (no tenant branding)
- Enable plugin ecosystem (no widget sharing)

## 3. User Stories

### US-010: Plugin Error Isolation

**As a** platform user,  
**I want** plugin errors to be contained and not crash the entire application,  
**so that** one faulty plugin doesn't break my entire workflow.

**Acceptance Criteria:**

- Given a plugin remote entry throws an error during load, when the shell renders, then an error boundary displays "Plugin unavailable" and the rest of the app remains functional
- Given a plugin component crashes after mount, when the error occurs, then the plugin area shows a fallback UI and the shell continues to work
- Given a plugin error is caught, when the error boundary activates, then the error is logged to the console with plugin ID and stack trace
- Given a plugin error, when the user clicks "Retry", then the plugin is re-mounted with error boundary reset

### US-011: Tenant Branding

**As a** tenant administrator,  
**I want** to upload my company logo and customize platform colors,  
**so that** users see my brand identity throughout the application.

**Acceptance Criteria:**

- Given a tenant theme with `logo: "https://storage.plexica.io/acme-corp/logo.png"`, when the shell loads, then the logo appears in the header
- Given a tenant theme with `colors.primary: "#FF5733"`, when the UI renders, then all primary-colored buttons/links use that color
- Given a tenant theme with custom fonts, when the shell loads, then the fonts are applied via CSS custom properties
- Given no custom theme, when a user logs in, then the default Plexica theme is used
- Given a theme is updated, when the user refreshes the page, then the new theme is applied

### US-012: Plugin Widget Sharing

**As a** plugin developer,  
**I want** to expose reusable UI components (widgets) that other plugins can import,  
**so that** plugins can integrate with each other's functionality.

**Acceptance Criteria:**

- Given a CRM plugin exposes `ContactCard` widget, when another plugin imports `crm/ContactCard`, then the widget renders with contact data
- Given a widget remote is unavailable, when a plugin tries to render it, then a fallback placeholder is shown
- Given a widget is rendered, when it receives props, then it updates reactively like a normal React component
- Given a widget uses tenant theme, when rendered, then it inherits theme colors/fonts from the shell

### US-013: Test Coverage

**As a** developer,  
**I want** comprehensive test coverage for all frontend components,  
**so that** regressions are caught before production deployment.

**Acceptance Criteria:**

- Given the frontend codebase, when tests are run, then overall coverage is ≥80% (lines, branches, functions)
- Given critical components (AuthProvider, ThemeProvider, ErrorBoundary, Layout), when tested, then coverage is ≥90%
- Given each route component, when tested, then rendering and user interactions are covered
- Given plugin loading logic, when tested, then success, failure, and retry scenarios are covered

### US-014: Accessibility Compliance

**As a** user with disabilities,  
**I want** the platform to be accessible via keyboard and screen readers,  
**so that** I can use the application effectively.

**Acceptance Criteria:**

- Given the shell UI, when tested with axe-core, then no WCAG 2.1 AA violations are found
- Given any interactive element, when navigating with keyboard, then Tab/Shift+Tab reach all elements in logical order
- Given a button or link, when focused, then a visible focus indicator is shown
- Given form fields, when using a screen reader, then labels and error messages are announced
- Given modals/dialogs, when opened, then focus is trapped and Escape key closes them

## 4. Functional Requirements

| ID     | Requirement                                                                                                  | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| FR-016 | React Error Boundary component wrapping all plugin remote imports                                            | Must     | US-010    |
| FR-017 | Error boundary displays fallback UI with plugin name, error message, and "Retry" button                      | Must     | US-010    |
| FR-018 | Error boundary logs errors to console with structured context (pluginId, tenantSlug, timestamp, stack trace) | Must     | US-010    |
| FR-019 | Tenant theme API: fetch theme from `/api/v1/tenant/settings`, store in ThemeContext                          | Must     | US-011    |
| FR-020 | Apply tenant theme via CSS custom properties: `--color-primary`, `--color-secondary`, `--font-heading`, etc. | Must     | US-011    |
| FR-021 | Tenant logo displayed in shell header; default logo if none provided                                         | Must     | US-011    |
| FR-022 | Widget system: plugins declare `exposes` in Module Federation config                                         | Must     | US-012    |
| FR-023 | Widget loader utility: `loadWidget(pluginId, widgetName)` with error handling                                | Must     | US-012    |
| FR-024 | Widget fallback placeholder component when remote unavailable                                                | Must     | US-012    |
| FR-025 | Test coverage ≥80% overall; ≥90% for critical components (AuthProvider, ThemeProvider, ErrorBoundary)        | Must     | US-013    |
| FR-026 | WCAG 2.1 AA compliance verified via axe-core automated testing                                               | Must     | US-014    |
| FR-027 | Keyboard navigation support: all interactive elements reachable via Tab; visible focus indicators            | Must     | US-014    |
| FR-028 | Screen reader compatibility: semantic HTML, ARIA labels, live regions for dynamic content                    | Must     | US-014    |

## 5. Non-Functional Requirements

| ID      | Category      | Requirement                                                                    | Target                                |
| ------- | ------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| NFR-009 | Quality       | Test coverage for frontend codebase                                            | ≥80% (Constitution Art. 4.1)          |
| NFR-010 | Quality       | Critical components test coverage (AuthProvider, ThemeProvider, ErrorBoundary) | ≥90%                                  |
| NFR-011 | Observability | Structured error logging for plugin errors (JSON format with context)          | Pino logger integration               |
| NFR-012 | Accessibility | WCAG 2.1 AA compliance for all shell UI                                        | Zero axe-core violations              |
| NFR-013 | Performance   | Error boundary rendering overhead                                              | < 10ms per boundary                   |
| NFR-014 | Performance   | Theme application on page load                                                 | < 50ms (no flash of unstyled content) |
| NFR-015 | Performance   | Widget lazy load time                                                          | < 300ms per widget                    |
| NFR-016 | UX            | Error boundary fallback should be user-friendly (not technical stack trace)    | No raw errors shown                   |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                      | Expected Behavior                                                                               |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Plugin remote entry URL is unreachable (network error)        | Error boundary shows "Plugin unavailable - Check your connection"; Retry button available       |
| 2   | Plugin remote entry returns invalid JavaScript                | Error boundary catches syntax error; logs to console; shows fallback UI                         |
| 3   | Plugin component throws error in render method                | Error boundary catches; displays fallback; rest of shell continues                              |
| 4   | Plugin component throws error in useEffect hook               | Error boundary catches async error; displays fallback; no shell crash                           |
| 5   | Tenant theme API returns 404 (theme not configured)           | Default Plexica theme applied; no error shown to user                                           |
| 6   | Tenant theme has invalid color format (e.g., "red" not hex)   | Color validation rejects; default color used; warning logged                                    |
| 7   | Tenant logo URL returns 404 (image not found)                 | Broken image fallback or default Plexica logo shown                                             |
| 8   | Widget remote is unavailable when plugin tries to load it     | Widget fallback placeholder shown; error logged; rest of plugin continues                       |
| 9   | Widget version mismatch (shell expects v2, plugin exports v1) | Module Federation resolves version; if incompatible, fallback placeholder shown                 |
| 10  | User has JavaScript disabled in browser                       | Noscript fallback message: "JavaScript is required to use Plexica"                              |
| 11  | Error boundary itself crashes (React bug)                     | Root-level error boundary catches; full-page error shown with support contact                   |
| 12  | Tenant theme applied but custom fonts fail to load (CDN down) | System fonts used as fallback; no layout shift                                                  |
| 13  | Plugin widget uses incompatible React version                 | Module Federation singleton resolution; if incompatible, runtime error caught by error boundary |
| 14  | Screen reader user navigates to error boundary fallback       | Error message announced; Retry button accessible via keyboard                                   |

## 7. Data Requirements

### Tenant Theme Structure (from `/api/v1/tenant/settings`)

```json
{
  "tenantId": "acme-corp",
  "tenantSlug": "acme-corp",
  "settings": {
    "theme": {
      "logo": "https://storage.plexica.io/acme-corp/logo.png",
      "colors": {
        "primary": "#1976d2",
        "secondary": "#dc004e",
        "background": "#ffffff",
        "surface": "#f5f5f5",
        "text": "#212121",
        "textSecondary": "#757575",
        "error": "#f44336",
        "success": "#4caf50",
        "warning": "#ff9800"
      },
      "fonts": {
        "heading": "Inter",
        "body": "Roboto",
        "mono": "Fira Code"
      }
    }
  }
}
```

### Plugin Widget Manifest (Module Federation `exposes`)

```typescript
// Plugin's vite.config.ts
export default defineConfig({
  plugins: [
    federation({
      name: 'crm',
      filename: 'remoteEntry.js',
      exposes: {
        './ContactCard': './src/widgets/ContactCard.tsx',
        './DealPipeline': './src/widgets/DealPipeline.tsx',
        './ActivityTimeline': './src/widgets/ActivityTimeline.tsx',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
});
```

### Error Boundary Context Data

```typescript
interface PluginErrorContext {
  pluginId: string;
  tenantSlug: string;
  userId?: string;
  timestamp: string; // ISO 8601
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
  url: string; // Current page URL
  userAgent: string;
}
```

## 8. API Requirements

Frontend consumes these APIs:

| Method | Path                    | Description                         | Status    |
| ------ | ----------------------- | ----------------------------------- | --------- |
| GET    | /api/v1/tenant/settings | Fetch tenant theme configuration    | Exists ✅ |
| GET    | /api/v1/tenant/plugins  | Get enabled plugins with manifests  | Exists ✅ |
| POST   | /api/v1/logs/frontend   | Send frontend error logs to backend | To create |

**Note:** POST `/api/v1/logs/frontend` is optional (nice-to-have). Error boundary can log to console for now; structured backend logging can be added in Phase 2.

## 9. UX/UI Notes

### Error Boundary Fallback UI

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

- Center-aligned, card-like container
- Icon: warning symbol (⚠️)
- Plugin name in quotes for clarity
- User-friendly error message (no stack trace)
- Two action buttons: Retry (primary), Go Back (secondary)

### Tenant Logo Placement

- **Header Left:** Logo appears in top-left corner of shell header
- **Size:** Max height 40px (desktop), 32px (mobile)
- **Fallback:** If no tenant logo, show default "Plexica" wordmark
- **Link:** Logo is clickable, links to `/` (home)

### Widget Fallback Placeholder

```
┌─────────────────────────────────────────┐
│ 📦  Widget Unavailable                  │
│                                         │
│ The requested widget could not be       │
│ loaded from the plugin.                 │
└─────────────────────────────────────────┘
```

- Gray box with dashed border
- Small icon (📦)
- Minimal message (no retry button - auto-retries can be noisy)

## 10. Out of Scope

- **Tenant theme editor UI** (separate Spec 011 for admin interface)
- **Advanced theme features** (dark mode, theme inheritance) - deferred to Phase 2
- **Widget versioning and dependency resolution** (handled by Module Federation; no custom logic in this spec)
- **Backend logging API for frontend errors** (optional; can log to console only in Phase 1)
- **Multi-level error boundaries** (one boundary per plugin route is sufficient for MVP)
- **Custom error boundary per plugin** (all plugins use same shell-provided boundary)

## 11. Open Questions

**Q1:** Should we create a backend API endpoint (`POST /api/v1/logs/frontend`) for frontend error logging, or is console logging sufficient for Phase 1?

**Answer:** Console logging is sufficient for Phase 1. Backend logging endpoint can be added in Phase 2 if needed.

**Q2:** Should tenant theme validation happen on frontend or backend?

**Answer:** Validation should happen on backend when tenant updates theme settings. Frontend applies theme assuming it's valid; falls back to defaults if invalid.

**Q3:** Should we support CSS-in-JS (styled-components, emotion) or only TailwindCSS + CSS custom properties for theming?

**Answer:** Only TailwindCSS v4 + CSS custom properties (per ADR-009). No CSS-in-JS for theme application. Plugins can use CSS-in-JS internally but must respect theme tokens.

**Q4:** How should widget lazy loading work? Immediate load on mount or lazy load on viewport intersection?

**Answer:** Lazy load on mount (via `React.lazy()`). No viewport intersection optimization in Phase 1 (can be added later for performance).

## 12. Constitution Compliance

| Article | Status | Notes                                                                                                                                              |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Multi-tenancy isolation (tenant theming per tenant); UX standards (error boundaries)                                                               |
| Art. 2  | ⚠️     | 3 new dependencies added: `pino` (apps/web), `@axe-core/react`, `axe-playwright`. ADR-021 and ADR-022 pending approval before implementation merge |
| Art. 3  | ✅     | Error boundaries follow React best practices; theming via context pattern                                                                          |
| Art. 4  | ✅     | Test coverage target ≥80% (NFR-009); critical components ≥90% (NFR-010)                                                                            |
| Art. 5  | ✅     | No security impact (frontend-only changes); no PII in error logs                                                                                   |
| Art. 6  | ✅     | Error messages user-friendly (FR-017); structured logging context (FR-018)                                                                         |
| Art. 7  | ✅     | Naming: PascalCase components (ErrorBoundary, ThemeProvider), camelCase utils (loadWidget)                                                         |
| Art. 8  | ✅     | Test requirements defined (FR-025); unit + integration + E2E tests planned                                                                         |
| Art. 9  | ✅     | Error boundaries enable zero-downtime plugin updates (isolated failures)                                                                           |

---

## Cross-References

| Document                     | Path                                                    |
| ---------------------------- | ------------------------------------------------------- |
| Constitution                 | `.forge/constitution.md`                                |
| Spec 005: Frontend Arch      | `.forge/specs/005-frontend-architecture/spec.md`        |
| Spec 004: Plugin System      | `.forge/specs/004-plugin-system/spec.md`                |
| ADR-004: Module Federation   | `.forge/knowledge/adr/adr-004-module-federation.md`     |
| ADR-009: TailwindCSS Tokens  | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md` |
| ADR-020: Font Hosting        | `.forge/knowledge/adr/adr-020-font-hosting-strategy.md` |
| ADR-021: Pino Frontend       | `.forge/knowledge/adr/adr-021-pino-frontend.md`         |
| ADR-022: Axe-Core/Playwright | `.forge/knowledge/adr/adr-022-axe-core-playwright.md`   |
| Frontend App                 | `apps/web/`                                             |
| Shared Types Package         | `packages/shared-types/`                                |
| Brownfield Analysis          | `.forge/knowledge/decision-log.md` (Feb 17, 2026 entry) |

---

## Implementation Plan Summary

See `plan.md` for detailed technical design. High-level phases:

1. **Phase 1: Error Boundaries** (1 week, 8h implementation + 8h tests) ✅ Complete
2. **Phase 2: Tenant Theming** (2 weeks, 16h implementation + 10h tests + 7h ADR-020 font loading) ✅ Core complete; ADR-020 tasks pending
3. **Phase 3: Widget System** (1.5 weeks, 12h implementation + 6h tests)
4. **Phase 4: Test Coverage** (2 weeks, 45h tests)
5. **Phase 5: Accessibility** (1 week, 10h fixes + audits)

**Total Estimated Effort:** 136 hours across 3 sprints

See `tasks.md` for granular task breakdown with story points.
