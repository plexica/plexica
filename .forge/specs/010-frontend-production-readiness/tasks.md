# Tasks: 010 - Frontend Production Readiness

> Granular task breakdown for implementing error boundaries, tenant theming, widget system, test coverage, and accessibility.

**Spec:** 010-frontend-production-readiness  
**Date:** 2026-02-17  
**Status:** In Progress — Phase 1 & 2 Complete  
**Total Estimated Effort:** 136 hours  
**Total Story Points:** 65 points (Fibonacci scale)

---

## Task Summary

| Phase                     | Tasks  | Hours    | Story Points | Tests          |
| ------------------------- | ------ | -------- | ------------ | -------------- |
| Phase 1: Error Boundaries | 6      | 17h      | 8 pts        | 11 tests       |
| Phase 2: Tenant Theming   | 11     | 38h      | 18 pts       | 21 tests       |
| Phase 3: Widget System    | 7      | 20h      | 10 pts       | 9 tests        |
| Phase 4: Test Coverage    | 5      | 45h      | 21 pts       | 75+ tests      |
| Phase 5: Accessibility    | 6      | 16h      | 8 pts        | 5 tests        |
| **Total**                 | **35** | **136h** | **65 pts**   | **121+ tests** |

---

## Phase 1: Error Boundaries (Sprint 4 Week 1)

**Goal:** Prevent plugin errors from crashing shell application  
**Estimated Effort:** 17 hours  
**Story Points:** 8 points  
**Priority:** CRITICAL (blocks production deployment)

### Task 1.1: Create PluginErrorBoundary Component

**Description:** Implement React error boundary class component to catch plugin errors.

**Estimated Time:** 4 hours  
**Story Points:** 3  
**Assignee:** Frontend Lead  
**Priority:** P0 - Critical

**Acceptance Criteria:**

- [x] Component catches errors during plugin remote loading (network errors)
- [x] Component catches errors during plugin component rendering (runtime errors)
- [x] Component catches errors in useEffect hooks (async errors)
- [x] Error state stored in component state (`hasError`, `error`, `errorInfo`)
- [x] `getDerivedStateFromError()` sets error state
- [x] `componentDidCatch()` logs error context
- [x] `resetError()` method clears error state

**Implementation Details:**

- File: `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx`
- Extends `React.Component<PluginErrorBoundaryProps, ErrorBoundaryState>`
- Props: `pluginId`, `pluginName`, `children`, `fallback?`
- State: `hasError`, `error`, `errorInfo`
- Methods: `getDerivedStateFromError()`, `componentDidCatch()`, `resetError()`, `render()`

**Technical Notes:**

- Use `React.Component` (not function component - error boundaries must be class components)
- Log error context with Pino logger (pluginId, tenantSlug, userId, timestamp, stack trace)
- Support custom fallback component via props
- Default to `PluginErrorFallback` if no custom fallback

**Dependencies:**

- Pino logger (Task 1.4)
- AuthContext for tenant/user context

**Test Coverage:**

- Unit test: Catches component render errors (2 tests)
- Unit test: Catches async errors (1 test)
- Unit test: Logs error context (1 test)
- Unit test: Reset error on retry (1 test)

---

### Task 1.2: Create PluginErrorFallback UI Component

**Description:** Design and implement user-friendly error fallback UI.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P0 - Critical

**Acceptance Criteria:**

- [x] Displays warning icon (⚠️)
- [x] Shows plugin name in error message
- [x] Shows user-friendly error description (no stack trace)
- [x] Shows error message in gray box with monospace font
- [x] Provides "Retry" button (primary CTA)
- [x] Provides "Go Back" button (secondary CTA)
- [x] Responsive layout (mobile + desktop)
- [ ] Supports i18n (uses `useTranslations` hook)

**Implementation Details:**

- File: `apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx`
- Props: `pluginName`, `error`, `onRetry`
- Uses TailwindCSS for styling
- Uses `react-intl` for i18n
- Uses `useNavigate()` for "Go Back" button

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

**Technical Notes:**

- Center card layout with max-width 500px
- Use `bg-surface`, `text-text`, `text-warning` theme colors
- Error message in `bg-error-light text-error-dark` box
- Buttons use `btn-primary` and `btn-secondary` classes

**Dependencies:**

- `@plexica/ui` Button component
- `react-intl` for translations
- TanStack Router `useNavigate` hook

**Test Coverage:**

- Unit test: Renders with plugin name (1 test)
- Unit test: Calls onRetry when button clicked (1 test)
- Unit test: Navigates back when "Go Back" clicked (1 test)

---

### Task 1.3: Integrate Error Boundary in Plugin Routes

**Description:** Wrap all plugin routes with `PluginErrorBoundary`.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P0 - Critical

**Acceptance Criteria:**

- [x] `PluginErrorBoundary` wraps plugin component in `plugins.$pluginId.tsx` route
- [x] `pluginId` and `pluginName` passed as props
- [x] Error boundary wraps Suspense (not inside Suspense)
- [x] Plugin metadata fetched from `usePlugin()` hook
- [x] All existing plugin routes updated

**Implementation Details:**

- File: `apps/web/src/routes/plugins.$pluginId.tsx`
- Import `PluginErrorBoundary` from `@/components/ErrorBoundary/PluginErrorBoundary`
- Fetch plugin metadata with `usePlugin(pluginId)` hook
- Wrap `<Suspense><PluginComponent /></Suspense>` with error boundary

**Code Example:**

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

**Technical Notes:**

- Error boundary MUST wrap Suspense (not be wrapped by Suspense)
- If plugin metadata not available, use `pluginId` as fallback name

**Dependencies:**

- Task 1.1 (PluginErrorBoundary component)
- `usePlugin()` hook from plugin service

**Test Coverage:**

- Integration test: Plugin load error triggers boundary (1 test)
- Integration test: Plugin render error triggers boundary (1 test)

---

### Task 1.4: Add Pino Logger for Error Context

**Description:** Configure Pino logger for structured frontend error logging.

**Estimated Time:** 1 hour  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Pino logger configured with browser transport
- [x] Logger exports `logger.error()`, `logger.warn()`, `logger.info()` methods
- [x] Error logs include context: `pluginId`, `tenantSlug`, `userId`, `timestamp`, `stack`
- [x] Log level configurable via environment variable `VITE_LOG_LEVEL`
- [x] Pretty-print enabled in development, JSON in production

**Implementation Details:**

- File: `apps/web/src/lib/logger.ts`
- Install `pino` and `pino-pretty` (devDependency)
- Use `pino` with browser-compatible config
- Export singleton `logger` instance

**Code Example:**

```typescript
import pino from 'pino';

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = pino({
  level: import.meta.env.VITE_LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  browser: {
    asObject: true,
    serialize: true,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

**Technical Notes:**

- Pino browser mode uses `console.*` methods under the hood
- Structured logging requires `asObject: true`
- Future enhancement: Send logs to backend via POST `/api/v1/logs/frontend` (out of scope for Phase 1)

**Dependencies:**

- `pino` package (add to `apps/web/package.json`)

**Test Coverage:**

- Unit test: Logger exports correct methods (1 test)
- Unit test: Logger formats context correctly (1 test)

---

### Task 1.5: Write Unit Tests for Error Boundary

**Description:** Comprehensive unit tests for `PluginErrorBoundary` component.

**Estimated Time:** 6 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Test: Component catches render errors ✅
- [x] Test: Component catches async errors (useEffect) ✅
- [x] Test: Error state updated correctly ✅
- [x] Test: Error context logged with Pino ✅
- [x] Test: Fallback UI rendered on error ✅
- [x] Test: Custom fallback component supported ✅
- [x] Test: Reset error on retry ✅
- [x] Test: Children rendered when no error ✅
- [x] Coverage: ≥90% for PluginErrorBoundary

**Implementation Details:**

- File: `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.test.tsx`
- Use `@testing-library/react` for rendering
- Use `@testing-library/user-event` for interactions
- Mock Pino logger with `vi.mock()`
- Create helper components that throw errors for testing

**Test Cases:**

1. Catches component render error → Displays fallback
2. Catches async error (useEffect) → Displays fallback
3. Logs error context to Pino → Verify logger.error() called with context
4. Custom fallback component → Renders custom fallback instead of default
5. Reset error on retry → Error state cleared, children re-rendered
6. No error → Children rendered normally
7. Multiple errors → Each error caught independently
8. Error info includes component stack → Verify errorInfo.componentStack

**Technical Notes:**

- Use `jest.spyOn(console, 'error')` to suppress React error boundary console logs in tests
- Create reusable `ThrowError` component for testing

**Dependencies:**

- Task 1.1 (PluginErrorBoundary component)
- Task 1.2 (PluginErrorFallback component)
- Task 1.4 (Pino logger)

**Test Coverage Target:** ≥90% (lines, branches, functions)

---

### Task 1.6: Write Integration Tests for Plugin Error Scenarios

**Description:** Integration tests for plugin loading errors with real Module Federation scenarios.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [x] Test: Plugin remote entry unreachable (network error) → Error boundary shown
- [x] Test: Plugin remote returns invalid JS → Error boundary shown
- [x] Test: Plugin component throws on mount → Error boundary shown
- [x] Test: Shell continues to work after plugin error → Verify header/sidebar visible

**Implementation Details:**

- File: `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.integration.test.tsx`
- Use MSW (Mock Service Worker) to simulate network errors
- Mock Module Federation imports with dynamic import failures

**Test Cases:**

1. Network error (fetch 404) → Error boundary displays "Plugin unavailable"
2. Invalid JavaScript (syntax error) → Error boundary catches and displays fallback
3. Plugin component crashes on mount → Error boundary isolates error, shell works

**Technical Notes:**

- Mock `import(/* @vite-ignore */ 'plugin-name')` to throw errors
- Verify rest of shell (header, sidebar) remains functional after error

**Dependencies:**

- Task 1.1 (PluginErrorBoundary)
- Task 1.3 (Plugin route integration)

**Test Coverage Target:** Edge cases and integration scenarios

---

## Phase 2: Tenant Theming (Sprint 4 Week 2-3)

**Goal:** Enable tenant-specific branding (logo, colors, fonts)  
**Estimated Effort:** 38 hours  
**Story Points:** 18 points  
**Priority:** HIGH (required for white-label multi-tenancy)

### Task 2.1: Create ThemeContext and ThemeProvider

**Description:** React context for managing tenant theme state.

**Estimated Time:** 6 hours  
**Story Points:** 3  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] `ThemeContext` created with `createContext()`
- [x] `ThemeProvider` component wraps app in `main.tsx`
- [x] Theme state includes: `theme`, `isLoading`, `error`, `refreshTheme()`
- [x] Default theme applied on mount
- [x] Theme stored in context, accessible via `useTheme()` hook
- [x] Theme persists across route changes

**Implementation Details:**

- File: `apps/web/src/contexts/ThemeContext.tsx`
- Export `ThemeContext`, `ThemeProvider`, `useTheme` hook
- State shape: `{ theme: TenantTheme, isLoading: boolean, error: Error | null }`
- Default theme matches current Plexica branding

**Default Theme:**

```typescript
const defaultTheme: TenantTheme = {
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#212121',
    textSecondary: '#757575',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
  fonts: {
    heading: 'Inter',
    body: 'Roboto',
    mono: 'Fira Code',
  },
};
```

**Technical Notes:**

- Use `useState` for theme state
- Use `useEffect` to apply theme on mount
- Provide `refreshTheme()` method to refetch from API

**Dependencies:**

- AuthContext (to get tenant slug)

**Test Coverage:**

- Unit test: Default theme applied on mount (1 test)
- Unit test: useTheme hook returns theme context (1 test)
- Unit test: ThemeProvider renders children (1 test)

---

### Task 2.2: Implement Theme Fetching from API

**Description:** Fetch tenant theme from `/api/v1/tenant/settings` on login.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Theme fetched via `GET /api/v1/tenant/settings` on ThemeProvider mount
- [x] API call triggered when tenant context available (not before login)
- [x] Theme extracted from `response.data.settings.theme`
- [x] Fetch errors handled gracefully (log warning, use default theme)
- [x] Loading state set during fetch
- [x] API client uses authenticated axios instance

**Implementation Details:**

- In `ThemeProvider` component: `useEffect(() => { fetchTheme() }, [tenant?.slug])`
- Use `apiClient.get('/api/v1/tenant/settings')` from `@plexica/api-client`
- Set `isLoading: true` before fetch, `false` after
- On success: `setTheme(validatedTheme)`
- On error: Log warning, use default theme

**API Response Format:**

```json
{
  "tenantId": "acme-corp",
  "settings": {
    "theme": {
      "logo": "https://storage.plexica.io/acme-corp/logo.png",
      "colors": { "primary": "#FF5733", ... },
      "fonts": { "heading": "Arial", ... }
    }
  }
}
```

**Technical Notes:**

- Don't fetch theme if user not logged in (`tenant` is null)
- Theme fetch should not block app rendering (loading state in background)

**Dependencies:**

- Task 2.1 (ThemeContext)
- `@plexica/api-client` authenticated axios instance
- AuthContext for tenant slug

**Test Coverage:**

- Integration test: Successful fetch applies theme (1 test)
- Integration test: Fetch error uses default theme (1 test)
- Integration test: No fetch before login (1 test)

---

### Task 2.3: Implement Theme Validation and Fallback Logic

**Description:** Validate theme data from API; fallback to defaults for invalid values.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Color values validated as hex format (`#RRGGBB` or `#RGB`)
- [x] Invalid colors replaced with default theme colors
- [x] Font families validated against `FONT_CATALOG` from `packages/shared-types/src/fonts.ts` (ADR-020)
- [x] Unknown font IDs fall back to default theme font (not arbitrary strings)
- [x] Logo URL validated (HTTPS URL or empty)
- [x] Validation warnings logged to console
- [x] Partial themes merged with defaults (not rejected entirely)

**Implementation Details:**

- File: `apps/web/src/lib/theme-utils.ts`
- Export `validateTheme(theme: Partial<TenantTheme>): TenantTheme`
- Export `isValidHexColor(color: string): boolean`
- Export `applyTheme(theme: TenantTheme): void` (next task)

**Validation Rules:**

```typescript
function validateTheme(theme: Partial<TenantTheme>): TenantTheme {
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

  const validatedColors: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors || {})) {
    if (typeof value === 'string' && hexColorRegex.test(value)) {
      validatedColors[key] = value;
    } else {
      logger.warn({ key, value }, `Invalid color format: ${key}`);
      validatedColors[key] = defaultTheme.colors[key];
    }
  }

  return {
    logo: theme.logo,
    colors: { ...defaultTheme.colors, ...validatedColors },
    fonts: { ...defaultTheme.fonts, ...theme.fonts },
  };
}
```

**Technical Notes:**

- Validation should be lenient (don't reject entire theme for one bad value)
- Merge validated values with defaults
- Log warnings for invalid values (helps tenant admins debug)

**Dependencies:**

- Task 2.1 (ThemeContext with default theme)
- Pino logger (Task 1.4)

**Test Coverage:**

- Unit test: Valid hex colors pass validation (2 tests)
- Unit test: Invalid colors fallback to defaults (2 tests)
- Unit test: Partial theme merged with defaults (2 tests)
- Unit test: Warnings logged for invalid values (1 test)

---

### Task 2.4: Apply Theme via CSS Custom Properties

**Description:** Apply validated theme to DOM via CSS custom properties.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Theme colors applied as CSS variables on `:root` (document.documentElement)
- [x] CSS variables: `--color-primary`, `--color-secondary`, `--color-background`, etc.
- [x] Font families applied: `--font-heading`, `--font-body`, `--font-mono`
- [x] Fonts loaded via FontFace API from self-hosted WOFF2 files (ADR-020; see Task 2.9)
- [x] Theme applied on ThemeProvider mount
- [x] Theme re-applied when theme changes (on refresh or update)
- [x] No flash of unstyled content (FOUC)

**Implementation Details:**

- File: `apps/web/src/lib/theme-utils.ts`
- Export `applyTheme(theme: TenantTheme): void`
- Set CSS custom properties on `document.documentElement.style`

**Code Example:**

```typescript
export function applyTheme(theme: TenantTheme) {
  const root = document.documentElement;

  // Apply colors
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-text', theme.colors.text);
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--color-error', theme.colors.error);
  root.style.setProperty('--color-success', theme.colors.success);
  root.style.setProperty('--color-warning', theme.colors.warning);

  // Apply font CSS custom properties (font-face loading handled by loadTenantFonts — ADR-020)
  root.style.setProperty('--font-heading', theme.fonts.heading);
  root.style.setProperty('--font-body', theme.fonts.body);
  root.style.setProperty('--font-mono', theme.fonts.mono);

  // Load WOFF2 font files via FontFace API (ADR-020 — never Google Fonts CDN)
  loadTenantFonts(theme.fonts).catch((err) =>
    logger.warn({ err }, 'Font loading failed; CSS custom properties still applied')
  );
}
```

**Technical Notes:**

- Call `applyTheme()` in `ThemeProvider` after fetching and validating theme
- Default theme applied before API fetch completes (prevent FOUC)

**Dependencies:**

- Task 2.3 (theme validation)

**Test Coverage:**

- Unit test: CSS variables set on :root (1 test)
- Unit test: Theme re-applied on change (1 test)

---

### Task 2.5: Update TailwindCSS Config for Theme Tokens

**Description:** Configure TailwindCSS to use CSS custom properties from theme.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] TailwindCSS config extended with theme color tokens
- [x] Colors mapped to CSS variables: `primary`, `secondary`, `background`, `surface`, `text`, etc.
- [x] Font families mapped: `heading`, `body`, `mono`
- [x] Components can use `bg-primary`, `text-primary`, `font-heading` classes
- [x] Theme changes reflected in TailwindCSS utilities

**Implementation Details:**

- File: `apps/web/tailwind.config.ts`
- Extend `theme.colors` and `theme.fontFamily` with CSS variable references

**Code Example:**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
        'text-secondary': 'var(--color-text-secondary)',
        error: 'var(--color-error)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Technical Notes:**

- Tailwind will generate classes like `bg-primary`, `text-primary`, `font-heading`
- CSS variables resolved at runtime (theme can change without rebuilding CSS)

**Dependencies:**

- Task 2.4 (CSS custom properties applied)

**Test Coverage:**

- Manual test: Verify TailwindCSS classes use theme colors

---

### Task 2.6: Integrate Tenant Logo in Header Component

**Description:** Display tenant logo in shell header; fallback to default Plexica logo.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Tenant logo displayed in header left corner
- [x] Logo clickable, navigates to `/` (home)
- [x] Logo max height: 40px (desktop), 32px (mobile)
- [x] Fallback to default Plexica logo if no tenant logo
- [x] Fallback to default logo if tenant logo URL returns 404
- [x] Logo loads from `theme.logo` via `useTheme()` hook

**Implementation Details:**

- File: `apps/web/src/components/Layout/Header.tsx`
- Import `useTheme()` hook
- Render `<img src={theme.logo || '/plexica-logo.svg'} />`
- Add `onError` handler to fallback to default logo

**Code Example:**

```tsx
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from '@tanstack/react-router';

export function Header() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="bg-surface border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/' })} className="focus:outline-none">
          <img
            src={theme.logo || '/plexica-logo.svg'}
            alt="Logo"
            className="h-10 md:h-12 max-w-[200px] object-contain"
            onError={(e) => {
              e.currentTarget.src = '/plexica-logo.svg';
            }}
          />
        </button>

        {/* Rest of header: nav, user menu, etc. */}
      </div>
    </header>
  );
}
```

**Technical Notes:**

- Use `object-contain` to prevent logo distortion
- Max width 200px to prevent oversized logos
- `onError` handler prevents broken image icon

**Dependencies:**

- Task 2.1 (ThemeContext)
- Task 2.2 (theme fetching)

**Test Coverage:**

- Unit test: Displays tenant logo when available (1 test)
- Unit test: Displays default logo when no tenant logo (1 test)
- Unit test: Fallback to default on image error (1 test)

---

### Task 2.7: Write Unit Tests for Theme Context

**Description:** Comprehensive unit tests for ThemeContext and ThemeProvider.

**Estimated Time:** 6 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] Test: Default theme applied on mount ✅
- [x] Test: useTheme hook returns theme context ✅
- [x] Test: Theme validation rejects invalid colors ✅
- [x] Test: Theme validation merges with defaults ✅
- [x] Test: applyTheme sets CSS custom properties ✅
- [x] Test: Theme persists across re-renders ✅
- [x] Test: refreshTheme refetches from API ✅
- [x] Coverage: ≥90% for ThemeContext

**Implementation Details:**

- File: `apps/web/src/contexts/ThemeContext.test.tsx`
- Use `@testing-library/react` `renderHook` for testing hooks
- Mock `apiClient.get()` with MSW or vi.mock
- Mock `document.documentElement.style.setProperty` to verify CSS variables

**Test Cases:**

1. Default theme applied on mount → Verify CSS variables set
2. useTheme hook returns theme → Verify theme object structure
3. Invalid colors rejected → Verify defaults used + warning logged
4. Partial theme merged → Verify missing colors use defaults
5. applyTheme sets CSS properties → Verify setProperty calls
6. Theme persists across re-renders → Verify state not reset
7. refreshTheme refetches → Verify API called again
8. Theme fetch error → Verify default theme used + error in context

**Technical Notes:**

- Mock `document.documentElement.style.setProperty` with `vi.spyOn()`
- Verify `logger.warn()` called for invalid theme values

**Dependencies:**

- Task 2.1 (ThemeContext)
- Task 2.2 (theme fetching)
- Task 2.3 (theme validation)

**Test Coverage Target:** ≥90%

---

### Task 2.8: Write Integration Tests for Theme API

**Description:** Integration tests for theme fetching and application with real API mocks.

**Estimated Time:** 4 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [x] Test: Successful API fetch applies theme ✅
- [x] Test: API 404 falls back to default theme ✅
- [x] Test: API 500 falls back to default theme ✅
- [x] Test: No fetch before login ✅
- [x] Test: Theme refetched on tenant change ✅

**Implementation Details:**

- File: `apps/web/src/contexts/ThemeContext.integration.test.tsx`
- Use MSW (Mock Service Worker) for API mocking
- Render `ThemeProvider` with mocked AuthContext
- Verify CSS custom properties set after fetch

**Test Cases:**

1. Successful fetch → Theme applied, CSS variables set
2. API 404 → Default theme, warning logged
3. API 500 → Default theme, error logged
4. No tenant → No fetch, default theme
5. Tenant change → Refetch theme

**Technical Notes:**

- Mock `/api/v1/tenant/settings` endpoint with MSW
- Use `waitFor()` for async fetch completion

**Dependencies:**

- Task 2.1 (ThemeContext)
- Task 2.2 (theme fetching)
- MSW setup in test utilities

**Test Coverage Target:** API integration scenarios

---

### Task 2.9: Define FontDefinition Type and FONT_CATALOG (ADR-020)

**Description:** Create the shared font catalog that defines all self-hosted WOFF2 fonts available for tenant theming. This is the authoritative list — tenant theme font values are validated against it.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] `FontDefinition` interface created in `packages/shared-types/src/fonts.ts`
- [x] `FONT_CATALOG` constant exported with ≥25 curated open-source fonts
- [x] Each entry includes `id`, `displayName`, `woff2Url`, `weights`, `category`
- [x] Default fonts (Inter, Roboto, Fira Code) included at top of catalog
- [x] Font IDs are stable string literals (kebab-case, e.g. `"inter"`, `"roboto"`)
- [x] `isFontId()` type guard exported for runtime validation

**Implementation Details:**

- File: `packages/shared-types/src/fonts.ts`
- WOFF2 files served from `${CDN_BASE_URL}/fonts/{fontId}/{weight}.woff2`
- URL template uses `VITE_STORAGE_BASE_URL` env variable

**Code Skeleton:**

```typescript
// packages/shared-types/src/fonts.ts
export interface FontDefinition {
  id: string;
  displayName: string;
  woff2UrlTemplate: string; // e.g. '/fonts/inter/{weight}.woff2'
  weights: number[]; // e.g. [400, 700]
  category: 'sans-serif' | 'serif' | 'monospace' | 'display';
}

export const FONT_CATALOG: readonly FontDefinition[] = [
  {
    id: 'inter',
    displayName: 'Inter',
    woff2UrlTemplate: '/fonts/inter/{weight}.woff2',
    weights: [400, 500, 700],
    category: 'sans-serif',
  },
  {
    id: 'roboto',
    displayName: 'Roboto',
    woff2UrlTemplate: '/fonts/roboto/{weight}.woff2',
    weights: [400, 700],
    category: 'sans-serif',
  },
  {
    id: 'fira-code',
    displayName: 'Fira Code',
    woff2UrlTemplate: '/fonts/fira-code/{weight}.woff2',
    weights: [400, 700],
    category: 'monospace',
  },
  // ... 22 additional fonts per ADR-020 curated list
] as const;

const FONT_IDS = new Set(FONT_CATALOG.map((f) => f.id));

export function isFontId(value: unknown): value is string {
  return typeof value === 'string' && FONT_IDS.has(value);
}
```

**Technical Notes:**

- WOFF2 files hosted in MinIO/CDN (self-hosted); never Google Fonts CDN (GDPR risk — ADR-020)
- CSP: `font-src 'self'` (single origin)
- Font IDs intentionally kebab-case to avoid CSS class name collisions

**Dependencies:**

- ADR-020 (font hosting strategy)

**Test Coverage:**

- Unit test: `isFontId()` returns true for valid catalog entry (1 test)
- Unit test: `isFontId()` returns false for arbitrary string (1 test)

---

### Task 2.10: Implement font-loader.ts — FontFace API Loader (ADR-020)

**Description:** Implement a utility that loads WOFF2 font files via the FontFace API and adds them to `document.fonts`. This ensures fonts are fetched from self-hosted storage and applied before layout paint.

**Estimated Time:** 4 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [x] `loadTenantFonts(fonts: TenantThemeFonts): Promise<void>` implemented
- [x] Resolves font definitions from `FONT_CATALOG` for each font slot
- [x] Creates `FontFace` objects with self-hosted WOFF2 URL
- [x] Calls `document.fonts.add()` and awaits `font.load()`
- [x] Unknown font IDs skipped with warning (falls back to CSS default)
- [x] Function is idempotent (second call with same fonts is a no-op)
- [x] Unit-testable (FontFace constructor mockable via `vi.stubGlobal`)

**Implementation Details:**

- File: `apps/web/src/lib/font-loader.ts`
- Import `FONT_CATALOG`, `isFontId` from `@plexica/shared-types/fonts`

**Code Skeleton:**

```typescript
// apps/web/src/lib/font-loader.ts
import { FONT_CATALOG, isFontId } from '@plexica/shared-types/fonts';
import type { TenantThemeFonts } from '../types/theme.js';
import { logger } from './logger.js';

const loaded = new Set<string>();

export async function loadTenantFonts(fonts: TenantThemeFonts): Promise<void> {
  const fontIds = Object.values(fonts).filter(isFontId);

  await Promise.all(
    fontIds.map(async (fontId) => {
      if (loaded.has(fontId)) return; // idempotent

      const def = FONT_CATALOG.find((f) => f.id === fontId);
      if (!def) {
        logger.warn({ fontId }, 'Font not found in catalog; skipping');
        return;
      }

      await Promise.all(
        def.weights.map(async (weight) => {
          const url = def.woff2UrlTemplate.replace('{weight}', String(weight));
          const face = new FontFace(def.displayName, `url(${url}) format('woff2')`, {
            weight: String(weight),
          });
          document.fonts.add(face);
          await face.load();
        })
      );

      loaded.add(fontId);
    })
  );
}
```

**Technical Notes:**

- `FontFace` API supported in all modern browsers (Chrome 35+, Firefox 41+, Safari 10+)
- `document.fonts` is the `FontFaceSet` API — part of CSS Font Loading API
- Idempotency set (`loaded`) lives in module scope — reset between tests with `vi.resetModules()`

**Dependencies:**

- Task 2.9 (FONT_CATALOG + isFontId)
- Task 1.4 (Pino logger)

**Test Coverage:**

- Unit test: Loads correct WOFF2 URL for known font ID (1 test)
- Unit test: Skips unknown font IDs with warning (1 test)
- Unit test: Idempotent — second call does not re-add font (1 test)
- Unit test: Calls `document.fonts.add()` with correct FontFace (1 test)

---

### Task 2.11: Add `<link rel="preload">` Hints for Default Fonts (ADR-020)

**Description:** Add preload hints for the two default fonts (Inter 400, Roboto 400) to `apps/web/index.html` so they begin downloading before JavaScript executes, preventing flash of invisible text (FOIT).

**Estimated Time:** 1 hour  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [x] `<link rel="preload">` added for `inter/400.woff2`
- [x] `<link rel="preload">` added for `roboto/400.woff2`
- [x] `as="font"` and `type="font/woff2"` attributes set correctly
- [x] `crossorigin` attribute present (required for preload fonts)
- [x] CSP `font-src 'self'` unaffected (same-origin URLs only)

**Implementation Details:**

- File: `apps/web/index.html`
- Add inside `<head>` before other resource hints

**Code Example:**

```html
<!-- apps/web/index.html — inside <head> -->
<link rel="preload" href="/fonts/inter/400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/roboto/400.woff2" as="font" type="font/woff2" crossorigin />
```

**Technical Notes:**

- Preload only default fonts (Inter + Roboto); tenant override fonts loaded on demand
- `crossorigin` is required even for same-origin fonts when using `<link rel="preload">`

**Dependencies:**

- Task 2.9 (FONT_CATALOG — confirms Inter + Roboto are the defaults)

**Test Coverage:**

- Manual verification: DevTools Network tab shows fonts loading as "preload" priority

**Goal:** Enable plugins to expose reusable UI components  
**Estimated Effort:** 20 hours  
**Story Points:** 10 points  
**Priority:** MEDIUM (enables plugin ecosystem)

### Task 3.1: Create loadWidget() Utility Function

**Description:** Dynamic widget loader using Module Federation.

**Estimated Time:** 4 hours  
**Story Points:** 3  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] `loadWidget({ pluginId, widgetName })` function implemented
- [ ] Returns React component via `React.lazy()`
- [ ] Dynamically imports from Module Federation remote: `import('pluginId/widgetName')`
- [ ] Handles import errors with fallback component
- [ ] Supports custom fallback via options
- [ ] TypeScript generic for widget props

**Implementation Details:**

- File: `apps/web/src/lib/widget-loader.ts`
- Use `React.lazy()` with dynamic import
- Catch errors with try-catch in lazy callback
- Return fallback component on error

**Code Example:**

```typescript
export function loadWidget<T = any>({ pluginId, widgetName, fallback }: LoadWidgetOptions) {
  const LazyWidget = React.lazy(async () => {
    try {
      const module = await import(/* @vite-ignore */ `${pluginId}/${widgetName}`);
      return module;
    } catch (error) {
      logger.error({ pluginId, widgetName, error }, `Failed to load widget`);

      if (fallback) {
        return { default: fallback };
      }

      return { default: () => <WidgetFallback pluginId={pluginId} widgetName={widgetName} /> };
    }
  });

  return LazyWidget as React.ComponentType<T>;
}
```

**Technical Notes:**

- `/* @vite-ignore */` comment prevents Vite from trying to statically analyze import
- Module Federation resolves `'crm/ContactCard'` at runtime

**Dependencies:**

- Module Federation configured in `vite.config.ts` (already exists)
- `WidgetFallback` component (Task 3.3)

**Test Coverage:**

- Unit test: Successful widget load (2 tests)
- Unit test: Widget load error returns fallback (2 tests)

---

### Task 3.2: Create WidgetLoader Component

**Description:** Wrapper component for rendering widgets with Suspense.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] `WidgetLoader` component wraps widget with Suspense
- [ ] Props: `pluginId`, `widgetName`, `props`, `fallback?`
- [ ] Suspense fallback shows loading skeleton
- [ ] Widget props forwarded to loaded component
- [ ] Custom fallback supported

**Implementation Details:**

- File: `apps/web/src/components/WidgetLoader.tsx`
- Use `useMemo` to memoize `loadWidget()` call
- Wrap in Suspense with loading skeleton

**Code Example:**

```tsx
interface WidgetLoaderProps {
  pluginId: string;
  widgetName: string;
  props?: Record<string, any>;
  fallback?: React.ComponentType;
}

export function WidgetLoader({ pluginId, widgetName, props, fallback }: WidgetLoaderProps) {
  const Widget = useMemo(
    () => loadWidget({ pluginId, widgetName, fallback }),
    [pluginId, widgetName, fallback]
  );

  return (
    <Suspense fallback={<WidgetLoadingSkeleton />}>
      <Widget {...props} />
    </Suspense>
  );
}
```

**Technical Notes:**

- `useMemo` prevents re-creating lazy component on every render
- Suspense fallback should match widget expected size

**Dependencies:**

- Task 3.1 (loadWidget function)
- `WidgetLoadingSkeleton` component (simple skeleton UI)

**Test Coverage:**

- Unit test: Widget renders with props (1 test)
- Unit test: Loading skeleton shown during load (1 test)

---

### Task 3.3: Create WidgetFallback Placeholder Component

**Description:** Fallback UI when widget fails to load.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] Displays "Widget Unavailable" message
- [ ] Shows plugin ID and widget name for debugging
- [ ] Styled as dashed border box
- [ ] Icon: 📦 (package emoji)
- [ ] Gray color scheme (not alarming)

**Implementation Details:**

- File: `apps/web/src/components/WidgetFallback.tsx`
- Simple presentational component

**Design Mockup:**

```
┌─────────────────────────────────────────┐
│ 📦  Widget Unavailable                  │
│                                         │
│ The requested widget could not be       │
│ loaded from the plugin.                 │
│                                         │
│ crm/ContactCard                         │
└─────────────────────────────────────────┘
```

**Code Example:**

```tsx
interface WidgetFallbackProps {
  pluginId: string;
  widgetName: string;
}

export function WidgetFallback({ pluginId, widgetName }: WidgetFallbackProps) {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
      <div className="text-gray-400 text-2xl mb-2">📦</div>
      <p className="text-sm text-gray-600 font-medium mb-1">Widget Unavailable</p>
      <p className="text-xs text-gray-400">
        {pluginId}/{widgetName}
      </p>
    </div>
  );
}
```

**Technical Notes:**

- Minimal styling (not alarming to users)
- Helpful for plugin developers debugging

**Dependencies:**

- None

**Test Coverage:**

- Unit test: Renders with plugin/widget names (1 test)

---

### Task 3.4: Update Module Federation Config for Widget Sharing

**Description:** Document and verify Module Federation config for widget exports.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] Plugin `vite.config.ts` template updated with widget `exposes` example
- [ ] Shell `vite.config.ts` has correct `remotes` config
- [ ] Shared dependencies configured: `react`, `react-dom`, `react-router-dom`
- [ ] Documentation added to plugin development guide

**Implementation Details:**

- File: `apps/plugin-template-frontend/vite.config.ts` (template)
- Add example widget export in `exposes` section
- Verify singleton resolution for React

**Plugin Config Example:**

```typescript
// apps/plugin-crm/vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'crm',
      filename: 'remoteEntry.js',
      exposes: {
        './ContactsPage': './src/pages/Contacts.tsx',
        './ContactCard': './src/widgets/ContactCard.tsx', // ← Widget export
        './DealPipeline': './src/widgets/DealPipeline.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
      },
    }),
  ],
});
```

**Documentation:**

- Add section to `docs/PLUGIN_DEVELOPMENT.md`:
  - "Exposing Widgets"
  - Widget naming conventions
  - Widget prop types
  - Example usage

**Technical Notes:**

- Widgets must use shared React instance (singleton)
- Widget props should be serializable (no functions)

**Dependencies:**

- Existing Module Federation setup

**Test Coverage:**

- Manual test: Verify widget loading from plugin

---

### Task 3.5: Create Example Widget in CRM Plugin

**Description:** Reference implementation of a widget in `apps/plugin-crm`.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P3 - Low

**Acceptance Criteria:**

- [ ] `ContactCard` widget component created
- [ ] Widget accepts `contactId` prop
- [ ] Widget fetches contact data from API
- [ ] Widget displays contact name, email, phone
- [ ] Widget uses tenant theme colors
- [ ] Widget exported in Module Federation config

**Implementation Details:**

- File: `apps/plugin-crm/src/widgets/ContactCard.tsx`
- Props: `{ contactId: string }`
- Fetch contact data with TanStack Query
- Use theme colors via TailwindCSS classes

**Code Example:**

```tsx
interface ContactCardProps {
  contactId: string;
}

export function ContactCard({ contactId }: ContactCardProps) {
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => apiClient.get(`/api/v1/crm/contacts/${contactId}`).then((res) => res.data),
  });

  if (isLoading) return <div>Loading...</div>;
  if (!contact) return <div>Contact not found</div>;

  return (
    <div className="bg-surface border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-text">{contact.name}</h3>
      <p className="text-sm text-text-secondary">{contact.email}</p>
      <p className="text-sm text-text-secondary">{contact.phone}</p>
    </div>
  );
}
```

**Technical Notes:**

- Widget should be self-contained (fetch own data)
- Widget should respect tenant theme (use theme tokens)

**Dependencies:**

- Task 3.4 (Module Federation config)
- CRM plugin API endpoints

**Test Coverage:**

- Unit test: Widget renders with contact data (1 test)

---

### Task 3.6: Write Unit Tests for Widget Loader

**Description:** Unit tests for `loadWidget()` and `WidgetLoader` component.

**Estimated Time:** 4 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] Test: loadWidget() returns lazy component ✅
- [ ] Test: Widget load success renders component ✅
- [ ] Test: Widget load error returns fallback ✅
- [ ] Test: Custom fallback used when provided ✅
- [ ] Test: WidgetLoader forwards props ✅
- [ ] Coverage: ≥90% for widget loader utilities

**Implementation Details:**

- File: `apps/web/src/lib/widget-loader.test.ts`
- Mock dynamic imports with `vi.mock()`
- Test successful and failed widget loads

**Test Cases:**

1. loadWidget() returns React.ComponentType
2. Widget loads successfully → Component renders
3. Widget load fails → Fallback renders
4. Custom fallback provided → Custom fallback used
5. WidgetLoader forwards props → Props received by widget
6. Loading skeleton shown during Suspense

**Technical Notes:**

- Mock `import()` to control success/failure scenarios
- Use `@testing-library/react` for component tests

**Dependencies:**

- Task 3.1 (loadWidget)
- Task 3.2 (WidgetLoader)
- Task 3.3 (WidgetFallback)

**Test Coverage Target:** ≥90%

---

### Task 3.7: Write Integration Tests for Widget Loading

**Description:** Integration tests for widget loading with Module Federation.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P3 - Low

**Acceptance Criteria:**

- [ ] Test: Widget loaded from remote plugin ✅
- [ ] Test: Widget unavailable shows fallback ✅
- [ ] Test: Widget inherits tenant theme ✅

**Implementation Details:**

- File: `apps/web/src/lib/widget-loader.integration.test.ts`
- Mock Module Federation remote imports
- Verify widget rendering and theme inheritance

**Test Cases:**

1. Load widget from CRM plugin → Widget renders
2. Widget remote unavailable → Fallback shown
3. Widget uses theme colors → Verify theme classes applied

**Technical Notes:**

- Mock Module Federation by mocking `import('crm/ContactCard')`
- Verify theme context available to widget

**Dependencies:**

- Task 3.1 (loadWidget)
- Task 3.5 (example widget)

**Test Coverage Target:** Integration scenarios

---

## Phase 4: Test Coverage (Sprint 5 Week 1-2)

**Goal:** Achieve ≥80% overall test coverage; ≥90% for critical components  
**Estimated Effort:** 45 hours  
**Story Points:** 21 points  
**Priority:** HIGH (Constitution Art. 4.1 compliance)

### Task 4.1: Audit Current Test Coverage

**Description:** Generate coverage report and identify gaps.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] Coverage report generated with Vitest
- [ ] Coverage gaps identified by file/component
- [ ] Priority list created (critical components first)
- [ ] Coverage report saved to `.forge/specs/010-frontend-production-readiness/coverage-audit.md`

**Implementation Details:**

- Run: `pnpm test:coverage` in `apps/web`
- Analyze coverage report (HTML or terminal output)
- List uncovered files with priority:
  - P0: AuthProvider, ThemeProvider, ErrorBoundary
  - P1: Route components, Layout components
  - P2: Utility functions, hooks
  - P3: Simple presentational components

**Deliverables:**

- Coverage audit document with gaps list
- Prioritized test task list

**Dependencies:**

- Phase 1-3 tests already written

**Test Coverage Target:** Document baseline (currently ~2.4%)

---

### Task 4.2: Write Unit Tests for Uncovered Components

**Description:** Write tests for all components below 80% coverage.

**Estimated Time:** 20 hours  
**Story Points:** 8  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] All route components have rendering tests (>15 routes)
- [ ] All layout components tested (Header, Sidebar, Footer)
- [ ] All context providers tested (existing ones not yet covered)
- [ ] All hooks tested (custom hooks in `apps/web/src/hooks/`)
- [ ] Utility functions tested (lib/ directory)
- [ ] Coverage: ≥80% for all components

**Implementation Strategy:**

- Start with critical components (P0 priority)
- Write tests in parallel for similar components
- Use test utilities to reduce boilerplate

**Test Template for Route Components:**

```typescript
describe('PluginsRoute', () => {
  it('should render plugin list', () => {
    render(<PluginsRoute />, { wrapper: TestProviders });
    expect(screen.getByRole('heading', { name: /plugins/i })).toBeInTheDocument();
  });

  it('should fetch plugins on mount', async () => {
    render(<PluginsRoute />, { wrapper: TestProviders });
    await waitFor(() => {
      expect(screen.getByText(/crm/i)).toBeInTheDocument();
    });
  });
});
```

**Technical Notes:**

- Create shared `TestProviders` wrapper with all contexts
- Mock API calls with MSW
- Use `renderHook` for custom hooks

**Dependencies:**

- Task 4.1 (coverage audit)

**Test Coverage Target:** ≥80% per file

---

### Task 4.3: Write Integration Tests for API Interactions

**Description:** Integration tests for all API-consuming components.

**Estimated Time:** 10 hours  
**Story Points:** 5  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] Auth flow integration tests (login, logout, token refresh)
- [ ] Plugin management integration tests (list, enable, disable)
- [ ] Workspace management integration tests (CRUD operations)
- [ ] Theme API integration tests (fetch, apply, fallback)
- [ ] MSW handlers created for all API endpoints

**Test Scenarios:**

1. Login → Auth context updated → Protected routes accessible
2. Fetch plugins → Plugin list rendered → Enable plugin → API called
3. Theme fetch → Theme applied → CSS variables set
4. API error → Error message shown → Retry works

**Implementation Details:**

- File: `apps/web/src/test/integration/` (new directory)
- Use MSW for API mocking
- Test full user flows (not isolated components)

**Technical Notes:**

- Integration tests slower than unit tests (use sparingly)
- Focus on critical user flows

**Dependencies:**

- Task 4.1 (coverage audit)
- MSW setup

**Test Coverage Target:** 15+ integration tests

---

### Task 4.4: Write E2E Tests with Playwright

**Description:** End-to-end tests for critical user workflows.

**Estimated Time:** 10 hours  
**Story Points:** 5  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] Login flow E2E test
- [ ] Plugin loading E2E test (success + error)
- [ ] Tenant theming E2E test (logo + colors)
- [ ] Widget loading E2E test
- [ ] Error boundary E2E test (plugin crash)
- [ ] Accessibility E2E test (keyboard navigation)

**Test Scenarios:**

1. User logs in → Redirected to home → Tenant logo displayed
2. User navigates to plugin → Plugin loads → No errors
3. Plugin crashes → Error boundary shown → Retry works
4. User changes theme → New colors applied → Logo updated
5. Widget loaded in plugin page → Widget displays data

**Implementation Details:**

- File: `apps/web/tests/e2e/` (existing Playwright setup)
- Use Playwright Test framework
- Run against local dev server or staging

**Technical Notes:**

- E2E tests require running backend + Keycloak + DB
- Use `test.describe.serial()` for dependent tests

**Dependencies:**

- Phase 1-3 features implemented

**Test Coverage Target:** 10+ E2E tests

---

### Task 4.5: Add Test Utilities and Mocks

**Description:** Shared test utilities to reduce boilerplate.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] `TestProviders` wrapper with all contexts
- [ ] Mock data factories (users, tenants, plugins, themes)
- [ ] Mock API handlers (MSW) for common endpoints
- [ ] Custom render function with providers
- [ ] setupTests.ts configured with global mocks

**Implementation Details:**

- File: `apps/web/src/test/test-utils.tsx`
- File: `apps/web/src/test/mocks/` (factories, handlers)
- File: `apps/web/src/test/setupTests.ts`

**Test Utilities:**

```typescript
// apps/web/src/test/test-utils.tsx
export function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={testQueryClient}>
        <AuthProvider value={mockAuthContext}>
          <ThemeProvider>
            <IntlProvider locale="en">
              {children}
            </IntlProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: TestProviders });
}
```

**Technical Notes:**

- Use factories for generating test data (avoids hardcoded values)
- MSW handlers shared across tests

**Dependencies:**

- None (can be done anytime)

**Test Coverage Target:** Shared utilities used in 50+ tests

---

## Phase 5: Accessibility (Sprint 5 Week 3)

**Goal:** Ensure WCAG 2.1 AA compliance for shell UI  
**Estimated Effort:** 16 hours  
**Story Points:** 8 points  
**Priority:** HIGH (Constitution Art. 1.3 UX standards)

### Task 5.1: Run axe-core Automated Audit

**Description:** Run axe-core accessibility audit and document violations.

**Estimated Time:** 1 hour  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] axe-core integrated in CI pipeline
- [ ] Audit run on all routes
- [ ] Violations documented by severity (critical, serious, moderate)
- [ ] Violation report saved to `.forge/specs/010-frontend-production-readiness/a11y-audit.md`

**Implementation Details:**

- Install `@axe-core/react` in devDependencies
- Add axe-core check in test setup
- Run audit on all routes with Playwright

**Audit Command:**

```bash
# In Playwright test
import { injectAxe, checkA11y } from 'axe-playwright';

test('should have no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: { html: true },
  });
});
```

**Deliverables:**

- Violation report with remediation steps
- CI pipeline updated to fail on critical violations

**Dependencies:**

- None

**Test Coverage Target:** Zero critical violations

---

### Task 5.2: Fix Identified Accessibility Violations

**Description:** Remediate all WCAG 2.1 AA violations found in audit.

**Estimated Time:** 6 hours  
**Story Points:** 3  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] All critical violations fixed
- [ ] All serious violations fixed
- [ ] Moderate violations fixed (if feasible)
- [ ] Re-run axe-core audit → Zero violations
- [ ] Fixes documented in PR

**Common Violations and Fixes:**

1. **Missing alt text on images** → Add descriptive alt attributes
2. **Insufficient color contrast** → Adjust text/background colors to meet 4.5:1 ratio
3. **Missing form labels** → Add `<label for="...">` or `aria-label`
4. **Keyboard trap in modals** → Implement focus trap with `react-focus-lock`
5. **Missing ARIA roles** → Add semantic HTML or ARIA roles (`role="navigation"`, etc.)

**Implementation Details:**

- Fix violations one route at a time
- Re-test after each fix
- Use browser dev tools (Lighthouse, axe DevTools extension)

**Technical Notes:**

- Prioritize critical and serious violations
- Moderate violations may be deferred if complex

**Dependencies:**

- Task 5.1 (audit report)

**Test Coverage Target:** Zero critical/serious violations

---

### Task 5.3: Verify Keyboard Navigation

**Description:** Manual and automated tests for keyboard accessibility.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] All interactive elements reachable via Tab key
- [ ] Tab order logical (top-to-bottom, left-to-right)
- [ ] Shift+Tab navigates backwards
- [ ] Focus indicators visible on all focusable elements
- [ ] No keyboard traps (user can escape from all components)
- [ ] Enter key activates buttons/links
- [ ] Escape key closes modals/dialogs

**Test Scenarios:**

1. Tab through header → All buttons/links reachable
2. Tab through sidebar → Navigation items reachable
3. Tab through form → All inputs reachable, in order
4. Open modal → Focus trapped in modal → Escape closes modal
5. Dropdown menu → Arrow keys navigate options → Enter selects

**Implementation Details:**

- Manual testing with keyboard only (no mouse)
- Playwright E2E test for keyboard navigation

**Technical Notes:**

- Use `tabIndex={0}` for custom interactive elements
- Use `tabIndex={-1}` to exclude from tab order
- Ensure focus indicators meet 3:1 contrast ratio (WCAG 2.1 AA)

**Dependencies:**

- Task 5.2 (violations fixed)

**Test Coverage Target:** All interactive elements keyboard-accessible

---

### Task 5.4: Add ARIA Labels and Semantic HTML

**Description:** Improve screen reader compatibility.

**Estimated Time:** 3 hours  
**Story Points:** 2  
**Assignee:** Frontend Lead  
**Priority:** P1 - High

**Acceptance Criteria:**

- [ ] All form inputs have associated labels (`<label>` or `aria-label`)
- [ ] All buttons have descriptive text or `aria-label`
- [ ] All images have meaningful alt text
- [ ] Semantic HTML used where appropriate (`<nav>`, `<main>`, `<article>`, `<aside>`)
- [ ] Dynamic content uses ARIA live regions (`aria-live="polite"`)
- [ ] Modal dialogs have `role="dialog"` and `aria-modal="true"`

**Common Patterns:**

```tsx
// Form input with label
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Button with descriptive text
<button>Save Changes</button>

// Icon button with aria-label
<button aria-label="Close menu">
  <XIcon />
</button>

// Live region for dynamic updates
<div aria-live="polite" aria-atomic="true">
  {successMessage}
</div>

// Modal dialog
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirm Action</h2>
  {/* Modal content */}
</div>
```

**Technical Notes:**

- Use semantic HTML first, ARIA roles second
- Test with screen reader (NVDA on Windows, VoiceOver on macOS)

**Dependencies:**

- Task 5.2 (violations fixed)

**Test Coverage Target:** All dynamic content announced correctly

---

### Task 5.5: Test with Screen Reader (Manual QA)

**Description:** Manual testing with screen reader software.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** QA Engineer  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] All routes tested with NVDA (Windows) or VoiceOver (macOS)
- [ ] Navigation landmarks announced correctly
- [ ] Form fields announced with labels
- [ ] Error messages announced when shown
- [ ] Dynamic content announced via live regions
- [ ] Button/link purposes clear from announcements

**Test Scenarios:**

1. Navigate homepage with screen reader → All landmarks announced
2. Navigate to plugin page → Plugin name announced
3. Fill out form → Labels and errors announced
4. Trigger error boundary → Error message announced
5. Open modal → Modal title announced, focus trapped

**Technical Notes:**

- Use NVDA (free) on Windows or VoiceOver (built-in) on macOS
- Follow screen reader user testing guidelines

**Dependencies:**

- Task 5.4 (ARIA labels added)

**Test Coverage Target:** Manual verification of screen reader experience

---

### Task 5.6: Add E2E Accessibility Tests

**Description:** Automated accessibility tests in Playwright.

**Estimated Time:** 2 hours  
**Story Points:** 1  
**Assignee:** Frontend Lead  
**Priority:** P2 - Medium

**Acceptance Criteria:**

- [ ] axe-core integrated in Playwright E2E tests
- [ ] All routes tested for accessibility violations
- [ ] CI pipeline fails on accessibility violations
- [ ] Keyboard navigation E2E test added

**Implementation Details:**

- File: `apps/web/tests/e2e/accessibility.spec.ts`
- Use `axe-playwright` for automated checks
- Test keyboard navigation with Playwright

**Test Example:**

```typescript
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility', () => {
  test('should have no violations on homepage', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Tab through header
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Home');

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Plugins');
  });
});
```

**Technical Notes:**

- Run accessibility tests in CI on every PR
- Block merge if violations found

**Dependencies:**

- Task 5.1 (axe-core setup)
- Task 5.2 (violations fixed)

**Test Coverage Target:** All routes pass axe-core checks

---

## Sprint Planning Recommendations

### Sprint 4 (Week 1-4) - 31 Story Points Remaining

> **Note:** Phase 1 (Error Boundaries, 8 pts) and Phase 2 Tasks 2.1–2.8 (Tenant Theming core, 13 pts) are **already complete**.
> Sprint 4 remaining work = Phase 2 Tasks 2.9–2.11 (ADR-020 font loading, 4 pts) + Phase 3 Widget System (10 pts) = **14 pts remaining**.

**Focus:** ADR-020 Font Loading + Widget System

**Tasks:**

- Phase 2 Tasks 2.9–2.11: ADR-020 font loading (4 pts, Week 1)
- Phase 3: Widget System (10 pts, Week 2-4)

**Velocity:** ~14 points remaining in Sprint 4

**Deliverables:**

- Fonts loaded via FontFace API from self-hosted WOFF2 (ADR-020) ✅
- Zero shell crashes from plugin errors ✅ (done)
- Tenant branding functional (logo + colors + fonts) ✅
- Widget system MVP (load widgets from plugins) ✅

---

### Sprint 5 (Week 1-3) - 29 Story Points

**Focus:** Test Coverage + Accessibility

**Tasks:**

- Phase 4: Test Coverage (21 pts, Week 1-2)
- Phase 5: Accessibility (8 pts, Week 3)

**Velocity:** 29 points (slightly lower due to test writing fatigue)

**Deliverables:**

- Test coverage ≥80% overall ✅
- Critical components ≥90% coverage ✅
- Zero WCAG 2.1 AA violations ✅

---

## Acceptance Criteria Summary

**Phase 1: Error Boundaries** ✅ Complete

- [x] Plugin errors caught without shell crash
- [x] User-friendly error messages (no stack traces)
- [x] Retry button resets error state
- [x] Structured error logging with Pino

**Phase 2: Tenant Theming** ✅ Complete (Tasks 2.1–2.8); Tasks 2.9–2.11 pending (ADR-020 font loading)

- [x] Tenant logo displayed in header
- [x] Custom colors applied via CSS variables
- [x] Custom fonts applied via CSS variables
- [x] Default theme as fallback
- [x] Theme validation (invalid colors rejected)
- [ ] Fonts loaded via FontFace API from self-hosted WOFF2 (ADR-020) — Task 2.9–2.11

**Phase 3: Widget System**

- [ ] `loadWidget()` dynamically loads widget from plugin
- [ ] Widget loading errors show fallback placeholder
- [ ] Widgets inherit tenant theme
- [ ] Example widget in CRM plugin

**Phase 4: Test Coverage**

- [ ] Overall coverage ≥80%
- [ ] AuthProvider, ThemeProvider, ErrorBoundary ≥90%
- [ ] All routes have rendering tests
- [ ] 15+ integration tests
- [ ] 10+ E2E tests

**Phase 5: Accessibility**

- [ ] Zero WCAG 2.1 AA violations (axe-core)
- [ ] All interactive elements keyboard-accessible
- [ ] Screen reader compatible (NVDA/VoiceOver)
- [ ] Focus indicators visible
- [ ] ARIA labels on all form inputs

---

## Risk Mitigation

| Risk                                    | Mitigation Strategy                                      |
| --------------------------------------- | -------------------------------------------------------- |
| Test coverage regressions               | Enforce coverage in CI; block PRs below 80%              |
| Error boundary doesn't catch all errors | Test with async errors, useEffect errors, global handler |
| Theme breaks existing plugins           | Validate theme tokens; provide fallback                  |
| Widget loading degrades performance     | Lazy load; monitor bundle sizes; 300ms target            |
| Accessibility regressions               | Add axe-core to CI; manual QA before release             |

---

## Dependencies

### External Dependencies

- `pino` (logging) - already in core-api, add to apps/web
- `@axe-core/react` (accessibility testing) - add to devDependencies
- `axe-playwright` (E2E accessibility) - add to devDependencies
- `@testing-library/react` (unit testing) - already installed
- `@testing-library/user-event` (interaction testing) - already installed

### Internal Dependencies

- `@plexica/api-client` - authenticated axios instance
- `@plexica/ui` - shared UI components
- `@plexica/i18n` - internationalization
- AuthContext - existing context for tenant/user
- Module Federation - already configured

---

## Success Metrics

**Phase 1 Success Criteria:**

- Zero shell crashes from plugin errors in production
- Error boundary activation rate < 0.1%

**Phase 2 Success Criteria:**

- 100% of tenants can set custom logo + colors
- Theme fetch latency P95 < 100ms
- Zero theme-related bugs reported

**Phase 3 Success Criteria:**

- Widgets load in < 300ms P95
- Widget load failure rate < 1%
- At least 3 plugins expose widgets

**Phase 4 Success Criteria:**

- Test coverage ≥80% overall
- Critical components ≥90% coverage
- No coverage regressions in CI

**Phase 5 Success Criteria:**

- Zero WCAG 2.1 AA violations in axe-core
- 100% keyboard navigation support
- Screen reader compatible (manual verification)

---

**Next Steps:** Start Sprint 4 planning, assign tasks, create GitHub issues from this breakdown.
