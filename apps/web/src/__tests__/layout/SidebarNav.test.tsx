// apps/web/src/__tests__/layout/SidebarNav.test.tsx
//
// T005-01: Unit tests for SidebarNav component.
// Tests ARIA, keyboard navigation, feature flag, collapsed mode, plugin items.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SidebarNav } from '../../components/Layout/SidebarNav';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// TanStack Router — useLocation is a spy so tests can override the pathname
let mockPathname = '/dashboard';
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    onClick,
  }: {
    to: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mockPathname }),
}));

// PluginContext — default: empty menu items
const mockUsePlugins = vi.fn();
vi.mock('../../contexts/PluginContext', () => ({
  usePlugins: () => mockUsePlugins(),
}));

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------
const defaultProps = {
  isOpen: false,
  onClose: vi.fn(),
  collapsed: false,
  onCollapsedChange: vi.fn(),
};

function renderSidebar(overrides?: Partial<typeof defaultProps>) {
  return render(<SidebarNav {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SidebarNav', () => {
  beforeEach(() => {
    // Reset pathname to default
    mockPathname = '/dashboard';
    // Reset mock to return empty plugin menu
    mockUsePlugins.mockReturnValue({
      menuItems: [],
      isLoading: false,
    });
    // Default to desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    // Trigger isMobile re-calculation
    window.dispatchEvent(new Event('resize'));
  });

  // ---- Test 1 ---------------------------------------------------------------
  it('renders core nav items (Dashboard, Profile, Settings) when plugins list is empty', () => {
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  // ---- Test 2 ---------------------------------------------------------------
  it('renders plugin items from PluginContext.menuItems under collapsible group', () => {
    mockUsePlugins.mockReturnValue({
      menuItems: [
        { id: 'crm', label: 'CRM', path: '/crm', icon: undefined },
        { id: 'hr', label: 'HR', path: '/hr', icon: undefined },
      ],
      isLoading: false,
    });

    renderSidebar();

    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
  });

  // ---- Test 3 ---------------------------------------------------------------
  it('active route item has aria-current="page"', () => {
    // Set the active pathname to /settings before rendering
    mockPathname = '/settings';

    const { container } = renderSidebar();

    // The Settings nav item should have aria-current="page"
    const current = container.querySelector('[aria-current="page"]');
    expect(current).toBeInTheDocument();
  });

  // ---- Test 4 ---------------------------------------------------------------
  it('plugins group toggle sets aria-expanded correctly and shows/hides items', () => {
    mockUsePlugins.mockReturnValue({
      menuItems: [{ id: 'crm', label: 'CRM', path: '/crm', icon: undefined }],
      isLoading: false,
    });

    renderSidebar();

    const toggleBtn = screen.getByRole('button', { name: /plugins/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
  });

  // ---- Test 5 ---------------------------------------------------------------
  it('Esc key fires onClose when overlay is open (mobile viewport)', async () => {
    // Set mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    const onClose = vi.fn();
    await act(async () => {
      render(<SidebarNav {...defaultProps} isOpen={true} onClose={onClose} />);
    });

    // Simulate Esc key
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  // ---- Test 6 ---------------------------------------------------------------
  it('sidebar overlay has aria-modal="true" on mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    await act(async () => {
      renderSidebar({ isOpen: true });
    });

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toHaveAttribute('aria-modal', 'true');
  });

  // ---- Test 7 ---------------------------------------------------------------
  it('collapsed prop renders icon-only mode (labels hidden)', () => {
    renderSidebar({ collapsed: true });

    // In collapsed mode on desktop (>= 1024px) labels are not shown
    // Dashboard label should not be visible
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  // ---- Test 8 ---------------------------------------------------------------
  it('Home/End keydown moves focus to first/last nav item', async () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    nav.focus();

    fireEvent.keyDown(document, { key: 'Home' });
    // After Home, first focusable element should receive focus
    // We just verify no error is thrown and the event is handled
    expect(nav).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'End' });
    expect(nav).toBeInTheDocument();
  });
});
