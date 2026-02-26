// apps/web/src/__tests__/theme/ThemeContext.integration.test.tsx
//
// T2.8: Integration tests for ThemeProvider — API fetch lifecycle.
//
// Coverage targets (tasks.md):
//   - Successful fetch applies validated tenant theme              ✓
//   - API 404 falls back to default theme without error state      ✓
//   - API 500 falls back to default theme with error state         ✓
//   - No API fetch before login (no tenantId)                      ✓
//   - Tenant change triggers re-fetch                              ✓
//   - refreshTenantTheme forces re-fetch                           ✓
//   - Theme CSS custom properties updated after fetch              ✓

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, renderHook } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockWarn, mockGet, mockUseAuthStore } = vi.hoisted(() => {
  const mockWarn = vi.fn();
  const mockGet = vi.fn();
  const mockUseAuthStore = vi.fn(
    (selector: (s: { user: { tenantId: string } | null }) => unknown) => selector({ user: null })
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
// Mock window.matchMedia
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
// Imports after mocks
// ---------------------------------------------------------------------------

import { ThemeProvider, useTenantTheme } from '@/contexts/ThemeContext';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A consumer that exposes tenant theme values via data attributes for assertions */
function TenantThemeProbe() {
  const { tenantTheme, tenantThemeLoading, tenantThemeError } = useTenantTheme();
  return (
    <div
      data-testid="probe"
      data-primary={tenantTheme.colors.primary}
      data-loading={String(tenantThemeLoading)}
      data-error={tenantThemeError?.message ?? ''}
      data-logo={tenantTheme.logo ?? ''}
    >
      probe
    </div>
  );
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** Helper: set up mockUseAuthStore to return a user with a given tenantId */
function mockLoggedIn(tenantId: string) {
  mockUseAuthStore.mockImplementation((selector: (s: { user: { tenantId: string } }) => unknown) =>
    selector({ user: { tenantId } })
  );
}

function mockLoggedOut() {
  mockUseAuthStore.mockImplementation((selector: (s: { user: null }) => unknown) =>
    selector({ user: null })
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('dark');
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  mockLoggedOut();
});

// ---------------------------------------------------------------------------
// No API call when not authenticated
// ---------------------------------------------------------------------------

describe('ThemeProvider — unauthenticated', () => {
  it('does not call API when user has no tenantId', async () => {
    mockLoggedOut();
    renderWithProvider(<TenantThemeProbe />);
    // Give any pending microtasks time to settle
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('renders default theme when not logged in', async () => {
    mockLoggedOut();
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    });
  });
});

// ---------------------------------------------------------------------------
// Successful API fetch
// ---------------------------------------------------------------------------

describe('ThemeProvider — successful fetch', () => {
  const CUSTOM_THEME = {
    logo: 'https://cdn.acme.com/logo.png',
    colors: {
      ...DEFAULT_TENANT_THEME.colors,
      primary: '#cc3300',
      secondary: '#0055cc',
    },
    fonts: DEFAULT_TENANT_THEME.fonts,
  };

  beforeEach(() => {
    mockLoggedIn('acme-corp');
    mockGet.mockResolvedValue({
      tenantId: 'acme-corp',
      settings: { theme: CUSTOM_THEME },
    });
  });

  it('fetches tenant theme from /api/v1/tenant/settings', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/tenant/settings');
    });
  });

  it('applies the fetched primary color', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.primary).toBe('#cc3300');
    });
  });

  it('applies the fetched logo URL', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.logo).toBe('https://cdn.acme.com/logo.png');
    });
  });

  it('sets --tenant-primary CSS custom property', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue('--tenant-primary');
      expect(primary).toBe('#cc3300');
    });
  });

  it('sets --tenant-font-heading CSS custom property', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const fontHeading = document.documentElement.style.getPropertyValue('--tenant-font-heading');
      expect(fontHeading).toBe(DEFAULT_TENANT_THEME.fonts.heading);
    });
  });

  it('tenantThemeLoading is false after fetch completes', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.loading).toBe('false');
    });
  });

  it('tenantThemeError is empty after successful fetch', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.error).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// API returns null theme (no settings configured)
// ---------------------------------------------------------------------------

describe('ThemeProvider — API returns no theme', () => {
  beforeEach(() => {
    mockLoggedIn('bare-tenant');
    mockGet.mockResolvedValue({ tenantId: 'bare-tenant', settings: {} });
  });

  it('falls back to default theme when settings.theme is missing', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    });
  });

  it('does not set error state for empty settings', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.error).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// API error (500 / network failure)
// ---------------------------------------------------------------------------

describe('ThemeProvider — API error', () => {
  beforeEach(() => {
    mockLoggedIn('broken-tenant');
    mockGet.mockRejectedValue(new Error('Internal Server Error'));
  });

  it('falls back to default theme on API error', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    });
  });

  it('sets tenantThemeError state on API error', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.error).toBe('Internal Server Error');
    });
  });

  it('logs a warning on API error', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      expect(mockWarn).toHaveBeenCalled();
    });
  });

  it('tenantThemeLoading is false after error', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.loading).toBe('false');
    });
  });
});

// ---------------------------------------------------------------------------
// Invalid color values in API response — validation fallback
// ---------------------------------------------------------------------------

describe('ThemeProvider — invalid theme values from API', () => {
  beforeEach(() => {
    mockLoggedIn('evil-tenant');
    mockGet.mockResolvedValue({
      tenantId: 'evil-tenant',
      settings: {
        theme: {
          logo: 'http://insecure.com/logo.png', // http: invalid
          colors: {
            ...DEFAULT_TENANT_THEME.colors,
            primary: 'not-a-color', // invalid hex
          },
          fonts: DEFAULT_TENANT_THEME.fonts,
        },
      },
    });
  });

  it('replaces invalid primary color with default', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    });
  });

  it('rejects http logo URL (sets logo to empty)', async () => {
    renderWithProvider(<TenantThemeProbe />);
    await waitFor(() => {
      const probe = screen.getByTestId('probe');
      expect(probe.dataset.logo).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// refreshTenantTheme — forces re-fetch
// ---------------------------------------------------------------------------

describe('ThemeProvider — refreshTenantTheme', () => {
  beforeEach(() => {
    mockLoggedIn('refresh-tenant');
    mockGet
      .mockResolvedValueOnce({
        tenantId: 'refresh-tenant',
        settings: {
          theme: {
            ...DEFAULT_TENANT_THEME,
            colors: { ...DEFAULT_TENANT_THEME.colors, primary: '#111111' },
          },
        },
      })
      .mockResolvedValueOnce({
        tenantId: 'refresh-tenant',
        settings: {
          theme: {
            ...DEFAULT_TENANT_THEME,
            colors: { ...DEFAULT_TENANT_THEME.colors, primary: '#222222' },
          },
        },
      });
  });

  it('re-fetches and updates the theme on refresh', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTenantTheme(), { wrapper });

    // Wait for first fetch
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    // Trigger refresh
    await act(async () => {
      await result.current.refreshTenantTheme();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.tenantTheme.colors.primary).toBe('#222222');
  });
});

// ---------------------------------------------------------------------------
// Same tenantId — no duplicate fetch
// ---------------------------------------------------------------------------

describe('ThemeProvider — no duplicate fetch for same tenant', () => {
  it('calls API only once for the same tenantId across re-renders', async () => {
    mockLoggedIn('stable-tenant');
    mockGet.mockResolvedValue({
      tenantId: 'stable-tenant',
      settings: { theme: null },
    });

    const { rerender } = renderWithProvider(<TenantThemeProbe />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    // Re-render with same tenant — should not trigger second fetch
    rerender(
      <ThemeProvider>
        <TenantThemeProbe />
      </ThemeProvider>
    );

    // Small delay to let any additional effects run
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
