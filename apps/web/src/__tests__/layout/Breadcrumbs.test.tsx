// apps/web/src/__tests__/layout/Breadcrumbs.test.tsx
//
// T005-02: Unit tests for Breadcrumbs component.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockLocation = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => mockLocation(),
}));

const mockUsePlugins = vi.fn();
vi.mock('../../contexts/PluginContext', () => ({
  usePlugins: () => mockUsePlugins(),
}));

import { Breadcrumbs } from '../../components/Layout/Breadcrumbs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupPlugins(plugins: Array<{ id: string; name: string }> = []) {
  mockUsePlugins.mockReturnValue({
    plugins: plugins.map((p) => ({
      manifest: { id: p.id, name: p.name },
    })),
    menuItems: [],
    isLoading: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Breadcrumbs', () => {
  beforeEach(() => {
    setupPlugins();
  });

  // ---- Test 1 ---------------------------------------------------------------
  it('renders "Home" as first item with link to "/" for any path', () => {
    mockLocation.mockReturnValue({ pathname: '/settings' });
    render(<Breadcrumbs />);

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  // ---- Test 2 ---------------------------------------------------------------
  it('resolves plugin route prefix to plugin display name via PluginContext', () => {
    setupPlugins([{ id: 'crm', name: 'CRM Suite' }]);
    mockLocation.mockReturnValue({ pathname: '/crm/contacts' });
    render(<Breadcrumbs />);

    expect(screen.getByText('CRM Suite')).toBeInTheDocument();
  });

  // ---- Test 3 ---------------------------------------------------------------
  it('last breadcrumb item has aria-current="page" and is not a link', () => {
    mockLocation.mockReturnValue({ pathname: '/settings' });
    render(<Breadcrumbs />);

    const current = screen.getByText('Settings');
    expect(current).toHaveAttribute('aria-current', 'page');
    // Should be a span, not an anchor
    expect(current.tagName.toLowerCase()).toBe('span');
  });

  // ---- Test 4 ---------------------------------------------------------------
  it('overrides prop replaces auto-generated label for specified segment', () => {
    mockLocation.mockReturnValue({ pathname: '/settings/branding' });
    render(<Breadcrumbs overrides={{ branding: 'Brand Settings' }} />);

    expect(screen.getByText('Brand Settings')).toBeInTheDocument();
    // "Branding" (auto-generated) should NOT appear
    expect(screen.queryByText('Branding')).not.toBeInTheDocument();
  });
});
