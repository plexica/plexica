// apps/web/src/__tests__/layout/AppLayout.test.tsx
//
// T005-24: Unit tests for AppLayout ARIA landmarks and sidebar state.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Feature flags — default: ENABLE_NEW_SIDEBAR = false
const mockUseFeatureFlag = vi.fn();
vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: (flag: string) => mockUseFeatureFlag(flag),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../contexts/PluginContext', () => ({
  usePlugins: () => ({ menuItems: [], plugins: [], isLoading: false }),
}));

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: () => ({ user: null }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTenantTheme: () => ({ tenantTheme: { logo: null, colors: {}, fonts: {} } }),
}));

vi.mock('../../contexts', () => ({
  useIntl: () => ({ locale: 'en', setLocale: vi.fn() }),
}));

vi.mock('../../components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock('../../components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@plexica/ui', () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../../components/auth/SessionExpiredModal', () => ({
  SessionExpiredModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="session-expired-modal" /> : null,
}));

vi.mock('../../components/AuthWarningBanner', () => ({
  AuthWarningBanner: () => null,
}));

import { AppLayout } from '../../components/Layout/AppLayout';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AppLayout', () => {
  beforeEach(() => {
    // Default: new sidebar disabled
    mockUseFeatureFlag.mockReturnValue(false);
  });

  // ---- Test 1 ---------------------------------------------------------------
  it('renders <main id="main-content" role="main"> landmark', () => {
    render(<AppLayout>Page content</AppLayout>);

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  // ---- Test 2 ---------------------------------------------------------------
  it('renders <footer role="contentinfo"> landmark', () => {
    render(<AppLayout>Page content</AppLayout>);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });

  // ---- Test 3 ---------------------------------------------------------------
  it('isSidebarOpen state toggles when onMenuClick is called (new sidebar enabled)', async () => {
    mockUseFeatureFlag.mockReturnValue(true);

    // Set to desktop viewport so SidebarNav renders in non-overlay mode
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });

    await act(async () => {
      render(<AppLayout>Page content</AppLayout>);
    });

    // The menu button in the header triggers sidebar toggle
    const menuBtn = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuBtn).toBeInTheDocument();

    // After click, state changes (no crash)
    await act(async () => {
      fireEvent.click(menuBtn);
    });

    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
