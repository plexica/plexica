// File: apps/super-admin/src/__tests__/components/AdminSidebarNav.test.tsx
//
// Unit tests for the AdminSidebarNav component (Spec 008 T008-40).
// Covers:
//   - Renders nav items with correct labels and icons
//   - Active item receives aria-current="page" and left-border style
//   - Skip-nav link is present in the DOM
//   - Badge renders with correct aria-label when provided
//   - onToggle callback fires when close button is clicked (mobile)
//   - Mobile overlay (role="dialog") renders when collapsed=false
//   - Escape key fires onToggle to close the mobile overlay
//   - Clicking the backdrop fires onToggle
//   - ArrowDown moves DOM focus to the next nav item (roving tabindex)
//   - ArrowUp moves DOM focus to the previous nav item
//   - Home / End jump to first / last item
//
// All @tanstack/react-router hooks are mocked at the module level.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mocks — declared before the component import
// ---------------------------------------------------------------------------

// Mock useLocation so we can control the active path
const mockPathname = vi.fn(() => '/');

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: mockPathname() }),
  // Link renders as a plain <a>. Must use forwardRef so the component's
  // callback refs (itemRefs.current[index]) are populated in jsdom.
  Link: React.forwardRef(
    (
      props: {
        to?: string;
        tabIndex?: number;
        'aria-current'?: string;
        onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
        className?: string;
        children?: React.ReactNode;
      },
      ref: React.Ref<HTMLAnchorElement>
    ) => {
      const { to, children, tabIndex, 'aria-current': ariaCurrent, onFocus, className } = props;
      return React.createElement(
        'a',
        {
          href: to,
          tabIndex,
          'aria-current': ariaCurrent,
          onFocus,
          className,
          ref,
        },
        children
      );
    }
  ),
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { AdminSidebarNav, type NavItem } from '@/components/AdminSidebarNav';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal LucideIcon stub — renders an SVG with a data-testid. */
const MockIcon = ({ className }: { className?: string }) =>
  React.createElement('svg', { 'data-testid': 'mock-icon', className, 'aria-hidden': 'true' });

const mockNavItems: NavItem[] = [
  { label: 'Dashboard', icon: MockIcon as unknown as LucideIcon, path: '/super-admin' },
  { label: 'Tenants', icon: MockIcon as unknown as LucideIcon, path: '/super-admin/tenants' },
  {
    label: 'Plugins',
    icon: MockIcon as unknown as LucideIcon,
    path: '/super-admin/plugins',
    badge: 3,
  },
  { label: 'Users', icon: MockIcon as unknown as LucideIcon, path: '/super-admin/users' },
];

interface RenderOptions {
  collapsed?: boolean;
  pathname?: string;
  onToggle?: () => void;
}

function renderNav(options: RenderOptions = {}) {
  const { collapsed = true, pathname = '/super-admin', onToggle = vi.fn() } = options;
  mockPathname.mockReturnValue(pathname);

  return render(
    React.createElement(AdminSidebarNav, {
      navItems: mockNavItems,
      collapsed,
      onToggle,
      portalLabel: 'Super Admin Navigation',
    })
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname.mockReturnValue('/super-admin');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminSidebarNav', () => {
  // ── Structure ──────────────────────────────────────────────────────────────

  it('should render a <nav> element with the provided aria-label', () => {
    renderNav();
    // Two nav elements exist (desktop + mobile copies); check at least one
    const navs = screen.getAllByRole('navigation', { name: 'Super Admin Navigation' });
    expect(navs.length).toBeGreaterThanOrEqual(1);
  });

  it('should render all nav item labels', () => {
    renderNav();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Tenants').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Plugins').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Users').length).toBeGreaterThanOrEqual(1);
  });

  // ── Skip-nav link ──────────────────────────────────────────────────────────

  it('should render a skip-nav link targeting #main-content', () => {
    renderNav();
    // There are two copies of navContent (desktop + mobile).
    // At least one skip-nav link must be present.
    const skipLinks = screen.getAllByText('Skip to main content');
    expect(skipLinks.length).toBeGreaterThanOrEqual(1);
    // The first skip-nav link points to #main-content
    expect(skipLinks[0].closest('a')).toHaveAttribute('href', '#main-content');
  });

  // ── Active item ────────────────────────────────────────────────────────────

  it('active item should have aria-current="page"', () => {
    // pathname = '/super-admin' → "Dashboard" item (exact '/' match excluded; startsWith check)
    renderNav({ pathname: '/super-admin/tenants' });
    const currentLinks = screen.getAllByRole('link', { name: /Tenants/i });
    // At least one link has aria-current="page"
    expect(currentLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('inactive items should NOT have aria-current', () => {
    renderNav({ pathname: '/super-admin' });
    const tenantLinks = screen.getAllByRole('link', { name: /Tenants/i });
    // All tenant links should not have aria-current="page"
    expect(tenantLinks.every((link) => link.getAttribute('aria-current') !== 'page')).toBe(true);
  });

  it('active item should have border-l-4 and admin-nav-active-border in className', () => {
    renderNav({ pathname: '/super-admin/tenants' });
    const currentLinks = screen.getAllByRole('link', { name: /Tenants/i });
    const activeLink = currentLinks.find((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeDefined();
    expect(activeLink!.className).toContain('border-l-4');
    expect(activeLink!.className).toContain('--admin-nav-active-border');
  });

  // ── Badge ──────────────────────────────────────────────────────────────────

  it('should render badge with correct aria-label when badge is provided', () => {
    renderNav();
    // badge=3 on "Plugins"
    const badges = screen.getAllByLabelText('3 notifications');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toHaveTextContent('3');
  });

  it('should NOT render a badge when badge is 0', () => {
    const itemsWithZeroBadge: NavItem[] = [
      {
        label: 'Dashboard',
        icon: MockIcon as unknown as LucideIcon,
        path: '/super-admin',
        badge: 0,
      },
    ];
    render(
      React.createElement(AdminSidebarNav, {
        navItems: itemsWithZeroBadge,
        collapsed: true,
        onToggle: vi.fn(),
        portalLabel: 'Test Nav',
      })
    );
    expect(screen.queryByLabelText(/notifications/i)).not.toBeInTheDocument();
  });

  // ── Mobile overlay (collapsed=false) ─────────────────────────────────────

  it('should render mobile overlay dialog when collapsed=false', () => {
    renderNav({ collapsed: false });
    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();
  });

  it('should NOT render mobile overlay when collapsed=true', () => {
    renderNav({ collapsed: true });
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  it('mobile overlay should have aria-modal="true"', () => {
    renderNav({ collapsed: false });
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  // ── onToggle callbacks ─────────────────────────────────────────────────────

  it('clicking the close button in the mobile overlay should call onToggle', () => {
    const onToggle = vi.fn();
    renderNav({ collapsed: false, onToggle });
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop should call onToggle', () => {
    const onToggle = vi.fn();
    renderNav({ collapsed: false, onToggle });
    // The backdrop is an aria-hidden div directly inside the dialog
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    // The backdrop is the first child div with aria-hidden="true"
    const backdrop = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  // ── Escape key ─────────────────────────────────────────────────────────────

  it('pressing Escape should call onToggle to close the mobile overlay', () => {
    const onToggle = vi.fn();
    renderNav({ collapsed: false, onToggle });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('pressing Escape when overlay is closed (collapsed=true) should NOT call onToggle', () => {
    const onToggle = vi.fn();
    renderNav({ collapsed: true, onToggle });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onToggle).not.toHaveBeenCalled();
  });

  // ── Keyboard navigation (roving tabindex) ─────────────────────────────────

  it('ArrowDown on the list should move focus to the next item', () => {
    renderNav({ pathname: '/super-admin' });
    // Get the desktop nav's <ul role="list">
    const lists = screen.getAllByRole('list');
    // Focus the first link manually, then fire ArrowDown on the list
    const desktopLinks = lists[0].querySelectorAll('a');
    desktopLinks[0].focus();
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    // After ArrowDown, second link (index 1) should be focused
    expect(document.activeElement).toBe(desktopLinks[1]);
  });

  it('ArrowUp on the list should move focus to the previous item', () => {
    renderNav({ pathname: '/super-admin' });
    const lists = screen.getAllByRole('list');
    const desktopLinks = lists[0].querySelectorAll('a');
    // Start at index 0 (Dashboard is active, focusedIndexRef initialised to 0).
    // ArrowDown → index 1 (Tenants), ArrowDown → index 2 (Plugins),
    // ArrowUp → index 1 (Tenants) — "back one from where we were".
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    fireEvent.keyDown(lists[0], { key: 'ArrowUp' });
    // Should be back one from index 2 → index 1 (Tenants)
    expect(document.activeElement).toBe(desktopLinks[1]);
  });

  it('Home key should move focus to the first item', () => {
    renderNav({ pathname: '/super-admin' });
    const lists = screen.getAllByRole('list');
    const desktopLinks = lists[0].querySelectorAll('a');
    desktopLinks[2].focus();
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    fireEvent.keyDown(lists[0], { key: 'Home' });
    expect(document.activeElement).toBe(desktopLinks[0]);
  });

  it('End key should move focus to the last item', () => {
    renderNav({ pathname: '/super-admin' });
    const lists = screen.getAllByRole('list');
    const desktopLinks = lists[0].querySelectorAll('a');
    desktopLinks[0].focus();
    fireEvent.keyDown(lists[0], { key: 'End' });
    expect(document.activeElement).toBe(desktopLinks[desktopLinks.length - 1]);
  });

  it('ArrowDown on the last item should wrap to the first item', () => {
    renderNav({ pathname: '/super-admin' });
    const lists = screen.getAllByRole('list');
    const desktopLinks = lists[0].querySelectorAll('a');
    // Move to last
    fireEvent.keyDown(lists[0], { key: 'End' });
    // One more ArrowDown should wrap
    fireEvent.keyDown(lists[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(desktopLinks[0]);
  });
});
