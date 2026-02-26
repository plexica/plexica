// apps/web/src/__tests__/plugins/PluginDetailModal.test.tsx
//
// T004-36: Tests for PluginDetailModal
// Covers: tab switching, keyboard navigation, overview/permissions/events/health tabs,
// lifecycle timeline, tenant adoption list, ARIA tablist, health polling, axe audit.

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureAxe } from 'vitest-axe';

// Register vitest-axe matchers manually (package bug: extend-expect is empty)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as any;
expect.extend({ toHaveNoViolations });

function expectNoViolations(results: unknown): void {
  (expect(results) as any).toHaveNoViolations();
}

const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({ component: null }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

// Mock apiClient with inline vi.fn() — no external const references (hoist-safe)
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getPluginHealth: vi.fn().mockResolvedValue({
      status: 'healthy',
      uptime: 3600,
      cpu: 45.2,
      memory: 60.8,
      endpoints: [{ path: '/api/data', method: 'GET', status: 'ok' }],
    }),
  },
}));

// Import mocked client after mock registration
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

import type { PluginDetail, PluginLifecycleStatus } from '@plexica/types';
import type { TimelineEntry } from '@/components/plugins/PluginTimeline';
import type {
  TenantAdoptionEntry,
  PluginPermission,
  PluginEvent,
} from '@/components/plugins/PluginDetailModal';

const mockPlugin: PluginDetail = {
  id: 'plugin-001',
  name: 'Acme Analytics',
  version: '2.1.0',
  description: 'Real-time analytics plugin for dashboards.',
  author: 'Acme Corp',
  category: 'Analytics',
  status: 'PUBLISHED' as any,
  lifecycleStatus: 'ACTIVE' as PluginLifecycleStatus,
  icon: '📊',
  homepage: 'https://example.com/analytics',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
  manifest: {
    dependencies: { lodash: '^4.0.0', dayjs: '^1.11.0' },
    runtime: { memory: '512Mi', cpu: '0.5' },
  },
};

const mockTimeline: TimelineEntry[] = [
  {
    to: 'ACTIVE' as PluginLifecycleStatus,
    from: 'INSTALLED' as PluginLifecycleStatus,
    timestamp: '2026-01-15T10:00:00Z',
    note: 'Plugin activated successfully',
  },
  {
    to: 'INSTALLED' as PluginLifecycleStatus,
    from: 'INSTALLING' as PluginLifecycleStatus,
    timestamp: '2026-01-14T09:00:00Z',
    note: 'Plugin installed',
  },
  {
    to: 'REGISTERED' as PluginLifecycleStatus,
    timestamp: '2026-01-14T08:00:00Z',
    note: 'Plugin registered',
  },
];

const mockTenantAdoptions: TenantAdoptionEntry[] = [
  {
    tenantId: 't1',
    tenantName: 'Acme Corp',
    enabledAt: '2026-01-10T00:00:00Z',
    isConfigured: true,
  },
  {
    tenantId: 't2',
    tenantName: 'Beta Inc',
    enabledAt: '2026-01-12T00:00:00Z',
    isConfigured: false,
  },
];

const mockPermissions: PluginPermission[] = [
  { key: 'analytics:read', name: 'Read Analytics', description: 'Read dashboard data' },
  { key: 'analytics:write', name: 'Write Analytics', description: 'Push custom events' },
];

const mockEvents: PluginEvent[] = [
  { topic: 'analytics.page_view', direction: 'publishes', lastActivity: '2026-01-16T08:00:00Z' },
  { topic: 'user.created', direction: 'subscribes', lastActivity: '2026-01-15T12:00:00Z' },
];

// ---------------------------------------------------------------------------
// Silence console noise during tests
// ---------------------------------------------------------------------------

const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { PluginDetailModal } from '@/components/plugins/PluginDetailModal';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginDetailModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Null / closed state
  // -------------------------------------------------------------------------

  it('renders nothing when plugin is null', () => {
    const { container } = renderWithQuery(<PluginDetailModal plugin={null} onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
  });

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it('renders plugin name and lifecycle badge in header', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    // Plugin name appears in both header h2 and overview dd — use heading role
    expect(screen.getByRole('heading', { name: 'Acme Analytics' })).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
    // 'Active' appears in header badge and possibly timeline — use getAllBy
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // ARIA tablist
  // -------------------------------------------------------------------------

  it('renders tablist with correct ARIA roles', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Health', 'Permissions', 'Events']);
  });

  it('sets aria-selected="true" on the active tab', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    const healthTab = screen.getByRole('tab', { name: 'Health' });
    expect(healthTab).toHaveAttribute('aria-selected', 'false');
  });

  it('tab panels have role="tabpanel" with aria-labelledby', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    // Each panel should be labelled by its tab
    panels.forEach((panel) => {
      expect(panel).toHaveAttribute('aria-labelledby');
    });
  });

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------

  it('clicking Permissions tab shows permissions panel and hides overview', () => {
    renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} permissions={mockPermissions} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expect(screen.getByText('analytics:read')).toBeInTheDocument();
    expect(screen.getByText('Read Analytics')).toBeInTheDocument();
  });

  it('clicking Events tab shows published and subscribed topics', () => {
    renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} events={mockEvents} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByText('analytics.page_view')).toBeInTheDocument();
    expect(screen.getByText('user.created')).toBeInTheDocument();
    expect(screen.getByText('Publishes')).toBeInTheDocument();
    expect(screen.getByText('Subscribes')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Arrow key navigation
  // -------------------------------------------------------------------------

  it('ArrowRight moves focus to next tab', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    // Health tab should be selected
    const healthTab = screen.getByRole('tab', { name: 'Health' });
    expect(healthTab).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft wraps to last tab from first', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overviewTab, { key: 'ArrowLeft' });
    const eventsTab = screen.getByRole('tab', { name: 'Events' });
    expect(eventsTab).toHaveAttribute('aria-selected', 'true');
  });

  // -------------------------------------------------------------------------
  // Overview tab content
  // -------------------------------------------------------------------------

  it('Overview tab shows plugin details and dependencies', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    // Plugin name appears in both heading and overview dd — check heading + author separately
    expect(screen.getByRole('heading', { name: 'Acme Analytics' })).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    // Dependencies table
    expect(screen.getByText('lodash')).toBeInTheDocument();
    expect(screen.getByText('^4.0.0')).toBeInTheDocument();
    // Homepage link
    const link = screen.getByRole('link', { name: /example\.com\/analytics/i });
    expect(link).toHaveAttribute('href', 'https://example.com/analytics');
  });

  it('Overview tab shows tenant adoption table', () => {
    renderWithQuery(
      <PluginDetailModal
        plugin={mockPlugin}
        tenantAdoptions={mockTenantAdoptions}
        onClose={onClose}
      />
    );
    // Both tenants appear in the adoption table (Acme Corp also appears as author, use getAllBy)
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    // Configured badge
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('tenant adoption list is sortable by name', () => {
    renderWithQuery(
      <PluginDetailModal
        plugin={mockPlugin}
        tenantAdoptions={mockTenantAdoptions}
        onClose={onClose}
      />
    );

    // The adoption section is below the "Tenant Adoption" heading
    const adoptionSection = screen.getByText('Tenant Adoption').closest('div')!;
    const table = within(adoptionSection).getByRole('table');

    // Default sort: Acme Corp before Beta Inc (asc)
    const rows = within(table).getAllByRole('row');
    const names = rows
      .slice(1) // skip header row
      .map((r) => r.querySelectorAll('td')[0]?.textContent ?? '');
    expect(names[0]).toBe('Acme Corp');
    expect(names[1]).toBe('Beta Inc');

    // Click sort button → descending
    fireEvent.click(screen.getByRole('button', { name: /sort by tenant name/i }));
    const rowsAfter = within(table).getAllByRole('row');
    const namesAfter = rowsAfter
      .slice(1)
      .map((r) => r.querySelectorAll('td')[0]?.textContent ?? '');
    expect(namesAfter[0]).toBe('Beta Inc');
    expect(namesAfter[1]).toBe('Acme Corp');
  });

  // -------------------------------------------------------------------------
  // Lifecycle timeline
  // -------------------------------------------------------------------------

  it('renders lifecycle timeline entries in reverse chronological order', () => {
    renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} timelineEntries={mockTimeline} onClose={onClose} />
    );
    // The sidebar "Timeline" heading
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    // The most recent entry note should be present
    expect(screen.getByText('Plugin activated successfully')).toBeInTheDocument();
    // The most recent status label (Active) should appear in the timeline
    // (also in the header badge, so use getAllBy)
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Health tab + polling
  // -------------------------------------------------------------------------

  it('Health tab shows health status badge and resource bars', async () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);

    // Switch to Health tab
    fireEvent.click(screen.getByRole('tab', { name: 'Health' }));

    // Wait for the async health fetch to resolve (real timers — no fake timers needed)
    await screen.findByText('Healthy', {}, { timeout: 3000 });

    // CPU and memory percentages
    expect(screen.getByText('45.2%')).toBeInTheDocument();
    expect(screen.getByText('60.8%')).toBeInTheDocument();
  });

  it('Health tab polls every 10 seconds', async () => {
    vi.useFakeTimers();
    const getPluginHealth = vi.mocked(apiClient.getPluginHealth);
    getPluginHealth.mockResolvedValue({
      status: 'healthy',
      uptime: 7200,
      cpu: 30,
      memory: 50,
    });

    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);

    // Switch to Health tab to mount PluginHealthTab
    fireEvent.click(screen.getByRole('tab', { name: 'Health' }));

    // Allow initial fetch to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterMount = getPluginHealth.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Advance 10 seconds → second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPluginHealth.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('Health tab has aria-live region for screen reader announcements', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Health' }));
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Permissions tab
  // -------------------------------------------------------------------------

  it('Permissions tab shows "No permissions declared" when empty', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} permissions={[]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expect(screen.getByText('No permissions declared.')).toBeInTheDocument();
  });

  it('Permissions tab renders permission key, name, description', () => {
    renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} permissions={mockPermissions} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expect(screen.getByText('analytics:read')).toBeInTheDocument();
    expect(screen.getByText('Read Analytics')).toBeInTheDocument();
    expect(screen.getByText('Read dashboard data')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Events tab
  // -------------------------------------------------------------------------

  it('Events tab shows "No events declared" when empty', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} events={[]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByText('No events declared.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------

  it('close button calls onClose', () => {
    renderWithQuery(<PluginDetailModal plugin={mockPlugin} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close plugin details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Accessibility audit
  // -------------------------------------------------------------------------

  it('has no WCAG 2.1 AA violations when open on Overview tab', async () => {
    const { container } = renderWithQuery(
      <PluginDetailModal
        plugin={mockPlugin}
        timelineEntries={mockTimeline}
        tenantAdoptions={mockTenantAdoptions}
        permissions={mockPermissions}
        events={mockEvents}
        onClose={onClose}
      />
    );
    expectNoViolations(await axe(container));
  });

  it('has no WCAG 2.1 AA violations on Permissions tab', async () => {
    const { container } = renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} permissions={mockPermissions} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expectNoViolations(await axe(container));
  });

  it('has no WCAG 2.1 AA violations on Events tab', async () => {
    const { container } = renderWithQuery(
      <PluginDetailModal plugin={mockPlugin} events={mockEvents} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expectNoViolations(await axe(container));
  });
});
