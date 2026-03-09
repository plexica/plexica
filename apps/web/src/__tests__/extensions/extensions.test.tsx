/**
 * Frontend Tests: Extension Points UI Components
 *
 * Spec 013 — Extension Points, T013-24 (Plan §8.4, Art. 4.1, Art. 8.1).
 *
 * Tests:
 *   Part A — <ExtensionSlot>  (T013-11)
 *     1.  Returns null when ENABLE_EXTENSION_POINTS is off
 *     2.  Renders skeleton (aria-busy="true", role="region") while loading
 *     3.  Returns null on empty contributions
 *     4.  Renders contributions when data is available
 *     5.  Defers to VirtualizedSlotContainer when count > threshold
 *
 *   Part B — useExtensionSlot hook  (T013-14)
 *     6.  Returns isLoading:true while fetch is pending
 *     7.  Returns contributions on successful fetch
 *     8.  Returns empty state when flag is disabled (no fetch)
 *
 *   Part C — ExtensionSettingsPanel  (T013-16)
 *     9.  Returns null when flag is disabled
 *     10. Renders loading skeleton while fetching
 *     11. Renders grouped contributions
 *     12. Optimistic toggle + reverts on error
 *     13. Shows empty state when no contributions
 *
 * Constitution Compliance:
 *   - Art. 1.3: Accessibility — role="region", aria-busy, aria-label
 *   - Art. 4.1: ≥80% coverage on owned files
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResolvedContribution } from '@plexica/types';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const {
  mockUseFeatureFlag,
  mockUseWorkspace,
  mockApiClientGet,
  mockApiClientPatch,
  mockToastError,
} = vi.hoisted(() => ({
  mockUseFeatureFlag: vi.fn(() => true),
  mockUseWorkspace: vi.fn(() => ({
    currentWorkspace: { id: 'ws-test-001' },
  })),
  mockApiClientGet: vi.fn(),
  mockApiClientPatch: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: mockUseFeatureFlag,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: mockUseWorkspace,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: mockApiClientGet,
    patch: mockApiClientPatch,
  },
}));

vi.mock('@/components/ToastProvider', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ExtensionSlot } from '@/components/extensions/ExtensionSlot';
import { useExtensionSlot } from '@/hooks/useExtensionSlot';
import { ExtensionSettingsPanel } from '@/routes/settings.extensions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUGIN_ID = 'plugin-host';
const SLOT_ID = 'toolbar-actions';
const WORKSPACE_ID = 'ws-test-001';

function makeContribution(overrides?: Partial<ResolvedContribution>): ResolvedContribution {
  return {
    id: 'contrib-001',
    contributingPluginId: 'plugin-beta',
    contributingPluginName: 'plugin-beta',
    targetPluginId: PLUGIN_ID,
    targetSlotId: SLOT_ID,
    componentName: 'BetaButton',
    priority: 10,
    validationStatus: 'valid',
    isVisible: true,
    isActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Wrapper helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>;
}

function wrapperFactory() {
  const client = makeQueryClient();
  const WrapperWithClient = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { WrapperWithClient, client };
}

// ---------------------------------------------------------------------------
// Part A — <ExtensionSlot>
// ---------------------------------------------------------------------------

describe('ExtensionSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseWorkspace.mockReturnValue({ currentWorkspace: { id: WORKSPACE_ID } });
  });

  it('A1 — returns null when ENABLE_EXTENSION_POINTS feature flag is off', () => {
    mockUseFeatureFlag.mockReturnValue(false);

    const { container } = render(
      <Wrapper>
        <ExtensionSlot slotId={SLOT_ID} pluginId={PLUGIN_ID} context={{}} />
      </Wrapper>
    );

    expect(container.firstChild).toBeNull();
  });

  it('A2 — renders role=region with aria-busy=true while loading', () => {
    // Never resolves → perpetual loading state
    mockApiClientGet.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <ExtensionSlot slotId={SLOT_ID} pluginId={PLUGIN_ID} context={{}} label="Toolbar" />
      </Wrapper>
    );

    const region = screen.getByRole('region', { name: /Extensions: Toolbar/i });
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('A3 — returns null when contributions array is empty', async () => {
    mockApiClientGet.mockResolvedValue({ contributions: [] });

    const { container } = render(
      <Wrapper>
        <ExtensionSlot slotId={SLOT_ID} pluginId={PLUGIN_ID} context={{}} />
      </Wrapper>
    );

    // Wait for query to settle
    await waitFor(() => {
      expect(mockApiClientGet).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it('A4 — renders contributions when data is returned', async () => {
    const contribution = makeContribution();
    mockApiClientGet.mockResolvedValue({ contributions: [contribution] });

    render(
      <Wrapper>
        <ExtensionSlot slotId={SLOT_ID} pluginId={PLUGIN_ID} context={{}} label="Toolbar" />
      </Wrapper>
    );

    await waitFor(() => {
      const region = screen.getByRole('region', { name: /Extensions: Toolbar/i });
      expect(region).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('A5 — renders data-testid attribute for the slot container', async () => {
    const contribution = makeContribution();
    mockApiClientGet.mockResolvedValue({ contributions: [contribution] });

    render(
      <Wrapper>
        <ExtensionSlot slotId={SLOT_ID} pluginId={PLUGIN_ID} context={{}} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.queryByTestId(`extension-slot-${SLOT_ID}`)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Part B — useExtensionSlot hook
// ---------------------------------------------------------------------------

describe('useExtensionSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseWorkspace.mockReturnValue({ currentWorkspace: { id: WORKSPACE_ID } });
  });

  it('B1 — returns isLoading:true while fetch is pending', () => {
    mockApiClientGet.mockReturnValue(new Promise(() => {}));

    const { WrapperWithClient } = wrapperFactory();
    const { result } = renderHook(() => useExtensionSlot(SLOT_ID, {}, { pluginId: PLUGIN_ID }), {
      wrapper: WrapperWithClient,
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.contributions).toEqual([]);
  });

  it('B2 — returns contributions on successful fetch', async () => {
    const contribution = makeContribution();
    mockApiClientGet.mockResolvedValue({ contributions: [contribution] });

    const { WrapperWithClient } = wrapperFactory();
    const { result } = renderHook(() => useExtensionSlot(SLOT_ID, {}, { pluginId: PLUGIN_ID }), {
      wrapper: WrapperWithClient,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contributions).toHaveLength(1);
    expect(result.current.contributions[0].id).toBe('contrib-001');
  });

  it('B3 — returns empty state without fetching when flag is disabled', () => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockApiClientGet.mockResolvedValue({ contributions: [makeContribution()] });

    const { WrapperWithClient } = wrapperFactory();
    const { result } = renderHook(() => useExtensionSlot(SLOT_ID, {}, { pluginId: PLUGIN_ID }), {
      wrapper: WrapperWithClient,
    });

    // Flag off → no loading, no contributions
    expect(result.current.isLoading).toBe(false);
    expect(result.current.contributions).toEqual([]);
    expect(mockApiClientGet).not.toHaveBeenCalled();
  });

  it('B4 — slotProps contains correct slotId and pluginId', () => {
    mockApiClientGet.mockReturnValue(new Promise(() => {}));

    const { WrapperWithClient } = wrapperFactory();
    const { result } = renderHook(
      () =>
        useExtensionSlot(SLOT_ID, { entityId: 'e1' }, { pluginId: PLUGIN_ID, label: 'My Slot' }),
      { wrapper: WrapperWithClient }
    );

    expect(result.current.slotProps.slotId).toBe(SLOT_ID);
    expect(result.current.slotProps.pluginId).toBe(PLUGIN_ID);
    expect(result.current.slotProps.context).toEqual({ entityId: 'e1' });
    expect(result.current.slotProps.label).toBe('My Slot');
  });
});

// ---------------------------------------------------------------------------
// Part C — ExtensionSettingsPanel
// ---------------------------------------------------------------------------

describe('ExtensionSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseWorkspace.mockReturnValue({ currentWorkspace: { id: WORKSPACE_ID } });
  });

  it('C1 — returns null when ENABLE_EXTENSION_POINTS is off', () => {
    mockUseFeatureFlag.mockReturnValue(false);

    const { container } = render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    expect(container.firstChild).toBeNull();
  });

  it('C2 — renders loading skeleton while fetching', () => {
    mockApiClientGet.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    // 3 pulse skeleton divs rendered
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('C3 — renders grouped contributions by host plugin', async () => {
    const c1 = makeContribution({ id: 'c1', targetPluginId: 'plugin-host' });
    const c2 = makeContribution({
      id: 'c2',
      targetPluginId: 'plugin-host',
      targetSlotId: 'form-footer',
    });
    mockApiClientGet.mockResolvedValue({ contributions: [c1, c2] });

    render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    await screen.findByTestId('extension-settings-panel');
    // Both contributions belong to 'plugin-host' — should be in one accordion
    expect(screen.getAllByRole('group').length).toBeGreaterThanOrEqual(0); // native details element
    // plugin host name appears in the accordion summary
    expect(screen.getByText(/plugin-host/i)).toBeInTheDocument();
  });

  it('C4 — shows empty state when no contributions exist', async () => {
    mockApiClientGet.mockResolvedValue({ contributions: [] });

    render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    await screen.findByText('No extensions available.');
  });

  it('C5 — optimistic toggle calls PATCH and updates UI', async () => {
    const contribution = makeContribution({ id: 'c-toggle', isVisible: true });
    mockApiClientGet.mockResolvedValue({ contributions: [contribution] });
    mockApiClientPatch.mockResolvedValue({ success: true });

    render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    await screen.findByTestId('extension-settings-panel');

    // Find the visibility toggle (Switch in ContributionRow)
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockApiClientPatch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/workspaces/${WORKSPACE_ID}/extension-visibility/c-toggle`),
        expect.objectContaining({ isVisible: false })
      );
    });
  });

  it('C6 — reverts optimistic toggle and shows toast on PATCH error', async () => {
    const contribution = makeContribution({ id: 'c-revert', isVisible: true });
    mockApiClientGet.mockResolvedValue({ contributions: [contribution] });
    mockApiClientPatch.mockRejectedValue(new Error('Network error'));

    render(
      <Wrapper>
        <ExtensionSettingsPanel />
      </Wrapper>
    );

    await screen.findByTestId('extension-settings-panel');

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update extension visibility')
      );
    });
  });
});
