// apps/web/src/__tests__/theme/Header.test.tsx
//
// T2.6: Unit tests for Header tenant logo / fallback rendering.
//
// Coverage targets (tasks.md):
//   - Displays tenant logo <img> when tenantTheme.logo is set      ✓
//   - Displays default "P" placeholder when no logo                ✓
//   - Falls back to placeholder on image load error                ✓
//   - Logo img has correct alt text                                 ✓
//   - Placeholder shows tenantName from auth store                  ✓

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockUseTenantTheme, mockUseAuthStore } = vi.hoisted(() => {
  const mockUseTenantTheme = vi.fn();
  const mockUseAuthStore = vi.fn();
  return { mockUseTenantTheme, mockUseAuthStore };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/contexts/ThemeContext', () => ({
  useTenantTheme: mockUseTenantTheme,
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

vi.mock('@/contexts', () => ({
  useIntl: () => ({ locale: 'en', setLocale: vi.fn() }),
  useWorkspace: () => ({ workspace: null }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@plexica/ui', () => ({
  LanguageSelector: () => <div data-testid="lang-selector" />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock('@/components/shell/UserProfileMenu', () => ({
  UserProfileMenu: () => <div data-testid="user-profile-menu" />,
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { Header } from '@/components/Layout/Header';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderHeader(props = { onMenuClick: vi.fn() }) {
  return render(<Header {...props} />);
}

function mockTheme(logo: string | null) {
  mockUseTenantTheme.mockReturnValue({
    tenantTheme: { ...DEFAULT_TENANT_THEME, logo },
    tenantThemeLoading: false,
    tenantThemeError: null,
    refreshTenantTheme: vi.fn(),
  });
}

function mockUser(tenantId: string | null) {
  // Header calls useAuthStore() without a selector — returns whole state
  mockUseAuthStore.mockReturnValue({ user: tenantId ? { tenantId } : null });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no logo, no tenant user
  mockTheme(null);
  mockUser(null);
});

// ---------------------------------------------------------------------------
// Default placeholder — no logo
// ---------------------------------------------------------------------------

describe('Header — no tenant logo', () => {
  it('renders the "P" placeholder when logo is null', () => {
    mockTheme(null);
    renderHeader();
    // The "P" text is inside the placeholder div
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('does not render a tenant-logo img when logo is null', () => {
    mockTheme(null);
    renderHeader();
    expect(screen.queryByTestId('tenant-logo')).not.toBeInTheDocument();
  });

  it('shows tenantName from auth store in placeholder text', () => {
    mockTheme(null);
    mockUser('acme-corp');
    renderHeader();
    // The span with tenantName (hidden on mobile, visible md+)
    expect(screen.getByText('acme-corp')).toBeInTheDocument();
  });

  it('falls back to "Plexica" when user has no tenantId', () => {
    mockTheme(null);
    mockUser(null);
    renderHeader();
    expect(screen.getByText('Plexica')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tenant logo present
// ---------------------------------------------------------------------------

describe('Header — with tenant logo', () => {
  const LOGO_URL = 'https://cdn.acme.com/logo.png';

  beforeEach(() => {
    mockTheme(LOGO_URL);
    mockUser('acme-corp');
  });

  it('renders the tenant logo <img> when logo is set', () => {
    renderHeader();
    const img = screen.getByTestId('tenant-logo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', LOGO_URL);
  });

  it('sets alt text to "<tenantName> logo"', () => {
    renderHeader();
    const img = screen.getByTestId('tenant-logo');
    expect(img).toHaveAttribute('alt', 'acme-corp logo');
  });

  it('does not render the "P" placeholder when logo is set', () => {
    renderHeader();
    expect(screen.queryByText('P')).not.toBeInTheDocument();
  });

  it('home button has aria-label including tenantName', () => {
    renderHeader();
    // Find the home button by test id approach — check aria-label attribute
    const homeBtn = screen.getByLabelText(/acme-corp home/i);
    expect(homeBtn).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Logo error fallback
// ---------------------------------------------------------------------------

describe('Header — logo image error fallback', () => {
  const LOGO_URL = 'https://cdn.acme.com/broken.png';

  beforeEach(() => {
    mockTheme(LOGO_URL);
    mockUser('acme-corp');
  });

  it('falls back to placeholder src on image load error', async () => {
    renderHeader();

    // Before error: logo img shows the tenant logo
    const img = screen.getByTestId('tenant-logo');
    expect(img).toHaveAttribute('src', LOGO_URL);

    // Simulate image load error — triggers logoError state update
    await act(async () => {
      fireEvent.error(img);
    });

    // After error: src switches to placeholder (img still rendered because tenantTheme.logo is truthy)
    expect(screen.getByTestId('tenant-logo')).toHaveAttribute('src', '/plexica-logo.svg');
  });
});

// ---------------------------------------------------------------------------
// onMenuClick wiring
// ---------------------------------------------------------------------------

describe('Header — menu button', () => {
  it('calls onMenuClick when hamburger is clicked', () => {
    const onMenuClick = vi.fn();
    renderHeader({ onMenuClick });
    const menuBtn = screen.getByLabelText(/toggle menu/i);
    fireEvent.click(menuBtn);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});
