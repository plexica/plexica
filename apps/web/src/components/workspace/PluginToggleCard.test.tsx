// apps/web/src/components/workspace/PluginToggleCard.test.tsx
//
// T011-24: Unit tests for PluginToggleCard component.
// Spec 011 Phase 4 — FR-023, FR-025.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PluginToggleCard } from './PluginToggleCard';
import type { WorkspacePlugin } from './PluginToggleCard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client', () => ({
  apiClient: { patch: vi.fn() },
  default: { patch: vi.fn() },
}));

import { apiClient } from '@/lib/api-client';

// Mock @plexica/ui components used in PluginToggleCard
vi.mock('@plexica/ui', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      data-testid="switch"
    />
  ),
  Badge: ({
    children,
    id,
    variant,
    className,
  }: {
    children: React.ReactNode;
    id?: string;
    variant?: string;
    className?: string;
  }) => (
    <span id={id} data-variant={variant} className={className}>
      {children}
    </span>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePlugin(overrides: Partial<WorkspacePlugin> = {}): WorkspacePlugin {
  return {
    pluginId: 'plugin-a',
    name: 'Analytics Plugin',
    version: '1.2.3',
    description: 'Tracks workspace analytics.',
    tenantEnabled: true,
    enabled: true,
    configuration: { interval: 60 },
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginToggleCard', () => {
  it('renders plugin name and version', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} />, { wrapper });
    expect(screen.getByText('Analytics Plugin')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('renders plugin description', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} />, { wrapper });
    expect(screen.getByText('Tracks workspace analytics.')).toBeInTheDocument();
  });

  it('toggle switch reflects enabled state', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: true })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('toggle switch reflects disabled state', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: false })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('aria-label on toggle includes plugin name', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: true })} />, {
      wrapper,
    });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-label', 'Disable Analytics Plugin');
  });

  it('calls PATCH on toggle and applies optimistic update', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockResolvedValue(undefined);
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: true })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    // Optimistic: immediately reflects new state
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => {
      expect(
        (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
      ).toHaveBeenCalledWith('/api/workspaces/ws-1/plugins/plugin-a', { enabled: false });
    });
  });

  it('rolls back optimistic update on PATCH error', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockRejectedValue(new Error('Network error'));
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: true })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    // Wait for rollback
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('toggle is disabled when plugin is not tenant-enabled', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ tenantEnabled: false })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
  });

  it('shows "Not tenant-enabled" badge when tenantEnabled is false', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ tenantEnabled: false })} />, {
      wrapper,
    });
    expect(screen.getByText('Not tenant-enabled')).toBeInTheDocument();
  });

  it('does not show config editor for non-ADMIN users', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="MEMBER" />, {
      wrapper,
    });
    expect(screen.queryByText('Plugin configuration')).not.toBeInTheDocument();
  });

  it('shows config editor for ADMIN users', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    expect(screen.getByText('Plugin configuration')).toBeInTheDocument();
  });

  it('config editor expands and shows JSON textarea on click', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Plugin configuration'));
    expect(screen.getByLabelText('Configuration JSON for Analytics Plugin')).toBeInTheDocument();
  });

  it('shows JSON parse error when config is invalid', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Plugin configuration'));
    const textarea = screen.getByLabelText('Configuration JSON for Analytics Plugin');
    fireEvent.change(textarea, { target: { value: '{ invalid json' } });
    fireEvent.click(screen.getByLabelText('Save configuration for Analytics Plugin'));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
  });

  it('saves valid config via PATCH', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockResolvedValue(undefined);
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Plugin configuration'));
    const textarea = screen.getByLabelText('Configuration JSON for Analytics Plugin');
    fireEvent.change(textarea, { target: { value: '{"interval":120}' } });
    fireEvent.click(screen.getByLabelText('Save configuration for Analytics Plugin'));
    await waitFor(() => {
      expect(
        (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
      ).toHaveBeenCalledWith('/api/workspaces/ws-1/plugins/plugin-a', {
        configuration: { interval: 120 },
      });
    });
  });

  // -------------------------------------------------------------------------
  // F-002: Double-toggle guard
  // -------------------------------------------------------------------------

  it('does not fire second PATCH when toggle clicked twice while mutation is pending', async () => {
    // Never-resolving promise keeps the mutation in-flight indefinitely
    vi.mocked((apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch).mockReturnValue(
      new Promise(() => {})
    );

    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin({ enabled: true })} />, {
      wrapper,
    });
    const toggle = screen.getByRole('switch');

    // First click — fires mutation; wait for patch to be called asynchronously
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(
        (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
      ).toHaveBeenCalledTimes(1);
    });

    // While still pending, the Switch is disabled — a second click must not produce another call
    fireEvent.click(toggle);
    expect(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // F-007: JSON schema validation — non-object values
  // -------------------------------------------------------------------------

  it('shows validation error when config value is a JSON array', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Plugin configuration'));
    fireEvent.change(screen.getByLabelText('Configuration JSON for Analytics Plugin'), {
      target: { value: '[1, 2, 3]' },
    });
    fireEvent.click(screen.getByLabelText('Save configuration for Analytics Plugin'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Configuration must be a JSON object (not an array or primitive).'
    );
  });

  it('shows validation error when config value is a JSON primitive', () => {
    render(<PluginToggleCard workspaceId="ws-1" plugin={makePlugin()} userRole="ADMIN" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Plugin configuration'));
    fireEvent.change(screen.getByLabelText('Configuration JSON for Analytics Plugin'), {
      target: { value: '"hello"' },
    });
    fireEvent.click(screen.getByLabelText('Save configuration for Analytics Plugin'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Configuration must be a JSON object (not an array or primitive).'
    );
  });

  // -------------------------------------------------------------------------
  // H-004: configText syncs from plugin prop when not dirty
  // -------------------------------------------------------------------------

  it('resets textarea to new plugin configuration when prop changes and editor is not dirty', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <PluginToggleCard
          workspaceId="ws-1"
          plugin={makePlugin({ configuration: { interval: 60 } })}
          userRole="ADMIN"
        />
      </QueryClientProvider>
    );
    // Open config panel
    fireEvent.click(screen.getByText('Plugin configuration'));
    const textarea = screen.getByLabelText('Configuration JSON for Analytics Plugin');
    // Initial value matches plugin.configuration
    expect(textarea).toHaveValue(JSON.stringify({ interval: 60 }, null, 2));

    // Rerender with updated plugin prop on the SAME component instance (isConfigDirty=false)
    rerender(
      <QueryClientProvider client={client}>
        <PluginToggleCard
          workspaceId="ws-1"
          plugin={makePlugin({ configuration: { interval: 120, newKey: 'hello' } })}
          userRole="ADMIN"
        />
      </QueryClientProvider>
    );

    // The useEffect syncs configText because isDirty is false — panel stays open
    await waitFor(() => {
      expect(screen.getByLabelText('Configuration JSON for Analytics Plugin')).toHaveValue(
        JSON.stringify({ interval: 120, newKey: 'hello' }, null, 2)
      );
    });
  });

  it('does NOT overwrite textarea when user has unsaved edits (dirty)', async () => {
    vi.mocked((apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch).mockReturnValue(
      new Promise(() => {})
    ); // keep pending

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <PluginToggleCard
          workspaceId="ws-1"
          plugin={makePlugin({ configuration: { interval: 60 } })}
          userRole="ADMIN"
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText('Plugin configuration'));
    const textarea = screen.getByLabelText('Configuration JSON for Analytics Plugin');

    // User types something — marks dirty
    fireEvent.change(textarea, { target: { value: '{"interval":999}' } });
    expect(textarea).toHaveValue('{"interval":999}');

    // Parent passes updated prop — reuse same QueryClient so panel state is preserved
    rerender(
      <QueryClientProvider client={client}>
        <PluginToggleCard
          workspaceId="ws-1"
          plugin={makePlugin({ configuration: { interval: 120 } })}
          userRole="ADMIN"
        />
      </QueryClientProvider>
    );

    // Textarea should NOT be overwritten while dirty
    await waitFor(() => {
      expect(screen.getByLabelText('Configuration JSON for Analytics Plugin')).toHaveValue(
        '{"interval":999}'
      );
    });
  });
});
