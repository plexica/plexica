# Technical Plan: 010 - Frontend Production Readiness

> Detailed technical design and implementation strategy for closing critical frontend gaps.

**Spec:** 010-frontend-production-readiness  
**Date:** 2026-02-17  
**Status:** Draft  
**Estimated Effort:** 115 hours across 3 sprints

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Design](#2-component-design)
3. [Implementation Phases](#3-implementation-phases)
4. [Technical Details](#4-technical-details)
5. [Testing Strategy](#5-testing-strategy)
6. [Deployment Plan](#6-deployment-plan)
7. [Risk Mitigation](#7-risk-mitigation)

---

## 1. Architecture Overview

### 1.1 Current State

**Existing (from brownfield analysis):**

- React 19 + Vite + TanStack Router
- Module Federation configured (`@originjs/vite-plugin-federation`)
- AuthProvider context (Keycloak integration)
- Basic layout with header + sidebar
- Route structure in `apps/web/src/routes/`
- 85 TypeScript files, ~4,600 LOC in routes

**Gaps:**

- No error boundaries (FR-016, FR-017, FR-018)
- Incomplete ThemeProvider (FR-019, FR-020, FR-021)
- Widget system not implemented (FR-022, FR-023, FR-024)
- Test coverage 2.4% (target 80%, FR-025)
- Accessibility not verified (FR-026, FR-027, FR-028)

### 1.2 Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Shell Application (apps/web)                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Root Error Boundary (catches shell crashes)            │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ App Providers                                     │  │ │
│  │  │  - AuthProvider (existing)                        │  │ │
│  │  │  - ThemeProvider (NEW - tenant theming)           │  │ │
│  │  │  - IntlProvider (existing - i18n)                 │  │ │
│  │  │  - QueryClientProvider (existing - TanStack Query)│  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ Layout (Header + Sidebar + Main)                  │  │ │
│  │  │  ┌─────────────────────────────────────────────┐ │  │ │
│  │  │  │ Header                                       │ │  │ │
│  │  │  │  - Tenant Logo (NEW)                         │ │  │ │
│  │  │  │  - Navigation                                │ │  │ │
│  │  │  │  - User Menu                                 │ │  │ │
│  │  │  └─────────────────────────────────────────────┘ │  │ │
│  │  │  ┌─────────────────────────────────────────────┐ │  │ │
│  │  │  │ Main Content Area                            │ │  │ │
│  │  │  │  ┌────────────────────────────────────────┐ │ │  │ │
│  │  │  │  │ Plugin Error Boundary (NEW)            │ │ │  │ │
│  │  │  │  │  ┌──────────────────────────────────┐  │ │ │  │ │
│  │  │  │  │  │ Plugin Remote (lazy loaded)      │  │ │ │  │ │
│  │  │  │  │  │  - CRM Routes                    │  │ │ │  │ │
│  │  │  │  │  │  - Analytics Routes               │  │ │ │  │ │
│  │  │  │  │  │  - Widget Imports (NEW)           │  │ │ │  │ │
│  │  │  │  │  └──────────────────────────────────┘  │ │ │  │ │
│  │  │  │  └────────────────────────────────────────┘ │ │  │ │
│  │  │  └─────────────────────────────────────────────┘ │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Component Hierarchy

```
apps/web/src/
├── main.tsx
│   └── <RootErrorBoundary>
│       └── <App />
│           ├── <AuthProvider />
│           ├── <ThemeProvider />        ← NEW
│           └── <TanStackRouter>
│               └── <RootLayout>
│                   ├── <Header logo={tenantLogo} /> ← NEW
│                   └── <PluginErrorBoundary>       ← NEW
│                       └── <PluginRoute />
│                           └── <PluginWidget />     ← NEW (lazy)
```

---

## 2. Component Design

### 2.1 Error Boundary Component

**File:** `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx`

**Responsibilities:**

- Catch errors from plugin remote loading (network errors, syntax errors)
- Catch errors from plugin component rendering (runtime errors)
- Display user-friendly fallback UI
- Log error context to console (structured JSON)
- Provide "Retry" mechanism to reset error state

**API:**

```typescript
interface PluginErrorBoundaryProps {
  pluginId: string; // e.g., "crm"
  pluginName?: string; // e.g., "CRM" (display name)
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}
```

**Implementation Strategy:**

```typescript
// apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx
import React from 'react';
import { logger } from '@/lib/logger'; // Pino logger

export class PluginErrorBoundary extends React.Component<
  PluginErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const context = {
      pluginId: this.props.pluginId,
      pluginName: this.props.pluginName || this.props.pluginId,
      tenantSlug: this.context.tenant?.slug, // From AuthContext
      userId: this.context.user?.id,          // From AuthContext
      timestamp: new Date().toISOString(),
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    logger.error({ ...context, error }, `Plugin error caught: ${this.props.pluginId}`);

    this.setState({ error, errorInfo });
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} retry={this.resetError} />;
      }

      return (
        <PluginErrorFallback
          pluginName={this.props.pluginName || this.props.pluginId}
          error={this.state.error!}
          onRetry={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}
```

**Fallback UI Component:**

```typescript
// apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx
interface PluginErrorFallbackProps {
  pluginName: string;
  error: Error;
  onRetry: () => void;
}

export function PluginErrorFallback({ pluginName, error, onRetry }: PluginErrorFallbackProps) {
  const { t } = useTranslations(); // i18n hook
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full bg-surface rounded-lg shadow-md p-6 text-center">
        <div className="text-warning text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold mb-2">
          {t('plugin.error.title', { plugin: pluginName })}
        </h2>
        <p className="text-text-secondary mb-4">
          {t('plugin.error.description')}
        </p>
        <div className="bg-error-light text-error-dark rounded p-3 mb-4 text-sm font-mono text-left">
          {error.message}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="btn-primary px-6 py-2 rounded"
          >
            {t('plugin.error.retry')}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary px-6 py-2 rounded"
          >
            {t('plugin.error.goBack')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 2.2 Tenant Theming System

**Files:**

- `apps/web/src/contexts/ThemeContext.tsx` (new or refactor existing)
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/lib/theme-utils.ts`

**Responsibilities:**

- Fetch tenant theme from `/api/v1/tenant/settings` on login
- Store theme in React context
- Apply theme via CSS custom properties
- Handle theme validation and fallback to defaults

**ThemeContext API:**

```typescript
// apps/web/src/contexts/ThemeContext.tsx
interface TenantTheme {
  logo?: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    error: string;
    success: string;
    warning: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
}

interface ThemeContextValue {
  theme: TenantTheme;
  isLoading: boolean;
  error: Error | null;
  refreshTheme: () => Promise<void>;
}

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<TenantTheme>(defaultTheme);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { tenant } = useAuth(); // Get tenant from AuthContext

  const fetchTheme = async () => {
    if (!tenant) {
      setTheme(defaultTheme);
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.get(`/api/v1/tenant/settings`);
      const tenantTheme = response.data.settings?.theme;

      if (tenantTheme) {
        const validatedTheme = validateTheme(tenantTheme);
        setTheme(validatedTheme);
        applyTheme(validatedTheme);
      } else {
        setTheme(defaultTheme);
        applyTheme(defaultTheme);
      }
    } catch (err) {
      logger.warn({ error: err, tenantSlug: tenant.slug }, 'Failed to fetch tenant theme');
      setError(err as Error);
      setTheme(defaultTheme);
      applyTheme(defaultTheme);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTheme();
  }, [tenant?.slug]);

  return (
    <ThemeContext.Provider value={{ theme, isLoading, error, refreshTheme: fetchTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

**Theme Application:**

```typescript
// apps/web/src/lib/theme-utils.ts
export function applyTheme(theme: TenantTheme) {
  const root = document.documentElement;

  // Apply color custom properties
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-text', theme.colors.text);
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--color-error', theme.colors.error);
  root.style.setProperty('--color-success', theme.colors.success);
  root.style.setProperty('--color-warning', theme.colors.warning);

  // Apply font families
  root.style.setProperty('--font-heading', theme.fonts.heading);
  root.style.setProperty('--font-body', theme.fonts.body);
  root.style.setProperty('--font-mono', theme.fonts.mono);
}

export function validateTheme(theme: Partial<TenantTheme>): TenantTheme {
  // Validate color format (hex only)
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

  const validatedColors: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors || {})) {
    if (typeof value === 'string' && hexColorRegex.test(value)) {
      validatedColors[key] = value;
    } else {
      logger.warn({ key, value }, `Invalid color format for theme color: ${key}`);
      validatedColors[key] = defaultTheme.colors[key as keyof typeof defaultTheme.colors];
    }
  }

  return {
    logo: theme.logo,
    colors: { ...defaultTheme.colors, ...validatedColors },
    fonts: { ...defaultTheme.fonts, ...theme.fonts },
  };
}
```

**Header Logo Integration:**

```typescript
// apps/web/src/components/Layout/Header.tsx
import { useTheme } from '@/hooks/useTheme';

export function Header() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="bg-surface border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo */}
        <button onClick={() => navigate('/')} className="focus:outline-none">
          {theme.logo ? (
            <img
              src={theme.logo}
              alt="Tenant Logo"
              className="h-10 max-w-[200px] object-contain"
              onError={(e) => {
                // Fallback to default logo if image fails to load
                e.currentTarget.src = '/plexica-logo.svg';
              }}
            />
          ) : (
            <img src="/plexica-logo.svg" alt="Plexica" className="h-10" />
          )}
        </button>

        {/* Rest of header: navigation, user menu, etc. */}
        <nav>{/* ... */}</nav>
      </div>
    </header>
  );
}
```

### 2.3 Widget System

**Files:**

- `apps/web/src/lib/widget-loader.ts`
- `apps/web/src/components/WidgetLoader.tsx`
- `apps/web/src/components/WidgetFallback.tsx`

**Responsibilities:**

- Dynamically load widget components from plugin remotes
- Handle widget loading errors with fallback placeholder
- Provide `loadWidget()` utility for plugin developers

**Widget Loader API:**

```typescript
// apps/web/src/lib/widget-loader.ts
import React from 'react';

interface LoadWidgetOptions {
  pluginId: string;
  widgetName: string;
  fallback?: React.ComponentType;
}

/**
 * Dynamically load a widget component from a plugin remote.
 *
 * @example
 * const ContactCard = loadWidget({ pluginId: 'crm', widgetName: 'ContactCard' });
 * <ContactCard contactId="123" />
 */
export function loadWidget<T = any>({ pluginId, widgetName, fallback }: LoadWidgetOptions) {
  const LazyWidget = React.lazy(async () => {
    try {
      // Import from Module Federation remote
      // Format: 'crm/ContactCard' becomes import('crm/ContactCard')
      const module = await import(/* @vite-ignore */ `${pluginId}/${widgetName}`);
      return module;
    } catch (error) {
      logger.error(
        { pluginId, widgetName, error },
        `Failed to load widget: ${pluginId}/${widgetName}`
      );

      // Return fallback component if provided, otherwise default fallback
      if (fallback) {
        return { default: fallback };
      }

      return {
        default: () => (
          <WidgetFallback pluginId={pluginId} widgetName={widgetName} />
        ),
      };
    }
  });

  return LazyWidget as React.ComponentType<T>;
}
```

**Widget Loader Component:**

```typescript
// apps/web/src/components/WidgetLoader.tsx
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

**Widget Fallback Placeholder:**

```typescript
// apps/web/src/components/WidgetFallback.tsx
interface WidgetFallbackProps {
  pluginId: string;
  widgetName: string;
}

export function WidgetFallback({ pluginId, widgetName }: WidgetFallbackProps) {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
      <div className="text-gray-400 text-2xl mb-2">📦</div>
      <p className="text-sm text-gray-500">
        Widget Unavailable
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {pluginId}/{widgetName}
      </p>
    </div>
  );
}
```

**Plugin Usage Example:**

```typescript
// In another plugin or shell component
import { loadWidget } from '@/lib/widget-loader';

const ContactCard = loadWidget({
  pluginId: 'crm',
  widgetName: 'ContactCard'
});

function MyComponent() {
  return (
    <div>
      <h1>Contact Details</h1>
      <ContactCard contactId="abc-123" />
    </div>
  );
}
```

---

## 3. Implementation Phases

### Phase 1: Error Boundaries (Week 1)

**Goal:** Prevent plugin errors from crashing the shell application.

**Tasks:**

1. Create `PluginErrorBoundary` component (4h)
2. Create `PluginErrorFallback` UI component (2h)
3. Integrate error boundary in plugin routes (2h)
4. Add Pino logger for error context (1h)
5. Unit tests for error boundary (6h)
6. Integration tests for plugin error scenarios (2h)

**Deliverables:**

- `apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx`
- `apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx`
- `apps/web/src/lib/logger.ts` (Pino configuration)
- 8 unit tests + 3 integration tests

**Acceptance Criteria:**

- Plugin remote loading error triggers error boundary ✅
- Plugin component render error triggers error boundary ✅
- Error context logged to console with structured JSON ✅
- Retry button resets error state ✅

### Phase 2: Tenant Theming (Week 2-3)

**Goal:** Enable tenant-specific branding with logo and color customization.

**Tasks:**

1. Create `ThemeContext` and `ThemeProvider` (6h)
2. Implement theme fetching from API (3h)
3. Implement theme validation and fallback logic (3h)
4. Apply theme via CSS custom properties (2h)
5. Update TailwindCSS config for theme tokens (2h)
6. Integrate tenant logo in Header component (2h)
7. Unit tests for theme context (6h)
8. Integration tests for theme API (4h)

**Deliverables:**

- `apps/web/src/contexts/ThemeContext.tsx`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/lib/theme-utils.ts`
- Updated `apps/web/src/components/Layout/Header.tsx`
- Updated `apps/web/tailwind.config.ts`
- 10 unit tests + 5 integration tests

**Acceptance Criteria:**

- Tenant theme fetched on login ✅
- Theme applied via CSS custom properties ✅
- Tenant logo displayed in header ✅
- Default theme used if fetch fails ✅
- Invalid colors fall back to defaults with warning ✅

### Phase 3: Widget System (Week 4)

**Goal:** Enable plugins to expose reusable UI components.

**Tasks:**

1. Create `loadWidget()` utility function (4h)
2. Create `WidgetLoader` component (3h)
3. Create `WidgetFallback` placeholder component (2h)
4. Update Module Federation config for widget sharing (3h)
5. Create example widget in CRM plugin (2h)
6. Unit tests for widget loader (4h)
7. Integration tests for widget loading (2h)

**Deliverables:**

- `apps/web/src/lib/widget-loader.ts`
- `apps/web/src/components/WidgetLoader.tsx`
- `apps/web/src/components/WidgetFallback.tsx`
- Example widget in `apps/plugin-crm/src/widgets/ContactCard.tsx`
- 6 unit tests + 3 integration tests

**Acceptance Criteria:**

- `loadWidget()` dynamically loads widget from plugin remote ✅
- Widget loading error shows fallback placeholder ✅
- Widget inherits tenant theme ✅
- Widget can be lazy-loaded with Suspense ✅

### Phase 4: Test Coverage (Week 5-6)

**Goal:** Achieve ≥80% overall test coverage; ≥90% for critical components.

**Tasks:**

1. Audit current test coverage (2h)
2. Write unit tests for uncovered components (20h)
3. Write integration tests for API interactions (10h)
4. Write E2E tests with Playwright (10h)
5. Add test utilities and mocks (3h)

**Deliverables:**

- 50+ unit tests across all components
- 15+ integration tests for API/context interactions
- 10+ E2E tests for critical user flows
- Test utilities in `apps/web/src/test/`

**Acceptance Criteria:**

- Overall coverage ≥80% (lines, branches, functions) ✅
- AuthProvider coverage ≥90% ✅
- ThemeProvider coverage ≥90% ✅
- ErrorBoundary coverage ≥90% ✅
- All routes have basic rendering tests ✅

### Phase 5: Accessibility (Week 7)

**Goal:** Ensure WCAG 2.1 AA compliance for shell UI.

**Tasks:**

1. Run axe-core automated audit (1h)
2. Fix identified violations (6h)
3. Verify keyboard navigation (2h)
4. Add ARIA labels and semantic HTML (3h)
5. Test with screen reader (NVDA/VoiceOver) (2h)
6. Add E2E accessibility tests (2h)

**Deliverables:**

- Zero axe-core violations in automated tests
- Keyboard navigation fully functional
- Screen reader compatibility verified
- Accessibility E2E tests in Playwright

**Acceptance Criteria:**

- Zero WCAG 2.1 AA violations detected by axe-core ✅
- All interactive elements reachable via Tab/Shift+Tab ✅
- Focus indicators visible on all focusable elements ✅
- Form fields have associated labels ✅
- Modals trap focus and close on Escape ✅

---

## 4. Technical Details

### 4.1 Module Federation Configuration

**Current:** `apps/web/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        // Plugin remotes loaded dynamically from plugin manifest
        // Example: crm: 'https://cdn.plexica.io/plugins/crm/1.2.0/remoteEntry.js'
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        'react-router-dom': { singleton: true },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
```

**Widget System Addition:**

No changes needed to shell config. Plugins must export widgets in their `vite.config.ts`:

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
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
});
```

### 4.2 Error Boundary Integration with TanStack Router

**File:** `apps/web/src/routes/plugins.$pluginId.tsx`

**Before (no error boundary):**

```typescript
export const Route = createFileRoute('/plugins/$pluginId')({
  component: PluginRoute,
});

function PluginRoute() {
  const { pluginId } = Route.useParams();
  const PluginComponent = React.lazy(() => import(/* @vite-ignore */ pluginId));

  return (
    <Suspense fallback={<div>Loading plugin...</div>}>
      <PluginComponent />
    </Suspense>
  );
}
```

**After (with error boundary):**

```typescript
import { PluginErrorBoundary } from '@/components/ErrorBoundary/PluginErrorBoundary';

export const Route = createFileRoute('/plugins/$pluginId')({
  component: PluginRoute,
});

function PluginRoute() {
  const { pluginId } = Route.useParams();
  const plugin = usePlugin(pluginId); // Get plugin metadata
  const PluginComponent = React.lazy(() => import(/* @vite-ignore */ pluginId));

  return (
    <PluginErrorBoundary pluginId={pluginId} pluginName={plugin?.name}>
      <Suspense fallback={<div>Loading plugin...</div>}>
        <PluginComponent />
      </Suspense>
    </PluginErrorBoundary>
  );
}
```

### 4.3 Theme Token Mapping (TailwindCSS)

**File:** `apps/web/tailwind.config.ts`

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

Usage in components:

```tsx
<button className="bg-primary text-white hover:bg-primary/90">Click me</button>
```

---

## 5. Testing Strategy

### 5.1 Unit Tests (Vitest)

**Target:** ≥80% coverage overall; ≥90% for critical components

**Test Structure:**

```
apps/web/src/
├── components/
│   ├── ErrorBoundary/
│   │   ├── PluginErrorBoundary.tsx
│   │   ├── PluginErrorBoundary.test.tsx ← NEW (8 tests)
│   │   ├── PluginErrorFallback.tsx
│   │   └── PluginErrorFallback.test.tsx ← NEW (5 tests)
│   ├── Layout/
│   │   ├── Header.tsx
│   │   └── Header.test.tsx ← NEW (6 tests)
├── contexts/
│   ├── ThemeContext.tsx
│   └── ThemeContext.test.tsx ← NEW (10 tests)
├── lib/
│   ├── widget-loader.ts
│   ├── widget-loader.test.ts ← NEW (6 tests)
│   ├── theme-utils.ts
│   └── theme-utils.test.ts ← NEW (8 tests)
```

**Example Test: Error Boundary**

```typescript
// apps/web/src/components/ErrorBoundary/PluginErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginErrorBoundary } from './PluginErrorBoundary';

describe('PluginErrorBoundary', () => {
  it('should catch plugin component errors', () => {
    const ThrowError = () => {
      throw new Error('Plugin crashed');
    };

    render(
      <PluginErrorBoundary pluginId="test-plugin" pluginName="Test Plugin">
        <ThrowError />
      </PluginErrorBoundary>
    );

    expect(screen.getByText(/plugin unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/test plugin/i)).toBeInTheDocument();
  });

  it('should reset error on retry click', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    const MaybeThrow = () => {
      if (shouldThrow) {
        throw new Error('Plugin crashed');
      }
      return <div>Plugin loaded</div>;
    };

    const { rerender } = render(
      <PluginErrorBoundary pluginId="test-plugin">
        <MaybeThrow />
      </PluginErrorBoundary>
    );

    expect(screen.getByText(/plugin unavailable/i)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    rerender(
      <PluginErrorBoundary pluginId="test-plugin">
        <MaybeThrow />
      </PluginErrorBoundary>
    );

    expect(screen.getByText(/plugin loaded/i)).toBeInTheDocument();
  });
});
```

### 5.2 Integration Tests (Vitest + MSW)

**Target:** 15+ integration tests for API interactions and context providers

**Example Test: ThemeProvider with API**

```typescript
// apps/web/src/contexts/ThemeContext.test.tsx (integration)
import { renderHook, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { ThemeProvider, useTheme } from './ThemeContext';

const server = setupServer(
  rest.get('/api/v1/tenant/settings', (req, res, ctx) => {
    return res(
      ctx.json({
        tenantId: 'test-tenant',
        settings: {
          theme: {
            logo: 'https://example.com/logo.png',
            colors: { primary: '#FF5733' },
            fonts: { heading: 'Arial' },
          },
        },
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ThemeProvider integration', () => {
  it('should fetch and apply tenant theme from API', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <AuthProvider value={{ tenant: { slug: 'test-tenant' } }}>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.theme.logo).toBe('https://example.com/logo.png');
    expect(result.current.theme.colors.primary).toBe('#FF5733');
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#FF5733');
  });
});
```

### 5.3 E2E Tests (Playwright)

**Target:** 10+ E2E tests for critical user flows

**Test Scenarios:**

1. Login → Theme applied → Logo displayed
2. Navigate to plugin → Plugin loads → No errors
3. Plugin throws error → Error boundary shows → Retry works
4. Widget loading → Widget displays → Widget unavailable fallback
5. Keyboard navigation → All interactive elements reachable
6. Screen reader → Labels announced correctly

**Example E2E Test:**

```typescript
// apps/web/tests/e2e/plugin-error-handling.spec.ts
import { test, expect } from '@playwright/test';

test('should show error boundary when plugin crashes', async ({ page }) => {
  await page.goto('/plugins/broken-plugin');

  // Wait for error boundary to appear
  await expect(page.getByText(/plugin unavailable/i)).toBeVisible();
  await expect(page.getByText(/broken plugin/i)).toBeVisible();

  // Check that rest of shell still works
  await expect(page.getByRole('banner')).toBeVisible(); // Header
  await expect(page.getByRole('navigation')).toBeVisible(); // Sidebar

  // Test retry button
  await page.getByRole('button', { name: /retry/i }).click();
  // (Assuming plugin now loads successfully)
});

test('should display tenant logo in header', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const logo = page.getByAltText(/tenant logo/i);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /storage\.plexica\.io/);
});
```

---

## 6. Deployment Plan

### 6.1 Rollout Strategy

**Phase 1: Staging Deployment**

1. Deploy to staging environment
2. Run full E2E test suite
3. Manual QA testing with sample tenants
4. Performance testing (measure theme load time, error boundary overhead)

**Phase 2: Canary Release (10% traffic)**

1. Deploy to production with feature flag `ENABLE_NEW_THEME_SYSTEM=false`
2. Enable for 10% of tenants (selected by tenant ID hash)
3. Monitor error rates, page load times, crash reports
4. If stable for 48h, proceed to Phase 3

**Phase 3: Full Rollout (100% traffic)**

1. Enable feature flag for all tenants
2. Monitor for 7 days
3. Remove feature flag code after stabilization

### 6.2 Monitoring

**Metrics to Track:**

- Error boundary activation rate (should be < 0.1%)
- Plugin load failures (should be < 1%)
- Theme fetch latency (should be < 100ms P95)
- Widget load latency (should be < 300ms P95)
- Test coverage % (should remain ≥80%)
- Accessibility violations (should be 0 in CI)

**Alerts:**

- Error boundary activation rate > 1% → Page team immediately
- Theme fetch failures > 5% → Alert Ops team
- Test coverage drops below 80% → Block PR merge

---

## 7. Risk Mitigation

### 7.1 Identified Risks

| Risk                                         | Probability | Impact | Mitigation                                                                    |
| -------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------- |
| Error boundary doesn't catch async errors    | Medium      | High   | Use `componentDidCatch` + global error handler; test with async plugin errors |
| Tenant theme breaks existing plugins         | Medium      | Medium | Validate theme tokens; provide fallback; communicate breaking changes         |
| Widget loading degrades performance          | Low         | Medium | Lazy load widgets on demand; monitor bundle sizes; set 300ms target           |
| Test coverage regressions during development | High        | Medium | Enforce coverage in CI; block PRs below 80%; add pre-commit hook              |
| Accessibility regressions after new features | Medium      | High   | Add axe-core to CI pipeline; require manual accessibility review              |

### 7.2 Rollback Plan

If critical issues arise post-deployment:

1. **Immediate rollback:** Revert to previous build via deployment pipeline (< 5min)
2. **Feature flag disable:** Set `ENABLE_NEW_THEME_SYSTEM=false` (if using feature flags)
3. **Debug:** Analyze error logs, performance metrics, user feedback
4. **Fix forward:** Address issues and re-deploy with hotfix

---

## Appendix: File Changes Summary

### New Files (17 files)

```
apps/web/src/
├── components/
│   ├── ErrorBoundary/
│   │   ├── PluginErrorBoundary.tsx
│   │   ├── PluginErrorBoundary.test.tsx
│   │   ├── PluginErrorFallback.tsx
│   │   └── PluginErrorFallback.test.tsx
│   ├── WidgetLoader.tsx
│   ├── WidgetLoader.test.tsx
│   ├── WidgetFallback.tsx
│   └── WidgetFallback.test.tsx
├── contexts/
│   ├── ThemeContext.tsx
│   └── ThemeContext.test.tsx
├── hooks/
│   ├── useTheme.ts
│   └── useTheme.test.ts
├── lib/
│   ├── logger.ts
│   ├── theme-utils.ts
│   ├── theme-utils.test.ts
│   ├── widget-loader.ts
│   └── widget-loader.test.ts
```

### Modified Files (5 files)

```
apps/web/
├── src/
│   ├── main.tsx (wrap with RootErrorBoundary)
│   ├── App.tsx (add ThemeProvider)
│   ├── components/Layout/Header.tsx (add tenant logo)
│   ├── routes/plugins.$pluginId.tsx (wrap with PluginErrorBoundary)
│   └── routes/__root.tsx (apply theme on mount)
├── tailwind.config.ts (add theme token mappings)
└── vite.config.ts (no changes - already configured)
```

### Test Files Summary

- **Unit tests:** 43 tests across 10 files
- **Integration tests:** 15 tests across 3 files
- **E2E tests:** 10 tests in Playwright

**Total Test Coverage Target:** ≥80% overall; ≥90% for critical components

---

**Next Steps:** See `tasks.md` for detailed task breakdown with time estimates and story points.
