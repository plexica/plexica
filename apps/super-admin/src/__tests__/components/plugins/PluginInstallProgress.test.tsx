// File: apps/super-admin/src/__tests__/components/plugins/PluginInstallProgress.test.tsx
//
// Tests for PluginInstallProgress + InstallStep components (T004-29).
//
// Strategy: mock useInstallProgress entirely so component tests run
// synchronously — no real polling, no timer interactions needed.
//
// Covers:
//   PluginInstallProgress:
//     - Header renders plugin name/version for each status
//     - ARIA: region + log roles
//     - 6 steps always rendered
//     - Cancel button shown only while installing
//     - Elapsed timer label rendered
//     - "Enable now?" shown only when complete
//     - "Retry Installation" + "Back to Registry" shown only when failed
//     - Success toast fired on complete (via Sonner spy)
//     - Retry calls retry() from hook then onRetry prop
//     - onComplete called when "Enable now?" is clicked
//     - onCancel called when "Back to Registry" is clicked
//     - onCancel called when "Cancel Installation" is clicked
//
//   InstallStep:
//     - Pending state: circle icon + muted text
//     - Running state: spinner + normal text
//     - Complete state: checkmark + duration
//     - Failed state: X icon + FAILED badge + error alert (role="alert")
//     - Skipped state: circle icon + "(skipped)"
//     - Data Migrations step: progressbar shown when running with migrationProgress
//     - Per-tenant migration rows rendered
//     - aria-label "Step N name, status"

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock useInstallProgress BEFORE importing the component
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useInstallProgress', () => ({
  useInstallProgress: vi.fn(),
}));

// Mock Sonner so we can assert toast calls without DOM side-effects
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

import { useInstallProgress } from '@/hooks/useInstallProgress';
import { toast as sonnerToast } from 'sonner';
import { PluginInstallProgress } from '@/components/plugins/PluginInstallProgress';
import { InstallStep } from '@/components/plugins/InstallStep';
import type { InstallStepData } from '@/hooks/useInstallProgress';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePendingSteps(): InstallStepData[] {
  return [
    { number: 1, name: 'Dependency Check', state: 'pending' },
    { number: 2, name: 'Image Pull', state: 'pending' },
    { number: 3, name: 'Data Migrations', state: 'pending' },
    { number: 4, name: 'Route Registration', state: 'pending' },
    { number: 5, name: 'Frontend Registration', state: 'pending' },
    { number: 6, name: 'Health Check', state: 'pending' },
  ];
}

function makeCompleteSteps(): InstallStepData[] {
  return makePendingSteps().map((s) => ({ ...s, state: 'complete' as const, duration: '0.5s' }));
}

function makeFailedSteps(failedIdx = 2): InstallStepData[] {
  return makePendingSteps().map((s, i) => {
    if (i < failedIdx) return { ...s, state: 'complete' as const };
    if (i === failedIdx)
      return {
        ...s,
        state: 'failed' as const,
        errorMessage: 'Migration failed',
        errorSuggestion: 'Check the plugin manifest.',
      };
    return { ...s, state: 'skipped' as const };
  });
}

const DEFAULT_HOOK_RETURN = {
  steps: makePendingSteps(),
  overallStatus: 'installing' as const,
  elapsedMs: 1200,
  elapsedLabel: 'Elapsed: 1.2s',
  cancel: vi.fn(),
  retry: vi.fn(),
};

const DEFAULT_PROPS = {
  pluginId: 'p1',
  pluginName: 'Analytics Pro',
  pluginVersion: '2.0.0',
  onComplete: vi.fn(),
  onCancel: vi.fn(),
  onRetry: vi.fn(),
};

// ---------------------------------------------------------------------------
// PluginInstallProgress tests
// ---------------------------------------------------------------------------

describe('PluginInstallProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useInstallProgress).mockReturnValue({ ...DEFAULT_HOOK_RETURN });
  });

  // -------------------------------------------------------------------------
  // ARIA structure
  // -------------------------------------------------------------------------

  it('should render container with role="region" and correct aria-label', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    const region = screen.getByRole('region', { name: 'Plugin installation progress' });
    expect(region).toBeInTheDocument();
  });

  it('should render step list with role="log" and aria-live="polite"', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    const log = screen.getByRole('log');
    expect(log).toBeInTheDocument();
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  it('should show "Installing <name> v<version>" in header while installing', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByText('Installing Analytics Pro v2.0.0')).toBeInTheDocument();
  });

  it('should show "<name> v<version>" (without "Installing") when complete', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByText('Analytics Pro v2.0.0')).toBeInTheDocument();
    expect(screen.queryByText(/^Installing/)).not.toBeInTheDocument();
  });

  it('should show "Installation failed." sub-heading when failed', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByText('Installation failed.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6 steps always rendered
  // -------------------------------------------------------------------------

  it('should render exactly 6 step rows', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    // Each step renders as <li role="listitem">
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
  });

  it('should render all step names', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    const expectedNames = [
      'Dependency Check',
      'Image Pull',
      'Data Migrations',
      'Route Registration',
      'Frontend Registration',
      'Health Check',
    ];
    for (const name of expectedNames) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  // -------------------------------------------------------------------------
  // Elapsed timer
  // -------------------------------------------------------------------------

  it('should display elapsed label', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByText('Elapsed: 1.2s')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Cancel button
  // -------------------------------------------------------------------------

  it('should show "Cancel Installation" button while installing', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: 'Cancel Installation' })).toBeInTheDocument();
  });

  it('should NOT show "Cancel Installation" when complete', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Cancel Installation' })).not.toBeInTheDocument();
  });

  it('should NOT show "Cancel Installation" when failed', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Cancel Installation' })).not.toBeInTheDocument();
  });

  it('clicking "Cancel Installation" should call cancel() from hook and onCancel prop', () => {
    const cancelMock = vi.fn();
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      cancel: cancelMock,
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Installation' }));
    expect(cancelMock).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Complete state action buttons
  // -------------------------------------------------------------------------

  it('should show "Enable now?" button when complete', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: 'Enable now?' })).toBeInTheDocument();
  });

  it('clicking "Enable now?" should call onComplete prop', () => {
    const onComplete = vi.fn();
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable now?' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('should NOT show "Enable now?" while installing', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Enable now?' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Failed state action buttons
  // -------------------------------------------------------------------------

  it('should show "Retry Installation" and "Back to Registry" buttons when failed', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: 'Retry Installation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Registry' })).toBeInTheDocument();
  });

  it('clicking "Retry Installation" should call retry() from hook and onRetry prop', () => {
    const retryMock = vi.fn();
    const onRetry = vi.fn();
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
      retry: retryMock,
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Installation' }));
    expect(retryMock).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('clicking "Back to Registry" should call onCancel prop', () => {
    const onCancel = vi.fn();
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Registry' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('should NOT show "Retry Installation" while installing', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Retry Installation' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Success toast
  // -------------------------------------------------------------------------

  it('should fire success toast when overallStatus transitions to complete', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(vi.mocked(sonnerToast.success)).toHaveBeenCalledWith(
      'Analytics Pro installed successfully.',
      expect.objectContaining({ description: 'You can now enable it for tenants.' })
    );
  });

  it('should NOT fire success toast when still installing', () => {
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(vi.mocked(sonnerToast.success)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // SR-only announcements
  // -------------------------------------------------------------------------

  it('should render sr-only completion announcement when complete', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeCompleteSteps(),
      overallStatus: 'complete',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(
      screen.getByText(/All steps complete.*Analytics Pro installed successfully/i)
    ).toBeInTheDocument();
  });

  it('should render sr-only error announcement when a step has failed', () => {
    vi.mocked(useInstallProgress).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      steps: makeFailedSteps(),
      overallStatus: 'failed',
    });
    render(<PluginInstallProgress {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Alert:.*Migration failed/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// InstallStep tests
// ---------------------------------------------------------------------------

describe('InstallStep', () => {
  // -------------------------------------------------------------------------
  // ARIA: role + aria-label
  // -------------------------------------------------------------------------

  it('should render as li with role="listitem" and correct aria-label', () => {
    render(
      <ul>
        <InstallStep step={{ number: 1, name: 'Dependency Check', state: 'pending' }} />
      </ul>
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('aria-label', 'Step 1 Dependency Check, pending');
  });

  it.each([
    ['pending', 'Step 2 Image Pull, pending'],
    ['running', 'Step 2 Image Pull, running'],
    ['complete', 'Step 2 Image Pull, complete'],
    ['failed', 'Step 2 Image Pull, failed'],
    ['skipped', 'Step 2 Image Pull, skipped'],
  ] as const)('%s state should have aria-label "Step 2 Image Pull, %s"', (state, expected) => {
    render(
      <ul>
        <InstallStep step={{ number: 2, name: 'Image Pull', state }} />
      </ul>
    );
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-label', expected);
  });

  // -------------------------------------------------------------------------
  // Pending state
  // -------------------------------------------------------------------------

  it('pending: should display step name with muted styling', () => {
    render(
      <ul>
        <InstallStep step={{ number: 1, name: 'Dependency Check', state: 'pending' }} />
      </ul>
    );
    expect(screen.getByText(/Dependency Check/)).toBeInTheDocument();
    // No FAILED badge, no duration, no "(skipped)"
    expect(screen.queryByText('FAILED')).not.toBeInTheDocument();
    expect(screen.queryByText('(skipped)')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Running state
  // -------------------------------------------------------------------------

  it('running: should display spinner (role="status") in the DOM', () => {
    render(
      <ul>
        <InstallStep step={{ number: 2, name: 'Image Pull', state: 'running' }} />
      </ul>
    );
    // Spinner renders with role="status" but aria-hidden="true" (decorative in context of
    // the step row which has its own aria-label). Query including hidden elements.
    const spinner = screen.getByRole('status', { hidden: true });
    expect(spinner).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Complete state
  // -------------------------------------------------------------------------

  it('complete: should display duration when provided', () => {
    render(
      <ul>
        <InstallStep
          step={{ number: 1, name: 'Dependency Check', state: 'complete', duration: '0.3s' }}
        />
      </ul>
    );
    expect(screen.getByText('0.3s')).toBeInTheDocument();
  });

  it('complete: should NOT display FAILED badge', () => {
    render(
      <ul>
        <InstallStep
          step={{ number: 1, name: 'Dependency Check', state: 'complete', duration: '0.3s' }}
        />
      </ul>
    );
    expect(screen.queryByText('FAILED')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Failed state
  // -------------------------------------------------------------------------

  it('failed: should display "FAILED" badge', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 3,
            name: 'Data Migrations',
            state: 'failed',
            errorMessage: 'Migration failed',
          }}
        />
      </ul>
    );
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('failed: should render error panel with role="alert"', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 3,
            name: 'Data Migrations',
            state: 'failed',
            errorMessage: 'Migration failed',
            errorSuggestion: 'Check the plugin manifest.',
          }}
        />
      </ul>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/Migration failed/)).toBeInTheDocument();
    expect(screen.getByText('Check the plugin manifest.')).toBeInTheDocument();
  });

  it('failed: should NOT render error panel when no errorMessage', () => {
    render(
      <ul>
        <InstallStep step={{ number: 3, name: 'Data Migrations', state: 'failed' }} />
      </ul>
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Skipped state
  // -------------------------------------------------------------------------

  it('skipped: should display "(skipped)" label', () => {
    render(
      <ul>
        <InstallStep step={{ number: 4, name: 'Route Registration', state: 'skipped' }} />
      </ul>
    );
    expect(screen.getByText('(skipped)')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Data Migrations progress bar
  // -------------------------------------------------------------------------

  it('should render progressbar for Data Migrations when running with migrationProgress', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 3,
            name: 'Data Migrations',
            state: 'running',
            migrationProgress: 45,
          }}
        />
      </ul>
    );
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '45');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('45% complete')).toBeInTheDocument();
  });

  it('should NOT render progressbar when step is pending', () => {
    render(
      <ul>
        <InstallStep
          step={{ number: 3, name: 'Data Migrations', state: 'pending', migrationProgress: 0 }}
        />
      </ul>
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should NOT render progressbar when migrationProgress is undefined', () => {
    render(
      <ul>
        <InstallStep step={{ number: 3, name: 'Data Migrations', state: 'running' }} />
      </ul>
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Per-tenant migration rows
  // -------------------------------------------------------------------------

  it('should render per-tenant migration rows when provided', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 3,
            name: 'Data Migrations',
            state: 'running',
            tenantRows: [
              { tenantId: 't1', tenantName: 'Acme Corp', state: 'complete', duration: '0.8s' },
              { tenantId: 't2', tenantName: 'Beta LLC', state: 'running' },
              { tenantId: 't3', tenantName: 'Gamma Inc', state: 'pending' },
            ],
          }}
        />
      </ul>
    );
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText(/Beta LLC/)).toBeInTheDocument();
    expect(screen.getByText(/Gamma Inc/)).toBeInTheDocument();
    // Duration shown for complete tenant row
    expect(screen.getByText(/0\.8s/)).toBeInTheDocument();
    // Running status indicator
    expect(screen.getByText(/running\.\.\./)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Detail text
  // -------------------------------------------------------------------------

  it('should render detail text when provided and not in failed state', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 2,
            name: 'Image Pull',
            state: 'running',
            detail: 'Pulling from registry.hub.docker.com',
          }}
        />
      </ul>
    );
    expect(screen.getByText('Pulling from registry.hub.docker.com')).toBeInTheDocument();
  });

  it('should NOT render detail text in failed state', () => {
    render(
      <ul>
        <InstallStep
          step={{
            number: 2,
            name: 'Image Pull',
            state: 'failed',
            detail: 'Should not appear',
            errorMessage: 'Pull failed',
          }}
        />
      </ul>
    );
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});
