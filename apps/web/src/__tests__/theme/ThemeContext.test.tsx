// apps/web/src/__tests__/theme/ThemeContext.test.tsx
//
// T2.7: Unit tests for ThemeProvider, useTheme, and useTenantTheme hooks.
//
// Coverage targets (tasks.md):
//   - ThemeProvider renders children                               ✓
//   - useTheme throws when used outside provider                   ✓
//   - useTenantTheme returns tenant theme fields                   ✓
//   - Default theme applied on mount (no tenantId)                ✓
//   - Default color-scheme is 'system'                            ✓
//   - setTheme persists to localStorage                            ✓
//   - isDark reflects system preference when scheme is 'system'    ✓
//   - refreshTenantTheme is callable                               ✓

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockWarn, mockGet, mockUseAuthStore } = vi.hoisted(() => {
  const mockWarn = vi.fn();
  const mockGet = vi.fn();
  // Default: not authenticated (no tenantId) — overridden in individual tests
  const mockUseAuthStore = vi.fn((selector: (s: { user: null }) => unknown) =>
    selector({ user: null })
  );
  return { mockWarn, mockGet, mockUseAuthStore };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: mockWarn, info: vi.fn(), debug: vi.fn() },
  createContextLogger: vi.fn(() => ({ error: vi.fn(), warn: mockWarn })),
}));

vi.mock('@/lib/api-client', () => ({
  default: { get: mockGet },
  apiClient: { get: mockGet },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

// ---------------------------------------------------------------------------
// Mock window.matchMedia (jsdom doesn't implement it)
// ---------------------------------------------------------------------------

const mockMatchMedia = vi.fn((query: string) => ({
  matches: query.includes('dark') ? false : false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { ThemeProvider, useTheme, useTenantTheme } from '@/contexts/ThemeContext';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helper: wrapper that renders a consumer component inside ThemeProvider
// ---------------------------------------------------------------------------

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** Render useTheme() hook inside ThemeProvider, returning the hook result */
function renderUseTheme() {
  return renderHook(() => useTheme(), {
    wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
  });
}

/** Render useTenantTheme() hook inside ThemeProvider, returning the hook result */
function renderUseTenantTheme() {
  return renderHook(() => useTenantTheme(), {
    wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
  });
}

// ---------------------------------------------------------------------------
// Thin helper component — used ONLY for "throws" and "provides" tests
// (no outer variable mutation needed here)
// ---------------------------------------------------------------------------

function ThemeConsumer() {
  useTheme(); // will throw if outside provider
  return <div data-testid="consumer">theme-consumer</div>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('dark');
  // Reset localStorage mock
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  // Default: not logged in
  mockUseAuthStore.mockImplementation((selector: (s: { user: null }) => unknown) =>
    selector({ user: null })
  );
});

// ---------------------------------------------------------------------------
// ThemeProvider — basic rendering
// ---------------------------------------------------------------------------

describe('ThemeProvider', () => {
  it('renders children', () => {
    renderWithTheme(<div data-testid="child">hello</div>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides context to consumers', () => {
    renderWithTheme(<ThemeConsumer />);
    expect(screen.getByTestId('consumer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// useTheme — must be used inside ThemeProvider
// ---------------------------------------------------------------------------

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    // Suppress the expected console error from React
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within a ThemeProvider');

    console.error = originalError;
  });
});

// ---------------------------------------------------------------------------
// Color-scheme: default, setTheme, isDark
// ---------------------------------------------------------------------------

describe('color-scheme', () => {
  it('defaults to system when no localStorage value', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderUseTheme();
    expect(result.current.theme).toBe('system');
  });

  it('reads initial theme from localStorage', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('dark');
    const { result } = renderUseTheme();
    expect(result.current.theme).toBe('dark');
  });

  it('setTheme updates theme state and persists to localStorage', () => {
    const { result } = renderUseTheme();
    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.theme).toBe('light');
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light');
  });

  it('isDark is true when theme is dark', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('dark');
    const { result } = renderUseTheme();
    expect(result.current.isDark).toBe(true);
  });

  it('isDark is false when theme is light', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('light');
    const { result } = renderUseTheme();
    expect(result.current.isDark).toBe(false);
  });

  it('isDark reflects system preference when theme is system', () => {
    // System preference: prefers-dark = true
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderUseTheme();
    expect(result.current.isDark).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useTenantTheme — no tenantId (not logged in)
// ---------------------------------------------------------------------------

describe('useTenantTheme — unauthenticated', () => {
  it('returns default tenant theme when no tenantId', () => {
    const { result } = renderUseTenantTheme();
    expect(result.current.tenantTheme.colors.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    expect(result.current.tenantTheme.fonts.heading).toBe(DEFAULT_TENANT_THEME.fonts.heading);
    expect(result.current.tenantTheme.logo).toBeNull();
  });

  it('does not call apiClient when no tenantId', () => {
    renderUseTenantTheme();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('tenantThemeLoading is false when no tenantId', () => {
    const { result } = renderUseTenantTheme();
    expect(result.current.tenantThemeLoading).toBe(false);
  });

  it('tenantThemeError is null when no tenantId', () => {
    const { result } = renderUseTenantTheme();
    expect(result.current.tenantThemeError).toBeNull();
  });

  it('refreshTenantTheme is a function', () => {
    const { result } = renderUseTenantTheme();
    expect(typeof result.current.refreshTenantTheme).toBe('function');
  });

  it('refreshTenantTheme does nothing when no tenantId', async () => {
    const { result } = renderUseTenantTheme();
    // Should resolve without calling API
    await act(async () => {
      await result.current.refreshTenantTheme();
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useTenantTheme — applies defaults immediately (no FOUC)
// ---------------------------------------------------------------------------

describe('useTenantTheme — CSS custom properties on mount', () => {
  it('applies --tenant-primary CSS variable on mount', () => {
    renderUseTenantTheme();
    const primary = document.documentElement.style.getPropertyValue('--tenant-primary');
    expect(primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
  });

  it('applies --tenant-font-heading CSS variable on mount', () => {
    renderUseTenantTheme();
    const fontHeading = document.documentElement.style.getPropertyValue('--tenant-font-heading');
    expect(fontHeading).toBe(DEFAULT_TENANT_THEME.fonts.heading);
  });
});
