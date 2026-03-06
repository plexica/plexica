// apps/web/src/__tests__/api/api-interactions.integration.test.tsx
//
// T010-28: Integration tests for API interactions — ThemeProvider + font loading.
//
// Tests the ThemeProvider auth-state gating and font-loading integration paths
// that are NOT already covered by ThemeContext.integration.test.tsx.
//
// ThemeContext.integration.test.tsx focuses on:
//   - API fetch success/error/404/dedup/refreshTenantTheme sequences
//
// This file adds:
//   Group 1 – auth-state gating (no-fetch when unauthenticated)            (3 tests)
//   Group 2 – ThemeProvider → loadFonts integration                         (4 tests)
//
// Total: 7 tests
//
// Pattern: uses the same vi.mock('@/lib/api-client') + mockGet approach as
// ThemeContext.integration.test.tsx (proven, no MSW needed for this layer).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import _React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockGet, mockLoadFonts, mockApplyTheme, mockUseAuthStore } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockLoadFonts = vi.fn().mockResolvedValue(undefined);
  const mockApplyTheme = vi.fn();

  // Mutable shared state — mutations are reflected in selector calls
  const _state: { user: { tenantId: string } | null } = { user: null };

  const mockUseAuthStore = vi.fn((selector?: (s: typeof _state) => unknown) => {
    return selector ? selector(_state) : _state;
  });

  Object.assign(mockUseAuthStore, {
    _setState(s: { user: { tenantId: string } | null }) {
      _state.user = s.user;
    },
  });

  return { mockGet, mockLoadFonts, mockApplyTheme, mockUseAuthStore };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createContextLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/lib/api-client', () => ({
  default: { get: mockGet },
  apiClient: { get: mockGet },
}));

vi.mock('@/lib/font-loader', () => ({
  loadFonts: mockLoadFonts,
  preloadFont: vi.fn(),
  isFontLoaded: vi.fn().mockReturnValue(false),
  _resetForTesting: vi.fn(),
}));

vi.mock('@/lib/theme-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme-utils')>();
  return { ...actual, applyTheme: mockApplyTheme };
});

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Mock window.matchMedia (required by ThemeProvider)
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { ThemeProvider, useTenantTheme } from '@/contexts/ThemeContext';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THEME_FIXTURE = {
  logo: 'https://cdn.example.com/logos/acme.png',
  colors: {
    primary: '#cc3300',
    secondary: '#0055cc',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#212121',
    textSecondary: '#757575',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
  fonts: { heading: 'inter', body: 'roboto', mono: 'roboto-mono' },
};

const UPDATED_FONTS_THEME = {
  ...THEME_FIXTURE,
  fonts: { heading: 'lato', body: 'open-sans', mono: 'roboto-mono' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLoggedIn(tenantId: string) {
  (
    mockUseAuthStore as typeof mockUseAuthStore & {
      _setState: (s: { user: { tenantId: string } }) => void;
    }
  )._setState({ user: { tenantId } });
}

function setLoggedOut() {
  (
    mockUseAuthStore as typeof mockUseAuthStore & {
      _setState: (s: { user: null }) => void;
    }
  )._setState({ user: null });
}

function mockThemeSuccess(theme = THEME_FIXTURE) {
  mockGet.mockResolvedValue({
    tenantId: 'test-tenant',
    settings: { theme },
  });
}

function mockThemeFailure(status = 500) {
  mockGet.mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { status }));
}

// ---------------------------------------------------------------------------
// Shared probe component
// ---------------------------------------------------------------------------

function ThemeProbe() {
  const { tenantTheme, tenantThemeLoading, tenantThemeError } = useTenantTheme();
  return (
    <div
      data-testid="probe"
      data-primary={tenantTheme.colors.primary}
      data-loading={String(tenantThemeLoading)}
      data-error={tenantThemeError?.message ?? ''}
      data-heading={tenantTheme.fonts.heading}
      data-body={tenantTheme.fonts.body}
    />
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setLoggedOut();
  // Restore localStorage mock
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('dark');
});

// ---------------------------------------------------------------------------
// Group 1: Auth-state gating
// ---------------------------------------------------------------------------

describe('Group 1: ThemeProvider auth-state gating', () => {
  it('does not call apiClient.get when user is not authenticated', async () => {
    setLoggedOut();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // API never called — no tenantId
    expect(mockGet).not.toHaveBeenCalled();
    // Default theme in place
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    expect(probe.dataset.loading).toBe('false');
  });

  it('calls apiClient.get and applies fetched theme when user is authenticated', async () => {
    setLoggedIn('acme-corp');
    mockThemeSuccess();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/settings');
    expect(mockApplyTheme).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({ primary: THEME_FIXTURE.colors.primary }),
      })
    );
  });

  it('sets error state and applies defaults when theme API call fails', async () => {
    setLoggedIn('broken-tenant');
    mockThemeFailure(500);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.loading).toBe('false');
    });

    // Error is populated
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.error).not.toBe('');
    // Default primary (fetch failed)
    expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
  });
});

// ---------------------------------------------------------------------------
// Group 2: ThemeProvider → loadFonts integration
// ---------------------------------------------------------------------------

describe('Group 2: ThemeProvider → loadFonts integration', () => {
  it('calls loadFonts with font IDs from the API response', async () => {
    setLoggedIn('font-tenant');
    mockThemeSuccess({
      ...THEME_FIXTURE,
      fonts: { heading: 'inter', body: 'roboto', mono: 'roboto-mono' },
    });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockLoadFonts).toHaveBeenCalled());

    // loadFonts was called with the validated display names from the API-provided font IDs
    // validateTheme converts IDs ("inter") → display names ("Inter") per ADR-020
    const calls = mockLoadFonts.mock.calls as Array<[{ heading: string; body: string }]>;
    const hasApiFonts = calls.some(([args]) => args.heading === 'Inter' && args.body === 'Roboto');
    expect(hasApiFonts).toBe(true);
  });

  it('calls loadFonts with default fonts on mount before any API fetch', async () => {
    setLoggedOut(); // not logged in — no API fetch, default theme applied

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    // loadFonts fires from the useEffect triggered by initial tenantTheme.fonts
    await waitFor(() => expect(mockLoadFonts).toHaveBeenCalledTimes(1));

    const firstArg = (mockLoadFonts.mock.calls as Array<[{ heading: string; body: string }]>)[0][0];
    expect(firstArg).toHaveProperty('heading', DEFAULT_TENANT_THEME.fonts.heading);
    expect(firstArg).toHaveProperty('body', DEFAULT_TENANT_THEME.fonts.body);
  });

  it('calls loadFonts again after refreshTenantTheme returns new font values', async () => {
    setLoggedIn('refresh-tenant');

    let callCount = 0;
    mockGet.mockImplementation(async () => {
      callCount += 1;
      const theme = callCount === 1 ? THEME_FIXTURE : UPDATED_FONTS_THEME;
      return { tenantId: 'refresh-tenant', settings: { theme } };
    });

    function ThemeRefreshProbe() {
      const { tenantTheme, refreshTenantTheme } = useTenantTheme();
      return (
        <div>
          <div data-testid="probe" data-heading={tenantTheme.fonts.heading} />
          <button onClick={() => void refreshTenantTheme()}>Refresh</button>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <ThemeRefreshProbe />
      </ThemeProvider>
    );

    // Wait for first fetch (loadFonts called once after initial theme load)
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockLoadFonts).toHaveBeenCalled());

    const initialCallCount = mockLoadFonts.mock.calls.length;

    // Trigger refresh — second fetch returns UPDATED_FONTS_THEME (lato / open-sans)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    // Font change should trigger another loadFonts call
    await waitFor(() => expect(mockLoadFonts.mock.calls.length).toBeGreaterThan(initialCallCount));

    // Final call uses the updated fonts (IDs "lato"/"open-sans" → display names "Lato"/"Open Sans")
    const lastArgs = (mockLoadFonts.mock.calls as Array<[{ heading: string; body: string }]>).at(
      -1
    )?.[0];
    expect(lastArgs?.heading).toBe('Lato');
    expect(lastArgs?.body).toBe('Open Sans');
  });

  it('does not call loadFonts again when fonts are stable after fetch settles', async () => {
    setLoggedIn('stable-tenant');
    mockThemeSuccess(); // THEME_FIXTURE fonts

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    // Wait for fetch to complete
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    // Wait for loadFonts to have been called at least once
    await waitFor(() => expect(mockLoadFonts).toHaveBeenCalled());

    const callsAfterFetch = mockLoadFonts.mock.calls.length;

    // Let any pending microtasks / timers settle — no further font loading expected
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Call count must be stable — no spurious extra loadFonts calls
    expect(mockLoadFonts.mock.calls.length).toBe(callsAfterFetch);
  });
});
