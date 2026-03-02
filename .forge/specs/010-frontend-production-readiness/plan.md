# Technical Plan: 010 - Frontend Production Readiness

> Detailed technical design and implementation strategy for closing critical frontend gaps.

**Spec:** 010-frontend-production-readiness  
**Date:** 2026-03-02  
**Status:** Active  
**Estimated Effort:** 136 hours across 3 sprints

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Design](#2-component-design)
   - 2a. [Design Spec Reference](#2a-design-spec-reference)
3. [Implementation Phases](#3-implementation-phases)
4. [Technical Details](#4-technical-details)
   - 4a. [Contrast Enforcement Strategy](#4a-contrast-enforcement-strategy)
5. [Testing Strategy](#5-testing-strategy)
   - 5.4 [Visual Regression Tests](#54-visual-regression-tests)
   - 5.5 [Accessibility Tests](#55-accessibility-tests)
   - 5.6 [User Journey Test Coverage Mapping](#56-user-journey-test-coverage-mapping)
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

**Font Loading via FontFace API (ADR-020):**

Self-hosted WOFF2 fonts served from MinIO/CDN are loaded via the FontFace API — **never** from Google Fonts CDN (GDPR risk; see ADR-020). Font names in the tenant theme are validated against the `FONT_CATALOG` before loading; arbitrary font strings are rejected.

```typescript
// packages/shared-types/src/fonts.ts
export interface FontDefinition {
  id: string; // kebab-case: "inter", "open-sans"
  name: string; // Display name: "Inter", "Open Sans"
  category: 'sans-serif' | 'serif' | 'monospace' | 'display';
  weights: number[]; // Available weights: [400, 500, 600, 700]
  license: string; // "SIL OFL 1.1" | "Apache 2.0"
  fallback: string; // CSS stack: "system-ui, sans-serif"
}

export const FONT_CATALOG: FontDefinition[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans-serif',
    weights: [400, 500, 700],
    license: 'Apache 2.0',
    fallback: 'system-ui, sans-serif',
  },
  // ... 23 additional fonts per ADR-020 curated list
];

export const DEFAULT_HEADING_FONT = 'inter';
export const DEFAULT_BODY_FONT = 'roboto';
```

```typescript
// apps/web/src/lib/font-loader.ts
import { FONT_CATALOG } from '@plexica/shared-types';

export async function loadTenantFonts(headingFontId: string, bodyFontId: string): Promise<void> {
  const toLoad = [...new Set([headingFontId, bodyFontId])];

  for (const fontId of toLoad) {
    const def = FONT_CATALOG.find((f) => f.id === fontId);
    if (!def) continue; // Unknown font IDs rejected by validateTheme before reaching here

    for (const weight of def.weights) {
      const url = `/fonts/${fontId}/${fontId}-${weight}.woff2`;
      const fontFace = new FontFace(def.name, `url(${url}) format('woff2')`, {
        weight: String(weight),
        display: 'swap',
      });
      await fontFace.load();
      document.fonts.add(fontFace);
    }
  }

  // Apply via CSS custom properties (per ADR-009)
  const headingDef = FONT_CATALOG.find((f) => f.id === headingFontId);
  const bodyDef = FONT_CATALOG.find((f) => f.id === bodyFontId);

  if (headingDef) {
    document.documentElement.style.setProperty(
      '--font-heading',
      `"${headingDef.name}", ${headingDef.fallback}`
    );
  }
  if (bodyDef) {
    document.documentElement.style.setProperty(
      '--font-body',
      `"${bodyDef.name}", ${bodyDef.fallback}`
    );
  }
}
```

`validateTheme()` in `theme-utils.ts` must validate font IDs against `FONT_CATALOG` (not just non-empty strings):

```typescript
// Updated validation in apps/web/src/lib/theme-utils.ts
import { FONT_CATALOG, DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT } from '@plexica/shared-types';

function validateFontId(id: unknown, fallback: string): string {
  if (typeof id !== 'string') return fallback;
  const inCatalog = FONT_CATALOG.some((f) => f.id === id);
  if (!inCatalog) {
    logger.warn({ fontId: id }, 'Font not in FONT_CATALOG; using default');
    return fallback;
  }
  return id;
}

// In validateTheme():
fonts: {
  heading: validateFontId(theme.fonts?.heading, DEFAULT_HEADING_FONT),
  body:    validateFontId(theme.fonts?.body,    DEFAULT_BODY_FONT),
  mono:    validateFontId(theme.fonts?.mono,    'jetbrains-mono'),
},
```

`applyTheme()` calls `loadTenantFonts()` asynchronously after setting CSS color variables:

```typescript
// Updated applyTheme in theme-utils.ts
export function applyTheme(theme: TenantTheme): void {
  const root = document.documentElement;
  // ... color CSS variables (unchanged) ...
  // Font loading delegated to font-loader (async, non-blocking)
  loadTenantFonts(theme.fonts.heading, theme.fonts.body).catch((err) => {
    logger.warn({ err }, 'Font loading failed; system fonts in use');
  });
}
```

Default fonts (Inter 400, Roboto 400) are preloaded in `apps/web/index.html` to eliminate FOIT:

```html
<!-- apps/web/index.html -->
<link rel="preload" href="/fonts/inter/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/roboto/roboto-400.woff2" as="font" type="font/woff2" crossorigin />
```

**CSP implication:** `font-src 'self'` — no third-party origins required. Tightest possible policy.

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

## 2a. Design Spec Reference

> **Canonical UX source of truth**: `design-spec.md` in this directory.
> All component UI states, wireframes, ARIA contracts, and contrast
> verification are defined there. The plan's code samples above reflect the
> functional API; the design spec defines the visual/interaction layer.

### 2a.1 Component-to-Task Mapping

The design spec defines **8 components**. Each maps to one or more
implementation tasks in §3:

| #   | Component (design-spec §4) | Phase   | Plan Task(s)            | Notes                                                              |
| --- | -------------------------- | ------- | ----------------------- | ------------------------------------------------------------------ |
| 1   | `PluginErrorBoundary`      | Phase 1 | T1-1, T1-3, T1-5        | Error boundary class; wraps plugin routes                          |
| 2   | `PluginErrorFallback`      | Phase 1 | T1-2, T1-5              | Presentational fallback card (Screen 1 wireframe)                  |
| 3   | `RootErrorBoundary`        | Phase 1 | T1-1, T1-5              | Full-page crash fallback (Screen 2 wireframe); added to `main.tsx` |
| 4   | `ThemeProvider`            | Phase 2 | T2-1, T2-2, T2-3, T2-10 | Context provider; fetches + validates + applies theme              |
| 5   | `TenantLogo`               | Phase 2 | T2-6, T2-11             | Image-with-fallback inside Header (Screen 3 wireframe)             |
| 6   | `WidgetLoader`             | Phase 3 | T3-2, T3-6              | Suspense wrapper using `loadWidget()` utility                      |
| 7   | `WidgetFallback`           | Phase 3 | T3-3, T3-6              | Dashed-border placeholder (Screen 7 wireframe)                     |
| 8   | `WidgetLoadingSkeleton`    | Phase 3 | T3-2, T3-6              | Pulse-animated skeleton using `@plexica/ui` Skeleton               |

### 2a.2 Design Token Implementation Checklist

The plan must implement **17 design tokens** — 5 new semantic tokens
(from `design-system.md` v1.7 §Spec 010) plus 12 tenant runtime override
tokens (from design-spec §5).

**5 New Semantic Tokens** (add to `@plexica/ui` / design-system CSS):

| Token                         | Light     | Dark      | Base Alias           | Implementation Task |
| ----------------------------- | --------- | --------- | -------------------- | ------------------- |
| `--error-boundary-icon`       | `#D97706` | `#F59E0B` | `--status-warning`   | Phase 1, T1-2       |
| `--error-boundary-bg`         | `#FFFFFF` | `#111111` | `--card`             | Phase 1, T1-2       |
| `--widget-placeholder-border` | `#E4E4E7` | `#27272A` | `--border`           | Phase 3, T3-3       |
| `--widget-placeholder-icon`   | `#71717A` | `#A1A1AA` | `--muted-foreground` | Phase 3, T3-3       |
| `--root-error-bg`             | `#FFFFFF` | `#0A0A0A` | `--background`       | Phase 1, T1-2       |

**12 Tenant Runtime Override Tokens** (set by `ThemeProvider.applyTheme()`):

| CSS Custom Property      | Default       | Source                       |
| ------------------------ | ------------- | ---------------------------- |
| `--color-primary`        | `#1976d2`     | `theme.colors.primary`       |
| `--color-secondary`      | `#dc004e`     | `theme.colors.secondary`     |
| `--color-background`     | `#ffffff`     | `theme.colors.background`    |
| `--color-surface`        | `#f5f5f5`     | `theme.colors.surface`       |
| `--color-text`           | `#212121`     | `theme.colors.text`          |
| `--color-text-secondary` | `#757575`     | `theme.colors.textSecondary` |
| `--color-error`          | `#f44336`     | `theme.colors.error`         |
| `--color-success`        | `#4caf50`     | `theme.colors.success`       |
| `--color-warning`        | `#ff9800`     | `theme.colors.warning`       |
| `--font-heading`         | `"Inter"`     | Resolved from `FONT_CATALOG` |
| `--font-body`            | `"Roboto"`    | Resolved from `FONT_CATALOG` |
| `--font-mono`            | `"Fira Code"` | Resolved from `FONT_CATALOG` |

Components must use semantic tokens for error/widget chrome (not raw values)
and tenant override tokens for themed elements (via Tailwind utility classes
`bg-primary`, `text-primary`, `font-heading`, etc. per §4.3).

### 2a.3 Open Accessibility Items from Design Spec

The design-spec §6 identifies **3 open accessibility items** that require
implementation attention:

1. **Skip-to-main-content link (WCAG 2.4.1)** — Verify the shell layout
   includes `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to
main content</a>`. If missing, add in Phase 5 (Accessibility). Tracked as
   Phase 5, Task 4.

2. **Tenant theme contrast validation** — Tenant-set custom colors cannot
   guarantee WCAG AA contrast ratios. Backend validation is the primary
   enforcement (see §4a below). Frontend `ThemeProvider` should emit a
   non-blocking `console.warn` if the computed contrast ratio of
   `--color-primary` on `--color-background` falls below 4.5:1. See §4a
   Contrast Enforcement Strategy.

3. **Widget accessibility ownership** — Per design-spec §6 Screen 6 note,
   loaded widgets are responsible for their own internal accessibility. The
   `WidgetLoader` contract should document this expectation. No plan task
   required — this is a documentation note for widget developer guidelines.

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

**Goal:** Enable tenant-specific branding with logo, color, and font customization.

**Tasks:**

1. Create `ThemeContext` and `ThemeProvider` (6h)
2. Implement theme fetching from API (3h)
3. Implement theme validation and fallback logic — including font ID validation against `FONT_CATALOG` (4h)
4. Apply theme via CSS custom properties (2h)
5. Update TailwindCSS config for theme tokens (2h)
6. Integrate tenant logo in Header component (2h)
7. **[ADR-020] Define `FontDefinition` type and `FONT_CATALOG` constant in `packages/shared-types/src/fonts.ts`** (2h)
8. **[ADR-020] Implement `font-loader.ts` — FontFace API loading + CSS custom property application** (4h)
9. **[ADR-020] Add `<link rel="preload">` hints for Inter 400 + Roboto 400 in `apps/web/index.html`** (1h)
10. Unit tests for theme context + `font-loader.ts` (8h)
11. Integration tests for theme API + font validation (5h)
12. **[design-spec OQ#3] Implement frontend contrast warning in `applyTheme()`** — compute `contrastRatio(primary, background)` and `console.warn` if < 4.5:1 (see §4a) (1h)

**Deliverables:**

- `packages/shared-types/src/fonts.ts` (FontDefinition, FONT_CATALOG — **ADR-020**)
- `apps/web/src/contexts/ThemeContext.tsx`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/lib/theme-utils.ts` (with FONT_CATALOG validation)
- `apps/web/src/lib/font-loader.ts` (FontFace API loader — **ADR-020**)
- Updated `apps/web/index.html` (preload hints — **ADR-020**)
- Updated `apps/web/src/components/Layout/Header.tsx`
- Updated `apps/web/tailwind.config.ts`
- 13 unit tests + 7 integration tests

**Acceptance Criteria:**

- Tenant theme fetched on login ✅
- Theme applied via CSS custom properties ✅
- Tenant logo displayed in header ✅
- Default theme used if fetch fails ✅
- Invalid colors fall back to defaults with warning ✅
- Font names validated against `FONT_CATALOG`; unknown font IDs fall back to defaults ✅ (ADR-020)
- Fonts loaded via FontFace API from self-hosted WOFF2 files; no Google Fonts CDN calls ✅ (ADR-020)
- Default fonts (Inter, Roboto) preloaded via `<link rel="preload">` to prevent FOIT ✅ (ADR-020)
- Frontend `console.warn` emitted if tenant primary-on-background contrast < 4.5:1 ✅ (design-spec OQ#3, §4a)

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
        '@tanstack/react-router': { singleton: true },
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

## 4a. Contrast Enforcement Strategy

> **Resolves**: design-spec.md Open Question #3
> **References**: Constitution Art. 1.3 (UX Standards), Art. 5 (Security), WCAG 2.1 1.4.3

### Problem

When a tenant admin configures a very dark primary color (e.g., `#000000`) via
`PATCH /api/v1/tenants/:id/theme`, primary buttons may become invisible on dark
backgrounds. The design spec flags this as Open Question #3 (Medium impact).

### Decision: Dual-Layer Contrast Enforcement

A **dual-layer approach** ensures both proactive backend prevention and
defensive frontend warning:

#### Layer 1: Backend Validation (Primary — Blocking)

The `PATCH /api/v1/tenants/:id/theme` endpoint (Spec 008, Admin Interfaces)
must validate WCAG AA contrast ratios **before persisting** theme changes:

- **Primary on background**: `contrast(theme.colors.primary, theme.colors.background) ≥ 4.5`
- **Primary on surface**: `contrast(theme.colors.primary, theme.colors.surface) ≥ 3.0` (large text)
- **Text on background**: `contrast(theme.colors.text, theme.colors.background) ≥ 4.5`
- **Text on surface**: `contrast(theme.colors.text, theme.colors.surface) ≥ 4.5`

If any pair fails, return `400 Bad Request`:

```json
{
  "error": {
    "code": "THEME_CONTRAST_VIOLATION",
    "message": "The selected colors do not meet accessibility contrast requirements (WCAG AA 4.5:1).",
    "details": {
      "violations": [
        {
          "pair": "primary-on-background",
          "foreground": "#000000",
          "background": "#111111",
          "ratio": 1.1,
          "required": 4.5
        }
      ]
    }
  }
}
```

**Implementation**: Use relative luminance formula per WCAG 2.x:

```typescript
// apps/core-api/src/lib/contrast-utils.ts
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

**Note**: This validation is owned by Spec 008 (Admin Interfaces). The plan for
Spec 010 documents it here for completeness; Spec 008 T008-xx (theme endpoint)
must implement the contrast check. A cross-reference is added to this plan's
Cross-References table.

#### Layer 2: Frontend Warning (Defensive — Non-Blocking)

The `ThemeProvider` (Phase 2, T2-1) should compute the contrast ratio of
`--color-primary` on `--color-background` at theme application time and emit a
`console.warn` if it falls below 4.5:1. This handles edge cases where:

- The backend validation was bypassed (API migration, seed data, direct DB edit)
- The backend endpoint predates the contrast check (upgrade path)

```typescript
// In applyTheme() — apps/web/src/lib/theme-utils.ts
import { contrastRatio } from '@plexica/shared-utils';

const ratio = contrastRatio(theme.colors.primary, theme.colors.background);
if (ratio < 4.5) {
  logger.warn(
    { primary: theme.colors.primary, background: theme.colors.background, ratio },
    `Tenant theme contrast ratio ${ratio.toFixed(1)}:1 is below WCAG AA 4.5:1 minimum`
  );
}
```

The frontend warning is **non-blocking** — it does not prevent the theme from
applying. Blocking on the frontend would create a broken experience for tenants
whose theme was set before the validation existed.

### ADR Consideration

This decision is documented here rather than as a standalone ADR because:

1. The contrast validation is a straightforward WCAG enforcement — no
   significant architectural alternatives were debated
2. The dual-layer pattern (backend blocks, frontend warns) follows the same
   principle as input validation (Zod on API, defensive checks in UI)
3. If the team prefers a formal ADR, create **ADR-026: Tenant Theme Contrast
   Enforcement** referencing this section

### Phase 2 Implementation Task

See Phase 2, Task 12 (below) — "Implement frontend contrast warning in
ThemeProvider" (1h).

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
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ThemeProvider, useTheme } from './ThemeContext';

const server = setupServer(
  http.get('/api/v1/tenant/settings', () => {
    return HttpResponse.json({
        tenantId: 'test-tenant',
        settings: {
          theme: {
            logo: 'https://example.com/logo.png',
            colors: { primary: '#FF5733' },
            fonts: { heading: 'Arial' },
          },
        },
    });
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

### 5.4 Visual Regression Tests

> **Source**: design-spec.md wireframes (Screens 1–7) and component state inventories

Visual regression tests verify that the 8 design-spec components render
correctly across all documented states. Use a screenshot-based comparison
tool (e.g., Playwright `toHaveScreenshot()` or Storybook Chromatic).

**Component Screenshot Matrix:**

| Component                      | States to Capture                                                   | Viewport(s)          | Phase   |
| ------------------------------ | ------------------------------------------------------------------- | -------------------- | ------- |
| `PluginErrorFallback`          | Default, Hover (Retry), Focus (Retry), Focus (Go Back)              | 1440px, 375px        | Phase 4 |
| `RootErrorBoundary` (fallback) | Default, Hover (Reload), Focus (Reload)                             | 1440px, 375px        | Phase 4 |
| `ThemeProvider` + Header       | Default theme, Custom theme (green `#1B5E20`), Broken logo fallback | 1440px, 768px, 375px | Phase 4 |
| `TenantLogo`                   | Tenant logo, Plexica fallback, Image error fallback                 | 1440px, 375px        | Phase 4 |
| `WidgetLoader`                 | Loading skeleton                                                    | 1440px               | Phase 4 |
| `WidgetFallback`               | Default (dashed placeholder)                                        | 1440px, 375px        | Phase 4 |
| `WidgetLoadingSkeleton`        | Pulse animation (single frame)                                      | 1440px               | Phase 4 |
| Full Layout                    | Themed shell with sidebar, header, content                          | 1440px, 768px, 375px | Phase 4 |

**Estimated test count:** 20–25 screenshot assertions across ~12 test cases.

**Implementation guidance:**

```typescript
// apps/web/tests/visual/plugin-error-fallback.visual.spec.ts
import { test, expect } from '@playwright/test';

test('PluginErrorFallback matches wireframe — desktop', async ({ page }) => {
  // Navigate to a route that triggers the error boundary
  await page.goto('/plugins/broken-plugin');
  await expect(page.getByText(/plugin unavailable/i)).toBeVisible();

  // Screenshot the main content area (exclude dynamic elements)
  const mainContent = page.locator('main');
  await expect(mainContent).toHaveScreenshot('plugin-error-fallback-desktop.png', {
    maxDiffPixelRatio: 0.01,
  });
});

test('PluginErrorFallback matches wireframe — mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/plugins/broken-plugin');
  await expect(page.getByText(/plugin unavailable/i)).toBeVisible();

  const mainContent = page.locator('main');
  await expect(mainContent).toHaveScreenshot('plugin-error-fallback-mobile.png', {
    maxDiffPixelRatio: 0.01,
  });
});
```

### 5.5 Accessibility Tests

> **Source**: design-spec.md §6 Accessibility Summary and per-screen ARIA blocks

Automated accessibility tests ensure WCAG 2.1 AA compliance for all Spec 010
components. Tests use `@axe-core/playwright` for violation scanning and manual
assertions for ARIA attributes documented in the design spec.

**Accessibility Test Matrix:**

| Screen / Component    | ARIA Assertions                                                                              | axe-core Scan | Keyboard Nav Test                           | Phase   |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ------- |
| Plugin Error Fallback | `role="alert"`, `aria-label` on buttons, `aria-hidden` on icon, `role="status"` on error box | Yes           | Tab: Retry → Go Back; Enter/Space activates | Phase 5 |
| Root Error Page       | `role="alert"`, `aria-label="Reload this page"`, `alt="Plexica"` on logo                     | Yes           | Tab: Reload → support link; Enter activates | Phase 5 |
| Themed Shell Header   | `role="banner"`, `aria-current="page"`, `aria-label` on logo/bell/globe/avatar               | Yes           | Full header tab traversal                   | Phase 5 |
| Widget Loading        | `aria-busy="true"` on container                                                              | Yes           | N/A (non-interactive)                       | Phase 5 |
| Widget Rendered       | `aria-busy="false"` after load                                                               | Yes           | Depends on widget                           | Phase 5 |
| Widget Unavailable    | `role="status"`, `aria-label="Widget unavailable: {id}/{name}"`, `aria-hidden` on icon       | Yes           | N/A (non-interactive)                       | Phase 5 |

**Estimated test count:** 12–15 accessibility-specific test cases.

**Implementation guidance:**

```typescript
// apps/web/tests/a11y/error-boundaries.a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Plugin error fallback has zero axe-core violations', async ({ page }) => {
  await page.goto('/plugins/broken-plugin');
  await expect(page.getByText(/plugin unavailable/i)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('Plugin error fallback has correct ARIA roles', async ({ page }) => {
  await page.goto('/plugins/broken-plugin');

  // role="alert" on fallback container (design-spec §3 Screen 1)
  const alertContainer = page.getByRole('alert');
  await expect(alertContainer).toBeVisible();

  // Error message box has role="status" (design-spec §3 Screen 1)
  const statusBox = page.getByRole('status');
  await expect(statusBox).toBeVisible();

  // Retry button has descriptive aria-label
  const retryButton = page.getByRole('button', { name: /retry loading/i });
  await expect(retryButton).toBeVisible();
});

test('Root error page keyboard navigation', async ({ page }) => {
  await page.goto('/trigger-root-error'); // Test route that crashes shell

  // Tab to Reload Page button
  await page.keyboard.press('Tab');
  const reloadButton = page.getByRole('button', { name: /reload/i });
  await expect(reloadButton).toBeFocused();

  // Tab to support link
  await page.keyboard.press('Tab');
  const supportLink = page.getByRole('link', { name: /support@plexica/i });
  await expect(supportLink).toBeFocused();
});
```

### 5.6 User Journey Test Coverage Mapping

> **Source**: `user-journey.md` — 3 journeys, 8 edge cases

This section maps each user journey and edge case from `user-journey.md` to
specific E2E and integration tests, ensuring complete coverage of the documented
user experience.

**Journey 1: Dana — Tenant Branding Applied**

| Journey Step / Edge Case                                           | Covering Test(s)                                                                | Test Type   | Phase   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------- | ------- |
| Happy path: Steps 1-5 (logo + colors + fonts + plugin inheritance) | `tenant-theming.spec.ts`: "should display tenant logo and brand colors"         | E2E         | Phase 4 |
| Edge Case A: Theme API returns null                                | `ThemeContext.test.tsx`: "should apply default theme when API returns null"     | Integration | Phase 2 |
| Edge Case B: Broken logo URL (onError fallback)                    | `Header.test.tsx`: "should fall back to Plexica logo on image error"            | Unit        | Phase 2 |
| Edge Case C: Custom font fails to load (CDN down)                  | `font-loader.test.ts`: "should fall back to system fonts on FontFace rejection" | Unit        | Phase 2 |

**Journey 2: Raj — Widget Cross-Plugin Use**

| Journey Step / Edge Case                        | Covering Test(s)                                                               | Test Type | Phase   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | --------- | ------- |
| Happy path: Steps 1-5 (widget loads with theme) | `widget-loading.spec.ts`: "should load and render CRM ContactCard widget"      | E2E       | Phase 4 |
| Edge Case A: Widget remote unavailable          | `widget-loader.test.ts`: "should show WidgetFallback when import rejects"      | Unit      | Phase 3 |
| Edge Case B: Widget version mismatch            | `plugin-error-handling.spec.ts`: "should show error boundary on runtime error" | E2E       | Phase 4 |

**Journey 3: Maria — Encountering a Plugin Error**

| Journey Step / Edge Case                                       | Covering Test(s)                                                                  | Test Type | Phase   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- | ------- |
| Happy path: Steps 1-6 (error fallback → Go Back → retry later) | `plugin-error-handling.spec.ts`: "should show error boundary when plugin crashes" | E2E       | Phase 4 |
| Edge Case A: Plugin remote entry unreachable (network)         | `PluginErrorBoundary.test.tsx`: "should catch async import errors"                | Unit      | Phase 1 |
| Edge Case B: Root error boundary (shell crash)                 | `root-error.spec.ts`: "should show root error page when shell crashes"            | E2E       | Phase 4 |
| Edge Case C: Browser zoom 150% (WCAG 1.4.4)                    | `accessibility.spec.ts`: "should be usable at 150% zoom"                          | E2E       | Phase 5 |

**Coverage Summary:**

- **3/3 journeys** covered by E2E tests
- **8/8 edge cases** covered by unit, integration, or E2E tests
- **Total journey-related tests**: ~12 test cases across Phase 1–5

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

### New Files (20 files)

```
packages/shared-types/src/
└── fonts.ts                          ← ADR-020: FontDefinition type + FONT_CATALOG

apps/web/
├── index.html                        ← ADR-020: <link rel="preload"> for Inter+Roboto
└── src/
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
    │   ├── font-loader.ts            ← ADR-020: FontFace API loader
    │   ├── font-loader.test.ts
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

---

## Cross-References

| Document                        | Path                                                      |
| ------------------------------- | --------------------------------------------------------- |
| Spec 010                        | `.forge/specs/010-frontend-production-readiness/spec.md`  |
| Tasks 010                       | `.forge/specs/010-frontend-production-readiness/tasks.md` |
| Constitution                    | `.forge/constitution.md`                                  |
| Spec 005: Frontend Architecture | `.forge/specs/005-frontend-architecture/spec.md`          |
| Spec 004: Plugin System         | `.forge/specs/004-plugin-system/spec.md`                  |
| ADR-004: Module Federation      | `.forge/knowledge/adr/adr-004-module-federation.md`       |
| ADR-009: TailwindCSS Tokens     | `.forge/knowledge/adr/adr-009-tailwindcss-v4-tokens.md`   |
| ADR-011: Vite Module Federation | `.forge/knowledge/adr/adr-011-vite-module-federation.md`  |
| ADR-020: Font Hosting Strategy  | `.forge/knowledge/adr/adr-020-font-hosting-strategy.md`   |
| Frontend App                    | `apps/web/`                                               |
| Shared Types Package            | `packages/shared-types/`                                  |
