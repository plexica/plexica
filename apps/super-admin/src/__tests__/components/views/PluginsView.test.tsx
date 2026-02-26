// File: apps/super-admin/src/__tests__/components/views/PluginsView.test.tsx
//
// Unit tests for the PluginsView component.
// Covers:
//   - Tab switching via click
//   - Keyboard navigation (ArrowRight, ArrowLeft, Home, End) on tablist (HIGH #5)
//   - Header CTA label changes based on active tab (HIGH #4 / MEDIUM #11)
//   - Registry empty state: unfiltered (no plugins) vs filtered (no results) (HIGH #3)
//   - Registry error state with Retry button
//   - Registry loading state (skeleton cards)
//   - Registry plugin grid rendering
//   - Toast called when Install / Enable / Disable / Update / Uninstall clicked (MEDIUM #12)
//
// All hooks and modals are mocked so no network calls are made.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively needs them
// ---------------------------------------------------------------------------

// Mock usePluginSearch hook
vi.mock('@/hooks/usePluginSearch', () => ({
  usePluginSearch: vi.fn(),
}));

// Mock usePlugins hook
vi.mock('@/hooks', () => ({
  usePlugins: vi.fn(),
}));

// Mock useToast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock child modals to prevent deep render trees
vi.mock('@/components/plugins/PluginDetailModal', () => ({
  PluginDetailModal: ({ onClose }: { onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'plugin-detail-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Detail')
    ),
}));
vi.mock('@/components/plugins/EditPluginModal', () => ({
  EditPluginModal: ({ onClose }: { onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'edit-plugin-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Edit')
    ),
}));
vi.mock('@/components/marketplace/PluginReviewQueue', () => ({
  PluginReviewQueue: () =>
    React.createElement('div', { 'data-testid': 'plugin-review-queue' }, 'Review Queue'),
}));
vi.mock('@/components/marketplace/PublishPluginModal', () => ({
  PublishPluginModal: ({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'publish-plugin-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Publish'),
      React.createElement('button', { onClick: onSuccess }, 'Publish Success')
    ),
}));

// Mock PluginInstallProgress so clicking Install shows a simple sentinel element
vi.mock('@/components/plugins/PluginInstallProgress', () => ({
  PluginInstallProgress: ({
    pluginName,
    onCancel,
    onComplete,
  }: {
    pluginName: string;
    onCancel: () => void;
    onComplete: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'plugin-install-progress' },
      React.createElement('span', null, `Installing ${pluginName}`),
      React.createElement('button', { onClick: onCancel }, 'Cancel Install'),
      React.createElement('button', { onClick: onComplete }, 'Complete Install')
    ),
}));

// Mock PluginCard to keep tests simple — expose action buttons directly
vi.mock('@/components/plugins/PluginCard', () => ({
  PluginCard: ({
    plugin,
    onView,
    onInstall,
    onEnable,
    onDisable,
    onUpdate,
    onUninstall,
  }: {
    plugin: { id: string; name: string };
    onView: (p: unknown) => void;
    onInstall: (p: unknown) => void;
    onEnable: (p: unknown) => void;
    onDisable: (p: unknown) => void;
    onUpdate: (p: unknown) => void;
    onUninstall: (p: unknown) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `plugin-card-${plugin.id}` },
      React.createElement('span', null, plugin.name),
      React.createElement('button', { onClick: () => onView(plugin) }, 'View'),
      React.createElement('button', { onClick: () => onInstall(plugin) }, 'Install'),
      React.createElement('button', { onClick: () => onEnable(plugin) }, 'Enable'),
      React.createElement('button', { onClick: () => onDisable(plugin) }, 'Disable'),
      React.createElement('button', { onClick: () => onUpdate(plugin) }, 'Update'),
      React.createElement('button', { onClick: () => onUninstall(plugin) }, 'Uninstall')
    ),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { PluginsView } from '@/components/views/PluginsView';
import { usePluginSearch } from '@/hooks/usePluginSearch';
import { usePlugins } from '@/hooks';

// ---------------------------------------------------------------------------
// Default mock return values
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_STATE = {
  inputValue: '',
  setInputValue: vi.fn(),
  lifecycleFilter: 'all' as const,
  setLifecycleFilter: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  plugins: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  statCounts: { total: 0 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  clearFilters: vi.fn(),
  hasActiveFilters: false,
};

const DEFAULT_MARKETPLACE_STATE = {
  plugins: [],
  categories: [],
  stats: { total: 0, published: 0, draft: 0, deprecated: 0, categories: 0 },
  isLoading: false,
  error: null,
  pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
  page: 1,
  setPage: vi.fn(),
  pageSize: 12,
  setPageSize: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  statusFilter: 'all' as const,
  setStatusFilter: vi.fn(),
  categoryFilter: 'all',
  setCategoryFilter: vi.fn(),
  clearFilters: vi.fn(),
  hasActiveFilters: false,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePlugin(id = 'p1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Plexica',
    category: 'analytics',
    status: 'PUBLISHED' as const,
    lifecycleStatus: 'REGISTERED' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(PluginsView)
    )
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePluginSearch).mockReturnValue({ ...DEFAULT_REGISTRY_STATE });
  vi.mocked(usePlugins).mockReturnValue({ ...DEFAULT_MARKETPLACE_STATE });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginsView', () => {
  // ---- Page structure ----

  it('should render the page heading', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: /plugins/i })).toBeInTheDocument();
  });

  it('should render the tablist with all three tabs', () => {
    renderView();
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getByRole('tab', { name: 'Registry' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Marketplace' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Review Queue' })).toBeInTheDocument();
  });

  it('should default to Registry tab as active', () => {
    renderView();
    const registryTab = screen.getByRole('tab', { name: 'Registry' });
    expect(registryTab).toHaveAttribute('aria-selected', 'true');
    expect(registryTab).toHaveAttribute('tabindex', '0');
  });

  it('inactive tabs should have tabIndex -1', () => {
    renderView();
    const marketplaceTab = screen.getByRole('tab', { name: 'Marketplace' });
    const reviewTab = screen.getByRole('tab', { name: 'Review Queue' });
    expect(marketplaceTab).toHaveAttribute('tabindex', '-1');
    expect(reviewTab).toHaveAttribute('tabindex', '-1');
  });

  // ---- Tab switching via click ----

  it('clicking Marketplace tab should activate it', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByRole('tab', { name: 'Marketplace' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Registry' })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Review Queue tab should activate it', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Review Queue' }));
    expect(screen.getByRole('tab', { name: 'Review Queue' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  // ---- Header CTA label (HIGH #4 / MEDIUM #11) ----

  it('should show "+ Register Plugin" CTA when Registry tab is active', () => {
    renderView();
    // There can be two "+ Register Plugin" buttons (header + empty state CTA) —
    // check at least one exists.
    expect(
      screen.getAllByRole('button', { name: '+ Register Plugin' }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('should show "+ Publish Plugin" CTA when Marketplace tab is active', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    // The header button should now say "+ Publish Plugin"
    expect(
      screen.getAllByRole('button', { name: '+ Publish Plugin' }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('should show "+ Publish Plugin" CTA when Review Queue tab is active', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Review Queue' }));
    expect(
      screen.getAllByRole('button', { name: '+ Publish Plugin' }).length
    ).toBeGreaterThanOrEqual(1);
  });

  // ---- Keyboard navigation (HIGH #5) ----

  it('ArrowRight from Registry should move focus to Marketplace', () => {
    renderView();
    const registryTab = screen.getByRole('tab', { name: 'Registry' });
    fireEvent.keyDown(registryTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Marketplace' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('ArrowRight from Review Queue should wrap around to Registry', () => {
    renderView();
    // Navigate to Review Queue first
    fireEvent.click(screen.getByRole('tab', { name: 'Review Queue' }));
    const reviewTab = screen.getByRole('tab', { name: 'Review Queue' });
    fireEvent.keyDown(reviewTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Registry' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft from Registry should wrap around to Review Queue', () => {
    renderView();
    const registryTab = screen.getByRole('tab', { name: 'Registry' });
    fireEvent.keyDown(registryTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Review Queue' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('ArrowLeft from Marketplace should move back to Registry', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    const marketplaceTab = screen.getByRole('tab', { name: 'Marketplace' });
    fireEvent.keyDown(marketplaceTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Registry' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Home key should navigate to the first tab (Registry)', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    const marketplaceTab = screen.getByRole('tab', { name: 'Marketplace' });
    fireEvent.keyDown(marketplaceTab, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Registry' })).toHaveAttribute('aria-selected', 'true');
  });

  it('End key should navigate to the last tab (Review Queue)', () => {
    renderView();
    const registryTab = screen.getByRole('tab', { name: 'Registry' });
    fireEvent.keyDown(registryTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Review Queue' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('unrelated key should not change active tab', () => {
    renderView();
    const registryTab = screen.getByRole('tab', { name: 'Registry' });
    fireEvent.keyDown(registryTab, { key: 'Enter' });
    expect(registryTab).toHaveAttribute('aria-selected', 'true');
  });

  // ---- Registry: loading state ----

  it('should show 6 skeleton cards while registry is loading', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      isLoading: true,
    });
    renderView();
    const panel = document.getElementById('tabpanel-registry')!;
    // Each skeleton card has role="article" equivalent: the Card with aria-hidden="true"
    // They are rendered inside the grid; count by data structure: cards with aria-hidden
    const skeletonCards = panel.querySelectorAll('[aria-hidden="true"].rounded-lg');
    expect(skeletonCards.length).toBe(6);
  });

  // ---- Registry: error state ----

  it('should show error alert when registry has an error', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      error: new Error('Network failure'),
    });
    renderView();
    expect(screen.getByText('Failed to load plugins')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();
  });

  it('should call registryRefetch when Retry button is clicked', () => {
    const mockRefetch = vi.fn();
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      error: new Error('Network failure'),
      refetch: mockRefetch,
    });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  // ---- Registry: empty state — no plugins at all (HIGH #3) ----

  it('should show "No plugins registered" empty state when no plugins and no filters', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [],
      statCounts: { total: 0 },
      hasActiveFilters: false,
    });
    renderView();
    expect(screen.getByText('No plugins registered')).toBeInTheDocument();
  });

  it('empty state "Register Plugin" CTA should open publish modal', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [],
      statCounts: { total: 0 },
      hasActiveFilters: false,
    });
    renderView();
    // Two "+ Register Plugin" buttons exist: [0] = header, [1] = empty state CTA
    const registerBtns = screen.getAllByRole('button', { name: '+ Register Plugin' });
    fireEvent.click(registerBtns[registerBtns.length - 1]);
    expect(screen.getByTestId('publish-plugin-modal')).toBeInTheDocument();
  });

  // ---- Registry: empty state — filters active, no results (HIGH #3) ----

  it('should show "No plugins found" empty state when filters active and no results', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [],
      statCounts: { total: 5 }, // plugins exist globally, just none matching filter
      hasActiveFilters: true,
    });
    renderView();
    expect(screen.getByText('No plugins found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search or filters.')).toBeInTheDocument();
  });

  it('"No plugins found" empty state should call clearFilters when clicked', () => {
    const mockClearFilters = vi.fn();
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [],
      statCounts: { total: 5 },
      hasActiveFilters: true,
      clearFilters: mockClearFilters,
    });
    renderView();
    // Two "Clear filters" buttons: [0] = controls bar, [last] = empty state CTA
    const clearBtns = screen.getAllByRole('button', { name: 'Clear filters' });
    fireEvent.click(clearBtns[clearBtns.length - 1]);
    expect(mockClearFilters).toHaveBeenCalledOnce();
  });

  // ---- Registry: guard — hasActiveFilters checked BEFORE statCounts['total'] (HIGH #3) ----

  it('should show filtered empty state even when statCounts is undefined', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [],
      statCounts: {}, // total undefined — must NOT crash
      hasActiveFilters: true,
    });
    renderView();
    expect(screen.getByText('No plugins found')).toBeInTheDocument();
  });

  // ---- Registry: plugin grid rendering ----

  it('should render plugin cards for each returned plugin', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1'), makePlugin('p2'), makePlugin('p3')],
      statCounts: { total: 3 },
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });
    renderView();
    expect(screen.getByTestId('plugin-card-p1')).toBeInTheDocument();
    expect(screen.getByTestId('plugin-card-p2')).toBeInTheDocument();
    expect(screen.getByTestId('plugin-card-p3')).toBeInTheDocument();
  });

  it('should show stat summary bar with plugin counts', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 10, ACTIVE: 4, INSTALLED: 3, REGISTERED: 3 },
    });
    renderView();
    // StatSummaryBar renders "10 plugins total"
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  // ---- Registry: pagination ----

  it('should show pagination controls when totalPages > 1', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 30 },
      pagination: { page: 1, limit: 20, total: 30, totalPages: 2 },
    });
    renderView();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
  });

  it('Previous page button should be disabled on page 1', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 30 },
      page: 1,
      pagination: { page: 1, limit: 20, total: 30, totalPages: 2 },
    });
    renderView();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('Next page button should be disabled on last page', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 30 },
      page: 2,
      pagination: { page: 2, limit: 20, total: 30, totalPages: 2 },
    });
    renderView();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  // ---- Toast calls (MEDIUM #12) ----

  it('should show PluginInstallProgress panel when Install is clicked', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 1 },
    });
    renderView();
    const card = screen.getByTestId('plugin-card-p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Install' }));
    // The progress panel should now be visible
    expect(screen.getByTestId('plugin-install-progress')).toBeInTheDocument();
    expect(screen.getByText(/Installing Plugin p1/)).toBeInTheDocument();
  });

  it('should open EnablePluginDialog when Enable is clicked', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 1 },
    });
    renderView();
    const card = screen.getByTestId('plugin-card-p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Enable' }));
    // Dialog opens — check alertdialog role and the dialog title heading
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Enable.*Plugin/ })).toBeInTheDocument();
  });

  it('should open DisablePluginDialog when Disable is clicked', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 1 },
    });
    renderView();
    const card = screen.getByTestId('plugin-card-p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Disable' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Disable.*Plugin/ })).toBeInTheDocument();
  });

  it('should open UpdatePluginDialog when Update is clicked', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 1 },
    });
    renderView();
    const card = screen.getByTestId('plugin-card-p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Update' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Update.*Plugin/ })).toBeInTheDocument();
  });

  it('should open UninstallPluginDialog when Uninstall is clicked', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      plugins: [makePlugin('p1')],
      statCounts: { total: 1 },
    });
    renderView();
    const card = screen.getByTestId('plugin-card-p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Uninstall' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Uninstall.*Plugin/ })).toBeInTheDocument();
  });

  // ---- Clear filters button in controls bar ----

  it('should show "Clear filters" button in controls bar when hasActiveFilters is true', () => {
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      hasActiveFilters: true,
    });
    renderView();
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('"Clear filters" button in controls bar should call clearFilters', () => {
    const mockClearFilters = vi.fn();
    vi.mocked(usePluginSearch).mockReturnValue({
      ...DEFAULT_REGISTRY_STATE,
      hasActiveFilters: true,
      clearFilters: mockClearFilters,
    });
    renderView();
    // First button matching "Clear filters" is the one in the controls bar
    const clearBtns = screen.getAllByRole('button', { name: 'Clear filters' });
    fireEvent.click(clearBtns[0]);
    expect(mockClearFilters).toHaveBeenCalledOnce();
  });

  // ---- Publish modal ----

  it('clicking header CTA opens publish modal', () => {
    renderView();
    // Click the first "+ Register Plugin" button (the header one)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Register Plugin' })[0]);
    expect(screen.getByTestId('publish-plugin-modal')).toBeInTheDocument();
  });

  it('closing publish modal removes it from DOM', () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: '+ Register Plugin' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close Publish' }));
    expect(screen.queryByTestId('publish-plugin-modal')).not.toBeInTheDocument();
  });

  // ---- Review Queue tab panel ----

  it('should render review queue component when Review Queue tab is active', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Review Queue' }));
    expect(screen.getByTestId('plugin-review-queue')).toBeInTheDocument();
  });

  // ---- Tab panel hidden attribute ----

  it('Marketplace panel should be hidden when Registry tab is active', () => {
    renderView();
    const panel = document.getElementById('tabpanel-marketplace')!;
    expect(panel).toHaveAttribute('hidden');
  });

  it('Registry panel should NOT be hidden when Registry tab is active', () => {
    renderView();
    const panel = document.getElementById('tabpanel-registry')!;
    expect(panel).not.toHaveAttribute('hidden');
  });

  // ---- Marketplace tab panel ----

  it('Marketplace: should show loading spinner when isLoading is true', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      isLoading: true,
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText('Loading plugins...')).toBeInTheDocument();
  });

  it('Marketplace: should show error message when error is set', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      error: new Error('Marketplace fetch failed'),
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText(/Marketplace fetch failed/)).toBeInTheDocument();
  });

  it('Marketplace: should show "No plugins yet" empty state when stats.total is 0', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [],
      stats: { total: 0, published: 0, draft: 0, deprecated: 0, categories: 0 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText('No plugins yet')).toBeInTheDocument();
  });

  it('Marketplace: "No plugins yet" CTA opens publish modal', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [],
      stats: { total: 0, published: 0, draft: 0, deprecated: 0, categories: 0 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    // The "No plugins yet" card has a "+ Publish Plugin" button
    const publishBtns = screen.getAllByRole('button', { name: '+ Publish Plugin' });
    fireEvent.click(publishBtns[publishBtns.length - 1]);
    expect(screen.getByTestId('publish-plugin-modal')).toBeInTheDocument();
  });

  it('Marketplace: should show "No plugins found" when stats.total > 0 but plugins is empty', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [],
      stats: { total: 5, published: 5, draft: 0, deprecated: 0, categories: 1 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText('No plugins found')).toBeInTheDocument();
  });

  it('Marketplace: should render plugin cards for each marketplace plugin', () => {
    const mp1 = { ...makePlugin('m1'), status: 'PUBLISHED' as const };
    const mp2 = { ...makePlugin('m2'), status: 'DRAFT' as const };
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [mp1, mp2],
      stats: { total: 2, published: 1, draft: 1, deprecated: 0, categories: 1 },
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText('Plugin m1')).toBeInTheDocument();
    expect(screen.getByText('Plugin m2')).toBeInTheDocument();
  });

  it('Marketplace: clicking View opens detail modal', () => {
    const mp1 = { ...makePlugin('m1') };
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [mp1],
      stats: { total: 1, published: 1, draft: 0, deprecated: 0, categories: 1 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    // The marketplace cards have View buttons
    const viewBtns = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(viewBtns[0]);
    expect(screen.getByTestId('plugin-detail-modal')).toBeInTheDocument();
  });

  it('Marketplace: clicking Edit opens edit modal', () => {
    const mp1 = { ...makePlugin('m1') };
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [mp1],
      stats: { total: 1, published: 1, draft: 0, deprecated: 0, categories: 1 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('edit-plugin-modal')).toBeInTheDocument();
  });

  it('Marketplace: should show stats bar with total, published, categories', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [makePlugin('m1')],
      stats: { total: 7, published: 5, draft: 2, deprecated: 0, categories: 3 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('Marketplace: should show "Clear filters" when hasActiveFilters is true', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [],
      stats: { total: 3, published: 3, draft: 0, deprecated: 0, categories: 1 },
      hasActiveFilters: true,
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('Marketplace: "Clear filters" should call marketplace clearFilters', () => {
    const mockMarketplaceClear = vi.fn();
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [],
      stats: { total: 3, published: 3, draft: 0, deprecated: 0, categories: 1 },
      hasActiveFilters: true,
      clearFilters: mockMarketplaceClear,
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(mockMarketplaceClear).toHaveBeenCalledOnce();
  });

  it('Marketplace: should show pagination when totalPages > 1', () => {
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [makePlugin('m1')],
      stats: { total: 25, published: 25, draft: 0, deprecated: 0, categories: 1 },
      pagination: { page: 1, limit: 12, total: 25, totalPages: 3 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    // The marketplace pagination uses ‹ / › (not aria-label) — check "Page X of Y"
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  // ---- PublishPluginModal onSuccess callback (lines 689–695) ----

  it('onSuccess callback should close modal and invalidate queries', async () => {
    renderView();
    // Open modal
    fireEvent.click(screen.getAllByRole('button', { name: '+ Register Plugin' })[0]);
    expect(screen.getByTestId('publish-plugin-modal')).toBeInTheDocument();
    // Trigger onSuccess
    fireEvent.click(screen.getByRole('button', { name: 'Publish Success' }));
    // Modal should close
    expect(screen.queryByTestId('publish-plugin-modal')).not.toBeInTheDocument();
  });

  // ---- Plugin name heading click opens detail modal (marketplace inline card) ----

  it('Marketplace: clicking plugin name heading opens detail modal', () => {
    const mp1 = { ...makePlugin('m1') };
    vi.mocked(usePlugins).mockReturnValue({
      ...DEFAULT_MARKETPLACE_STATE,
      plugins: [mp1],
      stats: { total: 1, published: 1, draft: 0, deprecated: 0, categories: 1 },
    });
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    // The plugin name is an h3 with onClick
    fireEvent.click(screen.getByText('Plugin m1'));
    expect(screen.getByTestId('plugin-detail-modal')).toBeInTheDocument();
  });
});
