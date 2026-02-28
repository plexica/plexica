// apps/web/src/__tests__/plugins/ExtensionsPage.test.tsx
//
// T004-37: Tests for ExtensionsPage
// Covers: RBAC guard, loading/error/empty states, toggle on/off, config form
// auto-generation, config validation, config submit, axe accessibility audit.

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
// Mocks — all vi.fn() inline (hoist-safe, no external const refs)
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({ component: null }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getTenantActivePlugins: vi.fn(),
    enableTenantPlugin: vi.fn(),
    disableTenantPlugin: vi.fn(),
    updateTenantPluginConfig: vi.fn(),
  },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'u1', email: 'admin@test.com', name: 'Admin', roles: ['tenant_admin'] },
    tenant: { id: 't1', name: 'Acme', slug: 'acme' },
    isAuthenticated: true,
    isLoading: false,
  })),
}));

vi.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/Layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/components/ToastProvider', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/components/ToastProvider';
import { ExtensionsPage } from '@/routes/extensions';
import type { TenantPlugin } from '@plexica/types';

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

function renderPage() {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ExtensionsPage />
    </QueryClientProvider>
  );
  return { ...result, queryClient };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** TenantPlugin with no config schema */
const makeTenantPlugin = (overrides?: Partial<TenantPlugin>): TenantPlugin => ({
  id: 'tp-001',
  pluginId: 'plugin-001',
  tenantId: 't1',
  status: 'ACTIVE',
  configuration: {},
  installedAt: '2026-01-01T00:00:00Z',
  plugin: {
    id: 'plugin-001',
    name: 'Analytics Pro',
    version: '1.0.0',
    description: 'Real-time analytics for your workspace.',
    author: 'Plexica Labs',
    category: 'Analytics',
    status: 'PUBLISHED' as any,
    lifecycleStatus: 'ACTIVE' as any,
    icon: '📊',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  ...overrides,
});

/** TenantPlugin that is disabled */
const makeDisabledPlugin = (): TenantPlugin =>
  makeTenantPlugin({ id: 'tp-002', status: 'INACTIVE' });

/** TenantPlugin with a JSON Schema config */
const makeConfigurablePlugin = (): TenantPlugin =>
  makeTenantPlugin({
    id: 'tp-003',
    status: 'ACTIVE',
    plugin: {
      id: 'plugin-003',
      name: 'Configurable Plugin',
      version: '2.0.0',
      description: 'A plugin with configuration options.',
      author: 'Plexica Labs',
      category: 'Tools',
      status: 'PUBLISHED' as any,
      lifecycleStatus: 'ACTIVE' as any,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      // Extended runtime field — manifest on the entity
      manifest: {
        configuration: {
          schema: {
            type: 'object',
            properties: {
              webhookUrl: {
                type: 'string',
                title: 'Webhook URL',
                description: 'URL to receive plugin events',
              },
              retryCount: {
                type: 'integer',
                title: 'Retry Count',
                description: 'Number of retry attempts',
                default: 3,
                minimum: 0,
                maximum: 10,
              },
            },
            required: ['webhookUrl'],
          },
        },
      },
    } as any,
  });

// ---------------------------------------------------------------------------
// Silence console noise
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
// Tests
// ---------------------------------------------------------------------------

describe('ExtensionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: tenant_admin user
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u1', email: 'admin@test.com', name: 'Admin', roles: ['tenant_admin'] },
      tenant: { id: 't1', name: 'Acme', slug: 'acme' },
      isAuthenticated: true,
      isLoading: false,
    } as any);
  });

  // -------------------------------------------------------------------------
  // RBAC guard
  // -------------------------------------------------------------------------

  it('renders forbidden message when user lacks tenant_admin role', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u2', email: 'viewer@test.com', name: 'Viewer', roles: [] },
      tenant: { id: 't1', name: 'Acme', slug: 'acme' },
      isAuthenticated: true,
      isLoading: false,
    } as any);
    // Query won't fire (disabled when not admin) — mock to prevent hanging
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);

    renderPage();

    expect(screen.getByText(/you don.t have permission to manage extensions/i)).toBeInTheDocument();
  });

  it('does not render forbidden message for tenant_admin', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);
    renderPage();
    expect(
      screen.queryByText(/you don.t have permission to manage extensions/i)
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('renders loading skeleton while fetching', () => {
    // Never resolves — simulates pending state
    vi.mocked(apiClient.getTenantActivePlugins).mockReturnValue(new Promise(() => {}));
    renderPage();
    // Skeleton has aria-busy
    expect(screen.getByLabelText('Loading extensions')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('renders error alert with retry button when fetch fails', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockRejectedValue(new Error('Network error'));
    renderPage();

    await screen.findByText(/failed to load extensions/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retry button re-triggers the query', async () => {
    const getTenantActivePlugins = vi.mocked(apiClient.getTenantActivePlugins);
    getTenantActivePlugins.mockRejectedValueOnce(new Error('Fail once'));
    getTenantActivePlugins.mockResolvedValueOnce([]);

    renderPage();
    await screen.findByText(/failed to load extensions/i);

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    // After retry the error alert should eventually disappear
    await waitFor(() => {
      expect(screen.queryByText(/failed to load extensions/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('renders empty state when no plugins are available', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);
    renderPage();

    await screen.findByText('No extensions available');
    expect(screen.getByText(/contact your platform administrator/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Plugin list
  // -------------------------------------------------------------------------

  it('renders plugin cards when plugins are available', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeTenantPlugin()]);
    renderPage();

    await screen.findByText('Analytics Pro');
    expect(screen.getByText('Real-time analytics for your workspace.')).toBeInTheDocument();
  });

  it('shows count of enabled extensions', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([
      makeTenantPlugin(),
      makeDisabledPlugin(),
    ]);
    renderPage();

    // "1 of 2 extensions enabled"
    await screen.findByText('1');
    expect(screen.getByText(/of/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Toggle on
  // -------------------------------------------------------------------------

  it('clicking Switch on a disabled plugin calls enableTenantPlugin', async () => {
    const disabledPlugin = makeDisabledPlugin();
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([disabledPlugin]);
    vi.mocked(apiClient.enableTenantPlugin).mockResolvedValue(undefined as any);

    renderPage();

    // Wait for card to render
    await screen.findByText('Analytics Pro');

    // The switch should be unchecked (disabled plugin)
    const toggle = screen.getByRole('switch', { name: /enable analytics pro/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(apiClient.enableTenantPlugin).toHaveBeenCalledWith(disabledPlugin.plugin.id);
    });
  });

  it('shows success toast after enabling a plugin', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeDisabledPlugin()]);
    vi.mocked(apiClient.enableTenantPlugin).mockResolvedValue(undefined as any);

    renderPage();
    await screen.findByText('Analytics Pro');

    const toggle = screen.getByRole('switch', { name: /enable analytics pro/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    });
  });

  // -------------------------------------------------------------------------
  // Toggle off
  // -------------------------------------------------------------------------

  it('clicking Switch on an active plugin calls disableTenantPlugin', async () => {
    const activePlugin = makeTenantPlugin();
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([activePlugin]);
    vi.mocked(apiClient.disableTenantPlugin).mockResolvedValue(undefined as any);

    renderPage();
    await screen.findByText('Analytics Pro');

    const toggle = screen.getByRole('switch', { name: /disable analytics pro/i });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(apiClient.disableTenantPlugin).toHaveBeenCalledWith(activePlugin.plugin.id);
    });
  });

  it('shows success toast after disabling a plugin', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeTenantPlugin()]);
    vi.mocked(apiClient.disableTenantPlugin).mockResolvedValue(undefined as any);

    renderPage();
    await screen.findByText('Analytics Pro');

    const toggle = screen.getByRole('switch', { name: /disable analytics pro/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });
  });

  it('shows error toast when toggle fails', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeTenantPlugin()]);
    vi.mocked(apiClient.disableTenantPlugin).mockRejectedValue(new Error('Server error'));

    renderPage();
    await screen.findByText('Analytics Pro');

    const toggle = screen.getByRole('switch', { name: /disable analytics pro/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update plugin status')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Configure button (enabled plugin with config schema)
  // -------------------------------------------------------------------------

  it('Configure button appears only when plugin is enabled and has a config schema', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeConfigurablePlugin()]);
    renderPage();

    await screen.findByText('Configurable Plugin');
    expect(screen.getByRole('button', { name: /configure/i })).toBeInTheDocument();
  });

  it('Configure button does not appear for enabled plugin with no config schema', async () => {
    // makeTenantPlugin has no manifest.configuration.schema
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeTenantPlugin()]);
    renderPage();

    await screen.findByText('Analytics Pro');
    expect(screen.queryByRole('button', { name: /configure/i })).not.toBeInTheDocument();
  });

  it('Configure button is not shown when plugin is disabled', async () => {
    // Create a disabled plugin with a schema — Configure should not appear
    const disabledConfigurable = makeConfigurablePlugin();
    disabledConfigurable.status = 'INACTIVE';

    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([disabledConfigurable]);
    renderPage();

    await screen.findByText('Configurable Plugin');
    expect(screen.queryByRole('button', { name: /configure/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Config form — auto-generation
  // -------------------------------------------------------------------------

  it('clicking Configure expands inline config form with schema fields', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeConfigurablePlugin()]);
    renderPage();

    await screen.findByText('Configurable Plugin');
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    // Schema fields should appear
    expect(screen.getByLabelText(/webhook url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/retry count/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Config form — validation
  // -------------------------------------------------------------------------

  it('submitting config form with empty required field shows validation error', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeConfigurablePlugin()]);
    renderPage();

    await screen.findByText('Configurable Plugin');
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    // Clear the webhookUrl field (required)
    const webhookInput = screen.getByLabelText(/webhook url/i);
    fireEvent.change(webhookInput, { target: { value: '' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    // Validation error should appear
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/webhook url is required/i);
  });

  // -------------------------------------------------------------------------
  // Config form — submit
  // -------------------------------------------------------------------------

  it('submitting valid config calls updateTenantPluginConfig and shows success toast', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeConfigurablePlugin()]);
    vi.mocked(apiClient.updateTenantPluginConfig).mockResolvedValue(undefined as any);

    renderPage();

    await screen.findByText('Configurable Plugin');
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    // Fill in required field
    const webhookInput = screen.getByLabelText(/webhook url/i);
    fireEvent.change(webhookInput, { target: { value: 'https://example.com/webhook' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(apiClient.updateTenantPluginConfig).toHaveBeenCalledWith(
        'plugin-003',
        expect.objectContaining({ webhookUrl: 'https://example.com/webhook' })
      );
    });

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Configuration saved successfully');
    });
  });

  it('config form collapse button hides the form after cancel', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([makeConfigurablePlugin()]);
    renderPage();

    await screen.findByText('Configurable Plugin');
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    // Form is visible
    expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Form should be gone
    expect(screen.queryByRole('button', { name: /save configuration/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Page header
  // -------------------------------------------------------------------------

  it('renders page title "Extensions"', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Extensions' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has no WCAG 2.1 AA violations in empty state', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);
    const { container } = renderPage();
    await screen.findByText('No extensions available');
    expectNoViolations(await axe(container));
  });

  it('has no WCAG 2.1 AA violations with plugin cards', async () => {
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([
      makeTenantPlugin(),
      makeDisabledPlugin(),
    ]);
    const { container } = renderPage();
    // Both plugins share the name "Analytics Pro" — use findAllByText
    await screen.findAllByText('Analytics Pro');
    expectNoViolations(await axe(container));
  });

  it('has no WCAG 2.1 AA violations on forbidden page', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u2', email: 'viewer@test.com', name: 'Viewer', roles: [] },
      tenant: { id: 't1', name: 'Acme', slug: 'acme' },
      isAuthenticated: true,
      isLoading: false,
    } as any);
    vi.mocked(apiClient.getTenantActivePlugins).mockResolvedValue([]);

    const { container } = renderPage();
    await screen.findByText(/you don.t have permission to manage extensions/i);
    expectNoViolations(await axe(container));
  });
});
