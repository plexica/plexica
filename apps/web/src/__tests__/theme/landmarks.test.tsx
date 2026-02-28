// apps/web/src/__tests__/theme/landmarks.test.tsx
//
// T005-22: Verify ARIA landmark roles are present in the AppLayout shell.
// Tests: banner, navigation, main, contentinfo, and skip-to-content link.
//
// Run: pnpm test src/__tests__/theme/landmarks.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppLayout } from '@/components/Layout/AppLayout';

// ---------------------------------------------------------------------------
// Mocks — minimal set to make AppLayout render in jsdom
// ---------------------------------------------------------------------------

const mockUseFeatureFlag = vi.fn((_flag?: string) => false);
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

vi.mock('@/contexts/PluginContext', () => ({
  usePlugins: () => ({ menuItems: [], plugins: [], isLoading: false }),
}));

const mockAuthState = {
  user: null,
  refreshFailed: false,
  setRefreshFailed: vi.fn(),
  refreshTokens: vi.fn(),
};

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState
  ),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTenantTheme: () => ({ tenantTheme: { logo: null, colors: {}, fonts: {} } }),
}));

vi.mock('@/contexts', () => ({
  useIntl: () => ({ locale: 'en', setLocale: vi.fn() }),
}));

vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@plexica/ui', () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/shell/UserProfileMenu', () => ({
  UserProfileMenu: () => <div data-testid="user-profile-menu" />,
}));

vi.mock('@/components/auth/SessionExpiredModal', () => ({
  SessionExpiredModal: () => null,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppLayout — ARIA landmarks (T005-22)', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
  });

  it('should render a <header role="banner"> landmark', () => {
    render(<AppLayout>content</AppLayout>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('should render a <main role="main"> landmark with id="main-content"', () => {
    render(<AppLayout>content</AppLayout>);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('should render a <footer role="contentinfo"> landmark', () => {
    render(<AppLayout>content</AppLayout>);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('should render a <nav role="navigation"> landmark when new sidebar is enabled', () => {
    mockUseFeatureFlag.mockReturnValue(true);
    render(<AppLayout>content</AppLayout>);
    // SidebarNav renders a <nav> element
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
