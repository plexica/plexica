// apps/web/src/__tests__/plugins/PluginInstallProgress.test.tsx
//
// T004-34: Tests for PluginInstallProgress component and useInstallProgress hook.
//
// Coverage:
//  - Initial render (6 steps all pending/running, step 1 running)
//  - Step state transitions (pending → running → complete → failed)
//  - Tenant migration sub-list on step 3
//  - Elapsed timer updates
//  - INSTALLING → INSTALLED → all complete transition
//  - Cancel button visibility and call
//  - Error panel display (role="alert")
//  - "Enable now" button on success
//  - "Retry" button on failure
//  - Toast calls on complete/failure
//  - ARIA role="log" + aria-live="polite"
//  - Step ARIA labels
//  - axe WCAG 2.1 AA audit

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { configureAxe } from 'vitest-axe';

// Register vitest-axe matchers manually (package bug: extend-expect is empty)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as any;
expect.extend({ toHaveNoViolations });

function expectNoViolations(results: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Toast mock (must be before imports that use it)
vi.mock('@/components/ToastProvider', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// adminApiClient mock — both getRegistryPlugin (polling) and cancelInstall
vi.mock('@/lib/api-client', () => ({
  apiClient: {},
  adminApiClient: {
    getRegistryPlugin: vi.fn(),
    cancelInstall: vi.fn(),
  },
}));

import { adminApiClient } from '@/lib/api-client';
import { toast } from '@/components/ToastProvider';

// ---------------------------------------------------------------------------
// Component imports (after mocks)
// ---------------------------------------------------------------------------

import { PluginInstallProgress } from '@/components/plugins/PluginInstallProgress';
import { InstallStep } from '@/components/plugins/InstallStep';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof PluginInstallProgress>> = {}
) {
  const props = {
    pluginId: 'plugin-test-001',
    pluginName: 'Test Plugin',
    pluginVersion: '1.0.0',
    onComplete: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  return { ...render(<PluginInstallProgress {...props} />), props };
}

/**
 * Advance fake timers and flush all pending microtasks/promises.
 * This is the correct pattern for useEffect-heavy hooks with fake timers.
 */
async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // Flush any additional React state updates triggered by the timer callbacks
  // (e.g. a setLifecycleStatus that triggers a useEffect([lifecycleStatus]) → setSteps)
  await act(async () => {});
}

/**
 * Temporarily switch to real timers for a single assertion block, then restore
 * fake timers. Required because waitFor() polls with setTimeout — with fake
 * timers that polling never fires, causing timeouts.
 */
async function withRealTimers(fn: () => Promise<void>): Promise<void> {
  vi.useRealTimers();
  try {
    await fn();
  } finally {
    vi.useFakeTimers();
  }
}

// Silence console noise during tests
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
// Shared mock reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginInstallProgress', () => {
  // -------------------------------------------------------------------------
  // Render + ARIA structure
  // -------------------------------------------------------------------------

  describe('initial render', () => {
    it('renders the section with role="log" and aria-live="polite"', async () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        name: 'Test Plugin',
        version: '1.0.0',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      const log = screen.getByRole('log');
      expect(log).toBeInTheDocument();
      expect(log).toHaveAttribute('aria-live', 'polite');
    });

    it('renders the plugin name and version in the header', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent({ pluginName: 'Acme Analytics', pluginVersion: '2.3.1' });

      expect(screen.getByText('Installing Acme Analytics')).toBeInTheDocument();
      expect(screen.getByText('v2.3.1')).toBeInTheDocument();
    });

    it('renders 6 steps as list items', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      const items = screen.getAllByRole('listitem');
      // 6 install steps
      expect(items.length).toBeGreaterThanOrEqual(6);
    });

    it('renders all 6 step names', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      expect(screen.getByText('Dependency Check')).toBeInTheDocument();
      expect(screen.getByText('Image Pull')).toBeInTheDocument();
      expect(screen.getByText('Data Migrations')).toBeInTheDocument();
      expect(screen.getByText('Route Registration')).toBeInTheDocument();
      expect(screen.getByText('Frontend Registration')).toBeInTheDocument();
      expect(screen.getByText('Health Check')).toBeInTheDocument();
    });

    it('first step has a running spinner on initial mount', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // The Spinner component renders a role="status" element
      const spinners = screen.getAllByRole('status');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    });

    it('step 1 listitem has correct aria-label for running status', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // Step 1 starts as 'running'
      const step1 = screen.getByRole('listitem', {
        name: /Step 1 Dependency Check, status: in progress/i,
      });
      expect(step1).toBeInTheDocument();
    });

    it('steps 2-6 start as pending', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // Steps 2-6 should be pending
      const stepNames = [
        'Image Pull',
        'Data Migrations',
        'Route Registration',
        'Frontend Registration',
        'Health Check',
      ];
      stepNames.forEach((name, idx) => {
        const item = screen.getByRole('listitem', {
          name: `Step ${idx + 2} ${name}, status: pending`,
        });
        expect(item).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Step status transitions
  // -------------------------------------------------------------------------

  describe('step status transitions', () => {
    it('advances steps forward on each polling tick during INSTALLING', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // Advance past the second poll interval (POLL_INTERVAL_MS = 2000ms).
      // Poll 1 fires immediately (pollCount=1, no advancement — step 1 running).
      // Poll 2 fires at 2000ms (pollCount=2, step 1 → complete, step 2 → running).
      await advanceTimers(2_100);

      // After the second poll, step 2 should be running
      expect(
        screen.getByRole('listitem', {
          name: /Step 2 Image Pull, status: in progress/i,
        })
      ).toBeInTheDocument();
    }, 15_000);

    it('marks all steps complete when lifecycleStatus becomes INSTALLED', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      // First polls: INSTALLING
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      await advanceTimers(4_100);

      // Now the plugin reports INSTALLED
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      await advanceTimers(2_100);

      // All 6 steps should now show complete icons
      const completeIcons = screen.getAllByTestId('step-icon-complete');
      expect(completeIcons).toHaveLength(6);
    }, 20_000);

    it('shows "Installation complete" text on success', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      renderComponent();

      await advanceTimers(2_100);

      expect(screen.getByText('Installation complete')).toBeInTheDocument();
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Elapsed timer
  // -------------------------------------------------------------------------

  describe('elapsed timer', () => {
    it('shows elapsed time in seconds', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // Advance 5 seconds
      await advanceTimers(5_000);

      expect(screen.getByLabelText(/elapsed time: 5s/i)).toBeInTheDocument();
    }, 15_000);

    it('formats elapsed as minutes after 60 seconds', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      await advanceTimers(62_000);

      expect(screen.getByLabelText(/elapsed time: 1m 02s/i)).toBeInTheDocument();
    }, 90_000);

    it('hides elapsed timer after completion', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      renderComponent();

      await advanceTimers(2_100);

      expect(screen.queryByLabelText(/elapsed time/i)).not.toBeInTheDocument();
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Cancel button
  // -------------------------------------------------------------------------

  describe('cancel button', () => {
    it('shows "Cancel installation" button while INSTALLING', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      await advanceTimers(100);

      expect(screen.getByRole('button', { name: 'Cancel installation' })).toBeInTheDocument();
    }, 10_000);

    it('calls adminApiClient.cancelInstall and onCancel on success', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      vi.mocked(adminApiClient.cancelInstall).mockResolvedValue({ message: 'cancelled' } as any);

      const onCancel = vi.fn();
      renderComponent({ onCancel });

      await advanceTimers(100);

      const cancelBtn = screen.getByRole('button', { name: 'Cancel installation' });

      // Click and drain the microtask queue (resolved promises) without
      // advancing real timers — avoids infinite polling loop with runAllTimersAsync
      await act(async () => {
        fireEvent.click(cancelBtn);
        // Drain promise microtasks in several passes
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(adminApiClient.cancelInstall).toHaveBeenCalledWith('plugin-test-001');
      expect(onCancel).toHaveBeenCalledTimes(1);
    }, 15_000);

    it('shows toast.success on cancel success', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      vi.mocked(adminApiClient.cancelInstall).mockResolvedValue({ message: 'cancelled' } as any);

      renderComponent();

      await advanceTimers(100);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel installation' }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Installation cancelled.');
    }, 15_000);

    it('shows toast.error when cancel fails', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      vi.mocked(adminApiClient.cancelInstall).mockRejectedValue(new Error('Network error'));

      renderComponent();

      await advanceTimers(100);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel installation' }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cancel')
      );
    }, 15_000);

    it('hides cancel button when installation is complete', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      renderComponent();

      await advanceTimers(2_100);

      expect(screen.queryByRole('button', { name: 'Cancel installation' })).not.toBeInTheDocument();
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // "Enable now" button
  // -------------------------------------------------------------------------

  describe('"Enable now" button', () => {
    it('shows "Enable now" button when status is INSTALLED', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      renderComponent();

      await advanceTimers(2_100);

      expect(screen.getByRole('button', { name: 'Enable now' })).toBeInTheDocument();
    }, 15_000);

    it('calls onComplete when "Enable now" is clicked', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      const onComplete = vi.fn();
      renderComponent({ onComplete });

      await advanceTimers(2_100);

      fireEvent.click(screen.getByRole('button', { name: 'Enable now' }));
      expect(onComplete).toHaveBeenCalledTimes(1);
    }, 15_000);

    it('does NOT show "Enable now" when status is ACTIVE', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'ACTIVE',
      } as any);

      renderComponent();

      await advanceTimers(2_100);

      expect(screen.queryByRole('button', { name: 'Enable now' })).not.toBeInTheDocument();
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Toast on completion
  // -------------------------------------------------------------------------

  describe('completion toast', () => {
    it('calls toast.success when installation completes', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      renderComponent({ pluginName: 'My Plugin', pluginVersion: '3.0.0' });

      await advanceTimers(2_100);

      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        'My Plugin v3.0.0 installed successfully.'
      );
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Error panel
  // -------------------------------------------------------------------------

  describe('error panel', () => {
    it('shows role="alert" panel when a step fails after an error', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      // Poll 1: INSTALLING, no error — step 1 running (no advancement on first poll)
      getRegistryPlugin.mockResolvedValueOnce({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      // Poll 2: throw — sets errorRef.current
      getRegistryPlugin.mockRejectedValueOnce(new Error('Container crashed'));
      // Poll 3: INSTALLING again — advanceStep sees errorRef → marks step 1 failed
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      // Advance through 3 poll cycles (each 2 000 ms apart, first fires at 0ms)
      await advanceTimers(4_200);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    }, 20_000);

    it('shows failed step icons and skipped steps when failed', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      getRegistryPlugin.mockResolvedValueOnce({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      getRegistryPlugin.mockRejectedValueOnce(new Error('OOM'));
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      await advanceTimers(4_200);

      expect(screen.getByTestId('step-icon-failed')).toBeInTheDocument();
      const skippedIcons = screen.getAllByTestId('step-icon-skipped');
      expect(skippedIcons.length).toBeGreaterThanOrEqual(1);
    }, 20_000);

    it('shows "Retry" button when isFailed is true', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      getRegistryPlugin.mockResolvedValueOnce({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      getRegistryPlugin.mockRejectedValueOnce(new Error('Timeout'));
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      const onRetry = vi.fn();
      renderComponent({ onRetry });

      await advanceTimers(4_200);

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    }, 20_000);

    it('calls onRetry when Retry button is clicked', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      getRegistryPlugin.mockResolvedValueOnce({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      getRegistryPlugin.mockRejectedValueOnce(new Error('Timeout'));
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      const onRetry = vi.fn();
      renderComponent({ onRetry });

      await advanceTimers(4_200);

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    }, 20_000);

    it('calls toast.error when installation fails', async () => {
      vi.useFakeTimers();

      const getRegistryPlugin = vi.mocked(adminApiClient.getRegistryPlugin);

      getRegistryPlugin.mockResolvedValueOnce({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);
      getRegistryPlugin.mockRejectedValueOnce(new Error('Container crashed'));
      getRegistryPlugin.mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent({ pluginName: 'Bad Plugin', pluginVersion: '0.0.1' });

      await advanceTimers(4_200);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining('Bad Plugin'));
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // Tenant migration sub-list (InstallStep component)
  // -------------------------------------------------------------------------

  describe('InstallStep tenant migration sub-list', () => {
    it('renders tenant migration progress bar with role="progressbar"', () => {
      const { container } = render(
        <InstallStep
          stepNumber={3}
          name="Data Migrations"
          status="running"
          tenantProgress={[
            { tenantId: 't1', tenantName: 'Acme Corp', complete: true },
            { tenantId: 't2', tenantName: 'Beta Inc', complete: false },
            { tenantId: 't3', tenantName: 'Gamma Ltd', complete: false },
          ]}
        />
      );

      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '1');
      expect(progressBar).toHaveAttribute('aria-valuemax', '3');
    });

    it('shows tenant names in the migration list', () => {
      render(
        <InstallStep
          stepNumber={3}
          name="Data Migrations"
          status="running"
          tenantProgress={[
            { tenantId: 't1', tenantName: 'Acme Corp', complete: true },
            { tenantId: 't2', tenantName: 'Beta Inc', complete: false },
          ]}
        />
      );

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    });

    it('shows "+N more" when more than 5 tenants', () => {
      const tenants = Array.from({ length: 8 }, (_, i) => ({
        tenantId: `t${i}`,
        tenantName: `Tenant ${i + 1}`,
        complete: i < 3,
      }));

      render(
        <InstallStep
          stepNumber={3}
          name="Data Migrations"
          status="running"
          tenantProgress={tenants}
        />
      );

      expect(screen.getByText('+3 more…')).toBeInTheDocument();
    });

    it('shows migration count summary', () => {
      render(
        <InstallStep
          stepNumber={3}
          name="Data Migrations"
          status="running"
          tenantProgress={[
            { tenantId: 't1', tenantName: 'Acme', complete: true },
            { tenantId: 't2', tenantName: 'Beta', complete: false },
            { tenantId: 't3', tenantName: 'Gamma', complete: false },
          ]}
        />
      );

      expect(screen.getByText('1 / 3 tenants migrated')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility audit
  // -------------------------------------------------------------------------

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations in initial INSTALLING state', async () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      const { container } = renderComponent();

      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations in completed state', async () => {
      vi.useFakeTimers();

      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLED',
      } as any);

      const { container } = renderComponent();

      await advanceTimers(2_100);

      // Switch to real timers to assert (screen.getByText uses no timers but
      // running the axe scan is async and may need real setTimeout internally)
      await withRealTimers(async () => {
        await waitFor(() => expect(screen.getByText('Installation complete')).toBeInTheDocument(), {
          timeout: 3_000,
        });
        expectNoViolations(await axe(container));
      });
    }, 20_000);

    it('step list has role="list" wrapper with accessible name', () => {
      vi.mocked(adminApiClient.getRegistryPlugin).mockResolvedValue({
        id: 'plugin-test-001',
        lifecycleStatus: 'INSTALLING',
      } as any);

      renderComponent();

      const list = screen.getByRole('list', { name: /installation steps/i });
      expect(list).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // InstallStep unit tests (status icons)
  // -------------------------------------------------------------------------

  describe('InstallStep icon rendering', () => {
    it('renders pending icon for pending status', () => {
      render(<InstallStep stepNumber={1} name="Dependency Check" status="pending" />);
      expect(screen.getByTestId('step-icon-pending')).toBeInTheDocument();
    });

    it('renders spinner for running status', () => {
      render(<InstallStep stepNumber={1} name="Dependency Check" status="running" />);
      expect(screen.getByTestId('step-icon-running')).toBeInTheDocument();
    });

    it('renders check icon for complete status', () => {
      render(<InstallStep stepNumber={1} name="Dependency Check" status="complete" />);
      expect(screen.getByTestId('step-icon-complete')).toBeInTheDocument();
    });

    it('renders X icon for failed status', () => {
      render(<InstallStep stepNumber={1} name="Dependency Check" status="failed" />);
      expect(screen.getByTestId('step-icon-failed')).toBeInTheDocument();
    });

    it('renders minus icon for skipped status', () => {
      render(<InstallStep stepNumber={1} name="Dependency Check" status="skipped" />);
      expect(screen.getByTestId('step-icon-skipped')).toBeInTheDocument();
    });

    it('shows duration when step is complete with durationSeconds', () => {
      render(
        <InstallStep stepNumber={2} name="Image Pull" status="complete" durationSeconds={12.5} />
      );
      expect(screen.getByText('12.5s')).toBeInTheDocument();
    });

    it('shows duration in minutes when durationSeconds >= 60', () => {
      render(
        <InstallStep stepNumber={2} name="Image Pull" status="complete" durationSeconds={75} />
      );
      expect(screen.getByText('1m 15s')).toBeInTheDocument();
    });

    it('does NOT show duration for pending steps even if durationSeconds is provided', () => {
      render(
        <InstallStep stepNumber={3} name="Data Migrations" status="pending" durationSeconds={5} />
      );
      // Duration should not be rendered for pending steps
      expect(screen.queryByText('5.0s')).not.toBeInTheDocument();
      expect(screen.queryByText('5s')).not.toBeInTheDocument();
    });

    it('step has correct aria-label', () => {
      render(<InstallStep stepNumber={2} name="Image Pull" status="complete" />);
      const item = screen.getByRole('listitem', {
        name: 'Step 2 Image Pull, status: complete',
      });
      expect(item).toBeInTheDocument();
    });
  });
});
